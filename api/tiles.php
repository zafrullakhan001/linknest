<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

switch ($method) {
    case 'GET':
        if ($path === '' || $path === '/') {
            handleGetTiles();
        } elseif (preg_match('#^/([^/]+)$#', $path, $matches)) {
            handleGetTile($matches[1]);
        } elseif ($path === '/favorites' || $path === '/favorites/') {
            handleGetFavorites();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'POST':
        if ($path === '' || $path === '/') {
            handleCreateTile();
        } elseif ($path === '/bulk-import' || $path === '/bulk-import/') {
            handleBulkImport();
        } elseif (preg_match('#^/category/([^/]+)/clone$#', $path, $matches)) {
            handleCloneCategory($matches[1]);
        } elseif (preg_match('#^/category/([^/]+)/favorite$#', $path, $matches)) {
            handleToggleCategoryFavorite($matches[1]);
        } elseif (preg_match('#^/([^/]+)/favorite$#', $path, $matches)) {
            handleToggleFavorite($matches[1]);
        } elseif (preg_match('#^/([^/]+)/clone$#', $path, $matches)) {
            handleCloneTile($matches[1]);
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
        if (preg_match('#^/([^/]+)$#', $path, $matches)) {
            handleDeleteTile($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleGetTiles() {
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
    $stmt = $db->prepare('SELECT * FROM tiles ORDER BY position ASC');
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
            'canView' => $canView,
            'canEdit' => $canEdit,
            'canDelete' => $canDelete,
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
                    'visibleFrom' => $sectionRow['visible_from'] ?? null,
                    'expiresAt' => $sectionRow['expires_at'] ?? null,
                    'links' => []
                ];
                
                // Get links for this section with visibility filtering
                $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ?');
                $linkStmt->execute([$sectionRow['id']]);
                
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
                        'visibility' => $visibility,
                        'allowedUsers' => $allowedUsers,
                        'notes' => $linkRow['notes'] ?? null,
                        'tooltip' => $linkRow['tooltip'] ?? null,
                        'visibleFrom' => $linkRow['visible_from'] ?? null,
                        'expiresAt' => $linkRow['expires_at'] ?? null
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
                        'links' => []
                    ];
                    
                    $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ?');
                    $linkStmt->execute([$sectionRow['id']]);
                    
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
                            'visibility' => $visibility,
                            'allowedUsers' => $allowedUsers,
                            'notes' => $linkRow['notes'] ?? null,
                            'tooltip' => $linkRow['tooltip'] ?? null
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
            
            // Reload tiles with updated positions
            $stmt = $db->prepare('SELECT * FROM tiles ORDER BY position ASC');
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
    
    $stmt = $db->prepare('SELECT * FROM tiles WHERE id = ?');
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
        $tab = [
            'id' => $tabRow['id'],
            'title' => $tabRow['title'],
            'position' => (int)($tabRow['position'] ?? 0),
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
                'visibleFrom' => $sectionRow['visible_from'] ?? null,
                'expiresAt' => $sectionRow['expires_at'] ?? null,
                'links' => []
            ];
            
            // Get links with visibility filtering
            $user = getAuthenticatedUser();
            $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ?');
            $linkStmt->execute([$sectionRow['id']]);
            
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
                    'visibility' => $visibility,
                    'allowedUsers' => $allowedUsers,
                    'notes' => $linkRow['notes'] ?? null,
                    'tooltip' => $linkRow['tooltip'] ?? null,
                    'visibleFrom' => $linkRow['visible_from'] ?? null,
                    'expiresAt' => $linkRow['expires_at'] ?? null
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
                $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ?');
                $linkStmt->execute([$sectionRow['id']]);
                
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
                        'visibility' => $visibility,
                        'allowedUsers' => $allowedUsers,
                        'notes' => $linkRow['notes'] ?? null,
                        'tooltip' => $linkRow['tooltip'] ?? null
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
    $user = requireAuth();
    $data = getJSONInput();
    
    if (!isset($data['title'])) {
        sendJSON(['error' => 'Title is required'], 400);
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
    
    $stmt = $db->prepare('INSERT INTO tiles (id, user_id, title, description, html_content, emoji, theme_color, "group", visibility, allowed_users, is_hyperlink, hyperlink_url, open_in_new_tab, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    
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
        $data['createdAt'] ?? time()
    ])) {
        sendJSON(['error' => 'Failed to create tile'], 500);
    }
    
    // Handle tabs (new structure) or sections (backward compatibility)
    if (isset($data['tabs']) && is_array($data['tabs'])) {
        // New structure with tabs
        foreach ($data['tabs'] as $tabIndex => $tab) {
            $tabId = $tab['id'] ?? uniqid('tab_', true);
            $tabStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position, visible_from, expires_at) VALUES (?, ?, ?, ?, ?, ?)');
            $tabStmt->execute([
                $tabId,
                $tileId,
                $tab['title'] ?? 'New Tab',
                $tab['position'] ?? $tabIndex,
                $tab['visibleFrom'] ?? null,
                $tab['expiresAt'] ?? null
            ]);
            
            // Insert sections for this tab
            if (isset($tab['sections']) && is_array($tab['sections'])) {
                foreach ($tab['sections'] as $section) {
                    $sectionId = $section['id'] ?? uniqid('section_', true);
                    $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, visible_from, expires_at) VALUES (?, ?, ?, ?, ?, ?)');
                    $sectionStmt->execute([
                        $sectionId,
                        $tileId,
                        $tabId,
                        $section['title'] ?? '',
                        $section['visibleFrom'] ?? null,
                        $section['expiresAt'] ?? null
                    ]);
                    
                    // Insert links for this section
                    if (isset($section['links']) && is_array($section['links'])) {
                        foreach ($section['links'] as $link) {
                            $linkId = $link['id'] ?? uniqid('link_', true);
                            $visibility = $link['visibility'] ?? 'public';
                            $allowedUsers = isset($link['allowedUsers']) && is_array($link['allowedUsers']) 
                                ? json_encode($link['allowedUsers']) 
                                : null;
                            $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, visibility, allowed_users, notes, tooltip, visible_from, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
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
                                $link['expiresAt'] ?? null
                            ]);
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
        
        foreach ($data['sections'] as $section) {
            $sectionId = $section['id'] ?? uniqid('section_', true);
            $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title) VALUES (?, ?, ?, ?)');
            $sectionStmt->execute([
                $sectionId,
                $tileId,
                $defaultTabId,
                $section['title'] ?? ''
            ]);
            
            if (isset($section['links']) && is_array($section['links'])) {
                foreach ($section['links'] as $link) {
                    $linkId = $link['id'] ?? uniqid('link_', true);
                    $visibility = $link['visibility'] ?? 'public';
                    $allowedUsers = isset($link['allowedUsers']) && is_array($link['allowedUsers']) 
                        ? json_encode($link['allowedUsers']) 
                        : null;
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
                }
            }
        }
    }
    
    sendJSON(['success' => true, 'id' => $tileId], 201);
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
        
        // Update tile
        $stmt = $db->prepare('UPDATE tiles SET title = ?, description = ?, html_content = ?, emoji = ?, theme_color = ?, "group" = ?, visibility = ?, allowed_users = ?, is_hyperlink = ?, hyperlink_url = ?, open_in_new_tab = ? WHERE id = ?');
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
            $tileId
        ]);
        
        // Delete existing tabs, sections, and links
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
            
            // New structure with tabs
            foreach ($data['tabs'] as $tabIndex => $tab) {
                $tabId = $tab['id'] ?? uniqid('tab_', true);
                $tabStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position, visible_from, expires_at) VALUES (?, ?, ?, ?, ?, ?)');
                $tabStmt->execute([
                    $tabId,
                    $tileId,
                    $tab['title'] ?? 'New Tab',
                    $tab['position'] ?? $tabIndex,
                    $tab['visibleFrom'] ?? null,
                    $tab['expiresAt'] ?? null
                ]);
                
                // Insert sections for this tab
                if (isset($tab['sections']) && is_array($tab['sections'])) {
                    foreach ($tab['sections'] as $section) {
                        $sectionId = $section['id'] ?? uniqid('section_', true);
                        $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, visible_from, expires_at) VALUES (?, ?, ?, ?, ?, ?)');
                        $sectionStmt->execute([
                            $sectionId,
                            $tileId,
                            $tabId,
                            $section['title'] ?? '',
                            $section['visibleFrom'] ?? null,
                            $section['expiresAt'] ?? null
                        ]);
                        
                        // Insert links for this section
                        if (isset($section['links']) && is_array($section['links'])) {
                            foreach ($section['links'] as $link) {
                                $linkId = $link['id'] ?? uniqid('link_', true);
                                $visibility = $link['visibility'] ?? 'public';
                                $allowedUsers = isset($link['allowedUsers']) && is_array($link['allowedUsers']) 
                                    ? json_encode($link['allowedUsers']) 
                                    : null;
                                $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, visibility, allowed_users, notes, tooltip, visible_from, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
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
                                    $link['expiresAt'] ?? null
                                ]);
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
            
            foreach ($data['sections'] as $section) {
                $sectionId = $section['id'] ?? uniqid('section_', true);
                $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title) VALUES (?, ?, ?, ?)');
                $sectionStmt->execute([
                    $sectionId,
                    $tileId,
                    $defaultTabId,
                    $section['title'] ?? ''
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
                    }
                }
            }
        }
        
        // Commit the transaction
        $db->commit();
        
        // Log success with tab count for debugging
        $finalTabCount = isset($data['tabs']) && is_array($data['tabs']) ? count($data['tabs']) : 0;
        error_log('Successfully updated tile ' . $tileId . ' with ' . $finalTabCount . ' tabs');
        
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
    
    // Verify tile exists
    $checkStmt = $db->prepare('SELECT id FROM tiles WHERE id = ?');
    $checkStmt->execute([$tileId]);
    $tile = $checkStmt->fetch();
    
    if (!$tile) {
        sendJSON(['error' => 'Tile not found'], 404);
    }
    
    // Check if user has permission to delete this tile
    if (!canUserDeleteTile($user['id'], $tileId, $db)) {
        sendJSON(['error' => 'You do not have permission to delete this tile'], 403);
    }
    
    // Delete tile (cascade will delete sections and links)
    $stmt = $db->prepare('DELETE FROM tiles WHERE id = ?');
    $stmt->execute([$tileId]);
    
    sendJSON(['success' => true]);
}

