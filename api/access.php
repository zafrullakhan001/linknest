<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

switch ($method) {
    case 'GET':
        if ($path === '' || $path === '/') {
            handleGetPermissions();
        } elseif (preg_match('#^/batch$#', $path)) {
            handleGetBatchPermissions();
        } elseif (preg_match('#^/tile/([^/]+)$#', $path, $matches)) {
            handleGetTilePermissions($matches[1]);
        } elseif (preg_match('#^/user/(\d+)$#', $path, $matches)) {
            handleGetUserPermissions($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'POST':
        if ($path === '' || $path === '/') {
            handleSetPermission();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'PUT':
        if (preg_match('#^/([^/]+)$#', $path, $matches)) {
            handleUpdatePermission($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'DELETE':
        if (preg_match('#^/([^/]+)$#', $path, $matches)) {
            handleDeletePermission($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleGetPermissions() {
    requireAdmin();
    $db = getDB();
    
    $stmt = $db->prepare('
        SELECT 
            utp.user_id,
            utp.tile_id,
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
            utp.created_at,
            utp.updated_at,
            u.username,
            u.email,
            t.title as tile_title
        FROM user_tile_permissions utp
        INNER JOIN users u ON utp.user_id = u.id
        INNER JOIN tiles t ON utp.tile_id = t.id
        ORDER BY t.title, u.username
    ');
    $stmt->execute();
    
    $permissions = [];
    while ($row = $stmt->fetch()) {
        $permissions[] = [
            'userId' => (int)$row['user_id'],
            'tileId' => $row['tile_id'],
            'canView' => (bool)$row['can_view'],
            'canEdit' => (bool)$row['can_edit'],
            'canDelete' => (bool)$row['can_delete'],
            'canAddLinks' => isset($row['can_add_links']) ? (bool)$row['can_add_links'] : (bool)$row['can_edit'],
            'canAddSections' => isset($row['can_add_sections']) ? (bool)$row['can_add_sections'] : (bool)$row['can_edit'],
            'canAddTabs' => isset($row['can_add_tabs']) ? (bool)$row['can_add_tabs'] : (bool)$row['can_edit'],
            'canEditLinks' => isset($row['can_edit_links']) ? (bool)$row['can_edit_links'] : (bool)$row['can_edit'],
            'canDeleteLinks' => isset($row['can_delete_links']) ? (bool)$row['can_delete_links'] : false,
            'canDeleteSections' => isset($row['can_delete_sections']) ? (bool)$row['can_delete_sections'] : false,
            'canDeleteTabs' => isset($row['can_delete_tabs']) ? (bool)$row['can_delete_tabs'] : false,
            'canChangeVisibility' => isset($row['can_change_visibility']) ? (bool)$row['can_change_visibility'] : false,
            'canChangeBrowser' => isset($row['can_change_browser']) ? (bool)$row['can_change_browser'] : false,
            'canCloneTile' => isset($row['can_clone_tile']) ? (bool)$row['can_clone_tile'] : false,
            'canViewTileInfo' => isset($row['can_view_tile_info']) ? (bool)$row['can_view_tile_info'] : true,
            'createdAt' => (int)$row['created_at'],
            'updatedAt' => (int)$row['updated_at'],
            'username' => $row['username'],
            'email' => $row['email'],
            'tileTitle' => $row['tile_title']
        ];
    }
    
    sendJSON($permissions);
}

function handleGetBatchPermissions() {
    requireAdmin();
    $db = getDB();
    
    // Get all tile permissions in a single optimized query, grouped by tile_id
    $stmt = $db->prepare('
        SELECT 
            utp.tile_id,
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
            utp.created_at,
            utp.updated_at,
            u.username,
            u.email,
            t.title as tile_title
        FROM user_tile_permissions utp
        INNER JOIN users u ON utp.user_id = u.id
        INNER JOIN tiles t ON utp.tile_id = t.id
        ORDER BY utp.tile_id, u.username
    ');
    $stmt->execute();
    
    // Group permissions by tile_id
    $permissionsByTile = [];
    while ($row = $stmt->fetch()) {
        $tileId = $row['tile_id'];
        if (!isset($permissionsByTile[$tileId])) {
            $permissionsByTile[$tileId] = [
                'tileId' => $tileId,
                'tileTitle' => $row['tile_title'],
                'permissions' => []
            ];
        }
        
        $permissionsByTile[$tileId]['permissions'][] = [
            'userId' => (int)$row['user_id'],
            'canView' => (bool)$row['can_view'],
            'canEdit' => (bool)$row['can_edit'],
            'canDelete' => (bool)$row['can_delete'],
            'canAddLinks' => isset($row['can_add_links']) ? (bool)$row['can_add_links'] : (bool)$row['can_edit'],
            'canAddSections' => isset($row['can_add_sections']) ? (bool)$row['can_add_sections'] : (bool)$row['can_edit'],
            'canAddTabs' => isset($row['can_add_tabs']) ? (bool)$row['can_add_tabs'] : (bool)$row['can_edit'],
            'canEditLinks' => isset($row['can_edit_links']) ? (bool)$row['can_edit_links'] : (bool)$row['can_edit'],
            'canDeleteLinks' => isset($row['can_delete_links']) ? (bool)$row['can_delete_links'] : false,
            'canDeleteSections' => isset($row['can_delete_sections']) ? (bool)$row['can_delete_sections'] : false,
            'canDeleteTabs' => isset($row['can_delete_tabs']) ? (bool)$row['can_delete_tabs'] : false,
            'canChangeVisibility' => isset($row['can_change_visibility']) ? (bool)$row['can_change_visibility'] : false,
            'canChangeBrowser' => isset($row['can_change_browser']) ? (bool)$row['can_change_browser'] : false,
            'canCloneTile' => isset($row['can_clone_tile']) ? (bool)$row['can_clone_tile'] : false,
            'canViewTileInfo' => isset($row['can_view_tile_info']) ? (bool)$row['can_view_tile_info'] : true,
            'createdAt' => (int)$row['created_at'],
            'updatedAt' => (int)$row['updated_at'],
            'username' => $row['username'],
            'email' => $row['email']
        ];
    }
    
    // Convert to array format for JSON response
    $result = array_values($permissionsByTile);
    
    sendJSON($result);
}

function handleGetTilePermissions($tileId) {
    requireAdmin();
    $db = getDB();
    
    // Verify tile exists
    $checkStmt = $db->prepare('SELECT id, title FROM tiles WHERE id = ?');
    $checkStmt->execute([$tileId]);
    $tile = $checkStmt->fetch();
    
    if (!$tile) {
        sendJSON(['error' => 'Tile not found'], 404);
    }
    
    $stmt = $db->prepare('
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
            utp.created_at,
            utp.updated_at,
            u.username,
            u.email
        FROM user_tile_permissions utp
        INNER JOIN users u ON utp.user_id = u.id
        WHERE utp.tile_id = ?
        ORDER BY u.username
    ');
    $stmt->execute([$tileId]);
    
    $permissions = [];
    while ($row = $stmt->fetch()) {
        $permissions[] = [
            'userId' => (int)$row['user_id'],
            'canView' => (bool)$row['can_view'],
            'canEdit' => (bool)$row['can_edit'],
            'canDelete' => (bool)$row['can_delete'],
            'canAddLinks' => isset($row['can_add_links']) ? (bool)$row['can_add_links'] : (bool)$row['can_edit'],
            'canAddSections' => isset($row['can_add_sections']) ? (bool)$row['can_add_sections'] : (bool)$row['can_edit'],
            'canAddTabs' => isset($row['can_add_tabs']) ? (bool)$row['can_add_tabs'] : (bool)$row['can_edit'],
            'canEditLinks' => isset($row['can_edit_links']) ? (bool)$row['can_edit_links'] : (bool)$row['can_edit'],
            'canDeleteLinks' => isset($row['can_delete_links']) ? (bool)$row['can_delete_links'] : false,
            'canDeleteSections' => isset($row['can_delete_sections']) ? (bool)$row['can_delete_sections'] : false,
            'canDeleteTabs' => isset($row['can_delete_tabs']) ? (bool)$row['can_delete_tabs'] : false,
            'canChangeVisibility' => isset($row['can_change_visibility']) ? (bool)$row['can_change_visibility'] : false,
            'canChangeBrowser' => isset($row['can_change_browser']) ? (bool)$row['can_change_browser'] : false,
            'canCloneTile' => isset($row['can_clone_tile']) ? (bool)$row['can_clone_tile'] : false,
            'canViewTileInfo' => isset($row['can_view_tile_info']) ? (bool)$row['can_view_tile_info'] : true,
            'canEditTile' => isset($row['can_edit_tile']) ? (bool)$row['can_edit_tile'] : true,
            'createdAt' => (int)$row['created_at'],
            'updatedAt' => (int)$row['updated_at'],
            'username' => $row['username'],
            'email' => $row['email']
        ];
    }
    
    sendJSON([
        'tileId' => $tileId,
        'tileTitle' => $tile['title'],
        'permissions' => $permissions
    ]);
}

function handleGetUserPermissions($userId) {
    requireAdmin();
    $db = getDB();
    
    // Verify user exists
    $checkStmt = $db->prepare('SELECT id, username, email FROM users WHERE id = ?');
    $checkStmt->execute([$userId]);
    $user = $checkStmt->fetch();
    
    if (!$user) {
        sendJSON(['error' => 'User not found'], 404);
    }
    
    $stmt = $db->prepare('
        SELECT 
            utp.tile_id,
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
            utp.created_at,
            utp.updated_at,
            t.title as tile_title
        FROM user_tile_permissions utp
        INNER JOIN tiles t ON utp.tile_id = t.id
        WHERE utp.user_id = ?
        ORDER BY t.title
    ');
    $stmt->execute([$userId]);
    
    $permissions = [];
    while ($row = $stmt->fetch()) {
        $permissions[] = [
            'tileId' => $row['tile_id'],
            'canView' => (bool)$row['can_view'],
            'canEdit' => (bool)$row['can_edit'],
            'canDelete' => (bool)$row['can_delete'],
            'canAddLinks' => isset($row['can_add_links']) ? (bool)$row['can_add_links'] : (bool)$row['can_edit'],
            'canAddSections' => isset($row['can_add_sections']) ? (bool)$row['can_add_sections'] : (bool)$row['can_edit'],
            'canAddTabs' => isset($row['can_add_tabs']) ? (bool)$row['can_add_tabs'] : (bool)$row['can_edit'],
            'canEditLinks' => isset($row['can_edit_links']) ? (bool)$row['can_edit_links'] : (bool)$row['can_edit'],
            'canDeleteLinks' => isset($row['can_delete_links']) ? (bool)$row['can_delete_links'] : false,
            'canDeleteSections' => isset($row['can_delete_sections']) ? (bool)$row['can_delete_sections'] : false,
            'canDeleteTabs' => isset($row['can_delete_tabs']) ? (bool)$row['can_delete_tabs'] : false,
            'canChangeVisibility' => isset($row['can_change_visibility']) ? (bool)$row['can_change_visibility'] : false,
            'canChangeBrowser' => isset($row['can_change_browser']) ? (bool)$row['can_change_browser'] : false,
            'canCloneTile' => isset($row['can_clone_tile']) ? (bool)$row['can_clone_tile'] : false,
            'canViewTileInfo' => isset($row['can_view_tile_info']) ? (bool)$row['can_view_tile_info'] : true,
            'canEditTile' => isset($row['can_edit_tile']) ? (bool)$row['can_edit_tile'] : true,
            'createdAt' => (int)$row['created_at'],
            'updatedAt' => (int)$row['updated_at'],
            'tileTitle' => $row['tile_title']
        ];
    }
    
    sendJSON([
        'userId' => (int)$userId,
        'username' => $user['username'],
        'email' => $user['email'],
        'permissions' => $permissions
    ]);
}

function handleSetPermission() {
    requireAdmin();
    $data = getJSONInput();
    
    if (!isset($data['userId']) || !isset($data['tileId'])) {
        sendJSON(['error' => 'userId and tileId are required'], 400);
    }
    
    $userId = (int)$data['userId'];
    $tileId = $data['tileId'];
    $canView = isset($data['canView']) ? (int)(bool)$data['canView'] : 1;
    $canEdit = isset($data['canEdit']) ? (int)(bool)$data['canEdit'] : 0;
    $canDelete = isset($data['canDelete']) ? (int)(bool)$data['canDelete'] : 0;
    
    // Granular permissions (defaults for tile admins)
    $canAddLinks = isset($data['canAddLinks']) ? (int)(bool)$data['canAddLinks'] : ($canEdit ? 1 : 0);
    $canAddSections = isset($data['canAddSections']) ? (int)(bool)$data['canAddSections'] : ($canEdit ? 1 : 0);
    $canAddTabs = isset($data['canAddTabs']) ? (int)(bool)$data['canAddTabs'] : ($canEdit ? 1 : 0);
    $canEditLinks = isset($data['canEditLinks']) ? (int)(bool)$data['canEditLinks'] : ($canEdit ? 1 : 0);
    $canDeleteLinks = isset($data['canDeleteLinks']) ? (int)(bool)$data['canDeleteLinks'] : 0;
    $canDeleteSections = isset($data['canDeleteSections']) ? (int)(bool)$data['canDeleteSections'] : 0;
    $canDeleteTabs = isset($data['canDeleteTabs']) ? (int)(bool)$data['canDeleteTabs'] : 0;
    $canChangeVisibility = isset($data['canChangeVisibility']) ? (int)(bool)$data['canChangeVisibility'] : 0;
    $canChangeBrowser = isset($data['canChangeBrowser']) ? (int)(bool)$data['canChangeBrowser'] : 0;
    $canCloneTile = isset($data['canCloneTile']) ? (int)(bool)$data['canCloneTile'] : 0;
    $canViewTileInfo = isset($data['canViewTileInfo']) ? (int)(bool)$data['canViewTileInfo'] : ($canEdit ? 1 : 0);
    $canEditTile = isset($data['canEditTile']) ? (int)(bool)$data['canEditTile'] : ($canEdit ? 1 : 0);
    
    $db = getDB();
    
    // Verify user exists
    $userStmt = $db->prepare('SELECT id FROM users WHERE id = ?');
    $userStmt->execute([$userId]);
    if (!$userStmt->fetch()) {
        sendJSON(['error' => 'User not found'], 404);
    }
    
    // Verify tile exists
    $tileStmt = $db->prepare('SELECT id FROM tiles WHERE id = ?');
    $tileStmt->execute([$tileId]);
    if (!$tileStmt->fetch()) {
        sendJSON(['error' => 'Tile not found'], 404);
    }
    
    $currentTime = time();
    
    // Check if permission already exists
    $checkStmt = $db->prepare('SELECT user_id FROM user_tile_permissions WHERE user_id = ? AND tile_id = ?');
    $checkStmt->execute([$userId, $tileId]);
    
    if ($checkStmt->fetch()) {
        // Update existing permission
        $stmt = $db->prepare('
            UPDATE user_tile_permissions 
            SET can_view = ?, can_edit = ?, can_delete = ?,
                can_add_links = ?, can_add_sections = ?, can_add_tabs = ?,
                can_edit_links = ?, can_delete_links = ?, can_delete_sections = ?, can_delete_tabs = ?,
                can_change_visibility = ?, can_change_browser = ?, can_clone_tile = ?, can_view_tile_info = ?, can_edit_tile = ?,
                updated_at = ?
            WHERE user_id = ? AND tile_id = ?
        ');
        $stmt->execute([
            $canView, $canEdit, $canDelete,
            $canAddLinks, $canAddSections, $canAddTabs,
            $canEditLinks, $canDeleteLinks, $canDeleteSections, $canDeleteTabs,
            $canChangeVisibility, $canChangeBrowser, $canCloneTile, $canViewTileInfo, $canEditTile,
            $currentTime, $userId, $tileId
        ]);
    } else {
        // Insert new permission
        $stmt = $db->prepare('
            INSERT INTO user_tile_permissions (
                user_id, tile_id, can_view, can_edit, can_delete,
                can_add_links, can_add_sections, can_add_tabs,
                can_edit_links, can_delete_links, can_delete_sections, can_delete_tabs,
                can_change_visibility, can_change_browser, can_clone_tile, can_view_tile_info, can_edit_tile,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
        $stmt->execute([
            $userId, $tileId, $canView, $canEdit, $canDelete,
            $canAddLinks, $canAddSections, $canAddTabs,
            $canEditLinks, $canDeleteLinks, $canDeleteSections, $canDeleteTabs,
            $canChangeVisibility, $canChangeBrowser, $canCloneTile, $canViewTileInfo, $canEditTile,
            $currentTime, $currentTime
        ]);
    }
    
    sendJSON(['success' => true]);
}

function handleUpdatePermission($permissionId) {
    requireAdmin();
    $data = getJSONInput();
    
    // permissionId format: userId_tileId
    $parts = explode('_', $permissionId, 2);
    if (count($parts) !== 2) {
        sendJSON(['error' => 'Invalid permission ID format'], 400);
    }
    
    $userId = (int)$parts[0];
    $tileId = $parts[1];
    
    $canView = isset($data['canView']) ? (int)(bool)$data['canView'] : 1;
    $canEdit = isset($data['canEdit']) ? (int)(bool)$data['canEdit'] : 0;
    $canDelete = isset($data['canDelete']) ? (int)(bool)$data['canDelete'] : 0;
    
    // Granular permissions
    $canAddLinks = isset($data['canAddLinks']) ? (int)(bool)$data['canAddLinks'] : ($canEdit ? 1 : 0);
    $canAddSections = isset($data['canAddSections']) ? (int)(bool)$data['canAddSections'] : ($canEdit ? 1 : 0);
    $canAddTabs = isset($data['canAddTabs']) ? (int)(bool)$data['canAddTabs'] : ($canEdit ? 1 : 0);
    $canEditLinks = isset($data['canEditLinks']) ? (int)(bool)$data['canEditLinks'] : ($canEdit ? 1 : 0);
    $canDeleteLinks = isset($data['canDeleteLinks']) ? (int)(bool)$data['canDeleteLinks'] : 0;
    $canDeleteSections = isset($data['canDeleteSections']) ? (int)(bool)$data['canDeleteSections'] : 0;
    $canDeleteTabs = isset($data['canDeleteTabs']) ? (int)(bool)$data['canDeleteTabs'] : 0;
    $canChangeVisibility = isset($data['canChangeVisibility']) ? (int)(bool)$data['canChangeVisibility'] : 0;
    $canChangeBrowser = isset($data['canChangeBrowser']) ? (int)(bool)$data['canChangeBrowser'] : 0;
    $canCloneTile = isset($data['canCloneTile']) ? (int)(bool)$data['canCloneTile'] : 0;
    $canViewTileInfo = isset($data['canViewTileInfo']) ? (int)(bool)$data['canViewTileInfo'] : ($canEdit ? 1 : 0);
    $canEditTile = isset($data['canEditTile']) ? (int)(bool)$data['canEditTile'] : ($canEdit ? 1 : 0);
    
    $db = getDB();
    $currentTime = time();
    
    $stmt = $db->prepare('
        UPDATE user_tile_permissions 
        SET can_view = ?, can_edit = ?, can_delete = ?,
            can_add_links = ?, can_add_sections = ?, can_add_tabs = ?,
            can_edit_links = ?, can_delete_links = ?, can_delete_sections = ?, can_delete_tabs = ?,
            can_change_visibility = ?, can_change_browser = ?, can_clone_tile = ?, can_view_tile_info = ?, can_edit_tile = ?,
            updated_at = ?
        WHERE user_id = ? AND tile_id = ?
    ');
    $stmt->execute([
        $canView, $canEdit, $canDelete,
        $canAddLinks, $canAddSections, $canAddTabs,
        $canEditLinks, $canDeleteLinks, $canDeleteSections, $canDeleteTabs,
        $canChangeVisibility, $canChangeBrowser, $canCloneTile, $canViewTileInfo, $canEditTile,
        $currentTime, $userId, $tileId
    ]);
    
    if ($stmt->rowCount() === 0) {
        sendJSON(['error' => 'Permission not found'], 404);
    }
    
    sendJSON(['success' => true]);
}

function handleDeletePermission($permissionId) {
    requireAdmin();
    
    // permissionId format: userId_tileId
    $parts = explode('_', $permissionId, 2);
    if (count($parts) !== 2) {
        sendJSON(['error' => 'Invalid permission ID format'], 400);
    }
    
    $userId = (int)$parts[0];
    $tileId = $parts[1];
    
    $db = getDB();
    
    $stmt = $db->prepare('DELETE FROM user_tile_permissions WHERE user_id = ? AND tile_id = ?');
    $stmt->execute([$userId, $tileId]);
    
    if ($stmt->rowCount() === 0) {
        sendJSON(['error' => 'Permission not found'], 404);
    }
    
    sendJSON(['success' => true]);
}



