#!/bin/bash
# Clone LinkNest to a new folder with all necessary files
# Usage: ./clone-linknest.sh <new-folder-name> [--target <path>] [--assets] [--database]
# Example: ./clone-linknest.sh myspaces --target /home/user/projects --assets --database

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if [ -z "$1" ]; then
    echo ""
    echo "Usage: ./clone-linknest.sh <new-folder-name> [--target <path>] [--assets] [--database]"
    echo ""
    echo "Parameters:"
    echo "  new-folder-name  Name of the new folder to create"
    echo "  --target <path>  Target directory where folder will be created (optional)"
    echo "  --assets         Copy logos and favicon from uploads folder"
    echo "  --database       Copy database file from data folder"
    echo ""
    echo "Examples:"
    echo "  ./clone-linknest.sh myspaces"
    echo "  ./clone-linknest.sh myspaces --target /home/user/projects"
    echo "  ./clone-linknest.sh myspaces --assets --database"
    echo "  ./clone-linknest.sh myspaces --target /home/user/projects --assets --database"
    echo ""
    exit 1
fi

NEW_FOLDER="$1"
COPY_ASSETS=0
COPY_DATABASE=0
TARGET_PATH=""

# Parse optional parameters
shift
while [[ $# -gt 0 ]]; do
    case $1 in
        --target)
            TARGET_PATH="$2"
            shift 2
            ;;
        --assets)
            COPY_ASSETS=1
            shift
            ;;
        --database)
            COPY_DATABASE=1
            shift
            ;;
        *)
            echo -e "${YELLOW}Warning: Unknown parameter '$1'${NC}"
            shift
            ;;
    esac
done
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURRENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ -n "$TARGET_PATH" ]; then
    TARGET_DIR="$TARGET_PATH/$NEW_FOLDER"
else
    PARENT_DIR="$(cd "$CURRENT_DIR/.." && pwd)"
    TARGET_DIR="$PARENT_DIR/$NEW_FOLDER"
fi

echo ""
echo "========================================"
echo "LinkNest Clone Script"
echo "========================================"
echo ""
echo "Source: $CURRENT_DIR"
echo "Target: $TARGET_DIR"
echo ""

# Check if target folder already exists
if [ -d "$TARGET_DIR" ]; then
    echo -e "${RED}ERROR: Folder '$TARGET_DIR' already exists!${NC}"
    echo "Please choose a different name or delete the existing folder."
    exit 1
fi

# Create target directory
echo "[1/6] Creating target directory..."
mkdir -p "$TARGET_DIR"
if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Failed to create target directory!${NC}"
    exit 1
fi

# Copy necessary files and directories
echo "[2/6] Copying files..."
echo ""

# Copy root files
echo "  - Copying root files..."
cp "$CURRENT_DIR/package.json" "$TARGET_DIR/" 2>/dev/null || true
cp "$CURRENT_DIR/package-lock.json" "$TARGET_DIR/" 2>/dev/null || true
cp "$CURRENT_DIR/tsconfig.json" "$TARGET_DIR/" 2>/dev/null || true
cp "$CURRENT_DIR/vite.config.ts" "$TARGET_DIR/" 2>/dev/null || true
cp "$CURRENT_DIR/vite.docker.config.ts" "$TARGET_DIR/" 2>/dev/null || true
cp "$CURRENT_DIR/vite.runtime.config.ts" "$TARGET_DIR/" 2>/dev/null || true
cp "$CURRENT_DIR/tailwind.config.js" "$TARGET_DIR/" 2>/dev/null || true
cp "$CURRENT_DIR/postcss.config.js" "$TARGET_DIR/" 2>/dev/null || true
cp "$CURRENT_DIR/index.html" "$TARGET_DIR/" 2>/dev/null || true
cp "$CURRENT_DIR/index.tsx" "$TARGET_DIR/" 2>/dev/null || true
cp "$CURRENT_DIR/index.css" "$TARGET_DIR/" 2>/dev/null || true
cp "$CURRENT_DIR/App.tsx" "$TARGET_DIR/" 2>/dev/null || true
cp "$CURRENT_DIR/types.ts" "$TARGET_DIR/" 2>/dev/null || true
cp "$CURRENT_DIR/router.php" "$TARGET_DIR/" 2>/dev/null || true
cp "$CURRENT_DIR/.htaccess" "$TARGET_DIR/" 2>/dev/null || true
cp "$CURRENT_DIR/README.md" "$TARGET_DIR/" 2>/dev/null || true
cp "$CURRENT_DIR/bulk-import-template.csv" "$TARGET_DIR/" 2>/dev/null || true
cp "$CURRENT_DIR/section-links-import-template.csv" "$TARGET_DIR/" 2>/dev/null || true

