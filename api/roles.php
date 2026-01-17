<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

switch ($method) {
    case 'GET':
        if ($path === '' || $path === '/') {
            handleGetRoles();
        } elseif (preg_match('#^/(\d+)$#', $path, $matches)) {
            handleGetRole($matches[1]);
        } elseif (preg_match('#^/(\d+)/tiles$#', $path, $matches)) {
            handleGetRoleTiles($matches[1]);
        } elseif (preg_match('#^/(\d+)/links$#', $path, $matches)) {
            handleGetRoleLinks($matches[1]);
        } elseif (preg_match('#^/user/(\d+)$#', $path, $matches)) {
            handleGetUserRoles($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'POST':
        if ($path === '' || $path === '/') {
            handleCreateRole();
        } elseif (preg_match('#^/(\d+)/assign-tiles$#', $path, $matches)) {
            handleAssignTilesToRole($matches[1]);
        } elseif (preg_match('#^/(\d+)/assign-links$#', $path, $matches)) {
            handleAssignLinksToRole($matches[1]);
        } elseif (preg_match('#^/user/(\d+)/assign$#', $path, $matches)) {
            handleAssignRolesToUser($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'PUT':
        if (preg_match('#^/(\d+)$#', $path, $matches)) {
            handleUpdateRole($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'DELETE':
        if (preg_match('#^/(\d+)$#', $path, $matches)) {
            handleDeleteRole($matches[1]);
        } elseif (preg_match('#^/(\d+)/tile/(.+)$#', $path, $matches)) {
            handleRemoveTileFromRole($matches[1], $matches[2]);
        } elseif (preg_match('#^/(\d+)/link/(.+)$#', $path, $matches)) {
            handleRemoveLinkFromRole($matches[1], $matches[2]);
        } elseif (preg_match('#^/user/(\d+)/role/(\d+)$#', $path, $matches)) {
            handleRemoveRoleFromUser($matches[1], $matches[2]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleGetRoles() {
    requireAdmin();
    $db = getDB();
    
    $stmt = $db->query('
        SELECT 
            r.*,
            COUNT(DISTINCT ur.user_id) as user_count,
            COUNT(DISTINCT rtp.tile_id) as tile_count,
            COUNT(DISTINCT rlp.link_id) as link_count
        FROM roles r
        LEFT JOIN user_roles ur ON r.id = ur.role_id
        LEFT JOIN role_tile_permissions rtp ON r.id = rtp.role_id
        LEFT JOIN role_link_permissions rlp ON r.id = rlp.role_id
        GROUP BY r.id
        ORDER BY r.name
    ');
    
    $roles = [];
    while ($row = $stmt->fetch()) {
        $roles[] = [
            'id' => (int)$row['id'],
            'name' => $row['name'],
            'description' => $row['description'],
            'userCount' => (int)$row['user_count'],
            'tileCount' => (int)$row['tile_count'],
            'linkCount' => (int)$row['link_count'],
            'createdAt' => (int)$row['created_at'],
            'updatedAt' => (int)$row['updated_at']
        ];
    }
    
    sendJSON($roles);
}

function handleGetRole($roleId) {
    requireAdmin();
    $db = getDB();
    
    $stmt = $db->prepare('SELECT * FROM roles WHERE id = ?');
    $stmt->execute([$roleId]);
    $role = $stmt->fetch();
    
    if (!$role) {
        sendJSON(['error' => 'Role not found'], 404);
    }
    
    // Get users with this role
    $usersStmt = $db->prepare('
        SELECT u.id, u.username, u.email 
        FROM users u
        INNER JOIN user_roles ur ON u.id = ur.user_id
        WHERE ur.role_id = ?
        ORDER BY u.username
    ');
    $usersStmt->execute([$roleId]);
    $users = [];
    while ($userRow = $usersStmt->fetch()) {
        $users[] = [
            'id' => (int)$userRow['id'],
            'username' => $userRow['username'],
            'email' => $userRow['email']
        ];
    }
    
    sendJSON([
        'id' => (int)$role['id'],
        'name' => $role['name'],
        'description' => $role['description'],
        'users' => $users,
        'createdAt' => (int)$role['created_at'],
        'updatedAt' => (int)$role['updated_at']
    ]);
}

function handleGetRoleTiles($roleId) {
    requireAdmin();
    $db = getDB();
    
    // Verify role exists
    $roleCheck = $db->prepare('SELECT id FROM roles WHERE id = ?');
    $roleCheck->execute([$roleId]);
    if (!$roleCheck->fetch()) {
        sendJSON(['error' => 'Role not found'], 404);
    }
    
    $stmt = $db->prepare('
        SELECT 
            rtp.tile_id,
            rtp.can_view,
            rtp.created_at,
            t.title as tile_title
        FROM role_tile_permissions rtp
        INNER JOIN tiles t ON rtp.tile_id = t.id
        WHERE rtp.role_id = ?
        ORDER BY t.title
    ');
    $stmt->execute([$roleId]);
    
    $tiles = [];
    while ($row = $stmt->fetch()) {
        $tiles[] = [
            'tileId' => $row['tile_id'],
            'tileTitle' => $row['tile_title'],
            'canView' => (bool)$row['can_view'],
            'createdAt' => (int)$row['created_at']
        ];
    }
    
    sendJSON($tiles);
}

function handleGetRoleLinks($roleId) {
    requireAdmin();
    $db = getDB();
    
    // Verify role exists
    $roleCheck = $db->prepare('SELECT id FROM roles WHERE id = ?');
    $roleCheck->execute([$roleId]);
    if (!$roleCheck->fetch()) {
        sendJSON(['error' => 'Role not found'], 404);
    }
    
    $stmt = $db->prepare('
        SELECT 
            rlp.link_id,
            rlp.can_view,
            rlp.created_at,
            l.label as link_label,
            l.url
        FROM role_link_permissions rlp
        INNER JOIN links l ON rlp.link_id = l.id
        WHERE rlp.role_id = ?
        ORDER BY l.label
    ');
    $stmt->execute([$roleId]);
    
    $links = [];
    while ($row = $stmt->fetch()) {
        $links[] = [
            'linkId' => $row['link_id'],
            'linkLabel' => $row['link_label'],
            'url' => $row['url'],
            'canView' => (bool)$row['can_view'],
            'createdAt' => (int)$row['created_at']
        ];
    }
    
    sendJSON($links);
}

function handleGetUserRoles($userId) {
    requireAdmin();
    $db = getDB();
    
    // Verify user exists
    $userCheck = $db->prepare('SELECT id, username, email FROM users WHERE id = ?');
    $userCheck->execute([$userId]);
    $user = $userCheck->fetch();
    
    if (!$user) {
        sendJSON(['error' => 'User not found'], 404);
    }
    
    $stmt = $db->prepare('
        SELECT 
            r.id,
            r.name,
            r.description,
            ur.created_at
        FROM roles r
        INNER JOIN user_roles ur ON r.id = ur.role_id
        WHERE ur.user_id = ?
        ORDER BY r.name
    ');
    $stmt->execute([$userId]);
    
    $roles = [];
    while ($row = $stmt->fetch()) {
        $roles[] = [
            'id' => (int)$row['id'],
            'name' => $row['name'],
            'description' => $row['description'],
            'assignedAt' => (int)$row['created_at']
        ];
    }
    
    sendJSON([
        'userId' => (int)$userId,
        'username' => $user['username'],
        'email' => $user['email'],
        'roles' => $roles
    ]);
}

function handleCreateRole() {
    requireAdmin();
    $data = getJSONInput();
    
    if (!isset($data['name']) || empty(trim($data['name']))) {
        sendJSON(['error' => 'Role name is required'], 400);
    }
    
    $name = trim($data['name']);
    $description = isset($data['description']) ? trim($data['description']) : null;
    
    $db = getDB();
    $currentTime = time();
    
    try {
        $stmt = $db->prepare('INSERT INTO roles (name, description, created_at, updated_at) VALUES (?, ?, ?, ?)');
        $stmt->execute([$name, $description, $currentTime, $currentTime]);
        
        $roleId = $db->lastInsertId();
        
        sendJSON([
            'success' => true,
            'role' => [
                'id' => (int)$roleId,
                'name' => $name,
                'description' => $description,
                'createdAt' => $currentTime,
                'updatedAt' => $currentTime
            ]
        ]);
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'UNIQUE constraint') !== false) {
            sendJSON(['error' => 'A role with this name already exists'], 409);
        }
        sendJSON(['error' => 'Failed to create role: ' . $e->getMessage()], 500);
    }
}

function handleUpdateRole($roleId) {
    requireAdmin();
    $data = getJSONInput();
    
    $db = getDB();
    
    // Verify role exists
    $roleCheck = $db->prepare('SELECT id FROM roles WHERE id = ?');
    $roleCheck->execute([$roleId]);
    if (!$roleCheck->fetch()) {
        sendJSON(['error' => 'Role not found'], 404);
    }
    
    $updates = [];
    $params = [];
    
    if (isset($data['name'])) {
        $updates[] = 'name = ?';
        $params[] = trim($data['name']);
    }
    
    if (isset($data['description'])) {
        $updates[] = 'description = ?';
        $params[] = trim($data['description']);
    }
    
    if (empty($updates)) {
        sendJSON(['error' => 'No fields to update'], 400);
    }
    
    $updates[] = 'updated_at = ?';
    $params[] = time();
    $params[] = $roleId;
    
    try {
        $stmt = $db->prepare('UPDATE roles SET ' . implode(', ', $updates) . ' WHERE id = ?');
        $stmt->execute($params);
        
        sendJSON(['success' => true]);
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'UNIQUE constraint') !== false) {
            sendJSON(['error' => 'A role with this name already exists'], 409);
        }
        sendJSON(['error' => 'Failed to update role: ' . $e->getMessage()], 500);
    }
}

function handleDeleteRole($roleId) {
    requireAdmin();
    $db = getDB();
    
    // Verify role exists
    $roleCheck = $db->prepare('SELECT id FROM roles WHERE id = ?');
    $roleCheck->execute([$roleId]);
    if (!$roleCheck->fetch()) {
        sendJSON(['error' => 'Role not found'], 404);
    }
    
    // Delete role (cascade will handle related records)
    $stmt = $db->prepare('DELETE FROM roles WHERE id = ?');
    $stmt->execute([$roleId]);
    
    sendJSON(['success' => true]);
}

function handleAssignTilesToRole($roleId) {
    requireAdmin();
    $data = getJSONInput();
    
    if (!isset($data['tileIds']) || !is_array($data['tileIds'])) {
        sendJSON(['error' => 'tileIds array is required'], 400);
    }
    
    $db = getDB();
    
    // Verify role exists
    $roleCheck = $db->prepare('SELECT id FROM roles WHERE id = ?');
    $roleCheck->execute([$roleId]);
    if (!$roleCheck->fetch()) {
        sendJSON(['error' => 'Role not found'], 404);
    }
    
    $currentTime = time();
    $canView = isset($data['canView']) ? (int)(bool)$data['canView'] : 1;
    
    $db->beginTransaction();
    try {
        $stmt = $db->prepare('
            INSERT OR REPLACE INTO role_tile_permissions (role_id, tile_id, can_view, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
        ');
        
        foreach ($data['tileIds'] as $tileId) {
            // Verify tile exists
            $tileCheck = $db->prepare('SELECT id FROM tiles WHERE id = ?');
            $tileCheck->execute([$tileId]);
            if (!$tileCheck->fetch()) {
                continue; // Skip invalid tiles
            }
            
            $stmt->execute([$roleId, $tileId, $canView, $currentTime, $currentTime]);
        }
        
        $db->commit();
        sendJSON(['success' => true]);
    } catch (PDOException $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to assign tiles: ' . $e->getMessage()], 500);
    }
}

function handleAssignLinksToRole($roleId) {
    requireAdmin();
    $data = getJSONInput();
    
    if (!isset($data['linkIds']) || !is_array($data['linkIds'])) {
        sendJSON(['error' => 'linkIds array is required'], 400);
    }
    
    $db = getDB();
    
    // Verify role exists
    $roleCheck = $db->prepare('SELECT id FROM roles WHERE id = ?');
    $roleCheck->execute([$roleId]);
    if (!$roleCheck->fetch()) {
        sendJSON(['error' => 'Role not found'], 404);
    }
    
    $currentTime = time();
    $canView = isset($data['canView']) ? (int)(bool)$data['canView'] : 1;
    
    $db->beginTransaction();
    try {
        $stmt = $db->prepare('
            INSERT OR REPLACE INTO role_link_permissions (role_id, link_id, can_view, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
        ');
        
        foreach ($data['linkIds'] as $linkId) {
            // Verify link exists
            $linkCheck = $db->prepare('SELECT id FROM links WHERE id = ?');
            $linkCheck->execute([$linkId]);
            if (!$linkCheck->fetch()) {
                continue; // Skip invalid links
            }
            
            $stmt->execute([$roleId, $linkId, $canView, $currentTime, $currentTime]);
        }
        
        $db->commit();
        sendJSON(['success' => true]);
    } catch (PDOException $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to assign links: ' . $e->getMessage()], 500);
    }
}

function handleAssignRolesToUser($userId) {
    requireAdmin();
    $data = getJSONInput();
    
    if (!isset($data['roleIds']) || !is_array($data['roleIds'])) {
        sendJSON(['error' => 'roleIds array is required'], 400);
    }
    
    $db = getDB();
    
    // Verify user exists
    $userCheck = $db->prepare('SELECT id FROM users WHERE id = ?');
    $userCheck->execute([$userId]);
    if (!$userCheck->fetch()) {
        sendJSON(['error' => 'User not found'], 404);
    }
    
    $currentTime = time();
    
    $db->beginTransaction();
    try {
        // Remove existing roles for this user
        $deleteStmt = $db->prepare('DELETE FROM user_roles WHERE user_id = ?');
        $deleteStmt->execute([$userId]);
        
        // Assign new roles
        if (!empty($data['roleIds'])) {
            $stmt = $db->prepare('INSERT INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, ?)');
            
            foreach ($data['roleIds'] as $roleId) {
                // Verify role exists
                $roleCheck = $db->prepare('SELECT id FROM roles WHERE id = ?');
                $roleCheck->execute([$roleId]);
                if (!$roleCheck->fetch()) {
                    continue; // Skip invalid roles
                }
                
                $stmt->execute([$userId, $roleId, $currentTime]);
            }
        }
        
        $db->commit();
        sendJSON(['success' => true]);
    } catch (PDOException $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to assign roles: ' . $e->getMessage()], 500);
    }
}

function handleRemoveTileFromRole($roleId, $tileId) {
    requireAdmin();
    $db = getDB();
    
    $stmt = $db->prepare('DELETE FROM role_tile_permissions WHERE role_id = ? AND tile_id = ?');
    $stmt->execute([$roleId, $tileId]);
    
    sendJSON(['success' => true]);
}

function handleRemoveLinkFromRole($roleId, $linkId) {
    requireAdmin();
    $db = getDB();
    
    $stmt = $db->prepare('DELETE FROM role_link_permissions WHERE role_id = ? AND link_id = ?');
    $stmt->execute([$roleId, $linkId]);
    
    sendJSON(['success' => true]);
}

function handleRemoveRoleFromUser($userId, $roleId) {
    requireAdmin();
    $db = getDB();
    
    $stmt = $db->prepare('DELETE FROM user_roles WHERE user_id = ? AND role_id = ?');
    $stmt->execute([$userId, $roleId]);
    
    sendJSON(['success' => true]);
}
