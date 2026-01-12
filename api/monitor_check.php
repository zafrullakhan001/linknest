<?php
// This script can be called via CLI (cron) or web request (check-all)
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/mailer.php';


// If running from CLI or direct execution, ensure we don't time out
if (php_sapi_name() === 'cli' || isset($_GET['cron'])) {
    set_time_limit(300); // 5 minutes max
}

// Handle request if called directly via HTTP
if (basename($_SERVER['PHP_SELF']) === 'monitor_check.php' && isset($_SERVER['REQUEST_METHOD'])) {
    $method = $_SERVER['REQUEST_METHOD'];
    // Simple authentication for cron jobs via token could be added here
    // For now we rely on requireAuth() for manual triggers or run via CLI
    
    if ($method === 'POST') {
        // Manually trigger check for all due monitors
        requireAuth();
        handleCheckDueMonitors();
    }
}

/**
 * Check all monitors that are due for checking
 */
function handleCheckDueMonitors() {
    $db = getDB();
    $now = time();
    $results = [];
    
    // Select active monitors where (last_checked + interval * 60) < now
    $stmt = $db->prepare('SELECT * FROM monitors WHERE is_active = 1');
    $stmt->execute();
    $monitors = $stmt->fetchAll();
    
    $count = 0;
    foreach ($monitors as $monitor) {
        $intervalSeconds = ($monitor['interval'] ?? 5) * 60;
        $lastChecked = $monitor['last_checked_at'] ?? 0;
        
        if (($lastChecked + $intervalSeconds) <= $now) {
            $results[$monitor['id']] = performMonitorCheck($monitor);
            $count++;
        }
    }
    
    if (isset($_SERVER['REQUEST_METHOD'])) {
        sendJSON(['success' => true, 'checked_count' => $count, 'results' => $results]);
    }
}

/**
 * Perform a check for a single monitor
 */
