<?php
// Ensure we always return JSON - set this FIRST before any includes
if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
}

require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

// Normalize path - ensure it starts with / and remove trailing slash if present
if (empty($path) || $path === '/') {
    $path = '/';
} else {
    $path = '/' . ltrim($path, '/');
    if (substr($path, -1) === '/') {
        $path = substr($path, 0, -1);
    }
}

// Require authentication for all notification operations
try {
    requireAuth();
} catch (Exception $e) {
    sendJSON(['error' => 'Authentication failed: ' . $e->getMessage()], 401);
} catch (Error $e) {
    sendJSON(['error' => 'Authentication error: ' . $e->getMessage()], 401);
}

try {
    switch ($method) {
        case 'GET':
            // Debug endpoint to test if file is being executed
            if ($path === '/test') {
                sendJSON(['success' => true, 'message' => 'File is being executed correctly', 'path' => $path, 'method' => $method]);
                break;
            }
            if (preg_match('/^\/monitor\/(\d+)$/', $path, $matches)) {
                handleGetNotificationRules($matches[1]);
            } elseif (preg_match('/^\/rule\/(\d+)$/', $path, $matches)) {
                handleGetNotificationRule($matches[1]);
            } else {
                // Debug: Log the path to help diagnose routing issues
                error_log("monitor_notifications.php: Path did not match. Received path: '$path', Method: $method");
                sendJSON([
                    'error' => 'Invalid endpoint. Use /monitor/{id} or /rule/{id}',
                    'received_path' => $path,
                    'method' => $method,
                    'path_info' => $_SERVER['PATH_INFO'] ?? 'not set',
                    'redirect_path_info' => $_SERVER['REDIRECT_PATH_INFO'] ?? 'not set'
                ], 404);
            }
            break;
            
        case 'POST':
            if ($path === '/' || $path === '') {
                handleCreateNotificationRule();
            } else {
                sendJSON(['error' => 'Invalid endpoint'], 404);
            }
            break;
            
        case 'PUT':
            if (preg_match('/^\/(\d+)$/', $path, $matches)) {
                handleUpdateNotificationRule($matches[1]);
            } else {
                sendJSON(['error' => 'Invalid endpoint. Use /{id}'], 404);
            }
            break;
            
        case 'DELETE':
            if (preg_match('/^\/(\d+)$/', $path, $matches)) {
                handleDeleteNotificationRule($matches[1]);
            } else {
                sendJSON(['error' => 'Invalid endpoint. Use /{id}'], 404);
            }
            break;
            
        default:
            sendJSON(['error' => 'Method not allowed'], 405);
    }
} catch (Exception $e) {
    error_log("monitor_notifications.php error: " . $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine());
    sendJSON(['error' => 'An error occurred: ' . $e->getMessage()], 500);
} catch (Error $e) {
    error_log("monitor_notifications.php fatal error: " . $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine());
    sendJSON(['error' => 'A fatal error occurred'], 500);
}

function handleGetNotificationRules($monitorId) {
    $db = getDB();
    
    // Verify monitor exists
    $stmt = $db->prepare('SELECT id FROM monitors WHERE id = ?');
    $stmt->execute([$monitorId]);
    if (!$stmt->fetch()) {
        sendJSON(['error' => 'Monitor not found'], 404);
        return;
    }
    
    // Get all rules for this monitor
    $stmt = $db->prepare('SELECT * FROM monitor_notification_rules WHERE monitor_id = ? ORDER BY created_at DESC');
    $stmt->execute([$monitorId]);
    $rules = $stmt->fetchAll();
    
    // Get recipients for each rule
    foreach ($rules as &$rule) {
        $stmt = $db->prepare('SELECT email FROM monitor_notification_recipients WHERE rule_id = ?');
        $stmt->execute([$rule['id']]);
        $recipients = $stmt->fetchAll(PDO::FETCH_COLUMN);
        $rule['recipients'] = $recipients;
    }
    
    sendJSON(['rules' => $rules]);
}

function handleGetNotificationRule($ruleId) {
    $db = getDB();
    
    $stmt = $db->prepare('SELECT * FROM monitor_notification_rules WHERE id = ?');
    $stmt->execute([$ruleId]);
    $rule = $stmt->fetch();
    
    if (!$rule) {
        sendJSON(['error' => 'Notification rule not found'], 404);
        return;
    }
    
    // Get recipients
    $stmt = $db->prepare('SELECT email FROM monitor_notification_recipients WHERE rule_id = ?');
    $stmt->execute([$ruleId]);
    $recipients = $stmt->fetchAll(PDO::FETCH_COLUMN);
    $rule['recipients'] = $recipients;
    
    sendJSON(['rule' => $rule]);
}

