<?php
/**
 * Performance Analytics Metrics Collector (same-origin)
 * Accepts client-side measurements and queues them into PostgreSQL metrics_queue.
 *
 * Route: POST /api/analytics/collect
 */

require_once __DIR__ . '/../config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

// If disabled, exit cleanly to keep main app fast and stable
if (!function_exists('isPerformanceAnalyticsEnabled') || !isPerformanceAnalyticsEnabled()) {
    sendJSON(['success' => true, 'queued' => 0, 'skipped' => 'disabled']);
}

$trackAnonymous = (getSetting('performance_analytics_track_anonymous', '1') === '1');
$userId = $_SESSION['user_id'] ?? null;
$username = $_SESSION['username'] ?? null;

if (!$userId && !$trackAnonymous) {
    sendJSON(['error' => 'Authentication required'], 401);
}

// Parse JSON body
$raw = file_get_contents('php://input');
if ($raw === false || trim($raw) === '') {
    sendJSON(['error' => 'Empty request body'], 400);
}

$decoded = json_decode($raw, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    sendJSON(['error' => 'Invalid JSON', 'details' => json_last_error_msg()], 400);
}

// Support a single metric object or an array of objects
$items = $decoded;
if (isset($decoded['url']) || isset($decoded['link_url'])) {
    $items = [$decoded];
}

if (!is_array($items)) {
    sendJSON(['error' => 'Invalid payload format'], 400);
}

// Hard limit to reduce abuse / accidental huge payloads
if (count($items) > 200) {
    sendJSON(['error' => 'Too many metrics in one request (max 200)'], 413);
}

/**
 * Validate "URL-like" field for storage.
 * We intentionally allow invalid/unreachable URLs so the analytics system can record failures.
 */
function isValidUrlForStorage($url): bool {
    if (!is_string($url)) return false;
    $trimmed = trim($url);
    if ($trimmed === '') return false;
    // Prevent abuse / oversized payloads
    if (strlen($trimmed) > 2048) return false;
    return true;
}

$queued = 0;
$rejected = 0;
$errors = [];

// Best-known location from session (browser geolocation can update it via /api/analytics/update-location)
$sessionLocation = [
    'country_code' => $_SESSION['country_code'] ?? 'XX',
    'country_name' => $_SESSION['country_name'] ?? 'Unknown',
    'region' => $_SESSION['region'] ?? 'Unknown',
    'city' => $_SESSION['city'] ?? 'Unknown',
    'latitude' => isset($_SESSION['latitude']) ? (float)$_SESSION['latitude'] : 0.0,
    'longitude' => isset($_SESSION['longitude']) ? (float)$_SESSION['longitude'] : 0.0,
];

