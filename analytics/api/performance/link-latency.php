<?php
/**
 * Link Latency API
 * Returns summary latency data for a specific URL
 * 
 * GET /api/performance/link-latency?url=...
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

if (!$url) {
    http_response_code(400);
    echo json_encode(['error' => 'URL parameter required']);
    exit;
}

try {
    $db = getAnalyticsPDO();
    
    // Get summary data for this URL
    $stmt = $db->prepare("
        SELECT 
            link_url,
            last_client_check,
            last_server_check,
            client_avg_latency,
            client_p50_latency,
            client_p95_latency,
            client_p99_latency,
            client_measurement_count,
            server_avg_latency,
            server_p50_latency,
            server_p95_latency,
            server_measurement_count,
            latency_delta,
            performance_ratio,
            health_status,
            client_country_code,
            client_region_name,
            client_city_name
        FROM link_latency_summary
        WHERE link_url = ?
        LIMIT 1
    ");
    
    $stmt->execute([$url]);
    $summary = $stmt->fetch();
    
    if (!$summary) {
        echo json_encode([
            'url' => $url,
            'client_avg_latency' => null,
            'server_avg_latency' => null,
            'message' => 'No data yet'
        ]);
        exit;
    }
    
    echo json_encode($summary);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
