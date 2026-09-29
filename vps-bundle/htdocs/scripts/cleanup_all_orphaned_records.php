<?php
/**
 * Comprehensive Database Cleanup Script
 * 
 * This script removes ALL orphaned records from the database:
 * - Tile permissions for deleted tiles
 * - Links for deleted tiles
 * - Sections for deleted tiles
 * - Tabs for deleted tiles
 * - Notes for deleted links
 * - Any other orphaned references
 * 
 * Usage: php cleanup_all_orphaned_records.php [--dry-run]
 */

require_once __DIR__ . '/../api/config.php';

header('Content-Type: text/plain; charset=utf-8');

// Check for dry-run mode
$dryRun = in_array('--dry-run', $argv ?? []) || isset($_GET['dry-run']);

function cleanupAllOrphanedRecords($db, $dryRun = false) {
    $results = [
        'success' => false,
        'dry_run' => $dryRun,
        'cleaned' => [],
        'errors' => []
    ];
    
    try {
        if (!$dryRun) {
            $db->beginTransaction();
        }
        
        // 1. Clean orphaned tile permissions
        echo "Checking user_tile_permissions...\n";
        $orphanedPermissions = $db->query("
            SELECT COUNT(*) as count
            FROM user_tile_permissions utp
            LEFT JOIN tiles t ON utp.tile_id = t.id
            WHERE t.id IS NULL
        ")->fetch()['count'];
        
        if ($orphanedPermissions > 0) {
            echo "  Found {$orphanedPermissions} orphaned tile permission(s)\n";
            if (!$dryRun) {
                $stmt = $db->exec("
                    DELETE FROM user_tile_permissions
                    WHERE tile_id NOT IN (SELECT id FROM tiles)
                ");
                echo "  ✓ Deleted {$orphanedPermissions} orphaned permission(s)\n";
            }
            $results['cleaned']['tile_permissions'] = $orphanedPermissions;
        } else {
            echo "  ✓ No orphaned permissions found\n";
        }
        
        // 2. Clean orphaned sections first (sections referencing deleted tiles)
        echo "\nChecking sections...\n";
        $orphanedSections = $db->query("
            SELECT COUNT(*) as count
            FROM sections s
            LEFT JOIN tiles t ON s.tile_id = t.id
            WHERE t.id IS NULL
        ")->fetch()['count'];
        
        if ($orphanedSections > 0) {
            echo "  Found {$orphanedSections} orphaned section(s)\n";
            if (!$dryRun) {
                $db->exec("DELETE FROM sections WHERE tile_id NOT IN (SELECT id FROM tiles)");
                echo "  ✓ Deleted {$orphanedSections} orphaned section(s)\n";
            }
            $results['cleaned']['sections'] = $orphanedSections;
        } else {
            echo "  ✓ No orphaned sections found\n";
        }
        
        // 3. Clean orphaned links (links referencing deleted sections)
        echo "\nChecking links...\n";
        $orphanedLinks = $db->query("
            SELECT COUNT(*) as count
            FROM links l
            LEFT JOIN sections s ON l.section_id = s.id
            WHERE s.id IS NULL
        ")->fetch()['count'];
        
        if ($orphanedLinks > 0) {
            echo "  Found {$orphanedLinks} orphaned link(s)\n";
            if (!$dryRun) {
                $db->exec("DELETE FROM links WHERE section_id NOT IN (SELECT id FROM sections)");
                echo "  ✓ Deleted {$orphanedLinks} orphaned link(s)\n";
            }
            $results['cleaned']['links'] = $orphanedLinks;
        } else {
            echo "  ✓ No orphaned links found\n";
        }
        
        // 4. Clean orphaned tabs
        echo "\nChecking tabs...\n";
        $orphanedTabs = $db->query("
            SELECT COUNT(*) as count
            FROM tabs t
            LEFT JOIN tiles ti ON t.tile_id = ti.id
            WHERE ti.id IS NULL
        ")->fetch()['count'];
        
        if ($orphanedTabs > 0) {
            echo "  Found {$orphanedTabs} orphaned tab(s)\n";
            if (!$dryRun) {
                $db->exec("DELETE FROM tabs WHERE tile_id NOT IN (SELECT id FROM tiles)");
                echo "  ✓ Deleted {$orphanedTabs} orphaned tab(s)\n";
            }
            $results['cleaned']['tabs'] = $orphanedTabs;
        } else {
            echo "  ✓ No orphaned tabs found\n";
        }
        
        // 5. Clean duplicate tile IDs in user_tile_permissions (if any user has multiple permission records for same tile)
        echo "\nChecking for duplicate tile permissions...\n";
        $duplicatePerms = $db->query("
            SELECT user_id, tile_id, COUNT(*) as count
            FROM user_tile_permissions
            GROUP BY user_id, tile_id
            HAVING COUNT(*) > 1
        ")->fetchAll();
        
        if (count($duplicatePerms) > 0) {
            $dupCount = count($duplicatePerms);
            echo "  Found {$dupCount} duplicate permission set(s)\n";
            if (!$dryRun) {
                // Keep only the most recent permission record for each user-tile pair
                foreach ($duplicatePerms as $dup) {
                    $db->exec("
                        DELETE FROM user_tile_permissions
                        WHERE rowid NOT IN (
                            SELECT MAX(rowid)
                            FROM user_tile_permissions
                            WHERE user_id = {$dup['user_id']} AND tile_id = '{$dup['tile_id']}'
                        )
                        AND user_id = {$dup['user_id']}
                        AND tile_id = '{$dup['tile_id']}'
                    ");
                }
                echo "  ✓ Removed {$dupCount} duplicate permission set(s)\n";
            }
            $results['cleaned']['duplicate_permissions'] = $dupCount;
        } else {
            echo "  ✓ No duplicate permissions found\n";
        }
        
        // Commit or rollback
        if (!$dryRun) {
            $db->commit();
        }
        
        $results['success'] = true;
        $totalCleaned = array_sum($results['cleaned']);
        
        if ($dryRun) {
            $results['message'] = "DRY RUN: Would clean {$totalCleaned} orphaned record(s)";
        } else {
            $results['message'] = "Successfully cleaned {$totalCleaned} orphaned record(s)";
        }
        
    } catch (Exception $e) {
        if (!$dryRun && $db->inTransaction()) {
            $db->rollBack();
        }
        $results['errors'][] = "Error during cleanup: " . $e->getMessage();
        $results['message'] = "Cleanup failed: " . $e->getMessage();
    }
    
    return $results;
}

// Main execution
try {
    $db = getDB();
    
    if (!$db) {
        throw new Exception("Failed to connect to database");
    }
    
    echo "==============================================\n";
    echo "  COMPREHENSIVE DATABASE CLEANUP\n";
    echo "==============================================\n";
    if ($dryRun) {
        echo "  MODE: DRY RUN (no changes will be made)\n";
    } else {
        echo "  MODE: LIVE (changes will be committed)\n";
    }
    echo "==============================================\n\n";
    
    $results = cleanupAllOrphanedRecords($db, $dryRun);
    
    // Display summary
    echo "\n==============================================\n";
    if ($results['success']) {
        echo "✓ CLEANUP COMPLETE\n";
        echo "==============================================\n\n";
        echo $results['message'] . "\n\n";
        
        if (!empty($results['cleaned'])) {
            echo "Summary:\n";
            foreach ($results['cleaned'] as $table => $count) {
                echo "  • " . ucwords(str_replace('_', ' ', $table)) . ": {$count}\n";
            }
        } else {
            echo "No orphaned records found - database is clean!\n";
        }
    } else {
        echo "✗ CLEANUP FAILED\n";
        echo "==============================================\n\n";
        if (!empty($results['errors'])) {
            echo "Errors:\n";
            foreach ($results['errors'] as $error) {
                echo "  • $error\n";
            }
        }
    }
    
    echo "\n==============================================\n";
    
    // Return JSON summary
    echo "\nJSON Summary:\n";
    echo json_encode($results, JSON_PRETTY_PRINT);
    echo "\n";
    
} catch (Exception $e) {
    echo "\n✗ FATAL ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
