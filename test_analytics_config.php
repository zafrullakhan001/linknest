<?php
/**
 * Test Analytics Configuration
 */

require_once __DIR__ . '/api/config.php';

echo "=== Performance Analytics Configuration Test ===\n\n";

// Check if addon is enabled
$enabled = getSetting('performance_analytics_enabled', 0);
echo "Addon Enabled: " . ($enabled ? "YES ✓" : "NO ✗") . "\n";

// Check database configuration
$pgHost = getSetting('performance_analytics_pg_host', '');
$pgPort = getSetting('performance_analytics_pg_port', 5432);
$pgDatabase = getSetting('performance_analytics_pg_database', '');
$pgUser = getSetting('performance_analytics_pg_user', '');
$dashboardUrl = getSetting('performance_analytics_dashboard_url', '');

echo "\nPostgreSQL Configuration:\n";
echo "  Host: " . ($pgHost ?: "(not set)") . "\n";
echo "  Port: $pgPort\n";
echo "  Database: " . ($pgDatabase ?: "(not set)") . "\n";
echo "  User: " . ($pgUser ?: "(not set)") . "\n";
echo "  Dashboard URL: " . ($dashboardUrl ?: "(not set)") . "\n";

// Check tracking settings
echo "\nTracking Settings:\n";
echo "  Sample Rate: " . getSetting('performance_analytics_sample_rate', 0.1) . "\n";
echo "  Track Anonymous: " . (getSetting('performance_analytics_track_anonymous', 1) ? "YES" : "NO") . "\n";
echo "  Track Logins: " . (getSetting('performance_analytics_track_logins', 1) ? "YES" : "NO") . "\n";
echo "  Worker Enabled: " . (getSetting('performance_analytics_worker_enabled', 0) ? "YES" : "NO") . "\n";

// Test PostgreSQL connection
echo "\n=== Testing PostgreSQL Connection ===\n";
if (empty($pgHost) || empty($pgDatabase)) {
    echo "❌ PostgreSQL not configured\n";
} else {
    try {
        $dsn = "pgsql:host=$pgHost;port=$pgPort;dbname=$pgDatabase";
        $pdo = new PDO($dsn, $pgUser, getSetting('performance_analytics_pg_password', ''));
        echo "✓ PostgreSQL connection successful!\n";
        
        // Check tables
        $stmt = $pdo->query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
        $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
        echo "\nTables in database:\n";
        foreach ($tables as $table) {
            echo "  - $table\n";
        }
        
        // Check metrics queue
        $stmt = $pdo->query("SELECT COUNT(*) FROM metrics_queue");
        $queueCount = $stmt->fetchColumn();
        echo "\nMetrics in queue: $queueCount\n";
        
        // Check processed metrics
        $stmt = $pdo->query("SELECT COUNT(*) FROM performance_metrics");
        $metricsCount = $stmt->fetchColumn();
        echo "Processed metrics: $metricsCount\n";
        
    } catch (PDOException $e) {
        echo "❌ PostgreSQL connection failed: " . $e->getMessage() . "\n";
    }
}

echo "\n=== Recommendations ===\n";
if (!$enabled) {
    echo "⚠ Enable the addon in Admin Panel → Add-ons\n";
}
if (empty($pgHost)) {
    echo "⚠ Configure PostgreSQL connection in Admin Panel → Add-ons\n";
}
if ($dashboardUrl && strpos($dashboardUrl, '8080') !== false) {
    echo "⚠ Update Dashboard URL to use port 9333 instead of 8080\n";
}

echo "\nDone!\n";
