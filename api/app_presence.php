<?php
/**
 * Live site presence (who is currently using the app).
 * GET    — return current counts (no heartbeat)
 * POST   — upsert this browser's heartbeat and return counts
 * DELETE — remove this browser from the live set
 *
 * Body (POST/DELETE): { visitorKey?: string, action?: "leave" }
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/app_presence_lib.php';

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
    error_log('app_presence getDB failed: ' . $e->getMessage());
    sendJSON(['error' => 'Failed to connect to database'], 500);
    exit;
}

ensureAppPresenceTable($db);

function readAppPresenceInput(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $input = json_decode($raw, true);
    return is_array($input) ? $input : [];
}

function resolveAppPresenceVisitorKey(array $input, $user): string
{
    $clientKey = isset($input['visitorKey']) ? normalizeAppPresenceVisitorKey((string)$input['visitorKey']) : '';
    if ($clientKey !== '') {
        return $clientKey;
    }

    if (!empty($user['id'])) {
        return 'u' . (int)$user['id'] . 'session';
    }

    if (session_status() === PHP_SESSION_NONE) {
        @session_start();
    }
    if (empty($_SESSION['guest_visitor_key'])) {
        $_SESSION['guest_visitor_key'] = bin2hex(random_bytes(16));
    }
    $sessionKey = normalizeAppPresenceVisitorKey((string)$_SESSION['guest_visitor_key']);
    return $sessionKey !== '' ? $sessionKey : bin2hex(random_bytes(16));
}

function sendAppPresenceCounts(PDO $db): void
{
    cleanupStaleAppPresence($db);
    $counts = countAppPresence($db);
    sendJSON([
        'count' => $counts['count'],
        'guests' => $counts['guests'],
        'signedIn' => $counts['signedIn'],
    ]);
}

$user = getAuthenticatedUser();
if (function_exists('linknestReleaseSessionLock')) {
    linknestReleaseSessionLock();
}

switch ($method) {
    case 'GET':
        sendAppPresenceCounts($db);
        break;

    case 'POST':
        $input = readAppPresenceInput();
        $action = isset($input['action']) ? strtolower(trim((string)$input['action'])) : '';
        $visitorKey = resolveAppPresenceVisitorKey($input, $user);

        if ($action === 'leave') {
            try {
                clearAppPresence($db, $visitorKey);
            } catch (Throwable $e) {
                error_log('Failed to clear app presence: ' . $e->getMessage());
            }
            sendAppPresenceCounts($db);
            break;
        }

        try {
            $userId = !empty($user['id']) ? (int)$user['id'] : null;
            upsertAppPresence($db, $visitorKey, $userId);
            sendAppPresenceCounts($db);
        } catch (Throwable $e) {
            error_log('Failed to update app presence: ' . $e->getMessage());
            sendJSON(['error' => 'Failed to update presence'], 500);
        }
        break;

    case 'DELETE':
        $input = readAppPresenceInput();
        $visitorKey = resolveAppPresenceVisitorKey($input, $user);
        try {
            clearAppPresence($db, $visitorKey);
        } catch (Throwable $e) {
            error_log('Failed to clear app presence: ' . $e->getMessage());
        }
        sendJSON(['success' => true]);
        break;

    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}