# Copy directories
echo "  - Copying api directory..."
cp -r "$CURRENT_DIR/api" "$TARGET_DIR/" 2>/dev/null || true

echo "  - Copying components directory..."
cp -r "$CURRENT_DIR/components" "$TARGET_DIR/" 2>/dev/null || true

echo "  - Copying contexts directory..."
cp -r "$CURRENT_DIR/contexts" "$TARGET_DIR/" 2>/dev/null || true

echo "  - Copying services directory..."
cp -r "$CURRENT_DIR/services" "$TARGET_DIR/" 2>/dev/null || true

echo "  - Copying src directory..."
cp -r "$CURRENT_DIR/src" "$TARGET_DIR/" 2>/dev/null || true

echo "  - Creating data directory..."
mkdir -p "$TARGET_DIR/data"

echo "  - Creating uploads directory..."
mkdir -p "$TARGET_DIR/uploads"

echo "  - Creating scripts directory..."
mkdir -p "$TARGET_DIR/scripts"

echo "  - Copying clone scripts..."
cp "$SCRIPT_DIR/clone-linknest.bat" "$TARGET_DIR/scripts/" 2>/dev/null || true
cp "$SCRIPT_DIR/clone-linknest.sh" "$TARGET_DIR/scripts/" 2>/dev/null || true
cp "$SCRIPT_DIR/encrypt_ldap_passwords.php" "$TARGET_DIR/scripts/" 2>/dev/null || true
chmod +x "$TARGET_DIR/scripts/clone-linknest.sh" 2>/dev/null || true
echo "    Copied clone scripts to target folder"

# Copy assets if requested
if [ "$COPY_ASSETS" -eq 1 ]; then
    echo "  - Copying logos and favicon..."
    LOGO_COUNT=0
    FAVICON_COUNT=0
    
    # Copy logo files
    if ls "$CURRENT_DIR/uploads/logo_"*.* 1> /dev/null 2>&1; then
        cp "$CURRENT_DIR/uploads/logo_"*.* "$TARGET_DIR/uploads/" 2>/dev/null || true
        LOGO_COUNT=$(ls -1 "$TARGET_DIR/uploads/logo_"*.* 2>/dev/null | wc -l)
        echo "    Copied $LOGO_COUNT logo file(s)"
    fi
    
    # Copy favicon files
    if ls "$CURRENT_DIR/uploads/favicon_"*.* 1> /dev/null 2>&1; then
        cp "$CURRENT_DIR/uploads/favicon_"*.* "$TARGET_DIR/uploads/" 2>/dev/null || true
        FAVICON_COUNT=$(ls -1 "$TARGET_DIR/uploads/favicon_"*.* 2>/dev/null | wc -l)
        echo "    Copied $FAVICON_COUNT favicon file(s)"
    fi
    
    if [ "$LOGO_COUNT" -eq 0 ] && [ "$FAVICON_COUNT" -eq 0 ]; then
        echo "    No logos or favicons found to copy"
    fi
fi

