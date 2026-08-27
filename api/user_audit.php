<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/user_audit_helper.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

if ($method !== 'GET') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

requireAdmin();

$db = getDB();
ensureUserAuditLogTable($db);

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
