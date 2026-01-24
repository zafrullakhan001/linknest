<?php
/**
 * Performance Analytics Add-on Setup Script
 * Automatically sets up the PostgreSQL database schema
 * 
 * Usage: php scripts/setup-analytics-addon.php
 */

require_once __DIR__ . '/../api/config.php';

echo "=== Performance Analytics Add-on Setup ===\n\n";

// Get configuration from SQLite
$db = getDB();
$stmt = $db->prepare("
    SELECT key, value FROM settings 
    WHERE key LIKE 'performance_analytics_pg_%'
");
$stmt->execute();
$settings = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

if (empty($settings['performance_analytics_pg_host']) || 
    empty($settings['performance_analytics_pg_database'])) {
    echo "❌ Error: Analytics addon not configured.\n";
    echo "   Please configure it in the Admin Panel → Add-ons first.\n\n";
    echo "   Required settings:\n";
    echo "   - PostgreSQL Host\n";
    echo "   - PostgreSQL Database\n";
    echo "   - PostgreSQL User\n";
    echo "   - PostgreSQL Password\n\n";
    exit(1);
}

echo "Configuration loaded:\n";
echo "  Host: {$settings['performance_analytics_pg_host']}\n";
echo "  Port: " . ($settings['performance_analytics_pg_port'] ?? 5432) . "\n";
echo "  Database: {$settings['performance_analytics_pg_database']}\n";
echo "  User: {$settings['performance_analytics_pg_user']}\n\n";

try {
    // Connect to PostgreSQL
    $dsn = sprintf(
        "pgsql:host=%s;port=%d;dbname=%s",
        $settings['performance_analytics_pg_host'],
        $settings['performance_analytics_pg_port'] ?? 5432,
        $settings['performance_analytics_pg_database']
    );
    
    echo "Connecting to PostgreSQL...\n";
    $pdo = new PDO(
        $dsn,
        $settings['performance_analytics_pg_user'],
        $settings['performance_analytics_pg_password'] ?? ''
    );
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    echo "✓ Connected successfully\n\n";
    
    // Check PostgreSQL version
    $version = $pdo->getAttribute(PDO::ATTR_SERVER_VERSION);
    echo "PostgreSQL version: $version\n\n";
    
    // Check if TimescaleDB is available
    echo "Checking for TimescaleDB extension...\n";
    $stmt = $pdo->query("SELECT * FROM pg_extension WHERE extname = 'timescaledb'");
    if ($stmt->rowCount() === 0) {
        echo "Installing TimescaleDB extension...\n";
        try {
            $pdo->exec("CREATE EXTENSION IF NOT EXISTS timescaledb");
            echo "✓ TimescaleDB extension enabled\n\n";
        } catch (PDOException $e) {
            echo "⚠ Warning: Could not enable TimescaleDB extension.\n";
            echo "  Error: " . $e->getMessage() . "\n";
            echo "  The schema will still be created, but time-series optimization will not be available.\n\n";
        }
    } else {
        echo "✓ TimescaleDB extension already enabled\n\n";
    }
    
    // Read and execute schema SQL file
    echo "Creating database schema...\n";
    $schemaFile = __DIR__ . '/../analytics/schema.sql';
    
    if (!file_exists($schemaFile)) {
        echo "❌ Schema file not found: $schemaFile\n";
        exit(1);
    }
    
    $sql = file_get_contents($schemaFile);
    
    // Split into individual statements (handle multi-line statements)
    $statements = preg_split('/;\s*$/m', $sql);
    
    $executed = 0;
    $errors = 0;
    
    foreach ($statements as $statement) {
        $statement = trim($statement);
        if (empty($statement) || strpos($statement, '--') === 0) {
            continue;
        }
        
        try {
            $pdo->exec($statement);
            $executed++;
        } catch (PDOException $e) {
            // Ignore "already exists" errors
            if (strpos($e->getMessage(), 'already exists') === false) {
                echo "⚠ Warning: " . $e->getMessage() . "\n";
                $errors++;
            }
        }
    }
    
    echo "✓ Schema executed ($executed statements";
    if ($errors > 0) echo ", $errors warnings";
    echo ")\n\n";
    
    // Verify tables exist
    echo "Verifying tables...\n";
    $stmt = $pdo->query("
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('metrics_queue', 'performance_metrics', 'link_latency_summary', 'user_geolocations', 'alert_thresholds')
        ORDER BY table_name
    ");
    $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    foreach ($tables as $table) {
        echo "  ✓ $table\n";
    }
    
    if (count($tables) < 5) {
        echo "\n⚠ Warning: Not all required tables were created.\n";
        echo "  Expected 5 tables, found " . count($tables) . "\n";
    } else {
        echo "\n✓ All required tables created successfully\n";
    }
    
    // Update addon status in SQLite
    echo "\nUpdating addon status in LinkNest...\n";
    $stmt = $db->prepare("
        UPDATE addon_status 
        SET is_available = 1, last_check_at = ?, error_message = NULL
        WHERE addon_name = 'performance_analytics'
    ");
    $stmt->execute([time()]);
    echo "✓ Addon status updated\n\n";
    
    echo "╔════════════════════════════════════════════════════╗\n";
    echo "║          ✓ Setup Complete!                         ║\n";
    echo "╚════════════════════════════════════════════════════╝\n\n";
    
    echo "Next steps:\n\n";
    echo "1. Install GeoIP database:\n";
    echo "   - Download GeoLite2-City.mmdb from MaxMind\n";
    echo "   - Place in: analytics/geoip/GeoLite2-City.mmdb\n";
    echo "   - Install PHP library: composer require geoip2/geoip2:~2.0\n\n";
    
    echo "2. Start the background workers:\n";
    echo "   php analytics/worker.php\n";
    echo "   php analytics/server-checker-worker.php\n\n";
    
    echo "3. Configure Apache for port 8080:\n";
    echo "   - See: analytics/apache-vhost-analytics.conf\n";
    echo "   - Restart Apache after configuration\n\n";
    
    echo "4. Enable the addon in Admin Panel:\n";
    echo "   - Login to LinkNest\n";
    echo "   - Go to Admin Panel → Add-ons\n";
    echo "   - Toggle 'Performance Analytics' to ON\n\n";
    
    echo "5. Access the dashboard:\n";
    echo "   http://localhost:8080\n\n";
    
} catch (PDOException $e) {
    echo "❌ Database Error: " . $e->getMessage() . "\n\n";
    
    // Update addon status with error
    try {
        $stmt = $db->prepare("
            UPDATE addon_status 
            SET is_available = 0, last_check_at = ?, error_message = ?
            WHERE addon_name = 'performance_analytics'
        ");
        $stmt->execute([time(), $e->getMessage()]);
    } catch (Exception $e2) {
        // Ignore
    }
    
    exit(1);
} catch (Exception $e) {
    echo "❌ Error: " . $e->getMessage() . "\n";
    exit(1);
}
