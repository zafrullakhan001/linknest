<?php
/**
 * Performance Analytics Add-on Configuration API
 * Admin-only endpoints for managing add-on configuration
 */

require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Require admin authentication for all add-on management
$AUTH_USER = requireAdmin();

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

switch ($method) {
    case 'GET':
        if ($path === '/performance-analytics' || $path === '/performance-analytics/') {
            handleGetAnalyticsConfig();
        } elseif ($path === '/performance-analytics/status' || $path === '/performance-analytics/status/') {
            handleCheckAnalyticsStatus();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'POST':
        if ($path === '/performance-analytics/test-connection' || $path === '/performance-analytics/test-connection/') {
            handleTestAnalyticsConnection();
        } elseif ($path === '/performance-analytics/setup-schema' || $path === '/performance-analytics/setup-schema/') {
            handleSetupSchema();
        } elseif ($path === '/performance-analytics/purge-database' || $path === '/performance-analytics/purge-database/') {
            handlePurgeDatabase();
        } elseif ($path === '/performance-analytics/download-geolite2' || $path === '/performance-analytics/download-geolite2/') {
            handleDownloadGeoLite2();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'PUT':
        if ($path === '/performance-analytics' || $path === '/performance-analytics/') {
            handleUpdateAnalyticsConfig();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

/**
 * Get current Performance Analytics configuration
 */
function handleGetAnalyticsConfig() {
    try {
        $db = getDB();
        
        // Get all settings with 'performance_analytics_' prefix
        $stmt = $db->prepare("
            SELECT key, value 
            FROM settings 
            WHERE key LIKE 'performance_analytics_%'
        ");
        $stmt->execute();
        $settings = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
        
        // Get addon status
        $statusStmt = $db->prepare("
            SELECT * FROM addon_status 
            WHERE addon_name = 'performance_analytics'
        ");
        $statusStmt->execute();
        $status = $statusStmt->fetch(PDO::FETCH_ASSOC);
        
        // Parse beacon URLs
        $beaconUrls = [];
        if (!empty($settings['performance_analytics_beacon_urls'])) {
            $beaconUrls = array_filter(
                array_map('trim', explode(',', $settings['performance_analytics_beacon_urls'])),
                function($url) { return !empty($url); }
            );
        }
        
        sendJSON([
            'config' => [
                'enabled' => (bool)($settings['performance_analytics_enabled'] ?? false),
                'pgHost' => $settings['performance_analytics_pg_host'] ?? '',
                'pgPort' => (int)($settings['performance_analytics_pg_port'] ?? 5432),
                'pgDatabase' => $settings['performance_analytics_pg_database'] ?? '',
                'pgUser' => $settings['performance_analytics_pg_user'] ?? '',
                // Don't send password back
                'sampleRate' => (float)($settings['performance_analytics_sample_rate'] ?? 0.1),
                'trackAnonymous' => (bool)($settings['performance_analytics_track_anonymous'] ?? true),
                'trackLogins' => (bool)($settings['performance_analytics_track_logins'] ?? true),
                'beaconUrls' => $beaconUrls,
                'workerEnabled' => (bool)($settings['performance_analytics_worker_enabled'] ?? false),
                'retentionDays' => (int)($settings['performance_analytics_retention_days'] ?? 90),
                'dashboardUrl' => $settings['performance_analytics_dashboard_url'] ?? ''
            ],
            'status' => $status
        ]);
        
    } catch (Exception $e) {
        sendJSON(['error' => 'Failed to load configuration: ' . $e->getMessage()], 500);
    }
}

/**
 * Check Performance Analytics addon health status
 */
function handleCheckAnalyticsStatus() {
    try {
        $db = getDB();
        
        // Check if enabled
        $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'performance_analytics_enabled'");
        $stmt->execute();
        $enabled = ($stmt->fetchColumn() === '1');
        
        if (!$enabled) {
            sendJSON([
                'status' => 'disabled',
                'message' => 'Performance Analytics addon is disabled'
            ]);
            return;
        }
        
        // Try to connect to PostgreSQL
        $analyticsDB = getAnalyticsDB();
        
        if (!$analyticsDB) {
            sendJSON([
                'status' => 'unavailable',
                'message' => 'Cannot connect to PostgreSQL database'
            ]);
            return;
        }
        
        // Check if required tables exist
        $stmt = $analyticsDB->query("
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('metrics_queue', 'performance_metrics', 'link_latency_summary')
        ");
        $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
        
        if (count($tables) < 3) {
            sendJSON([
                'status' => 'not_configured',
                'message' => 'Database schema not initialized',
                'existing_tables' => $tables
            ]);
            return;
        }
        
        // Get metrics count
        $stmt = $analyticsDB->query("SELECT COUNT(*) FROM performance_metrics");
        $metricsCount = $stmt->fetchColumn();
        
        $stmt = $analyticsDB->query("SELECT COUNT(*) FROM metrics_queue WHERE processed = FALSE");
        $queueCount = $stmt->fetchColumn();
        
        sendJSON([
            'status' => 'available',
            'message' => 'Performance Analytics is operational',
            'metrics_count' => (int)$metricsCount,
            'queue_pending' => (int)$queueCount
        ]);
        
    } catch (Exception $e) {
        sendJSON([
            'status' => 'error',
            'message' => 'Health check failed: ' . $e->getMessage()
        ], 500);
    }
}

/**
 * Test PostgreSQL connection with provided credentials
 */
function handleTestAnalyticsConnection() {
    try {
        $data = getJSONInput();
        
        if (empty($data['pgHost']) || empty($data['pgDatabase']) || empty($data['pgUser'])) {
            sendJSON(['error' => 'Host, database, and user are required'], 400);
            return;
        }
        
        // Try to connect
        $dsn = sprintf(
            "pgsql:host=%s;port=%d;dbname=%s",
            $data['pgHost'],
            $data['pgPort'] ?? 5432,
            $data['pgDatabase']
        );
        
        $pdo = new PDO(
            $dsn,
            $data['pgUser'],
            $data['pgPassword'] ?? '',
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_TIMEOUT => 5
            ]
        );
        
        // Check if TimescaleDB is available
        $stmt = $pdo->query("SELECT default_version FROM pg_available_extensions WHERE name = 'timescaledb'");
        $timescaledb = $stmt->fetch(PDO::FETCH_ASSOC);
        
        // Check if extension is installed
        $stmt = $pdo->query("SELECT * FROM pg_extension WHERE extname = 'timescaledb'");
        $timescaledbInstalled = $stmt->fetch(PDO::FETCH_ASSOC);
        
        // Check if required tables exist
        $stmt = $pdo->query("
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('metrics_queue', 'performance_metrics', 'link_latency_summary', 'user_geolocations')
        ");
        $existingTables = $stmt->fetchAll(PDO::FETCH_COLUMN);
        
        sendJSON([
            'success' => true,
            'message' => 'Connection successful',
            'details' => [
                'timescaledb_available' => !empty($timescaledb),
                'timescaledb_installed' => !empty($timescaledbInstalled),
                'timescaledb_version' => $timescaledb['default_version'] ?? null,
                'tables_exist' => $existingTables,
                'schema_ready' => count($existingTables) >= 4,
                'postgres_version' => $pdo->getAttribute(PDO::ATTR_SERVER_VERSION)
            ]
        ]);
        
    } catch (PDOException $e) {
        sendJSON([
            'success' => false,
            'error' => 'Connection failed: ' . $e->getMessage()
        ], 400);
    } catch (Exception $e) {
        sendJSON([
            'success' => false,
            'error' => $e->getMessage()
        ], 500);
    }
}

/**
 * Update Performance Analytics configuration
 */
function handleUpdateAnalyticsConfig() {
    try {
        $db = getDB();
        $data = getJSONInput();
        
        // Validate required fields if enabling
        if (!empty($data['enabled'])) {
            if (empty($data['pgHost']) || empty($data['pgDatabase']) || empty($data['pgUser'])) {
                sendJSON(['error' => 'PostgreSQL connection settings are required when enabling the addon'], 400);
                return;
            }
        }
        
        // Prepare settings to update
        $settings = [
            'performance_analytics_enabled' => !empty($data['enabled']) ? '1' : '0',
            'performance_analytics_pg_host' => $data['pgHost'] ?? '',
            'performance_analytics_pg_port' => (string)($data['pgPort'] ?? 5432),
            'performance_analytics_pg_database' => $data['pgDatabase'] ?? '',
            'performance_analytics_pg_user' => $data['pgUser'] ?? '',
            'performance_analytics_sample_rate' => (string)($data['sampleRate'] ?? 0.1),
            'performance_analytics_track_anonymous' => !empty($data['trackAnonymous']) ? '1' : '0',
            'performance_analytics_track_logins' => !empty($data['trackLogins']) ? '1' : '0',
            'performance_analytics_worker_enabled' => !empty($data['workerEnabled']) ? '1' : '0',
            'performance_analytics_retention_days' => (string)($data['retentionDays'] ?? 90),
            'performance_analytics_dashboard_url' => $data['dashboardUrl'] ?? ''
        ];
        
        // Handle beacon URLs (array to comma-separated string)
        if (isset($data['beaconUrls'])) {
            $urls = is_array($data['beaconUrls']) ? $data['beaconUrls'] : [$data['beaconUrls']];
            $settings['performance_analytics_beacon_urls'] = implode(',', array_filter($urls));
        }
        
        // Update password only if provided
        if (!empty($data['pgPassword'])) {
            $settings['performance_analytics_pg_password'] = $data['pgPassword'];
        }
        
        // Update all settings
        $stmt = $db->prepare("
            INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        ");
        
        $now = time();
        foreach ($settings as $key => $value) {
            $stmt->execute([$key, $value, $now]);
        }
        
        // Update addon status
        $statusStmt = $db->prepare("
            UPDATE addon_status 
            SET is_enabled = ?, last_check_at = ?
            WHERE addon_name = 'performance_analytics'
        ");
        $statusStmt->execute([!empty($data['enabled']) ? 1 : 0, $now]);
        
        sendJSON([
            'success' => true,
            'message' => 'Configuration saved successfully'
        ]);
        
    } catch (Exception $e) {
        sendJSON(['error' => 'Failed to save configuration: ' . $e->getMessage()], 500);
    }
}

/**
 * Setup database schema
 */
function handleSetupSchema() {
    try {
        $schemaFile = __DIR__ . '/../analytics/schema.sql';
        
        if (!file_exists($schemaFile)) {
            sendJSON(['error' => 'Schema file not found: ' . $schemaFile], 404);
            return;
        }
        
        // Get PostgreSQL connection
        $analyticsDB = getAnalyticsDB();
        if (!$analyticsDB) {
            sendJSON(['error' => 'Cannot connect to PostgreSQL. Please configure connection settings first.'], 400);
            return;
        }
        
        // Read and execute schema file
        $schemaSQL = file_get_contents($schemaFile);
        
        // Split by semicolons and execute each statement
        $statements = array_filter(
            array_map('trim', explode(';', $schemaSQL)),
            function($stmt) { return !empty($stmt) && !preg_match('/^--/', $stmt); }
        );
        
        $executed = 0;
        $errors = [];
        
        foreach ($statements as $statement) {
            if (empty(trim($statement))) continue;
            
            try {
                $analyticsDB->exec($statement);
                $executed++;
            } catch (PDOException $e) {
                // Ignore "already exists" errors
                if (strpos($e->getMessage(), 'already exists') === false && 
                    strpos($e->getMessage(), 'duplicate') === false) {
                    $errors[] = $e->getMessage();
                }
            }
        }
        
        // Verify tables were created
        $stmt = $analyticsDB->query("
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('metrics_queue', 'performance_metrics', 'link_latency_summary', 'user_geolocations')
        ");
        $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
        
        sendJSON([
            'success' => true,
            'message' => 'Schema setup completed',
            'statements_executed' => $executed,
            'tables_created' => $tables,
            'warnings' => $errors
        ]);
        
    } catch (Exception $e) {
        sendJSON(['error' => 'Schema setup failed: ' . $e->getMessage()], 500);
    }
}

/**
 * Purge all analytics data
 */
function handlePurgeDatabase() {
    try {
        $analyticsDB = getAnalyticsDB();
        if (!$analyticsDB) {
            sendJSON(['error' => 'Cannot connect to PostgreSQL'], 400);
            return;
        }
        
        // Get confirmation from request
        $data = getJSONInput();
        if (empty($data['confirm']) || $data['confirm'] !== 'DELETE_ALL_DATA') {
            sendJSON(['error' => 'Confirmation required. Send confirm: "DELETE_ALL_DATA"'], 400);
            return;
        }
        
        // Disable foreign key checks temporarily
        $analyticsDB->exec('SET session_replication_role = replica;');
        
        // Truncate all tables
        $tables = [
            'metrics_queue',
            'performance_metrics',
            'link_latency_summary',
            'user_geolocations',
            'alert_thresholds'
        ];
        
        $truncated = [];
        foreach ($tables as $table) {
            try {
                $analyticsDB->exec("TRUNCATE TABLE $table CASCADE");
                $truncated[] = $table;
            } catch (PDOException $e) {
                // Table might not exist, that's okay
            }
        }
        
        // Re-enable foreign key checks
        $analyticsDB->exec('SET session_replication_role = DEFAULT;');
        
        // Get counts to verify
        $counts = [];
        foreach ($tables as $table) {
            try {
                $stmt = $analyticsDB->query("SELECT COUNT(*) FROM $table");
                $counts[$table] = (int)$stmt->fetchColumn();
            } catch (PDOException $e) {
                $counts[$table] = 'N/A';
            }
        }
        
        sendJSON([
            'success' => true,
            'message' => 'Database purged successfully',
            'tables_truncated' => $truncated,
            'remaining_counts' => $counts
        ]);
        
    } catch (Exception $e) {
        sendJSON(['error' => 'Purge failed: ' . $e->getMessage()], 500);
    }
}

/**
 * Download GeoLite2 database
 */
function handleDownloadGeoLite2() {
    try {
        $geoipDir = __DIR__ . '/../analytics/geoip';
        $targetFile = $geoipDir . '/GeoLite2-City.mmdb';
        
        // Check if already exists
        if (file_exists($targetFile)) {
            sendJSON([
                'success' => true,
                'message' => 'GeoLite2 database already exists',
                'file_path' => $targetFile,
                'file_size' => filesize($targetFile),
                'already_exists' => true
            ]);
            return;
        }
        
        // Create directory if needed
        if (!is_dir($geoipDir)) {
            mkdir($geoipDir, 0755, true);
        }
        
        // GeoLite2 download requires MaxMind account
        // For now, provide instructions
        sendJSON([
            'success' => false,
            'message' => 'GeoLite2 download requires manual setup',
            'instructions' => [
                '1. Sign up for a free MaxMind account at https://www.maxmind.com/en/accounts/current/geoip/downloads',
                '2. Download GeoLite2-City.mmdb',
                '3. Place it in: ' . $targetFile,
                '4. Alternatively, the system will use online geolocation API as fallback'
            ],
            'download_url' => 'https://www.maxmind.com/en/accounts/current/geoip/downloads',
            'target_path' => $targetFile
        ]);
        
    } catch (Exception $e) {
        sendJSON(['error' => 'Download setup failed: ' . $e->getMessage()], 500);
    }
}
