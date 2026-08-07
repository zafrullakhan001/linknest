<?php
/**
 * Print branding for load-test report generation.
 *
 * Default (plain text): app_name only — backwards compatible with older callers.
 * With --json: {"appName":"...","favicon":"/linknest/uploads/..."}
 */
$dbPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'linknest.db';
$appName = 'Application';
$favicon = '';

$wantJson = in_array('--json', $argv ?? [], true)
    || (isset($_SERVER['argv']) && in_array('--json', $_SERVER['argv'], true));

try {
    if (is_file($dbPath)) {
        $db = new PDO('sqlite:' . $dbPath);
        $stmt = $db->query("SELECT key, value FROM settings WHERE key IN ('app_name', 'favicon')");
        if ($stmt) {
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $key = (string)($row['key'] ?? '');
                $val = trim((string)($row['value'] ?? ''));
                if ($key === 'app_name' && $val !== '') {
                    $appName = $val;
                }
                if ($key === 'favicon' && $val !== '') {
                    $favicon = $val;
                }
            }
        }
    }
} catch (Throwable $e) {
    // fall through to defaults
}

// Normalize relative favicon to include deployment base path when possible
if ($favicon !== '' && !preg_match('#^https?://#i', $favicon)) {
    $basePath = '';
    // Guess from common env / sibling vite paths; default /linknest for this project
    $envBase = getenv('VITE_BASE_PATH') ?: getenv('BASE_PATH') ?: '';
    if (is_string($envBase) && $envBase !== '') {
        $basePath = '/' . trim(str_replace('\\', '/', $envBase), '/');
        if ($basePath === '/') {
            $basePath = '';
        }
    } else {
        $basePath = '/linknest';
    }
    $favicon = preg_replace('#^/[^/]+/uploads/#', '/uploads/', $favicon);
    if (strpos($favicon, '/') !== 0) {
        $favicon = '/' . $favicon;
    }
    if ($basePath !== '' && strpos($favicon, '/uploads/') === 0) {
        $favicon = $basePath . $favicon;
    }
}

if ($wantJson) {
    header_remove();
    echo json_encode([
        'appName' => $appName,
        'favicon' => $favicon,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit(0);
}

echo $appName;
