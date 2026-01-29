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
        } elseif ($path === '/performance-analytics/backup' || $path === '/performance-analytics/backup/') {
            handleBackupAnalyticsDb();
        } elseif ($path === '/monitorv2' || $path === '/monitorv2/') {
            handleGetMonitorv2Config();
        } elseif ($path === '/monitorv2/status' || $path === '/monitorv2/status/') {
            handleCheckMonitorv2Status();
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
        } elseif ($path === '/performance-analytics/restore' || $path === '/performance-analytics/restore/') {
            handleRestoreAnalyticsDb();
        } elseif ($path === '/monitorv2/test-connection' || $path === '/monitorv2/test-connection/') {
            handleTestMonitorv2Connection();
        } elseif ($path === '/monitorv2/setup-schema' || $path === '/monitorv2/setup-schema/') {
            handleSetupMonitorv2Schema();
        } elseif ($path === '/monitorv2/purge-data' || $path === '/monitorv2/purge-data/') {
            handlePurgeMonitorv2Data();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'PUT':
        if ($path === '/performance-analytics' || $path === '/performance-analytics/') {
            handleUpdateAnalyticsConfig();
        } elseif ($path === '/monitorv2' || $path === '/monitorv2/') {
            handleUpdateMonitorv2Config();
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

/**
 * Get analytics PostgreSQL connection params from settings (for backup/restore).
 * Decrypts password if stored in encrypted format.
 *
 * @return array{host:string,port:int,database:string,user:string,password:string}|null
 */
function getAnalyticsConnectionParams(): ?array {
    try {
        $db = getDB();
        $stmt = $db->prepare("SELECT key, value FROM settings WHERE key LIKE 'performance_analytics_pg_%'");
        $stmt->execute();
        $settings = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
        $host = $settings['performance_analytics_pg_host'] ?? '';
        $database = $settings['performance_analytics_pg_database'] ?? '';
        if (empty($host) || empty($database)) {
            return null;
        }
        $password = $settings['performance_analytics_pg_password'] ?? '';
        if (!empty($password) && strpos($password, '.') !== false && substr_count($password, '.') === 2) {
            try {
                $password = decryptPassword($password);
            } catch (Exception $e) {
                // keep as-is if decryption fails
            }
        }
        return [
            'host' => $host,
            'port' => (int)($settings['performance_analytics_pg_port'] ?? 5432),
            'database' => $database,
            'user' => $settings['performance_analytics_pg_user'] ?? 'postgres',
            'password' => $password
        ];
    } catch (Exception $e) {
        return null;
    }
}

/**
 * Export analytics database to SQL file using PDO only (no pg_dump).
 * Produces a data-only backup: TRUNCATE + INSERT for all public tables.
 * Restore assumes the schema (e.g. analytics/schema.sql) is already applied.
 */
function exportAnalyticsDbViaPhp(PDO $pdo, string $sqlPath): void {
    $fp = fopen($sqlPath, 'wb');
    if (!$fp) {
        throw new RuntimeException('Could not create SQL file');
    }
    fwrite($fp, "-- Linknest Performance Analytics backup (PHP export)\n");
    fwrite($fp, "-- " . date('c') . "\n");
    fwrite($fp, "-- Data-only: run analytics/schema.sql before restore if needed.\n\n");
    fwrite($fp, "SET session_replication_role = replica;\n\n");
    $tables = $pdo->query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")->fetchAll(PDO::FETCH_COLUMN);
    if (empty($tables)) {
        fwrite($fp, "-- No tables in public schema\n");
        fwrite($fp, "SET session_replication_role = DEFAULT;\n");
        fclose($fp);
        return;
    }
    $truncateList = implode(', ', array_map(function ($t) { return '"' . str_replace('"', '""', $t) . '"'; }, $tables));
    fwrite($fp, "TRUNCATE TABLE {$truncateList} CASCADE;\n\n");
    $batchSize = 100;
    foreach ($tables as $table) {
        $safeTable = '"' . str_replace('"', '""', $table) . '"';
        $cols = $pdo->query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = " . $pdo->quote($table) . " ORDER BY ordinal_position")->fetchAll(PDO::FETCH_COLUMN);
        if (empty($cols)) {
            continue;
        }
        $colList = implode(', ', array_map(function ($c) { return '"' . str_replace('"', '""', $c) . '"'; }, $cols));
        $stmt = $pdo->query("SELECT * FROM {$safeTable}");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if (empty($rows)) {
            fwrite($fp, "-- Table {$table}: 0 rows\n");
            continue;
        }
        $rowCount = 0;
        $batches = array_chunk($rows, $batchSize);
        foreach ($batches as $batch) {
            $values = [];
            foreach ($batch as $row) {
                $v = [];
                foreach ($cols as $col) {
                    $val = $row[$col] ?? null;
                    if ($val === null) {
                        $v[] = 'NULL';
                    } elseif (is_bool($val)) {
                        $v[] = $val ? 'TRUE' : 'FALSE';
                    } elseif (is_int($val) || (is_float($val) && (float)(int)$val === $val)) {
                        $v[] = (string)(int)$val;
                    } elseif (is_float($val)) {
                        $v[] = str_replace(',', '.', (string)$val);
                    } else {
                        $v[] = $pdo->quote((string)$val);
                    }
                }
                $values[] = '(' . implode(', ', $v) . ')';
            }
            fwrite($fp, "INSERT INTO {$safeTable} ({$colList}) VALUES " . implode(",\n ", $values) . ";\n");
            $rowCount += count($batch);
        }
        fwrite($fp, "-- Table {$table}: {$rowCount} rows\n\n");
    }
    fwrite($fp, "SET session_replication_role = DEFAULT;\n");
    fclose($fp);
}

/**
 * Create analytics DB backup and send as ZIP download.
 * Uses PHP/PDO export only (no pg_dump required).
 */
function handleBackupAnalyticsDb(): void {
    $params = getAnalyticsConnectionParams();
    if (!$params) {
        sendJSON(['error' => 'Analytics database not configured. Set PostgreSQL connection in add-on settings.'], 400);
        return;
    }
    $tmpDir = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'ln_backup_' . bin2hex(random_bytes(8));
    if (!@mkdir($tmpDir, 0700, true)) {
        sendJSON(['error' => 'Could not create temporary directory'], 500);
        return;
    }
    $timestamp = date('Ymd-His');
    $sqlFile = $tmpDir . DIRECTORY_SEPARATOR . 'analytics_backup_' . $timestamp . '.sql';
    $zipFile = $tmpDir . DIRECTORY_SEPARATOR . 'analytics_backup_' . $timestamp . '.zip';
    try {
        $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s', $params['host'], $params['port'], $params['database']);
        $pdo = new PDO($dsn, $params['user'], $params['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 300,
        ]);
        exportAnalyticsDbViaPhp($pdo, $sqlFile);
    } catch (Exception $e) {
        if (is_dir($tmpDir)) {
            if (file_exists($sqlFile)) @unlink($sqlFile);
            @rmdir($tmpDir);
        }
        sendJSON(['error' => 'Export failed: ' . $e->getMessage()], 500);
        return;
    }
    if (!file_exists($sqlFile) || filesize($sqlFile) === 0) {
        @unlink($sqlFile);
        @rmdir($tmpDir);
        sendJSON(['error' => 'Export produced empty file'], 500);
        return;
    }
    if (!class_exists('ZipArchive')) {
        @unlink($sqlFile);
        @rmdir($tmpDir);
        sendJSON(['error' => 'Zip extension not available. Enable php zip extension.'], 500);
        return;
    }
    $zip = new ZipArchive();
    if ($zip->open($zipFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        @unlink($sqlFile);
        @rmdir($tmpDir);
        sendJSON(['error' => 'Could not create zip file'], 500);
        return;
    }
    $zip->addFile($sqlFile, basename($sqlFile));
    $zip->close();
    @unlink($sqlFile);
    $zipName = 'analytics_backup_' . $timestamp . '.zip';
    while (ob_get_level()) {
        ob_end_clean();
    }
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $zipName . '"');
    header('Content-Length: ' . filesize($zipFile));
    readfile($zipFile);
    @unlink($zipFile);
    @rmdir($tmpDir);
    exit;
}

/**
 * Restore analytics DB from uploaded SQL or ZIP containing SQL.
 */
function handleRestoreAnalyticsDb(): void {
    $params = getAnalyticsConnectionParams();
    if (!$params) {
        sendJSON(['error' => 'Analytics database not configured.'], 400);
        return;
    }
    $file = $_FILES['file'] ?? null;
    if (!$file || ($file['error'] !== UPLOAD_ERR_OK)) {
        $msg = 'No file uploaded or upload error.';
        if ($file && $file['error'] !== UPLOAD_ERR_OK) {
            $msg = 'Upload error: ' . ($file['error'] === UPLOAD_ERR_INI_SIZE ? 'file too large' : 'code ' . $file['error']);
        }
        sendJSON(['error' => $msg], 400);
        return;
    }
    $tmpDir = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'ln_restore_' . bin2hex(random_bytes(8));
    if (!@mkdir($tmpDir, 0700, true)) {
        sendJSON(['error' => 'Could not create temporary directory'], 500);
        return;
    }
    $sqlFile = null;
    $name = $file['name'];
    $path = $file['tmp_name'];
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if ($ext === 'zip') {
        $zip = new ZipArchive();
        if ($zip->open($path) !== true) {
            @rmdir($tmpDir);
            sendJSON(['error' => 'Invalid zip file'], 400);
            return;
        }
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $entry = $zip->getNameIndex($i);
            if (preg_match('/\.sql$/i', $entry)) {
                $zip->extractTo($tmpDir, $entry);
                $sqlFile = $tmpDir . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $entry);
                break;
            }
        }
        $zip->close();
        if (!$sqlFile || !file_exists($sqlFile)) {
            @rmdir($tmpDir);
            sendJSON(['error' => 'Zip file does not contain a .sql file'], 400);
            return;
        }
    } elseif ($ext === 'sql') {
        $dest = $tmpDir . DIRECTORY_SEPARATOR . basename($name);
        if (!@move_uploaded_file($path, $dest)) {
            @rmdir($tmpDir);
            sendJSON(['error' => 'Failed to save uploaded file'], 500);
            return;
        }
        $sqlFile = $dest;
    } else {
        @rmdir($tmpDir);
        sendJSON(['error' => 'Upload a .sql or .zip file containing a .sql backup'], 400);
        return;
    }
    $usePhpRestore = false;
    $psql = 'psql';
    if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
        $psql = 'psql.exe';
    }
    $descriptors = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $env = $_ENV;
    $env['PGPASSWORD'] = $params['password'];
    $cmd = [
        $psql,
        '-h', $params['host'],
        '-p', (string)$params['port'],
        '-U', $params['user'],
        '-d', $params['database'],
        '-f', $sqlFile
    ];
    $proc = @proc_open($cmd, $descriptors, $pipes, null, $env);
    if (!is_resource($proc)) {
        $usePhpRestore = true;
    } else {
        $stderr = stream_get_contents($pipes[2] ?? null);
        fclose($pipes[1] ?? null);
        fclose($pipes[2] ?? null);
        $code = proc_close($proc);
        if ($code !== 0) {
            $usePhpRestore = true;
        }
    }
    if ($usePhpRestore) {
        try {
            $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s', $params['host'], $params['port'], $params['database']);
            $pdo = new PDO($dsn, $params['user'], $params['password'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_TIMEOUT => 600,
            ]);
            $sql = file_get_contents($sqlFile);
            if ($sql === false) {
                throw new RuntimeException('Could not read SQL file');
            }
            foreach (restoreSplitSql($sql) as $statement) {
                if (trim($statement) !== '') {
                    $pdo->exec($statement);
                }
            }
        } catch (Exception $e) {
            if (is_dir($tmpDir)) {
                array_map('unlink', glob($tmpDir . DIRECTORY_SEPARATOR . '*'));
                @rmdir($tmpDir);
            }
            sendJSON(['error' => 'Restore failed (PHP): ' . $e->getMessage()], 500);
            return;
        }
        if (is_dir($tmpDir)) {
            array_map('unlink', glob($tmpDir . DIRECTORY_SEPARATOR . '*'));
            @rmdir($tmpDir);
        }
        sendJSON(['success' => true, 'message' => 'Database restored successfully (PHP).']);
        return;
    }
    if (is_dir($tmpDir)) {
        array_map('unlink', glob($tmpDir . DIRECTORY_SEPARATOR . '*'));
        @rmdir($tmpDir);
    }
    sendJSON(['success' => true, 'message' => 'Database restored successfully.']);
}

