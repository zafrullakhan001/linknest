<?php
/**
 * OPcache & SQLite Status Dashboard
 * 
 * This page displays OPcache status and SQLite database statistics.
 */

// Set content type to HTML
header('Content-Type: text/html; charset=utf-8');

// Database configuration - Use config.php if available, otherwise try default paths
// This works both in Docker (/var/www/html) and local development
if (file_exists(__DIR__ . '/api/config.php')) {
    // Load config.php but suppress any output/errors that might break the page
    $oldErrorReporting = error_reporting(0);
    $oldDisplayErrors = ini_get('display_errors');
    ini_set('display_errors', 0);
    
    try {
        require_once __DIR__ . '/api/config.php';
        // DB_PATH and DB_DIR are now defined from config.php
    } catch (Exception $e) {
        // If config.php fails, fall through to default paths
    }
    
    error_reporting($oldErrorReporting);
    ini_set('display_errors', $oldDisplayErrors);
}

// Fallback: Use default Docker/standard paths if DB_PATH not defined
if (!defined('DB_PATH')) {
    // Try Docker path first (/var/www/html/data/linknest.db)
    $dbPath1 = __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'linknest.db';
    $dbPath2 = __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'linknext.db';
    define('DB_PATH', file_exists($dbPath1) ? $dbPath1 : (file_exists($dbPath2) ? $dbPath2 : $dbPath1));
}

if (!defined('DB_DIR')) {
    define('DB_DIR', dirname(DB_PATH));
}

// Get OPcache status
$opcacheLoaded = extension_loaded('Zend OPcache');
$opcacheStatus = false;
$opcacheConfig = false;
$isCli = php_sapi_name() === 'cli';

if ($opcacheLoaded) {
    $opcacheStatus = opcache_get_status();
    $opcacheConfig = opcache_get_configuration();
}

// Get SQLite database statistics
$sqliteStats = [];
$dbError = null;

try {
    if (file_exists(DB_PATH)) {
        $db = new PDO('sqlite:' . DB_PATH);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        
        // Set busy timeout
        $db->exec('PRAGMA busy_timeout = 5000');
        
        // Get database file size
        $sqliteStats['file_size'] = filesize(DB_PATH);
        
        // Get PRAGMA settings
        $pragmas = [
            'journal_mode', 'synchronous', 'cache_size', 'page_size', 
            'temp_store', 'busy_timeout', 'foreign_keys', 'wal_autocheckpoint'
        ];
        
        foreach ($pragmas as $pragma) {
            try {
                $stmt = $db->query("PRAGMA {$pragma}");
                $result = $stmt->fetch(PDO::FETCH_NUM);
                $sqliteStats['pragmas'][$pragma] = $result[0] ?? 'N/A';
            } catch (PDOException $e) {
                $sqliteStats['pragmas'][$pragma] = 'Error';
            }
        }
        
        // Get table information
        $tables = ['users', 'tiles', 'tabs', 'sections', 'links', 'settings', 'tile_arrangements', 'category_arrangements'];
        $sqliteStats['tables'] = [];
        $totalRows = 0;
        
        foreach ($tables as $table) {
            try {
                $stmt = $db->query("SELECT COUNT(*) FROM {$table}");
                $count = $stmt->fetchColumn();
                $sqliteStats['tables'][$table] = (int)$count;
                $totalRows += (int)$count;
            } catch (PDOException $e) {
                $sqliteStats['tables'][$table] = 'N/A';
            }
        }
        
        $sqliteStats['total_rows'] = $totalRows;
        
        // Get index information
        try {
            $stmt = $db->query("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'");
            $indexes = $stmt->fetchAll(PDO::FETCH_COLUMN);
            $sqliteStats['indexes'] = $indexes;
            $sqliteStats['index_count'] = count($indexes);
        } catch (PDOException $e) {
            $sqliteStats['indexes'] = [];
            $sqliteStats['index_count'] = 0;
        }
        
        // Get database page count and size info
        try {
            $stmt = $db->query("PRAGMA page_count");
            $sqliteStats['page_count'] = (int)$stmt->fetchColumn();
            
            $stmt = $db->query("PRAGMA page_size");
            $pageSize = (int)$stmt->fetchColumn();
            $sqliteStats['page_size'] = $pageSize;
            $sqliteStats['calculated_size'] = $sqliteStats['page_count'] * $pageSize;
        } catch (PDOException $e) {
            $sqliteStats['page_count'] = 0;
            $sqliteStats['page_size'] = 0;
            $sqliteStats['calculated_size'] = 0;
        }
        
        // Get WAL file info if in WAL mode
        if ($sqliteStats['pragmas']['journal_mode'] === 'wal') {
            $walFile = DB_PATH . '-wal';
            $shmFile = DB_PATH . '-shm';
            $sqliteStats['wal_size'] = file_exists($walFile) ? filesize($walFile) : 0;
            $sqliteStats['shm_size'] = file_exists($shmFile) ? filesize($shmFile) : 0;
        }
        
    } else {
        $dbError = 'Database file not found at: ' . DB_PATH;
    }
} catch (Exception $e) {
    $dbError = 'Error accessing database: ' . $e->getMessage();
}

