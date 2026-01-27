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

// Doctrine DBAL and database config (multi-database support: SQLite, MySQL, MariaDB, PostgreSQL, SQL Server)
$vendorAutoload = dirname(__DIR__) . '/vendor/autoload.php';
if (file_exists($vendorAutoload)) {
    require_once $vendorAutoload;
}
$dbConfig = file_exists(__DIR__ . '/../config/database.php') ? require __DIR__ . '/../config/database.php' : ['driver' => 'pdo_sqlite', 'path' => dirname(__DIR__) . '/data/linknest.db'];
if (!defined('DB_PATH')) {
    if (!empty($dbConfig['path'])) {
        define('DB_PATH', $dbConfig['path']);
        define('DB_DIR', dirname($dbConfig['path']));
    } else {
        define('DB_PATH', dirname(__DIR__) . '/data/linknest.db');
        define('DB_DIR', dirname(__DIR__) . '/data');
    }
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

define('SYSTEM_TOKEN', 'linknest_secret_token_123'); // Change this for production!

// Create data directory if it doesn't exist (for SQLite)
if (isset($dbConfig['path']) && !file_exists(DB_DIR)) {
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

// Check that the required PDO driver for the configured database is available
$driver = $dbConfig['driver'] ?? 'pdo_sqlite';
$requiredExt = ['pdo_sqlite' => 'pdo_sqlite', 'pdo_mysql' => 'pdo_mysql', 'pdo_pgsql' => 'pdo_pgsql', 'pdo_sqlsrv' => 'pdo_sqlsrv'][$driver] ?? 'pdo_sqlite';
if (!extension_loaded($requiredExt)) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => "Database driver requires the '$requiredExt' extension. Please enable it in php.ini."]);
    exit;
}

// Database helpers (portable insert-ignore, upsert, lastInsertId, introspection)
if (file_exists(__DIR__ . '/db/Helper.php')) {
    require_once __DIR__ . '/db/Helper.php';
}
if (file_exists(__DIR__ . '/schema/LinkNestSchema.php')) {
    require_once __DIR__ . '/schema/LinkNestSchema.php';
}

use Doctrine\DBAL\DriverManager;
use Doctrine\DBAL\Platforms\MySQLPlatform;
use Doctrine\DBAL\Platforms\SqlitePlatform;