# Copy database if requested
if [ "$COPY_DATABASE" -eq 1 ]; then
    echo "  - Copying database..."
    if [ -f "$CURRENT_DIR/data/linknest.db" ]; then
        cp "$CURRENT_DIR/data/linknest.db" "$TARGET_DIR/data/linknest.db" 2>/dev/null
        if [ $? -eq 0 ]; then
            DB_SIZE=$(du -h "$TARGET_DIR/data/linknest.db" | cut -f1)
            echo "    Copied database: data/linknest.db ($DB_SIZE)"
            echo "  - Encrypting LDAP passwords in copied database..."
            (cd "$TARGET_DIR" && php scripts/encrypt_ldap_passwords.php >/dev/null 2>&1)
            if [ $? -eq 0 ]; then
                echo "    Successfully encrypted LDAP passwords (if any were found)"
            else
                echo -e "    ${YELLOW}WARNING: Failed to encrypt LDAP passwords in copied database${NC}"
                echo "    Please run: php scripts/encrypt_ldap_passwords.php manually"
            fi
        else
            echo -e "    ${RED}ERROR: Failed to copy database file${NC}"
        fi
    else
        echo "    No database file found to copy"
    fi
fi

# Create .env file with new base path
echo "[3/7] Creating .env file..."
cat > "$TARGET_DIR/.env" << EOF
# LinkNest Environment Variables
# Base path for the application
VITE_BASE_PATH=/$NEW_FOLDER

# Optional: HTTPS Configuration
# VITE_PROTOCOL=https
# VITE_HOST=your-domain.com
# VITE_PORT=443

# Optional: Gemini API Key
# GEMINI_API_KEY=your-api-key-here
EOF

echo "  Created .env with VITE_BASE_PATH=/$NEW_FOLDER"

# Install dependencies
echo "[4/7] Installing npm dependencies..."
echo "  This may take a few minutes..."
cd "$TARGET_DIR"
npm install
if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}ERROR: npm install failed!${NC}"
    echo "Please check the error messages above."
    exit 1
fi

# Build the application
echo "[5/7] Building the application..."
echo "  This may take a few minutes..."
npm run build
if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}ERROR: npm run build failed!${NC}"
    echo "Please check the error messages above."
    exit 1
fi

# Remove node_modules after build (not needed for production, saves space)
echo "  Build complete! Removing node_modules folder (not needed for production)..."
if [ -d "$TARGET_DIR/node_modules" ]; then
    rm -rf "$TARGET_DIR/node_modules"
    echo "  Deleted node_modules folder to save space"
else
    echo "  node_modules folder not found"
fi

# Create a README for the cloned instance
echo "[6/7] Creating deployment README..."
cat > "$TARGET_DIR/DEPLOYMENT.md" << EOF
# $NEW_FOLDER - LinkNest Instance

This is a cloned instance of LinkNest deployed to /$NEW_FOLDER/

## Quick Start

1. The application has been built and is ready to use
2. Access it at: http://localhost/$NEW_FOLDER/
3. Default admin credentials: admin / admin123

## Database

The database file will be created at: data/linknest.db

## Configuration

Edit .env to change settings:
- VITE_BASE_PATH: Current value is /$NEW_FOLDER
- VITE_PROTOCOL: HTTP/HTTPS protocol
- VITE_HOST: Server hostname
- GEMINI_API_KEY: Optional API key for AI features

## Rebuilding

To rebuild after making changes:
  cd $NEW_FOLDER
  npm run build

## Cloning This Instance

You can clone this instance using the scripts in the scripts folder:
  scripts/clone-linknest.sh new-instance-name
EOF

echo "[7/7] Finalizing..."
echo "  Clone scripts are available in: $TARGET_DIR/scripts"

echo ""
echo "========================================"
echo -e "${GREEN}Clone Complete!${NC}"
echo "========================================"
echo ""
echo "New instance created at: $TARGET_DIR"
echo ""
echo "Next steps:"
echo "1. Access the application at: http://localhost/$NEW_FOLDER/"
echo "2. Login with default credentials: admin / admin123"
echo "3. Change the admin password in the Admin Panel"
echo ""
if [ "$COPY_DATABASE" -eq 1 ]; then
    echo "Database file: $TARGET_DIR/data/linknest.db"
    echo "(Copied from source)"
else
    echo "Database file: $TARGET_DIR/data/linknest.db"
    echo "(Will be created on first use)"
fi
echo ""