// Get application name from settings (fallback to "LinkNest" if not found)
$appName = 'LinkNest'; // Default fallback
try {
    if (isset($db) && $db) {
        $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'app_name' LIMIT 1");
        $stmt->execute();
        $row = $stmt->fetch();
        if ($row && !empty($row['value'])) {
            $appName = $row['value'];
        }
    } elseif (file_exists(DB_PATH)) {
        // Try to get app_name directly if db connection wasn't established above
        $tempDb = new PDO('sqlite:' . DB_PATH);
        $tempDb->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $stmt = $tempDb->prepare("SELECT value FROM settings WHERE key = 'app_name' LIMIT 1");
        $stmt->execute();
        $row = $stmt->fetch();
        if ($row && !empty($row['value'])) {
            $appName = $row['value'];
        }
        unset($tempDb);
    }
} catch (Exception $e) {
    // If we can't get app_name, just use the default "LinkNest"
    // This ensures the page still works even if there's a database issue
}

// Format bytes helper
function formatBytes($bytes, $precision = 2) {
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= pow(1024, $pow);
    return round($bytes, $precision) . ' ' . $units[$pow];
}

// Format number helper
function formatNumber($number) {
    return number_format($number, 0, '.', ',');
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($appName); ?> - System Status</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
            color: #333;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        
        .header {
            background: white;
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        
        .header h1 {
            color: #667eea;
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        
        .header p {
            color: #666;
            font-size: 1.1em;
        }
        
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
            gap: 30px;
            margin-bottom: 30px;
        }
        
        .card {
            background: white;
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        
        .card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 40px rgba(0,0,0,0.3);
        }
        
        .card h2 {
            color: #667eea;
            font-size: 1.8em;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 3px solid #667eea;
        }
        
        .status-badge {
            display: inline-block;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 0.9em;
            margin-bottom: 20px;
        }
        
        .status-success {
            background: #10b981;
            color: white;
        }
        
        .status-warning {
            background: #f59e0b;
            color: white;
        }
        
        .status-error {
            background: #ef4444;
            color: white;
        }
        
        .status-info {
            background: #3b82f6;
            color: white;
        }
        
        .stat-row {
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        
        .stat-row:last-child {
            border-bottom: none;
        }
        
        .stat-label {
            font-weight: 600;
            color: #4b5563;
        }
        
        .stat-value {
            color: #1f2937;
            font-weight: 500;
        }
        
        .stat-value.highlight {
            color: #667eea;
            font-weight: 700;
        }
        
        .progress-bar {
            width: 100%;
            height: 30px;
            background: #e5e7eb;
            border-radius: 15px;
            overflow: hidden;
            margin: 10px 0;
            position: relative;
        }
        
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
            border-radius: 15px;
            transition: width 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 0.85em;
        }
        
        .table-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }
        
        .table-card {
            background: #f9fafb;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }
        
        .table-name {
            font-weight: 600;
            color: #4b5563;
            margin-bottom: 5px;
            text-transform: capitalize;
        }
        
        .table-count {
            font-size: 1.5em;
            color: #667eea;
            font-weight: bold;
        }
        
        .index-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 10px;
        }
        
        .index-badge {
            background: #e0e7ff;
            color: #4338ca;
            padding: 5px 12px;
            border-radius: 15px;
            font-size: 0.85em;
            font-weight: 500;
        }
        
        .info-box {
            background: #eff6ff;
            border-left: 4px solid #3b82f6;
            padding: 15px;
            border-radius: 6px;
            margin-top: 20px;
        }
        
        .info-box p {
            color: #1e40af;
            line-height: 1.6;
        }
        
        .error-box {
            background: #fef2f2;
            border-left: 4px solid #ef4444;
            padding: 15px;
            border-radius: 6px;
            margin-top: 20px;
        }
        
        .error-box p {
            color: #991b1b;
        }
        
        @media (max-width: 768px) {
            .grid {
                grid-template-columns: 1fr;
            }
            
            .header h1 {
                font-size: 2em;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 <?php echo htmlspecialchars($appName); ?> System Status</h1>
            <p>OPcache & SQLite Database Performance Dashboard</p>
        </div>
        
        <div class="grid">
            <!-- OPcache Status Card -->
            <div class="card">
                <h2>OPcache Status</h2>
                <?php if ($opcacheLoaded): ?>
                    <?php if ($opcacheStatus !== false): ?>
                        <span class="status-badge status-success">✓ ENABLED & ACTIVE</span>
                        
                        <div class="stat-row">
                            <span class="stat-label">Memory Used</span>
                            <span class="stat-value highlight">
                                <?php echo formatBytes($opcacheStatus['memory_usage']['used_memory']); ?>
                            </span>
                        </div>
                        <div class="stat-row">
                            <span class="stat-label">Memory Free</span>
                            <span class="stat-value">
                                <?php echo formatBytes($opcacheStatus['memory_usage']['free_memory']); ?>
                            </span>
                        </div>
                        <div class="stat-row">
                            <span class="stat-label">Total Memory</span>
                            <span class="stat-value highlight">
                                <?php 
                                $totalMem = $opcacheStatus['memory_usage']['used_memory'] + $opcacheStatus['memory_usage']['free_memory'];
                                echo formatBytes($totalMem);
                                ?>
                            </span>
                        </div>
                        
                        <?php 
                        $usedPercent = ($opcacheStatus['memory_usage']['used_memory'] / $totalMem) * 100;
                        ?>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: <?php echo $usedPercent; ?>%">
                                <?php echo round($usedPercent, 1); ?>%
                            </div>
                        </div>
                        
                        <div class="stat-row">
                            <span class="stat-label">Wasted Memory</span>
                            <span class="stat-value">
                                <?php echo formatBytes($opcacheStatus['memory_usage']['wasted_memory']); ?>
                            </span>
                        </div>
                        
                        <h3 style="margin-top: 25px; margin-bottom: 15px; color: #667eea; font-size: 1.3em;">Statistics</h3>
                        <div class="stat-row">
                            <span class="stat-label">Cached Scripts</span>
                            <span class="stat-value highlight">
                                <?php echo formatNumber($opcacheStatus['opcache_statistics']['num_cached_scripts']); ?>
                            </span>
                        </div>
                        <div class="stat-row">
                            <span class="stat-label">Cache Hits</span>
                            <span class="stat-value highlight">
                                <?php echo formatNumber($opcacheStatus['opcache_statistics']['hits']); ?>
                            </span>
                        </div>
                        <div class="stat-row">
                            <span class="stat-label">Cache Misses</span>
                            <span class="stat-value">
                                <?php echo formatNumber($opcacheStatus['opcache_statistics']['misses']); ?>
                            </span>
                        </div>
                        <?php 
                        $totalRequests = $opcacheStatus['opcache_statistics']['hits'] + $opcacheStatus['opcache_statistics']['misses'];
                        if ($totalRequests > 0):
                            $hitRate = ($opcacheStatus['opcache_statistics']['hits'] / $totalRequests) * 100;
                        ?>
                        <div class="stat-row">
                            <span class="stat-label">Hit Rate</span>
                            <span class="stat-value highlight">
                                <?php echo round($hitRate, 2); ?>%
                            </span>
                        </div>
                        <?php endif; ?>
                        
                        <?php if ($opcacheConfig): ?>
                        <h3 style="margin-top: 25px; margin-bottom: 15px; color: #667eea; font-size: 1.3em;">Configuration</h3>
                        <div class="stat-row">
                            <span class="stat-label">Memory Limit</span>
                            <span class="stat-value">
                                <?php echo $opcacheConfig['directives']['opcache.memory_consumption']; ?> MB
                            </span>
                        </div>
                        <div class="stat-row">
                            <span class="stat-label">Max Files</span>
                            <span class="stat-value">
                                <?php echo formatNumber($opcacheConfig['directives']['opcache.max_accelerated_files']); ?>
                            </span>
                        </div>
                        <div class="stat-row">
                            <span class="stat-label">Validate Timestamps</span>
                            <span class="stat-value">
                                <?php echo $opcacheConfig['directives']['opcache.validate_timestamps'] ? 'Yes' : 'No'; ?>
                            </span>
                        </div>
                        <div class="stat-row">
                            <span class="stat-label">Revalidate Frequency</span>
                            <span class="stat-value">
                                <?php echo $opcacheConfig['directives']['opcache.revalidate_freq']; ?> seconds
                            </span>
                        </div>
                        <?php endif; ?>
                    <?php else: ?>
                        <span class="status-badge status-warning">⚠ EXTENSION LOADED BUT INACTIVE</span>
                        <?php if ($isCli): ?>
                        <div class="info-box">
                            <p><strong>Note:</strong> You are viewing this page via CLI. OPcache is enabled for web requests but disabled for CLI (this is normal). Access this page via web browser to see full statistics.</p>
                        </div>
                        <?php else: ?>
                        <div class="info-box">
                            <p>OPcache extension is loaded but not active. Check your php.ini configuration.</p>
                        </div>
                        <?php endif; ?>
                    <?php endif; ?>
                <?php else: ?>
                    <span class="status-badge status-error">✗ NOT LOADED</span>
                    <div class="error-box">
                        <p>OPcache extension is not loaded. To enable it, edit php.ini and uncomment or add: <code>zend_extension=opcache</code></p>
                    </div>
                <?php endif; ?>
            </div>
            
            <!-- SQLite Status Card -->
            <div class="card">
                <h2>SQLite Database Status</h2>
                <?php if ($dbError): ?>
                    <span class="status-badge status-error">✗ ERROR</span>
                    <div class="error-box">
                        <p><?php echo htmlspecialchars($dbError); ?></p>
                    </div>
                <?php elseif (!empty($sqliteStats)): ?>
                    <span class="status-badge status-success">✓ CONNECTED</span>
                    
                    <h3 style="margin-top: 20px; margin-bottom: 15px; color: #667eea; font-size: 1.3em;">Database Size</h3>
                    <div class="stat-row">
                        <span class="stat-label">File Size</span>
                        <span class="stat-value highlight">
                            <?php echo formatBytes($sqliteStats['file_size']); ?>
                        </span>
                    </div>
                    <?php if (isset($sqliteStats['calculated_size']) && $sqliteStats['calculated_size'] > 0): ?>
                    <div class="stat-row">
                        <span class="stat-label">Calculated Size</span>
                        <span class="stat-value">
                            <?php echo formatBytes($sqliteStats['calculated_size']); ?>
                        </span>
                    </div>
                    <?php endif; ?>
                    <?php if (isset($sqliteStats['wal_size']) && $sqliteStats['wal_size'] > 0): ?>
                    <div class="stat-row">
                        <span class="stat-label">WAL File Size</span>
                        <span class="stat-value">
                            <?php echo formatBytes($sqliteStats['wal_size']); ?>
                        </span>
                    </div>
                    <?php endif; ?>
                    <?php if (isset($sqliteStats['shm_size']) && $sqliteStats['shm_size'] > 0): ?>
                    <div class="stat-row">
                        <span class="stat-label">SHM File Size</span>
                        <span class="stat-value">
                            <?php echo formatBytes($sqliteStats['shm_size']); ?>
                        </span>
                    </div>
                    <?php endif; ?>
                    
                    <h3 style="margin-top: 25px; margin-bottom: 15px; color: #667eea; font-size: 1.3em;">Database Statistics</h3>
                    <div class="stat-row">
                        <span class="stat-label">Total Rows</span>
                        <span class="stat-value highlight">
                            <?php echo formatNumber($sqliteStats['total_rows']); ?>
                        </span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Indexes</span>
                        <span class="stat-value highlight">
                            <?php echo formatNumber($sqliteStats['index_count']); ?>
                        </span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Page Count</span>
                        <span class="stat-value">
                            <?php echo formatNumber($sqliteStats['page_count']); ?>
                        </span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Page Size</span>
                        <span class="stat-value">
                            <?php echo formatBytes($sqliteStats['page_size']); ?>
                        </span>
                    </div>
                    
                    <h3 style="margin-top: 25px; margin-bottom: 15px; color: #667eea; font-size: 1.3em;">Table Row Counts</h3>
                    <div class="table-grid">
                        <?php foreach ($sqliteStats['tables'] as $table => $count): ?>
                        <div class="table-card">
                            <div class="table-name"><?php echo htmlspecialchars($table); ?></div>
                            <div class="table-count"><?php echo is_numeric($count) ? formatNumber($count) : $count; ?></div>
                        </div>
                        <?php endforeach; ?>
                    </div>
                    
                    <?php if (!empty($sqliteStats['indexes'])): ?>
                    <h3 style="margin-top: 25px; margin-bottom: 15px; color: #667eea; font-size: 1.3em;">Database Indexes</h3>
                    <div class="index-list">
                        <?php foreach ($sqliteStats['indexes'] as $index): ?>
                        <span class="index-badge"><?php echo htmlspecialchars($index); ?></span>
                        <?php endforeach; ?>
                    </div>
                    <?php endif; ?>
                <?php endif; ?>
            </div>
        </div>
        
        <!-- SQLite Configuration Card -->
        <?php if (!empty($sqliteStats['pragmas'])): ?>
        <div class="card">
            <h2>SQLite Performance Configuration</h2>
            <div class="stat-row">
                <span class="stat-label">Journal Mode</span>
                <span class="stat-value highlight">
                    <?php echo strtoupper($sqliteStats['pragmas']['journal_mode']); ?>
                </span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Synchronous Mode</span>
                <span class="stat-value">
                    <?php echo strtoupper($sqliteStats['pragmas']['synchronous']); ?>
                </span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Cache Size</span>
                <span class="stat-value">
                    <?php 
                    $cacheSize = $sqliteStats['pragmas']['cache_size'];
                    if (is_numeric($cacheSize) && $cacheSize < 0) {
                        echo formatBytes(abs($cacheSize) * 1024);
                    } else {
                        echo $cacheSize . ' pages';
                    }
                    ?>
                </span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Page Size</span>
                <span class="stat-value">
                    <?php echo formatBytes($sqliteStats['pragmas']['page_size']); ?>
                </span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Temp Store</span>
                <span class="stat-value">
                    <?php echo strtoupper($sqliteStats['pragmas']['temp_store']); ?>
                </span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Busy Timeout</span>
                <span class="stat-value">
                    <?php echo $sqliteStats['pragmas']['busy_timeout']; ?> ms
                </span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Foreign Keys</span>
                <span class="stat-value">
                    <?php echo $sqliteStats['pragmas']['foreign_keys'] ? 'ENABLED' : 'DISABLED'; ?>
                </span>
            </div>
            <?php if (isset($sqliteStats['pragmas']['wal_autocheckpoint'])): ?>
            <div class="stat-row">
                <span class="stat-label">WAL Auto Checkpoint</span>
                <span class="stat-value">
                    <?php echo $sqliteStats['pragmas']['wal_autocheckpoint']; ?> pages
                </span>
            </div>
            <?php endif; ?>
            
            <div class="info-box" style="margin-top: 25px;">
                <p><strong>Performance Notes:</strong></p>
                <ul style="margin-left: 20px; margin-top: 10px; line-height: 1.8;">
                    <li>WAL mode enables better concurrent access</li>
                    <li>Cache size of 10MB improves read performance</li>
                    <li>Temp store in memory speeds up temporary operations</li>
                    <li>Foreign keys ensure data integrity</li>
                </ul>
            </div>
        </div>
        <?php endif; ?>
        
        <!-- PHP Info Card -->
        <div class="card">
            <h2>PHP Configuration</h2>
            <div class="stat-row">
                <span class="stat-label">PHP Version</span>
                <span class="stat-value highlight"><?php echo PHP_VERSION; ?></span>
            </div>
            <div class="stat-row">
                <span class="stat-label">SAPI</span>
                <span class="stat-value"><?php echo php_sapi_name(); ?></span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Loaded php.ini</span>
                <span class="stat-value" style="font-size: 0.9em;"><?php echo php_ini_loaded_file(); ?></span>
            </div>
            <div class="stat-row">
                <span class="stat-label">OPcache Enabled (Web)</span>
                <span class="stat-value">
                    <?php echo ini_get('opcache.enable') ? 'YES' : 'NO'; ?>
                </span>
            </div>
            <div class="stat-row">
                <span class="stat-label">OPcache Enabled (CLI)</span>
                <span class="stat-value">
                    <?php echo ini_get('opcache.enable_cli') ? 'YES' : 'NO'; ?>
                </span>
            </div>
        </div>
    </div>
</body>
</html>
