<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/email_templates.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

// Require authentication
requireAuth();

switch ($method) {
    case 'GET':
        if ($path === '/servers' || $path === '/servers/') {
            handleGetAllServers();
        } else {
            // Legacy endpoint - returns active server for backward compatibility
            handleGetActiveServer();
        }
        break;
    case 'POST':
        if ($path === '/test') {
            handleTestConnection();
        } elseif ($path === '/activate' || $path === '/activate/') {
            handleActivateServer();
        } else {
            handleCreateServer();
        }
        break;
    case 'PUT':
        if (preg_match('/^\/(\d+)$/', $path, $matches)) {
            handleUpdateServer((int)$matches[1]);
        } else {
            // Legacy endpoint - update active server
            handleUpdateActiveServer();
        }
        break;
    case 'DELETE':
        if (preg_match('/^\/(\d+)$/', $path, $matches)) {
            handleDeleteServer((int)$matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleGetAllServers() {
    $db = getDB();
    $stmt = $db->prepare("SELECT id, name, host, port, username, from_email, from_name, encryption, is_active, is_enabled, pause_start, pause_end, created_at, updated_at FROM smtp_servers ORDER BY is_active DESC, name ASC");
    $stmt->execute();
    $servers = $stmt->fetchAll();
    
    // Convert to proper types
    foreach ($servers as &$server) {
        $server['id'] = (int)$server['id'];
        $server['port'] = (int)$server['port'];
        $server['is_active'] = (bool)$server['is_active'];
        $server['is_enabled'] = (bool)$server['is_enabled'];
        $server['password'] = ''; // Don't send password
    }
    
    sendJSON(['servers' => $servers]);
}

function handleGetActiveServer() {
    $db = getDB();
    $stmt = $db->prepare("SELECT id, name, host, port, username, from_email, from_name, encryption, is_active, is_enabled, pause_start, pause_end FROM smtp_servers WHERE is_active = 1 LIMIT 1");
    $stmt->execute();
    $server = $stmt->fetch();
    
    // Legacy format for backward compatibility
    $settings = [
        'host' => '',
        'port' => 587,
        'username' => '',
        'password' => '',
        'from_email' => '',
        'from_name' => '{app_name} Monitor',
        'encryption' => 'tls',
        'enabled' => false,
        'pause_start' => '',
        'pause_end' => ''
    ];
    
    if ($server) {
        $settings = [
            'id' => (int)$server['id'],
            'name' => $server['name'],
            'host' => $server['host'],
            'port' => (int)$server['port'],
            'username' => $server['username'],
            'password' => '', // Don't send password
            'from_email' => $server['from_email'],
            'from_name' => $server['from_name'],
            'encryption' => $server['encryption'],
            'enabled' => (bool)$server['is_enabled'],
            'pause_start' => $server['pause_start'] ?? '',
            'pause_end' => $server['pause_end'] ?? ''
        ];
    }
    
    sendJSON(['settings' => $settings]);
}

function handleCreateServer() {
    $data = getJSONInput();
    $db = getDB();
    $now = time();
    
    // Validate required fields
    if (empty($data['name']) || empty($data['host']) || empty($data['from_email'])) {
        sendJSON(['error' => 'Name, host, and from_email are required'], 400);
        return;
    }
    
    try {
        $db->beginTransaction();
        
        // If this is set as active, deactivate all others
        $isActive = !empty($data['is_active']) ? 1 : 0;
        if ($isActive) {
            $db->exec('UPDATE smtp_servers SET is_active = 0');
        }
        
        // Encode password if provided
        $password = '';
        if (!empty($data['password'])) {
            $password = base64_encode($data['password']);
        }
        
        $stmt = $db->prepare('INSERT INTO smtp_servers 
            (name, host, port, username, password, from_email, from_name, encryption, is_active, is_enabled, pause_start, pause_end, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        
        $stmt->execute([
            $data['name'],
            $data['host'],
            (int)($data['port'] ?? 587),
            $data['username'] ?? '',
            $password,
            $data['from_email'],
            $data['from_name'] ?? '{app_name} Monitor',
            $data['encryption'] ?? 'tls',
            $isActive,
            !empty($data['is_enabled']) ? 1 : 0,
            $data['pause_start'] ?? null,
            $data['pause_end'] ?? null,
            $now,
            $now
        ]);
        
        $serverId = $db->lastInsertId('smtp_servers');
        
        $db->commit();
        
        sendJSON(['success' => true, 'server_id' => (int)$serverId, 'message' => 'SMTP server created']);
        
    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJSON(['error' => 'Failed to create server: ' . $e->getMessage()], 500);
    }
}

function handleUpdateServer($serverId) {
    $data = getJSONInput();
    $db = getDB();
    $now = time();
    
    try {
        $db->beginTransaction();
        
        // Check if server exists
        $stmt = $db->prepare('SELECT id FROM smtp_servers WHERE id = ?');
        $stmt->execute([$serverId]);
        if (!$stmt->fetch()) {
            sendJSON(['error' => 'Server not found'], 404);
            return;
        }
        
        $fields = ['name', 'host', 'port', 'username', 'password', 'from_email', 'from_name', 'encryption', 'is_enabled', 'pause_start', 'pause_end'];
        $updates = [];
        $values = [];
        
        foreach ($fields as $field) {
            if (isset($data[$field])) {
                $val = $data[$field];
                
                // Password special handling
                if ($field === 'password') {
                    if (empty($val)) continue; // Don't update if empty (unchanged)
                    $val = base64_encode($val);
                    $updates[] = 'password = ?';
                    $values[] = $val;
                } elseif ($field === 'is_enabled') {
                    $updates[] = 'is_enabled = ?';
                    $values[] = $val ? 1 : 0;
                } elseif ($field === 'port') {
                    $updates[] = 'port = ?';
                    $values[] = (int)$val;
                } else {
                    $updates[] = "$field = ?";
                    $values[] = $val;
                }
            }
        }
        
        if (!empty($updates)) {
            $updates[] = 'updated_at = ?';
            $values[] = $now;
            $values[] = $serverId;
            
            $sql = 'UPDATE smtp_servers SET ' . implode(', ', $updates) . ' WHERE id = ?';
            $stmt = $db->prepare($sql);
            $stmt->execute($values);
        }
        
        $db->commit();
        
        // Return updated server
        $stmt = $db->prepare("SELECT id, name, host, port, username, from_email, from_name, encryption, is_active, is_enabled, pause_start, pause_end FROM smtp_servers WHERE id = ?");
        $stmt->execute([$serverId]);
        $server = $stmt->fetch();
        
        if ($server) {
            $server['id'] = (int)$server['id'];
            $server['port'] = (int)$server['port'];
            $server['is_active'] = (bool)$server['is_active'];
            $server['is_enabled'] = (bool)$server['is_enabled'];
            $server['password'] = '';
        }
        
        sendJSON(['success' => true, 'server' => $server]);
        
    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJSON(['error' => 'Failed to update server: ' . $e->getMessage()], 500);
    }
}

function handleUpdateActiveServer() {
    // Legacy endpoint - find active server and update it
    $db = getDB();
    $stmt = $db->prepare("SELECT id FROM smtp_servers WHERE is_active = 1 LIMIT 1");
    $stmt->execute();
    $server = $stmt->fetch();
    
    if ($server) {
        handleUpdateServer((int)$server['id']);
    } else {
        sendJSON(['error' => 'No active server found'], 404);
    }
}

function handleActivateServer() {
    $data = getJSONInput();
    $serverId = $data['server_id'] ?? null;
    
    if (!$serverId) {
        sendJSON(['error' => 'server_id is required'], 400);
        return;
    }
    
    $db = getDB();
    
    try {
        $db->beginTransaction();
        
        // Check if server exists
        $stmt = $db->prepare('SELECT id FROM smtp_servers WHERE id = ?');
        $stmt->execute([$serverId]);
        if (!$stmt->fetch()) {
            sendJSON(['error' => 'Server not found'], 404);
            return;
        }
        
        // Deactivate all servers
        $db->exec('UPDATE smtp_servers SET is_active = 0');
        
        // Activate the specified server
        $stmt = $db->prepare('UPDATE smtp_servers SET is_active = 1, updated_at = ? WHERE id = ?');
        $stmt->execute([time(), $serverId]);
        
        $db->commit();
        
        sendJSON(['success' => true, 'message' => 'SMTP server activated']);
        
    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJSON(['error' => 'Failed to activate server: ' . $e->getMessage()], 500);
    }
}

function handleDeleteServer($serverId) {
    $db = getDB();
    
    try {
        $db->beginTransaction();
        
        // Check if server exists
        $stmt = $db->prepare('SELECT is_active FROM smtp_servers WHERE id = ?');
        $stmt->execute([$serverId]);
        $server = $stmt->fetch();
        
        if (!$server) {
            sendJSON(['error' => 'Server not found'], 404);
            return;
        }
        
        // Don't allow deleting the active server if it's the only one
        $count = $db->query('SELECT COUNT(*) FROM smtp_servers')->fetchColumn();
        if ($count <= 1 && $server['is_active']) {
            sendJSON(['error' => 'Cannot delete the only SMTP server'], 400);
            return;
        }
        
        // Delete the server
        $stmt = $db->prepare('DELETE FROM smtp_servers WHERE id = ?');
        $stmt->execute([$serverId]);
        
        // If we deleted the active server, activate another one
        if ($server['is_active']) {
            $db->exec('UPDATE smtp_servers SET is_active = 1 WHERE id = (SELECT MIN(id) FROM smtp_servers)');
        }
        
        $db->commit();
        
        sendJSON(['success' => true, 'message' => 'SMTP server deleted']);
        
    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJSON(['error' => 'Failed to delete server: ' . $e->getMessage()], 500);
    }
}

function handleTestConnection() {
    $data = getJSONInput();
    
    try {
        // If testing an existing server by ID
        if (isset($data['server_id'])) {
            $db = getDB();
            $stmt = $db->prepare("SELECT * FROM smtp_servers WHERE id = ?");
            $stmt->execute([$data['server_id']]);
            $server = $stmt->fetch();
            
            if (!$server) {
                sendJSON(['success' => false, 'message' => 'Server not found'], 404);
                return;
            }
            
            $data = [
                'host' => $server['host'],
                'port' => $server['port'],
                'username' => $server['username'],
                'password' => base64_decode($server['password']),
                'from_email' => $server['from_email'],
                'from_name' => $server['from_name'],
                'encryption' => $server['encryption']
            ];
        } else {
            // If password is not provided (edit mode), try to fetch from DB
            if (empty($data['password']) && isset($data['id'])) {
                $db = getDB();
                $stmt = $db->prepare("SELECT password FROM smtp_servers WHERE id = ?");
                $stmt->execute([$data['id']]);
                $row = $stmt->fetch();
                if ($row) {
                    $data['password'] = base64_decode($row['password']);
                }
            }
        }
        
        // Get current admin email as recipient
        $db = getDB();
        $stmt = $db->prepare('SELECT email FROM users WHERE is_admin = 1 LIMIT 1');
        $stmt->execute();
        $admin = $stmt->fetch();
        
        if (!$admin || empty($admin['email'])) {
            throw new Exception("No admin email found to send test to");
        }
        
        // For Mercury mail server, convert email domain to 'localhost' if it ends with '.com' or other extensions
        // Mercury typically accepts @localhost by default
        $testEmail = $admin['email'];
        if (preg_match('/^(.+)@(.+)\.(.+)$/', $testEmail, $matches)) {
            // If email has a domain extension, try using just 'localhost' instead
            // This works better with Mercury's default configuration
            $username = $matches[1];
            $testEmail = $username . '@localhost';
        }
        
        // Get app_name from settings
        $appName = getAppName() ?: 'LinkNest';

        $result = sendEmail(
            $testEmail, 
            $appName . ' SMTP Test', 
            ln_render_smtp_test_email_text($testEmail, $appName),
            $data,
            [],
            [
                'html' => ln_render_smtp_test_email_html($testEmail, $appName),
                'text' => ln_render_smtp_test_email_text($testEmail, $appName)
            ]
        );
        
        if ($result === true) {
            sendJSON(['success' => true, 'message' => 'Test email sent successfully to ' . $testEmail . ' (converted from ' . $admin['email'] . ' for Mercury compatibility)']);
        } else {
            // If localhost conversion failed, provide helpful error message
            $errorMsg = 'Failed to send email: ' . $result;
            if (strpos($result, '550') !== false) {
                $errorMsg .= ' | Tip: For Mercury mail server, use email addresses with @localhost domain (e.g., ' . $username . '@localhost) or add the user to Mercury via its web interface.';
            }
            sendJSON(['success' => false, 'message' => $errorMsg]);
        }
        
    } catch (Exception $e) {
        sendJSON(['success' => false, 'message' => 'Error: ' . $e->getMessage()]);
    }
}
