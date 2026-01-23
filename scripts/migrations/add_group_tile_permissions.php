<?php
/**
 * Migration: Add group_tile_permissions table
 * 
 * This migration creates a new table to store tile permissions for user groups,
 * allowing groups to be assigned as tile admins alongside individual users.
 */

require_once __DIR__ . '/../../api/config.php';

function migrate() {
    $db = getDB();
    
    echo "Creating group_tile_permissions table...\n";
    
    // Create the table
    $db->exec('
        CREATE TABLE IF NOT EXISTS group_tile_permissions (
            group_id INTEGER NOT NULL,
            tile_id TEXT NOT NULL,
            can_view INTEGER NOT NULL DEFAULT 1,
            can_edit INTEGER NOT NULL DEFAULT 0,
            can_delete INTEGER NOT NULL DEFAULT 0,
            can_add_links INTEGER DEFAULT NULL,
            can_add_sections INTEGER DEFAULT NULL,
            can_add_tabs INTEGER DEFAULT NULL,
            can_edit_links INTEGER DEFAULT NULL,
            can_delete_links INTEGER DEFAULT NULL,
            can_delete_sections INTEGER DEFAULT NULL,
            can_delete_tabs INTEGER DEFAULT NULL,
            can_change_visibility INTEGER DEFAULT NULL,
            can_change_browser INTEGER DEFAULT NULL,
            can_clone_tile INTEGER DEFAULT NULL,
            can_view_tile_info INTEGER DEFAULT NULL,
            can_edit_tile INTEGER DEFAULT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (group_id, tile_id),
            FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE,
            FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE
        )
    ');
    
    echo "Table created successfully!\n";
    
    // Create indexes for better query performance
    echo "Creating indexes...\n";
    
    $db->exec('CREATE INDEX IF NOT EXISTS idx_group_tile_permissions_group ON group_tile_permissions(group_id)');
    $db->exec('CREATE INDEX IF NOT EXISTS idx_group_tile_permissions_tile ON group_tile_permissions(tile_id)');
    
    echo "Indexes created successfully!\n";
    
    echo "Migration completed successfully!\n";
}

// Run the migration
try {
    migrate();
} catch (Exception $e) {
    echo "Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
