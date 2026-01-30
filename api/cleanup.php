<?php
/**
 * Cleanup API Endpoint
 * 
 * Provides API access to database cleanup operations for orphaned records.
 */

require_once 'config.php';

// Validate authentication
session_start();
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Not authenticated']);
    exit;
}

// Check if user is admin
$db = getDB();
$stmt = $db->prepare('SELECT is_admin FROM users WHERE id = ?');
$stmt->execute([$_SESSION['user_id']]);
$user = $stmt->fetch();

if (!$user || !$user['is_admin']) {
    http_response_code(403);
    echo json_encode(['error' => 'Admin access required']);
    exit;
}

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';

/**
 * Check for orphaned records without deleting them.
 *
 * SAFETY: "Orphaned" means the record references a tile/section that DOES NOT EXIST in the database.
 * We only count sections/tabs whose tile_id is NOT IN (SELECT id FROM tiles).
 * Tiles that exist but have no owner (user_id NULL) are NEVER treated as orphans - their sections/tabs
 * are never removed. This script NEVER deletes from the tiles table.
 */
function checkOrphanedRecords($db) {
    $results = [
        'success' => true,
        'orphaned_found' => 0,
        'details' => [],
        'errors' => [],
        'missing_tile_ids_sample' => [], // tile_ids that are referenced but don't exist (for verification)
        'tiles_table_count' => 0,
    ];
    
    try {
        $results['tiles_table_count'] = (int) $db->query('SELECT COUNT(*) FROM tiles')->fetchColumn();

        // 1. Check orphaned tile permissions (permissions where tile_id does not exist in tiles table)
        $orphanedPermissions = $db->query("
            SELECT COUNT(*) as count
            FROM user_tile_permissions utp
            LEFT JOIN tiles t ON utp.tile_id = t.id
            WHERE t.id IS NULL
        ")->fetch()['count'];
        
        if ($orphanedPermissions > 0) {
            $results['details'][] = [
                'type' => 'tile_permissions',
                'label' => 'Tile Permissions',
                'count' => $orphanedPermissions,
                'description' => 'Permission records for tiles that no longer exist in the database'
            ];
            $results['orphaned_found'] += $orphanedPermissions;
        }
        
        // 2. Check orphaned sections (sections whose tile_id is NOT in tiles table - tile was deleted or never existed)
        $orphanedSections = $db->query("
            SELECT COUNT(*) as count
            FROM sections s
            LEFT JOIN tiles t ON s.tile_id = t.id
            WHERE t.id IS NULL
        ")->fetch()['count'];
        
        if ($orphanedSections > 0) {
            $missingFromSections = $db->query("
                SELECT DISTINCT s.tile_id
                FROM sections s
                WHERE s.tile_id NOT IN (SELECT id FROM tiles)
                LIMIT 20
            ")->fetchAll(PDO::FETCH_COLUMN);
            foreach ($missingFromSections as $tid) {
                if (!in_array($tid, $results['missing_tile_ids_sample'], true)) {
                    $results['missing_tile_ids_sample'][] = $tid;
                }
            }
            $results['details'][] = [
                'type' => 'sections',
                'label' => 'Sections',
                'count' => $orphanedSections,
                'description' => 'Sections whose tile_id does not exist in the tiles table (real orphans only)'
            ];
            $results['orphaned_found'] += $orphanedSections;
        }
        
        // 3. Check orphaned links (links whose section_id is NOT in sections table)
        $orphanedLinks = $db->query("
            SELECT COUNT(*) as count
            FROM links l
            LEFT JOIN sections s ON l.section_id = s.id
            WHERE s.id IS NULL
        ")->fetch()['count'];
        
        if ($orphanedLinks > 0) {
            $results['details'][] = [
                'type' => 'links',
                'label' => 'Links',
                'count' => $orphanedLinks,
                'description' => 'Links whose section no longer exists in the database'
            ];
            $results['orphaned_found'] += $orphanedLinks;
        }
        
        // 4. Check orphaned tabs (tabs whose tile_id is NOT in tiles table)
        $orphanedTabs = $db->query("
            SELECT COUNT(*) as count
            FROM tabs t
            LEFT JOIN tiles ti ON t.tile_id = ti.id
            WHERE ti.id IS NULL
        ")->fetch()['count'];
        
        if ($orphanedTabs > 0) {
            $missingFromTabs = $db->query("
                SELECT DISTINCT t.tile_id
                FROM tabs t
                WHERE t.tile_id NOT IN (SELECT id FROM tiles)
                LIMIT 20
            ")->fetchAll(PDO::FETCH_COLUMN);
            foreach ($missingFromTabs as $tid) {
                if (!in_array($tid, $results['missing_tile_ids_sample'], true)) {
                    $results['missing_tile_ids_sample'][] = $tid;
                }
            }
            $results['details'][] = [
                'type' => 'tabs',
                'label' => 'Tabs',
                'count' => $orphanedTabs,
                'description' => 'Tabs whose tile_id does not exist in the tiles table (real orphans only)'
            ];
            $results['orphaned_found'] += $orphanedTabs;
        }
        
        $results['missing_tile_ids_sample'] = array_slice(array_unique($results['missing_tile_ids_sample']), 0, 30);
        
        // 5. Check for duplicate permissions
        $duplicatePerms = $db->query("
            SELECT COUNT(*) as count
            FROM (
                SELECT user_id, tile_id, COUNT(*) as cnt
                FROM user_tile_permissions
                GROUP BY user_id, tile_id
                HAVING cnt > 1
            )
        ")->fetch()['count'];
        
        if ($duplicatePerms > 0) {
            $results['details'][] = [
                'type' => 'duplicate_permissions',
                'label' => 'Duplicate Permissions',
                'count' => $duplicatePerms,
                'description' => 'Multiple permission records for same user-tile pairs'
            ];
            $results['orphaned_found'] += $duplicatePerms;
        }
        
    } catch (Exception $e) {
        $results['success'] = false;
        $results['errors'][] = $e->getMessage();
    }
    
    return $results;
}

/**
 * Clean up all orphaned records.
 *
 * SAFETY: This function NEVER deletes from the tiles table. It only deletes:
 * - user_tile_permissions where tile_id NOT IN (SELECT id FROM tiles)
 * - sections where tile_id NOT IN (SELECT id FROM tiles)
 * - links where section_id NOT IN (SELECT id FROM sections)
 * - tabs where tile_id NOT IN (SELECT id FROM tiles)
 * Tiles that exist (including those with user_id NULL / no owner) are never touched.
 */
function cleanupOrphanedRecords($db) {
    $results = [
        'success' => false,
        'cleaned' => [],
        'total_cleaned' => 0,
        'errors' => []
    ];
    
    try {
        $db->beginTransaction();
        
        // 1. Clean orphaned tile permissions (tile_id does not exist in tiles table)
        $orphanedPermissions = $db->query("
            SELECT COUNT(*) as count
            FROM user_tile_permissions utp
            LEFT JOIN tiles t ON utp.tile_id = t.id
            WHERE t.id IS NULL
        ")->fetch()['count'];
        
        if ($orphanedPermissions > 0) {
            $db->exec("DELETE FROM user_tile_permissions WHERE tile_id NOT IN (SELECT id FROM tiles)");
            $results['cleaned']['tile_permissions'] = $orphanedPermissions;
            $results['total_cleaned'] += $orphanedPermissions;
        }
        
        // 2. Clean orphaned sections
        $orphanedSections = $db->query("
            SELECT COUNT(*) as count
            FROM sections s
            LEFT JOIN tiles t ON s.tile_id = t.id
            WHERE t.id IS NULL
        ")->fetch()['count'];
        
        if ($orphanedSections > 0) {
            $db->exec("DELETE FROM sections WHERE tile_id NOT IN (SELECT id FROM tiles)");
            $results['cleaned']['sections'] = $orphanedSections;
            $results['total_cleaned'] += $orphanedSections;
        }
        
        // 3. Clean orphaned links
        $orphanedLinks = $db->query("
            SELECT COUNT(*) as count
            FROM links l
            LEFT JOIN sections s ON l.section_id = s.id
            WHERE s.id IS NULL
        ")->fetch()['count'];
        
        if ($orphanedLinks > 0) {
            $db->exec("DELETE FROM links WHERE section_id NOT IN (SELECT id FROM sections)");
            $results['cleaned']['links'] = $orphanedLinks;
            $results['total_cleaned'] += $orphanedLinks;
        }
        
        // 4. Clean orphaned tabs
        $orphanedTabs = $db->query("
            SELECT COUNT(*) as count
            FROM tabs t
            LEFT JOIN tiles ti ON t.tile_id = ti.id
            WHERE ti.id IS NULL
        ")->fetch()['count'];
        
        if ($orphanedTabs > 0) {
            $db->exec("DELETE FROM tabs WHERE tile_id NOT IN (SELECT id FROM tiles)");
            $results['cleaned']['tabs'] = $orphanedTabs;
            $results['total_cleaned'] += $orphanedTabs;
        }
        
        // 5. Clean duplicate permissions
        $duplicatePerms = $db->query("
            SELECT user_id, tile_id, COUNT(*) as count
            FROM user_tile_permissions
            GROUP BY user_id, tile_id
            HAVING COUNT(*) > 1
        ")->fetchAll();
        
        if (count($duplicatePerms) > 0) {
            $dupCount = 0;
            foreach ($duplicatePerms as $dup) {
                // Keep only the most recent (highest rowid) for each user-tile pair
                $db->prepare("
                    DELETE FROM user_tile_permissions
                    WHERE rowid NOT IN (
                        SELECT MAX(rowid)
                        FROM user_tile_permissions
                        WHERE user_id = ? AND tile_id = ?
                    )
                    AND user_id = ?
                    AND tile_id = ?
                ")->execute([$dup['user_id'], $dup['tile_id'], $dup['user_id'], $dup['tile_id']]);
                $dupCount++;
            }
            $results['cleaned']['duplicate_permissions'] = $dupCount;
            $results['total_cleaned'] += $dupCount;
        }
        
        $db->commit();
        $results['success'] = true;
        
    } catch (Exception $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        $results['success'] = false;
        $results['errors'][] = $e->getMessage();
    }
    
    return $results;
}

// Handle different actions
switch ($action) {
    case 'check':
        $results = checkOrphanedRecords($db);
        echo json_encode($results);
        break;
        
    case 'cleanup':
        $results = cleanupOrphanedRecords($db);
        echo json_encode($results);
        break;
        
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action. Use ?action=check or ?action=cleanup']);
        break;
}
