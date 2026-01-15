#!/bin/bash
# Verification script to check PHP and all required extensions are working

echo "=== PHP Version ==="
php -v

echo ""
echo "=== Checking Required PHP Extensions ==="
REQUIRED_EXTENSIONS=("pdo_sqlite" "sqlite3" "opcache" "ldap" "zip" "json" "curl" "openssl")
ALL_GOOD=true

for ext in "${REQUIRED_EXTENSIONS[@]}"; do
    if php -r "if (!extension_loaded('$ext')) { exit(1); }"; then
        echo "✓ $ext extension is loaded"
    else
        echo "✗ $ext extension is NOT loaded"
        ALL_GOOD=false
    fi
done

echo ""
echo "=== Testing SQLite Connection ==="
php -r "
try {
    \$db = new PDO('sqlite::memory:');
    echo '✓ PDO SQLite connection successful\n';
    echo '✓ SQLite version: ' . \$db->query('SELECT sqlite_version()')->fetchColumn() . '\n';
} catch (Exception \$e) {
    echo '✗ ERROR: ' . \$e->getMessage() . '\n';
    exit(1);
}
"

echo ""
echo "=== OPcache Status ==="
if php -r "if (function_exists('opcache_get_status')) { \$status = opcache_get_status(); if (\$status && \$status['opcache_enabled']) { echo 'OPcache is ENABLED\n'; echo 'Memory used: ' . round(\$status['memory_usage']['used_memory'] / 1024 / 1024, 2) . 'MB\n'; echo 'Cached scripts: ' . \$status['opcache_statistics']['num_cached_scripts'] . '\n'; exit(0); } else { exit(1); } } else { exit(1); }"; then
    echo "✓ OPcache is working correctly"
else
    echo "⚠ OPcache status unavailable (may still be working)"
fi

echo ""
echo "=== PHP Configuration Summary ==="
php -i | grep -E "(pdo_sqlite|opcache|ldap|zip)" | head -10

if [ "$ALL_GOOD" = true ]; then
    echo ""
    echo "✓ All required extensions are loaded!"
    exit 0
else
    echo ""
    echo "✗ Some required extensions are missing!"
    exit 1
fi

