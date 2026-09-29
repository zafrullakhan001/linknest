<?php
/**
 * Migration Runner - Add is_temp column to tile_versions
 * Run this once to update existing databases
 */

require_once __DIR__ . '/../api/config.php';

try {
    $db = getDB();
    
    echo "Starting migration: Add is_temp column to tile_versions\n";
    
    // Check if column already exists
    $result = $db->query("PRAGMA table_info(tile_versions)");
    $columns = $result->fetchAll(PDO::FETCH_ASSOC);
    $hasTempColumn = false;
    
    foreach ($columns as $column) {
        if ($column['name'] === 'is_temp') {
            $hasTempColumn = true;
            break;
        }
    }
    
    if ($hasTempColumn) {
        echo "✓ Column 'is_temp' already exists. Skipping migration.\n";
    } else {
        echo "Adding 'is_temp' column...\n";
        $db->exec("ALTER TABLE tile_versions ADD COLUMN is_temp INTEGER DEFAULT 0");
        echo "✓ Column 'is_temp' added successfully.\n";
    }
    
    // Clean up any orphaned temp versions
    echo "Cleaning up any orphaned temp versions...\n";
    $stmt = $db->prepare("DELETE FROM tile_versions WHERE is_temp = 1");
    $stmt->execute();
    $deleted = $stmt->rowCount();
    echo "✓ Cleaned up $deleted orphaned temp version(s).\n";
    
    echo "\nMigration completed successfully!\n";
    
} catch (Exception $e) {
    echo "ERROR: Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
