<?php
/**
 * URLs List API
 * Returns list of unique URLs with metrics
 * 
 * GET /api/performance/urls?period=24h&type=client
 */

require_once __DIR__ . '/../config_analytics.php';

// Handle OPTIONS preflight
handlePreflight();

// CORS headers
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

$period = $_GET['period'] ?? '24h';
$measurementType = $_GET['type'] ?? 'client';

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
    
    $sql = "
        SELECT 
            link_url,
            COUNT(*) as measurement_count,
            CAST(ROUND(AVG(full_response_time)::numeric, 0) AS INTEGER) as avg_latency,
            MIN(time) as first_seen,
            MAX(time) as last_seen
        FROM performance_metrics
        WHERE 
            time >= NOW() - INTERVAL '{$periodInterval}'
            AND measurement_type = :measurement_type
            AND link_url IS NOT NULL
            AND link_url != ''
        GROUP BY link_url
        ORDER BY measurement_count DESC, link_url ASC
    ";
    
    $stmt = $db->prepare($sql);
    $stmt->bindValue(':measurement_type', $measurementType);
    $stmt->execute();
    
    $results = $stmt->fetchAll();
    
    echo json_encode([
        'success' => true,
        'period' => $period,
        'measurement_type' => $measurementType,
        'total_urls' => count($results),
        'urls' => $results
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
