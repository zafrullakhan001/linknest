<?php
/**
 * Web App Manifest — derived from branding settings (app_name + favicon).
 * No separate PWA icon uploads; reuses favicon when set.
 *
 * Chromium validates icon pixel dimensions against the `sizes` member.
 * `sizes: any` is only valid for SVG; using it with a 32×32 PNG logs
 * "Resource size is not correct - typo in the Manifest?".
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/image_helpers.php';

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
    $faviconDisk = '';
    $uploadsUrlPrefix = '/uploads/';
    if ($favicon !== '' && function_exists('getAppBasePath')) {
        $normalized = preg_replace('#^/[^/]+/uploads/#', '/uploads/', $favicon);
        if (is_string($normalized) && strpos($normalized, '/uploads/') === 0) {
            $filename = basename($normalized);
            $disk = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . $filename;
            if ($filename === '' || !is_file($disk)) {
                $favicon = '';
            } else {
                $base = getAppBasePath();
                $uploadsUrlPrefix = ($base !== '' ? $base : '') . '/uploads/';
                $favicon = ($base !== '' ? $base : '') . $normalized;
                $faviconDisk = $disk;
            }
        }
    }

    $icons = [];
    if ($favicon !== '') {
        $lower = strtolower($favicon);
        $isSvg = str_ends_with($lower, '.svg');
        $type = $isSvg ? 'image/svg+xml' : (str_ends_with($lower, '.ico') ? 'image/x-icon' : 'image/png');

        if ($isSvg) {
            $icons[] = [
                'src' => $favicon,
                'sizes' => 'any',
                'type' => 'image/svg+xml',
                'purpose' => 'any'
            ];
        } elseif ($faviconDisk !== '') {
            $pwaIcons = ensurePwaFaviconIconFiles($faviconDisk);
            foreach ($pwaIcons as $px => $pwaFile) {
                $icons[] = [
                    'src' => $uploadsUrlPrefix . $pwaFile,
                    'sizes' => $px . 'x' . $px,
                    'type' => 'image/png',
                    'purpose' => 'any'
                ];
            }
            if ($pwaIcons === []) {
                $width = 0;
                $height = 0;
                $info = @getimagesize($faviconDisk);
                if (is_array($info) && (int) $info[0] > 0 && (int) $info[1] > 0) {
                    $width = (int) $info[0];
                    $height = (int) $info[1];
                }
                if ($width > 0 && $height > 0) {
                    $icons[] = [
                        'src' => $favicon,
                        'sizes' => $width . 'x' . $height,
                        'type' => $type,
                        'purpose' => 'any'
                    ];
                }
            }
        }
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
