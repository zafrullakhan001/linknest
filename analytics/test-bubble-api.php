<?php
/**
 * Test bubble chart API
 */

$_GET['period'] = '24h';
$_GET['granularity'] = 'region';
$_GET['type'] = 'client';
$_SERVER['REQUEST_METHOD'] = 'GET';

// Capture output
ob_start();

try {
    require __DIR__ . '/api/performance/bubble-chart.php';
    $output = ob_get_clean();
    
    echo "API Output:\n";
    echo $output;
    
    $data = json_decode($output, true);
    if ($data) {
        echo "\n\nParsed successfully!\n";
        echo "Data points: " . count($data['data'] ?? []) . "\n";
    } else {
        echo "\n\nFailed to parse JSON\n";
    }
} catch (Exception $e) {
    $output = ob_get_clean();
    echo "Error: " . $e->getMessage() . "\n";
    echo "Output: $output\n";
}
