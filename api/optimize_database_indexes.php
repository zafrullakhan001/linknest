<?php
/**
 * Database Index Optimization Script
 * 
 * This script adds indexes to improve query performance for large datasets.
 * Run this script once to optimize the database for better performance.
 * 
 * Usage: php optimize_database_indexes.php
 * Or access via browser: http://your-domain/api/optimize_database_indexes.php
 */

require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

try {
    $db = getDB();
    $results = [];
    $errors = [];
    
    // Start transaction
    $db->beginTransaction();
    
    // Indexes for tiles table
    $tileIndexes = [
        'idx_tiles_position' => 'CREATE INDEX IF NOT EXISTS idx_tiles_position ON tiles(position)',
        'idx_tiles_deleted_archived' => 'CREATE INDEX IF NOT EXISTS idx_tiles_deleted_archived ON tiles(deleted_at, archived_at)',
        'idx_tiles_user_id' => 'CREATE INDEX IF NOT EXISTS idx_tiles_user_id ON tiles(user_id)',
        'idx_tiles_visibility' => 'CREATE INDEX IF NOT EXISTS idx_tiles_visibility ON tiles(visibility)',
        'idx_tiles_group' => 'CREATE INDEX IF NOT EXISTS idx_tiles_group ON tiles("group")',
    ];
    
    foreach ($tileIndexes as $name => $sql) {
        try {
            $db->exec($sql);
            $results[] = "Created index: $name";
        } catch (PDOException $e) {
            $errors[] = "Error creating index $name: " . $e->getMessage();
        }
    }
    
    // Indexes for tabs table
    $tabIndexes = [
        'idx_tabs_tile_id' => 'CREATE INDEX IF NOT EXISTS idx_tabs_tile_id ON tabs(tile_id)',
        'idx_tabs_position' => 'CREATE INDEX IF NOT EXISTS idx_tabs_position ON tabs(tile_id, position)',
    ];
    
    foreach ($tabIndexes as $name => $sql) {
        try {
            $db->exec($sql);
            $results[] = "Created index: $name";
        } catch (PDOException $e) {
            $errors[] = "Error creating index $name: " . $e->getMessage();
        }
    }
    
    // Indexes for sections table
    $sectionIndexes = [
        'idx_sections_tab_id' => 'CREATE INDEX IF NOT EXISTS idx_sections_tab_id ON sections(tab_id)',
        'idx_sections_tile_id' => 'CREATE INDEX IF NOT EXISTS idx_sections_tile_id ON sections(tile_id)',
        'idx_sections_position' => 'CREATE INDEX IF NOT EXISTS idx_sections_position ON sections(tab_id, position)',
    ];
    
    foreach ($sectionIndexes as $name => $sql) {
        try {
            $db->exec($sql);
            $results[] = "Created index: $name";
        } catch (PDOException $e) {
            $errors[] = "Error creating index $name: " . $e->getMessage();
        }
    }
    
    // Indexes for links table
    $linkIndexes = [
        'idx_links_section_id' => 'CREATE INDEX IF NOT EXISTS idx_links_section_id ON links(section_id)',
        'idx_links_position' => 'CREATE INDEX IF NOT EXISTS idx_links_position ON links(section_id, position)',
        'idx_links_visibility' => 'CREATE INDEX IF NOT EXISTS idx_links_visibility ON links(visibility)',
    ];
    
    foreach ($linkIndexes as $name => $sql) {
        try {
            $db->exec($sql);
            $results[] = "Created index: $name";
        } catch (PDOException $e) {
            $errors[] = "Error creating index $name: " . $e->getMessage();
        }
    }
    
    // Indexes for favorites tables
    $favoriteIndexes = [
        'idx_user_tile_favorites' => 'CREATE INDEX IF NOT EXISTS idx_user_tile_favorites ON user_tile_favorites(user_id, tile_id)',
        'idx_user_link_favorites' => 'CREATE INDEX IF NOT EXISTS idx_user_link_favorites ON user_link_favorites(user_id, link_id)',
    ];
    
    foreach ($favoriteIndexes as $name => $sql) {
        try {
            $db->exec($sql);
            $results[] = "Created index: $name";
        } catch (PDOException $e) {
            $errors[] = "Error creating index $name: " . $e->getMessage();
        }
    }
    
    // Indexes for permissions table
    $permissionIndexes = [
        'idx_user_tile_permissions' => 'CREATE INDEX IF NOT EXISTS idx_user_tile_permissions ON user_tile_permissions(user_id, tile_id)',
    ];
    
    foreach ($permissionIndexes as $name => $sql) {
        try {
            $db->exec($sql);
            $results[] = "Created index: $name";
        } catch (PDOException $e) {
            $errors[] = "Error creating index $name: " . $e->getMessage();
        }
    }
    
    // Indexes for rich_text_content table
    $richTextIndexes = [
        'idx_rich_text_section_id' => 'CREATE INDEX IF NOT EXISTS idx_rich_text_section_id ON rich_text_content(section_id)',
        'idx_rich_text_position' => 'CREATE INDEX IF NOT EXISTS idx_rich_text_position ON rich_text_content(section_id, position)',
    ];
    
    foreach ($richTextIndexes as $name => $sql) {
        try {
            $db->exec($sql);
            $results[] = "Created index: $name";
        } catch (PDOException $e) {
            $errors[] = "Error creating index $name: " . $e->getMessage();
        }
    }
    
    // Commit transaction
    $db->commit();
    
    // Analyze tables to update statistics
    try {
        $db->exec('ANALYZE tiles');
        $db->exec('ANALYZE tabs');
        $db->exec('ANALYZE sections');
        $db->exec('ANALYZE links');
        $results[] = "Analyzed tables for query optimization";
    } catch (PDOException $e) {
        $errors[] = "Error analyzing tables: " . $e->getMessage();
    }
    
    echo json_encode([
        'success' => true,
        'message' => 'Database indexes optimized successfully',
        'indexes_created' => count($results),
        'results' => $results,
        'errors' => $errors
    ], JSON_PRETTY_PRINT);
    
} catch (Exception $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ], JSON_PRETTY_PRINT);
}