foreach ($items as $idx => $item) {
    if (!is_array($item)) {
        $rejected++;
        $errors[] = ['index' => $idx, 'error' => 'Metric must be an object'];
        continue;
    }

    $url = $item['link_url'] ?? $item['url'] ?? null;
    if (!isValidUrlForStorage($url)) {
        $rejected++;
        $errors[] = ['index' => $idx, 'error' => 'Invalid or missing url'];
        continue;
    }

    $measurementType = $item['measurement_type'] ?? $item['type'] ?? 'client';
    if ($measurementType === 'page_performance') {
        $measurementType = 'client';
    }
    // Only store client measurements in Postgres
    $measurementTypeNorm = strtolower(trim((string)$measurementType));
    if ($measurementTypeNorm !== 'client') {
        $rejected++;
        $errors[] = ['index' => $idx, 'error' => 'Only client measurement_type is accepted'];
        continue;
    }

    // Normalize numeric fields
    $full = (int)($item['full_response_time'] ?? $item['full_load'] ?? 0);
    if ($full < 0) $full = 0;

    $metric = [
        'link_url' => $url,
        'measurement_type' => $measurementType,
        'user_id' => $userId,
        'username' => $username,
        'session_id' => session_id(),
        'ip_address' => function_exists('getClientIpAddress') ? getClientIpAddress() : ($_SERVER['REMOTE_ADDR'] ?? null),
        'is_authenticated' => ($userId !== null),
        'time' => gmdate('Y-m-d H:i:s'),  // Capture exact collection time in UTC

        'full_response_time' => $full,
        'dns_lookup_time' => isset($item['dns_lookup_time']) ? (int)$item['dns_lookup_time'] : (isset($item['dns_time']) ? (int)$item['dns_time'] : null),
        'tcp_connection_time' => isset($item['tcp_connection_time']) ? (int)$item['tcp_connection_time'] : (isset($item['tcp_time']) ? (int)$item['tcp_time'] : null),
        'tls_handshake_time' => isset($item['tls_handshake_time']) ? (int)$item['tls_handshake_time'] : (isset($item['tls_time']) ? (int)$item['tls_time'] : null),
        'time_to_first_byte' => isset($item['time_to_first_byte']) ? (int)$item['time_to_first_byte'] : (isset($item['ttfb']) ? (int)$item['ttfb'] : null),
        'download_time' => isset($item['download_time']) ? (int)$item['download_time'] : null,
        'http_status_code' => (int)($item['http_status_code'] ?? $item['http_status'] ?? 0),
        'error_message' => isset($item['error_message']) ? (string)$item['error_message'] : (isset($item['error']) ? (string)$item['error'] : null),
        'page_url' => isset($item['page_url']) ? (string)$item['page_url'] : null,
        'dom_content_loaded_time' => isset($item['dom_content_loaded_time']) ? (int)$item['dom_content_loaded_time'] : (isset($item['dom_load']) ? (int)$item['dom_load'] : null),
        'page_size_bytes' => isset($item['page_size_bytes']) ? (int)$item['page_size_bytes'] : (isset($item['page_size']) ? (int)$item['page_size'] : null),

        'device_type' => (string)($item['device_type'] ?? 'unknown'),
        'browser_name' => (string)($item['browser_name'] ?? ''),
        'browser_version' => (string)($item['browser_version'] ?? ''),
        'os_name' => (string)($item['os_name'] ?? ''),
        'screen_resolution' => (string)($item['screen_resolution'] ?? ''),
        'connection_type' => (string)($item['connection_type'] ?? ''),
        'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? '',

        // Prefer location from client payload; fallback to session
        'country_code' => (string)($item['country_code'] ?? $sessionLocation['country_code']),
        'country_name' => (string)($item['country_name'] ?? $sessionLocation['country_name']),
        'region' => (string)($item['region'] ?? $sessionLocation['region']),
        'city' => (string)($item['city'] ?? $sessionLocation['city']),
        'latitude' => (float)($item['latitude'] ?? $sessionLocation['latitude']),
        'longitude' => (float)($item['longitude'] ?? $sessionLocation['longitude']),

        // Link-specific context / classification (client-side)
        'tile_id' => isset($item['tile_id']) ? substr((string)$item['tile_id'], 0, 64) : null,
        'link_id' => isset($item['link_id']) ? substr((string)$item['link_id'], 0, 64) : null,
        'link_url_normalized' => isset($item['link_url_normalized']) ? substr((string)$item['link_url_normalized'], 0, 2048) : null,
        'ok' => isset($item['ok']) ? (bool)$item['ok'] : null,
        'error_category' => isset($item['error_category']) ? substr((string)$item['error_category'], 0, 64) : null,
        'response_type' => isset($item['response_type']) ? substr((string)$item['response_type'], 0, 32) : null,
        'redirected' => isset($item['redirected']) ? (bool)$item['redirected'] : null,
        'final_url' => isset($item['final_url']) ? substr((string)$item['final_url'], 0, 2048) : null,
        'method' => isset($item['method']) ? substr((string)$item['method'], 0, 16) : null,
        'cache_mode' => isset($item['cache_mode']) ? substr((string)$item['cache_mode'], 0, 32) : null,
        'timeout_ms' => isset($item['timeout_ms']) ? (int)$item['timeout_ms'] : null,
        'attempted_at' => isset($item['attempted_at']) ? (int)$item['attempted_at'] : null,
    ];

    // Dedupe key to avoid double inserts from double-run effects (e.g. React StrictMode)
    // Bucket by 5s to allow time-series while suppressing immediate duplicates.
    $bucket = (int)floor(time() / 5);
    $metric['dedupe_key'] = hash(
        'sha256',
        implode('|', [
            $bucket,
            (string)$metric['measurement_type'],
            (string)$metric['link_url'],
            (string)($metric['user_id'] ?? '0'),
            (string)($metric['ip_address'] ?? ''),
            (string)($metric['session_id'] ?? ''),
            (string)((int)$metric['full_response_time']),
        ])
    );

    try {
        trackPerformanceMetric($metric);
        $queued++;
    } catch (Exception $e) {
        $rejected++;
        $errors[] = ['index' => $idx, 'error' => 'Failed to queue metric'];
        // trackPerformanceMetric already logs; keep response minimal
    }
}

sendJSON([
    'success' => true,
    'queued' => $queued,
    'rejected' => $rejected,
    'errors' => $errors
]);

