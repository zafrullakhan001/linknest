<?php
/**
 * Performance Alerts API
 * Returns current performance violations based on thresholds
 * 
 * GET /api/performance/alerts
 */

require_once __DIR__ . '/../config_analytics.php';

// Handle OPTIONS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    handlePreflight();
}

// CORS headers
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

try {
    $db = getAnalyticsPDO();
    
    // Get current performance alerts from the view
    $stmt = $db->query("
        SELECT 
            time_period,
            link_url,
            country_name,
            region_name,
            measurement_type,
            avg_latency,
            p95_latency,
            avg_ttfb,
            threshold_avg,
            threshold_p95,
            threshold_ttfb,
            avg_exceeded,
            p95_exceeded,
            ttfb_exceeded,
            severity
        FROM performance_alerts
        ORDER BY 
            CASE severity 
                WHEN 'critical' THEN 1 
                WHEN 'warning' THEN 2 
                ELSE 3 
            END,
            time_period DESC
        LIMIT 100
    ");
    
    $alerts = $stmt->fetchAll();
    
    // Count by severity
    $critical = count(array_filter($alerts, fn($a) => $a['severity'] === 'critical'));
    $warnings = count(array_filter($alerts, fn($a) => $a['severity'] === 'warning'));
    
    echo json_encode([
        'total' => count($alerts),
        'critical' => $critical,
        'warnings' => $warnings,
        'alerts' => $alerts
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
