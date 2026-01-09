#!/bin/bash

# LinkNest Docker Deployment Script for Ubuntu
# This script installs Docker, builds and runs the LinkNest application

set -e

echo "=========================================="
echo "LinkNest Docker Deployment Script"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    echo -e "${RED}Please do not run this script as root${NC}"
    exit 1
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if Docker is installed
if ! command_exists docker; then
    echo -e "${YELLOW}Docker is not installed. Installing Docker...${NC}"
    
    # Update package index
    sudo apt-get update
    
    # Install prerequisites
    sudo apt-get install -y \
        ca-certificates \
        curl \
        gnupg \
        lsb-release
    
    # Add Docker's official GPG key
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    
    # Set up Docker repository
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    # Add current user to docker group
    sudo usermod -aG docker $USER
    
    echo -e "${GREEN}Docker installed successfully!${NC}"
    echo -e "${YELLOW}Note: You may need to log out and log back in for group changes to take effect.${NC}"
    echo -e "${YELLOW}For this session, the script will use 'sudo' if needed.${NC}"
    echo ""
else
    echo -e "${GREEN}Docker is already installed${NC}"
fi

# Check if Docker Compose is available
if ! docker compose version > /dev/null 2>&1; then
    echo -e "${RED}Docker Compose is not available.${NC}"
    echo -e "${YELLOW}Trying with sudo...${NC}"
    if sudo docker compose version > /dev/null 2>&1; then
        echo -e "${GREEN}Docker Compose is available with sudo${NC}"
        # Use sudo for docker commands
        DOCKER_CMD="sudo docker"
        COMPOSE_CMD="sudo docker compose"
    else
        echo -e "${RED}Please install Docker Compose or log out and log back in.${NC}"
        exit 1
    fi
else
    DOCKER_CMD="docker"
    COMPOSE_CMD="docker compose"
fi

echo ""
echo -e "${YELLOW}Creating necessary directories...${NC}"

# Create data and uploads directories if they don't exist
mkdir -p data
mkdir -p uploads

# Set proper permissions
chmod 755 data uploads

echo -e "${GREEN}Directories created${NC}"
echo ""

# Check if .env file exists, if not create a template
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file template...${NC}"
    cat > .env << EOF
# LinkNest Environment Variables
# Add your Gemini API key here if needed
# GEMINI_API_KEY=your_api_key_here
EOF
    echo -e "${GREEN}.env file created${NC}"
    echo ""
fi

# Stop and remove existing containers if they exist
echo -e "${YELLOW}Stopping existing containers (if any)...${NC}"
$COMPOSE_CMD down 2>/dev/null || true

# Build and start the application
echo ""
echo -e "${YELLOW}Building Docker image...${NC}"
$COMPOSE_CMD build --no-cache

echo ""
echo -e "${YELLOW}Starting LinkNest application...${NC}"
$COMPOSE_CMD up -d

# Wait for container to be ready
echo ""
echo -e "${YELLOW}Waiting for application to start...${NC}"
sleep 5

# Check if container is running
if $DOCKER_CMD ps | grep -q linknest; then
    echo ""
    echo -e "${GREEN}=========================================="
    echo -e "Deployment Successful!${NC}"
    echo -e "${GREEN}=========================================="
    echo ""
    echo -e "Application is running at: ${GREEN}http://localhost:8000${NC}"
    echo ""
    echo -e "Default admin credentials:"
    echo -e "  Username: ${GREEN}admin${NC}"
    echo -e "  Password: ${GREEN}admin123${NC}"
    echo ""
    echo -e "Useful commands:"
    echo -e "  View logs: ${YELLOW}$COMPOSE_CMD logs -f${NC}"
    echo -e "  Stop: ${YELLOW}$COMPOSE_CMD down${NC}"
    echo -e "  Restart: ${YELLOW}$COMPOSE_CMD restart${NC}"
    echo -e "  View status: ${YELLOW}$COMPOSE_CMD ps${NC}"
    echo ""
else
    echo -e "${RED}Container failed to start. Check logs with: $COMPOSE_CMD logs${NC}"
    exit 1
fi
















































































































