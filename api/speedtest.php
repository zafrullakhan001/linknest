<?php
/**
 * Internet / server speed-test endpoints used by the Monitoring dashboard.
 *
 * GET  /speedtest|/info     - Server/client info + limits
 * GET  /speedtest/ping      - Tiny timestamp payload for RTT
 * GET  /speedtest/download  - Incompressible octet stream (query: bytes)
 * POST /speedtest/upload    - Discard request body
 * CRUD /speedtest/schedules - Browser/worker schedules
 * GET|POST /speedtest/results
 * GET  /speedtest/status
 * POST /speedtest/run-now   - Queue worker run (admin)
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/speedtest_schedules_lib.php';
if (file_exists(__DIR__ . '/user_audit_helper.php')) {
    require_once __DIR__ . '/user_audit_helper.php';
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$AUTH_USER = requireAuth();
$GLOBALS['AUTH_USER'] = $AUTH_USER;
$IS_ADMIN = !empty($AUTH_USER['is_admin']);
$IS_SYSTEM = !empty($AUTH_USER['is_system']) || (($AUTH_USER['username'] ?? '') === 'system');

// Release the session lock so streaming tests do not freeze the rest of the app.
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

@ini_set('zlib.output_compression', '0');
@ini_set('implicit_flush', '1');
@set_time_limit(120);

const SPEEDTEST_MAX_DOWNLOAD_BYTES = 8388608; // 8 MiB per request
const SPEEDTEST_MAX_UPLOAD_BYTES = 8388608;   // 8 MiB per request
const SPEEDTEST_CHUNK_BYTES = 65536;

try {
    speedtestEnsureSchema(getDB());
} catch (Throwable $e) {
    // schema best-effort
}

$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '/';
if ($path === '') {
    $path = '/';
}

$method = $_SERVER['REQUEST_METHOD'];

$jsonBodyPaths = ['/schedules', '/results', '/run-now'];
$needsJsonBody = in_array($method, ['POST', 'PUT', 'PATCH'], true) && (
    in_array($path, $jsonBodyPaths, true) || preg_match('#^/schedules/\d+$#', $path)
);
$body = [];
if ($needsJsonBody) {
    $raw = file_get_contents('php://input');
    $decoded = $raw !== false && $raw !== '' ? json_decode($raw, true) : [];
    $body = is_array($decoded) ? $decoded : [];
}

// --- Schedule / results / status routes (JSON) ---
if ($path === '/schedules' && $method === 'GET') {
    sendJSON(['data' => speedtestListSchedules($AUTH_USER, $IS_ADMIN)]);
}
if ($path === '/schedules' && $method === 'POST') {
    sendJSON(['data' => speedtestCreateSchedule($body, $AUTH_USER, $IS_ADMIN)], 201);
}
if (preg_match('#^/schedules/(\d+)$#', $path, $m)) {
    $sid = (int)$m[1];
    if ($method === 'PUT' || $method === 'PATCH') {
        sendJSON(['data' => speedtestUpdateSchedule($sid, $body, $AUTH_USER, $IS_ADMIN)]);
    }
    if ($method === 'DELETE') {
        speedtestDeleteSchedule($sid, $AUTH_USER, $IS_ADMIN);
        sendJSON(['data' => ['ok' => true]]);
    }
}
if ($path === '/results' && $method === 'GET') {
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 40;
    sendJSON(['data' => speedtestListResults($AUTH_USER, $IS_ADMIN, $limit)]);
}
if ($path === '/results' && $method === 'POST') {
    if (!$IS_SYSTEM) {
        $uid = (int)$AUTH_USER['id'];
        if (!speedtestRateLimitAllow('user:' . $uid . ':hour', speedtestInteractiveMaxPerHour(), 3600)) {
            sendJSON(['error' => 'Interactive speed-test rate limit reached. Try again later.'], 429);
        }
    }
    sendJSON(['data' => speedtestStoreResult($body, $AUTH_USER)], 201);
}
if ($path === '/status' && $method === 'GET') {
    sendJSON(['data' => speedtestStatusPayload($AUTH_USER, $IS_ADMIN)]);
}
if ($path === '/run-now' && $method === 'POST') {
    if (!$IS_ADMIN) {
        sendJSON(['error' => 'Admin access required'], 403);
    }
    $scheduleId = isset($body['schedule_id']) ? (int)$body['schedule_id'] : null;
    $result = speedtestQueueWorkerRun($scheduleId ?: null, $AUTH_USER);
    sendJSON(['data' => $result]);
}

// Interactive streaming endpoints — rate-limit non-system users lightly.
if (in_array($path, ['/download', '/upload'], true) && !$IS_SYSTEM) {
    $uid = (int)$AUTH_USER['id'];
    // Multi-stream thorough tests issue many short chunk requests; keep this far above
    // the completed-test hourly cap (see speedtestInteractiveMaxPerHour).
    $maxStream = max(5000, speedtestInteractiveMaxPerHour() * 400);
    if (!speedtestRateLimitAllow('user:' . $uid . ':stream_hour', $maxStream, 3600)) {
        sendJSON([
            'error' => 'Speed-test stream rate limit reached. Wait for the next hour, or ask an admin to raise speedtest_interactive_max_per_hour.',
        ], 429);
    }
}

if ($path === '/' || $path === '/info') {
    if ($method !== 'GET') {
        sendJSON(['error' => 'Method not allowed'], 405);
    }
    handleSpeedtestInfo();
}

if ($path === '/ping') {
    if ($method !== 'GET' && $method !== 'HEAD') {
        sendJSON(['error' => 'Method not allowed'], 405);
    }
    handleSpeedtestPing();
}

if ($path === '/download') {
    if ($method !== 'GET' && $method !== 'HEAD') {
        sendJSON(['error' => 'Method not allowed'], 405);
    }
    handleSpeedtestDownload($method === 'HEAD');
}

if ($path === '/upload') {
    if ($method !== 'POST' && $method !== 'PUT') {
        sendJSON(['error' => 'Method not allowed'], 405);
    }
    handleSpeedtestUpload();
}

sendJSON(['error' => 'Invalid endpoint'], 404);

function speedtestClearBuffers(): void
{
    try {
        $level = ob_get_level();
        for ($i = 0; $i < $level; $i++) {
            @ob_end_clean();
        }
    } catch (Throwable $e) {
        // ignore
    }
}

function handleSpeedtestInfo(): void
{
    $ua = substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 240);
    $proto = null;
    if (!empty($_SERVER['SERVER_PROTOCOL'])) {
        $proto = (string)$_SERVER['SERVER_PROTOCOL'];
    }
    sendJSON([
        'data' => [
            'ip' => getClientIpAddress(),
            'server_time' => round(microtime(true) * 1000),
            'target' => 'server',
            'hostname' => gethostname() ?: null,
            'http_protocol' => $proto,
            'limits' => [
                'max_download_bytes' => SPEEDTEST_MAX_DOWNLOAD_BYTES,
                'max_upload_bytes' => SPEEDTEST_MAX_UPLOAD_BYTES,
            ],
            'user_agent' => $ua !== '' ? $ua : null,
        ],
    ]);
}

function handleSpeedtestPing(): void
{
    speedtestClearBuffers();
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        header('Expires: 0');
    }
    echo json_encode(['t' => (int) round(microtime(true) * 1000)]);
    exit;
}

function handleSpeedtestDownload(bool $headOnly): void
{
    $requested = isset($_GET['bytes']) ? (int)$_GET['bytes'] : 1048576;
    if ($requested < 1) {
        $requested = 1;
    }
    $size = min($requested, SPEEDTEST_MAX_DOWNLOAD_BYTES);

    speedtestClearBuffers();
    ignore_user_abort(false);

    if (!headers_sent()) {
        header('Content-Type: application/octet-stream');
        header('Content-Encoding: identity');
        header('Cache-Control: no-store, no-cache, no-transform, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        header('Expires: 0');
        header('X-Content-Type-Options: nosniff');
        header('Content-Length: ' . $size);
    }

    if ($headOnly) {
        exit;
    }

    try {
        $chunk = random_bytes(SPEEDTEST_CHUNK_BYTES);
    } catch (Throwable $e) {
        $chunk = '';
        for ($i = 0; $i < SPEEDTEST_CHUNK_BYTES; $i++) {
            $chunk .= chr(($i * 73 + 19) & 0xFF);
        }
    }

    $sent = 0;
    while ($sent < $size) {
        if (connection_aborted()) {
            break;
        }
        $n = min(SPEEDTEST_CHUNK_BYTES, $size - $sent);
        echo $n === SPEEDTEST_CHUNK_BYTES ? $chunk : substr($chunk, 0, $n);
        $sent += $n;
        flush();
    }
    exit;
}

function handleSpeedtestUpload(): void
{
    speedtestClearBuffers();
    ignore_user_abort(true);

    $bytes = 0;
    $cap = SPEEDTEST_MAX_UPLOAD_BYTES;
    $in = @fopen('php://input', 'rb');
    if ($in !== false) {
        while (!feof($in) && $bytes < $cap) {
            $buf = fread($in, SPEEDTEST_CHUNK_BYTES);
            if ($buf === false || $buf === '') {
                break;
            }
            $bytes += strlen($buf);
        }
        fclose($in);
    }

    sendJSON([
        'data' => [
            'received' => $bytes,
        ],
    ]);
}
