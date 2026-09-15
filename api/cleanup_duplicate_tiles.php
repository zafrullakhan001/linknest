<?php
/**
 * Cleanup Duplicate Tiles
 * 
 * Identifies and removes duplicate tiles based on various criteria
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
 * Find duplicate tiles based on various criteria
 */
function findDuplicateTiles($db) {
    $results = [
        'success' => true,
        'duplicates_found' => 0,
        'duplicate_groups' => [],
        'errors' => []
    ];
    
    try {
        // Find tiles with same title and group (category)
        $query = "
            SELECT 
                title,
                `group`,
                COUNT(*) as tile_count,
                GROUP_CONCAT(id) as tile_ids,
                GROUP_CONCAT(user_id) as user_ids,
                GROUP_CONCAT(
                    CASE 
                        WHEN (SELECT COUNT(*) FROM links WHERE section_id IN (SELECT id FROM sections WHERE tile_id = tiles.id)) > 0 
                        THEN 'has_content' 
                        ELSE 'empty' 
                    END
                ) as content_status
            FROM tiles
            GROUP BY title, `group`
            HAVING COUNT(*) > 1
        ";
        
        $duplicates = $db->query($query)->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($duplicates as $dup) {
            $tileIds = explode(',', $dup['tile_ids']);
            $userIds = explode(',', $dup['user_ids']);
            $contentStatuses = explode(',', $dup['content_status']);
            
            $tiles = [];
            foreach ($tileIds as $idx => $tileId) {
                // Get detailed info for each tile
                $tileInfo = $db->prepare("
                    SELECT 
                        id,
                        title,
                        emoji,
                        `group`,
                        user_id,
                        created_at,
                        (SELECT COUNT(*) FROM sections WHERE tile_id = tiles.id) as section_count,
                        (SELECT COUNT(*) FROM links WHERE section_id IN (SELECT id FROM sections WHERE tile_id = tiles.id)) as link_count,
                        (SELECT COUNT(*) FROM user_tile_permissions WHERE tile_id = tiles.id) as permission_count
                    FROM tiles
                    WHERE id = ?
                ");
                $tileInfo->execute([$tileId]);
                $tile = $tileInfo->fetch(PDO::FETCH_ASSOC);
                
                if ($tile) {
                    $tile['has_content'] = ($tile['link_count'] > 0);
                    $tile['owner_username'] = 'Unknown';
                    
                    // Get owner username
                    if ($tile['user_id']) {
                        $ownerStmt = $db->prepare("SELECT username FROM users WHERE id = ?");
                        $ownerStmt->execute([$tile['user_id']]);
                        $owner = $ownerStmt->fetch();
                        if ($owner) {
                            $tile['owner_username'] = $owner['username'];
                        }
                    }
                    
                    $tiles[] = $tile;
                }
            }
            
            $results['duplicate_groups'][] = [
                'title' => $dup['title'],
                'group' => $dup['group'],
                'count' => (int)$dup['tile_count'],
                'tiles' => $tiles
            ];
            
            $results['duplicates_found'] += (int)$dup['tile_count'] - 1; // -1 because we keep one
        }
        
    } catch (Exception $e) {
        $results['success'] = false;
        $results['errors'][] = $e->getMessage();
    }
    
    return $results;
}

/**
 * Delete specific tiles by ID
 */
function deleteTiles($db, $tileIds) {
    $results = [
        'success' => false,
        'deleted' => 0,
        'errors' => []
    ];
    
    try {
        $db->beginTransaction();
        
        foreach ($tileIds as $tileId) {
            // Delete in correct order to respect dependencies
            $db->prepare('DELETE FROM user_tile_permissions WHERE tile_id = ?')->execute([$tileId]);
            $db->prepare('DELETE FROM links WHERE section_id IN (SELECT id FROM sections WHERE tile_id = ?)')->execute([$tileId]);
            $db->prepare('DELETE FROM sections WHERE tile_id = ?')->execute([$tileId]);
            $db->prepare('DELETE FROM tabs WHERE tile_id = ?')->execute([$tileId]);
            $db->prepare('DELETE FROM tiles WHERE id = ?')->execute([$tileId]);
            
            $results['deleted']++;
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

/**
 * Smart cleanup - automatically remove duplicate tiles
 * Mode 1 (conservative): Only remove empty duplicates
 * Mode 2 (aggressive): Keep only one, remove all other duplicates even if they have content
 */
function smartCleanupDuplicates($db, $mode = 'conservative') {
    $results = [
        'success' => false,
        'deleted' => 0,
        'kept' => 0,
        'details' => [],
        'skipped' => [],
        'errors' => []
    ];
    
    try {
        $db->beginTransaction();
        
        // Find duplicate groups
        $findResult = findDuplicateTiles($db);
        
        if (!$findResult['success']) {
            throw new Exception("Failed to find duplicates: " . implode(', ', $findResult['errors']));
        }
        
        foreach ($findResult['duplicate_groups'] as $group) {
            $tiles = $group['tiles'];
            
            // Sort tiles: prefer tiles with content, then by link count, then by creation date
            usort($tiles, function($a, $b) {
                // First priority: tiles with links
                if ($a['link_count'] != $b['link_count']) {
                    return $b['link_count'] - $a['link_count'];
                }
                // Second priority: tiles with sections
                if ($a['section_count'] != $b['section_count']) {
                    return $b['section_count'] - $a['section_count'];
                }
                // Third priority: older tiles (earlier created_at)
                return strcmp($a['created_at'], $b['created_at']);
            });
            
            // Keep the first one (has most content or oldest)
            $keepTile = array_shift($tiles);
            $results['kept']++;
            
            // Delete the rest based on mode
            $deletedIds = [];
            $skippedIds = [];
            
            foreach ($tiles as $tile) {
                $shouldDelete = false;
                
                if ($mode === 'aggressive') {
                    // Aggressive mode: delete all duplicates except the one we kept
                    $shouldDelete = true;
                } else {
                    // Conservative mode: only delete empty tiles
                    $shouldDelete = ($tile['link_count'] == 0);
                    
                    // Track tiles with content that were skipped
                    if ($tile['link_count'] > 0) {
                        $skippedIds[] = [
                            'id' => $tile['id'],
                            'links' => $tile['link_count'],
                            'owner' => $tile['owner_username']
                        ];
                    }
                }
                
                if ($shouldDelete) {
                    $db->prepare('DELETE FROM user_tile_permissions WHERE tile_id = ?')->execute([$tile['id']]);
                    $db->prepare('DELETE FROM links WHERE section_id IN (SELECT id FROM sections WHERE tile_id = ?)')->execute([$tile['id']]);
                    $db->prepare('DELETE FROM sections WHERE tile_id = ?')->execute([$tile['id']]);
                    $db->prepare('DELETE FROM tabs WHERE tile_id = ?')->execute([$tile['id']]);
                    $db->prepare('DELETE FROM tiles WHERE id = ?')->execute([$tile['id']]);
                    
                    $deletedIds[] = $tile['id'];
                    $results['deleted']++;
                }
            }
            
            if (!empty($deletedIds) || !empty($skippedIds)) {
                $detail = [
                    'title' => $group['title'],
                    'group' => $group['group'],
                    'kept_id' => $keepTile['id'],
                    'kept_owner' => $keepTile['owner_username'],
                    'kept_links' => $keepTile['link_count'],
                    'deleted_count' => count($deletedIds)
                ];
                
                if (!empty($deletedIds)) {
                    $detail['deleted_ids'] = $deletedIds;
                }
                
                if (!empty($skippedIds)) {
                    $detail['skipped'] = $skippedIds;
                }
                
                if (!empty($skippedIds)) {
                    $results['skipped'][] = $detail;
                } else {
                    $results['details'][] = $detail;
                }
            }
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
    case 'find':
        $results = findDuplicateTiles($db);
        echo json_encode($results);
        break;
        
    case 'delete':
        // Expect tile IDs in POST body
        $input = json_decode(file_get_contents('php://input'), true);
        $tileIds = $input['tile_ids'] ?? [];
        
        if (empty($tileIds)) {
            http_response_code(400);
            echo json_encode(['error' => 'No tile IDs provided']);
            exit;
        }
        
        $results = deleteTiles($db, $tileIds);
        echo json_encode($results);
        break;
        
    case 'smart_cleanup':
        // Conservative mode: only remove empty duplicates
        $results = smartCleanupDuplicates($db, 'conservative');
        echo json_encode($results);
        break;
        
    case 'aggressive_cleanup':
        // Aggressive mode: remove ALL duplicates, keep only one (even if they have content)
        $results = smartCleanupDuplicates($db, 'aggressive');
        echo json_encode($results);
        break;
        
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action. Use ?action=find, ?action=delete, ?action=smart_cleanup, or ?action=aggressive_cleanup']);
        break;
}
