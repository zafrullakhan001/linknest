<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? $_POST['action'] ?? '';

switch ($method) {
    case 'GET':
        if ($action === 'get' && isset($_GET['widgetId'])) {
            handleGetWidget($_GET['widgetId']);
        } elseif ($action === 'all') {
            handleGetAllAvailableWidgets();
        } elseif ($action === 'allowed') {
            handleGetAllowedWidgets();
        } else {
            handleGetAllWidgets();
        }
        break;
        
    case 'POST':
        if ($action === 'create') {
            handleCreateWidget();
        } elseif ($action === 'update') {
            handleUpdateWidget();
        } elseif ($action === 'delete') {
            handleDeleteWidget();
        } else {
            sendJSON(['error' => 'Invalid action'], 400);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
        break;
}

function handleGetAllWidgets() {
    requireAdmin();
    $db = getDB();
    
    $stmt = $db->query('
        SELECT 
            id,
            widget_id,
            name,
            description,
            component_path,
            floating_component_path,
            icon_svg,
            requires_auth,
            enabled,
            created_at,
            updated_at
        FROM custom_widgets
        ORDER BY name
    ');
    
    $widgets = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $widgets[] = [
            'id' => (int)$row['id'],
            'widgetId' => $row['widget_id'],
            'name' => $row['name'],
            'description' => $row['description'],
            'componentPath' => $row['component_path'],
            'floatingComponentPath' => $row['floating_component_path'],
            'iconSvg' => $row['icon_svg'],
            'requiresAuth' => (bool)$row['requires_auth'],
            'enabled' => (bool)$row['enabled'],
            'createdAt' => (int)$row['created_at'],
            'updatedAt' => (int)$row['updated_at']
        ];
    }
    
    sendJSON($widgets);
}

function handleGetAllAvailableWidgets() {
    // This endpoint returns both built-in and custom widgets
    // No admin requirement - used by frontend to display widget list
    
    $builtInWidgets = [
        ['id' => 'clock', 'label' => 'Clock', 'description' => 'Time and timezone display widget', 'isCustom' => false],
        ['id' => 'weather', 'label' => 'Weather', 'description' => 'Weather information widget', 'isCustom' => false],
        ['id' => 'calculator', 'label' => 'Calculator', 'description' => 'Calculator widget', 'isCustom' => false],
        ['id' => 'notes', 'label' => 'Notes', 'description' => 'Personal notes widget (requires authentication)', 'isCustom' => false],
        ['id' => 'password-generator', 'label' => 'Password Generator', 'description' => 'Generate secure passwords', 'isCustom' => false],
        ['id' => 'phonetic-alphabet', 'label' => 'Phonetic Alphabet', 'description' => 'Phonetic alphabet reference', 'isCustom' => false],
        ['id' => 'zoom-control', 'label' => 'Zoom Control', 'description' => 'Page zoom control widget', 'isCustom' => false],
        ['id' => 'theme', 'label' => 'Theme', 'description' => 'Theme switcher widget', 'isCustom' => false],
        ['id' => 'fav-organizer', 'label' => 'Favorite Organizer', 'description' => 'Organize favorite links', 'isCustom' => false],
        ['id' => 'chat', 'label' => 'Chat', 'description' => 'Chat widget (requires authentication)', 'isCustom' => false],
        ['id' => 'snake-game', 'label' => 'Snake Game', 'description' => 'Snake game widget', 'isCustom' => false],
        ['id' => 'vnc-viewer', 'label' => 'VNC Viewer', 'description' => 'noVNC remote desktop viewer (websockify URL)', 'isCustom' => false],
        ['id' => 'ssh-terminal', 'label' => 'SSH Terminal', 'description' => 'xterm.js web SSH terminal (ttyd WebSocket URL)', 'isCustom' => false]
    ];
    
    $db = getDB();
    $customWidgets = [];
    
    try {
        $stmt = $db->query('
            SELECT 
                widget_id,
                name,
                description,
                enabled
            FROM custom_widgets
            WHERE enabled = 1
            ORDER BY name
        ');
        
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $customWidgets[] = [
                'id' => $row['widget_id'],
                'label' => $row['name'],
                'description' => $row['description'] ?? 'Custom widget',
                'isCustom' => true
            ];
        }
    } catch (PDOException $e) {
        // If error, just return built-in widgets
        error_log('Failed to fetch custom widgets: ' . $e->getMessage());
    }
    
    sendJSON([...$builtInWidgets, ...$customWidgets]);
}

function handleGetAllowedWidgets() {
    // This endpoint returns widgets that the current user is allowed to access based on their roles
    $user = getAuthenticatedUser();
    $db = getDB();
    
    // Admins can access all widgets
    if ($user && $user['is_admin']) {
        handleGetAllAvailableWidgets();
        return;
    }
    
    // Get user's role IDs (including from groups)
    $userRoleIds = getUserRoleIds($user ? $user['id'] : null, $db);
    
    // If user has no roles, return empty array (no widgets allowed)
    if (empty($userRoleIds)) {
        sendJSON([]);
        return;
    }
    
    // Get allowed widget IDs from role_widget_permissions
    $placeholders = implode(',', array_fill(0, count($userRoleIds), '?'));
    $stmt = $db->prepare("SELECT DISTINCT widget_id FROM role_widget_permissions WHERE role_id IN ($placeholders) AND can_view = 1");
    $stmt->execute($userRoleIds);
    
    $allowedWidgetIds = [];
    while ($row = $stmt->fetch()) {
        $allowedWidgetIds[] = $row['widget_id'];
    }
    
    // Get all available widgets
    $builtInWidgets = [
        ['id' => 'clock', 'label' => 'Clock', 'description' => 'Time and timezone display widget', 'isCustom' => false],
        ['id' => 'weather', 'label' => 'Weather', 'description' => 'Weather information widget', 'isCustom' => false],
        ['id' => 'calculator', 'label' => 'Calculator', 'description' => 'Calculator widget', 'isCustom' => false],
        ['id' => 'notes', 'label' => 'Notes', 'description' => 'Personal notes widget (requires authentication)', 'isCustom' => false],
        ['id' => 'password-generator', 'label' => 'Password Generator', 'description' => 'Generate secure passwords', 'isCustom' => false],
        ['id' => 'phonetic-alphabet', 'label' => 'Phonetic Alphabet', 'description' => 'Phonetic alphabet reference', 'isCustom' => false],
        ['id' => 'zoom-control', 'label' => 'Zoom Control', 'description' => 'Page zoom control widget', 'isCustom' => false],
        ['id' => 'theme', 'label' => 'Theme', 'description' => 'Theme switcher widget', 'isCustom' => false],
        ['id' => 'fav-organizer', 'label' => 'Favorite Organizer', 'description' => 'Organize favorite links', 'isCustom' => false],
        ['id' => 'chat', 'label' => 'Chat', 'description' => 'Chat widget (requires authentication)', 'isCustom' => false],
        ['id' => 'snake-game', 'label' => 'Snake Game', 'description' => 'Snake game widget', 'isCustom' => false],
        ['id' => 'vnc-viewer', 'label' => 'VNC Viewer', 'description' => 'noVNC remote desktop viewer (websockify URL)', 'isCustom' => false],
        ['id' => 'ssh-terminal', 'label' => 'SSH Terminal', 'description' => 'xterm.js web SSH terminal (ttyd WebSocket URL)', 'isCustom' => false]
    ];
    
    $customWidgets = [];
    try {
        $customStmt = $db->query('
            SELECT 
                widget_id,
                name,
                description,
                enabled
            FROM custom_widgets
            WHERE enabled = 1
            ORDER BY name
        ');
        
        while ($row = $customStmt->fetch(PDO::FETCH_ASSOC)) {
            $customWidgets[] = [
                'id' => $row['widget_id'],
                'label' => $row['name'],
                'description' => $row['description'] ?? 'Custom widget',
                'isCustom' => true
            ];
        }
    } catch (PDOException $e) {
        error_log('Failed to fetch custom widgets: ' . $e->getMessage());
    }
    
    $allWidgets = [...$builtInWidgets, ...$customWidgets];
    
    // Filter to only include allowed widgets
    $allowedWidgets = array_filter($allWidgets, function($widget) use ($allowedWidgetIds) {
        return in_array($widget['id'], $allowedWidgetIds);
    });
    
    sendJSON(array_values($allowedWidgets));
}

function handleGetWidget($widgetId) {
    requireAdmin();
    $db = getDB();
    
    $stmt = $db->prepare('
        SELECT 
            id,
            widget_id,
            name,
            description,
            component_path,
            floating_component_path,
            icon_svg,
            requires_auth,
            enabled,
            created_at,
            updated_at
        FROM custom_widgets
        WHERE widget_id = ?
    ');
    $stmt->execute([$widgetId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$row) {
        sendJSON(['error' => 'Widget not found'], 404);
        return;
    }
    
    sendJSON([
        'id' => (int)$row['id'],
        'widgetId' => $row['widget_id'],
        'name' => $row['name'],
        'description' => $row['description'],
        'componentPath' => $row['component_path'],
        'floatingComponentPath' => $row['floating_component_path'],
        'iconSvg' => $row['icon_svg'],
        'requiresAuth' => (bool)$row['requires_auth'],
        'enabled' => (bool)$row['enabled'],
        'createdAt' => (int)$row['created_at'],
        'updatedAt' => (int)$row['updated_at']
    ]);
}

function handleCreateWidget() {
    requireAdmin();
    $data = getJSONInput();
    
    // Validate required fields
    if (!isset($data['widgetId']) || empty($data['widgetId'])) {
        sendJSON(['error' => 'widgetId is required'], 400);
        return;
    }
    
    if (!isset($data['name']) || empty($data['name'])) {
        sendJSON(['error' => 'name is required'], 400);
        return;
    }
    
    if (!isset($data['componentPath']) || empty($data['componentPath'])) {
        sendJSON(['error' => 'componentPath is required'], 400);
        return;
    }
    
    // Validate widget ID format (alphanumeric, hyphens, underscores only)
    if (!preg_match('/^[a-z0-9_-]+$/', $data['widgetId'])) {
        sendJSON(['error' => 'widgetId must contain only lowercase letters, numbers, hyphens, and underscores'], 400);
        return;
    }
    
    $db = getDB();
    
    // Check if widget ID already exists
    $checkStmt = $db->prepare('SELECT id FROM custom_widgets WHERE widget_id = ?');
    $checkStmt->execute([$data['widgetId']]);
    if ($checkStmt->fetch()) {
        sendJSON(['error' => 'Widget ID already exists'], 409);
        return;
    }
    
    $currentTime = time();
    
    try {
        $stmt = $db->prepare('
            INSERT INTO custom_widgets (
                widget_id,
                name,
                description,
                component_path,
                floating_component_path,
                icon_svg,
                requires_auth,
                enabled,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
        
        $stmt->execute([
            $data['widgetId'],
            $data['name'],
            $data['description'] ?? null,
            $data['componentPath'],
            $data['floatingComponentPath'] ?? null,
            $data['iconSvg'] ?? null,
            isset($data['requiresAuth']) ? (int)(bool)$data['requiresAuth'] : 0,
            isset($data['enabled']) ? (int)(bool)$data['enabled'] : 1,
            $currentTime,
            $currentTime
        ]);
        
        sendJSON([
            'success' => true,
            'id' => (int)$db->lastInsertId(),
            'widgetId' => $data['widgetId']
        ]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to create widget: ' . $e->getMessage()], 500);
    }
}

function handleUpdateWidget() {
    requireAdmin();
    $data = getJSONInput();
    
    if (!isset($data['widgetId']) || empty($data['widgetId'])) {
        sendJSON(['error' => 'widgetId is required'], 400);
        return;
    }
    
    $db = getDB();
    
    // Check if widget exists
    $checkStmt = $db->prepare('SELECT id FROM custom_widgets WHERE widget_id = ?');
    $checkStmt->execute([$data['widgetId']]);
    if (!$checkStmt->fetch()) {
        sendJSON(['error' => 'Widget not found'], 404);
        return;
    }
    
    $currentTime = time();
    $updateFields = [];
    $updateValues = [];
    
    // Build update query dynamically based on provided fields
    $allowedFields = [
        'name' => 'name',
        'description' => 'description',
        'componentPath' => 'component_path',
        'floatingComponentPath' => 'floating_component_path',
        'iconSvg' => 'icon_svg',
        'requiresAuth' => 'requires_auth',
        'enabled' => 'enabled'
    ];
    
    foreach ($allowedFields as $jsonKey => $dbKey) {
        if (isset($data[$jsonKey])) {
            $updateFields[] = "$dbKey = ?";
            if ($jsonKey === 'requiresAuth' || $jsonKey === 'enabled') {
                $updateValues[] = (int)(bool)$data[$jsonKey];
            } else {
                $updateValues[] = $data[$jsonKey];
            }
        }
    }
    
    if (empty($updateFields)) {
        sendJSON(['error' => 'No fields to update'], 400);
        return;
    }
    
    $updateFields[] = 'updated_at = ?';
    $updateValues[] = $currentTime;
    $updateValues[] = $data['widgetId']; // For WHERE clause
    
    try {
        $stmt = $db->prepare('
            UPDATE custom_widgets
            SET ' . implode(', ', $updateFields) . '
            WHERE widget_id = ?
        ');
        
        $stmt->execute($updateValues);
        
        sendJSON(['success' => true, 'widgetId' => $data['widgetId']]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to update widget: ' . $e->getMessage()], 500);
    }
}

function handleDeleteWidget() {
    requireAdmin();
    $data = getJSONInput();
    
    if (!isset($data['widgetId']) || empty($data['widgetId'])) {
        sendJSON(['error' => 'widgetId is required'], 400);
        return;
    }
    
    $db = getDB();
    
    // Check if widget exists
    $checkStmt = $db->prepare('SELECT id FROM custom_widgets WHERE widget_id = ?');
    $checkStmt->execute([$data['widgetId']]);
    if (!$checkStmt->fetch()) {
        sendJSON(['error' => 'Widget not found'], 404);
        return;
    }
    
    try {
        // Delete widget permissions first (cascade should handle this, but being explicit)
        $deletePermsStmt = $db->prepare('DELETE FROM role_widget_permissions WHERE widget_id = ?');
        $deletePermsStmt->execute([$data['widgetId']]);
        
        // Delete the widget
        $stmt = $db->prepare('DELETE FROM custom_widgets WHERE widget_id = ?');
        $stmt->execute([$data['widgetId']]);
        
        sendJSON(['success' => true, 'widgetId' => $data['widgetId']]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to delete widget: ' . $e->getMessage()], 500);
    }
}
