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

// Create data directory if it doesn't exist
if (!file_exists(DB_DIR)) {
    if (!mkdir(DB_DIR, 0755, true)) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Failed to create data directory']);
        exit;
    }
}

// CORS headers for development
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight requests
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Check if PDO SQLite is available
if (!extension_loaded('pdo_sqlite')) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'PDO SQLite extension is not enabled. Please enable it in php.ini']);
    exit;
}

// Initialize database
function initDatabase() {
    try {
        $db = new PDO('sqlite:' . DB_PATH);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        
        // Enterprise SQLite Configuration
        // Set busy timeout for concurrent access handling
        $db->exec('PRAGMA busy_timeout = 5000'); // 5000 ms timeout
        
        // Foreign keys disabled for enterprise (as per requirements)
        $db->exec('PRAGMA foreign_keys = OFF');
        
        // Use WAL mode for better concurrent access (enterprise standard)
        try {
            $db->exec('PRAGMA journal_mode = WAL');
        } catch (PDOException $e) {
            // WAL might not be available, ignore
        }
        
        // Optimize SQLite performance settings
        try {
            // Set page size to 4096 (4 KB) for enterprise standard
            // Note: This only works if the database is empty, so we try it but don't fail if it doesn't work
            $db->exec('PRAGMA page_size = 4096');
        } catch (PDOException $e) {
            // Page size can only be set on empty database, ignore if already set
        }
        
        // IN-MEMORY OPTIMIZATION FOR SMALL DATABASES
        // Memory-map the entire database file into RAM for maximum performance
        // This allows SQLite to access the database directly from memory
        // Value in bytes: 100 MB should be more than enough for small databases
        try {
            $db->exec('PRAGMA mmap_size = 104857600'); // 100 MB
        } catch (PDOException $e) {
            // mmap_size might not be available in all SQLite versions, ignore
            error_log('Warning: mmap_size not available: ' . $e->getMessage());
        }
        
        // Increase cache size to hold entire database in memory
        // For small databases (< 1 MB), use 4 MB cache to ensure everything fits
        // Negative value = KB, so -4096 = 4 MB
        $db->exec('PRAGMA cache_size = -4096'); // 4 MB cache
        
        // Set synchronous mode to NORMAL (1) for better performance with WAL mode
        // WAL mode provides durability, so NORMAL is safe and much faster than FULL
        // This significantly improves write performance for small databases
        $db->exec('PRAGMA synchronous = NORMAL');
        
        // Store temporary data in memory instead of disk
        // This speeds up queries that use temporary tables, sorts, etc.
        $db->exec('PRAGMA temp_store = MEMORY');
        
        // Set WAL auto checkpoint to 1000 pages for enterprise
        try {
            $db->exec('PRAGMA wal_autocheckpoint = 1000');
        } catch (PDOException $e) {
            // WAL checkpoint might not be available if not in WAL mode, ignore
        }
        
        // Additional optimizations for small databases
        // Optimize the query planner to use better algorithms
        try {
            $db->exec('PRAGMA optimize');
        } catch (PDOException $e) {
            // PRAGMA optimize might not be available in older SQLite versions, ignore
        }
    
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
        
        // Note: New users require admin approval. Existing users in old databases
        // will need to be manually approved by admin through the admin panel.
        
        // Create default admin account if it doesn't exist
        $stmt = $db->prepare('SELECT id FROM users WHERE is_admin = 1 LIMIT 1');
        $stmt->execute();
        if (!$stmt->fetch()) {
            // Default admin credentials: admin / admin123
            $adminPassword = password_hash('admin123', PASSWORD_DEFAULT);
            $db->exec("INSERT INTO users (username, email, password_hash, is_admin, is_approved, created_at) 
                       VALUES ('admin', 'admin@linknest.local', '$adminPassword', 1, 1, " . time() . ")");
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
            }
        } catch (PDOException $e) {
            error_log('Tiles visibility migration warning: ' . $e->getMessage());
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
            }
        } catch (PDOException $e) {
            error_log('Links visibility migration warning: ' . $e->getMessage());
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
        
        // Create rich_text_content table
        $db->exec('CREATE TABLE IF NOT EXISTS rich_text_content (
            id TEXT PRIMARY KEY,
            section_id TEXT NOT NULL,
            content TEXT NOT NULL,
            position INTEGER DEFAULT 0,
            FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
        )');

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

        // Create broadcast_messages table for site-wide announcement banner
        $db->exec('CREATE TABLE IF NOT EXISTS broadcast_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message TEXT NOT NULL,
            font_family TEXT DEFAULT "Arial, sans-serif",
            font_size TEXT DEFAULT "16px",
            color TEXT DEFAULT "#ff0000",
            is_active INTEGER DEFAULT 1,
            expires_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            created_by INTEGER,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )');


        // Index for active messages
        try {
            $db->exec('CREATE INDEX IF NOT EXISTS idx_broadcast_messages_active ON broadcast_messages(is_active)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_broadcast_messages_expires ON broadcast_messages(expires_at)');
        } catch (PDOException $e) {
            // ignore if index creation fails
        }

        // Migrate existing broadcast_messages table to add scroll_speed column if it doesn't exist
        try {
            $columns = $db->query("PRAGMA table_info(broadcast_messages)")->fetchAll();
            $hasScrollSpeed = false;
            foreach ($columns as $column) {
                if ($column['name'] === 'scroll_speed') {
                    $hasScrollSpeed = true;
                    break;
                }
            }
            if (!$hasScrollSpeed) {
                $db->exec('ALTER TABLE broadcast_messages ADD COLUMN scroll_speed INTEGER DEFAULT 30');
            }
        } catch (PDOException $e) {
            error_log('Broadcast messages scroll_speed migration warning: ' . $e->getMessage());
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
        
        // Create indexes for optimal performance
        createDatabaseIndexes($db);
        
        return $db;
    } catch (PDOException $e) {
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

// Get database connection (singleton pattern - reuse connection within same request)
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
    
    // Create new connection and cache it
    $dbInstance = initDatabase();
    return $dbInstance;
}

// Helper function to get authenticated user
function getAuthenticatedUser() {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
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
    
    $stmt = $db->prepare('SELECT id, username, email, is_admin, is_approved FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    
    if ($user) {
        // Convert integer to boolean
        $user['is_admin'] = (bool)$user['is_admin'];
        $user['is_approved'] = (bool)$user['is_approved'];
        
        // Add impersonation info if applicable
        if (isset($_SESSION['impersonating_user_id']) && isset($_SESSION['impersonating_admin_id'])) {
            $user['impersonating'] = true;
            $user['impersonating_admin_id'] = (int)$_SESSION['impersonating_admin_id'];
            
            // Get admin user info for display
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

// Helper function to get user's role IDs
function getUserRoleIds($userId, $db) {
    if (!$userId) {
        return [];
    }
    
    $stmt = $db->prepare('SELECT role_id FROM user_roles WHERE user_id = ?');
    $stmt->execute([$userId]);
    $roleIds = [];
    while ($row = $stmt->fetch()) {
        $roleIds[] = (int)$row['role_id'];
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

// Helper function to send JSON response
function sendJSON($data, $statusCode = 200) {
    // Clean any output buffers but keep the buffer active
    $level = ob_get_level();
    for ($i = 0; $i < $level; $i++) {
        ob_clean();
    }
    
    // If headers were already sent, log it but try to continue
    if (headers_sent($file, $line)) {
        error_log("Warning: Headers already sent in $file on line $line - output may be corrupted");
        // Try to clean output if possible
        if (ob_get_level() > 0) {
            ob_clean();
        }
    }
    
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    // Prevent stale API responses due to HTTP caching (important for rule reordering, etc.)
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
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

// Encryption secret key for LDAP password encryption
// In production, this should be stored securely (environment variable, secure vault, etc.)
// For now, we'll use a key derived from the database path and a constant salt
function getEncryptionKey() {
    // Generate a consistent key based on DB path and a salt
    // In production, consider using a proper key management system
    $salt = 'linknest_ldap_encryption_salt_v1';
    $keySource = DB_PATH . $salt;
    return hash('sha256', $keySource, true); // Returns 32 bytes for AES-256
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
 * Decrypt a password encrypted with encryptPassword()
 * Expects format: base64(iv).base64(tag).base64(encrypted_data)
 */
function decryptPassword($encryptedPassword) {
    if (empty($encryptedPassword)) {
        return '';
    }
    
    // Handle plain text passwords (for backward compatibility)
    // If it doesn't contain dots, assume it's plain text
    if (strpos($encryptedPassword, '.') === false) {
        return $encryptedPassword;
    }
    
    $parts = explode('.', $encryptedPassword, 3);
    if (count($parts) !== 3) {
        throw new Exception('Invalid encrypted password format');
    }
    
    $iv = base64_decode($parts[0], true);
    $tag = base64_decode($parts[1], true);
    $encrypted = base64_decode($parts[2], true);
    
    if ($iv === false || $tag === false || $encrypted === false) {
        throw new Exception('Invalid base64 encoding in encrypted password');
    }
    
    $key = getEncryptionKey();
    $decrypted = openssl_decrypt(
        $encrypted,
        'aes-256-gcm',
        $key,
        OPENSSL_RAW_DATA,
        $iv,
        $tag
    );
    
    if ($decrypted === false) {
        throw new Exception('Decryption failed - invalid password or corrupted data');
    }
    
    return $decrypted;
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
