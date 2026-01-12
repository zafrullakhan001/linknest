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
        } elseif ($path === '/import') {
            handleImportMonitors();
        } elseif ($path === '/import-csv') {
            handleImportCSV();
        } elseif ($path === '/check-all') {
            handleCheckAllMonitors();
        } elseif (preg_match('/^\/(\d+)\/check$/', $path, $matches)) {
            handleCheckMonitor($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'PUT':
        if ($path === '/update-tab') {
            handleUpdateTabName();
        } elseif ($path === '/update-group') {
            handleUpdateGroupName();
        } elseif (preg_match('/^\/(\d+)$/', $path, $matches)) {
            handleUpdateMonitor($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'DELETE':
        if ($path === '/all') {
            handleDeleteAllMonitors();
        } elseif (preg_match('/^\/(\d+)$/', $path, $matches)) {
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
            is_active, email_notification, created_at, updated_at,
            tab_name, group_name, maintenance_start, maintenance_end
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        
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
            $now,
            $data['tab_name'] ?? null,
            $data['group_name'] ?? null,
            isset($data['maintenance_start']) ? (int)$data['maintenance_start'] : null,
            isset($data['maintenance_end']) ? (int)$data['maintenance_end'] : null
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
        
        $allowedFields = ['name', 'type', 'target', 'port', 'keyword', 'interval', 'is_active', 'email_notification', 'tab_name', 'group_name', 'maintenance_start', 'maintenance_end'];
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
    $thirtyDaysAgo = time() - (30 * 24 * 60 * 60);
    if (rand(1, 100) <= 5) {
        $db->exec("DELETE FROM monitor_logs WHERE checked_at < $thirtyDaysAgo");
    }
    
    $days = isset($_GET['days']) ? (int)$_GET['days'] : null;
    $from = isset($_GET['from']) ? (int)$_GET['from'] : null;
    $to = isset($_GET['to']) ? (int)$_GET['to'] : null;
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;

    $sql = 'SELECT * FROM monitor_logs WHERE monitor_id = ?';
    $params = [$id];

    if ($from) {
        $sql .= ' AND checked_at >= ?';
        $params[] = $from;
    }
    if ($to) {
        $sql .= ' AND checked_at <= ?';
        $params[] = $to;
    }

    if (!$from && !$to && $days) {
        $since = time() - ($days * 24 * 60 * 60);
        $sql .= ' AND checked_at >= ?';
        $params[] = $since;
    }

    $sql .= ' ORDER BY checked_at DESC';
    
    if (!$days && !$from && !$to) {
        $sql .= ' LIMIT ' . (int)$limit;
    }

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $logs = $stmt->fetchAll();
    
    sendJSON(['logs' => $logs]);
}

function handleCheckMonitor($id) {
    // Set execution time limit to prevent hanging
    set_time_limit(15); // Maximum 15 seconds for single check
    
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

function handleCheckAllMonitors() {
    // Set execution time limit to prevent hanging on multiple checks
    // Allow more time for multiple monitors, but still limit it
    set_time_limit(60); // Maximum 60 seconds for all checks
    
    $db = getDB();
    $stmt = $db->prepare('SELECT * FROM monitors WHERE is_active = 1');
    $stmt->execute();
    $monitors = $stmt->fetchAll();
    
    $results = [];
    $startTime = microtime(true);
    $maxTime = 55; // Stop before script timeout
    
    foreach ($monitors as $monitor) {
        // Check if we're running out of time
        $elapsed = microtime(true) - $startTime;
        if ($elapsed > $maxTime) {
            // Time limit approaching - stop checking and return partial results
            error_log("Monitor check stopped early due to time limit. Checked " . count($results) . " of " . count($monitors) . " monitors.");
            break;
        }
        
        $results[] = performMonitorCheck($monitor);
    }
    
    sendJSON(['success' => true, 'count' => count($results), 'results' => $results]);
}
function handleDeleteAllMonitors() {
    $db = getDB();
    try {
        $db->exec('DELETE FROM monitors');
        $db->exec('DELETE FROM monitor_logs'); // Also clear logs
        sendJSON(['success' => true]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleImportMonitors() {
    $data = getJSONInput();
    if (!isset($data['monitors']) || !is_array($data['monitors'])) {
        sendJSON(['error' => 'Invalid import data format'], 400);
        return;
    }
    
    $monitors = $data['monitors'];
    $db = getDB();
    $now = time();
    $count = 0;
    
    try {
        $db->beginTransaction();
        
        $stmt = $db->prepare('INSERT INTO monitors (
            name, type, target, port, keyword, interval, 
            is_active, email_notification, created_at, updated_at,
            tab_name, group_name, maintenance_start, maintenance_end
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        
        foreach ($monitors as $m) {
            $stmt->execute([
                $m['name'] ?? 'Imported Monitor',
                $m['type'] ?? 'url',
                $m['target'] ?? '',
                isset($m['port']) ? (int)$m['port'] : null,
                $m['keyword'] ?? null,
                isset($m['interval']) ? (int)$m['interval'] : 5,
                isset($m['is_active']) ? (int)$m['is_active'] : 1,
                isset($m['email_notification']) ? (int)$m['email_notification'] : 0,
                $now,
                $now,
                $m['tab_name'] ?? null,
                $m['group_name'] ?? null,
                isset($m['maintenance_start']) ? (int)$m['maintenance_start'] : null,
                isset($m['maintenance_end']) ? (int)$m['maintenance_end'] : null
            ]);
            $count++;
        }
        
        $db->commit();
        sendJSON(['success' => true, 'count' => $count]);
        
    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJSON(['error' => 'Import failed: ' . $e->getMessage()], 500);
    }
}

function handleImportCSV() {
    $data = getJSONInput();
    if (!isset($data['csv']) || !is_string($data['csv'])) {
        sendJSON(['error' => 'Invalid CSV data'], 400);
        return;
    }
    
    $lines = preg_split('/\r\n|\r|\n/', trim($data['csv']));
    if (empty($lines)) {
        sendJSON(['count' => 0]);
        return;
    }
    
    // Header row is optional, but if present, we skip it
    $header = str_getcsv($lines[0]);
    $startIndex = 0;
    if (strtolower($header[0] ?? '') === 'name' || strtolower($header[0] ?? '') === 'monitor name') {
        $startIndex = 1;
    }
    
    $monitors = [];
    for ($i = $startIndex; $i < count($lines); $i++) {
        $row = str_getcsv($lines[$i]);
        if (count($row) < 3) continue; // Minimal requirement: name, type, target
        
        $monitors[] = [
            'name' => $row[0] ?? 'Imported',
            'type' => strtolower($row[1] ?? 'url'),
            'target' => $row[2] ?? '',
            'port' => isset($row[3]) && is_numeric($row[3]) ? (int)$row[3] : null,
            'keyword' => $row[4] ?? null,
            'interval' => isset($row[5]) && is_numeric($row[5]) ? (int)$row[5] : 5,
            'tab_name' => $row[6] ?? 'General',
            'group_name' => $row[7] ?? 'Other'
        ];
    }
    
    $db = getDB();
    $now = time();
    $count = 0;
    
    try {
        $db->beginTransaction();
        
        $stmt = $db->prepare('INSERT INTO monitors (
            name, type, target, port, keyword, interval, 
            is_active, email_notification, created_at, updated_at,
            tab_name, group_name, maintenance_start, maintenance_end
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        
        foreach ($monitors as $m) {
            $stmt->execute([
                $m['name'],
                $m['type'],
                $m['target'],
                $m['port'],
                $m['keyword'],
                $m['interval'],
                1, // is_active
                0, // email_notification
                $now,
                $now,
                $m['tab_name'],
                $m['group_name'],
                null, // maintenance_start
                null  // maintenance_end
            ]);
            $count++;
        }
        
        $db->commit();
        sendJSON(['success' => true, 'count' => $count]);
        
    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJSON(['error' => 'Import failed: ' . $e->getMessage()], 500);
    }
}

function handleUpdateTabName() {
    $data = getJSONInput();
    if (!isset($data['old_name']) || !isset($data['new_name'])) {
        sendJSON(['error' => 'Old name and new name are required'], 400);
        return;
    }
    
    $db = getDB();
    try {
        $stmt = $db->prepare("UPDATE monitors SET tab_name = ? WHERE tab_name = ?");
        $stmt->execute([$data['new_name'], $data['old_name']]);
        sendJSON(['success' => true]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleUpdateGroupName() {
    $data = getJSONInput();
    if (!isset($data['tab_name']) || !isset($data['old_name']) || !isset($data['new_name'])) {
        sendJSON(['error' => 'Tab name, old group name and new group name are required'], 400);
        return;
    }
    
    $db = getDB();
    try {
        $stmt = $db->prepare("UPDATE monitors SET group_name = ? WHERE tab_name = ? AND group_name = ?");
        $stmt->execute([$data['new_name'], $data['tab_name'], $data['old_name']]);
        sendJSON(['success' => true]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}
