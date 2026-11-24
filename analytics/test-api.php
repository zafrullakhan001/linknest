<?php
// Quick test of the metrics collection API

$url = 'http://localhost:9333/api/metrics/collect';

$data = [
    'url' => 'https://test.com',
    'measurement_type' => 'client',
    'full_response_time' => 100,
    'dns_lookup_time' => 10,
    'tcp_connection_time' => 15,
    'tls_handshake_time' => 20,
    'time_to_first_byte' => 50,
    'download_time' => 30,
    'http_status_code' => 200,
    'device_type' => 'desktop',
    'browser_name' => 'Chrome',
    'browser_version' => '120.0',
    'os_name' => 'Windows',
    'screen_resolution' => '1920x1080',
    'connection_type' => '4g',
    'user_id' => 1,
    'session_id' => 'test-' . time()
];

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

echo "HTTP Code: $httpCode\n";
echo "Response: $response\n";

$result = json_decode($response, true);
if ($result && isset($result['success'])) {
    echo "\n✓ SUCCESS! Metric collected.\n";
} else {
    echo "\n✗ FAILED\n";
    if (isset($result['error'])) {
        echo "Error: " . $result['error'] . "\n";
        if (isset($result['details'])) {
            echo "Details: " . $result['details'] . "\n";
        }
    }
}