function handleCreateNotificationRule() {
    $data = getJSONInput();
    
    // Validation
    if (empty($data['monitor_id']) || empty($data['name']) || empty($data['status_trigger']) || empty($data['recipients']) || !is_array($data['recipients'])) {
        sendJSON(['error' => 'Monitor ID, rule name, status trigger, and recipients are required'], 400);
        return;
    }

    $ruleName = trim((string)$data['name']);
    if ($ruleName === '') {
        sendJSON(['error' => 'Rule name cannot be empty'], 400);
        return;
    }
    
    if (!in_array($data['status_trigger'], ['up', 'down', 'both'])) {
        sendJSON(['error' => 'Status trigger must be up, down, or both'], 400);
        return;
    }
    
    // Validate email addresses
    foreach ($data['recipients'] as $email) {
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            sendJSON(['error' => "Invalid email address: $email"], 400);
            return;
        }
    }
    
    // Validate time window if provided
    if (!empty($data['time_window_start']) && !preg_match('/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/', $data['time_window_start'])) {
        sendJSON(['error' => 'Invalid time window start format. Use HH:MM (24-hour format)'], 400);
        return;
    }
    
    if (!empty($data['time_window_end']) && !preg_match('/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/', $data['time_window_end'])) {
        sendJSON(['error' => 'Invalid time window end format. Use HH:MM (24-hour format)'], 400);
        return;
    }
    
    // Validate days of week if provided
    if (!empty($data['days_of_week'])) {
        $days = is_array($data['days_of_week']) ? $data['days_of_week'] : explode(',', $data['days_of_week']);
        foreach ($days as $day) {
            $day = trim($day);
            if (!is_numeric($day) || $day < 0 || $day > 6) {
                sendJSON(['error' => 'Invalid day of week. Must be 0-6 (0=Sunday, 6=Saturday)'], 400);
                return;
            }
        }
    }
    
    $db = getDB();
    
    // Verify monitor exists
    $stmt = $db->prepare('SELECT id FROM monitors WHERE id = ?');
    $stmt->execute([$data['monitor_id']]);
    if (!$stmt->fetch()) {
        sendJSON(['error' => 'Monitor not found'], 404);
        return;
    }
    
    try {
        $db->beginTransaction();
        
        $now = time();
        $stmt = $db->prepare('INSERT INTO monitor_notification_rules (
            monitor_id, name, status_trigger, time_window_start, time_window_end, days_of_week,
            subject_template, body_template, from_name, from_email, is_enabled,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        
        $daysOfWeek = !empty($data['days_of_week']) 
            ? (is_array($data['days_of_week']) ? implode(',', $data['days_of_week']) : $data['days_of_week'])
            : null;
        
        $stmt->execute([
            $data['monitor_id'],
            $ruleName,
            $data['status_trigger'],
            $data['time_window_start'] ?? null,
            $data['time_window_end'] ?? null,
            $daysOfWeek,
            $data['subject_template'] ?? '[LinkNest Monitor] {monitor_name} Status: {status}',
            $data['body_template'] ?? "Monitor: {monitor_name}\nStatus: {status}\nTime: {time}\nDetails: {details}",
            $data['from_name'] ?? null,
            $data['from_email'] ?? null,
            isset($data['is_enabled']) ? (int)$data['is_enabled'] : 1,
            $now,
            $now
        ]);
        
        $ruleId = $db->lastInsertId();
        
        // Insert recipients
        $stmt = $db->prepare('INSERT INTO monitor_notification_recipients (rule_id, email, created_at) VALUES (?, ?, ?)');
        foreach ($data['recipients'] as $email) {
            $stmt->execute([$ruleId, trim($email), $now]);
        }
        
        $db->commit();
        
        // Fetch created rule with recipients
        $stmt = $db->prepare('SELECT * FROM monitor_notification_rules WHERE id = ?');
        $stmt->execute([$ruleId]);
        $rule = $stmt->fetch();
        
        $stmt = $db->prepare('SELECT email FROM monitor_notification_recipients WHERE rule_id = ?');
        $stmt->execute([$ruleId]);
        $recipients = $stmt->fetchAll(PDO::FETCH_COLUMN);
        $rule['recipients'] = $recipients;
        
        sendJSON(['success' => true, 'rule' => $rule], 201);
        
    } catch (PDOException $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleUpdateNotificationRule($ruleId) {
    $data = getJSONInput();
    $db = getDB();
    if (isset($data['name'])) {
        $ruleName = trim((string)$data['name']);
        if ($ruleName === '') {
            sendJSON(['error' => 'Rule name cannot be empty'], 400);
            return;
        }
    }
    
    // Check if rule exists
    $stmt = $db->prepare('SELECT id FROM monitor_notification_rules WHERE id = ?');
    $stmt->execute([$ruleId]);
    if (!$stmt->fetch()) {
        sendJSON(['error' => 'Notification rule not found'], 404);
        return;
    }
    
    // Validate if provided
    if (isset($data['status_trigger']) && !in_array($data['status_trigger'], ['up', 'down', 'both'])) {
        sendJSON(['error' => 'Status trigger must be up, down, or both'], 400);
        return;
    }
    
    // Validate recipients if provided
    if (isset($data['recipients']) && is_array($data['recipients'])) {
        foreach ($data['recipients'] as $email) {
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                sendJSON(['error' => "Invalid email address: $email"], 400);
                return;
            }
        }
    }
    
    // Validate time window if provided
    if (isset($data['time_window_start']) && !empty($data['time_window_start']) && !preg_match('/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/', $data['time_window_start'])) {
        sendJSON(['error' => 'Invalid time window start format. Use HH:MM (24-hour format)'], 400);
        return;
    }
    
    if (isset($data['time_window_end']) && !empty($data['time_window_end']) && !preg_match('/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/', $data['time_window_end'])) {
        sendJSON(['error' => 'Invalid time window end format. Use HH:MM (24-hour format)'], 400);
        return;
    }
    
    try {
        $db->beginTransaction();
        
        // Build dynamic update query
        $fields = [];
        $values = [];
        
        $allowedFields = ['status_trigger', 'time_window_start', 'time_window_end', 'days_of_week', 
                         'subject_template', 'body_template', 'from_name', 'from_email', 'is_enabled', 'name'];
        foreach ($allowedFields as $field) {
            if (isset($data[$field])) {
                if ($field === 'days_of_week' && is_array($data[$field])) {
                    $fields[] = "$field = ?";
                    $values[] = implode(',', $data[$field]);
                } else {
                    $fields[] = "$field = ?";
                    $values[] = $data[$field];
                }
            }
        }
        
        if (!empty($fields)) {
            $fields[] = "updated_at = ?";
            $values[] = time();
            $values[] = $ruleId;
            
            $sql = "UPDATE monitor_notification_rules SET " . implode(', ', $fields) . " WHERE id = ?";
            $stmt = $db->prepare($sql);
            $stmt->execute($values);
        }
        
        // Update recipients if provided
        if (isset($data['recipients']) && is_array($data['recipients'])) {
            // Delete existing recipients
            $stmt = $db->prepare('DELETE FROM monitor_notification_recipients WHERE rule_id = ?');
            $stmt->execute([$ruleId]);
            
            // Insert new recipients
            $stmt = $db->prepare('INSERT INTO monitor_notification_recipients (rule_id, email, created_at) VALUES (?, ?, ?)');
            $now = time();
            foreach ($data['recipients'] as $email) {
                $stmt->execute([$ruleId, trim($email), $now]);
            }
        }
        
        $db->commit();
        
        // Fetch updated rule with recipients
        $stmt = $db->prepare('SELECT * FROM monitor_notification_rules WHERE id = ?');
        $stmt->execute([$ruleId]);
        $rule = $stmt->fetch();
        
        $stmt = $db->prepare('SELECT email FROM monitor_notification_recipients WHERE rule_id = ?');
        $stmt->execute([$ruleId]);
        $recipients = $stmt->fetchAll(PDO::FETCH_COLUMN);
        $rule['recipients'] = $recipients;
        
        sendJSON(['success' => true, 'rule' => $rule]);
        
    } catch (PDOException $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleDeleteNotificationRule($ruleId) {
    $db = getDB();
    
    // Check if exists
    $stmt = $db->prepare('SELECT id FROM monitor_notification_rules WHERE id = ?');
    $stmt->execute([$ruleId]);
    if (!$stmt->fetch()) {
        sendJSON(['error' => 'Notification rule not found'], 404);
        return;
    }
    
    try {
        $db->beginTransaction();
        
        // Delete recipients (cascade)
        $stmt = $db->prepare('DELETE FROM monitor_notification_recipients WHERE rule_id = ?');
        $stmt->execute([$ruleId]);
        
        // Delete rule
        $stmt = $db->prepare('DELETE FROM monitor_notification_rules WHERE id = ?');
        $stmt->execute([$ruleId]);
        
        $db->commit();
        
        sendJSON(['success' => true]);
        
    } catch (PDOException $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}
