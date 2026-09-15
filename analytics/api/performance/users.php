<?php
/**
 * User Geolocation API
 * Returns user login locations and activity patterns
 * 
 * GET /api/performance/users?start=&end=&limit=
 */

require_once __DIR__ . '/../config_analytics.php';

// Handle OPTIONS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    handlePreflight();
}

// CORS headers
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

$start = $_GET['start'] ?? date('Y-m-d H:i:s', strtotime('-7 days'));
$end = $_GET['end'] ?? date('Y-m-d H:i:s');
$limit = (int)($_GET['limit'] ?? 100);

try {
    $db = getAnalyticsPDO();
    
    // Get user geolocations
    $stmt = $db->prepare("
        SELECT 
            user_id,
            username,
            login_time,
            country_code,
            country_name,
            region_name,
            city_name,
            latitude,
            longitude,
            timezone,
            device_type,
            browser_name
        FROM user_geolocations
        WHERE login_time BETWEEN :start AND :end
        ORDER BY login_time DESC
        LIMIT :limit
    ");
    
    $stmt->bindValue(':start', $start);
    $stmt->bindValue(':end', $end);
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    
    $logins = $stmt->fetchAll();
    
    // Get aggregated stats
    $statsStmt = $db->prepare("
        SELECT 
            COUNT(DISTINCT user_id) as unique_users,
            COUNT(*) as total_logins,
            COUNT(DISTINCT country_code) as countries_count,
            COUNT(DISTINCT CONCAT(country_code, '/', region_name)) as regions_count
        FROM user_geolocations
        WHERE login_time BETWEEN :start AND :end
    ");
    
    $statsStmt->bindValue(':start', $start);
    $statsStmt->bindValue(':end', $end);
    $statsStmt->execute();
    $stats = $statsStmt->fetch();
    
    echo json_encode([
        'start' => $start,
        'end' => $end,
        'stats' => $stats,
        'logins' => $logins
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
