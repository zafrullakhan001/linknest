<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/access_restrictions_lib.php';
require_once __DIR__ . '/short_urls_lib.php';
require_once __DIR__ . '/upload_video_lib.php';
require_once __DIR__ . '/user_audit_helper.php';
require_once __DIR__ . '/tile_messages_lib.php';
require_once __DIR__ . '/space_sync_lib.php';

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
        } elseif (preg_match('#^/([^/]+)/visitors$#', $path, $matches)) {
            handleGetTileUniqueVisitors($matches[1]);
        } elseif (preg_match('#^/([^/]+)/visit$#', $path, $matches)) {
            handleGetTileVisitStats($matches[1]);
        } elseif (preg_match('#^/([^/]+)/presence$#', $path, $matches)) {
            handleGetTilePresence($matches[1]);
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
        } elseif ($path === '/clone-category' || $path === '/clone-category/') {
            handleCloneCategory('');
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
        } elseif ($path === '/resolve-favorite-links' || $path === '/resolve-favorite-links/') {
            handleResolveFavoriteLinks();
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
        } elseif (preg_match('#^/([^/]+)/presence$#', $path, $matches)) {
            handlePostTilePresence($matches[1]);
        } elseif (preg_match('#^/([^/]+)/sync-from-source$#', $path, $matches)) {
            handleSyncSpaceFromSource($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'PUT':
        if ($path === '/favorites/links/order' || $path === '/favorites/links/order/') {
            handleSaveFavoriteLinksOrder();
        } elseif (preg_match('#^/([^/]+)/sync-source$#', $path, $matches)) {
            handleSaveSpaceSyncSource($matches[1]);
        } elseif (preg_match('#^/([^/]+)$#', $path, $matches)) {
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
        } elseif (preg_match('#^/([^/]+)/presence$#', $path, $matches)) {
            handleDeleteTilePresence($matches[1]);
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
    // Lightweight home-grid payload: card fields only (no tabs/sections/links/html).
    // Messages are still included — small payload needed for tile banners + Message Board edits.
    $summaryRaw = isset($_GET['summary']) ? strtolower(trim((string)$_GET['summary'])) : '';
    $summaryMode = in_array($summaryRaw, ['1', 'true', 'yes'], true);

    // Source tab filter: public (default) or staging (admin only)
    $sourceTab = isset($_GET['source_tab']) ? trim((string)$_GET['source_tab']) : (isset($_GET['sourceTab']) ? trim((string)$_GET['sourceTab']) : 'public');
    if ($sourceTab !== 'public' && $sourceTab !== 'staging') {
        $sourceTab = 'public';
    }

    if (session_status() === PHP_SESSION_NONE) {
        @session_start();
    }
    $user = getAuthenticatedUser();

    require_once __DIR__ . '/fingerprint_lock_lib.php';
    require_fingerprint_lock_access($user);

    // SPA/k6 home batch shares one session cookie — release lock before SQLite work
    // so /auth/me, /settings, and /tiles can run in parallel for the same user.
    linknestReleaseSessionLock();

    // Ultra-fast path: guest public summary can be served from file cache without opening SQLite
    // (fingerprint lock is already enforced above so allowlisted guests still receive public spaces)
    if ($summaryMode && $sourceTab === 'public' && empty($_SESSION['user_id'])) {
        $cached = responseCacheGet('tiles_summary_guest_public');
        if (is_array($cached)) {
            responseCacheHitHeader(true);
            sendJSON($cached);
            return;
        }
    }

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
        ? 'id, user_id, title, description, emoji, theme_color, "group", position, created_at, visibility, allowed_users, allowed_groups, source_tab, deleted_at, archived_at, is_hyperlink, hyperlink_url, open_in_new_tab, is_video, video_url, video_source, browser, visible_from, expires_at, tile_background_color, tile_gradient_enabled, tile_gradient_colors, tile_gradient_color_positions, tile_gradient_direction, tile_gradient_type, tile_border_radius, tile_text_color, page_animation, links_animation, header_image, header_image_align, header_image_opacity, header_image_offset_x, header_image_offset_y, header_image_zoom, header_image_fit, show_emoji, emoji_image, emoji_image_opacity, emoji_image_offset_x, emoji_image_offset_y, emoji_image_zoom, show_title, show_description, show_short_urls, search_tags, published, access_restrictions'
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
    // tile_id => number of recipients a space is shared with (pending + accepted), for the card badge
    $tileShareCounts = [];
    
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

        // Batch fetch how many users each space is shared with (pending + accepted invitations).
        // Used by the home grid card badge so a shared space is recognisable at a glance
        // (see docs/PRIVATE_SPACE_SHARING.md). Only surfaced to the owner / admins.
        $shareCountStmt = $db->query("SELECT tile_id, COUNT(DISTINCT receiver_user_id) AS recipient_count FROM tile_share_invitations WHERE status IN ('pending', 'accepted') GROUP BY tile_id");
        while ($shareRow = $shareCountStmt->fetch(PDO::FETCH_ASSOC)) {
            $tileShareCounts[$shareRow['tile_id']] = (int)$shareRow['recipient_count'];
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
                
                if ($isCreator && isset($tilePermissions[$row['id']])) {
                    // Owner with explicit admin-set permissions — respect them
                    $permission = $tilePermissions[$row['id']];
                    $canView = (bool)$permission['can_view'];
                    $canEdit = (bool)$permission['can_edit'];
                    $canDelete = (bool)$permission['can_delete'];
                    if ($canEdit) {
                        $granularPerms = getTileAdminPermissions($user['id'], $row['id'], $db);
                        if ($granularPerms) {
                            $granularPermissions = $granularPerms;
                        } elseif (isset($permission['can_add_links'])) {
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
                } elseif ($isCreator) {
                    // Creators without an explicit permission row have full access
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
            'searchTags' => decodeSearchTagsFromRow($row),
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
            'isVideo' => isset($row['is_video']) ? (bool)$row['is_video'] : false,
            'videoUrl' => $row['video_url'] ?? null,
            'videoSource' => (isset($row['video_source']) && in_array($row['video_source'], ['youtube', 'file'], true)) ? $row['video_source'] : null,
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
            'accessRestrictions' => decodeAccessRestrictionsJson($row['access_restrictions'] ?? null),
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
            'headerImageZoom' => isset($row['header_image_zoom']) && $row['header_image_zoom'] !== null && $row['header_image_zoom'] !== '' ? max(50, min(300, (int)$row['header_image_zoom'])) : null,
            'headerImageFit' => (isset($row['header_image_fit']) && in_array($row['header_image_fit'], ['contain','cover'], true)) ? $row['header_image_fit'] : null,
            'showEmoji' => !(isset($row['show_emoji']) && ((int)$row['show_emoji'] === 0 || $row['show_emoji'] === '0' || $row['show_emoji'] === false)),
            'emojiImage' => !empty($row['emoji_image']) ? $row['emoji_image'] : null,
            'emojiImageOpacity' => !empty($row['emoji_image']) && isset($row['emoji_image_opacity']) && $row['emoji_image_opacity'] !== null && $row['emoji_image_opacity'] !== '' ? max(0, min(100, (int)$row['emoji_image_opacity'])) : null,
            'emojiImageOffsetX' => !empty($row['emoji_image']) && isset($row['emoji_image_offset_x']) && $row['emoji_image_offset_x'] !== null && $row['emoji_image_offset_x'] !== '' ? max(-50, min(50, (int)$row['emoji_image_offset_x'])) : null,
            'emojiImageOffsetY' => !empty($row['emoji_image']) && isset($row['emoji_image_offset_y']) && $row['emoji_image_offset_y'] !== null && $row['emoji_image_offset_y'] !== '' ? max(-50, min(50, (int)$row['emoji_image_offset_y'])) : null,
            'emojiImageZoom' => !empty($row['emoji_image']) && isset($row['emoji_image_zoom']) && $row['emoji_image_zoom'] !== null && $row['emoji_image_zoom'] !== '' ? max(50, min(300, (int)$row['emoji_image_zoom'])) : null,
            'showTitle' => !(isset($row['show_title']) && ((int)$row['show_title'] === 0 || $row['show_title'] === '0' || $row['show_title'] === false)),
            'showDescription' => !(isset($row['show_description']) && ((int)$row['show_description'] === 0 || $row['show_description'] === '0' || $row['show_description'] === false)),
            'showShortUrls' => mapShowShortUrlsFromRow($row),
            'tabs' => [],
            // Recipients this space is shared with (pending + accepted) — owner/admin view only
            'shareCount' => ($user && ((int)($row['user_id'] ?? 0) === (int)$user['id'] || !empty($user['is_admin'])))
                ? ($tileShareCounts[$row['id']] ?? 0)
                : 0,
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
    // Messages + lightweight searchLinks are included for banners and home-grid search.
    if ($summaryMode) {
        // Link role access (needed so role-granted private links appear in search)
        $linkRoleAccess = [];
        if ($user && !empty($userRoleIds) && empty($user['is_admin'])) {
            $rolePlaceholders = implode(',', array_fill(0, count($userRoleIds), '?'));
            $linkRoleStmt = $db->prepare("SELECT DISTINCT link_id FROM role_link_permissions WHERE role_id IN ($rolePlaceholders) AND can_view = 1");
            $linkRoleStmt->execute($userRoleIds);
            while ($linkRole = $linkRoleStmt->fetch(PDO::FETCH_ASSOC)) {
                $linkRoleAccess[$linkRole['link_id']] = true;
            }
        }

        // Lightweight searchable links (label/url/etc.) without full nested tabs/sections graph
        $searchLinksByTile = [];
        $linkCounts = [];
        if (!empty($visibleTileIds)) {
            $placeholders = implode(',', array_fill(0, count($visibleTileIds), '?'));
            $searchLinkStmt = $db->prepare(
                "SELECT s.tile_id,
                        s.visibility AS section_visibility,
                        s.allowed_users AS section_allowed_users,
                        s.allowed_groups AS section_allowed_groups,
                        s.published AS section_published,
                        t.visibility AS tab_visibility,
                        t.allowed_users AS tab_allowed_users,
                        t.allowed_groups AS tab_allowed_groups,
                        t.published AS tab_published,
                        t.id AS tab_id,
                        l.id, l.label, l.url, l.icon, l.browser, l.notes, l.tooltip,
                        l.rich_text_content, l.visibility, l.allowed_users, l.allowed_groups,
                        l.published, l.health_status, l.health_http_code, l.health_error, l.health_checked_at,
                        l.maintenance_enabled, l.maintenance_message, l.maintenance_video_url, l.notes_video_url, l.info_video_url, l.notes_enabled, l.rich_text_enabled, l.info_show_open_link, l.tooltip_style
                 FROM sections s
                 INNER JOIN links l ON l.section_id = s.id
                 LEFT JOIN tabs t ON t.id = s.tab_id
                 WHERE s.tile_id IN ($placeholders)
                 ORDER BY s.tile_id, l.position ASC, l.id ASC"
            );
            $searchLinkStmt->execute($visibleTileIds);
            while ($linkRow = $searchLinkStmt->fetch(PDO::FETCH_ASSOC)) {
                $tileId = $linkRow['tile_id'];
                $isAcceptedShareRecipient = isset($acceptedSharedTiles[$tileId]);

                // Parent tab visibility (when section belongs to a tab)
                if (!empty($linkRow['tab_id'])) {
                    $tabRow = [
                        'visibility' => $linkRow['tab_visibility'] ?? 'public',
                        'allowed_users' => $linkRow['tab_allowed_users'],
                        'allowed_groups' => $linkRow['tab_allowed_groups'],
                        'published' => $linkRow['tab_published'],
                    ];
                    if (!canUserSeePublishedContent($user, $tabRow) || !canUserSeeNestedInTile($db, $tileId, $user, $tabRow, $userGroupIds, $isAcceptedShareRecipient)) {
                        continue;
                    }
                }

                // Parent section visibility
                $sectionRow = [
                    'visibility' => $linkRow['section_visibility'] ?? 'public',
                    'allowed_users' => $linkRow['section_allowed_users'],
                    'allowed_groups' => $linkRow['section_allowed_groups'],
                    'published' => $linkRow['section_published'],
                ];
                if (!canUserSeePublishedContent($user, $sectionRow) || !canUserSeeNestedInTile($db, $tileId, $user, $sectionRow, $userGroupIds, $isAcceptedShareRecipient)) {
                    continue;
                }

                // Link visibility (+ role override)
                if (!canUserSeePublishedContent($user, $linkRow)) {
                    continue;
                }
                $isVisible = canUserSeeNestedInTile($db, $tileId, $user, $linkRow, $userGroupIds, $isAcceptedShareRecipient);
                $linkHasRoleAccess = isset($linkRoleAccess[$linkRow['id']]);
                if ($linkHasRoleAccess && !$isVisible) {
                    $isVisible = true;
                }
                if (!$isVisible) {
                    continue;
                }

                if (!isset($searchLinksByTile[$tileId])) {
                    $searchLinksByTile[$tileId] = [];
                }

                $searchLink = [
                    'id' => $linkRow['id'],
                    'label' => $linkRow['label'],
                    'url' => $linkRow['url'],
                    'icon' => $linkRow['icon'] ?? null,
                    'browser' => $linkRow['browser'] ?? null,
                    'notes' => $linkRow['notes'] ?? null,
                    'tooltip' => $linkRow['tooltip'] ?? null,
                    'richTextContent' => $linkRow['rich_text_content'] ?? null,
                ];
                applyLinkMaintenanceToApi($searchLink, $linkRow);
                applyLinkNotesInfoVideoToApi($searchLink, $linkRow);
                applyLinkFeatureTogglesToApi($searchLink, $linkRow);
                applyLinkOpenTargetToApi($searchLink, $linkRow);
                applyLinkMobilePreviewEmulationToApi($searchLink, $linkRow);
                applyLinkOpenInEmulationToApi($searchLink, $linkRow);
                applyLinkForceShortUrlToApi($searchLink, $linkRow);
                applyLinkBrokenStatusLabelToApi($searchLink, $linkRow);
                if (isset($linkRow['health_status']) && !isNonHttpLinkHealthUrl($linkRow['url'] ?? '')) {
                    $searchLink['health'] = [
                        'status' => $linkRow['health_status'] ?? 'unknown',
                        'httpCode' => $linkRow['health_http_code'] ? (int)$linkRow['health_http_code'] : null,
                        'error' => $linkRow['health_error'],
                        'checkedAt' => $linkRow['health_checked_at'] ? (int)$linkRow['health_checked_at'] : null,
                    ];
                }
                $searchLinksByTile[$tileId][] = $searchLink;
            }

            foreach ($searchLinksByTile as $tileId => $links) {
                $linkCounts[$tileId] = count($links);
            }
        }

        $messagesByTile = [];
        if (!empty($visibleTileIds)) {
            $placeholders = implode(',', array_fill(0, count($visibleTileIds), '?'));
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
                    'tabIds' => tileMessageTabIdsFromRow($msgRow),
                    'showOnCard' => tileMessageShowOnCardFromRow($msgRow),
                    'placement' => tileMessagePlacementFromRow($msgRow),
                    'fontFamily' => tileMessageFontFamilyFromRow($msgRow),
                    'fontSize' => tileMessageFontSizeFromRow($msgRow),
                    'marqueeSeconds' => tileMessageMarqueeSecondsFromRow($msgRow),
                    'animationType' => $msgRow['animation_type'] ?? 'rollover',
                    'delayBefore' => isset($msgRow['delay_before']) ? (float)$msgRow['delay_before'] : 0,
                    'celebrationEffect' => $msgRow['celebration_effect'] ?? 'none',
                    'celebrationConfig' => $cc,
                    'url' => $msgRow['url'] ?? null,
                    'urlLabel' => $msgRow['url_label'] ?? null
                ];
            }
        }

        foreach ($visibleTileIds as $tileId) {
            if (!isset($tilesById[$tileId])) {
                continue;
            }
            $tile = $tilesById[$tileId];
            $tile['linkCount'] = $linkCounts[$tileId] ?? 0;
            $tile['searchLinks'] = $searchLinksByTile[$tileId] ?? [];
            $tile['tabs'] = [];
            $tile['sections'] = [];
            $tile['messages'] = $messagesByTile[$tileId] ?? [];
            $tiles[] = $tile;
        }

        usort($tiles, function($a, $b) {
            return ($a['position'] ?? 0) - ($b['position'] ?? 0);
        });

        if ($hasDuplicatePositions) {
            error_log('Warning: duplicate tile positions detected on GET /tiles?summary=1 (count=' . count($tiles) . '); skipping write-on-read normalization');
        }

        attachShortUrlsToTilesList($db, $tiles, $user['id'] ?? null);

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
                'tabIds' => tileMessageTabIdsFromRow($msgRow),
                'showOnCard' => tileMessageShowOnCardFromRow($msgRow),
                'placement' => tileMessagePlacementFromRow($msgRow),
                'fontFamily' => tileMessageFontFamilyFromRow($msgRow),
                'fontSize' => tileMessageFontSizeFromRow($msgRow),
                'marqueeSeconds' => tileMessageMarqueeSecondsFromRow($msgRow),
                'animationType' => $msgRow['animation_type'] ?? 'rollover',
                'delayBefore' => isset($msgRow['delay_before']) ? (float)$msgRow['delay_before'] : 0,
                'celebrationEffect' => $msgRow['celebration_effect'] ?? 'none',
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
            $isAcceptedShareRecipient = isset($acceptedSharedTiles[$tileId]);
            
            // Process tabs for this tile
            if (isset($tabsByTile[$tileId])) {
                foreach ($tabsByTile[$tileId] as $tabRow) {
                    if (!canUserSeePublishedContent($user, $tabRow)) {
                        continue;
                    }
                    if (!canUserSeeNestedInTile($db, $tileId, $user, $tabRow, $userGroupIds, $isAcceptedShareRecipient)) {
                        continue;
                    }
                    $tab = [
                        'id' => $tabRow['id'],
                        'title' => $tabRow['title'],
                        'emoji' => contentEmojiFromRow($tabRow),
                        'position' => (int)($tabRow['position'] ?? 0),
                        'textColor' => (!empty($tabRow['text_color']) && trim($tabRow['text_color']) !== '') ? trim($tabRow['text_color']) : null,
                        'backgroundColor' => backgroundColorFromRowOrInput($tabRow),
                        'backgroundGradientEnabled' => backgroundDecorationFromRow($tabRow)['backgroundGradientEnabled'],
                        'backgroundGradientColors' => backgroundDecorationFromRow($tabRow)['backgroundGradientColors'],
                        'backgroundGradientDirection' => backgroundDecorationFromRow($tabRow)['backgroundGradientDirection'],
                        'backgroundGradientType' => backgroundDecorationFromRow($tabRow)['backgroundGradientType'],
                        'backgroundGradientColorPositions' => backgroundDecorationFromRow($tabRow)['backgroundGradientColorPositions'],
                        'inheritShortUrls' => mapInheritShortUrlsFromRow($tabRow),
                        'visibleFrom' => $tabRow['visible_from'] ?? null,
                        'expiresAt' => $tabRow['expires_at'] ?? null,
                        'accessRestrictions' => decodeAccessRestrictionsJson($tabRow['access_restrictions'] ?? null),
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
                            if (!canUserSeeNestedInTile($db, $tileId, $user, $sectionRow, $userGroupIds, $isAcceptedShareRecipient)) {
                                continue;
                            }
                            $section = [
                                'id' => $sectionRow['id'],
                                'title' => $sectionRow['title'],
                                'emoji' => contentEmojiFromRow($sectionRow),
                                'textColor' => (!empty($sectionRow['text_color']) && trim($sectionRow['text_color']) !== '') ? trim($sectionRow['text_color']) : null,
                                'backgroundColor' => backgroundColorFromRowOrInput($sectionRow),
                                'backgroundGradientEnabled' => backgroundDecorationFromRow($sectionRow)['backgroundGradientEnabled'],
                                'backgroundGradientColors' => backgroundDecorationFromRow($sectionRow)['backgroundGradientColors'],
                                'backgroundGradientDirection' => backgroundDecorationFromRow($sectionRow)['backgroundGradientDirection'],
                                'backgroundGradientType' => backgroundDecorationFromRow($sectionRow)['backgroundGradientType'],
                                'backgroundGradientColorPositions' => backgroundDecorationFromRow($sectionRow)['backgroundGradientColorPositions'],
                                'visibleFrom' => $sectionRow['visible_from'] ?? null,
                                'expiresAt' => $sectionRow['expires_at'] ?? null,
                                'forceStackedView' => isset($sectionRow['force_stacked_view']) && $sectionRow['force_stacked_view'] == 1 ? true : false,
                                'ignoreSideBySide' => isset($sectionRow['ignore_side_by_side']) && $sectionRow['ignore_side_by_side'] == 1 ? true : false,
                                'showReadAloud' => sectionShowReadAloudFlag($sectionRow),
                                'inheritShortUrls' => mapInheritShortUrlsFromRow($sectionRow),
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

                                    $isVisible = canUserSeeNestedInTile($db, $tileId, $user, $linkRow, $userGroupIds, $isAcceptedShareRecipient);

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
                                        'inheritShortUrls' => mapInheritShortUrlsFromRow($linkRow),
                                        'visibility' => $visibility,
                                        'published' => isContentPublished($linkRow),
                                        'allowedUsers' => $allowedUsers,
                                        'allowedGroups' => $allowedGroups,
                                        'notes' => isset($linkRow['notes']) ? $linkRow['notes'] : null,
                                        'tooltip' => isset($linkRow['tooltip']) ? $linkRow['tooltip'] : null,
                                        'richTextContent' => isset($linkRow['rich_text_content']) ? $linkRow['rich_text_content'] : null,
                                        'visibleFrom' => isset($linkRow['visible_from']) ? $linkRow['visible_from'] : null,
                                        'expiresAt' => isset($linkRow['expires_at']) ? $linkRow['expires_at'] : null,
                                        'accessRestrictions' => decodeAccessRestrictionsJson($linkRow['access_restrictions'] ?? null),
                                        'browser' => isset($linkRow['browser']) ? $linkRow['browser'] : null,
                                        'animation' => isset($linkRow['animation']) ? $linkRow['animation'] : null,
                                        'isFavorite' => (bool)($linkRow['is_favorite'] ?? false),
                                        'hasRoleAccess' => $linkHasRoleAccess,
                                        'position' => (int)($linkRow['position'] ?? 0)
                                    ];
                                    
                                    // Include health data if available
                                    if (isset($linkRow['health_status']) && !isNonHttpLinkHealthUrl($linkRow['url'] ?? '')) {
                                        $link['health'] = [
                                            'status' => $linkRow['health_status'] ?? 'unknown',
                                            'httpCode' => $linkRow['health_http_code'] ? (int)$linkRow['health_http_code'] : null,
                                            'error' => $linkRow['health_error'],
                                            'checkedAt' => $linkRow['health_checked_at'] ? (int)$linkRow['health_checked_at'] : null
                                        ];
                                    }
                                    
                                    applyLinkMaintenanceToApi($link, $linkRow);
                                    applyLinkNotesInfoVideoToApi($link, $linkRow);
                                    applyLinkFeatureTogglesToApi($link, $linkRow);
                applyLinkOpenTargetToApi($link, $linkRow);
                applyLinkMobilePreviewEmulationToApi($link, $linkRow);
                applyLinkOpenInEmulationToApi($link, $linkRow);
                applyLinkForceShortUrlToApi($link, $linkRow);
                applyLinkBrokenStatusLabelToApi($link, $linkRow);
                                    $section['links'][] = $link;
                                }
                            }
                            
                            // Add rich text content
                            $section['richTextContent'] = [];
                            if (isset($richTextBySection[$sectionRow['id']])) {
                                foreach ($richTextBySection[$sectionRow['id']] as $richTextRow) {
                                    if (!canUserSeeNestedInTile($db, $tileId, $user, $richTextRow, $userGroupIds, $isAcceptedShareRecipient)) {
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
                    if (!canUserSeeNestedInTile($db, $tileId, $user, $sectionRow, $userGroupIds, $isAcceptedShareRecipient)) {
                        continue;
                    }
                    $section = [
                        'id' => $sectionRow['id'],
                        'title' => $sectionRow['title'],
                                'emoji' => contentEmojiFromRow($sectionRow),
                        'textColor' => (!empty($sectionRow['text_color']) && trim($sectionRow['text_color']) !== '') ? trim($sectionRow['text_color']) : null,
                        'backgroundColor' => backgroundColorFromRowOrInput($sectionRow),
                        'backgroundGradientEnabled' => backgroundDecorationFromRow($sectionRow)['backgroundGradientEnabled'],
                        'backgroundGradientColors' => backgroundDecorationFromRow($sectionRow)['backgroundGradientColors'],
                        'backgroundGradientDirection' => backgroundDecorationFromRow($sectionRow)['backgroundGradientDirection'],
                        'backgroundGradientType' => backgroundDecorationFromRow($sectionRow)['backgroundGradientType'],
                        'backgroundGradientColorPositions' => backgroundDecorationFromRow($sectionRow)['backgroundGradientColorPositions'],
                        'forceStackedView' => isset($sectionRow['force_stacked_view']) && $sectionRow['force_stacked_view'] == 1 ? true : false,
                                'ignoreSideBySide' => isset($sectionRow['ignore_side_by_side']) && $sectionRow['ignore_side_by_side'] == 1 ? true : false,
                                'showReadAloud' => sectionShowReadAloudFlag($sectionRow),
                                'inheritShortUrls' => mapInheritShortUrlsFromRow($sectionRow),
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

                            $isVisible = canUserSeeNestedInTile($db, $tileId, $user, $linkRow, $userGroupIds, $isAcceptedShareRecipient);

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
                                'inheritShortUrls' => mapInheritShortUrlsFromRow($linkRow),
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
                            
                            if (isset($linkRow['health_status']) && !isNonHttpLinkHealthUrl($linkRow['url'] ?? '')) {
                                $link['health'] = [
                                    'status' => $linkRow['health_status'] ?? 'unknown',
                                    'httpCode' => $linkRow['health_http_code'] ? (int)$linkRow['health_http_code'] : null,
                                    'error' => $linkRow['health_error'],
                                    'checkedAt' => $linkRow['health_checked_at'] ? (int)$linkRow['health_checked_at'] : null
                                ];
                            }
                            
                            applyLinkMaintenanceToApi($link, $linkRow);
                            applyLinkNotesInfoVideoToApi($link, $linkRow);
                            applyLinkFeatureTogglesToApi($link, $linkRow);
                applyLinkOpenTargetToApi($link, $linkRow);
                applyLinkMobilePreviewEmulationToApi($link, $linkRow);
                applyLinkOpenInEmulationToApi($link, $linkRow);
                applyLinkForceShortUrlToApi($link, $linkRow);
                applyLinkBrokenStatusLabelToApi($link, $linkRow);
                            $section['links'][] = $link;
                        }
                    }
                    
                    // Add rich text content
                    $section['richTextContent'] = [];
                    if (isset($richTextBySection[$sectionRow['id']])) {
                        foreach ($richTextBySection[$sectionRow['id']] as $richTextRow) {
                            if (!canUserSeeNestedInTile($db, $tileId, $user, $richTextRow, $userGroupIds, $isAcceptedShareRecipient)) {
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
    
    attachShortUrlsToTilesList($db, $tiles, $user['id'] ?? null);
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

/**
 * Display name of the user who archived a space ("who archived it" in the Archive banner).
 * Prefers the live account (display name, then username) and falls back to the username
 * snapshot stored on the tile row when that account no longer exists.
 */
function tileArchiverDisplayName(PDO $db, array $row): ?string {
    $fallback = !empty($row['archived_by_username']) ? (string)$row['archived_by_username'] : null;
    $archiverId = !empty($row['archived_by']) ? (int)$row['archived_by'] : null;
    if ($archiverId !== null) {
        try {
            $stmt = $db->prepare('SELECT username, display_name FROM users WHERE id = ?');
            $stmt->execute([$archiverId]);
            $archiver = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($archiver) {
                $displayName = trim((string)($archiver['display_name'] ?? ''));
                if ($displayName !== '') {
                    return $displayName;
                }
                $username = trim((string)($archiver['username'] ?? ''));
                return $username !== '' ? $username : $fallback;
            }
        } catch (PDOException $e) {
            // fall through to the stored snapshot
        }
    }
    return $fallback;
}

function handleGetTile($tileId) {
    $user = getAuthenticatedUser();
    $db = getDB();

    require_once __DIR__ . '/fingerprint_lock_lib.php';
    require_fingerprint_lock_access($user);
    linknestReleaseSessionLock();
    
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

    // Recycle Bin review: admins may open any soft-deleted space, owners only their own.
    // Opt-in via ?include_deleted=1 (or ?recycled=1) and only accepted when the requester is
    // allowed to review it, so ordinary (live) space requests behave exactly as before.
    $isRecycledRow = false;
    if (!$row && (!empty($_GET['include_deleted']) || !empty($_GET['recycled'])) && $user) {
        $isAdminRequester = !empty($user['is_admin']);
        $reviewStmt = $db->prepare($isAdminRequester
            ? 'SELECT * FROM tiles WHERE id = ? AND deleted_at IS NOT NULL'
            : 'SELECT * FROM tiles WHERE id = ? AND deleted_at IS NOT NULL AND user_id = ?');
        $reviewStmt->execute($isAdminRequester ? [$tileId] : [$tileId, (int)$user['id']]);
        $reviewRow = $reviewStmt->fetch();
        if ($reviewRow && !empty($reviewRow['deleted_at'])) {
            $row = $reviewRow;
            $isRecycledRow = true;
        }
    }

    if (!$row) {
        sendJSON(['error' => 'Tile not found'], 404);
    }

    // Role assignment (Your Apps → Your Assigned Apps) must be checked before the staging gate
    $hasRoleAccess = false;
    if ($user && !empty($user['id']) && empty($user['is_admin'])) {
        $hasRoleAccess = canUserViewTileByRole($user['id'], $tileId, $db);
    }

    // Staging tiles: admins always; non-admins only when explicitly role-assigned.
    // Recycled rows are already limited to admins / the owning user, so these gates are skipped.
    $rowSourceTab = isset($row['source_tab']) ? trim($row['source_tab']) : 'public';
    if (!$isRecycledRow && $rowSourceTab === 'staging' && (!$user || empty($user['is_admin']))) {
        if (!$hasRoleAccess) {
            sendJSON(['error' => 'Tile not found'], 404);
        }
    }

    // Unpublished tiles are admin-only
    if (!$isRecycledRow && !canUserSeePublishedContent($user, $row)) {
        sendJSON(['error' => 'Tile not found'], 404);
    }
    
    // Filter tiles based on visibility (must match handleGetTiles for Assigned Apps)
    $tileVisibility = $row['visibility'] ?? 'public';
    $tileAllowedUsers = $row['allowed_users'] ? json_decode($row['allowed_users'], true) : [];
    if (!is_array($tileAllowedUsers)) {
        $tileAllowedUsers = [];
    }
    $tileAllowedGroups = $row['allowed_groups'] ? json_decode($row['allowed_groups'], true) : [];
    if (!is_array($tileAllowedGroups)) {
        $tileAllowedGroups = [];
    }
    
    // Get user's group IDs if user is logged in
    $userGroupIds = [];
    if ($user) {
        $groupStmt = $db->prepare('SELECT group_id FROM user_group_members WHERE user_id = ?');
        $groupStmt->execute([$user['id']]);
        while ($group = $groupStmt->fetch()) {
            $userGroupIds[] = (int)$group['group_id'];
        }
    }
    
    // Recycle Bin review: visibility is irrelevant, the row was already authorized above.
    $isTileVisible = $isRecycledRow ? true : canUserSeeByVisibility($user, $row, $userGroupIds);

    // Owner can always open their own private tile
    if (!$isTileVisible && $user && isset($row['user_id']) && (int)$row['user_id'] === (int)$user['id']) {
        $isTileVisible = true;
    }

    // Accepted share invitations
    $isAcceptedShareRecipient = false;
    if ($user) {
        $sharedCheck = $db->prepare('SELECT id, sharer_user_id FROM tile_share_invitations WHERE tile_id = ? AND receiver_user_id = ? AND status = ?');
        $sharedCheck->execute([$row['id'], $user['id'], 'accepted']);
        if ($sharedCheck->fetch()) {
            $isAcceptedShareRecipient = true;
            $isTileVisible = true;
        }
    }

    // Role-based tile access (private + role_tile_permissions → Your Assigned Apps)
    if (!$isTileVisible && $hasRoleAccess) {
        $isTileVisible = true;
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

    if ($isRecycledRow) {
        // Recycle Bin review is read-only: never expose edit rights for a deleted space.
        $canView = true;
        $canEdit = false;
        $canDelete = true; // admin/owner may restore or purge it from the recycle bin
    } elseif ($user) {
        // Admins have full access to everything
        if ($user['is_admin']) {
            $canView = true;
            $canEdit = true;
            $canDelete = true;
        } else {
            // Check if user is the creator of the tile
            $isCreator = isset($row['user_id']) && (int)$row['user_id'] === (int)$user['id'];
            
            if ($isCreator) {
                // Prefer explicit permission row when a system admin has fine-tuned the owner
                $permStmt = $db->prepare('SELECT can_view, can_edit, can_delete FROM user_tile_permissions WHERE user_id = ? AND tile_id = ?');
                $permStmt->execute([$user['id'], $row['id']]);
                $permission = $permStmt->fetch();
                if ($permission) {
                    $canView = (bool)$permission['can_view'];
                    $canEdit = (bool)$permission['can_edit'];
                    $canDelete = (bool)$permission['can_delete'];
                } else {
                    $canView = true;
                    $canEdit = true;
                    $canDelete = true;
                }
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

    // Recipients this space is shared with (pending + accepted) — owner/admin view only.
    // Powers the "shared" badge on the space card and the revoke-before-delete prompt.
    $shareCount = 0;
    if ($user && ((int)($row['user_id'] ?? 0) === (int)$user['id'] || !empty($user['is_admin']))) {
        $shareCountStmt = $db->prepare("SELECT COUNT(DISTINCT receiver_user_id) FROM tile_share_invitations WHERE tile_id = ? AND status IN ('pending', 'accepted')");
        $shareCountStmt->execute([$row['id']]);
        $shareCount = (int)$shareCountStmt->fetchColumn();
    }

    // Archived-space banner: who moved this space to the Archive (authenticated viewers only).
    $archivedById = !empty($row['archived_by']) ? (int)$row['archived_by'] : null;
    $archivedByName = $user ? tileArchiverDisplayName($db, $row) : null;

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
        'searchTags' => decodeSearchTagsFromRow($row),
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
        'isVideo' => isset($row['is_video']) ? (bool)$row['is_video'] : false,
        'videoUrl' => $row['video_url'] ?? null,
        'videoSource' => (isset($row['video_source']) && in_array($row['video_source'], ['youtube', 'file'], true)) ? $row['video_source'] : null,
        'browser' => isset($row['browser']) ? $row['browser'] : null,
        'canView' => $canView,
        'canEdit' => $canEdit,
        'canDelete' => $canDelete,
        'deletedAt' => $isRecycledRow ? (int)$row['deleted_at'] : null,
        'archivedAt' => !empty($row['archived_at']) ? (int)$row['archived_at'] : null,
        'archivedBy' => $user ? $archivedById : null,
        'archivedByName' => $user ? $archivedByName : null,
        'hasRoleAccess' => $hasRoleAccess,
        'visibleFrom' => $row['visible_from'] ?? null,
        'expiresAt' => $row['expires_at'] ?? null,
        'accessRestrictions' => decodeAccessRestrictionsJson($row['access_restrictions'] ?? null),
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
        'headerImageZoom' => isset($row['header_image_zoom']) && $row['header_image_zoom'] !== null && $row['header_image_zoom'] !== '' ? max(50, min(300, (int)$row['header_image_zoom'])) : null,
        'headerImageFit' => (isset($row['header_image_fit']) && in_array($row['header_image_fit'], ['contain','cover'], true)) ? $row['header_image_fit'] : null,
        'showEmoji' => !(isset($row['show_emoji']) && ((int)$row['show_emoji'] === 0 || $row['show_emoji'] === '0' || $row['show_emoji'] === false)),
        'emojiImage' => !empty($row['emoji_image']) ? $row['emoji_image'] : null,
        'emojiImageOpacity' => !empty($row['emoji_image']) && isset($row['emoji_image_opacity']) && $row['emoji_image_opacity'] !== null && $row['emoji_image_opacity'] !== '' ? max(0, min(100, (int)$row['emoji_image_opacity'])) : null,
        'emojiImageOffsetX' => !empty($row['emoji_image']) && isset($row['emoji_image_offset_x']) && $row['emoji_image_offset_x'] !== null && $row['emoji_image_offset_x'] !== '' ? max(-50, min(50, (int)$row['emoji_image_offset_x'])) : null,
        'emojiImageOffsetY' => !empty($row['emoji_image']) && isset($row['emoji_image_offset_y']) && $row['emoji_image_offset_y'] !== null && $row['emoji_image_offset_y'] !== '' ? max(-50, min(50, (int)$row['emoji_image_offset_y'])) : null,
        'emojiImageZoom' => !empty($row['emoji_image']) && isset($row['emoji_image_zoom']) && $row['emoji_image_zoom'] !== null && $row['emoji_image_zoom'] !== '' ? max(50, min(300, (int)$row['emoji_image_zoom'])) : null,
            'showTitle' => !(isset($row['show_title']) && ((int)$row['show_title'] === 0 || $row['show_title'] === '0' || $row['show_title'] === false)),
            'showDescription' => !(isset($row['show_description']) && ((int)$row['show_description'] === 0 || $row['show_description'] === '0' || $row['show_description'] === false)),
            'showShortUrls' => mapShowShortUrlsFromRow($row),
        'syncSource' => spaceSyncSourceForApi($row),
        'tabs' => [],
        'shareCount' => $shareCount,
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
            'tabIds' => tileMessageTabIdsFromRow($msgRow),
            'showOnCard' => tileMessageShowOnCardFromRow($msgRow),
            'placement' => tileMessagePlacementFromRow($msgRow),
            'fontFamily' => tileMessageFontFamilyFromRow($msgRow),
            'fontSize' => tileMessageFontSizeFromRow($msgRow),
            'marqueeSeconds' => tileMessageMarqueeSecondsFromRow($msgRow),
            'animationType' => $msgRow['animation_type'] ?? 'rollover',
            'delayBefore' => isset($msgRow['delay_before']) ? (float)$msgRow['delay_before'] : 0,
            'celebrationEffect' => $msgRow['celebration_effect'] ?? 'none',
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
        if (!canUserSeeNestedInTile($db, $tileId, $user, $tabRow, $userGroupIds, $isAcceptedShareRecipient)) {
            continue;
        }
        $tabColor = (!empty($tabRow['text_color']) && trim($tabRow['text_color']) !== '') ? trim($tabRow['text_color']) : null;
        error_log("Retrieved tab {$tabRow['id']} ({$tabRow['title']}) with color: " . ($tabColor ?? 'null'));
        $tab = [
            'id' => $tabRow['id'],
            'syncSourceId' => spaceSyncChildId($tabRow),
            'title' => $tabRow['title'],
                        'emoji' => contentEmojiFromRow($tabRow),
            'position' => (int)($tabRow['position'] ?? 0),
            'textColor' => $tabColor,
            'backgroundColor' => backgroundColorFromRowOrInput($tabRow),
            'backgroundGradientEnabled' => backgroundDecorationFromRow($tabRow)['backgroundGradientEnabled'],
            'backgroundGradientColors' => backgroundDecorationFromRow($tabRow)['backgroundGradientColors'],
            'backgroundGradientDirection' => backgroundDecorationFromRow($tabRow)['backgroundGradientDirection'],
            'backgroundGradientType' => backgroundDecorationFromRow($tabRow)['backgroundGradientType'],
            'backgroundGradientColorPositions' => backgroundDecorationFromRow($tabRow)['backgroundGradientColorPositions'],
            'inheritShortUrls' => mapInheritShortUrlsFromRow($tabRow),
            'visibleFrom' => $tabRow['visible_from'] ?? null,
            'expiresAt' => $tabRow['expires_at'] ?? null,
            'accessRestrictions' => decodeAccessRestrictionsJson($tabRow['access_restrictions'] ?? null),
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
            if (!canUserSeeNestedInTile($db, $tileId, $user, $sectionRow, $userGroupIds, $isAcceptedShareRecipient)) {
                continue;
            }
            $section = [
                'id' => $sectionRow['id'],
                'syncSourceId' => spaceSyncChildId($sectionRow),
                'title' => $sectionRow['title'],
                                'emoji' => contentEmojiFromRow($sectionRow),
                'textColor' => (!empty($sectionRow['text_color']) && trim($sectionRow['text_color']) !== '') ? trim($sectionRow['text_color']) : null,
                'backgroundColor' => backgroundColorFromRowOrInput($sectionRow),
                'backgroundGradientEnabled' => backgroundDecorationFromRow($sectionRow)['backgroundGradientEnabled'],
                'backgroundGradientColors' => backgroundDecorationFromRow($sectionRow)['backgroundGradientColors'],
                'backgroundGradientDirection' => backgroundDecorationFromRow($sectionRow)['backgroundGradientDirection'],
                'backgroundGradientType' => backgroundDecorationFromRow($sectionRow)['backgroundGradientType'],
                'backgroundGradientColorPositions' => backgroundDecorationFromRow($sectionRow)['backgroundGradientColorPositions'],
                'visibleFrom' => $sectionRow['visible_from'] ?? null,
                'expiresAt' => $sectionRow['expires_at'] ?? null,
                'forceStackedView' => isset($sectionRow['force_stacked_view']) && $sectionRow['force_stacked_view'] == 1 ? true : false,
                                'ignoreSideBySide' => isset($sectionRow['ignore_side_by_side']) && $sectionRow['ignore_side_by_side'] == 1 ? true : false,
                                'showReadAloud' => sectionShowReadAloudFlag($sectionRow),
                                'inheritShortUrls' => mapInheritShortUrlsFromRow($sectionRow),
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

                $isVisible = canUserSeeNestedInTile($db, $tileId, $user, $linkRow, $userGroupIds, $isAcceptedShareRecipient);

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
                    'syncSourceId' => spaceSyncChildId($linkRow),
                    'label' => $linkRow['label'],
                    'url' => $linkRow['url'],
                    'icon' => isset($linkRow['icon']) ? $linkRow['icon'] : null,
                    'textColor' => isset($linkRow['text_color']) ? $linkRow['text_color'] : null,
                    'inheritShortUrls' => mapInheritShortUrlsFromRow($linkRow),
                    'visibility' => $visibility,
                    'published' => isContentPublished($linkRow),
                    'allowedUsers' => $allowedUsers,
                    'allowedGroups' => isset($linkRow['allowed_groups']) && $linkRow['allowed_groups'] ? json_decode($linkRow['allowed_groups'], true) : [],
                    'notes' => isset($linkRow['notes']) ? $linkRow['notes'] : null,
                    'tooltip' => isset($linkRow['tooltip']) ? $linkRow['tooltip'] : null,
                    'richTextContent' => isset($linkRow['rich_text_content']) ? $linkRow['rich_text_content'] : null,
                    'visibleFrom' => isset($linkRow['visible_from']) ? $linkRow['visible_from'] : null,
                    'expiresAt' => isset($linkRow['expires_at']) ? $linkRow['expires_at'] : null,
                    'accessRestrictions' => decodeAccessRestrictionsJson($linkRow['access_restrictions'] ?? null),
                    'browser' => isset($linkRow['browser']) ? $linkRow['browser'] : null,
                    'animation' => isset($linkRow['animation']) ? $linkRow['animation'] : null,
                    'isFavorite' => (bool)($linkRow['is_favorite'] ?? false),
                    'hasRoleAccess' => $linkHasRoleAccess,
                    'position' => (int)($linkRow['position'] ?? 0)
                ];
                
                // Include health data if available
                if (isset($linkRow['health_status']) && !isNonHttpLinkHealthUrl($linkRow['url'] ?? '')) {
                    $link['health'] = [
                        'status' => $linkRow['health_status'] ?? 'unknown',
                        'httpCode' => $linkRow['health_http_code'] ? (int)$linkRow['health_http_code'] : null,
                        'error' => $linkRow['health_error'],
                        'checkedAt' => $linkRow['health_checked_at'] ? (int)$linkRow['health_checked_at'] : null
                    ];
                }
                
                applyLinkMaintenanceToApi($link, $linkRow);
                applyLinkNotesInfoVideoToApi($link, $linkRow);
                applyLinkFeatureTogglesToApi($link, $linkRow);
                applyLinkOpenTargetToApi($link, $linkRow);
                applyLinkMobilePreviewEmulationToApi($link, $linkRow);
                applyLinkOpenInEmulationToApi($link, $linkRow);
                applyLinkForceShortUrlToApi($link, $linkRow);
                applyLinkBrokenStatusLabelToApi($link, $linkRow);
                $section['links'][] = $link;
            }
            
            // Get rich text content for this section
            $richTextStmt = $db->prepare('SELECT * FROM rich_text_content WHERE section_id = ? ORDER BY position ASC');
            $richTextStmt->execute([$sectionRow['id']]);
            $section['richTextContent'] = [];
            while ($richTextRow = $richTextStmt->fetch()) {
                if (!canUserSeeNestedInTile($db, $tileId, $user, $richTextRow, $userGroupIds, $isAcceptedShareRecipient)) {
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
                if (!canUserSeeNestedInTile($db, $tileId, $user, $sectionRow, $userGroupIds, $isAcceptedShareRecipient)) {
                    continue;
                }
                $section = [
                    'id' => $sectionRow['id'],
                    'syncSourceId' => spaceSyncChildId($sectionRow),
                    'title' => $sectionRow['title'],
                                'emoji' => contentEmojiFromRow($sectionRow),
                    'textColor' => (!empty($sectionRow['text_color']) && trim($sectionRow['text_color']) !== '') ? trim($sectionRow['text_color']) : null,
                    'backgroundColor' => backgroundColorFromRowOrInput($sectionRow),
                    'backgroundGradientEnabled' => backgroundDecorationFromRow($sectionRow)['backgroundGradientEnabled'],
                    'backgroundGradientColors' => backgroundDecorationFromRow($sectionRow)['backgroundGradientColors'],
                    'backgroundGradientDirection' => backgroundDecorationFromRow($sectionRow)['backgroundGradientDirection'],
                    'backgroundGradientType' => backgroundDecorationFromRow($sectionRow)['backgroundGradientType'],
                    'backgroundGradientColorPositions' => backgroundDecorationFromRow($sectionRow)['backgroundGradientColorPositions'],
                    'forceStackedView' => isset($sectionRow['force_stacked_view']) && $sectionRow['force_stacked_view'] == 1 ? true : false,
                                'ignoreSideBySide' => isset($sectionRow['ignore_side_by_side']) && $sectionRow['ignore_side_by_side'] == 1 ? true : false,
                                'showReadAloud' => sectionShowReadAloudFlag($sectionRow),
                                'inheritShortUrls' => mapInheritShortUrlsFromRow($sectionRow),
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

                    $isVisible = canUserSeeNestedInTile($db, $tileId, $user, $linkRow, $userGroupIds, $isAcceptedShareRecipient);

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
                        'syncSourceId' => spaceSyncChildId($linkRow),
                        'label' => $linkRow['label'],
                        'url' => $linkRow['url'],
                        'icon' => $linkRow['icon'] ?? null,
                        'textColor' => $linkRow['text_color'] ?? null,
                        'inheritShortUrls' => mapInheritShortUrlsFromRow($linkRow),
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

                    if (isset($linkRow['health_status']) && !isNonHttpLinkHealthUrl($linkRow['url'] ?? '')) {
                        $link['health'] = [
                            'status' => $linkRow['health_status'] ?? 'unknown',
                            'httpCode' => $linkRow['health_http_code'] ? (int)$linkRow['health_http_code'] : null,
                            'error' => $linkRow['health_error'],
                            'checkedAt' => $linkRow['health_checked_at'] ? (int)$linkRow['health_checked_at'] : null
                        ];
                    }

                    applyLinkMaintenanceToApi($link, $linkRow);
                    applyLinkNotesInfoVideoToApi($link, $linkRow);
                    applyLinkFeatureTogglesToApi($link, $linkRow);
                applyLinkOpenTargetToApi($link, $linkRow);
                applyLinkMobilePreviewEmulationToApi($link, $linkRow);
                applyLinkOpenInEmulationToApi($link, $linkRow);
                applyLinkForceShortUrlToApi($link, $linkRow);
                applyLinkBrokenStatusLabelToApi($link, $linkRow);
                    $section['links'][] = $link;
                }

                $section['richTextContent'] = [];
                $richTextStmt = $db->prepare('SELECT * FROM rich_text_content WHERE section_id = ? ORDER BY position ASC');
                $richTextStmt->execute([$sectionRow['id']]);
                while ($richTextRow = $richTextStmt->fetch()) {
                    if (!canUserSeeNestedInTile($db, $tileId, $user, $richTextRow, $userGroupIds, $isAcceptedShareRecipient)) {
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

    attachShortUrlsToTilePayload($db, $tile, true, $user['id'] ?? null);
    
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

    // Handle video space fields
    $isVideo = isset($data['isVideo']) && $data['isVideo'] ? 1 : 0;
    $videoUrl = isset($data['videoUrl']) && is_string($data['videoUrl']) && trim($data['videoUrl']) !== '' ? trim($data['videoUrl']) : null;
    $videoSource = isset($data['videoSource']) && in_array($data['videoSource'], ['youtube', 'file'], true) ? $data['videoSource'] : null;
    if ($isVideo) {
        $isHyperlink = 0;
        $hyperlinkUrl = null;
        $openInNewTab = 0;
    } else {
        $videoUrl = null;
        $videoSource = null;
    }
    if ($isHyperlink) {
        $isVideo = 0;
        $videoUrl = null;
        $videoSource = null;
    }
    
    // Handle scheduling fields
    $visibleFrom = isset($data['visibleFrom']) && $data['visibleFrom'] ? $data['visibleFrom'] : null;
    $expiresAt = isset($data['expiresAt']) && $data['expiresAt'] ? $data['expiresAt'] : null;
    $tileAccessRestrictions = encodeAccessRestrictionsJson($data['accessRestrictions'] ?? null);
    
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
    $emojiImageOpacity = $emojiImage !== null
        ? (isset($data['emojiImageOpacity']) && is_numeric($data['emojiImageOpacity'])
            ? max(0, min(100, (int)$data['emojiImageOpacity']))
            : 100)
        : null;
    $emojiImageOffsetX = $emojiImage !== null
        ? (isset($data['emojiImageOffsetX']) && is_numeric($data['emojiImageOffsetX'])
            ? max(-50, min(50, (int)$data['emojiImageOffsetX']))
            : 0)
        : null;
    $emojiImageOffsetY = $emojiImage !== null
        ? (isset($data['emojiImageOffsetY']) && is_numeric($data['emojiImageOffsetY'])
            ? max(-50, min(50, (int)$data['emojiImageOffsetY']))
            : 0)
        : null;
    $emojiImageZoom = $emojiImage !== null
        ? (isset($data['emojiImageZoom']) && is_numeric($data['emojiImageZoom'])
            ? max(50, min(300, (int)$data['emojiImageZoom']))
            : 100)
        : null;
    $showTitle = array_key_exists('showTitle', $data)
        ? (!empty($data['showTitle']) && $data['showTitle'] !== '0' && $data['showTitle'] !== 0 && $data['showTitle'] !== false ? 1 : 0)
        : 1;
    $showDescription = array_key_exists('showDescription', $data)
        ? (!empty($data['showDescription']) && $data['showDescription'] !== '0' && $data['showDescription'] !== 0 && $data['showDescription'] !== false ? 1 : 0)
        : 1;
    $searchTagsJson = encodeSearchTagsForStorage($data['searchTags'] ?? $data['search_tags'] ?? []);
    $headerImageOffsetY = $headerImage !== null
        ? (isset($data['headerImageOffsetY']) && is_numeric($data['headerImageOffsetY'])
            ? max(-300, min(300, (int)$data['headerImageOffsetY']))
            : 0)
        : null;
    $headerImageZoom = $headerImage !== null
        ? (isset($data['headerImageZoom']) && is_numeric($data['headerImageZoom'])
            ? max(50, min(300, (int)$data['headerImageZoom']))
            : 100)
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
    
    $stmt = $db->prepare('INSERT INTO tiles (id, user_id, title, description, html_content, emoji, theme_color, "group", visibility, allowed_users, allowed_groups, is_hyperlink, hyperlink_url, open_in_new_tab, is_video, video_url, video_source, visible_from, expires_at, browser, tile_background_color, tile_gradient_enabled, tile_gradient_colors, tile_gradient_color_positions, tile_gradient_direction, tile_gradient_type, tile_border_radius, tile_text_color, page_animation, links_animation, header_image, header_image_align, header_image_opacity, header_image_offset_x, header_image_offset_y, header_image_zoom, header_image_fit, show_emoji, emoji_image, emoji_image_opacity, emoji_image_offset_x, emoji_image_offset_y, emoji_image_zoom, show_title, show_description, search_tags, source_tab, published, access_restrictions, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    
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
        $isVideo,
        $videoUrl,
        $videoSource,
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
        $headerImageZoom,
        $headerImageFit,
        $showEmoji,
        $emojiImage,
        $emojiImageOpacity,
        $emojiImageOffsetX,
        $emojiImageOffsetY,
        $emojiImageZoom,
        $showTitle,
        $showDescription,
        $searchTagsJson,
        $sourceTab,
        $published,
        $tileAccessRestrictions,
        $position,
        $data['createdAt'] ?? time()
    ])) {
        sendJSON(['error' => 'Failed to create tile'], 500);
    }

    persistTileShowShortUrls($db, $tileId, $data);
    persistTileSyncSource($db, $tileId, $data);
    
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
            $tabStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position, text_color, background_color, background_style, emoji, visible_from, expires_at, visibility, allowed_users, allowed_groups, published, access_restrictions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $tabStmt->execute([
                $tabId,
                $tileId,
                $tab['title'] ?? 'New Tab',
                $tab['position'] ?? $tabIndex,
                $tabColor,
                backgroundColorFromRowOrInput($tab),
                encodeBackgroundStyleJson($tab),
                contentEmojiFromInput($tab),
                $tab['visibleFrom'] ?? null,
                $tab['expiresAt'] ?? null,
                $tabVisibility,
                $tabAllowedUsers,
                $tabAllowedGroups,
                $tabPublished,
                encodeAccessRestrictionsJson($tab['accessRestrictions'] ?? null)
            ]);
            persistInheritShortUrls($db, 'tabs', $tabId, $tab);
            
            // Insert sections for this tab
            if (isset($tab['sections']) && is_array($tab['sections'])) {
                foreach ($tab['sections'] as $sectionIndex => $section) {
                    $sectionId = $section['id'] ?? uniqid('section_', true);
                    $sectionPosition = isset($section['position']) ? (int)$section['position'] : $sectionIndex;
                    $secVisibility = $section['visibility'] ?? 'public';
                    $secAllowedUsers = isset($section['allowedUsers']) && is_array($section['allowedUsers']) ? json_encode($section['allowedUsers']) : null;
                    $secAllowedGroups = isset($section['allowedGroups']) && is_array($section['allowedGroups']) ? json_encode($section['allowedGroups']) : null;
                    $secPublished = resolvePublishedFlag($section, $user, true);
                    $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, text_color, background_color, background_style, emoji, visible_from, expires_at, force_stacked_view, ignore_side_by_side, show_read_aloud, position, visibility, allowed_users, allowed_groups, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                    $sectionStmt->execute([
                        $sectionId,
                        $tileId,
                        $tabId,
                        $section['title'] ?? '',
                        $section['textColor'] ?? null,
                        backgroundColorFromRowOrInput($section),
                        encodeBackgroundStyleJson($section),
                        contentEmojiFromInput($section),
                        $section['visibleFrom'] ?? null,
                        $section['expiresAt'] ?? null,
                        isset($section['forceStackedView']) && $section['forceStackedView'] === true ? 1 : 0,
                        isset($section['ignoreSideBySide']) && $section['ignoreSideBySide'] === true ? 1 : 0,
                        sectionShowReadAloudFlag($section) ? 1 : 0,
                        $sectionPosition,
                        $secVisibility,
                        $secAllowedUsers,
                        $secAllowedGroups,
                        $secPublished
                    ]);
                    persistInheritShortUrls($db, 'sections', $sectionId, $section);
                    
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
                                $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, text_color, visibility, allowed_users, allowed_groups, notes, tooltip, visible_from, expires_at, browser, position, rich_text_content, animation, published, access_restrictions, maintenance_enabled, maintenance_message, maintenance_video_url, notes_video_url, info_video_url, notes_enabled, rich_text_enabled, info_show_open_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
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
                                    $linkPublished,
                                    encodeAccessRestrictionsJson($link['accessRestrictions'] ?? null),
                                    ...linkMaintenanceInsertValuesFromInput($link),
                                    ...linkNotesInfoVideoInsertValuesFromInput($link),
                                    ...linkFeatureToggleInsertValuesFromInput($link)
                                ]);
                                persistInheritShortUrls($db, 'links', $linkId, $link);
                                persistLinkTooltipStyle($db, $linkId, $link);
                                persistLinkOpenTarget($db, $linkId, $link);
                                persistLinkMobilePreviewEmulation($db, $linkId, $link);
                                persistLinkOpenInEmulation($db, $linkId, $link);
                                persistLinkForceShortUrl($db, $linkId, $link);
                                persistLinkBrokenStatusLabel($db, $linkId, $link);
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
                                    persistLinkTooltipStyle($db, $linkId, $link);
                                persistLinkOpenTarget($db, $linkId, $link);
                                persistLinkMobilePreviewEmulation($db, $linkId, $link);
                                persistLinkOpenInEmulation($db, $linkId, $link);
                                persistLinkForceShortUrl($db, $linkId, $link);
                                persistLinkBrokenStatusLabel($db, $linkId, $link);
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
            $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, text_color, background_color, background_style, emoji, visible_from, expires_at, force_stacked_view, ignore_side_by_side, show_read_aloud, position, visibility, allowed_users, allowed_groups) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $sectionStmt->execute([
                $sectionId,
                $tileId,
                $defaultTabId,
                $section['title'] ?? '',
                $section['textColor'] ?? null,
                backgroundColorFromRowOrInput($section),
                encodeBackgroundStyleJson($section),
                contentEmojiFromInput($section),
                $section['visibleFrom'] ?? null,
                $section['expiresAt'] ?? null,
                isset($section['forceStackedView']) && $section['forceStackedView'] === true ? 1 : 0,
                isset($section['ignoreSideBySide']) && $section['ignoreSideBySide'] === true ? 1 : 0,
                        sectionShowReadAloudFlag($section) ? 1 : 0,
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

            // Insert rich text content for legacy sections (same as tabbed create path)
            if (isset($section['richTextContent']) && is_array($section['richTextContent'])) {
                foreach ($section['richTextContent'] as $richText) {
                    $richTextId = $richText['id'] ?? uniqid('richtext_', true);
                    try {
                        insertRichTextContent($db, $richTextId, $sectionId, $richText);
                    } catch (PDOException $e) {
                        error_log('Rich text content insert error (legacy sections): ' . $e->getMessage());
                    }
                }
            }
        }
    }
    
    // Handle tile messages
    if (isset($data['messages']) && is_array($data['messages'])) {
        $msgStmt = $db->prepare('INSERT INTO tile_messages (id, tile_id, content, type, start_date, end_date, is_active, priority, text_color, font_style, display_location, animation_type, delay_before, celebration_effect, celebration_config, url, url_label, tab_ids, show_on_card, placement, font_family, font_size, marquee_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
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
                $msg['celebrationEffect'] ?? 'none',
                $cc,
                $msg['url'] ?? null,
                $msg['urlLabel'] ?? null,
                tileMessageTabIdsForStorage($msg['tabIds'] ?? null),
                !empty($msg['showOnCard']) ? 1 : 0,
                tileMessagePlacementForStorage($msg['placement'] ?? null),
                tileMessageFontFamilyForStorage($msg['fontFamily'] ?? null),
                tileMessageFontSizeForStorage($msg['fontSize'] ?? null),
                tileMessageMarqueeSecondsForStorage($msg['marqueeSeconds'] ?? null)
            ]);
        }
    }

    stampSyncSourceIds($db, $data);
    invalidateGuestTilesListCache();
    logUserAudit('space.created', [
        'details' => [
            'tile_id' => $tileId,
            'title' => (string)($data['title'] ?? ''),
            'group' => (string)($data['group'] ?? 'General'),
        ],
    ]);
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
        
        $isFinal = !empty($data['is_final']);
        updateTileInternal($tileId, $data, $db, $user, false, $data['is_final'] ?? false);
        if ($isFinal) {
            logUserAudit('space.updated', [
                'details' => [
                    'tile_id' => $tileId,
                    'title' => (string)($data['title'] ?? ''),
                    'group' => (string)($data['group'] ?? ''),
                ],
            ]);
        }
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
    $checkStmt = $db->prepare('SELECT id, title, "group" AS group_name, archived_at FROM tiles WHERE id = ? AND deleted_at IS NULL');
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

    // Remove uploaded space / webcam / link-maintenance videos (file stays gone if restored)
    purgeTileMaintvidUploads($db, $tileId, true);
    
    // Soft delete: set deleted_at timestamp and clear archived_at if it was archived
    // This moves the tile to recycle bin (whether it was archived or not)
    $stmt = $db->prepare('UPDATE tiles SET deleted_at = ?, archived_at = NULL WHERE id = ?');
    $stmt->execute([time(), $tileId]);
    
    invalidateGuestTilesListCache();
    logUserAudit('space.deleted', [
        'details' => [
            'tile_id' => $tileId,
            'title' => (string)($tile['title'] ?? ''),
            'group' => (string)($tile['group_name'] ?? ''),
        ],
    ]);
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
 * Normalize an animation id from a request: null for "no animation", false when invalid.
 *
 * @return string|null|false
 */
function normalizeAnimationIdInput($raw) {
    if ($raw === null) {
        return null;
    }
    if (!is_string($raw)) {
        return false;
    }
    $value = strtolower(trim($raw));
    if ($value === '' || $value === 'none') {
        return null;
    }
    return preg_match('/^[a-z0-9-]{1,64}$/', $value) === 1 ? $value : false;
}

/**
 * Update only the sections (page_animation) and/or default links (links_animation)
 * entrance animation for a space. Only fields present in the request are written, so
 * a full tile PUT is not needed and the other column is never cleared by accident.
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

    if (!is_array($data)) {
        sendJSON(['error' => 'Invalid request body'], 400);
        return;
    }

    $fields = [
        'pageAnimation' => ['page_animation', ['pageAnimation', 'page_animation']],
        'linksAnimation' => ['links_animation', ['linksAnimation', 'links_animation']],
    ];
    $sets = [];
    $params = [];
    foreach ($fields as $label => [$column, $keys]) {
        foreach ($keys as $key) {
            if (!array_key_exists($key, $data)) {
                continue;
            }
            $value = normalizeAnimationIdInput($data[$key]);
            if ($value === false) {
                sendJSON(['error' => "Invalid {$label}"], 400);
                return;
            }
            $sets[] = "{$column} = ?";
            $params[] = $value;
            break;
        }
    }

    if (!$sets) {
        sendJSON(['error' => 'Nothing to update: send pageAnimation and/or linksAnimation'], 400);
        return;
    }

    $params[] = $tileId;
    $stmt = $db->prepare('UPDATE tiles SET ' . implode(', ', $sets) . ' WHERE id = ?');
    $stmt->execute($params);
    invalidateGuestTilesListCache();

    $rowStmt = $db->prepare('SELECT page_animation, links_animation FROM tiles WHERE id = ?');
    $rowStmt->execute([$tileId]);
    $row = $rowStmt->fetch() ?: [];

    sendJSON([
        'success' => true,
        'pageAnimation' => $row['page_animation'] ?? null,
        'linksAnimation' => $row['links_animation'] ?? null,
    ]);
}

function cloneRowVisibility(array $row): string {
    $visibility = $row['visibility'] ?? 'public';
    return in_array($visibility, ['public', 'authenticated', 'private'], true) ? $visibility : 'public';
}

function cloneRowPublished(array $row): int {
    if (!array_key_exists('published', $row) || $row['published'] === null || $row['published'] === '') {
        return 1;
    }
    return ((int)$row['published'] === 0 || $row['published'] === '0') ? 0 : 1;
}

function cloneTileLinksAndRichText(PDO $db, string $sourceSectionId, string $newSectionId): void {
    $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ?');
    $linkStmt->execute([$sourceSectionId]);
    $links = $linkStmt->fetchAll();

    foreach ($links as $link) {
        $newLinkId = uniqid('link_', true);
        $linkInsertStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, text_color, visibility, allowed_users, allowed_groups, notes, tooltip, visible_from, expires_at, browser, position, rich_text_content, animation, published, access_restrictions, maintenance_enabled, maintenance_message, maintenance_video_url, notes_video_url, info_video_url, notes_enabled, rich_text_enabled, info_show_open_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $linkInsertStmt->execute([
            $newLinkId,
            $newSectionId,
            $link['label'],
            $link['url'],
            $link['icon'] ?? null,
            $link['text_color'] ?? null,
            cloneRowVisibility($link),
            $link['allowed_users'] ?? null,
            $link['allowed_groups'] ?? null,
            $link['notes'] ?? null,
            $link['tooltip'] ?? null,
            $link['visible_from'] ?? null,
            $link['expires_at'] ?? null,
            $link['browser'] ?? null,
            isset($link['position']) ? (int)$link['position'] : 0,
            $link['rich_text_content'] ?? null,
            $link['animation'] ?? null,
            cloneRowPublished($link),
            $link['access_restrictions'] ?? null,
            ...linkMaintenanceInsertValuesFromRow($link),
            ...linkNotesInfoVideoInsertValuesFromRow($link),
            ...linkFeatureToggleInsertValuesFromRow($link)
        ]);
        persistInheritShortUrls($db, 'links', $newLinkId, $link);
        persistLinkTooltipStyle($db, $newLinkId, $link);
        persistLinkOpenTarget($db, $newLinkId, $link);
        persistLinkMobilePreviewEmulation($db, $newLinkId, $link);
        persistLinkOpenInEmulation($db, $newLinkId, $link);
        persistLinkForceShortUrl($db, $newLinkId, $link);
        persistLinkBrokenStatusLabel($db, $newLinkId, $link);
    }

    $richTextStmt = $db->prepare('SELECT * FROM rich_text_content WHERE section_id = ?');
    $richTextStmt->execute([$sourceSectionId]);
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

function cloneTileSectionRow(PDO $db, array $section, string $newTileId, string $newTabId, int $sectionIndex): void {
    $newSectionId = uniqid('section_', true);
    $sectionPosition = isset($section['position']) ? (int)$section['position'] : $sectionIndex;
    $sectionInsertStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, text_color, background_color, background_style, emoji, visible_from, expires_at, force_stacked_view, ignore_side_by_side, show_read_aloud, position, visibility, allowed_users, allowed_groups, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $sectionInsertStmt->execute([
        $newSectionId,
        $newTileId,
        $newTabId,
        $section['title'],
        isset($section['text_color']) ? $section['text_color'] : null,
        backgroundColorFromRowOrInput($section),
        encodeBackgroundStyleJson($section),
        contentEmojiFromRow($section),
        $section['visible_from'] ?? null,
        $section['expires_at'] ?? null,
        isset($section['force_stacked_view']) && $section['force_stacked_view'] == 1 ? 1 : 0,
        isset($section['ignore_side_by_side']) && $section['ignore_side_by_side'] == 1 ? 1 : 0,
        sectionShowReadAloudFlag($section) ? 1 : 0,
        $sectionPosition,
        cloneRowVisibility($section),
        $section['allowed_users'] ?? null,
        $section['allowed_groups'] ?? null,
        cloneRowPublished($section)
    ]);
    persistInheritShortUrls($db, 'sections', $newSectionId, $section);
    cloneTileLinksAndRichText($db, $section['id'], $newSectionId);
}

/**
 * Clone a tile row plus tabs, sections, links, rich text, and messages.
 * Copies visibility, allowed_users, allowed_groups, published, and access_restrictions.
 *
 * @param array $overrides title, group, user_id, source_tab, position
 */
function cloneTileRecordAndContents(PDO $db, array $originalTile, string $newTileId, array $overrides): void {
    $newTitle = $overrides['title'] ?? $originalTile['title'];
    $newGroup = array_key_exists('group', $overrides) ? $overrides['group'] : ($originalTile['group'] ?? 'General');
    $newUserId = $overrides['user_id'] ?? $originalTile['user_id'];
    $newSourceTab = $overrides['source_tab'] ?? (
        (isset($originalTile['source_tab']) && trim((string)$originalTile['source_tab']) === 'staging') ? 'staging' : 'public'
    );
    if ($newSourceTab !== 'staging') {
        $newSourceTab = 'public';
    }
    $newPosition = isset($overrides['position']) ? (int)$overrides['position'] : 0;

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
    $emojiImageOpacity = $emojiImage !== null
        ? (isset($originalTile['emoji_image_opacity']) && $originalTile['emoji_image_opacity'] !== null && $originalTile['emoji_image_opacity'] !== ''
            ? max(0, min(100, (int)$originalTile['emoji_image_opacity'])) : 100)
        : null;
    $emojiImageOffsetX = $emojiImage !== null
        ? (isset($originalTile['emoji_image_offset_x']) && $originalTile['emoji_image_offset_x'] !== null && $originalTile['emoji_image_offset_x'] !== ''
            ? max(-50, min(50, (int)$originalTile['emoji_image_offset_x'])) : 0)
        : null;
    $emojiImageOffsetY = $emojiImage !== null
        ? (isset($originalTile['emoji_image_offset_y']) && $originalTile['emoji_image_offset_y'] !== null && $originalTile['emoji_image_offset_y'] !== ''
            ? max(-50, min(50, (int)$originalTile['emoji_image_offset_y'])) : 0)
        : null;
    $emojiImageZoom = $emojiImage !== null
        ? (isset($originalTile['emoji_image_zoom']) && $originalTile['emoji_image_zoom'] !== null && $originalTile['emoji_image_zoom'] !== ''
            ? max(50, min(300, (int)$originalTile['emoji_image_zoom'])) : 100)
        : null;
    $showTitle = !(isset($originalTile['show_title']) && ((int)$originalTile['show_title'] === 0 || $originalTile['show_title'] === '0'));
    $showDescription = !(isset($originalTile['show_description']) && ((int)$originalTile['show_description'] === 0 || $originalTile['show_description'] === '0'));
    $searchTagsJson = encodeSearchTagsForStorage(decodeSearchTagsFromRow($originalTile));
    $headerImageOffsetY = $headerImage !== null
        ? (isset($originalTile['header_image_offset_y']) && $originalTile['header_image_offset_y'] !== null && $originalTile['header_image_offset_y'] !== ''
            ? max(-300, min(300, (int)$originalTile['header_image_offset_y'])) : 0)
        : null;
    $headerImageZoom = $headerImage !== null
        ? (isset($originalTile['header_image_zoom']) && $originalTile['header_image_zoom'] !== null && $originalTile['header_image_zoom'] !== ''
            ? max(50, min(300, (int)$originalTile['header_image_zoom'])) : 100)
        : null;

    $insertStmt = $db->prepare('INSERT INTO tiles (id, user_id, title, description, html_content, emoji, theme_color, "group", visibility, allowed_users, allowed_groups, is_hyperlink, hyperlink_url, open_in_new_tab, is_video, video_url, video_source, visible_from, expires_at, browser, tile_background_color, tile_gradient_enabled, tile_gradient_colors, tile_gradient_color_positions, tile_gradient_direction, tile_gradient_type, tile_border_radius, tile_text_color, page_animation, links_animation, header_image, header_image_align, header_image_opacity, header_image_offset_x, header_image_offset_y, header_image_zoom, header_image_fit, show_emoji, emoji_image, emoji_image_opacity, emoji_image_offset_x, emoji_image_offset_y, emoji_image_zoom, show_title, show_description, search_tags, source_tab, published, access_restrictions, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

    if (!$insertStmt->execute([
        $newTileId,
        $newUserId,
        $newTitle,
        $originalTile['description'],
        $originalTile['html_content'],
        $originalTile['emoji'],
        $originalTile['theme_color'],
        $newGroup,
        cloneRowVisibility($originalTile),
        $originalTile['allowed_users'] ?? null,
        $originalTile['allowed_groups'] ?? null,
        $originalTile['is_hyperlink'] ?? 0,
        $originalTile['hyperlink_url'] ?? null,
        $originalTile['open_in_new_tab'] ?? 0,
        $originalTile['is_video'] ?? 0,
        $originalTile['video_url'] ?? null,
        $originalTile['video_source'] ?? null,
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
        $headerImageZoom,
        $headerImageFit,
        $showEmoji ? 1 : 0,
        $emojiImage,
        $emojiImageOpacity,
        $emojiImageOffsetX,
        $emojiImageOffsetY,
        $emojiImageZoom,
        $showTitle ? 1 : 0,
        $showDescription ? 1 : 0,
        $searchTagsJson,
        $newSourceTab,
        cloneRowPublished($originalTile),
        $originalTile['access_restrictions'] ?? null,
        $newPosition,
        time()
    ])) {
        throw new Exception('Failed to create cloned tile');
    }

    persistTileShowShortUrls($db, $newTileId, null, $originalTile);

    $sourceTileId = $originalTile['id'];
    $tabStmt = $db->prepare('SELECT * FROM tabs WHERE tile_id = ? ORDER BY position ASC');
    $tabStmt->execute([$sourceTileId]);
    $tabs = $tabStmt->fetchAll();

    if (empty($tabs)) {
        $legacySectionStmt = $db->prepare('SELECT * FROM sections WHERE tile_id = ? AND (tab_id IS NULL OR tab_id = "")');
        $legacySectionStmt->execute([$sourceTileId]);
        $legacySections = $legacySectionStmt->fetchAll();

        if (!empty($legacySections)) {
            $defaultTabId = uniqid('tab_', true);
            $tabInsertStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position, text_color, background_color, background_style, visibility, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $tabInsertStmt->execute([
                $defaultTabId,
                $newTileId,
                'Default',
                0,
                null,
                null,
                null,
                'public',
                1
            ]);

            foreach ($legacySections as $sectionIndex => $section) {
                cloneTileSectionRow($db, $section, $newTileId, $defaultTabId, $sectionIndex);
            }
        }
    } else {
        foreach ($tabs as $tab) {
            $newTabId = uniqid('tab_', true);
            $tabInsertStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position, text_color, background_color, background_style, emoji, visible_from, expires_at, visibility, allowed_users, allowed_groups, published, access_restrictions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $tabInsertStmt->execute([
                $newTabId,
                $newTileId,
                $tab['title'],
                $tab['position'] ?? 0,
                (!empty($tab['text_color']) && trim($tab['text_color']) !== '') ? trim($tab['text_color']) : null,
                backgroundColorFromRowOrInput($tab),
                encodeBackgroundStyleJson($tab),
                contentEmojiFromRow($tab),
                $tab['visible_from'] ?? null,
                $tab['expires_at'] ?? null,
                cloneRowVisibility($tab),
                $tab['allowed_users'] ?? null,
                $tab['allowed_groups'] ?? null,
                cloneRowPublished($tab),
                $tab['access_restrictions'] ?? null
            ]);
            persistInheritShortUrls($db, 'tabs', $newTabId, $tab);

            $sectionStmt = $db->prepare('SELECT * FROM sections WHERE tab_id = ? ORDER BY position ASC, id ASC');
            $sectionStmt->execute([$tab['id']]);
            $sections = $sectionStmt->fetchAll();

            foreach ($sections as $sectionIndex => $section) {
                cloneTileSectionRow($db, $section, $newTileId, $newTabId, $sectionIndex);
            }
        }
    }

    $msgStmt = $db->prepare('SELECT * FROM tile_messages WHERE tile_id = ?');
    $msgStmt->execute([$sourceTileId]);
    $messages = $msgStmt->fetchAll();

    if (!empty($messages)) {
        $msgInsertStmt = $db->prepare('INSERT INTO tile_messages (id, tile_id, content, type, start_date, end_date, is_active, priority, text_color, font_style, display_location, animation_type, delay_before, celebration_effect, celebration_config, url, url_label, tab_ids, show_on_card, placement, font_family, font_size, marquee_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
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
                $msg['celebration_effect'] ?? 'none',
                $cc,
                $msg['url'] ?? null,
                $msg['url_label'] ?? null,
                tileMessageTabIdsForStorage(
                    isset($msg['tab_ids']) && $msg['tab_ids'] !== '' ? json_decode((string)$msg['tab_ids'], true) : null
                ),
                !empty($msg['show_on_card']) ? 1 : 0,
                tileMessagePlacementForStorage($msg['placement'] ?? null),
                tileMessageFontFamilyForStorage($msg['font_family'] ?? null),
                tileMessageFontSizeForStorage($msg['font_size'] ?? null),
                tileMessageMarqueeSecondsForStorage($msg['marquee_seconds'] ?? null)
            ]);
        }
    }
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
    
        $newTileId = generateUuid();

        $maxPositionStmt = $db->prepare('SELECT MAX(position) as max_pos FROM tiles');
        $maxPositionStmt->execute();
        $maxPosRow = $maxPositionStmt->fetch();
        $newPosition = ($maxPosRow && $maxPosRow['max_pos'] !== null) ? (int)$maxPosRow['max_pos'] + 1 : 0;

        $newTitle = 'Copy of ' . $originalTile['title'];
        $newSourceTab = isset($originalTile['source_tab']) && trim($originalTile['source_tab']) === 'staging' ? 'staging' : 'public';

        cloneTileRecordAndContents($db, $originalTile, $newTileId, [
            'title' => $newTitle,
            'user_id' => $user['id'],
            'source_tab' => $newSourceTab,
            'position' => $newPosition,
        ]);

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

    // Read body once (php://input can only be read a single time).
    $sourceTab = 'public';
    $rawInput = @file_get_contents('php://input');
    $body = [];
    if ($rawInput !== false && $rawInput !== '') {
        $decoded = json_decode($rawInput, true);
        if (is_array($decoded)) {
            $body = $decoded;
            if (isset($body['sourceTab']) && trim((string)$body['sourceTab']) === 'staging') {
                $sourceTab = 'staging';
            } elseif (isset($body['source_tab']) && trim((string)$body['source_tab']) === 'staging') {
                $sourceTab = 'staging';
            }
        }
    }

    // Prefer JSON body so names with spaces/special chars never sit in the URL
    // (Apache 2.4 returns 403 for unescaped spaces in rewritten PATH_INFO).
    $categoryName = trim((string)$categoryName);
    if ($categoryName === '') {
        $categoryName = trim((string)($body['categoryName'] ?? $body['category'] ?? ''));
    }

    if ($categoryName === '') {
        sendJSON(['error' => 'Invalid category name'], 400);
    }
    
    // Log the attempt for debugging
    error_log('Clone category attempt: User ' . $user['id'] . ' (' . $user['username'] . '), is_admin=' . ($user['is_admin'] ? 'true' : 'false') . ', category="' . $categoryName . '"');

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
    
    // Keep the original spacing. Only use hyphens in the Copy suffix when
    // the source name is already hyphen-separated (no spaces).
    // "BUSINESS IT SERVICES" -> "BUSINESS IT SERVICES Copy"
    // "My-Category" -> "My-Category-Copy"
    $baseName = $categoryName;
    $usesHyphens = strpos($baseName, '-') !== false && strpos($baseName, ' ') === false;
    $copySeparator = $usesHyphens ? '-' : ' ';
    if (preg_match('/(?:^|[\s-])copy(?:[\s-]\d+)?$/i', $baseName)) {
        $newCategoryName = $baseName;
    } else {
        $newCategoryName = $baseName . $copySeparator . 'Copy';
    }

    // If that name is taken, append 2, 3, ... with the same separator
    $counter = 2;
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
            break;
        }

        $finalCategoryName = $newCategoryName . $copySeparator . $counter;
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
            
            $newTileId = generateUuid();
            $newTitle = $originalTile['title'];

            cloneTileRecordAndContents($db, $originalTile, $newTileId, [
                'title' => $newTitle,
                'group' => $finalCategoryName,
                'user_id' => $user['id'],
                'source_tab' => $sourceTab,
                'position' => $nextPosition++,
            ]);

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
                        $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, text_color, background_color, background_style, force_stacked_view, ignore_side_by_side, show_read_aloud, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                        $sectionStmt->execute([
                            $sectionId,
                            $tileId,
                            $tabId, // Now associated with the tab
                            $sectionTitle,
                            null,
                            null,
                            null,
                            0,
                            0,
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
    if ($value === '' || !preg_match('/[ðÃâŸïÂ]/u', $value)) {
        return $value;
    }
    // Reinterpret Windows-1252 (then Latin-1) code units as the original UTF-8 bytes.
    // ISO-8859-1 cannot round-trip 🔗 (bytes 0x9F/0x94/0x97 are cp1252 Ÿ “ —).
    $asBytes = @mb_convert_encoding($value, 'Windows-1252', 'UTF-8');
    if ($asBytes === false || $asBytes === '') {
        $asBytes = @mb_convert_encoding($value, 'ISO-8859-1', 'UTF-8');
    }
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
        $updateStmt = $db->prepare('UPDATE tiles SET archived_at = ?, archived_by = ?, archived_by_username = ? WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL');
        foreach ($tiles as $tile) {
            $updateStmt->execute([$currentTime, (int)$user['id'], (string)($user['username'] ?? ''), $tile['id']]);
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
        $updateStmt = $db->prepare('UPDATE tiles SET archived_at = NULL, archived_by = NULL, archived_by_username = NULL WHERE id = ? AND archived_at IS NOT NULL AND deleted_at IS NULL');
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

/**
 * Map a joined link+tile DB row into the FavoriteLink API shape.
 */
function mapFavoriteLinkRow(array $row): array {
    $health = null;
    if (!empty($row['health_status']) && !isNonHttpLinkHealthUrl($row['url'] ?? '')) {
        $health = [
            'status' => $row['health_status'],
            'httpCode' => $row['health_http_code'] ?? null,
            'error' => $row['health_error'] ?? null,
            'checkedAt' => $row['health_checked_at'] ?? null
        ];
    }

    $mapped = [
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
        'inheritShortUrls' => mapInheritShortUrlsFromRow($row),
        'maintenanceEnabled' => !empty($row['maintenance_enabled']),
        'maintenanceMessage' => (isset($row['maintenance_message']) && trim((string)$row['maintenance_message']) !== '') ? $row['maintenance_message'] : null,
        'maintenanceVideoUrl' => (isset($row['maintenance_video_url']) && trim((string)$row['maintenance_video_url']) !== '') ? $row['maintenance_video_url'] : null,
        'notesVideoUrl' => (isset($row['notes_video_url']) && trim((string)$row['notes_video_url']) !== '') ? $row['notes_video_url'] : null,
        'infoVideoUrl' => (isset($row['info_video_url']) && trim((string)$row['info_video_url']) !== '') ? $row['info_video_url'] : null,
        'isFavorite' => true,
        'health' => $health,
        'tile' => [
            'id' => $row['tile_id'],
            'title' => $row['tile_title'] ?? 'Untitled',
            'emoji' => $row['tile_emoji'] ?? '✨',
            'themeColor' => $row['tile_theme_color'] ?? 'blue',
            'showShortUrls' => mapShowShortUrlsFromRow(['show_short_urls' => $row['tile_show_short_urls'] ?? 0])
                && mapInheritShortUrlsFromRow(['inherit_short_urls' => $row['tab_inherit_short_urls'] ?? 1])
                && mapInheritShortUrlsFromRow(['inherit_short_urls' => $row['section_inherit_short_urls'] ?? 1])
                && mapInheritShortUrlsFromRow($row),
        ]
    ];
    applyLinkFeatureTogglesToApi($mapped, $row);
                applyLinkOpenTargetToApi($mapped, $row);
                applyLinkMobilePreviewEmulationToApi($mapped, $row);
                applyLinkOpenInEmulationToApi($mapped, $row);
                applyLinkForceShortUrlToApi($mapped, $row);
                applyLinkBrokenStatusLabelToApi($mapped, $row);
    return $mapped;
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
                COALESCE(s.tile_id, tb.tile_id) as tile_id,
                t.title as tile_title,
                t.emoji as tile_emoji,
                t.theme_color as tile_theme_color,
                t.published as tile_published,
                t.show_short_urls as tile_show_short_urls,
                tb.inherit_short_urls as tab_inherit_short_urls,
                s.inherit_short_urls as section_inherit_short_urls,
                s.id as section_id
            FROM user_link_favorites ulf
            INNER JOIN links l ON l.id = ulf.link_id
            LEFT JOIN sections s ON l.section_id = s.id
            LEFT JOIN tabs tb ON s.tab_id = tb.id
            LEFT JOIN tiles t ON t.id = COALESCE(s.tile_id, tb.tile_id)
            WHERE ulf.user_id = ?
            AND (t.deleted_at IS NULL OR t.id IS NULL)
            AND (t.archived_at IS NULL OR t.id IS NULL)
            ORDER BY ulf.position ASC, ulf.created_at ASC
        ');
        $stmt->execute([$user['id']]);

        $favoriteLinks = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            // Skip if tile is missing (orphaned link)
            if (empty($row['tile_id'])) {
                continue;
            }

            // Unpublished links (or parent tile) are admin-only
            if (!canUserSeePublishedContent($user, $row)) {
                continue;
            }
            if (empty($user['is_admin']) && !isContentPublished(['published' => $row['tile_published'] ?? 1])) {
                continue;
            }

            // Keep the user's own favorites list intact (visibility/ACL was already
            // checked when they could open/favorite the link).
            $favoriteLinks[] = mapFavoriteLinkRow($row);
        }

        $byTile = [];
        foreach ($favoriteLinks as $idx => $fav) {
            $tid = (string)($fav['tile']['id'] ?? '');
            if ($tid === '') {
                continue;
            }
            $byTile[$tid][] = $idx;
        }
        foreach ($byTile as $tid => $indexes) {
            $ensure = !empty($favoriteLinks[$indexes[0]]['tile']['showShortUrls']);
            $targets = [['type' => 'tile', 'id' => $tid]];
            foreach ($indexes as $idx) {
                $targets[] = ['type' => 'link', 'id' => (string)$favoriteLinks[$idx]['id']];
            }
            $codes = $ensure
                ? ensureShortUrlsForTargets($db, $tid, $targets, $user['id'] ?? null)
                : lookupActiveShortUrlCodes($db, $targets);
            if (!$ensure) {
                $forceTargets = [];
                foreach ($indexes as $idx) {
                    if (!empty($favoriteLinks[$idx]['forceShortUrl'])) {
                        $forceTargets[] = ['type' => 'link', 'id' => (string)$favoriteLinks[$idx]['id']];
                    }
                }
                if ($forceTargets !== []) {
                    $codes = array_merge($codes, ensureShortUrlsForTargets($db, $tid, $forceTargets, $user['id'] ?? null));
                }
            }
            if (isset($codes['tile:' . $tid])) {
                foreach ($indexes as $idx) {
                    $favoriteLinks[$idx]['tile']['shortUrl'] = shortUrlForCode($codes['tile:' . $tid]);
                }
            }
            foreach ($indexes as $idx) {
                $key = 'link:' . $favoriteLinks[$idx]['id'];
                if (isset($codes[$key])) {
                    $favoriteLinks[$idx]['shortUrl'] = shortUrlForCode($codes[$key]);
                }
            }
        }

        sendJSON($favoriteLinks);
    } catch (Exception $e) {
        error_log('Error in handleGetFavoriteLinks: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to fetch favorite links', 'details' => $e->getMessage()], 500);
    }
}

/**
 * Persist favorite-link order for the current user.
 * Body: { "linkIds": ["id1", "id2", ...] } — positions assigned 0..n in array order.
 * Only link IDs that belong to the user are updated; unknown IDs are ignored.
 */
function handleSaveFavoriteLinksOrder() {
    try {
        $user = requireAuth();
        $db = getDB();
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data) || !isset($data['linkIds']) || !is_array($data['linkIds'])) {
            sendJSON(['error' => 'linkIds array is required'], 400);
            return;
        }

        $linkIds = [];
        foreach ($data['linkIds'] as $id) {
            if (!is_string($id) && !is_numeric($id)) {
                continue;
            }
            $trimmed = trim((string)$id);
            if ($trimmed === '' || isset($linkIds[$trimmed])) {
                continue;
            }
            $linkIds[$trimmed] = true;
        }
        $orderedIds = array_keys($linkIds);
        if (count($orderedIds) === 0) {
            sendJSON(['error' => 'No valid linkIds provided'], 400);
            return;
        }

        // Restrict to favorites owned by this user
        $placeholders = implode(',', array_fill(0, count($orderedIds), '?'));
        $ownedStmt = $db->prepare(
            "SELECT link_id FROM user_link_favorites WHERE user_id = ? AND link_id IN ($placeholders)"
        );
        $ownedStmt->execute(array_merge([$user['id']], $orderedIds));
        $owned = [];
        while ($row = $ownedStmt->fetch(PDO::FETCH_ASSOC)) {
            $owned[$row['link_id']] = true;
        }

        $updateStmt = $db->prepare(
            'UPDATE user_link_favorites SET position = ? WHERE user_id = ? AND link_id = ?'
        );
        $db->beginTransaction();
        $position = 0;
        $updated = 0;
        foreach ($orderedIds as $linkId) {
            if (!isset($owned[$linkId])) {
                continue;
            }
            $updateStmt->execute([$position, $user['id'], $linkId]);
            $updated += $updateStmt->rowCount() > 0 ? 1 : 0;
            $position++;
        }
        $db->commit();

        sendJSON(['success' => true, 'updated' => $updated, 'positions' => $position]);
    } catch (Exception $e) {
        if (isset($db) && $db->inTransaction()) {
            $db->rollBack();
        }
        error_log('Error in handleSaveFavoriteLinksOrder: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to save favorite link order', 'details' => $e->getMessage()], 500);
    }
}

/**
 * Resolve favorite-link payloads for a list of link IDs (used by guest public favorites).
 * Authenticated callers also get ACL-filtered results (useful for cache refresh).
 */
function handleResolveFavoriteLinks() {
    try {
        $user = getAuthenticatedUser();
        $db = getDB();
        $data = getJSONInput();
        $linkIds = $data['linkIds'] ?? $data['link_ids'] ?? [];
        if (!is_array($linkIds)) {
            sendJSON(['error' => 'linkIds must be an array'], 400);
        }

        // Sanitize + cap to avoid abuse
        $cleanIds = [];
        foreach ($linkIds as $id) {
            if (!is_string($id) && !is_numeric($id)) {
                continue;
            }
            $id = trim((string)$id);
            if ($id === '' || strlen($id) > 128) {
                continue;
            }
            $cleanIds[$id] = true;
            if (count($cleanIds) >= 200) {
                break;
            }
        }
        $cleanIds = array_keys($cleanIds);
        if (empty($cleanIds)) {
            sendJSON([]);
        }

        $userGroupIds = [];
        if ($user && empty($user['is_admin'])) {
            $groupStmt = $db->prepare('SELECT group_id FROM user_group_members WHERE user_id = ?');
            $groupStmt->execute([$user['id']]);
            while ($group = $groupStmt->fetch()) {
                $userGroupIds[] = (int)$group['group_id'];
            }
        }

        $placeholders = implode(',', array_fill(0, count($cleanIds), '?'));
        $stmt = $db->prepare('
            SELECT
                l.*,
                COALESCE(s.tile_id, tb.tile_id) as tile_id,
                t.title as tile_title,
                t.emoji as tile_emoji,
                t.theme_color as tile_theme_color,
                t.visibility as tile_visibility,
                t.allowed_users as tile_allowed_users,
                t.allowed_groups as tile_allowed_groups,
                t.published as tile_published,
                s.id as section_id
            FROM links l
            LEFT JOIN sections s ON l.section_id = s.id
            LEFT JOIN tabs tb ON s.tab_id = tb.id
            LEFT JOIN tiles t ON t.id = COALESCE(s.tile_id, tb.tile_id)
            WHERE l.id IN (' . $placeholders . ')
            AND t.id IS NOT NULL
            AND t.deleted_at IS NULL
            AND t.archived_at IS NULL
        ');
        $stmt->execute($cleanIds);

        $byId = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            if (empty($row['tile_id'])) {
                continue;
            }
            if (!canUserSeePublishedContent($user, $row)) {
                continue;
            }
            if (!($user && !empty($user['is_admin'])) && !isContentPublished(['published' => $row['tile_published'] ?? 1])) {
                continue;
            }

            $tileRow = [
                'visibility' => $row['tile_visibility'] ?? 'public',
                'allowed_users' => $row['tile_allowed_users'] ?? null,
                'allowed_groups' => $row['tile_allowed_groups'] ?? null,
            ];
            if (!canUserSeeByVisibility($user, $tileRow, $userGroupIds)) {
                continue;
            }
            if (!canUserSeeByVisibility($user, $row, $userGroupIds)) {
                continue;
            }

            $byId[$row['id']] = mapFavoriteLinkRow($row);
        }

        // Preserve caller order
        $favoriteLinks = [];
        foreach ($cleanIds as $id) {
            if (isset($byId[$id])) {
                $favoriteLinks[] = $byId[$id];
            }
        }

        sendJSON($favoriteLinks);
    } catch (Exception $e) {
        error_log('Error in handleResolveFavoriteLinks: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to resolve favorite links', 'details' => $e->getMessage()], 500);
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
            'searchTags' => decodeSearchTagsFromRow($row),
            'createdAt' => (int)$row['created_at'],
            'deletedAt' => (int)$row['deleted_at'],
            'visibility' => $tileVisibility,
            'allowedUsers' => $tileAllowedUsers,
            'allowedGroups' => $tileAllowedGroups,
            'isFavorite' => $isFavorite,
            'isHyperlink' => isset($row['is_hyperlink']) ? (bool)$row['is_hyperlink'] : false,
            'hyperlinkUrl' => $row['hyperlink_url'] ?? null,
            'openInNewTab' => isset($row['open_in_new_tab']) ? (bool)$row['open_in_new_tab'] : null,
            'isVideo' => isset($row['is_video']) ? (bool)$row['is_video'] : false,
            'videoUrl' => $row['video_url'] ?? null,
            'videoSource' => (isset($row['video_source']) && in_array($row['video_source'], ['youtube', 'file'], true)) ? $row['video_source'] : null,
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
            'headerImageZoom' => isset($row['header_image_zoom']) && $row['header_image_zoom'] !== null && $row['header_image_zoom'] !== '' ? max(50, min(300, (int)$row['header_image_zoom'])) : null,
            'headerImageFit' => (isset($row['header_image_fit']) && in_array($row['header_image_fit'], ['contain','cover'], true)) ? $row['header_image_fit'] : null,
            'showEmoji' => !(isset($row['show_emoji']) && ((int)$row['show_emoji'] === 0 || $row['show_emoji'] === '0' || $row['show_emoji'] === false)),
            'emojiImage' => !empty($row['emoji_image']) ? $row['emoji_image'] : null,
            'emojiImageOpacity' => !empty($row['emoji_image']) && isset($row['emoji_image_opacity']) && $row['emoji_image_opacity'] !== null && $row['emoji_image_opacity'] !== '' ? max(0, min(100, (int)$row['emoji_image_opacity'])) : null,
            'emojiImageOffsetX' => !empty($row['emoji_image']) && isset($row['emoji_image_offset_x']) && $row['emoji_image_offset_x'] !== null && $row['emoji_image_offset_x'] !== '' ? max(-50, min(50, (int)$row['emoji_image_offset_x'])) : null,
            'emojiImageOffsetY' => !empty($row['emoji_image']) && isset($row['emoji_image_offset_y']) && $row['emoji_image_offset_y'] !== null && $row['emoji_image_offset_y'] !== '' ? max(-50, min(50, (int)$row['emoji_image_offset_y'])) : null,
            'emojiImageZoom' => !empty($row['emoji_image']) && isset($row['emoji_image_zoom']) && $row['emoji_image_zoom'] !== null && $row['emoji_image_zoom'] !== '' ? max(50, min(300, (int)$row['emoji_image_zoom'])) : null,
            'showTitle' => !(isset($row['show_title']) && ((int)$row['show_title'] === 0 || $row['show_title'] === '0' || $row['show_title'] === false)),
            'showDescription' => !(isset($row['show_description']) && ((int)$row['show_description'] === 0 || $row['show_description'] === '0' || $row['show_description'] === false)),
            'showShortUrls' => mapShowShortUrlsFromRow($row),
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
                        'emoji' => contentEmojiFromRow($tabRow),
                'position' => (int)($tabRow['position'] ?? 0),
                'textColor' => (!empty($tabRow['text_color']) && trim($tabRow['text_color']) !== '') ? trim($tabRow['text_color']) : null,
                'backgroundColor' => backgroundColorFromRowOrInput($tabRow),
                'backgroundGradientEnabled' => backgroundDecorationFromRow($tabRow)['backgroundGradientEnabled'],
                'backgroundGradientColors' => backgroundDecorationFromRow($tabRow)['backgroundGradientColors'],
                'backgroundGradientDirection' => backgroundDecorationFromRow($tabRow)['backgroundGradientDirection'],
                'backgroundGradientType' => backgroundDecorationFromRow($tabRow)['backgroundGradientType'],
                'backgroundGradientColorPositions' => backgroundDecorationFromRow($tabRow)['backgroundGradientColorPositions'],
                'inheritShortUrls' => mapInheritShortUrlsFromRow($tabRow),
                'visibleFrom' => $tabRow['visible_from'] ?? null,
                'expiresAt' => $tabRow['expires_at'] ?? null,
                'accessRestrictions' => decodeAccessRestrictionsJson($tabRow['access_restrictions'] ?? null),
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
                                'emoji' => contentEmojiFromRow($sectionRow),
                    'textColor' => (!empty($sectionRow['text_color']) && trim($sectionRow['text_color']) !== '') ? trim($sectionRow['text_color']) : null,
                    'backgroundColor' => backgroundColorFromRowOrInput($sectionRow),
                    'backgroundGradientEnabled' => backgroundDecorationFromRow($sectionRow)['backgroundGradientEnabled'],
                    'backgroundGradientColors' => backgroundDecorationFromRow($sectionRow)['backgroundGradientColors'],
                    'backgroundGradientDirection' => backgroundDecorationFromRow($sectionRow)['backgroundGradientDirection'],
                    'backgroundGradientType' => backgroundDecorationFromRow($sectionRow)['backgroundGradientType'],
                    'backgroundGradientColorPositions' => backgroundDecorationFromRow($sectionRow)['backgroundGradientColorPositions'],
                    'visibleFrom' => $sectionRow['visible_from'] ?? null,
                    'expiresAt' => $sectionRow['expires_at'] ?? null,
                    'forceStackedView' => isset($sectionRow['force_stacked_view']) && $sectionRow['force_stacked_view'] == 1 ? true : false,
                                'ignoreSideBySide' => isset($sectionRow['ignore_side_by_side']) && $sectionRow['ignore_side_by_side'] == 1 ? true : false,
                                'showReadAloud' => sectionShowReadAloudFlag($sectionRow),
                                'inheritShortUrls' => mapInheritShortUrlsFromRow($sectionRow),
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
                        'inheritShortUrls' => mapInheritShortUrlsFromRow($linkRow),
                        'visibility' => $linkRow['visibility'] ?? 'public',
                        'allowedUsers' => $linkRow['allowed_users'] ? json_decode($linkRow['allowed_users'], true) : [],
                        'allowedGroups' => isset($linkRow['allowed_groups']) && $linkRow['allowed_groups'] ? json_decode($linkRow['allowed_groups'], true) : [],
                        'notes' => $linkRow['notes'] ?? null,
                        'tooltip' => $linkRow['tooltip'] ?? null,
                        'richTextContent' => $linkRow['rich_text_content'] ?? null,
                        'visibleFrom' => $linkRow['visible_from'] ?? null,
                        'expiresAt' => $linkRow['expires_at'] ?? null,
                        'accessRestrictions' => decodeAccessRestrictionsJson($linkRow['access_restrictions'] ?? null),
                        'browser' => $linkRow['browser'] ?? null,
                        'animation' => $linkRow['animation'] ?? null,
                    ];
                    
                    // Include health data if available
                    if (isset($linkRow['health_status']) && !isNonHttpLinkHealthUrl($linkRow['url'] ?? '')) {
                        $link['health'] = [
                            'status' => $linkRow['health_status'] ?? 'unknown',
                            'httpCode' => $linkRow['health_http_code'] ? (int)$linkRow['health_http_code'] : null,
                            'error' => $linkRow['health_error'],
                            'checkedAt' => $linkRow['health_checked_at'] ? (int)$linkRow['health_checked_at'] : null
                        ];
                    }
                    
                    applyLinkMaintenanceToApi($link, $linkRow);
                    applyLinkNotesInfoVideoToApi($link, $linkRow);
                    applyLinkFeatureTogglesToApi($link, $linkRow);
                applyLinkOpenTargetToApi($link, $linkRow);
                applyLinkMobilePreviewEmulationToApi($link, $linkRow);
                applyLinkOpenInEmulationToApi($link, $linkRow);
                applyLinkForceShortUrlToApi($link, $linkRow);
                applyLinkBrokenStatusLabelToApi($link, $linkRow);
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
                'searchTags' => decodeSearchTagsFromRow($row),
                'createdAt' => (int)$row['created_at'],
                'archivedAt' => isset($row['archived_at']) && $row['archived_at'] !== null ? (int)$row['archived_at'] : null,
                'visibility' => $tileVisibility,
                'allowedUsers' => $tileAllowedUsers,
                'allowedGroups' => $tileAllowedGroups,
                'isFavorite' => $isFavorite,
                'isHyperlink' => isset($row['is_hyperlink']) ? (bool)$row['is_hyperlink'] : false,
                'hyperlinkUrl' => $row['hyperlink_url'] ?? null,
                'openInNewTab' => isset($row['open_in_new_tab']) ? (bool)$row['open_in_new_tab'] : null,
                'isVideo' => isset($row['is_video']) ? (bool)$row['is_video'] : false,
                'videoUrl' => $row['video_url'] ?? null,
                'videoSource' => (isset($row['video_source']) && in_array($row['video_source'], ['youtube', 'file'], true)) ? $row['video_source'] : null,
                'canView' => $canView,
                'canEdit' => false, // Archived tiles cannot be edited
                'canDelete' => $canDelete, // Allow delete from archive (moves to recycle bin)
                'visibleFrom' => $row['visible_from'] ?? null,
                'expiresAt' => $row['expires_at'] ?? null,
                'accessRestrictions' => decodeAccessRestrictionsJson($row['access_restrictions'] ?? null),
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
                'headerImageZoom' => isset($row['header_image_zoom']) && $row['header_image_zoom'] !== null && $row['header_image_zoom'] !== '' ? max(50, min(300, (int)$row['header_image_zoom'])) : null,
                'headerImageFit' => (isset($row['header_image_fit']) && in_array($row['header_image_fit'], ['contain','cover'], true)) ? $row['header_image_fit'] : null,
                'showEmoji' => !(isset($row['show_emoji']) && ((int)$row['show_emoji'] === 0 || $row['show_emoji'] === '0' || $row['show_emoji'] === false)),
                'emojiImage' => !empty($row['emoji_image']) ? $row['emoji_image'] : null,
                'emojiImageOpacity' => !empty($row['emoji_image']) && isset($row['emoji_image_opacity']) && $row['emoji_image_opacity'] !== null && $row['emoji_image_opacity'] !== '' ? max(0, min(100, (int)$row['emoji_image_opacity'])) : null,
                'emojiImageOffsetX' => !empty($row['emoji_image']) && isset($row['emoji_image_offset_x']) && $row['emoji_image_offset_x'] !== null && $row['emoji_image_offset_x'] !== '' ? max(-50, min(50, (int)$row['emoji_image_offset_x'])) : null,
                'emojiImageOffsetY' => !empty($row['emoji_image']) && isset($row['emoji_image_offset_y']) && $row['emoji_image_offset_y'] !== null && $row['emoji_image_offset_y'] !== '' ? max(-50, min(50, (int)$row['emoji_image_offset_y'])) : null,
                'emojiImageZoom' => !empty($row['emoji_image']) && isset($row['emoji_image_zoom']) && $row['emoji_image_zoom'] !== null && $row['emoji_image_zoom'] !== '' ? max(50, min(300, (int)$row['emoji_image_zoom'])) : null,
                'showTitle' => !(isset($row['show_title']) && ((int)$row['show_title'] === 0 || $row['show_title'] === '0' || $row['show_title'] === false)),
                'showDescription' => !(isset($row['show_description']) && ((int)$row['show_description'] === 0 || $row['show_description'] === '0' || $row['show_description'] === false)),
            'showShortUrls' => mapShowShortUrlsFromRow($row),
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
                        'emoji' => contentEmojiFromRow($tabRow),
                    'position' => isset($tabRow['position']) ? (int)$tabRow['position'] : 0,
                    'textColor' => (!empty($tabRow['text_color']) && trim($tabRow['text_color']) !== '') ? trim($tabRow['text_color']) : null,
                'backgroundColor' => backgroundColorFromRowOrInput($tabRow),
                'backgroundGradientEnabled' => backgroundDecorationFromRow($tabRow)['backgroundGradientEnabled'],
                'backgroundGradientColors' => backgroundDecorationFromRow($tabRow)['backgroundGradientColors'],
                'backgroundGradientDirection' => backgroundDecorationFromRow($tabRow)['backgroundGradientDirection'],
                'backgroundGradientType' => backgroundDecorationFromRow($tabRow)['backgroundGradientType'],
                'backgroundGradientColorPositions' => backgroundDecorationFromRow($tabRow)['backgroundGradientColorPositions'],
                'inheritShortUrls' => mapInheritShortUrlsFromRow($tabRow),
                    'visibleFrom' => $tabRow['visible_from'] ?? null,
                    'expiresAt' => $tabRow['expires_at'] ?? null,
                    'accessRestrictions' => decodeAccessRestrictionsJson($tabRow['access_restrictions'] ?? null),
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
                                'emoji' => contentEmojiFromRow($sectionRow),
                        'textColor' => (!empty($sectionRow['text_color']) && trim($sectionRow['text_color']) !== '') ? trim($sectionRow['text_color']) : null,
                        'backgroundColor' => backgroundColorFromRowOrInput($sectionRow),
                        'backgroundGradientEnabled' => backgroundDecorationFromRow($sectionRow)['backgroundGradientEnabled'],
                        'backgroundGradientColors' => backgroundDecorationFromRow($sectionRow)['backgroundGradientColors'],
                        'backgroundGradientDirection' => backgroundDecorationFromRow($sectionRow)['backgroundGradientDirection'],
                        'backgroundGradientType' => backgroundDecorationFromRow($sectionRow)['backgroundGradientType'],
                        'backgroundGradientColorPositions' => backgroundDecorationFromRow($sectionRow)['backgroundGradientColorPositions'],
                        'visibleFrom' => $sectionRow['visible_from'] ?? null,
                        'expiresAt' => $sectionRow['expires_at'] ?? null,
                        'forceStackedView' => isset($sectionRow['force_stacked_view']) && $sectionRow['force_stacked_view'] == 1 ? true : false,
                                'ignoreSideBySide' => isset($sectionRow['ignore_side_by_side']) && $sectionRow['ignore_side_by_side'] == 1 ? true : false,
                                'showReadAloud' => sectionShowReadAloudFlag($sectionRow),
                                'inheritShortUrls' => mapInheritShortUrlsFromRow($sectionRow),
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
                        'inheritShortUrls' => mapInheritShortUrlsFromRow($linkRow),
                            'visibility' => $linkRow['visibility'] ?? 'public',
                            'allowedUsers' => $linkRow['allowed_users'] ? json_decode($linkRow['allowed_users'], true) : [],
                            'notes' => $linkRow['notes'] ?? null,
                            'tooltip' => $linkRow['tooltip'] ?? null,
                            'visibleFrom' => $linkRow['visible_from'] ?? null,
                            'expiresAt' => $linkRow['expires_at'] ?? null,
                            'accessRestrictions' => decodeAccessRestrictionsJson($linkRow['access_restrictions'] ?? null),
                            'browser' => $linkRow['browser'] ?? null,
                            'animation' => $linkRow['animation'] ?? null,
                        ];
                        
                        if (isset($linkRow['health_status']) && !isNonHttpLinkHealthUrl($linkRow['url'] ?? '')) {
                            $link['health'] = [
                                'status' => $linkRow['health_status'] ?? 'unknown',
                                'httpCode' => $linkRow['health_http_code'] ? (int)$linkRow['health_http_code'] : null,
                                'error' => $linkRow['health_error'],
                                'checkedAt' => $linkRow['health_checked_at'] ? (int)$linkRow['health_checked_at'] : null
                            ];
                        }
                        
                    applyLinkMaintenanceToApi($link, $linkRow);
                    applyLinkNotesInfoVideoToApi($link, $linkRow);
                    applyLinkFeatureTogglesToApi($link, $linkRow);
                applyLinkOpenTargetToApi($link, $linkRow);
                applyLinkMobilePreviewEmulationToApi($link, $linkRow);
                applyLinkOpenInEmulationToApi($link, $linkRow);
                applyLinkForceShortUrlToApi($link, $linkRow);
                applyLinkBrokenStatusLabelToApi($link, $linkRow);
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
    $checkStmt = $db->prepare('SELECT id, user_id, title FROM tiles WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL');
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
    
    // Archive the tile: record when it happened and who did it (shown in the Archived banner)
    try {
        $stmt = $db->prepare('UPDATE tiles SET archived_at = ?, archived_by = ?, archived_by_username = ? WHERE id = ?');
        $result = $stmt->execute([
            time(),
            (int)$user['id'],
            (string)($user['username'] ?? ''),
            $tileId,
        ]);

        if (!$result) {
            error_log('Failed to archive tile: ' . json_encode($stmt->errorInfo()));
            sendJSON(['error' => 'Failed to archive tile', 'details' => 'Database update failed'], 500);
            return;
        }

        logUserAudit('space.archived', [
            'details' => [
                'tile_id' => $tileId,
                'title' => (string)($tile['title'] ?? ''),
            ],
        ]);

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
    $checkStmt = $db->prepare('SELECT id, user_id, title FROM tiles WHERE id = ? AND archived_at IS NOT NULL AND deleted_at IS NULL');
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
    
    // Unarchive tile: clear the archive timestamp and the "archived by" actor
    $stmt = $db->prepare('UPDATE tiles SET archived_at = NULL, archived_by = NULL, archived_by_username = NULL WHERE id = ?');
    $stmt->execute([$tileId]);

    logUserAudit('space.unarchived', [
        'details' => [
            'tile_id' => $tileId,
            'title' => (string)($tile['title'] ?? ''),
        ],
    ]);

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

    purgeTileMaintvidUploads($db, $tileId, true);
    
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

    foreach ($deletedTiles as $deletedTile) {
        if (!empty($deletedTile['id'])) {
            purgeTileMaintvidUploads($db, (string)$deletedTile['id'], true);
        }
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

    if ($user['is_admin']) {
        $listStmt = $db->prepare('SELECT id FROM tiles WHERE deleted_at IS NOT NULL');
        $listStmt->execute();
    } else {
        $listStmt = $db->prepare('SELECT id FROM tiles WHERE deleted_at IS NOT NULL AND user_id = ?');
        $listStmt->execute([$user['id']]);
    }
    $toPurge = $listStmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($toPurge as $row) {
        if (!empty($row['id'])) {
            purgeTileMaintvidUploads($db, (string)$row['id'], true);
        }
    }
    
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
        'searchTags' => decodeSearchTagsFromRow($row),
        'visibility' => $row['visibility'] ?? 'public',
        'published' => isContentPublished($row),
        'allowedUsers' => $row['allowed_users'] ? json_decode($row['allowed_users'], true) : [],
        'isHyperlink' => isset($row['is_hyperlink']) ? (bool)$row['is_hyperlink'] : false,
        'hyperlinkUrl' => $row['hyperlink_url'] ?? null,
        'openInNewTab' => isset($row['open_in_new_tab']) ? (bool)$row['open_in_new_tab'] : false,
        'isVideo' => isset($row['is_video']) ? (bool)$row['is_video'] : false,
        'videoUrl' => $row['video_url'] ?? null,
        'videoSource' => (isset($row['video_source']) && in_array($row['video_source'], ['youtube', 'file'], true)) ? $row['video_source'] : null,
        'browser' => isset($row['browser']) ? $row['browser'] : null,
        'visibleFrom' => $row['visible_from'] ?? null,
        'expiresAt' => $row['expires_at'] ?? null,
        'accessRestrictions' => decodeAccessRestrictionsJson($row['access_restrictions'] ?? null),
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
        'headerImageZoom' => isset($row['header_image_zoom']) && $row['header_image_zoom'] !== null && $row['header_image_zoom'] !== '' ? max(50, min(300, (int)$row['header_image_zoom'])) : null,
        'headerImageFit' => (isset($row['header_image_fit']) && in_array($row['header_image_fit'], ['contain','cover'], true)) ? $row['header_image_fit'] : null,
        'showEmoji' => !(isset($row['show_emoji']) && ((int)$row['show_emoji'] === 0 || $row['show_emoji'] === '0' || $row['show_emoji'] === false)),
        'emojiImage' => !empty($row['emoji_image']) ? $row['emoji_image'] : null,
        'emojiImageOpacity' => !empty($row['emoji_image']) && isset($row['emoji_image_opacity']) && $row['emoji_image_opacity'] !== null && $row['emoji_image_opacity'] !== '' ? max(0, min(100, (int)$row['emoji_image_opacity'])) : null,
        'emojiImageOffsetX' => !empty($row['emoji_image']) && isset($row['emoji_image_offset_x']) && $row['emoji_image_offset_x'] !== null && $row['emoji_image_offset_x'] !== '' ? max(-50, min(50, (int)$row['emoji_image_offset_x'])) : null,
        'emojiImageOffsetY' => !empty($row['emoji_image']) && isset($row['emoji_image_offset_y']) && $row['emoji_image_offset_y'] !== null && $row['emoji_image_offset_y'] !== '' ? max(-50, min(50, (int)$row['emoji_image_offset_y'])) : null,
        'emojiImageZoom' => !empty($row['emoji_image']) && isset($row['emoji_image_zoom']) && $row['emoji_image_zoom'] !== null && $row['emoji_image_zoom'] !== '' ? max(50, min(300, (int)$row['emoji_image_zoom'])) : null,
            'showTitle' => !(isset($row['show_title']) && ((int)$row['show_title'] === 0 || $row['show_title'] === '0' || $row['show_title'] === false)),
            'showDescription' => !(isset($row['show_description']) && ((int)$row['show_description'] === 0 || $row['show_description'] === '0' || $row['show_description'] === false)),
            'showShortUrls' => mapShowShortUrlsFromRow($row),
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
            'tabIds' => tileMessageTabIdsFromRow($msgRow),
            'showOnCard' => tileMessageShowOnCardFromRow($msgRow),
            'placement' => tileMessagePlacementFromRow($msgRow),
            'fontFamily' => tileMessageFontFamilyFromRow($msgRow),
            'fontSize' => tileMessageFontSizeFromRow($msgRow),
            'marqueeSeconds' => tileMessageMarqueeSecondsFromRow($msgRow),
            'animationType' => $msgRow['animation_type'] ?? 'rollover',
            'delayBefore' => isset($msgRow['delay_before']) ? (float)$msgRow['delay_before'] : 0,
            'celebrationEffect' => $msgRow['celebration_effect'] ?? 'none',
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
                        'emoji' => contentEmojiFromRow($tabRow),
            'position' => (int)($tabRow['position'] ?? 0),
            'textColor' => (!empty($tabRow['text_color']) && trim($tabRow['text_color']) !== '') ? trim($tabRow['text_color']) : null,
                'backgroundColor' => backgroundColorFromRowOrInput($tabRow),
                'backgroundGradientEnabled' => backgroundDecorationFromRow($tabRow)['backgroundGradientEnabled'],
                'backgroundGradientColors' => backgroundDecorationFromRow($tabRow)['backgroundGradientColors'],
                'backgroundGradientDirection' => backgroundDecorationFromRow($tabRow)['backgroundGradientDirection'],
                'backgroundGradientType' => backgroundDecorationFromRow($tabRow)['backgroundGradientType'],
                'backgroundGradientColorPositions' => backgroundDecorationFromRow($tabRow)['backgroundGradientColorPositions'],
                'inheritShortUrls' => mapInheritShortUrlsFromRow($tabRow),
            'visibleFrom' => $tabRow['visible_from'] ?? null,
            'expiresAt' => $tabRow['expires_at'] ?? null,
            'accessRestrictions' => decodeAccessRestrictionsJson($tabRow['access_restrictions'] ?? null),
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
                                'emoji' => contentEmojiFromRow($sectionRow),
                    'textColor' => (!empty($sectionRow['text_color']) && trim($sectionRow['text_color']) !== '') ? trim($sectionRow['text_color']) : null,
                'backgroundColor' => backgroundColorFromRowOrInput($sectionRow),
                'backgroundGradientEnabled' => backgroundDecorationFromRow($sectionRow)['backgroundGradientEnabled'],
                'backgroundGradientColors' => backgroundDecorationFromRow($sectionRow)['backgroundGradientColors'],
                'backgroundGradientDirection' => backgroundDecorationFromRow($sectionRow)['backgroundGradientDirection'],
                'backgroundGradientType' => backgroundDecorationFromRow($sectionRow)['backgroundGradientType'],
                'backgroundGradientColorPositions' => backgroundDecorationFromRow($sectionRow)['backgroundGradientColorPositions'],
                'visibleFrom' => $sectionRow['visible_from'] ?? null,
                'expiresAt' => $sectionRow['expires_at'] ?? null,
                'forceStackedView' => isset($sectionRow['force_stacked_view']) && $sectionRow['force_stacked_view'] == 1 ? true : false,
                                'ignoreSideBySide' => isset($sectionRow['ignore_side_by_side']) && $sectionRow['ignore_side_by_side'] == 1 ? true : false,
                                'showReadAloud' => sectionShowReadAloudFlag($sectionRow),
                                'inheritShortUrls' => mapInheritShortUrlsFromRow($sectionRow),
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
                    'inheritShortUrls' => mapInheritShortUrlsFromRow($linkRow),
                    'visibility' => $linkRow['visibility'] ?? 'public',
                    'published' => isContentPublished($linkRow),
                    'allowedUsers' => $linkRow['allowed_users'] ? json_decode($linkRow['allowed_users'], true) : [],
                    'allowedGroups' => isset($linkRow['allowed_groups']) && $linkRow['allowed_groups'] ? json_decode($linkRow['allowed_groups'], true) : [],
                    'notes' => isset($linkRow['notes']) ? $linkRow['notes'] : null,
                    'tooltip' => isset($linkRow['tooltip']) ? $linkRow['tooltip'] : null,
                    'visibleFrom' => isset($linkRow['visible_from']) ? $linkRow['visible_from'] : null,
                    'expiresAt' => isset($linkRow['expires_at']) ? $linkRow['expires_at'] : null,
                    'accessRestrictions' => decodeAccessRestrictionsJson($linkRow['access_restrictions'] ?? null),
                    'browser' => isset($linkRow['browser']) ? $linkRow['browser'] : null,
                    'animation' => isset($linkRow['animation']) ? $linkRow['animation'] : null,
                    'position' => (int)($linkRow['position'] ?? 0),
                    'richTextContent' => isset($linkRow['rich_text_content']) ? $linkRow['rich_text_content'] : null,
                    'isFavorite' => false // Not needed for versioning usually, but good for completeness
                ];
                applyLinkMaintenanceToApi($link, $linkRow);
                applyLinkNotesInfoVideoToApi($link, $linkRow);
                applyLinkFeatureTogglesToApi($link, $linkRow);
                applyLinkOpenTargetToApi($link, $linkRow);
                applyLinkMobilePreviewEmulationToApi($link, $linkRow);
                applyLinkOpenInEmulationToApi($link, $linkRow);
                applyLinkForceShortUrlToApi($link, $linkRow);
                applyLinkBrokenStatusLabelToApi($link, $linkRow);
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

        // Handle video space fields
        $isVideo = isset($data['isVideo']) && $data['isVideo'] ? 1 : 0;
        $videoUrl = isset($data['videoUrl']) && is_string($data['videoUrl']) && trim($data['videoUrl']) !== '' ? trim($data['videoUrl']) : null;
        $videoSource = isset($data['videoSource']) && in_array($data['videoSource'], ['youtube', 'file'], true) ? $data['videoSource'] : null;
        if ($isVideo) {
            $isHyperlink = 0;
            $hyperlinkUrl = null;
            $openInNewTab = 0;
        } else {
            $videoUrl = null;
            $videoSource = null;
        }
        if ($isHyperlink) {
            $isVideo = 0;
            $videoUrl = null;
            $videoSource = null;
        }
        
        // Handle scheduling fields
        $visibleFrom = isset($data['visibleFrom']) && $data['visibleFrom'] ? $data['visibleFrom'] : null;
        $expiresAt = isset($data['expiresAt']) && $data['expiresAt'] ? $data['expiresAt'] : null;
        if (array_key_exists('accessRestrictions', $data)) {
            $tileAccessRestrictions = encodeAccessRestrictionsJson($data['accessRestrictions'] ?? null);
        } else {
            $tileAccessRestrictions = encodeAccessRestrictionsJson(
                is_array($currentTileData) ? ($currentTileData['accessRestrictions'] ?? null) : null
            );
        }
        
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

        $emojiImageOpacity = array_key_exists('emojiImageOpacity', $data)
            ? (($emojiImage !== null && isset($data['emojiImageOpacity']) && is_numeric($data['emojiImageOpacity']))
                ? max(0, min(100, (int)$data['emojiImageOpacity']))
                : ($emojiImage !== null ? 100 : null))
            : ($emojiImage !== null
                ? (isset($currentTileData['emojiImageOpacity']) ? max(0, min(100, (int)$currentTileData['emojiImageOpacity']))
                    : (isset($currentTileData['emoji_image_opacity']) ? max(0, min(100, (int)$currentTileData['emoji_image_opacity'])) : 100))
                : null);

        $emojiImageOffsetX = array_key_exists('emojiImageOffsetX', $data)
            ? (($emojiImage !== null && isset($data['emojiImageOffsetX']) && is_numeric($data['emojiImageOffsetX']))
                ? max(-50, min(50, (int)$data['emojiImageOffsetX']))
                : ($emojiImage !== null ? 0 : null))
            : ($emojiImage !== null
                ? (isset($currentTileData['emojiImageOffsetX']) ? max(-50, min(50, (int)$currentTileData['emojiImageOffsetX']))
                    : (isset($currentTileData['emoji_image_offset_x']) ? max(-50, min(50, (int)$currentTileData['emoji_image_offset_x'])) : 0))
                : null);

        $emojiImageOffsetY = array_key_exists('emojiImageOffsetY', $data)
            ? (($emojiImage !== null && isset($data['emojiImageOffsetY']) && is_numeric($data['emojiImageOffsetY']))
                ? max(-50, min(50, (int)$data['emojiImageOffsetY']))
                : ($emojiImage !== null ? 0 : null))
            : ($emojiImage !== null
                ? (isset($currentTileData['emojiImageOffsetY']) ? max(-50, min(50, (int)$currentTileData['emojiImageOffsetY']))
                    : (isset($currentTileData['emoji_image_offset_y']) ? max(-50, min(50, (int)$currentTileData['emoji_image_offset_y'])) : 0))
                : null);

        $emojiImageZoom = array_key_exists('emojiImageZoom', $data)
            ? (($emojiImage !== null && isset($data['emojiImageZoom']) && is_numeric($data['emojiImageZoom']))
                ? max(50, min(300, (int)$data['emojiImageZoom']))
                : ($emojiImage !== null ? 100 : null))
            : ($emojiImage !== null
                ? (isset($currentTileData['emojiImageZoom']) ? max(50, min(300, (int)$currentTileData['emojiImageZoom']))
                    : (isset($currentTileData['emoji_image_zoom']) ? max(50, min(300, (int)$currentTileData['emoji_image_zoom'])) : 100))
                : null);

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

        if (array_key_exists('searchTags', $data) || array_key_exists('search_tags', $data)) {
            $searchTagsJson = encodeSearchTagsForStorage($data['searchTags'] ?? $data['search_tags'] ?? []);
        } else {
            $existingTags = $currentTileData['searchTags']
                ?? (isset($currentTileData['search_tags']) ? decodeSearchTagsFromRow($currentTileData) : []);
            $searchTagsJson = encodeSearchTagsForStorage(is_array($existingTags) ? $existingTags : []);
        }

        $headerImageOffsetY = array_key_exists('headerImageOffsetY', $data)
            ? (($headerImage !== null && isset($data['headerImageOffsetY']) && is_numeric($data['headerImageOffsetY']))
                ? max(-300, min(300, (int)$data['headerImageOffsetY']))
                : ($headerImage !== null ? 0 : null))
            : ($headerImage !== null
                ? (isset($currentTileData['headerImageOffsetY']) ? max(-300, min(300, (int)$currentTileData['headerImageOffsetY']))
                    : (isset($currentTileData['header_image_offset_y']) ? max(-300, min(300, (int)$currentTileData['header_image_offset_y'])) : 0))
                : null);

        $headerImageZoom = array_key_exists('headerImageZoom', $data)
            ? (($headerImage !== null && isset($data['headerImageZoom']) && is_numeric($data['headerImageZoom']))
                ? max(50, min(300, (int)$data['headerImageZoom']))
                : ($headerImage !== null ? 100 : null))
            : ($headerImage !== null
                ? (isset($currentTileData['headerImageZoom']) ? max(50, min(300, (int)$currentTileData['headerImageZoom']))
                    : (isset($currentTileData['header_image_zoom']) ? max(50, min(300, (int)$currentTileData['header_image_zoom'])) : 100))
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
        $stmt = $db->prepare('UPDATE tiles SET title = ?, description = ?, html_content = ?, emoji = ?, theme_color = ?, "group" = ?, visibility = ?, allowed_users = ?, allowed_groups = ?, is_hyperlink = ?, hyperlink_url = ?, open_in_new_tab = ?, is_video = ?, video_url = ?, video_source = ?, visible_from = ?, expires_at = ?, browser = ?, tile_background_color = ?, tile_gradient_enabled = ?, tile_gradient_colors = ?, tile_gradient_color_positions = ?, tile_gradient_direction = ?, tile_gradient_type = ?, tile_border_radius = ?, tile_text_color = ?, page_animation = ?, links_animation = ?, header_image = ?, header_image_align = ?, header_image_opacity = ?, header_image_offset_x = ?, header_image_offset_y = ?, header_image_zoom = ?, header_image_fit = ?, show_emoji = ?, emoji_image = ?, emoji_image_opacity = ?, emoji_image_offset_x = ?, emoji_image_offset_y = ?, emoji_image_zoom = ?, show_title = ?, show_description = ?, search_tags = ?, source_tab = ?, published = ?, access_restrictions = ? WHERE id = ?');
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
            $isVideo,
            $videoUrl,
            $videoSource,
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
            $headerImageZoom,
            $headerImageFit,
            $showEmoji,
            $emojiImage,
            $emojiImageOpacity,
            $emojiImageOffsetX,
            $emojiImageOffsetY,
            $emojiImageZoom,
            $showTitle,
            $showDescription,
            $searchTagsJson,
            $sourceTab,
            $published,
            $tileAccessRestrictions,
            $tileId
        ]);

        $oldVideoUrl = null;
        if (is_array($currentTileData)) {
            $oldVideoUrl = $currentTileData['videoUrl'] ?? $currentTileData['video_url'] ?? null;
            if (is_string($oldVideoUrl)) {
                $oldVideoUrl = trim($oldVideoUrl);
            } else {
                $oldVideoUrl = null;
            }
        }
        purgeReplacedTileVideoUpload($db, $tileId, $oldVideoUrl, $videoUrl);

        persistTileShowShortUrls($db, $tileId, $data, $currentTileData);

        if ($preserveNested) {
            // Metadata-only update: leave tabs, sections, links untouched.
            // Message Board edits from the home-grid edit modal still send messages —
            // apply them here so card-level saves can persist the board without wiping nested content.
            if (array_key_exists('messages', $data) && is_array($data['messages'])) {
                $db->prepare('DELETE FROM tile_messages WHERE tile_id = ?')->execute([$tileId]);
                if (!empty($data['messages'])) {
                    $msgStmt = $db->prepare('INSERT INTO tile_messages (id, tile_id, content, type, start_date, end_date, is_active, priority, text_color, font_style, display_location, animation_type, delay_before, celebration_effect, celebration_config, url, url_label, tab_ids, show_on_card, placement, font_family, font_size, marquee_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                    foreach ($data['messages'] as $msg) {
                        if (!is_array($msg)) {
                            continue;
                        }
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
                            $msg['celebrationEffect'] ?? 'none',
                            $cc,
                            $msg['url'] ?? null,
                            $msg['urlLabel'] ?? null,
                            tileMessageTabIdsForStorage($msg['tabIds'] ?? null),
                            !empty($msg['showOnCard']) ? 1 : 0,
                            tileMessagePlacementForStorage($msg['placement'] ?? null),
                            tileMessageFontFamilyForStorage($msg['fontFamily'] ?? null),
                            tileMessageFontSizeForStorage($msg['fontSize'] ?? null),
                            tileMessageMarqueeSecondsForStorage($msg['marqueeSeconds'] ?? null)
                        ]);
                    }
                }
            }

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

        // Preserve role assignments across delete/recreate; grant new links the same role access
        $oldLinkIdsForRoles = collectLinkIdsFromTileData($currentTileData);
        $rolesForNewLinks = [];
        $tileRoleStmt = $db->prepare('SELECT DISTINCT role_id FROM role_tile_permissions WHERE tile_id = ? AND can_view = 1');
        $tileRoleStmt->execute([$tileId]);
        while ($row = $tileRoleStmt->fetch(PDO::FETCH_ASSOC)) {
            $rolesForNewLinks[] = (int)$row['role_id'];
        }
        if (empty($rolesForNewLinks) && !empty($oldLinkIdsForRoles)) {
            $placeholders = implode(',', array_fill(0, count($oldLinkIdsForRoles), '?'));
            $linkRoleStmt = $db->prepare("SELECT DISTINCT role_id FROM role_link_permissions WHERE link_id IN ($placeholders) AND can_view = 1");
            $linkRoleStmt->execute($oldLinkIdsForRoles);
            while ($row = $linkRoleStmt->fetch(PDO::FETCH_ASSOC)) {
                $rolesForNewLinks[] = (int)$row['role_id'];
            }
            $rolesForNewLinks = array_values(array_unique($rolesForNewLinks));
        }

        $db->prepare('DELETE FROM rich_text_content WHERE section_id IN (SELECT id FROM sections WHERE tile_id = ?)')->execute([$tileId]);
        $db->prepare('DELETE FROM links WHERE section_id IN (SELECT id FROM sections WHERE tile_id = ?)')->execute([$tileId]);
        $db->prepare('DELETE FROM sections WHERE tile_id = ?')->execute([$tileId]);
        $db->prepare('DELETE FROM tabs WHERE tile_id = ?')->execute([$tileId]);
        $db->prepare('DELETE FROM tile_messages WHERE tile_id = ?')->execute([$tileId]);
    
        // Insert new tabs, sections, and links
        $savedLinkIdsForRoles = [];
        if (isset($data['tabs']) && is_array($data['tabs'])) {
            foreach ($data['tabs'] as $tabIndex => $tab) {
                $tabId = $tab['id'] ?? uniqid('tab_', true);
                $tabColor = (!empty($tab['textColor']) && trim($tab['textColor']) !== '') ? trim($tab['textColor']) : null;
                $tabVisibility = $tab['visibility'] ?? 'public';
                $tabAllowedUsers = isset($tab['allowedUsers']) && is_array($tab['allowedUsers']) ? json_encode($tab['allowedUsers']) : null;
                $tabAllowedGroups = isset($tab['allowedGroups']) && is_array($tab['allowedGroups']) ? json_encode($tab['allowedGroups']) : null;
                $tabPublished = resolvePublishedFlag($tab, $user, true);
                $tabStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position, text_color, background_color, background_style, emoji, visible_from, expires_at, visibility, allowed_users, allowed_groups, published, access_restrictions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                $tabStmt->execute([
                    $tabId,
                    $tileId,
                    $tab['title'] ?? 'New Tab',
                    $tab['position'] ?? $tabIndex,
                    $tabColor,
                    backgroundColorFromRowOrInput($tab),
                    encodeBackgroundStyleJson($tab),
                    contentEmojiFromInput($tab),
                    $tab['visibleFrom'] ?? null,
                    $tab['expiresAt'] ?? null,
                    $tabVisibility,
                    $tabAllowedUsers,
                    $tabAllowedGroups,
                    $tabPublished,
                    encodeAccessRestrictionsJson($tab['accessRestrictions'] ?? null)
                ]);
                persistInheritShortUrls($db, 'tabs', $tabId, $tab);
                
                if (isset($tab['sections']) && is_array($tab['sections'])) {
                    foreach ($tab['sections'] as $sectionIndex => $section) {
                        $sectionId = $section['id'] ?? uniqid('section_', true);
                        $sectionPosition = isset($section['position']) ? (int)$section['position'] : $sectionIndex;
                        $secVisibility = $section['visibility'] ?? 'public';
                        $secAllowedUsers = isset($section['allowedUsers']) && is_array($section['allowedUsers']) ? json_encode($section['allowedUsers']) : null;
                        $secAllowedGroups = isset($section['allowedGroups']) && is_array($section['allowedGroups']) ? json_encode($section['allowedGroups']) : null;
                        $secPublished = resolvePublishedFlag($section, $user, true);
                        $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, text_color, background_color, background_style, emoji, visible_from, expires_at, force_stacked_view, ignore_side_by_side, show_read_aloud, position, visibility, allowed_users, allowed_groups, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                        $sectionStmt->execute([
                            $sectionId,
                            $tileId,
                            $tabId,
                            $section['title'] ?? '',
                            $section['textColor'] ?? null,
                            backgroundColorFromRowOrInput($section),
                            encodeBackgroundStyleJson($section),
                            contentEmojiFromInput($section),
                            $section['visibleFrom'] ?? null,
                            $section['expiresAt'] ?? null,
                            isset($section['forceStackedView']) && $section['forceStackedView'] === true ? 1 : 0,
                            isset($section['ignoreSideBySide']) && $section['ignoreSideBySide'] === true ? 1 : 0,
                        sectionShowReadAloudFlag($section) ? 1 : 0,
                            $sectionPosition,
                            $secVisibility,
                            $secAllowedUsers,
                            $secAllowedGroups,
                            $secPublished
                        ]);
                        persistInheritShortUrls($db, 'sections', $sectionId, $section);
                        
                        // Links
                        if (isset($section['links']) && is_array($section['links'])) {
                            foreach ($section['links'] as $link) {
                                $linkId = $link['id'] ?? uniqid('link_', true);
                                $savedLinkIdsForRoles[] = (string)$linkId;
                                $visibility = $link['visibility'] ?? 'public';
                                $allowedUsers = isset($link['allowedUsers']) && is_array($link['allowedUsers']) ? json_encode($link['allowedUsers']) : null;
                                $allowedGroups = isset($link['allowedGroups']) && is_array($link['allowedGroups']) ? json_encode($link['allowedGroups']) : null;
                                $linkPublished = resolvePublishedFlag($link, $user, true);
                                $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, text_color, visibility, allowed_users, allowed_groups, notes, tooltip, visible_from, expires_at, browser, position, rich_text_content, animation, published, access_restrictions, maintenance_enabled, maintenance_message, maintenance_video_url, notes_video_url, info_video_url, notes_enabled, rich_text_enabled, info_show_open_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
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
                                    $linkPublished,
                                    encodeAccessRestrictionsJson($link['accessRestrictions'] ?? null),
                                    ...linkMaintenanceInsertValuesFromInput($link),
                                    ...linkNotesInfoVideoInsertValuesFromInput($link),
                                    ...linkFeatureToggleInsertValuesFromInput($link)
                                ]);
                                persistInheritShortUrls($db, 'links', $linkId, $link);
                                persistLinkTooltipStyle($db, $linkId, $link);
                                persistLinkOpenTarget($db, $linkId, $link);
                                persistLinkMobilePreviewEmulation($db, $linkId, $link);
                                persistLinkOpenInEmulation($db, $linkId, $link);
                                persistLinkForceShortUrl($db, $linkId, $link);
                                persistLinkBrokenStatusLabel($db, $linkId, $link);
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
                $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, text_color, background_color, background_style, emoji, force_stacked_view, ignore_side_by_side, show_read_aloud, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                $sectionStmt->execute([
                    $sectionId,
                    $tileId,
                    $defaultTabId,
                    $section['title'] ?? '',
                    $section['textColor'] ?? null,
                    backgroundColorFromRowOrInput($section),
                    encodeBackgroundStyleJson($section),
                    contentEmojiFromInput($section),
                    isset($section['forceStackedView']) && $section['forceStackedView'] === true ? 1 : 0,
                    isset($section['ignoreSideBySide']) && $section['ignoreSideBySide'] === true ? 1 : 0,
                        sectionShowReadAloudFlag($section) ? 1 : 0,
                    $sectionPosition
                ]);
                
                if (isset($section['links']) && is_array($section['links'])) {
                    foreach ($section['links'] as $link) {
                        if (!isset($link['label']) || !isset($link['url'])) continue;
                        $linkId = $link['id'] ?? uniqid('link_', true);
                        $savedLinkIdsForRoles[] = (string)$linkId;
                        $visibility = $link['visibility'] ?? 'public';
                        $allowedUsers = isset($link['allowedUsers']) && is_array($link['allowedUsers']) ? json_encode($link['allowedUsers']) : null;
                        $allowedGroups = isset($link['allowedGroups']) && is_array($link['allowedGroups']) ? json_encode($link['allowedGroups']) : null;
                        $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, text_color, visibility, allowed_users, allowed_groups, notes, tooltip, browser, position, animation, maintenance_enabled, maintenance_message, maintenance_video_url, notes_video_url, info_video_url, notes_enabled, rich_text_enabled, info_show_open_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
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
                            $link['animation'] ?? null,
                            ...linkMaintenanceInsertValuesFromInput($link),
                            ...linkNotesInfoVideoInsertValuesFromInput($link),
                            ...linkFeatureToggleInsertValuesFromInput($link)
                        ]);
                        persistLinkTooltipStyle($db, $linkId, $link);
                                persistLinkOpenTarget($db, $linkId, $link);
                                persistLinkMobilePreviewEmulation($db, $linkId, $link);
                                persistLinkOpenInEmulation($db, $linkId, $link);
                                persistLinkForceShortUrl($db, $linkId, $link);
                                persistLinkBrokenStatusLabel($db, $linkId, $link);
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

        // New/cloned links need role_link_permissions or they vanish from Your Assigned Apps after save
        grantRoleLinkAccessForNewLinks($db, $tileId, $oldLinkIdsForRoles, $savedLinkIdsForRoles, $rolesForNewLinks);
        
        // Messages
        if (isset($data['messages']) && is_array($data['messages'])) {
            $msgStmt = $db->prepare('INSERT INTO tile_messages (id, tile_id, content, type, start_date, end_date, is_active, priority, text_color, font_style, display_location, animation_type, delay_before, celebration_effect, celebration_config, url, url_label, tab_ids, show_on_card, placement, font_family, font_size, marquee_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
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
                    $msg['celebrationEffect'] ?? 'none',
                    $cc,
                    $msg['url'] ?? null,
                    $msg['urlLabel'] ?? null,
                    tileMessageTabIdsForStorage($msg['tabIds'] ?? null),
                    !empty($msg['showOnCard']) ? 1 : 0,
                    tileMessagePlacementForStorage($msg['placement'] ?? null),
                    tileMessageFontFamilyForStorage($msg['fontFamily'] ?? null),
                    tileMessageFontSizeForStorage($msg['fontSize'] ?? null),
                    tileMessageMarqueeSecondsForStorage($msg['marqueeSeconds'] ?? null)
                ]);
            }
        }

        stampSyncSourceIds($db, $data);
        persistTileSyncSource($db, $tileId, $data);
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
    $rootFields = ['title', 'description', 'htmlContent', 'group', 'emoji', 'showEmoji', 'showTitle', 'showDescription', 'showShortUrls', 'emojiImage', 'emojiImageOpacity', 'emojiImageOffsetX', 'emojiImageOffsetY', 'emojiImageZoom', 'visibility', 'browser', 'themeColor', 'isHyperlink', 'hyperlinkUrl', 'isVideo', 'videoUrl', 'videoSource', 'pageAnimation', 'linksAnimation', 'headerImage', 'headerImageAlign', 'headerImageOpacity', 'headerImageOffsetX', 'headerImageOffsetY', 'headerImageZoom', 'headerImageFit'];
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
        // Guests and viewers must not get 401 here: TileDetail used to POST this on every
        // space open. A 401 on office (ERP3) shows in the console and can stall the session
        // so link-health / broken-link indicators never load.
        $user = getAuthenticatedUser();
        if (!$user) {
            sendJSON(['success' => true, 'deleted' => 0, 'skipped' => true]);
            return;
        }
        $db = getDB();
        if (!canUserEditTile($user['id'], $tileId, $db)) {
            sendJSON(['success' => true, 'deleted' => 0, 'skipped' => true]);
            return;
        }
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
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
            t.archived_by,
            t.archived_by_username,
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
        'archivedBy' => !empty($row['archived_by']) ? (int)$row['archived_by'] : null,
        'archivedByName' => $user ? tileArchiverDisplayName($db, $row) : null,
        'deletedAt' => $row['deleted_at'] ? (int)$row['deleted_at'] : null,
        'visibility' => $tileVisibility,
        'sourceTab' => $sourceTabLabel,
        'permissions' => [
            'canView' => $canView,
            'canEdit' => $canEdit,
            'canDelete' => $canDelete
        ],
        'tileAdmins' => $tileAdmins,
        'stats' => filterVisitStatsForViewer(getTileVisitStats($tileId, $db), $user, $db)
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
    require_once __DIR__ . '/visit_analytics_lib.php';
    return getDurableTileVisitStats($tileId, $db);
}

/**
 * Whether Unique Visitors should be hidden from unauthenticated (public) viewers.
 */
function isHideUniqueVisitorsPublicEnabled($db = null) {
    if ($db === null) {
        $db = getDB();
    }
    try {
        $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'hide_unique_visitors_public'");
        $stmt->execute();
        $value = $stmt->fetchColumn();
        return ($value === '1' || $value === 1);
    } catch (PDOException $e) {
        return false;
    }
}

/**
 * Strip uniqueVisitors from stats when guests should not see them.
 */
function filterVisitStatsForViewer(array $stats, $user, $db = null) {
    if (!$user && isHideUniqueVisitorsPublicEnabled($db)) {
        unset($stats['uniqueVisitors']);
    }
    return $stats;
}

/**
 * Ensure the current user may see visit stats / record a visit for this tile.
 * Sends JSON error and exits on failure. Returns [user, db] on success.
 */
function assertTileAccessibleForVisit($tileId) {
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

    return [$user, $db];
}

/**
 * GET visit stats for a tile (no increment).
 */
function handleGetTileVisitStats($tileId) {
    [$user, $db] = assertTileAccessibleForVisit($tileId);
    sendJSON([
        'success' => true,
        'stats' => filterVisitStatsForViewer(getTileVisitStats($tileId, $db), $user, $db)
    ]);
}

/**
 * GET unique visitors for a tile (admin only).
 * Lists logged-in users by username/email and guests as numbered anonymous visitors.
 */
function handleGetTileUniqueVisitors($tileId) {
    $user = getAuthenticatedUser();
    if (!$user) {
        sendJSON(['error' => 'Authentication required'], 401);
    }
    if (empty($user['is_admin'])) {
        sendJSON(['error' => 'Admin access required'], 403);
    }

    [, $db] = assertTileAccessibleForVisit($tileId);
    require_once __DIR__ . '/visit_analytics_lib.php';
    ensureVisitAnalyticsTables($db);
    backfillVisitAnalyticsIfNeeded($db);

    try {
        $stmt = $db->prepare('
            SELECT
                v.visitor_key,
                v.user_id,
                v.hit_count,
                v.first_visit,
                v.last_visit,
                u.username,
                u.email
            FROM tile_visit_visitors v
            LEFT JOIN users u ON v.user_id = u.id
            WHERE v.tile_id = ?
            ORDER BY v.last_visit DESC
            LIMIT 500
        ');
        $stmt->execute([$tileId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $visitors = [];
        foreach ($rows as $row) {
            $key = (string)($row['visitor_key'] ?? '');
            $isUser = str_starts_with($key, 'u:');
            $username = isset($row['username']) && $row['username'] !== '' ? (string)$row['username'] : null;
            $email = isset($row['email']) && $row['email'] !== '' ? (string)$row['email'] : null;
            $userId = isset($row['user_id']) && $row['user_id'] !== null && $row['user_id'] !== ''
                ? (int)$row['user_id']
                : null;

            $visitors[] = [
                '_key' => $key,
                'type' => $isUser ? 'user' : 'guest',
                'userId' => $isUser ? $userId : null,
                'username' => $isUser ? $username : null,
                'email' => $isUser ? $email : null,
                'hitCount' => (int)($row['hit_count'] ?? 0),
                'firstVisit' => (int)($row['first_visit'] ?? 0),
                'lastVisit' => (int)($row['last_visit'] ?? 0),
            ];
        }

        $guestOrder = $visitors;
        usort($guestOrder, static function ($a, $b) {
            $cmp = $a['firstVisit'] <=> $b['firstVisit'];
            return $cmp !== 0 ? $cmp : strcmp((string)$a['_key'], (string)$b['_key']);
        });
        $guestNumberByKey = [];
        $guestNumber = 0;
        foreach ($guestOrder as $visitor) {
            if ($visitor['type'] === 'guest') {
                $guestNumber++;
                $guestNumberByKey[$visitor['_key']] = $guestNumber;
            }
        }
        foreach ($visitors as &$visitor) {
            if ($visitor['type'] === 'guest') {
                $visitor['guestNumber'] = $guestNumberByKey[$visitor['_key']] ?? null;
            }
            unset($visitor['_key']);
        }
        unset($visitor);

        $totalStmt = $db->prepare('SELECT unique_visitors FROM tile_visit_counters WHERE tile_id = ?');
        $totalStmt->execute([$tileId]);
        $total = (int)($totalStmt->fetchColumn() ?: 0);
        if ($total === 0) {
            $totalStmt = $db->prepare('SELECT COUNT(*) FROM tile_visit_visitors WHERE tile_id = ?');
            $totalStmt->execute([$tileId]);
            $total = (int)$totalStmt->fetchColumn();
        }

        sendJSON([
            'success' => true,
            'visitors' => $visitors,
            'total' => $total,
            'truncated' => $total > count($visitors),
        ]);
    } catch (PDOException $e) {
        error_log('Failed to list tile unique visitors: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to load unique visitors'], 500);
    }
}

/**
 * Record a tile visit (hit). Unique visitors are derived from visitor_key.
 * Accepts optional visitorKey in JSON body for guests; authenticated users use u:{id}.
 * Persists to durable counters / visitor rows / daily rollups (million-hit safe).
 */
function handleRecordTileVisit($tileId) {
    [$user, $db] = assertTileAccessibleForVisit($tileId);
    require_once __DIR__ . '/visit_analytics_lib.php';

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

    try {
        [$recorded, $stats] = recordDurableTileVisit($db, $tileId, $visitorKey, $userId);
        $stats = filterVisitStatsForViewer($stats, $user, $db);
        sendJSON([
            'success' => true,
            'recorded' => $recorded,
            'stats' => $stats
        ]);
    } catch (Throwable $e) {
        error_log('Failed to record tile visit: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to record visit'], 500);
    }
}

function sendTilePresenceList(string $tileId, PDO $db): void
{
    require_once __DIR__ . '/tile_presence_lib.php';
    ensureTilePresenceTable($db);
    cleanupStaleTilePresence($db);
    sendJSON([
        'success' => true,
        'viewers' => listTilePresence($db, $tileId),
    ]);
}

/**
 * GET who is currently viewing or editing this tile.
 */
function handleGetTilePresence($tileId)
{
    [, $db] = assertTileAccessibleForVisit($tileId);
    linknestReleaseSessionLock();
    sendTilePresenceList($tileId, $db);
}

/**
 * POST heartbeat or leave. Authenticated users only.
 * Body: { mode: "viewing"|"editing" } or { action: "leave" }
 */
function handlePostTilePresence($tileId)
{
    $user = getAuthenticatedUser();
    if (!$user) {
        sendJSON(['error' => 'Authentication required'], 401);
    }

    [, $db] = assertTileAccessibleForVisit($tileId);
    linknestReleaseSessionLock();

    require_once __DIR__ . '/tile_presence_lib.php';
    ensureTilePresenceTable($db);

    $input = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($input)) {
        $input = [];
    }

    $action = isset($input['action']) ? strtolower(trim((string)$input['action'])) : '';
    if ($action === 'leave') {
        clearTilePresence($db, $tileId, (int)$user['id']);
        sendJSON(['success' => true, 'viewers' => []]);
        return;
    }

    $mode = normalizeTilePresenceMode($input['mode'] ?? 'viewing');
    try {
        upsertTilePresence($db, $tileId, (int)$user['id'], $mode);
        sendTilePresenceList($tileId, $db);
    } catch (Throwable $e) {
        error_log('Failed to update tile presence: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to update presence'], 500);
    }
}

/**
 * DELETE own presence row for this tile.
 */
function handleDeleteTilePresence($tileId)
{
    $user = getAuthenticatedUser();
    if (!$user) {
        sendJSON(['error' => 'Authentication required'], 401);
    }

    [, $db] = assertTileAccessibleForVisit($tileId);
    linknestReleaseSessionLock();

    require_once __DIR__ . '/tile_presence_lib.php';
    ensureTilePresenceTable($db);
    clearTilePresence($db, $tileId, (int)$user['id']);
    sendJSON(['success' => true]);
}
