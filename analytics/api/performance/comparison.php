<?php
/**
 * Client vs Server Comparison API
 * Compares client-side and server-side measurements for URLs
 * 
 * GET /api/performance/comparison?period=24h
 */

require_once __DIR__ . '/../config_analytics.php';

// Handle OPTIONS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    handlePreflight();
}

// CORS headers
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

$period = $_GET['period'] ?? '24h';

$periodMap = [
    '1h' => '1 hour',
    '24h' => '24 hours',
    '7d' => '7 days',
    '30d' => '30 days'
];

$periodInterval = $periodMap[$period] ?? '24 hours';

try {
    $db = getAnalyticsPDO();
    
    // Get comparison data from summary table
    $stmt = $db->query("
        SELECT 
            link_url,
            client_avg_latency,
            server_avg_latency,
            latency_delta,
            performance_ratio,
            health_status,
            client_measurement_count,
            server_measurement_count,
            client_country_code,
            client_region_name,
            last_client_check,
            last_server_check
        FROM link_latency_summary
        WHERE 
            client_avg_latency IS NOT NULL 
            AND server_avg_latency IS NOT NULL
        ORDER BY latency_delta DESC
        LIMIT 100
    ");
    
    $results = $stmt->fetchAll();
    
    // Calculate statistics
    $avgClientLatency = array_sum(array_column($results, 'client_avg_latency')) / max(count($results), 1);
    $avgServerLatency = array_sum(array_column($results, 'server_avg_latency')) / max(count($results), 1);
    $avgDelta = $avgClientLatency - $avgServerLatency;
    
    echo json_encode([
        'period' => $period,
        'total_urls' => count($results),
        'summary' => [
            'avg_client_latency' => round($avgClientLatency),
            'avg_server_latency' => round($avgServerLatency),
            'avg_delta' => round($avgDelta),
            'avg_ratio' => round($avgClientLatency / max($avgServerLatency, 1), 2)
        ],
        'comparisons' => $results
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
