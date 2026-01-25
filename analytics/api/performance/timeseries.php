<?php
/**
 * Time-Series Performance API
 * Returns performance metrics over time for charting
 * 
 * GET /api/performance/timeseries?period=1h&type=client&url=&metric=p95&bucket=auto&limitUrls=6
 * Custom range:
 * GET /api/performance/timeseries?period=custom&start=YYYY-MM-DD HH:MM:SS&end=YYYY-MM-DD HH:MM:SS
 *
 * Notes
 * - This endpoint is optimized for dashboard time-series. It uses time_bucket on performance_metrics
 *   to provide higher resolution than the hourly continuous aggregate.
 */

require_once __DIR__ . '/../config_analytics.php';

// Handle OPTIONS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    handlePreflight();
}

// CORS headers
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

$period = (string)($_GET['period'] ?? '1h');
$url = isset($_GET['url']) ? trim((string)$_GET['url']) : '';
$username = isset($_GET['username']) ? trim((string)$_GET['username']) : '';
$ipAddress = isset($_GET['ip']) ? trim((string)$_GET['ip']) : '';
$authenticated = isset($_GET['authenticated']) ? (string)$_GET['authenticated'] : '';
$groupBy = (string)($_GET['groupBy'] ?? 'url'); // url, username, ip, country, region, city
$metric = (string)($_GET['metric'] ?? 'p95'); // avg, p50, p95, p99, min, max
$bucket = (string)($_GET['bucket'] ?? 'auto'); // auto | 1m | 5m | 15m | 1h | 6h
$measurementType = (string)($_GET['type'] ?? 'client');
$limitUrls = isset($_GET['limitUrls']) ? (int)$_GET['limitUrls'] : 6;
if ($limitUrls < 1) $limitUrls = 1;
if ($limitUrls > 20) $limitUrls = 20;

// Validate measurement type
if ($measurementType !== 'client' && $measurementType !== 'server') {
    $measurementType = 'client';
}

// Resolve time range
$start = null;
$end = null;
$periodMap = [
    '1h' => '1 hour',
    '24h' => '24 hours',
    '7d' => '7 days',
    '30d' => '30 days'
];

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
    // Let Postgres compute NOW()-interval for start; still return a computed ISO string for response.
    $end = date('Y-m-d H:i:s');
    $start = date('Y-m-d H:i:s', strtotime('-' . $interval));
}

// Validate metric
$metric = strtolower($metric);
$allowedMetric = ['avg', 'p50', 'p95', 'p99', 'min', 'max'];
if (!in_array($metric, $allowedMetric, true)) {
    $metric = 'p95';
}

// Choose bucket size (validated & safe)
$bucket = strtolower($bucket);
$bucketMap = [
    '1m' => "1 minute",
    '5m' => "5 minutes",
    '15m' => "15 minutes",
    '1h' => "1 hour",
    '6h' => "6 hours",
];

if ($bucket === 'auto') {
    $rangeSeconds = max(1, strtotime($end) - strtotime($start));
    if ($rangeSeconds <= 2 * 3600) {
        $bucketInterval = $bucketMap['1m'];
        $bucket = '1m';
    } elseif ($rangeSeconds <= 24 * 3600) {
        $bucketInterval = $bucketMap['5m'];
        $bucket = '5m';
    } elseif ($rangeSeconds <= 7 * 24 * 3600) {
        $bucketInterval = $bucketMap['1h'];
        $bucket = '1h';
    } else {
        $bucketInterval = $bucketMap['6h'];
        $bucket = '6h';
    }
} else {
    $bucketInterval = $bucketMap[$bucket] ?? $bucketMap['5m'];
    if (!isset($bucketMap[$bucket])) {
        $bucket = '5m';
    }
}