function handleCloneTile($tileId) {
    $user = requireAuth();
    $db = getDB();
    
    // Get the original tile
    $stmt = $db->prepare('SELECT * FROM tiles WHERE id = ?');
    $stmt->execute([$tileId]);
    $originalTile = $stmt->fetch();
    
    if (!$originalTile) {
        sendJSON(['error' => 'Tile not found'], 404);
    }
    
    // Check if user has permission to view this tile (required to clone it)
    if (!canUserViewTile($user['id'], $tileId, $db)) {
        sendJSON(['error' => 'You do not have permission to view this tile'], 403);
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
        sendJSON(['error' => 'Tile not found'], 404);
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
    
    $insertStmt = $db->prepare('INSERT INTO tiles (id, user_id, title, description, html_content, emoji, theme_color, "group", visibility, allowed_users, is_hyperlink, hyperlink_url, open_in_new_tab, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    
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
        $newPosition,
        time()
    ])) {
        sendJSON(['error' => 'Failed to create cloned tile'], 500);
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
            $tabInsertStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position) VALUES (?, ?, ?, ?)');
            $tabInsertStmt->execute([
                $defaultTabId,
                $newTileId,
                'Default',
                0
            ]);
            
            foreach ($legacySections as $section) {
                $newSectionId = uniqid('section_', true);
                $sectionInsertStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title) VALUES (?, ?, ?, ?)');
                $sectionInsertStmt->execute([
                    $newSectionId,
                    $newTileId,
                    $defaultTabId,
                    $section['title']
                ]);
                
                // Clone links
                $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ?');
                $linkStmt->execute([$section['id']]);
                $links = $linkStmt->fetchAll();
                
                foreach ($links as $link) {
                    $newLinkId = uniqid('link_', true);
                    $linkInsertStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, visibility, allowed_users, notes, tooltip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
                    $linkInsertStmt->execute([
                        $newLinkId,
                        $newSectionId,
                        $link['label'],
                        $link['url'],
                        $link['visibility'] ?? 'public',
                        null, // Reset allowed_users for cloned links
                        $link['notes'] ?? null,
                        $link['tooltip'] ?? null
                    ]);
                }
            }
        }
    } else {
        // Clone tabs and their sections/links
        foreach ($tabs as $tab) {
            $newTabId = uniqid('tab_', true);
            $tabInsertStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position) VALUES (?, ?, ?, ?)');
            $tabInsertStmt->execute([
                $newTabId,
                $newTileId,
                $tab['title'],
                $tab['position'] ?? 0
            ]);
            
            // Clone sections for this tab
            $sectionStmt = $db->prepare('SELECT * FROM sections WHERE tab_id = ? ORDER BY id');
            $sectionStmt->execute([$tab['id']]);
            $sections = $sectionStmt->fetchAll();
            
            foreach ($sections as $section) {
                $newSectionId = uniqid('section_', true);
                $sectionInsertStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title) VALUES (?, ?, ?, ?)');
                $sectionInsertStmt->execute([
                    $newSectionId,
                    $newTileId,
                    $newTabId,
                    $section['title']
                ]);
                
                // Clone links
                $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ?');
                $linkStmt->execute([$section['id']]);
                $links = $linkStmt->fetchAll();
                
                foreach ($links as $link) {
                    $newLinkId = uniqid('link_', true);
                    $linkInsertStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, visibility, allowed_users, notes, tooltip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
                    $linkInsertStmt->execute([
                        $newLinkId,
                        $newSectionId,
                        $link['label'],
                        $link['url'],
                        $link['visibility'] ?? 'public',
                        null, // Reset allowed_users for cloned links
                        $link['notes'] ?? null,
                        $link['tooltip'] ?? null
                    ]);
                }
            }
        }
    }
    
    sendJSON(['success' => true, 'id' => $newTileId], 201);
}

