<?php
/**
 * Test the complete collection flow:
 * 1. Send test metrics to collection API
 * 2. Check if they're in the queue
 * 3. Check if processor processes them
 * 4. Check if they appear in performance_metrics table
 */

require_once __DIR__ . '/api/config_analytics.php';

echo "=== Testing Complete Collection Flow ===\n\n";

// Test URLs
$testUrls = [
    'https://google.com',
    'https://github.com',
    'https://stackoverflow.com',
    'https://example.com'
];

echo "Step 1: Sending test metrics to collection API...\n";
$sentCount = 0;

foreach ($testUrls as $url) {
    $metric = [
        'url' => $url,
        'measurement_type' => 'client',
        'full_response_time' => rand(50, 300),
        'dns_lookup_time' => rand(5, 20),
        'tcp_connection_time' => rand(10, 30),
        'tls_handshake_time' => rand(15, 50),
        'time_to_first_byte' => rand(40, 150),
        'download_time' => 0,
        'http_status_code' => 200,
        'device_type' => 'desktop',
        'browser_name' => 'Chrome',
        'browser_version' => '120',
        'os_name' => 'Windows',
        'screen_resolution' => '1920x1080',
        'connection_type' => '4g',
        'user_id' => 1,
        'session_id' => 'test-' . time()
    ];
    
    // Send via HTTP
    $ch = curl_init('http://localhost:9333/api/metrics/collect');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($metric));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode === 200) {
        $result = json_decode($response, true);
        if ($result && isset($result['success'])) {
            echo "  ✓ Sent: $url\n";
            $sentCount++;
        } else {
            echo "  ✗ Failed: $url - " . ($result['error'] ?? 'Unknown') . "\n";
        }
    } else {
        echo "  ✗ HTTP Error $httpCode: $url\n";
    }
    
    usleep(100000); // 100ms delay
}

echo "\nStep 2: Checking metrics queue...\n";
try {
    $pdo = getAnalyticsPDO();
    
    $stmt = $pdo->query("
        SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE processed = FALSE) as pending,
            COUNT(*) FILTER (WHERE processed = TRUE) as processed
        FROM metrics_queue
    ");
    $queueStats = $stmt->fetch(PDO::FETCH_ASSOC);
    
    echo "  Total in queue: {$queueStats['total']}\n";
    echo "  Pending: {$queueStats['pending']}\n";
    echo "  Processed: {$queueStats['processed']}\n";
    
    // Check recent unprocessed items
    $stmt = $pdo->query("
        SELECT id, payload->>'link_url' as url, created_at
        FROM metrics_queue
        WHERE processed = FALSE
        ORDER BY created_at DESC
        LIMIT 5
    ");
    $pending = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (count($pending) > 0) {
        echo "\n  Recent pending items:\n";
        foreach ($pending as $item) {
            echo "    - {$item['url']} (ID: {$item['id']}, Created: {$item['created_at']})\n";
        }
    }
    
} catch (Exception $e) {
    echo "  ✗ Error checking queue: " . $e->getMessage() . "\n";
}

echo "\nStep 3: Checking performance_metrics table...\n";
try {
    $stmt = $pdo->query("
        SELECT 
            COUNT(*) as total,
            COUNT(DISTINCT link_url) as unique_urls,
            MAX(time) as latest_metric
        FROM performance_metrics
        WHERE measurement_type = 'client'
    ");
    $metricsStats = $stmt->fetch(PDO::FETCH_ASSOC);
    
    echo "  Total client metrics: {$metricsStats['total']}\n";
    echo "  Unique URLs: {$metricsStats['unique_urls']}\n";
    echo "  Latest metric: {$metricsStats['latest_metric']}\n";
    
    // Check recent metrics
    $stmt = $pdo->query("
        SELECT link_url, full_response_time, time, country_name
        FROM performance_metrics
        WHERE measurement_type = 'client'
        ORDER BY time DESC
        LIMIT 10
    ");
    $recent = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (count($recent) > 0) {
        echo "\n  Recent metrics:\n";
        foreach ($recent as $metric) {
            echo "    - {$metric['link_url']}: {$metric['full_response_time']}ms ({$metric['country_name']}) at {$metric['time']}\n";
        }
    } else {
        echo "  ⚠ No metrics found in performance_metrics table\n";
    }
    
} catch (Exception $e) {
    echo "  ✗ Error checking metrics: " . $e->getMessage() . "\n";
}

echo "\nStep 4: Testing collection API directly...\n";
$testMetric = [
    'url' => 'https://direct-test.com',
    'measurement_type' => 'client',
    'full_response_time' => 200,
    'dns_lookup_time' => 15,
    'tcp_connection_time' => 25,
    'tls_handshake_time' => 40,
    'time_to_first_byte' => 100,
    'download_time' => 0,
    'http_status_code' => 200,
    'device_type' => 'desktop',
    'browser_name' => 'Chrome',
    'browser_version' => '120',
    'os_name' => 'Windows',
    'screen_resolution' => '1920x1080',
    'connection_type' => '4g',
    'user_id' => 1,
    'session_id' => 'direct-test-' . time()
];

// Test via direct API call
$_SERVER['REQUEST_METHOD'] = 'POST';
$_POST = [];
file_put_contents('php://input', json_encode($testMetric));

ob_start();
try {
    require __DIR__ . '/api/metrics/collect.php';
    $output = ob_get_clean();
    $result = json_decode($output, true);
    
    if ($result && isset($result['success'])) {
        echo "  ✓ Direct API call successful\n";
        echo "  Response: " . $output . "\n";
    } else {
        echo "  ✗ Direct API call failed\n";
        echo "  Response: " . $output . "\n";
    }
} catch (Exception $e) {
    ob_end_clean();
    echo "  ✗ Direct API error: " . $e->getMessage() . "\n";
}

echo "\n=== Summary ===\n";
echo "Sent $sentCount metrics via HTTP\n";
echo "Check the queue and metrics tables above for results.\n";
echo "\nIf metrics are in queue but not in performance_metrics:\n";
echo "  - Processor might not be running\n";
echo "  - Run: php analytics/process-metrics-queue.php\n";
echo "\nIf metrics are not in queue:\n";
echo "  - Check collection API endpoint\n";
echo "  - Check CORS headers\n";
echo "  - Check PostgreSQL connection\n";
