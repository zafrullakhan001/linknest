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
        
        // Optimize SQLite performance settings
        try {
            // Set page size to 4096 for better performance (if not already set)
            // Note: This only works if the database is empty, so we try it but don't fail if it doesn't work
            $db->exec('PRAGMA page_size = 4096');
        } catch (PDOException $e) {
            // Page size can only be set on empty database, ignore if already set
        }
        
        // Set cache size to 10MB for better performance (negative value = KB)
        $db->exec('PRAGMA cache_size = -10000');
        
        // Set synchronous mode to NORMAL for better performance (WAL mode makes this safe)
        $db->exec('PRAGMA synchronous = NORMAL');
        
        // Set temp_store to memory for better performance
        $db->exec('PRAGMA temp_store = MEMORY');
    
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
        
        // Sections table indexes
        $db->exec('CREATE INDEX IF NOT EXISTS idx_sections_tile_id ON sections(tile_id)');
        
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
        
        // Analyze database to update query planner statistics
        $db->exec('ANALYZE');
    } catch (PDOException $e) {
        // Log but don't fail - indexes are performance optimizations, not critical
        error_log('Warning: Failed to create some database indexes: ' . $e->getMessage());
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
