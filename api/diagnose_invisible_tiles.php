<?php
/**
 * Diagnose Invisible Tiles
 * 
 * Identifies tiles that exist in database but don't show up for users
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

$action = $_GET['action'] ?? 'diagnose';

/**
 * Find tiles that are "invisible" - exist in DB but user can't see
 */
function diagnoseInvisibleTiles($db) {
    $results = [
        'success' => true,
        'total_tiles' => 0,
        'invisible_tiles' => [],
        'issues_found' => [],
        'errors' => []
    ];
    
    try {
        // Get all tiles
        $allTiles = $db->query("SELECT id, title, emoji, `group`, user_id, created_at FROM tiles ORDER BY created_at DESC")->fetchAll(PDO::FETCH_ASSOC);
        $results['total_tiles'] = count($allTiles);
        
        foreach ($allTiles as $tile) {
            $issues = [];
            $tileId = $tile['id'];
            
            // Check 1: Does tile have any content (sections/links)?
            $sectionsCount = $db->prepare("SELECT COUNT(*) as count FROM sections WHERE tile_id = ?");
            $sectionsCount->execute([$tileId]);
            $sections = $sectionsCount->fetch()['count'];
            
            $linksCount = $db->prepare("SELECT COUNT(*) as count FROM links WHERE section_id IN (SELECT id FROM sections WHERE tile_id = ?)");
            $linksCount->execute([$tileId]);
            $links = $linksCount->fetch()['count'];
            
            // Check 2: Does tile have owner user?
            $ownerExists = false;
            $ownerUsername = null;
            if ($tile['user_id']) {
                $ownerStmt = $db->prepare("SELECT username FROM users WHERE id = ?");
                $ownerStmt->execute([$tile['user_id']]);
                $owner = $ownerStmt->fetch();
                if ($owner) {
                    $ownerExists = true;
                    $ownerUsername = $owner['username'];
                } else {
                    $issues[] = "Owner user_id={$tile['user_id']} doesn't exist";
                }
            } else {
                $issues[] = "No owner (user_id is NULL)";
            }
            
            // Check 3: Does tile have arrangement (is it placed in user's view)?
            $hasArrangement = false;
            if ($tile['user_id']) {
                // Check tile_arrangements table
                $arrangementStmt = $db->prepare("
                    SELECT position 
                    FROM tile_arrangements 
                    WHERE tile_id = ? AND (user_id = ? OR user_id = 0)
                ");
                $arrangementStmt->execute([$tileId, $tile['user_id']]);
                $arrangement = $arrangementStmt->fetch();
                
                if ($arrangement) {
                    $hasArrangement = true;
                }
                
                if (!$hasArrangement) {
                    $issues[] = "Not in tile arrangement (invisible in UI)";
                }
            }
            
            // Check 4: Tile permissions
            $permissionsCount = $db->prepare("SELECT COUNT(*) as count FROM user_tile_permissions WHERE tile_id = ?");
            $permissionsCount->execute([$tileId]);
            $permissions = $permissionsCount->fetch()['count'];
            
            // Identify invisible tiles (tiles with issues)
            if (!empty($issues)) {
                // CRITICAL: Mark public tiles (user_id = 0) so they're not deleted
                $isPublicTile = ($tile['user_id'] == 0 || $tile['user_id'] === null);
                $publicCategories = ['public', 'shared', 'global', 'common'];
                $isInPublicCategory = ($tile['group'] && in_array(strtolower($tile['group']), $publicCategories));
                
                // Only report tiles that are safe to delete (not public)
                if (!$isPublicTile && !$isInPublicCategory) {
                    $results['invisible_tiles'][] = [
                        'id' => $tileId,
                        'title' => $tile['title'],
                        'emoji' => $tile['emoji'],
                        'group' => $tile['group'],
                        'user_id' => $tile['user_id'],
                        'owner_username' => $ownerUsername,
                        'created_at' => $tile['created_at'],
                        'sections_count' => $sections,
                        'links_count' => $links,
                        'permissions_count' => $permissions,
                        'has_arrangement' => $hasArrangement,
                        'owner_exists' => $ownerExists,
                        'issues' => $issues,
                        'is_public' => $isPublicTile,
                        'is_in_public_category' => $isInPublicCategory
                    ];
                    
                    foreach ($issues as $issue) {
                        if (!in_array($issue, $results['issues_found'])) {
                            $results['issues_found'][] = $issue;
                        }
                    }
                }
            }
        }
        
    } catch (Exception $e) {
        $results['success'] = false;
        $results['errors'][] = $e->getMessage();
    }
    
    return $results;
}

/**
 * Remove invisible tiles that meet certain criteria
 */
function removeInvisibleTiles($db, $criteria = 'no_arrangement') {
    $results = [
        'success' => false,
        'deleted' => 0,
        'deleted_tiles' => [],
        'errors' => []
    ];
    
    try {
        $db->beginTransaction();
        
        // First diagnose
        $diagnosis = diagnoseInvisibleTiles($db);
        
        if (!$diagnosis['success']) {
            throw new Exception("Failed to diagnose: " . implode(', ', $diagnosis['errors']));
        }
        
        foreach ($diagnosis['invisible_tiles'] as $tile) {
            $shouldDelete = false;
            
            // CRITICAL: NEVER delete tiles with user_id = 0 (public/global tiles)
            if ($tile['user_id'] == 0 || $tile['user_id'] === null) {
                // Skip public tiles entirely
                continue;
            }
            
            // Check if tile is in a public/shared category
            $publicCategories = ['public', 'shared', 'global', 'common'];
            if ($tile['group'] && in_array(strtolower($tile['group']), $publicCategories)) {
                // Skip tiles in public categories
                continue;
            }
            
            // Determine if tile should be deleted based on criteria
            if ($criteria === 'no_arrangement') {
                // Delete tiles that are not in any user's arrangement
                $shouldDelete = !$tile['has_arrangement'];
            } elseif ($criteria === 'no_arrangement_and_no_links') {
                // Delete tiles that have no arrangement AND no links (truly orphaned)
                $shouldDelete = !$tile['has_arrangement'] && $tile['links_count'] == 0;
            } elseif ($criteria === 'no_owner') {
                // Delete tiles with no valid owner
                $shouldDelete = !$tile['owner_exists'];
            } elseif ($criteria === 'all_invisible') {
                // Delete ALL invisible tiles (except public ones which we already skipped)
                $shouldDelete = true;
            }
            
            if ($shouldDelete) {
                // Delete tile and related data
                $db->prepare('DELETE FROM user_tile_permissions WHERE tile_id = ?')->execute([$tile['id']]);
                $db->prepare('DELETE FROM links WHERE section_id IN (SELECT id FROM sections WHERE tile_id = ?)')->execute([$tile['id']]);
                $db->prepare('DELETE FROM sections WHERE tile_id = ?')->execute([$tile['id']]);
                $db->prepare('DELETE FROM tabs WHERE tile_id = ?')->execute([$tile['id']]);
                $db->prepare('DELETE FROM tiles WHERE id = ?')->execute([$tile['id']]);
                
                $results['deleted']++;
                $results['deleted_tiles'][] = [
                    'id' => $tile['id'],
                    'title' => $tile['title'],
                    'owner' => $tile['owner_username'],
                    'links' => $tile['links_count'],
                    'reason' => implode(', ', $tile['issues'])
                ];
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

// Handle actions
switch ($action) {
    case 'diagnose':
        $results = diagnoseInvisibleTiles($db);
        echo json_encode($results);
        break;
        
    case 'remove_no_arrangement':
        // Remove tiles not in any user's arrangement
        $results = removeInvisibleTiles($db, 'no_arrangement');
        echo json_encode($results);
        break;
        
    case 'remove_safe':
        // Remove tiles that have no arrangement AND no links (safest option)
        $results = removeInvisibleTiles($db, 'no_arrangement_and_no_links');
        echo json_encode($results);
        break;
        
    case 'remove_all':
        // Remove ALL invisible tiles (including those with content)
        $results = removeInvisibleTiles($db, 'all_invisible');
        echo json_encode($results);
        break;
        
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action']);
        break;
}