// Initialize database (Doctrine DBAL - supports SQLite, MySQL, MariaDB, PostgreSQL, SQL Server)
function initDatabase() {
    if (!class_exists('Doctrine\DBAL\DriverManager')) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Doctrine DBAL is not installed. Run: composer require doctrine/dbal']);
        exit;
    }
    global $dbConfig;
    $maxAttempts = 2;
    $lastException = null;
    for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
        try {
            $params = $dbConfig;
            $conn = DriverManager::getConnection($params);

            // SQLite-specific PRAGMAs for backward compatibility
            if ($conn->getDatabasePlatform() instanceof SqlitePlatform) {
                try {
                    $conn->executeStatement('PRAGMA busy_timeout = 15000');
                    $conn->executeStatement('PRAGMA foreign_keys = OFF');
                    $conn->executeStatement('PRAGMA journal_mode = WAL');
                } catch (\Throwable $e) {
                    // ignore
                }
            }

            // MySQL/MariaDB: set connection charset so FK columns match (avoids errno 150)
            if ($conn->getDatabasePlatform() instanceof MySQLPlatform) {
                try {
                    $conn->executeStatement("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
                } catch (\Throwable $e) {
                    // ignore
                }
            }

            // Apply portable schema (create tables if not exist) in dependency order for MySQL/MariaDB FK safety
            if (function_exists('createLinkNestSchema')) {
                $schema = createLinkNestSchema();
                $sm = method_exists($conn, 'createSchemaManager') ? $conn->createSchemaManager() : $conn->getSchemaManager();
                $tableOrder = [
                    'users', 'tiles', 'tile_versions', 'tabs', 'sections', 'links', 'rich_text_content',
                    'settings', 'addon_status', 'tile_arrangements', 'category_arrangements', 'tile_messages',
                    'user_tile_favorites', 'user_link_favorites', 'user_tile_permissions', 'clones',
                    'user_preferences', 'user_custom_timezones', 'user_alarms', 'user_notes', 'broadcast_messages',
                    'chat_messages', 'monitors', 'user_monitor_permissions', 'monitor_logs', 'monitor_notification_rules',
                    'smtp_servers', 'monitor_notification_recipients', 'monitor_notification_logs', 'email_outbox',
                    'roles', 'user_roles', 'role_tile_permissions', 'role_link_permissions', 'role_tab_permissions',
                    'role_widget_permissions', 'custom_widgets', 'user_groups', 'user_group_members', 'group_roles',
                    'group_tile_permissions', 'style_profiles',
                ];
                $tablesByName = [];
                foreach ($schema->getTables() as $t) {
                    $tablesByName[$t->getName()] = $t;
                }
                foreach ($tableOrder as $name) {
                    if (!isset($tablesByName[$name])) {
                        continue;
                    }
                    $table = $tablesByName[$name];
                    if (!function_exists('tableExists') || !tableExists($conn, $table->getName())) {
                        $sm->createTable($table);
                    }
                }
            }

            // Default admin user if none exists
            $stmt = $conn->prepare('SELECT id FROM users WHERE is_admin = 1 LIMIT 1');
            $result = $stmt->execute();
            if (!$result || !$result->fetchAssociative()) {
                $adminPassword = password_hash('admin123', PASSWORD_DEFAULT);
                $conn->executeStatement(
                    "INSERT INTO users (username, email, password_hash, is_admin, is_approved, created_at) VALUES ('admin', 'admin@linknest.local', ?, 1, 1, " . time() . ")",
                    [$adminPassword]
                );
            }

            // Default addon_status and settings (portable)
            if (function_exists('dbInsertIgnore')) {
                dbInsertIgnore($conn, 'addon_status', [
                    'addon_name' => 'performance_analytics',
                    'is_enabled' => 0,
                    'is_available' => 0,
                    'last_check_at' => time()
                ]);
                $perfDefaults = [
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
                $now = time();
                foreach ($perfDefaults as $key => $value) {
                    dbInsertIgnore($conn, 'settings', ['key' => $key, 'value' => $value, 'updated_at' => $now]);
                }
                foreach ([['app_name', 'LinkNest', $now], ['page_title', 'LinkNest', $now], ['spaces_title', 'My Spaces', $now], ['logo_type', 'icon', $now], ['logo_icon', '🔗', $now], ['logo_image', '', $now]] as $s) {
                    dbInsertIgnore($conn, 'settings', ['key' => $s[0], 'value' => $s[1], 'updated_at' => $s[2]]);
                }
            }

            createDatabaseIndexes($conn);
            return dbConnectionWrapper($conn);
        } catch (\Throwable $e) {
            $lastException = $e;
            $isLocked = (strpos($e->getMessage(), 'database is locked') !== false
                || (method_exists($e, 'getCode') && (int) $e->getCode() === 5));
            if ($isLocked && $attempt < $maxAttempts) {
                usleep(250000);
                continue;
            }
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Database initialization failed: ' . $e->getMessage()]);
            exit;
        }
    }
    if ($lastException !== null) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Database initialization failed: ' . $lastException->getMessage()]);
        exit;
    }
}

/**
 * Wrapper so existing code using $db->exec() and $db->query()->fetch() keeps working.
 */
