<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

switch ($method) {
    case 'GET':
        if ($path === '' || $path === '/') {
            handleGetPermissions();
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
            'createdAt' => (int)$row['created_at'],
            'updatedAt' => (int)$row['updated_at'],
            'username' => $row['username'],
            'email' => $row['email'],
            'tileTitle' => $row['tile_title']
        ];
    }
    
    sendJSON($permissions);
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
            SET can_view = ?, can_edit = ?, can_delete = ?, updated_at = ?
            WHERE user_id = ? AND tile_id = ?
        ');
        $stmt->execute([$canView, $canEdit, $canDelete, $currentTime, $userId, $tileId]);
    } else {
        // Insert new permission
        $stmt = $db->prepare('
            INSERT INTO user_tile_permissions (user_id, tile_id, can_view, can_edit, can_delete, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ');
        $stmt->execute([$userId, $tileId, $canView, $canEdit, $canDelete, $currentTime, $currentTime]);
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
    
    $db = getDB();
    $currentTime = time();
    
    $stmt = $db->prepare('
        UPDATE user_tile_permissions 
        SET can_view = ?, can_edit = ?, can_delete = ?, updated_at = ?
        WHERE user_id = ? AND tile_id = ?
    ');
    $stmt->execute([$canView, $canEdit, $canDelete, $currentTime, $userId, $tileId]);
    
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



