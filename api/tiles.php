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
        } elseif (preg_match('#^/([^/]+)/versions$#', $path, $matches)) {
            handleGetTileVersions($matches[1]);
        } elseif (preg_match('#^/([^/]+)/versions/([^/]+)$#', $path, $matches)) {
            handleGetVersionDetails($matches[1], $matches[2]);
        } elseif (preg_match('#^/([^/]+)/info$#', $path, $matches)) {
            handleGetTileInfo($matches[1]);
        } elseif ($path === '/staging-template') {
            handleGetStagingTemplate();
        } elseif ($path === '/staging-prompt') {
            handleGetStagingPrompt();
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
        } elseif ($path === '/csv-to-json' || $path === '/csv-to-json/') {
            handleCsvToJson();
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
        } elseif (preg_match('#^/([^/]+)/versions/([^/]+)/lock$#', $path, $matches)) {
            handleToggleVersionLock($matches[1], $matches[2]);

        } elseif (preg_match('#^/([^/]+)/versions/([^/]+)/restore$#', $path, $matches)) {
            handleRestoreVersion($matches[1], $matches[2]);
        } elseif (preg_match('#^/([^/]+)/create-temp-version$#', $path, $matches)) {
            handleCreateTempVersion($matches[1]);
        } elseif (preg_match('#^/([^/]+)/versions/delete-all$#', $path, $matches)) {
            handleDeleteAllVersions($matches[1]);
        } elseif (preg_match('#^/([^/]+)/versions/delete-empty$#', $path, $matches)) {
            handleDeleteEmptyVersions($matches[1]);
        } elseif (preg_match('#^/([^/]+)/versions/delete-duplicate$#', $path, $matches)) {
            handleDeleteDuplicateVersions($matches[1]);
        } elseif (preg_match('#^/([^/]+)/versions/cleanup-empty$#', $path, $matches)) {
            handleCleanupEmptyVersions($matches[1]);
        } elseif (preg_match('#^/([^/]+)/versions/compare$#', $path, $matches)) {
            handleCompareVersions($matches[1]);
        } elseif (preg_match('#^/([^/]+)/versions/([^/]+)/tags$#', $path, $matches)) {
            handleUpdateVersionTags($matches[1], $matches[2]);
        } elseif (preg_match('#^/([^/]+)/versions/([^/]+)/comments$#', $path, $matches)) {
            handleUpdateVersionComments($matches[1], $matches[2]);
        } elseif (preg_match('#^/([^/]+)/update-links-browser$#', $path, $matches)) {
            handleUpdateLinksBrowser($matches[1]);
        } elseif (preg_match('#^/([^/]+)/page-animation$#', $path, $matches)) {
            handleUpdatePageAnimation($matches[1]);
        } elseif (preg_match('#^/([^/]+)/visit$#', $path, $matches)) {
            handleRecordTileVisit($matches[1]);
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
        } elseif (preg_match('#^/([^/]+)/versions/([^/]+)$#', $path, $matches)) {
            handleDeleteVersion($matches[1], $matches[2]);
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
    // Lightweight home-grid payload: card fields only (no tabs/sections/links/messages/html)
    $summaryRaw = isset($_GET['summary']) ? strtolower(trim((string)$_GET['summary'])) : '';
    $summaryMode = in_array($summaryRaw, ['1', 'true', 'yes'], true);

    // Source tab filter: public (default) or staging (admin only)
    $sourceTab = isset($_GET['source_tab']) ? trim((string)$_GET['source_tab']) : (isset($_GET['sourceTab']) ? trim((string)$_GET['sourceTab']) : 'public');
    if ($sourceTab !== 'public' && $sourceTab !== 'staging') {
        $sourceTab = 'public';
    }

    // Ultra-fast path: guest public summary can be served from file cache without opening SQLite
    if ($summaryMode && $sourceTab === 'public') {
        if (session_status() === PHP_SESSION_NONE) {
            @session_start();
        }
        if (empty($_SESSION['user_id'])) {
            $cached = responseCacheGet('tiles_summary_guest_public');
            if (is_array($cached)) {
                responseCacheHitHeader(true);
                sendJSON($cached);
                return;
            }
        }
    }

        $user = getAuthenticatedUser();
        $db = getDB();
    
    // Check if guest access is enabled
    $guestAccessEnabled = true;
    $cachedGuest = responseCacheGet('setting_guest_access_enabled', 120);
    if ($cachedGuest !== null) {
        $guestAccessEnabled = ($cachedGuest === '1' || $cachedGuest === 1 || $cachedGuest === true);
    } else {
        $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'guest_access_enabled'");
        $stmt->execute();
        $guestAccessSetting = $stmt->fetchColumn();
        $guestAccessEnabled = ($guestAccessSetting === null || $guestAccessSetting === '1');
        responseCacheSet('setting_guest_access_enabled', $guestAccessSetting === null ? '1' : (string)$guestAccessSetting, 120);
    }
    
    // If guest access is disabled and user is not authenticated, require login
    if (!$guestAccessEnabled && !$user) {
        sendJSON(['error' => 'Authentication required. Guest access is disabled.'], 401);
    }

    if ($sourceTab === 'staging') {
        if (!$user || empty($user['is_admin'])) {
            sendJSON(['error' => 'Only administrators can view staging tiles.'], 403);
        }
    }

    // Short-TTL guest cache (public summary only — no per-user favorites/permissions)
    if ($summaryMode && !$user && $sourceTab === 'public') {
        $cached = responseCacheGet('tiles_summary_guest_public');
        if (is_array($cached)) {
            responseCacheHitHeader(true);
            sendJSON($cached);
            return;
        }
    }
    
    // OPTIMIZED: Batch fetch all data using JOINs instead of N+1 queries
    // This dramatically reduces the number of database queries from hundreds to just a few
    
    // Step 1: Get visible tiles filtered by source_tab
    // Summary mode skips html_content and other heavy columns
    $tileCols = $summaryMode
        ? 'id, user_id, title, description, emoji, theme_color, "group", position, created_at, visibility, allowed_users, allowed_groups, source_tab, deleted_at, archived_at, is_hyperlink, hyperlink_url, open_in_new_tab, browser, visible_from, expires_at, tile_background_color, tile_gradient_enabled, tile_gradient_colors, tile_gradient_color_positions, tile_gradient_direction, tile_gradient_type, tile_border_radius, tile_text_color, page_animation, links_animation, header_image, header_image_align, header_image_opacity, header_image_offset_x, header_image_offset_y, header_image_fit, show_emoji, emoji_image, show_title, show_description, published'
        : '*';
    $baseWhere = 'deleted_at IS NULL AND archived_at IS NULL';
    if ($sourceTab === 'staging') {
        $stmt = $db->prepare('SELECT ' . $tileCols . ' FROM tiles WHERE ' . $baseWhere . ' AND source_tab = ? ORDER BY position ASC');
        $stmt->execute(['staging']);
    } else {
        $stmt = $db->prepare('SELECT ' . $tileCols . ' FROM tiles WHERE ' . $baseWhere . ' AND (source_tab IS NULL OR source_tab = ? OR source_tab = \'\') ORDER BY position ASC');
        $stmt->execute(['public']);
    }
    
    $allTiles = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $tiles = [];
    $tilesById = [];
    $positions = [];
    $hasDuplicatePositions = false;
    $visibleTileIds = [];
    
    // Step 2: Batch fetch all favorites, permissions, and role access for the user
    $tileFavorites = [];
    $tilePermissions = [];
    $tileRoleAccess = [];
    $linkFavorites = [];
    $linkRoleAccess = [];
    $userRoleIds = [];
    $userGroupIds = [];
    $acceptedSharedTiles = [];
    
    if ($user) {
        // Get user role IDs once
        $userRoleIds = getUserRoleIds($user['id'], $db);
        
        // Get user group IDs once
        $groupStmt = $db->prepare('SELECT group_id FROM user_group_members WHERE user_id = ?');
        $groupStmt->execute([$user['id']]);
        while ($group = $groupStmt->fetch()) {
            $userGroupIds[] = (int)$group['group_id'];
        }
        
        // Batch fetch all tile favorites
        $favStmt = $db->prepare('SELECT tile_id FROM user_tile_favorites WHERE user_id = ?');
        $favStmt->execute([$user['id']]);
        while ($fav = $favStmt->fetch()) {
            $tileFavorites[$fav['tile_id']] = true;
        }
        
        // Batch fetch all tile permissions (including granular permissions)
        $permStmt = $db->prepare('SELECT tile_id, can_view, can_edit, can_delete, can_add_links, can_add_sections, can_add_tabs, can_edit_links, can_delete_links, can_delete_sections, can_delete_tabs, can_change_visibility, can_change_browser, can_clone_tile, can_view_tile_info, can_edit_tile FROM user_tile_permissions WHERE user_id = ?');
        $permStmt->execute([$user['id']]);
        while ($perm = $permStmt->fetch()) {
            $tilePermissions[$perm['tile_id']] = $perm;
        }
        
        // Batch fetch all tile role access
        if (!empty($userRoleIds) && !$user['is_admin']) {
            $placeholders = implode(',', array_fill(0, count($userRoleIds), '?'));
            $roleStmt = $db->prepare("SELECT DISTINCT tile_id FROM role_tile_permissions WHERE role_id IN ($placeholders) AND can_view = 1");
            $roleStmt->execute($userRoleIds);
            while ($role = $roleStmt->fetch()) {
                $tileRoleAccess[$role['tile_id']] = true;
            }
        }
        
        // Batch fetch all link favorites (full list only — summary omits links)
        if (!$summaryMode) {
            $linkFavStmt = $db->prepare('SELECT link_id FROM user_link_favorites WHERE user_id = ?');
            $linkFavStmt->execute([$user['id']]);
            while ($linkFav = $linkFavStmt->fetch()) {
                $linkFavorites[$linkFav['link_id']] = true;
            }
            
            // Batch fetch all link role access
            if (!empty($userRoleIds) && !$user['is_admin']) {
                $linkRoleStmt = $db->prepare("SELECT DISTINCT link_id FROM role_link_permissions WHERE role_id IN ($placeholders) AND can_view = 1");
                $linkRoleStmt->execute($userRoleIds);
                while ($linkRole = $linkRoleStmt->fetch()) {
                    $linkRoleAccess[$linkRole['link_id']] = true;
                }
            }
        }
        
        // Batch fetch accepted shared tiles (tile_id => {invitation_id, sharer_user_id, sharer_username}) for Private tab
        $acceptedSharedTiles = [];
        $sharedStmt = $db->prepare('SELECT tsi.id, tsi.tile_id, tsi.sharer_user_id, u.username as sharer_username FROM tile_share_invitations tsi JOIN users u ON u.id = tsi.sharer_user_id WHERE tsi.receiver_user_id = ? AND tsi.status = ?');
        $sharedStmt->execute([$user['id'], 'accepted']);
        while ($s = $sharedStmt->fetch()) {
            $acceptedSharedTiles[$s['tile_id']] = [
                'invitationId' => (int)$s['id'],
                'sharerUserId' => (int)$s['sharer_user_id'],
                'sharerUsername' => $s['sharer_username']
            ];
        }
    }
    
    // When returning public tiles for an authenticated non-admin, also include staging tiles
    // that are assigned to the user via role_tile_permissions so they show in "Your Apps" tab
    if ($sourceTab === 'public' && $user && !empty($user['id']) && empty($user['is_admin']) && !empty($tileRoleAccess)) {
        $publicIds = array_column($allTiles, 'id');
        $roleAssignedIds = array_keys($tileRoleAccess);
        $stagingIdsNeeded = array_values(array_diff($roleAssignedIds, $publicIds));
        if (!empty($stagingIdsNeeded)) {
            $placeholders = implode(',', array_fill(0, count($stagingIdsNeeded), '?'));
            $stagingStmt = $db->prepare(
                'SELECT * FROM tiles WHERE ' . $baseWhere . ' AND source_tab = ? AND id IN (' . $placeholders . ') ORDER BY position ASC'
            );
            $stagingStmt->execute(array_merge(['staging'], $stagingIdsNeeded));
            $stagingRows = $stagingStmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($stagingRows as $stagingRow) {
                $allTiles[] = $stagingRow;
            }
        }
    }
    
    // Step 3: Filter tiles by visibility and permissions
    foreach ($allTiles as $row) {
        // Unpublished tiles are admin-only (overrides visibility)
        if (!canUserSeePublishedContent($user, $row)) {
            continue;
        }

        // Filter tiles based on visibility
        $tileVisibility = $row['visibility'] ?? 'public';
        $tileAllowedUsers = $row['allowed_users'] ? json_decode($row['allowed_users'], true) : [];
        $tileAllowedGroups = $row['allowed_groups'] ? json_decode($row['allowed_groups'], true) : [];
        
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
            // Private tiles visible only to specific users or groups
            $isTileVisible = in_array($user['id'], $tileAllowedUsers);
            
            // Also check if user is in any allowed groups
            if (!$isTileVisible && !empty($tileAllowedGroups) && !empty($userGroupIds)) {
                $isTileVisible = !empty(array_intersect($userGroupIds, $tileAllowedGroups));
            }
            
            // Also include tiles shared with user and accepted (via tile_share_invitations)
            if (!$isTileVisible && !empty($acceptedSharedTiles[$row['id']])) {
                $isTileVisible = true;
            }
        }
        
        // Check role-based access from batched data
        $hasRoleAccess = isset($tileRoleAccess[$row['id']]);
        if ($hasRoleAccess && !$isTileVisible) {
            $isTileVisible = true; // Grant access if role-based
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
        
        // Check if this tile is favorited by the current user (from batched data)
        $isFavorite = isset($tileFavorites[$row['id']]);
        
        // Get user tile permissions for the current user (from batched data)
        $canView = true; // Default: everyone can view (unless explicitly denied)
        $canEdit = false; // Default: no edit access (unless explicitly granted)
        $canDelete = false; // Default: no delete access (unless explicitly granted)
        $granularPermissions = null;
        
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
                } elseif (isset($tilePermissions[$row['id']])) {
                    // Use batched permissions
                    $permission = $tilePermissions[$row['id']];
                    $canView = (bool)$permission['can_view'];
                    $canEdit = (bool)$permission['can_edit'];
                    $canDelete = (bool)$permission['can_delete'];
                    
                    // Get granular permissions if user is a tile admin
                    if ($canEdit) {
                        $granularPerms = getTileAdminPermissions($user['id'], $row['id'], $db);
                        if ($granularPerms) {
                            $granularPermissions = $granularPerms;
                        } else {
                            // Fallback to permission data if granular columns exist
                            if (isset($permission['can_add_links'])) {
                                $granularPermissions = [
                                    'canAddLinks' => (bool)($permission['can_add_links'] ?? true),
                                    'canAddSections' => (bool)($permission['can_add_sections'] ?? true),
                                    'canAddTabs' => (bool)($permission['can_add_tabs'] ?? true),
                                    'canEditLinks' => (bool)($permission['can_edit_links'] ?? true),
                                    'canDeleteLinks' => (bool)($permission['can_delete_links'] ?? false),
                                    'canDeleteSections' => (bool)($permission['can_delete_sections'] ?? false),
                                    'canDeleteTabs' => (bool)($permission['can_delete_tabs'] ?? false),
                                    'canChangeVisibility' => (bool)($permission['can_change_visibility'] ?? false),
                                    'canChangeBrowser' => (bool)($permission['can_change_browser'] ?? false),
                                    'canCloneTile' => (bool)($permission['can_clone_tile'] ?? false),
                                    'canViewTileInfo' => (bool)($permission['can_view_tile_info'] ?? true),
                                    'canEditTile' => (bool)($permission['can_edit_tile'] ?? true)
                                ];
                            }
                        }
                    }
                }
                // If no permission record exists, use defaults (view only)
            }
        }
        
        // Skip tiles where user doesn't have view permission
        if ($user && !$canView) {
            continue;
        }
        
        $visibleTileIds[] = $row['id'];
        
        // Load tile decoration fields
        $tileGradientColors = null;
        if (isset($row['tile_gradient_colors']) && $row['tile_gradient_colors']) {
            $decoded = json_decode($row['tile_gradient_colors'], true);
            $tileGradientColors = is_array($decoded) ? $decoded : null;
        }
        $tileGradientColorPositions = null;
        if (isset($row['tile_gradient_color_positions']) && $row['tile_gradient_color_positions']) {
            $decoded = json_decode($row['tile_gradient_color_positions'], true);
            $tileGradientColorPositions = is_array($decoded) ? $decoded : null;
        }
        
        $tile = [
            'id' => $row['id'],
            'userId' => isset($row['user_id']) ? (int)$row['user_id'] : null,
            'title' => $row['title'],
            'description' => $row['description'],
            'emoji' => $row['emoji'],
            'themeColor' => $row['theme_color'],
            'group' => $row['group'],
            'createdAt' => (int)$row['created_at'],
            'position' => $position,
            'visibility' => $tileVisibility,
            'published' => isContentPublished($row),
            'sourceTab' => !empty($row['source_tab']) ? $row['source_tab'] : 'public',
            'allowedUsers' => $tileAllowedUsers,
            'allowedGroups' => $tileAllowedGroups,
            'isFavorite' => $isFavorite,
            'isHyperlink' => isset($row['is_hyperlink']) ? (bool)$row['is_hyperlink'] : false,
            'hyperlinkUrl' => $row['hyperlink_url'] ?? null,
            'openInNewTab' => isset($row['open_in_new_tab']) ? (bool)$row['open_in_new_tab'] : null,
            'browser' => isset($row['browser']) ? $row['browser'] : null,
            'canView' => $canView,
            'canEdit' => $canEdit,
            'canDelete' => $canDelete,
            'canAddLinks' => $granularPermissions ? $granularPermissions['canAddLinks'] : null,
            'canAddSections' => $granularPermissions ? $granularPermissions['canAddSections'] : null,
            'canAddTabs' => $granularPermissions ? $granularPermissions['canAddTabs'] : null,
            'canEditLinks' => $granularPermissions ? $granularPermissions['canEditLinks'] : null,
            'canDeleteLinks' => $granularPermissions ? $granularPermissions['canDeleteLinks'] : null,
            'canDeleteSections' => $granularPermissions ? $granularPermissions['canDeleteSections'] : null,
            'canDeleteTabs' => $granularPermissions ? $granularPermissions['canDeleteTabs'] : null,
            'canChangeVisibility' => $granularPermissions ? $granularPermissions['canChangeVisibility'] : null,
            'canChangeBrowser' => $granularPermissions ? $granularPermissions['canChangeBrowser'] : null,
            'canCloneTile' => $granularPermissions ? $granularPermissions['canCloneTile'] : null,
            'canViewTileInfo' => $granularPermissions ? $granularPermissions['canViewTileInfo'] : null,
            'canEditTile' => $granularPermissions ? $granularPermissions['canEditTile'] : null,
            'visibleFrom' => $row['visible_from'] ?? null,
            'expiresAt' => $row['expires_at'] ?? null,
            'hasRoleAccess' => $hasRoleAccess,
            'tileBackgroundColor' => !empty($row['tile_background_color']) ? $row['tile_background_color'] : null,
            'tileGradientEnabled' => isset($row['tile_gradient_enabled']) && $row['tile_gradient_enabled'] !== null ? (bool)$row['tile_gradient_enabled'] : null,
            'tileGradientColors' => $tileGradientColors,
            'tileGradientColorPositions' => $tileGradientColorPositions,
            'tileGradientDirection' => isset($row['tile_gradient_direction']) && $row['tile_gradient_direction'] !== null && $row['tile_gradient_direction'] !== '' ? (is_numeric($row['tile_gradient_direction']) ? (int)$row['tile_gradient_direction'] : $row['tile_gradient_direction']) : null,
            'tileGradientType' => !empty($row['tile_gradient_type']) ? $row['tile_gradient_type'] : null,
            'tileBorderRadius' => isset($row['tile_border_radius']) && $row['tile_border_radius'] !== null ? (int)$row['tile_border_radius'] : null,
            'tileTextColor' => !empty($row['tile_text_color']) ? $row['tile_text_color'] : null,
            'pageAnimation' => isset($row['page_animation']) ? $row['page_animation'] : null,
            'linksAnimation' => isset($row['links_animation']) ? $row['links_animation'] : null,
            'headerImage' => !empty($row['header_image']) ? $row['header_image'] : null,
            'headerImageAlign' => (isset($row['header_image_align']) && in_array($row['header_image_align'], ['left','center','right'], true)) ? $row['header_image_align'] : null,
            'headerImageOpacity' => isset($row['header_image_opacity']) && $row['header_image_opacity'] !== null && $row['header_image_opacity'] !== '' ? max(0, min(100, (int)$row['header_image_opacity'])) : null,
            'headerImageOffsetX' => isset($row['header_image_offset_x']) && $row['header_image_offset_x'] !== null && $row['header_image_offset_x'] !== '' ? max(-300, min(300, (int)$row['header_image_offset_x'])) : null,
            'headerImageOffsetY' => isset($row['header_image_offset_y']) && $row['header_image_offset_y'] !== null && $row['header_image_offset_y'] !== '' ? max(-300, min(300, (int)$row['header_image_offset_y'])) : null,
            'headerImageFit' => (isset($row['header_image_fit']) && in_array($row['header_image_fit'], ['contain','cover'], true)) ? $row['header_image_fit'] : null,
            'showEmoji' => !(isset($row['show_emoji']) && ((int)$row['show_emoji'] === 0 || $row['show_emoji'] === '0' || $row['show_emoji'] === false)),
            'emojiImage' => !empty($row['emoji_image']) ? $row['emoji_image'] : null,
            'showTitle' => !(isset($row['show_title']) && ((int)$row['show_title'] === 0 || $row['show_title'] === '0' || $row['show_title'] === false)),
            'showDescription' => !(isset($row['show_description']) && ((int)$row['show_description'] === 0 || $row['show_description'] === '0' || $row['show_description'] === false)),
            'tabs' => [],
            'sharedWithMeInvitationId' => isset($acceptedSharedTiles[$row['id']]) ? $acceptedSharedTiles[$row['id']]['invitationId'] : null,
            'sharedWithMeSharer' => isset($acceptedSharedTiles[$row['id']]) ? ['userId' => $acceptedSharedTiles[$row['id']]['sharerUserId'], 'username' => $acceptedSharedTiles[$row['id']]['sharerUsername']] : null
        ];

        // Full list includes htmlContent; summary omits nested/heavy fields
        if (!$summaryMode) {
            $tile['htmlContent'] = $row['html_content'];
        }
        
        $tilesById[$row['id']] = $tile;
    }

    // Summary mode: return card fields only (home grid). Detail loads via GET /tiles/{id}.
    if ($summaryMode) {
        // Optional link counts for card badges (one aggregate query, no nested graph)
        $linkCounts = [];
        if (!empty($visibleTileIds)) {
            $placeholders = implode(',', array_fill(0, count($visibleTileIds), '?'));
            $countStmt = $db->prepare(
                "SELECT s.tile_id, COUNT(l.id) AS link_count
                 FROM sections s
                 INNER JOIN links l ON l.section_id = s.id
                 WHERE s.tile_id IN ($placeholders)
                 GROUP BY s.tile_id"
            );
            $countStmt->execute($visibleTileIds);
            while ($c = $countStmt->fetch(PDO::FETCH_ASSOC)) {
                $linkCounts[$c['tile_id']] = (int)$c['link_count'];
            }
        }

        foreach ($visibleTileIds as $tileId) {
            if (!isset($tilesById[$tileId])) {
                continue;
            }
            $tile = $tilesById[$tileId];
            $tile['linkCount'] = $linkCounts[$tileId] ?? 0;
            $tile['tabs'] = [];
            $tile['sections'] = [];
            $tiles[] = $tile;
        }

        usort($tiles, function($a, $b) {
            return ($a['position'] ?? 0) - ($b['position'] ?? 0);
        });

        if ($hasDuplicatePositions) {
            error_log('Warning: duplicate tile positions detected on GET /tiles?summary=1 (count=' . count($tiles) . '); skipping write-on-read normalization');
        }

        if (!$user && $sourceTab === 'public') {
            responseCacheSet('tiles_summary_guest_public', $tiles);
            responseCacheHitHeader(false);
        }

        sendJSON($tiles);
        return;
    }
    
    // Step 4: Batch fetch all tabs, sections, links, and rich_text_content for visible tiles
    if (!empty($visibleTileIds)) {
        $placeholders = implode(',', array_fill(0, count($visibleTileIds), '?'));
        
        // Batch fetch all tabs
        $tabsByTile = [];
        $tabStmt = $db->prepare("SELECT * FROM tabs WHERE tile_id IN ($placeholders) ORDER BY tile_id, position ASC");
        $tabStmt->execute($visibleTileIds);
        while ($tabRow = $tabStmt->fetch()) {
            if (!isset($tabsByTile[$tabRow['tile_id']])) {
                $tabsByTile[$tabRow['tile_id']] = [];
            }
            $tabsByTile[$tabRow['tile_id']][] = $tabRow;
        }
        
        // Batch fetch all sections
        $sectionsByTab = [];
        $allTabIds = [];
        foreach ($tabsByTile as $tileTabs) {
            foreach ($tileTabs as $tab) {
                $allTabIds[] = $tab['id'];
            }
        }
        
        if (!empty($allTabIds)) {
            $tabPlaceholders = implode(',', array_fill(0, count($allTabIds), '?'));
            $sectionStmt = $db->prepare("SELECT * FROM sections WHERE tab_id IN ($tabPlaceholders) ORDER BY tab_id, position ASC, id ASC");
            $sectionStmt->execute($allTabIds);
            while ($sectionRow = $sectionStmt->fetch()) {
                if (!isset($sectionsByTab[$sectionRow['tab_id']])) {
                    $sectionsByTab[$sectionRow['tab_id']] = [];
                }
                $sectionsByTab[$sectionRow['tab_id']][] = $sectionRow;
            }
        }
        
        // Batch fetch legacy sections (sections without tab_id)
        $legacySectionsByTile = [];
        $legacySectionStmt = $db->prepare("SELECT * FROM sections WHERE tile_id IN ($placeholders) AND (tab_id IS NULL OR tab_id = '') ORDER BY tile_id, position ASC, id ASC");
        $legacySectionStmt->execute($visibleTileIds);
        while ($sectionRow = $legacySectionStmt->fetch()) {
            if (!isset($legacySectionsByTile[$sectionRow['tile_id']])) {
                $legacySectionsByTile[$sectionRow['tile_id']] = [];
            }
            $legacySectionsByTile[$sectionRow['tile_id']][] = $sectionRow;
        }
        
        // Batch fetch all links
        $allSectionIds = [];
        foreach ($sectionsByTab as $sections) {
            foreach ($sections as $section) {
                $allSectionIds[] = $section['id'];
            }
        }
        foreach ($legacySectionsByTile as $sections) {
            foreach ($sections as $section) {
                $allSectionIds[] = $section['id'];
            }
        }
        
        $linksBySection = [];
        $sectionPlaceholders = '';
        if (!empty($allSectionIds)) {
            $sectionPlaceholders = implode(',', array_fill(0, count($allSectionIds), '?'));
            if ($user) {
                // Use LEFT JOIN for favorites
                $linkStmt = $db->prepare("SELECT links.*, CASE WHEN user_link_favorites.user_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite FROM links LEFT JOIN user_link_favorites ON links.id = user_link_favorites.link_id AND user_link_favorites.user_id = ? WHERE links.section_id IN ($sectionPlaceholders) ORDER BY links.section_id, links.position ASC, links.id ASC");
                $linkParams = array_merge([$user['id']], $allSectionIds);
            } else {
                $linkStmt = $db->prepare("SELECT links.*, 0 as is_favorite FROM links WHERE links.section_id IN ($sectionPlaceholders) ORDER BY links.section_id, links.position ASC, links.id ASC");
                $linkParams = $allSectionIds;
            }
            $linkStmt->execute($linkParams);
            while ($linkRow = $linkStmt->fetch()) {
                if (!isset($linksBySection[$linkRow['section_id']])) {
                    $linksBySection[$linkRow['section_id']] = [];
                }
                $linksBySection[$linkRow['section_id']][] = $linkRow;
            }
        }
        
        // Batch fetch all rich text content
        $richTextBySection = [];
        if (!empty($allSectionIds) && !empty($sectionPlaceholders)) {
            $richTextStmt = $db->prepare("SELECT * FROM rich_text_content WHERE section_id IN ($sectionPlaceholders) ORDER BY section_id, position ASC");
            $richTextStmt->execute($allSectionIds);
            while ($richTextRow = $richTextStmt->fetch()) {
                if (!isset($richTextBySection[$richTextRow['section_id']])) {
                    $richTextBySection[$richTextRow['section_id']] = [];
                }
                $richTextBySection[$richTextRow['section_id']][] = $richTextRow;
            }
        }
        
        // Batch fetch all tile messages
        $messagesByTile = [];
        $msgStmt = $db->prepare("SELECT * FROM tile_messages WHERE tile_id IN ($placeholders)");
        $msgStmt->execute($visibleTileIds);
        while ($msgRow = $msgStmt->fetch()) {
            if (!isset($messagesByTile[$msgRow['tile_id']])) {
                $messagesByTile[$msgRow['tile_id']] = [];
            }
            $cc = null;
            if (!empty($msgRow['celebration_config'])) {
                $dec = json_decode($msgRow['celebration_config'], true);
                if (is_array($dec)) {
                    $cc = $dec;
                }
            }
            $messagesByTile[$msgRow['tile_id']][] = [
                'id' => $msgRow['id'],
                'content' => $msgRow['content'],
                'type' => $msgRow['type'],
                'startDate' => $msgRow['start_date'],
                'endDate' => $msgRow['end_date'],
                'isActive' => (bool)$msgRow['is_active'],
                'priority' => isset($msgRow['priority']) ? (int)$msgRow['priority'] : null,
                'textColor' => $msgRow['text_color'] ?? null,
                'fontStyle' => $msgRow['font_style'] ?? null,
                'displayLocation' => $msgRow['display_location'] ?? 'both',
                'animationType' => $msgRow['animation_type'] ?? 'rollover',
                'delayBefore' => isset($msgRow['delay_before']) ? (float)$msgRow['delay_before'] : 0,
                'celebrationEffect' => $msgRow['celebration_effect'] ?? 'fireworks',
                'celebrationConfig' => $cc,
                'url' => $msgRow['url'] ?? null,
                'urlLabel' => $msgRow['url_label'] ?? null
            ];
        }
        
        // Step 5: Build the tile structure in memory
        foreach ($visibleTileIds as $tileId) {
            if (!isset($tilesById[$tileId])) {
                continue;
            }
            $tile = &$tilesById[$tileId];
            $tile['messages'] = $messagesByTile[$tileId] ?? [];
            $tabs = [];
            
            // Process tabs for this tile
            if (isset($tabsByTile[$tileId])) {
                foreach ($tabsByTile[$tileId] as $tabRow) {
                    if (!canUserSeePublishedContent($user, $tabRow)) {
                        continue;
                    }
                    if (!canUserSeeByVisibility($user, $tabRow, $userGroupIds)) {
                        continue;
                    }
                    $tab = [
                        'id' => $tabRow['id'],
                        'title' => $tabRow['title'],
                        'position' => (int)($tabRow['position'] ?? 0),
                        'textColor' => (!empty($tabRow['text_color']) && trim($tabRow['text_color']) !== '') ? trim($tabRow['text_color']) : null,
                        'visibleFrom' => $tabRow['visible_from'] ?? null,
                        'expiresAt' => $tabRow['expires_at'] ?? null,
                        'visibility' => $tabRow['visibility'] ?? 'public',
                        'published' => isContentPublished($tabRow),
                        'allowedUsers' => (isset($tabRow['allowed_users']) && $tabRow['allowed_users'] ? json_decode($tabRow['allowed_users'], true) : null) ?? [],
                        'allowedGroups' => (isset($tabRow['allowed_groups']) && $tabRow['allowed_groups'] ? json_decode($tabRow['allowed_groups'], true) : null) ?? [],
                        'sections' => []
                    ];
                    
                    // Process sections for this tab
                    if (isset($sectionsByTab[$tabRow['id']])) {
                        foreach ($sectionsByTab[$tabRow['id']] as $sectionRow) {
                            if (!canUserSeePublishedContent($user, $sectionRow)) {
                                continue;
                            }
                            if (!canUserSeeByVisibility($user, $sectionRow, $userGroupIds)) {
                                continue;
                            }
                            $section = [
                                'id' => $sectionRow['id'],
                                'title' => $sectionRow['title'],
                                'textColor' => (!empty($sectionRow['text_color']) && trim($sectionRow['text_color']) !== '') ? trim($sectionRow['text_color']) : null,
                                'visibleFrom' => $sectionRow['visible_from'] ?? null,
                                'expiresAt' => $sectionRow['expires_at'] ?? null,
                                'forceStackedView' => isset($sectionRow['force_stacked_view']) && $sectionRow['force_stacked_view'] == 1 ? true : false,
                                'position' => isset($sectionRow['position']) ? (int)$sectionRow['position'] : 0,
                                'visibility' => $sectionRow['visibility'] ?? 'public',
                                'published' => isContentPublished($sectionRow),
                                'allowedUsers' => (isset($sectionRow['allowed_users']) && $sectionRow['allowed_users'] ? json_decode($sectionRow['allowed_users'], true) : null) ?? [],
                                'allowedGroups' => (isset($sectionRow['allowed_groups']) && $sectionRow['allowed_groups'] ? json_decode($sectionRow['allowed_groups'], true) : null) ?? [],
                                'links' => []
                            ];
                            
                            // Process links for this section
                            if (isset($linksBySection[$sectionRow['id']])) {
                                foreach ($linksBySection[$sectionRow['id']] as $linkRow) {
                                    if (!canUserSeePublishedContent($user, $linkRow)) {
                                        continue;
                                    }
                                    // Filter links based on visibility
                                    $visibility = $linkRow['visibility'] ?? 'public';
                                    $allowedUsers = $linkRow['allowed_users'] ? json_decode($linkRow['allowed_users'], true) : [];
                                    $allowedGroups = $linkRow['allowed_groups'] ? json_decode($linkRow['allowed_groups'], true) : [];
                                    if (!is_array($allowedUsers)) {
                                        $allowedUsers = [];
                                    }
                                    if (!is_array($allowedGroups)) {
                                        $allowedGroups = [];
                                    }

                                    $isVisible = canUserSeeByVisibility($user, $linkRow, $userGroupIds);

                                    // Check role-based access from batched data
                                    $linkHasRoleAccess = isset($linkRoleAccess[$linkRow['id']]);
                                    if ($linkHasRoleAccess && !$isVisible) {
                                        $isVisible = true;
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
                                        'published' => isContentPublished($linkRow),
                                        'allowedUsers' => $allowedUsers,
                                        'allowedGroups' => $allowedGroups,
                                        'notes' => isset($linkRow['notes']) ? $linkRow['notes'] : null,
                                        'tooltip' => isset($linkRow['tooltip']) ? $linkRow['tooltip'] : null,
                                        'richTextContent' => isset($linkRow['rich_text_content']) ? $linkRow['rich_text_content'] : null,
                                        'visibleFrom' => isset($linkRow['visible_from']) ? $linkRow['visible_from'] : null,
                                        'expiresAt' => isset($linkRow['expires_at']) ? $linkRow['expires_at'] : null,
                                        'browser' => isset($linkRow['browser']) ? $linkRow['browser'] : null,
                                        'animation' => isset($linkRow['animation']) ? $linkRow['animation'] : null,
                                        'isFavorite' => (bool)($linkRow['is_favorite'] ?? false),
                                        'hasRoleAccess' => $linkHasRoleAccess,
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
                            }
                            
                            // Add rich text content
                            $section['richTextContent'] = [];
                            if (isset($richTextBySection[$sectionRow['id']])) {
                                foreach ($richTextBySection[$sectionRow['id']] as $richTextRow) {
                                    if (!canUserSeeByVisibility($user, $richTextRow, $userGroupIds)) {
                                        continue;
                                    }
                                    $section['richTextContent'][] = mapRichTextRow($richTextRow);
                                }
                            }
                            
                            $tab['sections'][] = $section;
                        }
                    }
                    
                    $tabs[] = $tab;
                }
            }
            
            $tile['tabs'] = $tabs;
            
            // Handle legacy sections (backward compatibility)
            if (empty($tabs) && isset($legacySectionsByTile[$tileId])) {
                $allSections = [];
                
                foreach ($legacySectionsByTile[$tileId] as $sectionRow) {
                    if (!canUserSeePublishedContent($user, $sectionRow)) {
                        continue;
                    }
                    if (!canUserSeeByVisibility($user, $sectionRow, $userGroupIds)) {
                        continue;
                    }
                    $section = [
                        'id' => $sectionRow['id'],
                        'title' => $sectionRow['title'],
                        'textColor' => (!empty($sectionRow['text_color']) && trim($sectionRow['text_color']) !== '') ? trim($sectionRow['text_color']) : null,
                        'forceStackedView' => isset($sectionRow['force_stacked_view']) && $sectionRow['force_stacked_view'] == 1 ? true : false,
                        'visibility' => $sectionRow['visibility'] ?? 'public',
                        'published' => isContentPublished($sectionRow),
                        'allowedUsers' => (isset($sectionRow['allowed_users']) && $sectionRow['allowed_users'] ? json_decode($sectionRow['allowed_users'], true) : null) ?? [],
                        'allowedGroups' => (isset($sectionRow['allowed_groups']) && $sectionRow['allowed_groups'] ? json_decode($sectionRow['allowed_groups'], true) : null) ?? [],
                        'links' => []
                    ];
                    
                    // Process links for legacy section
                    if (isset($linksBySection[$sectionRow['id']])) {
                        foreach ($linksBySection[$sectionRow['id']] as $linkRow) {
                            if (!canUserSeePublishedContent($user, $linkRow)) {
                                continue;
                            }
                            $visibility = $linkRow['visibility'] ?? 'public';
                            $allowedUsers = $linkRow['allowed_users'] ? json_decode($linkRow['allowed_users'], true) : [];
                            $allowedGroups = $linkRow['allowed_groups'] ? json_decode($linkRow['allowed_groups'], true) : [];
                            if (!is_array($allowedUsers)) {
                                $allowedUsers = [];
                            }
                            if (!is_array($allowedGroups)) {
                                $allowedGroups = [];
                            }

                            $isVisible = canUserSeeByVisibility($user, $linkRow, $userGroupIds);

                            // Check role-based access from batched data
                            $linkHasRoleAccess = isset($linkRoleAccess[$linkRow['id']]);
                            if ($linkHasRoleAccess && !$isVisible) {
                                $isVisible = true;
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
                                'published' => isContentPublished($linkRow),
                                'allowedUsers' => $allowedUsers,
                                'allowedGroups' => $allowedGroups,
                                'notes' => $linkRow['notes'] ?? null,
                                'tooltip' => $linkRow['tooltip'] ?? null,
                                'richTextContent' => $linkRow['rich_text_content'] ?? null,
                                'browser' => $linkRow['browser'] ?? null,
                                'animation' => $linkRow['animation'] ?? null,
                                'isFavorite' => (bool)($linkRow['is_favorite'] ?? false),
                                'hasRoleAccess' => $linkHasRoleAccess,
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
                    }
                    
                    // Add rich text content
                    $section['richTextContent'] = [];
                    if (isset($richTextBySection[$sectionRow['id']])) {
                        foreach ($richTextBySection[$sectionRow['id']] as $richTextRow) {
                            if (!canUserSeeByVisibility($user, $richTextRow, $userGroupIds)) {
                                continue;
                            }
                            $section['richTextContent'][] = mapRichTextRow($richTextRow);
                        }
                    }
                    
                    $allSections[] = $section;
                }
                
                $tile['sections'] = $allSections;
            } else {
                // Avoid duplicating nested section bytes when tabs already carry them
                $tile['sections'] = [];
            }
            
            $tiles[] = $tile;
        }
    }
    
    // Step 6: Sort tiles by position (response order only — do not write on GET).
    usort($tiles, function($a, $b) {
        return ($a['position'] ?? 0) - ($b['position'] ?? 0);
    });

    // IMPORTANT: Never UPDATE tiles inside a list GET.
    // A previous "normalize positions" block re-scanned an already-filled $positions map,
    // always treated positions as duplicates, and UPDATEd every tile on every request.
    // Under concurrent home loads that serialized SQLite writes (busy_timeout / lock waits)
    // and drove Home p95 to multi-second latency. Positions are assigned on create/reorder;
    // if repair is ever needed, do it from an admin/migration path — not from GET.
    // $hasDuplicatePositions is still computed above for diagnostics if needed later.
    if ($hasDuplicatePositions) {
        error_log('Warning: duplicate tile positions detected on GET /tiles (count=' . count($tiles) . '); skipping write-on-read normalization');
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

    // Staging tiles are visible only to admins
    $rowSourceTab = isset($row['source_tab']) ? trim($row['source_tab']) : 'public';
    if ($rowSourceTab === 'staging' && (!$user || empty($user['is_admin']))) {
        sendJSON(['error' => 'Tile not found'], 404);
    }

    // Unpublished tiles are admin-only
    if (!canUserSeePublishedContent($user, $row)) {
        sendJSON(['error' => 'Tile not found'], 404);
    }
    
    // Filter tiles based on visibility
    $tileVisibility = $row['visibility'] ?? 'public';
    $tileAllowedUsers = $row['allowed_users'] ? json_decode($row['allowed_users'], true) : [];
    $tileAllowedGroups = $row['allowed_groups'] ? json_decode($row['allowed_groups'], true) : [];
    
    // Get user's group IDs if user is logged in
    $userGroupIds = [];
    if ($user) {
        $groupStmt = $db->prepare('SELECT group_id FROM user_group_members WHERE user_id = ?');
        $groupStmt->execute([$user['id']]);
        while ($group = $groupStmt->fetch()) {
            $userGroupIds[] = (int)$group['group_id'];
        }
    }
    
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
        // Private tiles visible only to specific users or groups
        $isTileVisible = in_array($user['id'], $tileAllowedUsers);
        
        // Also check if user is in any allowed groups
        if (!$isTileVisible && !empty($tileAllowedGroups) && !empty($userGroupIds)) {
            $isTileVisible = !empty(array_intersect($userGroupIds, $tileAllowedGroups));
        }
        // Also include tiles shared with user and accepted (via tile_share_invitations)
        if (!$isTileVisible) {
            $sharedCheck = $db->prepare('SELECT id, sharer_user_id FROM tile_share_invitations WHERE tile_id = ? AND receiver_user_id = ? AND status = ?');
            $sharedCheck->execute([$row['id'], $user['id'], 'accepted']);
            $sharedRow = $sharedCheck->fetch();
            if ($sharedRow) {
                $isTileVisible = true;
            }
        }
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
    
    // Load tile decoration fields
    $tileGradientColors = null;
    if (isset($row['tile_gradient_colors']) && $row['tile_gradient_colors']) {
        $decoded = json_decode($row['tile_gradient_colors'], true);
        $tileGradientColors = is_array($decoded) ? $decoded : null;
    }
    $tileGradientColorPositions = null;
    if (isset($row['tile_gradient_color_positions']) && $row['tile_gradient_color_positions']) {
        $decoded = json_decode($row['tile_gradient_color_positions'], true);
        $tileGradientColorPositions = is_array($decoded) ? $decoded : null;
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
        'published' => isContentPublished($row),
        'sourceTab' => !empty($row['source_tab']) ? $row['source_tab'] : 'public',
        'allowedUsers' => $tileAllowedUsers,
        'allowedGroups' => $tileAllowedGroups,
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
        'tileBackgroundColor' => !empty($row['tile_background_color']) ? $row['tile_background_color'] : null,
        'tileGradientEnabled' => isset($row['tile_gradient_enabled']) && $row['tile_gradient_enabled'] !== null ? (bool)$row['tile_gradient_enabled'] : null,
        'tileGradientColors' => $tileGradientColors,
        'tileGradientColorPositions' => $tileGradientColorPositions,
        'tileGradientDirection' => isset($row['tile_gradient_direction']) && $row['tile_gradient_direction'] !== null && $row['tile_gradient_direction'] !== '' ? (is_numeric($row['tile_gradient_direction']) ? (int)$row['tile_gradient_direction'] : $row['tile_gradient_direction']) : null,
        'tileGradientType' => !empty($row['tile_gradient_type']) ? $row['tile_gradient_type'] : null,
        'tileBorderRadius' => isset($row['tile_border_radius']) && $row['tile_border_radius'] !== null ? (int)$row['tile_border_radius'] : null,
        'tileTextColor' => !empty($row['tile_text_color']) ? $row['tile_text_color'] : null,
        'pageAnimation' => isset($row['page_animation']) ? $row['page_animation'] : null,
        'linksAnimation' => isset($row['links_animation']) ? $row['links_animation'] : null,
        'headerImage' => !empty($row['header_image']) ? $row['header_image'] : null,
        'headerImageAlign' => (isset($row['header_image_align']) && in_array($row['header_image_align'], ['left','center','right'], true)) ? $row['header_image_align'] : null,
        'headerImageOpacity' => isset($row['header_image_opacity']) && $row['header_image_opacity'] !== null && $row['header_image_opacity'] !== '' ? max(0, min(100, (int)$row['header_image_opacity'])) : null,
        'headerImageOffsetX' => isset($row['header_image_offset_x']) && $row['header_image_offset_x'] !== null && $row['header_image_offset_x'] !== '' ? max(-300, min(300, (int)$row['header_image_offset_x'])) : null,
        'headerImageOffsetY' => isset($row['header_image_offset_y']) && $row['header_image_offset_y'] !== null && $row['header_image_offset_y'] !== '' ? max(-300, min(300, (int)$row['header_image_offset_y'])) : null,
        'headerImageFit' => (isset($row['header_image_fit']) && in_array($row['header_image_fit'], ['contain','cover'], true)) ? $row['header_image_fit'] : null,
        'showEmoji' => !(isset($row['show_emoji']) && ((int)$row['show_emoji'] === 0 || $row['show_emoji'] === '0' || $row['show_emoji'] === false)),
        'emojiImage' => !empty($row['emoji_image']) ? $row['emoji_image'] : null,
            'showTitle' => !(isset($row['show_title']) && ((int)$row['show_title'] === 0 || $row['show_title'] === '0' || $row['show_title'] === false)),
            'showDescription' => !(isset($row['show_description']) && ((int)$row['show_description'] === 0 || $row['show_description'] === '0' || $row['show_description'] === false)),
        'tabs' => [],
        'sharedWithMeInvitationId' => null,
        'sharedWithMeSharer' => null
    ];
    
    // If user has access via accepted share invitation, include metadata for Remove/Block
    if ($user) {
        $sharedStmt = $db->prepare('SELECT tsi.id, tsi.sharer_user_id, u.username as sharer_username FROM tile_share_invitations tsi JOIN users u ON u.id = tsi.sharer_user_id WHERE tsi.tile_id = ? AND tsi.receiver_user_id = ? AND tsi.status = ?');
        $sharedStmt->execute([$row['id'], $user['id'], 'accepted']);
        $sharedRow = $sharedStmt->fetch();
        if ($sharedRow) {
            $tile['sharedWithMeInvitationId'] = (int)$sharedRow['id'];
            $tile['sharedWithMeSharer'] = ['userId' => (int)$sharedRow['sharer_user_id'], 'username' => $sharedRow['sharer_username']];
        }
    }
    
    // Get messages for this tile
    $msgStmt = $db->prepare('SELECT * FROM tile_messages WHERE tile_id = ?');
    $msgStmt->execute([$tileId]);
    $tile['messages'] = [];
    while ($msgRow = $msgStmt->fetch()) {
        $cc = null;
        if (!empty($msgRow['celebration_config'])) {
            $dec = json_decode($msgRow['celebration_config'], true);
            if (is_array($dec)) {
                $cc = $dec;
            }
        }
        $tile['messages'][] = [
            'id' => $msgRow['id'],
            'content' => $msgRow['content'],
            'type' => $msgRow['type'],
            'startDate' => $msgRow['start_date'],
            'endDate' => $msgRow['end_date'],
            'isActive' => (bool)$msgRow['is_active'],
            'priority' => isset($msgRow['priority']) ? (int)$msgRow['priority'] : null,
            'textColor' => $msgRow['text_color'] ?? null,
            'fontStyle' => $msgRow['font_style'] ?? null,
            'displayLocation' => $msgRow['display_location'] ?? 'both',
            'animationType' => $msgRow['animation_type'] ?? 'rollover',
            'delayBefore' => isset($msgRow['delay_before']) ? (float)$msgRow['delay_before'] : 0,
            'celebrationEffect' => $msgRow['celebration_effect'] ?? 'fireworks',
            'celebrationConfig' => $cc,
            'url' => $msgRow['url'] ?? null,
            'urlLabel' => $msgRow['url_label'] ?? null
        ];
    }

    // Get tabs for this tile
    $tabStmt = $db->prepare('SELECT * FROM tabs WHERE tile_id = ? ORDER BY position ASC');
    $tabStmt->execute([$tileId]);
    $tabs = [];
    
    while ($tabRow = $tabStmt->fetch()) {
        if (!canUserSeePublishedContent($user, $tabRow)) {
            continue;
        }
        if (!canUserSeeByVisibility($user, $tabRow, $userGroupIds)) {
            continue;
        }
        $tabColor = (!empty($tabRow['text_color']) && trim($tabRow['text_color']) !== '') ? trim($tabRow['text_color']) : null;
        error_log("Retrieved tab {$tabRow['id']} ({$tabRow['title']}) with color: " . ($tabColor ?? 'null'));
        $tab = [
            'id' => $tabRow['id'],
            'title' => $tabRow['title'],
            'position' => (int)($tabRow['position'] ?? 0),
            'textColor' => $tabColor,
            'visibleFrom' => $tabRow['visible_from'] ?? null,
            'expiresAt' => $tabRow['expires_at'] ?? null,
            'visibility' => $tabRow['visibility'] ?? 'public',
            'published' => isContentPublished($tabRow),
            'allowedUsers' => (isset($tabRow['allowed_users']) && $tabRow['allowed_users'] ? json_decode($tabRow['allowed_users'], true) : null) ?? [],
            'allowedGroups' => (isset($tabRow['allowed_groups']) && $tabRow['allowed_groups'] ? json_decode($tabRow['allowed_groups'], true) : null) ?? [],
            'sections' => []
        ];
        
        // Get sections for this tab
        $sectionStmt = $db->prepare('SELECT * FROM sections WHERE tab_id = ? ORDER BY position ASC, id ASC');
        $sectionStmt->execute([$tabRow['id']]);
        
        while ($sectionRow = $sectionStmt->fetch()) {
            if (!canUserSeePublishedContent($user, $sectionRow)) {
                continue;
            }
            if (!canUserSeeByVisibility($user, $sectionRow, $userGroupIds)) {
                continue;
            }
            $section = [
                'id' => $sectionRow['id'],
                'title' => $sectionRow['title'],
                'textColor' => (!empty($sectionRow['text_color']) && trim($sectionRow['text_color']) !== '') ? trim($sectionRow['text_color']) : null,
                'visibleFrom' => $sectionRow['visible_from'] ?? null,
                'expiresAt' => $sectionRow['expires_at'] ?? null,
                'forceStackedView' => isset($sectionRow['force_stacked_view']) && $sectionRow['force_stacked_view'] == 1 ? true : false,
                'position' => isset($sectionRow['position']) ? (int)$sectionRow['position'] : 0,
                'visibility' => $sectionRow['visibility'] ?? 'public',
                'published' => isContentPublished($sectionRow),
                'allowedUsers' => (isset($sectionRow['allowed_users']) && $sectionRow['allowed_users'] ? json_decode($sectionRow['allowed_users'], true) : null) ?? [],
                'allowedGroups' => (isset($sectionRow['allowed_groups']) && $sectionRow['allowed_groups'] ? json_decode($sectionRow['allowed_groups'], true) : null) ?? [],
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
                if (!canUserSeePublishedContent($user, $linkRow)) {
                    continue;
                }
                // Filter links based on visibility
                $visibility = $linkRow['visibility'] ?? 'public';
                $allowedUsers = $linkRow['allowed_users'] ? json_decode($linkRow['allowed_users'], true) : [];
                if (!is_array($allowedUsers)) {
                    $allowedUsers = [];
                }

                $isVisible = canUserSeeByVisibility($user, $linkRow, $userGroupIds);

                // Always check role-based access for authenticated users (for "Your Apps" tab)
                $linkHasRoleAccess = false;
                if ($user && !$user['is_admin']) {
                    $linkHasRoleAccess = canUserViewLinkByRole($user['id'], $linkRow['id'], $db);
                    if ($linkHasRoleAccess && !$isVisible) {
                        $isVisible = true; // Grant access if role-based
                    }
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
                    'published' => isContentPublished($linkRow),
                    'allowedUsers' => $allowedUsers,
                    'allowedGroups' => isset($linkRow['allowed_groups']) && $linkRow['allowed_groups'] ? json_decode($linkRow['allowed_groups'], true) : [],
                    'notes' => isset($linkRow['notes']) ? $linkRow['notes'] : null,
                    'tooltip' => isset($linkRow['tooltip']) ? $linkRow['tooltip'] : null,
                    'richTextContent' => isset($linkRow['rich_text_content']) ? $linkRow['rich_text_content'] : null,
                    'visibleFrom' => isset($linkRow['visible_from']) ? $linkRow['visible_from'] : null,
                    'expiresAt' => isset($linkRow['expires_at']) ? $linkRow['expires_at'] : null,
                    'browser' => isset($linkRow['browser']) ? $linkRow['browser'] : null,
                    'animation' => isset($linkRow['animation']) ? $linkRow['animation'] : null,
                    'isFavorite' => (bool)($linkRow['is_favorite'] ?? false),
                    'hasRoleAccess' => $linkHasRoleAccess,
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
                if (!canUserSeeByVisibility($user, $richTextRow, $userGroupIds)) {
                    continue;
                }
                $section['richTextContent'][] = mapRichTextRow($richTextRow);
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
                if (!canUserSeePublishedContent($user, $sectionRow)) {
                    continue;
                }
                if (!canUserSeeByVisibility($user, $sectionRow, $userGroupIds)) {
                    continue;
                }
                $section = [
                    'id' => $sectionRow['id'],
                    'title' => $sectionRow['title'],
                    'textColor' => (!empty($sectionRow['text_color']) && trim($sectionRow['text_color']) !== '') ? trim($sectionRow['text_color']) : null,
                    'forceStackedView' => isset($sectionRow['force_stacked_view']) && $sectionRow['force_stacked_view'] == 1 ? true : false,
                    'visibility' => $sectionRow['visibility'] ?? 'public',
                    'allowedUsers' => (isset($sectionRow['allowed_users']) && $sectionRow['allowed_users'] ? json_decode($sectionRow['allowed_users'], true) : null) ?? [],
                    'allowedGroups' => (isset($sectionRow['allowed_groups']) && $sectionRow['allowed_groups'] ? json_decode($sectionRow['allowed_groups'], true) : null) ?? [],
                    'links' => []
                ];
                
                if ($user) {
                    $linkStmt = $db->prepare('SELECT links.*, (SELECT 1 FROM user_link_favorites WHERE user_id = ? AND link_id = links.id) as is_favorite FROM links WHERE section_id = ? ORDER BY position ASC, id ASC');
                    $linkStmt->execute([$user['id'], $sectionRow['id']]);
                } else {
                    $linkStmt = $db->prepare('SELECT *, 0 as is_favorite FROM links WHERE section_id = ? ORDER BY position ASC, id ASC');
                    $linkStmt->execute([$sectionRow['id']]);
                }
                
                while ($linkRow = $linkStmt->fetch()) {
                    if (!canUserSeePublishedContent($user, $linkRow)) {
                        continue;
                    }
                    $visibility = $linkRow['visibility'] ?? 'public';
                    $allowedUsers = $linkRow['allowed_users'] ? json_decode($linkRow['allowed_users'], true) : [];
                    $allowedGroups = $linkRow['allowed_groups'] ? json_decode($linkRow['allowed_groups'], true) : [];
                    if (!is_array($allowedUsers)) {
                        $allowedUsers = [];
                    }
                    if (!is_array($allowedGroups)) {
                        $allowedGroups = [];
                    }

                    $isVisible = canUserSeeByVisibility($user, $linkRow, $userGroupIds);

                    // Always check role-based access for authenticated users (for "Your Apps" tab)
                    $linkHasRoleAccess = false;
                    if ($user && !$user['is_admin']) {
                        $linkHasRoleAccess = canUserViewLinkByRole($user['id'], $linkRow['id'], $db);
                        if ($linkHasRoleAccess && !$isVisible) {
                            $isVisible = true; // Grant access if role-based
                        }
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
                        'allowedGroups' => $allowedGroups,
                        'notes' => $linkRow['notes'] ?? null,
                        'tooltip' => $linkRow['tooltip'] ?? null,
                        'richTextContent' => $linkRow['rich_text_content'] ?? null,
                        'browser' => $linkRow['browser'] ?? null,
                        'animation' => $linkRow['animation'] ?? null,
                        'hasRoleAccess' => $linkHasRoleAccess,
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

                $section['richTextContent'] = [];
                $richTextStmt = $db->prepare('SELECT * FROM rich_text_content WHERE section_id = ? ORDER BY position ASC');
                $richTextStmt->execute([$sectionRow['id']]);
                while ($richTextRow = $richTextStmt->fetch()) {
                    if (!canUserSeeByVisibility($user, $richTextRow, $userGroupIds)) {
                        continue;
                    }
                    $section['richTextContent'][] = mapRichTextRow($richTextRow);
                }

                $defaultTab['sections'][] = $section;
            }

            if (!empty($defaultTab['sections'])) {
                $tabs[] = $defaultTab;
            }
        }
    }
    
    $tile['tabs'] = $tabs;
    
    // Avoid duplicating nested section bytes when tabs already carry them.
    // Legacy-only tiles are wrapped into a default tab above, so sections stay empty here.
    $tile['sections'] = [];
    
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
    $tileId = (isset($data['id']) && isValidUuid($data['id'])) ? $data['id'] : generateUuid();
    
    // Handle visibility and allowed_users/allowed_groups
    $visibility = $data['visibility'] ?? 'public';
    $allowedUsers = null;
    $allowedGroups = null;
    $pendingShareUserIds = []; // Users to create invitations for after tile insert
    if ($visibility === 'private' && isset($data['allowedUsers']) && is_array($data['allowedUsers'])) {
        $ownerId = (int)$user['id'];
        $usersToInclude = [];
        foreach ($data['allowedUsers'] as $uid) {
            $uid = (int)$uid;
            if ($uid === $ownerId) {
                $usersToInclude[] = $uid;
            } else {
                $pendingShareUserIds[] = $uid;
            }
        }
        $allowedUsers = !empty($usersToInclude) ? json_encode(array_values(array_unique($usersToInclude))) : json_encode([$ownerId]);
    }
    if ($visibility === 'private' && isset($data['allowedGroups']) && is_array($data['allowedGroups'])) {
        $allowedGroups = json_encode($data['allowedGroups']);
    }
    
    // Handle hyperlink fields
    $isHyperlink = isset($data['isHyperlink']) && $data['isHyperlink'] ? 1 : 0;
    $hyperlinkUrl = $data['hyperlinkUrl'] ?? null;
    $openInNewTab = isset($data['openInNewTab']) && $data['openInNewTab'] ? 1 : 0;
    
    // Handle scheduling fields
    $visibleFrom = isset($data['visibleFrom']) && $data['visibleFrom'] ? $data['visibleFrom'] : null;
    $expiresAt = isset($data['expiresAt']) && $data['expiresAt'] ? $data['expiresAt'] : null;
    
    // Handle tile decoration fields - preserve values, only set to null if truly missing
    $tileBackgroundColor = isset($data['tileBackgroundColor']) && $data['tileBackgroundColor'] !== null && $data['tileBackgroundColor'] !== '' ? $data['tileBackgroundColor'] : null;
    // For tileGradientEnabled, check if key exists (not just truthy) to preserve false values
    $tileGradientEnabled = array_key_exists('tileGradientEnabled', $data) ? ($data['tileGradientEnabled'] ? 1 : 0) : null;
    $tileGradientColors = ($tileGradientEnabled === 1 && isset($data['tileGradientColors']) && is_array($data['tileGradientColors']) && count($data['tileGradientColors']) > 0) ? json_encode($data['tileGradientColors']) : null;
    $tileGradientColorPositions = ($tileGradientEnabled === 1 && isset($data['tileGradientColorPositions']) && is_array($data['tileGradientColorPositions']) && count($data['tileGradientColorPositions']) > 0) ? json_encode($data['tileGradientColorPositions']) : null;
    $tileGradientDirection = ($tileGradientEnabled === 1 && isset($data['tileGradientDirection']) && $data['tileGradientDirection'] !== null) ? (is_numeric($data['tileGradientDirection']) ? (int)$data['tileGradientDirection'] : $data['tileGradientDirection']) : null;
    $tileGradientType = ($tileGradientEnabled === 1 && isset($data['tileGradientType']) && $data['tileGradientType']) ? $data['tileGradientType'] : null;
    $tileBorderRadius = array_key_exists('tileBorderRadius', $data) && $data['tileBorderRadius'] !== null ? (int)$data['tileBorderRadius'] : null;
    // Don't save #000000 (black) as it's effectively "no decoration" - treat it as null
    $tileTextColor = isset($data['tileTextColor']) && $data['tileTextColor'] !== null && $data['tileTextColor'] !== '' && strtolower(trim($data['tileTextColor'])) !== '#000000' && strtolower(trim($data['tileTextColor'])) !== '000000' ? $data['tileTextColor'] : null;
    
    // Page entrance animation for sections inside this space
    $pageAnimation = isset($data['pageAnimation']) && $data['pageAnimation'] !== '' && $data['pageAnimation'] !== 'none'
        ? $data['pageAnimation']
        : null;

    // Default entrance animation for all links on this space
    $linksAnimation = isset($data['linksAnimation']) && $data['linksAnimation'] !== '' && $data['linksAnimation'] !== 'none'
        ? $data['linksAnimation']
        : null;

    // Optional header image URL (PNG stored under uploads/)
    $headerImage = isset($data['headerImage']) && is_string($data['headerImage']) && trim($data['headerImage']) !== ''
        ? trim($data['headerImage'])
        : null;
    $headerImageAlign = isset($data['headerImageAlign']) && in_array($data['headerImageAlign'], ['left', 'center', 'right'], true)
        ? $data['headerImageAlign']
        : ($headerImage ? 'right' : null);
    $headerImageOpacity = $headerImage !== null
        ? (isset($data['headerImageOpacity']) && is_numeric($data['headerImageOpacity'])
            ? max(0, min(100, (int)$data['headerImageOpacity']))
            : 100)
        : null;
    $headerImageOffsetX = $headerImage !== null
        ? (isset($data['headerImageOffsetX']) && is_numeric($data['headerImageOffsetX'])
            ? max(-300, min(300, (int)$data['headerImageOffsetX']))
            : 0)
        : null;
    $headerImageFit = $headerImage !== null
        ? ((isset($data['headerImageFit']) && in_array($data['headerImageFit'], ['contain', 'cover'], true))
            ? $data['headerImageFit']
            : 'contain')
        : null;
    // showEmoji defaults to true when omitted
    $showEmoji = array_key_exists('showEmoji', $data)
        ? (!empty($data['showEmoji']) && $data['showEmoji'] !== '0' && $data['showEmoji'] !== 0 && $data['showEmoji'] !== false ? 1 : 0)
        : 1;
    $emojiImage = isset($data['emojiImage']) && is_string($data['emojiImage']) && trim($data['emojiImage']) !== ''
        ? trim($data['emojiImage'])
        : null;
    $showTitle = array_key_exists('showTitle', $data)
        ? (!empty($data['showTitle']) && $data['showTitle'] !== '0' && $data['showTitle'] !== 0 && $data['showTitle'] !== false ? 1 : 0)
        : 1;
    $showDescription = array_key_exists('showDescription', $data)
        ? (!empty($data['showDescription']) && $data['showDescription'] !== '0' && $data['showDescription'] !== 0 && $data['showDescription'] !== false ? 1 : 0)
        : 1;
    $headerImageOffsetY = $headerImage !== null
        ? (isset($data['headerImageOffsetY']) && is_numeric($data['headerImageOffsetY'])
            ? max(-300, min(300, (int)$data['headerImageOffsetY']))
            : 0)
        : null;

    // Default browser for links in this space (import/create)
    $browser = isset($data['browser']) && $data['browser'] !== 'default' && $data['browser'] !== ''
        ? $data['browser']
        : null;

    // Position: use provided value (e.g. from import) or append at end so tile order is preserved
    $position = null;
    if (isset($data['position']) && is_numeric($data['position'])) {
        $position = (int)$data['position'];
    }
    if ($position === null) {
        $maxStmt = $db->prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM tiles WHERE deleted_at IS NULL AND archived_at IS NULL');
        $maxStmt->execute();
        $position = (int)$maxStmt->fetchColumn();
    }

    // Source tab: public (default) or staging (admin only)
    $sourceTab = isset($data['sourceTab']) ? trim((string)$data['sourceTab']) : (isset($data['source_tab']) ? trim((string)$data['source_tab']) : 'public');
    if ($sourceTab !== 'public' && $sourceTab !== 'staging') {
        $sourceTab = 'public';
    }
    if ($sourceTab === 'staging' && empty($user['is_admin'])) {
        $sourceTab = 'public';
    }

    // Published flag: only admins may create unpublished content
    $published = resolvePublishedFlag($data, $user, true);
    
    $stmt = $db->prepare('INSERT INTO tiles (id, user_id, title, description, html_content, emoji, theme_color, "group", visibility, allowed_users, allowed_groups, is_hyperlink, hyperlink_url, open_in_new_tab, visible_from, expires_at, browser, tile_background_color, tile_gradient_enabled, tile_gradient_colors, tile_gradient_color_positions, tile_gradient_direction, tile_gradient_type, tile_border_radius, tile_text_color, page_animation, links_animation, header_image, header_image_align, header_image_opacity, header_image_offset_x, header_image_offset_y, header_image_fit, show_emoji, emoji_image, show_title, show_description, source_tab, published, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    
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
        $allowedGroups,
        $isHyperlink,
        $hyperlinkUrl,
        $openInNewTab,
        $visibleFrom,
        $expiresAt,
        $browser,
        $tileBackgroundColor,
        $tileGradientEnabled,
        $tileGradientColors,
        $tileGradientColorPositions,
        $tileGradientDirection,
        $tileGradientType,
        $tileBorderRadius,
        $tileTextColor,
        $pageAnimation,
        $linksAnimation,
        $headerImage,
        $headerImageAlign,
        $headerImageOpacity,
        $headerImageOffsetX,
        $headerImageOffsetY,
        $headerImageFit,
        $showEmoji,
        $emojiImage,
        $showTitle,
        $showDescription,
        $sourceTab,
        $published,
        $position,
        $data['createdAt'] ?? time()
    ])) {
        sendJSON(['error' => 'Failed to create tile'], 500);
    }
    
    // Create share invitations for users added to allowed list (they must accept to get access)
    if (!empty($pendingShareUserIds) && $visibility === 'private') {
        $now = time();
        $ownerId = (int)$user['id'];
        foreach ($pendingShareUserIds as $receiverId) {
            $receiverId = (int)$receiverId;
            if ($receiverId === $ownerId) continue;
            $invStmt = $db->prepare('INSERT INTO tile_share_invitations (tile_id, sharer_user_id, receiver_user_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
            try {
                $invStmt->execute([$tileId, $ownerId, $receiverId, 'pending', $now, $now]);
            } catch (PDOException $e) {
                if (strpos($e->getMessage(), 'UNIQUE') === false) throw $e;
            }
        }
    }
    
    // Handle tabs (new structure) or sections (backward compatibility)
    if (isset($data['tabs']) && is_array($data['tabs'])) {
        // New structure with tabs — mirror updateTileInternal so import preserves ACL + schedule fields
        foreach ($data['tabs'] as $tabIndex => $tab) {
            $tabId = $tab['id'] ?? uniqid('tab_', true);
            $tabColor = (!empty($tab['textColor']) && trim($tab['textColor']) !== '') ? trim($tab['textColor']) : null;
            $tabVisibility = $tab['visibility'] ?? 'public';
            $tabAllowedUsers = isset($tab['allowedUsers']) && is_array($tab['allowedUsers']) ? json_encode($tab['allowedUsers']) : null;
            $tabAllowedGroups = isset($tab['allowedGroups']) && is_array($tab['allowedGroups']) ? json_encode($tab['allowedGroups']) : null;
            $tabPublished = resolvePublishedFlag($tab, $user, true);
            $tabStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position, text_color, visible_from, expires_at, visibility, allowed_users, allowed_groups, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $tabStmt->execute([
                $tabId,
                $tileId,
                $tab['title'] ?? 'New Tab',
                $tab['position'] ?? $tabIndex,
                $tabColor,
                $tab['visibleFrom'] ?? null,
                $tab['expiresAt'] ?? null,
                $tabVisibility,
                $tabAllowedUsers,
                $tabAllowedGroups,
                $tabPublished
            ]);
            
            // Insert sections for this tab
            if (isset($tab['sections']) && is_array($tab['sections'])) {
                foreach ($tab['sections'] as $sectionIndex => $section) {
                    $sectionId = $section['id'] ?? uniqid('section_', true);
                    $sectionPosition = isset($section['position']) ? (int)$section['position'] : $sectionIndex;
                    $secVisibility = $section['visibility'] ?? 'public';
                    $secAllowedUsers = isset($section['allowedUsers']) && is_array($section['allowedUsers']) ? json_encode($section['allowedUsers']) : null;
                    $secAllowedGroups = isset($section['allowedGroups']) && is_array($section['allowedGroups']) ? json_encode($section['allowedGroups']) : null;
                    $secPublished = resolvePublishedFlag($section, $user, true);
                    $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, text_color, visible_from, expires_at, force_stacked_view, position, visibility, allowed_users, allowed_groups, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                    $sectionStmt->execute([
                        $sectionId,
                        $tileId,
                        $tabId,
                        $section['title'] ?? '',
                        $section['textColor'] ?? null,
                        $section['visibleFrom'] ?? null,
                        $section['expiresAt'] ?? null,
                        isset($section['forceStackedView']) && $section['forceStackedView'] === true ? 1 : 0,
                        $sectionPosition,
                        $secVisibility,
                        $secAllowedUsers,
                        $secAllowedGroups,
                        $secPublished
                    ]);
                    
                    // Insert links for this section
                    if (isset($section['links']) && is_array($section['links'])) {
                        foreach ($section['links'] as $link) {
                            $linkId = $link['id'] ?? uniqid('link_', true);
                            $linkVisibility = $link['visibility'] ?? 'public';
                            $linkAllowedUsers = isset($link['allowedUsers']) && is_array($link['allowedUsers']) 
                                ? json_encode($link['allowedUsers']) 
                                : null;
                            $linkAllowedGroups = isset($link['allowedGroups']) && is_array($link['allowedGroups']) 
                                ? json_encode($link['allowedGroups']) 
                                : null;
                            $linkPublished = resolvePublishedFlag($link, $user, true);
                            try {
                                $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, text_color, visibility, allowed_users, allowed_groups, notes, tooltip, visible_from, expires_at, browser, position, rich_text_content, animation, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                                $linkStmt->execute([
                                    $linkId,
                                    $sectionId,
                                    $link['label'],
                                    $link['url'],
                                    $link['icon'] ?? null,
                                    $link['textColor'] ?? null,
                                    $linkVisibility,
                                    $linkAllowedUsers,
                                    $linkAllowedGroups,
                                    $link['notes'] ?? null,
                                    $link['tooltip'] ?? null,
                                    $link['visibleFrom'] ?? null,
                                    $link['expiresAt'] ?? null,
                                    $link['browser'] ?? null,
                                    isset($link['position']) ? (int)$link['position'] : 0,
                                    $link['richTextContent'] ?? null,
                                    $link['animation'] ?? null,
                                    $linkPublished
                                ]);
                            } catch (PDOException $e) {
                                error_log('Error inserting link: ' . $e->getMessage());
                                error_log('Link data: ' . json_encode($link));
                                // Try without icon/text_color as fallback
                                try {
                                    $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, visibility, allowed_users, allowed_groups, notes, tooltip, visible_from, expires_at, browser, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                                    $linkStmt->execute([
                                        $linkId,
                                        $sectionId,
                                        $link['label'],
                                        $link['url'],
                                        $linkVisibility,
                                        $linkAllowedUsers,
                                        $linkAllowedGroups,
                                        $link['notes'] ?? null,
                                        $link['tooltip'] ?? null,
                                        $link['visibleFrom'] ?? null,
                                        $link['expiresAt'] ?? null,
                                        $link['browser'] ?? null,
                                        $linkPublished
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
                                    insertRichTextContent($db, $richTextId, $sectionId, $richText);
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
            $secVisibility = $section['visibility'] ?? 'public';
            $secAllowedUsers = isset($section['allowedUsers']) && is_array($section['allowedUsers']) ? json_encode($section['allowedUsers']) : null;
            $secAllowedGroups = isset($section['allowedGroups']) && is_array($section['allowedGroups']) ? json_encode($section['allowedGroups']) : null;
            $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, text_color, visible_from, expires_at, force_stacked_view, position, visibility, allowed_users, allowed_groups) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $sectionStmt->execute([
                $sectionId,
                $tileId,
                $defaultTabId,
                $section['title'] ?? '',
                $section['textColor'] ?? null,
                $section['visibleFrom'] ?? null,
                $section['expiresAt'] ?? null,
                isset($section['forceStackedView']) && $section['forceStackedView'] === true ? 1 : 0,
                $sectionPosition,
                $secVisibility,
                $secAllowedUsers,
                $secAllowedGroups
            ]);
            
            if (isset($section['links']) && is_array($section['links'])) {
                foreach ($section['links'] as $link) {
                    $linkId = $link['id'] ?? uniqid('link_', true);
                    $linkVisibility = $link['visibility'] ?? 'public';
                    $linkAllowedUsers = isset($link['allowedUsers']) && is_array($link['allowedUsers']) ? json_encode($link['allowedUsers']) : null;
                    $linkAllowedGroups = isset($link['allowedGroups']) && is_array($link['allowedGroups']) ? json_encode($link['allowedGroups']) : null;
                    try {
                        $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, text_color, visibility, allowed_users, allowed_groups, notes, tooltip, browser, animation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                        $linkStmt->execute([
                            $linkId,
                            $sectionId,
                            $link['label'],
                            $link['url'],
                            $link['icon'] ?? null,
                            $link['textColor'] ?? null,
                            $linkVisibility,
                            $linkAllowedUsers,
                            $linkAllowedGroups,
                            $link['notes'] ?? null,
                            $link['tooltip'] ?? null,
                            $link['browser'] ?? null,
                            $link['animation'] ?? null
                        ]);
                    } catch (PDOException $e) {
                        error_log('Error inserting link (backward compat): ' . $e->getMessage());
                        // Try without icon/text_color as fallback
                        try {
                                    $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, visibility, allowed_users, allowed_groups, notes, tooltip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
                            $linkStmt->execute([
                                $linkId,
                                $sectionId,
                                $link['label'],
                                $link['url'],
                                $linkVisibility,
                                $linkAllowedUsers,
                                $linkAllowedGroups,
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
    
    // Handle tile messages
    if (isset($data['messages']) && is_array($data['messages'])) {
        $msgStmt = $db->prepare('INSERT INTO tile_messages (id, tile_id, content, type, start_date, end_date, is_active, priority, text_color, font_style, display_location, animation_type, delay_before, celebration_effect, celebration_config, url, url_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        foreach ($data['messages'] as $msg) {
            $msgId = $msg['id'] ?? uniqid('msg_', true);
            $cc = isset($msg['celebrationConfig']) && is_array($msg['celebrationConfig']) ? json_encode($msg['celebrationConfig']) : null;
            $msgStmt->execute([
                $msgId,
                $tileId,
                $msg['content'] ?? '',
                $msg['type'] ?? 'info',
                $msg['startDate'] ?? null,
                $msg['endDate'] ?? null,
                isset($msg['isActive']) && $msg['isActive'] ? 1 : 0,
                isset($msg['priority']) ? (int)$msg['priority'] : 0,
                $msg['textColor'] ?? null,
                $msg['fontStyle'] ?? null,
                $msg['displayLocation'] ?? 'both',
                $msg['animationType'] ?? 'rollover',
                isset($msg['delayBefore']) ? (float)$msg['delayBefore'] : 0,
                $msg['celebrationEffect'] ?? 'fireworks',
                $cc,
                $msg['url'] ?? null,
                $msg['urlLabel'] ?? null
            ]);
        }
    }

    invalidateGuestTilesListCache();
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

    // Permission checks are now inside updateTileInternal or handled here?
    // Let's do a quick check here for consistency with other handlers,
    // but updateTileInternal does the heavy lifting.
    
    // Actually, updateTileInternal checks permissions.
    // However, for clean error handling we can just wrap it.

    try {
        // We pass permissions check logic to internal function or keep it here?
        // updateTileInternal has:
        // if (!canUserEditTile($user['id'], $tileId, $db)) throw new Exception(...)
        
        updateTileInternal($tileId, $data, $db, $user, false, $data['is_final'] ?? false);
        sendJSON(['success' => true]);
    } catch (Exception $e) {
        $code = 500;
        if ($e->getMessage() === 'Tile not found') $code = 404;
        if ($e->getMessage() === 'You do not have permission to edit this tile') $code = 403;
        
        error_log('Error in handleUpdateTile: ' . $e->getMessage());
        sendJSON(['error' => $e->getMessage()], $code);
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
    
    invalidateGuestTilesListCache();
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
    
    // Check granular permission for changing browser (deny unless explicitly true; null = no tile-admin record = deny)
    $canChangeBrowser = canTileAdminPerformAction($user['id'], $tileId, 'change_browser', $db);
    if ($canChangeBrowser !== true) {
        sendJSON(['error' => 'You do not have permission to change browser settings'], 403);
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

/**
 * Update only the sections/page entrance animation for a space (tile).
 * Avoids a full tile PUT which can clear page_animation when client payloads omit the field.
 */
function handleUpdatePageAnimation($tileId) {
    $user = requireAuth();
    $data = getJSONInput();
    $db = getDB();

    $checkStmt = $db->prepare('SELECT id FROM tiles WHERE id = ? AND deleted_at IS NULL');
    $checkStmt->execute([$tileId]);
    $tile = $checkStmt->fetch();

    if (!$tile) {
        sendJSON(['error' => 'Tile not found'], 404);
        return;
    }

    if (!canUserEditTile($user['id'], $tileId, $db)) {
        sendJSON(['error' => 'You do not have permission to edit this tile'], 403);
        return;
    }

    $raw = $data['pageAnimation'] ?? $data['page_animation'] ?? null;
    $pageAnimation = null;
    if (is_string($raw) && $raw !== '' && strtolower($raw) !== 'none') {
        $pageAnimation = $raw;
    }

    $stmt = $db->prepare('UPDATE tiles SET page_animation = ? WHERE id = ?');
    $stmt->execute([$pageAnimation, $tileId]);

    sendJSON([
        'success' => true,
        'pageAnimation' => $pageAnimation,
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
        
        // Check granular permission for cloning (deny unless explicitly true; null = no tile-admin record = deny)
        $canClone = canTileAdminPerformAction($user['id'], $tileId, 'clone_tile', $db);
        if ($canClone !== true) {
            $db->rollBack();
            sendJSON(['error' => 'You do not have permission to clone this tile'], 403);
            return;
        }
        
        // Check visibility - user must be able to see the tile to clone it
        $tileVisibility = $originalTile['visibility'] ?? 'public';
        $tileAllowedUsers = $originalTile['allowed_users'] ? json_decode($originalTile['allowed_users'], true) : [];
        $tileAllowedGroups = $originalTile['allowed_groups'] ? json_decode($originalTile['allowed_groups'], true) : [];
        
        $isTileVisible = false;
        if ($user && $user['is_admin']) {
            $isTileVisible = true;
        } elseif ($tileVisibility === 'public') {
            $isTileVisible = true;
        } elseif ($tileVisibility === 'authenticated' && $user) {
            $isTileVisible = true;
        } elseif ($tileVisibility === 'private' && $user) {
            $isTileVisible = in_array($user['id'], $tileAllowedUsers);
            // Also check if user is in any allowed groups
            if (!$isTileVisible && !empty($tileAllowedGroups)) {
                $groupStmt = $db->prepare('SELECT group_id FROM user_group_members WHERE user_id = ?');
                $groupStmt->execute([$user['id']]);
                $userGroupIds = [];
                while ($group = $groupStmt->fetch()) {
                    $userGroupIds[] = (int)$group['group_id'];
                }
                if (!empty($userGroupIds)) {
                    $isTileVisible = !empty(array_intersect($userGroupIds, $tileAllowedGroups));
                }
            }
        }
        
        if (!$isTileVisible) {
            $db->rollBack();
            sendJSON(['error' => 'Tile not found'], 404);
            return;
        }

        // Unpublished tiles are admin-only to clone
        if (!canUserSeePublishedContent($user, $originalTile)) {
            $db->rollBack();
            sendJSON(['error' => 'Tile not found'], 404);
            return;
        }
    
        // Generate new tile ID
        $newTileId = generateUuid();
        
        // Get current max position to append new tile
        $maxPositionStmt = $db->prepare('SELECT MAX(position) as max_pos FROM tiles');
        $maxPositionStmt->execute();
        $maxPosRow = $maxPositionStmt->fetch();
        $newPosition = ($maxPosRow && $maxPosRow['max_pos'] !== null) ? (int)$maxPosRow['max_pos'] + 1 : 0;
        
        // Create new tile with "Copy of" prefix
        $newTitle = 'Copy of ' . $originalTile['title'];
        $newVisibility = $originalTile['visibility'];
        $newAllowedUsers = $originalTile['allowed_users'];
        $newAllowedGroups = $originalTile['allowed_groups'];
        
        // Prepare tile decoration properties
        $tileBackgroundColor = !empty($originalTile['tile_background_color']) ? $originalTile['tile_background_color'] : null;
        $tileGradientEnabled = isset($originalTile['tile_gradient_enabled']) && $originalTile['tile_gradient_enabled'] !== null ? (int)$originalTile['tile_gradient_enabled'] : null;
        $tileGradientColors = !empty($originalTile['tile_gradient_colors']) ? $originalTile['tile_gradient_colors'] : null;
        $tileGradientColorPositions = !empty($originalTile['tile_gradient_color_positions']) ? $originalTile['tile_gradient_color_positions'] : null;
        $tileGradientDirection = !empty($originalTile['tile_gradient_direction']) ? $originalTile['tile_gradient_direction'] : null;
        $tileGradientType = !empty($originalTile['tile_gradient_type']) ? $originalTile['tile_gradient_type'] : null;
        $tileBorderRadius = isset($originalTile['tile_border_radius']) && $originalTile['tile_border_radius'] !== null ? (int)$originalTile['tile_border_radius'] : null;
        $tileTextColor = !empty($originalTile['tile_text_color']) ? $originalTile['tile_text_color'] : null;
        $headerImage = !empty($originalTile['header_image']) ? $originalTile['header_image'] : null;
        $headerImageAlign = (isset($originalTile['header_image_align']) && in_array($originalTile['header_image_align'], ['left', 'center', 'right'], true))
            ? $originalTile['header_image_align']
            : ($headerImage ? 'right' : null);
        $headerImageOpacity = $headerImage !== null
            ? (isset($originalTile['header_image_opacity']) && $originalTile['header_image_opacity'] !== null && $originalTile['header_image_opacity'] !== ''
                ? max(0, min(100, (int)$originalTile['header_image_opacity'])) : 100)
            : null;
        $headerImageOffsetX = $headerImage !== null
            ? (isset($originalTile['header_image_offset_x']) && $originalTile['header_image_offset_x'] !== null && $originalTile['header_image_offset_x'] !== ''
                ? max(-300, min(300, (int)$originalTile['header_image_offset_x'])) : 0)
            : null;
        $headerImageFit = $headerImage !== null
            ? ((isset($originalTile['header_image_fit']) && $originalTile['header_image_fit'] === 'cover') ? 'cover' : 'contain')
            : null;
        $showEmoji = !(isset($originalTile['show_emoji']) && ((int)$originalTile['show_emoji'] === 0 || $originalTile['show_emoji'] === '0'));
        $emojiImage = !empty($originalTile['emoji_image']) ? $originalTile['emoji_image'] : null;
        $showTitle = !(isset($originalTile['show_title']) && ((int)$originalTile['show_title'] === 0 || $originalTile['show_title'] === '0'));
        $showDescription = !(isset($originalTile['show_description']) && ((int)$originalTile['show_description'] === 0 || $originalTile['show_description'] === '0'));
        $headerImageOffsetY = $headerImage !== null
            ? (isset($originalTile['header_image_offset_y']) && $originalTile['header_image_offset_y'] !== null && $originalTile['header_image_offset_y'] !== ''
                ? max(-300, min(300, (int)$originalTile['header_image_offset_y'])) : 0)
            : null;
        // Copy source_tab so cloned tile stays in same area (staging vs public)
        $newSourceTab = isset($originalTile['source_tab']) && trim($originalTile['source_tab']) === 'staging' ? 'staging' : 'public';
        
        $insertStmt = $db->prepare('INSERT INTO tiles (id, user_id, title, description, html_content, emoji, theme_color, "group", visibility, allowed_users, allowed_groups, is_hyperlink, hyperlink_url, open_in_new_tab, visible_from, expires_at, browser, tile_background_color, tile_gradient_enabled, tile_gradient_colors, tile_gradient_color_positions, tile_gradient_direction, tile_gradient_type, tile_border_radius, tile_text_color, page_animation, links_animation, header_image, header_image_align, header_image_opacity, header_image_offset_x, header_image_offset_y, header_image_fit, show_emoji, emoji_image, show_title, show_description, source_tab, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        
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
            $newAllowedGroups,
            $originalTile['is_hyperlink'] ?? 0,
            $originalTile['hyperlink_url'] ?? null,
            $originalTile['open_in_new_tab'] ?? 0,
            $originalTile['visible_from'] ?? null,
            $originalTile['expires_at'] ?? null,
            $originalTile['browser'] ?? null,
            $tileBackgroundColor,
            $tileGradientEnabled,
            $tileGradientColors,
            $tileGradientColorPositions,
            $tileGradientDirection,
            $tileGradientType,
            $tileBorderRadius,
            $tileTextColor,
            $originalTile['page_animation'] ?? null,
            $originalTile['links_animation'] ?? null,
            $headerImage,
            $headerImageAlign,
            $headerImageOpacity,
            $headerImageOffsetX,
            $headerImageOffsetY,
            $headerImageFit,
            $showEmoji ? 1 : 0,
            $emojiImage,
            $showTitle ? 1 : 0,
            $showDescription ? 1 : 0,
            $newSourceTab,
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
                    $linkInsertStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, text_color, visibility, allowed_users, allowed_groups, notes, tooltip, visible_from, expires_at, browser, position, rich_text_content, animation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                    $linkInsertStmt->execute([
                        $newLinkId,
                        $newSectionId,
                        $link['label'],
                        $link['url'],
                        $link['icon'] ?? null,
                        $link['text_color'] ?? null,
                        $link['visibility'] ?? 'public',
                        null, // Reset allowed_users for cloned links
                        null, // Reset allowed_groups for cloned links
                        $link['notes'] ?? null,
                        $link['tooltip'] ?? null,
                        $link['visible_from'] ?? null,
                        $link['expires_at'] ?? null,
                        $link['browser'] ?? null,
                        isset($link['position']) ? (int)$link['position'] : 0,
                                $link['rich_text_content'] ?? null,
                                $link['animation'] ?? null
                    ]);
                }
                
                // Clone rich text content for legacy sections
                $richTextStmt = $db->prepare('SELECT * FROM rich_text_content WHERE section_id = ?');
                $richTextStmt->execute([$section['id']]);
                $richTextItems = $richTextStmt->fetchAll();
                
                foreach ($richTextItems as $richText) {
                    $newRichTextId = uniqid('richtext_', true);
                    insertRichTextContent($db, $newRichTextId, $newSectionId, [
                        'content' => $richText['content'] ?? '',
                        'position' => isset($richText['position']) ? (int)$richText['position'] : 0,
                        'visibility' => $richText['visibility'] ?? 'public',
                        'allowed_users' => $richText['allowed_users'] ?? null,
                        'allowed_groups' => $richText['allowed_groups'] ?? null,
                        'boxed' => !empty($richText['boxed']),
                        'box_title' => $richText['box_title'] ?? null,
                        'box_footer' => $richText['box_footer'] ?? null,
                        'box_header_align' => $richText['box_header_align'] ?? 'left',
                        'box_footer_align' => $richText['box_footer_align'] ?? 'left',
                        'box_header_bg' => $richText['box_header_bg'] ?? null,
                        'box_footer_bg' => $richText['box_footer_bg'] ?? null,
                        'box_body_bg' => $richText['box_body_bg'] ?? null,
                        'box_header_font_weight' => $richText['box_header_font_weight'] ?? 'bold',
                        'box_footer_font_weight' => $richText['box_footer_font_weight'] ?? 'normal',
                        'box_header_font_size' => $richText['box_header_font_size'] ?? 'md',
                        'box_footer_font_size' => $richText['box_footer_font_size'] ?? 'sm',
                        'box_header_emoji' => $richText['box_header_emoji'] ?? null,
                        'box_importance' => $richText['box_importance'] ?? 'notes',
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
                    $linkInsertStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, text_color, visibility, allowed_users, allowed_groups, notes, tooltip, visible_from, expires_at, browser, position, rich_text_content, animation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                    $linkInsertStmt->execute([
                        $newLinkId,
                        $newSectionId,
                        $link['label'],
                        $link['url'],
                        $link['icon'] ?? null,
                        $link['text_color'] ?? null,
                        $link['visibility'] ?? 'public',
                        null, // Reset allowed_users for cloned links
                        null, // Reset allowed_groups for cloned links
                        $link['notes'] ?? null,
                        $link['tooltip'] ?? null,
                        $link['visible_from'] ?? null,
                        $link['expires_at'] ?? null,
                        $link['browser'] ?? null,
                        isset($link['position']) ? (int)$link['position'] : 0,
                                $link['rich_text_content'] ?? null,
                                $link['animation'] ?? null
                    ]);
                }
                
                // Clone rich text content for sections
                $richTextStmt = $db->prepare('SELECT * FROM rich_text_content WHERE section_id = ?');
                $richTextStmt->execute([$section['id']]);
                $richTextItems = $richTextStmt->fetchAll();
                
                foreach ($richTextItems as $richText) {
                    $newRichTextId = uniqid('richtext_', true);
                    insertRichTextContent($db, $newRichTextId, $newSectionId, [
                        'content' => $richText['content'] ?? '',
                        'position' => isset($richText['position']) ? (int)$richText['position'] : 0,
                        'visibility' => $richText['visibility'] ?? 'public',
                        'allowed_users' => $richText['allowed_users'] ?? null,
                        'allowed_groups' => $richText['allowed_groups'] ?? null,
                        'boxed' => !empty($richText['boxed']),
                        'box_title' => $richText['box_title'] ?? null,
                        'box_footer' => $richText['box_footer'] ?? null,
                        'box_header_align' => $richText['box_header_align'] ?? 'left',
                        'box_footer_align' => $richText['box_footer_align'] ?? 'left',
                        'box_header_bg' => $richText['box_header_bg'] ?? null,
                        'box_footer_bg' => $richText['box_footer_bg'] ?? null,
                        'box_body_bg' => $richText['box_body_bg'] ?? null,
                        'box_header_font_weight' => $richText['box_header_font_weight'] ?? 'bold',
                        'box_footer_font_weight' => $richText['box_footer_font_weight'] ?? 'normal',
                        'box_header_font_size' => $richText['box_header_font_size'] ?? 'md',
                        'box_footer_font_size' => $richText['box_footer_font_size'] ?? 'sm',
                        'box_header_emoji' => $richText['box_header_emoji'] ?? null,
                        'box_importance' => $richText['box_importance'] ?? 'notes',
                    ]);
                }
            }
        }
    }
    
    // Clone tile messages
    $msgStmt = $db->prepare('SELECT * FROM tile_messages WHERE tile_id = ?');
    $msgStmt->execute([$tileId]);
    $messages = $msgStmt->fetchAll();
    
    if (!empty($messages)) {
        $msgInsertStmt = $db->prepare('INSERT INTO tile_messages (id, tile_id, content, type, start_date, end_date, is_active, priority, text_color, font_style, display_location, animation_type, delay_before, celebration_effect, celebration_config, url, url_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        foreach ($messages as $msg) {
            $newMsgId = uniqid('msg_', true);
            $cc = isset($msg['celebration_config']) && $msg['celebration_config'] !== null && $msg['celebration_config'] !== '' ? $msg['celebration_config'] : null;
            $msgInsertStmt->execute([
                $newMsgId,
                $newTileId,
                $msg['content'] ?? '',
                $msg['type'] ?? 'info',
                $msg['start_date'] ?? null,
                $msg['end_date'] ?? null,
                isset($msg['is_active']) && $msg['is_active'] ? 1 : 0,
                isset($msg['priority']) ? (int)$msg['priority'] : 0,
                $msg['text_color'] ?? null,
                $msg['font_style'] ?? null,
                $msg['display_location'] ?? 'both',
                $msg['animation_type'] ?? 'rollover',
                isset($msg['delay_before']) ? (float)$msg['delay_before'] : 0,
                $msg['celebration_effect'] ?? 'fireworks',
                $cc,
                $msg['url'] ?? null,
                $msg['url_label'] ?? null
            ]);
        }
    }
        
    // Commit transaction
    $db->commit();
    
    invalidateGuestTilesListCache();
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
    
    // Optional: source_tab to scope clone (staging vs public)
    $sourceTab = 'public';
    $rawInput = @file_get_contents('php://input');
    if ($rawInput !== false && $rawInput !== '') {
        $body = json_decode($rawInput, true);
        if (is_array($body)) {
            if (isset($body['sourceTab']) && trim((string)$body['sourceTab']) === 'staging') {
                $sourceTab = 'staging';
            } elseif (isset($body['source_tab']) && trim((string)$body['source_tab']) === 'staging') {
                $sourceTab = 'staging';
            }
        }
    }

    // Get all tiles in this category (exclude deleted and archived tiles), optionally scoped by source_tab
    if ($sourceTab === 'staging') {
        $stmt = $db->prepare('SELECT * FROM tiles WHERE "group" = ? AND deleted_at IS NULL AND archived_at IS NULL AND (source_tab = ? OR source_tab = \'staging\') ORDER BY position ASC');
        $stmt->execute([$categoryName, 'staging']);
    } else {
        $stmt = $db->prepare('SELECT * FROM tiles WHERE "group" = ? AND deleted_at IS NULL AND archived_at IS NULL AND (source_tab IS NULL OR source_tab = ? OR source_tab = \'\') ORDER BY position ASC');
        $stmt->execute([$categoryName, 'public']);
    }
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
    
    // Generate new category name: convert to title case, replace spaces with dashes, add "-Copy"
    // Example: "MAIN COPY" -> "Main-Copy", "My Category" -> "My-Category-Copy"
    $categoryNameTitleCase = ucwords(strtolower($categoryName));
    $categoryNameWithDashes = str_replace(' ', '-', $categoryNameTitleCase);
    
    // Check if the name already contains "Copy" (case-insensitive) - if so, just use the converted format
    // Otherwise, add "-Copy" suffix
    if (stripos($categoryName, 'copy') !== false) {
        $newCategoryName = $categoryNameWithDashes;
    } else {
        $newCategoryName = $categoryNameWithDashes . '-Copy';
    }
    
    // Check if the new category name already exists in the same source, if so, append a number
    $counter = 1;
    $finalCategoryName = $newCategoryName;
    while (true) {
        if ($sourceTab === 'staging') {
            $checkStmt = $db->prepare('SELECT COUNT(*) FROM tiles WHERE "group" = ? AND (source_tab = ? OR source_tab = \'staging\')');
            $checkStmt->execute([$finalCategoryName, 'staging']);
        } else {
            $checkStmt = $db->prepare('SELECT COUNT(*) FROM tiles WHERE "group" = ? AND (source_tab IS NULL OR source_tab = ? OR source_tab = \'\')');
            $checkStmt->execute([$finalCategoryName, 'public']);
        }
        $count = $checkStmt->fetchColumn();
        
        if ($count == 0) {
            break; // Category name is available
        }
        
        $finalCategoryName = $categoryNameWithDashes . '-Copy-' . $counter;
        $counter++;
    }
    
    // Get current max position for the target source_tab
    if ($sourceTab === 'staging') {
        $maxPositionStmt = $db->prepare('SELECT MAX(position) as max_pos FROM tiles WHERE source_tab = ?');
        $maxPositionStmt->execute(['staging']);
    } else {
        $maxPositionStmt = $db->prepare('SELECT MAX(position) as max_pos FROM tiles WHERE (source_tab IS NULL OR source_tab = ? OR source_tab = \'\')');
        $maxPositionStmt->execute(['public']);
    }
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
            $newTileId = generateUuid();
            
            // Create new tile with "Copy of" prefix in title
            $newTitle = 'Copy of ' . $originalTile['title'];
            $newVisibility = $originalTile['visibility'];
            $newAllowedUsers = $originalTile['allowed_users'];
            $newAllowedGroups = $originalTile['allowed_groups'];
            
            // Prepare tile decoration properties
            $tileBackgroundColor = !empty($originalTile['tile_background_color']) ? $originalTile['tile_background_color'] : null;
            $tileGradientEnabled = isset($originalTile['tile_gradient_enabled']) && $originalTile['tile_gradient_enabled'] !== null ? (int)$originalTile['tile_gradient_enabled'] : null;
            $tileGradientColors = !empty($originalTile['tile_gradient_colors']) ? $originalTile['tile_gradient_colors'] : null;
            $tileGradientColorPositions = !empty($originalTile['tile_gradient_color_positions']) ? $originalTile['tile_gradient_color_positions'] : null;
            $tileGradientDirection = !empty($originalTile['tile_gradient_direction']) ? $originalTile['tile_gradient_direction'] : null;
            $tileGradientType = !empty($originalTile['tile_gradient_type']) ? $originalTile['tile_gradient_type'] : null;
            $tileBorderRadius = isset($originalTile['tile_border_radius']) && $originalTile['tile_border_radius'] !== null ? (int)$originalTile['tile_border_radius'] : null;
            $tileTextColor = !empty($originalTile['tile_text_color']) ? $originalTile['tile_text_color'] : null;
            $headerImage = !empty($originalTile['header_image']) ? $originalTile['header_image'] : null;
            $headerImageAlign = (isset($originalTile['header_image_align']) && in_array($originalTile['header_image_align'], ['left', 'center', 'right'], true))
                ? $originalTile['header_image_align']
                : ($headerImage ? 'right' : null);
            $headerImageOpacity = $headerImage !== null
                ? (isset($originalTile['header_image_opacity']) && $originalTile['header_image_opacity'] !== null && $originalTile['header_image_opacity'] !== ''
                    ? max(0, min(100, (int)$originalTile['header_image_opacity'])) : 100)
                : null;
            $headerImageOffsetX = $headerImage !== null
                ? (isset($originalTile['header_image_offset_x']) && $originalTile['header_image_offset_x'] !== null && $originalTile['header_image_offset_x'] !== ''
                    ? max(-300, min(300, (int)$originalTile['header_image_offset_x'])) : 0)
                : null;
            $headerImageFit = $headerImage !== null
                ? ((isset($originalTile['header_image_fit']) && $originalTile['header_image_fit'] === 'cover') ? 'cover' : 'contain')
                : null;
            $showEmoji = !(isset($originalTile['show_emoji']) && ((int)$originalTile['show_emoji'] === 0 || $originalTile['show_emoji'] === '0'));
            $emojiImage = !empty($originalTile['emoji_image']) ? $originalTile['emoji_image'] : null;
            $showTitle = !(isset($originalTile['show_title']) && ((int)$originalTile['show_title'] === 0 || $originalTile['show_title'] === '0'));
            $showDescription = !(isset($originalTile['show_description']) && ((int)$originalTile['show_description'] === 0 || $originalTile['show_description'] === '0'));
            $headerImageOffsetY = $headerImage !== null
                ? (isset($originalTile['header_image_offset_y']) && $originalTile['header_image_offset_y'] !== null && $originalTile['header_image_offset_y'] !== ''
                    ? max(-300, min(300, (int)$originalTile['header_image_offset_y'])) : 0)
                : null;
            
            $insertStmt = $db->prepare('INSERT INTO tiles (id, user_id, title, description, html_content, emoji, theme_color, "group", visibility, allowed_users, allowed_groups, is_hyperlink, hyperlink_url, open_in_new_tab, visible_from, expires_at, browser, tile_background_color, tile_gradient_enabled, tile_gradient_colors, tile_gradient_color_positions, tile_gradient_direction, tile_gradient_type, tile_border_radius, tile_text_color, page_animation, links_animation, header_image, header_image_align, header_image_opacity, header_image_offset_x, header_image_offset_y, header_image_fit, show_emoji, emoji_image, show_title, show_description, source_tab, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            
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
                $newAllowedGroups,
                $originalTile['is_hyperlink'] ?? 0,
                $originalTile['hyperlink_url'] ?? null,
                $originalTile['open_in_new_tab'] ?? 0,
                $originalTile['visible_from'] ?? null,
                $originalTile['expires_at'] ?? null,
                $originalTile['browser'] ?? null,
                $tileBackgroundColor,
                $tileGradientEnabled,
                $tileGradientColors,
                $tileGradientColorPositions,
                $tileGradientDirection,
                $tileGradientType,
                $tileBorderRadius,
                $tileTextColor,
                $originalTile['page_animation'] ?? null,
                $originalTile['links_animation'] ?? null,
                $headerImage,
                $headerImageAlign,
                $headerImageOpacity,
                $headerImageOffsetX,
                $headerImageOffsetY,
                $headerImageFit,
                $showEmoji ? 1 : 0,
                $emojiImage,
                $showTitle ? 1 : 0,
                $showDescription ? 1 : 0,
                $sourceTab,
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
                            $linkInsertStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, text_color, visibility, allowed_users, notes, tooltip, visible_from, expires_at, browser, position, rich_text_content, animation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
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
                                $link['position'] ?? 0,
                                $link['rich_text_content'] ?? null,
                                $link['animation'] ?? null
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
                            $linkInsertStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, text_color, visibility, allowed_users, notes, tooltip, visible_from, expires_at, browser, position, rich_text_content, animation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
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
                                $link['position'] ?? 0,
                                $link['rich_text_content'] ?? null,
                                $link['animation'] ?? null
                            ]);
                        }
                    }
                }
            }
            
            // Clone tile messages
            $msgStmt = $db->prepare('SELECT * FROM tile_messages WHERE tile_id = ?');
            $msgStmt->execute([$originalTile['id']]);
            $messages = $msgStmt->fetchAll();
            
            if (!empty($messages)) {
                $msgInsertStmt = $db->prepare('INSERT INTO tile_messages (id, tile_id, content, type, start_date, end_date, is_active, priority, text_color, font_style, display_location, animation_type, delay_before, celebration_effect, celebration_config, url, url_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                foreach ($messages as $msg) {
                    $newMsgId = uniqid('msg_', true);
                    $cc = isset($msg['celebration_config']) && $msg['celebration_config'] !== null && $msg['celebration_config'] !== '' ? $msg['celebration_config'] : null;
                    $msgInsertStmt->execute([
                        $newMsgId,
                        $newTileId,
                        $msg['content'] ?? '',
                        $msg['type'] ?? 'info',
                        $msg['start_date'] ?? null,
                        $msg['end_date'] ?? null,
                        isset($msg['is_active']) && $msg['is_active'] ? 1 : 0,
                        isset($msg['priority']) ? (int)$msg['priority'] : 0,
                        $msg['text_color'] ?? null,
                        $msg['font_style'] ?? null,
                        $msg['display_location'] ?? 'both',
                        $msg['animation_type'] ?? 'rollover',
                        isset($msg['delay_before']) ? (float)$msg['delay_before'] : 0,
                        $msg['celebration_effect'] ?? 'fireworks',
                        $cc,
                        $msg['url'] ?? null,
                        $msg['url_label'] ?? null
                    ]);
                }
            }
             
            $clonedTiles[] = [
                'id' => $newTileId,
                'title' => $newTitle
            ];
        }
        
        $db->commit();
        
        invalidateGuestTilesListCache();
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
    $user = requireAdmin(); // Only admins can bulk import
    
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
        $headers = array_map(static function ($h) {
            return trim(lnStripCsvBom((string)$h));
        }, $headers);
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
            'link_icon' => ['link icon', 'link_icon', 'linkicon'],
            'link_browser' => ['link browser', 'link_browser', 'linkbrowser'],
            'link_visibility' => ['link visibility', 'link_visibility', 'linkvisibility'],
            'link_notes' => ['link notes', 'link_notes', 'linknotes'],
            'link_tooltip' => ['link tooltip', 'link_tooltip', 'linktooltip'],
            'tab_title' => ['tab title', 'tab_title', 'tabtitle']
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
                'tile_title' => isset($headerMap['tile_title']) ? lnNormalizeCsvField((string)$row[$headerMap['tile_title']]) : '',
                'tile_description' => isset($headerMap['tile_description']) ? lnNormalizeCsvField((string)$row[$headerMap['tile_description']]) : '',
                'tile_emoji' => isset($headerMap['tile_emoji']) ? (lnNormalizeCsvField((string)$row[$headerMap['tile_emoji']]) ?: '📁') : '📁',
                'tile_theme_color' => isset($headerMap['tile_theme_color']) ? lnNormalizeCsvField((string)$row[$headerMap['tile_theme_color']]) : 'blue',
                'tile_group' => isset($headerMap['tile_group']) ? lnNormalizeCsvField((string)$row[$headerMap['tile_group']]) : 'General',
                'section_title' => isset($headerMap['section_title']) ? lnNormalizeCsvField((string)$row[$headerMap['section_title']]) : 'General',
                'link_label' => isset($headerMap['link_label']) ? lnNormalizeCsvField((string)$row[$headerMap['link_label']]) : '',
                'link_url' => isset($headerMap['link_url']) ? trim((string)$row[$headerMap['link_url']]) : '',
                'link_icon' => isset($headerMap['link_icon']) ? lnNormalizeCsvField((string)$row[$headerMap['link_icon']]) : '',
                'link_browser' => isset($headerMap['link_browser']) ? lnNormalizeCsvField((string)$row[$headerMap['link_browser']]) : '',
                'link_visibility' => isset($headerMap['link_visibility']) ? lnNormalizeCsvField((string)$row[$headerMap['link_visibility']]) : 'public',
                'link_notes' => isset($headerMap['link_notes']) ? lnNormalizeCsvField((string)$row[$headerMap['link_notes']]) : '',
                'link_tooltip' => isset($headerMap['link_tooltip']) ? lnNormalizeCsvField((string)$row[$headerMap['link_tooltip']]) : '',
                'tab_title' => isset($headerMap['tab_title']) ? lnNormalizeCsvField((string)$row[$headerMap['tab_title']]) : 'Default',
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
    $deletedCount = 0;

    // Optional: soft-delete all existing public spaces before importing (replace-all mode)
    $replaceAllRaw = $_POST['replace_all'] ?? '';
    $replaceAll = $replaceAllRaw === '1' || $replaceAllRaw === 'true' || $replaceAllRaw === 'on';
    
    // Get current max position to append new tiles (reset to 0 when replacing all)
    $maxPositionStmt = $db->prepare('SELECT MAX(position) as max_pos FROM tiles WHERE deleted_at IS NULL AND archived_at IS NULL AND (source_tab IS NULL OR source_tab = ? OR source_tab = \'\')');
    $maxPositionStmt->execute(['public']);
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
        $tabKey = $row['tab_title'] ?: 'Default';
        $sectionKey = $row['section_title'] ?: 'General';
        
        if (!isset($tilesMap[$tileKey])) {
            $tilesMap[$tileKey] = [
                'title' => $row['tile_title'],
                'description' => $row['tile_description'],
                'emoji' => $row['tile_emoji'] ?: '📁',
                'themeColor' => $row['tile_theme_color'] ?: 'blue',
                'group' => $row['tile_group'] ?: 'General',
                'tabs' => []
            ];
        }
        
        if (!isset($tilesMap[$tileKey]['tabs'][$tabKey])) {
            $tilesMap[$tileKey]['tabs'][$tabKey] = [
                'sections' => []
            ];
        }

        if (!isset($tilesMap[$tileKey]['tabs'][$tabKey]['sections'][$sectionKey])) {
            $tilesMap[$tileKey]['tabs'][$tabKey]['sections'][$sectionKey] = [];
        }
        
        $tilesMap[$tileKey]['tabs'][$tabKey]['sections'][$sectionKey][] = [
            'label' => $row['link_label'],
            'url' => $row['link_url'],
            'icon' => !empty($row['link_icon']) ? $row['link_icon'] : null,
            'browser' => !empty($row['link_browser']) ? $row['link_browser'] : null,
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
        if ($replaceAll) {
            $softDeleteStmt = $db->prepare(
                'UPDATE tiles SET deleted_at = ?, archived_at = NULL
                 WHERE deleted_at IS NULL AND archived_at IS NULL
                 AND (source_tab IS NULL OR source_tab = ? OR source_tab = \'\')'
            );
            $softDeleteStmt->execute([$currentTime, 'public']);
            $deletedCount = $softDeleteStmt->rowCount();
            $nextPosition = 0;
        }

        foreach ($tilesMap as $tileKey => $tileData) {
            try {
                // Generate unique tile ID
                $tileId = generateUuid();
                
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
                
                // Insert tabs, sections and links
                $tabIndex = 0;
                foreach ($tileData['tabs'] as $tabTitle => $tabData) {
                    $tabId = uniqid('tab_', true);
                    $tabStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position) VALUES (?, ?, ?, ?)');
                    $tabStmt->execute([
                        $tabId,
                        $tileId,
                        $tabTitle,
                        $tabIndex++
                    ]);

                    $sectionIndex = 0;
                    foreach ($tabData['sections'] as $sectionTitle => $links) {
                        $sectionId = uniqid('section_', true);
                        $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, text_color, force_stacked_view, position) VALUES (?, ?, ?, ?, ?, ?, ?)');
                        $sectionStmt->execute([
                            $sectionId,
                            $tileId,
                            $tabId, // Now associated with the tab
                            $sectionTitle,
                            null,
                            0,
                            $sectionIndex++
                        ]);
                        
                        foreach ($links as $link) {
                            $linkId = uniqid('link_', true);
                            $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, text_color, visibility, allowed_users, notes, tooltip, browser, animation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
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
                                $link['tooltip'] ?: null,
                                $link['browser'] ?? null,
                            $link['animation'] ?? null
                            ]);
                        }
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
        
        invalidateGuestTilesListCache();
        sendJSON([
            'success' => true,
            'created' => count($created),
            'deleted' => $deletedCount,
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

/**
 * Serve staging CSV template for download. Admin only.
 * Prefixed with UTF-8 BOM so Excel on Windows opens emoji columns correctly.
 */
function handleGetStagingTemplate() {
    requireAdmin();
    $path = dirname(__DIR__) . '/staging-ai-import-template.csv';
    if (!is_file($path) || !is_readable($path)) {
        sendJSON(['error' => 'Template file not found'], 404);
    }
    $content = file_get_contents($path);
    if ($content === false) {
        sendJSON(['error' => 'Template file not readable'], 500);
    }
    // Ensure UTF-8 BOM (Excel otherwise shows mojibake like ðŸš€ for 🚀)
    if (strncmp($content, "\xEF\xBB\xBF", 3) !== 0) {
        $content = "\xEF\xBB\xBF" . $content;
    }
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="linknest-staging-import-template.csv"');
    header('Content-Length: ' . strlen($content));
    echo $content;
    exit;
}

/**
 * Strip UTF-8 BOM from a CSV header cell (Excel/BOM downloads).
 */
function lnStripCsvBom(string $value): string {
    if (str_starts_with($value, "\xEF\xBB\xBF")) {
        return substr($value, 3);
    }
    // Also handle BOM already decoded oddly as U+FEFF
    if (str_starts_with($value, "\u{FEFF}")) {
        return substr($value, strlen("\u{FEFF}"));
    }
    return $value;
}

/**
 * Repair emoji/text that was UTF-8 bytes misinterpreted as Windows-1252/Latin-1
 * (e.g. Excel saving without UTF-8: 🚀 becomes ðŸš€).
 */
function lnRepairUtf8Mojibake(string $value): string {
    if ($value === '' || !preg_match('/[ðÃâ]/u', $value)) {
        return $value;
    }
    // Reinterpret Latin-1 code units as the original UTF-8 byte sequence
    $asBytes = @mb_convert_encoding($value, 'ISO-8859-1', 'UTF-8');
    if ($asBytes !== false && $asBytes !== '' && mb_check_encoding($asBytes, 'UTF-8')) {
        // Prefer repaired form when it contains a valid emoji / fewer replacement chars
        if (preg_match('/[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]/u', $asBytes)) {
            return $asBytes;
        }
    }
    return $value;
}

/**
 * Normalize a CSV text field (BOM strip + mojibake repair).
 */
function lnNormalizeCsvField(string $value): string {
    return lnRepairUtf8Mojibake(trim(lnStripCsvBom($value)));
}

/**
 * Serve staging AI prompt guide for download. Admin only.
 */
function handleGetStagingPrompt() {
    requireAdmin();
    $path = dirname(__DIR__) . '/staging-ai-prompt-guide.md';
    if (!is_file($path) || !is_readable($path)) {
        sendJSON(['error' => 'Prompt guide file not found'], 404);
    }
    header('Content-Type: text/markdown; charset=utf-8');
    header('Content-Disposition: attachment; filename="linknest-staging-ai-prompt-guide.md"');
    readfile($path);
    exit;
}

/**
 * Convert uploaded CSV to LinkNest SpaceExportFile JSON (import-ready, no DB write).
 * Admin only. Used by Staging offline workflow.
 */
function handleCsvToJson() {
    $user = requireAdmin();

    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        sendJSON(['error' => 'No file uploaded or upload error'], 400);
    }

    $file = $_FILES['file'];
    $filePath = $file['tmp_name'];
    $fileExt = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if ($fileExt !== 'csv') {
        sendJSON(['error' => 'Invalid file type. Please upload a CSV file.'], 400);
    }

    $csvData = [];
    if (($handle = fopen($filePath, 'r')) === false) {
        sendJSON(['error' => 'Failed to read CSV file'], 400);
    }

    $headers = fgetcsv($handle);
    if ($headers === false) {
        fclose($handle);
        sendJSON(['error' => 'Invalid CSV file. Could not read header row.'], 400);
    }
    $headers = array_map(static function ($h) {
        return trim(lnStripCsvBom((string)$h));
    }, $headers);
    $headerMap = [];
    $headerVariations = [
        'tile_title' => ['tile title', 'tile_title', 'tiletitle'],
        'tile_description' => ['tile description', 'tile_description', 'tiledescription'],
        'tile_emoji' => ['tile emoji', 'tile_emoji', 'tileemoji'],
        'tile_theme_color' => ['tile theme color', 'tile_theme_color', 'tilethemecolor', 'tile theme', 'tile_theme'],
        'tile_group' => ['tile group', 'tile_group', 'tilegroup'],
        'section_title' => ['section title', 'section_title', 'sectiontitle'],
        'link_label' => ['link label', 'link_label', 'linklabel'],
        'link_url' => ['link url', 'link_url', 'linkurl'],
        'link_icon' => ['link icon', 'link_icon', 'linkicon'],
        'link_browser' => ['link browser', 'link_browser', 'linkbrowser'],
        'link_visibility' => ['link visibility', 'link_visibility', 'linkvisibility'],
        'link_notes' => ['link notes', 'link_notes', 'linknotes'],
        'link_tooltip' => ['link tooltip', 'link_tooltip', 'linktooltip'],
        'tab_title' => ['tab title', 'tab_title', 'tabtitle']
    ];
    foreach ($headerVariations as $key => $variations) {
        foreach ($headers as $idx => $header) {
            $normalizedHeader = strtolower(preg_replace('/[\s_\-]/', '', $header));
            foreach ($variations as $variation) {
                $normalizedVariation = strtolower(preg_replace('/[\s_\-]/', '', $variation));
                if ($normalizedHeader === $normalizedVariation) {
                    $headerMap[$key] = $idx;
                    break 2;
                }
            }
        }
    }
    if (!isset($headerMap['tile_title']) || !isset($headerMap['link_label']) || !isset($headerMap['link_url'])) {
        fclose($handle);
        sendJSON(['error' => 'CSV file missing required columns: Tile Title, Link Label, Link URL'], 400);
    }
    $rowNum = 1;
    while (($row = fgetcsv($handle)) !== false) {
        $rowNum++;
        if (count($row) < count($headers)) {
            continue;
        }
        $csvData[] = [
            'tile_title' => isset($headerMap['tile_title']) ? lnNormalizeCsvField((string)$row[$headerMap['tile_title']]) : '',
            'tile_description' => isset($headerMap['tile_description']) ? lnNormalizeCsvField((string)$row[$headerMap['tile_description']]) : '',
            'tile_emoji' => isset($headerMap['tile_emoji']) ? (lnNormalizeCsvField((string)$row[$headerMap['tile_emoji']]) ?: '📁') : '📁',
            'tile_theme_color' => isset($headerMap['tile_theme_color']) ? lnNormalizeCsvField((string)$row[$headerMap['tile_theme_color']]) : 'blue',
            'tile_group' => isset($headerMap['tile_group']) ? lnNormalizeCsvField((string)$row[$headerMap['tile_group']]) : 'General',
            'section_title' => isset($headerMap['section_title']) ? lnNormalizeCsvField((string)$row[$headerMap['section_title']]) : 'General',
            'link_label' => isset($headerMap['link_label']) ? lnNormalizeCsvField((string)$row[$headerMap['link_label']]) : '',
            'link_url' => isset($headerMap['link_url']) ? trim((string)$row[$headerMap['link_url']]) : '',
            'link_icon' => isset($headerMap['link_icon']) ? lnNormalizeCsvField((string)$row[$headerMap['link_icon']]) : '',
            'link_browser' => isset($headerMap['link_browser']) ? lnNormalizeCsvField((string)$row[$headerMap['link_browser']]) : '',
            'link_visibility' => isset($headerMap['link_visibility']) ? lnNormalizeCsvField((string)$row[$headerMap['link_visibility']]) : 'public',
            'link_notes' => isset($headerMap['link_notes']) ? lnNormalizeCsvField((string)$row[$headerMap['link_notes']]) : '',
            'link_tooltip' => isset($headerMap['link_tooltip']) ? lnNormalizeCsvField((string)$row[$headerMap['link_tooltip']]) : '',
            'tab_title' => isset($headerMap['tab_title']) ? lnNormalizeCsvField((string)$row[$headerMap['tab_title']]) : 'Default',
            'row_num' => $rowNum
        ];
    }
    fclose($handle);

    if (empty($csvData)) {
        sendJSON(['error' => 'CSV file is empty or contains no valid data'], 400);
    }

    $tilesMap = [];
    foreach ($csvData as $row) {
        if (empty($row['tile_title']) || empty($row['link_label']) || empty($row['link_url'])) {
            continue;
        }
        $tileKey = $row['tile_title'] . '|' . ($row['tile_group'] ?: 'General');
        $tabKey = $row['tab_title'] ?: 'Default';
        $sectionKey = $row['section_title'] ?: 'General';
        if (!isset($tilesMap[$tileKey])) {
            $tilesMap[$tileKey] = [
                'title' => $row['tile_title'],
                'description' => $row['tile_description'],
                'emoji' => $row['tile_emoji'] ?: '📁',
                'themeColor' => $row['tile_theme_color'] ?: 'blue',
                'group' => $row['tile_group'] ?: 'General',
                'tabs' => []
            ];
        }
        if (!isset($tilesMap[$tileKey]['tabs'][$tabKey])) {
            $tilesMap[$tileKey]['tabs'][$tabKey] = ['sections' => []];
        }
        if (!isset($tilesMap[$tileKey]['tabs'][$tabKey]['sections'][$sectionKey])) {
            $tilesMap[$tileKey]['tabs'][$tabKey]['sections'][$sectionKey] = [];
        }
        $tilesMap[$tileKey]['tabs'][$tabKey]['sections'][$sectionKey][] = [
            'label' => $row['link_label'],
            'url' => $row['link_url'],
            'icon' => !empty($row['link_icon']) ? $row['link_icon'] : null,
            'browser' => !empty($row['link_browser']) ? $row['link_browser'] : null,
            'visibility' => $row['link_visibility'] ?: 'public',
            'notes' => $row['link_notes'],
            'tooltip' => $row['link_tooltip']
        ];
    }

    if (empty($tilesMap)) {
        sendJSON(['error' => 'No valid tiles found in CSV file'], 400);
    }

    $categories = [];
    $tiles = [];
    $position = 0;
    foreach ($tilesMap as $tileData) {
        $group = $tileData['group'] ?: 'General';
        if (!in_array($group, $categories, true)) {
            $categories[] = $group;
        }
        $tabs = [];
        $tabPos = 0;
        foreach ($tileData['tabs'] as $tabTitle => $tabData) {
            $sections = [];
            $secPos = 0;
            foreach ($tabData['sections'] as $secTitle => $links) {
                $linkList = [];
                foreach ($links as $link) {
                    $linkList[] = [
                        'id' => 'link_' . uniqid('', true),
                        'label' => $link['label'],
                        'url' => $link['url'],
                        'icon' => $link['icon'],
                        'browser' => $link['browser'],
                        'visibility' => $link['visibility'],
                        'notes' => $link['notes'],
                        'tooltip' => $link['tooltip']
                    ];
                }
                $sections[] = [
                    'id' => 'section_' . uniqid('', true),
                    'title' => $secTitle,
                    'position' => $secPos++,
                    'links' => $linkList
                ];
            }
            $tabs[] = [
                'id' => 'tab_' . uniqid('', true),
                'title' => $tabTitle,
                'position' => $tabPos++,
                'sections' => $sections
            ];
        }
        $tiles[] = [
            'id' => 'tile_' . uniqid('', true),
            'title' => $tileData['title'],
            'description' => $tileData['description'],
            'emoji' => $tileData['emoji'],
            'themeColor' => $tileData['themeColor'],
            'group' => $group,
            'tabs' => $tabs,
            'createdAt' => time() * 1000,
            'visibility' => 'public'
        ];
        $position++;
    }

    $payload = [
        'version' => '1.2',
        'type' => 'all_categories',
        'exportedAt' => time() * 1000,
        'tiles' => $tiles,
        'categories' => $categories
    ];

    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
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
        // Add to favorites - get the maximum position for this user and add 1
        $maxPosStmt = $db->prepare('SELECT COALESCE(MAX(position), -1) as max_position FROM user_link_favorites WHERE user_id = ?');
        $maxPosStmt->execute([$user['id']]);
        $maxPosRow = $maxPosStmt->fetch();
        $nextPosition = ($maxPosRow['max_position'] ?? -1) + 1;
        
        // Add to favorites with position
        $insertStmt = $db->prepare('INSERT INTO user_link_favorites (user_id, link_id, created_at, position) VALUES (?, ?, ?, ?)');
        $insertStmt->execute([$user['id'], $linkId, time(), $nextPosition]);
        sendJSON(['success' => true, 'isFavorite' => true]);
    }
}

function handleArchiveCategory($categoryName) {
    $user = requireAuth();
    $db = getDB();
    
    // Decode URL-encoded category name
    $categoryName = urldecode($categoryName);
    
    // Optional: source_tab to scope archive (staging vs public)
    $sourceTab = null;
    $rawInput = @file_get_contents('php://input');
    if ($rawInput !== false && $rawInput !== '') {
        $body = json_decode($rawInput, true);
        if (is_array($body)) {
            if (isset($body['sourceTab']) && trim((string)$body['sourceTab']) === 'staging') {
                $sourceTab = 'staging';
            } elseif (isset($body['source_tab']) && trim((string)$body['source_tab']) === 'staging') {
                $sourceTab = 'staging';
            }
        }
    }
    
    // Get all tiles in this category that are not already archived or deleted, optionally scoped by source_tab
    if ($sourceTab === 'staging') {
        $stmt = $db->prepare('SELECT id, user_id FROM tiles WHERE "group" = ? AND deleted_at IS NULL AND archived_at IS NULL AND (source_tab = ? OR source_tab = \'staging\')');
        $stmt->execute([$categoryName, 'staging']);
    } else {
        $stmt = $db->prepare('SELECT id, user_id FROM tiles WHERE "group" = ? AND deleted_at IS NULL AND archived_at IS NULL');
        $stmt->execute([$categoryName]);
    }
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
        
        invalidateGuestTilesListCache();
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
        
        invalidateGuestTilesListCache();
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
        // Order by position ASC (with created_at as fallback for backward compatibility)
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
            ORDER BY ulf.position ASC, ulf.created_at ASC
        ');
        $stmt->execute([$user['id']]);
        
        $favoriteLinks = [];
        while ($row = $stmt->fetch()) {
            // Skip if tile is missing (orphaned link)
            if (!$row['tile_id']) {
                continue;
            }

            // Unpublished links (or parent tile) are admin-only
            if (!canUserSeePublishedContent($user, $row)) {
                continue;
            }
            // Also hide if parent tile is unpublished (join may expose tile published via another query;
            // favorite query selects l.* and t fields but not t.published — check separately)
            if (!$user['is_admin']) {
                $tilePubStmt = $db->prepare('SELECT published FROM tiles WHERE id = ?');
                $tilePubStmt->execute([$row['tile_id']]);
                $tilePub = $tilePubStmt->fetchColumn();
                if ($tilePub !== false && !isContentPublished(['published' => $tilePub])) {
                    continue;
                }
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
                'published' => isContentPublished($row),
                'notes' => $row['notes'] ?? null,
                'tooltip' => $row['tooltip'] ?? null,
                'browser' => $row['browser'] ?? null,
                'richTextContent' => $row['rich_text_content'] ?? null,
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
        
        // Load visibility and permissions
        $tileVisibility = $row['visibility'] ?? 'public';
        $tileAllowedUsers = $row['allowed_users'] ? json_decode($row['allowed_users'], true) : [];
        $tileAllowedGroups = isset($row['allowed_groups']) && $row['allowed_groups'] ? json_decode($row['allowed_groups'], true) : [];
        
        // For recycle bin, user owns the tile (since it's filtered by user_id)
        $canView = true;
        $canEdit = false; // Deleted tiles cannot be edited
        
        // Check if this tile is favorited by the current user
        $isFavorite = false;
        if ($user) {
            $favStmt = $db->prepare('SELECT 1 FROM user_tile_favorites WHERE user_id = ? AND tile_id = ?');
            $favStmt->execute([$user['id'], $row['id']]);
            $isFavorite = $favStmt->fetch() !== false;
        }
        
        // Load tile decoration fields for recycle bin
        $tileGradientColors = null;
        if (isset($row['tile_gradient_colors']) && $row['tile_gradient_colors']) {
            $decoded = json_decode($row['tile_gradient_colors'], true);
            $tileGradientColors = is_array($decoded) ? $decoded : null;
        }
        $tileGradientColorPositions = null;
        if (isset($row['tile_gradient_color_positions']) && $row['tile_gradient_color_positions']) {
            $decoded = json_decode($row['tile_gradient_color_positions'], true);
            $tileGradientColorPositions = is_array($decoded) ? $decoded : null;
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
            'allowedGroups' => $tileAllowedGroups,
            'isFavorite' => $isFavorite,
            'isHyperlink' => isset($row['is_hyperlink']) ? (bool)$row['is_hyperlink'] : false,
            'hyperlinkUrl' => $row['hyperlink_url'] ?? null,
            'openInNewTab' => isset($row['open_in_new_tab']) ? (bool)$row['open_in_new_tab'] : null,
            'canView' => $canView,
            'canEdit' => false, // Deleted tiles cannot be edited
            'canDelete' => true, // Can permanently delete from recycle bin
            'visibleFrom' => $row['visible_from'] ?? null,
            'expiresAt' => $row['expires_at'] ?? null,
            'tileBackgroundColor' => !empty($row['tile_background_color']) ? $row['tile_background_color'] : null,
            'tileGradientEnabled' => isset($row['tile_gradient_enabled']) && $row['tile_gradient_enabled'] !== null ? (bool)$row['tile_gradient_enabled'] : null,
            'tileGradientColors' => $tileGradientColors,
            'tileGradientColorPositions' => $tileGradientColorPositions,
            'tileGradientDirection' => isset($row['tile_gradient_direction']) && $row['tile_gradient_direction'] !== null && $row['tile_gradient_direction'] !== '' ? (is_numeric($row['tile_gradient_direction']) ? (int)$row['tile_gradient_direction'] : $row['tile_gradient_direction']) : null,
            'tileGradientType' => !empty($row['tile_gradient_type']) ? $row['tile_gradient_type'] : null,
            'tileBorderRadius' => isset($row['tile_border_radius']) && $row['tile_border_radius'] !== null ? (int)$row['tile_border_radius'] : null,
            'tileTextColor' => !empty($row['tile_text_color']) ? $row['tile_text_color'] : null,
            'pageAnimation' => isset($row['page_animation']) ? $row['page_animation'] : null,
            'linksAnimation' => isset($row['links_animation']) ? $row['links_animation'] : null,
            'headerImage' => !empty($row['header_image']) ? $row['header_image'] : null,
            'headerImageAlign' => (isset($row['header_image_align']) && in_array($row['header_image_align'], ['left','center','right'], true)) ? $row['header_image_align'] : null,
            'headerImageOpacity' => isset($row['header_image_opacity']) && $row['header_image_opacity'] !== null && $row['header_image_opacity'] !== '' ? max(0, min(100, (int)$row['header_image_opacity'])) : null,
            'headerImageOffsetX' => isset($row['header_image_offset_x']) && $row['header_image_offset_x'] !== null && $row['header_image_offset_x'] !== '' ? max(-300, min(300, (int)$row['header_image_offset_x'])) : null,
            'headerImageOffsetY' => isset($row['header_image_offset_y']) && $row['header_image_offset_y'] !== null && $row['header_image_offset_y'] !== '' ? max(-300, min(300, (int)$row['header_image_offset_y'])) : null,
            'headerImageFit' => (isset($row['header_image_fit']) && in_array($row['header_image_fit'], ['contain','cover'], true)) ? $row['header_image_fit'] : null,
            'showEmoji' => !(isset($row['show_emoji']) && ((int)$row['show_emoji'] === 0 || $row['show_emoji'] === '0' || $row['show_emoji'] === false)),
            'emojiImage' => !empty($row['emoji_image']) ? $row['emoji_image'] : null,
            'showTitle' => !(isset($row['show_title']) && ((int)$row['show_title'] === 0 || $row['show_title'] === '0' || $row['show_title'] === false)),
            'showDescription' => !(isset($row['show_description']) && ((int)$row['show_description'] === 0 || $row['show_description'] === '0' || $row['show_description'] === false)),
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
                'visibility' => $tabRow['visibility'] ?? 'public',
                'allowedUsers' => (isset($tabRow['allowed_users']) && $tabRow['allowed_users'] ? json_decode($tabRow['allowed_users'], true) : null) ?? [],
                'allowedGroups' => (isset($tabRow['allowed_groups']) && $tabRow['allowed_groups'] ? json_decode($tabRow['allowed_groups'], true) : null) ?? [],
                'sections' => []
            ];
            
            // Get sections for this tab
            $sectionStmt = $db->prepare('SELECT * FROM sections WHERE tab_id = ? ORDER BY id');
            $sectionStmt->execute([$tabRow['id']]);
            
            while ($sectionRow = $sectionStmt->fetch()) {
                $section = [
                    'id' => $sectionRow['id'],
                    'title' => $sectionRow['title'],
                    'textColor' => (!empty($sectionRow['text_color']) && trim($sectionRow['text_color']) !== '') ? trim($sectionRow['text_color']) : null,
                    'visibleFrom' => $sectionRow['visible_from'] ?? null,
                    'expiresAt' => $sectionRow['expires_at'] ?? null,
                    'forceStackedView' => isset($sectionRow['force_stacked_view']) && $sectionRow['force_stacked_view'] == 1 ? true : false,
                    'position' => isset($sectionRow['position']) ? (int)$sectionRow['position'] : 0,
                    'visibility' => $sectionRow['visibility'] ?? 'public',
                    'allowedUsers' => (isset($sectionRow['allowed_users']) && $sectionRow['allowed_users'] ? json_decode($sectionRow['allowed_users'], true) : null) ?? [],
                    'allowedGroups' => (isset($sectionRow['allowed_groups']) && $sectionRow['allowed_groups'] ? json_decode($sectionRow['allowed_groups'], true) : null) ?? [],
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
                        'allowedGroups' => isset($linkRow['allowed_groups']) && $linkRow['allowed_groups'] ? json_decode($linkRow['allowed_groups'], true) : [],
                        'notes' => $linkRow['notes'] ?? null,
                        'tooltip' => $linkRow['tooltip'] ?? null,
                        'richTextContent' => $linkRow['rich_text_content'] ?? null,
                        'visibleFrom' => $linkRow['visible_from'] ?? null,
                        'expiresAt' => $linkRow['expires_at'] ?? null,
                        'browser' => $linkRow['browser'] ?? null,
                        'animation' => $linkRow['animation'] ?? null,
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
                    $section['richTextContent'][] = mapRichTextRow($richTextRow);
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
    
    invalidateGuestTilesListCache();
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
        $hasArchivedAt = false;
        try {
            $columns = $db->query("PRAGMA table_info(tiles)")->fetchAll(PDO::FETCH_ASSOC);
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
            $hasArchivedAt = false;
        }
        
        if (!$hasArchivedAt) {
            sendJSON([]);
            return;
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
            
            // Load tile decoration fields for archive
            $tileGradientColors = null;
            if (isset($row['tile_gradient_colors']) && $row['tile_gradient_colors']) {
                $decoded = json_decode($row['tile_gradient_colors'], true);
                $tileGradientColors = is_array($decoded) ? $decoded : null;
            }
            $tileGradientColorPositions = null;
            if (isset($row['tile_gradient_color_positions']) && $row['tile_gradient_color_positions']) {
                $decoded = json_decode($row['tile_gradient_color_positions'], true);
                $tileGradientColorPositions = is_array($decoded) ? $decoded : null;
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
                'allowedGroups' => $tileAllowedGroups,
                'isFavorite' => $isFavorite,
                'isHyperlink' => isset($row['is_hyperlink']) ? (bool)$row['is_hyperlink'] : false,
                'hyperlinkUrl' => $row['hyperlink_url'] ?? null,
                'openInNewTab' => isset($row['open_in_new_tab']) ? (bool)$row['open_in_new_tab'] : null,
                'canView' => $canView,
                'canEdit' => false, // Archived tiles cannot be edited
                'canDelete' => $canDelete, // Allow delete from archive (moves to recycle bin)
                'visibleFrom' => $row['visible_from'] ?? null,
                'expiresAt' => $row['expires_at'] ?? null,
                'tileBackgroundColor' => !empty($row['tile_background_color']) ? $row['tile_background_color'] : null,
                'tileGradientEnabled' => isset($row['tile_gradient_enabled']) && $row['tile_gradient_enabled'] !== null ? (bool)$row['tile_gradient_enabled'] : null,
                'tileGradientColors' => $tileGradientColors,
                'tileGradientColorPositions' => $tileGradientColorPositions,
                'tileGradientDirection' => isset($row['tile_gradient_direction']) && $row['tile_gradient_direction'] !== null && $row['tile_gradient_direction'] !== '' ? (is_numeric($row['tile_gradient_direction']) ? (int)$row['tile_gradient_direction'] : $row['tile_gradient_direction']) : null,
                'tileGradientType' => !empty($row['tile_gradient_type']) ? $row['tile_gradient_type'] : null,
                'tileBorderRadius' => isset($row['tile_border_radius']) && $row['tile_border_radius'] !== null ? (int)$row['tile_border_radius'] : null,
                'tileTextColor' => !empty($row['tile_text_color']) ? $row['tile_text_color'] : null,
                'pageAnimation' => isset($row['page_animation']) ? $row['page_animation'] : null,
                'linksAnimation' => isset($row['links_animation']) ? $row['links_animation'] : null,
                'headerImage' => !empty($row['header_image']) ? $row['header_image'] : null,
                'headerImageAlign' => (isset($row['header_image_align']) && in_array($row['header_image_align'], ['left','center','right'], true)) ? $row['header_image_align'] : null,
                'headerImageOpacity' => isset($row['header_image_opacity']) && $row['header_image_opacity'] !== null && $row['header_image_opacity'] !== '' ? max(0, min(100, (int)$row['header_image_opacity'])) : null,
                'headerImageOffsetX' => isset($row['header_image_offset_x']) && $row['header_image_offset_x'] !== null && $row['header_image_offset_x'] !== '' ? max(-300, min(300, (int)$row['header_image_offset_x'])) : null,
                'headerImageOffsetY' => isset($row['header_image_offset_y']) && $row['header_image_offset_y'] !== null && $row['header_image_offset_y'] !== '' ? max(-300, min(300, (int)$row['header_image_offset_y'])) : null,
                'headerImageFit' => (isset($row['header_image_fit']) && in_array($row['header_image_fit'], ['contain','cover'], true)) ? $row['header_image_fit'] : null,
                'showEmoji' => !(isset($row['show_emoji']) && ((int)$row['show_emoji'] === 0 || $row['show_emoji'] === '0' || $row['show_emoji'] === false)),
                'emojiImage' => !empty($row['emoji_image']) ? $row['emoji_image'] : null,
            'showTitle' => !(isset($row['show_title']) && ((int)$row['show_title'] === 0 || $row['show_title'] === '0' || $row['show_title'] === false)),
            'showDescription' => !(isset($row['show_description']) && ((int)$row['show_description'] === 0 || $row['show_description'] === '0' || $row['show_description'] === false)),
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
                    'visibleFrom' => $tabRow['visible_from'] ?? null,
                    'expiresAt' => $tabRow['expires_at'] ?? null,
                    'visibility' => $tabRow['visibility'] ?? 'public',
                    'allowedUsers' => (isset($tabRow['allowed_users']) && $tabRow['allowed_users'] ? json_decode($tabRow['allowed_users'], true) : null) ?? [],
                    'allowedGroups' => (isset($tabRow['allowed_groups']) && $tabRow['allowed_groups'] ? json_decode($tabRow['allowed_groups'], true) : null) ?? [],
                    'sections' => []
                ];
                
                // Get sections for this tab, ordered by position
                $sectionStmt = $db->prepare('SELECT * FROM sections WHERE tab_id = ? ORDER BY position ASC, id ASC');
                $sectionStmt->execute([$tabRow['id']]);
                
                while ($sectionRow = $sectionStmt->fetch()) {
                    $section = [
                        'id' => $sectionRow['id'],
                        'title' => $sectionRow['title'],
                        'textColor' => (!empty($sectionRow['text_color']) && trim($sectionRow['text_color']) !== '') ? trim($sectionRow['text_color']) : null,
                        'visibleFrom' => $sectionRow['visible_from'] ?? null,
                        'expiresAt' => $sectionRow['expires_at'] ?? null,
                        'forceStackedView' => isset($sectionRow['force_stacked_view']) && $sectionRow['force_stacked_view'] == 1 ? true : false,
                        'position' => isset($sectionRow['position']) ? (int)$sectionRow['position'] : 0,
                        'visibility' => $sectionRow['visibility'] ?? 'public',
                        'allowedUsers' => (isset($sectionRow['allowed_users']) && $sectionRow['allowed_users'] ? json_decode($sectionRow['allowed_users'], true) : null) ?? [],
                        'allowedGroups' => (isset($sectionRow['allowed_groups']) && $sectionRow['allowed_groups'] ? json_decode($sectionRow['allowed_groups'], true) : null) ?? [],
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
                            'browser' => $linkRow['browser'] ?? null,
                            'animation' => $linkRow['animation'] ?? null,
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
                    $section['richTextContent'][] = mapRichTextRow($richTextRow);
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
        
        invalidateGuestTilesListCache();
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
    
    invalidateGuestTilesListCache();
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
    
    invalidateGuestTilesListCache();
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

/**
 * VERSION CONTROL FUNCTIONS
 */

function handleGetTileVersions($tileId) {
    $user = requireAuth();
    $db = getDB();
    
    // Check view permission for the tile
    if (!canUserViewTile($user['id'], $tileId, $db)) {
        sendJSON(['error' => 'Permission denied'], 403);
    }

    $stmt = $db->prepare('SELECT id, version_number, created_at, user_id, changelog_summary, is_locked, tags, comments FROM tile_versions WHERE tile_id = ? AND is_temp = 0 ORDER BY version_number DESC');
    $stmt->execute([$tileId]);
    $versions = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Get usernames and parse tags/comments
    foreach ($versions as &$v) {
        if ($v['user_id']) {
            $uStmt = $db->prepare('SELECT username FROM users WHERE id = ?');
            $uStmt->execute([$v['user_id']]);
            $u = $uStmt->fetchColumn();
            $v['username'] = $u ?: 'Unknown';
        } else {
            $v['username'] = 'System';
        }
        $v['is_locked'] = (bool)$v['is_locked'];
        // Parse tags (stored as JSON array)
        $v['tags'] = $v['tags'] ? json_decode($v['tags'], true) : null;
        // Comments are plain text
        $v['comments'] = $v['comments'] ?: null;
    }

    sendJSON(['versions' => $versions]);
}

function handleToggleVersionLock($tileId, $versionId) {
    $user = requireAuth();
    $db = getDB();
    
    // Check edit permission
    if (!canUserEditTile($user['id'], $tileId, $db)) {
        sendJSON(['error' => 'Permission denied'], 403);
    }
    
    $data = getJSONInput();
    $isLocked = isset($data['isLocked']) && $data['isLocked'] ? 1 : 0;

    $stmt = $db->prepare('UPDATE tile_versions SET is_locked = ? WHERE id = ? AND tile_id = ?');
    $stmt->execute([$isLocked, $versionId, $tileId]);
    
    sendJSON(['success' => true]);
}

function handleDeleteVersion($tileId, $versionId) {
    $user = requireAuth();
    $db = getDB();

    if (!canUserEditTile($user['id'], $tileId, $db)) {
        sendJSON(['error' => 'Permission denied'], 403);
    }

    // Check if locked
    $stmt = $db->prepare('SELECT is_locked FROM tile_versions WHERE id = ? AND tile_id = ?');
    $stmt->execute([$versionId, $tileId]);
    $v = $stmt->fetch();
    if ($v && $v['is_locked']) {
        sendJSON(['error' => 'Cannot delete locked version'], 400);
    }

    $stmt = $db->prepare('DELETE FROM tile_versions WHERE id = ? AND tile_id = ?');
    $stmt->execute([$versionId, $tileId]);
    
    sendJSON(['success' => true]);
}

function handleRestoreVersion($tileId, $versionId) {
    $user = requireAuth();
    $db = getDB();

    if (!canUserEditTile($user['id'], $tileId, $db)) {
        sendJSON(['error' => 'Permission denied'], 403);
    }

    $stmt = $db->prepare('SELECT tile_data FROM tile_versions WHERE id = ? AND tile_id = ?');
    $stmt->execute([$versionId, $tileId]);
    $row = $stmt->fetch();
    
    if (!$row) sendJSON(['error' => 'Version not found'], 404);

    $data = json_decode($row['tile_data'], true);
    if (!$data) sendJSON(['error' => 'Corrupt version data'], 500);
    
    try {
        updateTileInternal($tileId, $data, $db, $user, true);
        sendJSON(['success' => true]);
    } catch (Exception $e) {
        sendJSON(['error' => $e->getMessage()], 500);
    }
}

function getTileForVersion($tileId, $db) {
    $stmt = $db->prepare('SELECT * FROM tiles WHERE id = ?');
    $stmt->execute([$tileId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$row) return null;
    
    // Construct tile object (similar to handleGetTile logic)
    $tileGradientColors = null;
    if (isset($row['tile_gradient_colors']) && $row['tile_gradient_colors']) {
        $decoded = json_decode($row['tile_gradient_colors'], true);
        $tileGradientColors = is_array($decoded) ? $decoded : null;
    }
    $tileGradientColorPositions = null;
    if (isset($row['tile_gradient_color_positions']) && $row['tile_gradient_color_positions']) {
        $decoded = json_decode($row['tile_gradient_color_positions'], true);
        $tileGradientColorPositions = is_array($decoded) ? $decoded : null;
    }

    $tile = [
        'id' => $row['id'],
        'title' => $row['title'],
        'description' => $row['description'],
        'htmlContent' => $row['html_content'],
        'emoji' => $row['emoji'],
        'themeColor' => $row['theme_color'],
        'group' => $row['group'],
        'visibility' => $row['visibility'] ?? 'public',
        'published' => isContentPublished($row),
        'allowedUsers' => $row['allowed_users'] ? json_decode($row['allowed_users'], true) : [],
        'isHyperlink' => isset($row['is_hyperlink']) ? (bool)$row['is_hyperlink'] : false,
        'hyperlinkUrl' => $row['hyperlink_url'] ?? null,
        'openInNewTab' => isset($row['open_in_new_tab']) ? (bool)$row['open_in_new_tab'] : false,
        'browser' => isset($row['browser']) ? $row['browser'] : null,
        'visibleFrom' => $row['visible_from'] ?? null,
        'expiresAt' => $row['expires_at'] ?? null,
        'tileBackgroundColor' => !empty($row['tile_background_color']) ? $row['tile_background_color'] : null,
        'tileGradientEnabled' => isset($row['tile_gradient_enabled']) && $row['tile_gradient_enabled'] !== null ? (bool)$row['tile_gradient_enabled'] : false,
        'tileGradientColors' => $tileGradientColors,
        'tileGradientColorPositions' => $tileGradientColorPositions,
        'tileGradientDirection' => isset($row['tile_gradient_direction']) && $row['tile_gradient_direction'] !== null && $row['tile_gradient_direction'] !== '' ? (is_numeric($row['tile_gradient_direction']) ? (int)$row['tile_gradient_direction'] : $row['tile_gradient_direction']) : null,
        'tileGradientType' => !empty($row['tile_gradient_type']) ? $row['tile_gradient_type'] : null,
        'tileBorderRadius' => isset($row['tile_border_radius']) && $row['tile_border_radius'] !== null ? (int)$row['tile_border_radius'] : null,
        'tileTextColor' => !empty($row['tile_text_color']) ? $row['tile_text_color'] : null,
        'pageAnimation' => isset($row['page_animation']) ? $row['page_animation'] : null,
        'linksAnimation' => isset($row['links_animation']) ? $row['links_animation'] : null,
        'headerImage' => !empty($row['header_image']) ? $row['header_image'] : null,
        'headerImageAlign' => (isset($row['header_image_align']) && in_array($row['header_image_align'], ['left','center','right'], true)) ? $row['header_image_align'] : null,
        'headerImageOpacity' => isset($row['header_image_opacity']) && $row['header_image_opacity'] !== null && $row['header_image_opacity'] !== '' ? max(0, min(100, (int)$row['header_image_opacity'])) : null,
        'headerImageOffsetX' => isset($row['header_image_offset_x']) && $row['header_image_offset_x'] !== null && $row['header_image_offset_x'] !== '' ? max(-300, min(300, (int)$row['header_image_offset_x'])) : null,
        'headerImageOffsetY' => isset($row['header_image_offset_y']) && $row['header_image_offset_y'] !== null && $row['header_image_offset_y'] !== '' ? max(-300, min(300, (int)$row['header_image_offset_y'])) : null,
        'headerImageFit' => (isset($row['header_image_fit']) && in_array($row['header_image_fit'], ['contain','cover'], true)) ? $row['header_image_fit'] : null,
        'showEmoji' => !(isset($row['show_emoji']) && ((int)$row['show_emoji'] === 0 || $row['show_emoji'] === '0' || $row['show_emoji'] === false)),
        'emojiImage' => !empty($row['emoji_image']) ? $row['emoji_image'] : null,
            'showTitle' => !(isset($row['show_title']) && ((int)$row['show_title'] === 0 || $row['show_title'] === '0' || $row['show_title'] === false)),
            'showDescription' => !(isset($row['show_description']) && ((int)$row['show_description'] === 0 || $row['show_description'] === '0' || $row['show_description'] === false)),
        'tabs' => [],
        'messages' => []
    ];

    // Messages
    $msgStmt = $db->prepare('SELECT * FROM tile_messages WHERE tile_id = ?');
    $msgStmt->execute([$tileId]);
    while ($msgRow = $msgStmt->fetch(PDO::FETCH_ASSOC)) {
        $cc = null;
        if (!empty($msgRow['celebration_config'])) {
            $dec = json_decode($msgRow['celebration_config'], true);
            if (is_array($dec)) {
                $cc = $dec;
            }
        }
        $tile['messages'][] = [
            'id' => $msgRow['id'],
            'content' => $msgRow['content'],
            'type' => $msgRow['type'],
            'startDate' => $msgRow['start_date'] ?? null,
            'endDate' => $msgRow['end_date'] ?? null,
            'isActive' => (bool)$msgRow['is_active'],
            'priority' => isset($msgRow['priority']) ? (int)$msgRow['priority'] : null,
            'textColor' => $msgRow['text_color'] ?? null,
            'fontStyle' => $msgRow['font_style'] ?? null,
            'displayLocation' => $msgRow['display_location'] ?? 'both',
            'animationType' => $msgRow['animation_type'] ?? 'rollover',
            'delayBefore' => isset($msgRow['delay_before']) ? (float)$msgRow['delay_before'] : 0,
            'celebrationEffect' => $msgRow['celebration_effect'] ?? 'fireworks',
            'celebrationConfig' => $cc,
            'url' => $msgRow['url'] ?? null,
            'urlLabel' => $msgRow['url_label'] ?? null
        ];
    }

    // Tabs & Sections
    $tabStmt = $db->prepare('SELECT * FROM tabs WHERE tile_id = ? ORDER BY position ASC');
    $tabStmt->execute([$tileId]);
    $tabs = $tabStmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Reuse the sections variable across tabs loop but careful about scope
    foreach ($tabs as &$tabRow) {
        $tab = [
            'id' => $tabRow['id'],
            'title' => $tabRow['title'],
            'position' => (int)($tabRow['position'] ?? 0),
            'textColor' => (!empty($tabRow['text_color']) && trim($tabRow['text_color']) !== '') ? trim($tabRow['text_color']) : null,
            'visibleFrom' => $tabRow['visible_from'] ?? null,
            'expiresAt' => $tabRow['expires_at'] ?? null,
            'visibility' => $tabRow['visibility'] ?? 'public',
            'published' => isContentPublished($tabRow),
            'allowedUsers' => (isset($tabRow['allowed_users']) && $tabRow['allowed_users'] ? json_decode($tabRow['allowed_users'], true) : null) ?? [],
            'allowedGroups' => (isset($tabRow['allowed_groups']) && $tabRow['allowed_groups'] ? json_decode($tabRow['allowed_groups'], true) : null) ?? [],
            'sections' => []
        ];

        // Sections
        $sectionStmt = $db->prepare('SELECT * FROM sections WHERE tab_id = ? ORDER BY position ASC, id ASC');
        $sectionStmt->execute([$tabRow['id']]);
        $sections = $sectionStmt->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($sections as $sectionRow) {
            $section = [
                'id' => $sectionRow['id'],
                'title' => $sectionRow['title'],
                    'textColor' => (!empty($sectionRow['text_color']) && trim($sectionRow['text_color']) !== '') ? trim($sectionRow['text_color']) : null,
                'visibleFrom' => $sectionRow['visible_from'] ?? null,
                'expiresAt' => $sectionRow['expires_at'] ?? null,
                'forceStackedView' => isset($sectionRow['force_stacked_view']) && $sectionRow['force_stacked_view'] == 1 ? true : false,
                'position' => isset($sectionRow['position']) ? (int)$sectionRow['position'] : 0,
                'visibility' => $sectionRow['visibility'] ?? 'public',
                'published' => isContentPublished($sectionRow),
                'allowedUsers' => (isset($sectionRow['allowed_users']) && $sectionRow['allowed_users'] ? json_decode($sectionRow['allowed_users'], true) : null) ?? [],
                'allowedGroups' => (isset($sectionRow['allowed_groups']) && $sectionRow['allowed_groups'] ? json_decode($sectionRow['allowed_groups'], true) : null) ?? [],
                'links' => [],
                'richTextContent' => []
            ];
            
            // Links
            $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ? ORDER BY position ASC, id ASC');
            $linkStmt->execute([$sectionRow['id']]);
            while ($linkRow = $linkStmt->fetch(PDO::FETCH_ASSOC)) {
                 $link = [
                    'id' => $linkRow['id'],
                    'label' => $linkRow['label'],
                    'url' => $linkRow['url'],
                    'icon' => isset($linkRow['icon']) ? $linkRow['icon'] : null,
                    'textColor' => isset($linkRow['text_color']) ? $linkRow['text_color'] : null,
                    'visibility' => $linkRow['visibility'] ?? 'public',
                    'published' => isContentPublished($linkRow),
                    'allowedUsers' => $linkRow['allowed_users'] ? json_decode($linkRow['allowed_users'], true) : [],
                    'allowedGroups' => isset($linkRow['allowed_groups']) && $linkRow['allowed_groups'] ? json_decode($linkRow['allowed_groups'], true) : [],
                    'notes' => isset($linkRow['notes']) ? $linkRow['notes'] : null,
                    'tooltip' => isset($linkRow['tooltip']) ? $linkRow['tooltip'] : null,
                    'visibleFrom' => isset($linkRow['visible_from']) ? $linkRow['visible_from'] : null,
                    'expiresAt' => isset($linkRow['expires_at']) ? $linkRow['expires_at'] : null,
                    'browser' => isset($linkRow['browser']) ? $linkRow['browser'] : null,
                    'animation' => isset($linkRow['animation']) ? $linkRow['animation'] : null,
                    'position' => (int)($linkRow['position'] ?? 0),
                    'richTextContent' => isset($linkRow['rich_text_content']) ? $linkRow['rich_text_content'] : null,
                    'isFavorite' => false // Not needed for versioning usually, but good for completeness
                ];
                $section['links'][] = $link;
            }

            // Rich Text Content
            $rtStmt = $db->prepare('SELECT * FROM rich_text_content WHERE section_id = ? ORDER BY position ASC');
            $rtStmt->execute([$sectionRow['id']]);
            while ($rtRow = $rtStmt->fetch(PDO::FETCH_ASSOC)) {
                $section['richTextContent'][] = mapRichTextRow($rtRow);
            }

            $tab['sections'][] = $section;
        }
        $tile['tabs'][] = $tab;
    }
    
    // Check for legacy sections if no tabs
    if (empty($tile['tabs'])) {
        $legacySectionStmt = $db->prepare('SELECT * FROM sections WHERE tile_id = ? AND (tab_id IS NULL OR tab_id = "") ORDER BY position ASC');
        $legacySectionStmt->execute([$tileId]);
        $legacySections = $legacySectionStmt->fetchAll(PDO::FETCH_ASSOC);
        
        if (!empty($legacySections)) {
            // Treat as single tab for consistency or just return empty tabs, but we want to capture data
            // Since we save 'tabs' in update logic, we might need to wrap it in a mock tab if we want to restore strictly? 
            // Or just save sections in a 'sections' top level key.
            // handleUpdateTile supports 'sections' key.
            $sections = [];
            foreach ($legacySections as $sectionRow) {
                 // ... same loop as above ...
                 // For now, let's assume migrated status.
            }
        }
    }
    
    return $tile;
}

/**
 * Merge unpublished tabs/sections/links from the existing tile into an update payload.
 * Non-admins never receive unpublished items in GET responses; without this merge,
 * a non-admin save (delete+reinsert) would permanently destroy unpublished content.
 */
function mergeUnpublishedContentForSave($incomingTabs, $existingTabs) {
    if (!is_array($existingTabs)) {
        return is_array($incomingTabs) ? $incomingTabs : [];
    }
    $incomingTabs = is_array($incomingTabs) ? $incomingTabs : [];
    $incomingById = [];
    foreach ($incomingTabs as $tab) {
        if (isset($tab['id'])) {
            $incomingById[$tab['id']] = $tab;
        }
    }

    $result = $incomingTabs;
    foreach ($existingTabs as $existingTab) {
        $tabPublished = !isset($existingTab['published']) || isContentPublished($existingTab);
        $tabId = $existingTab['id'] ?? null;

        if (!$tabPublished) {
            // Whole tab unpublished — keep as-is if not already in payload
            if ($tabId && !isset($incomingById[$tabId])) {
                $result[] = $existingTab;
            }
            continue;
        }

        if (!$tabId || !isset($incomingById[$tabId])) {
            continue;
        }

        // Merge unpublished sections / links into the matching incoming tab
        $incomingTabIndex = null;
        foreach ($result as $i => $t) {
            if (($t['id'] ?? null) === $tabId) {
                $incomingTabIndex = $i;
                break;
            }
        }
        if ($incomingTabIndex === null) {
            continue;
        }

        $incomingSections = $result[$incomingTabIndex]['sections'] ?? [];
        $incomingSectionById = [];
        foreach ($incomingSections as $sec) {
            if (isset($sec['id'])) {
                $incomingSectionById[$sec['id']] = true;
            }
        }

        foreach ($existingTab['sections'] ?? [] as $existingSection) {
            $secPublished = !isset($existingSection['published']) || isContentPublished($existingSection);
            $secId = $existingSection['id'] ?? null;

            if (!$secPublished) {
                if ($secId && !isset($incomingSectionById[$secId])) {
                    $incomingSections[] = $existingSection;
                }
                continue;
            }

            if (!$secId || !isset($incomingSectionById[$secId])) {
                continue;
            }

            // Find section in incoming and merge unpublished links
            foreach ($incomingSections as $si => $incSec) {
                if (($incSec['id'] ?? null) !== $secId) {
                    continue;
                }
                $incomingLinks = $incSec['links'] ?? [];
                $incomingLinkById = [];
                foreach ($incomingLinks as $lnk) {
                    if (isset($lnk['id'])) {
                        $incomingLinkById[$lnk['id']] = true;
                    }
                }
                foreach ($existingSection['links'] ?? [] as $existingLink) {
                    $linkPublished = !isset($existingLink['published']) || isContentPublished($existingLink);
                    $linkId = $existingLink['id'] ?? null;
                    if (!$linkPublished && $linkId && !isset($incomingLinkById[$linkId])) {
                        $incomingLinks[] = $existingLink;
                    }
                }
                $incomingSections[$si]['links'] = $incomingLinks;
                break;
            }
        }

        $result[$incomingTabIndex]['sections'] = $incomingSections;
    }

    return $result;
}

function saveVersion($tileId, $db, $userId, $summary = null, $isTemp = false) {
    try {
        $tileData = getTileForVersion($tileId, $db);
        if (!$tileData) return null;

        $jsonData = json_encode($tileData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        
        // Check for duplicate: Compare with the most recent version (excluding temp versions)
        // SKIP duplicate check for temp versions - they should always be created as "before" snapshots
        if (!$isTemp) {
            $stmt = $db->prepare('SELECT tile_data FROM tile_versions WHERE tile_id = ? AND is_temp = 0 ORDER BY version_number DESC LIMIT 1');
            $stmt->execute([$tileId]);
            $latestVersion = $stmt->fetch();
            
            if ($latestVersion) {
                $latestData = json_decode($latestVersion['tile_data'], true);
                
                // Compare the data - if identical, don't create duplicate
                if (areTilesEqual($tileData, $latestData)) {
                    error_log("Prevented duplicate version creation for tile: $tileId");
                    return null; // Don't create duplicate
                }
            }
        }
        
        // Find next version number
        $stmt = $db->prepare('SELECT MAX(version_number) FROM tile_versions WHERE tile_id = ? AND is_temp = 0');
        $stmt->execute([$tileId]);
        $maxVer = $stmt->fetchColumn();
        $nextVer = ($maxVer !== false) ? $maxVer + 1 : 1;

        $stmt = $db->prepare('INSERT INTO tile_versions (tile_id, version_number, created_at, user_id, tile_data, changelog_summary, is_temp) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$tileId, $nextVer, time(), $userId, $jsonData, $summary, $isTemp ? 1 : 0]);
        
        $versionId = $db->lastInsertId();

        // Cleanup: Keep max 10 UNLOCKED, NON-TEMP versions
        if (!$isTemp) {
            $stmt = $db->prepare('SELECT id FROM tile_versions WHERE tile_id = ? AND is_locked = 0 AND is_temp = 0 ORDER BY created_at DESC LIMIT -1 OFFSET 10');
            $stmt->execute([$tileId]);
            $idsToDelete = $stmt->fetchAll(PDO::FETCH_COLUMN);

            if (!empty($idsToDelete)) {
                $placeholders = implode(',', array_fill(0, count($idsToDelete), '?'));
                $delStmt = $db->prepare("DELETE FROM tile_versions WHERE id IN ($placeholders)");
                $delStmt->execute($idsToDelete);
            }
        }
        
        return $versionId;
    } catch (Exception $e) {
        error_log('Failed to save version: ' . $e->getMessage());
        return null;
    }
}

function updateTileInternal($tileId, $data, $db, $user, $isRestore = false, $isFinal = true) {
    // Verify tile exists
    $checkStmt = $db->prepare('SELECT id FROM tiles WHERE id = ?');
    $checkStmt->execute([$tileId]);
    $tile = $checkStmt->fetch();
    
    if (!$tile) {
        throw new Exception('Tile not found');
    }
    
    // Check basic edit permission
    if (!canUserEditTile($user['id'], $tileId, $db)) {
        throw new Exception('You do not have permission to edit this tile');
    }
    
    // Get granular permissions for tile admin
    $granularPerms = getTileAdminPermissions($user['id'], $tileId, $db);
    
    // Fetch current state for comparison
    $currentTileData = getTileForVersion($tileId, $db);
    
    // Check for changes
    $hasChanges = true;
    if ($currentTileData) {
        $hasChanges = !areTilesEqual($currentTileData, $data);
    }

    if (!$hasChanges) {
        // No changes detected - delete any temp version for this tile
        $stmt = $db->prepare('DELETE FROM tile_versions WHERE tile_id = ? AND is_temp = 1');
        $stmt->execute([$tileId]);
        return;
    }

    // Handle version creation strategy:
    // 1. If temp version exists: Convert it to permanent (captures "before" state)
    // 2. After tile update: Create NEW version (captures "after" state)
    // This ensures each save creates a distinct version showing the state at that moment
    
    $hasTempVersion = false;
    $beforeVersionId = null;
    $stmt = $db->prepare('SELECT id FROM tile_versions WHERE tile_id = ? AND is_temp = 1 LIMIT 1');
    $stmt->execute([$tileId]);
    $tempVersion = $stmt->fetch();
    
    if ($tempVersion && !$isRestore && $isFinal) {
        // Convert temp version to permanent - this captures the "before" state
        $stmt = $db->prepare('UPDATE tile_versions SET is_temp = 0, changelog_summary = ? WHERE id = ?');
        $stmt->execute(["Snapshot before edit", $tempVersion['id']]);
        $hasTempVersion = true;
        $beforeVersionId = (int)$tempVersion['id'];
    } elseif (!$isRestore && $isFinal) {
        // No temp version exists, create a "before" snapshot (fallback for direct saves)
        $beforeVersionId = saveVersion($tileId, $db, $user['id'], "Snapshot before edit", false);
    }

    // Begin transaction
    if (!$db->inTransaction()) {
        $db->beginTransaction();
    }
    
    try {
        // Check granular permissions for visibility changes
        if ($granularPerms !== null) {
            $currentVisibility = $currentTileData['visibility'] ?? 'public';
            $newVisibility = $data['visibility'] ?? 'public';
            if ($currentVisibility !== $newVisibility && !$granularPerms['canChangeVisibility']) {
                throw new Exception('You do not have permission to change tile visibility');
            }
        }
        
        // Handle visibility and allowed_users/allowed_groups
        $visibility = $data['visibility'] ?? 'public';
        $allowedUsers = null;
        $allowedGroups = null;
        if ($visibility === 'private' && isset($data['allowedUsers']) && is_array($data['allowedUsers'])) {
            // Share flow: users being "added" must accept invitation first. Only include owner + users who have accepted.
            $ownerId = isset($currentTileData['userId']) ? (int)$currentTileData['userId'] : (isset($currentTileData['user_id']) ? (int)$currentTileData['user_id'] : null);
            if (!$ownerId) {
                $ownStmt = $db->prepare('SELECT user_id FROM tiles WHERE id = ?');
                $ownStmt->execute([$tileId]);
                $ownRow = $ownStmt->fetch();
                $ownerId = $ownRow ? (int)$ownRow['user_id'] : null;
            }
            $usersToInclude = [];
            foreach ($data['allowedUsers'] as $uid) {
                $uid = (int)$uid;
                if ($uid === $ownerId) {
                    $usersToInclude[] = $uid;
                    continue;
                }
                // Check if this user has accepted a share invitation
                $accStmt = $db->prepare('SELECT id FROM tile_share_invitations WHERE tile_id = ? AND sharer_user_id = ? AND receiver_user_id = ? AND status = ?');
                $accStmt->execute([$tileId, $ownerId, $uid, 'accepted']);
                if ($accStmt->fetch()) {
                    $usersToInclude[] = $uid;
                } else {
                    // Create pending invitation - they must accept to get access
                    $now = time();
                    $invStmt = $db->prepare('SELECT id, status FROM tile_share_invitations WHERE tile_id = ? AND sharer_user_id = ? AND receiver_user_id = ?');
                    $invStmt->execute([$tileId, $ownerId, $uid]);
                    $inv = $invStmt->fetch();
                    if ($inv) {
                        if ($inv['status'] !== 'pending') {
                            $updInv = $db->prepare('UPDATE tile_share_invitations SET status = ?, updated_at = ? WHERE id = ?');
                            $updInv->execute(['pending', $now, $inv['id']]);
                        }
                    } else {
                        $insInv = $db->prepare('INSERT INTO tile_share_invitations (tile_id, sharer_user_id, receiver_user_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
                        $insInv->execute([$tileId, $ownerId, $uid, 'pending', $now, $now]);
                    }
                }
            }
            $allowedUsers = !empty($usersToInclude) ? json_encode(array_values(array_unique($usersToInclude))) : null;
        }
        if ($visibility === 'private' && isset($data['allowedGroups']) && is_array($data['allowedGroups'])) {
            $allowedGroups = json_encode($data['allowedGroups']);
        }
        
        // Handle hyperlink fields
        $isHyperlink = isset($data['isHyperlink']) && $data['isHyperlink'] ? 1 : 0;
        $hyperlinkUrl = $data['hyperlinkUrl'] ?? null;
        $openInNewTab = isset($data['openInNewTab']) && $data['openInNewTab'] ? 1 : 0;
        
        // Handle scheduling fields
        $visibleFrom = isset($data['visibleFrom']) && $data['visibleFrom'] ? $data['visibleFrom'] : null;
        $expiresAt = isset($data['expiresAt']) && $data['expiresAt'] ? $data['expiresAt'] : null;
        
        // Check granular permission for browser changes (tile-level and link-level). Deny unless explicitly true.
        $canChangeBrowser = canTileAdminPerformAction($user['id'], $tileId, 'change_browser', $db);
        $currentBrowser = $currentTileData['browser'] ?? null;
        $newBrowser = isset($data['browser']) && $data['browser'] !== 'default' && $data['browser'] !== '' ? $data['browser'] : null;
        if ($currentBrowser !== $newBrowser && $canChangeBrowser !== true) {
            throw new Exception('You do not have permission to change tile browser settings');
        }
        // Build map of existing link id -> browser from current tile data
        $oldLinkBrowsers = [];
        foreach ($currentTileData['tabs'] ?? [] as $tab) {
            foreach ($tab['sections'] ?? [] as $section) {
                foreach ($section['links'] ?? [] as $link) {
                    $lid = $link['id'] ?? null;
                    if ($lid) {
                        $lb = $link['browser'] ?? null;
                        $oldLinkBrowsers[$lid] = ($lb === '' || $lb === 'default') ? null : $lb;
                    }
                }
            }
        }
        foreach ($currentTileData['sections'] ?? [] as $section) {
            foreach ($section['links'] ?? [] as $link) {
                $lid = $link['id'] ?? null;
                if ($lid && !array_key_exists($lid, $oldLinkBrowsers)) {
                    $lb = $link['browser'] ?? null;
                    $oldLinkBrowsers[$lid] = ($lb === '' || $lb === 'default') ? null : $lb;
                }
            }
        }
        // Check if any link's browser is being changed or a new link has browser set
        $checkLinkBrowser = function ($links) use ($oldLinkBrowsers, $canChangeBrowser) {
            foreach ($links as $link) {
                $newLb = $link['browser'] ?? null;
                $newLb = ($newLb === '' || $newLb === 'default') ? null : $newLb;
                $lid = $link['id'] ?? null;
                $oldLb = ($lid && array_key_exists($lid, $oldLinkBrowsers)) ? $oldLinkBrowsers[$lid] : null;
                if ($oldLb !== $newLb && $canChangeBrowser !== true) {
                    throw new Exception('You do not have permission to change link browser settings');
                }
            }
        };
        if (isset($data['tabs']) && is_array($data['tabs'])) {
            foreach ($data['tabs'] as $tab) {
                if (isset($tab['sections']) && is_array($tab['sections'])) {
                    foreach ($tab['sections'] as $section) {
                        if (isset($section['links']) && is_array($section['links'])) {
                            $checkLinkBrowser($section['links']);
                        }
                    }
                }
            }
        }
        if (isset($data['sections']) && is_array($data['sections'])) {
            foreach ($data['sections'] as $section) {
                if (isset($section['links']) && is_array($section['links'])) {
                    $checkLinkBrowser($section['links']);
                }
            }
        }
        
        // Handle browser field
        $browser = isset($data['browser']) && $data['browser'] !== 'default' ? $data['browser'] : null;
        
        // Handle tile decoration fields
        $tileBackgroundColor = isset($data['tileBackgroundColor']) && $data['tileBackgroundColor'] !== null && $data['tileBackgroundColor'] !== '' ? $data['tileBackgroundColor'] : null;
        $tileGradientEnabled = array_key_exists('tileGradientEnabled', $data) ? ($data['tileGradientEnabled'] ? 1 : 0) : null;
        $tileGradientColors = ($tileGradientEnabled === 1 && isset($data['tileGradientColors']) && is_array($data['tileGradientColors']) && count($data['tileGradientColors']) > 0) ? json_encode($data['tileGradientColors']) : null;
        $tileGradientColorPositions = ($tileGradientEnabled === 1 && isset($data['tileGradientColorPositions']) && is_array($data['tileGradientColorPositions']) && count($data['tileGradientColorPositions']) > 0) ? json_encode($data['tileGradientColorPositions']) : null;
        $tileGradientDirection = ($tileGradientEnabled === 1 && isset($data['tileGradientDirection']) && $data['tileGradientDirection'] !== null) ? (is_numeric($data['tileGradientDirection']) ? (int)$data['tileGradientDirection'] : $data['tileGradientDirection']) : null;
        $tileGradientType = ($tileGradientEnabled === 1 && isset($data['tileGradientType']) && $data['tileGradientType']) ? $data['tileGradientType'] : null;
        $tileBorderRadius = array_key_exists('tileBorderRadius', $data) && $data['tileBorderRadius'] !== null ? (int)$data['tileBorderRadius'] : null;
        // Don't save #000000 (black) as it's effectively "no decoration" - treat it as null
        $tileTextColor = isset($data['tileTextColor']) && $data['tileTextColor'] !== null && $data['tileTextColor'] !== '' && strtolower(trim($data['tileTextColor'])) !== '#000000' && strtolower(trim($data['tileTextColor'])) !== '000000' ? $data['tileTextColor'] : null;

        // Page entrance animation for sections inside this space.
        // Preserve existing DB value when the client omits pageAnimation (partial / bulk payloads).
        $pageAnimation = array_key_exists('pageAnimation', $data)
            ? ((isset($data['pageAnimation']) && $data['pageAnimation'] !== '' && $data['pageAnimation'] !== 'none')
                ? $data['pageAnimation']
                : null)
            : ($currentTileData['pageAnimation'] ?? $currentTileData['page_animation'] ?? null);

        // Default entrance animation for all links; preserve when omitted.
        $linksAnimation = array_key_exists('linksAnimation', $data)
            ? ((isset($data['linksAnimation']) && $data['linksAnimation'] !== '' && $data['linksAnimation'] !== 'none')
                ? $data['linksAnimation']
                : null)
            : ($currentTileData['linksAnimation'] ?? $currentTileData['links_animation'] ?? null);

        // Header image URL; preserve when omitted, allow clear with empty string/null when key present.
        $headerImage = array_key_exists('headerImage', $data)
            ? ((isset($data['headerImage']) && is_string($data['headerImage']) && trim($data['headerImage']) !== '')
                ? trim($data['headerImage'])
                : null)
            : ($currentTileData['headerImage'] ?? $currentTileData['header_image'] ?? null);

        $headerImageAlign = array_key_exists('headerImageAlign', $data)
            ? ((isset($data['headerImageAlign']) && in_array($data['headerImageAlign'], ['left', 'center', 'right'], true))
                ? $data['headerImageAlign']
                : ($headerImage ? 'right' : null))
            : ($currentTileData['headerImageAlign'] ?? $currentTileData['header_image_align'] ?? ($headerImage ? 'right' : null));

        $headerImageOpacity = array_key_exists('headerImageOpacity', $data)
            ? (($headerImage !== null && isset($data['headerImageOpacity']) && is_numeric($data['headerImageOpacity']))
                ? max(0, min(100, (int)$data['headerImageOpacity']))
                : ($headerImage !== null ? 100 : null))
            : ($headerImage !== null
                ? (isset($currentTileData['headerImageOpacity']) ? max(0, min(100, (int)$currentTileData['headerImageOpacity']))
                    : (isset($currentTileData['header_image_opacity']) ? max(0, min(100, (int)$currentTileData['header_image_opacity'])) : 100))
                : null);

        $headerImageOffsetX = array_key_exists('headerImageOffsetX', $data)
            ? (($headerImage !== null && isset($data['headerImageOffsetX']) && is_numeric($data['headerImageOffsetX']))
                ? max(-300, min(300, (int)$data['headerImageOffsetX']))
                : ($headerImage !== null ? 0 : null))
            : ($headerImage !== null
                ? (isset($currentTileData['headerImageOffsetX']) ? max(-300, min(300, (int)$currentTileData['headerImageOffsetX']))
                    : (isset($currentTileData['header_image_offset_x']) ? max(-300, min(300, (int)$currentTileData['header_image_offset_x'])) : 0))
                : null);

        $headerImageFit = array_key_exists('headerImageFit', $data)
            ? (($headerImage !== null && isset($data['headerImageFit']) && in_array($data['headerImageFit'], ['contain', 'cover'], true))
                ? $data['headerImageFit']
                : ($headerImage !== null ? 'contain' : null))
            : ($headerImage !== null
                ? (($currentTileData['headerImageFit'] ?? $currentTileData['header_image_fit'] ?? null) === 'cover' ? 'cover' : 'contain')
                : null);

        $showEmoji = array_key_exists('showEmoji', $data)
            ? (!empty($data['showEmoji']) && $data['showEmoji'] !== '0' && $data['showEmoji'] !== 0 && $data['showEmoji'] !== false ? 1 : 0)
            : (isset($currentTileData['showEmoji'])
                ? (!empty($currentTileData['showEmoji']) && $currentTileData['showEmoji'] !== '0' && $currentTileData['showEmoji'] !== 0 && $currentTileData['showEmoji'] !== false ? 1 : 0)
                : (isset($currentTileData['show_emoji'])
                    ? ((int)$currentTileData['show_emoji'] === 0 ? 0 : 1)
                    : 1));

        $emojiImage = array_key_exists('emojiImage', $data)
            ? ((isset($data['emojiImage']) && is_string($data['emojiImage']) && trim($data['emojiImage']) !== '')
                ? trim($data['emojiImage'])
                : null)
            : ($currentTileData['emojiImage'] ?? $currentTileData['emoji_image'] ?? null);

        $showTitle = array_key_exists('showTitle', $data)
            ? (!empty($data['showTitle']) && $data['showTitle'] !== '0' && $data['showTitle'] !== 0 && $data['showTitle'] !== false ? 1 : 0)
            : (isset($currentTileData['showTitle'])
                ? (!empty($currentTileData['showTitle']) && $currentTileData['showTitle'] !== '0' && $currentTileData['showTitle'] !== 0 && $currentTileData['showTitle'] !== false ? 1 : 0)
                : (isset($currentTileData['show_title'])
                    ? ((int)$currentTileData['show_title'] === 0 ? 0 : 1)
                    : 1));

        $showDescription = array_key_exists('showDescription', $data)
            ? (!empty($data['showDescription']) && $data['showDescription'] !== '0' && $data['showDescription'] !== 0 && $data['showDescription'] !== false ? 1 : 0)
            : (isset($currentTileData['showDescription'])
                ? (!empty($currentTileData['showDescription']) && $currentTileData['showDescription'] !== '0' && $currentTileData['showDescription'] !== 0 && $currentTileData['showDescription'] !== false ? 1 : 0)
                : (isset($currentTileData['show_description'])
                    ? ((int)$currentTileData['show_description'] === 0 ? 0 : 1)
                    : 1));

        $headerImageOffsetY = array_key_exists('headerImageOffsetY', $data)
            ? (($headerImage !== null && isset($data['headerImageOffsetY']) && is_numeric($data['headerImageOffsetY']))
                ? max(-300, min(300, (int)$data['headerImageOffsetY']))
                : ($headerImage !== null ? 0 : null))
            : ($headerImage !== null
                ? (isset($currentTileData['headerImageOffsetY']) ? max(-300, min(300, (int)$currentTileData['headerImageOffsetY']))
                    : (isset($currentTileData['header_image_offset_y']) ? max(-300, min(300, (int)$currentTileData['header_image_offset_y'])) : 0))
                : null);

        // Source tab: only admin can change (e.g. move staging -> public)
        $currentSourceTab = isset($currentTileData['sourceTab']) ? $currentTileData['sourceTab'] : (isset($currentTileData['source_tab']) ? $currentTileData['source_tab'] : 'public');
        $sourceTab = $currentSourceTab;
        if (isset($data['sourceTab']) || isset($data['source_tab'])) {
            $newSourceTab = isset($data['sourceTab']) ? trim((string)$data['sourceTab']) : trim((string)$data['source_tab']);
            if ($newSourceTab === 'public' || $newSourceTab === 'staging') {
                if ($user['is_admin']) {
                    $sourceTab = $newSourceTab;
                }
            }
        }

        // Published flag: only admins may unpublish; preserve when omitted
        $currentPublished = isset($currentTileData['published']) ? isContentPublished($currentTileData) : true;
        $published = resolvePublishedFlag($data, $user, $currentPublished);

        // Card-level / summary saves (e.g. header image from home grid) must not wipe nested content.
        // Detect via explicit flag, or empty tabs payload while DB still has tabs/sections/links.
        $incomingTabs = (isset($data['tabs']) && is_array($data['tabs'])) ? $data['tabs'] : null;
        $currentTabs = (isset($currentTileData['tabs']) && is_array($currentTileData['tabs'])) ? $currentTileData['tabs'] : [];
        $currentHasNested = false;
        foreach ($currentTabs as $ct) {
            if (!empty($ct['sections']) && is_array($ct['sections'])) {
                foreach ($ct['sections'] as $cs) {
                    if (!empty($cs['links']) || !empty($cs['richTextContent'])) {
                        $currentHasNested = true;
                        break 2;
                    }
                }
            }
        }
        if (!$currentHasNested && !empty($currentTabs)) {
            $currentHasNested = true; // has tab structure even without links
        }
        $preserveNested = !empty($data['preserve_nested']) || !empty($data['preserveNested'])
            || ($incomingTabs !== null && count($incomingTabs) === 0 && $currentHasNested)
            || ($incomingTabs === null && !isset($data['sections']));

        // Preserve html_content when omitted or when a card-level save sends empty htmlContent
        if (array_key_exists('htmlContent', $data)) {
            $htmlContent = $data['htmlContent'] ?? '';
            if ($preserveNested && ($htmlContent === '' || $htmlContent === null)
                && !empty($currentTileData['htmlContent'] ?? $currentTileData['html_content'] ?? null)) {
                $htmlContent = $currentTileData['htmlContent'] ?? $currentTileData['html_content'];
            }
        } else {
            $htmlContent = $currentTileData['htmlContent'] ?? $currentTileData['html_content'] ?? '';
        }
        
        // Update tile
        $stmt = $db->prepare('UPDATE tiles SET title = ?, description = ?, html_content = ?, emoji = ?, theme_color = ?, "group" = ?, visibility = ?, allowed_users = ?, allowed_groups = ?, is_hyperlink = ?, hyperlink_url = ?, open_in_new_tab = ?, visible_from = ?, expires_at = ?, browser = ?, tile_background_color = ?, tile_gradient_enabled = ?, tile_gradient_colors = ?, tile_gradient_color_positions = ?, tile_gradient_direction = ?, tile_gradient_type = ?, tile_border_radius = ?, tile_text_color = ?, page_animation = ?, links_animation = ?, header_image = ?, header_image_align = ?, header_image_opacity = ?, header_image_offset_x = ?, header_image_offset_y = ?, header_image_fit = ?, show_emoji = ?, emoji_image = ?, show_title = ?, show_description = ?, source_tab = ?, published = ? WHERE id = ?');
        $stmt->execute([
            $data['title'] ?? '',
            $data['description'] ?? '',
            $htmlContent,
            $data['emoji'] ?? '📁',
            $data['themeColor'] ?? 'blue',
            $data['group'] ?? 'General',
            $visibility,
            $allowedUsers,
            $allowedGroups,
            $isHyperlink,
            $hyperlinkUrl,
            $openInNewTab,
            $visibleFrom,
            $expiresAt,
            $browser,
            $tileBackgroundColor,
            $tileGradientEnabled,
            $tileGradientColors,
            $tileGradientColorPositions,
            $tileGradientDirection,
            $tileGradientType,
            $tileBorderRadius,
            $tileTextColor,
            $pageAnimation,
            $linksAnimation,
            $headerImage,
            $headerImageAlign,
            $headerImageOpacity,
            $headerImageOffsetX,
            $headerImageOffsetY,
            $headerImageFit,
            $showEmoji,
            $emojiImage,
            $showTitle,
            $showDescription,
            $sourceTab,
            $published,
            $tileId
        ]);

        if ($preserveNested) {
            // Metadata-only update: leave tabs, sections, links, messages untouched
            if ($db->inTransaction()) {
                $db->commit();
            }
            invalidateGuestTilesListCache();

            $afterTileData = getTileForVersion($tileId, $db);
            if ($afterTileData && $currentTileData && areTilesEqual($currentTileData, $afterTileData)) {
                if ($beforeVersionId) {
                    $deleteStmt = $db->prepare('DELETE FROM tile_versions WHERE id = ? AND is_locked = 0');
                    $deleteStmt->execute([$beforeVersionId]);
                }
                return;
            }

            if (!$isRestore && $isFinal) {
                $summary = generateChangelogSummary($currentTileData, $data);
                saveVersion($tileId, $db, $user['id'], $summary, false);
            }
            return;
        }
        
        // Check granular permissions for deletions
        if ($granularPerms !== null) {
            // Count current items
            $currentTabsCount = isset($currentTileData['tabs']) ? count($currentTileData['tabs']) : 0;
            $newTabs = isset($data['tabs']) ? count($data['tabs']) : 0;
            
            // Count sections and links
            $currentSections = 0;
            $currentLinks = 0;
            if (isset($currentTileData['tabs'])) {
                foreach ($currentTileData['tabs'] as $tab) {
                    $currentSections += isset($tab['sections']) ? count($tab['sections']) : 0;
                    foreach ($tab['sections'] ?? [] as $section) {
                        $currentLinks += isset($section['links']) ? count($section['links']) : 0;
                    }
                }
            }
            
            $newSections = 0;
            $newLinks = 0;
            if (isset($data['tabs'])) {
                foreach ($data['tabs'] as $tab) {
                    $newSections += isset($tab['sections']) ? count($tab['sections']) : 0;
                    foreach ($tab['sections'] ?? [] as $section) {
                        $newLinks += isset($section['links']) ? count($section['links']) : 0;
                    }
                }
            }
            
            // Check if deletions are happening
            if ($currentTabsCount > $newTabs && !$granularPerms['canDeleteTabs']) {
                throw new Exception('You do not have permission to delete tabs');
            }
            if ($currentSections > $newSections && !$granularPerms['canDeleteSections']) {
                throw new Exception('You do not have permission to delete sections');
            }
            if ($currentLinks > $newLinks && !$granularPerms['canDeleteLinks']) {
                throw new Exception('You do not have permission to delete links');
            }
            
            // Check if additions are allowed
            if ($newTabs > $currentTabsCount && !$granularPerms['canAddTabs']) {
                throw new Exception('You do not have permission to add tabs');
            }
            if ($newSections > $currentSections && !$granularPerms['canAddSections']) {
                throw new Exception('You do not have permission to add sections');
            }
            if ($newLinks > $currentLinks && !$granularPerms['canAddLinks']) {
                throw new Exception('You do not have permission to add links');
            }
        }
        
        // Delete existing tabs, sections, links, and rich text content
        // Non-admins never see unpublished children in GET; merge them back so saves don't destroy them
        if (empty($user['is_admin']) && isset($currentTileData['tabs']) && is_array($currentTileData['tabs'])) {
            $data['tabs'] = mergeUnpublishedContentForSave($data['tabs'] ?? [], $currentTileData['tabs']);
        }

        $db->prepare('DELETE FROM rich_text_content WHERE section_id IN (SELECT id FROM sections WHERE tile_id = ?)')->execute([$tileId]);
        $db->prepare('DELETE FROM links WHERE section_id IN (SELECT id FROM sections WHERE tile_id = ?)')->execute([$tileId]);
        $db->prepare('DELETE FROM sections WHERE tile_id = ?')->execute([$tileId]);
        $db->prepare('DELETE FROM tabs WHERE tile_id = ?')->execute([$tileId]);
        $db->prepare('DELETE FROM tile_messages WHERE tile_id = ?')->execute([$tileId]);
    
        // Insert new tabs, sections, and links
        if (isset($data['tabs']) && is_array($data['tabs'])) {
            foreach ($data['tabs'] as $tabIndex => $tab) {
                $tabId = $tab['id'] ?? uniqid('tab_', true);
                $tabColor = (!empty($tab['textColor']) && trim($tab['textColor']) !== '') ? trim($tab['textColor']) : null;
                $tabVisibility = $tab['visibility'] ?? 'public';
                $tabAllowedUsers = isset($tab['allowedUsers']) && is_array($tab['allowedUsers']) ? json_encode($tab['allowedUsers']) : null;
                $tabAllowedGroups = isset($tab['allowedGroups']) && is_array($tab['allowedGroups']) ? json_encode($tab['allowedGroups']) : null;
                $tabPublished = resolvePublishedFlag($tab, $user, true);
                $tabStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position, text_color, visible_from, expires_at, visibility, allowed_users, allowed_groups, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                $tabStmt->execute([
                    $tabId,
                    $tileId,
                    $tab['title'] ?? 'New Tab',
                    $tab['position'] ?? $tabIndex,
                    $tabColor,
                    $tab['visibleFrom'] ?? null,
                    $tab['expiresAt'] ?? null,
                    $tabVisibility,
                    $tabAllowedUsers,
                    $tabAllowedGroups,
                    $tabPublished
                ]);
                
                if (isset($tab['sections']) && is_array($tab['sections'])) {
                    foreach ($tab['sections'] as $sectionIndex => $section) {
                        $sectionId = $section['id'] ?? uniqid('section_', true);
                        $sectionPosition = isset($section['position']) ? (int)$section['position'] : $sectionIndex;
                        $secVisibility = $section['visibility'] ?? 'public';
                        $secAllowedUsers = isset($section['allowedUsers']) && is_array($section['allowedUsers']) ? json_encode($section['allowedUsers']) : null;
                        $secAllowedGroups = isset($section['allowedGroups']) && is_array($section['allowedGroups']) ? json_encode($section['allowedGroups']) : null;
                        $secPublished = resolvePublishedFlag($section, $user, true);
                        $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, text_color, visible_from, expires_at, force_stacked_view, position, visibility, allowed_users, allowed_groups, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                        $sectionStmt->execute([
                            $sectionId,
                            $tileId,
                            $tabId,
                            $section['title'] ?? '',
                            $section['textColor'] ?? null,
                            $section['visibleFrom'] ?? null,
                            $section['expiresAt'] ?? null,
                            isset($section['forceStackedView']) && $section['forceStackedView'] === true ? 1 : 0,
                            $sectionPosition,
                            $secVisibility,
                            $secAllowedUsers,
                            $secAllowedGroups,
                            $secPublished
                        ]);
                        
                        // Links
                        if (isset($section['links']) && is_array($section['links'])) {
                            foreach ($section['links'] as $link) {
                                $linkId = $link['id'] ?? uniqid('link_', true);
                                $visibility = $link['visibility'] ?? 'public';
                                $allowedUsers = isset($link['allowedUsers']) && is_array($link['allowedUsers']) ? json_encode($link['allowedUsers']) : null;
                                $allowedGroups = isset($link['allowedGroups']) && is_array($link['allowedGroups']) ? json_encode($link['allowedGroups']) : null;
                                $linkPublished = resolvePublishedFlag($link, $user, true);
                                $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, text_color, visibility, allowed_users, allowed_groups, notes, tooltip, visible_from, expires_at, browser, position, rich_text_content, animation, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                                $linkStmt->execute([
                                    $linkId,
                                    $sectionId,
                                    $link['label'],
                                    $link['url'],
                                    $link['icon'] ?? null,
                                    $link['textColor'] ?? null,
                                    $visibility,
                                    $allowedUsers,
                                    $allowedGroups,
                                    $link['notes'] ?? null,
                                    $link['tooltip'] ?? null,
                                    $link['visibleFrom'] ?? null,
                                    $link['expiresAt'] ?? null,
                                    $link['browser'] ?? null,
                                    isset($link['position']) ? (int)$link['position'] : 0,
                                    $link['richTextContent'] ?? null,
                                    $link['animation'] ?? null,
                                    $linkPublished
                                ]);
                            }
                        }
                        
                        // Rich Text
                        if (isset($section['richTextContent']) && is_array($section['richTextContent'])) {
                            foreach ($section['richTextContent'] as $richText) {
                                $richTextId = $richText['id'] ?? uniqid('richtext_', true);
                                try {
                                    insertRichTextContent($db, $richTextId, $sectionId, $richText);
                                } catch (PDOException $e) {
                                    // ignore specific rich text error
                                }
                            }
                        }
                    }
                }
            }
        } elseif (isset($data['sections']) && is_array($data['sections'])) {
            // Backward compatibility
            $defaultTabId = uniqid('tab_', true);
            $db->prepare('INSERT INTO tabs (id, tile_id, title, position) VALUES (?, ?, ?, ?)')->execute([$defaultTabId, $tileId, 'Default', 0]);
            
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
                        if (!isset($link['label']) || !isset($link['url'])) continue;
                        $linkId = $link['id'] ?? uniqid('link_', true);
                        $visibility = $link['visibility'] ?? 'public';
                        $allowedUsers = isset($link['allowedUsers']) && is_array($link['allowedUsers']) ? json_encode($link['allowedUsers']) : null;
                        $allowedGroups = isset($link['allowedGroups']) && is_array($link['allowedGroups']) ? json_encode($link['allowedGroups']) : null;
                        $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, text_color, visibility, allowed_users, allowed_groups, notes, tooltip, browser, position, animation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                        $linkStmt->execute([
                            $linkId,
                            $sectionId,
                            $link['label'],
                            $link['url'],
                            $link['icon'] ?? null,
                            $link['textColor'] ?? null,
                            $visibility,
                            $allowedUsers,
                            $allowedGroups,
                            $link['notes'] ?? null,
                            $link['tooltip'] ?? null,
                            $link['browser'] ?? null,
                            isset($link['position']) ? (int)$link['position'] : 0,
                            $link['animation'] ?? null
                        ]);
                    }
                    if (isset($section['richTextContent']) && is_array($section['richTextContent'])) {
                        foreach ($section['richTextContent'] as $richText) {
                            $richTextId = $richText['id'] ?? uniqid('richtext_', true);
                            try {
                                insertRichTextContent($db, $richTextId, $sectionId, $richText);
                            } catch (PDOException $e) {}
                        }
                    }
                }
            }
        }
        
        // Messages
        if (isset($data['messages']) && is_array($data['messages'])) {
            $msgStmt = $db->prepare('INSERT INTO tile_messages (id, tile_id, content, type, start_date, end_date, is_active, priority, text_color, font_style, display_location, animation_type, delay_before, celebration_effect, celebration_config, url, url_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            foreach ($data['messages'] as $msg) {
                $msgId = $msg['id'] ?? uniqid('msg_', true);
                $cc = isset($msg['celebrationConfig']) && is_array($msg['celebrationConfig']) ? json_encode($msg['celebrationConfig']) : null;
                $msgStmt->execute([
                    $msgId,
                    $tileId,
                    $msg['content'] ?? '',
                    $msg['type'] ?? 'info',
                    $msg['startDate'] ?? null,
                    $msg['endDate'] ?? null,
                    isset($msg['isActive']) && $msg['isActive'] ? 1 : 0,
                    isset($msg['priority']) ? (int)$msg['priority'] : 0,
                    $msg['textColor'] ?? null,
                    $msg['fontStyle'] ?? null,
                    $msg['displayLocation'] ?? 'both',
                    $msg['animationType'] ?? 'rollover',
                    isset($msg['delayBefore']) ? (float)$msg['delayBefore'] : 0,
                    $msg['celebrationEffect'] ?? 'fireworks',
                    $cc,
                    $msg['url'] ?? null,
                    $msg['urlLabel'] ?? null
                ]);
            }
        }

        $db->commit();
        invalidateGuestTilesListCache();

        $afterTileData = getTileForVersion($tileId, $db);
        if ($afterTileData && $currentTileData && areTilesEqual($currentTileData, $afterTileData)) {
            if ($beforeVersionId) {
                $deleteStmt = $db->prepare('DELETE FROM tile_versions WHERE id = ? AND is_locked = 0');
                $deleteStmt->execute([$beforeVersionId]);
            }
            return;
        }
        
        // After successful update, create a NEW version to capture the "after" state
        // This ensures each save creates a distinct version showing the current state
        if (!$isRestore && $isFinal) {
            $summary = generateChangelogSummary($currentTileData, $data);
            saveVersion($tileId, $db, $user['id'], $summary, false);
        }
    } catch (Exception $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }
}

function areTilesEqual($a, $b) {
    try {
        if (!is_array($a) || !is_array($b)) {
            return false; // Can't compare non-arrays
        }
        $normA = normalizeForComparison($a);
        $normB = normalizeForComparison($b);
        return serialize($normA) === serialize($normB);
    } catch (Exception $e) {
        error_log("areTilesEqual error: " . $e->getMessage());
        return false; // On error, assume they're different (safer)
    }
}

function normalizeForComparison($data) {
    try {
        if (is_array($data)) {
            // Metadata and transient fields to exclude from comparison
            $excludeKeys = [
                'createdAt', 'created_at',
                'updatedAt', 'updated_at',
                'deletedAt', 'deleted_at',
                'archivedAt', 'archived_at',
                'user_id', 'userId',
                'canView', 'can_view',
                'canEdit', 'can_edit',
                'canDelete', 'can_delete',
                'hasRoleAccess', 'has_role_access',
                'isFavorite', 'is_favorite',
                'health' // Transient link health data
            ];

            $result = [];
            foreach ($data as $k => $v) {
                if (in_array($k, $excludeKeys)) continue;

                if (is_array($v)) {
                    $child = normalizeForComparison($v);
                    // Only include non-empty arrays or arrays that exist in both versions
                    if (!empty($child) || array_key_exists($k, $data)) {
                        $result[$k] = $child;
                    }
                } else {
                    // Convert to string for loose comparison (DB sometimes returns string for int)
                    // Normalize booleans to strings "0" or "1" to ensure match
                    // Include empty strings and null values as they represent meaningful differences
                    if (is_bool($v)) {
                        $result[$k] = $v ? "1" : "0";
                    } elseif (is_null($v)) {
                        $result[$k] = ""; // Normalize null to empty string
                    } else {
                        $result[$k] = (string)$v;
                    }
                }
            }
            if (function_exists('internal_recursive_ksort')) {
                internal_recursive_ksort($result);
            } else {
                ksort($result);
            }
            return $result;
        }
        return (string)$data;
    } catch (Exception $e) {
        error_log("normalizeForComparison error: " . $e->getMessage());
        return is_array($data) ? [] : (string)$data;
    }
}

function internal_recursive_ksort(&$array) {
    if (is_array($array)) {
        foreach ($array as &$value) {
            internal_recursive_ksort($value);
        }
        ksort($array);
    }
}



function handleGetVersionDetails($tileId, $versionId) {
    $user = requireAuth();
    $db = getDB();

    if (!canUserViewTile($user['id'], $tileId, $db)) {
        sendJSON(['error' => 'Permission denied'], 403);
    }

    $stmt = $db->prepare('SELECT tile_data, created_at, version_number FROM tile_versions WHERE id = ? AND tile_id = ?');
    $stmt->execute([$versionId, $tileId]);
    $version = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$version) {
        sendJSON(['error' => 'Version not found'], 404);
    }

    $data = json_decode($version['tile_data'], true);
    if (!$data) {
        sendJSON(['error' => 'Corrupt version data'], 500);
    }
    
    sendJSON([
        'version' => [
            'id' => $versionId,
            'version_number' => $version['version_number'],
            'created_at' => $version['created_at'],
            'tile_data' => $version['tile_data'], // Include raw string for frontend parsing
            'data' => $data
        ]
    ]);
}

function generateChangelogSummary($old, $new) {
    if (!$old || !$new) return "Update";
    
    $changes = [];
    
    // Root level fields
    $rootFields = ['title', 'description', 'htmlContent', 'group', 'emoji', 'showEmoji', 'showTitle', 'showDescription', 'emojiImage', 'visibility', 'browser', 'themeColor', 'isHyperlink', 'hyperlinkUrl', 'pageAnimation', 'linksAnimation', 'headerImage', 'headerImageAlign', 'headerImageOpacity', 'headerImageOffsetX', 'headerImageOffsetY', 'headerImageFit'];
    foreach ($rootFields as $f) {
        $oldVal = is_array($old) ? ($old[$f] ?? null) : null;
        $newVal = is_array($new) ? ($new[$f] ?? null) : null;
        if ((string)$oldVal !== (string)$newVal) {
            if ($f === 'htmlContent') {
                $changes[] = "HTML Content";
            } elseif ($f === 'isHyperlink') {
                $changes[] = "Hyperlink";
            } elseif ($f === 'hyperlinkUrl') {
                $changes[] = "Hyperlink URL";
            } else {
                $changes[] = ucfirst($f);
            }
        }
    }
    
    // Check browser changes at tile level
    if (isset($old['browser']) && isset($new['browser']) && $old['browser'] !== $new['browser']) {
        $changes[] = "Browser";
    }
    
    // Check tile decoration changes
    $decorationFields = ['tileBackgroundColor', 'tileGradientEnabled', 'tileGradientColors', 'tileBorderRadius', 'tileTextColor'];
    foreach ($decorationFields as $f) {
        $oldVal = is_array($old) ? ($old[$f] ?? null) : null;
        $newVal = is_array($new) ? ($new[$f] ?? null) : null;
        if ($oldVal !== $newVal) {
            $changes[] = "Tile Style";
            break; // Group all decoration changes as one
        }
    }
    
    // Check messages
    $oldMessages = $old['messages'] ?? [];
    $newMessages = $new['messages'] ?? [];
    if (count($oldMessages) !== count($newMessages)) {
        $changes[] = "Messages";
    } elseif (json_encode($oldMessages) !== json_encode($newMessages)) {
        $changes[] = "Messages";
    }
    
    // Check tabs structure
    $oldTabs = $old['tabs'] ?? [];
    $newTabs = $new['tabs'] ?? [];
    
    if (count($oldTabs) !== count($newTabs)) {
        $changes[] = "Tabs (" . (count($newTabs) > count($oldTabs) ? "Added" : "Removed") . ")";
    }
    
    // Detailed content analysis
    $linkChanges = 0;
    $richTextChanges = 0;
    $tabChanges = 0;
    $sectionChanges = 0;
    
    // Create maps for comparison
    $oldTabMap = [];
    $newTabMap = [];
    foreach ($oldTabs as $tab) {
        $oldTabMap[$tab['id']] = $tab;
    }
    foreach ($newTabs as $tab) {
        $newTabMap[$tab['id']] = $tab;
    }
    
    // Check for tab changes
    foreach ($newTabMap as $tabId => $newTab) {
        if (!isset($oldTabMap[$tabId])) {
            $tabChanges++;
        } else {
            $oldTab = $oldTabMap[$tabId];
            // Check tab fields
            if (($oldTab['title'] ?? '') !== ($newTab['title'] ?? '')) {
                $tabChanges++;
            }
            if (($oldTab['textColor'] ?? null) !== ($newTab['textColor'] ?? null)) {
                $tabChanges++;
            }
            
            // Check sections
            $oldSections = $oldTab['sections'] ?? [];
            $newSections = $newTab['sections'] ?? [];
            
            if (count($oldSections) !== count($newSections)) {
                $sectionChanges++;
            }
            
            // Create section maps
            $oldSectionMap = [];
            $newSectionMap = [];
            foreach ($oldSections as $sec) {
                $oldSectionMap[$sec['id']] = $sec;
            }
            foreach ($newSections as $sec) {
                $newSectionMap[$sec['id']] = $sec;
            }
            
            // Check for section changes
            foreach ($newSectionMap as $secId => $newSec) {
                if (!isset($oldSectionMap[$secId])) {
                    $sectionChanges++;
                } else {
                    $oldSec = $oldSectionMap[$secId];
                    if (($oldSec['title'] ?? '') !== ($newSec['title'] ?? '')) {
                        $sectionChanges++;
                    }
                }
            }
            
            // Check for removed sections
            foreach ($oldSectionMap as $secId => $oldSec) {
                if (!isset($newSectionMap[$secId])) {
                    $sectionChanges++;
                }
            }
            
            // Check links
            foreach ($newSectionMap as $secId => $newSec) {
                $oldSec = $oldSectionMap[$secId] ?? ['links' => [], 'richTextContent' => []];
                $oldLinks = $oldSec['links'] ?? [];
                $newLinks = $newSec['links'] ?? [];
                
                if (count($oldLinks) !== count($newLinks)) {
                    $linkChanges++;
                } else {
                    // Check for link field changes
                    $oldLinkMap = [];
                    $newLinkMap = [];
                    foreach ($oldLinks as $link) {
                        $oldLinkMap[$link['id']] = $link;
                    }
                    foreach ($newLinks as $link) {
                        $newLinkMap[$link['id']] = $link;
                    }
                    
                    foreach ($newLinkMap as $linkId => $newLink) {
                        $oldLink = $oldLinkMap[$linkId] ?? null;
                        if (!$oldLink) {
                            $linkChanges++;
                        } else {
                            // Check key link fields
                            if (($oldLink['label'] ?? '') !== ($newLink['label'] ?? '') ||
                                ($oldLink['url'] ?? '') !== ($newLink['url'] ?? '') ||
                                ($oldLink['browser'] ?? null) !== ($newLink['browser'] ?? null) ||
                                ($oldLink['icon'] ?? null) !== ($newLink['icon'] ?? null) ||
                                ($oldLink['notes'] ?? null) !== ($newLink['notes'] ?? null) ||
                                ($oldLink['tooltip'] ?? null) !== ($newLink['tooltip'] ?? null)) {
                                $linkChanges++;
                            }
                        }
                    }
                    
                    foreach ($oldLinkMap as $linkId => $oldLink) {
                        if (!isset($newLinkMap[$linkId])) {
                            $linkChanges++;
                        }
                    }
                }
                
                // Check rich text
                $oldRichText = $oldSec['richTextContent'] ?? [];
                $newRichText = $newSec['richTextContent'] ?? [];
                
                if (count($oldRichText) !== count($newRichText)) {
                    $richTextChanges++;
                } else {
                    $oldRtMap = [];
                    $newRtMap = [];
                    foreach ($oldRichText as $rt) {
                        $oldRtMap[$rt['id']] = $rt;
                    }
                    foreach ($newRichText as $rt) {
                        $newRtMap[$rt['id']] = $rt;
                    }
                    
                    foreach ($newRtMap as $rtId => $newRt) {
                        $oldRt = $oldRtMap[$rtId] ?? null;
                        if (!$oldRt || ($oldRt['content'] ?? '') !== ($newRt['content'] ?? '')) {
                            $richTextChanges++;
                        }
                    }
                    
                    foreach ($oldRtMap as $rtId => $oldRt) {
                        if (!isset($newRtMap[$rtId])) {
                            $richTextChanges++;
                        }
                    }
                }
            }
        }
    }
    
    // Check for removed tabs
    foreach ($oldTabMap as $tabId => $oldTab) {
        if (!isset($newTabMap[$tabId])) {
            $tabChanges++;
        }
    }
    
    // Add detailed changes
    if ($linkChanges > 0) {
        $changes[] = "Links (" . ($linkChanges > 1 ? "$linkChanges changes" : "1 change") . ")";
    }
    if ($richTextChanges > 0) {
        $changes[] = "Rich Text (" . ($richTextChanges > 1 ? "$richTextChanges changes" : "1 change") . ")";
    }
    if ($tabChanges > 0 && count($oldTabs) === count($newTabs)) {
        $changes[] = "Tabs";
    }
    if ($sectionChanges > 0) {
        $changes[] = "Sections (" . ($sectionChanges > 1 ? "$sectionChanges changes" : "1 change") . ")";
    }
    
    if (empty($changes)) return "Minor update";
    
    // Limit to first 5 changes to keep summary concise
    $displayChanges = array_slice(array_unique($changes), 0, 5);
    $summary = implode(", ", $displayChanges);
    if (count(array_unique($changes)) > 5) {
        $summary .= " + more";
    }
    
    return $summary;
}

function handleCreateTempVersion($tileId) {
    $user = requireAuth();
    $db = getDB();
    
    // Check edit permission
    if (!canUserEditTile($user['id'], $tileId, $db)) {
        sendJSON(['error' => 'Permission denied'], 403);
    }
    
    // Delete any existing temp version for this tile
    $stmt = $db->prepare('DELETE FROM tile_versions WHERE tile_id = ? AND is_temp = 1');
    $stmt->execute([$tileId]);
    
    // Create new temp version
    $versionId = saveVersion($tileId, $db, $user['id'], 'Editing in progress...', true);
    
    if ($versionId) {
        sendJSON(['success' => true, 'versionId' => $versionId]);
    } else {
        sendJSON(['error' => 'Failed to create temp version'], 500);
    }
}

function handleDeleteAllVersions($tileId) {
    $user = requireAuth();
    $db = getDB();
    
    // Check edit permission
    if (!canUserEditTile($user['id'], $tileId, $db)) {
        sendJSON(['error' => 'Permission denied'], 403);
    }
    
    // Delete all unlocked, non-temp versions
    $stmt = $db->prepare('DELETE FROM tile_versions WHERE tile_id = ? AND is_locked = 0 AND is_temp = 0');
    $stmt->execute([$tileId]);
    $deleted = $stmt->rowCount();
    
    sendJSON(['success' => true, 'deleted' => $deleted]);
}

function handleDeleteEmptyVersions($tileId) {
    $user = requireAuth();
    $db = getDB();
    
    // Check edit permission
    if (!canUserEditTile($user['id'], $tileId, $db)) {
        sendJSON(['error' => 'Permission denied'], 403);
    }
    
    $deleted = deleteEmptyDiffVersions($tileId, $db);
    
    sendJSON(['success' => true, 'deleted' => $deleted]);
}

function handleCleanupEmptyVersions($tileId) {
    try {
        $user = requireAuth();
        $db = getDB();
        
        // Check view permission (cleanup can run on view)
        if (!canUserViewTile($user['id'], $tileId, $db)) {
            sendJSON(['error' => 'Permission denied'], 403);
            return;
        }
        
        $deleted = deleteEmptyDiffVersions($tileId, $db);
        
        sendJSON(['success' => true, 'deleted' => $deleted]);
    } catch (Exception $e) {
        error_log("Cleanup empty versions error: " . $e->getMessage());
        sendJSON(['error' => 'Cleanup failed: ' . $e->getMessage()], 500);
    }
}

function deleteEmptyDiffVersions($tileId, $db) {
    try {
        // Get all versions for this tile (excluding temp and locked)
        $stmt = $db->prepare('SELECT id, version_number, tile_data FROM tile_versions WHERE tile_id = ? AND is_temp = 0 AND is_locked = 0 ORDER BY version_number DESC');
        $stmt->execute([$tileId]);
        $versions = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        if (count($versions) < 2) {
            return 0; // Need at least 2 versions to compare
        }
        
        $deleted = 0;
        $versionsToDelete = [];
        
        // Compare each version with the next one (going from newest to oldest)
        // Keep the older version, delete the newer one if they're identical
        for ($i = 0; $i < count($versions) - 1; $i++) {
            $currentVersion = $versions[$i];
            $previousVersion = $versions[$i + 1];
            
            // Skip if tile_data is null or empty
            if (empty($currentVersion['tile_data']) || empty($previousVersion['tile_data'])) {
                continue;
            }
            
            $currentData = json_decode($currentVersion['tile_data'], true);
            $previousData = json_decode($previousVersion['tile_data'], true);
            
            // Skip if JSON decode failed
            if ($currentData === null || $previousData === null) {
                continue;
            }
            
            // Check if they are equal (no diff)
            try {
                if (areTilesEqual($currentData, $previousData)) {
                    // This version has no changes from the previous one - mark for deletion
                    // Delete the newer version (current), keep the older one (previous)
                    $versionsToDelete[] = $currentVersion['id'];
                }
            } catch (Exception $e) {
                // Skip comparison if areTilesEqual throws an error
                error_log("Error comparing versions: " . $e->getMessage());
                continue;
            }
        }
        
        // Delete the empty diff versions
        if (!empty($versionsToDelete)) {
            $placeholders = implode(',', array_fill(0, count($versionsToDelete), '?'));
            $delStmt = $db->prepare("DELETE FROM tile_versions WHERE id IN ($placeholders)");
            $delStmt->execute($versionsToDelete);
            $deleted = $delStmt->rowCount();
        }
        
        return $deleted;
    } catch (Exception $e) {
        error_log("deleteEmptyDiffVersions error: " . $e->getMessage());
        return 0; // Return 0 on error to prevent breaking the request
    }
}

function deleteDuplicateVersions($tileId, $db) {
    // Get all versions for this tile (excluding temp and locked)
    $stmt = $db->prepare('SELECT id, version_number, tile_data FROM tile_versions WHERE tile_id = ? AND is_temp = 0 AND is_locked = 0 ORDER BY version_number ASC');
    $stmt->execute([$tileId]);
    $versions = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (count($versions) < 2) {
        return 0; // Need at least 2 versions to compare
    }
    
    $deleted = 0;
    $versionsToDelete = [];
    $seenDataHashes = [];
    
    // Compare each version with all previous versions to find duplicates
    // Keep the first occurrence, mark subsequent duplicates for deletion
    foreach ($versions as $version) {
        $versionData = json_decode($version['tile_data'], true);
        
        if (!$versionData) {
            // Invalid data, mark for deletion
            $versionsToDelete[] = $version['id'];
            continue;
        }
        
        // Normalize and hash the data for comparison
        $normalized = normalizeForComparison($versionData);
        $dataHash = md5(serialize($normalized));
        
        if (isset($seenDataHashes[$dataHash])) {
            // This is a duplicate - mark for deletion
            $versionsToDelete[] = $version['id'];
        } else {
            // First occurrence - keep it
            $seenDataHashes[$dataHash] = true;
        }
    }
    
    // Delete the duplicate versions
    if (!empty($versionsToDelete)) {
        $placeholders = implode(',', array_fill(0, count($versionsToDelete), '?'));
        $delStmt = $db->prepare("DELETE FROM tile_versions WHERE id IN ($placeholders)");
        $delStmt->execute($versionsToDelete);
        $deleted = $delStmt->rowCount();
    }
    
    return $deleted;
}

function handleDeleteDuplicateVersions($tileId) {
    $user = requireAuth();
    $db = getDB();
    
    // Check edit permission
    if (!canUserEditTile($user['id'], $tileId, $db)) {
        sendJSON(['error' => 'Permission denied'], 403);
    }
    
    $deleted = deleteDuplicateVersions($tileId, $db);
    
    sendJSON(['success' => true, 'deleted' => $deleted]);
}

function handleCompareVersions($tileId) {
    $user = requireAuth();
    $db = getDB();
    
    // Check view permission
    if (!canUserViewTile($user['id'], $tileId, $db)) {
        sendJSON(['error' => 'Permission denied'], 403);
    }
    
    $data = getJSONInput();
    $versionId1 = $data['versionId1'] ?? null;
    $versionId2 = $data['versionId2'] ?? null;
    
    if (!$versionId1 || !$versionId2) {
        sendJSON(['error' => 'Both version IDs are required'], 400);
    }
    
    // Get both versions
    $stmt = $db->prepare('SELECT id, tile_data, created_at, version_number, changelog_summary FROM tile_versions WHERE id IN (?, ?) AND tile_id = ? AND is_temp = 0');
    $stmt->execute([$versionId1, $versionId2, $tileId]);
    $versions = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (count($versions) !== 2) {
        sendJSON(['error' => 'One or both versions not found'], 404);
    }
    
    $version1 = null;
    $version2 = null;
    foreach ($versions as $v) {
        if ($v['id'] == $versionId1) {
            $version1 = $v;
        } elseif ($v['id'] == $versionId2) {
            $version2 = $v;
        }
    }
    
    if (!$version1 || !$version2) {
        sendJSON(['error' => 'Version mismatch'], 400);
    }
    
    $data1 = json_decode($version1['tile_data'], true);
    $data2 = json_decode($version2['tile_data'], true);
    
    if (!$data1 || !$data2) {
        sendJSON(['error' => 'Corrupt version data'], 500);
    }
    
    sendJSON([
        'version1' => [
            'id' => $version1['id'],
            'version_number' => $version1['version_number'],
            'created_at' => $version1['created_at'],
            'changelog_summary' => $version1['changelog_summary'],
            'data' => $data1
        ],
        'version2' => [
            'id' => $version2['id'],
            'version_number' => $version2['version_number'],
            'created_at' => $version2['created_at'],
            'changelog_summary' => $version2['changelog_summary'],
            'data' => $data2
        ]
    ]);
}

function handleUpdateVersionTags($tileId, $versionId) {
    $user = requireAuth();
    $db = getDB();
    
    // Check edit permission
    if (!canUserEditTile($user['id'], $tileId, $db)) {
        sendJSON(['error' => 'Permission denied'], 403);
    }
    
    $data = getJSONInput();
    $tags = $data['tags'] ?? null;
    
    // Validate tags is an array
    if ($tags !== null && !is_array($tags)) {
        sendJSON(['error' => 'Tags must be an array'], 400);
    }
    
    // Verify version exists and belongs to tile
    $stmt = $db->prepare('SELECT id FROM tile_versions WHERE id = ? AND tile_id = ? AND is_temp = 0');
    $stmt->execute([$versionId, $tileId]);
    if (!$stmt->fetch()) {
        sendJSON(['error' => 'Version not found'], 404);
    }
    
    // Update tags (store as JSON)
    $tagsJson = $tags ? json_encode($tags, JSON_UNESCAPED_UNICODE) : null;
    $updateStmt = $db->prepare('UPDATE tile_versions SET tags = ? WHERE id = ? AND tile_id = ?');
    $updateStmt->execute([$tagsJson, $versionId, $tileId]);
    
    sendJSON(['success' => true, 'tags' => $tags]);
}

function handleUpdateVersionComments($tileId, $versionId) {
    $user = requireAuth();
    $db = getDB();
    
    // Check edit permission
    if (!canUserEditTile($user['id'], $tileId, $db)) {
        sendJSON(['error' => 'Permission denied'], 403);
    }
    
    $data = getJSONInput();
    $comments = $data['comments'] ?? null;
    
    // Validate comments is a string
    if ($comments !== null && !is_string($comments)) {
        sendJSON(['error' => 'Comments must be a string'], 400);
    }
    
    // Verify version exists and belongs to tile
    $stmt = $db->prepare('SELECT id FROM tile_versions WHERE id = ? AND tile_id = ? AND is_temp = 0');
    $stmt->execute([$versionId, $tileId]);
    if (!$stmt->fetch()) {
        sendJSON(['error' => 'Version not found'], 404);
    }
    
    // Update comments
    $updateStmt = $db->prepare('UPDATE tile_versions SET comments = ? WHERE id = ? AND tile_id = ?');
    $updateStmt->execute([$comments ?: null, $versionId, $tileId]);
    
    sendJSON(['success' => true, 'comments' => $comments]);
}

function handleGetTileInfo($tileId) {
    $user = getAuthenticatedUser();
    $db = getDB();
    
    // Get tile with owner info (include source_tab for "which tab" display: public, staging, or private)
    $stmt = $db->prepare('
        SELECT 
            t.id,
            t.title,
            t.user_id,
            t.created_at,
            t.archived_at,
            t.deleted_at,
            t.visibility,
            t.source_tab,
            t.allowed_users,
            t.allowed_groups,
            t.published,
            u.username as owner_username,
            u.email as owner_email,
            u.uuid as owner_uuid,
            (SELECT MAX(created_at) FROM tile_versions WHERE tile_id = t.id AND is_temp = 0) as last_version_updated
        FROM tiles t
        LEFT JOIN users u ON t.user_id = u.id
        WHERE t.id = ?
    ');
    $stmt->execute([$tileId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$row) {
        sendJSON(['error' => 'Tile not found'], 404);
    }

    // Unpublished tiles are admin-only (same as tile list / get)
    if (!canUserSeePublishedContent($user, $row)) {
        sendJSON(['error' => 'Tile not found'], 404);
    }
    
    // Check visibility — must match handleGetTiles so users who can see a tile
    // (groups, roles, shares, ownership) can also open Tile Information.
    $tileVisibility = $row['visibility'] ?? 'public';
    
    $userGroupIds = [];
    if ($user) {
        $groupStmt = $db->prepare('SELECT group_id FROM user_group_members WHERE user_id = ?');
        $groupStmt->execute([$user['id']]);
        while ($group = $groupStmt->fetch()) {
            $userGroupIds[] = (int)$group['group_id'];
        }
    }
    
    $isTileVisible = canUserSeeByVisibility($user, $row, $userGroupIds);

    // Owner can always view their own private tile info
    if (!$isTileVisible && $user && isset($row['user_id']) && (int)$row['user_id'] === (int)$user['id']) {
        $isTileVisible = true;
    }

    // Accepted share invitations (same as tile list / get)
    if (!$isTileVisible && $user) {
        $sharedCheck = $db->prepare('SELECT id FROM tile_share_invitations WHERE tile_id = ? AND receiver_user_id = ? AND status = ?');
        $sharedCheck->execute([$tileId, $user['id'], 'accepted']);
        if ($sharedCheck->fetch()) {
            $isTileVisible = true;
        }
    }

    // Role-based tile access (e.g. Your Apps / role_tile_permissions)
    if (!$isTileVisible && $user && !empty($user['id']) && empty($user['is_admin'])) {
        if (canUserViewTileByRole($user['id'], $tileId, $db)) {
            $isTileVisible = true;
        }
    }
    
    if (!$isTileVisible) {
        sendJSON(['error' => 'Tile not found'], 404);
    }
    
    // Check granular permission for viewing tile info.
    // Allow: public tiles, creator, admin, or anyone who can see the tile (e.g. allowed_users/groups/roles).
    // Deny only when user is a tile admin and can_view_tile_info is explicitly false.
    if ($user && !$user['is_admin'] && $tileVisibility !== 'public') {
        $isCreator = isset($row['user_id']) && (int)$row['user_id'] === (int)$user['id'];
        if (!$isCreator) {
            $canViewInfo = canTileAdminPerformAction($user['id'], $tileId, 'view_tile_info', $db);
            // null = not a tile admin (e.g. shared via allowed_users) → allow if they can see the tile ($isTileVisible)
            if ($canViewInfo === false) {
                sendJSON(['error' => 'You do not have permission to view tile information'], 403);
            }
        }
    }
    
    // Get user permissions
    $canView = true;
    $canEdit = false;
    $canDelete = false;
    $granularPermissions = null;
    
    if ($user) {
        if ($user['is_admin']) {
            $canView = true;
            $canEdit = true;
            $canDelete = true;
        } else {
            $isCreator = isset($row['user_id']) && (int)$row['user_id'] === (int)$user['id'];
            if ($isCreator) {
                $canView = true;
                $canEdit = true;
                $canDelete = true;
            } else {
                $permStmt = $db->prepare('SELECT can_view, can_edit, can_delete, can_add_links, can_add_sections, can_add_tabs, can_edit_links, can_delete_links, can_delete_sections, can_delete_tabs, can_change_visibility, can_change_browser, can_clone_tile, can_view_tile_info, can_edit_tile FROM user_tile_permissions WHERE user_id = ? AND tile_id = ?');
                $permStmt->execute([$user['id'], $tileId]);
                $permission = $permStmt->fetch();
                if ($permission) {
                    $canView = (bool)$permission['can_view'];
                    $canEdit = (bool)$permission['can_edit'];
                    $canDelete = (bool)$permission['can_delete'];
                    
                    // Get granular permissions if user is a tile admin
                    if ($canEdit) {
                        $granularPerms = getTileAdminPermissions($user['id'], $tileId, $db);
                        if ($granularPerms) {
                            $granularPermissions = $granularPerms;
                        } else if (isset($permission['can_add_links'])) {
                            // Fallback to permission data if granular columns exist
                            $granularPermissions = [
                                'canAddLinks' => (bool)($permission['can_add_links'] ?? true),
                                'canAddSections' => (bool)($permission['can_add_sections'] ?? true),
                                'canAddTabs' => (bool)($permission['can_add_tabs'] ?? true),
                                'canEditLinks' => (bool)($permission['can_edit_links'] ?? true),
                                'canDeleteLinks' => (bool)($permission['can_delete_links'] ?? false),
                                'canDeleteSections' => (bool)($permission['can_delete_sections'] ?? false),
                                'canDeleteTabs' => (bool)($permission['can_delete_tabs'] ?? false),
                                'canChangeVisibility' => (bool)($permission['can_change_visibility'] ?? false),
                                'canChangeBrowser' => (bool)($permission['can_change_browser'] ?? false),
                                'canCloneTile' => (bool)($permission['can_clone_tile'] ?? false),
                                'canViewTileInfo' => (bool)($permission['can_view_tile_info'] ?? true),
                                'canEditTile' => (bool)($permission['can_edit_tile'] ?? true)
                            ];
                        }
                    }
                }
            }
        }
    }
    
    // Get all tile admins for this tile
    $tileAdmins = [];
    $adminsStmt = $db->prepare('
        SELECT 
            utp.user_id,
            utp.can_view,
            utp.can_edit,
            utp.can_delete,
            utp.can_add_links,
            utp.can_add_sections,
            utp.can_add_tabs,
            utp.can_edit_links,
            utp.can_delete_links,
            utp.can_delete_sections,
            utp.can_delete_tabs,
            utp.can_change_visibility,
            utp.can_change_browser,
            utp.can_clone_tile,
            utp.can_view_tile_info,
            utp.can_edit_tile,
            u.username,
            u.email
        FROM user_tile_permissions utp
        INNER JOIN users u ON utp.user_id = u.id
        WHERE utp.tile_id = ? AND utp.can_edit = 1
        ORDER BY u.username
    ');
    $adminsStmt->execute([$tileId]);
    while ($admin = $adminsStmt->fetch()) {
        $tileAdmins[] = [
            'userId' => (int)$admin['user_id'],
            'username' => $admin['username'],
            'email' => $admin['email'],
            'permissions' => [
                'canView' => (bool)$admin['can_view'],
                'canEdit' => (bool)$admin['can_edit'],
                'canDelete' => (bool)$admin['can_delete'],
                'canAddLinks' => isset($admin['can_add_links']) ? (bool)$admin['can_add_links'] : true,
                'canAddSections' => isset($admin['can_add_sections']) ? (bool)$admin['can_add_sections'] : true,
                'canAddTabs' => isset($admin['can_add_tabs']) ? (bool)$admin['can_add_tabs'] : true,
                'canEditLinks' => isset($admin['can_edit_links']) ? (bool)$admin['can_edit_links'] : true,
                'canDeleteLinks' => isset($admin['can_delete_links']) ? (bool)$admin['can_delete_links'] : false,
                'canDeleteSections' => isset($admin['can_delete_sections']) ? (bool)$admin['can_delete_sections'] : false,
                'canDeleteTabs' => isset($admin['can_delete_tabs']) ? (bool)$admin['can_delete_tabs'] : false,
                'canChangeVisibility' => isset($admin['can_change_visibility']) ? (bool)$admin['can_change_visibility'] : false,
                'canChangeBrowser' => isset($admin['can_change_browser']) ? (bool)$admin['can_change_browser'] : false,
                'canCloneTile' => isset($admin['can_clone_tile']) ? (bool)$admin['can_clone_tile'] : false,
                'canViewTileInfo' => isset($admin['can_view_tile_info']) ? (bool)$admin['can_view_tile_info'] : true,
                'canEditTile' => isset($admin['can_edit_tile']) ? (bool)$admin['can_edit_tile'] : true
            ]
        ];
    }
    
    // Get latest version update time if available (use created_at from latest version)
    $lastModified = $row['last_version_updated'] ? (int)$row['last_version_updated'] : (int)$row['created_at'];
    
    // If no versions exist, use tile created_at as last modified
    if (!$row['last_version_updated']) {
        // Check if there are any versions
        $versionCheckStmt = $db->prepare('SELECT MAX(created_at) as last_version FROM tile_versions WHERE tile_id = ? AND is_temp = 0');
        $versionCheckStmt->execute([$tileId]);
        $versionRow = $versionCheckStmt->fetch();
        if ($versionRow && $versionRow['last_version']) {
            $lastModified = (int)$versionRow['last_version'];
        }
    }
    
    // Which tab this tile comes from: Public tab, Staging tab, or Private tab
    $sourceTabRaw = isset($row['source_tab']) ? trim((string)$row['source_tab']) : '';
    $sourceTabLabel = 'Public tab';
    if ($sourceTabRaw === 'staging') {
        $sourceTabLabel = 'Staging tab';
    } elseif ($tileVisibility === 'private') {
        $sourceTabLabel = 'Private tab';
    }

    $response = [
        'tileId' => $row['id'],
        'title' => $row['title'],
        'owner' => [
            'userId' => $row['user_id'] ? (int)$row['user_id'] : null,
            'userUuid' => !empty($row['owner_uuid']) ? $row['owner_uuid'] : null,
            'username' => $row['owner_username'],
            'email' => $row['owner_email']
        ],
        'createdAt' => (int)$row['created_at'],
        'lastModified' => $lastModified,
        'archivedAt' => $row['archived_at'] ? (int)$row['archived_at'] : null,
        'deletedAt' => $row['deleted_at'] ? (int)$row['deleted_at'] : null,
        'visibility' => $tileVisibility,
        'sourceTab' => $sourceTabLabel,
        'permissions' => [
            'canView' => $canView,
            'canEdit' => $canEdit,
            'canDelete' => $canDelete
        ],
        'tileAdmins' => $tileAdmins,
        'stats' => getTileVisitStats($tileId, $db)
    ];
    
    // Add granular permissions for current user if they are a tile admin
    if ($granularPermissions) {
        $response['granularPermissions'] = $granularPermissions;
    }
    if ($granularPermissions) {
        $response['granularPermissions'] = $granularPermissions;
    }
    
    sendJSON($response);
}

/**
 * Get visit stats for a tile: total hits and unique visitors.
 */
function getTileVisitStats($tileId, $db = null) {
    if ($db === null) {
        $db = getDB();
    }

    try {
        $stmt = $db->prepare('
            SELECT
                COUNT(*) as hit_count,
                COUNT(DISTINCT visitor_key) as unique_visitors
            FROM tile_visits
            WHERE tile_id = ?
        ');
        $stmt->execute([$tileId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return [
            'hitCount' => (int)($row['hit_count'] ?? 0),
            'uniqueVisitors' => (int)($row['unique_visitors'] ?? 0)
        ];
    } catch (PDOException $e) {
        // Table may not exist yet on older DBs mid-migration
        return [
            'hitCount' => 0,
            'uniqueVisitors' => 0
        ];
    }
}

/**
 * Record a tile visit (hit). Unique visitors are derived from visitor_key.
 * Accepts optional visitorKey in JSON body for guests; authenticated users use u:{id}.
 */
function handleRecordTileVisit($tileId) {
    $user = getAuthenticatedUser();
    $db = getDB();

    $stmt = $db->prepare('SELECT id, visibility, allowed_users, allowed_groups, source_tab, deleted_at FROM tiles WHERE id = ?');
    $stmt->execute([$tileId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row || !empty($row['deleted_at'])) {
        sendJSON(['error' => 'Tile not found'], 404);
    }

    $rowSourceTab = isset($row['source_tab']) ? trim((string)$row['source_tab']) : 'public';
    if ($rowSourceTab === 'staging' && (!$user || empty($user['is_admin']))) {
        sendJSON(['error' => 'Tile not found'], 404);
    }

    $tileVisibility = $row['visibility'] ?? 'public';
    $tileAllowedUsers = $row['allowed_users'] ? json_decode($row['allowed_users'], true) : [];
    $tileAllowedGroups = $row['allowed_groups'] ? json_decode($row['allowed_groups'], true) : [];
    if (!is_array($tileAllowedUsers)) {
        $tileAllowedUsers = [];
    }
    if (!is_array($tileAllowedGroups)) {
        $tileAllowedGroups = [];
    }

    $userGroupIds = [];
    if ($user) {
        $groupStmt = $db->prepare('SELECT group_id FROM user_group_members WHERE user_id = ?');
        $groupStmt->execute([$user['id']]);
        while ($group = $groupStmt->fetch()) {
            $userGroupIds[] = (int)$group['group_id'];
        }
    }

    $isTileVisible = false;
    if ($user && !empty($user['is_admin'])) {
        $isTileVisible = true;
    } elseif ($tileVisibility === 'public') {
        $isTileVisible = true;
    } elseif ($tileVisibility === 'authenticated' && $user) {
        $isTileVisible = true;
    } elseif ($tileVisibility === 'private' && $user) {
        $isTileVisible = in_array($user['id'], $tileAllowedUsers, true);
        if (!$isTileVisible && !empty($tileAllowedGroups) && !empty($userGroupIds)) {
            $isTileVisible = !empty(array_intersect($userGroupIds, $tileAllowedGroups));
        }
        if (!$isTileVisible) {
            $sharedCheck = $db->prepare('SELECT id FROM tile_share_invitations WHERE tile_id = ? AND receiver_user_id = ? AND status = ?');
            $sharedCheck->execute([$tileId, $user['id'], 'accepted']);
            if ($sharedCheck->fetch()) {
                $isTileVisible = true;
            }
        }
    }

    if (!$isTileVisible) {
        sendJSON(['error' => 'Tile not found'], 404);
    }

    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        $input = [];
    }

    $userId = $user ? (int)$user['id'] : null;
    if ($userId) {
        $visitorKey = 'u:' . $userId;
    } else {
        $clientKey = isset($input['visitorKey']) ? trim((string)$input['visitorKey']) : '';
        if ($clientKey === '' || !preg_match('/^[a-zA-Z0-9_-]{8,64}$/', $clientKey)) {
            if (session_status() === PHP_SESSION_NONE) {
                @session_start();
            }
            if (empty($_SESSION['guest_visitor_key'])) {
                $_SESSION['guest_visitor_key'] = bin2hex(random_bytes(16));
            }
            $visitorKey = 'g:' . $_SESSION['guest_visitor_key'];
        } else {
            $visitorKey = 'g:' . $clientKey;
        }
    }

    $now = time();

    // Coalesce rapid duplicate hits (e.g. React Strict Mode double-mount) within 10 seconds
    try {
        $recentStmt = $db->prepare('
            SELECT id FROM tile_visits
            WHERE tile_id = ? AND visitor_key = ? AND visited_at >= ?
            LIMIT 1
        ');
        $recentStmt->execute([$tileId, $visitorKey, $now - 10]);
        $recent = $recentStmt->fetch();

        if (!$recent) {
            $insert = $db->prepare('
                INSERT INTO tile_visits (tile_id, user_id, visitor_key, visited_at)
                VALUES (?, ?, ?, ?)
            ');
            $insert->execute([$tileId, $userId, $visitorKey, $now]);
        }

        $stats = getTileVisitStats($tileId, $db);
        sendJSON([
            'success' => true,
            'recorded' => !$recent,
            'stats' => $stats
        ]);
    } catch (PDOException $e) {
        error_log('Failed to record tile visit: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to record visit'], 500);
    }
}
