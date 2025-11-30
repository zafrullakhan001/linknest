#!/bin/bash

# LinkNest Runtime Bundle Creator for Linux/Mac
# Creates a bundle with source files for building on target machine

set -e

echo "=========================================="
echo "LinkNest Runtime Bundle Creator"
echo "=========================================="
echo ""

# Get the project root directory (parent of scripts folder)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Generate bundle name with timestamp
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BUNDLE_NAME="linknest-runtime-${TIMESTAMP}"
BUNDLE_DIR="${PROJECT_ROOT}/${BUNDLE_NAME}"

echo "Project root: $PROJECT_ROOT"
echo "Bundle directory: $BUNDLE_DIR"
echo ""

# Remove existing bundle directory if it exists
if [ -d "$BUNDLE_DIR" ]; then
    echo "Removing existing bundle directory..."
    rm -rf "$BUNDLE_DIR"
fi

# Create bundle directory structure
echo "Creating bundle directory structure..."
mkdir -p "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR/api"
mkdir -p "$BUNDLE_DIR/components"
mkdir -p "$BUNDLE_DIR/contexts"
mkdir -p "$BUNDLE_DIR/services"
mkdir -p "$BUNDLE_DIR/data"
mkdir -p "$BUNDLE_DIR/uploads"
echo "✓ Directory structure created"
echo ""

