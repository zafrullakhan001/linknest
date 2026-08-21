<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/short_urls_lib.php';

if (session_status() === PHP_SESSION_NONE) {
    @session_start();
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';
$path = rtrim($path, '/');
if ($path === '') {
    $path = '/';
}

if ($method === 'POST' && ($path === '/recycle' || $path === 'recycle')) {
    handleRecycleShortUrl();
} elseif ($method === 'GET' && ($path === '/rotation' || $path === 'rotation')) {
    handleShortUrlRotationOverview();
} elseif ($method === 'POST' && ($path === '/rotate-all' || $path === 'rotate-all')) {
    handleRotateAllShortUrls();
} else {
    sendJSON(['error' => 'Invalid endpoint'], 404);
}

function handleRecycleShortUrl(): void {
    $user = requireAuth();
    $data = getJSONInput();
    $targetType = strtolower(trim((string)($data['targetType'] ?? $data['target_type'] ?? '')));
    $targetId = trim((string)($data['targetId'] ?? $data['target_id'] ?? ''));
    if (!isValidShortUrlTargetType($targetType) || $targetId === '') {
        sendJSON(['error' => 'targetType and targetId are required'], 400);
        return;
    }

    $db = getDB();
    $tileId = resolveShortUrlTargetOwnerTileId($db, $targetType, $targetId);
    if (!$tileId) {
        sendJSON(['error' => 'Not found'], 404);
        return;
    }
    if (!canUserEditTile($user['id'], $tileId, $db)) {
        sendJSON(['error' => 'You do not have permission to recycle this short URL'], 403);
        return;
    }

    try {
        $code = recycleShortUrl($db, $targetType, $targetId, $tileId, $user['id'] ?? null);
        sendJSON([
            'code' => $code,
            'shortUrl' => shortUrlForCode($code),
            'targetType' => $targetType,
            'targetId' => $targetId,
        ]);
    } catch (Throwable $e) {
        error_log('handleRecycleShortUrl: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to recycle short URL'], 500);
    }
}

function handleShortUrlRotationOverview(): void {
    requireAdmin();
    $db = getDB();
    $page = max(1, (int)($_GET['page'] ?? 1));
    $perPage = (int)($_GET['per_page'] ?? $_GET['perPage'] ?? 25);
    $listed = listShortUrlRotationLogs($db, $page, $perPage);
    sendJSON([
        'stats' => getShortUrlRotationStats($db),
        'logs' => $listed['logs'],
        'total' => $listed['total'],
        'page' => $listed['page'],
        'perPage' => $listed['perPage'],
    ]);
}

function handleRotateAllShortUrls(): void {
    $user = requireAdmin();
    $db = getDB();
    try {
        $result = rotateAllActiveShortUrls($db, $user);
        $payload = [
            'run' => $result['run'],
            'rotatedCount' => $result['rotatedCount'],
            'stats' => getShortUrlRotationStats($db),
        ];
        if (($result['run']['status'] ?? '') === 'failed') {
            sendJSON([
                'error' => $result['run']['errorMessage'] ?: 'Failed to rotate short URLs',
            ] + $payload, 500);
            return;
        }
        sendJSON($payload);
    } catch (Throwable $e) {
        error_log('handleRotateAllShortUrls: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to rotate short URLs'], 500);
    }
}
