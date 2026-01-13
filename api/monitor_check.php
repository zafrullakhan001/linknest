<?php
// This script can be called via CLI (cron) or web request (check-all)
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/email_templates.php';


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
function performMonitorCheck($monitor, $options = []) {
    // Set a maximum execution time for this check to prevent hanging
    set_time_limit(20); // Allow time for retry confirmation on failures
    
    $startTime = microtime(true);
    $status = 'down';
    $details = '';
    $checkRes = ['status' => 'down', 'details' => 'Unknown error'];
    
    // Apply per-monitor defaults (timeout, etc) unless overridden by retry opts
    $baseOpts = [];
    if (isset($monitor['timeout']) && $monitor['timeout'] !== null && $monitor['timeout'] !== '') {
        $t = (int)$monitor['timeout'];
        if ($t < 1) $t = 1;
        if ($t > 60) $t = 60;
        $baseOpts['timeout'] = $t;
        // Keep connect timeout <= total timeout
        $baseOpts['connect_timeout'] = min(5, max(1, $t));
        // Port timeout fallback
        $baseOpts['port_timeout'] = min(5, max(1, $t));
        // Ping timeout in ms
        $baseOpts['ping_timeout_ms'] = min(60000, max(250, $t * 1000));
    }

    $runCheck = function(array $opts = []) use ($monitor, $baseOpts) {
        $opts = array_merge($baseOpts, $opts);
        switch ($monitor['type']) {
            case 'url':
                return checkUrl($monitor['target'], $opts);
            case 'keyword':
                return checkKeyword($monitor['target'], $monitor['keyword'], $opts);
            case 'port':
                return checkPort($monitor['target'], $monitor['port'], $opts);
            case 'ping':
                return checkPing($monitor['target'], $opts);
            default:
                return ['status' => 'down', 'details' => 'Invalid monitor type'];
        }
    };

    try {
        // Fast attempt (existing defaults)
        $checkRes = $runCheck();

        // Confirm DOWN with a slower retry to avoid false positives from short timeouts/DNS hiccups
        if (($checkRes['status'] ?? 'down') === 'down') {
            error_log("[MONITOR] First attempt DOWN for monitor {$monitor['id']} - retrying with relaxed timeouts");
            usleep(500000); // 0.5s
            $retryRes = $runCheck([
                'timeout' => 10,
                'connect_timeout' => 5,
                'port_timeout' => 5
            ]);

            if (($retryRes['status'] ?? 'down') === 'up') {
                $checkRes = [
                    'status' => 'up',
                    'details' => ($retryRes['details'] ?? 'Recovered on retry') . ' (recovered on retry)'
                ];
            } else {
                // Keep DOWN, but include retry info for debugging
                $checkRes['details'] = ($checkRes['details'] ?? 'DOWN') . ' | Retry: ' . ($retryRes['details'] ?? 'DOWN');
            }
        }
    } catch (Exception $e) {
        $checkRes = ['status' => 'down', 'details' => 'Exception: ' . $e->getMessage()];
    }
    
    $endTime = microtime(true);
    $responseTime = round(($endTime - $startTime) * 1000); // ms

    // Apply warning threshold logic (consecutive failure gating)
    $rawStatus = strtolower(trim((string)($checkRes['status'] ?? 'down')));
    if ($rawStatus !== 'up' && $rawStatus !== 'down') {
        $rawStatus = 'down';
    }
    $rawDetails = (string)($checkRes['details'] ?? '');

    $threshold = isset($monitor['warning_threshold']) ? (int)$monitor['warning_threshold'] : 1;
    if ($threshold < 1) $threshold = 1;
    if ($threshold > 20) $threshold = 20;

    $prevFailures = isset($monitor['consecutive_failures']) ? (int)$monitor['consecutive_failures'] : 0;
    if ($prevFailures < 0) $prevFailures = 0;

    $newFailures = ($rawStatus === 'down') ? ($prevFailures + 1) : 0;
    $status = $rawStatus;
    $details = $rawDetails;
    if ($rawStatus === 'down' && $threshold > 1 && $newFailures < $threshold) {
        $status = 'warning';
        $details = "Warning ($newFailures/$threshold): " . $rawDetails;
    }
    
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
    
    // Update monitor record (including consecutive_failures for threshold logic)
    $stmt = $db->prepare('UPDATE monitors SET 
        last_checked_at = ?, 
        last_status = ?, 
        last_response_time = ?, 
        consecutive_failures = ?,
        updated_at = ? 
        WHERE id = ?');
    $stmt->execute([$now, $status, $responseTime, $newFailures, $now, $monitor['id']]);
    
    // Log result
    $stmt = $db->prepare('INSERT INTO monitor_logs (monitor_id, status, response_time, details, checked_at) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([$monitor['id'], $status, $responseTime, $details, $now]);
    
    // Send notifications using the new advanced notification system
    // Default: only notify on status transitions (prevents force-check spam).
    // Optional: if explicitly requested, evaluate rule-based notifications even when status is unchanged.
    $forceNotifyRules = (is_array($options) && !empty($options['force_notify_rules']));
    if ($statusChanged || $forceNotifyRules) {
        error_log("[EMAIL] Status changed detected - monitor {$monitor['id']}: $prevStatus -> $status");
        // Skip notifications if in maintenance window or if global notifications are paused
        if (!isNotificationPaused() && !isInMaintenanceWindow($monitor)) {
            error_log("[EMAIL] Triggering advanced notifications for monitor {$monitor['id']}");
            sendAdvancedNotifications($monitor, $status, $prevStatus, $details, $responseTime, $forceNotifyRules);
        } else {
            error_log("[EMAIL] Advanced notifications skipped - paused: " . (isNotificationPaused() ? 'YES' : 'NO') . ", maintenance: " . (isInMaintenanceWindow($monitor) ? 'YES' : 'NO'));
        }
    } else {
        error_log("[EMAIL] No status change - monitor {$monitor['id']} status remains: $status");
    }
    
    // Legacy notification support (for backward compatibility)
    // Important: do NOT spam on force-check. Only notify on status transitions (down once, up once).
    // Special case: if email was enabled while already down, allow ONE pending down notification.
    $legacyDisabledForMonitor = !empty($monitor['legacy_email_disabled']) && (int)$monitor['legacy_email_disabled'] === 1;
    $lastNotifiedStatus = $monitor['last_notified_status'] ?? null;
    if ($lastNotifiedStatus === '' || $lastNotifiedStatus === false) {
        $lastNotifiedStatus = null;
    }
    $legacyNotifyPending = (int)($monitor['legacy_notify_pending'] ?? 0);

    $shouldAttemptLegacyNotify = !empty($monitor['email_notification']) && (
        // Normal behavior: only notify on state changes
        $statusChanged ||
        // One-shot pending notification when email was enabled while already down
        ($legacyNotifyPending === 1 && $normalizedStatus === 'down')
    );

    if ($legacyDisabledForMonitor) {
        error_log("[EMAIL] Legacy notification skipped (disabled for monitor) for monitor {$monitor['id']}");
    } elseif ($shouldAttemptLegacyNotify) {
        error_log("[EMAIL] Legacy notification check - email_notification: {$monitor['email_notification']}, statusChanged: " . ($statusChanged ? 'true' : 'false'));
        error_log("[EMAIL] Notification paused: " . (isNotificationPaused() ? 'YES' : 'NO'));
        error_log("[EMAIL] In maintenance window: " . (isInMaintenanceWindow($monitor) ? 'YES' : 'NO'));
        error_log("[EMAIL] Legacy notify pending: " . ($legacyNotifyPending === 1 ? 'YES' : 'NO'));
        
        // Skip notifications if in maintenance window or if global notifications are paused
        if (!isNotificationPaused() && !isInMaintenanceWindow($monitor)) {
            // Send DOWN notification when status changes to 'down' (from any other status including null/unknown)
            // Use normalized status for comparison
            if ($normalizedStatus === 'down') {
                error_log("[EMAIL] Triggering DOWN notification for monitor {$monitor['id']} - Previous status: " . ($prevStatus ?? 'null/unknown') . ", Current: $status");
                sendNotification($monitor, "DOWN: {$monitor['name']} is unreachable. Error: $details", 'down', $responseTime, $now);
            } 
            // Send UP notification when status changes from a "not up" state back to UP
            // WARNING is a down-like transitional state (below threshold), so treat WARNING->UP as recovery too.
            elseif (($normalizedPrevStatus === 'down' || $normalizedPrevStatus === 'warning') && $normalizedStatus === 'up') {
                error_log("[EMAIL] Triggering UP notification for monitor {$monitor['id']} - Previous: " . ($prevStatus ?? 'null') . ", Current: $status");
                sendNotification($monitor, "UP: {$monitor['name']} is back online.", 'up', $responseTime, $now);
            } else {
                error_log("[EMAIL] Legacy notification condition not met - normalized status: $normalizedStatus, normalized prevStatus: " . ($normalizedPrevStatus ?? 'null') . " (no notification sent)");
            }

            // Clear the one-shot pending flag after the first attempt (prevents force-check spam)
            if ($legacyNotifyPending === 1) {
                try {
                    $dbTmp = getDB();
                    $stmtTmp = $dbTmp->prepare('UPDATE monitors SET legacy_notify_pending = 0, updated_at = ? WHERE id = ?');
                    $stmtTmp->execute([time(), $monitor['id']]);
                } catch (Exception $e) {
                    error_log("Failed to clear legacy_notify_pending for monitor {$monitor['id']}: " . $e->getMessage());
                }
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
        'details' => $details,
        'consecutive_failures' => $newFailures,
        'warning_threshold' => $threshold
    ];
}

function checkUrl($url, $opts = []) {
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        return ['status' => 'down', 'details' => 'Invalid URL'];
    }
    
    $timeout = isset($opts['timeout']) ? (int)$opts['timeout'] : 5;
    $connectTimeout = isset($opts['connect_timeout']) ? (int)$opts['connect_timeout'] : 3;

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => $connectTimeout,
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

function checkKeyword($url, $keyword, $opts = []) {
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        return ['status' => 'down', 'details' => 'Invalid URL'];
    }
    if (empty($keyword)) {
        return ['status' => 'down', 'details' => 'No keyword specified'];
    }
    
    $timeout = isset($opts['timeout']) ? (int)$opts['timeout'] : 8;
    $connectTimeout = isset($opts['connect_timeout']) ? (int)$opts['connect_timeout'] : 3;

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => $connectTimeout,
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

function checkPort($target, $port, $opts = []) {
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
    
    $portTimeout = isset($opts['port_timeout']) ? (int)$opts['port_timeout'] : 3;
    $connection = @fsockopen($host, $port, $errno, $errstr, $portTimeout);
    
    if (is_resource($connection)) {
        fclose($connection);
        return ['status' => 'up', 'details' => "Port $port open"];
    } else {
        return ['status' => 'down', 'details' => "Connection refused: $errstr ($errno)"];
    }
}

function checkPing($target, $opts = []) {
    if (empty($target)) {
        return ['status' => 'down', 'details' => 'Target is required'];
    }

    // Extract host from URL if needed
    $host = trim((string)$target);
    if (strpos($host, 'http') === 0) {
        $parsed = parse_url($host);
        if (isset($parsed['host'])) {
            $host = $parsed['host'];
        }
    }

    // Basic validation: prevent shell injection
    $host = trim($host);
    if ($host === '' || strlen($host) > 255) {
        return ['status' => 'down', 'details' => 'Invalid host'];
    }
    if (!preg_match('/^[a-zA-Z0-9\.\-:]+$/', $host)) {
        return ['status' => 'down', 'details' => 'Invalid host format'];
    }

    $timeoutMs = isset($opts['ping_timeout_ms']) ? (int)$opts['ping_timeout_ms'] : 1000;
    if ($timeoutMs < 250) $timeoutMs = 250;
    if ($timeoutMs > 60000) $timeoutMs = 60000;

    $isWindows = (stripos(PHP_OS, 'WIN') === 0);
    $cmd = '';
    if ($isWindows) {
        // -n 1 = one echo request, -w timeout in ms
        $cmd = 'ping -n 1 -w ' . (int)$timeoutMs . ' ' . escapeshellarg($host);
    } else {
        // Linux: -c 1 one packet, -W timeout (seconds). macOS uses -W in ms; we try to be reasonable.
        $isDarwin = (stripos(PHP_OS, 'DAR') === 0);
        if ($isDarwin) {
            $cmd = 'ping -c 1 -W ' . (int)$timeoutMs . ' ' . escapeshellarg($host);
        } else {
            $timeoutSec = max(1, (int)ceil($timeoutMs / 1000));
            $cmd = 'ping -c 1 -W ' . (int)$timeoutSec . ' ' . escapeshellarg($host);
        }
    }

    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w']
    ];

    $proc = @proc_open($cmd, $descriptors, $pipes);
    if (!is_resource($proc)) {
        return ['status' => 'down', 'details' => 'Ping command not available'];
    }

    // No input needed
    @fclose($pipes[0]);

    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    @fclose($pipes[1]);
    @fclose($pipes[2]);

    $exitCode = proc_close($proc);

    if ($exitCode === 0) {
        return ['status' => 'up', 'details' => 'Ping OK'];
    }

    $err = trim($stderr);
    if ($err === '') {
        $err = trim((string)$stdout);
    }
    if ($err === '') {
        $err = 'No response';
    }

    // Cap details length
    if (strlen($err) > 180) {
        $err = substr($err, 0, 180) . '...';
    }

    return ['status' => 'down', 'details' => 'Ping failed: ' . $err];
}

/**
 * Send notifications using the advanced notification system
 */
function sendAdvancedNotifications($monitor, $newStatus, $prevStatus, $details, $responseTime, $forceNotifyRules = false) {
    error_log("[EMAIL] sendAdvancedNotifications called - monitor ID: {$monitor['id']}, status: $prevStatus -> $newStatus");

    // Safety guard: never send if notifications are paused or monitor is in maintenance
    if (isNotificationPaused() || isInMaintenanceWindow($monitor)) {
        error_log("[EMAIL] Advanced notifications aborted - paused: " . (isNotificationPaused() ? 'YES' : 'NO') . ", maintenance: " . (isInMaintenanceWindow($monitor) ? 'YES' : 'NO'));
        return;
    }
    
    $db = getDB();
    
    // Determine which status triggers to check
    $triggersToCheck = [];
    
    // Normalize prevStatus for comparison
    $normalizedPrevStatus = ($prevStatus === '' || $prevStatus === false || $prevStatus === null) ? null : $prevStatus;
    
    // Force-notify mode: evaluate rules based on current status even if it did not change.
    if ($forceNotifyRules) {
        if ($newStatus === 'down' || $newStatus === 'warning') {
            $triggersToCheck[] = 'down';
            $triggersToCheck[] = 'both';
            error_log("[EMAIL] Force notify - checking 'down' and 'both' triggers");
        } elseif ($newStatus === 'up') {
            $triggersToCheck[] = 'up';
            $triggersToCheck[] = 'both';
            error_log("[EMAIL] Force notify - checking 'up' and 'both' triggers");
        }
    }
    // Normal mode: Send notification when status changes to 'down' (from any status including null/unknown/up)
    elseif ($newStatus === 'down') {
        $triggersToCheck[] = 'down';
        $triggersToCheck[] = 'both';
        error_log("[EMAIL] Status changed to DOWN - checking 'down' and 'both' triggers");
    } 
    // Send notification when status changes from a "not up" state to 'up'
    // WARNING is a down-like transitional state (below threshold), so treat WARNING->UP as recovery too.
    elseif ($newStatus === 'up' && ($normalizedPrevStatus === 'down' || $normalizedPrevStatus === 'warning')) {
        $triggersToCheck[] = 'up';
        $triggersToCheck[] = 'both';
        error_log("[EMAIL] Status changed from DOWN/WARNING to UP - checking 'up' and 'both' triggers");
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
    $stmt = $db->prepare("SELECT * FROM monitor_notification_rules WHERE monitor_id = ? AND is_enabled = 1 AND status_trigger IN ($placeholders) ORDER BY COALESCE(sort_order, 0) ASC, created_at DESC, id DESC");
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
        
        // CC list (optional) - CC recipients should also receive the email even if To list is empty
        $ccList = function_exists('normalizeEmailList') ? normalizeEmailList($rule['cc_emails'] ?? '') : [];

        error_log("[EMAIL] Rule {$rule['id']} has " . count($recipients) . " recipients and " . count($ccList) . " CC recipients");
        
        if (empty($recipients) && empty($ccList)) {
            error_log("[EMAIL] Rule {$rule['id']} skipped - no recipients configured (To/CC empty)");
            continue; // No recipients configured
        }
        
        // Prepare email content with template variables
        $subject = replaceTemplateVariables($rule['subject_template'], $monitor, $newStatus, $details, $responseTime);
        $body = replaceTemplateVariables($rule['body_template'], $monitor, $newStatus, $details, $responseTime);
        
        error_log("[EMAIL] Prepared email - subject: $subject");
        
        // Get from name and email (use rule-specific or fallback to SMTP settings)
        $fromName = $rule['from_name'] ?? 'LinkNest Monitor';
        $fromEmail = $rule['from_email'] ?? null;
        
        // Send ONE email per rule with multiple To + CC (prevents CC getting duplicates)
        $result = sendEmailMultiWithRuleFromOverride($recipients, $ccList, $subject, $body, $fromName, $fromEmail, $monitor, $newStatus, $details, $responseTime);
        $success = ($result === true) ? 1 : 0;
        $errorMsg = ($result === true) ? null : $result;

        // Log notification for each recipient (to + cc)
        $logRecipients = array_values(array_unique(array_merge($recipients, $ccList)));
        $stmt = $db->prepare('INSERT INTO monitor_notification_logs (
            rule_id, monitor_id, recipient_email, status_trigger, sent_at, 
            subject, success, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

        foreach ($logRecipients as $email) {
            $stmt->execute([
                $rule['id'],
                $monitor['id'],
                $email,
                $newStatus,
                $now,
                $subject,
                $success,
                $errorMsg
            ]);
        }
    }
}

function sendEmailMultiWithRuleFromOverride(array $toList, array $ccList, $subject, $body, $fromName = null, $fromEmail = null, $monitor = null, $status = null, $details = null, $responseTime = null) {
    // Load SMTP settings from DB (supports new smtp_servers table)
    $config = getSMTPConfig();

    if (!empty($fromName)) {
        $config['from_name'] = $fromName;
    }
    if (!empty($fromEmail)) {
        $config['from_email'] = $fromEmail;
    }

    // Render nice HTML while keeping the rule body as the plain-text part
    $mName = is_array($monitor) ? (string)($monitor['name'] ?? 'Monitor') : 'Monitor';
    $target = is_array($monitor) ? (string)($monitor['target'] ?? '') : '';
    if (is_array($monitor) && !empty($monitor['port'])) {
        $target .= ':' . (int)$monitor['port'];
    }
    $status = $status ?: 'both';
    $details = $details ?? (string)$body;

    $html = ln_render_monitor_status_email_html(
        $mName,
        $target,
        (string)$status,
        (string)$details,
        $responseTime,
        time(),
        (string)$body
    );

    return sendEmailMulti($toList, $ccList, $subject, $body, $config, [
        'html' => $html,
        'text' => (string)$body
    ]);
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
    $rt = null;
    if ($responseTime !== null && $responseTime !== '' && is_numeric($responseTime)) {
        $rt = (int)round((float)$responseTime);
    }
    $replacements = [
        '{monitor_name}' => $monitor['name'],
        '{monitor_type}' => $monitor['type'],
        '{monitor_target}' => $monitor['target'],
        '{status}' => strtoupper($status),
        '{details}' => $details ?? 'N/A',
        '{response_time}' => ($rt !== null) ? ($rt . ' ms') : 'N/A',
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

function sendNotification($monitor, $message, $statusTrigger = 'both', $responseTime = null, $checkedAt = null) {
    error_log("[EMAIL] sendNotification called for monitor ID: {$monitor['id']}, name: {$monitor['name']}");

    // Safety guard: never send if notifications are paused or monitor is in maintenance
    if (isNotificationPaused() || isInMaintenanceWindow($monitor)) {
        error_log("[EMAIL] Legacy notification aborted - paused: " . (isNotificationPaused() ? 'YES' : 'NO') . ", maintenance: " . (isInMaintenanceWindow($monitor) ? 'YES' : 'NO'));
        return;
    }
    
    $db = getDB();

    // Prefer current logged-in user (matches the UI/admin who enabled monitoring)
    $currentUserEmail = null;
    if (session_status() === PHP_SESSION_ACTIVE && isset($_SESSION['user_id'])) {
        try {
            $stmt = $db->prepare('SELECT email FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([(int)$_SESSION['user_id']]);
            $currentUserEmail = $stmt->fetchColumn();
        } catch (Exception $e) {
            // ignore
        }
    }

    // Fallback: first admin user (deterministic)
    $adminEmail = null;
    try {
        $stmt = $db->prepare('SELECT email FROM users WHERE is_admin = 1 AND email IS NOT NULL AND TRIM(email) <> "" ORDER BY id ASC LIMIT 1');
        $stmt->execute();
        $adminEmail = $stmt->fetchColumn();
    } catch (Exception $e) {
        // ignore
    }
    
    // Determine recipients (monitor override or admin email)
    $recipientsRaw = trim((string)($monitor['legacy_email_to'] ?? ''));
    $recipients = [];
    if ($recipientsRaw !== '') {
        // Allow comma-separated list
        foreach (preg_split('/[,\n]+/', $recipientsRaw) as $email) {
            $email = trim($email);
            if ($email === '') continue;
            if (function_exists('isValidEmailLocal') ? isValidEmailLocal($email) : filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $recipients[] = $email;
            }
        }
    }

    if (empty($recipients)) {
        // Use current user first (if valid), else admin
        if (!empty($currentUserEmail) && (function_exists('isValidEmailLocal') ? isValidEmailLocal($currentUserEmail) : filter_var($currentUserEmail, FILTER_VALIDATE_EMAIL))) {
            $recipients[] = $currentUserEmail;
        } elseif (!empty($adminEmail) && (function_exists('isValidEmailLocal') ? isValidEmailLocal($adminEmail) : filter_var($adminEmail, FILTER_VALIDATE_EMAIL))) {
            $recipients[] = $adminEmail;
        }
    }

    // CC list (optional)
    $ccRaw = trim((string)($monitor['legacy_email_cc'] ?? ''));
    $ccList = [];
    if ($ccRaw !== '') {
        foreach (preg_split('/[,\n]+/', $ccRaw) as $email) {
            $email = trim($email);
            if ($email === '') continue;
            if (function_exists('isValidEmailLocal') ? isValidEmailLocal($email) : filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $ccList[] = $email;
            }
        }
    }

    if (!empty($recipients)) {
        // Build templated subject/body (monitor overrides), fallback to existing message
        $defaultSubjectTpl = "[LinkNest Monitor] {monitor_name} Status Update";
        $defaultBodyTpl =
            "{status}: {monitor_name}\n" .
            "Target: {monitor_target}\n" .
            "Details: {details}\n" .
            "Response: {response_time}\n" .
            "Time: {time}\n";

        $subjectTpl = trim((string)($monitor['legacy_email_subject_template'] ?? ''));
        $bodyTpl = trim((string)($monitor['legacy_email_body_template'] ?? ''));
        $subjectTpl = $subjectTpl !== '' ? $subjectTpl : $defaultSubjectTpl;
        $bodyTpl = $bodyTpl !== '' ? $bodyTpl : $defaultBodyTpl;

        $effectiveStatus = ($statusTrigger === 'up' || $statusTrigger === 'down') ? $statusTrigger : 'both';
        $detailsForTemplate = $message; // includes "DOWN/UP: ..." plus error; good fallback for {details}
        $subject = replaceTemplateVariables($subjectTpl, $monitor, $effectiveStatus, $detailsForTemplate, $responseTime);
        $bodyText = replaceTemplateVariables($bodyTpl, $monitor, $effectiveStatus, $detailsForTemplate, $responseTime);

        $ts = is_int($checkedAt) ? $checkedAt : time();
        $target = (string)($monitor['target'] ?? '');
        if (!empty($monitor['port'])) {
            $target .= ':' . (int)$monitor['port'];
        }
        $html = ln_render_monitor_status_email_html(
            (string)($monitor['name'] ?? 'Monitor'),
            $target,
            $effectiveStatus,
            $detailsForTemplate,
            $responseTime,
            $ts,
            $bodyText
        );

        // Optional from overrides (override SMTP from_name/from_email)
        $fromNameOverride = trim((string)($monitor['legacy_email_from_name'] ?? ''));
        $fromEmailOverride = trim((string)($monitor['legacy_email_from_email'] ?? ''));
        $emailConfig = null;
        if ($fromNameOverride !== '' || $fromEmailOverride !== '') {
            $emailConfig = [
                // tell sendEmail() to use SMTP, but override from fields if provided
                'enabled' => '1',
                'from_name' => $fromNameOverride !== '' ? $fromNameOverride : null,
                'from_email' => $fromEmailOverride !== '' ? $fromEmailOverride : null
            ];
        }

        $now = time();
        $anySuccess = false;

        foreach ($recipients as $toEmail) {
            error_log("[EMAIL] Preparing to send legacy email to: {$toEmail}, subject: $subject");
            error_log("[EMAIL] Body preview: " . substr($bodyText, 0, 120) . "...");

            // Send email using our SMTP helper. If $emailConfig is set, sendEmail will still load missing SMTP settings from DB? (we merge below)
            $result = sendEmailWithOptionalFromOverride($toEmail, $subject, $bodyText, $emailConfig, $ccList, [
                'html' => $html,
                'text' => $bodyText
            ]);
            error_log("[EMAIL] sendEmail result (to {$toEmail}): " . ($result === true ? "SUCCESS" : "FAILED: " . $result));
        
            $success = ($result === true) ? 1 : 0;
            $errorMsg = ($result === true) ? null : $result;
            if ($result === true) $anySuccess = true;
        
            // If not provided, try to infer from message (backward compatible)
            $trigger = $statusTrigger;
            if ($trigger === 'both') {
                if (stripos($message, 'DOWN:') !== false) {
                    $trigger = 'down';
                } elseif (stripos($message, 'UP:') !== false) {
                    $trigger = 'up';
                }
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
                    $toEmail,
                    $trigger,
                    $now,
                    $subject,
                    $success,
                    $errorMsg
                ]);
            } catch (Exception $e) {
                // Log error but don't fail the notification
                error_log("Failed to log notification for monitor {$monitor['id']}: " . $e->getMessage());
            }
        }

        // If send succeeded, remember that we notified this status (so enabling email later still triggers once)
        if ($anySuccess && ($statusTrigger === 'down' || $statusTrigger === 'up')) {
            try {
                $stmt = $db->prepare('UPDATE monitors SET last_notified_status = ?, updated_at = ? WHERE id = ?');
                $stmt->execute([$statusTrigger, $now, $monitor['id']]);
            } catch (Exception $e) {
                error_log("Failed to update last_notified_status for monitor {$monitor['id']}: " . $e->getMessage());
            }
        }
    }
}

/**
 * Helper: sendEmail but allow overriding from_name/from_email while still using DB SMTP settings.
 * $overrides may contain from_name/from_email; other SMTP settings will still be loaded by sendEmail when config is null.
 */
function sendEmailWithOptionalFromOverride($to, $subject, $body, $overrides = null, $cc = [], $options = []) {
    if (empty($overrides) || (!isset($overrides['from_name']) && !isset($overrides['from_email']))) {
        return sendEmail($to, $subject, $body, null, $cc, $options);
    }

    // Load SMTP settings from DB (supports new smtp_servers table)
    $config = getSMTPConfig();

    if (!empty($overrides['from_name'])) {
        $config['from_name'] = $overrides['from_name'];
    }
    if (!empty($overrides['from_email'])) {
        $config['from_email'] = $overrides['from_email'];
    }

    return sendEmail($to, $subject, $body, $config, $cc, $options);
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
    
    // Check time-based pause window from active SMTP server
    $config = getSMTPConfig();
    
    $start = $config['pause_start'] ?? null;
    $end = $config['pause_end'] ?? null;
    
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
