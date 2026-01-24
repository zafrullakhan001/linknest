<?php
/**
 * Test Performance Analytics Connection
 * Quick diagnostic tool to verify PostgreSQL connection
 * 
 * Usage: php scripts/test-analytics-connection.php
 */

require_once __DIR__ . '/../api/config.php';

echo "=== Performance Analytics Connection Test ===\n\n";

// Check if addon is enabled
echo "1. Checking addon status...\n";
$enabled = isPerformanceAnalyticsEnabled();
echo "   Addon enabled: " . ($enabled ? 'YES' : 'NO') . "\n\n";

if (!$enabled) {
    echo "ℹ Addon is disabled. Enable it in Admin Panel → Add-ons to proceed.\n";
    exit(0);
}

// Get configuration
echo "2. Loading configuration...\n";
$db = getDB();
$stmt = $db->prepare("SELECT key, value FROM settings WHERE key LIKE 'performance_analytics_pg_%'");
$stmt->execute();
$settings = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

echo "   Host: " . ($settings['performance_analytics_pg_host'] ?? 'NOT SET') . "\n";
echo "   Port: " . ($settings['performance_analytics_pg_port'] ?? 'NOT SET') . "\n";
echo "   Database: " . ($settings['performance_analytics_pg_database'] ?? 'NOT SET') . "\n";
echo "   User: " . ($settings['performance_analytics_pg_user'] ?? 'NOT SET') . "\n\n";

// Test connection
echo "3. Testing PostgreSQL connection...\n";
try {
    $analyticsDB = getAnalyticsDB();
    
    if (!$analyticsDB) {
        echo "   ❌ Connection failed\n";
        exit(1);
    }
    
    echo "   ✓ Connection successful\n\n";
    
    // Check TimescaleDB
    echo "4. Checking TimescaleDB...\n";
    $stmt = $analyticsDB->query("SELECT * FROM pg_extension WHERE extname = 'timescaledb'");
    if ($stmt->rowCount() > 0) {
        $ext = $stmt->fetch();
        echo "   ✓ TimescaleDB is installed\n\n";
    } else {
        echo "   ⚠ TimescaleDB not installed\n\n";
    }
    
    // Check tables
    echo "5. Checking database tables...\n";
    $stmt = $analyticsDB->query("
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name
    ");
    $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    if (empty($tables)) {
        echo "   ⚠ No tables found. Run: php scripts/setup-analytics-addon.php\n\n";
    } else {
        foreach ($tables as $table) {
            echo "   ✓ $table\n";
        }
        echo "\n";
    }
    
    // Check data
    echo "6. Checking data...\n";
    
    $stmt = $analyticsDB->query("SELECT COUNT(*) FROM metrics_queue");
    $queueCount = $stmt->fetchColumn();
    echo "   Metrics queue: $queueCount items\n";
    
    $stmt = $analyticsDB->query("SELECT COUNT(*) FROM metrics_queue WHERE processed = FALSE");
    $pendingCount = $stmt->fetchColumn();
    echo "   Pending: $pendingCount\n\n";
    
    $stmt = $analyticsDB->query("SELECT COUNT(*) FROM performance_metrics");
    $metricsCount = $stmt->fetchColumn();
    echo "   Performance metrics: $metricsCount records\n";
    
    $stmt = $analyticsDB->query("SELECT COUNT(*) FROM user_geolocations");
    $geoCount = $stmt->fetchColumn();
    echo "   User geolocations: $geoCount records\n\n";
    
    // Check recent activity
    echo "7. Checking recent activity...\n";
    $stmt = $analyticsDB->query("
        SELECT MAX(time) as last_metric 
        FROM performance_metrics
    ");
    $lastMetric = $stmt->fetchColumn();
    
    if ($lastMetric) {
        echo "   Last metric: $lastMetric\n";
        $age = time() - strtotime($lastMetric);
        echo "   Age: " . round($age / 60) . " minutes ago\n";
    } else {
        echo "   No metrics yet\n";
    }
    
    echo "\n✓ Connection test complete!\n";
    
} catch (Exception $e) {
    echo "   ❌ Error: " . $e->getMessage() . "\n";
    exit(1);
}
