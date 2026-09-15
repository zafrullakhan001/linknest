#!/bin/bash

# LinkNest Docker Deployment Script
# This script builds and deploys LinkNest as a Docker container
# Run this script from the docker/ directory

set -e

# Get the project root directory (parent of docker/)
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "[deploy] Starting LinkNest Docker Deployment..."
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "[error] Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "[error] Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create necessary directories
echo "[deploy] Creating necessary directories..."
mkdir -p data uploads bin
chmod 755 data uploads

# Create .htaccess for uploads if it doesn't exist
if [ ! -f uploads/.htaccess ]; then
    echo "[deploy] Creating uploads/.htaccess..."
    cat > uploads/.htaccess << 'EOF'
# Prevent PHP execution in uploads directory
<FilesMatch "\.php$">
    Order Allow,Deny
    Deny from all
</FilesMatch>

# Allow media library file types (images, PDF, audio, video)
<FilesMatch "\.(jpg|jpeg|png|gif|svg|webp|ico|pdf|mp3|wav|ogg|m4a|mp4|webm|ogv|mov)$">
    Order Allow,Deny
    Allow from all
</FilesMatch>
EOF
fi

if [ ! -f novnc.d.ts ]; then
    echo "[error] novnc.d.ts missing — required for VNC widget frontend build."
    exit 1
fi

if [ ! -f bin/ttyd.x86_64 ] && [ ! -f bin/ttyd.aarch64 ]; then
    echo "[warn] bin/ttyd.x86_64 (or aarch64) missing — Docker build may fail behind SSL inspection."
    echo "       Prefer: ./redeploy-docker.sh (auto-downloads ttyd)."
fi

# Stop existing container if running
echo "[deploy] Stopping existing containers (if any)..."
docker compose -f docker/docker-compose.yml down 2>/dev/null || true

# Build and start the container
echo "[deploy] Building Docker image..."
docker compose -f docker/docker-compose.yml build

echo "[deploy] Starting containers (HTTP 8090, HTTPS 8443, Mailpit 8025, ttyd 18681-18780, websockify 18881-18980)..."
docker compose -f docker/docker-compose.yml up -d

# Wait for container to be ready
echo "[deploy] Waiting for container to be ready..."
sleep 5

# Check if container is running
if docker compose -f docker/docker-compose.yml ps | grep -q "Up"; then
    echo ""
    echo "[ok] LinkNest is now running!"
    echo ""
    echo "Access the application at:"
    echo "   HTTP:  http://localhost:8090"
    echo "   HTTPS: https://localhost:8443"
    echo "   Mailpit UI: http://localhost:8025"
    echo ""
    echo "SSH Terminal gateway (Docker):"
    echo "   ttyd ports: 18681-18780"
    echo "   X11: host.docker.internal:0.0"
    echo ""
    echo "VNC Viewer gateway (Docker):"
    echo "   websockify ports: 18881-18980"
    echo "   (avoids host XAMPP 17681-18680 / 19000-19999)"
    echo ""
    echo "Default credentials:"
    echo "   Username: admin"
    echo "   Password: admin123"
    echo ""
    echo "IMPORTANT: Change the admin password after first login!"
    echo ""
    echo "Clone Instance:"
    echo "   Admin → Integrations → Clone works in Docker."
    echo "   Clones live in /var/www/clones/{name} and open at http://localhost:8090/{name}/"
    echo "   (HTTPS: https://localhost:8443/{name}/). WSL folder clone is not supported."
    echo ""
    echo "Useful commands:"
    echo "   View logs:        docker compose -f docker/docker-compose.yml logs -f"
    echo "   Stop container:   docker compose -f docker/docker-compose.yml down"
    echo "   Restart:          docker compose -f docker/docker-compose.yml restart"
    echo "   View status:      docker compose -f docker/docker-compose.yml ps"
    echo "   Full redeploy:    ./redeploy-docker.sh"
    echo ""
else
    echo "[error] Container failed to start. Check logs with: docker compose -f docker/docker-compose.yml logs"
    exit 1
fi
