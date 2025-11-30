#!/bin/bash
# Bundle LinkNest Application for Standalone Deployment
# This script creates a complete deployment package that can be deployed
# from any location without requiring access to the full repository

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=========================================="
echo "LinkNest Deployment Bundle Creator"
echo "=========================================="
echo ""

# Get the project root directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUNDLE_NAME="linknest-deployment-$(date +%Y%m%d-%H%M%S)"
BUNDLE_DIR="$PROJECT_ROOT/$BUNDLE_NAME"

echo -e "${BLUE}Project root: $PROJECT_ROOT${NC}"
echo -e "${BLUE}Bundle directory: $BUNDLE_DIR${NC}"
echo ""

# Create bundle directory structure
echo "Creating bundle directory structure..."
mkdir -p "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR/docker"
mkdir -p "$BUNDLE_DIR/api"
mkdir -p "$BUNDLE_DIR/components"
mkdir -p "$BUNDLE_DIR/contexts"
mkdir -p "$BUNDLE_DIR/services"
mkdir -p "$BUNDLE_DIR/data"
mkdir -p "$BUNDLE_DIR/uploads"
mkdir -p "$BUNDLE_DIR/scripts"
echo -e "${GREEN}✓ Directory structure created${NC}"
echo ""

# Copy Docker files
echo "Copying Docker configuration files..."
cp "$PROJECT_ROOT/docker/Dockerfile" "$BUNDLE_DIR/docker/"
cp "$PROJECT_ROOT/docker/docker-compose.yml" "$BUNDLE_DIR/docker/"
cp "$PROJECT_ROOT/docker/apache-config.conf" "$BUNDLE_DIR/docker/"
cp "$PROJECT_ROOT/docker/apache-ssl-config.conf" "$BUNDLE_DIR/docker/"
cp "$PROJECT_ROOT/docker/php-config.ini" "$BUNDLE_DIR/docker/"
cp "$PROJECT_ROOT/docker/.htaccess" "$BUNDLE_DIR/docker/"
cp "$PROJECT_ROOT/docker/generate-ssl-cert.sh" "$BUNDLE_DIR/docker/"
cp "$PROJECT_ROOT/docker/verify-php.sh" "$BUNDLE_DIR/docker/"
chmod +x "$BUNDLE_DIR/docker/generate-ssl-cert.sh"
chmod +x "$BUNDLE_DIR/docker/verify-php.sh"
echo -e "${GREEN}✓ Docker files copied${NC}"
echo ""

# Copy API files
echo "Copying API files..."
cp -r "$PROJECT_ROOT/api/"* "$BUNDLE_DIR/api/"
echo -e "${GREEN}✓ API files copied${NC}"
echo ""

# Copy frontend source files
echo "Copying frontend source files..."
cp "$PROJECT_ROOT/index.html" "$BUNDLE_DIR/"
cp "$PROJECT_ROOT/index.tsx" "$BUNDLE_DIR/"
cp "$PROJECT_ROOT/index.css" "$BUNDLE_DIR/"
cp "$PROJECT_ROOT/App.tsx" "$BUNDLE_DIR/"
cp "$PROJECT_ROOT/types.ts" "$BUNDLE_DIR/"
cp -r "$PROJECT_ROOT/components/"* "$BUNDLE_DIR/components/"
cp -r "$PROJECT_ROOT/contexts/"* "$BUNDLE_DIR/contexts/"
cp -r "$PROJECT_ROOT/services/"* "$BUNDLE_DIR/services/"
echo -e "${GREEN}✓ Frontend source files copied${NC}"
echo ""

# Copy build configuration files
echo "Copying build configuration files..."
cp "$PROJECT_ROOT/package.json" "$BUNDLE_DIR/"
cp "$PROJECT_ROOT/package-lock.json" "$BUNDLE_DIR/" 2>/dev/null || true
cp "$PROJECT_ROOT/vite.config.ts" "$BUNDLE_DIR/"
cp "$PROJECT_ROOT/vite.docker.config.ts" "$BUNDLE_DIR/"
cp "$PROJECT_ROOT/tsconfig.json" "$BUNDLE_DIR/"
cp "$PROJECT_ROOT/tailwind.config.js" "$BUNDLE_DIR/"
cp "$PROJECT_ROOT/postcss.config.js" "$BUNDLE_DIR/"
echo -e "${GREEN}✓ Build configuration files copied${NC}"
echo ""

