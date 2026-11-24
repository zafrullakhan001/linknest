#!/bin/bash
# Verification script to check PHP and all required extensions are working

echo "=== PHP Version ==="
php -v

echo ""
echo "=== Checking Required PHP Extensions ==="
# Core extensions that must be loaded
# Note: json, curl, and openssl are usually built-in or have different detection methods
CRITICAL_EXTENSIONS=("pdo_sqlite" "sqlite3" "ldap" "zip" "gd")
ALL_GOOD=true
MISSING_EXTENSIONS=()

for ext in "${CRITICAL_EXTENSIONS[@]}"; do
    if php -r "if (!extension_loaded('$ext')) { exit(1); }"; then
        echo "✓ $ext extension is loaded"
    else
        echo "✗ $ext extension is NOT loaded"
        ALL_GOOD=false
        MISSING_EXTENSIONS+=("$ext")
    fi
done

# Check built-in extensions differently
echo ""
echo "=== Checking Built-in Extensions ==="
if php -r "if (!function_exists('json_encode')) { exit(1); }"; then
    echo "✓ json extension is available"
else
    echo "✗ json extension is NOT available"
    ALL_GOOD=false
    MISSING_EXTENSIONS+=("json")
fi

if php -r "if (!function_exists('curl_init')) { exit(1); }"; then
    echo "✓ curl extension is available"
else
    echo "✗ curl extension is NOT available"
    ALL_GOOD=false
    MISSING_EXTENSIONS+=("curl")
fi

if php -r "if (!function_exists('openssl_encrypt')) { exit(1); }"; then
    echo "✓ openssl extension is available"
else
    echo "✗ openssl extension is NOT available"
    ALL_GOOD=false
    MISSING_EXTENSIONS+=("openssl")
fi

echo ""
echo "=== OPcache Extension Check ==="
# OPcache is installed but disabled in CLI mode (this is correct behavior)
# We only check if the extension exists, not if it's enabled
if php -r "if (function_exists('opcache_get_configuration')) { exit(0); } else { exit(1); }"; then
    echo "✓ OPcache extension is installed"
    echo "  Note: OPcache is disabled in CLI mode (expected behavior)"
    echo "  OPcache will be active for web requests"
else
    echo "✗ OPcache extension is NOT installed"
    ALL_GOOD=false
    MISSING_EXTENSIONS+=("opcache")
fi

echo ""
echo "=== Testing SQLite Connection ==="
if php -r "
try {
    \$db = new PDO('sqlite::memory:');
    echo '✓ PDO SQLite connection successful\n';
    echo '✓ SQLite version: ' . \$db->query('SELECT sqlite_version()')->fetchColumn() . '\n';
    exit(0);
} catch (Exception \$e) {
    echo '✗ ERROR: ' . \$e->getMessage() . '\n';
    exit(1);
}
"; then
    echo "✓ SQLite connection test passed"
else
    echo "✗ SQLite connection test failed"
    ALL_GOOD=false
fi

echo ""
echo "=== PHP Configuration Summary ==="
php -i | grep -E "(pdo_sqlite|sqlite3|opcache|ldap|zip|gd|json|curl|openssl)" | head -20

echo ""
if [ "$ALL_GOOD" = true ]; then
    echo "✓ All required extensions are loaded!"
    echo "✓ PHP configuration is correct"
    exit 0
else
    echo "✗ Some required extensions are missing:"
    for ext in "${MISSING_EXTENSIONS[@]}"; do
        echo "  - $ext"
    done
    echo ""
    echo "Please check the Dockerfile to ensure all extensions are installed."
    exit 1
fi

