<?php
/**
 * Test worker processing logic
 */

require_once __DIR__ . '/api/config_analytics.php';
require_once __DIR__ . '/geoip/geoip.php';

echo "=== Testing Worker Processing ===\n\n";

try {
    $db = getAnalyticsPDO();
    echo "✓ Connected to analytics database\n\n";
    
    // Fetch one unprocessed metric
    $stmt = $db->query("
        SELECT id, payload 
        FROM metrics_queue 
        WHERE processed = FALSE 
        LIMIT 1
    ");
    
    $item = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$item) {
        echo "No unprocessed metrics found. Creating a test metric...\n";
        
        // Insert a test metric
        $testPayload = [
            'link_url' => 'https://test-worker.com',
            'measurement_type' => 'client',
            'user_id' => 1,
            'session_id' => 'test-' . time(),
            'ip_address' => '8.8.8.8',
            'full_response_time' => 150,
            'dns_lookup_time' => 15,
            'tcp_connection_time' => 20,
            'tls_handshake_time' => 25,
            'time_to_first_byte' => 75,
            'download_time' => 40,
            'http_status_code' => 200,
            'user_agent' => 'Test Agent',
            'device_type' => 'desktop',
            'browser_name' => 'Chrome',
            'browser_version' => '120.0',
            'os_name' => 'Windows',
            'screen_resolution' => '1920x1080',
            'connection_type' => '4g',
            'is_authenticated' => true
        ];
        
        $db->prepare("INSERT INTO metrics_queue (payload) VALUES (?::jsonb)")
           ->execute([json_encode($testPayload)]);
        
        echo "Test metric inserted. Fetching it...\n";
        
        $stmt = $db->query("
            SELECT id, payload 
            FROM metrics_queue 
            WHERE processed = FALSE 
            LIMIT 1
        ");
        $item = $stmt->fetch(PDO::FETCH_ASSOC);
    }
    
    if (!$item) {
        die("ERROR: Could not fetch metric\n");
    }
    
    echo "Processing metric ID: {$item['id']}\n";
    $payload = json_decode($item['payload'], true);
    
    echo "Payload:\n";
    print_r($payload);
    echo "\n";
    
    // Get geolocation
    $ipAddress = $payload['ip_address'] ?? '8.8.8.8';
    echo "Looking up geolocation for IP: $ipAddress\n";
    $geo = getGeoFromIP($ipAddress);
    
    echo "Geolocation result:\n";
    print_r($geo);
    echo "\n";
    
    // Prepare insert statement
    echo "Preparing insert into performance_metrics...\n";
    
    $insertStmt = $db->prepare("
        INSERT INTO performance_metrics (
            time, link_url, measurement_type, user_id, session_id,
            country_code, country_name, region_name, city_name,
            latitude, longitude, timezone, isp,
            full_response_time, dns_lookup_time, tcp_connection_time,
            tls_handshake_time, time_to_first_byte,
            http_status_code, device_type, browser_name,
            browser_version, os_name, screen_resolution, connection_type,
            is_authenticated
        ) VALUES (
            NOW(), :link_url, :measurement_type, :user_id, :session_id,
            :country_code, :country_name, :region_name, :city_name,
            :latitude, :longitude, :timezone, :isp,
            :full_response_time, :dns_lookup_time, :tcp_connection_time,
            :tls_handshake_time, :time_to_first_byte,
            :http_status_code, :device_type, :browser_name,
            :browser_version, :os_name, :screen_resolution, :connection_type,
            :is_authenticated
        )
    ");
    
    $insertData = [
        'link_url' => $payload['link_url'],
        'measurement_type' => $payload['measurement_type'],
        'user_id' => $payload['user_id'],
        'session_id' => $payload['session_id'],
        'country_code' => $geo['country_code'],
        'country_name' => $geo['country_name'],
        'region_name' => $geo['region_name'],
        'city_name' => $geo['city_name'],
        'latitude' => $geo['latitude'],
        'longitude' => $geo['longitude'],
        'timezone' => $geo['timezone'],
        'isp' => $geo['isp'],
        'full_response_time' => $payload['full_response_time'],
        'dns_lookup_time' => $payload['dns_lookup_time'] ?? 0,
        'tcp_connection_time' => $payload['tcp_connection_time'] ?? 0,
        'tls_handshake_time' => $payload['tls_handshake_time'] ?? 0,
        'time_to_first_byte' => $payload['time_to_first_byte'] ?? 0,
        'http_status_code' => $payload['http_status_code'] ?? 200,
        'device_type' => $payload['device_type'] ?? 'unknown',
        'browser_name' => $payload['browser_name'] ?? '',
        'browser_version' => $payload['browser_version'] ?? '',
        'os_name' => $payload['os_name'] ?? '',
        'screen_resolution' => $payload['screen_resolution'] ?? '',
        'connection_type' => $payload['connection_type'] ?? '',
        'is_authenticated' => $payload['is_authenticated'] ?? false
    ];
    
    echo "Executing insert...\n";
    $insertStmt->execute($insertData);
    
    echo "✓ Insert successful!\n\n";
    
    // Mark as processed
    $db->prepare("UPDATE metrics_queue SET processed = TRUE, processed_at = NOW() WHERE id = ?")
       ->execute([$item['id']]);
    
    echo "✓ Marked as processed\n\n";
    
    // Verify insert
    $count = $db->query("SELECT COUNT(*) FROM performance_metrics")->fetchColumn();
    echo "Total metrics in performance_metrics table: $count\n";
    
    echo "\n✓ SUCCESS! Worker processing is working correctly.\n";
    
} catch (Exception $e) {
    echo "\n✗ ERROR: " . $e->getMessage() . "\n";
    echo "Stack trace:\n" . $e->getTraceAsString() . "\n";
}
