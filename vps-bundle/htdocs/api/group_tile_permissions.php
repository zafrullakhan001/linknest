<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

switch ($method) {
    case 'GET':
        if ($path === '' || $path === '/') {
            handleGetAllGroupTilePermissions();
        } elseif (preg_match('#^/tile/([^/]+)$#', $path, $matches)) {
            handleGetTileGroupPermissions($matches[1]);
        } elseif (preg_match('#^/group/(\d+)$#', $path, $matches)) {
            handleGetGroupTilePermissions($matches[1]);
        } elseif ($path === '/batch' || $path === '/batch/') {
            handleGetBatchGroupTilePermissions();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'POST':
        if ($path === '' || $path === '/') {
            handleSetGroupTilePermission();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'PUT':
        if (preg_match('#^/([^/]+)$#', $path, $matches)) {
            handleUpdateGroupTilePermission($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'DELETE':
        if (preg_match('#^/([^/]+)$#', $path, $matches)) {
            handleDeleteGroupTilePermission($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleGetAllGroupTilePermissions() {
    requireAdmin();
    $db = getDB();
    
    $stmt = $db->query('
        SELECT 
            gtp.group_id,
            gtp.tile_id,
            gtp.can_view,
            gtp.can_edit,
            gtp.can_delete,
            gtp.can_add_links,
            gtp.can_add_sections,
            gtp.can_add_tabs,
            gtp.can_edit_links,
            gtp.can_delete_links,
            gtp.can_delete_sections,
            gtp.can_delete_tabs,
            gtp.can_change_visibility,
            gtp.can_change_browser,
            gtp.can_clone_tile,
            gtp.can_view_tile_info,
            gtp.can_edit_tile,
            gtp.created_at,
            gtp.updated_at,
            ug.name as group_name,
            t.title as tile_title
        FROM group_tile_permissions gtp
        INNER JOIN user_groups ug ON gtp.group_id = ug.id
        INNER JOIN tiles t ON gtp.tile_id = t.id
        ORDER BY t.title, ug.name
    ');
    
    $permissions = [];
    while ($row = $stmt->fetch()) {
        $permissions[] = [
            'groupId' => (int)$row['group_id'],
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
            'groupName' => $row['group_name'],
            'tileTitle' => $row['tile_title']
        ];
    }
    
    sendJSON($permissions);
}

function handleGetBatchGroupTilePermissions() {
    requireAdmin();
    $db = getDB();
    
    $stmt = $db->query('
        SELECT 
            gtp.tile_id,
            gtp.group_id,
            gtp.can_view,
            gtp.can_edit,
            gtp.can_delete,
            gtp.can_add_links,
            gtp.can_add_sections,
            gtp.can_add_tabs,
            gtp.can_edit_links,
            gtp.can_delete_links,
            gtp.can_delete_sections,
            gtp.can_delete_tabs,
            gtp.can_change_visibility,
            gtp.can_change_browser,
            gtp.can_clone_tile,
            gtp.can_view_tile_info,
            gtp.can_edit_tile,
            gtp.created_at,
            gtp.updated_at,
            ug.name as group_name,
            t.title as tile_title
        FROM group_tile_permissions gtp
        INNER JOIN user_groups ug ON gtp.group_id = ug.id
        INNER JOIN tiles t ON gtp.tile_id = t.id
        ORDER BY gtp.tile_id, ug.name
    ');
    
    $permissionsByTile = [];
    while ($row = $stmt->fetch()) {
        $tileId = $row['tile_id'];
        if (!isset($permissionsByTile[$tileId])) {
            $permissionsByTile[$tileId] = [
                'tileId' => $tileId,
                'tileTitle' => $row['tile_title'],
                'groupPermissions' => []
            ];
        }
        
        $permissionsByTile[$tileId]['groupPermissions'][] = [
            'groupId' => (int)$row['group_id'],
            'groupName' => $row['group_name'],
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
            'updatedAt' => (int)$row['updated_at']
        ];
    }
    
    sendJSON(array_values($permissionsByTile));
}

function handleGetTileGroupPermissions($tileId) {
    requireAdmin();
    $db = getDB();
    
    $stmt = $db->prepare('
        SELECT 
            gtp.group_id,
            gtp.can_view,
            gtp.can_edit,
            gtp.can_delete,
            gtp.can_add_links,
            gtp.can_add_sections,
            gtp.can_add_tabs,
            gtp.can_edit_links,
            gtp.can_delete_links,
            gtp.can_delete_sections,
            gtp.can_delete_tabs,
            gtp.can_change_visibility,
            gtp.can_change_browser,
            gtp.can_clone_tile,
            gtp.can_view_tile_info,
            gtp.can_edit_tile,
            gtp.created_at,
            gtp.updated_at,
            ug.name as group_name
        FROM group_tile_permissions gtp
        INNER JOIN user_groups ug ON gtp.group_id = ug.id
        WHERE gtp.tile_id = ?
        ORDER BY ug.name
    ');
    $stmt->execute([$tileId]);
    
    $permissions = [];
    while ($row = $stmt->fetch()) {
        $permissions[] = [
            'groupId' => (int)$row['group_id'],
            'groupName' => $row['group_name'],
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
            'updatedAt' => (int)$row['updated_at']
        ];
    }
    
    sendJSON([
        'tileId' => $tileId,
        'groupPermissions' => $permissions
    ]);
}

function handleGetGroupTilePermissions($groupId) {
    requireAdmin();
    $db = getDB();
    
    $stmt = $db->prepare('
        SELECT 
            gtp.tile_id,
            gtp.can_view,
            gtp.can_edit,
            gtp.can_delete,
            gtp.can_add_links,
            gtp.can_add_sections,
            gtp.can_add_tabs,
            gtp.can_edit_links,
            gtp.can_delete_links,
            gtp.can_delete_sections,
            gtp.can_delete_tabs,
            gtp.can_change_visibility,
            gtp.can_change_browser,
            gtp.can_clone_tile,
            gtp.can_view_tile_info,
            gtp.can_edit_tile,
            gtp.created_at,
            gtp.updated_at,
            t.title as tile_title
        FROM group_tile_permissions gtp
        INNER JOIN tiles t ON gtp.tile_id = t.id
        WHERE gtp.group_id = ?
        ORDER BY t.title
    ');
    $stmt->execute([$groupId]);
    
    $permissions = [];
    while ($row = $stmt->fetch()) {
        $permissions[] = [
            'tileId' => $row['tile_id'],
            'tileTitle' => $row['tile_title'],
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
            'updatedAt' => (int)$row['updated_at']
        ];
    }
    
    sendJSON([
        'groupId' => (int)$groupId,
        'permissions' => $permissions
    ]);
}

function handleSetGroupTilePermission() {
    requireAdmin();
    $data = getJSONInput();
    
    if (!isset($data['groupId']) || !isset($data['tileId'])) {
        sendJSON(['error' => 'groupId and tileId are required'], 400);
    }
    
    $groupId = (int)$data['groupId'];
    $tileId = $data['tileId'];
    
    $db = getDB();
    $currentTime = time();
    
    // Verify group exists
    $groupCheck = $db->prepare('SELECT id FROM user_groups WHERE id = ?');
    $groupCheck->execute([$groupId]);
    if (!$groupCheck->fetch()) {
        sendJSON(['error' => 'Group not found'], 404);
    }
    
    // Verify tile exists
    $tileCheck = $db->prepare('SELECT id FROM tiles WHERE id = ?');
    $tileCheck->execute([$tileId]);
    if (!$tileCheck->fetch()) {
        sendJSON(['error' => 'Tile not found'], 404);
    }
    
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
    $canViewTileInfo = isset($data['canViewTileInfo']) ? (int)(bool)$data['canViewTileInfo'] : 1;
    $canEditTile = isset($data['canEditTile']) ? (int)(bool)$data['canEditTile'] : ($canEdit ? 1 : 0);
    
    try {
        $stmt = $db->prepare('
            INSERT OR REPLACE INTO group_tile_permissions (
                group_id, tile_id, can_view, can_edit, can_delete,
                can_add_links, can_add_sections, can_add_tabs,
                can_edit_links, can_delete_links, can_delete_sections, can_delete_tabs,
                can_change_visibility, can_change_browser, can_clone_tile,
                can_view_tile_info, can_edit_tile,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
        
        $stmt->execute([
            $groupId, $tileId, $canView, $canEdit, $canDelete,
            $canAddLinks, $canAddSections, $canAddTabs,
            $canEditLinks, $canDeleteLinks, $canDeleteSections, $canDeleteTabs,
            $canChangeVisibility, $canChangeBrowser, $canCloneTile,
            $canViewTileInfo, $canEditTile,
            $currentTime, $currentTime
        ]);
        
        sendJSON(['success' => true]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to set group tile permission: ' . $e->getMessage()], 500);
    }
}

function handleUpdateGroupTilePermission($permissionId) {
    requireAdmin();
    $data = getJSONInput();
    
    // Parse permissionId (format: groupId_tileId)
    $parts = explode('_', $permissionId, 2);
    if (count($parts) !== 2) {
        sendJSON(['error' => 'Invalid permission ID format'], 400);
    }
    
    list($groupId, $tileId) = $parts;
    
    $db = getDB();
    
    // Verify permission exists
    $checkStmt = $db->prepare('SELECT group_id FROM group_tile_permissions WHERE group_id = ? AND tile_id = ?');
    $checkStmt->execute([$groupId, $tileId]);
    if (!$checkStmt->fetch()) {
        sendJSON(['error' => 'Group tile permission not found'], 404);
    }
    
    $updates = [];
    $params = [];
    
    if (isset($data['canView'])) {
        $updates[] = 'can_view = ?';
        $params[] = (int)(bool)$data['canView'];
    }
    
    if (isset($data['canEdit'])) {
        $updates[] = 'can_edit = ?';
        $params[] = (int)(bool)$data['canEdit'];
    }
    
    if (isset($data['canDelete'])) {
        $updates[] = 'can_delete = ?';
        $params[] = (int)(bool)$data['canDelete'];
    }
    
    // Granular permissions
    $granularFields = [
        'canAddLinks' => 'can_add_links',
        'canAddSections' => 'can_add_sections',
        'canAddTabs' => 'can_add_tabs',
        'canEditLinks' => 'can_edit_links',
        'canDeleteLinks' => 'can_delete_links',
        'canDeleteSections' => 'can_delete_sections',
        'canDeleteTabs' => 'can_delete_tabs',
        'canChangeVisibility' => 'can_change_visibility',
        'canChangeBrowser' => 'can_change_browser',
        'canCloneTile' => 'can_clone_tile',
        'canViewTileInfo' => 'can_view_tile_info',
        'canEditTile' => 'can_edit_tile'
    ];
    
    foreach ($granularFields as $dataKey => $dbColumn) {
        if (isset($data[$dataKey])) {
            $updates[] = "$dbColumn = ?";
            $params[] = (int)(bool)$data[$dataKey];
        }
    }
    
    if (empty($updates)) {
        sendJSON(['error' => 'No fields to update'], 400);
    }
    
    $updates[] = 'updated_at = ?';
    $params[] = time();
    $params[] = $groupId;
    $params[] = $tileId;
    
    try {
        $stmt = $db->prepare('UPDATE group_tile_permissions SET ' . implode(', ', $updates) . ' WHERE group_id = ? AND tile_id = ?');
        $stmt->execute($params);
        
        sendJSON(['success' => true]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to update group tile permission: ' . $e->getMessage()], 500);
    }
}

function handleDeleteGroupTilePermission($permissionId) {
    requireAdmin();
    
    // Parse permissionId (format: groupId_tileId)
    $parts = explode('_', $permissionId, 2);
    if (count($parts) !== 2) {
        sendJSON(['error' => 'Invalid permission ID format'], 400);
    }
    
    list($groupId, $tileId) = $parts;
    
    $db = getDB();
    
    $stmt = $db->prepare('DELETE FROM group_tile_permissions WHERE group_id = ? AND tile_id = ?');
    $stmt->execute([$groupId, $tileId]);
    
    sendJSON(['success' => true]);
}
