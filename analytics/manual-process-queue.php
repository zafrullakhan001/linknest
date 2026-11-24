<?php
/**
 * Manually process metrics queue to debug issues
 */

require_once __DIR__ . '/api/config_analytics.php';
require_once __DIR__ . '/geoip/geoip.php';

echo "=== Manual Queue Processing ===\n\n";

try {
    $db = getAnalyticsPDO();
    
    // Fetch all queue items
    $stmt = $db->query("SELECT id, payload, processed FROM metrics_queue ORDER BY id");
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo "Total items in queue: " . count($items) . "\n";
    echo "Processing each one...\n\n";
    
    $successCount = 0;
    $failCount = 0;
    
    foreach ($items as $item) {
        echo "Processing ID {$item['id']}... ";
        
        $payload = json_decode($item['payload'], true);
        
        if (!$payload || empty($payload['link_url'])) {
            echo "❌ Invalid payload\n";
            $failCount++;
            continue;
        }
        
        // Get geo if IP available
        $ip = $payload['ip_address'] ?? '';
        if ($ip) {
            $geo = getGeoFromIP($ip);
        } else {
            $geo = [
                'country_code' => 'XX',
                'country_name' => 'Unknown',
                'region_name' => 'Unknown',
                'city_name' => 'Unknown',
                'latitude' => 0.0,
                'longitude' => 0.0,
                'timezone' => 'UTC',
                'isp' => null
            ];
        }
        
        try {
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
            
            $insertStmt->execute([
                'link_url' => $payload['link_url'],
                'measurement_type' => $payload['measurement_type'] ?? 'client',
                'user_id' => $payload['user_id'] ?? null,
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
                'dns_lookup_time' => $payload['dns_lookup_time'] ?? null,
                'tcp_connection_time' => $payload['tcp_connection_time'] ?? null,
                'tls_handshake_time' => $payload['tls_handshake_time'] ?? null,
                'time_to_first_byte' => $payload['time_to_first_byte'] ?? null,
                'http_status_code' => $payload['http_status_code'] ?? 200,
                'device_type' => $payload['device_type'] ?? 'unknown',
                'browser_name' => $payload['browser_name'] ?? '',
                'browser_version' => $payload['browser_version'] ?? '',
                'os_name' => $payload['os_name'] ?? '',
                'screen_resolution' => $payload['screen_resolution'] ?? '',
                'connection_type' => $payload['connection_type'] ?? '',
                'is_authenticated' => !empty($payload['user_id'])
            ]);
            
            echo "✓ Success (URL: {$payload['link_url']}, {$geo['country_name']})\n";
            $successCount++;
            
        } catch (Exception $e) {
            echo "❌ Error: " . $e->getMessage() . "\n";
            $failCount++;
        }
    }
    
    echo "\n=== Summary ===\n";
    echo "Success: $successCount\n";
    echo "Failed: $failCount\n";
    
    // Check final count
    $count = $db->query("SELECT COUNT(*) FROM performance_metrics")->fetchColumn();
    echo "Total in performance_metrics: $count\n";
    
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}