function performMonitorCheck($monitor) {
    // Set a maximum execution time for this check to prevent hanging
    set_time_limit(10); // Maximum 10 seconds per check
    
    $startTime = microtime(true);
    $status = 'down';
    $details = '';
    $checkRes = ['status' => 'down', 'details' => 'Unknown error'];
    
    try {
        switch ($monitor['type']) {
            case 'url':
                $checkRes = checkUrl($monitor['target']);
                break;
            case 'keyword':
                $checkRes = checkKeyword($monitor['target'], $monitor['keyword']);
                break;
            case 'port':
                $checkRes = checkPort($monitor['target'], $monitor['port']);
                break;
            default:
                $checkRes = ['status' => 'down', 'details' => 'Invalid monitor type'];
        }
    } catch (Exception $e) {
        $checkRes = ['status' => 'down', 'details' => 'Exception: ' . $e->getMessage()];
    }
    
    $endTime = microtime(true);
    $responseTime = round(($endTime - $startTime) * 1000); // ms
    $status = $checkRes['status'];
    $details = $checkRes['details'];
    
    // Update monitor state
    $db = getDB();
    $now = time();
    
    // Check if status changed
    $prevStatus = $monitor['last_status'] ?? null;
    // Normalize null/empty to null for comparison
    if ($prevStatus === '' || $prevStatus === false) {
        $prevStatus = null;
    }
    // Normalize status values (trim and lowercase for comparison)
    $normalizedPrevStatus = $prevStatus ? strtolower(trim($prevStatus)) : null;
    $normalizedStatus = strtolower(trim($status));
    $statusChanged = ($normalizedPrevStatus !== $normalizedStatus);
    
    error_log("[MONITOR] Status check - Previous: " . ($prevStatus ?? 'null') . " (normalized: " . ($normalizedPrevStatus ?? 'null') . "), Current: $status (normalized: $normalizedStatus), Changed: " . ($statusChanged ? 'YES' : 'NO'));
    
    // Update monitor record
    $stmt = $db->prepare('UPDATE monitors SET 
        last_checked_at = ?, 
        last_status = ?, 
        last_response_time = ?, 
        updated_at = ? 
        WHERE id = ?');
    $stmt->execute([$now, $status, $responseTime, $now, $monitor['id']]);
    
    // Log result
    $stmt = $db->prepare('INSERT INTO monitor_logs (monitor_id, status, response_time, details, checked_at) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([$monitor['id'], $status, $responseTime, $details, $now]);
    
    // Send notifications using the new advanced notification system
    if ($statusChanged) {
        error_log("[EMAIL] Status changed detected - monitor {$monitor['id']}: $prevStatus -> $status");
        // Skip notifications if in maintenance window or if global notifications are paused
        if (!isNotificationPaused() && !isInMaintenanceWindow($monitor)) {
            error_log("[EMAIL] Triggering advanced notifications for monitor {$monitor['id']}");
            sendAdvancedNotifications($monitor, $status, $prevStatus, $details, $responseTime);
        } else {
            error_log("[EMAIL] Advanced notifications skipped - paused: " . (isNotificationPaused() ? 'YES' : 'NO') . ", maintenance: " . (isInMaintenanceWindow($monitor) ? 'YES' : 'NO'));
        }
    } else {
        error_log("[EMAIL] No status change - monitor {$monitor['id']} status remains: $status");
    }
    
    // Legacy notification support (for backward compatibility)
    if ($monitor['email_notification'] && $statusChanged) {
        error_log("[EMAIL] Legacy notification check - email_notification: {$monitor['email_notification']}, statusChanged: " . ($statusChanged ? 'true' : 'false'));
        error_log("[EMAIL] Notification paused: " . (isNotificationPaused() ? 'YES' : 'NO'));
        error_log("[EMAIL] In maintenance window: " . (isInMaintenanceWindow($monitor) ? 'YES' : 'NO'));
        
        // Skip notifications if in maintenance window or if global notifications are paused
        if (!isNotificationPaused() && !isInMaintenanceWindow($monitor)) {
            // Send DOWN notification when status changes to 'down' (from any other status including null/unknown)
            // Use normalized status for comparison
            if ($normalizedStatus === 'down') {
                error_log("[EMAIL] Triggering DOWN notification for monitor {$monitor['id']} - Previous status: " . ($prevStatus ?? 'null/unknown') . ", Current: $status");
                sendNotification($monitor, "DOWN: {$monitor['name']} is unreachable. Error: $details");
            } 
            // Send UP notification when status changes from 'down' to 'up'
            elseif ($normalizedPrevStatus === 'down' && $normalizedStatus === 'up') {
                error_log("[EMAIL] Triggering UP notification for monitor {$monitor['id']} - Previous: " . ($prevStatus ?? 'null') . ", Current: $status");
                sendNotification($monitor, "UP: {$monitor['name']} is back online.");
            } else {
                error_log("[EMAIL] Legacy notification condition not met - normalized status: $normalizedStatus, normalized prevStatus: " . ($normalizedPrevStatus ?? 'null') . " (no notification sent)");
            }
        } else {
            error_log("[EMAIL] Notification skipped - paused or in maintenance window");
        }
    } else {
        if (!$monitor['email_notification']) {
            error_log("[EMAIL] Legacy notification skipped - email_notification disabled for monitor {$monitor['id']}");
        }
        if (!$statusChanged) {
            error_log("[EMAIL] Legacy notification skipped - status did not change (prev: $prevStatus, new: $status)");
        }
    }
    
    return [
        'id' => $monitor['id'],
        'status' => $status,
        'response_time' => $responseTime,
        'details' => $details
    ];
}

function checkUrl($url) {
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        return ['status' => 'down', 'details' => 'Invalid URL'];
    }
    
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 5, // Reduced from 10 to 5 seconds - fail fast
        CURLOPT_CONNECTTIMEOUT => 3, // 3 seconds to establish connection - prevents hanging
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_NOBODY => true, // HEAD request for efficiency
        CURLOPT_USERAGENT => 'LinkNest Monitor/1.0',
        CURLOPT_HTTPHEADER => [
            'Accept: */*',
            'Cache-Control: no-cache',
            'Connection: close' // Close connection immediately
        ],
        CURLOPT_FRESH_CONNECT => true, // Don't reuse connections
        CURLOPT_FORBID_REUSE => true // Force new connection
    ]);
    
    $exec = curl_exec($ch);
    $info = curl_getinfo($ch);
    $error = curl_error($ch);
    $errno = curl_errno($ch);
    curl_close($ch);
    
    if ($exec === false || $errno !== 0) {
        // Handle timeout specifically
        if ($errno === CURLE_OPERATION_TIMEDOUT || $errno === CURLE_OPERATION_TIMEOUTED) {
            return ['status' => 'down', 'details' => 'Connection timeout'];
        }
        return ['status' => 'down', 'details' => 'Connection failed: ' . ($error ?: 'Unknown error')];
    }
    
    $code = $info['http_code'];
    if ($code >= 200 && $code < 400) {
        return ['status' => 'up', 'details' => "HTTP $code"];
    } else {
        return ['status' => 'down', 'details' => "HTTP $code"];
    }
}

