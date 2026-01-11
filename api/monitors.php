<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/monitor_check.php'; // Include check logic for immediate "check now"

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

// Require authentication for all monitor operations
requireAuth();

switch ($method) {
    case 'GET':
        if ($path === '' || $path === '/') {
            handleGetMonitors();
        } elseif (preg_match('/^\/(\d+)$/', $path, $matches)) {
            handleGetMonitor($matches[1]);
        } elseif (preg_match('/^\/(\d+)\/logs$/', $path, $matches)) {
            handleGetMonitorLogs($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'POST':
        if ($path === '' || $path === '/') {
            handleCreateMonitor();
        } elseif (preg_match('/^\/(\d+)\/check$/', $path, $matches)) {
            handleCheckMonitor($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'PUT':
        if (preg_match('/^\/(\d+)$/', $path, $matches)) {
            handleUpdateMonitor($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'DELETE':
        if (preg_match('/^\/(\d+)$/', $path, $matches)) {
            handleDeleteMonitor($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleGetMonitors() {
    $db = getDB();
    $stmt = $db->prepare('SELECT * FROM monitors ORDER BY created_at DESC');
    $stmt->execute();
    $monitors = $stmt->fetchAll();
    
    sendJSON(['monitors' => $monitors]);
}

function handleGetMonitor($id) {
    $db = getDB();
    $stmt = $db->prepare('SELECT * FROM monitors WHERE id = ?');
    $stmt->execute([$id]);
    $monitor = $stmt->fetch();
    
    if (!$monitor) {
        sendJSON(['error' => 'Monitor not found'], 404);
        return;
    }
    
    sendJSON(['monitor' => $monitor]);
}

function handleCreateMonitor() {
    $data = getJSONInput();
    
    // Validation
    if (empty($data['name']) || empty($data['type']) || empty($data['target'])) {
        sendJSON(['error' => 'Name, type, and target are required'], 400);
        return;
    }
    
    if (!in_array($data['type'], ['url', 'keyword', 'port'])) {
        sendJSON(['error' => 'Invalid type. Must be url, keyword, or port'], 400);
        return;
    }
    
    $db = getDB();
    
    try {
        $stmt = $db->prepare('INSERT INTO monitors (
            name, type, target, port, keyword, interval, 
            is_active, email_notification, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        
        $now = time();
        $stmt->execute([
            $data['name'],
            $data['type'],
            $data['target'],
            isset($data['port']) ? (int)$data['port'] : null,
            $data['keyword'] ?? null,
            isset($data['interval']) ? (int)$data['interval'] : 5,
            isset($data['is_active']) ? (int)$data['is_active'] : 1,
            isset($data['email_notification']) ? (int)$data['email_notification'] : 0,
            $now,
            $now
        ]);
        
        $id = $db->lastInsertId();
        
        // Fetch created monitor
        $stmt = $db->prepare('SELECT * FROM monitors WHERE id = ?');
        $stmt->execute([$id]);
        $monitor = $stmt->fetch();
        
        sendJSON(['success' => true, 'monitor' => $monitor], 201);
        
    } catch (PDOException $e) {
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleUpdateMonitor($id) {
    $data = getJSONInput();
    $db = getDB();
    
    // Check if exists
    $stmt = $db->prepare('SELECT id FROM monitors WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) {
        sendJSON(['error' => 'Monitor not found'], 404);
        return;
    }
    
    try {
        // Build dynamic update query
        $fields = [];
        $values = [];
        
        $allowedFields = ['name', 'type', 'target', 'port', 'keyword', 'interval', 'is_active', 'email_notification'];
        foreach ($allowedFields as $field) {
            if (isset($data[$field])) {
                $fields[] = "$field = ?";
                $values[] = $data[$field];
            }
        }
        
        if (empty($fields)) {
            sendJSON(['error' => 'No fields to update'], 400);
            return;
        }
        
        $fields[] = "updated_at = ?";
        $values[] = time();
        $values[] = $id;
        
        $sql = "UPDATE monitors SET " . implode(', ', $fields) . " WHERE id = ?";
        $stmt = $db->prepare($sql);
        $stmt->execute($values);
        
        // Fetch updated monitor
        $stmt = $db->prepare('SELECT * FROM monitors WHERE id = ?');
        $stmt->execute([$id]);
        $monitor = $stmt->fetch();
        
        sendJSON(['success' => true, 'monitor' => $monitor]);
        
    } catch (PDOException $e) {
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleDeleteMonitor($id) {
    $db = getDB();
    
    // Check if exists
    $stmt = $db->prepare('SELECT id FROM monitors WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) {
        sendJSON(['error' => 'Monitor not found'], 404);
        return;
    }
    
    try {
        $stmt = $db->prepare('DELETE FROM monitors WHERE id = ?');
        $stmt->execute([$id]);
        
        sendJSON(['success' => true]);
        
    } catch (PDOException $e) {
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleGetMonitorLogs($id) {
    $db = getDB();
    
    // Check if exists
    $stmt = $db->prepare('SELECT id FROM monitors WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) {
        sendJSON(['error' => 'Monitor not found'], 404);
        return;
    }
    
    // Clean up old logs (keep last 30 days)
    // In a real production app this should be a cron job, but we'll do it lazily here
    $thirtyDaysAgo = time() - (30 * 24 * 60 * 60);
    // Use low probability to avoid hitting DB every time
    if (rand(1, 100) <= 5) {
        $db->exec("DELETE FROM monitor_logs WHERE checked_at < $thirtyDaysAgo");
    }
    
    // Get last 50 logs
    $stmt = $db->prepare('SELECT * FROM monitor_logs WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT 50');
    $stmt->execute([$id]);
    $logs = $stmt->fetchAll();
    
    sendJSON(['logs' => $logs]);
}

function handleCheckMonitor($id) {
    $db = getDB();
    $stmt = $db->prepare('SELECT * FROM monitors WHERE id = ?');
    $stmt->execute([$id]);
    $monitor = $stmt->fetch();
    
    if (!$monitor) {
        sendJSON(['error' => 'Monitor not found'], 404);
        return;
    }
    
    // Perform check immediately
    $result = performMonitorCheck($monitor);
    
    sendJSON(['success' => true, 'result' => $result]);
}
