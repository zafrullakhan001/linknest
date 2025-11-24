#!/bin/bash
# Script to verify the build output

echo "=== Checking build output ==="
echo ""

if [ ! -f dist/index.html ]; then
    echo "ERROR: dist/index.html not found!"
    exit 1
fi

echo "✓ dist/index.html exists"
echo ""

echo "=== Contents of dist/index.html ==="
cat dist/index.html
echo ""

if grep -q "index.tsx" dist/index.html; then
    echo "ERROR: Built HTML still references index.tsx!"
    echo "This should not happen - Vite should have replaced it with compiled JS"
    exit 1
fi

echo "✓ No index.tsx references found in built HTML"
echo ""

echo "=== Checking for compiled JS files ==="
if ls dist/assets/*.js 1> /dev/null 2>&1; then
    echo "✓ Compiled JS files found:"
    ls -lh dist/assets/*.js
else
    echo "ERROR: No compiled JS files found in dist/assets/"
    exit 1
fi

echo ""
echo "=== Build verification complete ==="