function checkKeyword($url, $keyword) {
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        return ['status' => 'down', 'details' => 'Invalid URL'];
    }
    if (empty($keyword)) {
        return ['status' => 'down', 'details' => 'No keyword specified'];
    }
    
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 8, // Reduced from 15 to 8 seconds - fail faster
        CURLOPT_CONNECTTIMEOUT => 3, // 3 seconds to establish connection
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_NOBODY => false, // Need body for keyword search
        CURLOPT_USERAGENT => 'LinkNest Monitor/1.0',
        CURLOPT_HTTPHEADER => [
            'Accept: */*',
            'Cache-Control: no-cache',
            'Connection: close'
        ],
        CURLOPT_FRESH_CONNECT => true,
        CURLOPT_FORBID_REUSE => true
    ]);
    
    $body = curl_exec($ch);
    $info = curl_getinfo($ch);
    $error = curl_error($ch);
    $errno = curl_errno($ch);
    curl_close($ch);
    
    if ($body === false || $errno !== 0) {
        // Handle timeout specifically
        if ($errno === CURLE_OPERATION_TIMEDOUT || $errno === CURLE_OPERATION_TIMEOUTED) {
            return ['status' => 'down', 'details' => 'Connection timeout'];
        }
        return ['status' => 'down', 'details' => 'Connection failed: ' . ($error ?: 'Unknown error')];
    }
    
    $code = $info['http_code'];
    if ($code >= 200 && $code < 400) {
        if (stripos($body, $keyword) !== false) {
            return ['status' => 'up', 'details' => "Keyword found (HTTP $code)"];
        } else {
            return ['status' => 'down', 'details' => "Keyword '$keyword' not found"];
        }
    } else {
        return ['status' => 'down', 'details' => "HTTP $code"];
    }
}

function checkPort($target, $port) {
    // Validate inputs
    if (empty($target) || empty($port)) {
        return ['status' => 'down', 'details' => 'Target and port are required'];
    }
    
    // Validate port range
    $port = (int)$port;
    if ($port < 1 || $port > 65535) {
        return ['status' => 'down', 'details' => 'Invalid port number'];
    }
    
    // Extract host from URL if user entered URL instead of just host
    $host = $target;
    if (strpos($target, 'http') === 0) {
        $parsed = parse_url($target);
        if (isset($parsed['host'])) {
            $host = $parsed['host'];
        }
    }
    
    // Use 3 seconds timeout (reduced from 5) - fail faster
    $connection = @fsockopen($host, $port, $errno, $errstr, 3);
    
    if (is_resource($connection)) {
        fclose($connection);
        return ['status' => 'up', 'details' => "Port $port open"];
    } else {
        return ['status' => 'down', 'details' => "Connection refused: $errstr ($errno)"];
    }
}

/**
 * Send notifications using the advanced notification system
 */
