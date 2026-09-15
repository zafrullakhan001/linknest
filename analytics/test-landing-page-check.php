<?php
/**
 * Check if landing page includes analytics scripts
 */

echo "=== Checking Landing Page ===\n\n";

$url = 'http://localhost/linknest/';

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
$html = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode !== 200) {
    echo "✗ Failed to load landing page (HTTP $httpCode)\n";
    exit(1);
}

echo "✓ Landing page loaded (HTTP $httpCode)\n\n";

// Check for analytics config
if (strpos($html, 'ANALYTICS_CONFIG') !== false) {
    echo "✓ ANALYTICS_CONFIG found in page\n";
    
    // Extract config
    if (preg_match('/window\.ANALYTICS_CONFIG\s*=\s*({[^}]+})/s', $html, $matches)) {
        echo "  Config snippet: " . substr($matches[1], 0, 100) . "...\n";
    }
} else {
    echo "✗ ANALYTICS_CONFIG NOT found in page\n";
}

// Check for script tags
$scripts = [
    'performance-beacon.js',
    'link-latency-scanner.js'
];

echo "\nChecking for script tags:\n";
foreach ($scripts as $script) {
    if (strpos($html, $script) !== false) {
        echo "  ✓ $script found\n";
        
        // Try to extract the path
        if (preg_match('/<script[^>]*src=["\']([^"\']*' . preg_quote($script, '/') . ')["\']/', $html, $matches)) {
            echo "    Path: {$matches[1]}\n";
        }
    } else {
        echo "  ✗ $script NOT found\n";
    }
}

// Check if analytics is enabled
if (strpos($html, 'isPerformanceAnalyticsEnabled') !== false) {
    echo "\n✓ Analytics check function found\n";
} else {
    echo "\n⚠ Analytics check function not found\n";
}

echo "\n=== Summary ===\n";
echo "If scripts are missing, check:\n";
echo "  1. Is addon enabled in Admin Panel?\n";
echo "  2. Does isPerformanceAnalyticsEnabled() return true?\n";
echo "  3. Check landing.php around line 121\n";
