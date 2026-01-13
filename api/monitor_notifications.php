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
    $AUTH_USER = requireAuth();
    $GLOBALS['AUTH_USER'] = $AUTH_USER;
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
            if (preg_match('/^\/monitor\/(\d+)\/logs$/', $path, $matches)) {
                handleGetEmailLogs($matches[1]);
            } elseif (preg_match('/^\/monitor\/(\d+)$/', $path, $matches)) {
                handleGetNotificationRules($matches[1]);
            } elseif (preg_match('/^\/rule\/(\d+)$/', $path, $matches)) {
                handleGetNotificationRule($matches[1]);
            } else {
                // Debug: Log the path to help diagnose routing issues
                error_log("monitor_notifications.php: Path did not match. Received path: '$path', Method: $method");
                sendJSON([
                    'error' => 'Invalid endpoint. Use /monitor/{id}, /monitor/{id}/logs, or /rule/{id}',
                    'received_path' => $path,
                    'method' => $method,
                    'path_info' => $_SERVER['PATH_INFO'] ?? 'not set',
                    'redirect_path_info' => $_SERVER['REDIRECT_PATH_INFO'] ?? 'not set'
                ], 404);
            }
            break;
            
        case 'POST':
            if (preg_match('/^\/monitor\/(\d+)\/import$/', $path, $matches)) {
                handleImportNotificationRules($matches[1]);
            } elseif (preg_match('/^\/rule\/(\d+)\/move$/', $path, $matches)) {
                handleMoveNotificationRule($matches[1]);
            } elseif ($path === '/' || $path === '') {
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
            if (preg_match('/^\/monitor\/(\d+)\/logs$/', $path, $matches)) {
                handleClearEmailLogs($matches[1]);
            } elseif (preg_match('/^\/(\d+)$/', $path, $matches)) {
                handleDeleteNotificationRule($matches[1]);
            } else {
                sendJSON(['error' => 'Invalid endpoint. Use /{id} or /monitor/{id}/logs'], 404);
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

function getAuthUserFromGlobals() {
    return $GLOBALS['AUTH_USER'] ?? getAuthenticatedUser();
}

function ensureCanViewMonitor($monitorId, $db): void {
    $user = getAuthUserFromGlobals();
    if (!$user) {
        sendJSON(['error' => 'Authentication required'], 401);
        exit;
    }
    if (!empty($user['is_admin'])) {
        return;
    }
    $stmt = $db->prepare('SELECT can_view FROM user_monitor_permissions WHERE user_id = ? AND monitor_id = ?');
    $stmt->execute([(int)$user['id'], (int)$monitorId]);
    $can = (int)$stmt->fetchColumn();
    if ($can !== 1) {
        sendJSON(['error' => 'Monitor not found'], 404);
        exit;
    }
}

function handleGetNotificationRules($monitorId) {
    $db = getDB();
    ensureCanViewMonitor($monitorId, $db);
    
    // Verify monitor exists
    $stmt = $db->prepare('SELECT id FROM monitors WHERE id = ?');
    $stmt->execute([$monitorId]);
    if (!$stmt->fetch()) {
        sendJSON(['error' => 'Monitor not found'], 404);
        return;
    }
    
    // Get all rules for this monitor
    $stmt = $db->prepare('SELECT * FROM monitor_notification_rules WHERE monitor_id = ? ORDER BY COALESCE(sort_order, 0) ASC, created_at DESC, id DESC');
    $stmt->execute([$monitorId]);
    $rules = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Get recipients for each rule and ensure sort_order is an integer
    foreach ($rules as &$rule) {
        // Ensure sort_order is an integer
        $rule['sort_order'] = isset($rule['sort_order']) ? (int)$rule['sort_order'] : 0;
        
        $stmt = $db->prepare('SELECT email FROM monitor_notification_recipients WHERE rule_id = ?');
        $stmt->execute([$rule['id']]);
        $recipients = $stmt->fetchAll(PDO::FETCH_COLUMN);
        $rule['recipients'] = $recipients;

        // Parse CC emails (comma-separated) into array
        $ccRaw = $rule['cc_emails'] ?? null;
        $rule['cc'] = (!empty($ccRaw)) ? array_values(array_filter(array_map('trim', explode(',', $ccRaw)))) : [];
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

    // Parse CC emails into array
    $ccRaw = $rule['cc_emails'] ?? null;
    $rule['cc'] = (!empty($ccRaw)) ? array_values(array_filter(array_map('trim', explode(',', $ccRaw)))) : [];
    
    sendJSON(['rule' => $rule]);
}

function handleGetEmailLogs($monitorId) {
    $db = getDB();
    ensureCanViewMonitor($monitorId, $db);
    
    // Verify monitor exists
    $stmt = $db->prepare('SELECT id FROM monitors WHERE id = ?');
    $stmt->execute([$monitorId]);
    if (!$stmt->fetch()) {
        sendJSON(['error' => 'Monitor not found'], 404);
        return;
    }
    
    // Get days filter from query parameter (default 7 days)
    $days = isset($_GET['days']) ? (int)$_GET['days'] : 7;
    $since = time() - ($days * 24 * 60 * 60);
    
    // Clean up old logs (keep last 90 days) - do this occasionally
    if (rand(1, 100) <= 5) {
        $ninetyDaysAgo = time() - (90 * 24 * 60 * 60);
        $db->exec("DELETE FROM monitor_notification_logs WHERE sent_at < $ninetyDaysAgo");
    }
    
    // Get logs for this monitor
    $stmt = $db->prepare('
        SELECT * FROM monitor_notification_logs 
        WHERE monitor_id = ? AND sent_at >= ?
        ORDER BY sent_at DESC
        LIMIT 500
    ');
    $stmt->execute([$monitorId, $since]);
    $logs = $stmt->fetchAll();
    
    sendJSON(['logs' => $logs]);
}

function handleClearEmailLogs($monitorId) {
    $db = getDB();

    // Verify monitor exists
    $stmt = $db->prepare('SELECT id FROM monitors WHERE id = ?');
    $stmt->execute([$monitorId]);
    if (!$stmt->fetch()) {
        sendJSON(['error' => 'Monitor not found'], 404);
        return;
    }

    try {
        $stmt = $db->prepare('DELETE FROM monitor_notification_logs WHERE monitor_id = ?');
        $stmt->execute([$monitorId]);
        sendJSON(['success' => true, 'deleted' => $stmt->rowCount()]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
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
    
    // Validate email addresses (allow localhost for local testing)
    foreach ($data['recipients'] as $email) {
        if (!isValidEmail($email)) {
            sendJSON(['error' => "Invalid email address: $email"], 400);
            return;
        }
    }

    // Validate CC emails if provided
    $ccEmails = [];
    if (isset($data['cc']) && is_array($data['cc'])) {
        foreach ($data['cc'] as $email) {
            $email = trim((string)$email);
            if ($email === '') continue;
            if (!isValidEmail($email)) {
                sendJSON(['error' => "Invalid CC email address: $email"], 400);
                return;
            }
            $ccEmails[] = $email;
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
        // Append to end of list for this monitor
        $maxStmt = $db->prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM monitor_notification_rules WHERE monitor_id = ?');
        $maxStmt->execute([$data['monitor_id']]);
        $maxRow = $maxStmt->fetch(PDO::FETCH_ASSOC);
        $nextSort = (int)($maxRow['m'] ?? 0) + 1;

        $stmt = $db->prepare('INSERT INTO monitor_notification_rules (
            monitor_id, name, sort_order, status_trigger, time_window_start, time_window_end, days_of_week,
            subject_template, body_template, from_name, from_email, cc_emails, is_enabled,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        
        $daysOfWeek = !empty($data['days_of_week']) 
            ? (is_array($data['days_of_week']) ? implode(',', $data['days_of_week']) : $data['days_of_week'])
            : null;
        
        $stmt->execute([
            $data['monitor_id'],
            $ruleName,
            $nextSort,
            $data['status_trigger'],
            $data['time_window_start'] ?? null,
            $data['time_window_end'] ?? null,
            $daysOfWeek,
            $data['subject_template'] ?? '[LinkNest Monitor] {monitor_name} Status: {status}',
            $data['body_template'] ?? "Monitor: {monitor_name}\nStatus: {status}\nTime: {time}\nDetails: {details}",
            $data['from_name'] ?? null,
            $data['from_email'] ?? null,
            !empty($ccEmails) ? implode(',', $ccEmails) : null,
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
        $rule['cc'] = $ccEmails;
        
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
    
    // Validate recipients if provided (allow localhost for local testing)
    if (isset($data['recipients']) && is_array($data['recipients'])) {
        foreach ($data['recipients'] as $email) {
            if (!isValidEmail($email)) {
                sendJSON(['error' => "Invalid email address: $email"], 400);
                return;
            }
        }
    }

    // Validate CC if provided
    if (isset($data['cc']) && is_array($data['cc'])) {
        foreach ($data['cc'] as $email) {
            $email = trim((string)$email);
            if ($email === '') continue;
            if (!isValidEmail($email)) {
                sendJSON(['error' => "Invalid CC email address: $email"], 400);
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

        // Update CC emails if provided (array)
        if (isset($data['cc']) && is_array($data['cc'])) {
            $cc = array_values(array_filter(array_map('trim', $data['cc']), function($v) { return $v !== ''; }));
            $fields[] = "cc_emails = ?";
            $values[] = !empty($cc) ? implode(',', $cc) : null;
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
        $ccRaw = $rule['cc_emails'] ?? null;
        $rule['cc'] = (!empty($ccRaw)) ? array_values(array_filter(array_map('trim', explode(',', $ccRaw)))) : [];
        
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

function handleImportNotificationRules($monitorId) {
    $data = getJSONInput();
    $db = getDB();

    // Verify monitor exists
    $stmt = $db->prepare('SELECT id FROM monitors WHERE id = ?');
    $stmt->execute([$monitorId]);
    if (!$stmt->fetch()) {
        sendJSON(['error' => 'Monitor not found'], 404);
        return;
    }

    $replace = !empty($data['replace']) ? true : false;
    $rules = $data['rules'] ?? null;
    if (!is_array($rules)) {
        sendJSON(['error' => 'Invalid payload: rules must be an array'], 400);
        return;
    }

    // Reasonable safety limits
    if (count($rules) > 200) {
        sendJSON(['error' => 'Too many rules in import (max 200)'], 400);
        return;
    }

    $now = time();
    $imported = 0;

    try {
        $db->beginTransaction();

        if ($replace) {
            // Delete existing recipients and rules for this monitor
            $stmt = $db->prepare('SELECT id FROM monitor_notification_rules WHERE monitor_id = ?');
            $stmt->execute([$monitorId]);
            $existingRuleIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
            if (!empty($existingRuleIds)) {
                $delRec = $db->prepare('DELETE FROM monitor_notification_recipients WHERE rule_id = ?');
                foreach ($existingRuleIds as $rid) {
                    $delRec->execute([(int)$rid]);
                }
            }
            $delRules = $db->prepare('DELETE FROM monitor_notification_rules WHERE monitor_id = ?');
            $delRules->execute([$monitorId]);
        }

        $insertRule = $db->prepare('INSERT INTO monitor_notification_rules (
            monitor_id, name, sort_order, status_trigger, time_window_start, time_window_end, days_of_week,
            subject_template, body_template, from_name, from_email, cc_emails, is_enabled,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

        $insertRecipient = $db->prepare('INSERT INTO monitor_notification_recipients (rule_id, email, created_at) VALUES (?, ?, ?)');

        $sort = 0;
        foreach ($rules as $idx => $r) {
            if (!is_array($r)) {
                continue;
            }
            $sort++;

            $ruleName = trim((string)($r['name'] ?? ''));
            if ($ruleName === '') {
                // allow empty? keep strict to avoid broken rules
                throw new Exception('Rule name cannot be empty (item #' . ($idx + 1) . ')');
            }

            $statusTrigger = $r['status_trigger'] ?? null;
            if (!in_array($statusTrigger, ['up', 'down', 'both'], true)) {
                throw new Exception('Invalid status_trigger (item #' . ($idx + 1) . ')');
            }

            // Recipients
            $recipients = $r['recipients'] ?? [];
            if (!is_array($recipients) || count($recipients) === 0) {
                throw new Exception('At least one recipient is required (item #' . ($idx + 1) . ')');
            }
            if (count($recipients) > 100) {
                throw new Exception('Too many recipients (max 100) (item #' . ($idx + 1) . ')');
            }
            $recipientsClean = [];
            foreach ($recipients as $email) {
                $email = trim((string)$email);
                if ($email === '') continue;
                if (!isValidEmail($email)) {
                    throw new Exception('Invalid recipient email: ' . $email . ' (item #' . ($idx + 1) . ')');
                }
                $recipientsClean[] = $email;
            }
            if (empty($recipientsClean)) {
                throw new Exception('At least one valid recipient is required (item #' . ($idx + 1) . ')');
            }

            // CC
            $ccEmails = [];
            $cc = $r['cc'] ?? [];
            if (is_array($cc)) {
                foreach ($cc as $email) {
                    $email = trim((string)$email);
                    if ($email === '') continue;
                    if (!isValidEmail($email)) {
                        throw new Exception('Invalid CC email: ' . $email . ' (item #' . ($idx + 1) . ')');
                    }
                    $ccEmails[] = $email;
                }
            }

            // Time window (optional)
            $twStart = $r['time_window_start'] ?? null;
            $twEnd = $r['time_window_end'] ?? null;
            if ($twStart !== null && $twStart !== '' && !preg_match('/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/', (string)$twStart)) {
                throw new Exception('Invalid time_window_start (item #' . ($idx + 1) . ')');
            }
            if ($twEnd !== null && $twEnd !== '' && !preg_match('/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/', (string)$twEnd)) {
                throw new Exception('Invalid time_window_end (item #' . ($idx + 1) . ')');
            }
            $twStart = ($twStart === '' ? null : $twStart);
            $twEnd = ($twEnd === '' ? null : $twEnd);

            // Days of week (optional, allow csv or array)
            $daysOfWeek = null;
            if (isset($r['days_of_week']) && $r['days_of_week'] !== null && $r['days_of_week'] !== '') {
                $days = is_array($r['days_of_week']) ? $r['days_of_week'] : explode(',', (string)$r['days_of_week']);
                $cleanDays = [];
                foreach ($days as $day) {
                    $day = trim((string)$day);
                    if ($day === '') continue;
                    if (!is_numeric($day) || (int)$day < 0 || (int)$day > 6) {
                        throw new Exception('Invalid day_of_week (item #' . ($idx + 1) . ')');
                    }
                    $cleanDays[] = (string)((int)$day);
                }
                $daysOfWeek = !empty($cleanDays) ? implode(',', $cleanDays) : null;
            }

            $subjectTpl = (string)($r['subject_template'] ?? '[LinkNest Monitor] {monitor_name} Status: {status}');
            $bodyTpl = (string)($r['body_template'] ?? "Monitor: {monitor_name}\nStatus: {status}\nTime: {time}\nDetails: {details}");
            if (trim($subjectTpl) === '' || trim($bodyTpl) === '') {
                throw new Exception('Subject/body template cannot be empty (item #' . ($idx + 1) . ')');
            }

            $fromName = isset($r['from_name']) ? (string)$r['from_name'] : null;
            $fromEmail = isset($r['from_email']) ? (string)$r['from_email'] : null;
            $fromName = ($fromName !== null && trim($fromName) === '') ? null : $fromName;
            $fromEmail = ($fromEmail !== null && trim($fromEmail) === '') ? null : $fromEmail;
            if ($fromEmail !== null && $fromEmail !== '' && !isValidEmail($fromEmail)) {
                throw new Exception('Invalid from_email (item #' . ($idx + 1) . ')');
            }

            $isEnabled = isset($r['is_enabled']) ? (int)$r['is_enabled'] : 1;
            $isEnabled = ($isEnabled === 0) ? 0 : 1;

            $insertRule->execute([
                (int)$monitorId,
                $ruleName,
                $sort,
                $statusTrigger,
                $twStart,
                $twEnd,
                $daysOfWeek,
                $subjectTpl,
                $bodyTpl,
                $fromName,
                $fromEmail,
                !empty($ccEmails) ? implode(',', $ccEmails) : null,
                $isEnabled,
                $now,
                $now
            ]);

            $ruleId = (int)$db->lastInsertId();
            foreach ($recipientsClean as $email) {
                $insertRecipient->execute([$ruleId, $email, $now]);
            }

            $imported++;
        }

        $db->commit();
        sendJSON(['success' => true, 'imported' => $imported, 'replaced' => $replace]);
    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJSON(['error' => 'Import failed: ' . $e->getMessage()], 400);
    } catch (PDOException $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleMoveNotificationRule($ruleId) {
    $data = getJSONInput();
    $direction = strtolower(trim((string)($data['direction'] ?? '')));
    if (!in_array($direction, ['up', 'down'], true)) {
        sendJSON(['error' => "Invalid direction. Use 'up' or 'down'."], 400);
        return;
    }

    $db = getDB();
    try {
        $db->beginTransaction();

        $stmt = $db->prepare('SELECT id, monitor_id, COALESCE(sort_order, 0) AS sort_order FROM monitor_notification_rules WHERE id = ?');
        $stmt->execute([(int)$ruleId]);
        $rule = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$rule) {
            $db->rollBack();
            sendJSON(['error' => 'Notification rule not found'], 404);
            return;
        }

        $monitorId = (int)$rule['monitor_id'];

        // If sort_order wasn't initialized (0), backfill this monitor in legacy order.
        if ((int)$rule['sort_order'] <= 0) {
            $q = $db->prepare('SELECT id FROM monitor_notification_rules WHERE monitor_id = ? ORDER BY created_at DESC, id DESC');
            $q->execute([$monitorId]);
            $ids = $q->fetchAll(PDO::FETCH_COLUMN);
            $pos = 0;
            $upd = $db->prepare('UPDATE monitor_notification_rules SET sort_order = ? WHERE id = ?');
            foreach ($ids as $rid) {
                $pos++;
                $upd->execute([$pos, (int)$rid]);
            }
            // Re-fetch
            $stmt->execute([(int)$ruleId]);
            $rule = $stmt->fetch(PDO::FETCH_ASSOC);
        }

        // Get all rules in display order to find adjacent rule
        $allStmt = $db->prepare('SELECT id, COALESCE(sort_order, 0) AS sort_order FROM monitor_notification_rules WHERE monitor_id = ? ORDER BY COALESCE(sort_order, 0) ASC, created_at DESC, id DESC');
        $allStmt->execute([$monitorId]);
        $allRules = $allStmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Debug: log the current order
        $debugOrder = array_map(function($r) { return ['id' => (int)$r['id'], 'sort_order' => (int)$r['sort_order']]; }, $allRules);
        error_log('Current rules order: ' . json_encode($debugOrder));
        
        // Find current rule index
        $currentIndex = -1;
        for ($i = 0; $i < count($allRules); $i++) {
            if ((int)$allRules[$i]['id'] === (int)$ruleId) {
                $currentIndex = $i;
                break;
            }
        }
        
        if ($currentIndex === -1) {
            $db->rollBack();
            sendJSON(['error' => 'Rule not found in list'], 500);
            return;
        }
        
        // Determine target index
        $targetIndex = $direction === 'up' ? $currentIndex - 1 : $currentIndex + 1;
        
        if ($targetIndex < 0 || $targetIndex >= count($allRules)) {
            // Already at boundary
            $db->commit();
            sendJSON(['success' => true, 'moved' => false]);
            return;
        }
        
        $currentId = (int)$allRules[$currentIndex]['id'];
        $currentSort = (int)$allRules[$currentIndex]['sort_order'];
        $targetId = (int)$allRules[$targetIndex]['id'];
        $targetSort = (int)$allRules[$targetIndex]['sort_order'];
        
        // Calculate new sort_order values for the swap
        // When moving down: current goes to target's position (higher sort_order)
        // When moving up: current goes to target's position (lower sort_order)
        // We always swap: current gets target's position value, target gets current's position value
        
        // If both have same sort_order (or 0), assign proper values based on target positions
        if ($currentSort === $targetSort || $currentSort === 0 || $targetSort === 0) {
            // Assign based on the positions they should occupy after swap
            // Current rule moves to targetIndex position, so gets sort_order = targetIndex + 1
            // Target rule moves to currentIndex position, so gets sort_order = currentIndex + 1
            $newCurrentSort = $targetIndex + 1;
            $newTargetSort = $currentIndex + 1;
        } else {
            // Both have different non-zero values, just swap them
            $newCurrentSort = $targetSort;
            $newTargetSort = $currentSort;
        }
        
        // Update both rules atomically
        $u1 = $db->prepare('UPDATE monitor_notification_rules SET sort_order = ?, updated_at = ? WHERE id = ?');
        $result1 = $u1->execute([$newCurrentSort, time(), $currentId]);
        $rowsAffected1 = $u1->rowCount();
        $result2 = $u1->execute([$newTargetSort, time(), $targetId]);
        $rowsAffected2 = $u1->rowCount();
        
        if (!$result1 || !$result2) {
            $db->rollBack();
            sendJSON(['error' => 'Failed to update sort_order', 'debug' => [
                'result1' => $result1,
                'result2' => $result2,
                'rows1' => $rowsAffected1,
                'rows2' => $rowsAffected2
            ]], 500);
            return;
        }
        
        if ($rowsAffected1 === 0 || $rowsAffected2 === 0) {
            $db->rollBack();
            sendJSON(['error' => 'No rows updated', 'debug' => [
                'rows1' => $rowsAffected1,
                'rows2' => $rowsAffected2,
                'currentId' => $currentId,
                'targetId' => $targetId
            ]], 500);
            return;
        }
        
        // Verify the swap by reading back the values
        $verifyStmt = $db->prepare('SELECT id, sort_order FROM monitor_notification_rules WHERE id IN (?, ?)');
        $verifyStmt->execute([$currentId, $targetId]);
        $verified = $verifyStmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Log the swap
        error_log(sprintf("Move %s: Rule %d (index %d, old sort %d) -> sort_order %d, Rule %d (index %d, old sort %d) -> sort_order %d", 
            $direction, $currentId, $currentIndex, $currentSort, $newCurrentSort, $targetId, $targetIndex, $targetSort, $newTargetSort));
        
        // Log verified values
        foreach ($verified as $v) {
            error_log(sprintf("Verified: Rule %d has sort_order %d", $v['id'], $v['sort_order']));
        }

        $db->commit();
        
        // Return updated sort_order values for debugging (use verified values)
        $verifiedCurrent = null;
        $verifiedTarget = null;
        foreach ($verified as $v) {
            if ((int)$v['id'] === $currentId) {
                $verifiedCurrent = ['id' => (int)$v['id'], 'sort_order' => (int)$v['sort_order']];
            } else {
                $verifiedTarget = ['id' => (int)$v['id'], 'sort_order' => (int)$v['sort_order']];
            }
        }
        
        // Get all rules again after update to see new order
        $afterStmt = $db->prepare('SELECT id, COALESCE(sort_order, 0) AS sort_order FROM monitor_notification_rules WHERE monitor_id = ? ORDER BY COALESCE(sort_order, 0) ASC, created_at DESC, id DESC');
        $afterStmt->execute([$monitorId]);
        $afterRules = $afterStmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Always return the new order so the UI can update immediately without re-fetching (avoids flicker).
        $orderAfter = array_map(function($r) { return ['id' => (int)$r['id'], 'sort_order' => (int)$r['sort_order']]; }, $afterRules);

        $response = [
            'success' => true,
            'moved' => true,
            'current_rule' => $verifiedCurrent ?: ['id' => $currentId, 'sort_order' => $newCurrentSort],
            'target_rule' => $verifiedTarget ?: ['id' => $targetId, 'sort_order' => $newTargetSort],
            'order_after' => $orderAfter,
        ];

        // Optional verbose debug (enable with ?debug=1)
        if (isset($_GET['debug']) && $_GET['debug'] === '1') {
            $response['debug'] = [
                'before' => [
                    'current' => ['id' => $currentId, 'index' => $currentIndex, 'sort_order' => $currentSort],
                    'target' => ['id' => $targetId, 'index' => $targetIndex, 'sort_order' => $targetSort],
                    'all_rules' => array_map(function($r) { return ['id' => (int)$r['id'], 'sort_order' => (int)$r['sort_order']]; }, $allRules)
                ],
                'after' => [
                    'current' => ['id' => $currentId, 'sort_order' => $newCurrentSort],
                    'target' => ['id' => $targetId, 'sort_order' => $newTargetSort],
                    'verified' => array_map(function($v) { return ['id' => (int)$v['id'], 'sort_order' => (int)$v['sort_order']]; }, $verified),
                    'all_rules_after' => $orderAfter
                ]
            ];
        }

        sendJSON($response);
    } catch (PDOException $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

/**
 * Validate email address, allowing localhost domains for local testing
 */
function isValidEmail($email) {
    // Standard email validation
    if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return true;
    }
    
    // Allow localhost domains for local testing (e.g., admin@localhost)
    if (preg_match('/^[^\s@]+@localhost$/i', $email)) {
        return true;
    }
    
    // Allow 127.0.0.1 and localhost variants
    if (preg_match('/^[^\s@]+@(localhost|127\.0\.0\.1|::1)$/i', $email)) {
        return true;
    }
    
    return false;
}
