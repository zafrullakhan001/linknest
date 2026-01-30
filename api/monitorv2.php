<?php
/**
 * Monitorv2 API - Advanced Monitoring with PostgreSQL/TimescaleDB
 * 
 * Endpoints:
 * GET    /monitorv2              - List all monitors
 * GET    /monitorv2/{id}         - Get monitor by ID
 * POST   /monitorv2              - Create monitor
 * PUT    /monitorv2/{id}         - Update monitor
 * DELETE /monitorv2/{id}         - Delete monitor
 * POST   /monitorv2/{id}/check   - Check monitor now
 * POST   /monitorv2/check-all    - Check all monitors
 * GET    /monitorv2/{id}/logs    - Get monitor logs (with time range)
 * GET    /monitorv2/{id}/stats   - Get monitor statistics
 * POST   /monitorv2/{id}/duplicate - Duplicate monitor
 * GET    /monitorv2/export-bundle - Export all monitors
 * POST   /monitorv2/import-bundle - Import monitors
 * PUT    /monitorv2/update-tab   - Rename tab
 * PUT    /monitorv2/update-group - Rename group
 */

require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

// Require authentication for all operations
$AUTH_USER = requireAuth();
$GLOBALS['AUTH_USER'] = $AUTH_USER;

// Get PostgreSQL connection for monitorv2
function getMonitorv2DB() {
    static $db = null;
    if ($db !== null) return $db;
    
    // Get settings from SQLite
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
    
    try {
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

// Check if user is admin
function isMonitorv2Admin() {
    return !empty($GLOBALS['AUTH_USER']['is_admin']);
}

// Get user ID from auth
function getMonitorv2UserId() {
    return (int)($GLOBALS['AUTH_USER']['id'] ?? 0);
}

// Route requests
switch ($method) {
    case 'GET':
        if ($path === '' || $path === '/') {
            handleGetMonitors();
        } elseif (preg_match('/^\/(\d+)$/', $path, $matches)) {
            handleGetMonitor((int)$matches[1]);
        } elseif (preg_match('/^\/(\d+)\/logs$/', $path, $matches)) {
            handleGetMonitorLogs((int)$matches[1]);
        } elseif (preg_match('/^\/(\d+)\/stats$/', $path, $matches)) {
            handleGetMonitorStats((int)$matches[1]);
        } elseif (preg_match('/^\/(\d+)\/incidents$/', $path, $matches)) {
            handleGetMonitorIncidents((int)$matches[1]);
        } elseif ($path === '/export-bundle') {
            handleExportBundle();
        } elseif ($path === '/health') {
            handleHealthCheck();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'POST':
        if ($path === '' || $path === '/') {
            handleCreateMonitor();
        } elseif (preg_match('/^\/(\d+)\/check$/', $path, $matches)) {
            handleCheckMonitor((int)$matches[1]);
        } elseif ($path === '/check-all') {
            handleCheckAllMonitors();
        } elseif (preg_match('/^\/(\d+)\/duplicate$/', $path, $matches)) {
            handleDuplicateMonitor((int)$matches[1]);
        } elseif ($path === '/import-bundle') {
            handleImportBundle();
        } elseif ($path === '/setup-schema') {
            handleSetupSchema();
        } elseif ($path === '/test-connection') {
            handleTestConnection();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'PUT':
        if (preg_match('/^\/(\d+)$/', $path, $matches)) {
            handleUpdateMonitor((int)$matches[1]);
        } elseif ($path === '/update-tab') {
            handleUpdateTabName();
        } elseif ($path === '/update-group') {
            handleUpdateGroupName();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'DELETE':
        if (preg_match('/^\/(\d+)$/', $path, $matches)) {
            handleDeleteMonitor((int)$matches[1]);
        } elseif ($path === '/all') {
            handleDeleteAllMonitors();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

// ============================================
// HANDLER FUNCTIONS
// ============================================

function handleGetMonitors() {
    $db = getMonitorv2DB();
    if (!$db) {
        sendJSON(['error' => 'Monitorv2 database not configured'], 503);
        return;
    }
    
    $isAdmin = isMonitorv2Admin();
    $userId = getMonitorv2UserId();
    
    try {
        // Build query based on permissions
        if ($isAdmin) {
            $sql = "
                SELECT 
                    m.*,
                    COALESCE((
                        SELECT COUNT(*) 
                        FROM zmonitoring.notification_rules r 
                        WHERE r.monitor_id = m.id AND r.is_enabled = TRUE
                    ), 0) AS email_rules_count,
                    (SELECT json_agg(email) FROM zmonitoring.notification_recipients nr 
                     JOIN zmonitoring.notification_rules nrul ON nr.rule_id = nrul.id 
                     WHERE nrul.monitor_id = m.id) as recipient_emails
                FROM zmonitoring.monitors m
                ORDER BY m.created_at DESC
            ";
            $stmt = $db->query($sql);
        } else {
            // Non-admins can only see monitors they have permission for
            $sql = "
                SELECT 
                    m.*,
                    COALESCE((
                        SELECT COUNT(*) 
                        FROM zmonitoring.notification_rules r 
                        WHERE r.monitor_id = m.id AND r.is_enabled = TRUE
                    ), 0) AS email_rules_count
                FROM zmonitoring.monitors m
                JOIN zmonitoring.user_monitor_permissions ump 
                    ON ump.monitor_id = m.id AND ump.user_id = :user_id
                WHERE m.is_active = TRUE
                ORDER BY m.created_at DESC
            ";
            $stmt = $db->prepare($sql);
            $stmt->execute([':user_id' => $userId]);
        }
        
        $monitors = $stmt->fetchAll();
        
        // Get recent history (last 24h) for sparklines
        $historyStmt = $db->prepare("
            SELECT status, response_time_ms, checked_at 
            FROM zmonitoring.monitor_checks 
            WHERE monitor_id = :monitor_id AND checked_at >= NOW() - INTERVAL '24 hours'
            ORDER BY checked_at DESC 
            LIMIT 100
        ");
        
        foreach ($monitors as &$monitor) {
            $historyStmt->execute([':monitor_id' => $monitor['id']]);
            $history = $historyStmt->fetchAll();
            
            // Downsample for performance
            if (count($history) > 72) {
                $step = ceil(count($history) / 72);
                $downsampled = [];
                for ($i = 0; $i < count($history); $i += $step) {
                    $downsampled[] = $history[$i];
                }
                $history = $downsampled;
            }
            
            // Reverse for chronological order
            $monitor['history'] = array_reverse($history);
            
            // Ensure numeric types
            $monitor['id'] = (int)$monitor['id'];
            $monitor['interval'] = (int)$monitor['interval_minutes'];
            $monitor['last_response_time'] = $monitor['last_response_time_ms'] ? (int)$monitor['last_response_time_ms'] : null;
            $monitor['last_checked_at'] = $monitor['last_checked_at'] ? strtotime($monitor['last_checked_at']) : null;
            $monitor['created_at'] = strtotime($monitor['created_at']);
            $monitor['updated_at'] = strtotime($monitor['updated_at']);
            $monitor['last_status'] = $monitor['current_status'];
            $monitor['email_notification'] = (bool)$monitor['email_notification'] ? 1 : 0;
            $monitor['is_active'] = (bool)$monitor['is_active'] ? 1 : 0;
            $monitor['email_rules_count'] = (int)$monitor['email_rules_count'];
        }
        
        sendJSON(['monitors' => $monitors]);
        
    } catch (PDOException $e) {
        error_log("Monitorv2 get monitors error: " . $e->getMessage());
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleGetMonitor($id) {
    $db = getMonitorv2DB();
    if (!$db) {
        sendJSON(['error' => 'Monitorv2 database not configured'], 503);
        return;
    }
    
    $isAdmin = isMonitorv2Admin();
    $userId = getMonitorv2UserId();
    
    try {
        if ($isAdmin) {
            $sql = "SELECT * FROM zmonitoring.monitors WHERE id = :id";
            $stmt = $db->prepare($sql);
            $stmt->execute([':id' => $id]);
        } else {
            $sql = "
                SELECT m.* FROM zmonitoring.monitors m
                JOIN zmonitoring.user_monitor_permissions ump 
                    ON ump.monitor_id = m.id AND ump.user_id = :user_id
                WHERE m.id = :id
            ";
            $stmt = $db->prepare($sql);
            $stmt->execute([':id' => $id, ':user_id' => $userId]);
        }
        
        $monitor = $stmt->fetch();
        
        if (!$monitor) {
            sendJSON(['error' => 'Monitor not found'], 404);
            return;
        }
        
        // Get notification rules for this monitor
        $rulesStmt = $db->prepare("
            SELECT r.*, 
                (SELECT json_agg(email) FROM zmonitoring.notification_recipients WHERE rule_id = r.id) as recipients
            FROM zmonitoring.notification_rules r
            WHERE r.monitor_id = :monitor_id
            ORDER BY r.sort_order ASC, r.created_at DESC
        ");
        $rulesStmt->execute([':monitor_id' => $id]);
        $rules = $rulesStmt->fetchAll();
        
        // Get allowed user IDs if admin
        if ($isAdmin) {
            $permStmt = $db->prepare("
                SELECT user_id FROM zmonitoring.user_monitor_permissions 
                WHERE monitor_id = :monitor_id AND can_view = TRUE
            ");
            $permStmt->execute([':monitor_id' => $id]);
            $monitor['allowed_user_ids'] = array_map('intval', $permStmt->fetchAll(PDO::FETCH_COLUMN));
        }
        
        // Transform fields
        $monitor['interval'] = (int)$monitor['interval_minutes'];
        $monitor['last_response_time'] = $monitor['last_response_time_ms'] ? (int)$monitor['last_response_time_ms'] : null;
        $monitor['last_checked_at'] = $monitor['last_checked_at'] ? strtotime($monitor['last_checked_at']) : null;
        $monitor['created_at'] = strtotime($monitor['created_at']);
        $monitor['updated_at'] = strtotime($monitor['updated_at']);
        $monitor['last_status'] = $monitor['current_status'];
        $monitor['notification_rules'] = $rules;
        
        sendJSON(['monitor' => $monitor]);
        
    } catch (PDOException $e) {
        error_log("Monitorv2 get monitor error: " . $e->getMessage());
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleCreateMonitor() {
    if (!isMonitorv2Admin()) {
        sendJSON(['error' => 'Admin access required'], 403);
        return;
    }
    
    $db = getMonitorv2DB();
    if (!$db) {
        sendJSON(['error' => 'Monitorv2 database not configured'], 503);
        return;
    }
    
    $data = getJSONInput();
    if (!is_array($data)) {
        sendJSON(['error' => 'Invalid input'], 400);
        return;
    }
    
    // Validation
    if (empty($data['name']) || empty($data['type']) || empty($data['target'])) {
        sendJSON(['error' => 'Name, type, and target are required'], 400);
        return;
    }
    
    $validTypes = ['url', 'keyword', 'port', 'ping'];
    if (!in_array($data['type'], $validTypes, true)) {
        sendJSON(['error' => 'Invalid type. Must be url, keyword, port, or ping'], 400);
        return;
    }
    
    try {
        $sql = "
            INSERT INTO zmonitoring.monitors (
                name, type, target, port, keyword, interval_minutes,
                warning_threshold, timeout_seconds, is_active, email_notification,
                tab_name, group_name, legacy_notify_pending, current_status
            ) VALUES (
                :name, :type, :target, :port, :keyword, :interval,
                :warning_threshold, :timeout, :is_active, :email_notification,
                :tab_name, :group_name, :legacy_notify_pending, :current_status
            ) RETURNING *
        ";
        
        $stmt = $db->prepare($sql);
        $stmt->execute([
            ':name' => trim((string) $data['name']),
            ':type' => $data['type'],
            ':target' => trim((string) $data['target']),
            ':port' => isset($data['port']) && $data['port'] !== '' ? (int) $data['port'] : null,
            ':keyword' => isset($data['keyword']) && $data['keyword'] !== '' ? trim((string) $data['keyword']) : null,
            ':interval' => isset($data['interval']) ? (int) $data['interval'] : 5,
            ':warning_threshold' => isset($data['warning_threshold']) ? (int) $data['warning_threshold'] : 1,
            ':timeout' => isset($data['timeout']) && $data['timeout'] !== '' ? (int) $data['timeout'] : null,
            ':is_active' => (!isset($data['is_active']) || $data['is_active']) ? 1 : 0,
            ':email_notification' => !empty($data['email_notification']) ? 1 : 0,
            ':tab_name' => isset($data['tab_name']) && $data['tab_name'] !== '' ? trim((string) $data['tab_name']) : 'General',
            ':group_name' => isset($data['group_name']) && $data['group_name'] !== '' ? trim((string) $data['group_name']) : 'Other',
            ':legacy_notify_pending' => !empty($data['email_notification']) ? 1 : 0,
            ':current_status' => 'unknown'
        ]);
        
        $monitor = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$monitor) {
            sendJSON(['error' => 'Failed to create monitor'], 500);
            return;
        }
        
        // Handle permissions if provided
        if (!empty($data['allowed_user_ids']) && is_array($data['allowed_user_ids'])) {
            $permStmt = $db->prepare("
                INSERT INTO zmonitoring.user_monitor_permissions (user_id, monitor_id, can_view)
                VALUES (:user_id, :monitor_id, TRUE)
            ");
            foreach ($data['allowed_user_ids'] as $userId) {
                $permStmt->execute([':user_id' => (int) $userId, ':monitor_id' => $monitor['id']]);
            }
        }
        
        // Transform response for frontend (timestamps as unix, interval alias, last_status)
        $monitor['interval'] = (int) ($monitor['interval_minutes'] ?? 5);
        $createdAt = $monitor['created_at'] ?? null;
        $monitor['created_at'] = $createdAt ? (is_numeric($createdAt) ? (int) $createdAt : (int) strtotime($createdAt)) : time();
        $updatedAt = $monitor['updated_at'] ?? null;
        $monitor['updated_at'] = $updatedAt ? (is_numeric($updatedAt) ? (int) $updatedAt : (int) strtotime($updatedAt)) : time();
        $monitor['last_status'] = $monitor['current_status'] ?? 'unknown';
        
        sendJSON(['success' => true, 'monitor' => $monitor], 201);
        
    } catch (PDOException $e) {
        error_log("Monitorv2 create error: " . $e->getMessage());
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    } catch (Throwable $e) {
        error_log("Monitorv2 create error: " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine());
        sendJSON(['error' => 'Server error: ' . $e->getMessage()], 500);
    }
}

function handleUpdateMonitor($id) {
    if (!isMonitorv2Admin()) {
        sendJSON(['error' => 'Admin access required'], 403);
        return;
    }
    
    $db = getMonitorv2DB();
    if (!$db) {
        sendJSON(['error' => 'Monitorv2 database not configured'], 503);
        return;
    }
    
    $data = getJSONInput();
    
    try {
        // Check if monitor exists
        $checkStmt = $db->prepare("SELECT id, email_notification FROM zmonitoring.monitors WHERE id = :id");
        $checkStmt->execute([':id' => $id]);
        $existing = $checkStmt->fetch();
        
        if (!$existing) {
            sendJSON(['error' => 'Monitor not found'], 404);
            return;
        }
        
        // Build dynamic update
        $fields = [];
        $params = [':id' => $id];
        
        $fieldMap = [
            'name' => 'name',
            'type' => 'type',
            'target' => 'target',
            'port' => 'port',
            'keyword' => 'keyword',
            'interval' => 'interval_minutes',
            'warning_threshold' => 'warning_threshold',
            'timeout' => 'timeout_seconds',
            'is_active' => 'is_active',
            'email_notification' => 'email_notification',
            'tab_name' => 'tab_name',
            'group_name' => 'group_name',
            'legacy_email_to' => 'legacy_email_to',
            'legacy_email_cc' => 'legacy_email_cc',
            'legacy_email_from_name' => 'legacy_email_from_name',
            'legacy_email_from_email' => 'legacy_email_from_email',
            'legacy_email_subject_template' => 'legacy_email_subject_template',
            'legacy_email_body_template' => 'legacy_email_body_template'
        ];
        
        foreach ($fieldMap as $inputKey => $dbColumn) {
            if (isset($data[$inputKey])) {
                $fields[] = "{$dbColumn} = :{$inputKey}";
                $value = $data[$inputKey];
                // Convert boolean values
                if (in_array($inputKey, ['is_active', 'email_notification'])) {
                    $value = (int)(bool)$value;
                }
                $params[":" . $inputKey] = $value;
            }
        }
        
        // Handle legacy_notify_pending
        if (isset($data['email_notification'])) {
            $prevEmail = (bool)$existing['email_notification'];
            $nextEmail = (bool)$data['email_notification'];
            if (!$prevEmail && $nextEmail) {
                $fields[] = "legacy_notify_pending = TRUE";
            } elseif ($prevEmail && !$nextEmail) {
                $fields[] = "legacy_notify_pending = FALSE";
            }
        }
        
        if (empty($fields)) {
            sendJSON(['error' => 'No fields to update'], 400);
            return;
        }
        
        $fields[] = "updated_at = NOW()";
        
        $sql = "UPDATE zmonitoring.monitors SET " . implode(', ', $fields) . " WHERE id = :id RETURNING *";
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $monitor = $stmt->fetch();
        
        // Handle permissions update
        if (isset($data['allowed_user_ids'])) {
            // Delete existing permissions
            $delStmt = $db->prepare("DELETE FROM zmonitoring.user_monitor_permissions WHERE monitor_id = :monitor_id");
            $delStmt->execute([':monitor_id' => $id]);
            
            // Add new permissions
            if (!empty($data['allowed_user_ids']) && is_array($data['allowed_user_ids'])) {
                $permStmt = $db->prepare("
                    INSERT INTO zmonitoring.user_monitor_permissions (user_id, monitor_id, can_view)
                    VALUES (:user_id, :monitor_id, TRUE)
                ");
                foreach ($data['allowed_user_ids'] as $userId) {
                    $permStmt->execute([':user_id' => (int)$userId, ':monitor_id' => $id]);
                }
            }
        }
        
        // Transform response
        $monitor['interval'] = (int)$monitor['interval_minutes'];
        $monitor['created_at'] = strtotime($monitor['created_at']);
        $monitor['updated_at'] = strtotime($monitor['updated_at']);
        $monitor['last_status'] = $monitor['current_status'];
        
        sendJSON(['success' => true, 'monitor' => $monitor]);
        
    } catch (PDOException $e) {
        error_log("Monitorv2 update error: " . $e->getMessage());
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleDeleteMonitor($id) {
    if (!isMonitorv2Admin()) {
        sendJSON(['error' => 'Admin access required'], 403);
        return;
    }
    
    $db = getMonitorv2DB();
    if (!$db) {
        sendJSON(['error' => 'Monitorv2 database not configured'], 503);
        return;
    }
    
    try {
        $stmt = $db->prepare("DELETE FROM zmonitoring.monitors WHERE id = :id");
        $stmt->execute([':id' => $id]);
        
        if ($stmt->rowCount() === 0) {
            sendJSON(['error' => 'Monitor not found'], 404);
            return;
        }
        
        sendJSON(['success' => true]);
        
    } catch (PDOException $e) {
        error_log("Monitorv2 delete error: " . $e->getMessage());
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleDeleteAllMonitors() {
    if (!isMonitorv2Admin()) {
        sendJSON(['error' => 'Admin access required'], 403);
        return;
    }
    
    $db = getMonitorv2DB();
    if (!$db) {
        sendJSON(['error' => 'Monitorv2 database not configured'], 503);
        return;
    }
    
    try {
        // Delete in correct order due to foreign keys
        $db->exec("DELETE FROM zmonitoring.notification_recipients");
        $db->exec("DELETE FROM zmonitoring.notification_rules");
        $db->exec("DELETE FROM zmonitoring.notification_logs");
        $db->exec("DELETE FROM zmonitoring.monitor_checks");
        $db->exec("DELETE FROM zmonitoring.monitors");
        $db->exec("DELETE FROM zmonitoring.user_monitor_permissions");
        $db->exec("DELETE FROM zmonitoring.incidents");
        
        sendJSON(['success' => true, 'message' => 'All monitors deleted']);
        
    } catch (PDOException $e) {
        error_log("Monitorv2 delete all error: " . $e->getMessage());
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleGetMonitorLogs($id) {
    $db = getMonitorv2DB();
    if (!$db) {
        sendJSON(['error' => 'Monitorv2 database not configured'], 503);
        return;
    }
    
    // Parse query parameters
    $days = isset($_GET['days']) ? (int)$_GET['days'] : 1;
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 500;
    $from = isset($_GET['from']) ? (int)$_GET['from'] : null;
    $to = isset($_GET['to']) ? (int)$_GET['to'] : null;
    
    // Limit max values
    $days = min($days, 90);
    $limit = min($limit, 5000);
    
    try {
        if ($from && $to) {
            $sql = "
                SELECT * FROM zmonitoring.monitor_checks
                WHERE monitor_id = :monitor_id
                AND checked_at BETWEEN to_timestamp(:from) AND to_timestamp(:to)
                ORDER BY checked_at DESC
                LIMIT :limit
            ";
            $stmt = $db->prepare($sql);
            $stmt->execute([
                ':monitor_id' => $id,
                ':from' => $from,
                ':to' => $to,
                ':limit' => $limit
            ]);
        } else {
            $sql = "
                SELECT * FROM zmonitoring.monitor_checks
                WHERE monitor_id = :monitor_id
                AND checked_at >= NOW() - (:days || ' days')::INTERVAL
                ORDER BY checked_at DESC
                LIMIT :limit
            ";
            $stmt = $db->prepare($sql);
            $stmt->execute([
                ':monitor_id' => $id,
                ':days' => $days,
                ':limit' => $limit
            ]);
        }
        
        $logs = $stmt->fetchAll();
        
        // Transform timestamps
        foreach ($logs as &$log) {
            $log['id'] = (int)$log['id'];
            $log['monitor_id'] = (int)$log['monitor_id'];
            $log['response_time'] = $log['response_time_ms'] ? (int)$log['response_time_ms'] : null;
            $log['checked_at'] = strtotime($log['checked_at']);
        }
        
        sendJSON(['logs' => $logs]);
        
    } catch (PDOException $e) {
        error_log("Monitorv2 get logs error: " . $e->getMessage());
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleGetMonitorStats($id) {
    $db = getMonitorv2DB();
    if (!$db) {
        sendJSON(['error' => 'Monitorv2 database not configured'], 503);
        return;
    }
    
    $period = $_GET['period'] ?? '24h';
    
    try {
        // Get uptime for different periods
        $periods = [
            '24h' => "NOW() - INTERVAL '24 hours'",
            '7d' => "NOW() - INTERVAL '7 days'",
            '30d' => "NOW() - INTERVAL '30 days'",
            '90d' => "NOW() - INTERVAL '90 days'"
        ];
        
        $stats = [];
        
        foreach ($periods as $key => $interval) {
            $sql = "
                SELECT 
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'up') as up_count,
                    COUNT(*) FILTER (WHERE status = 'down') as down_count,
                    COUNT(*) FILTER (WHERE status = 'warning') as warning_count,
                    ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'up') / NULLIF(COUNT(*), 0), 2) as uptime,
                    AVG(response_time_ms) as avg_response,
                    MIN(response_time_ms) as min_response,
                    MAX(response_time_ms) as max_response
                FROM zmonitoring.monitor_checks
                WHERE monitor_id = :monitor_id
                AND checked_at >= {$interval}
            ";
            $stmt = $db->prepare($sql);
            $stmt->execute([':monitor_id' => $id]);
            $stats[$key] = $stmt->fetch();
        }
        
        // Get hourly stats for charts
        $hourlyStmt = $db->prepare("
            SELECT 
                date_trunc('hour', checked_at) as hour,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'up') as up_count,
                AVG(response_time_ms) as avg_response
            FROM zmonitoring.monitor_checks
            WHERE monitor_id = :monitor_id
            AND checked_at >= NOW() - INTERVAL '24 hours'
            GROUP BY date_trunc('hour', checked_at)
            ORDER BY hour
        ");
        $hourlyStmt->execute([':monitor_id' => $id]);
        $hourly = $hourlyStmt->fetchAll();
        
        sendJSON([
            'stats' => $stats,
            'hourly' => $hourly
        ]);
        
    } catch (PDOException $e) {
        error_log("Monitorv2 get stats error: " . $e->getMessage());
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleCheckMonitor($id) {
    // This is a placeholder - actual checking would be done by a worker/cron
    // For now, we just insert a test check
    
    $db = getMonitorv2DB();
    if (!$db) {
        sendJSON(['error' => 'Monitorv2 database not configured'], 503);
        return;
    }
    
    try {
        // Get monitor details
        $stmt = $db->prepare("SELECT * FROM zmonitoring.monitors WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $monitor = $stmt->fetch();
        
        if (!$monitor) {
            sendJSON(['error' => 'Monitor not found'], 404);
            return;
        }
        
        // Perform actual check (similar to existing monitor_check.php)
        $result = performMonitorv2Check($monitor);
        
        // Insert check result
        $insertStmt = $db->prepare("
            INSERT INTO zmonitoring.monitor_checks 
            (monitor_id, status, response_time_ms, details, checked_at, http_code, error_message)
            VALUES (:monitor_id, :status, :response_time, :details, NOW(), :http_code, :error)
        ");
        $insertStmt->execute([
            ':monitor_id' => $id,
            ':status' => $result['status'],
            ':response_time' => $result['response_time'],
            ':details' => $result['details'],
            ':http_code' => $result['http_code'] ?? null,
            ':error' => $result['error'] ?? null
        ]);
        
        // Update monitor stats (trigger will handle most of this)
        // But we need to update uptime percentage
        $uptimeStmt = $db->prepare("
            UPDATE zmonitoring.monitors
            SET uptime_percentage = zmonitoring.calculate_uptime(id, NOW() - INTERVAL '24 hours', NOW())
            WHERE id = :id
        ");
        $uptimeStmt->execute([':id' => $id]);
        
        sendJSON([
            'success' => true,
            'result' => $result
        ]);
        
    } catch (PDOException $e) {
        error_log("Monitorv2 check error: " . $e->getMessage());
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleCheckAllMonitors() {
    $db = getMonitorv2DB();
    if (!$db) {
        sendJSON(['error' => 'Monitorv2 database not configured'], 503);
        return;
    }
    
    $force = false;
    $raw = file_get_contents('php://input');
    if ($raw !== false && $raw !== '') {
        $input = json_decode($raw, true);
        if (is_array($input) && !empty($input['force'])) {
            $force = true;
        }
    }
    
    try {
        // Force refresh: recheck all active monitors. Otherwise only monitors due by interval.
        if ($force) {
            $stmt = $db->query("
                SELECT * FROM zmonitoring.monitors
                WHERE is_active = TRUE
                ORDER BY id
            ");
        } else {
            $stmt = $db->query("
                SELECT * FROM zmonitoring.monitors
                WHERE is_active = TRUE
                AND (last_checked_at IS NULL OR 
                     last_checked_at <= NOW() - (interval_minutes || ' minutes')::INTERVAL)
            ");
        }
        $monitors = $stmt->fetchAll();
        
        $results = [];
        $up = 0;
        $down = 0;
        $error = 0;
        
        foreach ($monitors as $monitor) {
            try {
                $result = performMonitorv2Check($monitor);
                
                $insertStmt = $db->prepare("
                    INSERT INTO zmonitoring.monitor_checks 
                    (monitor_id, status, response_time_ms, details, checked_at)
                    VALUES (:monitor_id, :status, :response_time, :details, NOW())
                ");
                $insertStmt->execute([
                    ':monitor_id' => $monitor['id'],
                    ':status' => $result['status'],
                    ':response_time' => $result['response_time'],
                    ':details' => $result['details']
                ]);
                
                if ($result['status'] === 'up') $up++;
                elseif ($result['status'] === 'down') $down++;
                else $error++;
                
                $results[$monitor['id']] = $result;
            } catch (Exception $e) {
                $error++;
                $results[$monitor['id']] = ['status' => 'error', 'error' => $e->getMessage()];
            }
        }
        
        // Update uptime percentages
        $db->exec("
            UPDATE zmonitoring.monitors m
            SET uptime_percentage = zmonitoring.calculate_uptime(m.id, NOW() - INTERVAL '24 hours', NOW())
            WHERE is_active = TRUE
        ");
        
        sendJSON([
            'success' => true,
            'count' => count($monitors),
            'total' => count($monitors),
            'up_count' => $up,
            'down_count' => $down,
            'error_count' => $error,
            'results' => $results
        ]);
        
    } catch (PDOException $e) {
        error_log("Monitorv2 check all error: " . $e->getMessage());
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function performMonitorv2Check($monitor) {
    $startTime = microtime(true);
    $type = $monitor['type'];
    $target = $monitor['target'];
    $timeout = $monitor['timeout_seconds'] ?? 10;
    
    $result = [
        'status' => 'down',
        'response_time' => 0,
        'details' => '',
        'http_code' => null
    ];
    
    switch ($type) {
        case 'url':
        case 'keyword':
            $ch = curl_init();
            curl_setopt_array($ch, [
                CURLOPT_URL => $target,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_TIMEOUT => $timeout,
                CURLOPT_CONNECTTIMEOUT => min(5, $timeout),
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => 0,
                CURLOPT_NOBODY => ($type === 'url'),
                CURLOPT_USERAGENT => 'LinkNest Monitorv2/1.0',
                CURLOPT_HTTPHEADER => ['Accept: */*', 'Cache-Control: no-cache', 'Connection: close'],
                CURLOPT_FRESH_CONNECT => true,
                CURLOPT_FORBID_REUSE => true
            ]);
            
            $body = curl_exec($ch);
            $info = curl_getinfo($ch);
            $error = curl_error($ch);
            $errno = curl_errno($ch);
            curl_close($ch);
            
            $result['response_time'] = round((microtime(true) - $startTime) * 1000);
            
            if ($errno !== 0) {
                $result['status'] = 'down';
                $result['details'] = $error ?: 'Connection failed';
            } else {
                $code = $info['http_code'];
                $result['http_code'] = $code;
                
                if ($code >= 200 && $code < 400) {
                    if ($type === 'keyword') {
                        $keyword = $monitor['keyword'] ?? '';
                        if (!empty($keyword) && stripos($body, $keyword) !== false) {
                            $result['status'] = 'up';
                            $result['details'] = "Keyword found (HTTP $code)";
                        } else {
                            $result['status'] = 'down';
                            $result['details'] = "Keyword '$keyword' not found";
                        }
                    } else {
                        $result['status'] = 'up';
                        $result['details'] = "HTTP $code";
                    }
                } else {
                    $result['status'] = 'down';
                    $result['details'] = "HTTP $code";
                }
            }
            break;
            
        case 'port':
            $port = (int)($monitor['port'] ?? 0);
            if ($port > 0 && $port <= 65535) {
                $host = $target;
                if (strpos($target, 'http') === 0) {
                    $parsed = parse_url($target);
                    $host = $parsed['host'] ?? $target;
                }
                
                $connection = @fsockopen($host, $port, $errno, $errstr, min(5, $timeout));
                $result['response_time'] = round((microtime(true) - $startTime) * 1000);
                
                if (is_resource($connection)) {
                    fclose($connection);
                    $result['status'] = 'up';
                    $result['details'] = "Port $port open";
                } else {
                    $result['status'] = 'down';
                    $result['details'] = "Port $port closed: $errstr";
                }
            } else {
                $result['details'] = 'Invalid port';
            }
            break;
            
        case 'ping':
            $host = trim($target);
            if (strpos($host, 'http') === 0) {
                $parsed = parse_url($host);
                $host = $parsed['host'] ?? $host;
            }
            
            $isWindows = (stripos(PHP_OS, 'WIN') === 0);
            $timeoutMs = $timeout * 1000;
            
            if ($isWindows) {
                $cmd = 'ping -n 1 -w ' . (int)$timeoutMs . ' ' . escapeshellarg($host);
            } else {
                $cmd = 'ping -c 1 -W ' . (int)$timeout . ' ' . escapeshellarg($host);
            }
            
            exec($cmd, $output, $exitCode);
            $result['response_time'] = round((microtime(true) - $startTime) * 1000);
            
            if ($exitCode === 0) {
                $result['status'] = 'up';
                $result['details'] = 'Ping OK';
            } else {
                $result['status'] = 'down';
                $result['details'] = 'Ping failed';
            }
            break;
    }
    
    return $result;
}

function handleDuplicateMonitor($id) {
    if (!isMonitorv2Admin()) {
        sendJSON(['error' => 'Admin access required'], 403);
        return;
    }
    
    $db = getMonitorv2DB();
    if (!$db) {
        sendJSON(['error' => 'Monitorv2 database not configured'], 503);
        return;
    }
    
    try {
        $db->beginTransaction();
        
        // Get original monitor
        $stmt = $db->prepare("SELECT * FROM zmonitoring.monitors WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $original = $stmt->fetch();
        
        if (!$original) {
            sendJSON(['error' => 'Monitor not found'], 404);
            return;
        }
        
        // Create duplicate
        $insertSql = "
            INSERT INTO zmonitoring.monitors (
                name, type, target, port, keyword, interval_minutes,
                warning_threshold, timeout_seconds, is_active, email_notification,
                tab_name, group_name, legacy_email_to, legacy_email_cc,
                legacy_email_from_name, legacy_email_from_email,
                legacy_email_subject_template, legacy_email_body_template
            ) VALUES (
                :name, :type, :target, :port, :keyword, :interval,
                :warning_threshold, :timeout, :is_active, :email_notification,
                :tab_name, :group_name, :legacy_email_to, :legacy_email_cc,
                :legacy_email_from_name, :legacy_email_from_email,
                :legacy_email_subject_template, :legacy_email_body_template
            ) RETURNING *
        ";
        
        $insertStmt = $db->prepare($insertSql);
        $insertStmt->execute([
            ':name' => $original['name'] . ' (Copy)',
            ':type' => $original['type'],
            ':target' => $original['target'],
            ':port' => $original['port'],
            ':keyword' => $original['keyword'],
            ':interval' => $original['interval_minutes'],
            ':warning_threshold' => $original['warning_threshold'],
            ':timeout' => $original['timeout_seconds'],
            ':is_active' => (int)$original['is_active'],
            ':email_notification' => (int)$original['email_notification'],
            ':tab_name' => $original['tab_name'],
            ':group_name' => $original['group_name'],
            ':legacy_email_to' => $original['legacy_email_to'],
            ':legacy_email_cc' => $original['legacy_email_cc'],
            ':legacy_email_from_name' => $original['legacy_email_from_name'],
            ':legacy_email_from_email' => $original['legacy_email_from_email'],
            ':legacy_email_subject_template' => $original['legacy_email_subject_template'],
            ':legacy_email_body_template' => $original['legacy_email_body_template']
        ]);
        
        $newMonitor = $insertStmt->fetch();
        $newId = $newMonitor['id'];
        
        // Copy notification rules
        $rulesStmt = $db->prepare("SELECT * FROM zmonitoring.notification_rules WHERE monitor_id = :monitor_id");
        $rulesStmt->execute([':monitor_id' => $id]);
        $rules = $rulesStmt->fetchAll();
        
        foreach ($rules as $rule) {
            $ruleInsertStmt = $db->prepare("
                INSERT INTO zmonitoring.notification_rules (
                    monitor_id, name, sort_order, status_trigger, time_window_start,
                    time_window_end, days_of_week, subject_template, body_template,
                    from_name, from_email, cc_emails, is_enabled
                ) VALUES (
                    :monitor_id, :name, :sort_order, :status_trigger, :time_window_start,
                    :time_window_end, :days_of_week, :subject_template, :body_template,
                    :from_name, :from_email, :cc_emails, :is_enabled
                ) RETURNING id
            ");
            $ruleInsertStmt->execute([
                ':monitor_id' => $newId,
                ':name' => $rule['name'],
                ':sort_order' => $rule['sort_order'],
                ':status_trigger' => $rule['status_trigger'],
                ':time_window_start' => $rule['time_window_start'],
                ':time_window_end' => $rule['time_window_end'],
                ':days_of_week' => $rule['days_of_week'],
                ':subject_template' => $rule['subject_template'],
                ':body_template' => $rule['body_template'],
                ':from_name' => $rule['from_name'],
                ':from_email' => $rule['from_email'],
                ':cc_emails' => $rule['cc_emails'],
                ':is_enabled' => (int)$rule['is_enabled']
            ]);
            $newRuleId = $ruleInsertStmt->fetch()['id'];
            
            // Copy recipients
            $recipStmt = $db->prepare("SELECT email FROM zmonitoring.notification_recipients WHERE rule_id = :rule_id");
            $recipStmt->execute([':rule_id' => $rule['id']]);
            $recipients = $recipStmt->fetchAll(PDO::FETCH_COLUMN);
            
            foreach ($recipients as $email) {
                $recipInsertStmt = $db->prepare("
                    INSERT INTO zmonitoring.notification_recipients (rule_id, email)
                    VALUES (:rule_id, :email)
                ");
                $recipInsertStmt->execute([':rule_id' => $newRuleId, ':email' => $email]);
            }
        }
        
        // Copy permissions
        $permStmt = $db->prepare("SELECT user_id FROM zmonitoring.user_monitor_permissions WHERE monitor_id = :monitor_id");
        $permStmt->execute([':monitor_id' => $id]);
        $userIds = $permStmt->fetchAll(PDO::FETCH_COLUMN);
        
        foreach ($userIds as $userId) {
            $permInsertStmt = $db->prepare("
                INSERT INTO zmonitoring.user_monitor_permissions (user_id, monitor_id, can_view)
                VALUES (:user_id, :monitor_id, TRUE)
            ");
            $permInsertStmt->execute([':user_id' => $userId, ':monitor_id' => $newId]);
        }
        
        $db->commit();
        
        // Transform response
        $newMonitor['interval'] = (int)$newMonitor['interval_minutes'];
        $newMonitor['created_at'] = strtotime($newMonitor['created_at']);
        $newMonitor['updated_at'] = strtotime($newMonitor['updated_at']);
        $newMonitor['last_status'] = $newMonitor['current_status'];
        
        sendJSON(['success' => true, 'monitor' => $newMonitor]);
        
    } catch (PDOException $e) {
        if ($db->inTransaction()) $db->rollBack();
        error_log("Monitorv2 duplicate error: " . $e->getMessage());
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleUpdateTabName() {
    if (!isMonitorv2Admin()) {
        sendJSON(['error' => 'Admin access required'], 403);
        return;
    }
    
    $db = getMonitorv2DB();
    if (!$db) {
        sendJSON(['error' => 'Monitorv2 database not configured'], 503);
        return;
    }
    
    $data = getJSONInput();
    $oldName = $data['old_name'] ?? '';
    $newName = $data['new_name'] ?? '';
    
    if (empty($oldName) || empty($newName)) {
        sendJSON(['error' => 'Old name and new name are required'], 400);
        return;
    }
    
    try {
        $stmt = $db->prepare("
            UPDATE zmonitoring.monitors 
            SET tab_name = :new_name, updated_at = NOW()
            WHERE tab_name = :old_name
        ");
        $stmt->execute([':new_name' => $newName, ':old_name' => $oldName]);
        
        sendJSON(['success' => true, 'updated' => $stmt->rowCount()]);
        
    } catch (PDOException $e) {
        error_log("Monitorv2 update tab error: " . $e->getMessage());
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleUpdateGroupName() {
    if (!isMonitorv2Admin()) {
        sendJSON(['error' => 'Admin access required'], 403);
        return;
    }
    
    $db = getMonitorv2DB();
    if (!$db) {
        sendJSON(['error' => 'Monitorv2 database not configured'], 503);
        return;
    }
    
    $data = getJSONInput();
    $tabName = $data['tab_name'] ?? '';
    $oldName = $data['old_name'] ?? '';
    $newName = $data['new_name'] ?? '';
    
    if (empty($tabName) || empty($oldName) || empty($newName)) {
        sendJSON(['error' => 'Tab name, old name, and new name are required'], 400);
        return;
    }
    
    try {
        $stmt = $db->prepare("
            UPDATE zmonitoring.monitors 
            SET group_name = :new_name, updated_at = NOW()
            WHERE tab_name = :tab_name AND group_name = :old_name
        ");
        $stmt->execute([
            ':new_name' => $newName,
            ':tab_name' => $tabName,
            ':old_name' => $oldName
        ]);
        
        sendJSON(['success' => true, 'updated' => $stmt->rowCount()]);
        
    } catch (PDOException $e) {
        error_log("Monitorv2 update group error: " . $e->getMessage());
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleExportBundle() {
    if (!isMonitorv2Admin()) {
        sendJSON(['error' => 'Admin access required'], 403);
        return;
    }
    
    $db = getMonitorv2DB();
    if (!$db) {
        sendJSON(['error' => 'Monitorv2 database not configured'], 503);
        return;
    }
    
    try {
        // Get all monitors
        $monitorsStmt = $db->query("SELECT * FROM zmonitoring.monitors ORDER BY id");
        $monitors = $monitorsStmt->fetchAll();
        
        $bundle = [];
        foreach ($monitors as $monitor) {
            $monitorId = $monitor['id'];
            
            // Get checks (limited to 500)
            $checksStmt = $db->prepare("
                SELECT * FROM zmonitoring.monitor_checks 
                WHERE monitor_id = :monitor_id 
                ORDER BY checked_at DESC 
                LIMIT 500
            ");
            $checksStmt->execute([':monitor_id' => $monitorId]);
            $checks = $checksStmt->fetchAll();
            
            // Get rules
            $rulesStmt = $db->prepare("SELECT * FROM zmonitoring.notification_rules WHERE monitor_id = :monitor_id");
            $rulesStmt->execute([':monitor_id' => $monitorId]);
            $rules = $rulesStmt->fetchAll();
            
            // Get recipients for each rule
            foreach ($rules as &$rule) {
                $recipStmt = $db->prepare("SELECT email FROM zmonitoring.notification_recipients WHERE rule_id = :rule_id");
                $recipStmt->execute([':rule_id' => $rule['id']]);
                $rule['recipients'] = $recipStmt->fetchAll(PDO::FETCH_COLUMN);
            }
            
            $bundle[] = [
                'monitor' => $monitor,
                'checks' => $checks,
                'rules' => $rules
            ];
        }
        
        sendJSON([
            'bundle_version' => 1,
            'exported_at' => time(),
            'monitors' => $bundle
        ]);
        
    } catch (PDOException $e) {
        error_log("Monitorv2 export error: " . $e->getMessage());
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleImportBundle() {
    if (!isMonitorv2Admin()) {
        sendJSON(['error' => 'Admin access required'], 403);
        return;
    }
    
    $db = getMonitorv2DB();
    if (!$db) {
        sendJSON(['error' => 'Monitorv2 database not configured'], 503);
        return;
    }
    
    $data = getJSONInput();
    $replace = $data['replace'] ?? false;
    
    if (empty($data['monitors']) || !is_array($data['monitors'])) {
        sendJSON(['error' => 'Invalid bundle format'], 400);
        return;
    }
    
    try {
        $db->beginTransaction();
        
        if ($replace) {
            // Clear existing data
            $db->exec("DELETE FROM zmonitoring.notification_recipients");
            $db->exec("DELETE FROM zmonitoring.notification_rules");
            $db->exec("DELETE FROM zmonitoring.notification_logs");
            $db->exec("DELETE FROM zmonitoring.monitor_checks");
            $db->exec("DELETE FROM zmonitoring.monitors");
            $db->exec("DELETE FROM zmonitoring.user_monitor_permissions");
        }
        
        $count = 0;
        foreach ($data['monitors'] as $entry) {
            $m = $entry['monitor'] ?? null;
            if (!$m) continue;
            
            // Insert monitor
            $insertSql = "
                INSERT INTO zmonitoring.monitors (
                    id, name, type, target, port, keyword, interval_minutes,
                    warning_threshold, timeout_seconds, is_active, email_notification,
                    tab_name, group_name, current_status, last_checked_at
                ) VALUES (
                    :id, :name, :type, :target, :port, :keyword, :interval,
                    :warning_threshold, :timeout, :is_active, :email_notification,
                    :tab_name, :group_name, :current_status, :last_checked_at
                ) RETURNING id
            ";
            $insertStmt = $db->prepare($insertSql);
            $insertStmt->execute([
                ':id' => $m['id'] ?? null,
                ':name' => $m['name'],
                ':type' => $m['type'],
                ':target' => $m['target'],
                ':port' => $m['port'] ?? null,
                ':keyword' => $m['keyword'] ?? null,
                ':interval' => $m['interval_minutes'] ?? 5,
                ':warning_threshold' => $m['warning_threshold'] ?? 1,
                ':timeout' => $m['timeout_seconds'] ?? null,
                ':is_active' => (int)($m['is_active'] ?? 1),
                ':email_notification' => (int)($m['email_notification'] ?? 0),
                ':tab_name' => $m['tab_name'] ?? 'General',
                ':group_name' => $m['group_name'] ?? 'Other',
                ':current_status' => $m['current_status'] ?? null,
                ':last_checked_at' => !empty($m['last_checked_at']) ? date('Y-m-d H:i:s', strtotime($m['last_checked_at'])) : null
            ]);
            $newMonitorId = $insertStmt->fetch()['id'];
            
            // Insert checks
            if (!empty($entry['checks'])) {
                $checkStmt = $db->prepare("
                    INSERT INTO zmonitoring.monitor_checks 
                    (monitor_id, status, response_time_ms, details, checked_at, http_code)
                    VALUES (:monitor_id, :status, :response_time, :details, :checked_at, :http_code)
                ");
                foreach ($entry['checks'] as $check) {
                    $checkStmt->execute([
                        ':monitor_id' => $newMonitorId,
                        ':status' => $check['status'],
                        ':response_time' => $check['response_time_ms'] ?? 0,
                        ':details' => $check['details'] ?? '',
                        ':checked_at' => !empty($check['checked_at']) ? date('Y-m-d H:i:s', strtotime($check['checked_at'])) : date('Y-m-d H:i:s'),
                        ':http_code' => $check['http_code'] ?? null
                    ]);
                }
            }
            
            // Insert rules with recipients
            if (!empty($entry['rules'])) {
                foreach ($entry['rules'] as $rule) {
                    $ruleStmt = $db->prepare("
                        INSERT INTO zmonitoring.notification_rules (
                            monitor_id, name, sort_order, status_trigger, time_window_start,
                            time_window_end, days_of_week, subject_template, body_template,
                            from_name, from_email, cc_emails, is_enabled
                        ) VALUES (
                            :monitor_id, :name, :sort_order, :status_trigger, :time_window_start,
                            :time_window_end, :days_of_week, :subject_template, :body_template,
                            :from_name, :from_email, :cc_emails, :is_enabled
                        ) RETURNING id
                    ");
                    $ruleStmt->execute([
                        ':monitor_id' => $newMonitorId,
                        ':name' => $rule['name'] ?? 'Notification Rule',
                        ':sort_order' => $rule['sort_order'] ?? 0,
                        ':status_trigger' => $rule['status_trigger'],
                        ':time_window_start' => $rule['time_window_start'] ?? null,
                        ':time_window_end' => $rule['time_window_end'] ?? null,
                        ':days_of_week' => $rule['days_of_week'] ?? null,
                        ':subject_template' => $rule['subject_template'] ?? '',
                        ':body_template' => $rule['body_template'] ?? '',
                        ':from_name' => $rule['from_name'] ?? null,
                        ':from_email' => $rule['from_email'] ?? null,
                        ':cc_emails' => $rule['cc_emails'] ?? null,
                        ':is_enabled' => (int)($rule['is_enabled'] ?? 1)
                    ]);
                    $newRuleId = $ruleStmt->fetch()['id'];
                    
                    // Insert recipients
                    if (!empty($rule['recipients'])) {
                        $recipStmt = $db->prepare("
                            INSERT INTO zmonitoring.notification_recipients (rule_id, email)
                            VALUES (:rule_id, :email)
                        ");
                        foreach ($rule['recipients'] as $email) {
                            $recipStmt->execute([':rule_id' => $newRuleId, ':email' => $email]);
                        }
                    }
                }
            }
            
            $count++;
        }
        
        $db->commit();
        sendJSON(['success' => true, 'count' => $count]);
        
    } catch (PDOException $e) {
        if ($db->inTransaction()) $db->rollBack();
        error_log("Monitorv2 import error: " . $e->getMessage());
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleGetMonitorIncidents($id) {
    $db = getMonitorv2DB();
    if (!$db) {
        sendJSON(['error' => 'Monitorv2 database not configured'], 503);
        return;
    }
    
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 50;
    $limit = min($limit, 500);
    
    try {
        $stmt = $db->prepare("
            SELECT * FROM zmonitoring.incidents
            WHERE monitor_id = :monitor_id
            ORDER BY started_at DESC
            LIMIT :limit
        ");
        $stmt->execute([':monitor_id' => $id, ':limit' => $limit]);
        $incidents = $stmt->fetchAll();
        
        sendJSON(['incidents' => $incidents]);
        
    } catch (PDOException $e) {
        error_log("Monitorv2 get incidents error: " . $e->getMessage());
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleHealthCheck() {
    $db = getMonitorv2DB();
    if (!$db) {
        sendJSON(['status' => 'unavailable', 'message' => 'Database not connected'], 503);
        return;
    }
    
    try {
        // Check if we can query
        $stmt = $db->query("SELECT COUNT(*) FROM zmonitoring.monitors");
        $monitorCount = $stmt->fetchColumn();
        
        $stmt = $db->query("SELECT COUNT(*) FROM zmonitoring.monitor_checks WHERE checked_at >= NOW() - INTERVAL '24 hours'");
        $checks24h = $stmt->fetchColumn();
        
        sendJSON([
            'status' => 'healthy',
            'monitors' => (int)$monitorCount,
            'checks_24h' => (int)$checks24h
        ]);
        
    } catch (PDOException $e) {
        sendJSON(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

function handleSetupSchema() {
    if (!isMonitorv2Admin()) {
        sendJSON(['error' => 'Admin access required'], 403);
        return;
    }
    
    $db = getMonitorv2DB();
    if (!$db) {
        sendJSON(['error' => 'Monitorv2 database not configured'], 503);
        return;
    }
    
    $schemaFile = __DIR__ . '/../monitorv2/schema.sql';
    if (!file_exists($schemaFile)) {
        sendJSON(['error' => 'Schema file not found'], 404);
        return;
    }
    
    $sql = file_get_contents($schemaFile);
    
    try {
        // Execute schema file
        $db->exec($sql);
        sendJSON(['success' => true, 'message' => 'Schema setup completed']);
    } catch (PDOException $e) {
        error_log("Monitorv2 schema setup error: " . $e->getMessage());
        sendJSON(['error' => 'Schema setup failed: ' . $e->getMessage()], 500);
    }
}

function handleTestConnection() {
    if (!isMonitorv2Admin()) {
        sendJSON(['error' => 'Admin access required'], 403);
        return;
    }
    
    $data = getJSONInput();
    
    $host = $data['pgHost'] ?? 'localhost';
    $port = (int)($data['pgPort'] ?? 5433);
    $database = $data['pgDatabase'] ?? 'postgres';
    $user = $data['pgUser'] ?? 'postgres';
    $password = $data['pgPassword'] ?? '';
    
    try {
        $dsn = "pgsql:host={$host};port={$port};dbname={$database}";
        $testDb = new PDO($dsn, $user, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 5
        ]);
        
        // Check TimescaleDB
        $stmt = $testDb->query("SELECT default_version FROM pg_available_extensions WHERE name = 'timescaledb'");
        $timescale = $stmt->fetch();
        
        // Check schema
        $stmt = $testDb->query("
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'zmonitoring' 
            AND table_name IN ('monitors', 'monitor_checks', 'notification_rules')
        ");
        $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
        
        sendJSON([
            'success' => true,
            'message' => 'Connection successful',
            'details' => [
                'postgres_version' => $testDb->getAttribute(PDO::ATTR_SERVER_VERSION),
                'timescaledb_version' => $timescale['default_version'] ?? null,
                'timescaledb_installed' => !empty($timescale),
                'tables_exist' => $tables,
                'schema_ready' => count($tables) >= 3
            ]
        ]);
        
    } catch (PDOException $e) {
        sendJSON(['success' => false, 'error' => 'Connection failed: ' . $e->getMessage()], 400);
    }
}
