<?php
/**
 * Time-Series Performance API
 * Returns performance metrics over time for charting
 * 
 * GET /api/performance/timeseries?url=&region=&metric=p95&start=&end=
 */

require_once __DIR__ . '/../config_analytics.php';

// Handle OPTIONS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    handlePreflight();
}

// CORS headers
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

$url = $_GET['url'] ?? null;
$region = $_GET['region'] ?? null; // country_code or "country_code/region_name"
$metric = $_GET['metric'] ?? 'p95'; // avg, p50, p95, p99, min, max
$start = $_GET['start'] ?? date('Y-m-d H:i:s', strtotime('-24 hours'));
$end = $_GET['end'] ?? date('Y-m-d H:i:s');
$measurementType = $_GET['type'] ?? 'client';

// Validate metric
$validMetrics = ['avg_latency', 'p50_latency', 'p95_latency', 'p99_latency', 'min_latency', 'max_latency'];
if (!in_array($metric . '_latency', $validMetrics) && !in_array($metric, ['avg', 'p50', 'p95', 'p99', 'min', 'max'])) {
    $metric = 'p95';
}

$metricColumn = in_array($metric, ['avg', 'p50', 'p95', 'p99', 'min', 'max']) 
    ? $metric . '_latency' 
    : $metric;

try {
    $db = getAnalyticsPDO();
    
    $sql = "
        SELECT 
            bucket as timestamp,
            {$metricColumn} as value,
            measurement_count
        FROM performance_by_region_hourly
        WHERE bucket BETWEEN :start AND :end
        AND measurement_type = :measurement_type
    ";
    
    if ($url) {
        $sql .= " AND link_url = :url";
    }
    
    if ($region) {
        // Parse region (format: "US" or "US/California")
        $parts = explode('/', $region);
        $sql .= " AND country_code = :country_code";
        if (count($parts) > 1) {
            $sql .= " AND region_name = :region_name";
        }
    }
    
    $sql .= " ORDER BY bucket ASC";
    
    $stmt = $db->prepare($sql);
    $stmt->bindValue(':start', $start);
    $stmt->bindValue(':end', $end);
    $stmt->bindValue(':measurement_type', $measurementType);
    
    if ($url) {
        $stmt->bindValue(':url', $url);
    }
    
    if ($region) {
        $parts = explode('/', $region);
        $stmt->bindValue(':country_code', $parts[0]);
        if (count($parts) > 1) {
            $stmt->bindValue(':region_name', $parts[1]);
        }
    }
    
    $stmt->execute();
    $results = $stmt->fetchAll();
    
    echo json_encode([
        'url' => $url,
        'region' => $region,
        'metric' => $metric,
        'start' => $start,
        'end' => $end,
        'data' => $results
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
