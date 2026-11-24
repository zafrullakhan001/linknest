<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/user_audit_helper.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';
$path = rtrim((string)$path, '/');
if ($path === '') {
    $path = '/';
}

requireAdmin();

$db = getDB();
ensureUserAuditLogTable($db);

if ($method === 'POST' && ($path === '/purge' || $path === 'purge')) {
    handlePurgeUserAuditLog($db);
}

if ($method !== 'GET' || ($path !== '/' && $path !== '')) {
    sendJSON(['error' => 'Method not allowed'], 405);
}

$page = max(1, (int) ($_GET['page'] ?? 1));
$perPage = (int) ($_GET['per_page'] ?? 50);
if ($perPage < 1) {
    $perPage = 50;
}
if ($perPage > 200) {
    $perPage = 200;
}

$action = trim((string) ($_GET['action'] ?? ''));
$actionPrefix = trim((string) ($_GET['action_prefix'] ?? ''));
$q = trim((string) ($_GET['q'] ?? ''));
$targetUserId = (int) ($_GET['target_user_id'] ?? 0);
$actorId = (int) ($_GET['actor_id'] ?? 0);

$where = [];
$params = [];

if ($action !== '') {
    $where[] = 'action = ?';
    $params[] = $action;
} elseif ($actionPrefix !== '') {
    // e.g. action_prefix=monitor. → action LIKE 'monitor.%'
    $prefix = rtrim($actionPrefix, '%');
    if (substr($prefix, -1) !== '.') {
        $prefix .= '.';
    }
    $where[] = 'action LIKE ?';
    $params[] = $prefix . '%';
}
if ($targetUserId > 0) {
    $where[] = 'target_user_id = ?';
    $params[] = $targetUserId;
}
if ($actorId > 0) {
    $where[] = 'actor_id = ?';
    $params[] = $actorId;
}
if ($q !== '') {
    $like = '%' . $q . '%';
    $where[] = '(actor_username LIKE ? OR target_username LIKE ? OR action LIKE ? OR details LIKE ? OR ip_address LIKE ?)';
    array_push($params, $like, $like, $like, $like, $like);
}

$whereSql = empty($where) ? '' : ('WHERE ' . implode(' AND ', $where));

$countStmt = $db->prepare("SELECT COUNT(*) FROM user_audit_log $whereSql");
$countStmt->execute($params);
$total = (int) $countStmt->fetchColumn();

$offset = ($page - 1) * $perPage;
$listSql = "SELECT id, created_at, actor_id, actor_username, action, target_user_id, target_username, details, ip_address
    FROM user_audit_log $whereSql
    ORDER BY created_at DESC, id DESC
    LIMIT " . (int) $perPage . ' OFFSET ' . (int) $offset;
$listStmt = $db->prepare($listSql);
$listStmt->execute($params);
$rows = $listStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

$logs = [];
foreach ($rows as $row) {
    $details = $row['details'];
    $parsed = null;
    if (is_string($details) && $details !== '') {
        $decoded = json_decode($details, true);
        $parsed = json_last_error() === JSON_ERROR_NONE ? $decoded : $details;
    }
    $logs[] = [
        'id' => (int) $row['id'],
        'created_at' => (int) $row['created_at'],
        'actor_id' => $row['actor_id'] !== null ? (int) $row['actor_id'] : null,
        'actor_username' => $row['actor_username'],
        'action' => $row['action'],
        'target_user_id' => $row['target_user_id'] !== null ? (int) $row['target_user_id'] : null,
        'target_username' => $row['target_username'],
        'details' => $parsed,
        'ip_address' => $row['ip_address'],
    ];
}

if ($actionPrefix !== '') {
    $prefix = rtrim($actionPrefix, '%');
    if (substr($prefix, -1) !== '.') {
        $prefix .= '.';
    }
    $actionStmt = $db->prepare('SELECT DISTINCT action FROM user_audit_log WHERE action LIKE ? ORDER BY action');
    $actionStmt->execute([$prefix . '%']);
    $actionRows = $actionStmt->fetchAll(PDO::FETCH_COLUMN);
} else {
    $actionRows = $db->query('SELECT DISTINCT action FROM user_audit_log ORDER BY action')->fetchAll(PDO::FETCH_COLUMN);
}

