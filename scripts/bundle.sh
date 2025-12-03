#!/bin/bash

# LinkNest Bundle Creator for Linux/Mac
# Creates a zip file with all necessary files for deployment

set -e

echo "=========================================="
echo "LinkNest Bundle Creator"
echo "=========================================="
echo ""

# Generate bundle name with timestamp
BUNDLE_NAME="linknest-deploy-$(date +%Y%m%d-%H%M%S)"

echo "Creating bundle: ${BUNDLE_NAME}.zip"
echo ""

# Create temporary directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf ${TEMP_DIR}" EXIT

echo "Copying files..."

# Copy essential files
cp package.json package-lock.json "${TEMP_DIR}/" 2>/dev/null || true
cp vite.config.ts vite.docker.config.ts "${TEMP_DIR}/" 2>/dev/null || true
cp tsconfig.json "${TEMP_DIR}/" 2>/dev/null || true
cp tailwind.config.js postcss.config.js "${TEMP_DIR}/" 2>/dev/null || true
cp index.html index.tsx index.css "${TEMP_DIR}/" 2>/dev/null || true
cp App.tsx types.ts "${TEMP_DIR}/" 2>/dev/null || true
cp Dockerfile docker-compose.yml docker-compose.prod.yml "${TEMP_DIR}/" 2>/dev/null || true
cp .dockerignore "${TEMP_DIR}/" 2>/dev/null || true
cp deploy.bat deploy.sh "${TEMP_DIR}/" 2>/dev/null || true
cp README_DOCKER.md "${TEMP_DIR}/" 2>/dev/null || true
cp DEPLOYMENT_INSTRUCTIONS.md "${TEMP_DIR}/" 2>/dev/null || true

# Copy directories
echo "Copying directories..."
cp -r api "${TEMP_DIR}/" 2>/dev/null || true
cp -r components "${TEMP_DIR}/" 2>/dev/null || true
cp -r contexts "${TEMP_DIR}/" 2>/dev/null || true
cp -r services "${TEMP_DIR}/" 2>/dev/null || true
cp -r docker "${TEMP_DIR}/" 2>/dev/null || true

# Create empty directories that will be needed
mkdir -p "${TEMP_DIR}/data" "${TEMP_DIR}/uploads"

# Copy uploads .htaccess if it exists
if [ -f "uploads/.htaccess" ]; then
    cp "uploads/.htaccess" "${TEMP_DIR}/uploads/"
fi

echo ""
echo "Creating zip file..."

# Create zip file
cd "${TEMP_DIR}"
zip -r "${OLDPWD}/${BUNDLE_NAME}.zip" . > /dev/null
cd "${OLDPWD}"

if [ -f "${BUNDLE_NAME}.zip" ]; then
    echo ""
    echo "=========================================="
    echo "Bundle created successfully!"
    echo "=========================================="
    echo ""
    echo "File: ${BUNDLE_NAME}.zip"
    echo "Location: $(pwd)/${BUNDLE_NAME}.zip"
    echo ""
    echo "The bundle contains all files needed for deployment."
    echo "Users can extract and run deploy.bat (Windows) or deploy.sh (Linux/Mac) to deploy."
    echo ""
else
    echo ""
    echo "ERROR: Failed to create zip file."
    exit 1
fi

echo "Done!"






























































