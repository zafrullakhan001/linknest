#!/bin/bash
# Docker Deployment Script for LinkNest
# This script builds and deploys the LinkNest application in a Docker container

set -e  # Exit on any error

echo "=========================================="
echo "LinkNest Docker Deployment Script"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${GREEN}Project root: $PROJECT_ROOT${NC}"
echo ""

# Create necessary directories if they don't exist
echo "Creating necessary directories..."
mkdir -p "$PROJECT_ROOT/data"
mkdir -p "$PROJECT_ROOT/uploads"
chmod 755 "$PROJECT_ROOT/data"
chmod 755 "$PROJECT_ROOT/uploads"

# Check if database exists
if [ -f "$PROJECT_ROOT/data/linknest.db" ]; then
    echo -e "${GREEN}✓ Found existing database: $PROJECT_ROOT/data/linknest.db${NC}"
    echo "  Database will be copied into container and used via volume mount"
else
    echo -e "${YELLOW}⚠ No existing database found - will be created on first run${NC}"
fi

echo -e "${GREEN}✓ Directories created${NC}"
echo ""

# Navigate to docker directory
cd "$SCRIPT_DIR"

# Stop and remove existing container if it exists
echo "Stopping existing containers (if any)..."
docker-compose down 2>/dev/null || true
echo -e "${GREEN}✓ Existing containers stopped${NC}"
echo ""

# Build the Docker image
echo "Building Docker image..."
echo -e "${YELLOW}This may take a few minutes on first run...${NC}"
docker-compose build --no-cache
echo -e "${GREEN}✓ Docker image built successfully${NC}"
echo ""

# Start the container
echo "Starting Docker container..."
docker-compose up -d
echo -e "${GREEN}✓ Container started${NC}"
echo ""

# Wait for container to be ready
echo "Waiting for container to be ready..."
sleep 5

# Check container status
if docker ps | grep -q linknest; then
    echo -e "${GREEN}✓ Container is running${NC}"
else
    echo -e "${RED}✗ Container failed to start${NC}"
    echo "Checking logs..."
    docker-compose logs
    exit 1
fi

# Display container information
echo ""
echo "=========================================="
echo -e "${GREEN}Deployment Successful!${NC}"
echo "=========================================="
echo ""
echo "Application is now running at:"
echo -e "${GREEN}HTTP:  http://localhost:8090${NC}"
echo -e "${GREEN}HTTPS: https://localhost:8443${NC}"
echo -e "${YELLOW}Note: Using self-signed certificate - browser will show security warning${NC}"
echo ""
echo "Container information:"
docker ps | grep linknest
echo ""
echo "Useful commands:"
echo "  View logs:    docker-compose logs -f"
echo "  Stop:          docker-compose stop"
echo "  Start:         docker-compose start"
echo "  Restart:       docker-compose restart"
echo "  Remove:        docker-compose down"
echo ""
echo "Database location: $PROJECT_ROOT/data/linknest.db"
echo "Uploads location: $PROJECT_ROOT/uploads"
echo ""

