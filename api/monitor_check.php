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
    $prevStatus = $monitor['last_status'];
    $statusChanged = ($prevStatus !== $status);
    
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
    
    // Send Notification if enabled and status changed to DOWN or recovered to UP
    if ($monitor['email_notification'] && $statusChanged) {
        if ($status === 'down') {
            sendNotification($monitor, "DOWN: {$monitor['name']} is unreachable. Error: $details");
        } elseif ($prevStatus === 'down' && $status === 'up') {
            sendNotification($monitor, "UP: {$monitor['name']} is back online.");
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
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_HEADER, true); // We only need headers often, but let's get body to be safe
    curl_setopt($ch, CURLOPT_NOBODY, true); // Actually just HEAD request is enough for simple up check
    
    $exec = curl_exec($ch);
    $info = curl_getinfo($ch);
    $error = curl_error($ch);
    curl_close($ch);
    
    if ($exec === false) {
        return ['status' => 'down', 'details' => 'Connection failed: ' . $error];
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
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    // For keyword we need body
    curl_setopt($ch, CURLOPT_NOBODY, false);
    
    $body = curl_exec($ch);
    $info = curl_getinfo($ch);
    $error = curl_error($ch);
    curl_close($ch);
    
    if ($body === false) {
        return ['status' => 'down', 'details' => 'Connection failed: ' . $error];
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
    if (empty($target) || empty($port)) {
        return ['status' => 'down', 'details' => 'Target or port missing'];
    }
    
    // Extract host from URL if user entered URL instead of just host
    $host = $target;
    if (strpos($target, 'http') === 0) {
        $parsed = parse_url($target);
        if (isset($parsed['host'])) {
            $host = $parsed['host'];
        }
    }
    
    $connection = @fsockopen($host, (int)$port, $errno, $errstr, 5);
    
    if (is_resource($connection)) {
        fclose($connection);
        return ['status' => 'up', 'details' => "Port $port open"];
    } else {
        return ['status' => 'down', 'details' => "Connection refused: $errstr ($errno)"];
    }
}

function sendNotification($monitor, $message) {
    // Fetch admin email from users table
    $db = getDB();
    $stmt = $db->prepare('SELECT email FROM users WHERE is_admin = 1 LIMIT 1');
    $stmt->execute();
    $admin = $stmt->fetch();
    
    if ($admin && !empty($admin['email'])) {
        // Send email using our SMTP helper
        // It handles fetching settings and connection automatically if config is null
        $result = sendEmail($admin['email'], "[LinkNest Monitor] " . $monitor['name'] . " Status Update", $message);
        
        // Log error if failed (optional, but good for debugging)
        if ($result !== true) {
            error_log("Failed to send notification for monitor {$monitor['id']}: $result");
        }
    }
}