# Copy utility files
echo "Copying utility files..."
cp "$PROJECT_ROOT/check_opcache.php" "$BUNDLE_DIR/" 2>/dev/null || true
echo -e "${GREEN}✓ Utility files copied${NC}"
echo ""

# Verify OPcache and LDAP are in Dockerfile
echo "Verifying OPcache and LDAP configuration..."
if grep -q "opcache" "$BUNDLE_DIR/docker/Dockerfile" && grep -q "ldap" "$BUNDLE_DIR/docker/Dockerfile"; then
    echo -e "${GREEN}✓ OPcache and LDAP extensions confirmed in Dockerfile${NC}"
else
    echo -e "${YELLOW}⚠ Warning: OPcache or LDAP may not be properly configured${NC}"
fi
if grep -q "opcache.enable" "$BUNDLE_DIR/docker/php-config.ini"; then
    echo -e "${GREEN}✓ OPcache configuration confirmed in php-config.ini${NC}"
else
    echo -e "${YELLOW}⚠ Warning: OPcache configuration may be missing${NC}"
fi
echo ""

# Copy deployment scripts
echo "Copying deployment scripts..."
cp "$PROJECT_ROOT/docker/deploy.sh" "$BUNDLE_DIR/docker/"
cp "$PROJECT_ROOT/docker/deploy.bat" "$BUNDLE_DIR/docker/"
chmod +x "$BUNDLE_DIR/docker/deploy.sh"
chmod +x "$BUNDLE_DIR/docker/deploy.bat"
echo -e "${GREEN}✓ Deployment scripts copied${NC}"
echo ""

# Copy database if it exists (optional - user can provide their own)
if [ -f "$PROJECT_ROOT/data/linknest.db" ]; then
    echo "Copying existing database..."
    cp "$PROJECT_ROOT/data/linknest.db" "$BUNDLE_DIR/data/" 2>/dev/null || true
    echo -e "${GREEN}✓ Database copied${NC}"
else
    echo -e "${YELLOW}⚠ No existing database found - will be created on first run${NC}"
fi
echo ""

# Create standalone deployment script
echo "Creating standalone deployment script..."
cat > "$BUNDLE_DIR/deploy.sh" << 'DEPLOY_SCRIPT'
#!/bin/bash
# Standalone Deployment Script for LinkNest
# This script can be run from the bundled deployment folder

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "=========================================="
echo "LinkNest Standalone Deployment"
echo "=========================================="
echo ""

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
cd "$SCRIPT_DIR/docker"

echo "Building Docker image..."
docker-compose build

echo ""
echo "Starting container..."
docker-compose up -d

echo ""
echo -e "${GREEN}Deployment complete!${NC}"
echo ""
echo "Application URLs:"
echo -e "${GREEN}HTTP:  http://localhost:8090${NC}"
echo -e "${GREEN}HTTPS: https://localhost:8443${NC}"
echo ""
DEPLOY_SCRIPT

chmod +x "$BUNDLE_DIR/deploy.sh"

# Create Windows deployment script
cat > "$BUNDLE_DIR/deploy.bat" << 'DEPLOY_BAT'
@echo off
REM Standalone Deployment Script for LinkNest (Windows)
REM This script can be run from the bundled deployment folder

echo ==========================================
echo LinkNest Standalone Deployment
echo ==========================================
echo.

REM Check if Docker is installed
where docker >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Error: Docker is not installed. Please install Docker Desktop first.
    exit /b 1
)

REM Check if Docker Compose is installed
where docker-compose >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Error: Docker Compose is not installed. Please install Docker Compose first.
    exit /b 1
)

cd /d "%~dp0docker"

echo Building Docker image...
docker-compose build
if %ERRORLEVEL% NEQ 0 (
    echo Error: Docker build failed
    exit /b 1
)

echo.
echo Starting container...
docker-compose up -d
if %ERRORLEVEL% NEQ 0 (
    echo Error: Failed to start container
    exit /b 1
)

echo.
echo Deployment complete!
echo.
echo Application URLs:
echo HTTP:  http://localhost:8090
echo HTTPS: https://localhost:8443
echo.

