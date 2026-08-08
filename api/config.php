<?php
// Disable error display, log errors instead
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

// Set timezone to match system time
// On Windows, ALWAYS use the Windows system timezone to match the system clock
// This overrides php.ini settings to ensure times match what the user sees on their system
if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
    // On Windows, detect and use the actual Windows system timezone
    try {
        // Get Windows timezone using tzutil (Windows Vista+)
        $output = @shell_exec('tzutil /g 2>nul');
        if ($output) {
            $winTz = trim($output);
            // Common Windows to PHP timezone mappings
            $tzMap = [
                'Eastern Standard Time' => 'America/New_York',
                'Central Standard Time' => 'America/Chicago',
                'Mountain Standard Time' => 'America/Denver',
                'Pacific Standard Time' => 'America/Los_Angeles',
                'GMT Standard Time' => 'Europe/London',
                'W. Europe Standard Time' => 'Europe/Berlin',
                'Central Europe Standard Time' => 'Europe/Berlin',
                'Romance Standard Time' => 'Europe/Paris',
                'W. Central Africa Standard Time' => 'Africa/Lagos',
                'Tokyo Standard Time' => 'Asia/Tokyo',
                'China Standard Time' => 'Asia/Shanghai',
                'India Standard Time' => 'Asia/Kolkata',
                'AUS Eastern Standard Time' => 'Australia/Sydney',
                'US Eastern Standard Time' => 'America/New_York',
                'US Central Standard Time' => 'America/Chicago',
                'US Mountain Standard Time' => 'America/Denver',
                'US Pacific Standard Time' => 'America/Los_Angeles',
            ];
            if (isset($tzMap[$winTz])) {
                date_default_timezone_set($tzMap[$winTz]);
            } else {
                // Try to use offset-based detection for unmapped timezones
                $offsetHours = @shell_exec('w32tm /tz 2>nul');
                if ($offsetHours && preg_match('/Bias: -?(\d+)/', $offsetHours, $matches)) {
                    $biasMinutes = (int)$matches[1];
                    $offsetHours = -$biasMinutes / 60;
                    // Create timezone from offset (e.g., Etc/GMT+5 for GMT-5)
                    // Note: PHP uses inverted sign for Etc/GMT timezones
                    $tzName = sprintf('Etc/GMT%+d', (int)-$offsetHours);
                    @date_default_timezone_set($tzName);
                } else {
                    // Fallback: log warning and use PHP's detected timezone
                    $detectedTz = @date_default_timezone_get();
                    error_log("Warning: Could not map Windows timezone '$winTz' to PHP timezone. Using: " . ($detectedTz ?: 'UTC'));
                    date_default_timezone_set($detectedTz ?: 'UTC');
                }
            }
        } else {
            // tzutil not available, try using PHP's detected timezone
            $detectedTz = @date_default_timezone_get();
            error_log("Warning: Could not detect Windows timezone using tzutil. Using: " . ($detectedTz ?: 'UTC'));
            date_default_timezone_set($detectedTz ?: 'UTC');
        }
    } catch (Exception $e) {
        // If detection fails completely, fall back to PHP's detected timezone
        $detectedTz = @date_default_timezone_get();
        error_log("Error detecting Windows timezone: " . $e->getMessage() . ". Using: " . ($detectedTz ?: 'UTC'));
        date_default_timezone_set($detectedTz ?: 'UTC');
    }
} else {
    // Non-Windows: respect php.ini or auto-detect
    $tz = ini_get('date.timezone');
    if (empty($tz)) {
        $detectedTz = @date_default_timezone_get();
        date_default_timezone_set($detectedTz ?: 'UTC');
    } else {
        date_default_timezone_set($tz);
    }
}

// Start output buffering to prevent any accidental output
if (!ob_get_level()) {
    ob_start();
}

// Set custom error handler to prevent HTML output
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    // Log the error but don't output it
    error_log("PHP Error [$errno]: $errstr in $errfile on line $errline");
    // Return false to let PHP handle it normally (but display_errors is off, so it won't output)
    return false;
}, E_ALL);

// Set exception handler
set_exception_handler(function($exception) {
    // Clean any output
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    error_log("Uncaught exception: " . $exception->getMessage() . " in " . $exception->getFile() . " on line " . $exception->getLine());
    // Send JSON error if headers not sent
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'An internal server error occurred']);
    }
    exit;
});

// Database configuration
define('DB_PATH', __DIR__ . '/../data/linknest.db');
define('DB_DIR', __DIR__ . '/../data');
define('SYSTEM_TOKEN', 'linknest_secret_token_123'); // Change this for production!

// Bump when schema/migrations in initDatabase() change. Enables fast-path getDB().
if (!defined('LINKNEST_SCHEMA_VERSION')) {
    define('LINKNEST_SCHEMA_VERSION', 74);
}

/**
 * Generate a RFC 4122 UUID v4 string.
 */
function generateUuid(): string {
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
}

/**
 * Return true if value is a valid UUID v4 string.
 */
function isValidUuid($value): bool {
    return is_string($value) && (bool)preg_match(
        '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',
        $value
    );
}

require_once __DIR__ . '/response_cache.php';

// Create data directory if it doesn't exist
if (!file_exists(DB_DIR)) {
    if (!mkdir(DB_DIR, 0755, true)) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Failed to create data directory']);
        exit;
    }
}

// CORS headers for development (skip if in analytics API mode)
if (!defined('ANALYTICS_API_MODE') || !ANALYTICS_API_MODE) {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    
    // Handle preflight requests
    if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit;
    }
}

// Check if PDO SQLite is available
if (!extension_loaded('pdo_sqlite')) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'PDO SQLite extension is not enabled. Please enable it in php.ini']);
    exit;
}

/**
 * Acquire an exclusive file lock so only one PHP worker runs schema bootstrap at a time.
 * Prevents SQLite "database is locked" errors on concurrent cold-start requests (XAMPP/Apache).
 */
function acquireDatabaseInitLock() {
    $lockPath = DB_DIR . '/.db_init.lock';
    $fp = @fopen($lockPath, 'c+');
    if ($fp === false) {
        return null;
    }
    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        return null;
    }
    return $fp;
}

