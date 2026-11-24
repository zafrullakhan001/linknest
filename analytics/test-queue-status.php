<?php
/**
 * Test queue status API
 */

$_SERVER['REQUEST_METHOD'] = 'GET';

ob_start();
require __DIR__ . '/api/metrics/queue-status.php';
$output = ob_get_clean();

echo "API Response:\n";
echo $output;
echo "\n\n";

$data = json_decode($output, true);
if ($data && isset($data['success'])) {
    echo "✓ API is working!\n\n";
    echo "Queue Status: {$data['queue']['status']}\n";
    echo "Total Items: {$data['queue']['total_items']}\n";
    echo "Pending: {$data['queue']['pending']}\n";
    echo "Processed: {$data['queue']['processed']}\n";
    echo "Processing Rate: {$data['processing']['rate_per_minute']} items/min\n";
    echo "Total Metrics: {$data['metrics']['total']}\n";
    echo "Unique URLs: {$data['metrics']['unique_urls']}\n";
    echo "Countries: {$data['metrics']['countries']}\n";
} else {
    echo "✗ Failed to parse response\n";
}
