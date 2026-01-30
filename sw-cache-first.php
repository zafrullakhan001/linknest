<?php
/**
 * Serves the Semi-PWA service worker script with correct MIME type.
 * Injects admin-configured include/exclude paths from settings so the SW can bypass cache for real-time endpoints.
 */
$script = __DIR__ . '/public/sw-cache-first.js';
if (!is_file($script)) {
    $script = __DIR__ . '/dist/sw-cache-first.js';
}
if (!is_file($script)) {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Service worker script not found']);
    exit;
}

$excludedPaths = ['monitors', 'monitorv2'];
$includedPaths = [];
try {
    if (file_exists(__DIR__ . '/api/config.php')) {
        require_once __DIR__ . '/api/config.php';
        $db = getDB();
        $stmt = $db->prepare("SELECT value FROM settings WHERE key = ? LIMIT 1");
        $stmt->execute(['semi_pwa_exclude_paths']);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $val = $row ? trim((string) $row['value']) : '';
        if ($val !== '') {
            $excludedPaths = array_values(array_filter(array_map('trim', preg_split('/[\s,]+/', $val))));
        }
        $stmt->execute(['semi_pwa_include_paths']);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $val = $row ? trim((string) $row['value']) : '';
        if ($val !== '') {
            $includedPaths = array_values(array_filter(array_map('trim', preg_split('/[\s,]+/', $val))));
        }
    }
} catch (Throwable $e) {
    $excludedPaths = ['monitors', 'monitorv2'];
    $includedPaths = [];
}

$js = file_get_contents($script);
$js = str_replace('__EXCLUDED_PATHS__', json_encode($excludedPaths), $js);
$js = str_replace('__INCLUDED_PATHS__', json_encode($includedPaths), $js);

header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: no-cache, max-age=0');
header('Service-Worker-Allowed: /');
echo $js;
