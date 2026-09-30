<?php
/**
 * Underlying-software (runtime) status API — READ-ONLY, admin only.
 *
 * GET  /api/runtime/status                    current versions + available patches + commands
 * POST /api/runtime/check                     same payload, bypassing the vendor cache
 * GET  /api/runtime/instructions?component=   one component's copy-paste commands
 * GET  /api/runtime/report[?format=md|json]   downloadable diagnostics report
 *
 * This endpoint never installs, replaces or restarts anything. See
 * docs/RUNTIME_UPDATES.md.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/runtime_lib.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$AUTH_USER = requireAdmin();

if (!headers_sent()) {
    header('Cache-Control: no-store, no-cache, must-revalidate');
}

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '/';
$path = rtrim((string)$path, '/') ?: '/';

try {
    if ($method === 'GET' && ($path === '/' || $path === '/status')) {
        sendJSON(['data' => runtimeBuildStatusPayload(false)]);
    }

    if ($method === 'POST' && $path === '/check') {
        sendJSON(['data' => runtimeBuildStatusPayload(true)]);
    }

    if ($method === 'GET' && $path === '/instructions') {
        $component = isset($_GET['component']) ? strtolower(trim((string)$_GET['component'])) : '';
        if (!in_array($component, ['php', 'node', 'npm', 'apache', 'sqlite'], true)) {
            sendJSON(['error' => 'component must be one of: php, node, npm, apache, sqlite'], 400);
            exit;
        }

        // Reuse the cached payload so the commands match what the panel shows.
        $payload = runtimeBuildStatusPayload(false);
        $componentData = $payload['components'][$component === 'npm' ? 'node' : $component] ?? null;
        if ($componentData === null || !is_array($componentData['instructions'] ?? null)) {
            sendJSON(['error' => 'No instructions available for ' . $component], 404);
            exit;
        }
        sendJSON([
            'data' => $componentData['instructions'] + [
                'host' => $payload['host'],
                'layout' => $payload['layout'],
                'platform' => $payload['platform'] ?? null,
            ],
        ]);
    }

    if ($method === 'GET' && $path === '/report') {
        $format = isset($_GET['format']) ? strtolower(trim((string)$_GET['format'])) : 'md';
        $payload = runtimeBuildStatusPayload(false);
        if ($format === 'json') {
            $filename = 'linknest-runtime-' . date('Ymd-His') . '.json';
            header('Content-Type: application/json; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            exit;
        }
        $filename = 'linknest-runtime-' . date('Ymd-His') . '.md';
        header('Content-Type: text/markdown; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        echo runtimeBuildMarkdownReport($payload);
        exit;
    }

    sendJSON(['error' => 'Invalid endpoint'], 404);
} catch (Throwable $e) {
    error_log('runtime API: ' . $e->getMessage());
    sendJSON(['error' => $e->getMessage()], 500);
}