function dbConnectionWrapper(\Doctrine\DBAL\Connection $conn) {
    return new class($conn) {
        private $conn;
        public function __construct($c) { $this->conn = $c; }
        public function exec($sql) { return $this->conn->executeStatement($sql); }
        public function prepare($sql) {
            $stmt = $this->conn->prepare($sql);
            return new class($stmt) {
                private $stmt;
                private $result = null;
                public function __construct($s) { $this->stmt = $s; }
                public function execute($params = []) { $this->result = $this->stmt->execute($params ?? []); return true; }
                public function fetch($mode = \PDO::FETCH_ASSOC) { return $this->result ? $this->result->fetchAssociative() : false; }
                public function fetchAssociative() { return $this->result ? $this->result->fetchAssociative() : false; }
                public function fetchAll($mode = \PDO::FETCH_ASSOC) { return $this->result ? $this->result->fetchAllAssociative() : []; }
                public function fetchAllAssociative(): array { return $this->result ? $this->result->fetchAllAssociative() : []; }
                public function fetchColumn($col = 0) { return $this->result ? $this->result->fetchOne() : null; }
                public function fetchOne() { return $this->result ? $this->result->fetchOne() : null; }
                public function __call($n, $a) { return method_exists($this->stmt, $n) ? $this->stmt->$n(...$a) : ($this->result ? $this->result->$n(...$a) : null); }
            };
        }
        public function query($sql) {
            $result = $this->conn->executeQuery($sql);
            return new class($result) {
                private $r;
                public function __construct($r) { $this->r = $r; }
                public function fetch($m = \PDO::FETCH_ASSOC) { return $this->r->fetchAssociative(); }
                public function fetchAll($m = \PDO::FETCH_ASSOC) { return $this->r->fetchAllAssociative(); }
                public function fetchColumn($i = 0) { return $this->r->fetchOne(); }
            };
        }
        public function lastInsertId($seq = null) {
            return function_exists('dbLastInsertId') ? dbLastInsertId($this->conn, $seq) : $this->conn->lastInsertId($seq);
        }
        /** PDO-style name; Doctrine uses isTransactionActive() */
        public function inTransaction() {
            return $this->conn->isTransactionActive();
        }
        public function getWrappedConnection() { return $this->conn; }
        public function __call($n, $a) { return $this->conn->$n(...$a); }
    };
}

/**
 * Create database indexes for optimal query performance
 * This function is safe to call multiple times (uses IF NOT EXISTS)
 */
