<?php
/**
 * Regions Performance API
 * Returns aggregated performance data by geographic region
 * 
 * GET /api/performance/regions?url=&period=24h&granularity=region
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
$period = $_GET['period'] ?? '24h';
$granularity = $_GET['granularity'] ?? 'region';

// Map period to SQL interval
$periodMap = [
    '1h' => '1 hour',
    '24h' => '24 hours',
    '7d' => '7 days',
    '30d' => '30 days'
];

$periodInterval = $periodMap[$period] ?? '24 hours';

try {
    $db = getAnalyticsPDO();
    
    // Use the pre-computed continuous aggregate for faster queries
    $groupBy = $granularity === 'country' 
        ? 'country_code, country_name' 
        : 'country_code, country_name, region_name';
    
    $sql = "
        SELECT 
            country_code,
            country_name,
            " . ($granularity !== 'country' ? 'region_name,' : '') . "
            region_center_lat as latitude,
            region_center_lon as longitude,
            measurement_type,
            SUM(measurement_count) as total_measurements,
            SUM(unique_users) as total_users,
            ROUND(AVG(avg_latency)) as avg_latency,
            ROUND(AVG(p50_latency)) as p50,
            ROUND(AVG(p95_latency)) as p95,
            ROUND(AVG(p99_latency)) as p99,
            MIN(min_latency) as min_latency,
            MAX(max_latency) as max_latency,
            ROUND(AVG(success_rate_pct), 1) as success_rate
        FROM performance_by_region_hourly
        WHERE bucket >= NOW() - INTERVAL '{$periodInterval}'
    ";
    
    if ($url) {
        $sql .= " AND link_url = :url";
    }
    
    $sql .= " GROUP BY {$groupBy}, measurement_type, region_center_lat, region_center_lon
              HAVING SUM(measurement_count) >= 5
              ORDER BY avg_latency DESC";
    
    $stmt = $db->prepare($sql);
    
    if ($url) {
        $stmt->bindValue(':url', $url);
    }
    
    $stmt->execute();
    $results = $stmt->fetchAll();
    
    echo json_encode([
        'url' => $url,
        'period' => $period,
        'granularity' => $granularity,
        'total_regions' => count($results),
        'data' => $results
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
