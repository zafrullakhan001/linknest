<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/monitor_check.php'; // Include check logic for immediate "check now"

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

// Require authentication for all monitor operations
$AUTH_USER = requireAuth();
$GLOBALS['AUTH_USER'] = $AUTH_USER;

switch ($method) {
    case 'GET':
        if ($path === '' || $path === '/') {
            handleGetMonitors();
        } elseif ($path === '/export-bundle') {
            handleExportMonitorsBundle();
        } elseif (preg_match('/^\/(\d+)$/', $path, $matches)) {
            handleGetMonitor($matches[1]);
        } elseif (preg_match('/^\/(\d+)\/logs$/', $path, $matches)) {
            handleGetMonitorLogs($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'POST':
        if ($path === '' || $path === '/') {
            handleCreateMonitor();
        } elseif ($path === '/import') {
            handleImportMonitors();
        } elseif ($path === '/import-csv') {
            handleImportCSV();
        } elseif ($path === '/import-bundle') {
            handleImportMonitorsBundle();
        } elseif ($path === '/check-all') {
            handleCheckAllMonitors();
        } elseif (preg_match('/^\/(\d+)\/check$/', $path, $matches)) {
            handleCheckMonitor($matches[1]);
        } elseif (preg_match('/^\/(\d+)\/duplicate$/', $path, $matches)) {
            handleDuplicateMonitor($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'PUT':
        if ($path === '/update-tab') {
            handleUpdateTabName();
        } elseif ($path === '/update-group') {
            handleUpdateGroupName();
        } elseif (preg_match('/^\/(\d+)$/', $path, $matches)) {
            handleUpdateMonitor($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'DELETE':
        if ($path === '/all') {
            handleDeleteAllMonitors();
        } elseif (preg_match('/^\/(\d+)$/', $path, $matches)) {
            handleDeleteMonitor($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

/**
 * Permission helpers
 */
function getAuthUserFromGlobals() {
    return $GLOBALS['AUTH_USER'] ?? getAuthenticatedUser();
}

function userCanViewMonitorRow(array $monitor, array $user, $db): bool {
    if (!empty($user['is_admin'])) return true;
    $mode = isset($monitor['permissions_mode']) ? (int)$monitor['permissions_mode'] : 0;
    if ($mode === 0) return false; // admin-only by default

    $stmt = $db->prepare('SELECT can_view FROM user_monitor_permissions WHERE user_id = ? AND monitor_id = ?');
    $stmt->execute([(int)$user['id'], (int)$monitor['id']]);
    $can = $stmt->fetchColumn();
    return ((int)$can) === 1;
}

function fetchMonitorForView($id, array $user, $db) {
    $id = (int)$id;
    if (!empty($user['is_admin'])) {
        $stmt = $db->prepare('SELECT m.* FROM monitors m WHERE m.id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch();
    }

    $stmt = $db->prepare('
        SELECT m.*
        FROM monitors m
        LEFT JOIN user_monitor_permissions ump
          ON ump.monitor_id = m.id AND ump.user_id = ?
        WHERE m.id = ?
          AND COALESCE(ump.can_view, 0) = 1
        LIMIT 1
    ');
    $stmt->execute([(int)$user['id'], $id]);
    return $stmt->fetch();
}

function normalizeAllowedUserIds($raw): array {
    if (!is_array($raw)) return [];
    $out = [];
    foreach ($raw as $v) {
        $id = (int)$v;
        if ($id > 0) $out[$id] = true;
    }
    return array_values(array_map('intval', array_keys($out)));
}

function validateMonitorType($type): bool {
    return in_array($type, ['url', 'keyword', 'port', 'ping'], true);
}

function handleExportMonitorsBundle() {
    requireAdmin(); // export is admin-only
    $db = getDB();
    $now = time();

    // Fetch all monitors
    $stmt = $db->prepare('SELECT * FROM monitors ORDER BY created_at DESC');
    $stmt->execute();
    $monitors = $stmt->fetchAll();

    $bundleMonitors = [];
    foreach ($monitors as $m) {
        $monitorId = (int)$m['id'];

        // Monitor uptime logs (cap to 500 like UI)
        $stmt = $db->prepare('SELECT * FROM monitor_logs WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT 500');
        $stmt->execute([$monitorId]);
        $monitorLogs = $stmt->fetchAll();

        // Notification rules + recipients (preserve custom ordering)
        $stmt = $db->prepare('SELECT * FROM monitor_notification_rules WHERE monitor_id = ? ORDER BY COALESCE(sort_order, 0) ASC, created_at DESC, id DESC');
        $stmt->execute([$monitorId]);
        $rules = $stmt->fetchAll();
        $rulesOut = [];
        foreach ($rules as $r) {
            $ruleId = (int)$r['id'];
            $stmt = $db->prepare('SELECT email FROM monitor_notification_recipients WHERE rule_id = ?');
            $stmt->execute([$ruleId]);
            $recipients = $stmt->fetchAll(PDO::FETCH_COLUMN);
            $ccRaw = $r['cc_emails'] ?? null;
            $cc = (!empty($ccRaw)) ? array_values(array_filter(array_map('trim', explode(',', $ccRaw)))) : [];
            $r['recipients'] = $recipients;
            $r['cc'] = $cc;
            $rulesOut[] = $r;
        }

        // Email logs (cap to 500 like UI)
        $stmt = $db->prepare('SELECT * FROM monitor_notification_logs WHERE monitor_id = ? ORDER BY sent_at DESC LIMIT 500');
        $stmt->execute([$monitorId]);
        $emailLogs = $stmt->fetchAll();

        $bundleMonitors[] = [
            'monitor' => $m,
            'monitor_logs' => $monitorLogs,
            'notification_rules' => $rulesOut,
            'email_logs' => $emailLogs
        ];
    }

    sendJSON([
        'success' => true,
        'bundle_version' => 1,
        'exported_at' => $now,
        'monitors' => $bundleMonitors
    ]);
}

function handleImportMonitorsBundle() {
    requireAdmin(); // import is admin-only
    $data = getJSONInput();
    if (!isset($data['monitors']) || !is_array($data['monitors'])) {
        sendJSON(['error' => 'Invalid bundle format: monitors array required'], 400);
        return;
    }

    $replace = isset($data['replace']) ? (bool)$data['replace'] : true;
    $bundleMonitors = $data['monitors'];

    $db = getDB();
    try {
        $db->beginTransaction();

        if ($replace) {
            // Clear related tables (bundle import is intended to restore full monitoring state)
            $db->exec('DELETE FROM monitor_notification_recipients');
            $db->exec('DELETE FROM monitor_notification_rules');
            $db->exec('DELETE FROM monitor_notification_logs');
            $db->exec('DELETE FROM monitor_logs');
            $db->exec('DELETE FROM monitors');
        }

        // Prepared statements
        $stmtInsertMonitor = $db->prepare('INSERT INTO monitors (
            id, name, type, target, port, keyword, interval, is_active, email_notification,
            last_notified_status, legacy_notify_pending,
            legacy_email_disabled,
            legacy_email_to, legacy_email_cc, legacy_email_from_name, legacy_email_from_email,
            legacy_email_subject_template, legacy_email_body_template,
            last_checked_at, last_status, last_response_time,
            created_at, updated_at, tab_name, group_name, maintenance_start, maintenance_end
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

        $stmtInsertMonitorLog = $db->prepare('INSERT INTO monitor_logs (monitor_id, status, response_time, details, checked_at) VALUES (?, ?, ?, ?, ?)');

        $stmtInsertRule = $db->prepare('INSERT INTO monitor_notification_rules (
            id, monitor_id, name, sort_order, status_trigger, time_window_start, time_window_end, days_of_week,
            subject_template, body_template, from_name, from_email, cc_emails, is_enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

        $stmtInsertRecipient = $db->prepare('INSERT INTO monitor_notification_recipients (rule_id, email, created_at) VALUES (?, ?, ?)');

        $stmtInsertEmailLog = $db->prepare('INSERT INTO monitor_notification_logs (
            rule_id, monitor_id, recipient_email, status_trigger, sent_at, subject, success, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

        $now = time();

        foreach ($bundleMonitors as $entry) {
            // Support older/simple format: { monitors: [ {...monitor fields...} ] }
            $m = $entry['monitor'] ?? $entry;
            if (!isset($m['name'], $m['type'], $m['target'])) {
                continue;
            }

            $monitorId = isset($m['id']) ? (int)$m['id'] : null;
            if ($monitorId === null) {
                // If no ID provided, let SQLite assign one (rare: older format)
                $stmt = $db->prepare('INSERT INTO monitors (
                    name, type, target, port, keyword, interval, is_active, email_notification,
                    last_notified_status, legacy_notify_pending,
                    legacy_email_disabled,
                    legacy_email_to, legacy_email_cc, legacy_email_from_name, legacy_email_from_email,
                    legacy_email_subject_template, legacy_email_body_template,
                    last_checked_at, last_status, last_response_time,
                    created_at, updated_at, tab_name, group_name, maintenance_start, maintenance_end
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                $stmt->execute([
                    $m['name'],
                    $m['type'],
                    $m['target'],
                    isset($m['port']) ? (int)$m['port'] : null,
                    $m['keyword'] ?? null,
                    isset($m['interval']) ? (int)$m['interval'] : 5,
                    isset($m['is_active']) ? (int)$m['is_active'] : 1,
                    isset($m['email_notification']) ? (int)$m['email_notification'] : 0,
                    $m['last_notified_status'] ?? null,
                    isset($m['legacy_notify_pending']) ? (int)$m['legacy_notify_pending'] : 0,
                    isset($m['legacy_email_disabled']) ? (int)$m['legacy_email_disabled'] : 0,
                    $m['legacy_email_to'] ?? null,
                    $m['legacy_email_cc'] ?? null,
                    $m['legacy_email_from_name'] ?? null,
                    $m['legacy_email_from_email'] ?? null,
                    $m['legacy_email_subject_template'] ?? null,
                    $m['legacy_email_body_template'] ?? null,
                    isset($m['last_checked_at']) ? (int)$m['last_checked_at'] : null,
                    $m['last_status'] ?? null,
                    isset($m['last_response_time']) ? (int)$m['last_response_time'] : null,
                    isset($m['created_at']) ? (int)$m['created_at'] : $now,
                    isset($m['updated_at']) ? (int)$m['updated_at'] : $now,
                    $m['tab_name'] ?? null,
                    $m['group_name'] ?? null,
                    isset($m['maintenance_start']) ? (int)$m['maintenance_start'] : null,
                    isset($m['maintenance_end']) ? (int)$m['maintenance_end'] : null
                ]);
                $monitorId = (int)$db->lastInsertId();
            } else {
                $stmtInsertMonitor->execute([
                    $monitorId,
                    $m['name'],
                    $m['type'],
                    $m['target'],
                    isset($m['port']) ? (int)$m['port'] : null,
                    $m['keyword'] ?? null,
                    isset($m['interval']) ? (int)$m['interval'] : 5,
                    isset($m['is_active']) ? (int)$m['is_active'] : 1,
                    isset($m['email_notification']) ? (int)$m['email_notification'] : 0,
                    $m['last_notified_status'] ?? null,
                    isset($m['legacy_notify_pending']) ? (int)$m['legacy_notify_pending'] : 0,
                    isset($m['legacy_email_disabled']) ? (int)$m['legacy_email_disabled'] : 0,
                    $m['legacy_email_to'] ?? null,
                    $m['legacy_email_cc'] ?? null,
                    $m['legacy_email_from_name'] ?? null,
                    $m['legacy_email_from_email'] ?? null,
                    $m['legacy_email_subject_template'] ?? null,
                    $m['legacy_email_body_template'] ?? null,
                    isset($m['last_checked_at']) ? (int)$m['last_checked_at'] : null,
                    $m['last_status'] ?? null,
                    isset($m['last_response_time']) ? (int)$m['last_response_time'] : null,
                    isset($m['created_at']) ? (int)$m['created_at'] : $now,
                    isset($m['updated_at']) ? (int)$m['updated_at'] : $now,
                    $m['tab_name'] ?? null,
                    $m['group_name'] ?? null,
                    isset($m['maintenance_start']) ? (int)$m['maintenance_start'] : null,
                    isset($m['maintenance_end']) ? (int)$m['maintenance_end'] : null
                ]);
            }

            // Monitor logs
            $monitorLogs = $entry['monitor_logs'] ?? [];
            if (is_array($monitorLogs)) {
                foreach ($monitorLogs as $log) {
                    if (!isset($log['status'], $log['checked_at'])) continue;
                    $stmtInsertMonitorLog->execute([
                        $monitorId,
                        $log['status'],
                        isset($log['response_time']) ? (int)$log['response_time'] : null,
                        $log['details'] ?? null,
                        (int)$log['checked_at']
                    ]);
                }
            }

            // Rules + recipients
            $rules = $entry['notification_rules'] ?? [];
            if (is_array($rules)) {
                foreach ($rules as $r) {
                    if (!isset($r['status_trigger'])) continue;
                    $ruleId = isset($r['id']) ? (int)$r['id'] : null;
                    if ($ruleId === null) continue;
                    $cc = $r['cc'] ?? [];
                    $ccStr = (is_array($cc) && !empty($cc)) ? implode(',', array_map('trim', $cc)) : ($r['cc_emails'] ?? null);

                    $stmtInsertRule->execute([
                        $ruleId,
                        $monitorId,
                        $r['name'] ?? 'Notification Rule',
                        isset($r['sort_order']) ? (int)$r['sort_order'] : 0,
                        $r['status_trigger'],
                        $r['time_window_start'] ?? null,
                        $r['time_window_end'] ?? null,
                        $r['days_of_week'] ?? null,
                        $r['subject_template'] ?? '[LinkNest Monitor] {monitor_name} Status: {status}',
                        $r['body_template'] ?? "Monitor: {monitor_name}\nStatus: {status}\nTime: {time}\nDetails: {details}",
                        $r['from_name'] ?? null,
                        $r['from_email'] ?? null,
                        $ccStr,
                        isset($r['is_enabled']) ? (int)$r['is_enabled'] : 1,
                        isset($r['created_at']) ? (int)$r['created_at'] : $now,
                        isset($r['updated_at']) ? (int)$r['updated_at'] : $now
                    ]);

                    $recipients = $r['recipients'] ?? [];
                    if (is_array($recipients)) {
                        foreach ($recipients as $email) {
                            $email = trim((string)$email);
                            if ($email === '') continue;
                            $stmtInsertRecipient->execute([$ruleId, $email, $now]);
                        }
                    }
                }
            }

            // Email logs
            $emailLogs = $entry['email_logs'] ?? [];
            if (is_array($emailLogs)) {
                foreach ($emailLogs as $log) {
                    if (!isset($log['recipient_email'], $log['sent_at'], $log['subject'])) continue;
                    $stmtInsertEmailLog->execute([
                        $log['rule_id'] ?? null,
                        $monitorId,
                        $log['recipient_email'],
                        $log['status_trigger'] ?? 'both',
                        (int)$log['sent_at'],
                        $log['subject'],
                        isset($log['success']) ? (int)$log['success'] : 1,
                        $log['error_message'] ?? null
                    ]);
                }
            }
        }

        $db->commit();
        sendJSON(['success' => true, 'count' => count($bundleMonitors)]);
    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJSON(['error' => 'Import failed: ' . $e->getMessage()], 500);
    }
}

function handleGetMonitors() {
    $db = getDB();
    $user = getAuthUserFromGlobals();

    if (!empty($user['is_admin'])) {
        $stmt = $db->prepare('
            SELECT 
                m.*,
                COALESCE((
                    SELECT COUNT(*) 
                    FROM monitor_notification_rules r 
                    WHERE r.monitor_id = m.id AND r.is_enabled = 1
                ), 0) AS email_rules_count,
                (SELECT GROUP_CONCAT(user_id) FROM user_monitor_permissions ump WHERE ump.monitor_id = m.id AND COALESCE(ump.can_view, 0) = 1) AS allowed_user_ids_csv
            FROM monitors m
            ORDER BY m.created_at DESC
        ');
        $stmt->execute();
    } else {
        $stmt = $db->prepare('
            SELECT 
                m.*,
                COALESCE((
                    SELECT COUNT(*) 
                    FROM monitor_notification_rules r 
                    WHERE r.monitor_id = m.id AND r.is_enabled = 1
                ), 0) AS email_rules_count
            FROM monitors m
            LEFT JOIN user_monitor_permissions ump
              ON ump.monitor_id = m.id AND ump.user_id = ?
            WHERE COALESCE(ump.can_view, 0) = 1
            ORDER BY m.created_at DESC
        ');
        $stmt->execute([(int)$user['id']]);
    }
    $monitors = $stmt->fetchAll();

    // Normalize allowed user list for admins (UI convenience)
    if (!empty($user['is_admin'])) {
        foreach ($monitors as &$m) {
            $csv = $m['allowed_user_ids_csv'] ?? null;
            $ids = [];
            if (is_string($csv) && trim($csv) !== '') {
                $parts = array_filter(array_map('trim', explode(',', $csv)));
                foreach ($parts as $p) {
                    $v = (int)$p;
                    if ($v > 0) $ids[] = $v;
                }
            }
            $m['allowed_user_ids'] = $ids;
            unset($m['allowed_user_ids_csv']);
        }
        unset($m);
    }
    
    sendJSON(['monitors' => $monitors]);
}

function handleGetMonitor($id) {
    $db = getDB();
    $user = getAuthUserFromGlobals();

    $monitor = fetchMonitorForView($id, $user, $db);
    
    if (!$monitor) {
        sendJSON(['error' => 'Monitor not found'], 404);
        return;
    }

    // Add email rules count
    $stmt = $db->prepare('SELECT COUNT(*) FROM monitor_notification_rules r WHERE r.monitor_id = ? AND r.is_enabled = 1');
    $stmt->execute([(int)$monitor['id']]);
    $monitor['email_rules_count'] = (int)$stmt->fetchColumn();

    // For admins, include allowed user ids
    if (!empty($user['is_admin'])) {
        $stmt = $db->prepare('SELECT user_id FROM user_monitor_permissions WHERE monitor_id = ? AND COALESCE(can_view, 0) = 1 ORDER BY user_id ASC');
        $stmt->execute([(int)$monitor['id']]);
        $monitor['allowed_user_ids'] = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }
    
    sendJSON(['monitor' => $monitor]);
}

function handleCreateMonitor() {
    requireAdmin(); // Only admins can create monitors
    $data = getJSONInput();
    
    // Validation
    if (empty($data['name']) || empty($data['type']) || empty($data['target'])) {
        sendJSON(['error' => 'Name, type, and target are required'], 400);
        return;
    }
    
    if (!validateMonitorType($data['type'])) {
        sendJSON(['error' => 'Invalid type. Must be url, keyword, port, or ping'], 400);
        return;
    }

    // Warning threshold
    $warningThreshold = isset($data['warning_threshold']) ? (int)$data['warning_threshold'] : 1;
    if ($warningThreshold < 1) $warningThreshold = 1;
    if ($warningThreshold > 20) $warningThreshold = 20;

    // Timeout (seconds) - used for url/keyword primarily
    $timeout = isset($data['timeout']) && $data['timeout'] !== '' ? (int)$data['timeout'] : null;
    if ($timeout !== null) {
        if ($timeout < 1) $timeout = 1;
        if ($timeout > 60) $timeout = 60;
    }

    $allowedUserIds = normalizeAllowedUserIds($data['allowed_user_ids'] ?? []);
    $permissionsMode = !empty($allowedUserIds) ? 1 : 0;
    
    $db = getDB();
    
    try {
        $db->beginTransaction();

        $stmt = $db->prepare('INSERT INTO monitors (
            name, type, target, port, keyword, interval,
            warning_threshold, consecutive_failures, timeout, permissions_mode,
            is_active, email_notification, created_at, updated_at,
            tab_name, group_name, maintenance_start, maintenance_end,
            legacy_notify_pending, legacy_email_disabled, legacy_email_to, legacy_email_cc, legacy_email_from_name, legacy_email_from_email,
            legacy_email_subject_template, legacy_email_body_template
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        
        $now = time();
        $stmt->execute([
            $data['name'],
            $data['type'],
            $data['target'],
            isset($data['port']) ? (int)$data['port'] : null,
            $data['keyword'] ?? null,
            isset($data['interval']) ? (int)$data['interval'] : 5,
            $warningThreshold,
            0,
            $timeout,
            $permissionsMode,
            isset($data['is_active']) ? (int)$data['is_active'] : 1,
            isset($data['email_notification']) ? (int)$data['email_notification'] : 0,
            $now,
            $now,
            $data['tab_name'] ?? null,
            $data['group_name'] ?? null,
            isset($data['maintenance_start']) ? (int)$data['maintenance_start'] : null,
            isset($data['maintenance_end']) ? (int)$data['maintenance_end'] : null,
            // legacy_notify_pending: if user enables email immediately, allow one alert if monitor is already down later
            (isset($data['email_notification']) && (int)$data['email_notification'] === 1) ? 1 : 0,
            isset($data['legacy_email_disabled']) ? (int)$data['legacy_email_disabled'] : 0,
            $data['legacy_email_to'] ?? null,
            $data['legacy_email_cc'] ?? null,
            $data['legacy_email_from_name'] ?? null,
            $data['legacy_email_from_email'] ?? null,
            $data['legacy_email_subject_template'] ?? null,
            $data['legacy_email_body_template'] ?? null
        ]);
        
        $id = $db->lastInsertId();

        // Save permissions if restricted
        if ($permissionsMode === 1) {
            $permStmt = $db->prepare('INSERT INTO user_monitor_permissions (user_id, monitor_id, can_view, created_at, updated_at) VALUES (?, ?, 1, ?, ?)');
            foreach ($allowedUserIds as $uid) {
                $permStmt->execute([(int)$uid, (int)$id, $now, $now]);
            }
        }
        
        // Fetch created monitor
        $stmt = $db->prepare('
            SELECT 
                m.*,
                COALESCE((
                    SELECT COUNT(*) 
                    FROM monitor_notification_rules r 
                    WHERE r.monitor_id = m.id AND r.is_enabled = 1
                ), 0) AS email_rules_count
            FROM monitors m
            WHERE m.id = ?
        ');
        $stmt->execute([$id]);
        $monitor = $stmt->fetch();

        if ($permissionsMode === 1) {
            $monitor['allowed_user_ids'] = $allowedUserIds;
        } else {
            $monitor['allowed_user_ids'] = [];
        }

        $db->commit();
        
        sendJSON(['success' => true, 'monitor' => $monitor], 201);
        
    } catch (PDOException $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleDuplicateMonitor($id) {
    requireAdmin(); // Only admins can duplicate monitors
    $db = getDB();
    
    // Fetch the original monitor
    $stmt = $db->prepare('SELECT * FROM monitors WHERE id = ?');
    $stmt->execute([$id]);
    $original = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$original) {
        sendJSON(['error' => 'Monitor not found'], 404);
        return;
    }
    
    try {
        $db->beginTransaction();
        $now = time();
        
        // Create the duplicate monitor with " (Copy)" appended to name
        $newName = $original['name'] . ' (Copy)';
        
        $stmt = $db->prepare('INSERT INTO monitors (
            name, type, target, port, keyword, interval,
            warning_threshold, consecutive_failures, timeout, permissions_mode,
            is_active, email_notification, created_at, updated_at,
            tab_name, group_name, maintenance_start, maintenance_end,
            legacy_notify_pending, legacy_email_disabled, legacy_email_to, legacy_email_cc, 
            legacy_email_from_name, legacy_email_from_email,
            legacy_email_subject_template, legacy_email_body_template
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        
        $stmt->execute([
            $newName,
            $original['type'],
            $original['target'],
            $original['port'],
            $original['keyword'],
            $original['interval'],
            $original['warning_threshold'],
            0, // Reset consecutive_failures
            $original['timeout'],
            $original['permissions_mode'],
            $original['is_active'],
            $original['email_notification'],
            $now,
            $now,
            $original['tab_name'],
            $original['group_name'],
            $original['maintenance_start'],
            $original['maintenance_end'],
            $original['legacy_notify_pending'],
            $original['legacy_email_disabled'],
            $original['legacy_email_to'],
            $original['legacy_email_cc'],
            $original['legacy_email_from_name'],
            $original['legacy_email_from_email'],
            $original['legacy_email_subject_template'],
            $original['legacy_email_body_template']
        ]);
        
        $newMonitorId = $db->lastInsertId();
        
        // Copy user permissions if any
        if ((int)$original['permissions_mode'] === 1) {
            $permStmt = $db->prepare('SELECT user_id FROM user_monitor_permissions WHERE monitor_id = ?');
            $permStmt->execute([$id]);
            $permissions = $permStmt->fetchAll(PDO::FETCH_COLUMN);
            
            if (!empty($permissions)) {
                $insertPermStmt = $db->prepare('INSERT INTO user_monitor_permissions (user_id, monitor_id, can_view, created_at, updated_at) VALUES (?, ?, 1, ?, ?)');
                foreach ($permissions as $userId) {
                    $insertPermStmt->execute([$userId, $newMonitorId, $now, $now]);
                }
            }
        }
        
        // Copy notification rules
        $rulesStmt = $db->prepare('SELECT * FROM monitor_notification_rules WHERE monitor_id = ? ORDER BY sort_order');
        $rulesStmt->execute([$id]);
        $rules = $rulesStmt->fetchAll(PDO::FETCH_ASSOC);
        
        $insertRuleStmt = $db->prepare('INSERT INTO monitor_notification_rules (
            monitor_id, name, sort_order, status_trigger, time_window_start, time_window_end, 
            days_of_week, subject_template, body_template, from_name, from_email, cc_emails, 
            is_enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        
        foreach ($rules as $rule) {
            $insertRuleStmt->execute([
                $newMonitorId,
                $rule['name'],
                $rule['sort_order'],
                $rule['status_trigger'],
                $rule['time_window_start'],
                $rule['time_window_end'],
                $rule['days_of_week'],
                $rule['subject_template'],
                $rule['body_template'],
                $rule['from_name'],
                $rule['from_email'],
                $rule['cc_emails'],
                $rule['is_enabled'],
                $now,
                $now
            ]);
            
            $newRuleId = $db->lastInsertId();
            
            // Copy recipients for this rule
            $recipientsStmt = $db->prepare('SELECT email FROM monitor_notification_recipients WHERE rule_id = ?');
            $recipientsStmt->execute([$rule['id']]);
            $recipients = $recipientsStmt->fetchAll(PDO::FETCH_COLUMN);
            
            if (!empty($recipients)) {
                $insertRecipientStmt = $db->prepare('INSERT INTO monitor_notification_recipients (rule_id, email, created_at) VALUES (?, ?, ?)');
                foreach ($recipients as $email) {
                    $insertRecipientStmt->execute([$newRuleId, $email, $now]);
                }
            }
        }
        
        // Fetch the newly created monitor with all details
        $stmt = $db->prepare('
            SELECT 
                m.*,
                COALESCE((
                    SELECT COUNT(*) 
                    FROM monitor_notification_rules r 
                    WHERE r.monitor_id = m.id AND r.is_enabled = 1
                ), 0) AS email_rules_count
            FROM monitors m
            WHERE m.id = ?
        ');
        $stmt->execute([$newMonitorId]);
        $newMonitor = $stmt->fetch(PDO::FETCH_ASSOC);
        
        // Get allowed user IDs if permissions mode is 1
        if ((int)$newMonitor['permissions_mode'] === 1) {
            $permStmt = $db->prepare('SELECT user_id FROM user_monitor_permissions WHERE monitor_id = ?');
            $permStmt->execute([$newMonitorId]);
            $newMonitor['allowed_user_ids'] = $permStmt->fetchAll(PDO::FETCH_COLUMN);
        } else {
            $newMonitor['allowed_user_ids'] = [];
        }
        
        $db->commit();
        
        sendJSON(['success' => true, 'monitor' => $newMonitor], 201);
        
    } catch (PDOException $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleUpdateMonitor($id) {
    requireAdmin(); // Only admins can update monitors
    $data = getJSONInput();
    $db = getDB();
    
    // Check if exists
    $stmt = $db->prepare('SELECT id, email_notification FROM monitors WHERE id = ?');
    $stmt->execute([$id]);
    $existing = $stmt->fetch();
    if (!$existing) {
        sendJSON(['error' => 'Monitor not found'], 404);
        return;
    }
    
    try {
        $db->beginTransaction();
        // Build dynamic update query
        $fields = [];
        $values = [];
        
        $allowedFields = [
            'name', 'type', 'target', 'port', 'keyword', 'interval',
            'warning_threshold', 'timeout', 'permissions_mode',
            'is_active', 'email_notification',
            'tab_name', 'group_name', 'maintenance_start', 'maintenance_end',
            'legacy_email_disabled',
            'legacy_email_to', 'legacy_email_from_name', 'legacy_email_from_email',
            'legacy_email_cc',
            'legacy_email_subject_template', 'legacy_email_body_template'
        ];
        foreach ($allowedFields as $field) {
            if (isset($data[$field])) {
                if ($field === 'type') {
                    if (!validateMonitorType($data[$field])) {
                        sendJSON(['error' => 'Invalid type. Must be url, keyword, port, or ping'], 400);
                    }
                }
                if ($field === 'warning_threshold') {
                    $v = (int)$data[$field];
                    if ($v < 1) $v = 1;
                    if ($v > 20) $v = 20;
                    $fields[] = "$field = ?";
                    $values[] = $v;
                    continue;
                }
                if ($field === 'timeout') {
                    $v = $data[$field];
                    if ($v === null || $v === '') {
                        $fields[] = "$field = ?";
                        $values[] = null;
                        continue;
                    }
                    $v = (int)$v;
                    if ($v < 1) $v = 1;
                    if ($v > 60) $v = 60;
                    $fields[] = "$field = ?";
                    $values[] = $v;
                    continue;
                }

                $fields[] = "$field = ?";
                $values[] = $data[$field];
            }
        }

        // Permissions: if allowed_user_ids provided, set permissions_mode accordingly and replace permission rows
        if (isset($data['allowed_user_ids'])) {
            $allowedUserIds = normalizeAllowedUserIds($data['allowed_user_ids']);
            $permissionsMode = !empty($allowedUserIds) ? 1 : 0;

            $fields[] = "permissions_mode = ?";
            $values[] = $permissionsMode;

            $now = time();
            $db->prepare('DELETE FROM user_monitor_permissions WHERE monitor_id = ?')->execute([(int)$id]);
            if ($permissionsMode === 1) {
                $permStmt = $db->prepare('INSERT INTO user_monitor_permissions (user_id, monitor_id, can_view, created_at, updated_at) VALUES (?, ?, 1, ?, ?)');
                foreach ($allowedUserIds as $uid) {
                    $permStmt->execute([(int)$uid, (int)$id, $now, $now]);
                }
            }
        }
        
        // If email_notification is being enabled (0 -> 1), set a one-shot pending flag.
        if (isset($data['email_notification'])) {
            $prev = (int)($existing['email_notification'] ?? 0);
            $next = (int)$data['email_notification'];
            if ($prev === 0 && $next === 1) {
                $fields[] = "legacy_notify_pending = ?";
                $values[] = 1;
            } elseif ($prev === 1 && $next === 0) {
                // If disabled, clear pending
                $fields[] = "legacy_notify_pending = ?";
                $values[] = 0;
            }
        }

        if (empty($fields)) {
            sendJSON(['error' => 'No fields to update'], 400);
            return;
        }
        
        $fields[] = "updated_at = ?";
        $values[] = time();
        $values[] = $id;
        
        $sql = "UPDATE monitors SET " . implode(', ', $fields) . " WHERE id = ?";
        $stmt = $db->prepare($sql);
        $stmt->execute($values);
        
        // Fetch updated monitor
        $stmt = $db->prepare('
            SELECT 
                m.*,
                COALESCE((
                    SELECT COUNT(*) 
                    FROM monitor_notification_rules r 
                    WHERE r.monitor_id = m.id AND r.is_enabled = 1
                ), 0) AS email_rules_count
            FROM monitors m
            WHERE m.id = ?
        ');
        $stmt->execute([$id]);
        $monitor = $stmt->fetch();

        // Include allowed users for UI
        $stmt = $db->prepare('SELECT user_id FROM user_monitor_permissions WHERE monitor_id = ? AND COALESCE(can_view, 0) = 1 ORDER BY user_id ASC');
        $stmt->execute([(int)$id]);
        $monitor['allowed_user_ids'] = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));

        $db->commit();
        
        sendJSON(['success' => true, 'monitor' => $monitor]);
        
    } catch (PDOException $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleDeleteMonitor($id) {
    requireAdmin(); // Only admins can delete monitors
    $db = getDB();
    
    // Check if exists
    $stmt = $db->prepare('SELECT id FROM monitors WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) {
        sendJSON(['error' => 'Monitor not found'], 404);
        return;
    }
    
    try {
        $stmt = $db->prepare('DELETE FROM monitors WHERE id = ?');
        $stmt->execute([$id]);
        
        sendJSON(['success' => true]);
        
    } catch (PDOException $e) {
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleGetMonitorLogs($id) {
    $db = getDB();
    $user = getAuthUserFromGlobals();
    
    // Check if exists and user can view
    $monitor = fetchMonitorForView($id, $user, $db);
    if (!$monitor) {
        sendJSON(['error' => 'Monitor not found'], 404);
        return;
    }
    
    // Clean up old logs (keep last 30 days)
    $thirtyDaysAgo = time() - (30 * 24 * 60 * 60);
    if (rand(1, 100) <= 5) {
        $db->exec("DELETE FROM monitor_logs WHERE checked_at < $thirtyDaysAgo");
    }
    
    $days = isset($_GET['days']) ? (int)$_GET['days'] : null;
    $from = isset($_GET['from']) ? (int)$_GET['from'] : null;
    $to = isset($_GET['to']) ? (int)$_GET['to'] : null;
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;

    $sql = 'SELECT * FROM monitor_logs WHERE monitor_id = ?';
    $params = [$id];

    if ($from) {
        $sql .= ' AND checked_at >= ?';
        $params[] = $from;
    }
    if ($to) {
        $sql .= ' AND checked_at <= ?';
        $params[] = $to;
    }

    if (!$from && !$to && $days) {
        $since = time() - ($days * 24 * 60 * 60);
        $sql .= ' AND checked_at >= ?';
        $params[] = $since;
    }

    $sql .= ' ORDER BY checked_at DESC';
    
    if (!$days && !$from && !$to) {
        $sql .= ' LIMIT ' . (int)$limit;
    }

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $logs = $stmt->fetchAll();
    
    sendJSON(['logs' => $logs]);
}

function handleCheckMonitor($id) {
    // Set execution time limit to prevent hanging
    set_time_limit(15); // Maximum 15 seconds for single check
    
    $db = getDB();
    $user = getAuthUserFromGlobals();
    $monitor = fetchMonitorForView($id, $user, $db);
    
    if (!$monitor) {
        sendJSON(['error' => 'Monitor not found'], 404);
        return;
    }
    
    // Perform check immediately.
    // Optional: force notify rules even when status did not change (used by "force refresh" mode in UI).
    $forceNotifyRules = false;
    if (isset($_GET['force_notify_rules'])) {
        $v = strtolower(trim((string)$_GET['force_notify_rules']));
        $forceNotifyRules = in_array($v, ['1', 'true', 'yes', 'on'], true);
    }
    $result = performMonitorCheck($monitor, ['force_notify_rules' => $forceNotifyRules]);
    
    sendJSON(['success' => true, 'result' => $result]);
}

function handleCheckAllMonitors() {
    error_log("[MONITOR] handleCheckAllMonitors called");
    try {
        // Set execution time limit to prevent hanging on multiple checks
        // Allow more time for multiple monitors - calculate based on number of monitors
        $db = getDB();
        if (!$db) {
            throw new Exception("Failed to get database connection");
        }
        
        error_log("[MONITOR] Getting active monitor count");
        $user = getAuthUserFromGlobals();
        if (!empty($user['is_admin'])) {
            $stmt = $db->prepare('SELECT COUNT(*) FROM monitors WHERE is_active = 1');
            $stmt->execute();
            $monitorCount = (int)$stmt->fetchColumn();
        } else {
            $stmt = $db->prepare('
                SELECT COUNT(*)
                FROM monitors m
                LEFT JOIN user_monitor_permissions ump
                  ON ump.monitor_id = m.id AND ump.user_id = ?
                WHERE m.is_active = 1 AND COALESCE(ump.can_view, 0) = 1
            ');
            $stmt->execute([(int)$user['id']]);
            $monitorCount = (int)$stmt->fetchColumn();
        }
        error_log("[MONITOR] Found $monitorCount active monitors");
        
        // Calculate time limit: allow for retry confirmation on failures (up to ~20s per monitor), min 60s, max 300s
        $timeLimit = max(60, min(300, $monitorCount * 20));
        set_time_limit($timeLimit);
        error_log("[MONITOR] Set time limit to $timeLimit seconds");
        
        if (!empty($user['is_admin'])) {
            $stmt = $db->prepare('SELECT * FROM monitors WHERE is_active = 1');
            $stmt->execute();
            $monitors = $stmt->fetchAll();
        } else {
            $stmt = $db->prepare('
                SELECT m.*
                FROM monitors m
                LEFT JOIN user_monitor_permissions ump
                  ON ump.monitor_id = m.id AND ump.user_id = ?
                WHERE m.is_active = 1 AND COALESCE(ump.can_view, 0) = 1
            ');
            $stmt->execute([(int)$user['id']]);
            $monitors = $stmt->fetchAll();
        }
        error_log("[MONITOR] Retrieved " . count($monitors) . " monitors to check");
        
        $results = [];
        $checkedCount = 0;
        $totalCount = count($monitors);
        $upCount = 0;      // Monitors that are UP (healthy)
        $downCount = 0;    // Monitors that are DOWN (unhealthy)
        $errorCount = 0;   // Monitors where the check itself failed (exceptions, unknown status)
        
        // Check if performMonitorCheck function exists
        if (!function_exists('performMonitorCheck')) {
            throw new Exception("performMonitorCheck function not found. monitor_check.php may not be loaded properly.");
        }
        
        foreach ($monitors as $monitor) {
            error_log("[MONITOR] Checking monitor ID: {$monitor['id']}, name: {$monitor['name']}");
            try {
                $result = performMonitorCheck($monitor);
                $results[] = $result;
                $checkedCount++;
                
                // Count monitor status
                if (isset($result['status'])) {
                    if ($result['status'] === 'up') {
                        $upCount++;
                    } elseif ($result['status'] === 'down') {
                        $downCount++;
                    } else {
                        // Unknown status means check failed
                        $errorCount++;
                    }
                } else {
                    $errorCount++;
                }
            } catch (Exception $e) {
                // Log error but continue checking other monitors
                error_log("Error checking monitor {$monitor['id']}: " . $e->getMessage());
                $results[] = [
                    'id' => $monitor['id'],
                    'status' => 'unknown',
                    'response_time' => 0,
                    'details' => 'Check failed: ' . $e->getMessage()
                ];
                $checkedCount++;
                $errorCount++;
            } catch (Error $e) {
                // Log fatal error but continue checking other monitors
                error_log("Fatal error checking monitor {$monitor['id']}: " . $e->getMessage());
                $results[] = [
                    'id' => $monitor['id'],
                    'status' => 'unknown',
                    'response_time' => 0,
                    'details' => 'Check failed: ' . $e->getMessage()
                ];
                $checkedCount++;
                $errorCount++;
            }
        }
    
        // Log if not all monitors were checked (shouldn't happen now, but good for debugging)
        if ($checkedCount < $totalCount) {
            error_log("Warning: Only checked $checkedCount of $totalCount monitors");
        }
        
        error_log("[MONITOR] Check complete - Total: $totalCount, Checked: $checkedCount, UP: $upCount, DOWN: $downCount, Errors: $errorCount");
        
        sendJSON([
            'success' => true, 
            'count' => $checkedCount, 
            'total' => $totalCount, 
            'up_count' => $upCount,
            'down_count' => $downCount,
            'error_count' => $errorCount,
            'results' => $results
        ]);
    } catch (Exception $e) {
        $errorMsg = "Error in handleCheckAllMonitors: " . $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine();
        error_log($errorMsg);
        error_log("Stack trace: " . $e->getTraceAsString());
        
        // Clean any output before sending JSON
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        
        sendJSON([
            'success' => false,
            'error' => 'Failed to check all monitors: ' . $e->getMessage()
        ], 500);
    } catch (Error $e) {
        $errorMsg = "Fatal error in handleCheckAllMonitors: " . $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine();
        error_log($errorMsg);
        error_log("Stack trace: " . $e->getTraceAsString());
        
        // Clean any output before sending JSON
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        
        sendJSON([
            'success' => false,
            'error' => 'Fatal error checking monitors: ' . $e->getMessage()
        ], 500);
    } catch (Throwable $e) {
        $errorMsg = "Throwable in handleCheckAllMonitors: " . $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine();
        error_log($errorMsg);
        error_log("Stack trace: " . $e->getTraceAsString());
        
        // Clean any output before sending JSON
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        
        sendJSON([
            'success' => false,
            'error' => 'Error checking monitors: ' . $e->getMessage()
        ], 500);
    }
}
function handleDeleteAllMonitors() {
    requireAdmin(); // Only admins can delete all monitors
    $db = getDB();
    try {
        $db->exec('DELETE FROM monitors');
        $db->exec('DELETE FROM monitor_logs'); // Also clear logs
        sendJSON(['success' => true]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleImportMonitors() {
    requireAdmin(); // Only admins can import monitors
    $data = getJSONInput();
    if (!isset($data['monitors']) || !is_array($data['monitors'])) {
        sendJSON(['error' => 'Invalid import data format'], 400);
        return;
    }
    
    $monitors = $data['monitors'];
    $db = getDB();
    $now = time();
    $count = 0;
    
    try {
        $db->beginTransaction();
        
        $stmt = $db->prepare('INSERT INTO monitors (
            name, type, target, port, keyword, interval, 
            is_active, email_notification, created_at, updated_at,
            tab_name, group_name, maintenance_start, maintenance_end
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        
        foreach ($monitors as $m) {
            $stmt->execute([
                $m['name'] ?? 'Imported Monitor',
                $m['type'] ?? 'url',
                $m['target'] ?? '',
                isset($m['port']) ? (int)$m['port'] : null,
                $m['keyword'] ?? null,
                isset($m['interval']) ? (int)$m['interval'] : 5,
                isset($m['is_active']) ? (int)$m['is_active'] : 1,
                isset($m['email_notification']) ? (int)$m['email_notification'] : 0,
                $now,
                $now,
                $m['tab_name'] ?? null,
                $m['group_name'] ?? null,
                isset($m['maintenance_start']) ? (int)$m['maintenance_start'] : null,
                isset($m['maintenance_end']) ? (int)$m['maintenance_end'] : null
            ]);
            $count++;
        }
        
        $db->commit();
        sendJSON(['success' => true, 'count' => $count]);
        
    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJSON(['error' => 'Import failed: ' . $e->getMessage()], 500);
    }
}

function handleImportCSV() {
    requireAdmin(); // Only admins can import monitors
    $data = getJSONInput();
    if (!isset($data['csv']) || !is_string($data['csv'])) {
        sendJSON(['error' => 'Invalid CSV data'], 400);
        return;
    }
    
    $lines = preg_split('/\r\n|\r|\n/', trim($data['csv']));
    if (empty($lines)) {
        sendJSON(['count' => 0]);
        return;
    }
    
    // Header row is optional, but if present, we skip it
    $header = str_getcsv($lines[0]);
    $startIndex = 0;
    if (strtolower($header[0] ?? '') === 'name' || strtolower($header[0] ?? '') === 'monitor name') {
        $startIndex = 1;
    }
    
    $monitors = [];
    for ($i = $startIndex; $i < count($lines); $i++) {
        $row = str_getcsv($lines[$i]);
        if (count($row) < 3) continue; // Minimal requirement: name, type, target
        
        $monitors[] = [
            'name' => $row[0] ?? 'Imported',
            'type' => strtolower($row[1] ?? 'url'),
            'target' => $row[2] ?? '',
            'port' => isset($row[3]) && is_numeric($row[3]) ? (int)$row[3] : null,
            'keyword' => $row[4] ?? null,
            'interval' => isset($row[5]) && is_numeric($row[5]) ? (int)$row[5] : 5,
            'tab_name' => $row[6] ?? 'General',
            'group_name' => $row[7] ?? 'Other'
        ];
    }
    
    $db = getDB();
    $now = time();
    $count = 0;
    
    try {
        $db->beginTransaction();
        
        $stmt = $db->prepare('INSERT INTO monitors (
            name, type, target, port, keyword, interval, 
            is_active, email_notification, created_at, updated_at,
            tab_name, group_name, maintenance_start, maintenance_end
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        
        foreach ($monitors as $m) {
            $stmt->execute([
                $m['name'],
                $m['type'],
                $m['target'],
                $m['port'],
                $m['keyword'],
                $m['interval'],
                1, // is_active
                0, // email_notification
                $now,
                $now,
                $m['tab_name'],
                $m['group_name'],
                null, // maintenance_start
                null  // maintenance_end
            ]);
            $count++;
        }
        
        $db->commit();
        sendJSON(['success' => true, 'count' => $count]);
        
    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJSON(['error' => 'Import failed: ' . $e->getMessage()], 500);
    }
}

function handleUpdateTabName() {
    requireAdmin(); // Only admins can update tab/group names
    $data = getJSONInput();
    if (!isset($data['old_name']) || !isset($data['new_name'])) {
        sendJSON(['error' => 'Old name and new name are required'], 400);
        return;
    }
    
    $db = getDB();
    try {
        $stmt = $db->prepare("UPDATE monitors SET tab_name = ? WHERE tab_name = ?");
        $stmt->execute([$data['new_name'], $data['old_name']]);
        sendJSON(['success' => true]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

function handleUpdateGroupName() {
    requireAdmin(); // Only admins can update tab/group names
    $data = getJSONInput();
    if (!isset($data['tab_name']) || !isset($data['old_name']) || !isset($data['new_name'])) {
        sendJSON(['error' => 'Tab name, old group name and new group name are required'], 400);
        return;
    }
    
    $db = getDB();
    try {
        $stmt = $db->prepare("UPDATE monitors SET group_name = ? WHERE tab_name = ? AND group_name = ?");
        $stmt->execute([$data['new_name'], $data['tab_name'], $data['old_name']]);
        sendJSON(['success' => true]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}
