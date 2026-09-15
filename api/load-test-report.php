<?php
/**
 * Load test report API (admin only)
 *
 * GET /api/load-test-report          → HTML report
 * GET /api/load-test-report?meta=1   → JSON metadata (test run date, branding, KPIs)
 */

require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$wantsMeta = isset($_GET['meta']) && ($_GET['meta'] === '1' || $_GET['meta'] === 'true');
$asset = isset($_GET['asset']) ? basename((string)$_GET['asset']) : '';

function loadTestReportDeny($wantsMeta, int $code, string $message, string $faviconUrl = ''): void {
    if ($wantsMeta) {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false, 'error' => $message]);
        exit;
    }
    http_response_code($code);
    header('Content-Type: text/html; charset=utf-8');
    $safe = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');
    $faviconTags = '';
    if ($faviconUrl !== '') {
        $safeFav = htmlspecialchars($faviconUrl, ENT_QUOTES, 'UTF-8');
        $faviconTags = '<link rel="icon" href="' . $safeFav . '"><link rel="shortcut icon" href="' . $safeFav . '">';
    }
    echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Load Test Report</title>' . $faviconTags . '</head>';
    echo '<body style="font-family:sans-serif;padding:2rem;background:#f3efe6;color:#1c2421">';
    echo '<h1>' . $safe . '</h1>';
    echo '<p>Sign in as an administrator, then open Admin → Load Test.</p>';
    echo '</body></html>';
    exit;
}

if (!isset($_SESSION['user_id'])) {
    loadTestReportDeny($wantsMeta, 401, 'Authentication required');
}

$db = getDB();
$stmt = $db->prepare('SELECT is_admin FROM users WHERE id = ?');
$stmt->execute([$_SESSION['user_id']]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$user || empty($user['is_admin'])) {
    loadTestReportDeny($wantsMeta, 403, 'Admin access required');
}

$resultsDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'load-tests' . DIRECTORY_SEPARATOR . 'results';
$vendorDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'load-tests' . DIRECTORY_SEPARATOR . 'vendor';
$reportFile = $resultsDir . DIRECTORY_SEPARATOR . 'report.html';
$metaFile = $resultsDir . DIRECTORY_SEPARATOR . 'meta.json';
$summaryFile = $resultsDir . DIRECTORY_SEPARATOR . 'last-summary.json';

// Same-origin Chart.js assets (CSP script-src 'self' — CDN/inline were blocked)
if ($asset !== '') {
    $allowed = [
        'chart.umd.min.js' => $vendorDir . DIRECTORY_SEPARATOR . 'chart.umd.min.js',
        'report-charts.js' => $resultsDir . DIRECTORY_SEPARATOR . 'report-charts.js',
    ];
    if (!isset($allowed[$asset]) || !is_file($allowed[$asset])) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Asset not found';
        exit;
    }
    header('Content-Type: application/javascript; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('X-Content-Type-Options: nosniff');
    readfile($allowed[$asset]);
    exit;
}

