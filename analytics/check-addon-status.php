<?php
/**
 * Check if Performance Analytics addon is enabled
 */

require_once __DIR__ . '/../api/config.php';

echo "=== Performance Analytics Addon Status ===\n\n";

try {
    $db = getDB();
    
    // Check if enabled
    $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'performance_analytics_enabled'");
    $stmt->execute();
    $value = $stmt->fetchColumn();
    
    echo "Setting 'performance_analytics_enabled': " . var_export($value, true) . "\n";
    
    $enabled = ($value === '1' || $value === 1 || $value === true);
    
    if ($enabled) {
        echo "\n✓ Addon is ENABLED\n";
    } else {
        echo "\n✗ Addon is DISABLED\n";
        echo "\nTo enable:\n";
        echo "  1. Go to Admin Panel → Add-ons tab\n";
        echo "  2. Find 'Performance Analytics' addon\n";
        echo "  3. Toggle the switch to ENABLE\n";
        echo "  4. Click 'Save Configuration'\n";
    }
    
    // Check function result
    echo "\nFunction check:\n";
    echo "  isPerformanceAnalyticsEnabled() = " . (isPerformanceAnalyticsEnabled() ? 'true' : 'false') . "\n";
    
    // Check other required settings
    echo "\nOther settings:\n";
    $required = [
        'performance_analytics_pg_host',
        'performance_analytics_pg_database',
        'performance_analytics_pg_user'
    ];
    
    foreach ($required as $key) {
        $stmt = $db->prepare("SELECT value FROM settings WHERE key = ?");
        $stmt->execute([$key]);
        $val = $stmt->fetchColumn();
        $status = !empty($val) ? '✓' : '✗';
        echo "  $status $key: " . ($val ?: 'NOT SET') . "\n";
    }
    
} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
}
