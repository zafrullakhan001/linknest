<?php
// Disable error display, log errors instead
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

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
            foreach ($columns as $column) {
                if ($column['name'] === 'position') {
                    $hasPosition = true;
                }
                if ($column['name'] === 'visible_from') {
                    $hasScheduling = true;
                }
            }
            if (!$hasPosition) {
                $db->exec('ALTER TABLE tabs ADD COLUMN position INTEGER DEFAULT 0');
            }
            if (!$hasScheduling) {
                $db->exec('ALTER TABLE tabs ADD COLUMN visible_from TEXT');
                $db->exec('ALTER TABLE tabs ADD COLUMN expires_at TEXT');
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
        
        // Create user_tile_favorites table for storing user favorites
        $db->exec('CREATE TABLE IF NOT EXISTS user_tile_favorites (
            user_id INTEGER NOT NULL,
            tile_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, tile_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE
        )');
        
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
function getDB() {
    static $dbInstance = null;
    
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
    $stmt = $db->prepare('SELECT id, username, email, is_admin, is_approved FROM users WHERE id = ?');
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    
    if ($user) {
        // Convert integer to boolean
        $user['is_admin'] = (bool)$user['is_admin'];
        $user['is_approved'] = (bool)$user['is_approved'];
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
    
    // If no explicit permission exists, default to false (view-only access)
    // Users must be explicitly granted edit permission
    if ($permission === false) {
        return false; // No permission record = view-only (no edit access)
    }
    
    return (bool)$permission['can_edit'];
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
    
    // If no explicit permission exists, default to false (view-only access)
    // Users must be explicitly granted delete permission
    if ($permission === false) {
        return false; // No permission record = view-only (no delete access)
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