function createDatabaseIndexes($db) {
    $exec = method_exists($db, 'executeStatement') ? function ($sql) use ($db) { return $db->executeStatement($sql); } : function ($sql) use ($db) { return $db->exec($sql); };
    try {
        // Users table indexes
        $exec('CREATE INDEX IF NOT EXISTS idx_users_is_approved ON users(is_approved)');
        $exec('CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin)');
        $exec('CREATE INDEX IF NOT EXISTS idx_users_approved_admin ON users(is_approved, is_admin)');
        $exec('CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC)');
        
        // Tiles table indexes
        $exec('CREATE INDEX IF NOT EXISTS idx_tiles_user_id ON tiles(user_id)');
        $exec('CREATE INDEX IF NOT EXISTS idx_tiles_position ON tiles(position ASC)');
        
        // Tabs table indexes
        $exec('CREATE INDEX IF NOT EXISTS idx_tabs_tile_id ON tabs(tile_id)');
        $exec('CREATE INDEX IF NOT EXISTS idx_tabs_position ON tabs(tile_id, position)');
        
        // Sections table indexes
        $exec('CREATE INDEX IF NOT EXISTS idx_sections_tile_id ON sections(tile_id)');
        $exec('CREATE INDEX IF NOT EXISTS idx_sections_tab_id ON sections(tab_id)');
        
        // Links table indexes
        $exec('CREATE INDEX IF NOT EXISTS idx_links_section_id ON links(section_id)');
        $exec('CREATE INDEX IF NOT EXISTS idx_links_health_checked_at ON links(health_checked_at)');
        $exec('CREATE INDEX IF NOT EXISTS idx_links_health_status ON links(health_status)');
        $exec('CREATE INDEX IF NOT EXISTS idx_links_health_composite ON links(health_status, health_checked_at)');
        
        // Tile arrangements table indexes
        try {
            $exec('CREATE INDEX IF NOT EXISTS idx_tile_arrangements_user_id ON tile_arrangements(user_id)');
            $exec('CREATE INDEX IF NOT EXISTS idx_tile_arrangements_position ON tile_arrangements(user_id, position)');
        } catch (\Throwable $e) {
            // Table might not exist yet, ignore
        }
        
        // Category arrangements table indexes
        try {
            $exec('CREATE INDEX IF NOT EXISTS idx_category_arrangements_user_id ON category_arrangements(user_id)');
            $exec('CREATE INDEX IF NOT EXISTS idx_category_arrangements_position ON category_arrangements(user_id, position)');
        } catch (\Throwable $e) {
            // Table might not exist yet, ignore
        }
        
        // Roles and permissions table indexes
        try {
            $exec('CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id)');
            $exec('CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id)');
            $exec('CREATE INDEX IF NOT EXISTS idx_role_tile_permissions_role_id ON role_tile_permissions(role_id)');
            $exec('CREATE INDEX IF NOT EXISTS idx_role_tile_permissions_tile_id ON role_tile_permissions(tile_id)');
            $exec('CREATE INDEX IF NOT EXISTS idx_role_link_permissions_role_id ON role_link_permissions(role_id)');
            $exec('CREATE INDEX IF NOT EXISTS idx_role_link_permissions_link_id ON role_link_permissions(link_id)');
            $exec('CREATE INDEX IF NOT EXISTS idx_role_tab_permissions_role_id ON role_tab_permissions(role_id)');
            $exec('CREATE INDEX IF NOT EXISTS idx_role_tab_permissions_tab_id ON role_tab_permissions(tab_id)');
            $exec('CREATE INDEX IF NOT EXISTS idx_role_widget_permissions_role_id ON role_widget_permissions(role_id)');
            $exec('CREATE INDEX IF NOT EXISTS idx_role_widget_permissions_widget_id ON role_widget_permissions(widget_id)');
            
            // User tile permissions indexes for faster lookups
            $exec('CREATE INDEX IF NOT EXISTS idx_user_tile_permissions_user_id ON user_tile_permissions(user_id)');
            $exec('CREATE INDEX IF NOT EXISTS idx_user_tile_permissions_tile_id ON user_tile_permissions(tile_id)');
            $exec('CREATE INDEX IF NOT EXISTS idx_user_tile_permissions_tile_edit ON user_tile_permissions(tile_id, can_edit)');
        } catch (\Throwable $e) {
            // Table might not exist yet, ignore
        }
        
        // Note: ANALYZE removed from here since we now use connection pooling
        // With singleton pattern, this only runs once per request anyway
        // Run ANALYZE manually via optimize_database.php if needed
        // $db->exec('ANALYZE');
    } catch (\Throwable $e) {
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
    
    $stmt = $db->prepare('SELECT id, username, email, is_admin, is_approved, auth_source, display_name FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    
    if ($user) {
        // Convert integer to boolean
        $user['is_admin'] = (bool)$user['is_admin'];
        $user['is_approved'] = (bool)$user['is_approved'];
        $user['auth_source'] = $user['auth_source'] ?? 'local';
        
        // Ensure username is in session (fix for analytics)
        // This ensures $_SESSION['username'] is always populated when user is authenticated
        if (empty($_SESSION['username']) && !empty($user['username'])) {
            $_SESSION['username'] = $user['username'];
        }
        
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
        $keyCol = method_exists($db, 'quoteIdentifier') ? $db->quoteIdentifier('key') : '`key`';
        $stmt = $db->prepare("SELECT value FROM settings WHERE " . $keyCol . " = 'app_name' LIMIT 1");
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
            $keyCol = method_exists($db, 'quoteIdentifier') ? $db->quoteIdentifier('key') : '`key`';
            $stmt = $db->prepare("SELECT value FROM settings WHERE " . $keyCol . " = 'performance_analytics_enabled'");
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
        $keyCol = method_exists($db, 'quoteIdentifier') ? $db->quoteIdentifier('key') : '`key`';
        $stmt = $db->prepare("
            SELECT " . $keyCol . ", value FROM settings 
            WHERE " . $keyCol . " LIKE 'performance_analytics_pg_%'
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
        $keyCol = method_exists($db, 'quoteIdentifier') ? $db->quoteIdentifier('key') : '`key`';
        $stmt = $db->prepare("SELECT value FROM settings WHERE " . $keyCol . " = ?");
        $stmt->execute([$key]);
        $value = $stmt->fetchColumn();
        return ($value !== false) ? $value : $default;
    } catch (Exception $e) {
        return $default;
    }
}