function handleCloneCategory($categoryName) {
    $user = requireAuth();
    $db = getDB();
    
    // Decode URL-encoded category name
    $categoryName = urldecode($categoryName);
    
    // Get all tiles in this category
    $stmt = $db->prepare('SELECT * FROM tiles WHERE "group" = ? ORDER BY position ASC');
    $stmt->execute([$categoryName]);
    $tiles = $stmt->fetchAll();
    
    if (empty($tiles)) {
        sendJSON(['error' => 'Category not found or empty'], 404);
    }
    
    // Check if user has permission to view at least one tile in this category
    $hasViewPermission = false;
    foreach ($tiles as $tile) {
        if (canUserViewTile($user['id'], $tile['id'], $db)) {
            $hasViewPermission = true;
            break;
        }
    }
    
    if (!$hasViewPermission) {
        sendJSON(['error' => 'You do not have permission to view this category'], 403);
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
            
            $insertStmt = $db->prepare('INSERT INTO tiles (id, user_id, title, description, html_content, emoji, theme_color, "group", visibility, allowed_users, is_hyperlink, hyperlink_url, open_in_new_tab, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            
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
                    
                    foreach ($legacySections as $section) {
                        $newSectionId = uniqid('section_', true);
                        $sectionInsertStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, visible_from, expires_at) VALUES (?, ?, ?, ?, ?, ?)');
                        $sectionInsertStmt->execute([
                            $newSectionId,
                            $newTileId,
                            $defaultTabId,
                            $section['title'],
                            $section['visible_from'] ?? null,
                            $section['expires_at'] ?? null
                        ]);
                        
                        // Clone links
                        $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ?');
                        $linkStmt->execute([$section['id']]);
                        $links = $linkStmt->fetchAll();
                        
                        foreach ($links as $link) {
                            $newLinkId = uniqid('link_', true);
                            $linkInsertStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, visibility, allowed_users, notes, tooltip, visible_from, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                            $linkInsertStmt->execute([
                                $newLinkId,
                                $newSectionId,
                                $link['label'],
                                $link['url'],
                                $link['visibility'] ?? 'public',
                                null, // Reset allowed_users for cloned links
                                $link['notes'] ?? null,
                                $link['tooltip'] ?? null,
                                $link['visible_from'] ?? null,
                                $link['expires_at'] ?? null
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
                    $sectionStmt = $db->prepare('SELECT * FROM sections WHERE tab_id = ? ORDER BY id');
                    $sectionStmt->execute([$tab['id']]);
                    $sections = $sectionStmt->fetchAll();
                    
                    foreach ($sections as $section) {
                        $newSectionId = uniqid('section_', true);
                        $sectionInsertStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, visible_from, expires_at) VALUES (?, ?, ?, ?, ?, ?)');
                        $sectionInsertStmt->execute([
                            $newSectionId,
                            $newTileId,
                            $newTabId,
                            $section['title'],
                            $section['visible_from'] ?? null,
                            $section['expires_at'] ?? null
                        ]);
                        
                        // Clone links
                        $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ?');
                        $linkStmt->execute([$section['id']]);
                        $links = $linkStmt->fetchAll();
                        
                        foreach ($links as $link) {
                            $newLinkId = uniqid('link_', true);
                            $linkInsertStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, visibility, allowed_users, notes, tooltip, visible_from, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                            $linkInsertStmt->execute([
                                $newLinkId,
                                $newSectionId,
                                $link['label'],
                                $link['url'],
                                $link['visibility'] ?? 'public',
                                null, // Reset allowed_users for cloned links
                                $link['notes'] ?? null,
                                $link['tooltip'] ?? null,
                                $link['visible_from'] ?? null,
                                $link['expires_at'] ?? null
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
                foreach ($tileData['sections'] as $sectionTitle => $links) {
                    $sectionId = uniqid('section_', true);
                    $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, title) VALUES (?, ?, ?)');
                    $sectionStmt->execute([
                        $sectionId,
                        $tileId,
                        $sectionTitle
                    ]);
                    
                    foreach ($links as $link) {
                        $linkId = uniqid('link_', true);
                        $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, visibility, allowed_users, notes, tooltip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
                        $linkStmt->execute([
                            $linkId,
                            $sectionId,
                            $link['label'],
                            $link['url'],
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
    
    sendJSON(['favoriteTileIds' => $favoriteTileIds]);
}
