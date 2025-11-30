#!/bin/bash
# Verification script to check PHP and SQLite are working

echo "=== PHP Version ==="
php -v

echo ""
echo "=== Loaded PHP Extensions ==="
php -m | grep -i pdo
php -m | grep -i sqlite

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
echo "=== PHP Configuration ==="
php -i | grep -i "pdo_sqlite"
php -i | grep -i "sqlite"