sendJSON([
    'logs' => $logs,
    'total' => $total,
    'page' => $page,
    'per_page' => $perPage,
    'actions' => $actionRows ?: [],
]);

/**
 * Normalize action_prefix to 'foo.' or empty. Only known prefixes are allowed.
 */
function normalizeAuditPurgeActionPrefix(string $raw): string
{
    $prefix = trim($raw);
    if ($prefix === '') {
        return '';
    }
    $prefix = rtrim($prefix, '%');
    if (substr($prefix, -1) !== '.') {
        $prefix .= '.';
    }
    $allowed = ['monitor.'];
    if (!in_array($prefix, $allowed, true)) {
        sendJSON(['error' => 'Unsupported action_prefix for purge'], 400);
    }
    return $prefix;
}

/**
 * Delete audit rows (all, or older than N days, optionally scoped by action_prefix), then record a purge event.
 */
function handlePurgeUserAuditLog(PDO $db): void
{
    $data = [];
    try {
        $data = getJSONInput();
        if (!is_array($data)) {
            $data = [];
        }
    } catch (Throwable $e) {
        $data = [];
    }

    $olderThanDays = isset($data['older_than_days']) ? (int)$data['older_than_days'] : 0;
    if ($olderThanDays < 0) {
        sendJSON(['error' => 'older_than_days must be 0 or greater'], 400);
    }

    $actionPrefix = normalizeAuditPurgeActionPrefix((string) ($data['action_prefix'] ?? ''));
    $likePrefix = $actionPrefix !== '' ? ($actionPrefix . '%') : '';

    try {
        $db->beginTransaction();

        if ($olderThanDays > 0) {
            $cutoff = time() - ($olderThanDays * 86400);
            if ($likePrefix !== '') {
                $countStmt = $db->prepare('SELECT COUNT(*) FROM user_audit_log WHERE action LIKE ? AND created_at < ?');
                $countStmt->execute([$likePrefix, $cutoff]);
                $deletedCount = (int)$countStmt->fetchColumn();
                $delStmt = $db->prepare('DELETE FROM user_audit_log WHERE action LIKE ? AND created_at < ?');
                $delStmt->execute([$likePrefix, $cutoff]);
            } else {
                $countStmt = $db->prepare('SELECT COUNT(*) FROM user_audit_log WHERE created_at < ?');
                $countStmt->execute([$cutoff]);
                $deletedCount = (int)$countStmt->fetchColumn();
                $delStmt = $db->prepare('DELETE FROM user_audit_log WHERE created_at < ?');
                $delStmt->execute([$cutoff]);
            }
        } elseif ($likePrefix !== '') {
            $countStmt = $db->prepare('SELECT COUNT(*) FROM user_audit_log WHERE action LIKE ?');
            $countStmt->execute([$likePrefix]);
            $deletedCount = (int)$countStmt->fetchColumn();
            $delStmt = $db->prepare('DELETE FROM user_audit_log WHERE action LIKE ?');
            $delStmt->execute([$likePrefix]);
        } else {
            $deletedCount = (int)$db->query('SELECT COUNT(*) FROM user_audit_log')->fetchColumn();
            $db->exec('DELETE FROM user_audit_log');
        }

        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('user audit purge failed: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to purge audit log'], 500);
    }

    $details = [
        'deleted_count' => $deletedCount,
        'scope' => $olderThanDays > 0 ? 'older_than_days' : 'all',
    ];
    if ($olderThanDays > 0) {
        $details['older_than_days'] = $olderThanDays;
    }
    if ($actionPrefix !== '') {
        $details['action_prefix'] = $actionPrefix;
    }

    // Written after delete so this event remains as proof of the purge.
    $purgeAction = $actionPrefix !== '' ? ($actionPrefix . 'audit_purged') : 'audit.purged';
    logUserAudit($purgeAction, ['details' => $details]);

    sendJSON([
        'success' => true,
        'deleted_count' => $deletedCount,
        'older_than_days' => $olderThanDays > 0 ? $olderThanDays : null,
        'action_prefix' => $actionPrefix !== '' ? $actionPrefix : null,
    ]);
}