function sendAdvancedNotifications($monitor, $newStatus, $prevStatus, $details, $responseTime) {
    error_log("[EMAIL] sendAdvancedNotifications called - monitor ID: {$monitor['id']}, status: $prevStatus -> $newStatus");
    
    $db = getDB();
    
    // Determine which status triggers to check
    $triggersToCheck = [];
    
    // Normalize prevStatus for comparison
    $normalizedPrevStatus = ($prevStatus === '' || $prevStatus === false || $prevStatus === null) ? null : $prevStatus;
    
    // Send notification when status changes to 'down' (from any status including null/unknown/up)
    if ($newStatus === 'down') {
        $triggersToCheck[] = 'down';
        $triggersToCheck[] = 'both';
        error_log("[EMAIL] Status changed to DOWN - checking 'down' and 'both' triggers");
    } 
    // Send notification when status changes from 'down' to 'up'
    elseif ($newStatus === 'up' && $normalizedPrevStatus === 'down') {
        $triggersToCheck[] = 'up';
        $triggersToCheck[] = 'both';
        error_log("[EMAIL] Status changed from DOWN to UP - checking 'up' and 'both' triggers");
    } else {
        error_log("[EMAIL] Status change not triggering notifications - prev: " . ($normalizedPrevStatus ?? 'null') . ", new: $newStatus");
    }
    
    if (empty($triggersToCheck)) {
        error_log("[EMAIL] No triggers to check for status change: " . ($normalizedPrevStatus ?? 'null') . " -> $newStatus");
        return; // No relevant status change
    }
    
    error_log("[EMAIL] Checking triggers: " . implode(', ', $triggersToCheck));
    
    // Get all enabled notification rules for this monitor
    $placeholders = implode(',', array_fill(0, count($triggersToCheck), '?'));
    $stmt = $db->prepare("SELECT * FROM monitor_notification_rules WHERE monitor_id = ? AND is_enabled = 1 AND status_trigger IN ($placeholders)");
    $params = array_merge([$monitor['id']], $triggersToCheck);
    $stmt->execute($params);
    $rules = $stmt->fetchAll();
    
    error_log("[EMAIL] Found " . count($rules) . " notification rules for monitor {$monitor['id']}");
    
    if (empty($rules)) {
        error_log("[EMAIL] No notification rules configured for monitor {$monitor['id']}");
        return; // No rules configured
    }
    
    $now = time();
    $currentHour = (int)date('H');
    $currentMinute = (int)date('i');
    $currentDayOfWeek = (int)date('w'); // 0 = Sunday, 6 = Saturday
    
    foreach ($rules as $rule) {
        error_log("[EMAIL] Processing rule ID: {$rule['id']}, name: {$rule['name']}");
        
        // Check time window
        if (!isTimeWindowActive($rule, $currentHour, $currentMinute)) {
            error_log("[EMAIL] Rule {$rule['id']} skipped - not in time window");
            continue; // Skip this rule, not in time window
        }
        
        // Check days of week
        if (!isDayOfWeekActive($rule, $currentDayOfWeek)) {
            error_log("[EMAIL] Rule {$rule['id']} skipped - not on active day");
            continue; // Skip this rule, not on active day
        }
        
        // Get recipients for this rule
        $stmt = $db->prepare('SELECT email FROM monitor_notification_recipients WHERE rule_id = ?');
        $stmt->execute([$rule['id']]);
        $recipients = $stmt->fetchAll(PDO::FETCH_COLUMN);
        
        error_log("[EMAIL] Rule {$rule['id']} has " . count($recipients) . " recipients");
        
        if (empty($recipients)) {
            error_log("[EMAIL] Rule {$rule['id']} skipped - no recipients configured");
            continue; // No recipients configured
        }
        
        // Prepare email content with template variables
        $subject = replaceTemplateVariables($rule['subject_template'], $monitor, $newStatus, $details, $responseTime);
        $body = replaceTemplateVariables($rule['body_template'], $monitor, $newStatus, $details, $responseTime);
        
        error_log("[EMAIL] Prepared email - subject: $subject");
        
        // Get from name and email (use rule-specific or fallback to SMTP settings)
        $fromName = $rule['from_name'] ?? 'LinkNest Monitor';
        $fromEmail = $rule['from_email'] ?? null;
        
        // Send to all recipients
        foreach ($recipients as $recipientEmail) {
            error_log("[EMAIL] Sending email to recipient: $recipientEmail via rule {$rule['id']}");
            $result = sendNotificationEmail($recipientEmail, $subject, $body, $fromName, $fromEmail);
            
            // Log notification
            $stmt = $db->prepare('INSERT INTO monitor_notification_logs (
                rule_id, monitor_id, recipient_email, status_trigger, sent_at, 
                subject, success, error_message
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            
            $success = ($result === true) ? 1 : 0;
            $errorMsg = ($result === true) ? null : $result;
            
            $stmt->execute([
                $rule['id'],
                $monitor['id'],
                $recipientEmail,
                $newStatus,
                $now,
                $subject,
                $success,
                $errorMsg
            ]);
        }
    }
}

/**
 * Check if current time is within the rule's time window
 */
function isTimeWindowActive($rule, $currentHour, $currentMinute) {
    $start = $rule['time_window_start'];
    $end = $rule['time_window_end'];
    
    // No time window means always active
    if (empty($start) || empty($end)) {
        return true;
    }
    
    // Parse time window
    list($startHour, $startMinute) = explode(':', $start);
    list($endHour, $endMinute) = explode(':', $end);
    
    $startHour = (int)$startHour;
    $startMinute = (int)$startMinute;
    $endHour = (int)$endHour;
    $endMinute = (int)$endMinute;
    
    $currentTimeMinutes = $currentHour * 60 + $currentMinute;
    $startTimeMinutes = $startHour * 60 + $startMinute;
    $endTimeMinutes = $endHour * 60 + $endMinute;
    
    // Handle time windows that span midnight (e.g., 22:00 to 06:00)
    if ($endTimeMinutes < $startTimeMinutes) {
        // Window spans midnight
        return ($currentTimeMinutes >= $startTimeMinutes || $currentTimeMinutes <= $endTimeMinutes);
    } else {
        // Normal window
        return ($currentTimeMinutes >= $startTimeMinutes && $currentTimeMinutes <= $endTimeMinutes);
    }
}

/**
 * Check if current day of week is active for the rule
 */
function isDayOfWeekActive($rule, $currentDayOfWeek) {
    $daysOfWeek = $rule['days_of_week'];
    
    // No days specified means all days are active
    if (empty($daysOfWeek)) {
        return true;
    }
    
    // Parse days (comma-separated)
    $activeDays = array_map('trim', explode(',', $daysOfWeek));
    $activeDays = array_map('intval', $activeDays);
    
    return in_array($currentDayOfWeek, $activeDays);
}

/**
 * Replace template variables in email content
 */
function replaceTemplateVariables($template, $monitor, $status, $details, $responseTime) {
    $replacements = [
        '{monitor_name}' => $monitor['name'],
        '{monitor_type}' => $monitor['type'],
        '{monitor_target}' => $monitor['target'],
        '{status}' => strtoupper($status),
        '{details}' => $details ?? 'N/A',
        '{response_time}' => $responseTime ? $responseTime . ' ms' : 'N/A',
        '{time}' => date('Y-m-d H:i:s'),
        '{date}' => date('Y-m-d'),
        '{timestamp}' => time()
    ];
    
    return str_replace(array_keys($replacements), array_values($replacements), $template);
}

/**
 * Send notification email with custom from name/email support
 */
function sendNotificationEmail($to, $subject, $body, $fromName = null, $fromEmail = null) {
    error_log("[EMAIL] sendNotificationEmail called - to: $to, subject: $subject");
    
    // If custom from email is provided, we need to modify the SMTP config
    // For now, we'll use the standard sendEmail function
    // In a more advanced implementation, we could pass custom from info
    
    // Use the standard sendEmail function (it will use SMTP settings from DB)
    $result = sendEmail($to, $subject, $body);
    error_log("[EMAIL] sendNotificationEmail result: " . ($result === true ? "SUCCESS" : "FAILED: " . $result));
    
    return $result;
}

function sendNotification($monitor, $message) {
    error_log("[EMAIL] sendNotification called for monitor ID: {$monitor['id']}, name: {$monitor['name']}");
    
    // Fetch admin email from users table
    $db = getDB();
    $stmt = $db->prepare('SELECT email FROM users WHERE is_admin = 1 LIMIT 1');
    $stmt->execute();
    $admin = $stmt->fetch();
    
    if ($admin && !empty($admin['email'])) {
        $subject = "[LinkNest Monitor] " . $monitor['name'] . " Status Update";
        error_log("[EMAIL] Preparing to send email to: {$admin['email']}, subject: $subject");
        error_log("[EMAIL] Message preview: " . substr($message, 0, 100) . "...");
        
        // Send email using our SMTP helper
        // It handles fetching settings and connection automatically if config is null
        $result = sendEmail($admin['email'], $subject, $message);
        error_log("[EMAIL] sendEmail result: " . ($result === true ? "SUCCESS" : "FAILED: " . $result));
        
        $now = time();
        $success = ($result === true) ? 1 : 0;
        $errorMsg = ($result === true) ? null : $result;
        
        // Determine status trigger from message
        $statusTrigger = 'both'; // Default
        if (stripos($message, 'DOWN:') !== false) {
            $statusTrigger = 'down';
        } elseif (stripos($message, 'UP:') !== false) {
            $statusTrigger = 'up';
        }
        
        // Log to monitor_notification_logs table (legacy notifications use NULL rule_id)
        try {
            $stmt = $db->prepare('INSERT INTO monitor_notification_logs (
                rule_id, monitor_id, recipient_email, status_trigger, sent_at, 
                subject, success, error_message
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            
            $stmt->execute([
                null, // Legacy notifications don't have a rule_id
                $monitor['id'],
                $admin['email'],
                $statusTrigger,
                $now,
                $subject,
                $success,
                $errorMsg
            ]);
        } catch (Exception $e) {
            // Log error but don't fail the notification
            error_log("Failed to log notification for monitor {$monitor['id']}: " . $e->getMessage());
        }
        
        // Log error if failed (optional, but good for debugging)
        if ($result !== true) {
            error_log("Failed to send notification for monitor {$monitor['id']}: $result");
        }
    }
}

/**
 * Check if notifications are currently paused based on SMTP settings or global pause flag
 */
function isNotificationPaused() {
    $db = getDB();
    
    // Check global pause flag first (simple boolean toggle)
    $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'notifications_paused'");
    $stmt->execute();
    $globalPause = $stmt->fetchColumn();
    
    if ($globalPause === '1' || $globalPause === 'true') {
        return true;
    }
    
    // Check time-based pause window (legacy SMTP pause feature)
    $stmt = $db->prepare("SELECT key, value FROM settings WHERE key IN ('smtp_pause_start', 'smtp_pause_end')");
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
    
    $start = $rows['smtp_pause_start'] ?? null;
    $end = $rows['smtp_pause_end'] ?? null;
    
    if (empty($start) || empty($end)) {
        return false;
    }
    
    $now = time();
    $startTime = strtotime($start);
    $endTime = strtotime($end);
    
    if (!$startTime || !$endTime) {
        return false;
    }
    
    return ($now >= $startTime && $now <= $endTime);
}

/**
 * Check if monitor is currently in a maintenance window
 */
function isInMaintenanceWindow($monitor) {
    $maintenanceStart = $monitor['maintenance_start'] ?? null;
    $maintenanceEnd = $monitor['maintenance_end'] ?? null;
    
    // No maintenance window set
    if (empty($maintenanceStart) || empty($maintenanceEnd)) {
        return false;
    }
    
    $now = time();
    
    // Check if current time is within the maintenance window
    return ($now >= $maintenanceStart && $now <= $maintenanceEnd);
}
