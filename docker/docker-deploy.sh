#!/bin/bash

# LinkNest Docker Deployment Script
# This script builds and deploys LinkNest as a Docker container on port 8000
# Run this script from the docker/ directory

set -e

# Get the project root directory (parent of docker/)
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🚀 Starting LinkNest Docker Deployment..."
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p data uploads
chmod 755 data uploads

# Create .htaccess for uploads if it doesn't exist
if [ ! -f uploads/.htaccess ]; then
    echo "📝 Creating uploads/.htaccess..."
    cat > uploads/.htaccess << 'EOF'
# Prevent PHP execution in uploads directory
<FilesMatch "\.php$">
    Order Allow,Deny
    Deny from all
</FilesMatch>

# Allow only image files
<FilesMatch "\.(jpg|jpeg|png|gif|svg|webp)$">
    Order Allow,Deny
    Allow from all
</FilesMatch>
EOF
fi

# Stop existing container if running
echo "🛑 Stopping existing containers (if any)..."
docker compose -f docker/docker-compose.yml down 2>/dev/null || true

# Build and start the container
echo "🔨 Building Docker image..."
docker compose -f docker/docker-compose.yml build

echo "🚀 Starting container on port 8000..."
docker compose -f docker/docker-compose.yml up -d

# Wait for container to be ready
echo "⏳ Waiting for container to be ready..."
sleep 5

# Check if container is running
if docker compose -f docker/docker-compose.yml ps | grep -q "Up"; then
    echo ""
    echo "✅ LinkNest is now running!"
    echo ""
    echo "📍 Access the application at: http://localhost:8000"
    echo ""
    echo "📋 Default credentials:"
    echo "   Username: admin"
    echo "   Password: admin123"
    echo ""
    echo "⚠️  IMPORTANT: Change the admin password after first login!"
    echo ""
    echo "📊 Useful commands:"
    echo "   View logs:        docker compose -f docker/docker-compose.yml logs -f"
    echo "   Stop container:   docker compose -f docker/docker-compose.yml down"
    echo "   Restart:          docker compose -f docker/docker-compose.yml restart"
    echo "   View status:      docker compose -f docker/docker-compose.yml ps"
    echo ""
else
    echo "❌ Container failed to start. Check logs with: docker compose -f docker/docker-compose.yml logs"
    exit 1
fi