$appName = 'Application';
$favicon = '';
try {
    $brandStmt = $db->query("SELECT key, value FROM settings WHERE key IN ('app_name', 'favicon')");
    if ($brandStmt) {
        while ($row = $brandStmt->fetch(PDO::FETCH_ASSOC)) {
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
} catch (Throwable $e) {
    // keep defaults
}

// Normalize favicon like settings API (relative /uploads → /{base}/uploads)
if ($favicon !== '' && !preg_match('#^https?://#i', $favicon) && !str_starts_with($favicon, 'data:')) {
    $favicon = preg_replace('#^/[^/]+/uploads/#', '/uploads/', $favicon);
    if (strpos($favicon, '/') !== 0) {
        $favicon = '/' . $favicon;
    }
    // Prefer request base path when available
    $scriptName = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '');
    $baseFromRequest = '';
    if (preg_match('#^(.*?)/api/#', $scriptName, $m)) {
        $baseFromRequest = rtrim($m[1], '/');
    }
    if ($baseFromRequest !== '' && strpos($favicon, '/uploads/') === 0) {
        $favicon = $baseFromRequest . $favicon;
    } elseif (strpos($favicon, '/uploads/') === 0) {
        $appRoot = dirname(__DIR__);
        $folder = basename($appRoot);
        $skip = ['html', 'htdocs', 'www', 'public', 'api', 'uploads', 'dist'];
        if ($folder !== '' && !in_array(strtolower($folder), $skip, true)) {
            $favicon = '/' . $folder . $favicon;
        }
    }
}

/**
 * Inject (or replace) branded favicon link tags in an HTML document.
 */
function injectBrandedFavicon(string $html, string $faviconUrl): string {
    if ($faviconUrl === '') {
        return $html;
    }
    $lower = strtolower(explode('?', $faviconUrl, 2)[0]);
    $type = str_ends_with($lower, '.svg')
        ? 'image/svg+xml'
        : (str_ends_with($lower, '.ico') ? 'image/x-icon' : 'image/png');
    $safe = htmlspecialchars($faviconUrl, ENT_QUOTES, 'UTF-8');
    $tags = '<link rel="icon" href="' . $safe . '" type="' . $type . '">'
        . '<link rel="shortcut icon" href="' . $safe . '" type="' . $type . '">'
        . '<link rel="apple-touch-icon" href="' . $safe . '">';

    // Drop any existing icon links so branding wins
    $html = preg_replace('/<link[^>]+rel=["\'](?:shortcut )?icon["\'][^>]*>\s*/i', '', $html) ?? $html;
    $html = preg_replace('/<link[^>]+rel=["\']apple-touch-icon["\'][^>]*>\s*/i', '', $html) ?? $html;

    if (preg_match('/<title\b[^>]*>.*?<\/title>/is', $html)) {
        return preg_replace('/(<title\b[^>]*>.*?<\/title>)/is', '$1' . "\n" . $tags, $html, 1) ?? ($tags . $html);
    }
    if (preg_match('/<head\b[^>]*>/i', $html)) {
        return preg_replace('/(<head\b[^>]*>)/i', '$1' . "\n" . $tags, $html, 1) ?? ($tags . $html);
    }
    return $tags . $html;
}

if ($wantsMeta) {
    $meta = [
        'success' => true,
        'appName' => $appName,
        'favicon' => $favicon,
        'title' => $appName . ' Load Test Report',
        'available' => is_file($reportFile),
        'testedAt' => null,
        'testedAtDisplay' => null,
        'generatedAt' => null,
        'generatedAtDisplay' => null,
        'overallPass' => null,
        'passedCount' => null,
        'thresholdTotal' => null,
        'vus' => null,
        'duration' => null,
        'p95' => null,
        'homeP95' => null,
        'spaceP95' => null,
        'httpReqFailedRate' => null,
        'apiOkRate' => null,
        'httpReqs' => null,
    ];

    if (is_file($metaFile)) {
        $decoded = json_decode((string)file_get_contents($metaFile), true);
        if (is_array($decoded)) {
            $meta = array_merge($meta, $decoded);
            $meta['success'] = true;
            $meta['appName'] = $decoded['appName'] ?? $appName;
            // Always prefer live settings favicon for current branding
            $meta['favicon'] = $favicon !== '' ? $favicon : ($decoded['favicon'] ?? '');
            $meta['title'] = ($decoded['title'] ?? null) ?: ($meta['appName'] . ' Load Test Report');
            $meta['available'] = is_file($reportFile);
        }
    } elseif (is_file($summaryFile)) {
        $mtime = filemtime($summaryFile);
        $meta['testedAt'] = date('c', $mtime);
        $meta['testedAtDisplay'] = date('D, M j, Y g:i:s A T', $mtime);
        $meta['available'] = is_file($reportFile);
    }

    sendJSON($meta);
}

if (!is_file($reportFile)) {
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    $safeApp = htmlspecialchars($appName, ENT_QUOTES, 'UTF-8');
    $faviconTags = '';
    if ($favicon !== '') {
        $safeFav = htmlspecialchars($favicon, ENT_QUOTES, 'UTF-8');
        $faviconTags = '<link rel="icon" href="' . $safeFav . '"><link rel="shortcut icon" href="' . $safeFav . '"><link rel="apple-touch-icon" href="' . $safeFav . '">';
    }
    echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' . $safeApp . ' Load Test Report</title>
    ' . $faviconTags . '
    <style>body{font-family:Segoe UI,sans-serif;max-width:720px;margin:3rem auto;padding:0 1.25rem;color:#1c2421;background:#f3efe6}
    code{background:#e8efe9;padding:.15rem .4rem;border-radius:4px}
    pre{background:#1c2421;color:#e8efe9;padding:1rem;border-radius:10px;overflow:auto}
    h1{font-size:1.75rem}</style></head><body>
    <h1>' . $safeApp . ' Load Test Report</h1>
    <p>No load test report has been generated yet.</p>
    <p>From the project folder, run:</p>
    <pre>.\\load-tests\\run.ps1</pre>
    <p>Or regenerate from an existing summary:</p>
    <pre>node .\\load-tests\\generate-report.js</pre>
    <p>Then refresh this page (Admin → Load Test).</p>
    </body></html>';
    exit;
}

$html = file_get_contents($reportFile);
if ($html === false) {
    loadTestReportDeny($wantsMeta, 500, 'Failed to read report file');
}

$html = injectBrandedFavicon($html, $favicon);

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Frame-Options: SAMEORIGIN');
echo $html;
exit;
