<?php
/**
 * Performance Metrics Collection API
 * Receives performance data from client-side beacon
 */

// Disable error display but enable logging
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

require_once __DIR__ . '/../config_analytics.php';

// Handle CORS preflight
handlePreflight();

// Only accept POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJSONWithCORS(['error' => 'Method not allowed'], 405);
}

try {
    // Get JSON payload
    $input = file_get_contents('php://input');
    if (empty($input)) {
        sendJSONWithCORS(['error' => 'Empty request body'], 400);
    }
    
    $data = json_decode($input, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        sendJSONWithCORS([
            'error' => 'Invalid JSON',
            'details' => json_last_error_msg()
        ], 400);
    }
    
    if (!$data || !is_array($data)) {
        sendJSONWithCORS(['error' => 'Invalid data format'], 400);
    }
    
    // Normalize field names (beacon script uses different names)
    // Beacon sends: type, full_load, dns_time, tcp_time, tls_time, ttfb
    // API expects: measurement_type, full_response_time, dns_lookup_time, etc.
    if (isset($data['type']) && !isset($data['measurement_type'])) {
        // Map beacon script type to measurement_type
        if ($data['type'] === 'page_performance') {
            $data['measurement_type'] = 'client';
        } else {
            $data['measurement_type'] = $data['type'];
        }
    }
    
    // Map full_load to full_response_time if needed
    if (!isset($data['full_response_time']) && isset($data['full_load'])) {
        $data['full_response_time'] = $data['full_load'];
    }
    
    // Validate required fields
    $required = ['url'];
    foreach ($required as $field) {
        if (!isset($data[$field])) {
            sendJSONWithCORS(['error' => "Missing required field: $field"], 400);
        }
    }
    
    // Ensure measurement_type exists
    if (!isset($data['measurement_type'])) {
        $data['measurement_type'] = 'client';
    }
    // Only store client measurements in Postgres
    $measurementTypeNorm = strtolower(trim((string)$data['measurement_type']));
    if ($measurementTypeNorm !== 'client') {
        sendJSONWithCORS([
            'success' => true,
            'queued' => 0,
            'skipped' => true,
            'reason' => 'measurement_type_not_client'
        ]);
    }
    
    // Ensure full_response_time exists
    if (!isset($data['full_response_time'])) {
        $data['full_response_time'] = 0;
    }
    
    // Get PostgreSQL connection
    $pdo = getAnalyticsPDO();
    if (!$pdo) {
        sendJSONWithCORS(['error' => 'Analytics database not available'], 503);
    }
    
    // Get session ID safely (don't start session if not already started)
    $sessionId = $data['session_id'] ?? null;
    if (empty($sessionId) && session_status() === PHP_SESSION_ACTIVE) {
        $sessionId = session_id();
    }
    if (empty($sessionId)) {
        $sessionId = 'anonymous-' . bin2hex(random_bytes(8));
    }
    
    // Prepare payload with all metric data
    // If username is missing (or mistakenly numeric), try to resolve it from main SQLite using user_id.
    $resolvedUsername = null;
    $incomingUsername = $data['username'] ?? null;
    $incomingUserId = $data['user_id'] ?? null;
    if (is_string($incomingUsername)) {
        $incomingUsername = trim($incomingUsername);
    }

    $looksNumericUsername = false;
    if (is_int($incomingUsername) || is_float($incomingUsername)) {
        $looksNumericUsername = true;
    } elseif (is_string($incomingUsername) && $incomingUsername !== '' && ctype_digit($incomingUsername)) {
        $looksNumericUsername = true;
    }

    if (is_string($incomingUsername) && $incomingUsername !== '' && !$looksNumericUsername) {
        $resolvedUsername = $incomingUsername;
    } elseif ($incomingUserId !== null && (is_int($incomingUserId) || (is_string($incomingUserId) && ctype_digit($incomingUserId)))) {
        try {
            $mainDb = getDB();
            $stmtU = $mainDb->prepare("SELECT username FROM users WHERE id = ? LIMIT 1");
            $stmtU->execute([(int)$incomingUserId]);
            $u = $stmtU->fetchColumn();
            if (is_string($u) && trim($u) !== '') {
                $resolvedUsername = trim($u);
            }
        } catch (Exception $e) {
            // Best-effort only
        }
    }

    $payload = [
        'link_url' => $data['url'] ?? '',
        'measurement_type' => $data['measurement_type'] ?? 'client',
        'user_id' => $incomingUserId ?? null,
        'username' => $resolvedUsername,
        'session_id' => $sessionId,
        'ip_address' => function_exists('getClientIpAddress') ? getClientIpAddress() : ($_SERVER['REMOTE_ADDR'] ?? null),
        // Include timezone offset (unambiguous timestamptz input)
        'time' => date('c'),
        'full_response_time' => (int)($data['full_response_time'] ?? $data['full_load'] ?? 0),
        'dns_lookup_time' => (int)($data['dns_lookup_time'] ?? $data['dns_time'] ?? 0),
        'tcp_connection_time' => (int)($data['tcp_connection_time'] ?? $data['tcp_time'] ?? 0),
        'tls_handshake_time' => (int)($data['tls_handshake_time'] ?? $data['tls_time'] ?? 0),
        'time_to_first_byte' => (int)($data['time_to_first_byte'] ?? $data['ttfb'] ?? 0),
        'download_time' => (int)($data['download_time'] ?? 0),
        'http_status_code' => (int)($data['http_status_code'] ?? 200),
        'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? '',
        'device_type' => $data['device_type'] ?? 'desktop',
        'browser_name' => $data['browser_name'] ?? $data['browser'] ?? '',
        'browser_version' => $data['browser_version'] ?? '',
        'os_name' => $data['os_name'] ?? '',
        'screen_resolution' => $data['screen_resolution'] ?? '',
        'connection_type' => $data['connection_type'] ?? '',
        'is_authenticated' => !empty($incomingUserId),
        // Location data from client
        'country_code' => $data['country_code'] ?? 'XX',
        'region' => $data['region'] ?? 'Unknown',
        'city' => $data['city'] ?? 'Unknown',
        'latitude' => (float)($data['latitude'] ?? 0),
        'longitude' => (float)($data['longitude'] ?? 0),

        // Optional link-specific context / classification (client-side)
        'tile_id' => isset($data['tile_id']) ? substr((string)$data['tile_id'], 0, 64) : null,
        'link_id' => isset($data['link_id']) ? substr((string)$data['link_id'], 0, 64) : null,
        'link_url_normalized' => isset($data['link_url_normalized']) ? substr((string)$data['link_url_normalized'], 0, 2048) : null,
        'ok' => isset($data['ok']) ? (bool)$data['ok'] : null,
        'error_category' => isset($data['error_category']) ? substr((string)$data['error_category'], 0, 64) : null,
        'response_type' => isset($data['response_type']) ? substr((string)$data['response_type'], 0, 32) : null,
        'redirected' => isset($data['redirected']) ? (bool)$data['redirected'] : null,
        'final_url' => isset($data['final_url']) ? substr((string)$data['final_url'], 0, 2048) : null,
        'method' => isset($data['method']) ? substr((string)$data['method'], 0, 16) : null,
        'cache_mode' => isset($data['cache_mode']) ? substr((string)$data['cache_mode'], 0, 32) : null,
        'timeout_ms' => isset($data['timeout_ms']) ? (int)$data['timeout_ms'] : null,
        'attempted_at' => isset($data['attempted_at']) ? (int)$data['attempted_at'] : null,
        'error_message' => isset($data['error_message']) ? substr((string)$data['error_message'], 0, 500) : null,
        'page_url' => isset($data['page_url']) ? substr((string)$data['page_url'], 0, 2048) : null,
    ];
    
    // Insert into metrics queue (fast, non-blocking) - payload is stored as JSONB
    $stmt = $pdo->prepare("
        INSERT INTO metrics_queue (payload) 
        VALUES (:payload::jsonb)
    ");
    
    $stmt->execute([
        'payload' => json_encode($payload)
    ]);
    
    // Notify worker via LISTEN/NOTIFY
    $pdo->exec("NOTIFY metrics_inserted");
    
    sendJSONWithCORS([
        'success' => true,
        'message' => 'Metric queued for processing'
    ]);
    
} catch (PDOException $e) {
    error_log("Analytics collection PDO error: " . $e->getMessage() . " | SQL State: " . $e->getCode());
    sendJSONWithCORS([
        'error' => 'Failed to store metric',
        'details' => $e->getMessage(),
        'code' => $e->getCode()
    ], 500);
} catch (Exception $e) {
    error_log("Analytics collection error: " . $e->getMessage() . " | File: " . $e->getFile() . " | Line: " . $e->getLine());
    sendJSONWithCORS([
        'error' => 'Internal server error',
        'details' => $e->getMessage()
    ], 500);
}
