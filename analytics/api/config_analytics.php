<?php
/**
 * Analytics Application Configuration
 * PostgreSQL connection helper for analytics endpoints
 */

// Define constant to prevent config.php from sending headers
define('ANALYTICS_API_MODE', true);

// Load main app config to access SQLite settings
// We'll suppress headers by using output buffering
ob_start();
require_once __DIR__ . '/../../api/config.php';
ob_end_clean();

/**
 * Get PostgreSQL connection for analytics
 * Reads connection settings from main SQLite database
 *
 * @param bool $forceNew If true, discard cached connection and create a new one (use after DB was down).
 * @return PDO
 * @throws Exception if connection fails
 */
function getAnalyticsPDO(bool $forceNew = false): PDO {
    static $pdo = null;
    
    if ($forceNew && $pdo !== null) {
        $pdo = null;
    }
    
    if ($pdo !== null) {
        return $pdo;
    }
    
    try {
        // Get settings from main SQLite database
        $db = getDB();
        $stmt = $db->prepare("
            SELECT key, value FROM settings 
            WHERE key LIKE 'performance_analytics_pg_%'
        ");
        $stmt->execute();
        $settings = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
        
        if (empty($settings['performance_analytics_pg_host']) || 
            empty($settings['performance_analytics_pg_database'])) {
            throw new Exception('Analytics database not configured');
        }
        
        $dsn = sprintf(
            "pgsql:host=%s;port=%d;dbname=%s",
            $settings['performance_analytics_pg_host'],
            $settings['performance_analytics_pg_port'] ?? 5432,
            $settings['performance_analytics_pg_database']
        );
        
        $pdo = new PDO(
            $dsn,
            $settings['performance_analytics_pg_user'] ?? '',
            $settings['performance_analytics_pg_password'] ?? '',
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false
            ]
        );
        
        return $pdo;
        
    } catch (Exception $e) {
        error_log("Analytics DB connection failed: " . $e->getMessage());
        throw $e;
    }
}

/**
 * Send JSON response with CORS headers
 * 
 * @param mixed $data
 * @param int $status
 */
function sendJSONWithCORS($data, int $status = 200): void {
    // CORS headers
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Content-Type: application/json');
    
    http_response_code($status);
    echo json_encode($data);
    exit;
}

/**
 * Handle OPTIONS preflight request
 */
function handlePreflight(): void {
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
        header('Access-Control-Max-Age: 3600');
        http_response_code(204);
        exit;
    }
}
