<?php
// Disable error display, log errors instead
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

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
        
        // Set busy timeout immediately to prevent locks
        $db->exec('PRAGMA busy_timeout = 2000'); // 2 second timeout
        
        // Enable foreign keys
        $db->exec('PRAGMA foreign_keys = ON');
        
        // Use WAL mode for better concurrent access (if supported)
        try {
            $db->exec('PRAGMA journal_mode = WAL');
        } catch (PDOException $e) {
            // WAL might not be available, ignore
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
        
        // Create sections table
        $db->exec('CREATE TABLE IF NOT EXISTS sections (
            id TEXT PRIMARY KEY,
            tile_id TEXT NOT NULL,
            title TEXT,
            FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE
        )');
        
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
            PRIMARY KEY (user_id, category_name)
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
        
        return $db;
    } catch (PDOException $e) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Database initialization failed: ' . $e->getMessage()]);
        exit;
    }
}

// Get database connection
function getDB() {
    return initDatabase();
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
    http_response_code($statusCode);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

// Helper function to get JSON input
function getJSONInput() {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        sendJSON(['error' => 'Invalid JSON: ' . json_last_error_msg()], 400);
    }
    return $data;
}