# Copy API files
echo "Copying API files..."
cp -r api/* "$BUNDLE_DIR/api/" 2>/dev/null || true
echo "✓ API files copied"
echo ""

# Copy frontend source files
echo "Copying frontend source files..."
cp index.html index.tsx index.css App.tsx types.ts "$BUNDLE_DIR/" 2>/dev/null || true
cp -r components/* "$BUNDLE_DIR/components/" 2>/dev/null || true
cp -r contexts/* "$BUNDLE_DIR/contexts/" 2>/dev/null || true
cp -r services/* "$BUNDLE_DIR/services/" 2>/dev/null || true
echo "✓ Frontend source files copied"
echo ""

# Copy build configuration files
echo "Copying build configuration files..."
cp package.json "$BUNDLE_DIR/" 2>/dev/null || true
[ -f package-lock.json ] && cp package-lock.json "$BUNDLE_DIR/" 2>/dev/null || true
cp vite.config.ts vite.docker.config.ts "$BUNDLE_DIR/" 2>/dev/null || true
cp tsconfig.json "$BUNDLE_DIR/" 2>/dev/null || true
cp tailwind.config.js postcss.config.js "$BUNDLE_DIR/" 2>/dev/null || true
echo "✓ Build configuration files copied"
echo ""

# Copy PHP router if it exists
if [ -f router.php ]; then
    cp router.php "$BUNDLE_DIR/"
    echo "✓ Router file copied"
fi

# Copy utility files
if [ -f check_opcache.php ]; then
    cp check_opcache.php "$BUNDLE_DIR/"
fi

# Copy uploads directory (logos, favicons, etc.)
echo "Copying uploads directory..."
if [ -d "uploads" ]; then
    cp -r uploads/* "$BUNDLE_DIR/uploads/" 2>/dev/null || true
    echo "✓ Uploads directory copied (includes logos and favicons)"
else
    echo "⚠ Warning: uploads directory not found"
fi
echo ""

# Copy uploads .htaccess if it exists, otherwise create it
if [ -f "uploads/.htaccess" ]; then
    cp "uploads/.htaccess" "$BUNDLE_DIR/uploads/"
else
    cat > "$BUNDLE_DIR/uploads/.htaccess" << 'EOF'
# Prevent PHP execution in uploads directory
<FilesMatch "\.php$">
    Order Allow,Deny
    Deny from all
</FilesMatch>

# Allow only image files
<FilesMatch "\.(jpg|jpeg|png|gif|svg|webp|ico)$">
    Order Allow,Deny
    Allow from all
</FilesMatch>
EOF
fi
echo "✓ Utility files copied"
echo ""

# Create build script for target machine (Windows)
cat > "$BUNDLE_DIR/build.bat" << 'EOF'
@echo off
REM LinkNest Build Script for Windows
REM Run this script after copying the bundle to target machine

echo ==========================================
echo LinkNest Build Process
echo ==========================================
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if npm is installed
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npm is not installed.
    echo Please install npm (comes with Node.js)
    pause
    exit /b 1
)

echo Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo Building application...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo ==========================================
echo Build completed successfully!
echo ==========================================
echo.
echo The application has been built in the 'dist' folder.
echo You can now deploy the application using your web server.
echo.
echo For PHP built-in server, run:
echo     php -S localhost:8000 router.php
echo.
pause
EOF

# Create build script for target machine (Linux/Mac)
cat > "$BUNDLE_DIR/build.sh" << 'EOF'
#!/bin/bash
# LinkNest Build Script for Linux/Mac
# Run this script after copying the bundle to target machine

set -e

echo "=========================================="
echo "LinkNest Build Process"
echo "=========================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed."
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "ERROR: npm is not installed."
    echo "Please install npm (comes with Node.js)"
    exit 1
fi

echo "Installing dependencies..."
npm install

echo ""
echo "Building application..."
npm run build

echo ""
echo "=========================================="
echo "Build completed successfully!"
echo "=========================================="
echo ""
echo "The application has been built in the 'dist' folder."
echo "You can now deploy the application using your web server."
echo ""
echo "For PHP built-in server, run:"
echo "    php -S localhost:8000 router.php"
echo ""
EOF

chmod +x "$BUNDLE_DIR/build.sh"

# Create README
cat > "$BUNDLE_DIR/README.md" << 'EOF'
# LinkNest Runtime Bundle

This is a runtime bundle of the LinkNest application. It contains all source files
needed to build and run the application on the target machine.

## Prerequisites

Before building, ensure you have the following installed:

- **Node.js** (version 16 or higher) - https://nodejs.org/
- **npm** (comes with Node.js)
- **PHP 8.0 or higher** - https://www.php.net/downloads.php
- **Web Server** (Apache, Nginx, or PHP built-in server)

## Building the Application

### Windows

1. Open Command Prompt or PowerShell in the bundle directory
2. Run: `build.bat`

### Linux/Mac

1. Open Terminal in the bundle directory
2. Run: `chmod +x build.sh`
3. Run: `./build.sh`

## Running the Application

After building, the application will be in the `dist` folder. You can run it using:

### Option 1: PHP Built-in Server

```bash
php -S localhost:8000 router.php
```

Then open http://localhost:8000 in your browser.

### Option 2: Apache/Nginx

Configure your web server to:
- Serve static files from the `dist` folder
- Route API requests to `api/index.php`
- Route all other requests to `dist/index.html` (for SPA routing)

## Directory Structure

- `api/` - PHP backend API files
- `components/` - React components
- `contexts/` - React contexts
- `services/` - TypeScript service files
- `data/` - Database files (SQLite)
- `uploads/` - User uploaded files
- `dist/` - Built application (created after build)

## Configuration

The application uses environment variables for configuration. Create a `.env` file
in the root directory if needed:

```env
GEMINI_API_KEY=your_api_key_here
```

## Default Login

- Username: `admin`
- Password: `admin123`

**Important:** Change the default password after first login!

## Support

For more information, see the documentation in the `docs/` folder.
EOF

# Create .gitignore for the bundle
cat > "$BUNDLE_DIR/.gitignore" << 'EOF'
# Dependencies
node_modules/

# Build output
dist/

# Environment files
.env
.env.local

# Logs
*.log

# OS files
.DS_Store
Thumbs.db
EOF

echo "✓ Documentation created"
echo ""

# Create bundle info file
cat > "$BUNDLE_DIR/BUNDLE_INFO.txt" << EOF
LinkNest Runtime Bundle
Created: $(date)
Version: Runtime Build Package

This bundle contains all source files needed to build the application.
Run build.bat (Windows) or build.sh (Linux/Mac) to build the application.

After building, deploy the 'dist' folder and 'api' folder to your web server.
EOF

echo "✓ Bundle information file created"
echo ""

echo "=========================================="
echo "Bundle Created Successfully!"
echo "=========================================="
echo ""
echo "Bundle Location: $BUNDLE_DIR"
echo ""
echo "Next steps:"
echo "1. Copy the bundle folder to your target machine"
echo "2. Navigate to the bundle folder"
echo "3. Run: build.bat (Windows) or ./build.sh (Linux/Mac)"
echo "4. Deploy the built application from the 'dist' folder"
echo ""
echo "The bundle is ready for runtime deployment!"
echo ""