try {
    $db = getAnalyticsPDO();

    // Build filter conditions
    $filterSql = '';
    $params = [
        ':start' => $start,
        ':end' => $end,
        ':measurement_type' => $measurementType,
    ];

    // URL filter
    if ($url !== '') {
        $filterSql .= ' AND pm.link_url = :url';
        $params[':url'] = $url;
    }

    // Username filter
    if ($username !== '') {
        $filterSql .= ' AND pm.username ILIKE :username';
        $params[':username'] = '%' . $username . '%';
    }

    // IP address filter
    if ($ipAddress !== '') {
        $filterSql .= ' AND CAST(pm.ip_address AS TEXT) ILIKE :ip_address';
        $params[':ip_address'] = '%' . $ipAddress . '%';
    }

    // Authentication filter
    if ($authenticated !== '' && $authenticated !== 'all') {
        if ($authenticated === 'true' || $authenticated === '1') {
            $filterSql .= ' AND pm.is_authenticated = TRUE';
        } elseif ($authenticated === 'false' || $authenticated === '0') {
            $filterSql .= ' AND pm.is_authenticated = FALSE';
        }
    }

    // Determine GROUP BY field based on groupBy parameter
    $groupByField = 'pm.link_url';
    $groupByLabel = 'link_url';
    $selectGroupBy = 'pm.link_url';
    
    switch ($groupBy) {
        case 'username':
            $groupByField = 'pm.username';
            $groupByLabel = 'username';
            $selectGroupBy = 'COALESCE(pm.username, \'Unknown\') as username';
            break;
        case 'ip':
            $groupByField = 'pm.ip_address';
            $groupByLabel = 'ip_address';
            $selectGroupBy = 'CAST(pm.ip_address AS TEXT) as ip_address';
            break;
        case 'country':
            $groupByField = 'pm.country_code, pm.country_name';
            $groupByLabel = 'country_name';
            $selectGroupBy = 'pm.country_code, pm.country_name';
            break;
        case 'region':
            $groupByField = 'pm.country_code, pm.country_name, pm.region_name';
            $groupByLabel = 'region_name';
            $selectGroupBy = 'pm.country_code, pm.country_name, pm.region_name';
            break;
        case 'city':
            $groupByField = 'pm.country_code, pm.country_name, pm.region_name, pm.city_name';
            $groupByLabel = 'city_name';
            $selectGroupBy = 'pm.country_code, pm.country_name, pm.region_name, pm.city_name';
            break;
        default: // 'url'
            $groupByField = 'pm.link_url';
            $groupByLabel = 'link_url';
            $selectGroupBy = 'pm.link_url';
            break;
    }

    // If URL not provided and grouping by URL, return series for top N URLs
    $topNFilter = '';
    if ($url === '' && $groupBy === 'url') {
        $topNFilter = "
            AND pm.link_url IN (
                SELECT link_url
                FROM performance_metrics
                WHERE time BETWEEN :start AND :end
                  AND measurement_type = :measurement_type
                  AND link_url IS NOT NULL
                  AND link_url <> ''
                GROUP BY link_url
                ORDER BY COUNT(*) DESC
                LIMIT {$limitUrls}
            )
        ";
    }

    // Metric expression
    $metricExpr = match ($metric) {
        'avg' => 'AVG(pm.full_response_time)',
        'p50' => 'PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY pm.full_response_time)',
        'p95' => 'PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY pm.full_response_time)',
        'p99' => 'PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY pm.full_response_time)',
        'min' => 'MIN(pm.full_response_time)',
        'max' => 'MAX(pm.full_response_time)',
        default => 'PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY pm.full_response_time)',
    };

    $sql = "
        SELECT
            time_bucket(INTERVAL '{$bucketInterval}', pm.time) AS timestamp,
            {$selectGroupBy},
            CAST(ROUND(($metricExpr)::numeric, 0) AS INTEGER) AS value,
            COUNT(*) AS measurement_count
        FROM performance_metrics pm
        WHERE pm.time BETWEEN :start AND :end
          AND pm.measurement_type = :measurement_type
          {$filterSql}
          {$topNFilter}
        GROUP BY timestamp, {$groupByField}
        ORDER BY timestamp ASC, {$groupByField} ASC
    ";

    $stmt = $db->prepare($sql);
    foreach ($params as $k => $v) {
        $stmt->bindValue($k, $v);
    }
    $stmt->execute();
    $results = $stmt->fetchAll();

    // Format results to include groupBy label
    $formattedResults = [];
    foreach ($results as $row) {
        $label = '';
        if ($groupBy === 'url') {
            $label = $row['link_url'] ?? 'Unknown';
        } elseif ($groupBy === 'username') {
            $label = $row['username'] ?? 'Unknown';
        } elseif ($groupBy === 'ip') {
            $label = $row['ip_address'] ?? 'Unknown';
        } elseif ($groupBy === 'country') {
            $label = $row['country_name'] ?? 'Unknown';
        } elseif ($groupBy === 'region') {
            $label = $row['region_name'] ?? ($row['country_name'] ?? 'Unknown');
        } elseif ($groupBy === 'city') {
            $label = $row['city_name'] ?? ($row['region_name'] ?? ($row['country_name'] ?? 'Unknown'));
        }
        
        $formattedResults[] = [
            'timestamp' => $row['timestamp'],
            'link_url' => $row['link_url'] ?? null,
            'username' => $row['username'] ?? null,
            'ip_address' => $row['ip_address'] ?? null,
            'country_name' => $row['country_name'] ?? null,
            'region_name' => $row['region_name'] ?? null,
            'city_name' => $row['city_name'] ?? null,
            'label' => $label,
            'value' => (int)$row['value'],
            'measurement_count' => (int)$row['measurement_count']
        ];
    }

    echo json_encode([
        'success' => true,
        'period' => $period,
        'metric' => $metric,
        'bucket' => $bucket,
        'groupBy' => $groupBy,
        'start' => $start,
        'end' => $end,
        'measurement_type' => $measurementType,
        'url' => $url !== '' ? $url : null,
        'data' => $formattedResults
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
