<?php
/**
 * Test actual landing page rendering
 */

echo "=== Testing Landing Page Rendering ===\n\n";

// Capture landing page output
ob_start();

// Simulate request
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['HTTP_HOST'] = 'localhost';
$_SERVER['SCRIPT_NAME'] = '/linknest/landing.php';
$_SERVER['DOCUMENT_ROOT'] = 'C:/xampp/htdocs';

// Start session if not started
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

try {
    // Include landing page
    include __DIR__ . '/../landing.php';
    $output = ob_get_clean();
    
    echo "✓ Landing page rendered\n";
    echo "Output length: " . strlen($output) . " bytes\n\n";
    
    // Check for analytics config
    if (strpos($output, 'ANALYTICS_CONFIG') !== false) {
        echo "✓ ANALYTICS_CONFIG found in output\n";
    } else {
        echo "✗ ANALYTICS_CONFIG NOT found in output\n";
    }
    
    // Check for scripts
    $scripts = ['performance-beacon.js', 'link-latency-scanner.js'];
    foreach ($scripts as $script) {
        if (strpos($output, $script) !== false) {
            echo "✓ $script found in output\n";
        } else {
            echo "✗ $script NOT found in output\n";
        }
    }
    
    // Check if condition was evaluated
    if (strpos($output, 'isPerformanceAnalyticsEnabled') !== false) {
        echo "\n⚠ Function name found in output (might be in comments)\n";
    }
    
    // Extract script tags
    if (preg_match_all('/<script[^>]*src=["\']([^"\']+)["\']/', $output, $matches)) {
        echo "\nScript tags found:\n";
        foreach ($matches[1] as $src) {
            echo "  - $src\n";
        }
    }
    
} catch (Exception $e) {
    ob_end_clean();
    echo "✗ Error rendering: " . $e->getMessage() . "\n";
    echo "Stack trace:\n" . $e->getTraceAsString() . "\n";
}
