<?php
/**
 * Web App Manifest — derived from branding settings (app_name + favicon).
 * No separate PWA icon uploads; reuses favicon when set.
 */
require_once __DIR__ . '/config.php';

header('Content-Type: application/manifest+json; charset=utf-8');
header('Cache-Control: no-cache, must-revalidate');

try {
    $db = getDB();
    $stmt = $db->query("SELECT key, value FROM settings WHERE key IN ('app_name', 'favicon', 'page_title')");
    $map = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $map[$row['key']] = $row['value'];
    }

    $name = trim($map['app_name'] ?? '') ?: trim($map['page_title'] ?? '') ?: 'App';
    $favicon = trim($map['favicon'] ?? '');

    $icons = [];
    if ($favicon !== '') {
        $lower = strtolower($favicon);
        $icons[] = [
            'src' => $favicon,
            'sizes' => 'any',
            'type' => (str_ends_with($lower, '.svg') ? 'image/svg+xml' : (str_ends_with($lower, '.ico') ? 'image/x-icon' : 'image/png')),
            'purpose' => 'any'
        ];
    }

    $startUrl = '/';
    // Detect subpath from SCRIPT_NAME e.g. /linknest/api/index.php
    $script = $_SERVER['SCRIPT_NAME'] ?? '';
    if (preg_match('#^(.+)/api/#', $script, $m)) {
        $startUrl = rtrim($m[1], '/') . '/';
    }

    echo json_encode([
        'name' => $name,
        'short_name' => function_exists('mb_substr') ? mb_substr($name, 0, 12) : substr($name, 0, 12),
        'display' => 'standalone',
        'start_url' => $startUrl,
        'background_color' => '#ffffff',
        'theme_color' => '#3b82f6',
        'icons' => $icons
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to build manifest']);
}
