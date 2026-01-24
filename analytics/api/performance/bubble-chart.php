<?php
/**
 * Bubble Chart Data API
 * Returns regional performance data for bubble chart visualization
 * 
 * GET /api/performance/bubble-chart?url=&period=24h&granularity=region
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
$granularity = $_GET['granularity'] ?? 'region'; // country, region, city, or url
$measurementType = $_GET['type'] ?? 'client'; // client or server

// Map period to SQL interval
$periodMap = [
    '1h' => '1 hour',
    '24h' => '24 hours',
    '7d' => '7 days',
    '30d' => '30 days'
];

$periodInterval = $periodMap[$period] ?? '24 hours';

// Map granularity to GROUP BY clause
$groupByFields = [
    'url' => 'link_url',
    'country' => 'country_code, country_name',
    'region' => 'country_code, country_name, region_name',
    'city' => 'country_code, country_name, region_name, city_name'
];

$groupBy = $groupByFields[$granularity] ?? $groupByFields['region'];

// Select fields based on granularity
if ($granularity === 'url') {
    // For URL view, aggregate geographic data (use most common location)
    $selectFields = 'link_url';
    $selectFields .= ", MODE() WITHIN GROUP (ORDER BY country_code) as country_code";
    $selectFields .= ", MODE() WITHIN GROUP (ORDER BY country_name) as country_name";
    $selectFields .= ", MODE() WITHIN GROUP (ORDER BY region_name) as region_name";
    $selectFields .= ", MODE() WITHIN GROUP (ORDER BY city_name) as city_name";
} else {
    $selectFields = 'country_code, country_name';
    if ($granularity !== 'country') {
        $selectFields .= ', region_name';
    }
    if ($granularity === 'city') {
        $selectFields .= ', city_name';
    }
}

try {
    $db = getAnalyticsPDO();
    
    // Query for regional aggregation
    $sql = "
        SELECT 
            {$selectFields},
            
            -- Bubble positioning (average of all user coordinates in region)
            -- Ignore 0,0 placeholders so we don't average into (0,0)
            ROUND(AVG(NULLIF(latitude, 0))::numeric, 4) as latitude,
            ROUND(AVG(NULLIF(longitude, 0))::numeric, 4) as longitude,
            
            -- Performance metrics
            CAST(ROUND(AVG(full_response_time)::numeric, 0) AS INTEGER) as avg_latency,
            CAST(ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY full_response_time)::numeric, 0) AS INTEGER) as p50,
            CAST(ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY full_response_time)::numeric, 0) AS INTEGER) as p95,
            CAST(ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY full_response_time)::numeric, 0) AS INTEGER) as p99,
            MIN(full_response_time) as min_latency,
            MAX(full_response_time) as max_latency,
            
            -- Volume (bubble size)
            COUNT(*) as measurement_count,
            COUNT(DISTINCT user_id) as user_count,
            COUNT(DISTINCT session_id) as session_count,
            
            -- Success rate
            COUNT(*) FILTER (WHERE http_status_code >= 200 AND http_status_code < 400) as successful_requests,
            CAST(ROUND(
                (COUNT(*) FILTER (WHERE http_status_code >= 200 AND http_status_code < 400)::numeric / 
                NULLIF(COUNT(*), 0) * 100)::numeric, 
                1
            ) AS numeric) as success_rate_pct,
            
            -- Health indicator
            CASE 
                WHEN AVG(full_response_time) < 100 THEN 'excellent'
                WHEN AVG(full_response_time) < 300 THEN 'good'
                WHEN AVG(full_response_time) < 1000 THEN 'degraded'
                ELSE 'poor'
            END as status
            
        FROM performance_metrics
        WHERE 
            time >= NOW() - INTERVAL '{$periodInterval}'
            AND measurement_type = :measurement_type
    ";
    
    // Add URL filter if provided
    if ($url) {
        $sql .= " AND link_url = :url";
    }
    
    $sql .= "
        GROUP BY {$groupBy}
        HAVING COUNT(*) >= 1
        ORDER BY avg_latency DESC
        LIMIT 50
    ";
    
    $stmt = $db->prepare($sql);
    $stmt->bindValue(':measurement_type', $measurementType);
    
    if ($url) {
        $stmt->bindValue(':url', $url);
    }
    
    $stmt->execute();
    $results = $stmt->fetchAll();
    
    // Format response
    echo json_encode([
        'url' => $url,
        'period' => $period,
        'granularity' => $granularity,
        'measurement_type' => $measurementType,
        'total_regions' => count($results),
        'data' => $results
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