/**
 * Split SQL content into single statements for PHP restore.
 * Handles our PHP export format (statements end with ;\n).
 */
function restoreSplitSql(string $sql): array {
    $statements = [];
    $current = '';
    $len = strlen($sql);
    $i = 0;
    $inSingle = false;
    $inDouble = false;
    $escape = false;
    $lineComment = false;
    $blockComment = false;
    $blockEnd = 0;
    while ($i < $len) {
        $c = $sql[$i];
        if ($blockComment) {
            if ($i + 1 < $len && $c === '*' && $sql[$i + 1] === '/') {
                $blockComment = false;
                $i += 2;
                continue;
            }
            $i++;
            continue;
        }
        if ($lineComment) {
            if ($c === "\n") {
                $lineComment = false;
            }
            $i++;
            continue;
        }
        if ($i + 1 < $len && $c === '-' && $sql[$i + 1] === '-') {
            $lineComment = true;
            $i += 2;
            continue;
        }
        if ($i + 1 < $len && $c === '/' && $sql[$i + 1] === '*') {
            $blockComment = true;
            $i += 2;
            continue;
        }
        if ($inSingle || $inDouble) {
            if ($escape) {
                $escape = false;
                $i++;
                continue;
            }
            if ($c === '\\' && $inSingle) {
                $escape = true;
                $i++;
                continue;
            }
            if (($c === "'" && $inSingle) || ($c === '"' && $inDouble)) {
                $inSingle = false;
                $inDouble = false;
                $i++;
                continue;
            }
            $i++;
            continue;
        }
        if ($c === "'" && !$inDouble) {
            $inSingle = true;
            $i++;
            continue;
        }
        if ($c === '"' && !$inSingle) {
            $inDouble = true;
            $i++;
            continue;
        }
        if ($c === ';' && ($i + 1 >= $len || $sql[$i + 1] === "\n" || $sql[$i + 1] === "\r")) {
            $statements[] = trim($current);
            $current = '';
            $i++;
            if ($i < $len && $sql[$i] === "\r") $i++;
            if ($i < $len && $sql[$i] === "\n") $i++;
            continue;
        }
        $current .= $c;
        $i++;
    }
    if (trim($current) !== '') {
        $statements[] = trim($current);
    }
    return $statements;
}


