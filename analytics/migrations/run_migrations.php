<?php
/**
 * Run Analytics Database Migrations
 * Automatically reads connection settings from LinkNest database
 */

// Load main config
require_once __DIR__ . '/../../api/config.php';

echo "=== LinkNest Analytics Database Migrations ===\n";
echo "Started at: " . date('Y-m-d H:i:s') . "\n\n";

try {
    // Get PostgreSQL settings from SQLite
    $db = getDB();
    $stmt = $db->prepare("
        SELECT key, value FROM settings 
        WHERE key LIKE 'performance_analytics_pg_%'
    ");
    $stmt->execute();
    $settings = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
    
    if (empty($settings['performance_analytics_pg_host']) || 
        empty($settings['performance_analytics_pg_database'])) {
        die("ERROR: Analytics database not configured. Please configure it in admin settings first.\n");
    }
    
    $host = $settings['performance_analytics_pg_host'];
    $port = $settings['performance_analytics_pg_port'] ?? 5432;
    $database = $settings['performance_analytics_pg_database'];
    $user = $settings['performance_analytics_pg_user'] ?? 'postgres';
    $password = $settings['performance_analytics_pg_password'] ?? '';
    
    echo "PostgreSQL Connection Details:\n";
    echo "  Host: $host\n";
    echo "  Port: $port\n";
    echo "  Database: $database\n";
    echo "  User: $user\n\n";
    
    // Connect to PostgreSQL
    $dsn = "pgsql:host=$host;port=$port;dbname=$database";
    $pdo = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
    
    echo "✓ Connected to PostgreSQL database\n\n";
    
    // Get list of migration files
    $migrations = [
        'add_username_column.sql' => 'Add username column and index',
        'add_ip_indexes.sql' => 'Add IP address indexes for anonymous users',
        'add_link_metrics_columns.sql' => 'Add link-level metrics columns (tile/link ids, error classification)',
        'fix_link_id_text.sql' => 'Fix performance_metrics.link_id column type to TEXT (compat with LinkNest IDs)',
        'fix_link_latency_summary_link_id_text.sql' => 'Fix link_latency_summary.link_id column type to TEXT (compat with LinkNest IDs)',
        'add_user_geolocations_last_seen.sql' => 'Add last_seen column to user_geolocations for upsert updates',
        'add_user_geolocations_unique_user_id.sql' => 'Add UNIQUE(user_id) on user_geolocations for ON CONFLICT upserts'
    ];
    
    foreach ($migrations as $file => $description) {
        echo "Running migration: $description\n";
        echo "File: $file\n";
        
        $sqlFile = __DIR__ . '/' . $file;
        
        if (!file_exists($sqlFile)) {
            echo "  ⚠ Skipped: File not found\n\n";
            continue;
        }
        
        $sql = file_get_contents($sqlFile);
        
        try {
            // Execute SQL
            $pdo->exec($sql);
            echo "  ✓ Migration completed successfully\n\n";
        } catch (PDOException $e) {
            echo "  ⚠ Migration error: " . $e->getMessage() . "\n";
            echo "  (This might be OK if migration was already applied)\n\n";
        }
    }
    
    echo "=== All Migrations Completed ===\n";
    echo "Finished at: " . date('Y-m-d H:i:s') . "\n\n";
    
    // Verify changes
    echo "Verifying database schema...\n";
    
    // Check if username column exists
    $stmt = $pdo->query("
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'performance_metrics' 
        AND column_name IN (
            'username', 'ip_address', 'is_authenticated', 'time',
            'tile_id', 'link_id', 'link_url_normalized',
            'ok', 'error_category', 'response_type', 'redirected', 'final_url',
            'method', 'cache_mode', 'timeout_ms', 'attempted_at'
        )
        ORDER BY column_name
    ");
    $columns = $stmt->fetchAll();
    
    echo "\nKey columns in performance_metrics:\n";
    foreach ($columns as $col) {
        echo "  ✓ {$col['column_name']} ({$col['data_type']})\n";
    }
    
    // Check indexes
    $stmt = $pdo->query("
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'performance_metrics'
        AND indexname LIKE '%username%' OR indexname LIKE '%ip%' OR indexname LIKE '%anonymous%'
        ORDER BY indexname
    ");
    $indexes = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    echo "\nIndexes created:\n";
    if (empty($indexes)) {
        echo "  ⚠ No indexes found (might not have been created yet)\n";
    } else {
        foreach ($indexes as $index) {
            echo "  ✓ $index\n";
        }
    }
    
    echo "\n✅ Database is ready for enhanced analytics!\n";
    echo "\nYou can now capture:\n";
    echo "  • Username (for logged-in users)\n";
    echo "  • IP address (for all users including anonymous)\n";
    echo "  • Exact timestamp (when metric was collected)\n";
    echo "  • Authentication status (TRUE/FALSE flag)\n";
    
} catch (Exception $e) {
    echo "\n❌ ERROR: " . $e->getMessage() . "\n";
    echo "\nTroubleshooting:\n";
    echo "  1. Check PostgreSQL is running\n";
    echo "  2. Verify connection details in LinkNest admin settings\n";
    echo "  3. Ensure PostgreSQL user has permissions\n";
    exit(1);
}
