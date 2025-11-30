#/bin/bash
# LinkNest Build Script for Linux/Mac
# Run this script after copying the bundle to target machine

set -e

echo "=========================================="
echo "LinkNest Build Process"
echo "=========================================="
echo ""

# Check if Node.js is installed
if  command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed."
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if  command -v npm &> /dev/null; then
    echo "ERROR: npm is not installed."
    echo "Please install npm ^(comes with Node.js^)"
    exit 1
fi

echo "Installing dependencies..."
npm install

echo ""
echo "Building application..."
npm run build

echo ""
echo "=========================================="
echo "Build completed successfully"
echo "=========================================="
echo ""
echo "The application has been built in the 'dist' folder."
echo "You can now deploy the application using your web server."
echo ""
echo "For PHP built-in server, run:"
echo "    php -S localhost:8000 router.php"
echo ""