// ============================================
// MONITORV2 ADDON FUNCTIONS
// ============================================

/**
 * Get Monitorv2 configuration
 */
function handleGetMonitorv2Config() {
    try {
        $db = getDB();
        
        // Get all settings with 'monitorv2_' prefix
        $stmt = $db->prepare("
            SELECT key, value 
            FROM settings 
            WHERE key LIKE 'monitorv2_%'
        ");
        $stmt->execute();
        $settings = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
        
        // Get addon status
        $statusStmt = $db->prepare("
            SELECT * FROM addon_status 
            WHERE addon_name = 'monitorv2'
        ");
        $statusStmt->execute();
        $status = $statusStmt->fetch(PDO::FETCH_ASSOC);
        
        // Initialize addon status if not exists
        if (!$status) {
            $db->prepare("
                INSERT INTO addon_status (addon_name, is_enabled, is_available, last_check_at)
                VALUES ('monitorv2', 0, 0, ?)
            ")->execute([time()]);
            $status = ['addon_name' => 'monitorv2', 'is_enabled' => 0, 'is_available' => 0];
        }
        
        sendJSON([
            'config' => [
                'enabled' => (bool)($settings['monitorv2_enabled'] ?? false),
                'pgHost' => $settings['monitorv2_pg_host'] ?? 'localhost',
                'pgPort' => (int)($settings['monitorv2_pg_port'] ?? 5433),
                'pgDatabase' => $settings['monitorv2_pg_database'] ?? 'postgres',
                'pgUser' => $settings['monitorv2_pg_user'] ?? 'postgres',
                // Don't send password back
                'retentionDays' => (int)($settings['monitorv2_retention_days'] ?? 90),
                'autoCleanup' => (bool)($settings['monitorv2_auto_cleanup'] ?? true)
            ],
            'status' => $status
        ]);
        
    } catch (Exception $e) {
        sendJSON(['error' => 'Failed to load configuration: ' . $e->getMessage()], 500);
    }
}

/**
 * Check Monitorv2 addon health status
 */
function handleCheckMonitorv2Status() {
    try {
        $db = getDB();
        
        // Check if enabled
        $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'monitorv2_enabled'");
        $stmt->execute();
        $enabled = ($stmt->fetchColumn() === '1');
        
        if (!$enabled) {
            sendJSON([
                'status' => 'disabled',
                'message' => 'Monitorv2 addon is disabled'
            ]);
            return;
        }
        
        // Try to connect to PostgreSQL
        $monitorv2DB = getMonitorv2DB();
        
        if (!$monitorv2DB) {
            sendJSON([
                'status' => 'unavailable',
                'message' => 'Cannot connect to PostgreSQL database'
            ]);
            return;
        }
        
        // Check if required tables exist
        $stmt = $monitorv2DB->query("
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'zmonitoring' 
            AND table_name IN ('monitors', 'monitor_checks', 'notification_rules')
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
        
        // Get monitor count
        $stmt = $monitorv2DB->query("SELECT COUNT(*) FROM zmonitoring.monitors");
        $monitorCount = $stmt->fetchColumn();
        
        $stmt = $monitorv2DB->query("SELECT COUNT(*) FROM zmonitoring.monitor_checks WHERE checked_at >= NOW() - INTERVAL '24 hours'");
        $checks24h = $stmt->fetchColumn();
        
        sendJSON([
            'status' => 'available',
            'message' => 'Monitorv2 is operational',
            'monitors' => (int)$monitorCount,
            'checks_24h' => (int)$checks24h
        ]);
        
    } catch (Exception $e) {
        sendJSON([
            'status' => 'error',
            'message' => 'Health check failed: ' . $e->getMessage()
        ], 500);
    }
}

/**
 * Test Monitorv2 PostgreSQL connection
 */
function handleTestMonitorv2Connection() {
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
            $data['pgPort'] ?? 5433,
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
        
        // Check if schema exists
        $stmt = $pdo->query("
            SELECT schema_name 
            FROM information_schema.schemata 
            WHERE schema_name = 'zmonitoring'
        ");
        $schemaExists = $stmt->fetch();
        
        // Check if tables exist
        $existingTables = [];
        if ($schemaExists) {
            $stmt = $pdo->query("
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'zmonitoring'
            ");
            $existingTables = $stmt->fetchAll(PDO::FETCH_COLUMN);
        }
        
        sendJSON([
            'success' => true,
            'message' => 'Connection successful',
            'details' => [
                'postgres_version' => $pdo->getAttribute(PDO::ATTR_SERVER_VERSION),
                'timescaledb_version' => $timescaledb['default_version'] ?? null,
                'timescaledb_installed' => !empty($timescaledbInstalled),
                'schema_exists' => !empty($schemaExists),
                'tables_exist' => $existingTables,
                'schema_ready' => in_array('monitors', $existingTables) && in_array('monitor_checks', $existingTables)
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
 * Update Monitorv2 configuration
 */
function handleUpdateMonitorv2Config() {
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
            'monitorv2_enabled' => !empty($data['enabled']) ? '1' : '0',
            'monitorv2_pg_host' => $data['pgHost'] ?? 'localhost',
            'monitorv2_pg_port' => (string)($data['pgPort'] ?? 5433),
            'monitorv2_pg_database' => $data['pgDatabase'] ?? 'postgres',
            'monitorv2_pg_user' => $data['pgUser'] ?? 'postgres',
            'monitorv2_retention_days' => (string)($data['retentionDays'] ?? 90),
            'monitorv2_auto_cleanup' => !empty($data['autoCleanup']) ? '1' : '0'
        ];
        
        // Update password only if provided
        if (!empty($data['pgPassword'])) {
            $settings['monitorv2_pg_password'] = $data['pgPassword'];
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
            INSERT INTO addon_status (addon_name, is_enabled, last_check_at)
            VALUES ('monitorv2', ?, ?)
            ON CONFLICT(addon_name) DO UPDATE SET is_enabled = excluded.is_enabled, last_check_at = excluded.last_check_at
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
 * Setup Monitorv2 database schema
 */
function handleSetupMonitorv2Schema() {
    try {
        $schemaFile = __DIR__ . '/../monitorv2/schema.sql';
        
        if (!file_exists($schemaFile)) {
            sendJSON(['error' => 'Schema file not found: ' . $schemaFile], 404);
            return;
        }
        
        // Get PostgreSQL connection
        $monitorv2DB = getMonitorv2DB();
        if (!$monitorv2DB) {
            sendJSON(['error' => 'Cannot connect to PostgreSQL. Please configure connection settings first.'], 400);
            return;
        }
        
        // Read and execute schema file
        $schemaSQL = file_get_contents($schemaFile);
        
        // Execute the entire schema at once (PostgreSQL supports this better than SQLite)
        try {
            $monitorv2DB->exec($schemaSQL);
        } catch (PDOException $e) {
            // Ignore "already exists" errors
            if (strpos($e->getMessage(), 'already exists') === false && 
                strpos($e->getMessage(), 'duplicate') === false) {
                throw $e;
            }
        }
        
        // Verify tables were created
        $stmt = $monitorv2DB->query("
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'zmonitoring'
        ");
        $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
        
        sendJSON([
            'success' => true,
            'message' => 'Schema setup completed',
            'tables_created' => $tables,
            'schema_ready' => in_array('monitors', $tables) && in_array('monitor_checks', $tables)
        ]);
        
    } catch (Exception $e) {
        sendJSON(['error' => 'Schema setup failed: ' . $e->getMessage()], 500);
    }
}

/**
 * Purge Monitorv2 data
 */
function handlePurgeMonitorv2Data() {
    try {
        $monitorv2DB = getMonitorv2DB();
        if (!$monitorv2DB) {
            sendJSON(['error' => 'Cannot connect to PostgreSQL'], 400);
            return;
        }
        
        // Get confirmation from request
        $data = getJSONInput();
        if (empty($data['confirm']) || $data['confirm'] !== 'DELETE_ALL_DATA') {
            sendJSON(['error' => 'Confirmation required. Send confirm: "DELETE_ALL_DATA"'], 400);
            return;
        }
        
        // Truncate all tables in zmonitoring schema
        $tables = [
            'notification_recipients',
            'notification_rules',
            'notification_logs',
            'monitor_checks',
            'monitor_hourly_stats',
            'monitor_daily_stats',
            'incidents',
            'maintenance_windows',
            'user_monitor_permissions',
            'monitors'
        ];
        
        $truncated = [];
        foreach ($tables as $table) {
            try {
                $monitorv2DB->exec("TRUNCATE TABLE zmonitoring.{$table} CASCADE");
                $truncated[] = $table;
            } catch (PDOException $e) {
                // Table might not exist, that's okay
            }
        }
        
        sendJSON([
            'success' => true,
            'message' => 'Monitorv2 data purged successfully',
            'tables_truncated' => $truncated
        ]);
        
    } catch (Exception $e) {
        sendJSON(['error' => 'Purge failed: ' . $e->getMessage()], 500);
    }
}

/**
 * Get Monitorv2 PostgreSQL connection
 */
function getMonitorv2DB() {
    static $db = null;
    if ($db !== null) return $db;
    
    try {
        $sqlite = getDB();
        $stmt = $sqlite->prepare("SELECT key, value FROM settings WHERE key LIKE 'monitorv2_%'");
        $stmt->execute();
        $settings = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
        
        $host = $settings['monitorv2_pg_host'] ?? 'localhost';
        $port = (int)($settings['monitorv2_pg_port'] ?? 5433);
        $database = $settings['monitorv2_pg_database'] ?? 'postgres';
        $user = $settings['monitorv2_pg_user'] ?? 'postgres';
        $password = $settings['monitorv2_pg_password'] ?? '';
        
        // Decrypt password if needed
        if (!empty($password) && strpos($password, '.') !== false && substr_count($password, '.') === 2) {
            try {
                $password = decryptPassword($password);
            } catch (Exception $e) {
                // Keep as-is if decryption fails
            }
        }
        
        $dsn = "pgsql:host={$host};port={$port};dbname={$database}";
        $db = new PDO($dsn, $user, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT => 10
        ]);
        return $db;
    } catch (PDOException $e) {
        error_log("Monitorv2 DB connection failed: " . $e->getMessage());
        return null;
    }
}
