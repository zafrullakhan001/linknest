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
        } elseif (preg_match('#^/(\d+)/tabs$#', $path, $matches)) {
            handleGetRoleTabs($matches[1]);
        } elseif (preg_match('#^/(\d+)/widgets$#', $path, $matches)) {
            handleGetRoleWidgets($matches[1]);
        } elseif (preg_match('#^/(\d+)/groups$#', $path, $matches)) {
            handleGetRoleGroups($matches[1]);
        } elseif ($path === '/current-user/tabs' || $path === '/current-user/tabs/') {
            handleGetCurrentUserTabs();
        } elseif (preg_match('#^/user/(\d+)$#', $path, $matches)) {
            handleGetUserRoles($matches[1]);
        } elseif (preg_match('#^/users/batch-roles$#', $path)) {
            handleGetBatchUserRoles();
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
        } elseif (preg_match('#^/(\d+)/assign-tabs$#', $path, $matches)) {
            handleAssignTabsToRole($matches[1]);
        } elseif (preg_match('#^/(\d+)/assign-widgets$#', $path, $matches)) {
            handleAssignWidgetsToRole($matches[1]);
        } elseif (preg_match('#^/user/(\d+)/assign$#', $path, $matches)) {
            handleAssignRolesToUser($matches[1]);
        } elseif ($path === '/bulk-assign' || $path === '/bulk-assign/') {
            handleBulkAssignRolesToUsers();
        } elseif ($path === '/bulk-remove' || $path === '/bulk-remove/') {
            handleBulkRemoveRolesFromUsers();
        } elseif ($path === '/bulk-assign-to-groups' || $path === '/bulk-assign-to-groups/') {
            handleBulkAssignRolesToGroups();
        } elseif ($path === '/bulk-remove-from-groups' || $path === '/bulk-remove-from-groups/') {
            handleBulkRemoveRolesFromGroups();
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
        } elseif (preg_match('#^/(\d+)/widget/(.+)$#', $path, $matches)) {
            handleRemoveWidgetFromRole($matches[1], $matches[2]);
        } elseif (preg_match('#^/user/(\d+)/role/(\d+)$#', $path, $matches)) {
            handleRemoveRoleFromUser($matches[1], $matches[2]);
        } elseif (preg_match('#^/(\d+)/group/(\d+)$#', $path, $matches)) {
            handleRemoveGroupFromRole($matches[1], $matches[2]);
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
            COUNT(DISTINCT gr.group_id) as group_count,
            COUNT(DISTINCT rtp.tile_id) as tile_count,
            COUNT(DISTINCT rlp.link_id) as link_count,
            COUNT(DISTINCT rwp.widget_id) as widget_count
        FROM roles r
        LEFT JOIN user_roles ur ON r.id = ur.role_id
        LEFT JOIN group_roles gr ON r.id = gr.role_id
        LEFT JOIN role_tile_permissions rtp ON r.id = rtp.role_id
        LEFT JOIN role_link_permissions rlp ON r.id = rlp.role_id
        LEFT JOIN role_widget_permissions rwp ON r.id = rwp.role_id
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
            'groupCount' => (int)$row['group_count'],
            'tileCount' => (int)$row['tile_count'],
            'linkCount' => (int)$row['link_count'],
            'widgetCount' => (int)$row['widget_count'],
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

function handleGetRoleWidgets($roleId) {
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
            rwp.widget_id,
            rwp.can_view,
            rwp.created_at
        FROM role_widget_permissions rwp
        WHERE rwp.role_id = ?
        ORDER BY rwp.widget_id
    ');
    $stmt->execute([$roleId]);
    
    $widgets = [];
    while ($row = $stmt->fetch()) {
        $widgets[] = [
            'widgetId' => $row['widget_id'],
            'canView' => (bool)$row['can_view'],
            'createdAt' => (int)$row['created_at']
        ];
    }
    
    sendJSON($widgets);
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

function handleGetBatchUserRoles() {
    requireAdmin();
    $db = getDB();
    
    // Get all user roles in a single optimized query, grouped by user_id
    $stmt = $db->prepare('
        SELECT 
            ur.user_id,
            r.id as role_id,
            r.name as role_name,
            r.description as role_description,
            ur.created_at
        FROM user_roles ur
        INNER JOIN roles r ON ur.role_id = r.id
        ORDER BY ur.user_id, r.name
    ');
    $stmt->execute();
    
    // Group roles by user_id
    $rolesByUser = [];
    while ($row = $stmt->fetch()) {
        $userId = (int)$row['user_id'];
        if (!isset($rolesByUser[$userId])) {
            $rolesByUser[$userId] = [];
        }
        
        $rolesByUser[$userId][] = [
            'id' => (int)$row['role_id'],
            'name' => $row['role_name'],
            'description' => $row['role_description'] ?: null
        ];
    }
    
    // Convert to array format for JSON response
    $result = [];
    foreach ($rolesByUser as $userId => $roles) {
        $result[] = [
            'userId' => $userId,
            'roles' => $roles
        ];
    }
    
    sendJSON($result);
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
        // First, delete all existing tile assignments for this role
        $deleteStmt = $db->prepare('DELETE FROM role_tile_permissions WHERE role_id = ?');
        $deleteStmt->execute([$roleId]);
        
        // Then, insert only the selected tiles (if any)
        if (!empty($data['tileIds'])) {
            $stmt = $db->prepare('
                INSERT INTO role_tile_permissions (role_id, tile_id, can_view, created_at, updated_at)
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
        // First, delete all existing link assignments for this role
        $deleteStmt = $db->prepare('DELETE FROM role_link_permissions WHERE role_id = ?');
        $deleteStmt->execute([$roleId]);
        
        // Then, insert only the selected links (if any)
        if (!empty($data['linkIds'])) {
            $stmt = $db->prepare('
                INSERT INTO role_link_permissions (role_id, link_id, can_view, created_at, updated_at)
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
        }
        
        $db->commit();
        sendJSON(['success' => true]);
    } catch (PDOException $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to assign links: ' . $e->getMessage()], 500);
    }
}

function handleAssignWidgetsToRole($roleId) {
    requireAdmin();
    $data = getJSONInput();
    
    if (!isset($data['widgetIds']) || !is_array($data['widgetIds'])) {
        sendJSON(['error' => 'widgetIds array is required'], 400);
    }
    
    $db = getDB();
    
    // Verify role exists
    $roleCheck = $db->prepare('SELECT id FROM roles WHERE id = ?');
    $roleCheck->execute([$roleId]);
    if (!$roleCheck->fetch()) {
        sendJSON(['error' => 'Role not found'], 404);
    }
    
    // Get valid widget IDs from built-in widgets and custom widgets
    $builtInWidgetIds = [
        'clock',
        'weather',
        'calculator',
        'notes',
        'password-generator',
        'phonetic-alphabet',
        'zoom-control',
        'theme',
        'fav-organizer',
        'chat',
        'snake-game',
        'vnc-viewer',
        'ssh-terminal'
    ];
    
    // Get custom widget IDs from database
    $customWidgetsStmt = $db->query('SELECT widget_id FROM custom_widgets WHERE enabled = 1');
    $customWidgetIds = [];
    while ($row = $customWidgetsStmt->fetch(PDO::FETCH_ASSOC)) {
        $customWidgetIds[] = $row['widget_id'];
    }
    
    // Combine built-in and custom widget IDs
    $validWidgetIds = array_merge($builtInWidgetIds, $customWidgetIds);
    
    $currentTime = time();
    $canView = isset($data['canView']) ? (int)(bool)$data['canView'] : 1;
    
    $db->beginTransaction();
    try {
        // First, delete all existing widget assignments for this role
        $deleteStmt = $db->prepare('DELETE FROM role_widget_permissions WHERE role_id = ?');
        $deleteStmt->execute([$roleId]);
        
        // Then, insert only the selected widgets (if any)
        if (!empty($data['widgetIds'])) {
            $stmt = $db->prepare('
                INSERT INTO role_widget_permissions (role_id, widget_id, can_view, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
            ');
            
            foreach ($data['widgetIds'] as $widgetId) {
                // Validate widget ID
                if (!in_array($widgetId, $validWidgetIds, true)) {
                    continue; // Skip invalid widgets
                }
                
                $stmt->execute([$roleId, $widgetId, $canView, $currentTime, $currentTime]);
            }
        }
        
        $db->commit();
        sendJSON(['success' => true]);
    } catch (PDOException $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to assign widgets: ' . $e->getMessage()], 500);
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

function handleBulkAssignRolesToUsers() {
    requireAdmin();
    $data = getJSONInput();
    
    if (!isset($data['userIds']) || !is_array($data['userIds']) || empty($data['userIds'])) {
        sendJSON(['error' => 'userIds array is required and must not be empty'], 400);
    }
    
    if (!isset($data['roleIds']) || !is_array($data['roleIds']) || empty($data['roleIds'])) {
        sendJSON(['error' => 'roleIds array is required and must not be empty'], 400);
    }
    
    $db = getDB();
    $currentTime = time();
    $successCount = 0;
    $errorCount = 0;
    $errors = [];
    
    $db->beginTransaction();
    try {
        // Verify all users exist
        $placeholders = str_repeat('?,', count($data['userIds']) - 1) . '?';
        $userCheck = $db->prepare("SELECT id FROM users WHERE id IN ($placeholders)");
        $userCheck->execute($data['userIds']);
        $validUserIds = [];
        while ($row = $userCheck->fetch()) {
            $validUserIds[] = (int)$row['id'];
        }
        
        if (empty($validUserIds)) {
            $db->rollBack();
            sendJSON(['error' => 'No valid users found'], 400);
        }
        
        // Verify all roles exist
        $rolePlaceholders = str_repeat('?,', count($data['roleIds']) - 1) . '?';
        $roleCheck = $db->prepare("SELECT id FROM roles WHERE id IN ($rolePlaceholders)");
        $roleCheck->execute($data['roleIds']);
        $validRoleIds = [];
        while ($row = $roleCheck->fetch()) {
            $validRoleIds[] = (int)$row['id'];
        }
        
        if (empty($validRoleIds)) {
            $db->rollBack();
            sendJSON(['error' => 'No valid roles found'], 400);
        }
        
        // Determine mode
        $mode = isset($data['mode']) && $data['mode'] === 'replace' ? 'replace' : 'add';
        
        // Prepare statements
        $deleteStmt = $db->prepare('DELETE FROM user_roles WHERE user_id = ?');
        // Use INSERT OR IGNORE for add mode to avoid duplicates, regular INSERT for replace mode
        $insertStmt = $db->prepare($mode === 'add' 
            ? 'INSERT OR IGNORE INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, ?)'
            : 'INSERT INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, ?)');
        
        // Process each user
        foreach ($validUserIds as $userId) {
            try {
                // Remove existing roles for this user (if replace mode)
                if ($mode === 'replace') {
                    $deleteStmt->execute([$userId]);
                }
                
                // Assign new roles
                foreach ($validRoleIds as $roleId) {
                    $insertStmt->execute([$userId, $roleId, $currentTime]);
                }
                
                $successCount++;
            } catch (PDOException $e) {
                $errorCount++;
                $errors[] = "User ID $userId: " . $e->getMessage();
            }
        }
        
        $db->commit();
        
        $response = [
            'success' => true,
            'assigned' => $successCount,
            'failed' => $errorCount
        ];
        
        if (!empty($errors)) {
            $response['errors'] = $errors;
        }
        
        sendJSON($response);
    } catch (PDOException $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to bulk assign roles: ' . $e->getMessage()], 500);
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

function handleRemoveWidgetFromRole($roleId, $widgetId) {
    requireAdmin();
    $db = getDB();
    
    $stmt = $db->prepare('DELETE FROM role_widget_permissions WHERE role_id = ? AND widget_id = ?');
    $stmt->execute([$roleId, $widgetId]);
    
    sendJSON(['success' => true]);
}

function handleGetRoleTabs($roleId) {
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
            rtp.tab_id,
            rtp.can_view,
            rtp.created_at
        FROM role_tab_permissions rtp
        WHERE rtp.role_id = ?
        ORDER BY rtp.tab_id
    ');
    $stmt->execute([$roleId]);
    
    $tabs = [];
    while ($row = $stmt->fetch()) {
        $tabs[] = [
            'tabId' => $row['tab_id'],
            'canView' => (bool)$row['can_view'],
            'createdAt' => (int)$row['created_at']
        ];
    }
    
    sendJSON($tabs);
}

function handleGetCurrentUserTabs() {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    $user = getAuthenticatedUser();
    if (!$user) {
        sendJSON(['error' => 'Authentication required'], 401);
    }
    
    try {
        $db = getDB();
        
        // If user has no roles, return empty array (they use global settings only)
        $roleIds = getUserRoleIds($user['id'], $db);
        if (empty($roleIds)) {
            sendJSON([]);
        }
        
        // Get all tabs allowed by user's roles
        $placeholders = implode(',', array_fill(0, count($roleIds), '?'));
        $stmt = $db->prepare("SELECT DISTINCT tab_id FROM role_tab_permissions WHERE role_id IN ($placeholders) AND can_view = 1");
        $stmt->execute($roleIds);
        
        $allowedTabs = [];
        while ($row = $stmt->fetch()) {
            $allowedTabs[] = $row['tab_id'];
        }
        
        sendJSON($allowedTabs);
    } catch (PDOException $e) {
        error_log('roles/current-user/tabs: ' . $e->getMessage());
        // Return empty array so admin panel still works if roles/tab tables are missing
        sendJSON([]);
    } catch (Throwable $e) {
        error_log('roles/current-user/tabs: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to load tab permissions'], 500);
    }
}

function handleAssignTabsToRole($roleId) {
    requireAdmin();
    $data = getJSONInput();
    
    if (!isset($data['tabIds']) || !is_array($data['tabIds'])) {
        sendJSON(['error' => 'tabIds array is required'], 400);
    }
    
    $db = getDB();
    
    // Verify role exists
    $roleCheck = $db->prepare('SELECT id FROM roles WHERE id = ?');
    $roleCheck->execute([$roleId]);
    if (!$roleCheck->fetch()) {
        sendJSON(['error' => 'Role not found'], 404);
    }
    
    // Valid tab IDs
    $validTabIds = ['public', 'your-apps', 'favorites', 'private', 'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring'];
    
    $currentTime = time();
    $canView = isset($data['canView']) ? (int)(bool)$data['canView'] : 1;
    
    $db->beginTransaction();
    try {
        // First, remove all existing tab permissions for this role
        $deleteStmt = $db->prepare('DELETE FROM role_tab_permissions WHERE role_id = ?');
        $deleteStmt->execute([$roleId]);
        
        // Then, insert only the selected tabs
        if (!empty($data['tabIds'])) {
            $stmt = $db->prepare('
                INSERT INTO role_tab_permissions (role_id, tab_id, can_view, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
            ');
            
            foreach ($data['tabIds'] as $tabId) {
                // Validate tab ID
                if (!in_array($tabId, $validTabIds)) {
                    continue; // Skip invalid tab IDs
                }
                
                $stmt->execute([$roleId, $tabId, $canView, $currentTime, $currentTime]);
            }
        }
        
        $db->commit();
        sendJSON(['success' => true]);
    } catch (PDOException $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to assign tabs: ' . $e->getMessage()], 500);
    }
}

function handleBulkRemoveRolesFromUsers() {
    requireAdmin();
    $data = getJSONInput();
    
    if (!isset($data['userIds']) || !is_array($data['userIds']) || empty($data['userIds'])) {
        sendJSON(['error' => 'userIds array is required and must not be empty'], 400);
    }
    
    if (!isset($data['roleIds']) || !is_array($data['roleIds']) || empty($data['roleIds'])) {
        sendJSON(['error' => 'roleIds array is required and must not be empty'], 400);
    }
    
    $db = getDB();
    $successCount = 0;
    $errorCount = 0;
    $errors = [];
    
    $db->beginTransaction();
    try {
        // Verify all users exist
        $placeholders = str_repeat('?,', count($data['userIds']) - 1) . '?';
        $userCheck = $db->prepare("SELECT id FROM users WHERE id IN ($placeholders)");
        $userCheck->execute($data['userIds']);
        $validUserIds = [];
        while ($row = $userCheck->fetch()) {
            $validUserIds[] = (int)$row['id'];
        }
        
        if (empty($validUserIds)) {
            $db->rollBack();
            sendJSON(['error' => 'No valid users found'], 400);
        }
        
        // Verify all roles exist
        $rolePlaceholders = str_repeat('?,', count($data['roleIds']) - 1) . '?';
        $roleCheck = $db->prepare("SELECT id FROM roles WHERE id IN ($rolePlaceholders)");
        $roleCheck->execute($data['roleIds']);
        $validRoleIds = [];
        while ($row = $roleCheck->fetch()) {
            $validRoleIds[] = (int)$row['id'];
        }
        
        if (empty($validRoleIds)) {
            $db->rollBack();
            sendJSON(['error' => 'No valid roles found'], 400);
        }
        
        // Prepare statement to remove roles
        $placeholders = str_repeat('?,', count($validRoleIds) - 1) . '?';
        $deleteStmt = $db->prepare("DELETE FROM user_roles WHERE user_id = ? AND role_id IN ($placeholders)");
        
        // Process each user
        foreach ($validUserIds as $userId) {
            try {
                $deleteStmt->execute([$userId, ...$validRoleIds]);
                $successCount++;
            } catch (PDOException $e) {
                $errorCount++;
                $errors[] = "User ID $userId: " . $e->getMessage();
            }
        }
        
        $db->commit();
        
        $response = [
            'success' => true,
            'removed' => $successCount,
            'failed' => $errorCount
        ];
        
        if (!empty($errors)) {
            $response['errors'] = $errors;
        }
        
        sendJSON($response);
    } catch (PDOException $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to bulk remove roles: ' . $e->getMessage()], 500);
    }
}

function handleRemoveRoleFromUser($userId, $roleId) {
    requireAdmin();
    $db = getDB();
    
    $stmt = $db->prepare('DELETE FROM user_roles WHERE user_id = ? AND role_id = ?');
    $stmt->execute([$userId, $roleId]);
    
    sendJSON(['success' => true]);
}

function handleGetRoleGroups($roleId) {
    requireAdmin();
    $db = getDB();

    $roleCheck = $db->prepare('SELECT id FROM roles WHERE id = ?');
    $roleCheck->execute([$roleId]);
    if (!$roleCheck->fetch()) {
        sendJSON(['error' => 'Role not found'], 404);
    }

    $stmt = $db->prepare('
        SELECT
            ug.id,
            ug.name,
            ug.description,
            COUNT(DISTINCT ugm.user_id) as member_count,
            gr.created_at
        FROM user_groups ug
        INNER JOIN group_roles gr ON ug.id = gr.group_id
        LEFT JOIN user_group_members ugm ON ug.id = ugm.group_id
        WHERE gr.role_id = ?
        GROUP BY ug.id, ug.name, ug.description, gr.created_at
        ORDER BY ug.name
    ');
    $stmt->execute([$roleId]);

    $groups = [];
    while ($row = $stmt->fetch()) {
        $groups[] = [
            'id' => (int)$row['id'],
            'name' => $row['name'],
            'description' => $row['description'],
            'memberCount' => (int)$row['member_count'],
            'assignedAt' => (int)$row['created_at']
        ];
    }

    sendJSON($groups);
}

function handleRemoveGroupFromRole($roleId, $groupId) {
    requireAdmin();
    $db = getDB();

    $stmt = $db->prepare('DELETE FROM group_roles WHERE role_id = ? AND group_id = ?');
    $stmt->execute([$roleId, $groupId]);

    sendJSON(['success' => true]);
}

function handleBulkAssignRolesToGroups() {
    requireAdmin();
    $data = getJSONInput();
    
    if (!isset($data['groupIds']) || !is_array($data['groupIds']) || empty($data['groupIds'])) {
        sendJSON(['error' => 'groupIds array is required and must not be empty'], 400);
    }
    
    if (!isset($data['roleIds']) || !is_array($data['roleIds']) || empty($data['roleIds'])) {
        sendJSON(['error' => 'roleIds array is required and must not be empty'], 400);
    }
    
    $db = getDB();
    $currentTime = time();
    $successCount = 0;
    $errorCount = 0;
    $errors = [];
    
    $db->beginTransaction();
    try {
        // Verify all groups exist
        $placeholders = str_repeat('?,', count($data['groupIds']) - 1) . '?';
        $groupCheck = $db->prepare("SELECT id FROM user_groups WHERE id IN ($placeholders)");
        $groupCheck->execute($data['groupIds']);
        $validGroupIds = [];
        while ($row = $groupCheck->fetch()) {
            $validGroupIds[] = (int)$row['id'];
        }
        
        if (empty($validGroupIds)) {
            $db->rollBack();
            sendJSON(['error' => 'No valid groups found'], 400);
        }
        
        // Verify all roles exist
        $rolePlaceholders = str_repeat('?,', count($data['roleIds']) - 1) . '?';
        $roleCheck = $db->prepare("SELECT id FROM roles WHERE id IN ($rolePlaceholders)");
        $roleCheck->execute($data['roleIds']);
        $validRoleIds = [];
        while ($row = $roleCheck->fetch()) {
            $validRoleIds[] = (int)$row['id'];
        }
        
        if (empty($validRoleIds)) {
            $db->rollBack();
            sendJSON(['error' => 'No valid roles found'], 400);
        }
        
        // Determine mode
        $mode = isset($data['mode']) && $data['mode'] === 'replace' ? 'replace' : 'add';
        
        // Prepare statements
        $deleteStmt = $db->prepare('DELETE FROM group_roles WHERE group_id = ?');
        // Use INSERT OR IGNORE for add mode to avoid duplicates, regular INSERT for replace mode
        $insertStmt = $db->prepare($mode === 'add' 
            ? 'INSERT OR IGNORE INTO group_roles (group_id, role_id, created_at) VALUES (?, ?, ?)'
            : 'INSERT INTO group_roles (group_id, role_id, created_at) VALUES (?, ?, ?)');
        
        // Process each group
        foreach ($validGroupIds as $groupId) {
            try {
                // Remove existing roles for this group (if replace mode)
                if ($mode === 'replace') {
                    $deleteStmt->execute([$groupId]);
                }
                
                // Assign new roles
                foreach ($validRoleIds as $roleId) {
                    $insertStmt->execute([$groupId, $roleId, $currentTime]);
                }
                
                $successCount++;
            } catch (PDOException $e) {
                $errorCount++;
                $errors[] = "Group ID $groupId: " . $e->getMessage();
            }
        }
        
        $db->commit();
        
        $response = [
            'success' => true,
            'assigned' => $successCount,
            'failed' => $errorCount
        ];
        
        if (!empty($errors)) {
            $response['errors'] = $errors;
        }
        
        sendJSON($response);
    } catch (PDOException $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to bulk assign roles to groups: ' . $e->getMessage()], 500);
    }
}

function handleBulkRemoveRolesFromGroups() {
    requireAdmin();
    $data = getJSONInput();
    
    if (!isset($data['groupIds']) || !is_array($data['groupIds']) || empty($data['groupIds'])) {
        sendJSON(['error' => 'groupIds array is required and must not be empty'], 400);
    }
    
    if (!isset($data['roleIds']) || !is_array($data['roleIds']) || empty($data['roleIds'])) {
        sendJSON(['error' => 'roleIds array is required and must not be empty'], 400);
    }
    
    $db = getDB();
    $successCount = 0;
    $errorCount = 0;
    $errors = [];
    
    $db->beginTransaction();
    try {
        // Verify all groups exist
        $placeholders = str_repeat('?,', count($data['groupIds']) - 1) . '?';
        $groupCheck = $db->prepare("SELECT id FROM user_groups WHERE id IN ($placeholders)");
        $groupCheck->execute($data['groupIds']);
        $validGroupIds = [];
        while ($row = $groupCheck->fetch()) {
            $validGroupIds[] = (int)$row['id'];
        }
        
        if (empty($validGroupIds)) {
            $db->rollBack();
            sendJSON(['error' => 'No valid groups found'], 400);
        }
        
        // Verify all roles exist
        $rolePlaceholders = str_repeat('?,', count($data['roleIds']) - 1) . '?';
        $roleCheck = $db->prepare("SELECT id FROM roles WHERE id IN ($rolePlaceholders)");
        $roleCheck->execute($data['roleIds']);
        $validRoleIds = [];
        while ($row = $roleCheck->fetch()) {
            $validRoleIds[] = (int)$row['id'];
        }
        
        if (empty($validRoleIds)) {
            $db->rollBack();
            sendJSON(['error' => 'No valid roles found'], 400);
        }
        
        // Prepare statement to remove roles
        $placeholders = str_repeat('?,', count($validRoleIds) - 1) . '?';
        $deleteStmt = $db->prepare("DELETE FROM group_roles WHERE group_id = ? AND role_id IN ($placeholders)");
        
        // Process each group
        foreach ($validGroupIds as $groupId) {
            try {
                $deleteStmt->execute([$groupId, ...$validRoleIds]);
                $successCount++;
            } catch (PDOException $e) {
                $errorCount++;
                $errors[] = "Group ID $groupId: " . $e->getMessage();
            }
        }
        
        $db->commit();
        
        $response = [
            'success' => true,
            'removed' => $successCount,
            'failed' => $errorCount
        ];
        
        if (!empty($errors)) {
            $response['errors'] = $errors;
        }
        
        sendJSON($response);
    } catch (PDOException $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to bulk remove roles from groups: ' . $e->getMessage()], 500);
    }
}
