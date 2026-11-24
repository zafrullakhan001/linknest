<?php
/**
 * Detailed Metrics Table API
 * Returns raw measurements (one row per measurement) for the dashboard table view.
 *
 * GET /api/performance/table?period=1h&type=client&url=&username=&ip=&authenticated=&limit=500&offset=0
 * Custom range:
 * GET /api/performance/table?period=custom&start=YYYY-MM-DD HH:MM:SS&end=YYYY-MM-DD HH:MM:SS
 */
require_once __DIR__ . '/../config_analytics.php';

// Handle OPTIONS preflight
handlePreflight();

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

$period = (string)($_GET['period'] ?? '1h');
$measurementType = (string)($_GET['type'] ?? 'client');
$url = isset($_GET['url']) ? trim((string)$_GET['url']) : '';
$username = isset($_GET['username']) ? trim((string)$_GET['username']) : '';
$ip = isset($_GET['ip']) ? trim((string)$_GET['ip']) : '';
$authenticated = isset($_GET['authenticated']) ? (string)$_GET['authenticated'] : '';

$limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 500;
$offset = isset($_GET['offset']) ? (int)$_GET['offset'] : 0;
if ($limit < 1) $limit = 1;
if ($limit > 5000) $limit = 5000;
if ($offset < 0) $offset = 0;

// Map period presets
$periodMap = [
    '1h' => '1 hour',
    '24h' => '24 hours',
    '7d' => '7 days',
    '30d' => '30 days'
];

$start = null;
$end = null;
if ($period === 'custom') {
    $start = (string)($_GET['start'] ?? '');
    $end = (string)($_GET['end'] ?? '');
    if ($start === '' || $end === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'start and end are required for period=custom']);
        exit;
    }
} else {
    $interval = $periodMap[$period] ?? '1 hour';
    $start = null; // computed in SQL
    $end = null;
}

// Validate measurement type
if ($measurementType !== 'client' && $measurementType !== 'server') {
    $measurementType = 'client';
}

try {
    $db = getAnalyticsPDO();

    $where = [];
    $params = [
        ':measurement_type' => $measurementType,
        ':limit' => $limit,
        ':offset' => $offset
    ];

    if ($period === 'custom') {
        $where[] = "time BETWEEN :start AND :end";
        $params[':start'] = $start;
        $params[':end'] = $end;
    } else {
        $interval = $periodMap[$period] ?? '1 hour';
        $where[] = "time >= NOW() - INTERVAL '{$interval}'";
    }

    $where[] = "measurement_type = :measurement_type";

    if ($url !== '') {
        $where[] = "link_url = :url";
        $params[':url'] = $url;
    }

    if ($username !== '') {
        $where[] = "username ILIKE :username";
        $params[':username'] = '%' . $username . '%';
    }

    if ($ip !== '') {
        $where[] = "CAST(ip_address AS TEXT) ILIKE :ip";
        $params[':ip'] = '%' . $ip . '%';
    }

    if ($authenticated !== '') {
        if ($authenticated === 'true') {
            $where[] = "is_authenticated = TRUE";
        } elseif ($authenticated === 'false') {
            $where[] = "is_authenticated = FALSE";
        }
    }

    $whereSql = implode(' AND ', $where);

    // Total count for pagination
    $countSql = "SELECT COUNT(*) FROM performance_metrics WHERE {$whereSql}";
    $countStmt = $db->prepare($countSql);
    foreach ($params as $k => $v) {
        if (in_array($k, [':limit', ':offset'], true)) continue;
        $countStmt->bindValue($k, $v);
    }
    $countStmt->execute();
    $total = (int)$countStmt->fetchColumn();

    // Columns must match performance_metrics schema (no tile_id, link_url_normalized, ok, etc.)
    $sql = "
        SELECT
            time,
            link_url,
            link_id,
            page_url,
            measurement_type,
            user_id,
            username,
            session_id,
            is_authenticated,
            CAST(ip_address AS TEXT) as ip_address,
            continent_code,
            country_code,
            country_name,
            region_name,
            city_name,
            latitude,
            longitude,
            timezone,
            isp,
            full_response_time,
            dns_lookup_time,
            tcp_connection_time,
            tls_handshake_time,
            time_to_first_byte,
            dom_content_loaded_time,
            page_size_bytes,
            http_status_code,
            error_message,
            connection_type,
            device_type,
            browser_name,
            browser_version,
            os_name,
            screen_resolution,
            created_at
        FROM performance_metrics
        WHERE {$whereSql}
        ORDER BY time DESC
        LIMIT :limit OFFSET :offset
    ";

    $stmt = $db->prepare($sql);
    foreach ($params as $k => $v) {
        $stmt->bindValue($k, $v);
    }
    $stmt->execute();

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'period' => $period,
        'measurement_type' => $measurementType,
        'filters' => [
            'url' => $url !== '' ? $url : null,
            'username' => $username !== '' ? $username : null,
            'ip' => $ip !== '' ? $ip : null,
            'authenticated' => $authenticated !== '' ? $authenticated : null,
            'start' => $period === 'custom' ? $start : null,
            'end' => $period === 'custom' ? $end : null
        ],
        'pagination' => [
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
            'has_more' => ($offset + $limit) < $total
        ],
        'data' => $rows
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

