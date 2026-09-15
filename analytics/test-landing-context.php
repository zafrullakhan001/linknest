<?php
/**
 * Test if isPerformanceAnalyticsEnabled works in landing page context
 */

// Simulate landing.php context
ob_start();
try {
    require_once __DIR__ . '/../api/config.php';
    $appName = getAppName() ?: 'LinkNest';
} catch (Exception $e) {
    $appName = 'LinkNest';
}
ob_end_clean();

echo "=== Testing Landing Page Context ===\n\n";

echo "Config loaded: " . (function_exists('isPerformanceAnalyticsEnabled') ? 'YES' : 'NO') . "\n";
echo "getDB function: " . (function_exists('getDB') ? 'YES' : 'NO') . "\n\n";

if (function_exists('isPerformanceAnalyticsEnabled')) {
    echo "Testing isPerformanceAnalyticsEnabled()...\n";
    $result = isPerformanceAnalyticsEnabled();
    echo "Result: " . ($result ? 'true (ENABLED)' : 'false (DISABLED)') . "\n";
    
    if ($result) {
        echo "\n✓ Scripts SHOULD be included in landing page\n";
        echo "\nIf scripts are missing, possible causes:\n";
        echo "  1. Output buffering issue\n";
        echo "  2. Function called before database init\n";
        echo "  3. PHP error preventing script inclusion\n";
    } else {
        echo "\n✗ Scripts will NOT be included (addon disabled)\n";
    }
} else {
    echo "✗ Function not available\n";
}

// Test the actual check
echo "\n=== Direct Database Check ===\n";
try {
    $db = getDB();
    $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'performance_analytics_enabled'");
    $stmt->execute();
    $value = $stmt->fetchColumn();
    echo "Direct DB value: " . var_export($value, true) . "\n";
    echo "Should be enabled: " . (($value === '1' || $value === 1) ? 'YES' : 'NO') . "\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
