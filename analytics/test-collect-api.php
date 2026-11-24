<?php
/**
 * Test the metrics collection API endpoint
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "=== Testing Metrics Collection API ===\n\n";

// Simulate a POST request
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
$_SERVER['HTTP_USER_AGENT'] = 'Test Script';

// Sample metric data
$testData = [
    'url' => 'https://example.com',
    'measurement_type' => 'client',
    'full_response_time' => 150,
    'dns_lookup_time' => 10,
    'tcp_connection_time' => 20,
    'tls_handshake_time' => 30,
    'time_to_first_byte' => 50,
    'download_time' => 40,
    'http_status_code' => 200,
    'user_id' => 1,
    'session_id' => 'test-session',
    'device_type' => 'desktop',
    'browser_name' => 'Chrome',
    'browser_version' => '120',
    'os_name' => 'Windows',
    'screen_resolution' => '1920x1080',
    'connection_type' => 'wifi'
];

// Simulate php://input
$jsonData = json_encode($testData);
file_put_contents('php://temp', $jsonData);

echo "Test data:\n";
print_r($testData);
echo "\n";

// Try to include the collect endpoint
try {
    require_once __DIR__ . '/api/config_analytics.php';
    
    echo "✓ Config loaded\n";
    
    // Test database connection
    try {
        $pdo = getAnalyticsPDO();
        echo "✓ Database connection successful\n";
        
        // Test the INSERT query
        $payload = [
            'link_url' => $testData['url'],
            'measurement_type' => $testData['measurement_type'],
            'user_id' => $testData['user_id'],
            'session_id' => $testData['session_id'],
            'ip_address' => '127.0.0.1',
            'full_response_time' => $testData['full_response_time'],
            'dns_lookup_time' => $testData['dns_lookup_time'],
            'tcp_connection_time' => $testData['tcp_connection_time'],
            'tls_handshake_time' => $testData['tls_handshake_time'],
            'time_to_first_byte' => $testData['time_to_first_byte'],
            'download_time' => $testData['download_time'],
            'http_status_code' => $testData['http_status_code'],
            'user_agent' => 'Test',
            'device_type' => $testData['device_type'],
            'browser_name' => $testData['browser_name'],
            'browser_version' => $testData['browser_version'],
            'os_name' => $testData['os_name'],
            'screen_resolution' => $testData['screen_resolution'],
            'connection_type' => $testData['connection_type'],
            'is_authenticated' => !empty($testData['user_id'])
        ];
        
        echo "\nTesting INSERT query...\n";
        $stmt = $pdo->prepare("
            INSERT INTO metrics_queue (payload) 
            VALUES (:payload::jsonb)
        ");
        
        $stmt->execute([
            'payload' => json_encode($payload)
        ]);
        
        echo "✓ INSERT successful\n";
        
        // Test NOTIFY
        $pdo->exec("NOTIFY metrics_inserted");
        echo "✓ NOTIFY successful\n";
        
    } catch (PDOException $e) {
        echo "✗ Database error: " . $e->getMessage() . "\n";
        echo "SQL State: " . $e->getCode() . "\n";
    } catch (Exception $e) {
        echo "✗ Error: " . $e->getMessage() . "\n";
    }
    
} catch (Exception $e) {
    echo "✗ Failed to load config: " . $e->getMessage() . "\n";
    echo "Stack trace:\n" . $e->getTraceAsString() . "\n";
}
