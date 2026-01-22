<?php
/**
 * Cleanup Orphaned Tile Permissions
 * 
 * This script removes orphaned records from user_tile_permissions table
 * where the referenced tile_id no longer exists in the tiles table.
 * 
 * Usage: Run from command line or browser
 * php cleanup_orphaned_tile_permissions.php
 */

require_once __DIR__ . '/../api/config.php';

header('Content-Type: application/json');

function cleanupOrphanedPermissions($db) {
    $results = [
        'success' => false,
        'orphaned_found' => 0,
        'deleted' => 0,
        'orphaned_tiles' => [],
        'errors' => []
    ];
    
    try {
        // Start transaction
        $db->beginTransaction();
        
        // Find all orphaned tile permissions (tile_id not in tiles table)
        $findOrphansQuery = "
            SELECT DISTINCT 
                utp.tile_id,
                COUNT(*) as permission_count
            FROM user_tile_permissions utp
            LEFT JOIN tiles t ON utp.tile_id = t.id
            WHERE t.id IS NULL
            GROUP BY utp.tile_id
        ";
        
        $orphansStmt = $db->query($findOrphansQuery);
        $orphanedTiles = $orphansStmt->fetchAll(PDO::FETCH_ASSOC);
        
        $results['orphaned_found'] = count($orphanedTiles);
        $results['orphaned_tiles'] = $orphanedTiles;
        
        if (count($orphanedTiles) > 0) {
            // Collect orphaned tile IDs
            $orphanedIds = array_column($orphanedTiles, 'tile_id');
            
            // Delete orphaned permissions
            $placeholders = str_repeat('?,', count($orphanedIds) - 1) . '?';
            $deleteQuery = "DELETE FROM user_tile_permissions WHERE tile_id IN ($placeholders)";
            
            $deleteStmt = $db->prepare($deleteQuery);
            $deleteStmt->execute($orphanedIds);
            $results['deleted'] = $deleteStmt->rowCount();
            
            // Commit transaction
            $db->commit();
            
            $results['success'] = true;
            $results['message'] = "Successfully cleaned up {$results['deleted']} orphaned permission record(s) for {$results['orphaned_found']} deleted tile(s).";
        } else {
            $db->commit();
            $results['success'] = true;
            $results['message'] = "No orphaned tile permissions found. Database is clean!";
        }
        
    } catch (Exception $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        $results['errors'][] = "Error during cleanup: " . $e->getMessage();
    }
    
    return $results;
}

// Main execution
try {
    $db = getDB();
    
    if (!$db) {
        throw new Exception("Failed to connect to database");
    }
    
    echo "Starting orphaned tile permissions cleanup...\n\n";
    
    $results = cleanupOrphanedPermissions($db);
    
    // Display results
    if ($results['success']) {
        echo "✓ SUCCESS\n\n";
        echo $results['message'] . "\n\n";
        
        if ($results['orphaned_found'] > 0) {
            echo "Details:\n";
            echo "- Orphaned tiles found: {$results['orphaned_found']}\n";
            echo "- Permission records deleted: {$results['deleted']}\n\n";
            
            echo "Orphaned tile IDs:\n";
            foreach ($results['orphaned_tiles'] as $tile) {
                echo "  • Tile ID: {$tile['tile_id']} ({$tile['permission_count']} permission record(s))\n";
            }
        }
    } else {
        echo "✗ FAILED\n\n";
        if (!empty($results['errors'])) {
            echo "Errors:\n";
            foreach ($results['errors'] as $error) {
                echo "  • $error\n";
            }
        }
    }
    
    echo "\n";
    
    // Return JSON for API usage
    echo json_encode($results, JSON_PRETTY_PRINT);
    
} catch (Exception $e) {
    $error = [
        'success' => false,
        'error' => $e->getMessage()
    ];
    echo "✗ FATAL ERROR: " . $e->getMessage() . "\n\n";
    echo json_encode($error, JSON_PRETTY_PRINT);
    exit(1);
}
