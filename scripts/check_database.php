<?php
/**
 * Simple script to check which database file is being used
 * Run from command line: php scripts/check_database.php
 */

require_once __DIR__ . '/../api/config.php';

echo "=== Database Information ===\n\n";

echo "Database Path: " . DB_PATH . "\n";
echo "Database Directory: " . DB_DIR . "\n";

$absolutePath = realpath(DB_PATH);
if ($absolutePath) {
    echo "Absolute Path: " . $absolutePath . "\n";
} else {
    echo "Absolute Path: (file does not exist)\n";
}

echo "\nFile Status:\n";
echo "  Exists: " . (file_exists(DB_PATH) ? "Yes" : "No") . "\n";

if (file_exists(DB_PATH)) {
    echo "  Size: " . filesize(DB_PATH) . " bytes (" . formatBytes(filesize(DB_PATH)) . ")\n";
    echo "  Readable: " . (is_readable(DB_PATH) ? "Yes" : "No") . "\n";
    echo "  Writable: " . (is_writable(DB_PATH) ? "Yes" : "No") . "\n";
    echo "  Last Modified: " . date('Y-m-d H:i:s', filemtime(DB_PATH)) . "\n";
    
    // Try to get database info
    try {
        $db = getDB();
        echo "\nDatabase Stats:\n";
        echo "  Page Count: " . $db->query('PRAGMA page_count')->fetchColumn() . "\n";
        echo "  Page Size: " . $db->query('PRAGMA page_size')->fetchColumn() . " bytes\n";
        echo "  Journal Mode: " . $db->query('PRAGMA journal_mode')->fetchColumn() . "\n";
        
        // Get table counts
        echo "\nTable Counts:\n";
        $tables = ['users', 'tiles', 'sections', 'links', 'settings', 'tabs', 'tile_arrangements', 'category_arrangements'];
        foreach ($tables as $table) {
            try {
                $count = $db->query("SELECT COUNT(*) FROM $table")->fetchColumn();
                echo "  $table: $count\n";
            } catch (PDOException $e) {
                echo "  $table: (table doesn't exist)\n";
            }
        }
    } catch (Exception $e) {
        echo "\nError connecting to database: " . $e->getMessage() . "\n";
    }
} else {
    echo "  (Database file does not exist yet - it will be created on first use)\n";
}

echo "\n";

function formatBytes($bytes, $precision = 2) {
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= pow(1024, $pow);
    return round($bytes, $precision) . ' ' . $units[$pow];
}






