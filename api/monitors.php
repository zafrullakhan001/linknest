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
    $stmt = $db->prepare('
        SELECT 
            m.*,
            COALESCE((
                SELECT COUNT(*) 
                FROM monitor_notification_rules r 
                WHERE r.monitor_id = m.id AND r.is_enabled = 1
            ), 0) AS email_rules_count
        FROM monitors m
        ORDER BY m.created_at DESC
    ');
    $stmt->execute();
    $monitors = $stmt->fetchAll();
    
    sendJSON(['monitors' => $monitors]);
}

function handleGetMonitor($id) {
    $db = getDB();
    $stmt = $db->prepare('
        SELECT 
            m.*,
            COALESCE((
                SELECT COUNT(*) 
                FROM monitor_notification_rules r 
                WHERE r.monitor_id = m.id AND r.is_enabled = 1
            ), 0) AS email_rules_count
        FROM monitors m
        WHERE m.id = ?
    ');
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
        $stmt = $db->prepare('
            SELECT 
                m.*,
                COALESCE((
                    SELECT COUNT(*) 
                    FROM monitor_notification_rules r 
                    WHERE r.monitor_id = m.id AND r.is_enabled = 1
                ), 0) AS email_rules_count
            FROM monitors m
            WHERE m.id = ?
        ');
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
        $stmt = $db->prepare('
            SELECT 
                m.*,
                COALESCE((
                    SELECT COUNT(*) 
                    FROM monitor_notification_rules r 
                    WHERE r.monitor_id = m.id AND r.is_enabled = 1
                ), 0) AS email_rules_count
            FROM monitors m
            WHERE m.id = ?
        ');
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
    error_log("[MONITOR] handleCheckAllMonitors called");
    try {
        // Set execution time limit to prevent hanging on multiple checks
        // Allow more time for multiple monitors - calculate based on number of monitors
        $db = getDB();
        if (!$db) {
            throw new Exception("Failed to get database connection");
        }
        
        error_log("[MONITOR] Getting active monitor count");
        $stmt = $db->prepare('SELECT COUNT(*) FROM monitors WHERE is_active = 1');
        $stmt->execute();
        $monitorCount = (int)$stmt->fetchColumn();
        error_log("[MONITOR] Found $monitorCount active monitors");
        
        // Calculate time limit: 10 seconds per monitor, minimum 60 seconds, maximum 300 seconds (5 minutes)
        $timeLimit = max(60, min(300, $monitorCount * 10));
        set_time_limit($timeLimit);
        error_log("[MONITOR] Set time limit to $timeLimit seconds");
        
        $stmt = $db->prepare('SELECT * FROM monitors WHERE is_active = 1');
        $stmt->execute();
        $monitors = $stmt->fetchAll();
        error_log("[MONITOR] Retrieved " . count($monitors) . " monitors to check");
        
        $results = [];
        $checkedCount = 0;
        $totalCount = count($monitors);
        $upCount = 0;      // Monitors that are UP (healthy)
        $downCount = 0;    // Monitors that are DOWN (unhealthy)
        $errorCount = 0;   // Monitors where the check itself failed (exceptions, unknown status)
        
        // Check if performMonitorCheck function exists
        if (!function_exists('performMonitorCheck')) {
            throw new Exception("performMonitorCheck function not found. monitor_check.php may not be loaded properly.");
        }
        
        foreach ($monitors as $monitor) {
            error_log("[MONITOR] Checking monitor ID: {$monitor['id']}, name: {$monitor['name']}");
            try {
                $result = performMonitorCheck($monitor);
                $results[] = $result;
                $checkedCount++;
                
                // Count monitor status
                if (isset($result['status'])) {
                    if ($result['status'] === 'up') {
                        $upCount++;
                    } elseif ($result['status'] === 'down') {
                        $downCount++;
                    } else {
                        // Unknown status means check failed
                        $errorCount++;
                    }
                } else {
                    $errorCount++;
                }
            } catch (Exception $e) {
                // Log error but continue checking other monitors
                error_log("Error checking monitor {$monitor['id']}: " . $e->getMessage());
                $results[] = [
                    'id' => $monitor['id'],
                    'status' => 'unknown',
                    'response_time' => 0,
                    'details' => 'Check failed: ' . $e->getMessage()
                ];
                $checkedCount++;
                $errorCount++;
            } catch (Error $e) {
                // Log fatal error but continue checking other monitors
                error_log("Fatal error checking monitor {$monitor['id']}: " . $e->getMessage());
                $results[] = [
                    'id' => $monitor['id'],
                    'status' => 'unknown',
                    'response_time' => 0,
                    'details' => 'Check failed: ' . $e->getMessage()
                ];
                $checkedCount++;
                $errorCount++;
            }
        }
    
        // Log if not all monitors were checked (shouldn't happen now, but good for debugging)
        if ($checkedCount < $totalCount) {
            error_log("Warning: Only checked $checkedCount of $totalCount monitors");
        }
        
        error_log("[MONITOR] Check complete - Total: $totalCount, Checked: $checkedCount, UP: $upCount, DOWN: $downCount, Errors: $errorCount");
        
        sendJSON([
            'success' => true, 
            'count' => $checkedCount, 
            'total' => $totalCount, 
            'up_count' => $upCount,
            'down_count' => $downCount,
            'error_count' => $errorCount,
            'results' => $results
        ]);
    } catch (Exception $e) {
        $errorMsg = "Error in handleCheckAllMonitors: " . $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine();
        error_log($errorMsg);
        error_log("Stack trace: " . $e->getTraceAsString());
        
        // Clean any output before sending JSON
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        
        sendJSON([
            'success' => false,
            'error' => 'Failed to check all monitors: ' . $e->getMessage()
        ], 500);
    } catch (Error $e) {
        $errorMsg = "Fatal error in handleCheckAllMonitors: " . $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine();
        error_log($errorMsg);
        error_log("Stack trace: " . $e->getTraceAsString());
        
        // Clean any output before sending JSON
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        
        sendJSON([
            'success' => false,
            'error' => 'Fatal error checking monitors: ' . $e->getMessage()
        ], 500);
    } catch (Throwable $e) {
        $errorMsg = "Throwable in handleCheckAllMonitors: " . $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine();
        error_log($errorMsg);
        error_log("Stack trace: " . $e->getTraceAsString());
        
        // Clean any output before sending JSON
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        
        sendJSON([
            'success' => false,
            'error' => 'Error checking monitors: ' . $e->getMessage()
        ], 500);
    }
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
