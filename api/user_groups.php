<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

switch ($method) {
    case 'GET':
        if ($path === '' || $path === '/') {
            handleGetUserGroups();
        } elseif (preg_match('#^/(\d+)$#', $path, $matches)) {
            handleGetUserGroup($matches[1]);
        } elseif (preg_match('#^/(\d+)/members$#', $path, $matches)) {
            handleGetGroupMembers($matches[1]);
        } elseif (preg_match('#^/(\d+)/roles$#', $path, $matches)) {
            handleGetGroupRoles($matches[1]);
        } elseif (preg_match('#^/user/(\d+)$#', $path, $matches)) {
            handleGetUserGroupsForUser($matches[1]);
        } elseif (preg_match('#^/users/batch-groups$#', $path)) {
            handleGetBatchUserGroups();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'POST':
        if ($path === '' || $path === '/') {
            handleCreateUserGroup();
        } elseif (preg_match('#^/(\d+)/add-members$#', $path, $matches)) {
            handleAddMembersToGroup($matches[1]);
        } elseif (preg_match('#^/(\d+)/assign-roles$#', $path, $matches)) {
            handleAssignRolesToGroup($matches[1]);
        } elseif ($path === '/bulk-assign' || $path === '/bulk-assign/') {
            handleBulkAssignGroupsToUsers();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'PUT':
        if (preg_match('#^/(\d+)$#', $path, $matches)) {
            handleUpdateUserGroup($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'DELETE':
        if (preg_match('#^/(\d+)$#', $path, $matches)) {
            handleDeleteUserGroup($matches[1]);
        } elseif (preg_match('#^/(\d+)/member/(\d+)$#', $path, $matches)) {
            handleRemoveMemberFromGroup($matches[1], $matches[2]);
        } elseif (preg_match('#^/(\d+)/role/(\d+)$#', $path, $matches)) {
            handleRemoveRoleFromGroup($matches[1], $matches[2]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleGetUserGroups() {
    requireAdmin();
    $db = getDB();
    
    $stmt = $db->query('
        SELECT 
            ug.*,
            COUNT(DISTINCT ugm.user_id) as member_count,
            COUNT(DISTINCT gr.role_id) as role_count
        FROM user_groups ug
        LEFT JOIN user_group_members ugm ON ug.id = ugm.group_id
        LEFT JOIN group_roles gr ON ug.id = gr.group_id
        GROUP BY ug.id
        ORDER BY ug.name
    ');
    
    $groups = [];
    while ($row = $stmt->fetch()) {
        $groups[] = [
            'id' => (int)$row['id'],
            'name' => $row['name'],
            'description' => $row['description'],
            'memberCount' => (int)$row['member_count'],
            'roleCount' => (int)$row['role_count'],
            'createdAt' => (int)$row['created_at'],
            'updatedAt' => (int)$row['updated_at']
        ];
    }
    
    sendJSON($groups);
}

function handleGetUserGroup($groupId) {
    requireAdmin();
    $db = getDB();
    
    $stmt = $db->prepare('SELECT * FROM user_groups WHERE id = ?');
    $stmt->execute([$groupId]);
    $row = $stmt->fetch();
    
    if (!$row) {
        sendJSON(['error' => 'User group not found'], 404);
    }
    
    sendJSON([
        'id' => (int)$row['id'],
        'name' => $row['name'],
        'description' => $row['description'],
        'createdAt' => (int)$row['created_at'],
        'updatedAt' => (int)$row['updated_at']
    ]);
}

function handleGetGroupMembers($groupId) {
    requireAdmin();
    $db = getDB();
    
    // Verify group exists
    $groupCheck = $db->prepare('SELECT id FROM user_groups WHERE id = ?');
    $groupCheck->execute([$groupId]);
    if (!$groupCheck->fetch()) {
        sendJSON(['error' => 'User group not found'], 404);
    }
    
    $stmt = $db->prepare('
        SELECT 
            u.id,
            u.username,
            u.email,
            u.auth_source,
            ugm.created_at
        FROM users u
        INNER JOIN user_group_members ugm ON u.id = ugm.user_id
        WHERE ugm.group_id = ?
        ORDER BY u.username
    ');
    $stmt->execute([$groupId]);
    
    $members = [];
    while ($row = $stmt->fetch()) {
        $members[] = [
            'id' => (int)$row['id'],
            'username' => $row['username'],
            'email' => $row['email'],
            'authSource' => $row['auth_source'] ?? 'local',
            'joinedAt' => (int)$row['created_at']
        ];
    }
    
    sendJSON($members);
}

function handleGetGroupRoles($groupId) {
    requireAdmin();
    $db = getDB();
    
    // Verify group exists
    $groupCheck = $db->prepare('SELECT id FROM user_groups WHERE id = ?');
    $groupCheck->execute([$groupId]);
    if (!$groupCheck->fetch()) {
        sendJSON(['error' => 'User group not found'], 404);
    }
    
    $stmt = $db->prepare('
        SELECT 
            r.id,
            r.name,
            r.description,
            gr.created_at
        FROM roles r
        INNER JOIN group_roles gr ON r.id = gr.role_id
        WHERE gr.group_id = ?
        ORDER BY r.name
    ');
    $stmt->execute([$groupId]);
    
    $roles = [];
    while ($row = $stmt->fetch()) {
        $roles[] = [
            'id' => (int)$row['id'],
            'name' => $row['name'],
            'description' => $row['description'],
            'assignedAt' => (int)$row['created_at']
        ];
    }
    
    sendJSON($roles);
}

function handleGetUserGroupsForUser($userId) {
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
            ug.id,
            ug.name,
            ug.description,
            ugm.created_at
        FROM user_groups ug
        INNER JOIN user_group_members ugm ON ug.id = ugm.group_id
        WHERE ugm.user_id = ?
        ORDER BY ug.name
    ');
    $stmt->execute([$userId]);
    
    $groups = [];
    while ($row = $stmt->fetch()) {
        $groups[] = [
            'id' => (int)$row['id'],
            'name' => $row['name'],
            'description' => $row['description'],
            'joinedAt' => (int)$row['created_at']
        ];
    }
    
    sendJSON([
        'userId' => (int)$userId,
        'username' => $user['username'],
        'email' => $user['email'],
        'groups' => $groups
    ]);
}

function handleGetBatchUserGroups() {
    requireAdmin();
    $db = getDB();
    
    // Get all user groups in a single optimized query, grouped by user_id
    $stmt = $db->query('
        SELECT 
            ugm.user_id,
            ug.id as group_id,
            ug.name as group_name,
            ug.description as group_description
        FROM user_group_members ugm
        INNER JOIN user_groups ug ON ugm.group_id = ug.id
        ORDER BY ugm.user_id, ug.name
    ');
    
    $userGroups = [];
    while ($row = $stmt->fetch()) {
        $userId = (int)$row['user_id'];
        if (!isset($userGroups[$userId])) {
            $userGroups[$userId] = [];
        }
        $userGroups[$userId][] = [
            'id' => (int)$row['group_id'],
            'name' => $row['group_name'],
            'description' => $row['group_description']
        ];
    }
    
    sendJSON($userGroups);
}

function handleCreateUserGroup() {
    requireAdmin();
    $data = getJSONInput();
    
    if (!isset($data['name']) || empty(trim($data['name']))) {
        sendJSON(['error' => 'Group name is required'], 400);
    }
    
    $db = getDB();
    $currentTime = time();
    
    try {
        $stmt = $db->prepare('INSERT INTO user_groups (name, description, created_at, updated_at) VALUES (?, ?, ?, ?)');
        $stmt->execute([
            trim($data['name']),
            isset($data['description']) ? trim($data['description']) : null,
            $currentTime,
            $currentTime
        ]);
        
        $groupId = (int)$db->lastInsertId();
        
        sendJSON([
            'success' => true,
            'id' => $groupId
        ], 201);
    } catch (PDOException $e) {
        if ($e->getCode() == 23000) { // UNIQUE constraint violation
            sendJSON(['error' => 'A group with this name already exists'], 409);
        }
        sendJSON(['error' => 'Failed to create user group: ' . $e->getMessage()], 500);
    }
}

function handleUpdateUserGroup($groupId) {
    requireAdmin();
    $data = getJSONInput();
    
    $db = getDB();
    
    // Verify group exists
    $groupCheck = $db->prepare('SELECT id FROM user_groups WHERE id = ?');
    $groupCheck->execute([$groupId]);
    if (!$groupCheck->fetch()) {
        sendJSON(['error' => 'User group not found'], 404);
    }
    
    $updates = [];
    $params = [];
    
    if (isset($data['name'])) {
        if (empty(trim($data['name']))) {
            sendJSON(['error' => 'Group name cannot be empty'], 400);
        }
        $updates[] = 'name = ?';
        $params[] = trim($data['name']);
    }
    
    if (isset($data['description'])) {
        $updates[] = 'description = ?';
        $params[] = trim($data['description']) ?: null;
    }
    
    if (empty($updates)) {
        sendJSON(['error' => 'No fields to update'], 400);
    }
    
    $updates[] = 'updated_at = ?';
    $params[] = time();
    $params[] = $groupId;
    
    try {
        $stmt = $db->prepare('UPDATE user_groups SET ' . implode(', ', $updates) . ' WHERE id = ?');
        $stmt->execute($params);
        
        sendJSON(['success' => true]);
    } catch (PDOException $e) {
        if ($e->getCode() == 23000) { // UNIQUE constraint violation
            sendJSON(['error' => 'A group with this name already exists'], 409);
        }
        sendJSON(['error' => 'Failed to update user group: ' . $e->getMessage()], 500);
    }
}

function handleDeleteUserGroup($groupId) {
    requireAdmin();
    $db = getDB();
    
    // Verify group exists
    $groupCheck = $db->prepare('SELECT id FROM user_groups WHERE id = ?');
    $groupCheck->execute([$groupId]);
    if (!$groupCheck->fetch()) {
        sendJSON(['error' => 'User group not found'], 404);
    }
    
    // Delete group (cascade will handle members and roles)
    $stmt = $db->prepare('DELETE FROM user_groups WHERE id = ?');
    $stmt->execute([$groupId]);
    
    sendJSON(['success' => true]);
}

function handleAddMembersToGroup($groupId) {
    requireAdmin();
    $data = getJSONInput();
    
    if (!isset($data['userIds']) || !is_array($data['userIds'])) {
        sendJSON(['error' => 'userIds array is required'], 400);
    }
    
    $db = getDB();
    
    // Verify group exists
    $groupCheck = $db->prepare('SELECT id FROM user_groups WHERE id = ?');
    $groupCheck->execute([$groupId]);
    if (!$groupCheck->fetch()) {
        sendJSON(['error' => 'User group not found'], 404);
    }
    
    $currentTime = time();
    $added = 0;
    $skipped = 0;
    
    $db->beginTransaction();
    try {
        $stmt = $db->prepare('INSERT OR IGNORE INTO user_group_members (user_id, group_id, created_at) VALUES (?, ?, ?)');
        
        foreach ($data['userIds'] as $userId) {
            // Verify user exists
            $userCheck = $db->prepare('SELECT id FROM users WHERE id = ?');
            $userCheck->execute([$userId]);
            if (!$userCheck->fetch()) {
                $skipped++;
                continue;
            }
            
            $stmt->execute([$userId, $groupId, $currentTime]);
            if ($stmt->rowCount() > 0) {
                $added++;
            } else {
                $skipped++; // Already a member
            }
        }
        
        $db->commit();
        sendJSON([
            'success' => true,
            'added' => $added,
            'skipped' => $skipped
        ]);
    } catch (PDOException $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to add members: ' . $e->getMessage()], 500);
    }
}

function handleRemoveMemberFromGroup($groupId, $userId) {
    requireAdmin();
    $db = getDB();
    
    $stmt = $db->prepare('DELETE FROM user_group_members WHERE group_id = ? AND user_id = ?');
    $stmt->execute([$groupId, $userId]);
    
    sendJSON(['success' => true]);
}

function handleAssignRolesToGroup($groupId) {
    requireAdmin();
    $data = getJSONInput();
    
    if (!isset($data['roleIds']) || !is_array($data['roleIds'])) {
        sendJSON(['error' => 'roleIds array is required'], 400);
    }
    
    $db = getDB();
    
    // Verify group exists
    $groupCheck = $db->prepare('SELECT id FROM user_groups WHERE id = ?');
    $groupCheck->execute([$groupId]);
    if (!$groupCheck->fetch()) {
        sendJSON(['error' => 'User group not found'], 404);
    }
    
    $currentTime = time();
    
    $db->beginTransaction();
    try {
        // Remove existing roles for this group
        $deleteStmt = $db->prepare('DELETE FROM group_roles WHERE group_id = ?');
        $deleteStmt->execute([$groupId]);
        
        // Assign new roles
        if (!empty($data['roleIds'])) {
            $stmt = $db->prepare('INSERT INTO group_roles (group_id, role_id, created_at) VALUES (?, ?, ?)');
            
            foreach ($data['roleIds'] as $roleId) {
                // Verify role exists
                $roleCheck = $db->prepare('SELECT id FROM roles WHERE id = ?');
                $roleCheck->execute([$roleId]);
                if (!$roleCheck->fetch()) {
                    continue; // Skip invalid roles
                }
                
                $stmt->execute([$groupId, $roleId, $currentTime]);
            }
        }
        
        $db->commit();
        sendJSON(['success' => true]);
    } catch (PDOException $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to assign roles: ' . $e->getMessage()], 500);
    }
}

function handleRemoveRoleFromGroup($groupId, $roleId) {
    requireAdmin();
    $db = getDB();
    
    $stmt = $db->prepare('DELETE FROM group_roles WHERE group_id = ? AND role_id = ?');
    $stmt->execute([$groupId, $roleId]);
    
    sendJSON(['success' => true]);
}

function handleBulkAssignGroupsToUsers() {
    requireAdmin();
    $data = getJSONInput();
    
    if (!isset($data['userIds']) || !is_array($data['userIds']) || empty($data['userIds'])) {
        sendJSON(['error' => 'userIds array is required and cannot be empty'], 400);
    }
    
    if (!isset($data['groupIds']) || !is_array($data['groupIds']) || empty($data['groupIds'])) {
        sendJSON(['error' => 'groupIds array is required and cannot be empty'], 400);
    }
    
    $mode = $data['mode'] ?? 'add'; // 'add' or 'replace'
    
    $db = getDB();
    $currentTime = time();
    
    // Validate all user IDs
    $placeholders = implode(',', array_fill(0, count($data['userIds']), '?'));
    $userStmt = $db->prepare("SELECT id FROM users WHERE id IN ($placeholders)");
    $userStmt->execute($data['userIds']);
    $validUserIds = [];
    while ($row = $userStmt->fetch()) {
        $validUserIds[] = (int)$row['id'];
    }
    
    if (empty($validUserIds)) {
        sendJSON(['error' => 'No valid user IDs provided'], 400);
    }
    
    // Validate all group IDs
    $groupPlaceholders = implode(',', array_fill(0, count($data['groupIds']), '?'));
    $groupStmt = $db->prepare("SELECT id FROM user_groups WHERE id IN ($groupPlaceholders)");
    $groupStmt->execute($data['groupIds']);
    $validGroupIds = [];
    while ($row = $groupStmt->fetch()) {
        $validGroupIds[] = (int)$row['id'];
    }
    
    if (empty($validGroupIds)) {
        sendJSON(['error' => 'No valid group IDs provided'], 400);
    }
    
    $db->beginTransaction();
    try {
        $deleteStmt = $db->prepare('DELETE FROM user_group_members WHERE user_id = ?');
        $successCount = 0;
        $errorCount = 0;
        $errors = [];
        
        // Use INSERT OR IGNORE for add mode to avoid duplicates, regular INSERT for replace mode
        $insertStmt = $db->prepare($mode === 'add' 
            ? 'INSERT OR IGNORE INTO user_group_members (user_id, group_id, created_at) VALUES (?, ?, ?)'
            : 'INSERT INTO user_group_members (user_id, group_id, created_at) VALUES (?, ?, ?)');
        
        // Process each user
        foreach ($validUserIds as $userId) {
            try {
                // Remove existing groups for this user (if replace mode)
                if ($mode === 'replace') {
                    $deleteStmt->execute([$userId]);
                }
                
                // Assign new groups
                foreach ($validGroupIds as $groupId) {
                    $insertStmt->execute([$userId, $groupId, $currentTime]);
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
        sendJSON(['error' => 'Failed to bulk assign groups: ' . $e->getMessage()], 500);
    }
}
