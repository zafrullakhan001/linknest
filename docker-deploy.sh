#!/bin/bash

# LinkNest Docker Deployment Script
# This script builds and deploys LinkNest as a Docker container on port 8000

set -e

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
docker compose down 2>/dev/null || true

# Build and start the container
echo "🔨 Building Docker image..."
docker compose build

echo "🚀 Starting container on port 8000..."
docker compose up -d

# Wait for container to be ready
echo "⏳ Waiting for container to be ready..."
sleep 5

# Check if container is running
if docker compose ps | grep -q "Up"; then
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
    echo "   View logs:        docker compose logs -f"
    echo "   Stop container:   docker compose down"
    echo "   Restart:          docker compose restart"
    echo "   View status:      docker compose ps"
    echo ""
else
    echo "❌ Container failed to start. Check logs with: docker compose logs"
    exit 1
fi

