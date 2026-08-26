<?php
/**
 * Public page visit counter.
 * GET  — return current count (no increment)
 * POST — increment once (session/visitor debounce handled client-side) and return count
 */
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';
$path = rtrim((string)$path, '/');
if ($path === '') {
    $path = '/';
}

if ($path !== '/' && $path !== '') {
    sendJSON(['error' => 'Invalid endpoint'], 404);
    exit;
}

try {
    $db = getDB();
} catch (Throwable $e) {
    error_log('page_visits getDB failed: ' . $e->getMessage());
    sendJSON(['error' => 'Failed to connect to database'], 500);
    exit;
}

function readPageVisitCount(PDO $db): int
{
    $stmt = $db->prepare('SELECT value FROM settings WHERE key = ?');
    $stmt->execute(['page_visit_count']);
    $value = $stmt->fetchColumn();
    if ($value === false || $value === null || $value === '') {
        return 0;
    }
    return max(0, (int)$value);
}

function incrementPageVisitCount(PDO $db): int
{
    $now = time();
    $db->beginTransaction();
    try {
        $stmt = $db->prepare('SELECT value FROM settings WHERE key = ?');
        $stmt->execute(['page_visit_count']);
        $value = $stmt->fetchColumn();
        $count = ($value === false || $value === null || $value === '') ? 0 : max(0, (int)$value);
        $count++;

        $upsert = $db->prepare(
            'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
        );
        $upsert->execute(['page_visit_count', (string)$count, $now]);
        $db->commit();
        return $count;
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }
}

switch ($method) {
    case 'GET':
        sendJSON(['count' => readPageVisitCount($db)]);
        break;

    case 'POST':
        try {
            $count = incrementPageVisitCount($db);
            sendJSON(['count' => $count, 'recorded' => true]);
        } catch (Throwable $e) {
            error_log('Failed to record page visit: ' . $e->getMessage());
            sendJSON(['error' => 'Failed to record visit'], 500);
        }
        break;

    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}
