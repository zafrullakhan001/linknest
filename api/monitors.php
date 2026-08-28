<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/monitor_check.php'; // Include check logic for immediate "check now"
require_once __DIR__ . '/monitor_check_jobs_lib.php';
require_once __DIR__ . '/monitor_worker_scheduler_lib.php';
require_once __DIR__ . '/monitor_suggest.php';
require_once __DIR__ . '/user_audit_helper.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

/**
 * Write a monitoring-related entry to user_audit_log (never blocks the main action).
 */
function logMonitorAudit(string $action, array $details = []): void {
    logUserAudit($action, ['details' => $details]);
}

/**
 * Compact monitor identity for audit details.
 */
function monitorAuditIdentity(?array $monitor, $fallbackId = null): array {
    $id = null;
    if (is_array($monitor) && isset($monitor['id'])) {
        $id = (int)$monitor['id'];
    } elseif ($fallbackId !== null && $fallbackId !== '') {
        $id = (int)$fallbackId;
    }
    $out = [];
    if ($id !== null && $id > 0) {
        $out['monitor_id'] = $id;
    }
    if (is_array($monitor)) {
        if (!empty($monitor['name'])) $out['name'] = (string)$monitor['name'];
        if (!empty($monitor['type'])) $out['type'] = (string)$monitor['type'];
        if (!empty($monitor['target'])) $out['target'] = (string)$monitor['target'];
        if (array_key_exists('tab_name', $monitor) && $monitor['tab_name'] !== null && $monitor['tab_name'] !== '') {
            $out['tab_name'] = (string)$monitor['tab_name'];
        }
    }
    return $out;
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
        } elseif (preg_match('/^\/(\d+)\/export$/', $path, $matches)) {
            handleExportMonitor($matches[1]);
        } elseif (preg_match('/^\/(\d+)$/', $path, $matches)) {
            handleGetMonitor($matches[1]);
        } elseif (preg_match('/^\/(\d+)\/logs$/', $path, $matches)) {
            handleGetMonitorLogs($matches[1]);
        } elseif ($path === '/check-jobs/active') {
            monitorCheckJobsHandleGetActive();
        } elseif ($path === '/worker-scheduler-status') {
            monitorWorkerSchedulerHandleStatus();
        } elseif (preg_match('/^\/check-jobs\/(\d+)$/', $path, $matches)) {
            monitorCheckJobsHandleGet((int)$matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'POST':
        if ($path === '' || $path === '/') {
            handleCreateMonitor();
        } elseif ($path === '/import-bundle') {
            handleImportMonitorsBundle();
        } elseif ($path === '/check-all') {
            handleCheckAllMonitors();
        } elseif (preg_match('/^\/(\d+)\/check$/', $path, $matches)) {
            handleCheckMonitor($matches[1]);
        } elseif (preg_match('/^\/(\d+)\/duplicate$/', $path, $matches)) {
            handleDuplicateMonitor($matches[1]);
        } elseif ($path === '/suggest') {
            handleMonitorSuggest();
        } elseif ($path === '/suggest-bulk') {
            handleMonitorSuggestBulk();
        } elseif ($path === '/bulk-create') {
            handleBulkCreateMonitors();
        } elseif (preg_match('/^\/check-jobs\/(\d+)\/cancel$/', $path, $matches)) {
            monitorCheckJobsHandleCancel((int)$matches[1]);
        } elseif ($path === '/worker-scheduler-task') {
            monitorWorkerSchedulerHandleSetTask();
        } elseif ($path === '/worker-scheduler-install') {
            monitorWorkerSchedulerHandleInstall();
        } elseif ($path === '/worker-scheduler-uninstall') {
            monitorWorkerSchedulerHandleUninstall();
        } elseif ($path === '/worker-python-install') {
            monitorWorkerSchedulerHandleInstallPython();
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
    return in_array($type, ['url', 'headers', 'keyword', 'port', 'ping', 'ssl', 'dns', 'json'], true);
}

/**
 * Interval is stored in minutes. SSL cert checks are whole days (1–30), default 1 day.
 */
function normalizeMonitorTabName(string $type, $tabName): string {
    $tab = trim((string)$tabName);
    if ($type === 'ssl') {
        return 'SSL Certificates';
    }
    if (strcasecmp($tab, 'SSL Certificates') === 0) {
        return 'General';
    }
    return $tab;
}

function normalizeMonitorInterval(string $type, $interval, int $defaultMinutes = 5): int {
    $minutes = (int)$interval;
    if ($type === 'ssl') {
        if ($minutes < 1) {
            $minutes = 1440;
        }
        $days = (int)round($minutes / 1440);
        if ($days < 1) {
            $days = 1;
        }
        if ($days > 30) {
            $days = 30;
        }
        return $days * 1440;
    }
    if ($minutes < 1) {
        return $defaultMinutes;
    }
    return $minutes;
}

function validateMonitorTypeFields(array $data): ?string {
    $type = $data['type'] ?? '';
    if ($type === 'port') {
        if (empty($data['port']) || (int)$data['port'] < 1 || (int)$data['port'] > 65535) {
            return 'Port is required for port monitors (1-65535)';
        }
    }
    if ($type === 'keyword' || $type === 'json') {
        if (empty(trim((string)($data['keyword'] ?? '')))) {
            return $type === 'json'
                ? 'JSON check expression is required (e.g. status:ok)'
                : 'Keyword is required for keyword monitors';
        }
    }
    if ($type === 'ssl') {
        $kw = trim((string)($data['keyword'] ?? ''));
        if ($kw !== '' && (!ctype_digit($kw) || (int)$kw < 1 || (int)$kw > 365)) {
            return 'SSL warning days must be between 1 and 365';
        }
    }
    if ($type === 'dns') {
        $target = trim((string)($data['target'] ?? ''));
        $target = preg_replace('#^https?://#i', '', $target);
        $target = explode('/', $target)[0];
        $target = explode(':', $target)[0];
        if ($target === '' || !preg_match('/^[a-zA-Z0-9]([a-zA-Z0-9\.\-]*[a-zA-Z0-9])?$/', $target)) {
            return 'DNS monitor target must be a valid hostname';
        }
    }
    return null;
}

const MONITOR_EXPORT_LOG_LIMIT = 500;

function monitorExportSanitizeMonitorRow(array $monitor): array {
    unset($monitor['email_rules_count'], $monitor['allowed_user_ids_csv']);
    return $monitor;
}

function monitorExportFetchAllowedUserIds(PDO $db, int $monitorId): array {
    $stmt = $db->prepare('SELECT user_id FROM user_monitor_permissions WHERE monitor_id = ? AND COALESCE(can_view, 0) = 1 ORDER BY user_id ASC');
    $stmt->execute([$monitorId]);
    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function monitorExportFetchRules(PDO $db, int $monitorId): array {
    $stmt = $db->prepare('SELECT * FROM monitor_notification_rules WHERE monitor_id = ? ORDER BY COALESCE(sort_order, 0) ASC, created_at DESC, id DESC');
    $stmt->execute([$monitorId]);
    $rules = $stmt->fetchAll(PDO::FETCH_ASSOC);
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
    return $rulesOut;
}

function monitorExportBuildEntry(PDO $db, array $monitorRow, int $logLimit = MONITOR_EXPORT_LOG_LIMIT): array {
    $monitorId = (int)$monitorRow['id'];
    $monitor = monitorExportSanitizeMonitorRow($monitorRow);
    $monitor['allowed_user_ids'] = monitorExportFetchAllowedUserIds($db, $monitorId);

    $stmt = $db->prepare('SELECT * FROM monitor_logs WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT ' . (int)$logLimit);
    $stmt->execute([$monitorId]);
    $monitorLogs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $stmt = $db->prepare('SELECT * FROM monitor_notification_logs WHERE monitor_id = ? ORDER BY sent_at DESC LIMIT ' . (int)$logLimit);
    $stmt->execute([$monitorId]);
    $emailLogs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    return [
        'monitor' => $monitor,
        'monitor_logs' => $monitorLogs,
        'notification_rules' => monitorExportFetchRules($db, $monitorId),
        'email_logs' => $emailLogs,
    ];
}

function monitorExportNotificationSettings(): array {
    return [
        'timezone' => (string)getSetting('monitor_notification_timezone', ''),
        'dst_correction' => getSetting('monitor_notification_dst_correction', '1') === '1',
    ];
}

function monitorImportMonitorRowValues(array $m, int $now): array {
    $warningThreshold = isset($m['warning_threshold']) ? (int)$m['warning_threshold'] : 1;
    if (($m['type'] ?? '') === 'ssl') {
        $warningThreshold = 1;
    }
    if ($warningThreshold < 1) {
        $warningThreshold = 1;
    }
    if ($warningThreshold > 20) {
        $warningThreshold = 20;
    }

    $timeout = null;
    if (isset($m['timeout']) && $m['timeout'] !== '' && $m['timeout'] !== null) {
        $timeout = (int)$m['timeout'];
        if ($timeout < 1) {
            $timeout = 1;
        }
        if ($timeout > 60) {
            $timeout = 60;
        }
    }

    $permissionsMode = isset($m['permissions_mode']) ? (int)$m['permissions_mode'] : 0;
    if (!empty($m['allowed_user_ids']) && is_array($m['allowed_user_ids'])) {
        $permissionsMode = 1;
    }

    return [
        $m['name'],
        $m['type'],
        $m['target'],
        isset($m['port']) ? (int)$m['port'] : null,
        $m['keyword'] ?? null,
        normalizeMonitorInterval((string)($m['type'] ?? ''), $m['interval'] ?? (($m['type'] ?? '') === 'ssl' ? 1440 : 5), ($m['type'] ?? '') === 'ssl' ? 1440 : 5),
        $warningThreshold,
        isset($m['consecutive_failures']) ? (int)$m['consecutive_failures'] : 0,
        $timeout,
        $permissionsMode,
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
        normalizeMonitorTabName((string)($m['type'] ?? ''), $m['tab_name'] ?? ''),
        $m['group_name'] ?? null,
        isset($m['maintenance_start']) ? (int)$m['maintenance_start'] : null,
        isset($m['maintenance_end']) ? (int)$m['maintenance_end'] : null,
    ];
}

function monitorImportRestorePermissions(PDO $db, int $monitorId, array $m, int $now): void {
    $allowedUserIds = $m['allowed_user_ids'] ?? [];
    if (!is_array($allowedUserIds)) {
        return;
    }

    $permissionsMode = isset($m['permissions_mode']) ? (int)$m['permissions_mode'] : 0;
    if (!empty($allowedUserIds)) {
        $permissionsMode = 1;
    }
    if ($permissionsMode !== 1 || empty($allowedUserIds)) {
        return;
    }

    $permStmt = $db->prepare('INSERT OR REPLACE INTO user_monitor_permissions (user_id, monitor_id, can_view, created_at, updated_at) VALUES (?, ?, 1, ?, ?)');
    foreach ($allowedUserIds as $uid) {
        $uid = (int)$uid;
        if ($uid > 0) {
            $permStmt->execute([$uid, $monitorId, $now, $now]);
        }
    }
}

function handleExportMonitor($id) {
    requireAdmin(); // export is admin-only
    $db = getDB();
    $now = time();
    $monitorId = (int)$id;

    $stmt = $db->prepare('SELECT * FROM monitors WHERE id = ?');
    $stmt->execute([$monitorId]);
    $monitor = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$monitor) {
        sendJSON(['error' => 'Monitor not found'], 404);
        return;
    }

    $entry = monitorExportBuildEntry($db, $monitor);

    sendJSON([
        'success' => true,
        'type' => 'single_monitor',
        'bundle_version' => 2,
        'exported_at' => $now,
        'monitor' => $entry['monitor'],
        'monitor_logs' => $entry['monitor_logs'],
        'notification_rules' => $entry['notification_rules'],
        'email_logs' => $entry['email_logs'],
    ]);
}

function handleExportMonitorsBundle() {
    requireAdmin(); // export is admin-only
    $db = getDB();
    $now = time();

    $stmt = $db->prepare('SELECT * FROM monitors ORDER BY created_at DESC');
    $stmt->execute();
    $monitors = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $bundleMonitors = [];
    foreach ($monitors as $m) {
        $bundleMonitors[] = monitorExportBuildEntry($db, $m);
    }

    sendJSON([
        'success' => true,
        'bundle_version' => 2,
        'exported_at' => $now,
        'notification_settings' => monitorExportNotificationSettings(),
        'monitors' => $bundleMonitors,
    ]);
}

function handleImportMonitorsBundle() {
    requireAdmin(); // import is admin-only
    $data = getJSONInput();
    
    // Check if this is a single monitor import or a bundle
    $isSingleMonitor = isset($data['type']) && $data['type'] === 'single_monitor';
    
    if ($isSingleMonitor) {
        // Single monitor import - don't replace, just add
        if (!isset($data['monitor'])) {
            sendJSON(['error' => 'Invalid single monitor format: monitor object required'], 400);
            return;
        }
        $replace = false;
        $bundleMonitors = [[
            'monitor' => $data['monitor'],
            'monitor_logs' => $data['monitor_logs'] ?? [],
            'notification_rules' => $data['notification_rules'] ?? [],
            'email_logs' => $data['email_logs'] ?? [],
        ]];
    } else {
        // Bundle import
        if (!isset($data['monitors']) || !is_array($data['monitors'])) {
            sendJSON(['error' => 'Invalid bundle format: monitors array required'], 400);
            return;
        }
        $replace = isset($data['replace']) ? (bool)$data['replace'] : true;
        $bundleMonitors = $data['monitors'];
    }

    $db = getDB();
    try {
        $db->beginTransaction();

        if ($replace) {
            // Clear related tables (bundle import is intended to restore full monitoring state)
            $db->exec('DELETE FROM monitor_notification_recipients');
            $db->exec('DELETE FROM monitor_notification_rules');
            $db->exec('DELETE FROM monitor_notification_logs');
            $db->exec('DELETE FROM monitor_logs');
            $db->exec('DELETE FROM user_monitor_permissions');
            $db->exec('DELETE FROM monitors');

            if (isset($data['notification_settings']) && is_array($data['notification_settings'])) {
                $ns = $data['notification_settings'];
                $tz = isset($ns['timezone']) ? trim((string)$ns['timezone']) : '';
                $dst = array_key_exists('dst_correction', $ns) ? (bool)$ns['dst_correction'] : null;
                if ($tz !== '') {
                    setMonitorNotificationTimezone($tz, $dst);
                } elseif ($dst !== null) {
                    setSetting('monitor_notification_dst_correction', $dst ? '1' : '0');
                }
            }
        }

        // Prepared statements
        $stmtInsertMonitor = $db->prepare('INSERT INTO monitors (
            id, name, type, target, port, keyword, interval,
            warning_threshold, consecutive_failures, timeout, permissions_mode,
            is_active, email_notification,
            last_notified_status, legacy_notify_pending,
            legacy_email_disabled,
            legacy_email_to, legacy_email_cc, legacy_email_from_name, legacy_email_from_email,
            legacy_email_subject_template, legacy_email_body_template,
            last_checked_at, last_status, last_response_time,
            created_at, updated_at, tab_name, group_name, maintenance_start, maintenance_end
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

        $stmtInsertMonitorAutoId = $db->prepare('INSERT INTO monitors (
            name, type, target, port, keyword, interval,
            warning_threshold, consecutive_failures, timeout, permissions_mode,
            is_active, email_notification,
            last_notified_status, legacy_notify_pending,
            legacy_email_disabled,
            legacy_email_to, legacy_email_cc, legacy_email_from_name, legacy_email_from_email,
            legacy_email_subject_template, legacy_email_body_template,
            last_checked_at, last_status, last_response_time,
            created_at, updated_at, tab_name, group_name, maintenance_start, maintenance_end
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

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

            // For single monitor imports, always generate new IDs (don't use original IDs)
            $monitorId = ($isSingleMonitor || !isset($m['id'])) ? null : (int)$m['id'];
            if ($monitorId === null) {
                $stmtInsertMonitorAutoId->execute(monitorImportMonitorRowValues($m, $now));
                $monitorId = (int)$db->lastInsertId();
            } else {
                $stmtInsertMonitor->execute(array_merge([$monitorId], monitorImportMonitorRowValues($m, $now)));
            }

            monitorImportRestorePermissions($db, $monitorId, $m, $now);

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
                    
                    // For single monitor imports, always generate new IDs
                    $ruleId = ($isSingleMonitor || !isset($r['id'])) ? null : (int)$r['id'];
                    
                    $cc = $r['cc'] ?? [];
                    $ccStr = (is_array($cc) && !empty($cc)) ? implode(',', array_map('trim', $cc)) : ($r['cc_emails'] ?? null);

                    if ($ruleId === null) {
                        // Let database auto-generate ID
                        $stmt = $db->prepare('INSERT INTO monitor_notification_rules (
                            monitor_id, name, sort_order, status_trigger, time_window_start, time_window_end, days_of_week,
                            subject_template, body_template, from_name, from_email, cc_emails, is_enabled, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                        
                        $stmt->execute([
                            $monitorId,
                            $r['name'] ?? 'Notification Rule',
                            isset($r['sort_order']) ? (int)$r['sort_order'] : 0,
                            $r['status_trigger'],
                            $r['time_window_start'] ?? null,
                            $r['time_window_end'] ?? null,
                            $r['days_of_week'] ?? null,
                            $r['subject_template'] ?? '[{app_name} Monitor] {monitor_name} Status: {status}',
                            $r['body_template'] ?? "Monitor: {monitor_name}\nStatus: {status}\nTime: {time}\nDetails: {details}",
                            $r['from_name'] ?? null,
                            $r['from_email'] ?? null,
                            $ccStr,
                            isset($r['is_enabled']) ? (int)$r['is_enabled'] : 1,
                            isset($r['created_at']) ? (int)$r['created_at'] : $now,
                            isset($r['updated_at']) ? (int)$r['updated_at'] : $now
                        ]);
                        
                        $ruleId = (int)$db->lastInsertId();
                    } else {
                        // Use provided ID (bundle import with replace)
                        $stmtInsertRule->execute([
                            $ruleId,
                            $monitorId,
                            $r['name'] ?? 'Notification Rule',
                            isset($r['sort_order']) ? (int)$r['sort_order'] : 0,
                            $r['status_trigger'],
                            $r['time_window_start'] ?? null,
                            $r['time_window_end'] ?? null,
                            $r['days_of_week'] ?? null,
                            $r['subject_template'] ?? '[{app_name} Monitor] {monitor_name} Status: {status}',
                            $r['body_template'] ?? "Monitor: {monitor_name}\nStatus: {status}\nTime: {time}\nDetails: {details}",
                            $r['from_name'] ?? null,
                            $r['from_email'] ?? null,
                            $ccStr,
                            isset($r['is_enabled']) ? (int)$r['is_enabled'] : 1,
                            isset($r['created_at']) ? (int)$r['created_at'] : $now,
                            isset($r['updated_at']) ? (int)$r['updated_at'] : $now
                        ]);
                    }

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
        $importedCount = count($bundleMonitors);
        logMonitorAudit('monitor.imported', [
            'count' => $importedCount,
            'replace' => !empty($replace),
            'single' => !empty($isSingleMonitor),
        ]);
        sendJSON(['success' => true, 'count' => $importedCount]);
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
                (SELECT GROUP_CONCAT(user_id) FROM user_monitor_permissions ump WHERE ump.monitor_id = m.id AND COALESCE(ump.can_view, 0) = 1) AS allowed_user_ids_csv,
                (SELECT details FROM monitor_logs ml WHERE ml.monitor_id = m.id ORDER BY ml.checked_at DESC LIMIT 1) AS last_details
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
                ), 0) AS email_rules_count,
                (SELECT details FROM monitor_logs ml WHERE ml.monitor_id = m.id ORDER BY ml.checked_at DESC LIMIT 1) AS last_details
            FROM monitors m
            LEFT JOIN user_monitor_permissions ump
              ON ump.monitor_id = m.id AND ump.user_id = ?
            WHERE COALESCE(ump.can_view, 0) = 1
            ORDER BY m.created_at DESC
        ');
        $stmt->execute([(int)$user['id']]);
    }
    $monitors = $stmt->fetchAll();

    // Fetch history for sparklines (last 24h)
    $stmtHistory = $db->prepare('SELECT status, response_time, checked_at FROM monitor_logs WHERE monitor_id = ? AND checked_at >= ? ORDER BY checked_at DESC LIMIT 72');
    $oneDayAgo = time() - 86400;

    foreach ($monitors as &$m) {
        $stmtHistory->execute([(int)$m['id'], $oneDayAgo]);
        $rows = $stmtHistory->fetchAll(PDO::FETCH_ASSOC);
        
        // Downsample to max ~72 points (approx 1 per 20 mins if 1440 pts) to keep payload light
        $count = count($rows);
        $maxPoints = 72;
        $history = [];
        
        if ($count <= $maxPoints) {
            $history = $rows;
        } else {
            $step = $count / $maxPoints;
            for ($i = 0; $i < $maxPoints; $i++) {
                $index = (int)($i * $step);
                if (isset($rows[$index])) {
                    $history[] = $rows[$index];
                }
            }
        }
        
        // Ensure numeric types for JSON and chronological order (Oldest -> Newest)
        $m['history'] = array_map(function($h) {
            $h['response_time'] = (int)$h['response_time'];
            $h['checked_at'] = (int)$h['checked_at'];
            return $h;
        }, array_reverse($history));
    }
    unset($m);

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

    $pendingIds = monitorCheckJobsGetPendingMonitorIds($db);
    $pendingLookup = array_fill_keys($pendingIds, true);
    foreach ($monitors as &$m) {
        $m['check_pending'] = !empty($pendingLookup[(int)$m['id']]) ? 1 : 0;
    }
    unset($m);
    
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

    $stmt = $db->prepare('SELECT details FROM monitor_logs WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT 1');
    $stmt->execute([(int)$monitor['id']]);
    $monitor['last_details'] = $stmt->fetchColumn() ?: null;

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

    $db = getDB();
    try {
        $db->beginTransaction();
        $result = insertMonitorFromPayload($db, $data);
        if (isset($result['error'])) {
            $db->rollBack();
            sendJSON(['error' => $result['error']], 400);
            return;
        }
        $db->commit();
        logMonitorAudit('monitor.created', monitorAuditIdentity($result['monitor'] ?? null));
        sendJSON(['success' => true, 'monitor' => $result['monitor']]);
    } catch (PDOException $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

/**
 * Insert one monitor row. Returns ['monitor' => ...] or ['error' => string].
 */
function insertMonitorFromPayload(PDO $db, array $data): array {
    if (empty($data['name']) || empty($data['type']) || empty($data['target'])) {
        return ['error' => 'Name, type, and target are required'];
    }

    if (!validateMonitorType($data['type'])) {
        return ['error' => 'Invalid type. Must be url, keyword, port, ping, ssl, dns, or json'];
    }

    $fieldErr = validateMonitorTypeFields($data);
    if ($fieldErr !== null) {
        return ['error' => $fieldErr];
    }

    $warningThreshold = isset($data['warning_threshold']) ? (int)$data['warning_threshold'] : 1;
    if (($data['type'] ?? '') === 'ssl') {
        $warningThreshold = 1;
    }
    if ($warningThreshold < 1) $warningThreshold = 1;
    if ($warningThreshold > 20) $warningThreshold = 20;

    $timeout = isset($data['timeout']) && $data['timeout'] !== '' ? (int)$data['timeout'] : null;
    if ($timeout !== null) {
        if ($timeout < 1) $timeout = 1;
        if ($timeout > 60) $timeout = 60;
    }

    $allowedUserIds = normalizeAllowedUserIds($data['allowed_user_ids'] ?? []);
    $permissionsMode = !empty($allowedUserIds) ? 1 : 0;

    $intervalDefault = ($data['type'] ?? '') === 'ssl' ? 1440 : 5;
    $interval = normalizeMonitorInterval((string)$data['type'], $data['interval'] ?? $intervalDefault, $intervalDefault);

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
        $interval,
        $warningThreshold,
        0,
        $timeout,
        $permissionsMode,
        isset($data['is_active']) ? (int)$data['is_active'] : 1,
        isset($data['email_notification']) ? (int)$data['email_notification'] : 0,
        $now,
        $now,
        normalizeMonitorTabName((string)$data['type'], $data['tab_name'] ?? ''),
        $data['group_name'] ?? null,
        isset($data['maintenance_start']) ? (int)$data['maintenance_start'] : null,
        isset($data['maintenance_end']) ? (int)$data['maintenance_end'] : null,
        (isset($data['email_notification']) && (int)$data['email_notification'] === 1) ? 1 : 0,
        isset($data['legacy_email_disabled']) ? (int)$data['legacy_email_disabled'] : 0,
        $data['legacy_email_to'] ?? null,
        $data['legacy_email_cc'] ?? null,
        $data['legacy_email_from_name'] ?? null,
        $data['legacy_email_from_email'] ?? null,
        $data['legacy_email_subject_template'] ?? null,
        $data['legacy_email_body_template'] ?? null
    ]);

    $id = (int)$db->lastInsertId();

    if ($permissionsMode === 1) {
        $permStmt = $db->prepare('INSERT INTO user_monitor_permissions (user_id, monitor_id, can_view, created_at, updated_at) VALUES (?, ?, 1, ?, ?)');
        foreach ($allowedUserIds as $uid) {
            $permStmt->execute([(int)$uid, $id, $now, $now]);
        }
    }

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
    $monitor = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($permissionsMode === 1) {
        $monitor['allowed_user_ids'] = $allowedUserIds;
    } else {
        $monitor['allowed_user_ids'] = [];
    }

    return ['monitor' => $monitor];
}

function handleBulkCreateMonitors(): void {
    requireAdmin();
    $data = getJSONInput();
    $monitors = $data['monitors'] ?? null;
    if (!is_array($monitors) || count($monitors) === 0) {
        sendJSON(['error' => 'monitors array is required'], 400);
        return;
    }
    if (count($monitors) > 100) {
        sendJSON(['error' => 'Maximum 100 monitors per batch'], 400);
        return;
    }

    $db = getDB();
    $created = [];
    $errors = [];

    try {
        $db->beginTransaction();
        foreach ($monitors as $index => $payload) {
            if (!is_array($payload)) {
                $errors[] = ['index' => $index, 'error' => 'Invalid monitor payload'];
                continue;
            }
            $result = insertMonitorFromPayload($db, $payload);
            if (isset($result['error'])) {
                $errors[] = [
                    'index' => $index,
                    'name' => $payload['name'] ?? null,
                    'target' => $payload['target'] ?? null,
                    'error' => $result['error'],
                ];
                continue;
            }
            $created[] = $result['monitor'];
        }
        $db->commit();
        if (count($created) > 0) {
            $summaries = [];
            foreach (array_slice($created, 0, 25) as $m) {
                $summaries[] = monitorAuditIdentity(is_array($m) ? $m : null);
            }
            logMonitorAudit('monitor.bulk_created', [
                'count' => count($created),
                'error_count' => count($errors),
                'monitors' => $summaries,
            ]);
        }
        sendJSON([
            'success' => true,
            'count' => count($created),
            'created' => $created,
            'errors' => $errors,
        ]);
    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJSON(['error' => 'Bulk create failed: ' . $e->getMessage()], 500);
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

        $dupDetails = monitorAuditIdentity($newMonitor);
        $dupDetails['source_monitor_id'] = (int)$id;
        $dupDetails['source_name'] = (string)($original['name'] ?? '');
        logMonitorAudit('monitor.duplicated', $dupDetails);
        
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
    $stmt = $db->prepare('SELECT * FROM monitors WHERE id = ?');
    $stmt->execute([$id]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);
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
                        sendJSON(['error' => 'Invalid type. Must be url, keyword, port, ping, ssl, dns, or json'], 400);
                        return;
                    }
                }
                if ($field === 'warning_threshold') {
                    $typeForWt = isset($data['type']) ? (string)$data['type'] : (string)($existing['type'] ?? 'url');
                    $v = $typeForWt === 'ssl' ? 1 : (int)$data[$field];
                    if ($v < 1) $v = 1;
                    if ($v > 20) $v = 20;
                    $fields[] = "$field = ?";
                    $values[] = $v;
                    continue;
                }
                if ($field === 'interval') {
                    $typeForInterval = isset($data['type']) ? (string)$data['type'] : (string)($existing['type'] ?? 'url');
                    $fields[] = "$field = ?";
                    $values[] = normalizeMonitorInterval($typeForInterval, $data[$field]);
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

                if ($field === 'tab_name') {
                    $typeForTab = isset($data['type']) ? (string)$data['type'] : (string)($existing['type'] ?? 'url');
                    $fields[] = "$field = ?";
                    $values[] = normalizeMonitorTabName($typeForTab, $data[$field]);
                    continue;
                }

                $fields[] = "$field = ?";
                $values[] = $data[$field];
            }
        }

        $typeAfter = isset($data['type']) ? (string)$data['type'] : (string)($existing['type'] ?? '');
        if ($typeAfter === 'ssl') {
            if (!isset($data['interval'])) {
                $fields[] = 'interval = ?';
                $values[] = normalizeMonitorInterval('ssl', $existing['interval'] ?? 1440);
            }
            if (!isset($data['warning_threshold'])) {
                $fields[] = 'warning_threshold = ?';
                $values[] = 1;
            }
            if (!isset($data['tab_name'])) {
                $fields[] = 'tab_name = ?';
                $values[] = 'SSL Certificates';
            }
        }

        // Validate type-specific fields when relevant fields are updated
        if (isset($data['type']) || isset($data['port']) || isset($data['keyword']) || isset($data['target'])) {
            $stmtFull = $db->prepare('SELECT * FROM monitors WHERE id = ?');
            $stmtFull->execute([(int)$id]);
            $fullExisting = $stmtFull->fetch(PDO::FETCH_ASSOC) ?: [];
            $merged = array_merge($fullExisting, $data);
            if (!empty($merged['type'])) {
                $fieldErr = validateMonitorTypeFields($merged);
                if ($fieldErr !== null) {
                    $db->rollBack();
                    sendJSON(['error' => $fieldErr], 400);
                    return;
                }
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

        $changedFields = [];
        foreach ($allowedFields as $field) {
            if (isset($data[$field])) {
                $changedFields[] = $field;
            }
        }
        if (isset($data['allowed_user_ids'])) {
            $changedFields[] = 'allowed_user_ids';
        }
        $updateDetails = monitorAuditIdentity($monitor);
        $updateDetails['changed_fields'] = array_values(array_unique($changedFields));
        logMonitorAudit('monitor.updated', $updateDetails);
        
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
    $stmt = $db->prepare('SELECT id, name, type, target, tab_name FROM monitors WHERE id = ?');
    $stmt->execute([$id]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$existing) {
        sendJSON(['error' => 'Monitor not found'], 404);
        return;
    }
    
    try {
        $stmt = $db->prepare('DELETE FROM monitors WHERE id = ?');
        $stmt->execute([$id]);

        logMonitorAudit('monitor.deleted', monitorAuditIdentity($existing, $id));
        
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
        $db = getDB();
        if (!$db) {
            throw new Exception("Failed to get database connection");
        }

        $user = getAuthUserFromGlobals();
        $input = getJSONInput();
        if (!is_array($input)) {
            $input = [];
        }

        $engine = strtolower(trim((string)($input['engine'] ?? $_GET['engine'] ?? 'php')));
        if (!in_array($engine, ['php', 'python'], true)) {
            $engine = 'php';
        }

        $forceNotifyRules = false;
        if (isset($input['force_notify_rules'])) {
            $v = strtolower(trim((string)$input['force_notify_rules']));
            $forceNotifyRules = in_array($v, ['1', 'true', 'yes', 'on'], true);
        } elseif (isset($_GET['force_notify_rules'])) {
            $v = strtolower(trim((string)$_GET['force_notify_rules']));
            $forceNotifyRules = in_array($v, ['1', 'true', 'yes', 'on'], true);
        }

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

        if ($engine === 'python') {
            monitorCheckJobsHandleEnqueueAll($user, $monitors, $forceNotifyRules);
            return;
        }

        $monitorCount = count($monitors);
        error_log("[MONITOR] Found $monitorCount active monitors (engine=php)");
        
        // Calculate time limit: allow for retry confirmation on failures (up to ~20s per monitor), min 60s, max 300s
        $timeLimit = max(60, min(300, $monitorCount * 20));
        set_time_limit($timeLimit);
        error_log("[MONITOR] Set time limit to $timeLimit seconds");
        
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
            'engine' => 'php',
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
        $count = (int)$db->query('SELECT COUNT(*) FROM monitors')->fetchColumn();
        $db->exec('DELETE FROM monitors');
        $db->exec('DELETE FROM monitor_logs'); // Also clear logs
        logMonitorAudit('monitor.deleted_all', ['count' => $count]);
        sendJSON(['success' => true]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
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
        $affected = (int)$stmt->rowCount();
        logMonitorAudit('monitor.tab_renamed', [
            'from' => (string)$data['old_name'],
            'to' => (string)$data['new_name'],
            'affected' => $affected,
        ]);
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
        $affected = (int)$stmt->rowCount();
        logMonitorAudit('monitor.group_renamed', [
            'tab_name' => (string)$data['tab_name'],
            'from' => (string)$data['old_name'],
            'to' => (string)$data['new_name'],
            'affected' => $affected,
        ]);
        sendJSON(['success' => true]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}