function releaseDatabaseInitLock($fp) {
    if ($fp !== null && is_resource($fp)) {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

/**
 * Apply SQLite 3.53+ performance pragmas on an open connection.
 * Safe to call on every connection; values are connection-scoped except journal_mode.
 *
 * @param bool $heavy When false (default hot path), skip PRAGMA optimize + OS prefetch
 * @return array<string, mixed> Applied / verified pragma values
 */
function applySqlitePerformancePragmas(PDO $db, bool $heavy = false): array {
    $applied = [];

    // Concurrent access under Apache multi-worker
    $db->exec('PRAGMA busy_timeout = 5000');
    $applied['busy_timeout'] = 5000;

    // Project convention: FK enforcement off at engine level
    $db->exec('PRAGMA foreign_keys = OFF');
    $applied['foreign_keys'] = 'OFF';

    // WAL: concurrent readers + faster commits (disk is for durable commit only)
    try {
        $db->exec('PRAGMA journal_mode = WAL');
        $applied['journal_mode'] = (string)$db->query('PRAGMA journal_mode')->fetchColumn();
    } catch (PDOException $e) {
        // Ignore if unavailable
    }

    // Memory-mapped I/O — entire small DBs are effectively addressable as RAM
    try {
        $db->exec('PRAGMA mmap_size = 268435456'); // 256 MB cap; only maps file size
        $applied['mmap_size'] = (int)$db->query('PRAGMA mmap_size')->fetchColumn();
    } catch (PDOException $e) {
        error_log('Warning: mmap_size not available: ' . $e->getMessage());
    }

    // Page cache sized to hold the whole DB (+ working set) in RAM
    $cacheKiB = sizeSqlitePageCacheForDatabase($db);
    $applied['cache_size'] = (int)$db->query('PRAGMA cache_size')->fetchColumn();
    $applied['cache_size_kib'] = $cacheKiB;

    // With WAL, NORMAL is durable against corruption and much faster than FULL
    $db->exec('PRAGMA synchronous = NORMAL');
    $applied['synchronous'] = (int)$db->query('PRAGMA synchronous')->fetchColumn();

    // Keep sorts / temp tables in memory
    $db->exec('PRAGMA temp_store = MEMORY');
    $applied['temp_store'] = (int)$db->query('PRAGMA temp_store')->fetchColumn();

    // Parallel sort / index build threads (MAX_WORKER_THREADS=8 in SQLite 3.53.4)
    try {
        $db->exec('PRAGMA threads = 4');
        $applied['threads'] = (int)$db->query('PRAGMA threads')->fetchColumn();
    } catch (PDOException $e) {
        // Older builds without worker threads — ignore
    }

    // Prevent unbounded WAL growth (hurts read latency)
    try {
        $db->exec('PRAGMA journal_size_limit = 67108864'); // 64 MB
        $applied['journal_size_limit'] = (int)$db->query('PRAGMA journal_size_limit')->fetchColumn();
    } catch (PDOException $e) {
        // Ignore
    }

    try {
        $db->exec('PRAGMA wal_autocheckpoint = 1000');
        $applied['wal_autocheckpoint'] = 1000;
    } catch (PDOException $e) {
        // Ignore if not in WAL
    }

    // Heavy work only during schema bootstrap / explicit maintenance — never on hot path
    if ($heavy) {
        $applied['ram_prefetch'] = warmSqliteOsPageCache();
        try {
            $db->exec('PRAGMA optimize');
            $applied['optimize'] = true;
        } catch (PDOException $e) {
            // Ignore
        }
    } else {
        $applied['ram_prefetch'] = false;
        $applied['optimize'] = false;
    }

    try {
        $applied['sqlite_version'] = (string)$db->query('SELECT sqlite_version()')->fetchColumn();
    } catch (PDOException $e) {
        // Ignore
    }

    try {
        $pageCount = (int)$db->query('PRAGMA page_count')->fetchColumn();
        $pageSize = (int)$db->query('PRAGMA page_size')->fetchColumn();
        $applied['database_bytes'] = $pageCount * $pageSize;
        $applied['ram_resident'] = ($cacheKiB * 1024) >= ($pageCount * $pageSize);
    } catch (PDOException $e) {
        // Ignore
    }

    return $applied;
}

/**
 * Size SQLite's page cache so the working set (≈ entire LinkNest DB) stays in RAM.
 * Negative PRAGMA cache_size is KiB. Min 32 MiB, max 512 MiB.
 */
function sizeSqlitePageCacheForDatabase(PDO $db): int {
    $dbBytes = 0;
    try {
        $pageCount = (int)$db->query('PRAGMA page_count')->fetchColumn();
        $pageSize = (int)$db->query('PRAGMA page_size')->fetchColumn();
        $dbBytes = $pageCount * $pageSize;
    } catch (PDOException $e) {
        // Ignore
    }
    if ($dbBytes <= 0 && defined('DB_PATH') && is_file(DB_PATH)) {
        $dbBytes = (int)@filesize(DB_PATH);
    }

    // 2x file size covers pages + indexes + query scratch; floor/ceiling for safety
    $kib = (int)ceil(($dbBytes * 2) / 1024);
    $kib = max($kib, 32768);   // at least 32 MiB
    $kib = min($kib, 524288);  // at most 512 MiB

    $db->exec('PRAGMA cache_size = -' . $kib);
    return $kib;
}

/**
 * Pull the on-disk DB into the OS page cache (and help mmap fault pages in).
 * Safe for multi-worker: read-only prefetch; commits still go to the file via WAL.
 * Runs at most once per PHP worker. Skips files larger than 64 MiB.
 */
function warmSqliteOsPageCache(): bool {
    static $done = false;
    if ($done) {
        return true;
    }
    if (!defined('DB_PATH') || !is_readable(DB_PATH)) {
        return false;
    }
    $size = @filesize(DB_PATH);
    if ($size === false || $size <= 0 || $size > 64 * 1024 * 1024) {
        return false;
    }

    $fh = @fopen(DB_PATH, 'rb');
    if ($fh === false) {
        return false;
    }
    try {
        while (!feof($fh)) {
            $chunk = fread($fh, 1024 * 1024);
            if ($chunk === false || $chunk === '') {
                break;
            }
        }
        foreach ([DB_PATH . '-wal', DB_PATH . '-shm'] as $side) {
            if (is_readable($side) && (@filesize($side) ?: 0) > 0 && (@filesize($side) ?: 0) <= 16 * 1024 * 1024) {
                @file_get_contents($side);
            }
        }
        $done = true;
        return true;
    } finally {
        fclose($fh);
    }
}

/**
 * Ensure tile header-image / emoji visibility columns exist even when user_version already matches SCHEMA_VERSION.
 * Guards against version bumps that raced ahead of column ALTERs.
 */
function ensureTilesHeaderImageColumns(PDO $db): void {
    static $ensured = false;
    if ($ensured) {
        return;
    }
    try {
        $columns = $db->query('PRAGMA table_info(tiles)')->fetchAll(PDO::FETCH_ASSOC);
        if (empty($columns)) {
            return;
        }
        $names = array_column($columns, 'name');
        $needed = [
            'header_image' => 'TEXT',
            'header_image_align' => 'TEXT',
            'header_image_opacity' => 'INTEGER',
            'header_image_offset_x' => 'INTEGER',
            'header_image_fit' => 'TEXT',
            'show_emoji' => 'INTEGER DEFAULT 1',
            'emoji_image' => 'TEXT',
            'show_title' => 'INTEGER DEFAULT 1',
            'show_description' => 'INTEGER DEFAULT 1',
            'header_image_offset_y' => 'INTEGER',
        ];
        foreach ($needed as $col => $type) {
            if (!in_array($col, $names, true)) {
                $db->exec("ALTER TABLE tiles ADD COLUMN {$col} {$type}");
            }
        }
        $ensured = true;
    } catch (PDOException $e) {
        error_log('ensureTilesHeaderImageColumns warning: ' . $e->getMessage());
    }
}

// Initialize database
function initDatabase() {
    $initLock = null;
    try {
        $db = new PDO('sqlite:' . DB_PATH);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

        // Hot path: light pragmas only (no optimize / file warmup)
        applySqlitePerformancePragmas($db, false);

        // Fast path: schema already migrated — skip hundreds of CREATE/ALTER statements.
        // Critical under Apache ZTS where each thread has its own static getDB() cache.
        $currentVersion = 0;
        try {
            $currentVersion = (int)$db->query('PRAGMA user_version')->fetchColumn();
        } catch (PDOException $e) {
            $currentVersion = 0;
        }
        if ($currentVersion >= (int)LINKNEST_SCHEMA_VERSION) {
            ensureTilesHeaderImageColumns($db);
            return $db;
        }

        // Serialize schema bootstrap across concurrent Apache workers/threads
        $initLock = acquireDatabaseInitLock();

        // Re-check after lock (another thread may have finished migrating)
        try {
            $currentVersion = (int)$db->query('PRAGMA user_version')->fetchColumn();
        } catch (PDOException $e) {
            $currentVersion = 0;
        }
        if ($currentVersion >= (int)LINKNEST_SCHEMA_VERSION) {
            ensureTilesHeaderImageColumns($db);
            releaseDatabaseInitLock($initLock);
            $initLock = null;
            return $db;
        }

        // Page size only applies to empty DBs; try during bootstrap
        try {
            $db->exec('PRAGMA page_size = 4096');
        } catch (PDOException $e) {
            // Ignore
        }

        // One-time OS prefetch + optimize during schema bootstrap only
        applySqlitePerformancePragmas($db, true);
    
        // Create users table
        $db->exec('CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0,
            is_approved INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL
        )');
        
        // Migrate existing users table if needed (add new columns)
        try {
            $db->exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
        } catch (PDOException $e) {
            // Column already exists, ignore
        }
        try {
            $db->exec('ALTER TABLE users ADD COLUMN is_approved INTEGER DEFAULT 0');
        } catch (PDOException $e) {
            // Column already exists, ignore
        }
        try {
            $db->exec('ALTER TABLE users ADD COLUMN auth_source TEXT DEFAULT "local"');
        } catch (PDOException $e) {
            // Column already exists, ignore
        }
        try {
            $db->exec('ALTER TABLE users ADD COLUMN is_disabled INTEGER DEFAULT 0');
        } catch (PDOException $e) {
            // Column already exists, ignore
        }
        try {
            $db->exec('ALTER TABLE users ADD COLUMN saml_nameid TEXT');
        } catch (PDOException $e) {
            // Column already exists, ignore
        }
        try {
            $db->exec('ALTER TABLE users ADD COLUMN last_login INTEGER');
        } catch (PDOException $e) {
            // Column already exists, ignore
        }
        try {
            $db->exec('ALTER TABLE users ADD COLUMN display_name TEXT');
        } catch (PDOException $e) {
            // Column already exists, ignore
        }
        try {
            $db->exec('ALTER TABLE users ADD COLUMN uuid TEXT');
        } catch (PDOException $e) {
            // Column already exists, ignore
        }

        // Backfill public UUIDs for existing users (numeric id stays primary key)
        try {
            $missingUuidStmt = $db->query("SELECT id FROM users WHERE uuid IS NULL OR uuid = ''");
            if ($missingUuidStmt) {
                $updateUuidStmt = $db->prepare('UPDATE users SET uuid = ? WHERE id = ?');
                while ($missingUser = $missingUuidStmt->fetch(PDO::FETCH_ASSOC)) {
                    $updateUuidStmt->execute([generateUuid(), $missingUser['id']]);
                }
            }
            $db->exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_uuid ON users(uuid)');
        } catch (PDOException $e) {
            // Ignore if users table is not ready yet
        }
        
        // Note: New users require admin approval. Existing users in old databases
        // will need to be manually approved by admin through the admin panel.
        
        // Create default admin account if it doesn't exist
        $stmt = $db->prepare('SELECT id FROM users WHERE is_admin = 1 LIMIT 1');
        $stmt->execute();
        if (!$stmt->fetch()) {
            // Default admin credentials: admin / admin123
            $adminPassword = password_hash('admin123', PASSWORD_DEFAULT);
            $adminUuid = generateUuid();
            $stmtInsertAdmin = $db->prepare('INSERT INTO users (username, email, password_hash, is_admin, is_approved, uuid, created_at) VALUES (?, ?, ?, 1, 1, ?, ?)');
            $stmtInsertAdmin->execute(['admin', 'admin@linknest.local', $adminPassword, $adminUuid, time()]);
        }
        
        // Create tiles table
        $db->exec('CREATE TABLE IF NOT EXISTS tiles (
            id TEXT PRIMARY KEY,
            user_id INTEGER,
            title TEXT NOT NULL,
            description TEXT,
            html_content TEXT,
            emoji TEXT,
            theme_color TEXT,
            "group" TEXT,
            position INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )');

        // Create tile_versions table for history/version control
        $db->exec('CREATE TABLE IF NOT EXISTS tile_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tile_id TEXT NOT NULL,
            version_number INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            user_id INTEGER,
            tile_data TEXT NOT NULL,
            changelog_summary TEXT,
            is_locked INTEGER DEFAULT 0,
            is_temp INTEGER DEFAULT 0,
            FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )');

        // Indexes for tile_versions
        $db->exec('CREATE INDEX IF NOT EXISTS idx_tile_versions_tile_id ON tile_versions(tile_id)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_tile_versions_created_at ON tile_versions(created_at DESC)');
        
        // Migrate tile_versions table to add tags and comments columns if they don't exist
        try {
            $columns = $db->query("PRAGMA table_info(tile_versions)")->fetchAll();
            $hasTags = false;
            $hasComments = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'tags') {
                    $hasTags = true;
                }
                if ($column['name'] === 'comments') {
                    $hasComments = true;
                }
            }
            if (!$hasTags) {
                $db->exec('ALTER TABLE tile_versions ADD COLUMN tags TEXT');
                error_log('Added tags column to tile_versions table');
            }
            if (!$hasComments) {
                $db->exec('ALTER TABLE tile_versions ADD COLUMN comments TEXT');
                error_log('Added comments column to tile_versions table');
            }
        } catch (PDOException $e) {
            error_log('Tile versions tags/comments migration warning: ' . $e->getMessage());
        }

        
        // Migrate existing tiles table to add position column if it doesn't exist
        try {
            $columns = $db->query("PRAGMA table_info(tiles)")->fetchAll();
            $hasPosition = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'position') {
                    $hasPosition = true;
                    break;
                }
            }
            if (!$hasPosition) {
                $db->exec('ALTER TABLE tiles ADD COLUMN position INTEGER DEFAULT 0');
            }
        } catch (PDOException $e) {
            // Column might already exist or migration might fail on some environments; ignore
            error_log('Tiles position migration warning: ' . $e->getMessage());
        }
        
        // Migrate existing tiles table to add visibility columns if they don't exist
        try {
            $columns = $db->query("PRAGMA table_info(tiles)")->fetchAll();
            $hasVisibility = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'visibility') {
                    $hasVisibility = true;
                    break;
                }
            }
            if (!$hasVisibility) {
                $db->exec('ALTER TABLE tiles ADD COLUMN visibility TEXT DEFAULT "public"');
                $db->exec('ALTER TABLE tiles ADD COLUMN allowed_users TEXT');
                $db->exec('ALTER TABLE tiles ADD COLUMN allowed_groups TEXT');
            }
        } catch (PDOException $e) {
            error_log('Tiles visibility migration warning: ' . $e->getMessage());
        }

        // Migrate tiles table to add published column (admin-only when unpublished)
        try {
            $columns = $db->query("PRAGMA table_info(tiles)")->fetchAll();
            $columnNames = array_column($columns, 'name');
            if (!in_array('published', $columnNames)) {
                $db->exec('ALTER TABLE tiles ADD COLUMN published INTEGER DEFAULT 1');
            }
        } catch (PDOException $e) {
            error_log('Tiles published migration warning: ' . $e->getMessage());
        }

        // Migrate existing tiles table to add source_tab column (public | staging; admin-only staging tab)
        try {
            $columns = $db->query("PRAGMA table_info(tiles)")->fetchAll();
            $hasSourceTab = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'source_tab') {
                    $hasSourceTab = true;
                    break;
                }
            }
            if (!$hasSourceTab) {
                $db->exec('ALTER TABLE tiles ADD COLUMN source_tab TEXT DEFAULT "public"');
                error_log('Added source_tab column to tiles table');
            }
        } catch (PDOException $e) {
            error_log('Tiles source_tab migration warning: ' . $e->getMessage());
        }
        
        // Migrate existing tiles table to add allowed_groups column if it doesn't exist
        try {
            $columns = $db->query("PRAGMA table_info(tiles)")->fetchAll();
            $hasAllowedGroups = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'allowed_groups') {
                    $hasAllowedGroups = true;
                    break;
                }
            }
            if (!$hasAllowedGroups) {
                $db->exec('ALTER TABLE tiles ADD COLUMN allowed_groups TEXT');
            }
        } catch (PDOException $e) {
            error_log('Tiles allowed_groups migration warning: ' . $e->getMessage());
        }
        
        // Migrate existing tiles table to add hyperlink columns if they don't exist
        try {
            $columns = $db->query("PRAGMA table_info(tiles)")->fetchAll();
            $hasHyperlink = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'is_hyperlink') {
                    $hasHyperlink = true;
                    break;
                }
            }
            if (!$hasHyperlink) {
                $db->exec('ALTER TABLE tiles ADD COLUMN is_hyperlink INTEGER DEFAULT 0');
                $db->exec('ALTER TABLE tiles ADD COLUMN hyperlink_url TEXT');
                $db->exec('ALTER TABLE tiles ADD COLUMN open_in_new_tab INTEGER DEFAULT 1');
            }
        } catch (PDOException $e) {
            error_log('Tiles hyperlink migration warning: ' . $e->getMessage());
        }
        
        // Migrate existing tiles table to add deleted_at column for soft delete (recycle bin)
        try {
            $columns = $db->query("PRAGMA table_info(tiles)")->fetchAll();
            $hasDeletedAt = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'deleted_at') {
                    $hasDeletedAt = true;
                    break;
                }
            }
            if (!$hasDeletedAt) {
                $db->exec('ALTER TABLE tiles ADD COLUMN deleted_at INTEGER');
            }
        } catch (PDOException $e) {
            error_log('Tiles deleted_at migration warning: ' . $e->getMessage());
        }
        
        // Migrate existing tiles table to add scheduling columns
        try {
            $columns = $db->query("PRAGMA table_info(tiles)")->fetchAll();
            $hasVisibleFrom = false;
            $hasExpiresAt = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'visible_from') {
                    $hasVisibleFrom = true;
                }
                if ($column['name'] === 'expires_at') {
                    $hasExpiresAt = true;
                }
            }
            if (!$hasVisibleFrom) {
                $db->exec('ALTER TABLE tiles ADD COLUMN visible_from TEXT');
            }
            if (!$hasExpiresAt) {
                $db->exec('ALTER TABLE tiles ADD COLUMN expires_at TEXT');
            }
        } catch (PDOException $e) {
            error_log('Tiles scheduling migration warning: ' . $e->getMessage());
        }
        
        // Migrate existing category_arrangements table to add scheduling columns
        try {
            $catTableExists = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='category_arrangements'")->fetch();
            if ($catTableExists) {
                $columns = $db->query("PRAGMA table_info(category_arrangements)")->fetchAll();
                $hasVisibleFrom = false;
                $hasExpiresAt = false;
                foreach ($columns as $column) {
                    if ($column['name'] === 'visible_from') {
                        $hasVisibleFrom = true;
                    }
                    if ($column['name'] === 'expires_at') {
                        $hasExpiresAt = true;
                    }
                }
                if (!$hasVisibleFrom) {
                    $db->exec('ALTER TABLE category_arrangements ADD COLUMN visible_from TEXT');
                }
                if (!$hasExpiresAt) {
                    $db->exec('ALTER TABLE category_arrangements ADD COLUMN expires_at TEXT');
                }
            }
        } catch (PDOException $e) {
            error_log('Category scheduling migration warning: ' . $e->getMessage());
        }
        
        // Migrate existing tiles table to add archived_at column
        try {
            $columns = $db->query("PRAGMA table_info(tiles)")->fetchAll();
            $hasArchivedAt = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'archived_at') {
                    $hasArchivedAt = true;
                    break;
                }
            }
            if (!$hasArchivedAt) {
                $db->exec('ALTER TABLE tiles ADD COLUMN archived_at INTEGER');
            }
        } catch (PDOException $e) {
            error_log('Tiles archived_at migration warning: ' . $e->getMessage());
        }
        
        // Migrate existing tiles table to add browser column if it doesn't exist
        try {
            $columns = $db->query("PRAGMA table_info(tiles)")->fetchAll();
            $hasBrowser = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'browser') {
                    $hasBrowser = true;
                    break;
                }
            }
            if (!$hasBrowser) {
                $db->exec('ALTER TABLE tiles ADD COLUMN browser TEXT');
            }
        } catch (PDOException $e) {
            error_log('Tiles browser migration warning: ' . $e->getMessage());
        }
        
        // Migrate existing tiles table to add tile decoration columns if they don't exist
        try {
            $columns = $db->query("PRAGMA table_info(tiles)")->fetchAll();
            $columnNames = array_column($columns, 'name');
            $decorationColumns = [
                'decoration' => 'TEXT',
                'tile_background_color' => 'TEXT',
                'tile_gradient_enabled' => 'INTEGER DEFAULT 0',
                'tile_gradient_colors' => 'TEXT',
                'tile_gradient_color_positions' => 'TEXT',
                'tile_gradient_direction' => 'TEXT',
                'tile_gradient_type' => 'TEXT',
                'tile_border_radius' => 'INTEGER',
                'tile_text_color' => 'TEXT'
            ];
            
            foreach ($decorationColumns as $columnName => $columnType) {
                if (!in_array($columnName, $columnNames)) {
                    $db->exec("ALTER TABLE tiles ADD COLUMN $columnName $columnType");
                }
            }
        } catch (PDOException $e) {
            error_log('Tiles decoration migration warning: ' . $e->getMessage());
        }

        // Migrate existing tiles table to add page_animation column if it doesn't exist
        try {
            $columns = $db->query("PRAGMA table_info(tiles)")->fetchAll();
            $hasPageAnimation = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'page_animation') {
                    $hasPageAnimation = true;
                    break;
                }
            }
            if (!$hasPageAnimation) {
                $db->exec('ALTER TABLE tiles ADD COLUMN page_animation TEXT');
            }
        } catch (PDOException $e) {
            error_log('Tiles page_animation migration warning: ' . $e->getMessage());
        }

        // Migrate existing tiles table to add links_animation (default for all links) if missing
        try {
            $columns = $db->query("PRAGMA table_info(tiles)")->fetchAll();
            $hasLinksAnimation = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'links_animation') {
                    $hasLinksAnimation = true;
                    break;
                }
            }
            if (!$hasLinksAnimation) {
                $db->exec('ALTER TABLE tiles ADD COLUMN links_animation TEXT');
            }
        } catch (PDOException $e) {
            error_log('Tiles links_animation migration warning: ' . $e->getMessage());
        }

        // Migrate existing tiles table to add header_image (PNG shown in tile card header region)
        try {
            $columns = $db->query("PRAGMA table_info(tiles)")->fetchAll();
            $hasHeaderImage = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'header_image') {
                    $hasHeaderImage = true;
                    break;
                }
            }
            if (!$hasHeaderImage) {
                $db->exec('ALTER TABLE tiles ADD COLUMN header_image TEXT');
            }
        } catch (PDOException $e) {
            error_log('Tiles header_image migration warning: ' . $e->getMessage());
        }

        // Migrate: header image alignment (left|center|right)
        try {
            $columns = $db->query("PRAGMA table_info(tiles)")->fetchAll();
            $hasHeaderImageAlign = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'header_image_align') {
                    $hasHeaderImageAlign = true;
                    break;
                }
            }
            if (!$hasHeaderImageAlign) {
                $db->exec('ALTER TABLE tiles ADD COLUMN header_image_align TEXT');
            }
        } catch (PDOException $e) {
            error_log('Tiles header_image_align migration warning: ' . $e->getMessage());
        }

        // Migrate: header image opacity, fine offset, fit mode
        try {
            $columns = $db->query("PRAGMA table_info(tiles)")->fetchAll();
            $columnNames = array_column($columns, 'name');
            $headerStyleCols = [
                'header_image_opacity' => 'INTEGER',
                'header_image_offset_x' => 'INTEGER',
                'header_image_fit' => 'TEXT'
            ];
            foreach ($headerStyleCols as $columnName => $columnType) {
                if (!in_array($columnName, $columnNames, true)) {
                    $db->exec("ALTER TABLE tiles ADD COLUMN $columnName $columnType");
                }
            }
        } catch (PDOException $e) {
            error_log('Tiles header image style migration warning: ' . $e->getMessage());
        }

        // Migrate: show_emoji toggle (1 = show, 0 = hide on card)
        try {
            $columns = $db->query("PRAGMA table_info(tiles)")->fetchAll();
            $hasShowEmoji = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'show_emoji') {
                    $hasShowEmoji = true;
                    break;
                }
            }
            if (!$hasShowEmoji) {
                $db->exec('ALTER TABLE tiles ADD COLUMN show_emoji INTEGER DEFAULT 1');
            }
        } catch (PDOException $e) {
            error_log('Tiles show_emoji migration warning: ' . $e->getMessage());
        }

        // Migrate: emoji_image (PNG shown inside the emoji badge)
        try {
            $columns = $db->query("PRAGMA table_info(tiles)")->fetchAll();
            $hasEmojiImage = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'emoji_image') {
                    $hasEmojiImage = true;
                    break;
                }
            }
            if (!$hasEmojiImage) {
                $db->exec('ALTER TABLE tiles ADD COLUMN emoji_image TEXT');
            }
        } catch (PDOException $e) {
            error_log('Tiles emoji_image migration warning: ' . $e->getMessage());
        }

        // Migrate: show_title / show_description / header_image_offset_y
        try {
            $columns = $db->query("PRAGMA table_info(tiles)")->fetchAll();
            $columnNames = array_column($columns, 'name');
            $cardVisibilityCols = [
                'show_title' => 'INTEGER DEFAULT 1',
                'show_description' => 'INTEGER DEFAULT 1',
                'header_image_offset_y' => 'INTEGER',
            ];
            foreach ($cardVisibilityCols as $columnName => $columnType) {
                if (!in_array($columnName, $columnNames, true)) {
                    $db->exec("ALTER TABLE tiles ADD COLUMN $columnName $columnType");
                }
            }
        } catch (PDOException $e) {
            error_log('Tiles show_title/show_description/header_image_offset_y migration warning: ' . $e->getMessage());
        }
        
        // Create tabs table
        $db->exec('CREATE TABLE IF NOT EXISTS tabs (
            id TEXT PRIMARY KEY,
            tile_id TEXT NOT NULL,
            title TEXT NOT NULL,
            position INTEGER DEFAULT 0,
            visible_from TEXT,
            expires_at TEXT,
            FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE
        )');
        
        // Migrate existing tabs table to add position column if it doesn't exist
        try {
            $columns = $db->query("PRAGMA table_info(tabs)")->fetchAll();
            $hasPosition = false;
            $hasScheduling = false;
            $hasTextColor = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'position') {
                    $hasPosition = true;
                }
                if ($column['name'] === 'visible_from') {
                    $hasScheduling = true;
                }
                if ($column['name'] === 'text_color') {
                    $hasTextColor = true;
                }
            }
            if (!$hasPosition) {
                $db->exec('ALTER TABLE tabs ADD COLUMN position INTEGER DEFAULT 0');
            }
            if (!$hasScheduling) {
                $db->exec('ALTER TABLE tabs ADD COLUMN visible_from TEXT');
                $db->exec('ALTER TABLE tabs ADD COLUMN expires_at TEXT');
            }
            if (!$hasTextColor) {
                $db->exec('ALTER TABLE tabs ADD COLUMN text_color TEXT');
            }
        } catch (PDOException $e) {
            error_log('Tabs migration warning: ' . $e->getMessage());
        }
        
        // Migrate tabs table to add visibility columns if they don't exist
        try {
            $columns = $db->query("PRAGMA table_info(tabs)")->fetchAll();
            $columnNames = array_column($columns, 'name');
            if (!in_array('visibility', $columnNames)) {
                $db->exec('ALTER TABLE tabs ADD COLUMN visibility TEXT DEFAULT "public"');
                $db->exec('ALTER TABLE tabs ADD COLUMN allowed_users TEXT');
                $db->exec('ALTER TABLE tabs ADD COLUMN allowed_groups TEXT');
            }
        } catch (PDOException $e) {
            error_log('Tabs visibility migration warning: ' . $e->getMessage());
        }

        // Migrate tabs table to add published column (admin-only when unpublished)
        try {
            $columns = $db->query("PRAGMA table_info(tabs)")->fetchAll();
            $columnNames = array_column($columns, 'name');
            if (!in_array('published', $columnNames)) {
                $db->exec('ALTER TABLE tabs ADD COLUMN published INTEGER DEFAULT 1');
            }
        } catch (PDOException $e) {
            error_log('Tabs published migration warning: ' . $e->getMessage());
        }
        
        // Migrate existing sections table to add tab_id column if it doesn't exist
        try {
            $columns = $db->query("PRAGMA table_info(sections)")->fetchAll();
            $hasTabId = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'tab_id') {
                    $hasTabId = true;
                    break;
                }
            }
            if (!$hasTabId) {
                $db->exec('ALTER TABLE sections ADD COLUMN tab_id TEXT');
                // Create default tab for existing tiles and migrate sections
                $tilesStmt = $db->query('SELECT DISTINCT tile_id FROM sections WHERE tab_id IS NULL');
                while ($tileRow = $tilesStmt->fetch()) {
                    $defaultTabId = uniqid('tab_', true);
                    $tabStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position) VALUES (?, ?, ?, ?)');
                    $tabStmt->execute([$defaultTabId, $tileRow['tile_id'], 'Default', 0]);
                    
                    // Update all sections for this tile to reference the default tab
                    $updateStmt = $db->prepare('UPDATE sections SET tab_id = ? WHERE tile_id = ? AND tab_id IS NULL');
                    $updateStmt->execute([$defaultTabId, $tileRow['tile_id']]);
                }
                // Make tab_id required after migration
                // We'll keep tile_id for backward compatibility but tab_id is now the primary reference
            }
        } catch (PDOException $e) {
            error_log('Sections tab_id migration warning: ' . $e->getMessage());
        }
        
        // Create sections table (if not exists)
        $db->exec('CREATE TABLE IF NOT EXISTS sections (
            id TEXT PRIMARY KEY,
            tile_id TEXT NOT NULL,
            tab_id TEXT,
            title TEXT,
            visible_from TEXT,
            expires_at TEXT,
            FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE,
            FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE CASCADE
        )');

        // Migrate existing sections table to add scheduling columns if they don't exist
        try {
            $columns = $db->query("PRAGMA table_info(sections)")->fetchAll();
            $hasScheduling = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'visible_from') {
                    $hasScheduling = true;
                    break;
                }
            }
            if (!$hasScheduling) {
                $db->exec('ALTER TABLE sections ADD COLUMN visible_from TEXT');
                $db->exec('ALTER TABLE sections ADD COLUMN expires_at TEXT');
            }
        } catch (PDOException $e) {
            error_log('Sections scheduling migration warning: ' . $e->getMessage());
        }
        
        // Migrate existing sections table to add text_color column if it doesn't exist
        try {
            $columns = $db->query("PRAGMA table_info(sections)")->fetchAll();
            $hasTextColor = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'text_color') {
                    $hasTextColor = true;
                    break;
                }
            }
            if (!$hasTextColor) {
                $db->exec('ALTER TABLE sections ADD COLUMN text_color TEXT');
            }
        } catch (PDOException $e) {
            error_log('Sections text_color migration warning: ' . $e->getMessage());
        }
        
        // Migrate existing sections table to add force_stacked_view column if it doesn't exist
        try {
            $columns = $db->query("PRAGMA table_info(sections)")->fetchAll();
            $hasForceStackedView = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'force_stacked_view') {
                    $hasForceStackedView = true;
                    break;
                }
            }
            if (!$hasForceStackedView) {
                $db->exec('ALTER TABLE sections ADD COLUMN force_stacked_view INTEGER DEFAULT 0');
            }
        } catch (PDOException $e) {
            error_log('Sections force_stacked_view migration warning: ' . $e->getMessage());
        }
        
        // Migrate existing sections table to add position column if it doesn't exist
        try {
            $columns = $db->query("PRAGMA table_info(sections)")->fetchAll();
            $hasPosition = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'position') {
                    $hasPosition = true;
                    break;
                }
            }
            if (!$hasPosition) {
                $db->exec('ALTER TABLE sections ADD COLUMN position INTEGER DEFAULT 0');
                // Set initial positions based on current order (by id)
                $db->exec('UPDATE sections SET position = (
                    SELECT COUNT(*) FROM sections s2 
                    WHERE s2.tab_id = sections.tab_id AND s2.id <= sections.id
                ) - 1');
            }
        } catch (PDOException $e) {
            error_log('Sections position migration warning: ' . $e->getMessage());
        }
        
        // Migrate sections table to add visibility columns if they don't exist
        try {
            $columns = $db->query("PRAGMA table_info(sections)")->fetchAll();
            $columnNames = array_column($columns, 'name');
            if (!in_array('visibility', $columnNames)) {
                $db->exec('ALTER TABLE sections ADD COLUMN visibility TEXT DEFAULT "public"');
                $db->exec('ALTER TABLE sections ADD COLUMN allowed_users TEXT');
                $db->exec('ALTER TABLE sections ADD COLUMN allowed_groups TEXT');
            }
        } catch (PDOException $e) {
            error_log('Sections visibility migration warning: ' . $e->getMessage());
        }

        // Migrate sections table to add published column (admin-only when unpublished)
        try {
            $columns = $db->query("PRAGMA table_info(sections)")->fetchAll();
            $columnNames = array_column($columns, 'name');
            if (!in_array('published', $columnNames)) {
                $db->exec('ALTER TABLE sections ADD COLUMN published INTEGER DEFAULT 1');
            }
        } catch (PDOException $e) {
            error_log('Sections published migration warning: ' . $e->getMessage());
        }
        
        // Create links table
        $db->exec('CREATE TABLE IF NOT EXISTS links (
            id TEXT PRIMARY KEY,
            section_id TEXT NOT NULL,
            label TEXT NOT NULL,
            url TEXT NOT NULL,
            health_status TEXT DEFAULT "unknown",
            health_checked_at INTEGER,
            health_http_code INTEGER,
            health_error TEXT,
            visible_from TEXT,
            expires_at TEXT,
            FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
        )');
        
        // Migrate existing links table to add health check columns if they don't exist
        try {
            $columns = $db->query("PRAGMA table_info(links)")->fetchAll();
            $hasHealthStatus = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'health_status') {
                    $hasHealthStatus = true;
                    break;
                }
            }
            if (!$hasHealthStatus) {
                $db->exec('ALTER TABLE links ADD COLUMN health_status TEXT DEFAULT "unknown"');
                $db->exec('ALTER TABLE links ADD COLUMN health_checked_at INTEGER');
                $db->exec('ALTER TABLE links ADD COLUMN health_http_code INTEGER');
                $db->exec('ALTER TABLE links ADD COLUMN health_error TEXT');
            }
        } catch (PDOException $e) {
            error_log('Links health migration warning: ' . $e->getMessage());
        }
        
        // Migrate existing links table to add visibility columns if they don't exist
        try {
            $columns = $db->query("PRAGMA table_info(links)")->fetchAll();
            $hasVisibility = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'visibility') {
                    $hasVisibility = true;
                    break;
                }
            }
            if (!$hasVisibility) {
                $db->exec('ALTER TABLE links ADD COLUMN visibility TEXT DEFAULT "public"');
                $db->exec('ALTER TABLE links ADD COLUMN allowed_users TEXT');
                $db->exec('ALTER TABLE links ADD COLUMN allowed_groups TEXT');
            }
        } catch (PDOException $e) {
            error_log('Links visibility migration warning: ' . $e->getMessage());
        }

        // Migrate links table to add published column (admin-only when unpublished)
        try {
            $columns = $db->query("PRAGMA table_info(links)")->fetchAll();
            $columnNames = array_column($columns, 'name');
            if (!in_array('published', $columnNames)) {
                $db->exec('ALTER TABLE links ADD COLUMN published INTEGER DEFAULT 1');
            }
        } catch (PDOException $e) {
            error_log('Links published migration warning: ' . $e->getMessage());
        }
        
        // Migrate existing links table to add allowed_groups column if it doesn't exist
        try {
            $columns = $db->query("PRAGMA table_info(links)")->fetchAll();
            $hasAllowedGroups = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'allowed_groups') {
                    $hasAllowedGroups = true;
                    break;
                }
            }
            if (!$hasAllowedGroups) {
                $db->exec('ALTER TABLE links ADD COLUMN allowed_groups TEXT');
            }
        } catch (PDOException $e) {
            error_log('Links allowed_groups migration warning: ' . $e->getMessage());
        }
        
        // Migrate existing links table to add notes column if it doesn't exist
        try {
            $columns = $db->query("PRAGMA table_info(links)")->fetchAll();
            $hasNotes = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'notes') {
                    $hasNotes = true;
                    break;
                }
            }
            if (!$hasNotes) {
                $db->exec('ALTER TABLE links ADD COLUMN notes TEXT');
            }
        } catch (PDOException $e) {
            error_log('Links notes migration warning: ' . $e->getMessage());
        }
        
        // Migrate existing links table to add tooltip column if it doesn't exist
        try {
            $columns = $db->query("PRAGMA table_info(links)")->fetchAll();
            $hasTooltip = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'tooltip') {
                    $hasTooltip = true;
                    break;
                }
            }
            if (!$hasTooltip) {
                $db->exec('ALTER TABLE links ADD COLUMN tooltip TEXT');
            }
        } catch (PDOException $e) {
            error_log('Links tooltip migration warning: ' . $e->getMessage());
        }
        
        // Migrate existing links table to add browser column if it doesn't exist
        try {
            $columns = $db->query("PRAGMA table_info(links)")->fetchAll();
            $hasBrowser = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'browser') {
                    $hasBrowser = true;
                    break;
                }
            }
            if (!$hasBrowser) {
                $db->exec('ALTER TABLE links ADD COLUMN browser TEXT');
            }
        } catch (PDOException $e) {
            error_log('Links browser migration warning: ' . $e->getMessage());
        }
        
        // Migrate existing links table to add rich_text_content column if it doesn't exist
        try {
            $columns = $db->query("PRAGMA table_info(links)")->fetchAll();
            $hasRichTextContent = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'rich_text_content') {
                    $hasRichTextContent = true;
                    break;
                }
            }
            if (!$hasRichTextContent) {
                $db->exec('ALTER TABLE links ADD COLUMN rich_text_content TEXT');
            }
        } catch (PDOException $e) {
            error_log('Links rich_text_content migration warning: ' . $e->getMessage());
        }

        // Migrate existing links table to add animation column if it doesn't exist
        try {
            $columns = $db->query("PRAGMA table_info(links)")->fetchAll();
            $hasAnimation = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'animation') {
                    $hasAnimation = true;
                    break;
                }
            }
            if (!$hasAnimation) {
                $db->exec('ALTER TABLE links ADD COLUMN animation TEXT');
            }
        } catch (PDOException $e) {
            error_log('Links animation migration warning: ' . $e->getMessage());
        }
        
        // Create rich_text_content table
        $db->exec('CREATE TABLE IF NOT EXISTS rich_text_content (
            id TEXT PRIMARY KEY,
            section_id TEXT NOT NULL,
            content TEXT NOT NULL,
            position INTEGER DEFAULT 0,
            FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
        )');

        // Migrate rich_text_content boxed container columns
        try {
            $columns = $db->query("PRAGMA table_info(rich_text_content)")->fetchAll();
            $existingCols = [];
            foreach ($columns as $column) {
                $existingCols[$column['name']] = true;
            }
            $rtMigrations = [
                'boxed' => 'INTEGER DEFAULT 0',
                'box_title' => 'TEXT',
                'box_footer' => 'TEXT',
                'box_header_align' => "TEXT DEFAULT 'left'",
                'box_footer_align' => "TEXT DEFAULT 'left'",
                'box_header_bg' => 'TEXT',
                'box_footer_bg' => 'TEXT',
                'box_body_bg' => 'TEXT',
                'box_header_font_weight' => "TEXT DEFAULT 'bold'",
                'box_footer_font_weight' => "TEXT DEFAULT 'normal'",
                'box_header_font_size' => "TEXT DEFAULT 'md'",
                'box_footer_font_size' => "TEXT DEFAULT 'sm'",
                'box_header_emoji' => 'TEXT',
                'box_importance' => "TEXT DEFAULT 'notes'",
                'visibility' => "TEXT DEFAULT 'public'",
                'allowed_users' => 'TEXT',
                'allowed_groups' => 'TEXT',
            ];
            foreach ($rtMigrations as $colName => $colType) {
                if (empty($existingCols[$colName])) {
                    $db->exec("ALTER TABLE rich_text_content ADD COLUMN {$colName} {$colType}");
                }
            }
        } catch (PDOException $e) {
            error_log('Rich text boxed columns migration warning: ' . $e->getMessage());
        }

        // Migrate existing links table to add scheduling columns if they don't exist
        try {
            $columns = $db->query("PRAGMA table_info(links)")->fetchAll();
            $hasScheduling = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'visible_from') {
                    $hasScheduling = true;
                    break;
                }
            }
            if (!$hasScheduling) {
                $db->exec('ALTER TABLE links ADD COLUMN visible_from TEXT');
                $db->exec('ALTER TABLE links ADD COLUMN expires_at TEXT');
            }
        } catch (PDOException $e) {
            error_log('Links scheduling migration warning: ' . $e->getMessage());
        }
        
        // Migrate existing links table to add icon and textColor columns if they don't exist
        try {
            $columns = $db->query("PRAGMA table_info(links)")->fetchAll();
            $hasIcon = false;
            $hasTextColor = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'icon') {
                    $hasIcon = true;
                }
                if ($column['name'] === 'text_color') {
                    $hasTextColor = true;
                }
            }
            if (!$hasIcon) {
                $db->exec('ALTER TABLE links ADD COLUMN icon TEXT');
            }
            if (!$hasTextColor) {
                $db->exec('ALTER TABLE links ADD COLUMN text_color TEXT');
            }
        } catch (PDOException $e) {
            error_log('Links icon/textColor migration warning: ' . $e->getMessage());
        }

        // Migrate existing links table to add position column if it doesn't exist
        try {
            $columns = $db->query("PRAGMA table_info(links)")->fetchAll();
            $hasPosition = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'position') {
                    $hasPosition = true;
                    break;
                }
            }
            if (!$hasPosition) {
                $db->exec('ALTER TABLE links ADD COLUMN position INTEGER DEFAULT 0');
            }
        } catch (PDOException $e) {
            error_log('Links position migration warning: ' . $e->getMessage());
        }
        
        // Create settings table
        $db->exec('CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        )');
        
        // Create addon_status table for tracking add-on availability
        $db->exec('CREATE TABLE IF NOT EXISTS addon_status (
            addon_name TEXT PRIMARY KEY,
            is_enabled INTEGER DEFAULT 0,
            is_available INTEGER DEFAULT 0,
            last_check_at INTEGER,
            config TEXT,
            error_message TEXT
        )');
        
        // Initialize Performance Analytics addon status
        $db->exec("INSERT OR IGNORE INTO addon_status (addon_name, is_enabled, is_available, last_check_at) 
                   VALUES ('performance_analytics', 0, 0, " . time() . ")");
        
        // Initialize default Performance Analytics settings
        $defaultSettings = [
            'performance_analytics_enabled' => '0',
            'performance_analytics_pg_host' => '',
            'performance_analytics_pg_port' => '5432',
            'performance_analytics_pg_database' => '',
            'performance_analytics_pg_user' => '',
            'performance_analytics_pg_password' => '',
            'performance_analytics_sample_rate' => '0.1',
            'performance_analytics_track_anonymous' => '1',
            'performance_analytics_track_logins' => '1',
            'performance_analytics_beacon_urls' => '',
            'performance_analytics_worker_enabled' => '0',
            'performance_analytics_retention_days' => '90',
            'performance_analytics_dashboard_url' => ''
        ];
        
        $stmt = $db->prepare("INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)");
        $currentTime = time();
        foreach ($defaultSettings as $key => $value) {
            $stmt->execute([$key, $value, $currentTime]);
        }
        
        // Create tile_arrangements table for global tile ordering
        // user_id is 0 for global arrangements, or user_id for user-specific (if needed in future)
        // Using 0 instead of NULL because SQLite doesn't allow NULL in composite PRIMARY KEY
        $db->exec('CREATE TABLE IF NOT EXISTS tile_arrangements (
            user_id INTEGER NOT NULL DEFAULT 0,
            tile_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            group_name TEXT,
            PRIMARY KEY (user_id, tile_id),
            FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE
        )');
        
        // Create category_arrangements table for global category/group ordering
        // user_id is 0 for global arrangements, or user_id for user-specific (if needed in future)
        // Using 0 instead of NULL because SQLite doesn't allow NULL in composite PRIMARY KEY
        $db->exec('CREATE TABLE IF NOT EXISTS category_arrangements (
            user_id INTEGER NOT NULL DEFAULT 0,
            category_name TEXT NOT NULL,
            position INTEGER NOT NULL,
            visible_from TEXT,
            expires_at TEXT,
            PRIMARY KEY (user_id, category_name)
        )');
        
        // Create tile_messages table for storing scheduled messages for tiles
        $db->exec('CREATE TABLE IF NOT EXISTS tile_messages (
            id TEXT PRIMARY KEY,
            tile_id TEXT NOT NULL,
            content TEXT NOT NULL,
            type TEXT NOT NULL,
            start_date TEXT,
            end_date TEXT,
            is_active INTEGER DEFAULT 1,
            FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE
        )');

        // Migration for tile_messages if it exists with old schema
        try {
            $columns = $db->query("PRAGMA table_info(tile_messages)")->fetchAll();
            $hasContent = false;
            $hasType = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'content') $hasContent = true;
                if ($column['name'] === 'type') $hasType = true;
            }
            if (!$hasContent) {
                // If content is missing, the table likely uses the old 'message' column or wrong schema entirely
                // Since this is a new feature, we'll just recreate it to be sure
                $db->exec('DROP TABLE tile_messages');
                $db->exec('CREATE TABLE tile_messages (
                    id TEXT PRIMARY KEY,
                    tile_id TEXT NOT NULL,
                    content TEXT NOT NULL,
                    type TEXT NOT NULL,
                    start_date TEXT,
                    end_date TEXT,
                    is_active INTEGER DEFAULT 1,
                    priority INTEGER DEFAULT 0,
                    text_color TEXT,
                    font_style TEXT,
                    display_location TEXT DEFAULT "both",
                    animation_type TEXT DEFAULT "rollover",
                    delay_before REAL DEFAULT 0,
                    FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE
                )');
            } else {
                // Add new columns if they don't exist
                $columnNames = array_column($columns, 'name');
                if (!in_array('priority', $columnNames)) {
                    $db->exec('ALTER TABLE tile_messages ADD COLUMN priority INTEGER DEFAULT 0');
                }
                if (!in_array('text_color', $columnNames)) {
                    $db->exec('ALTER TABLE tile_messages ADD COLUMN text_color TEXT');
                }
                if (!in_array('font_style', $columnNames)) {
                    $db->exec('ALTER TABLE tile_messages ADD COLUMN font_style TEXT');
                }
                if (!in_array('display_location', $columnNames)) {
                    $db->exec('ALTER TABLE tile_messages ADD COLUMN display_location TEXT DEFAULT "both"');
                }
                if (!in_array('animation_type', $columnNames)) {
                    $db->exec('ALTER TABLE tile_messages ADD COLUMN animation_type TEXT DEFAULT "rollover"');
                }
                if (!in_array('delay_before', $columnNames)) {
                    $db->exec('ALTER TABLE tile_messages ADD COLUMN delay_before REAL DEFAULT 0');
                }
                if (!in_array('celebration_effect', $columnNames)) {
                    $db->exec('ALTER TABLE tile_messages ADD COLUMN celebration_effect TEXT DEFAULT \'fireworks\'');
                }
                if (!in_array('celebration_config', $columnNames)) {
                    $db->exec('ALTER TABLE tile_messages ADD COLUMN celebration_config TEXT');
                }
                if (!in_array('url', $columnNames)) {
                    $db->exec('ALTER TABLE tile_messages ADD COLUMN url TEXT');
                }
                if (!in_array('url_label', $columnNames)) {
                    $db->exec('ALTER TABLE tile_messages ADD COLUMN url_label TEXT');
                }
            }
        } catch (PDOException $e) {
            error_log('tile_messages migration error: ' . $e->getMessage());
        }
        
        // Index for faster tile lookup
        try {
            $db->exec('CREATE INDEX IF NOT EXISTS idx_tile_messages_tile_id ON tile_messages(tile_id)');
        } catch (PDOException $e) {
            // ignore if index creation fails
        }
        
        // Create user_tile_favorites table for storing user favorites
        $db->exec('CREATE TABLE IF NOT EXISTS user_tile_favorites (
            user_id INTEGER NOT NULL,
            tile_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, tile_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE
        )');
        
        // Create user_link_favorites table for storing user bookmarked links
        $db->exec('CREATE TABLE IF NOT EXISTS user_link_favorites (
            user_id INTEGER NOT NULL,
            link_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, link_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE
        )');
        
        // Migrate existing user_link_favorites table to add position column if it doesn't exist
        try {
            $columns = $db->query("PRAGMA table_info(user_link_favorites)")->fetchAll();
            $hasPosition = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'position') {
                    $hasPosition = true;
                    break;
                }
            }
            if (!$hasPosition) {
                $db->exec('ALTER TABLE user_link_favorites ADD COLUMN position INTEGER DEFAULT 0');
                
                // Initialize positions for existing favorites
                // Current order is created_at DESC (newest first), so we initialize positions
                // to match: newest gets position 0, older ones get higher positions
                // When ordered by position ASC, this maintains the same display order
                $users = $db->query('SELECT DISTINCT user_id FROM user_link_favorites')->fetchAll();
                foreach ($users as $userRow) {
                    $userId = $userRow['user_id'];
                    // Get favorites ordered by created_at DESC (newest first) to match current behavior
                    $favs = $db->prepare('SELECT link_id FROM user_link_favorites WHERE user_id = ? ORDER BY created_at DESC');
                    $favs->execute([$userId]);
                    $position = 0;
                    $updateStmt = $db->prepare('UPDATE user_link_favorites SET position = ? WHERE user_id = ? AND link_id = ?');
                    while ($fav = $favs->fetch()) {
                        $updateStmt->execute([$position, $userId, $fav['link_id']]);
                        $position++;
                    }
                }
            }
        } catch (PDOException $e) {
            error_log('user_link_favorites position migration warning: ' . $e->getMessage());
        }
        
        // Create user_tile_permissions table for managing tile access permissions
        $db->exec('CREATE TABLE IF NOT EXISTS user_tile_permissions (
            user_id INTEGER NOT NULL,
            tile_id TEXT NOT NULL,
            can_view INTEGER DEFAULT 1,
            can_edit INTEGER DEFAULT 0,
            can_delete INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, tile_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE
        )');
        
        // Migrate user_tile_permissions table to add granular permission columns
        try {
            $columns = $db->query("PRAGMA table_info(user_tile_permissions)")->fetchAll();
            $columnNames = array_column($columns, 'name');
            
            // Granular permissions for tile admins
            $granularPermissions = [
                'can_add_links' => 'INTEGER DEFAULT 1',
                'can_add_sections' => 'INTEGER DEFAULT 1',
                'can_add_tabs' => 'INTEGER DEFAULT 1',
                'can_edit_links' => 'INTEGER DEFAULT 1',
                'can_delete_links' => 'INTEGER DEFAULT 0',
                'can_delete_sections' => 'INTEGER DEFAULT 0',
                'can_delete_tabs' => 'INTEGER DEFAULT 0',
                'can_change_visibility' => 'INTEGER DEFAULT 0',
                'can_change_browser' => 'INTEGER DEFAULT 0',
                'can_clone_tile' => 'INTEGER DEFAULT 0',
                'can_view_tile_info' => 'INTEGER DEFAULT 1',
                'can_edit_tile' => 'INTEGER DEFAULT 1'
            ];
            
            foreach ($granularPermissions as $columnName => $columnDef) {
                if (!in_array($columnName, $columnNames)) {
                    $db->exec("ALTER TABLE user_tile_permissions ADD COLUMN {$columnName} {$columnDef}");
                    error_log("Added {$columnName} column to user_tile_permissions table");
                }
            }
            
            // Set default values for existing tile admins (can_edit = 1)
            // These should have add permissions enabled by default
            $db->exec("UPDATE user_tile_permissions 
                       SET can_add_links = 1, can_add_sections = 1, can_add_tabs = 1, can_edit_links = 1
                       WHERE can_edit = 1 
                       AND (can_add_links IS NULL OR can_add_sections IS NULL OR can_add_tabs IS NULL OR can_edit_links IS NULL)");
        } catch (PDOException $e) {
            error_log('User tile permissions granular migration warning: ' . $e->getMessage());
        }
        
        // Create clones table for tracking cloned instances
        $db->exec('CREATE TABLE IF NOT EXISTS clones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_name TEXT NOT NULL UNIQUE,
            source_path TEXT NOT NULL,
            target_path TEXT NOT NULL,
            full_path TEXT NOT NULL,
            url TEXT NOT NULL,
            status TEXT DEFAULT "pending",
            progress INTEGER DEFAULT 0,
            copy_assets INTEGER DEFAULT 0,
            copy_database INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            completed_at INTEGER,
            error_message TEXT,
            created_by INTEGER,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )');
        
        // Create user_preferences table for storing user-specific preferences
        $db->exec('CREATE TABLE IF NOT EXISTS user_preferences (
            user_id INTEGER NOT NULL,
            preference_key TEXT NOT NULL,
            preference_value TEXT,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, preference_key),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )');

        // Create user_custom_timezones table for storing user-specific custom UTC offset timezones
        $db->exec('CREATE TABLE IF NOT EXISTS user_custom_timezones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            utc_offset_minutes INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )');

        // Index for faster per-user lookup
        try {
            $db->exec('CREATE INDEX IF NOT EXISTS idx_user_custom_timezones_user_id ON user_custom_timezones(user_id)');
        } catch (PDOException $e) {
            // ignore if index creation fails
        }

        // Create user_alarms table for storing user-specific alarms
        $db->exec('CREATE TABLE IF NOT EXISTS user_alarms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            time TEXT NOT NULL, -- HH:MM (24-hour)
            label TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )');

        // Index for faster per-user lookup
        try {
            $db->exec('CREATE INDEX IF NOT EXISTS idx_user_alarms_user_id ON user_alarms(user_id)');
        } catch (PDOException $e) {
            // ignore if index creation fails
        }

        // Create user_notes table for storing user notes with tabs/categories
        $db->exec('CREATE TABLE IF NOT EXISTS user_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            tab_name TEXT NOT NULL,
            content TEXT NOT NULL,
            position INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )');

        // Index for faster per-user lookup
        try {
            $db->exec('CREATE INDEX IF NOT EXISTS idx_user_notes_user_id ON user_notes(user_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_user_notes_tab_name ON user_notes(user_id, tab_name)');
        } catch (PDOException $e) {
            // ignore if index creation fails
        }

        // Broadcast: threads (topics) + revisions (message trail per thread)
        $db->exec('CREATE TABLE IF NOT EXISTS broadcast_threads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            deleted_at INTEGER,
            is_active INTEGER DEFAULT 0
        )');

        $db->exec('CREATE TABLE IF NOT EXISTS broadcast_revisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            font_family TEXT DEFAULT "Arial, sans-serif",
            font_size TEXT DEFAULT "16px",
            color TEXT DEFAULT "#ff0000",
            scroll_speed INTEGER DEFAULT 30,
            expires_at INTEGER,
            created_at INTEGER NOT NULL,
            created_by INTEGER
        )');

        try {
            $db->exec('CREATE INDEX IF NOT EXISTS idx_broadcast_revisions_thread ON broadcast_revisions(thread_id, created_at DESC)');
        } catch (PDOException $e) {
            // ignore
        }

        try {
            migrateLegacyBroadcastMessagesToThreads($db);
        } catch (Throwable $e) {
            error_log('Broadcast threads migration warning: ' . $e->getMessage());
        }

        // Create chat_messages table for chat widget
        $db->exec('CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            message TEXT,
            message_type TEXT DEFAULT "text", -- text, json, tile
            tile_data TEXT, -- JSON string for shared tiles
            recipient_user_id INTEGER, -- NULL for public messages, user_id for direct messages
            created_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
        )');

        // Index for chat messages
        try {
            $db->exec('CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_chat_messages_recipient ON chat_messages(recipient_user_id)');
        } catch (PDOException $e) {
            // ignore if index creation fails
        }

        // Migrate existing chat_messages table to add recipient_user_id column if it doesn't exist
        try {
            $columns = $db->query("PRAGMA table_info(chat_messages)")->fetchAll();
            $hasRecipient = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'recipient_user_id') {
                    $hasRecipient = true;
                    break;
                }
            }
            if (!$hasRecipient) {
                $db->exec('ALTER TABLE chat_messages ADD COLUMN recipient_user_id INTEGER');
                // Add index for recipient if it doesn't exist
                try {
                    $db->exec('CREATE INDEX IF NOT EXISTS idx_chat_messages_recipient ON chat_messages(recipient_user_id)');
                } catch (PDOException $e) {
                    // Index might already exist, ignore
                }
            }
        } catch (PDOException $e) {
            error_log('Chat messages recipient_user_id migration warning: ' . $e->getMessage());
        }

        // Create tile_share_invitations table for tile sharing with accept/reject flow
        $db->exec('CREATE TABLE IF NOT EXISTS tile_share_invitations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tile_id TEXT NOT NULL,
            sharer_user_id INTEGER NOT NULL,
            receiver_user_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT "pending", -- pending, accepted, rejected, removed
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE,
            FOREIGN KEY (sharer_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (receiver_user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(tile_id, sharer_user_id, receiver_user_id)
        )');
        try {
            $db->exec('CREATE INDEX IF NOT EXISTS idx_tile_share_receiver ON tile_share_invitations(receiver_user_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_tile_share_status ON tile_share_invitations(status)');
        } catch (PDOException $e) { /* ignore */ }

        // Create user_blocked_sharers table - receiver blocks sharer from sending more shares
        $db->exec('CREATE TABLE IF NOT EXISTS user_blocked_sharers (
            user_id INTEGER NOT NULL,
            blocked_user_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, blocked_user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (blocked_user_id) REFERENCES users(id) ON DELETE CASCADE
        )');

        // Create monitors table
        $db->exec('CREATE TABLE IF NOT EXISTS monitors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL, -- url, keyword, port, ping
            target TEXT NOT NULL, -- url or ip
            port INTEGER,
            keyword TEXT,
            interval INTEGER DEFAULT 5, -- in minutes
            warning_threshold INTEGER DEFAULT 1, -- consecutive failures required before declaring DOWN
            consecutive_failures INTEGER DEFAULT 0, -- current consecutive failures counter
            timeout INTEGER, -- seconds (used for url/keyword; optional for others)
            permissions_mode INTEGER DEFAULT 0, -- 0=admin-only(default), 1=shared to selected users (via user_monitor_permissions)
            is_active INTEGER DEFAULT 1,
            email_notification INTEGER DEFAULT 0,
            last_notified_status TEXT, -- up/down/unknown/null: last status we successfully sent a notification for (legacy notifications)
            legacy_notify_pending INTEGER DEFAULT 0, -- when email is enabled while already down; send one alert then clear
            legacy_email_disabled INTEGER DEFAULT 0, -- when enabled, legacy monitor emails are disabled (rule-based only)
            legacy_email_to TEXT, -- optional override; comma-separated list. empty => send to admin email
            legacy_email_cc TEXT, -- optional CC; comma-separated list
            legacy_email_from_name TEXT, -- optional override; empty => use SMTP from_name
            legacy_email_from_email TEXT, -- optional override; empty => use SMTP from_email
            legacy_email_subject_template TEXT, -- optional; supports template variables
            legacy_email_body_template TEXT, -- optional; supports template variables
            last_checked_at INTEGER,
            last_status TEXT, -- up, down, unknown
            last_response_time INTEGER, -- ms
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            tab_name TEXT,
            group_name TEXT,
            maintenance_start INTEGER,
            maintenance_end INTEGER
        )');

        // Migrate existing monitors table to add columns
        try {
            @$db->exec('ALTER TABLE monitors ADD COLUMN tab_name TEXT');
        } catch (PDOException $e) { /* ignore if column already exists */ }
        try {
            @$db->exec('ALTER TABLE monitors ADD COLUMN group_name TEXT');
        } catch (PDOException $e) { /* ignore if column already exists */ }
        try {
            @$db->exec('ALTER TABLE monitors ADD COLUMN maintenance_start INTEGER');
        } catch (PDOException $e) { /* ignore if column already exists */ }
        try {
            @$db->exec('ALTER TABLE monitors ADD COLUMN maintenance_end INTEGER');
        } catch (PDOException $e) { /* ignore if column already exists */ }
        try {
            @$db->exec('ALTER TABLE monitors ADD COLUMN last_notified_status TEXT');
        } catch (PDOException $e) { /* ignore if column already exists */ }
        try { @$db->exec('ALTER TABLE monitors ADD COLUMN legacy_notify_pending INTEGER DEFAULT 0'); } catch (PDOException $e) { /* ignore */ }
        try { @$db->exec('ALTER TABLE monitors ADD COLUMN legacy_email_disabled INTEGER DEFAULT 0'); } catch (PDOException $e) { /* ignore */ }
        try { @$db->exec('ALTER TABLE monitors ADD COLUMN legacy_email_to TEXT'); } catch (PDOException $e) { /* ignore */ }
        try { @$db->exec('ALTER TABLE monitors ADD COLUMN legacy_email_cc TEXT'); } catch (PDOException $e) { /* ignore */ }
        try { @$db->exec('ALTER TABLE monitors ADD COLUMN legacy_email_from_name TEXT'); } catch (PDOException $e) { /* ignore */ }
        try { @$db->exec('ALTER TABLE monitors ADD COLUMN legacy_email_from_email TEXT'); } catch (PDOException $e) { /* ignore */ }
        try { @$db->exec('ALTER TABLE monitors ADD COLUMN legacy_email_subject_template TEXT'); } catch (PDOException $e) { /* ignore */ }
        try { @$db->exec('ALTER TABLE monitors ADD COLUMN legacy_email_body_template TEXT'); } catch (PDOException $e) { /* ignore */ }
        try { @$db->exec('ALTER TABLE monitors ADD COLUMN warning_threshold INTEGER DEFAULT 1'); } catch (PDOException $e) { /* ignore */ }
        try { @$db->exec('ALTER TABLE monitors ADD COLUMN consecutive_failures INTEGER DEFAULT 0'); } catch (PDOException $e) { /* ignore */ }
        try { @$db->exec('ALTER TABLE monitors ADD COLUMN timeout INTEGER'); } catch (PDOException $e) { /* ignore */ }
        try { @$db->exec('ALTER TABLE monitors ADD COLUMN permissions_mode INTEGER DEFAULT 0'); } catch (PDOException $e) { /* ignore */ }

        // Create user_monitor_permissions table (view-only for non-admin users)
        $db->exec('CREATE TABLE IF NOT EXISTS user_monitor_permissions (
            user_id INTEGER NOT NULL,
            monitor_id INTEGER NOT NULL,
            can_view INTEGER DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, monitor_id)
        )');

        // Create monitor_logs table
        $db->exec('CREATE TABLE IF NOT EXISTS monitor_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            monitor_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            response_time INTEGER,
            details TEXT,
            checked_at INTEGER NOT NULL,
            FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE
        )');

        // Create indexes for monitors
        try {
            $db->exec('CREATE INDEX IF NOT EXISTS idx_monitors_type ON monitors(type)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_monitors_status ON monitors(last_status)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_monitors_permissions_mode ON monitors(permissions_mode)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_monitor_logs_monitor_id ON monitor_logs(monitor_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_monitor_logs_checked_at ON monitor_logs(checked_at)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_user_monitor_permissions_monitor_id ON user_monitor_permissions(monitor_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_user_monitor_permissions_user_id ON user_monitor_permissions(user_id)');
        } catch (PDOException $e) {
            // Indices might already exist
        }

        // Create monitor_notification_rules table
        $db->exec('CREATE TABLE IF NOT EXISTS monitor_notification_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            monitor_id INTEGER NOT NULL,
            name TEXT,
            sort_order INTEGER DEFAULT 0,
            status_trigger TEXT NOT NULL, -- up, down, or both
            time_window_start TEXT, -- HH:MM format (24-hour), null means always active
            time_window_end TEXT, -- HH:MM format (24-hour), null means always active
            days_of_week TEXT, -- comma-separated: 0=Sunday, 1=Monday, etc. null means all days
            subject_template TEXT NOT NULL,
            body_template TEXT NOT NULL,
            from_name TEXT,
            from_email TEXT,
            cc_emails TEXT, -- optional CC list (comma-separated)
            is_enabled INTEGER DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )');

        // Migrate monitor_notification_rules to add name column if missing
        try {
            @$db->exec('ALTER TABLE monitor_notification_rules ADD COLUMN name TEXT');
        } catch (PDOException $e) { /* ignore if column already exists */ }
        try {
            @$db->exec('ALTER TABLE monitor_notification_rules ADD COLUMN cc_emails TEXT');
        } catch (PDOException $e) { /* ignore if column already exists */ }
        try {
            @$db->exec('ALTER TABLE monitor_notification_rules ADD COLUMN sort_order INTEGER DEFAULT 0');
        } catch (PDOException $e) { /* ignore if column already exists */ }
        try {
            // Backfill empty names to a sensible default
            @$db->exec("UPDATE monitor_notification_rules SET name = 'Notification Rule' WHERE name IS NULL OR TRIM(name) = ''");
        } catch (PDOException $e) { /* ignore */ }

        // One-time backfill for sort_order to preserve previous UI ordering (created_at DESC).
        // We do it once and store a flag in settings to avoid doing this work every request.
        try {
            $migrationCheck = $db->query("SELECT value FROM settings WHERE key = 'monitor_notification_rules_sort_migrated'")->fetch();
            if (!$migrationCheck) {
                $stmt = $db->query("SELECT id, monitor_id FROM monitor_notification_rules ORDER BY monitor_id ASC, created_at DESC, id DESC");
                $all = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
                $curMonitor = null;
                $pos = 0;
                // Only set sort_order for rows that haven't been assigned yet.
                // This prevents accidentally overwriting user-defined ordering if this migration runs again.
                $upd = $db->prepare("UPDATE monitor_notification_rules SET sort_order = ? WHERE id = ? AND COALESCE(sort_order, 0) = 0");
                foreach ($all as $r) {
                    $mid = (int)($r['monitor_id'] ?? 0);
                    if ($curMonitor === null || $curMonitor !== $mid) {
                        $curMonitor = $mid;
                        $pos = 0;
                    }
                    $pos++;
                    $upd->execute([$pos, (int)$r['id']]);
                }
                $now = time();
                $db->exec("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('monitor_notification_rules_sort_migrated', '1', $now)");
            }
        } catch (Exception $e) {
            // Ignore backfill issues; API/UI will still function using created_at ordering.
        }

        // Create smtp_servers table for multiple SMTP server support
        $db->exec('CREATE TABLE IF NOT EXISTS smtp_servers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            host TEXT NOT NULL,
            port INTEGER NOT NULL DEFAULT 587,
            username TEXT,
            password TEXT,
            from_email TEXT NOT NULL,
            from_name TEXT NOT NULL DEFAULT "{app_name} Monitor",
            encryption TEXT NOT NULL DEFAULT "tls",
            is_active INTEGER DEFAULT 0,
            is_enabled INTEGER DEFAULT 1,
            pause_start TEXT,
            pause_end TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )');

        // Migrate existing SMTP settings from settings table to smtp_servers table
        try {
            // Check if we need to migrate (smtp_servers table is empty but settings table has smtp data)
            $count = $db->query('SELECT COUNT(*) FROM smtp_servers')->fetchColumn();
            if ($count == 0) {
                // Check if we have old settings
                $oldSettings = [];
                $stmt = $db->prepare("SELECT key, value FROM settings WHERE key LIKE 'smtp_%'");
                $stmt->execute();
                while ($row = $stmt->fetch()) {
                    $key = str_replace('smtp_', '', $row['key']);
                    $oldSettings[$key] = $row['value'];
                }
                
                // If we have old settings, migrate them
                if (!empty($oldSettings) && isset($oldSettings['host'])) {
                    $now = time();
                    $insertStmt = $db->prepare('INSERT INTO smtp_servers 
                        (name, host, port, username, password, from_email, from_name, encryption, is_active, is_enabled, pause_start, pause_end, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                    
                    $insertStmt->execute([
                        'Primary SMTP Server',
                        $oldSettings['host'] ?? '',
                        (int)($oldSettings['port'] ?? 587),
                        $oldSettings['username'] ?? '',
                        $oldSettings['password'] ?? '', // Already base64 encoded
                        $oldSettings['from_email'] ?? '',
                        $oldSettings['from_name'] ?? '{app_name} Monitor',
                        $oldSettings['encryption'] ?? 'tls',
                        1, // is_active
                        ($oldSettings['enabled'] ?? '0') === '1' ? 1 : 0,
                        $oldSettings['pause_start'] ?? null,
                        $oldSettings['pause_end'] ?? null,
                        $now,
                        $now
                    ]);
                    
                    error_log('[SMTP Migration] Migrated existing SMTP settings to smtp_servers table');
                }
            }
        } catch (PDOException $e) {
            error_log('[SMTP Migration] Warning: ' . $e->getMessage());
        }

        // Create monitor_notification_recipients table
        $db->exec('CREATE TABLE IF NOT EXISTS monitor_notification_recipients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_id INTEGER NOT NULL,
            email TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )');

        // Create monitor_notification_logs table (for tracking sent notifications)
        $db->exec('CREATE TABLE IF NOT EXISTS monitor_notification_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_id INTEGER, -- NULL for legacy notifications, rule ID for advanced notifications
            monitor_id INTEGER NOT NULL,
            recipient_email TEXT NOT NULL,
            status_trigger TEXT NOT NULL,
            sent_at INTEGER NOT NULL,
            subject TEXT NOT NULL,
            success INTEGER DEFAULT 1,
            error_message TEXT
        )');

        // Outbox table for queued emails (used by external worker scripts, e.g. Python).
        // This prevents monitor checks from blocking on slow SMTP connections.
        $db->exec('CREATE TABLE IF NOT EXISTS email_outbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at INTEGER NOT NULL,
            send_after INTEGER,
            monitor_id INTEGER,
            rule_id INTEGER, -- NULL for legacy notifications, rule ID for advanced notifications
            status_trigger TEXT,
            to_emails TEXT NOT NULL, -- comma-separated
            cc_emails TEXT, -- comma-separated
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            from_name TEXT,
            from_email TEXT,
            attempts INTEGER DEFAULT 0,
            max_attempts INTEGER DEFAULT 3,
            last_error TEXT,
            sent_at INTEGER,
            success INTEGER,
            -- legacy-only helpers (applied by sender after an attempt)
            legacy_clear_pending INTEGER DEFAULT 0,
            legacy_update_last_notified_status TEXT
        )');
        
        // Migrate existing table to allow NULL rule_id (for legacy notifications)
        // Only run migration once by checking a flag
        try {
            $migrationCheck = $db->query("SELECT value FROM settings WHERE key = 'monitor_notification_logs_migrated'")->fetch();
            if (!$migrationCheck) {
                // SQLite doesn't support ALTER COLUMN, so we need to recreate the table
                // But we'll do this safely by checking if migration is needed
                $stmt = $db->query("PRAGMA table_info(monitor_notification_logs)");
                $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $ruleIdColumn = null;
                foreach ($columns as $col) {
                    if ($col['name'] === 'rule_id') {
                        $ruleIdColumn = $col;
                        break;
                    }
                }
                // If rule_id is NOT NULL, we need to migrate
                if ($ruleIdColumn && $ruleIdColumn['notnull'] == 1) {
                    // Create new table with NULL allowed
                    $db->exec('CREATE TABLE IF NOT EXISTS monitor_notification_logs_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        rule_id INTEGER,
                        monitor_id INTEGER NOT NULL,
                        recipient_email TEXT NOT NULL,
                        status_trigger TEXT NOT NULL,
                        sent_at INTEGER NOT NULL,
                        subject TEXT NOT NULL,
                        success INTEGER DEFAULT 1,
                        error_message TEXT
                    )');
                    // Copy data
                    $db->exec('INSERT INTO monitor_notification_logs_new SELECT * FROM monitor_notification_logs');
                    // Drop old table
                    $db->exec('DROP TABLE monitor_notification_logs');
                    // Rename new table
                    $db->exec('ALTER TABLE monitor_notification_logs_new RENAME TO monitor_notification_logs');
                    // Recreate indexes
                    $db->exec('CREATE INDEX IF NOT EXISTS idx_notification_logs_rule_id ON monitor_notification_logs(rule_id)');
                    $db->exec('CREATE INDEX IF NOT EXISTS idx_notification_logs_monitor_id ON monitor_notification_logs(monitor_id)');
                    $db->exec('CREATE INDEX IF NOT EXISTS idx_notification_logs_sent_at ON monitor_notification_logs(sent_at)');
                    
                    // Mark migration as complete
                    $db->exec("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('monitor_notification_logs_migrated', '1', " . time() . ")");
                } else {
                    // Migration not needed, mark as done anyway
                    $db->exec("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('monitor_notification_logs_migrated', '1', " . time() . ")");
                }
            }
        } catch (PDOException $e) {
            // Migration might have already been done or table doesn't exist yet
            error_log("Monitor notification logs migration warning: " . $e->getMessage());
        }

        // Create indexes for notification tables
        try {
            $db->exec('CREATE INDEX IF NOT EXISTS idx_notification_rules_monitor_id ON monitor_notification_rules(monitor_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_notification_rules_enabled ON monitor_notification_rules(is_enabled)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_notification_rules_monitor_sort ON monitor_notification_rules(monitor_id, sort_order)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_notification_recipients_rule_id ON monitor_notification_recipients(rule_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_notification_logs_rule_id ON monitor_notification_logs(rule_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_notification_logs_monitor_id ON monitor_notification_logs(monitor_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_notification_logs_sent_at ON monitor_notification_logs(sent_at)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_email_outbox_sent_at ON email_outbox(sent_at)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_email_outbox_created_at ON email_outbox(created_at)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_email_outbox_monitor_id ON email_outbox(monitor_id)');
        } catch (PDOException $e) {
            // Indices might already exist
        }
        
        // Migrate existing tables if they exist with NULL user_id
        // SQLite doesn't allow NULL in composite PRIMARY KEY, so we need to migrate to use 0 instead
        // Only migrate once by checking if migration flag exists in settings
        try {
            $migrationCheck = $db->query("SELECT value FROM settings WHERE key = 'arrangements_migrated'")->fetch();
            if (!$migrationCheck) {
                // Migration not done yet - perform it
                $migrationSuccess = true;
                
                // Migrate category_arrangements table first (simpler, no foreign keys)
                $catTableExists = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='category_arrangements'")->fetch();
                if ($catTableExists) {
                    try {
                        // Try to update NULL values first
                        $db->exec('UPDATE category_arrangements SET user_id = 0 WHERE user_id IS NULL');
                        
                        // Check if we need to recreate the table
                        $tableInfo = $db->query("PRAGMA table_info(category_arrangements)")->fetchAll();
                        $hasNotNull = false;
                        foreach ($tableInfo as $col) {
                            if ($col['name'] === 'user_id' && $col['notnull'] == 1) {
                                $hasNotNull = true;
                                break;
                            }
                        }
                        
                        if (!$hasNotNull) {
                            // Recreate table with proper schema (NO FOREIGN KEYS)
                            $db->beginTransaction();
                            try {
                                $db->exec('CREATE TABLE category_arrangements_new (
                                    user_id INTEGER NOT NULL DEFAULT 0,
                                    category_name TEXT NOT NULL,
                                    position INTEGER NOT NULL,
                                    PRIMARY KEY (user_id, category_name)
                                )');
                                $db->exec('INSERT INTO category_arrangements_new (user_id, category_name, position) 
                                           SELECT COALESCE(user_id, 0), category_name, position FROM category_arrangements');
                                $db->exec('DROP TABLE category_arrangements');
                                $db->exec('ALTER TABLE category_arrangements_new RENAME TO category_arrangements');
                                $db->commit();
                            } catch (PDOException $migrateError) {
                                $db->rollBack();
                                error_log('Category arrangements migration failed: ' . $migrateError->getMessage());
                                // Try to at least fix NULL values
                                try {
                                    $db->exec('UPDATE category_arrangements SET user_id = 0 WHERE user_id IS NULL');
                                } catch (PDOException $updateError) {
                                    // Ignore
                                }
                            }
                        }
                    } catch (PDOException $e) {
                        error_log('Category arrangements migration failed: ' . $e->getMessage());
                        $migrationSuccess = false;
                    }
                }
                
                // Migrate tile_arrangements table
                if ($migrationSuccess) {
                    $tileTableExists = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='tile_arrangements'")->fetch();
                    if ($tileTableExists) {
                        try {
                            $db->exec('UPDATE tile_arrangements SET user_id = 0 WHERE user_id IS NULL');
                            
                            $tableInfo = $db->query("PRAGMA table_info(tile_arrangements)")->fetchAll();
                            $hasNotNull = false;
                            foreach ($tableInfo as $col) {
                                if ($col['name'] === 'user_id' && $col['notnull'] == 1) {
                                    $hasNotNull = true;
                                    break;
                                }
                            }
                            
                            if (!$hasNotNull) {
                                $db->beginTransaction();
                                $db->exec('CREATE TABLE tile_arrangements_new (
                                    user_id INTEGER NOT NULL DEFAULT 0,
                                    tile_id TEXT NOT NULL,
                                    position INTEGER NOT NULL,
                                    group_name TEXT,
                                    PRIMARY KEY (user_id, tile_id),
                                    FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE
                                )');
                                $db->exec('INSERT INTO tile_arrangements_new (user_id, tile_id, position, group_name) 
                                           SELECT COALESCE(user_id, 0), tile_id, position, group_name FROM tile_arrangements');
                                $db->exec('DROP TABLE tile_arrangements');
                                $db->exec('ALTER TABLE tile_arrangements_new RENAME TO tile_arrangements');
                                $db->commit();
                            }
                        } catch (PDOException $e) {
                            error_log('Tile arrangements migration failed: ' . $e->getMessage());
                            $migrationSuccess = false;
                        }
                    }
                }
                
                // Mark migration as complete
                if ($migrationSuccess) {
                    $stmt = $db->prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
                    $stmt->execute(['arrangements_migrated', '1', time()]);
                }
            }
        } catch (PDOException $e) {
            // Migration failed, but continue - tables might work anyway
            error_log('Migration error: ' . $e->getMessage());
        }
        
        // Create roles table for role-based access control
        $db->exec('CREATE TABLE IF NOT EXISTS roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )');
        
        // Create user_roles table for assigning multiple roles to users
        $db->exec('CREATE TABLE IF NOT EXISTS user_roles (
            user_id INTEGER NOT NULL,
            role_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, role_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
        )');
        
        // Create role_tile_permissions table for role-based tile access
        $db->exec('CREATE TABLE IF NOT EXISTS role_tile_permissions (
            role_id INTEGER NOT NULL,
            tile_id TEXT NOT NULL,
            can_view INTEGER DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (role_id, tile_id),
            FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
            FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE
        )');
        
        // Create role_link_permissions table for role-based link access
        $db->exec('CREATE TABLE IF NOT EXISTS role_link_permissions (
            role_id INTEGER NOT NULL,
            link_id TEXT NOT NULL,
            can_view INTEGER DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (role_id, link_id),
            FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
            FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE
        )');
        
        // Create role_tab_permissions table for role-based tab access
        $db->exec('CREATE TABLE IF NOT EXISTS role_tab_permissions (
            role_id INTEGER NOT NULL,
            tab_id TEXT NOT NULL,
            can_view INTEGER DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (role_id, tab_id),
            FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
        )');
        
        // Create role_widget_permissions table for role-based widget access
        $db->exec('CREATE TABLE IF NOT EXISTS role_widget_permissions (
            role_id INTEGER NOT NULL,
            widget_id TEXT NOT NULL,
            can_view INTEGER DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (role_id, widget_id),
            FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
        )');
        
        // Create custom_widgets table for custom widget metadata
        $db->exec('CREATE TABLE IF NOT EXISTS custom_widgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            widget_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            component_path TEXT NOT NULL,
            floating_component_path TEXT,
            icon_svg TEXT,
            requires_auth INTEGER DEFAULT 0,
            enabled INTEGER DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )');
        
        // Create user_groups table for managing user groups
        $db->exec('CREATE TABLE IF NOT EXISTS user_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )');
        
        // Create user_group_members table for group membership
        $db->exec('CREATE TABLE IF NOT EXISTS user_group_members (
            user_id INTEGER NOT NULL,
            group_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, group_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE
        )');
        
        // Create group_roles table for assigning roles to groups
        $db->exec('CREATE TABLE IF NOT EXISTS group_roles (
            group_id INTEGER NOT NULL,
            role_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (group_id, role_id),
            FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE,
            FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
        )');
        
        // Initialize default settings if they don't exist
        $defaultSettings = [
            ['app_name', 'LinkNest', time()],
            ['page_title', 'LinkNest', time()],
            ['spaces_title', 'My Spaces', time()],
            ['logo_type', 'icon', time()], // 'icon' or 'image'
            ['logo_icon', '🔗', time()], // emoji or icon identifier
            ['logo_image', '', time()], // URL or base64 image
        ];
        
        foreach ($defaultSettings as $setting) {
            $stmt = $db->prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
            $stmt->execute($setting);
        }

        // Style profiles table (used by /api/styles for theme CSS config)
        $db->exec('CREATE TABLE IF NOT EXISTS style_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            styles_data TEXT NOT NULL,
            is_active INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )');

        // Tile visit / hit tracking (visitor hits + unique visitors per tile)
        $db->exec('CREATE TABLE IF NOT EXISTS tile_visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tile_id TEXT NOT NULL,
            user_id INTEGER,
            visitor_key TEXT NOT NULL,
            visited_at INTEGER NOT NULL,
            FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )');
        
        // Create indexes for optimal performance
        createDatabaseIndexes($db);

        // Stamp schema version so subsequent connections take the fast path
        $db->exec('PRAGMA user_version = ' . (int)LINKNEST_SCHEMA_VERSION);

        releaseDatabaseInitLock($initLock);
        $initLock = null;
        
        return $db;
    } catch (PDOException $e) {
        releaseDatabaseInitLock($initLock);
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Database initialization failed: ' . $e->getMessage()]);
        exit;
    }
}

/**
 * Create database indexes for optimal query performance
 * This function is safe to call multiple times (uses IF NOT EXISTS)
 */
function createDatabaseIndexes($db) {
    try {
        // Users table indexes
        $db->exec('CREATE INDEX IF NOT EXISTS idx_users_is_approved ON users(is_approved)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_users_approved_admin ON users(is_approved, is_admin)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC)');
        $db->exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_uuid ON users(uuid)');
        
        // Tiles table indexes
        $db->exec('CREATE INDEX IF NOT EXISTS idx_tiles_user_id ON tiles(user_id)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_tiles_position ON tiles(position ASC)');
        
        // Tabs table indexes
        $db->exec('CREATE INDEX IF NOT EXISTS idx_tabs_tile_id ON tabs(tile_id)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_tabs_position ON tabs(tile_id, position)');
        
        // Sections table indexes
        $db->exec('CREATE INDEX IF NOT EXISTS idx_sections_tile_id ON sections(tile_id)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_sections_tab_id ON sections(tab_id)');
        
        // Links table indexes
        $db->exec('CREATE INDEX IF NOT EXISTS idx_links_section_id ON links(section_id)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_links_health_checked_at ON links(health_checked_at)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_links_health_status ON links(health_status)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_links_health_composite ON links(health_status, health_checked_at)');
        
        // Tile arrangements table indexes
        try {
            $db->exec('CREATE INDEX IF NOT EXISTS idx_tile_arrangements_user_id ON tile_arrangements(user_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_tile_arrangements_position ON tile_arrangements(user_id, position)');
        } catch (PDOException $e) {
            // Table might not exist yet, ignore
        }
        
        // Category arrangements table indexes
        try {
            $db->exec('CREATE INDEX IF NOT EXISTS idx_category_arrangements_user_id ON category_arrangements(user_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_category_arrangements_position ON category_arrangements(user_id, position)');
        } catch (PDOException $e) {
            // Table might not exist yet, ignore
        }

        // Style profiles table indexes
        try {
            $db->exec('CREATE INDEX IF NOT EXISTS idx_style_profiles_active ON style_profiles(is_active)');
        } catch (PDOException $e) {
            // Table might not exist yet, ignore
        }

        // Tile visits indexes
        try {
            $db->exec('CREATE INDEX IF NOT EXISTS idx_tile_visits_tile_id ON tile_visits(tile_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_tile_visits_tile_visitor ON tile_visits(tile_id, visitor_key)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_tile_visits_visited_at ON tile_visits(tile_id, visited_at)');
        } catch (PDOException $e) {
            // Table might not exist yet, ignore
        }
        
        // Roles and permissions table indexes
        try {
            $db->exec('CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_role_tile_permissions_role_id ON role_tile_permissions(role_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_role_tile_permissions_tile_id ON role_tile_permissions(tile_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_role_link_permissions_role_id ON role_link_permissions(role_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_role_link_permissions_link_id ON role_link_permissions(link_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_role_tab_permissions_role_id ON role_tab_permissions(role_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_role_tab_permissions_tab_id ON role_tab_permissions(tab_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_role_widget_permissions_role_id ON role_widget_permissions(role_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_role_widget_permissions_widget_id ON role_widget_permissions(widget_id)');
            
            // User tile permissions indexes for faster lookups
            $db->exec('CREATE INDEX IF NOT EXISTS idx_user_tile_permissions_user_id ON user_tile_permissions(user_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_user_tile_permissions_tile_id ON user_tile_permissions(tile_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_user_tile_permissions_tile_edit ON user_tile_permissions(tile_id, can_edit)');
        } catch (PDOException $e) {
            // Table might not exist yet, ignore
        }
        
        // Note: ANALYZE removed from here since we now use connection pooling
        // With singleton pattern, this only runs once per request anyway
        // Run ANALYZE manually via optimize_database.php if needed
        // $db->exec('ANALYZE');
    } catch (PDOException $e) {
        // Log but don't fail - indexes are performance optimizations, not critical
        error_log('Warning: Failed to create some database indexes: ' . $e->getMessage());
    }
}

/**
 * One-time migration from legacy broadcast_messages to broadcast_threads + broadcast_revisions.
 */
function migrateLegacyBroadcastMessagesToThreads(PDO $db) {
    $legacy = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='broadcast_messages'")->fetch();
    if (!$legacy) {
        return;
    }

    $revCount = (int)$db->query('SELECT COUNT(*) FROM broadcast_revisions')->fetchColumn();
    if ($revCount > 0) {
        try {
            $db->exec('DROP TABLE IF EXISTS broadcast_messages');
        } catch (PDOException $e) {
            // ignore
        }
        return;
    }

    $oldRows = $db->query('SELECT * FROM broadcast_messages ORDER BY id ASC')->fetchAll(PDO::FETCH_ASSOC);
    if (empty($oldRows)) {
        $db->exec('DROP TABLE IF EXISTS broadcast_messages');
        return;
    }

    $db->beginTransaction();
    try {
        $activeThreadIds = [];
        foreach ($oldRows as $row) {
            $created = (int)($row['created_at'] ?? time());
            $updated = (int)($row['updated_at'] ?? $created);
            $isAct = ((int)($row['is_active'] ?? 0)) === 1 ? 1 : 0;
            $stmt = $db->prepare('INSERT INTO broadcast_threads (created_at, updated_at, deleted_at, is_active) VALUES (?, ?, NULL, ?)');
            $stmt->execute([$created, $updated, $isAct]);
            $threadId = (int)$db->lastInsertId();
            if ($isAct === 1) {
                $activeThreadIds[] = $threadId;
            }
            $ins = $db->prepare('INSERT INTO broadcast_revisions (thread_id, message, font_family, font_size, color, scroll_speed, expires_at, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?)');
            $ins->execute([
                $threadId,
                (string)($row['message'] ?? ''),
                $row['font_family'] ?? 'Arial, sans-serif',
                $row['font_size'] ?? '16px',
                $row['color'] ?? '#ff0000',
                (int)($row['scroll_speed'] ?? 30),
                !empty($row['expires_at']) ? (int)$row['expires_at'] : null,
                $created,
                isset($row['created_by']) && $row['created_by'] !== null && $row['created_by'] !== '' ? (int)$row['created_by'] : null,
            ]);
        }
        $db->exec('UPDATE broadcast_threads SET is_active = 0');
        if (!empty($activeThreadIds)) {
            $keep = max($activeThreadIds);
            $db->prepare('UPDATE broadcast_threads SET is_active = 1 WHERE id = ?')->execute([$keep]);
        } else {
            $db->exec('UPDATE broadcast_threads SET is_active = 1 WHERE id = (SELECT id FROM broadcast_threads ORDER BY updated_at DESC, id DESC LIMIT 1)');
        }
        $db->exec('DROP TABLE broadcast_messages');
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }
}

// Get database connection (singleton pattern - reuse connection within same request/thread)
function getDB($clear = false) {
    static $dbInstance = null;
    
    // Allow clearing the instance (useful for operations like restore)
    if ($clear === true) {
        $dbInstance = null;
        return null;
    }
    
    // Return cached instance if it exists
    if ($dbInstance !== null) {
        return $dbInstance;
    }
    
    // Create new connection (fast-path when schema version is current)
    $dbInstance = initDatabase();
    return $dbInstance;
}

// Helper function to get authenticated user (never throws - returns null on DB/session errors)
function getAuthenticatedUser() {
    try {
        if (session_status() === PHP_SESSION_NONE) {
            @session_start();
        }
        if (!isset($_SESSION['user_id'])) {
            return null;
        }

        $db = getDB();

        // Check if we're impersonating a user
        $userId = $_SESSION['user_id'];
        if (isset($_SESSION['impersonating_user_id'])) {
            $userId = $_SESSION['impersonating_user_id'];
        }

        $stmt = $db->prepare('SELECT id, username, email, is_admin, is_approved, auth_source, display_name FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $user = $stmt->fetch();

        if ($user) {
            // Convert integer to boolean
            $user['is_admin'] = (bool)$user['is_admin'];
            $user['is_approved'] = (bool)$user['is_approved'];
            $user['auth_source'] = $user['auth_source'] ?? 'local';

            // Ensure username is in session (fix for analytics)
            if (empty($_SESSION['username']) && !empty($user['username'])) {
                $_SESSION['username'] = $user['username'];
            }

            // Add impersonation info if applicable
            if (isset($_SESSION['impersonating_user_id']) && isset($_SESSION['impersonating_admin_id'])) {
                $user['impersonating'] = true;
                $user['impersonating_admin_id'] = (int)$_SESSION['impersonating_admin_id'];

                $adminStmt = $db->prepare('SELECT id, username FROM users WHERE id = ?');
                $adminStmt->execute([$_SESSION['impersonating_admin_id']]);
                $adminUser = $adminStmt->fetch();
                if ($adminUser) {
                    $user['impersonating_admin_username'] = $adminUser['username'];
                }
            } else {
                $user['impersonating'] = false;
            }
        }

        return $user ?: null;
    } catch (Throwable $e) {
        error_log('getAuthenticatedUser error: ' . $e->getMessage());
        return null;
    }
}

// Helper function to check if user is admin
function requireAdmin() {
    $user = getAuthenticatedUser();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Authentication required']);
        exit;
    }
    if (!$user['is_admin']) {
        http_response_code(403);
        echo json_encode(['error' => 'Admin access required']);
        exit;
    }
    return $user;
}

/**
 * Whether a DB/API row is published. Missing/null defaults to published (true).
 */
function isContentPublished($rowOrValue): bool {
    if (is_array($rowOrValue)) {
        if (!array_key_exists('published', $rowOrValue) || $rowOrValue['published'] === null || $rowOrValue['published'] === '') {
            return true;
        }
        $value = $rowOrValue['published'];
    } else {
        if ($rowOrValue === null || $rowOrValue === '') {
            return true;
        }
        $value = $rowOrValue;
    }
    if (is_bool($value)) {
        return $value;
    }
    if (is_string($value)) {
        $lower = strtolower(trim($value));
        if ($lower === 'false' || $lower === '0' || $lower === 'no' || $lower === 'off') {
            return false;
        }
        if ($lower === 'true' || $lower === '1' || $lower === 'yes' || $lower === 'on') {
            return true;
        }
    }
    return (int)$value === 1;
}

/**
 * Resolve published flag for create/update.
 * Only platform admins may set unpublished; non-admins are forced to published.
 * When the key is omitted, $currentPublished is preserved (defaults to true).
 */
function resolvePublishedFlag($data, $user, $currentPublished = true): int {
    $isAdmin = $user && !empty($user['is_admin']);
    if (!is_array($data) || !array_key_exists('published', $data)) {
        return $currentPublished ? 1 : 0;
    }
    $wantPublished = isContentPublished(['published' => $data['published']]);
    if (!$wantPublished && !$isAdmin) {
        return 1;
    }
    return $wantPublished ? 1 : 0;
}

/**
 * Non-admins must not see unpublished content (visibility/ACL does not override).
 */
function canUserSeePublishedContent($user, $rowOrValue): bool {
    if (isContentPublished($rowOrValue)) {
        return true;
    }
    return $user && !empty($user['is_admin']);
}

/**
 * Check whether the current user may see content by visibility / ACL.
 * Accepts DB rows (snake_case) or already-mapped arrays (camelCase).
 * Does not apply role-based link overrides — callers handle those separately.
 *
 * @param array|null $user Authenticated user or null for guests
 * @param array $row Content row with visibility / allowed users / groups
 * @param array $userGroupIds Group IDs for the current user
 */
function canUserSeeByVisibility(?array $user, array $row, array $userGroupIds = []): bool {
    if ($user && !empty($user['is_admin'])) {
        return true;
    }

    $visibility = $row['visibility'] ?? 'public';
    if ($visibility === '' || $visibility === null) {
        $visibility = 'public';
    }

    if ($visibility === 'public') {
        return true;
    }

    if ($visibility === 'authenticated') {
        return (bool)$user;
    }

    if ($visibility === 'private') {
        if (!$user) {
            return false;
        }

        $allowedUsers = $row['allowed_users'] ?? $row['allowedUsers'] ?? [];
        if (is_string($allowedUsers)) {
            $allowedUsers = json_decode($allowedUsers, true) ?: [];
        }
        if (!is_array($allowedUsers)) {
            $allowedUsers = [];
        }

        if (in_array($user['id'], $allowedUsers, false) || in_array((int)$user['id'], array_map('intval', $allowedUsers), true)) {
            return true;
        }

        $allowedGroups = $row['allowed_groups'] ?? $row['allowedGroups'] ?? [];
        if (is_string($allowedGroups)) {
            $allowedGroups = json_decode($allowedGroups, true) ?: [];
        }
        if (!is_array($allowedGroups)) {
            $allowedGroups = [];
        }

        if (!empty($allowedGroups) && !empty($userGroupIds)) {
            $allowedGroupInts = array_map('intval', $allowedGroups);
            $userGroupInts = array_map('intval', $userGroupIds);
            return !empty(array_intersect($userGroupInts, $allowedGroupInts));
        }

        return false;
    }

    // Unknown visibility values default to public for backward compatibility
    return true;
}

// Helper function to check if user has permission to edit a tile
function canUserEditTile($userId, $tileId, $db) {
    // Admins can always edit - check if current authenticated user is admin
    $user = getAuthenticatedUser();
    if ($user && $user['is_admin']) {
        return true;
    }
    
    // Check if user is the creator of the tile
    $tileStmt = $db->prepare('SELECT user_id FROM tiles WHERE id = ?');
    $tileStmt->execute([$tileId]);
    $tile = $tileStmt->fetch();
    
    if ($tile && isset($tile['user_id']) && (int)$tile['user_id'] === (int)$userId) {
        return true; // User is the creator, allow edit
    }
    
    // Check if user has explicit edit permission
    $stmt = $db->prepare('SELECT can_edit FROM user_tile_permissions WHERE user_id = ? AND tile_id = ?');
    $stmt->execute([$userId, $tileId]);
    $permission = $stmt->fetch();
    
    // If no explicit permission exists, default to true (allow edit)
    // This handles the case where permission tables exist but aren't being used
    if ($permission === false) {
        return true; // No permission record = allow edit (backward compatibility)
    }
    
    return (bool)$permission['can_edit'];
}

// Helper function to get user's role IDs (including roles from groups)
function getUserRoleIds($userId, $db) {
    if (!$userId) {
        return [];
    }
    
    $roleIds = [];
    
    // Get roles directly assigned to user
    $stmt = $db->prepare('SELECT role_id FROM user_roles WHERE user_id = ?');
    $stmt->execute([$userId]);
    while ($row = $stmt->fetch()) {
        $roleIds[] = (int)$row['role_id'];
    }
    
    // Get roles from groups the user belongs to
    $groupStmt = $db->prepare('
        SELECT DISTINCT gr.role_id 
        FROM user_group_members ugm
        INNER JOIN group_roles gr ON ugm.group_id = gr.group_id
        WHERE ugm.user_id = ?
    ');
    $groupStmt->execute([$userId]);
    while ($row = $groupStmt->fetch()) {
        $roleId = (int)$row['role_id'];
        // Avoid duplicates
        if (!in_array($roleId, $roleIds)) {
            $roleIds[] = $roleId;
        }
    }
    
    return $roleIds;
}

// Helper function to check if user can view a tile based on roles
function canUserViewTileByRole($userId, $tileId, $db) {
    if (!$userId) {
        return false;
    }
    
    $roleIds = getUserRoleIds($userId, $db);
    if (empty($roleIds)) {
        return false; // No roles, no access via roles
    }
    
    $placeholders = implode(',', array_fill(0, count($roleIds), '?'));
    $stmt = $db->prepare("SELECT COUNT(*) FROM role_tile_permissions WHERE role_id IN ($placeholders) AND tile_id = ? AND can_view = 1");
    $params = array_merge($roleIds, [$tileId]);
    $stmt->execute($params);
    
    return (int)$stmt->fetchColumn() > 0;
}

// Helper function to get granular tile admin permissions
function getTileAdminPermissions($userId, $tileId, $db) {
    if (!$userId || !$tileId) {
        return null;
    }
    
    $stmt = $db->prepare('
        SELECT 
            can_add_links, can_add_sections, can_add_tabs,
            can_edit_links, can_delete_links, can_delete_sections, can_delete_tabs,
            can_change_visibility, can_change_browser, can_clone_tile, can_view_tile_info, can_edit_tile
        FROM user_tile_permissions 
        WHERE user_id = ? AND tile_id = ? AND can_edit = 1
    ');
    $stmt->execute([$userId, $tileId]);
    $result = $stmt->fetch();
    
    if (!$result) {
        return null; // Not a tile admin
    }
    
    return [
        'canAddLinks' => (bool)($result['can_add_links'] ?? true),
        'canAddSections' => (bool)($result['can_add_sections'] ?? true),
        'canAddTabs' => (bool)($result['can_add_tabs'] ?? true),
        'canEditLinks' => (bool)($result['can_edit_links'] ?? true),
        'canDeleteLinks' => (bool)($result['can_delete_links'] ?? false),
        'canDeleteSections' => (bool)($result['can_delete_sections'] ?? false),
        'canDeleteTabs' => (bool)($result['can_delete_tabs'] ?? false),
        'canChangeVisibility' => (bool)($result['can_change_visibility'] ?? false),
        'canChangeBrowser' => (bool)($result['can_change_browser'] ?? false),
        'canCloneTile' => (bool)($result['can_clone_tile'] ?? false),
        'canViewTileInfo' => (bool)($result['can_view_tile_info'] ?? true),
        'canEditTile' => (bool)($result['can_edit_tile'] ?? true)
    ];
}

// Helper function to check if user is tile admin with specific permission
// This respects tile admin restrictions even if user has role-based permissions
function canTileAdminPerformAction($userId, $tileId, $action, $db) {
    // Admins and tile creators bypass all restrictions
    $user = getAuthenticatedUser();
    if ($user && $user['is_admin']) {
        return true;
    }
    
    // Check if user is the creator
    $tileStmt = $db->prepare('SELECT user_id FROM tiles WHERE id = ?');
    $tileStmt->execute([$tileId]);
    $tile = $tileStmt->fetch();
    if ($tile && isset($tile['user_id']) && (int)$tile['user_id'] === (int)$userId) {
        return true; // Creator has full access
    }
    
    // Get tile admin permissions
    $perms = getTileAdminPermissions($userId, $tileId, $db);
    if ($perms === null) {
        // Not a tile admin, check role-based permissions or default behavior
        return null; // Let caller decide based on other permissions
    }
    
    // Map action names to permission fields
    $actionMap = [
        'add_link' => 'canAddLinks',
        'add_section' => 'canAddSections',
        'add_tab' => 'canAddTabs',
        'edit_link' => 'canEditLinks',
        'delete_link' => 'canDeleteLinks',
        'delete_section' => 'canDeleteSections',
        'delete_tab' => 'canDeleteTabs',
        'change_visibility' => 'canChangeVisibility',
        'change_browser' => 'canChangeBrowser',
        'clone_tile' => 'canCloneTile',
        'view_tile_info' => 'canViewTileInfo',
        'edit_tile' => 'canEditTile'
    ];
    
    if (!isset($actionMap[$action])) {
        return null; // Unknown action
    }
    
    return $perms[$actionMap[$action]];
}

// Helper function to check if user can view a link based on roles
function canUserViewLinkByRole($userId, $linkId, $db) {
    if (!$userId) {
        return false;
    }
    
    $roleIds = getUserRoleIds($userId, $db);
    if (empty($roleIds)) {
        return false; // No roles, no access via roles
    }
    
    $placeholders = implode(',', array_fill(0, count($roleIds), '?'));
    $stmt = $db->prepare("SELECT COUNT(*) FROM role_link_permissions WHERE role_id IN ($placeholders) AND link_id = ? AND can_view = 1");
    $params = array_merge($roleIds, [$linkId]);
    $stmt->execute($params);
    
    return (int)$stmt->fetchColumn() > 0;
}

// Helper function to check if user can view a tab based on roles
function canUserViewTabByRole($userId, $tabId, $db) {
    if (!$userId) {
        return false; // Unauthenticated users use global settings only
    }
    
    $roleIds = getUserRoleIds($userId, $db);
    if (empty($roleIds)) {
        return false; // No roles, no access via roles - use global settings
    }
    
    $placeholders = implode(',', array_fill(0, count($roleIds), '?'));
    $stmt = $db->prepare("SELECT COUNT(*) FROM role_tab_permissions WHERE role_id IN ($placeholders) AND tab_id = ? AND can_view = 1");
    $params = array_merge($roleIds, [$tabId]);
    $stmt->execute($params);
    
    return (int)$stmt->fetchColumn() > 0;
}

// Helper function to check if user has permission to delete a tile
function canUserDeleteTile($userId, $tileId, $db) {
    // Admins can always delete - check if current authenticated user is admin
    $user = getAuthenticatedUser();
    if ($user && $user['is_admin']) {
        return true;
    }
    
    // Check if user is the creator of the tile
    $tileStmt = $db->prepare('SELECT user_id FROM tiles WHERE id = ?');
    $tileStmt->execute([$tileId]);
    $tile = $tileStmt->fetch();
    
    if ($tile && isset($tile['user_id']) && (int)$tile['user_id'] === (int)$userId) {
        return true; // User is the creator, allow delete/archive
    }
    
    // Check if user has explicit delete permission
    $stmt = $db->prepare('SELECT can_delete FROM user_tile_permissions WHERE user_id = ? AND tile_id = ?');
    $stmt->execute([$userId, $tileId]);
    $permission = $stmt->fetch();
    
    // If no explicit permission exists, default to true (allow delete)
    // This handles the case where permission tables exist but aren't being used
    if ($permission === false) {
        return true; // No permission record = allow delete (backward compatibility)
    }
    
    return (bool)$permission['can_delete'];
}

// Helper function to check if user has permission to view a tile (for edit operations)
function canUserViewTile($userId, $tileId, $db) {
    // Admins can always view - check if current authenticated user is admin
    $user = getAuthenticatedUser();
    if ($user && $user['is_admin']) {
        return true;
    }
    
    // Check if user has explicit view permission
    $stmt = $db->prepare('SELECT can_view FROM user_tile_permissions WHERE user_id = ? AND tile_id = ?');
    $stmt->execute([$userId, $tileId]);
    $permission = $stmt->fetch();
    
    // If no explicit permission exists, default to true (users can view by default)
    // Only deny if explicitly set to false
    if ($permission === false) {
        return true; // No permission record = default view access
    }
    
    return (bool)$permission['can_view'];
}

// Helper function to require authentication
function requireAuth() {
    // Check for system token first (for cron/system tasks)
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    $token = '';
    if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
        $token = $matches[1];
    } elseif (isset($_GET['token'])) {
        $token = $_GET['token'];
    }

    if ($token && defined('SYSTEM_TOKEN') && $token === SYSTEM_TOKEN) {
        return ['id' => 0, 'username' => 'system', 'is_admin' => true, 'is_approved' => true];
    }

    $user = getAuthenticatedUser();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Authentication required']);
        exit;
    }
    return $user;
}

function normalizeBoxAlign($value): string {
    $v = is_string($value) ? strtolower(trim($value)) : '';
    return in_array($v, ['left', 'center', 'right'], true) ? $v : 'left';
}

function normalizeBoxFontWeight($value): string {
    $v = is_string($value) ? strtolower(trim($value)) : '';
    return $v === 'bold' ? 'bold' : 'normal';
}

function normalizeBoxFontSize($value): string {
    $v = is_string($value) ? strtolower(trim($value)) : '';
    return in_array($v, ['sm', 'md', 'lg'], true) ? $v : 'md';
}

function normalizeBoxBgColor($value): ?string {
    if (!is_string($value)) {
        return null;
    }
    $v = trim($value);
    if ($v === '') {
        return null;
    }
    if ($v[0] !== '#') {
        $v = '#' . $v;
    }
    if (preg_match('/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/', $v)) {
        return strtolower($v);
    }
    return null;
}

function normalizeBoxImportance($value): string {
    $v = is_string($value) ? strtolower(trim($value)) : '';
    $allowed = ['notes', 'info', 'tip', 'important', 'warning', 'critical'];
    return in_array($v, $allowed, true) ? $v : 'notes';
}

function normalizeBoxHeaderEmoji($value): ?string {
    if (!is_string($value)) {
        return null;
    }
    $v = trim($value);
    if ($v === '') {
        return null;
    }
    // Keep short emoji/icon strings only
    if (mb_strlen($v) > 16) {
        return mb_substr($v, 0, 16);
    }
    return $v;
}

function isRichTextBoxedFlag($value): bool {
    return $value === true || $value === 1 || $value === '1' || $value === 'true';
}

// Map a rich_text_content DB row to the API shape used by the frontend
function mapRichTextRow(array $row): array {
    $allowedUsers = [];
    if (!empty($row['allowed_users'])) {
        $decoded = is_string($row['allowed_users']) ? json_decode($row['allowed_users'], true) : $row['allowed_users'];
        $allowedUsers = is_array($decoded) ? $decoded : [];
    }
    $allowedGroups = [];
    if (!empty($row['allowed_groups'])) {
        $decoded = is_string($row['allowed_groups']) ? json_decode($row['allowed_groups'], true) : $row['allowed_groups'];
        $allowedGroups = is_array($decoded) ? $decoded : [];
    }

    return [
        'id' => $row['id'],
        'content' => $row['content'] ?? '',
        'position' => (int)($row['position'] ?? 0),
        'visibility' => $row['visibility'] ?? 'public',
        'allowedUsers' => $allowedUsers,
        'allowedGroups' => $allowedGroups,
        'boxed' => isRichTextBoxedFlag($row['boxed'] ?? 0),
        'boxTitle' => isset($row['box_title']) && $row['box_title'] !== '' ? $row['box_title'] : null,
        'boxFooter' => isset($row['box_footer']) && $row['box_footer'] !== '' ? $row['box_footer'] : null,
        'boxHeaderAlign' => normalizeBoxAlign($row['box_header_align'] ?? 'left'),
        'boxFooterAlign' => normalizeBoxAlign($row['box_footer_align'] ?? 'left'),
        'boxHeaderBg' => normalizeBoxBgColor($row['box_header_bg'] ?? null),
        'boxFooterBg' => normalizeBoxBgColor($row['box_footer_bg'] ?? null),
        'boxBodyBg' => normalizeBoxBgColor($row['box_body_bg'] ?? null),
        'boxHeaderFontWeight' => normalizeBoxFontWeight($row['box_header_font_weight'] ?? 'bold'),
        'boxFooterFontWeight' => normalizeBoxFontWeight($row['box_footer_font_weight'] ?? 'normal'),
        'boxHeaderFontSize' => normalizeBoxFontSize($row['box_header_font_size'] ?? 'md'),
        'boxFooterFontSize' => normalizeBoxFontSize($row['box_footer_font_size'] ?? 'sm'),
        'boxHeaderEmoji' => normalizeBoxHeaderEmoji($row['box_header_emoji'] ?? null),
        'boxImportance' => normalizeBoxImportance($row['box_importance'] ?? 'notes'),
    ];
}

function pickRichTextField(array $richText, string $camel, string $snake) {
    if (array_key_exists($camel, $richText) && $richText[$camel] !== '' && $richText[$camel] !== null) {
        return $richText[$camel];
    }
    if (array_key_exists($snake, $richText) && $richText[$snake] !== '' && $richText[$snake] !== null) {
        return $richText[$snake];
    }
    return null;
}

// Insert a rich text content row (supports optional boxed container fields)
function insertRichTextContent(PDO $db, string $id, string $sectionId, array $richText): void {
    $boxed = isRichTextBoxedFlag($richText['boxed'] ?? false);

    // Ensure newer style columns exist even if a prior version bump skipped them
    static $styleColumnsEnsured = false;
    if (!$styleColumnsEnsured) {
        try {
            $cols = $db->query('PRAGMA table_info(rich_text_content)')->fetchAll(PDO::FETCH_ASSOC);
            $have = [];
            foreach ($cols as $c) {
                $have[$c['name']] = true;
            }
            $needed = [
                'boxed' => 'INTEGER DEFAULT 0',
                'box_title' => 'TEXT',
                'box_footer' => 'TEXT',
                'box_header_align' => "TEXT DEFAULT 'left'",
                'box_footer_align' => "TEXT DEFAULT 'left'",
                'box_header_bg' => 'TEXT',
                'box_footer_bg' => 'TEXT',
                'box_body_bg' => 'TEXT',
                'box_header_font_weight' => "TEXT DEFAULT 'bold'",
                'box_footer_font_weight' => "TEXT DEFAULT 'normal'",
                'box_header_font_size' => "TEXT DEFAULT 'md'",
                'box_footer_font_size' => "TEXT DEFAULT 'sm'",
                'box_header_emoji' => 'TEXT',
                'box_importance' => "TEXT DEFAULT 'notes'",
                'visibility' => "TEXT DEFAULT 'public'",
                'allowed_users' => 'TEXT',
                'allowed_groups' => 'TEXT',
            ];
            foreach ($needed as $name => $type) {
                if (empty($have[$name])) {
                    $db->exec("ALTER TABLE rich_text_content ADD COLUMN {$name} {$type}");
                }
            }
        } catch (PDOException $e) {
            error_log('ensure rich_text style columns: ' . $e->getMessage());
        }
        $styleColumnsEnsured = true;
    }

    $visibility = $richText['visibility'] ?? 'public';
    if (!in_array($visibility, ['public', 'authenticated', 'private'], true)) {
        $visibility = 'public';
    }
    $allowedUsers = $richText['allowedUsers'] ?? $richText['allowed_users'] ?? [];
    if (is_string($allowedUsers)) {
        $allowedUsers = json_decode($allowedUsers, true) ?: [];
    }
    if (!is_array($allowedUsers)) {
        $allowedUsers = [];
    }
    $allowedGroups = $richText['allowedGroups'] ?? $richText['allowed_groups'] ?? [];
    if (is_string($allowedGroups)) {
        $allowedGroups = json_decode($allowedGroups, true) ?: [];
    }
    if (!is_array($allowedGroups)) {
        $allowedGroups = [];
    }

    $stmt = $db->prepare('INSERT INTO rich_text_content (
        id, section_id, content, position, boxed, box_title, box_footer,
        box_header_align, box_footer_align, box_header_bg, box_footer_bg, box_body_bg,
        box_header_font_weight, box_footer_font_weight, box_header_font_size, box_footer_font_size,
        box_header_emoji, box_importance, visibility, allowed_users, allowed_groups
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        $id,
        $sectionId,
        $richText['content'] ?? '',
        isset($richText['position']) ? (int)$richText['position'] : 0,
        $boxed ? 1 : 0,
        $boxed ? pickRichTextField($richText, 'boxTitle', 'box_title') : null,
        $boxed ? pickRichTextField($richText, 'boxFooter', 'box_footer') : null,
        $boxed ? normalizeBoxAlign(pickRichTextField($richText, 'boxHeaderAlign', 'box_header_align') ?? 'left') : 'left',
        $boxed ? normalizeBoxAlign(pickRichTextField($richText, 'boxFooterAlign', 'box_footer_align') ?? 'left') : 'left',
        $boxed ? (normalizeBoxBgColor(pickRichTextField($richText, 'boxHeaderBg', 'box_header_bg')) ?: '#e2e8f0') : null,
        $boxed ? (normalizeBoxBgColor(pickRichTextField($richText, 'boxFooterBg', 'box_footer_bg')) ?: '#f1f5f9') : null,
        $boxed ? (normalizeBoxBgColor(pickRichTextField($richText, 'boxBodyBg', 'box_body_bg')) ?: '#ffffff') : null,
        $boxed ? normalizeBoxFontWeight(pickRichTextField($richText, 'boxHeaderFontWeight', 'box_header_font_weight') ?? 'bold') : 'bold',
        $boxed ? normalizeBoxFontWeight(pickRichTextField($richText, 'boxFooterFontWeight', 'box_footer_font_weight') ?? 'normal') : 'normal',
        $boxed ? normalizeBoxFontSize(pickRichTextField($richText, 'boxHeaderFontSize', 'box_header_font_size') ?? 'md') : 'md',
        $boxed ? normalizeBoxFontSize(pickRichTextField($richText, 'boxFooterFontSize', 'box_footer_font_size') ?? 'sm') : 'sm',
        $boxed ? normalizeBoxHeaderEmoji(pickRichTextField($richText, 'boxHeaderEmoji', 'box_header_emoji')) : null,
        $boxed ? normalizeBoxImportance(pickRichTextField($richText, 'boxImportance', 'box_importance') ?? 'notes') : 'notes',
        $visibility,
        !empty($allowedUsers) ? json_encode(array_values($allowedUsers)) : null,
        !empty($allowedGroups) ? json_encode(array_values($allowedGroups)) : null,
    ]);
}

// Helper function to send JSON response
function sendJSON($data, $statusCode = 200) {
    try {
        $level = ob_get_level();
        for ($i = 0; $i < $level; $i++) {
            @ob_clean();
        }
    } catch (Throwable $e) {
        // Ignore buffer errors so we can still send JSON
    }
    if (headers_sent($file, $line)) {
        error_log("Warning: Headers already sent in $file on line $line - output may be corrupted");
    }
    if (!headers_sent()) {
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        header('Expires: 0');
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// Helper function to get JSON input
function getJSONInput() {
    // Clean any output before reading input
    if (ob_get_level() > 0) {
        ob_clean();
    }
    
    $input = file_get_contents('php://input');
    if ($input === false || empty($input)) {
        sendJSON(['error' => 'No input data received'], 400);
    }
    
    $data = json_decode($input, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        sendJSON(['error' => 'Invalid JSON: ' . json_last_error_msg()], 400);
    }
    return $data;
}

/**
 * Best-effort client IP resolver.
 *
 * Browsers cannot reliably expose the user's public IP, so we resolve it server-side.
 * This function prefers a public REMOTE_ADDR, and falls back to common reverse-proxy headers
 * (Cloudflare / X-Real-IP / X-Forwarded-For) when REMOTE_ADDR is private/loopback.
 *
 * IMPORTANT: Proxy headers can be spoofed if your app is directly exposed to the internet.
 * In production, you should only trust these headers when behind a trusted proxy/load balancer.
 */
function getClientIpAddress(): ?string {
    $server = $_SERVER;

    $normalize = static function ($raw): ?string {
        if (!is_string($raw)) return null;
        $v = trim($raw);
        if ($v === '') return null;

        // Remove IPv6 brackets: [::1]:1234
        if ($v[0] === '[' && str_contains($v, ']')) {
            $v = substr($v, 1);
            $v = strstr($v, ']', true) ?: $v;
        }

        // Remove IPv4 :port
        if (substr_count($v, ':') === 1 && str_contains($v, '.')) {
            $parts = explode(':', $v, 2);
            $v = $parts[0];
        }

        return trim($v);
    };

    $isValidIp = static function (?string $ip): bool {
        if (!$ip) return false;
        return filter_var($ip, FILTER_VALIDATE_IP) !== false;
    };

    $isPublicIp = static function (?string $ip) use ($isValidIp): bool {
        if (!$isValidIp($ip)) return false;
        return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false;
    };

    $remote = $normalize($server['REMOTE_ADDR'] ?? null);
    if ($isPublicIp($remote)) {
        return $remote;
    }

    $candidates = [
        $normalize($server['HTTP_CF_CONNECTING_IP'] ?? null),
        $normalize($server['HTTP_X_REAL_IP'] ?? null),
        $normalize($server['HTTP_CLIENT_IP'] ?? null),
    ];

    // X-Forwarded-For can be a chain: client, proxy1, proxy2
    $xff = $server['HTTP_X_FORWARDED_FOR'] ?? null;
    if (is_string($xff) && trim($xff) !== '') {
        foreach (explode(',', $xff) as $part) {
            $candidates[] = $normalize($part);
        }
    }

    foreach ($candidates as $ip) {
        if ($isPublicIp($ip)) return $ip;
    }

    // If nothing public found, fall back to any valid IP (can be private in local/dev)
    foreach ($candidates as $ip) {
        if ($isValidIp($ip)) return $ip;
    }

    return $isValidIp($remote) ? $remote : null;
}

/**
 * Path to portable encryption key material (travels with the data/ folder on deploy).
 */
function getEncryptionKeyFilePath(): string {
    return dirname(DB_PATH) . DIRECTORY_SEPARATOR . '.encryption_key';
}

/**
 * Legacy key material used before the portable key file existed.
 * Kept so existing ciphertext remains decryptable on the original machine.
 */
function getLegacyEncryptionKeyMaterial(): string {
    return DB_PATH . 'linknest_ldap_encryption_salt_v1';
}

/**
 * Ensure data/.encryption_key exists. Seeded from the legacy path-based material so
 * current installs keep working; copying data/ to another machine preserves decryptability.
 */
function ensureEncryptionKeyFile(): void {
    $keyFile = getEncryptionKeyFilePath();
    if (is_readable($keyFile)) {
        $existing = trim((string)@file_get_contents($keyFile));
        if ($existing !== '') {
            return;
        }
    }
    $dir = dirname($keyFile);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    // Seed with legacy material so already-encrypted LDAP passwords still decrypt
    @file_put_contents($keyFile, getLegacyEncryptionKeyMaterial());
    @chmod($keyFile, 0600);
}

/**
 * Encryption key candidates for decrypt (portable file first, then legacy path key).
 *
 * @return list<string> raw 32-byte keys
 */
function getEncryptionKeyCandidates(): array {
    $candidates = [];
    ensureEncryptionKeyFile();
    $keyFile = getEncryptionKeyFilePath();
    if (is_readable($keyFile)) {
        $material = trim((string)@file_get_contents($keyFile));
        if ($material !== '') {
            $candidates[] = hash('sha256', $material, true);
        }
    }
    $candidates[] = hash('sha256', getLegacyEncryptionKeyMaterial(), true);
    // Unique by binary content
    $unique = [];
    foreach ($candidates as $key) {
        $unique[bin2hex($key)] = $key;
    }
    return array_values($unique);
}

/**
 * Encryption secret for LDAP bind passwords (AES-256).
 * Prefer portable data/.encryption_key so deploy copies keep working across machines.
 */
function getEncryptionKey() {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    $candidates = getEncryptionKeyCandidates();
    $cached = $candidates[0] ?? hash('sha256', getLegacyEncryptionKeyMaterial(), true);
    return $cached;
}

/**
 * Encrypt a password using AES-256-GCM
 * Returns base64-encoded string: iv.tag.encrypted_data
 */
function encryptPassword($password) {
    if (empty($password)) {
        return '';
    }
    
    $key = getEncryptionKey();
    $ivLength = openssl_cipher_iv_length('aes-256-gcm');
    $iv = openssl_random_pseudo_bytes($ivLength);
    
    $tag = '';
    $encrypted = openssl_encrypt(
        $password,
        'aes-256-gcm',
        $key,
        OPENSSL_RAW_DATA,
        $iv,
        $tag
    );
    
    if ($encrypted === false) {
        throw new Exception('Encryption failed');
    }
    
    // Return: base64(iv) . '.' . base64(tag) . '.' . base64(encrypted)
    return base64_encode($iv) . '.' . base64_encode($tag) . '.' . base64_encode($encrypted);
}

/**
 * Return true only when $value looks like encryptPassword() output.
 * Do NOT treat ordinary passwords that happen to contain dots as encrypted.
 */
function isLikelyEncryptedPassword($value): bool {
    if (!is_string($value) || $value === '') {
        return false;
    }
    if (substr_count($value, '.') !== 2) {
        return false;
    }
    $parts = explode('.', $value, 3);
    if (count($parts) !== 3) {
        return false;
    }
    // Reject obvious plaintext with dots (spaces, short segments, etc.)
    foreach ($parts as $part) {
        if ($part === '' || preg_match('/\s/', $part)) {
            return false;
        }
    }
    $iv = base64_decode($parts[0], true);
    $tag = base64_decode($parts[1], true);
    $encrypted = base64_decode($parts[2], true);
    if ($iv === false || $tag === false || $encrypted === false) {
        return false;
    }
    $expectedIvLen = openssl_cipher_iv_length('aes-256-gcm');
    if ($expectedIvLen && strlen($iv) !== $expectedIvLen) {
        return false;
    }
    // GCM auth tag is typically 16 bytes
    if (strlen($tag) !== 16) {
        return false;
    }
    if (strlen($encrypted) < 1) {
        return false;
    }
    return true;
}

/**
 * Decrypt a password encrypted with encryptPassword()
 * Expects format: base64(iv).base64(tag).base64(encrypted_data)
 * Tries portable key file and legacy path-derived keys (deploy / path moves).
 */
function decryptPassword($encryptedPassword) {
    if ($encryptedPassword === null || $encryptedPassword === '') {
        return '';
    }
    $encryptedPassword = (string)$encryptedPassword;

    // Plain text / non-encrypted values — return unchanged
    if (!isLikelyEncryptedPassword($encryptedPassword)) {
        return $encryptedPassword;
    }
    
    $parts = explode('.', $encryptedPassword, 3);
    $iv = base64_decode($parts[0], true);
    $tag = base64_decode($parts[1], true);
    $encrypted = base64_decode($parts[2], true);
    
    if ($iv === false || $tag === false || $encrypted === false) {
        throw new Exception('Invalid base64 encoding in encrypted password');
    }
    
    foreach (getEncryptionKeyCandidates() as $key) {
        $decrypted = openssl_decrypt(
            $encrypted,
            'aes-256-gcm',
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag
        );
        if ($decrypted !== false) {
            return $decrypted;
        }
    }
    
    throw new Exception('Decryption failed - invalid password or corrupted data');
}

/**
 * True when a password value is a UI mask (asterisks/bullets), not a real secret.
 */
function isMaskedPasswordPlaceholder($value): bool {
    if (!is_string($value) || $value === '') {
        return false;
    }
    return (bool)preg_match('/^[\*\x{2022}\x{00B7}\x{25CF}\x{25E6}•·]+$/u', $value);
}

/**
 * Helper: get app_name from settings
 */
function getAppName() {
    try {
        $db = getDB();
        $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'app_name' LIMIT 1");
        $stmt->execute();
        $row = $stmt->fetch();
        return ($row && !empty($row['value'])) ? $row['value'] : null;
    } catch (Exception $e) {
        return null;
    }
}

/**
 * Performance Analytics Add-on Helper Functions
 */

/**
 * Check if performance analytics addon is enabled
 * Cached for performance - only queries DB once per request
 * 
 * @return bool
 */
function isPerformanceAnalyticsEnabled(): bool {
    static $enabled = null;
    
    if ($enabled === null) {
        try {
            $db = getDB();
            $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'performance_analytics_enabled'");
            $stmt->execute();
            $value = $stmt->fetchColumn();
            $enabled = ($value === '1' || $value === 1 || $value === true);
        } catch (Exception $e) {
            error_log("Failed to check performance analytics status: " . $e->getMessage());
            $enabled = false; // Fail gracefully
        }
    }
    
    return $enabled;
}

/**
 * Get analytics database connection (PostgreSQL)
 * Returns null if addon is disabled or connection fails
 * 
 * @return PDO|null
 */
function getAnalyticsDB(): ?PDO {
    static $analyticsDB = null;
    static $attempted = false;
    
    // Early exit if disabled
    if (!isPerformanceAnalyticsEnabled()) {
        return null;
    }
    
    // Return cached connection or failure
    if ($attempted) {
        return $analyticsDB;
    }
    
    $attempted = true;
    
    try {
        $db = getDB();
        $stmt = $db->prepare("
            SELECT key, value FROM settings 
            WHERE key LIKE 'performance_analytics_pg_%'
        ");
        $stmt->execute();
        $settings = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
        
        if (empty($settings['performance_analytics_pg_host']) || 
            empty($settings['performance_analytics_pg_database'])) {
            error_log("Performance analytics: Database connection settings not configured");
            return null;
        }
        
        $dsn = sprintf(
            "pgsql:host=%s;port=%d;dbname=%s",
            $settings['performance_analytics_pg_host'] ?? 'localhost',
            $settings['performance_analytics_pg_port'] ?? 5432,
            $settings['performance_analytics_pg_database'] ?? ''
        );
        
        $analyticsDB = new PDO(
            $dsn,
            $settings['performance_analytics_pg_user'] ?? '',
            $settings['performance_analytics_pg_password'] ?? '',
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_TIMEOUT => 3, // Fast timeout to avoid blocking main app
                PDO::ATTR_PERSISTENT => false
            ]
        );
        
        return $analyticsDB;
        
    } catch (Exception $e) {
        // Log error but don't break main app
        error_log("Performance analytics DB connection failed: " . $e->getMessage());
        $analyticsDB = null;
        return null;
    }
}

/**
 * Send performance metric to analytics queue (non-blocking)
 * Automatically exits if addon is disabled
 * 
 * @param array $metric
 * @return void
 */
function trackPerformanceMetric(array $metric): void {
    // Early exit if disabled - zero overhead
    if (!isPerformanceAnalyticsEnabled()) {
        return;
    }
    
    try {
        $db = getAnalyticsDB();
        if (!$db) {
            return; // Connection failed, skip silently
        }

        // De-dupe immediate duplicates (common in dev due to React StrictMode double effects,
        // or accidental double submits). This keeps time-series intact while suppressing back-to-back duplicates.
        $dedupeKey = $metric['dedupe_key'] ?? null;
        if (is_string($dedupeKey) && $dedupeKey !== '') {
            try {
                $check = $db->prepare("
                    SELECT 1
                    FROM metrics_queue
                    WHERE payload->>'dedupe_key' = :k
                      AND created_at > NOW() - INTERVAL '10 seconds'
                    LIMIT 1
                ");
                $check->execute(['k' => $dedupeKey]);
                if ($check->fetchColumn()) {
                    return; // duplicate detected, skip insert
                }
            } catch (Exception $e) {
                // If the de-dupe check fails, continue with insert (best-effort)
            }
        }
        
        // Quick insert into queue
        $stmt = $db->prepare("
            INSERT INTO metrics_queue (payload, created_at) 
            VALUES (:payload::jsonb, NOW())
        ");
        $stmt->execute([
            'payload' => json_encode($metric)
        ]);
        
        // Optional: Trigger notification for worker (non-blocking)
        try {
            // Worker listens on this channel (see analytics/process-metrics-queue.php)
            $db->exec("NOTIFY metrics_inserted");
        } catch (Exception $e) {
            // Ignore NOTIFY failures
        }
        
    } catch (Exception $e) {
        // Never let analytics failures affect main app
        error_log("Performance analytics tracking failed: " . $e->getMessage());
    }
}

/**
 * Track user login location (called after successful authentication)
 * Automatically exits if addon is disabled or login tracking is off
 * 
 * @param int $userId
 * @param string $username
 * @return void
 */
function trackUserLogin(int $userId, string $username): void {
    // Early exit if disabled
    if (!isPerformanceAnalyticsEnabled()) {
        return;
    }
    
    try {
        $db = getDB();
        $stmt = $db->prepare("
            SELECT value FROM settings 
            WHERE key = 'performance_analytics_track_logins'
        ");
        $stmt->execute();
        $trackLogins = $stmt->fetchColumn();
        
        if ($trackLogins !== '1' && $trackLogins !== 1) {
            return; // Login tracking disabled
        }
        
        // Get user's IP address (proxy-aware)
        $ip = function_exists('getClientIpAddress') ? getClientIpAddress() : ($_SERVER['REMOTE_ADDR'] ?? null);
        
        // Get geolocation from IP
        $geo = null;
        if ($ip) {
            // Load GeoIP function
            $geoipPath = __DIR__ . '/../analytics/geoip/geoip.php';
            if (file_exists($geoipPath)) {
                require_once $geoipPath;
                if (function_exists('getGeoFromIP')) {
                    $geo = getGeoFromIP($ip);
                }
            }
        }
        
        // Store location in session for client-side use
        if ($geo) {
            $_SESSION['country_code'] = $geo['country_code'] ?? 'XX';
            $_SESSION['country_name'] = $geo['country_name'] ?? 'Unknown';
            $_SESSION['region'] = $geo['region_name'] ?? 'Unknown';
            $_SESSION['city'] = $geo['city_name'] ?? 'Unknown';
            $_SESSION['latitude'] = $geo['latitude'] ?? 0.0;
            $_SESSION['longitude'] = $geo['longitude'] ?? 0.0;
            $_SESSION['timezone'] = $geo['timezone'] ?? 'UTC';
        } else {
            // Set defaults if geolocation failed
            $_SESSION['country_code'] = 'XX';
            $_SESSION['country_name'] = 'Unknown';
            $_SESSION['region'] = 'Unknown';
            $_SESSION['city'] = 'Unknown';
            $_SESSION['latitude'] = 0.0;
            $_SESSION['longitude'] = 0.0;
            $_SESSION['timezone'] = 'UTC';
        }
        
        // Prepare metric payload with geolocation
        $metric = [
            'type' => 'user_login',
            'user_id' => $userId,
            'username' => $username,
            'ip' => $ip,
            'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? null,
            'timestamp' => time(),
            'session_id' => session_id(),
            'geolocation' => $geo ? [
                'country_code' => $geo['country_code'] ?? 'XX',
                'country_name' => $geo['country_name'] ?? 'Unknown',
                'region_name' => $geo['region_name'] ?? 'Unknown',
                'city_name' => $geo['city_name'] ?? 'Unknown',
                'latitude' => $geo['latitude'] ?? 0.0,
                'longitude' => $geo['longitude'] ?? 0.0,
                'timezone' => $geo['timezone'] ?? 'UTC'
            ] : null
        ];
        
        // Send to analytics queue
        trackPerformanceMetric($metric);
        
        // Also store in user_geolocations table for analytics (insert even when GeoIP fails – use defaults so table gets data)
        try {
            $analyticsDB = getAnalyticsDB();
            if ($analyticsDB && $ip !== null && $ip !== '') {
                $countryCode = $geo['country_code'] ?? 'XX';
                $countryName = $geo['country_name'] ?? 'Unknown';
                $regionName = $geo['region_name'] ?? 'Unknown';
                $cityName = $geo['city_name'] ?? 'Unknown';
                $lat = (float)($geo['latitude'] ?? 0.0);
                $lng = (float)($geo['longitude'] ?? 0.0);
                $timezoneVal = $geo['timezone'] ?? 'UTC';
                // When we have coordinates but city is unknown, look up from location_lookup (same as process-metrics-queue)
                if ($geo && $lat && $lng && ($cityName === '' || $cityName === 'Unknown')) {
                    $reverseOfflinePath = __DIR__ . '/../analytics/geoip/reverse-geocode-offline.php';
                    if (file_exists($reverseOfflinePath)) {
                        require_once $reverseOfflinePath;
                        if (function_exists('getLocationFromCoordinates')) {
                            $dbLocation = getLocationFromCoordinates($lat, $lng);
                            if (!empty($dbLocation['city_name']) && $dbLocation['city_name'] !== 'Unknown') {
                                $countryCode = $dbLocation['country_code'] ?? $countryCode;
                                $countryName = $dbLocation['country_name'] ?? $countryName;
                                $regionName = $dbLocation['region_name'] ?? $regionName;
                                $cityName = $dbLocation['city_name'];
                            }
                        }
                    }
                }
                $stmt = $analyticsDB->prepare("
                    INSERT INTO user_geolocations (user_id, username, ip_address, country_code, country_name, region_name, city_name, latitude, longitude, timezone, last_seen)
                    VALUES (:user_id, :username, :ip_address, :country_code, :country_name, :region_name, :city_name, :latitude, :longitude, :timezone, NOW())
                    ON CONFLICT (user_id) 
                    DO UPDATE SET 
                        username = EXCLUDED.username,
                        ip_address = EXCLUDED.ip_address,
                        country_code = EXCLUDED.country_code,
                        country_name = EXCLUDED.country_name,
                        region_name = EXCLUDED.region_name,
                        city_name = EXCLUDED.city_name,
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude,
                        timezone = EXCLUDED.timezone,
                        last_seen = NOW()
                ");
                $stmt->execute([
                    'user_id' => $userId,
                    'username' => $username,
                    'ip_address' => $ip,
                    'country_code' => $countryCode,
                    'country_name' => $countryName,
                    'region_name' => $regionName,
                    'city_name' => $cityName,
                    'latitude' => $lat,
                    'longitude' => $lng,
                    'timezone' => $timezoneVal
                ]);
            }
        } catch (Exception $e) {
            // Log but don't fail login if analytics DB update fails
            error_log("Failed to store user geolocation in analytics DB: " . $e->getMessage());
        }
        
    } catch (Exception $e) {
        error_log("Login tracking failed: " . $e->getMessage());
    }
}

/**
 * Get a setting value with default fallback
 * 
 * @param string $key
 * @param mixed $default
 * @return mixed
 */
function getSetting(string $key, $default = null) {
    try {
        $db = getDB();
        $stmt = $db->prepare("SELECT value FROM settings WHERE key = ?");
        $stmt->execute([$key]);
        $value = $stmt->fetchColumn();
        return ($value !== false) ? $value : $default;
    } catch (Exception $e) {
        return $default;
    }
}
