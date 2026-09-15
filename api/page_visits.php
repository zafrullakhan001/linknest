<?php
/**
 * Public page visit counter.
 * GET  — return current count (no increment)
 * POST — increment once (session/visitor debounce handled client-side) and return count
 *
 * Lifetime total is stored in settings.page_visit_count (64-bit safe for millions+).
 * Daily series is stored in page_visit_daily for admin charts (retained ~3 years).
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/visit_analytics_lib.php';

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

switch ($method) {
    case 'GET':
        sendJSON(['count' => readPageVisitCount($db)]);
        break;

    case 'POST':
        try {
            $count = incrementDurablePageVisit($db);
            sendJSON(['count' => $count, 'recorded' => true]);
        } catch (Throwable $e) {
            error_log('Failed to record page visit: ' . $e->getMessage());
            sendJSON(['error' => 'Failed to record visit'], 500);
        }
        break;

    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}
