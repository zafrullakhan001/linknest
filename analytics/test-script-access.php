<?php
/**
 * Test if scripts are accessible from different paths
 */

echo "=== Testing Script Accessibility ===\n\n";

$basePaths = [
    '/linknest',
    '',
    '/'
];

$scripts = [
    'performance-beacon.js',
    'link-latency-scanner.js'
];

foreach ($scripts as $script) {
    echo "Testing: $script\n";
    echo str_repeat('-', 50) . "\n";
    
    foreach ($basePaths as $base) {
        $path = rtrim($base, '/') . '/public/js/' . $script;
        $fullPath = __DIR__ . '/..' . $path;
        $url = 'http://localhost' . $path;
        
        echo "Path: $path\n";
        echo "  File exists: " . (file_exists($fullPath) ? 'YES' : 'NO') . "\n";
        
        // Test HTTP access
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_NOBODY, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        echo "  HTTP Status: $httpCode\n";
        
        if ($httpCode === 200) {
            echo "  ✓ ACCESSIBLE\n";
        } else {
            echo "  ✗ NOT ACCESSIBLE\n";
        }
        echo "\n";
    }
}

echo "\n=== Recommended Paths ===\n";
echo "For landing.php (http://localhost/linknest/):\n";
echo "  Scripts should be at: /linknest/public/js/...\n";
echo "\n";
echo "For analytics (http://localhost:9333/):\n";
echo "  Scripts should be at: dashboard/... (local copies)\n";
echo "  OR: http://localhost/linknest/public/js/... (full URL)\n";