pause
DEPLOY_BAT

# Create README for the bundle
cat > "$BUNDLE_DIR/README_DEPLOYMENT.md" << 'README'
# LinkNest Standalone Deployment Package

This is a complete, standalone deployment package for LinkNest. You can deploy this application from any location without needing access to the source repository.

## Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Docker Compose
- At least 2GB of free disk space
- Ports 8090 (HTTP) and 8443 (HTTPS) available

## Quick Start

### Windows
```batch
deploy.bat
```

### Linux/Mac
```bash
chmod +x deploy.sh
./deploy.sh
```

## Deployment

The deployment scripts will:
1. Build the Docker image with all dependencies
2. Start the container
3. Make the application available at:
   - HTTP: http://localhost:8090
   - HTTPS: https://localhost:8443

## Default Login

- Username: `admin`
- Password: `admin123`

⚠️ **IMPORTANT**: Change the default admin password immediately after first login!

## Directory Structure

- `docker/` - Docker configuration files
- `api/` - PHP API files
- `components/` - React components
- `contexts/` - React contexts
- `services/` - Service files
- `data/` - Database storage (persistent)
- `uploads/` - File uploads (persistent)

## Manual Deployment

If you prefer to deploy manually:

```bash
cd docker
docker-compose build
docker-compose up -d
```

## Stopping the Application

```bash
cd docker
docker-compose down
```

## Updating

To update the application:
1. Stop the container: `cd docker && docker-compose down`
2. Replace the files in this bundle with new versions
3. Rebuild and start: `cd docker && docker-compose build && docker-compose up -d`

## Database

The database is stored in the `data/` directory and persists between container restarts. To backup:

```bash
cp data/linknest.db data/linknest.db.backup
```

## Troubleshooting

### Port Already in Use
Change the ports in `docker/docker-compose.yml`:
```yaml
ports:
  - "YOUR_PORT:80"
  - "YOUR_HTTPS_PORT:443"
```

### Container Won't Start
Check logs:
```bash
cd docker
docker-compose logs
```

### Need Help
See the main project documentation for detailed troubleshooting.

## What's Included

- ✅ PHP 8.2 with Apache
- ✅ SQLite database with optimizations
- ✅ OPcache enabled
- ✅ LDAP extension
- ✅ HTTPS with self-signed certificate
- ✅ All frontend and backend code
- ✅ Complete Docker configuration

## Support

For issues or questions, refer to the main project documentation or contact support.
README

echo -e "${GREEN}✓ Deployment scripts and documentation created${NC}"
echo ""

# Create a .gitignore for the bundle (in case user wants to version control it)
cat > "$BUNDLE_DIR/.gitignore" << 'GITIGNORE'
# Ignore node_modules if user installs dependencies locally
node_modules/
dist/

# Ignore build artifacts
*.log
.DS_Store
Thumbs.db
GITIGNORE

# Create bundle info file
cat > "$BUNDLE_DIR/BUNDLE_INFO.txt" << BUNDLE_INFO
LinkNest Deployment Bundle
Created: $(date)
Version: Standalone Deployment Package

This bundle contains everything needed to deploy LinkNest
without requiring access to the source repository.

To deploy:
- Windows: Run deploy.bat
- Linux/Mac: Run ./deploy.sh

For more information, see README_DEPLOYMENT.md
BUNDLE_INFO

echo -e "${GREEN}✓ Bundle information file created${NC}"
echo ""

# Calculate bundle size
BUNDLE_SIZE=$(du -sh "$BUNDLE_DIR" | cut -f1)

echo "=========================================="
echo -e "${GREEN}Bundle Created Successfully!${NC}"
echo "=========================================="
echo ""
echo -e "${BLUE}Bundle Location:${NC} $BUNDLE_DIR"
echo -e "${BLUE}Bundle Size:${NC} $BUNDLE_SIZE"
echo ""
echo "Next steps:"
echo "1. Copy the bundle folder to your deployment location"
echo "2. Navigate to the bundle folder"
echo "3. Run the deployment script:"
echo -e "   ${GREEN}Windows:${NC} deploy.bat"
echo -e "   ${GREEN}Linux/Mac:${NC} ./deploy.sh"
echo ""
echo "The bundle is ready for standalone deployment!"
echo ""

