<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

// Normalize path - remove trailing slash for consistent matching
$path = rtrim($path, '/');
if (empty($path)) {
    $path = '/';
}

switch ($method) {
    case 'GET':
        if ($path === '' || $path === '/') {
            handleGetTiles();
        } elseif ($path === '/favorites/links' || $path === '/favorites/links/') {
            handleGetFavoriteLinks();
        } elseif ($path === '/favorites') {
            handleGetFavorites();
        } elseif ($path === '/recycle-bin') {
            handleGetRecycleBin();
        } elseif ($path === '/archive' || $path === '/archive/') {
            handleGetArchive();
        } elseif (preg_match('#^/([^/]+)$#', $path, $matches)) {
            handleGetTile($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint', 'path' => $path], 404);
        }
        break;
        
    case 'POST':
        if ($path === '' || $path === '/') {
            handleCreateTile();
        } elseif ($path === '/bulk-import' || $path === '/bulk-import/') {
            handleBulkImport();
        } elseif (preg_match('#^/category/([^/]+)/clone$#', $path, $matches)) {
            handleCloneCategory(rawurldecode($matches[1]));
        } elseif (preg_match('#^/category/([^/]+)/archive$#', $path, $matches)) {
            handleArchiveCategory(urldecode($matches[1]));
        } elseif (preg_match('#^/category/([^/]+)/unarchive$#', $path, $matches)) {
            handleUnarchiveCategory(urldecode($matches[1]));
        } elseif (preg_match('#^/category/([^/]+)/favorite$#', $path, $matches)) {
            handleToggleCategoryFavorite($matches[1]);
        } elseif (preg_match('#^/link/([^/]+)/favorite$#', $path, $matches)) {
            handleToggleLinkFavorite($matches[1]);
        } elseif (preg_match('#^/([^/]+)/favorite$#', $path, $matches)) {
            handleToggleFavorite($matches[1]);
        } elseif (preg_match('#^/([^/]+)/clone$#', $path, $matches)) {
            handleCloneTile($matches[1]);
        } elseif (preg_match('#^/([^/]+)/restore$#', $path, $matches)) {
            handleRestoreTile($matches[1]);
        } elseif (preg_match('#^/([^/]+)/archive$#', $path, $matches)) {
            handleArchiveTile($matches[1]);
        } elseif (preg_match('#^/([^/]+)/unarchive$#', $path, $matches)) {
            handleUnarchiveTile($matches[1]);
        } elseif (preg_match('#^/([^/]+)/update-links-browser$#', $path, $matches)) {
            handleUpdateLinksBrowser($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'PUT':
        if (preg_match('#^/([^/]+)$#', $path, $matches)) {
            handleUpdateTile($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'DELETE':
        if ($path === '/purge-recycle-bin') {
            handlePurgeRecycleBin();
        } elseif ($path === '/purge-archive') {
            handlePurgeArchive();
        } elseif (preg_match('#^/category/([^/]+)/permanent$#', $path, $matches)) {
            handlePermanentDeleteCategory(urldecode($matches[1]));
        } elseif (preg_match('#^/([^/]+)/permanent$#', $path, $matches)) {
            handlePermanentDeleteTile($matches[1]);
        } elseif (preg_match('#^/([^/]+)$#', $path, $matches)) {
            handleDeleteTile($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint', 'path' => $path], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleGetTiles() {
    try {
        $user = getAuthenticatedUser();
        $db = getDB();
    
    // Check if guest access is enabled
    $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'guest_access_enabled'");
    $stmt->execute();
    $guestAccessSetting = $stmt->fetchColumn();
    $guestAccessEnabled = ($guestAccessSetting === null || $guestAccessSetting === '1'); // Default to enabled if not set
    
    // If guest access is disabled and user is not authenticated, require login
    if (!$guestAccessEnabled && !$user) {
        sendJSON(['error' => 'Authentication required. Guest access is disabled.'], 401);
    }
    
    // All users (authenticated and guests) see all tiles - shared public repository
    // Order ONLY by position - no secondary sorting to preserve exact saved order
    // Exclude soft-deleted tiles (deleted_at IS NULL) and archived tiles (archived_at IS NULL)
    $stmt = $db->prepare('SELECT * FROM tiles WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY position ASC');
    $stmt->execute();
    
    $tiles = [];
    $tilesById = [];
    $positions = [];
    $hasDuplicatePositions = false;
    
    while ($row = $stmt->fetch()) {
        // Filter tiles based on visibility
        $tileVisibility = $row['visibility'] ?? 'public';
        $tileAllowedUsers = $row['allowed_users'] ? json_decode($row['allowed_users'], true) : [];
        
        // Check if tile should be visible to current user
        // Admin users can see all tiles regardless of visibility
        $isTileVisible = false;
        if ($user && $user['is_admin']) {
            $isTileVisible = true; // Admins see everything
        } elseif ($tileVisibility === 'public') {
            $isTileVisible = true; // Public tiles visible to everyone
        } elseif ($tileVisibility === 'authenticated' && $user) {
            $isTileVisible = true; // Authenticated tiles visible to logged-in users
        } elseif ($tileVisibility === 'private' && $user) {
            // Private tiles visible only to specific users
            $isTileVisible = in_array($user['id'], $tileAllowedUsers);
        }
        
        if (!$isTileVisible) {
            continue; // Skip this tile
        }
        
        $position = (int)$row['position'];
        
        // Check for duplicate positions
        if (isset($positions[$position])) {
            $hasDuplicatePositions = true;
        }
        $positions[$position] = true;
        
        // Check if this tile is favorited by the current user
        $isFavorite = false;
        if ($user) {
            $favStmt = $db->prepare('SELECT 1 FROM user_tile_favorites WHERE user_id = ? AND tile_id = ?');
            $favStmt->execute([$user['id'], $row['id']]);
            $isFavorite = $favStmt->fetch() !== false;
        }
        
        // Get user tile permissions for the current user
        $canView = true; // Default: everyone can view (unless explicitly denied)
        $canEdit = false; // Default: no edit access (unless explicitly granted)
        $canDelete = false; // Default: no delete access (unless explicitly granted)
        
        if ($user) {
            // Admins have full access to everything
            if ($user['is_admin']) {
                $canView = true;
                $canEdit = true;
                $canDelete = true;
            } else {
                // Check if user is the creator of the tile
                $isCreator = isset($row['user_id']) && (int)$row['user_id'] === (int)$user['id'];
                
                if ($isCreator) {
                    // Creators have full access to their own tiles
                    $canView = true;
                    $canEdit = true;
                    $canDelete = true;
                } else {
                    // Check for explicit permissions
                    $permStmt = $db->prepare('SELECT can_view, can_edit, can_delete FROM user_tile_permissions WHERE user_id = ? AND tile_id = ?');
                    $permStmt->execute([$user['id'], $row['id']]);
                    $permission = $permStmt->fetch();
                    
                    if ($permission) {
                        $canView = (bool)$permission['can_view'];
                        $canEdit = (bool)$permission['can_edit'];
                        $canDelete = (bool)$permission['can_delete'];
                    }
                    // If no permission record exists, use defaults (view only)
                }
            }
        }
        
        // Skip tiles where user doesn't have view permission
        if ($user && !$canView) {
            continue;
        }
        
        $tile = [
            'id' => $row['id'],
            'title' => $row['title'],
            'description' => $row['description'],
            'htmlContent' => $row['html_content'],
            'emoji' => $row['emoji'],
            'themeColor' => $row['theme_color'],
            'group' => $row['group'],
            'createdAt' => (int)$row['created_at'],
            'visibility' => $tileVisibility,
            'allowedUsers' => $tileAllowedUsers,
            'isFavorite' => $isFavorite,
            'isHyperlink' => isset($row['is_hyperlink']) ? (bool)$row['is_hyperlink'] : false,
            'hyperlinkUrl' => $row['hyperlink_url'] ?? null,
            'openInNewTab' => isset($row['open_in_new_tab']) ? (bool)$row['open_in_new_tab'] : null,
            'browser' => isset($row['browser']) ? $row['browser'] : null,
            'canView' => $canView,
            'canEdit' => $canEdit,
            'canDelete' => $canDelete,
            'visibleFrom' => $row['visible_from'] ?? null,
            'expiresAt' => $row['expires_at'] ?? null,
            'tabs' => []
        ];
        
        // Get tabs for this tile
        $tabStmt = $db->prepare('SELECT * FROM tabs WHERE tile_id = ? ORDER BY position ASC');
        $tabStmt->execute([$row['id']]);
        $tabs = [];
        
        while ($tabRow = $tabStmt->fetch()) {
            $tab = [
                'id' => $tabRow['id'],
                'title' => $tabRow['title'],
                'position' => (int)($tabRow['position'] ?? 0),
                'textColor' => (!empty($tabRow['text_color']) && trim($tabRow['text_color']) !== '') ? trim($tabRow['text_color']) : null,
                'visibleFrom' => $tabRow['visible_from'] ?? null,
                'expiresAt' => $tabRow['expires_at'] ?? null,
                'sections' => []
            ];
            
            // Get sections for this tab
            $sectionStmt = $db->prepare('SELECT * FROM sections WHERE tab_id = ? ORDER BY position ASC, id ASC');
            $sectionStmt->execute([$tabRow['id']]);
            
            while ($sectionRow = $sectionStmt->fetch()) {
                $section = [
                    'id' => $sectionRow['id'],
                    'title' => $sectionRow['title'],
                    'textColor' => isset($sectionRow['text_color']) ? $sectionRow['text_color'] : null,
                    'visibleFrom' => $sectionRow['visible_from'] ?? null,
                    'expiresAt' => $sectionRow['expires_at'] ?? null,
                    'forceStackedView' => isset($sectionRow['force_stacked_view']) && $sectionRow['force_stacked_view'] == 1 ? true : false,
                    'position' => isset($sectionRow['position']) ? (int)$sectionRow['position'] : 0,
                    'links' => []
                ];
                
                // Get links for this section with visibility filtering
                $user = getAuthenticatedUser();
                if ($user) {
                    $linkStmt = $db->prepare('SELECT links.*, (SELECT 1 FROM user_link_favorites WHERE user_id = ? AND link_id = links.id) as is_favorite FROM links WHERE section_id = ? ORDER BY position ASC, id ASC');
                    $linkStmt->execute([$user['id'], $sectionRow['id']]);
                } else {
                    $linkStmt = $db->prepare('SELECT *, 0 as is_favorite FROM links WHERE section_id = ? ORDER BY position ASC, id ASC');
                    $linkStmt->execute([$sectionRow['id']]);
                }
                
                while ($linkRow = $linkStmt->fetch()) {
                    // Filter links based on visibility
                    $visibility = $linkRow['visibility'] ?? 'public';
                    $allowedUsers = $linkRow['allowed_users'] ? json_decode($linkRow['allowed_users'], true) : [];
                    
                    // Check if link should be visible to current user
                    // Admin users can see all links regardless of visibility
                    $isVisible = false;
                    if ($user && $user['is_admin']) {
                        $isVisible = true; // Admins see everything
                    } elseif ($visibility === 'public') {
                        $isVisible = true; // Public links visible to everyone
                    } elseif ($visibility === 'authenticated' && $user) {
                        $isVisible = true; // Authenticated links visible to logged-in users
                    } elseif ($visibility === 'private' && $user) {
                        // Private links visible only to specific users
                        $isVisible = in_array($user['id'], $allowedUsers);
                    }
                    
                    if (!$isVisible) {
                        continue; // Skip this link
                    }
                    
                    $link = [
                        'id' => $linkRow['id'],
                        'label' => $linkRow['label'],
                        'url' => $linkRow['url'],
                        'icon' => isset($linkRow['icon']) ? $linkRow['icon'] : null,
                        'textColor' => isset($linkRow['text_color']) ? $linkRow['text_color'] : null,
                        'visibility' => $visibility,
                        'allowedUsers' => $allowedUsers,
                        'notes' => isset($linkRow['notes']) ? $linkRow['notes'] : null,
                        'tooltip' => isset($linkRow['tooltip']) ? $linkRow['tooltip'] : null,
                        'visibleFrom' => isset($linkRow['visible_from']) ? $linkRow['visible_from'] : null,
                        'expiresAt' => isset($linkRow['expires_at']) ? $linkRow['expires_at'] : null,
                        'browser' => isset($linkRow['browser']) ? $linkRow['browser'] : null,
                        'isFavorite' => (bool)($linkRow['is_favorite'] ?? false),
                        'position' => (int)($linkRow['position'] ?? 0)
                    ];
                    
                    // Include health data if available
                    if (isset($linkRow['health_status'])) {
                        $link['health'] = [
                            'status' => $linkRow['health_status'] ?? 'unknown',
                            'httpCode' => $linkRow['health_http_code'] ? (int)$linkRow['health_http_code'] : null,
                            'error' => $linkRow['health_error'],
                            'checkedAt' => $linkRow['health_checked_at'] ? (int)$linkRow['health_checked_at'] : null
                        ];
                    }
                    
                    $section['links'][] = $link;
                }
                
                // Get rich text content for this section (inside tabs)
                $richTextStmt = $db->prepare('SELECT * FROM rich_text_content WHERE section_id = ? ORDER BY position ASC');
                $richTextStmt->execute([$sectionRow['id']]);
                $section['richTextContent'] = [];
                while ($richTextRow = $richTextStmt->fetch()) {
                    $section['richTextContent'][] = [
                        'id' => $richTextRow['id'],
                        'content' => $richTextRow['content'],
                        'position' => (int)($richTextRow['position'] ?? 0)
                    ];
                }
                
                $tab['sections'][] = $section;
            }
            
            $tabs[] = $tab;
        }
        
        // If no tabs exist, check for legacy sections (backward compatibility)
        if (empty($tabs)) {
            $legacySectionStmt = $db->prepare('SELECT * FROM sections WHERE tile_id = ? AND (tab_id IS NULL OR tab_id = "")');
            $legacySectionStmt->execute([$row['id']]);
            
            if ($legacySectionStmt->fetch()) {
                $legacySectionStmt->execute([$row['id']]); // Re-execute to reset cursor
                $allSections = [];
                
                while ($sectionRow = $legacySectionStmt->fetch()) {
                    $section = [
                        'id' => $sectionRow['id'],
                        'title' => $sectionRow['title'],
                        'forceStackedView' => isset($sectionRow['force_stacked_view']) && $sectionRow['force_stacked_view'] == 1 ? true : false,
                        'links' => []
                    ];
                    
                    $user = getAuthenticatedUser();
                    if ($user) {
                        $linkStmt = $db->prepare('SELECT links.*, (SELECT 1 FROM user_link_favorites WHERE user_id = ? AND link_id = links.id) as is_favorite FROM links WHERE section_id = ? ORDER BY position ASC, id ASC');
                        $linkStmt->execute([$user['id'], $sectionRow['id']]);
                    } else {
                        $linkStmt = $db->prepare('SELECT *, 0 as is_favorite FROM links WHERE section_id = ? ORDER BY position ASC, id ASC');
                        $linkStmt->execute([$sectionRow['id']]);
                    }
                    
                    while ($linkRow = $linkStmt->fetch()) {
                        $visibility = $linkRow['visibility'] ?? 'public';
                        $allowedUsers = $linkRow['allowed_users'] ? json_decode($linkRow['allowed_users'], true) : [];
                        
                        $isVisible = false;
                        if ($user && $user['is_admin']) {
                            $isVisible = true;
                        } elseif ($visibility === 'public') {
                            $isVisible = true;
                        } elseif ($visibility === 'authenticated' && $user) {
                            $isVisible = true;
                        } elseif ($visibility === 'private' && $user) {
                            $isVisible = in_array($user['id'], $allowedUsers);
                        }
                        
                        if (!$isVisible) {
                            continue;
                        }
                        
                        $link = [
                            'id' => $linkRow['id'],
                            'label' => $linkRow['label'],
                            'url' => $linkRow['url'],
                            'icon' => $linkRow['icon'] ?? null,
                            'textColor' => $linkRow['text_color'] ?? null,
                            'visibility' => $visibility,
                            'allowedUsers' => $allowedUsers,
                            'notes' => $linkRow['notes'] ?? null,
                            'tooltip' => $linkRow['tooltip'] ?? null,
                            'browser' => $linkRow['browser'] ?? null,
                            'isFavorite' => (bool)($linkRow['is_favorite'] ?? false),
                            'position' => (int)($linkRow['position'] ?? 0)
                        ];
                        
                        if (isset($linkRow['health_status'])) {
                            $link['health'] = [
                                'status' => $linkRow['health_status'] ?? 'unknown',
                                'httpCode' => $linkRow['health_http_code'] ? (int)$linkRow['health_http_code'] : null,
                                'error' => $linkRow['health_error'],
                                'checkedAt' => $linkRow['health_checked_at'] ? (int)$linkRow['health_checked_at'] : null
                            ];
                        }
                        
                        $section['links'][] = $link;
                    }
                    
                    // Get rich text content for this section
                    $richTextStmt = $db->prepare('SELECT * FROM rich_text_content WHERE section_id = ? ORDER BY position ASC');
                    $richTextStmt->execute([$sectionRow['id']]);
                    $section['richTextContent'] = [];
                    while ($richTextRow = $richTextStmt->fetch()) {
                        $section['richTextContent'][] = [
                            'id' => $richTextRow['id'],
                            'content' => $richTextRow['content'],
                            'position' => (int)($richTextRow['position'] ?? 0)
                        ];
                    }
                    
                    $allSections[] = $section;
                }
                
                $tile['sections'] = $allSections;
            }
        }
        
        $tile['tabs'] = $tabs;
        
        // Backward compatibility: also include sections array for old clients
        $allSections = [];
        foreach ($tabs as $tab) {
            $allSections = array_merge($allSections, $tab['sections']);
        }
        $tile['sections'] = $allSections;
        
        $tiles[] = $tile;
        $tilesById[$row['id']] = $tile;
    }
    
    // Normalize positions if there are duplicates or all positions are 0
    // This ensures tiles always have unique, sequential positions
    if (($hasDuplicatePositions || (count($positions) === 1 && isset($positions[0]))) && count($tiles) > 0) {
        try {
            $db->beginTransaction();
            $updateStmt = $db->prepare('UPDATE tiles SET position = ? WHERE id = ?');
            foreach ($tiles as $index => $tile) {
                $updateStmt->execute([$index, $tile['id']]);
            }
            $db->commit();
            error_log('Normalized tile positions: assigned sequential positions to ' . count($tiles) . ' tiles');
            
            // Reload tiles with updated positions (exclude deleted tiles)
            $stmt = $db->prepare('SELECT * FROM tiles WHERE deleted_at IS NULL ORDER BY position ASC');
            $stmt->execute();
            $tiles = [];
            while ($row = $stmt->fetch()) {
                // Check if this tile is favorited by the current user
                $isFavorite = false;
                if ($user) {
                    $favStmt = $db->prepare('SELECT 1 FROM user_tile_favorites WHERE user_id = ? AND tile_id = ?');
                    $favStmt->execute([$user['id'], $row['id']]);
                    $isFavorite = $favStmt->fetch() !== false;
                }
                
                // Reuse the tilesById data we already have instead of reloading
                if (isset($tilesById[$row['id']])) {
                    $tiles[] = $tilesById[$row['id']];
                    continue;
                }
                
                // If not found in cache, build from scratch (shouldn't happen, but fallback)
                // Get user tile permissions for the current user
                $canView = true; // Default: everyone can view (unless explicitly denied)
                $canEdit = false; // Default: no edit access (unless explicitly granted)
                $canDelete = false; // Default: no delete access (unless explicitly granted)
                
                if ($user) {
                    // Admins have full access to everything
                    if ($user['is_admin']) {
                        $canView = true;
                        $canEdit = true;
                        $canDelete = true;
                    } else {
                        // Check if user is the creator of the tile
                        $isCreator = isset($row['user_id']) && (int)$row['user_id'] === (int)$user['id'];
                        
                        if ($isCreator) {
                            // Creators have full access to their own tiles
                            $canView = true;
                            $canEdit = true;
                            $canDelete = true;
                        } else {
                            // Check for explicit permissions
                            $permStmt = $db->prepare('SELECT can_view, can_edit, can_delete FROM user_tile_permissions WHERE user_id = ? AND tile_id = ?');
                            $permStmt->execute([$user['id'], $row['id']]);
                            $permission = $permStmt->fetch();
                            
                            if ($permission) {
                                $canView = (bool)$permission['can_view'];
                                $canEdit = (bool)$permission['can_edit'];
                                $canDelete = (bool)$permission['can_delete'];
                            }
                            // If no permission record exists, use defaults (view only)
                        }
                    }
                }
                
                // Skip tiles where user doesn't have view permission
                if ($user && !$canView) {
                    continue;
                }
                
                $tile = [
                    'id' => $row['id'],
                    'title' => $row['title'],
                    'description' => $row['description'],
                    'htmlContent' => $row['html_content'],
                    'emoji' => $row['emoji'],
                    'themeColor' => $row['theme_color'],
                    'group' => $row['group'],
                    'createdAt' => (int)$row['created_at'],
                    'isFavorite' => $isFavorite,
                    'isHyperlink' => isset($row['is_hyperlink']) ? (bool)$row['is_hyperlink'] : false,
                    'hyperlinkUrl' => $row['hyperlink_url'] ?? null,
                    'openInNewTab' => isset($row['open_in_new_tab']) ? (bool)$row['open_in_new_tab'] : null,
                    'canView' => $canView,
                    'canEdit' => $canEdit,
                    'canDelete' => $canDelete,
                    'tabs' => []
                ];
                
                // Get tabs (simplified - just reuse data structure from above)
                $tile['tabs'] = [];
                $tile['sections'] = [];
                $tiles[] = $tile;
            }
        } catch (PDOException $e) {
            $db->rollBack();
            error_log('Failed to normalize tile positions: ' . $e->getMessage());
        }
    }
    
    // We now rely on the tiles.position column for ordering.
    // tile_arrangements is still written for compatibility, but not required for reading.
    
    sendJSON($tiles);
    } catch (PDOException $e) {
        error_log('Database error in handleGetTiles: ' . $e->getMessage());
        error_log('SQL State: ' . $e->getCode());
        error_log('File: ' . $e->getFile() . ' Line: ' . $e->getLine());
        sendJSON(['error' => 'Database error while fetching tiles', 'details' => $e->getMessage()], 500);
    } catch (Exception $e) {
        error_log('Error in handleGetTiles: ' . $e->getMessage());
        error_log('File: ' . $e->getFile() . ' Line: ' . $e->getLine());
        sendJSON(['error' => 'An error occurred while fetching tiles', 'details' => $e->getMessage()], 500);
    }
}

function handleGetTile($tileId) {
    $user = getAuthenticatedUser();
    $db = getDB();
    
    // Check if guest access is enabled
    $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'guest_access_enabled'");
    $stmt->execute();
    $guestAccessSetting = $stmt->fetchColumn();
    $guestAccessEnabled = ($guestAccessSetting === null || $guestAccessSetting === '1'); // Default to enabled if not set
    
    // If guest access is disabled and user is not authenticated, require login
    if (!$guestAccessEnabled && !$user) {
        sendJSON(['error' => 'Authentication required. Guest access is disabled.'], 401);
    }
    
    $stmt = $db->prepare('SELECT * FROM tiles WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$tileId]);
    $row = $stmt->fetch();
    
    if (!$row) {
        sendJSON(['error' => 'Tile not found'], 404);
    }
    
    // Filter tiles based on visibility
    $tileVisibility = $row['visibility'] ?? 'public';
    $tileAllowedUsers = $row['allowed_users'] ? json_decode($row['allowed_users'], true) : [];
    
    // Check if tile should be visible to current user
    // Admin users can see all tiles regardless of visibility
    $isTileVisible = false;
    if ($user && $user['is_admin']) {
        $isTileVisible = true; // Admins see everything
    } elseif ($tileVisibility === 'public') {
        $isTileVisible = true; // Public tiles visible to everyone
    } elseif ($tileVisibility === 'authenticated' && $user) {
        $isTileVisible = true; // Authenticated tiles visible to logged-in users
    } elseif ($tileVisibility === 'private' && $user) {
        // Private tiles visible only to specific users
        $isTileVisible = in_array($user['id'], $tileAllowedUsers);
    }
    
    if (!$isTileVisible) {
        sendJSON(['error' => 'Tile not found'], 404);
    }
    
    // Check if this tile is favorited by the current user
    $isFavorite = false;
    if ($user) {
        $favStmt = $db->prepare('SELECT 1 FROM user_tile_favorites WHERE user_id = ? AND tile_id = ?');
        $favStmt->execute([$user['id'], $row['id']]);
        $isFavorite = $favStmt->fetch() !== false;
    }
    
    // Get user tile permissions for the current user
    $canView = true; // Default: everyone can view (unless explicitly denied)
    $canEdit = false; // Default: no edit access (unless explicitly granted)
    $canDelete = false; // Default: no delete access (unless explicitly granted)
    
    if ($user) {
        // Admins have full access to everything
        if ($user['is_admin']) {
            $canView = true;
            $canEdit = true;
            $canDelete = true;
        } else {
            // Check if user is the creator of the tile
            $isCreator = isset($row['user_id']) && (int)$row['user_id'] === (int)$user['id'];
            
            if ($isCreator) {
                // Creators have full access to their own tiles
                $canView = true;
                $canEdit = true;
                $canDelete = true;
            } else {
                // Check for explicit permissions
                $permStmt = $db->prepare('SELECT can_view, can_edit, can_delete FROM user_tile_permissions WHERE user_id = ? AND tile_id = ?');
                $permStmt->execute([$user['id'], $row['id']]);
                $permission = $permStmt->fetch();
                
                if ($permission) {
                    $canView = (bool)$permission['can_view'];
                    $canEdit = (bool)$permission['can_edit'];
                    $canDelete = (bool)$permission['can_delete'];
                }
                // If no permission record exists, use defaults (view only)
            }
        }
    }
    
    // Check if user has view permission - deny access if not
    if ($user && !$canView) {
        sendJSON(['error' => 'Access denied. You do not have permission to view this tile.'], 403);
    }
    
    $tile = [
        'id' => $row['id'],
        'title' => $row['title'],
        'description' => $row['description'],
        'htmlContent' => $row['html_content'],
        'emoji' => $row['emoji'],
        'themeColor' => $row['theme_color'],
        'group' => $row['group'],
        'createdAt' => (int)$row['created_at'],
        'visibility' => $tileVisibility,
        'allowedUsers' => $tileAllowedUsers,
        'isFavorite' => $isFavorite,
        'isHyperlink' => isset($row['is_hyperlink']) ? (bool)$row['is_hyperlink'] : false,
        'hyperlinkUrl' => $row['hyperlink_url'] ?? null,
        'openInNewTab' => isset($row['open_in_new_tab']) ? (bool)$row['open_in_new_tab'] : null,
        'browser' => isset($row['browser']) ? $row['browser'] : null,
        'canView' => $canView,
        'canEdit' => $canEdit,
        'canDelete' => $canDelete,
        'tabs' => []
    ];
    
    // Get tabs for this tile
    $tabStmt = $db->prepare('SELECT * FROM tabs WHERE tile_id = ? ORDER BY position ASC');
    $tabStmt->execute([$tileId]);
    $tabs = [];
    
    while ($tabRow = $tabStmt->fetch()) {
        $tabColor = (!empty($tabRow['text_color']) && trim($tabRow['text_color']) !== '') ? trim($tabRow['text_color']) : null;
        error_log("Retrieved tab {$tabRow['id']} ({$tabRow['title']}) with color: " . ($tabColor ?? 'null'));
        $tab = [
            'id' => $tabRow['id'],
            'title' => $tabRow['title'],
            'position' => (int)($tabRow['position'] ?? 0),
            'textColor' => $tabColor,
            'visibleFrom' => $tabRow['visible_from'] ?? null,
            'expiresAt' => $tabRow['expires_at'] ?? null,
            'sections' => []
        ];
        
        // Get sections for this tab
        $sectionStmt = $db->prepare('SELECT * FROM sections WHERE tab_id = ? ORDER BY position ASC, id ASC');
        $sectionStmt->execute([$tabRow['id']]);
        
        while ($sectionRow = $sectionStmt->fetch()) {
            $section = [
                'id' => $sectionRow['id'],
                'title' => $sectionRow['title'],
                'visibleFrom' => $sectionRow['visible_from'] ?? null,
                'expiresAt' => $sectionRow['expires_at'] ?? null,
                'forceStackedView' => isset($sectionRow['force_stacked_view']) && $sectionRow['force_stacked_view'] == 1 ? true : false,
                'position' => isset($sectionRow['position']) ? (int)$sectionRow['position'] : 0,
                'links' => []
            ];
            
            // Get links with visibility filtering
            $user = getAuthenticatedUser();
            if ($user) {
                $linkStmt = $db->prepare('SELECT links.*, (SELECT 1 FROM user_link_favorites WHERE user_id = ? AND link_id = links.id) as is_favorite FROM links WHERE section_id = ? ORDER BY position ASC, id ASC');
                $linkStmt->execute([$user['id'], $sectionRow['id']]);
            } else {
                $linkStmt = $db->prepare('SELECT *, 0 as is_favorite FROM links WHERE section_id = ? ORDER BY position ASC, id ASC');
                $linkStmt->execute([$sectionRow['id']]);
            }
            
            while ($linkRow = $linkStmt->fetch()) {
                // Filter links based on visibility
                $visibility = $linkRow['visibility'] ?? 'public';
                $allowedUsers = $linkRow['allowed_users'] ? json_decode($linkRow['allowed_users'], true) : [];
                
                // Check if link should be visible to current user
                // Admin users can see all links regardless of visibility
                $isVisible = false;
                if ($user && $user['is_admin']) {
                    $isVisible = true; // Admins see everything
                } elseif ($visibility === 'public') {
                    $isVisible = true;
                } elseif ($visibility === 'authenticated' && $user) {
                    $isVisible = true;
                } elseif ($visibility === 'private' && $user) {
                    $isVisible = in_array($user['id'], $allowedUsers);
                }
                
                if (!$isVisible) {
                    continue;
                }
                
                $link = [
                    'id' => $linkRow['id'],
                    'label' => $linkRow['label'],
                    'url' => $linkRow['url'],
                    'icon' => isset($linkRow['icon']) ? $linkRow['icon'] : null,
                    'textColor' => isset($linkRow['text_color']) ? $linkRow['text_color'] : null,
                    'visibility' => $visibility,
                    'allowedUsers' => $allowedUsers,
                    'notes' => isset($linkRow['notes']) ? $linkRow['notes'] : null,
                    'tooltip' => isset($linkRow['tooltip']) ? $linkRow['tooltip'] : null,
                    'visibleFrom' => isset($linkRow['visible_from']) ? $linkRow['visible_from'] : null,
                    'expiresAt' => isset($linkRow['expires_at']) ? $linkRow['expires_at'] : null,
                    'browser' => isset($linkRow['browser']) ? $linkRow['browser'] : null,
                    'isFavorite' => (bool)($linkRow['is_favorite'] ?? false),
                    'position' => (int)($linkRow['position'] ?? 0)
                ];
                
                // Include health data if available
                if (isset($linkRow['health_status'])) {
                    $link['health'] = [
                        'status' => $linkRow['health_status'] ?? 'unknown',
                        'httpCode' => $linkRow['health_http_code'] ? (int)$linkRow['health_http_code'] : null,
                        'error' => $linkRow['health_error'],
                        'checkedAt' => $linkRow['health_checked_at'] ? (int)$linkRow['health_checked_at'] : null
                    ];
                }
                
                $section['links'][] = $link;
            }
            
            // Get rich text content for this section
            $richTextStmt = $db->prepare('SELECT * FROM rich_text_content WHERE section_id = ? ORDER BY position ASC');
            $richTextStmt->execute([$sectionRow['id']]);
            $section['richTextContent'] = [];
            while ($richTextRow = $richTextStmt->fetch()) {
                $section['richTextContent'][] = [
                    'id' => $richTextRow['id'],
                    'content' => $richTextRow['content'],
                    'position' => (int)($richTextRow['position'] ?? 0)
                ];
            }
            
            $tab['sections'][] = $section;
        }
        
        $tabs[] = $tab;
    }
    
    // If no tabs exist, check for legacy sections (backward compatibility)
    if (empty($tabs)) {
        $legacySectionStmt = $db->prepare('SELECT * FROM sections WHERE tile_id = ? AND (tab_id IS NULL OR tab_id = "")');
        $legacySectionStmt->execute([$tileId]);
        
        // Create a default tab for legacy sections
        if ($legacySectionStmt->fetch()) {
            $legacySectionStmt->execute([$tileId]); // Re-execute to reset cursor
            $defaultTab = [
                'id' => 'default_' . $tileId,
                'title' => 'Default',
                'position' => 0,
                'sections' => []
            ];
            
            while ($sectionRow = $legacySectionStmt->fetch()) {
                $section = [
                    'id' => $sectionRow['id'],
                    'title' => $sectionRow['title'],
                    'links' => []
                ];
                
                $user = getAuthenticatedUser();
                $user = getAuthenticatedUser();
                if ($user) {
                    $linkStmt = $db->prepare('SELECT links.*, (SELECT 1 FROM user_link_favorites WHERE user_id = ? AND link_id = links.id) as is_favorite FROM links WHERE section_id = ? ORDER BY position ASC, id ASC');
                    $linkStmt->execute([$user['id'], $sectionRow['id']]);
                } else {
                    $linkStmt = $db->prepare('SELECT *, 0 as is_favorite FROM links WHERE section_id = ? ORDER BY position ASC, id ASC');
                    $linkStmt->execute([$sectionRow['id']]);
                }
                
                while ($linkRow = $linkStmt->fetch()) {
                    $visibility = $linkRow['visibility'] ?? 'public';
                    $allowedUsers = $linkRow['allowed_users'] ? json_decode($linkRow['allowed_users'], true) : [];
                    
                    $isVisible = false;
                    if ($user && $user['is_admin']) {
                        $isVisible = true;
                    } elseif ($visibility === 'public') {
                        $isVisible = true;
                    } elseif ($visibility === 'authenticated' && $user) {
                        $isVisible = true;
                    } elseif ($visibility === 'private' && $user) {
                        $isVisible = in_array($user['id'], $allowedUsers);
                    }
                    
                    if (!$isVisible) {
                        continue;
                    }
                    
                    $link = [
                        'id' => $linkRow['id'],
                        'label' => $linkRow['label'],
                        'url' => $linkRow['url'],
                        'icon' => $linkRow['icon'] ?? null,
                        'textColor' => $linkRow['text_color'] ?? null,
                        'visibility' => $visibility,
                        'allowedUsers' => $allowedUsers,
                        'notes' => $linkRow['notes'] ?? null,
                        'tooltip' => $linkRow['tooltip'] ?? null,
                        'browser' => $linkRow['browser'] ?? null,
                        'position' => (int)($linkRow['position'] ?? 0)
                    ];
                    
                    if (isset($linkRow['health_status'])) {
                        $link['health'] = [
                            'status' => $linkRow['health_status'] ?? 'unknown',
                            'httpCode' => $linkRow['health_http_code'] ? (int)$linkRow['health_http_code'] : null,
                            'error' => $linkRow['health_error'],
                            'checkedAt' => $linkRow['health_checked_at'] ? (int)$linkRow['health_checked_at'] : null
                        ];
                    }
                    
                    $section['links'][] = $link;
                }
                
                $defaultTab['sections'][] = $section;
            }
            
            if (!empty($defaultTab['sections'])) {
                $tabs[] = $defaultTab;
            }
        }
    }
    
    $tile['tabs'] = $tabs;
    
    // Backward compatibility: also include sections array for old clients
    $allSections = [];
    foreach ($tabs as $tab) {
        $allSections = array_merge($allSections, $tab['sections']);
    }
    $tile['sections'] = $allSections;
    
    sendJSON($tile);
}

function handleCreateTile() {
    try {
        $user = requireAuth();
        $data = getJSONInput();
        
        if (!isset($data['title'])) {
            sendJSON(['error' => 'Title is required'], 400);
            return;
        }
        
        $db = getDB();
    $tileId = $data['id'] ?? uniqid('tile_', true);
    
    // Handle visibility and allowed_users
    $visibility = $data['visibility'] ?? 'public';
    $allowedUsers = null;
    if ($visibility === 'private' && isset($data['allowedUsers']) && is_array($data['allowedUsers'])) {
        $allowedUsers = json_encode($data['allowedUsers']);
    }
    
    // Handle hyperlink fields
    $isHyperlink = isset($data['isHyperlink']) && $data['isHyperlink'] ? 1 : 0;
    $hyperlinkUrl = $data['hyperlinkUrl'] ?? null;
    $openInNewTab = isset($data['openInNewTab']) && $data['openInNewTab'] ? 1 : 0;
    
    // Handle scheduling fields
    $visibleFrom = isset($data['visibleFrom']) && $data['visibleFrom'] ? $data['visibleFrom'] : null;
    $expiresAt = isset($data['expiresAt']) && $data['expiresAt'] ? $data['expiresAt'] : null;
    
    $stmt = $db->prepare('INSERT INTO tiles (id, user_id, title, description, html_content, emoji, theme_color, "group", visibility, allowed_users, is_hyperlink, hyperlink_url, open_in_new_tab, visible_from, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    
    if (!$stmt->execute([
        $tileId,
        $user['id'],
        $data['title'],
        $data['description'] ?? '',
        $data['htmlContent'] ?? '',
        $data['emoji'] ?? '📁',
        $data['themeColor'] ?? 'blue',
        $data['group'] ?? 'General',
        $visibility,
        $allowedUsers,
        $isHyperlink,
        $hyperlinkUrl,
        $openInNewTab,
        $visibleFrom,
        $expiresAt,
        $data['createdAt'] ?? time()
    ])) {
        sendJSON(['error' => 'Failed to create tile'], 500);
    }
    
    // Handle tabs (new structure) or sections (backward compatibility)
    if (isset($data['tabs']) && is_array($data['tabs'])) {
        // New structure with tabs
        foreach ($data['tabs'] as $tabIndex => $tab) {
            $tabId = $tab['id'] ?? uniqid('tab_', true);
            $tabStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position, text_color, visible_from, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $tabStmt->execute([
                $tabId,
                $tileId,
                $tab['title'] ?? 'New Tab',
                $tab['position'] ?? $tabIndex,
                (!empty($tab['textColor']) && trim($tab['textColor']) !== '') ? trim($tab['textColor']) : null,
                $tab['visibleFrom'] ?? null,
                $tab['expiresAt'] ?? null
            ]);
            
            // Insert sections for this tab
            if (isset($tab['sections']) && is_array($tab['sections'])) {
                foreach ($tab['sections'] as $sectionIndex => $section) {
                    $sectionId = $section['id'] ?? uniqid('section_', true);
                    $sectionPosition = isset($section['position']) ? (int)$section['position'] : $sectionIndex;
                    $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, text_color, visible_from, expires_at, force_stacked_view, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
                    $sectionStmt->execute([
                        $sectionId,
                        $tileId,
                        $tabId,
                        $section['title'] ?? '',
                        $section['textColor'] ?? null,
                        $section['visibleFrom'] ?? null,
                        $section['expiresAt'] ?? null,
                        isset($section['forceStackedView']) && $section['forceStackedView'] === true ? 1 : 0,
                        $sectionPosition
                    ]);
                    
                    // Insert links for this section
                    if (isset($section['links']) && is_array($section['links'])) {
                        foreach ($section['links'] as $link) {
                            $linkId = $link['id'] ?? uniqid('link_', true);
                            $visibility = $link['visibility'] ?? 'public';
                            $allowedUsers = isset($link['allowedUsers']) && is_array($link['allowedUsers']) 
                                ? json_encode($link['allowedUsers']) 
                                : null;
                            try {
                                $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, text_color, visibility, allowed_users, notes, tooltip, visible_from, expires_at, browser, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                                $linkStmt->execute([
                                    $linkId,
                                    $sectionId,
                                    $link['label'],
                                    $link['url'],
                                    $link['icon'] ?? null,
                                    $link['textColor'] ?? null,
                                    $visibility,
                                    $allowedUsers,
                                    $link['notes'] ?? null,
                                    $link['tooltip'] ?? null,
                                    $link['visibleFrom'] ?? null,
                                    $link['expiresAt'] ?? null,
                                    $link['browser'] ?? null,
                                    isset($link['position']) ? (int)$link['position'] : 0
                                ]);
                            } catch (PDOException $e) {
                                error_log('Error inserting link: ' . $e->getMessage());
                                error_log('Link data: ' . json_encode($link));
                                // Try without icon/text_color as fallback
                                try {
                                    $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, visibility, allowed_users, notes, tooltip, visible_from, expires_at, browser) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                                    $linkStmt->execute([
                                        $linkId,
                                        $sectionId,
                                        $link['label'],
                                        $link['url'],
                                        $visibility,
                                        $allowedUsers,
                                        $link['notes'] ?? null,
                                        $link['tooltip'] ?? null,
                                        $link['visibleFrom'] ?? null,
                                        $link['expiresAt'] ?? null,
                                        $link['browser'] ?? null
                                    ]);
                                } catch (PDOException $e2) {
                                    error_log('Error inserting link (fallback): ' . $e2->getMessage());
                                    throw $e2;
                                }
                            }
                        }
                        
                        // Insert rich text content for this section
                        if (isset($section['richTextContent']) && is_array($section['richTextContent'])) {
                            foreach ($section['richTextContent'] as $richText) {
                                $richTextId = $richText['id'] ?? uniqid('richtext_', true);
                                try {
                                    $richTextStmt = $db->prepare('INSERT INTO rich_text_content (id, section_id, content, position) VALUES (?, ?, ?, ?)');
                                    $richTextStmt->execute([
                                        $richTextId,
                                        $sectionId,
                                        $richText['content'] ?? '',
                                        $richText['position'] ?? 0
                                    ]);
                                } catch (PDOException $e) {
                                    error_log('Rich text content insert error: ' . $e->getMessage());
                                }
                            }
                        }
                    }
                }
            }
        }
    } elseif (isset($data['sections']) && is_array($data['sections'])) {
        // Backward compatibility: create a default tab for sections
        $defaultTabId = uniqid('tab_', true);
        $tabStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position, text_color) VALUES (?, ?, ?, ?, ?)');
        $tabStmt->execute([
            $defaultTabId,
            $tileId,
            'Default',
            0,
            null
        ]);
        
        foreach ($data['sections'] as $sectionIndex => $section) {
            $sectionId = $section['id'] ?? uniqid('section_', true);
            $sectionPosition = isset($section['position']) ? (int)$section['position'] : $sectionIndex;
            $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, text_color, force_stacked_view, position) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $sectionStmt->execute([
                $sectionId,
                $tileId,
                $defaultTabId,
                $section['title'] ?? '',
                $section['textColor'] ?? null,
                isset($section['forceStackedView']) && $section['forceStackedView'] === true ? 1 : 0,
                $sectionPosition
            ]);
            
            if (isset($section['links']) && is_array($section['links'])) {
                foreach ($section['links'] as $link) {
                    $linkId = $link['id'] ?? uniqid('link_', true);
                    $visibility = $link['visibility'] ?? 'public';
                    $allowedUsers = isset($link['allowedUsers']) && is_array($link['allowedUsers']) 
                        ? json_encode($link['allowedUsers']) 
                        : null;
                    try {
                        $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, text_color, visibility, allowed_users, notes, tooltip, browser) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                        $linkStmt->execute([
                            $linkId,
                            $sectionId,
                            $link['label'],
                            $link['url'],
                            $link['icon'] ?? null,
                            $link['textColor'] ?? null,
                            $visibility,
                            $allowedUsers,
                            $link['notes'] ?? null,
                            $link['tooltip'] ?? null,
                            $link['browser'] ?? null
                        ]);
                    } catch (PDOException $e) {
                        error_log('Error inserting link (backward compat): ' . $e->getMessage());
                        // Try without icon/text_color as fallback
                        try {
                            $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, visibility, allowed_users, notes, tooltip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
                            $linkStmt->execute([
                                $linkId,
                                $sectionId,
                                $link['label'],
                                $link['url'],
                                $visibility,
                                $allowedUsers,
                                $link['notes'] ?? null,
                                $link['tooltip'] ?? null
                            ]);
                        } catch (PDOException $e2) {
                            error_log('Error inserting link (fallback): ' . $e2->getMessage());
                            throw $e2;
                        }
                    }
                }
            }
        }
    }
    
    sendJSON(['success' => true, 'id' => $tileId], 201);
    } catch (PDOException $e) {
        error_log('Database error in handleCreateTile: ' . $e->getMessage());
        error_log('SQL State: ' . $e->getCode());
        error_log('File: ' . $e->getFile() . ' Line: ' . $e->getLine());
        sendJSON(['error' => 'Database error while creating tile', 'details' => $e->getMessage()], 500);
    } catch (Exception $e) {
        error_log('Error in handleCreateTile: ' . $e->getMessage());
        error_log('File: ' . $e->getFile() . ' Line: ' . $e->getLine());
        sendJSON(['error' => 'An error occurred while creating tile', 'details' => $e->getMessage()], 500);
    }
}

function handleUpdateTile($tileId) {
    $user = requireAuth();
    $data = getJSONInput();
    
    $db = getDB();
    
    // Verify tile exists
    $checkStmt = $db->prepare('SELECT id FROM tiles WHERE id = ?');
    $checkStmt->execute([$tileId]);
    $tile = $checkStmt->fetch();
    
    if (!$tile) {
        sendJSON(['error' => 'Tile not found'], 404);
    }
    
    // Check if user has permission to edit this tile
    if (!canUserEditTile($user['id'], $tileId, $db)) {
        sendJSON(['error' => 'You do not have permission to edit this tile'], 403);
    }

    // Begin transaction to prevent database locking issues
    $db->beginTransaction();
    
    try {
        // Handle visibility and allowed_users
        $visibility = $data['visibility'] ?? 'public';
        $allowedUsers = null;
        if ($visibility === 'private' && isset($data['allowedUsers']) && is_array($data['allowedUsers'])) {
            $allowedUsers = json_encode($data['allowedUsers']);
        }
        
        // Handle hyperlink fields
        $isHyperlink = isset($data['isHyperlink']) && $data['isHyperlink'] ? 1 : 0;
        $hyperlinkUrl = $data['hyperlinkUrl'] ?? null;
        $openInNewTab = isset($data['openInNewTab']) && $data['openInNewTab'] ? 1 : 0;
        
        // Handle scheduling fields
        $visibleFrom = isset($data['visibleFrom']) && $data['visibleFrom'] ? $data['visibleFrom'] : null;
        $expiresAt = isset($data['expiresAt']) && $data['expiresAt'] ? $data['expiresAt'] : null;
        
        // Handle browser field
        $browser = isset($data['browser']) && $data['browser'] !== 'default' ? $data['browser'] : null;
        
        // Update tile
        $stmt = $db->prepare('UPDATE tiles SET title = ?, description = ?, html_content = ?, emoji = ?, theme_color = ?, "group" = ?, visibility = ?, allowed_users = ?, is_hyperlink = ?, hyperlink_url = ?, open_in_new_tab = ?, visible_from = ?, expires_at = ?, browser = ? WHERE id = ?');
        $stmt->execute([
            $data['title'] ?? '',
            $data['description'] ?? '',
            $data['htmlContent'] ?? '',
            $data['emoji'] ?? '📁',
            $data['themeColor'] ?? 'blue',
            $data['group'] ?? 'General',
            $visibility,
            $allowedUsers,
            $isHyperlink,
            $hyperlinkUrl,
            $openInNewTab,
            $visibleFrom,
            $expiresAt,
            $browser,
            $tileId
        ]);
        
        // Delete existing tabs, sections, links, and rich text content
        $deleteRichTextStmt = $db->prepare('DELETE FROM rich_text_content WHERE section_id IN (SELECT id FROM sections WHERE tile_id = ?)');
        $deleteRichTextStmt->execute([$tileId]);
        
        $deleteLinksStmt = $db->prepare('DELETE FROM links WHERE section_id IN (SELECT id FROM sections WHERE tile_id = ?)');
        $deleteLinksStmt->execute([$tileId]);
        
        $deleteSectionsStmt = $db->prepare('DELETE FROM sections WHERE tile_id = ?');
        $deleteSectionsStmt->execute([$tileId]);
        
        $deleteTabsStmt = $db->prepare('DELETE FROM tabs WHERE tile_id = ?');
        $deleteTabsStmt->execute([$tileId]);
    
        // Insert new tabs, sections, and links
        if (isset($data['tabs']) && is_array($data['tabs'])) {
            // Log for debugging
            error_log('Updating tile ' . $tileId . ' with ' . count($data['tabs']) . ' tabs');
            error_log('Tab IDs: ' . json_encode(array_map(function($t) { return $t['id'] ?? 'no-id'; }, $data['tabs'])));
            error_log('Tab colors received: ' . json_encode(array_map(function($t) { return ['id' => $t['id'] ?? 'no-id', 'title' => $t['title'] ?? '', 'textColor' => $t['textColor'] ?? 'null']; }, $data['tabs'])));
            
            // New structure with tabs
            foreach ($data['tabs'] as $tabIndex => $tab) {
                $tabId = $tab['id'] ?? uniqid('tab_', true);
                $tabColor = (!empty($tab['textColor']) && trim($tab['textColor']) !== '') ? trim($tab['textColor']) : null;
                error_log("Saving tab $tabId with color: " . ($tabColor ?? 'null'));
                $tabStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position, text_color, visible_from, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
                $tabStmt->execute([
                    $tabId,
                    $tileId,
                    $tab['title'] ?? 'New Tab',
                    $tab['position'] ?? $tabIndex,
                    $tabColor,
                    $tab['visibleFrom'] ?? null,
                    $tab['expiresAt'] ?? null
                ]);
                
                // Insert sections for this tab
                if (isset($tab['sections']) && is_array($tab['sections'])) {
                    foreach ($tab['sections'] as $sectionIndex => $section) {
                        $sectionId = $section['id'] ?? uniqid('section_', true);
                        $sectionPosition = isset($section['position']) ? (int)$section['position'] : $sectionIndex;
                        $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, text_color, visible_from, expires_at, force_stacked_view, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
                        $sectionStmt->execute([
                            $sectionId,
                            $tileId,
                            $tabId,
                            $section['title'] ?? '',
                            $section['textColor'] ?? null,
                            $section['visibleFrom'] ?? null,
                            $section['expiresAt'] ?? null,
                            isset($section['forceStackedView']) && $section['forceStackedView'] === true ? 1 : 0,
                            $sectionPosition
                        ]);
                        
                        // Insert links for this section
                        if (isset($section['links']) && is_array($section['links'])) {
                            foreach ($section['links'] as $link) {
                                $linkId = $link['id'] ?? uniqid('link_', true);
                                $visibility = $link['visibility'] ?? 'public';
                                $allowedUsers = isset($link['allowedUsers']) && is_array($link['allowedUsers']) 
                                    ? json_encode($link['allowedUsers']) 
                                    : null;
                                $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, text_color, visibility, allowed_users, notes, tooltip, visible_from, expires_at, browser, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                                $linkStmt->execute([
                                    $linkId,
                                    $sectionId,
                                    $link['label'],
                                    $link['url'],
                                    $link['icon'] ?? null,
                                    $link['textColor'] ?? null,
                                    $visibility,
                                    $allowedUsers,
                                    $link['notes'] ?? null,
                                    $link['tooltip'] ?? null,
                                    $link['visibleFrom'] ?? null,
                                    $link['expiresAt'] ?? null,
                                    $link['browser'] ?? null,
                                    isset($link['position']) ? (int)$link['position'] : 0
                                ]);
                            }
                        }
                        
                        // Insert rich text content for this section (tabs structure)
                        if (isset($section['richTextContent']) && is_array($section['richTextContent'])) {
                            foreach ($section['richTextContent'] as $richText) {
                                $richTextId = $richText['id'] ?? uniqid('richtext_', true);
                                $content = $richText['content'] ?? '';
                                $position = isset($richText['position']) ? (int)$richText['position'] : 0;
                                try {
                                    $richTextStmt = $db->prepare('INSERT INTO rich_text_content (id, section_id, content, position) VALUES (?, ?, ?, ?)');
                                    $richTextStmt->execute([
                                        $richTextId,
                                        $sectionId,
                                        $content,
                                        $position
                                    ]);
                                } catch (PDOException $e) {
                                    error_log('Rich text content insert error (tabs): ' . $e->getMessage());
                                }
                            }
                        }
                    }
                }
            }
        } elseif (isset($data['sections']) && is_array($data['sections'])) {
            // Backward compatibility: create a default tab for sections
            $defaultTabId = uniqid('tab_', true);
            $tabStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position) VALUES (?, ?, ?, ?)');
            $tabStmt->execute([
                $defaultTabId,
                $tileId,
                'Default',
                0
            ]);
            
            foreach ($data['sections'] as $sectionIndex => $section) {
                $sectionId = $section['id'] ?? uniqid('section_', true);
                $sectionPosition = isset($section['position']) ? (int)$section['position'] : $sectionIndex;
                $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, text_color, force_stacked_view, position) VALUES (?, ?, ?, ?, ?, ?, ?)');
                $sectionStmt->execute([
                    $sectionId,
                    $tileId,
                    $defaultTabId,
                    $section['title'] ?? '',
                    $section['textColor'] ?? null,
                    isset($section['forceStackedView']) && $section['forceStackedView'] === true ? 1 : 0,
                    $sectionPosition
                ]);
                
                if (isset($section['links']) && is_array($section['links'])) {
                    foreach ($section['links'] as $link) {
                        // Validate required fields
                        if (!isset($link['label']) || !isset($link['url'])) {
                            continue; // Skip invalid links
                        }
                        
                        $linkId = $link['id'] ?? uniqid('link_', true);
                        $visibility = $link['visibility'] ?? 'public';
                        $allowedUsers = isset($link['allowedUsers']) && is_array($link['allowedUsers']) 
                            ? json_encode($link['allowedUsers']) 
                            : null;
                        $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, text_color, visibility, allowed_users, notes, tooltip, browser, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                        $linkStmt->execute([
                            $linkId,
                            $sectionId,
                            $link['label'],
                            $link['url'],
                            $link['icon'] ?? null,
                            $link['textColor'] ?? null,
                            $visibility,
                            $allowedUsers,
                            $link['notes'] ?? null,
                            $link['tooltip'] ?? null,
                            $link['browser'] ?? null,
                            isset($link['position']) ? (int)$link['position'] : 0
                        ]);
                    }
                    
                    // Insert rich text content for this section
                    if (isset($section['richTextContent']) && is_array($section['richTextContent'])) {
                        foreach ($section['richTextContent'] as $richText) {
                            $richTextId = $richText['id'] ?? uniqid('richtext_', true);
                            $content = $richText['content'] ?? '';
                            $position = isset($richText['position']) ? (int)$richText['position'] : 0;
                            try {
                                $richTextStmt = $db->prepare('INSERT INTO rich_text_content (id, section_id, content, position) VALUES (?, ?, ?, ?)');
                                $richTextStmt->execute([
                                    $richTextId,
                                    $sectionId,
                                    $content,
                                    $position
                                ]);
                            } catch (PDOException $e) {
                                error_log('Rich text content insert error: ' . $e->getMessage());
                            }
                        }
                    }
                }
            }
        }
        
        // Commit the transaction
        $db->commit();
        
        sendJSON(['success' => true]);
    } catch (PDOException $e) {
        // Rollback transaction on database error
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('Database error in handleUpdateTile: ' . $e->getMessage());
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    } catch (Exception $e) {
        // Rollback transaction on any other error
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('Error in handleUpdateTile: ' . $e->getMessage());
        sendJSON(['error' => 'An error occurred while updating the tile: ' . $e->getMessage()], 500);
    }
}

function handleDeleteTile($tileId) {
    $user = requireAuth();
    $db = getDB();
    
    // Verify tile exists and is not already deleted
    // Allow deleting from archive (archived_at IS NOT NULL) or regular tiles (archived_at IS NULL)
    $checkStmt = $db->prepare('SELECT id, archived_at FROM tiles WHERE id = ? AND deleted_at IS NULL');
    $checkStmt->execute([$tileId]);
    $tile = $checkStmt->fetch();
    
    if (!$tile) {
        sendJSON(['error' => 'Tile not found or already deleted'], 404);
        return;
    }
    
    // Check if user has permission to delete this tile
    if (!canUserDeleteTile($user['id'], $tileId, $db)) {
        sendJSON(['error' => 'You do not have permission to delete this tile'], 403);
        return;
    }
    
    // Soft delete: set deleted_at timestamp and clear archived_at if it was archived
    // This moves the tile to recycle bin (whether it was archived or not)
    $stmt = $db->prepare('UPDATE tiles SET deleted_at = ?, archived_at = NULL WHERE id = ?');
    $stmt->execute([time(), $tileId]);
    
    sendJSON(['success' => true]);
}

function handleUpdateLinksBrowser($tileId) {
    $user = requireAuth();
    $data = getJSONInput();
    $db = getDB();
    
    // Verify tile exists
    $checkStmt = $db->prepare('SELECT id FROM tiles WHERE id = ? AND deleted_at IS NULL');
    $checkStmt->execute([$tileId]);
    $tile = $checkStmt->fetch();
    
    if (!$tile) {
        sendJSON(['error' => 'Tile not found'], 404);
        return;
    }
    
    // Check if user has permission to edit this tile
    if (!canUserEditTile($user['id'], $tileId, $db)) {
        sendJSON(['error' => 'You do not have permission to edit this tile'], 403);
        return;
    }
    
    // Get the browser value from request (default to null if 'default' or not provided)
    $browser = isset($data['browser']) && $data['browser'] !== 'default' && $data['browser'] !== '' ? $data['browser'] : null;
    
    // Update tile's default browser
    $updateTileStmt = $db->prepare('UPDATE tiles SET browser = ? WHERE id = ?');
    $updateTileStmt->execute([$browser, $tileId]);
    
    // Get all sections for this tile (through tabs or directly)
    $sectionsStmt = $db->prepare('
        SELECT DISTINCT s.id 
        FROM sections s
        LEFT JOIN tabs t ON s.tab_id = t.id
        WHERE (t.tile_id = ? OR s.tile_id = ?)
    ');
    $sectionsStmt->execute([$tileId, $tileId]);
    $sections = $sectionsStmt->fetchAll(PDO::FETCH_COLUMN);
    
    $updatedCount = 0;
    
    // Update all links that don't have a browser set (or have 'default' or NULL)
    // This respects links that already have a specific browser override
    if (!empty($sections)) {
        $placeholders = str_repeat('?,', count($sections) - 1) . '?';
        $updateLinksStmt = $db->prepare("
            UPDATE links 
            SET browser = ? 
            WHERE section_id IN ($placeholders) 
            AND (browser IS NULL OR browser = '' OR browser = 'default')
        ");
        $params = array_merge([$browser], $sections);
        $updateLinksStmt->execute($params);
        $updatedCount = $updateLinksStmt->rowCount();
    }
    
    sendJSON([
        'success' => true,
        'updatedLinks' => $updatedCount,
        'browser' => $browser
    ]);
}

function handleCloneTile($tileId) {
    $user = requireAuth();
    $db = getDB();
    
    // Begin transaction for atomicity
    $db->beginTransaction();
    
    try {
        // Get the original tile
        $stmt = $db->prepare('SELECT * FROM tiles WHERE id = ?');
        $stmt->execute([$tileId]);
        $originalTile = $stmt->fetch();
        
        if (!$originalTile) {
            $db->rollBack();
            sendJSON(['error' => 'Tile not found'], 404);
            return;
        }
    
        // Check if user has permission to view this tile (required to clone it)
        if (!canUserViewTile($user['id'], $tileId, $db)) {
            $db->rollBack();
            sendJSON(['error' => 'You do not have permission to view this tile'], 403);
            return;
        }
        
        // Check visibility - user must be able to see the tile to clone it
        $tileVisibility = $originalTile['visibility'] ?? 'public';
        $tileAllowedUsers = $originalTile['allowed_users'] ? json_decode($originalTile['allowed_users'], true) : [];
        
        $isTileVisible = false;
        if ($user && $user['is_admin']) {
            $isTileVisible = true;
        } elseif ($tileVisibility === 'public') {
            $isTileVisible = true;
        } elseif ($tileVisibility === 'authenticated' && $user) {
            $isTileVisible = true;
        } elseif ($tileVisibility === 'private' && $user) {
            $isTileVisible = in_array($user['id'], $tileAllowedUsers);
        }
        
        if (!$isTileVisible) {
            $db->rollBack();
            sendJSON(['error' => 'Tile not found'], 404);
            return;
        }
    
        // Generate new tile ID
        $newTileId = uniqid('tile_', true);
        
        // Get current max position to append new tile
        $maxPositionStmt = $db->prepare('SELECT MAX(position) as max_pos FROM tiles');
        $maxPositionStmt->execute();
        $maxPosRow = $maxPositionStmt->fetch();
        $newPosition = ($maxPosRow && $maxPosRow['max_pos'] !== null) ? (int)$maxPosRow['max_pos'] + 1 : 0;
        
        // Create new tile with "Copy of" prefix
        $newTitle = 'Copy of ' . $originalTile['title'];
        $newVisibility = 'public'; // Cloned tiles default to public
        $newAllowedUsers = null;
        
        $insertStmt = $db->prepare('INSERT INTO tiles (id, user_id, title, description, html_content, emoji, theme_color, "group", visibility, allowed_users, is_hyperlink, hyperlink_url, open_in_new_tab, visible_from, expires_at, browser, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        
        if (!$insertStmt->execute([
            $newTileId,
            $user['id'],
            $newTitle,
            $originalTile['description'],
            $originalTile['html_content'],
            $originalTile['emoji'],
            $originalTile['theme_color'],
            $originalTile['group'],
            $newVisibility,
            $newAllowedUsers,
            $originalTile['is_hyperlink'] ?? 0,
            $originalTile['hyperlink_url'] ?? null,
            $originalTile['open_in_new_tab'] ?? 0,
            $originalTile['visible_from'] ?? null,
            $originalTile['expires_at'] ?? null,
            $originalTile['browser'] ?? null,
            $newPosition,
            time()
        ])) {
            $db->rollBack();
            sendJSON(['error' => 'Failed to create cloned tile'], 500);
            return;
        }
    
        // Clone tabs, sections, and links
        $tabStmt = $db->prepare('SELECT * FROM tabs WHERE tile_id = ? ORDER BY position ASC');
        $tabStmt->execute([$tileId]);
        $tabs = $tabStmt->fetchAll();
        
        if (empty($tabs)) {
        // Check for legacy sections (backward compatibility)
        $legacySectionStmt = $db->prepare('SELECT * FROM sections WHERE tile_id = ? AND (tab_id IS NULL OR tab_id = "")');
        $legacySectionStmt->execute([$tileId]);
        $legacySections = $legacySectionStmt->fetchAll();
        
        if (!empty($legacySections)) {
            // Create a default tab for legacy sections
            $defaultTabId = uniqid('tab_', true);
            $tabInsertStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position, text_color) VALUES (?, ?, ?, ?, ?)');
            $tabInsertStmt->execute([
                $defaultTabId,
                $newTileId,
                'Default',
                0,
                null
            ]);
            
            foreach ($legacySections as $sectionIndex => $section) {
                $newSectionId = uniqid('section_', true);
                $sectionPosition = isset($section['position']) ? (int)$section['position'] : $sectionIndex;
                $sectionInsertStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, text_color, visible_from, expires_at, force_stacked_view, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
                $sectionInsertStmt->execute([
                    $newSectionId,
                    $newTileId,
                    $defaultTabId,
                    $section['title'],
                    isset($section['text_color']) ? $section['text_color'] : null,
                    $section['visible_from'] ?? null,
                    $section['expires_at'] ?? null,
                    isset($section['force_stacked_view']) && $section['force_stacked_view'] == 1 ? 1 : 0,
                    $sectionPosition
                ]);
                
                // Clone links
                $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ?');
                $linkStmt->execute([$section['id']]);
                $links = $linkStmt->fetchAll();
                
                foreach ($links as $link) {
                    $newLinkId = uniqid('link_', true);
                    $linkInsertStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, text_color, visibility, allowed_users, notes, tooltip, visible_from, expires_at, browser, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                    $linkInsertStmt->execute([
                        $newLinkId,
                        $newSectionId,
                        $link['label'],
                        $link['url'],
                        $link['icon'] ?? null,
                        $link['text_color'] ?? null,
                        $link['visibility'] ?? 'public',
                        null, // Reset allowed_users for cloned links
                        $link['notes'] ?? null,
                        $link['tooltip'] ?? null,
                        $link['visible_from'] ?? null,
                        $link['expires_at'] ?? null,
                        $link['browser'] ?? null,
                        isset($link['position']) ? (int)$link['position'] : 0
                    ]);
                }
                
                // Clone rich text content for legacy sections
                $richTextStmt = $db->prepare('SELECT * FROM rich_text_content WHERE section_id = ?');
                $richTextStmt->execute([$section['id']]);
                $richTextItems = $richTextStmt->fetchAll();
                
                foreach ($richTextItems as $richText) {
                    $newRichTextId = uniqid('richtext_', true);
                    $richTextInsertStmt = $db->prepare('INSERT INTO rich_text_content (id, section_id, content, position) VALUES (?, ?, ?, ?)');
                    $richTextInsertStmt->execute([
                        $newRichTextId,
                        $newSectionId,
                        $richText['content'] ?? '',
                        isset($richText['position']) ? (int)$richText['position'] : 0
                    ]);
                }
            }
        }
    } else {
        // Clone tabs and their sections/links
        foreach ($tabs as $tab) {
            $newTabId = uniqid('tab_', true);
            $tabInsertStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position, text_color, visible_from, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $tabInsertStmt->execute([
                $newTabId,
                $newTileId,
                $tab['title'],
                $tab['position'] ?? 0,
                (!empty($tab['text_color']) && trim($tab['text_color']) !== '') ? trim($tab['text_color']) : null,
                $tab['visible_from'] ?? null,
                $tab['expires_at'] ?? null
            ]);
            
            // Clone sections for this tab
            $sectionStmt = $db->prepare('SELECT * FROM sections WHERE tab_id = ? ORDER BY position ASC, id ASC');
            $sectionStmt->execute([$tab['id']]);
            $sections = $sectionStmt->fetchAll();
            
            foreach ($sections as $sectionIndex => $section) {
                $newSectionId = uniqid('section_', true);
                $sectionPosition = isset($section['position']) ? (int)$section['position'] : $sectionIndex;
                $sectionInsertStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, text_color, visible_from, expires_at, force_stacked_view, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
                $sectionInsertStmt->execute([
                    $newSectionId,
                    $newTileId,
                    $newTabId,
                    $section['title'],
                    isset($section['text_color']) ? $section['text_color'] : null,
                    $section['visible_from'] ?? null,
                    $section['expires_at'] ?? null,
                    isset($section['force_stacked_view']) && $section['force_stacked_view'] == 1 ? 1 : 0,
                    $sectionPosition
                ]);
                
                // Clone links
                $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ?');
                $linkStmt->execute([$section['id']]);
                $links = $linkStmt->fetchAll();
                
                foreach ($links as $link) {
                    $newLinkId = uniqid('link_', true);
                    $linkInsertStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, text_color, visibility, allowed_users, notes, tooltip, visible_from, expires_at, browser, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                    $linkInsertStmt->execute([
                        $newLinkId,
                        $newSectionId,
                        $link['label'],
                        $link['url'],
                        $link['icon'] ?? null,
                        $link['text_color'] ?? null,
                        $link['visibility'] ?? 'public',
                        null, // Reset allowed_users for cloned links
                        $link['notes'] ?? null,
                        $link['tooltip'] ?? null,
                        $link['visible_from'] ?? null,
                        $link['expires_at'] ?? null,
                        $link['browser'] ?? null,
                        isset($link['position']) ? (int)$link['position'] : 0
                    ]);
                }
                
                // Clone rich text content for sections
                $richTextStmt = $db->prepare('SELECT * FROM rich_text_content WHERE section_id = ?');
                $richTextStmt->execute([$section['id']]);
                $richTextItems = $richTextStmt->fetchAll();
                
                foreach ($richTextItems as $richText) {
                    $newRichTextId = uniqid('richtext_', true);
                    $richTextInsertStmt = $db->prepare('INSERT INTO rich_text_content (id, section_id, content, position) VALUES (?, ?, ?, ?)');
                    $richTextInsertStmt->execute([
                        $newRichTextId,
                        $newSectionId,
                        $richText['content'] ?? '',
                        isset($richText['position']) ? (int)$richText['position'] : 0
                    ]);
                }
            }
        }
    }
        
    // Commit transaction
    $db->commit();
    
    sendJSON(['success' => true, 'id' => $newTileId], 201);
    
    } catch (PDOException $e) {
        $db->rollBack();
        error_log('Clone tile error: ' . $e->getMessage());
        error_log('Stack trace: ' . $e->getTraceAsString());
        sendJSON(['error' => 'Failed to clone tile: ' . $e->getMessage()], 500);
    } catch (Exception $e) {
        $db->rollBack();
        error_log('Clone tile error (non-PDO): ' . $e->getMessage());
        error_log('Stack trace: ' . $e->getTraceAsString());
        sendJSON(['error' => 'Failed to clone tile: ' . $e->getMessage()], 500);
    }
}

function handleCloneCategory($categoryName) {
    $user = requireAuth();
    $db = getDB();
    
    // Category name is already decoded by the routing
    // Ensure it's properly trimmed
    $categoryName = trim($categoryName);
    
    if (empty($categoryName)) {
        sendJSON(['error' => 'Invalid category name'], 400);
    }
    
    // Log the attempt for debugging
    error_log('Clone category attempt: User ' . $user['id'] . ' (' . $user['username'] . '), is_admin=' . ($user['is_admin'] ? 'true' : 'false') . ', category="' . $categoryName . '"');
    
    // Get all tiles in this category (exclude deleted and archived tiles)
    $stmt = $db->prepare('SELECT * FROM tiles WHERE "group" = ? AND deleted_at IS NULL AND archived_at IS NULL ORDER BY position ASC');
    $stmt->execute([$categoryName]);
    $tiles = $stmt->fetchAll();
    
    if (empty($tiles)) {
        // Log for debugging - check if category exists with different encoding
        $debugStmt = $db->prepare('SELECT DISTINCT "group" FROM tiles WHERE "group" LIKE ? LIMIT 10');
        $searchPattern = '%' . str_replace([' ', '%'], ['%', '%%'], $categoryName) . '%';
        $debugStmt->execute([$searchPattern]);
        $similarCategories = $debugStmt->fetchAll(PDO::FETCH_COLUMN);
        error_log('Clone category: Category "' . $categoryName . '" not found. Similar categories: ' . json_encode($similarCategories));
        sendJSON(['error' => 'Category not found or empty', 'searched' => $categoryName], 404);
    }
    
    // Admins can always clone categories, skip permission check for admins
    if (!$user['is_admin']) {
        // Check if user has permission to view at least one tile in this category
        $hasViewPermission = false;
        $checkedTiles = 0;
        foreach ($tiles as $tile) {
            $checkedTiles++;
            if (canUserViewTile($user['id'], $tile['id'], $db)) {
                $hasViewPermission = true;
                break;
            }
        }
        
        if (!$hasViewPermission) {
            error_log('Clone category: User ' . $user['id'] . ' (' . $user['username'] . ') does not have permission to view category "' . $categoryName . '" (checked ' . $checkedTiles . ' of ' . count($tiles) . ' tiles)');
            sendJSON(['error' => 'You do not have permission to view this category'], 403);
        }
    } else {
        error_log('Clone category: Admin user ' . $user['id'] . ' (' . $user['username'] . ') cloning category "' . $categoryName . '" with ' . count($tiles) . ' tiles');
    }
    
    // Generate new category name
    $newCategoryName = 'Copy of ' . $categoryName;
    
    // Check if the new category name already exists, if so, append a number
    $counter = 1;
    $finalCategoryName = $newCategoryName;
    while (true) {
        $checkStmt = $db->prepare('SELECT COUNT(*) FROM tiles WHERE "group" = ?');
        $checkStmt->execute([$finalCategoryName]);
        $count = $checkStmt->fetchColumn();
        
        if ($count == 0) {
            break; // Category name is available
        }
        
        $finalCategoryName = $newCategoryName . ' (' . $counter . ')';
        $counter++;
    }
    
    // Get current max position to append new tiles
    $maxPositionStmt = $db->prepare('SELECT MAX(position) as max_pos FROM tiles');
    $maxPositionStmt->execute();
    $maxPosRow = $maxPositionStmt->fetch();
    $nextPosition = ($maxPosRow && $maxPosRow['max_pos'] !== null) ? (int)$maxPosRow['max_pos'] + 1 : 0;
    
    $clonedTiles = [];
    $errors = [];
    
    // Begin transaction for atomicity
    $db->beginTransaction();
    
    try {
        foreach ($tiles as $originalTile) {
            // Check if user has permission to view this tile
            if (!canUserViewTile($user['id'], $originalTile['id'], $db)) {
                continue; // Skip tiles user can't view
            }
            
            // Generate new tile ID
            $newTileId = uniqid('tile_', true);
            
            // Create new tile with "Copy of" prefix in title
            $newTitle = 'Copy of ' . $originalTile['title'];
            $newVisibility = 'public'; // Cloned tiles default to public
            $newAllowedUsers = null;
            
            $insertStmt = $db->prepare('INSERT INTO tiles (id, user_id, title, description, html_content, emoji, theme_color, "group", visibility, allowed_users, is_hyperlink, hyperlink_url, open_in_new_tab, visible_from, expires_at, browser, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            
            if (!$insertStmt->execute([
                $newTileId,
                $user['id'],
                $newTitle,
                $originalTile['description'],
                $originalTile['html_content'],
                $originalTile['emoji'],
                $originalTile['theme_color'],
                $finalCategoryName, // Use the new category name
                $newVisibility,
                $newAllowedUsers,
                $originalTile['is_hyperlink'] ?? 0,
                $originalTile['hyperlink_url'] ?? null,
                $originalTile['open_in_new_tab'] ?? 0,
                $originalTile['visible_from'] ?? null,
                $originalTile['expires_at'] ?? null,
                $originalTile['browser'] ?? null,
                $nextPosition++,
                time()
            ])) {
                $errors[] = 'Failed to clone tile: ' . $originalTile['title'];
                continue;
            }
            
            // Clone tabs, sections, and links
            $tabStmt = $db->prepare('SELECT * FROM tabs WHERE tile_id = ? ORDER BY position ASC');
            $tabStmt->execute([$originalTile['id']]);
            $tabs = $tabStmt->fetchAll();
            
            if (empty($tabs)) {
                // Check for legacy sections (backward compatibility)
                $legacySectionStmt = $db->prepare('SELECT * FROM sections WHERE tile_id = ? AND (tab_id IS NULL OR tab_id = "")');
                $legacySectionStmt->execute([$originalTile['id']]);
                $legacySections = $legacySectionStmt->fetchAll();
                
                if (!empty($legacySections)) {
                    // Create a default tab for legacy sections
                    $defaultTabId = uniqid('tab_', true);
                    $tabInsertStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position) VALUES (?, ?, ?, ?)');
                    $tabInsertStmt->execute([
                        $defaultTabId,
                        $newTileId,
                        'Default',
                        0
                    ]);
                    
                    foreach ($legacySections as $sectionIndex => $section) {
                        $newSectionId = uniqid('section_', true);
                        $sectionPosition = isset($section['position']) ? (int)$section['position'] : $sectionIndex;
                        $sectionInsertStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, text_color, visible_from, expires_at, force_stacked_view, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
                        $sectionInsertStmt->execute([
                            $newSectionId,
                            $newTileId,
                            $defaultTabId,
                            $section['title'],
                            isset($section['text_color']) ? $section['text_color'] : null,
                            $section['visible_from'] ?? null,
                            $section['expires_at'] ?? null,
                            isset($section['force_stacked_view']) && $section['force_stacked_view'] == 1 ? 1 : 0,
                            $sectionPosition
                        ]);
                        
                        // Clone links
                        $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ?');
                        $linkStmt->execute([$section['id']]);
                        $links = $linkStmt->fetchAll();
                        
                        foreach ($links as $link) {
                            $newLinkId = uniqid('link_', true);
                            $linkInsertStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, text_color, visibility, allowed_users, notes, tooltip, visible_from, expires_at, browser, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                            $linkInsertStmt->execute([
                                $newLinkId,
                                $newSectionId,
                                $link['label'],
                                $link['url'],
                                $link['icon'] ?? null,
                                $link['text_color'] ?? null,
                                $link['visibility'] ?? 'public',
                                null, // Reset allowed_users for cloned links
                                $link['notes'] ?? null,
                                $link['tooltip'] ?? null,
                                $link['visible_from'] ?? null,
                                $link['expires_at'] ?? null,
                                $link['browser'] ?? null,
                                $link['position'] ?? 0
                            ]);
                        }
                    }
                }
            } else {
                // Clone tabs and their sections/links
                foreach ($tabs as $tab) {
                    $newTabId = uniqid('tab_', true);
                    $tabInsertStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position, visible_from, expires_at) VALUES (?, ?, ?, ?, ?, ?)');
                    $tabInsertStmt->execute([
                        $newTabId,
                        $newTileId,
                        $tab['title'],
                        $tab['position'] ?? 0,
                        $tab['visible_from'] ?? null,
                        $tab['expires_at'] ?? null
                    ]);
                    
                    // Clone sections for this tab
                    $sectionStmt = $db->prepare('SELECT * FROM sections WHERE tab_id = ? ORDER BY position ASC, id ASC');
                    $sectionStmt->execute([$tab['id']]);
                    $sections = $sectionStmt->fetchAll();
                    
                    foreach ($sections as $sectionIndex => $section) {
                        $newSectionId = uniqid('section_', true);
                        $sectionPosition = isset($section['position']) ? (int)$section['position'] : $sectionIndex;
                        $sectionInsertStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, text_color, visible_from, expires_at, force_stacked_view, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
                        $sectionInsertStmt->execute([
                            $newSectionId,
                            $newTileId,
                            $newTabId,
                            $section['title'],
                            isset($section['text_color']) ? $section['text_color'] : null,
                            $section['visible_from'] ?? null,
                            $section['expires_at'] ?? null,
                            isset($section['force_stacked_view']) && $section['force_stacked_view'] == 1 ? 1 : 0,
                            $sectionPosition
                        ]);
                        
                        // Clone links
                        $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ?');
                        $linkStmt->execute([$section['id']]);
                        $links = $linkStmt->fetchAll();
                        
                        foreach ($links as $link) {
                            $newLinkId = uniqid('link_', true);
                            $linkInsertStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, text_color, visibility, allowed_users, notes, tooltip, visible_from, expires_at, browser, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                            $linkInsertStmt->execute([
                                $newLinkId,
                                $newSectionId,
                                $link['label'],
                                $link['url'],
                                $link['icon'] ?? null,
                                $link['text_color'] ?? null,
                                $link['visibility'] ?? 'public',
                                null, // Reset allowed_users for cloned links
                                $link['notes'] ?? null,
                                $link['tooltip'] ?? null,
                                $link['visible_from'] ?? null,
                                $link['expires_at'] ?? null,
                                $link['browser'] ?? null,
                                $link['position'] ?? 0
                            ]);
                        }
                    }
                }
            }
             
            $clonedTiles[] = [
                'id' => $newTileId,
                'title' => $newTitle
            ];
        }
        
        $db->commit();
        
        sendJSON([
            'success' => true,
            'newCategoryName' => $finalCategoryName,
            'clonedTiles' => $clonedTiles,
            'clonedCount' => count($clonedTiles),
            'errors' => $errors
        ], 201);
        
    } catch (PDOException $e) {
        $db->rollBack();
        error_log('Category clone error: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to clone category: ' . $e->getMessage()], 500);
    } catch (Exception $e) {
        $db->rollBack();
        error_log('Category clone error (non-PDO): ' . $e->getMessage());
        sendJSON(['error' => 'Failed to clone category: ' . $e->getMessage()], 500);
    }
}

function handleBulkImport() {
    requireAdmin(); // Only admins can bulk import
    
    // Check if file was uploaded
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        sendJSON(['error' => 'No file uploaded or upload error'], 400);
    }
    
    $file = $_FILES['file'];
    $filePath = $file['tmp_name'];
    
    // Validate file type (CSV)
    $fileExt = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if ($fileExt !== 'csv') {
        sendJSON(['error' => 'Invalid file type. Please upload a CSV file.'], 400);
    }
    
    // Read CSV file
    $csvData = [];
    if (($handle = fopen($filePath, 'r')) !== false) {
        // Read header row
        $headers = fgetcsv($handle);
        if ($headers === false) {
            fclose($handle);
            sendJSON(['error' => 'Invalid CSV file. Could not read header row.'], 400);
        }
        
        // Normalize headers (trim and lowercase for comparison)
        $headers = array_map('trim', $headers);
        $headerMap = [];
        
        // Map of expected header keys to possible variations
        $headerVariations = [
            'tile_title' => ['tile title', 'tile_title', 'tiletitle'],
            'tile_description' => ['tile description', 'tile_description', 'tiledescription'],
            'tile_emoji' => ['tile emoji', 'tile_emoji', 'tileemoji'],
            'tile_theme_color' => ['tile theme color', 'tile_theme_color', 'tilethemecolor', 'tile theme', 'tile_theme'],
            'tile_group' => ['tile group', 'tile_group', 'tilegroup'],
            'section_title' => ['section title', 'section_title', 'sectiontitle'],
            'link_label' => ['link label', 'link_label', 'linklabel'],
            'link_url' => ['link url', 'link_url', 'linkurl'],
            'link_visibility' => ['link visibility', 'link_visibility', 'linkvisibility'],
            'link_notes' => ['link notes', 'link_notes', 'linknotes'],
            'link_tooltip' => ['link tooltip', 'link_tooltip', 'linktooltip']
        ];
        
        // Match headers
        foreach ($headerVariations as $key => $variations) {
            foreach ($headers as $idx => $header) {
                $normalizedHeader = strtolower(preg_replace('/[\s_\-]/', '', $header));
                foreach ($variations as $variation) {
                    $normalizedVariation = strtolower(preg_replace('/[\s_\-]/', '', $variation));
                    if ($normalizedHeader === $normalizedVariation) {
                        $headerMap[$key] = $idx;
                        break 2; // Break out of both loops
                    }
                }
            }
        }
        
        // Check required headers
        if (!isset($headerMap['tile_title']) || !isset($headerMap['link_label']) || !isset($headerMap['link_url'])) {
            fclose($handle);
            sendJSON(['error' => 'CSV file missing required columns: Tile Title, Link Label, Link URL'], 400);
        }
        
        // Read data rows
        $rowNum = 1;
        while (($row = fgetcsv($handle)) !== false) {
            $rowNum++;
            if (count($row) < count($headers)) {
                continue; // Skip incomplete rows
            }
            
            $csvData[] = [
                'tile_title' => isset($headerMap['tile_title']) ? trim($row[$headerMap['tile_title']]) : '',
                'tile_description' => isset($headerMap['tile_description']) ? trim($row[$headerMap['tile_description']]) : '',
                'tile_emoji' => isset($headerMap['tile_emoji']) ? trim($row[$headerMap['tile_emoji']]) : '📁',
                'tile_theme_color' => isset($headerMap['tile_theme_color']) ? trim($row[$headerMap['tile_theme_color']]) : 'blue',
                'tile_group' => isset($headerMap['tile_group']) ? trim($row[$headerMap['tile_group']]) : 'General',
                'section_title' => isset($headerMap['section_title']) ? trim($row[$headerMap['section_title']]) : 'General',
                'link_label' => isset($headerMap['link_label']) ? trim($row[$headerMap['link_label']]) : '',
                'link_url' => isset($headerMap['link_url']) ? trim($row[$headerMap['link_url']]) : '',
                'link_visibility' => isset($headerMap['link_visibility']) ? trim($row[$headerMap['link_visibility']]) : 'public',
                'link_notes' => isset($headerMap['link_notes']) ? trim($row[$headerMap['link_notes']]) : '',
                'link_tooltip' => isset($headerMap['link_tooltip']) ? trim($row[$headerMap['link_tooltip']]) : '',
                'row_num' => $rowNum
            ];
        }
        fclose($handle);
    } else {
        sendJSON(['error' => 'Failed to read CSV file'], 400);
    }
    
    if (empty($csvData)) {
        sendJSON(['error' => 'CSV file is empty or contains no valid data'], 400);
    }
    
    $db = getDB();
    $created = [];
    $errors = [];
    $currentTime = time();
    
    // Get current max position to append new tiles
    $maxPositionStmt = $db->prepare('SELECT MAX(position) as max_pos FROM tiles');
    $maxPositionStmt->execute();
    $maxPosRow = $maxPositionStmt->fetch();
    $nextPosition = ($maxPosRow && $maxPosRow['max_pos'] !== null) ? (int)$maxPosRow['max_pos'] + 1 : 0;
    
    // Group CSV rows by tile and section
    $tilesMap = [];
    foreach ($csvData as $row) {
        // Skip rows with missing required fields
        if (empty($row['tile_title']) || empty($row['link_label']) || empty($row['link_url'])) {
            $errors[] = "Row {$row['row_num']}: Missing required fields (Tile Title, Link Label, or Link URL)";
            continue;
        }
        
        $tileKey = $row['tile_title'] . '|' . ($row['tile_group'] ?: 'General');
        $sectionKey = $row['section_title'] ?: 'General';
        
        if (!isset($tilesMap[$tileKey])) {
            $tilesMap[$tileKey] = [
                'title' => $row['tile_title'],
                'description' => $row['tile_description'],
                'emoji' => $row['tile_emoji'] ?: '📁',
                'themeColor' => $row['tile_theme_color'] ?: 'blue',
                'group' => $row['tile_group'] ?: 'General',
                'sections' => []
            ];
        }
        
        if (!isset($tilesMap[$tileKey]['sections'][$sectionKey])) {
            $tilesMap[$tileKey]['sections'][$sectionKey] = [];
        }
        
        $tilesMap[$tileKey]['sections'][$sectionKey][] = [
            'label' => $row['link_label'],
            'url' => $row['link_url'],
            'visibility' => $row['link_visibility'] ?: 'public',
            'notes' => $row['link_notes'],
            'tooltip' => $row['link_tooltip']
        ];
    }
    
    if (empty($tilesMap)) {
        sendJSON(['error' => 'No valid tiles found in CSV file'], 400);
    }
    
    $db->beginTransaction();
    
    try {
        foreach ($tilesMap as $tileKey => $tileData) {
            try {
                // Generate unique tile ID
                $tileId = uniqid('tile_', true);
                
                // Insert tile
                $stmt = $db->prepare('INSERT INTO tiles (id, user_id, title, description, html_content, emoji, theme_color, "group", position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                
                if (!$stmt->execute([
                    $tileId,
                    $user['id'],
                    $tileData['title'],
                    $tileData['description'],
                    '',
                    $tileData['emoji'],
                    $tileData['themeColor'],
                    $tileData['group'],
                    $nextPosition++,
                    $currentTime
                ])) {
                    $errors[] = "Tile '{$tileData['title']}': Failed to create tile";
                    continue;
                }
                
                // Insert sections and links
                $sectionIndex = 0;
                foreach ($tileData['sections'] as $sectionTitle => $links) {
                    $sectionId = uniqid('section_', true);
                    $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, title, text_color, force_stacked_view, position) VALUES (?, ?, ?, ?, ?, ?)');
                    $sectionStmt->execute([
                        $sectionId,
                        $tileId,
                        $sectionTitle,
                        null,
                        0,
                        $sectionIndex++
                    ]);
                    
                    foreach ($links as $link) {
                        $linkId = uniqid('link_', true);
                        $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, text_color, visibility, allowed_users, notes, tooltip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                        $linkStmt->execute([
                            $linkId,
                            $sectionId,
                            $link['label'],
                            $link['url'],
                            $link['icon'] ?? null,
                            $link['textColor'] ?? null,
                            $link['visibility'],
                            null,
                            $link['notes'] ?: null,
                            $link['tooltip'] ?: null
                        ]);
                    }
                }
                
                $created[] = [
                    'id' => $tileId,
                    'title' => $tileData['title']
                ];
                
            } catch (Exception $e) {
                $errors[] = "Tile '{$tileData['title']}': " . $e->getMessage();
                error_log('Bulk import error for tile: ' . $tileData['title'] . ' - ' . $e->getMessage());
            }
        }
        
        $db->commit();
        
        sendJSON([
            'success' => true,
            'created' => count($created),
            'errors' => count($errors),
            'createdTiles' => $created,
            'errorMessages' => $errors
        ], 201);
        
    } catch (Exception $e) {
        $db->rollBack();
        error_log('Bulk import transaction failed: ' . $e->getMessage());
        sendJSON(['error' => 'Bulk import failed: ' . $e->getMessage()], 500);
    }
}

function handleToggleFavorite($tileId) {
    $user = requireAuth();
    $db = getDB();
    
    // Verify tile exists
    $checkStmt = $db->prepare('SELECT id FROM tiles WHERE id = ?');
    $checkStmt->execute([$tileId]);
    $tile = $checkStmt->fetch();
    
    if (!$tile) {
        sendJSON(['error' => 'Tile not found'], 404);
    }
    
    // Check if already favorited
    $favStmt = $db->prepare('SELECT 1 FROM user_tile_favorites WHERE user_id = ? AND tile_id = ?');
    $favStmt->execute([$user['id'], $tileId]);
    $isFavorite = $favStmt->fetch() !== false;
    
    if ($isFavorite) {
        // Remove from favorites
        $deleteStmt = $db->prepare('DELETE FROM user_tile_favorites WHERE user_id = ? AND tile_id = ?');
        $deleteStmt->execute([$user['id'], $tileId]);
        sendJSON(['success' => true, 'isFavorite' => false]);
    } else {
        // Add to favorites
        $insertStmt = $db->prepare('INSERT INTO user_tile_favorites (user_id, tile_id, created_at) VALUES (?, ?, ?)');
        $insertStmt->execute([$user['id'], $tileId, time()]);
        sendJSON(['success' => true, 'isFavorite' => true]);
    }
}

function handleToggleLinkFavorite($linkId) {
    $user = requireAuth();
    $db = getDB();
    
    // Verify link exists
    $checkStmt = $db->prepare('SELECT id FROM links WHERE id = ?');
    $checkStmt->execute([$linkId]);
    $link = $checkStmt->fetch();
    
    if (!$link) {
        sendJSON(['error' => 'Link not found'], 404);
        return;
    }
    
    // Check if already favorited
    $favStmt = $db->prepare('SELECT 1 FROM user_link_favorites WHERE user_id = ? AND link_id = ?');
    $favStmt->execute([$user['id'], $linkId]);
    $isFavorite = $favStmt->fetch() !== false;
    
    if ($isFavorite) {
        // Remove from favorites
        $deleteStmt = $db->prepare('DELETE FROM user_link_favorites WHERE user_id = ? AND link_id = ?');
        $deleteStmt->execute([$user['id'], $linkId]);
        sendJSON(['success' => true, 'isFavorite' => false]);
    } else {
        // Add to favorites
        $insertStmt = $db->prepare('INSERT INTO user_link_favorites (user_id, link_id, created_at) VALUES (?, ?, ?)');
        $insertStmt->execute([$user['id'], $linkId, time()]);
        sendJSON(['success' => true, 'isFavorite' => true]);
    }
}

function handleArchiveCategory($categoryName) {
    $user = requireAuth();
    $db = getDB();
    
    // Decode URL-encoded category name
    $categoryName = urldecode($categoryName);
    
    // Get all tiles in this category that are not already archived or deleted
    $stmt = $db->prepare('SELECT id, user_id FROM tiles WHERE "group" = ? AND deleted_at IS NULL AND archived_at IS NULL');
    $stmt->execute([$categoryName]);
    $tiles = $stmt->fetchAll();
    
    if (empty($tiles)) {
        sendJSON(['error' => 'Category not found or no tiles to archive'], 404);
        return;
    }
    
    // Check if user has permission to archive tiles in this category
    // Only admins or users who created all tiles in the category can archive
    $canArchive = false;
    if ($user['is_admin']) {
        $canArchive = true;
    } else {
        // Check if user is the creator of all tiles or has delete permission
        $allOwned = true;
        foreach ($tiles as $tile) {
            if (!isset($tile['user_id']) || (int)$tile['user_id'] !== (int)$user['id']) {
                // Check for explicit delete permission (required for archive)
                if (!canUserDeleteTile($user['id'], $tile['id'], $db)) {
                    $allOwned = false;
                    break;
                }
            }
        }
        $canArchive = $allOwned;
    }
    
    if (!$canArchive) {
        sendJSON(['error' => 'You do not have permission to archive this category'], 403);
        return;
    }
    
    // Archive all tiles in this category
    $archivedCount = 0;
    $currentTime = time();
    
    $db->beginTransaction();
    try {
        $updateStmt = $db->prepare('UPDATE tiles SET archived_at = ? WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL');
        foreach ($tiles as $tile) {
            $updateStmt->execute([$currentTime, $tile['id']]);
            $archivedCount++;
        }
        
        $db->commit();
        
        sendJSON([
            'success' => true,
            'archivedCount' => $archivedCount,
            'categoryName' => $categoryName
        ]);
    } catch (PDOException $e) {
        $db->rollBack();
        error_log('Database error in handleArchiveCategory: ' . $e->getMessage());
        sendJSON(['error' => 'Database error', 'details' => $e->getMessage()], 500);
    }
}

function handleUnarchiveCategory($categoryName) {
    $user = requireAuth();
    $db = getDB();
    
    // Decode URL-encoded category name
    $categoryName = urldecode($categoryName);
    
    // Get all archived tiles in this category
    $stmt = $db->prepare('SELECT id, user_id FROM tiles WHERE "group" = ? AND archived_at IS NOT NULL AND deleted_at IS NULL');
    $stmt->execute([$categoryName]);
    $tiles = $stmt->fetchAll();
    
    if (empty($tiles)) {
        sendJSON(['error' => 'Category not found in archive or no tiles to unarchive'], 404);
        return;
    }
    
    // Check if user has permission to unarchive tiles in this category
    $canUnarchive = false;
    if ($user['is_admin']) {
        $canUnarchive = true;
    } else {
        // Check if user is the creator of all tiles or has delete permission
        $allOwned = true;
        foreach ($tiles as $tile) {
            if (!isset($tile['user_id']) || (int)$tile['user_id'] !== (int)$user['id']) {
                // Check for explicit delete permission (required for unarchive)
                if (!canUserDeleteTile($user['id'], $tile['id'], $db)) {
                    $allOwned = false;
                    break;
                }
            }
        }
        $canUnarchive = $allOwned;
    }
    
    if (!$canUnarchive) {
        sendJSON(['error' => 'You do not have permission to unarchive this category'], 403);
        return;
    }
    
    // Unarchive all tiles in this category
    $unarchivedCount = 0;
    
    $db->beginTransaction();
    try {
        $updateStmt = $db->prepare('UPDATE tiles SET archived_at = NULL WHERE id = ? AND archived_at IS NOT NULL AND deleted_at IS NULL');
        foreach ($tiles as $tile) {
            $updateStmt->execute([$tile['id']]);
            $unarchivedCount++;
        }
        
        $db->commit();
        
        sendJSON([
            'success' => true,
            'unarchivedCount' => $unarchivedCount,
            'categoryName' => $categoryName
        ]);
    } catch (PDOException $e) {
        $db->rollBack();
        error_log('Database error in handleUnarchiveCategory: ' . $e->getMessage());
        sendJSON(['error' => 'Database error', 'details' => $e->getMessage()], 500);
    }
}

function handleToggleCategoryFavorite($categoryName) {
    $user = requireAuth();
    $db = getDB();
    
    // Decode URL-encoded category name
    $categoryName = urldecode($categoryName);
    
    // Get all tiles in this category that the user can view
    $stmt = $db->prepare('SELECT id FROM tiles WHERE "group" = ? ORDER BY position ASC');
    $stmt->execute([$categoryName]);
    $tiles = $stmt->fetchAll();
    
    if (empty($tiles)) {
        sendJSON(['error' => 'Category not found or empty'], 404);
    }
    
    // Filter tiles by user permissions
    $accessibleTileIds = [];
    foreach ($tiles as $tile) {
        if (canUserViewTile($user['id'], $tile['id'], $db)) {
            $accessibleTileIds[] = $tile['id'];
        }
    }
    
    if (empty($accessibleTileIds)) {
        sendJSON(['error' => 'No accessible tiles in this category'], 403);
    }
    
    // Check how many tiles are currently favorited
    $placeholders = str_repeat('?,', count($accessibleTileIds) - 1) . '?';
    $favStmt = $db->prepare("SELECT tile_id FROM user_tile_favorites WHERE user_id = ? AND tile_id IN ($placeholders)");
    $favStmt->execute(array_merge([$user['id']], $accessibleTileIds));
    $favoritedTileIds = [];
    while ($row = $favStmt->fetch()) {
        $favoritedTileIds[] = $row['tile_id'];
    }
    
    // Determine action: if all are favorited, unfavorite all; otherwise, favorite all
    $allFavorited = count($favoritedTileIds) === count($accessibleTileIds);
    $action = $allFavorited ? 'unfavorite' : 'favorite';
    
    $db->beginTransaction();
    
    try {
        if ($action === 'favorite') {
            // Add all tiles to favorites
            $insertStmt = $db->prepare('INSERT OR IGNORE INTO user_tile_favorites (user_id, tile_id, created_at) VALUES (?, ?, ?)');
            $currentTime = time();
            foreach ($accessibleTileIds as $tileId) {
                if (!in_array($tileId, $favoritedTileIds)) {
                    $insertStmt->execute([$user['id'], $tileId, $currentTime]);
                }
            }
        } else {
            // Remove all tiles from favorites
            $deleteStmt = $db->prepare('DELETE FROM user_tile_favorites WHERE user_id = ? AND tile_id = ?');
            foreach ($accessibleTileIds as $tileId) {
                $deleteStmt->execute([$user['id'], $tileId]);
            }
        }
        
        $db->commit();
        
        sendJSON([
            'success' => true,
            'isFavorite' => !$allFavorited,
            'action' => $action,
            'tilesAffected' => count($accessibleTileIds)
        ]);
        
    } catch (PDOException $e) {
        $db->rollBack();
        error_log('Category favorite toggle error: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to toggle category favorites: ' . $e->getMessage()], 500);
    } catch (Exception $e) {
        $db->rollBack();
        error_log('Category favorite toggle error (non-PDO): ' . $e->getMessage());
        sendJSON(['error' => 'Failed to toggle category favorites: ' . $e->getMessage()], 500);
    }
}


function handleGetFavorites() {
    $user = requireAuth();
    $db = getDB();
    
    // Get all favorited tile IDs for this user
    $stmt = $db->prepare('SELECT tile_id FROM user_tile_favorites WHERE user_id = ? ORDER BY created_at DESC');
    $stmt->execute([$user['id']]);
    $favoriteTileIds = [];
    while ($row = $stmt->fetch()) {
        $favoriteTileIds[] = $row['tile_id'];
    }
    
    // Get all favorited link IDs for this user
    $stmt = $db->prepare('SELECT link_id FROM user_link_favorites WHERE user_id = ? ORDER BY created_at DESC');
    $stmt->execute([$user['id']]);
    $favoriteLinkIds = [];
    while ($row = $stmt->fetch()) {
        $favoriteLinkIds[] = $row['link_id'];
    }
    
    sendJSON([
        'favoriteTileIds' => $favoriteTileIds,
        'favoriteLinkIds' => $favoriteLinkIds
    ]);
}

function handleGetFavoriteLinks() {
    try {
        $user = requireAuth();
        $db = getDB();
        
        // Get all favorited links with their parent tile information
        $stmt = $db->prepare('
            SELECT 
                l.*,
                t.id as tile_id,
                t.title as tile_title,
                t.emoji as tile_emoji,
                t.theme_color as tile_theme_color,
                s.id as section_id
            FROM user_link_favorites ulf
            INNER JOIN links l ON l.id = ulf.link_id
            LEFT JOIN sections s ON l.section_id = s.id
            LEFT JOIN tiles t ON s.tile_id = t.id
            WHERE ulf.user_id = ?
            AND (t.deleted_at IS NULL OR t.id IS NULL)
            AND (t.archived_at IS NULL OR t.id IS NULL)
            ORDER BY ulf.created_at DESC
        ');
        $stmt->execute([$user['id']]);
        
        $favoriteLinks = [];
        while ($row = $stmt->fetch()) {
            // Skip if tile is missing (orphaned link)
            if (!$row['tile_id']) {
                continue;
            }
            
            // Parse health data if available
            $health = null;
            if ($row['health_status']) {
                $health = [
                    'status' => $row['health_status'],
                    'httpCode' => $row['health_http_code'] ?? null,
                    'error' => $row['health_error'] ?? null,
                    'checkedAt' => $row['health_checked_at'] ?? null
                ];
            }
            
            $favoriteLinks[] = [
                'id' => $row['id'],
                'label' => $row['label'],
                'url' => $row['url'],
                'icon' => $row['icon'] ?? null,
                'textColor' => $row['text_color'] ?? null,
                'visibility' => $row['visibility'] ?? 'public',
                'notes' => $row['notes'] ?? null,
                'tooltip' => $row['tooltip'] ?? null,
                'browser' => $row['browser'] ?? null,
                'isFavorite' => true,
                'health' => $health,
                'tile' => [
                    'id' => $row['tile_id'],
                    'title' => $row['tile_title'] ?? 'Untitled',
                    'emoji' => $row['tile_emoji'] ?? '✨',
                    'themeColor' => $row['tile_theme_color'] ?? 'blue'
                ]
            ];
        }
        
        sendJSON($favoriteLinks);
    } catch (Exception $e) {
        error_log('Error in handleGetFavoriteLinks: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to fetch favorite links', 'details' => $e->getMessage()], 500);
    }
}


function handleGetRecycleBin() {
    try {
        $user = requireAuth();
        $db = getDB();
    
    // Get soft-deleted tiles (deleted_at IS NOT NULL)
    // Users can only see their own deleted tiles, admins can see all
    if ($user['is_admin']) {
        // Admins can see all deleted tiles
        $stmt = $db->prepare('SELECT * FROM tiles WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC');
        $stmt->execute();
    } else {
        // Regular users can only see their own deleted tiles
        $stmt = $db->prepare('SELECT * FROM tiles WHERE deleted_at IS NOT NULL AND user_id = ? ORDER BY deleted_at DESC');
        $stmt->execute([$user['id']]);
    }
    
    $tiles = [];
    $tilesById = [];
    
    while ($row = $stmt->fetch()) {
        // For recycle bin, we only show tiles owned by the user (already filtered in query)
        // No need for additional visibility/permission checks since recycle bin is user-specific
        
        // Check if this tile is favorited by the current user
        $isFavorite = false;
        if ($user) {
            $favStmt = $db->prepare('SELECT 1 FROM user_tile_favorites WHERE user_id = ? AND tile_id = ?');
            $favStmt->execute([$user['id'], $row['id']]);
            $isFavorite = $favStmt->fetch() !== false;
        }
        
        $tile = [
            'id' => $row['id'],
            'title' => $row['title'],
            'description' => $row['description'],
            'htmlContent' => $row['html_content'],
            'emoji' => $row['emoji'],
            'themeColor' => $row['theme_color'],
            'group' => $row['group'],
            'createdAt' => (int)$row['created_at'],
            'deletedAt' => (int)$row['deleted_at'],
            'visibility' => $tileVisibility,
            'allowedUsers' => $tileAllowedUsers,
            'isFavorite' => $isFavorite,
            'isHyperlink' => isset($row['is_hyperlink']) ? (bool)$row['is_hyperlink'] : false,
            'hyperlinkUrl' => $row['hyperlink_url'] ?? null,
            'openInNewTab' => isset($row['open_in_new_tab']) ? (bool)$row['open_in_new_tab'] : null,
            'canView' => $canView,
            'canEdit' => false, // Deleted tiles cannot be edited
            'canDelete' => true, // Can permanently delete from recycle bin
            'visibleFrom' => $row['visible_from'] ?? null,
            'expiresAt' => $row['expires_at'] ?? null,
            'tabs' => []
        ];
        
        // Get tabs for this tile
        $tabStmt = $db->prepare('SELECT * FROM tabs WHERE tile_id = ? ORDER BY position ASC');
        $tabStmt->execute([$row['id']]);
        $tabs = [];
        
        while ($tabRow = $tabStmt->fetch()) {
            $tab = [
                'id' => $tabRow['id'],
                'title' => $tabRow['title'],
                'position' => (int)($tabRow['position'] ?? 0),
                'textColor' => (!empty($tabRow['text_color']) && trim($tabRow['text_color']) !== '') ? trim($tabRow['text_color']) : null,
                'visibleFrom' => $tabRow['visible_from'] ?? null,
                'expiresAt' => $tabRow['expires_at'] ?? null,
                'sections' => []
            ];
            
            // Get sections for this tab
            $sectionStmt = $db->prepare('SELECT * FROM sections WHERE tab_id = ? ORDER BY id');
            $sectionStmt->execute([$tabRow['id']]);
            
            while ($sectionRow = $sectionStmt->fetch()) {
                $section = [
                    'id' => $sectionRow['id'],
                    'title' => $sectionRow['title'],
                    'textColor' => isset($sectionRow['text_color']) ? $sectionRow['text_color'] : null,
                    'visibleFrom' => $sectionRow['visible_from'] ?? null,
                    'expiresAt' => $sectionRow['expires_at'] ?? null,
                    'forceStackedView' => isset($sectionRow['force_stacked_view']) && $sectionRow['force_stacked_view'] == 1 ? true : false,
                    'links' => []
                ];
                
                // Get links for this section
                $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ?');
                $linkStmt->execute([$sectionRow['id']]);
                
                while ($linkRow = $linkStmt->fetch()) {
                    $link = [
                        'id' => $linkRow['id'],
                        'label' => $linkRow['label'],
                        'url' => $linkRow['url'],
                        'icon' => $linkRow['icon'] ?? null,
                        'textColor' => $linkRow['text_color'] ?? null,
                        'visibility' => $linkRow['visibility'] ?? 'public',
                        'allowedUsers' => $linkRow['allowed_users'] ? json_decode($linkRow['allowed_users'], true) : [],
                        'notes' => $linkRow['notes'] ?? null,
                        'tooltip' => $linkRow['tooltip'] ?? null,
                        'visibleFrom' => $linkRow['visible_from'] ?? null,
                        'expiresAt' => $linkRow['expires_at'] ?? null,
                        'browser' => $linkRow['browser'] ?? null
                    ];
                    
                    // Include health data if available
                    if (isset($linkRow['health_status'])) {
                        $link['health'] = [
                            'status' => $linkRow['health_status'] ?? 'unknown',
                            'httpCode' => $linkRow['health_http_code'] ? (int)$linkRow['health_http_code'] : null,
                            'error' => $linkRow['health_error'],
                            'checkedAt' => $linkRow['health_checked_at'] ? (int)$linkRow['health_checked_at'] : null
                        ];
                    }
                    
                    $section['links'][] = $link;
                }
                
                // Get rich text content for this section
                $richTextStmt = $db->prepare('SELECT * FROM rich_text_content WHERE section_id = ? ORDER BY position ASC');
                $richTextStmt->execute([$sectionRow['id']]);
                $section['richTextContent'] = [];
                while ($richTextRow = $richTextStmt->fetch()) {
                    $section['richTextContent'][] = [
                        'id' => $richTextRow['id'],
                        'content' => $richTextRow['content'],
                        'position' => (int)($richTextRow['position'] ?? 0)
                    ];
                }
                
                $tab['sections'][] = $section;
            }
            
            $tabs[] = $tab;
        }
        
        $tile['tabs'] = $tabs;
        $tile['sections'] = [];
        foreach ($tabs as $tab) {
            $tile['sections'] = array_merge($tile['sections'], $tab['sections']);
        }
        
        $tiles[] = $tile;
        $tilesById[$row['id']] = $tile;
    }
    
    sendJSON($tiles);
    } catch (PDOException $e) {
        error_log('Database error in handleGetRecycleBin: ' . $e->getMessage());
        error_log('SQL State: ' . $e->getCode());
        error_log('File: ' . $e->getFile() . ' Line: ' . $e->getLine());
        sendJSON(['error' => 'Database error while fetching recycle bin', 'details' => $e->getMessage()], 500);
    } catch (Exception $e) {
        error_log('Error in handleGetRecycleBin: ' . $e->getMessage());
        error_log('File: ' . $e->getFile() . ' Line: ' . $e->getLine());
        sendJSON(['error' => 'An error occurred while fetching recycle bin', 'details' => $e->getMessage()], 500);
    }
}

function handleRestoreTile($tileId) {
    $user = requireAuth();
    $db = getDB();
    
    // Verify tile exists and is deleted
    $checkStmt = $db->prepare('SELECT id, user_id FROM tiles WHERE id = ? AND deleted_at IS NOT NULL');
    $checkStmt->execute([$tileId]);
    $tile = $checkStmt->fetch();
    
    if (!$tile) {
        sendJSON(['error' => 'Tile not found in recycle bin'], 404);
    }
    
    // Check if user has permission to restore this tile
    // Only admins or the original creator can restore (recycle bin is user-specific)
    $canRestore = false;
    if ($user['is_admin']) {
        $canRestore = true;
    } else {
        // Regular users can only restore their own tiles
        $isCreator = isset($tile['user_id']) && (int)$tile['user_id'] === (int)$user['id'];
        if ($isCreator) {
            $canRestore = true;
        }
    }
    
    if (!$canRestore) {
        sendJSON(['error' => 'You do not have permission to restore this tile'], 403);
    }
    
    // Restore tile by clearing deleted_at
    $stmt = $db->prepare('UPDATE tiles SET deleted_at = NULL WHERE id = ?');
    $stmt->execute([$tileId]);
    
    sendJSON(['success' => true]);
}

function handleGetArchive() {
    try {
        $user = requireAuth();
        $db = getDB();
        
        // Ensure tabs table has position column (migration)
        $hasPosition = false;
        try {
            $tabColumns = $db->query("PRAGMA table_info(tabs)")->fetchAll(PDO::FETCH_ASSOC);
            foreach ($tabColumns as $col) {
                if (strtolower($col['name']) === 'position') {
                    $hasPosition = true;
                    break;
                }
            }
            if (!$hasPosition) {
                $db->exec('ALTER TABLE tabs ADD COLUMN position INTEGER DEFAULT 0');
                $hasPosition = true; // Assume it was added successfully
            }
        } catch (PDOException $e) {
            error_log('Error migrating tabs position column: ' . $e->getMessage());
            $hasPosition = false; // Safe fallback
        }
        
        // Check if archived_at column exists
        try {
            $columns = $db->query("PRAGMA table_info(tiles)")->fetchAll(PDO::FETCH_ASSOC);
            $hasArchivedAt = false;
            foreach ($columns as $column) {
                if (strtolower($column['name']) === 'archived_at') {
                    $hasArchivedAt = true;
                    break;
                }
            }
            
            if (!$hasArchivedAt) {
                // Column doesn't exist, return empty array
                sendJSON([]);
                return;
            }
        } catch (Exception $e) {
            error_log('Error checking for archived_at column: ' . $e->getMessage());
            // If we can't check, try the query anyway - it will fail gracefully
        }
        
        // Get all archived tiles (archived_at IS NOT NULL and deleted_at IS NULL)
        $stmt = $db->prepare('SELECT * FROM tiles WHERE archived_at IS NOT NULL AND deleted_at IS NULL ORDER BY archived_at DESC');
        if (!$stmt) {
            error_log('Failed to prepare archive query: ' . json_encode($db->errorInfo()));
            sendJSON(['error' => 'Database query preparation failed'], 500);
            return;
        }
        
        $result = $stmt->execute();
        if (!$result) {
            error_log('Failed to execute archive query: ' . json_encode($stmt->errorInfo()));
            sendJSON(['error' => 'Database query execution failed'], 500);
            return;
        }
        
        // $hasPosition is already set above from the migration check
        $tiles = [];
        $tilesById = [];
        
        while ($row = $stmt->fetch()) {
            // Filter tiles based on visibility (same logic as recycle bin)
            $tileVisibility = $row['visibility'] ?? 'public';
            $tileAllowedUsers = $row['allowed_users'] ? json_decode($row['allowed_users'], true) : [];
            
            $isTileVisible = false;
            if ($user && $user['is_admin']) {
                $isTileVisible = true;
            } elseif ($tileVisibility === 'public') {
                $isTileVisible = true;
            } elseif ($tileVisibility === 'authenticated' && $user) {
                $isTileVisible = true;
            } elseif ($tileVisibility === 'private' && $user) {
                $isTileVisible = in_array($user['id'], $tileAllowedUsers);
            }
            
            if (!$isTileVisible) {
                continue;
            }
            
            // Check if user has permission to view this tile
            $canView = true;
            if ($user) {
                if ($user['is_admin']) {
                    $canView = true;
                } else {
                    $isCreator = isset($row['user_id']) && (int)$row['user_id'] === (int)$user['id'];
                    if ($isCreator) {
                        $canView = true;
                    } else {
                        $permStmt = $db->prepare('SELECT can_view FROM user_tile_permissions WHERE user_id = ? AND tile_id = ?');
                        $permStmt->execute([$user['id'], $row['id']]);
                        $permission = $permStmt->fetch();
                        if ($permission) {
                            $canView = (bool)$permission['can_view'];
                        }
                    }
                }
            }
            
            if ($user && !$canView) {
                continue;
            }
            
            // Check if this tile is favorited by the current user
            $isFavorite = false;
            if ($user) {
                $favStmt = $db->prepare('SELECT 1 FROM user_tile_favorites WHERE user_id = ? AND tile_id = ?');
                $favStmt->execute([$user['id'], $row['id']]);
                $isFavorite = $favStmt->fetch() !== false;
            }
            
            // Get user tile permissions for delete permission
            $canDelete = false; // Default: no delete access (unless explicitly granted)
            if ($user) {
                // Admins have full access to everything
                if ($user['is_admin']) {
                    $canDelete = true;
                } else {
                    // Check if user is the creator of the tile
                    $isCreator = isset($row['user_id']) && (int)$row['user_id'] === (int)$user['id'];
                    
                    if ($isCreator) {
                        // Creators have full access to their own tiles
                        $canDelete = true;
                    } else {
                        // Check for explicit permissions
                        $permStmt = $db->prepare('SELECT can_delete FROM user_tile_permissions WHERE user_id = ? AND tile_id = ?');
                        $permStmt->execute([$user['id'], $row['id']]);
                        $permission = $permStmt->fetch();
                        
                        if ($permission) {
                            $canDelete = (bool)$permission['can_delete'];
                        }
                        // If no permission record exists, use default (no delete access)
                    }
                }
            }
            
            $tile = [
                'id' => $row['id'],
                'title' => $row['title'],
                'description' => $row['description'],
                'htmlContent' => $row['html_content'],
                'emoji' => $row['emoji'],
                'themeColor' => $row['theme_color'],
                'group' => $row['group'],
                'createdAt' => (int)$row['created_at'],
                'archivedAt' => isset($row['archived_at']) && $row['archived_at'] !== null ? (int)$row['archived_at'] : null,
                'visibility' => $tileVisibility,
                'allowedUsers' => $tileAllowedUsers,
                'isFavorite' => $isFavorite,
                'isHyperlink' => isset($row['is_hyperlink']) ? (bool)$row['is_hyperlink'] : false,
                'hyperlinkUrl' => $row['hyperlink_url'] ?? null,
                'openInNewTab' => isset($row['open_in_new_tab']) ? (bool)$row['open_in_new_tab'] : null,
                'canView' => $canView,
                'canEdit' => false, // Archived tiles cannot be edited
                'canDelete' => $canDelete, // Allow delete from archive (moves to recycle bin)
                'visibleFrom' => $row['visible_from'] ?? null,
                'expiresAt' => $row['expires_at'] ?? null,
                'tabs' => []
            ];
            
            // Load tabs and sections (similar to recycle bin)
            // Use safe query that doesn't require position column
            try {
                if ($hasPosition) {
                    $tabStmt = $db->prepare("SELECT * FROM tabs WHERE tile_id = ? ORDER BY position ASC");
                } else {
                    $tabStmt = $db->prepare("SELECT * FROM tabs WHERE tile_id = ? ORDER BY id ASC");
                }
                $tabStmt->execute([$row['id']]);
            } catch (PDOException $e) {
                // If position column doesn't exist, fall back to id ordering
                if (strpos($e->getMessage(), 'no such column: position') !== false || strpos($e->getMessage(), 'position') !== false) {
                    $hasPosition = false; // Update flag for future iterations
                    $tabStmt = $db->prepare("SELECT * FROM tabs WHERE tile_id = ? ORDER BY id ASC");
                    $tabStmt->execute([$row['id']]);
                } else {
                    throw $e;
                }
            }
            
            $tabs = [];
            while ($tabRow = $tabStmt->fetch()) {
                $tab = [
                    'id' => $tabRow['id'],
                    'title' => $tabRow['title'],
                    'position' => isset($tabRow['position']) ? (int)$tabRow['position'] : 0,
                    'textColor' => (!empty($tabRow['text_color']) && trim($tabRow['text_color']) !== '') ? trim($tabRow['text_color']) : null,
                    'sections' => []
                ];
                
                // Get sections for this tab, ordered by position
                $sectionStmt = $db->prepare('SELECT * FROM sections WHERE tab_id = ? ORDER BY position ASC, id ASC');
                $sectionStmt->execute([$tabRow['id']]);
                
                while ($sectionRow = $sectionStmt->fetch()) {
                    $section = [
                        'id' => $sectionRow['id'],
                        'title' => $sectionRow['title'],
                        'visibleFrom' => $sectionRow['visible_from'] ?? null,
                        'expiresAt' => $sectionRow['expires_at'] ?? null,
                        'forceStackedView' => isset($sectionRow['force_stacked_view']) && $sectionRow['force_stacked_view'] == 1 ? true : false,
                        'position' => isset($sectionRow['position']) ? (int)$sectionRow['position'] : 0,
                        'links' => []
                    ];
                    
                    $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ?');
                    $linkStmt->execute([$sectionRow['id']]);
                    
                    while ($linkRow = $linkStmt->fetch()) {
                        $link = [
                            'id' => $linkRow['id'],
                            'label' => $linkRow['label'],
                            'url' => $linkRow['url'],
                            'icon' => $linkRow['icon'] ?? null,
                            'textColor' => $linkRow['text_color'] ?? null,
                            'visibility' => $linkRow['visibility'] ?? 'public',
                            'allowedUsers' => $linkRow['allowed_users'] ? json_decode($linkRow['allowed_users'], true) : [],
                            'notes' => $linkRow['notes'] ?? null,
                            'tooltip' => $linkRow['tooltip'] ?? null,
                            'visibleFrom' => $linkRow['visible_from'] ?? null,
                            'expiresAt' => $linkRow['expires_at'] ?? null,
                            'browser' => $linkRow['browser'] ?? null
                        ];
                        
                        if (isset($linkRow['health_status'])) {
                            $link['health'] = [
                                'status' => $linkRow['health_status'] ?? 'unknown',
                                'httpCode' => $linkRow['health_http_code'] ? (int)$linkRow['health_http_code'] : null,
                                'error' => $linkRow['health_error'],
                                'checkedAt' => $linkRow['health_checked_at'] ? (int)$linkRow['health_checked_at'] : null
                            ];
                        }
                        
                    $section['links'][] = $link;
                }
                
                // Get rich text content for this section
                $richTextStmt = $db->prepare('SELECT * FROM rich_text_content WHERE section_id = ? ORDER BY position ASC');
                $richTextStmt->execute([$sectionRow['id']]);
                $section['richTextContent'] = [];
                while ($richTextRow = $richTextStmt->fetch()) {
                    $section['richTextContent'][] = [
                        'id' => $richTextRow['id'],
                        'content' => $richTextRow['content'],
                        'position' => (int)($richTextRow['position'] ?? 0)
                    ];
                }
                
                $tab['sections'][] = $section;
            }
            
            $tabs[] = $tab;
        }
        
        $tile['tabs'] = $tabs;
            $tile['sections'] = [];
            foreach ($tile['tabs'] as $tab) {
                $tile['sections'] = array_merge($tile['sections'], $tab['sections']);
            }
            
            $tiles[] = $tile;
            $tilesById[$row['id']] = $tile;
        }
        
        sendJSON($tiles);
    } catch (PDOException $e) {
        error_log('Database error in handleGetArchive: ' . $e->getMessage());
        error_log('SQL State: ' . $e->getCode());
        error_log('File: ' . $e->getFile() . ' Line: ' . $e->getLine());
        sendJSON(['error' => 'Database error', 'details' => $e->getMessage(), 'code' => $e->getCode()], 500);
    } catch (Exception $e) {
        error_log('Error in handleGetArchive: ' . $e->getMessage());
        error_log('File: ' . $e->getFile() . ' Line: ' . $e->getLine());
        sendJSON(['error' => 'An error occurred while fetching archive', 'details' => $e->getMessage()], 500);
    }
}

function handleArchiveTile($tileId) {
    $user = requireAuth();
    $db = getDB();
    
    // Verify tile exists and is not already archived or deleted
    $checkStmt = $db->prepare('SELECT id, user_id FROM tiles WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL');
    $checkStmt->execute([$tileId]);
    $tile = $checkStmt->fetch();
    
    if (!$tile) {
        sendJSON(['error' => 'Tile not found or already archived/deleted', 'details' => 'Tile may not exist or may already be archived or deleted'], 404);
        return;
    }
    
    // Check if user has permission to archive this tile (same as delete permission)
    if (!canUserDeleteTile($user['id'], $tileId, $db)) {
        sendJSON(['error' => 'You do not have permission to archive this tile', 'details' => 'User does not have delete permission for this tile'], 403);
        return;
    }
    
    // Archive tile by setting archived_at timestamp
    try {
        $stmt = $db->prepare('UPDATE tiles SET archived_at = ? WHERE id = ?');
        $result = $stmt->execute([time(), $tileId]);
        
        if (!$result) {
            error_log('Failed to archive tile: ' . json_encode($stmt->errorInfo()));
            sendJSON(['error' => 'Failed to archive tile', 'details' => 'Database update failed'], 500);
            return;
        }
        
        sendJSON(['success' => true, 'message' => 'Tile archived successfully']);
    } catch (PDOException $e) {
        error_log('Database error in handleArchiveTile: ' . $e->getMessage());
        sendJSON(['error' => 'Database error', 'details' => $e->getMessage()], 500);
    }
}

function handleUnarchiveTile($tileId) {
    $user = requireAuth();
    $db = getDB();
    
    // Verify tile exists and is archived
    $checkStmt = $db->prepare('SELECT id, user_id FROM tiles WHERE id = ? AND archived_at IS NOT NULL AND deleted_at IS NULL');
    $checkStmt->execute([$tileId]);
    $tile = $checkStmt->fetch();
    
    if (!$tile) {
        sendJSON(['error' => 'Tile not found in archive'], 404);
    }
    
    // Check if user has permission to unarchive this tile (same as restore permission)
    $canUnarchive = false;
    if ($user['is_admin']) {
        $canUnarchive = true;
    } else {
        $isCreator = isset($tile['user_id']) && (int)$tile['user_id'] === (int)$user['id'];
        if ($isCreator) {
            $canUnarchive = true;
        } else {
            if (canUserDeleteTile($user['id'], $tileId, $db)) {
                $canUnarchive = true;
            }
        }
    }
    
    if (!$canUnarchive) {
        sendJSON(['error' => 'You do not have permission to unarchive this tile'], 403);
    }
    
    // Unarchive tile by clearing archived_at
    $stmt = $db->prepare('UPDATE tiles SET archived_at = NULL WHERE id = ?');
    $stmt->execute([$tileId]);
    
    sendJSON(['success' => true]);
}

function handlePermanentDeleteTile($tileId) {
    $user = requireAuth();
    $db = getDB();
    
    // Verify tile exists and is deleted (in recycle bin)
    $checkStmt = $db->prepare('SELECT id, user_id FROM tiles WHERE id = ? AND deleted_at IS NOT NULL');
    $checkStmt->execute([$tileId]);
    $tile = $checkStmt->fetch();
    
    if (!$tile) {
        sendJSON(['error' => 'Tile not found in recycle bin'], 404);
    }
    
    // Check if user has permission to permanently delete this tile
    // Only admins or the original creator can permanently delete (recycle bin is user-specific)
    $canDelete = false;
    if ($user['is_admin']) {
        $canDelete = true;
    } else {
        // Regular users can only permanently delete their own tiles
        $isCreator = isset($tile['user_id']) && (int)$tile['user_id'] === (int)$user['id'];
        if ($isCreator) {
            $canDelete = true;
        }
    }
    
    if (!$canDelete) {
        sendJSON(['error' => 'You do not have permission to permanently delete this tile'], 403);
    }
    
    // Permanently delete tile (cascade will delete sections, links, and tabs)
    $stmt = $db->prepare('DELETE FROM tiles WHERE id = ?');
    $stmt->execute([$tileId]);
    
    sendJSON(['success' => true]);
}

function handlePermanentDeleteCategory($categoryName) {
    $user = requireAuth();
    $db = getDB();
    
    // Decode URL-encoded category name
    $categoryName = urldecode($categoryName);
    
    // Get soft-deleted tiles in this category
    // Users can only see their own deleted tiles, admins can see all
    if ($user['is_admin']) {
        $stmt = $db->prepare('SELECT id, user_id FROM tiles WHERE deleted_at IS NOT NULL AND "group" = ?');
        $stmt->execute([$categoryName]);
    } else {
        // Regular users can only see their own deleted tiles in this category
        $stmt = $db->prepare('SELECT id, user_id FROM tiles WHERE deleted_at IS NOT NULL AND "group" = ? AND user_id = ?');
        $stmt->execute([$categoryName, $user['id']]);
    }
    $deletedTiles = $stmt->fetchAll();
    
    if (empty($deletedTiles)) {
        sendJSON(['error' => 'No tiles found in this category in recycle bin'], 404);
    }
    
    // Permanently delete all tiles in this category from recycle bin
    // Cascade will delete sections, links, and tabs
    if ($user['is_admin']) {
        $deleteStmt = $db->prepare('DELETE FROM tiles WHERE deleted_at IS NOT NULL AND "group" = ?');
        $deleteStmt->execute([$categoryName]);
    } else {
        // Regular users can only delete their own tiles in this category
        $deleteStmt = $db->prepare('DELETE FROM tiles WHERE deleted_at IS NOT NULL AND "group" = ? AND user_id = ?');
        $deleteStmt->execute([$categoryName, $user['id']]);
    }
    $purgedCount = $deleteStmt->rowCount();
    
    sendJSON(['success' => true, 'purgedCount' => $purgedCount, 'categoryName' => $categoryName]);
}

function handlePurgeRecycleBin() {
    $user = requireAuth();
    $db = getDB();
    
    // Users can purge their own recycle bin, admins can purge all
    if ($user['is_admin']) {
        // Admins can purge all deleted tiles
        $deleteStmt = $db->prepare('DELETE FROM tiles WHERE deleted_at IS NOT NULL');
        $deleteStmt->execute();
        $purgedCount = $deleteStmt->rowCount();
    } else {
        // Regular users can only purge their own deleted tiles
        $deleteStmt = $db->prepare('DELETE FROM tiles WHERE deleted_at IS NOT NULL AND user_id = ?');
        $deleteStmt->execute([$user['id']]);
        $purgedCount = $deleteStmt->rowCount();
    }
    
    sendJSON(['success' => true, 'purgedCount' => $purgedCount]);
}

function handlePurgeArchive() {
    $user = requireAuth();
    $db = getDB();
    
    // Only admins can purge the archive
    if (!$user['is_admin']) {
        sendJSON(['error' => 'Only administrators can purge the archive'], 403);
        return;
    }
    
    // Get all archived tiles
    $stmt = $db->prepare('SELECT id FROM tiles WHERE archived_at IS NOT NULL AND deleted_at IS NULL');
    $stmt->execute();
    $archivedTiles = $stmt->fetchAll();
    
    $purgedCount = 0;
    
    // Move all archived tiles to recycle bin (set deleted_at and clear archived_at)
    // They can then be permanently deleted from recycle bin
    $updateStmt = $db->prepare('UPDATE tiles SET deleted_at = ?, archived_at = NULL WHERE archived_at IS NOT NULL AND deleted_at IS NULL');
    $updateStmt->execute([time()]);
    $purgedCount = $updateStmt->rowCount();
    
    sendJSON(['success' => true, 'purgedCount' => $purgedCount]);
}
