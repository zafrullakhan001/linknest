<?php
/**
 * Internet / server speed-test endpoints used by the Monitoring dashboard.
 *
 * GET  /speedtest|/info     - Server/client info + limits
 * GET  /speedtest/ping      - Tiny timestamp payload for RTT
 * GET  /speedtest/download  - Incompressible octet stream (query: bytes)
 * POST /speedtest/upload    - Discard request body
 * GET  /speedtest/proxy/{info|ping|download} - Relay to an allow-listed custom endpoint (?target=)
 * POST /speedtest/proxy/upload               - Relay an upload body to the custom endpoint
 * CRUD /speedtest/schedules - Browser/worker schedules
 * GET|POST /speedtest/results
 * GET  /speedtest/status
 * POST /speedtest/run-now   - Queue worker run (admin)
 *
 * The four measurement routes above also answer without a session when
 * `speedtest_public_probe_enabled` is on (per-IP rate-limited, CORS echoed) so another LinkNest
 * can measure this host Browser-direct. See api/speedtest_proxy_lib.php and docs/SPEED_TEST.md.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/speedtest_schedules_lib.php';
require_once __DIR__ . '/speedtest_proxy_lib.php';
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

$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '/';
if ($path === '') {
    $path = '/';
}
$method = $_SERVER['REQUEST_METHOD'];

/**
 * Public probe: when an admin enables `speedtest_public_probe_enabled`, the four measurement
 * endpoints on THIS host answer without a session so another LinkNest (or the same widget in
 * Browser-direct mode) can measure it. Everything else still requires a session.
 * Requests are per-IP rate-limited; no session/credentials are involved.
 */
const SPEEDTEST_PROBE_PATHS = ['/', '/info', '/ping', '/download', '/upload'];
$IS_PUBLIC_PROBE = in_array($path, SPEEDTEST_PROBE_PATHS, true) && speedtestPublicProbeEnabled();

if ($IS_PUBLIC_PROBE) {
    $AUTH_USER = null;
    $IS_ADMIN = false;
    $IS_SYSTEM = false;
    $GLOBALS['AUTH_USER'] = null;
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
    $probeIp = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $probeMax = max(60, speedtestInteractiveMaxPerHour() * 30);
    if (!speedtestRateLimitAllow('speedtest_public_probe:' . $probeIp, $probeMax, 3600)) {
        sendJSON(['error' => 'Public speed-test probe rate limit reached for this IP. Try again later.'], 429);
    }
} else {
    $AUTH_USER = requireAuth();
    $GLOBALS['AUTH_USER'] = $AUTH_USER;
    $IS_ADMIN = !empty($AUTH_USER['is_admin']);
    $IS_SYSTEM = !empty($AUTH_USER['is_system']) || (($AUTH_USER['username'] ?? '') === 'system');

    // Release the session lock so streaming tests do not freeze the rest of the app.
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
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

// --- Schedule / results / status routes (JSON, session only) ---
if (!$IS_PUBLIC_PROBE) {
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
}

// Interactive streaming endpoints — rate-limit authenticated non-system users lightly
// (the public probe has its own per-IP bucket, applied above).
if (in_array($path, ['/download', '/upload'], true) && !$IS_SYSTEM && !$IS_PUBLIC_PROBE) {
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

// The public probe may be called cross-origin; echo the caller's Origin (needed by
// Browser-direct). Session endpoints keep the wildcard CORS set in config.php.
if ($IS_PUBLIC_PROBE) {
    speedtestApplyProbeCors();
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

// --- Server-proxy routes: this LinkNest host relays to a custom endpoint (admin allow-list) ---
if (preg_match('#^/proxy/(info|ping|download|upload)$#', $path, $m)) {
    handleSpeedtestProxy($m[1], $method, $path);
}

sendJSON(['error' => 'Invalid endpoint'], 404);

/** Echo the calling Origin so a Browser-direct probe from another LinkNest is allowed. */
function speedtestApplyProbeCors(): void
{
    if (headers_sent()) {
        return;
    }
    $origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin !== '' && preg_match('#^https?://[A-Za-z0-9._\-:\[\]]+$#', $origin)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    } else {
        header('Access-Control-Allow-Origin: *');
    }
    header('Access-Control-Allow-Methods: GET, HEAD, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 600');
}


/**
 * Server-proxy handler. Requires an authenticated session (never the public probe).
 * Streams straight through to the allow-listed endpoint so the browser's readers see live data.
 */
function handleSpeedtestProxy(string $action, string $method, string $path): void
{
    global $AUTH_USER, $IS_SYSTEM;

    if ($method === 'OPTIONS') {
        http_response_code(204);
        exit;
    }

    $valid = [
        'info' => ['GET'],
        'ping' => ['GET', 'HEAD'],
        'download' => ['GET', 'HEAD'],
        'upload' => ['POST', 'PUT'],
    ];
    if (!in_array($method, $valid[$action] ?? [], true)) {
        sendJSON(['error' => 'Method not allowed'], 405);
    }
    if (strpos($path, '/proxy') !== 0) {
        sendJSON(['error' => 'Invalid endpoint'], 404);
    }
    if (!function_exists('curl_init')) {
        sendJSON(['error' => 'The PHP cURL extension is required for Server-proxy speed tests. Enable ext-curl, or use Browser-direct.'], 500);
    }

    $target = trim((string)($_GET['target'] ?? ''));
    try {
        $resolved = speedtestProxyResolveTarget($target);
    } catch (Throwable $e) {
        sendJSON(['error' => $e->getMessage()], 400);
    }

    // Per-user proxy budget (separate from the direct stream budget).
    if (!$IS_SYSTEM && is_array($AUTH_USER)) {
        $uid = (int)($AUTH_USER['id'] ?? 0);
        $maxProxy = max(2000, speedtestInteractiveMaxPerHour() * 200);
        if (!speedtestRateLimitAllow('user:' . $uid . ':proxy_hour', $maxProxy, 3600)) {
            sendJSON([
                'error' => 'Speed-test proxy rate limit reached. Wait for the next hour, or ask an admin to raise speedtest_interactive_max_per_hour.',
            ], 429);
        }
    }

    @ini_set('zlib.output_compression', '0');
    @ini_set('implicit_flush', '1');
    while (ob_get_level() > 0) {
        @ob_end_clean();
    }

    if ($action === 'info') {
        speedtestProxyInfo($resolved);
        exit;
    }
    if ($method === 'POST' || $method === 'PUT') {
        speedtestProxyUpload($resolved);
        exit;
    }
    speedtestProxyPingOrDownload($action, $method, $resolved);
    exit;
}

/** Relay `/speedtest/info` and return the endpoint's JSON (reporting the endpoint's IP). */
function speedtestProxyInfo(array $target): void
{
    $url = speedtestProxyBuildUrl($target['baseUrl'], 'info', ['r' => (string)time()]);
    $ch = speedtestProxyCurlInit($url, 12);
    $body = '';
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_WRITEFUNCTION, function ($ch, $chunk) use (&$body) {
        $body .= $chunk;
        return strlen($chunk);
    });
    curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($status < 200 || $status >= 300) {
        sendJSON([
            'error' => 'Proxied endpoint info failed'
                . ($status ? ' (' . $status . ')' : '')
                . ($err ? ': ' . $err : '')
                . ' — check the address, port, and that the endpoint exposes /api/speedtest/info.',
        ], 502);
    }

    $decoded = json_decode($body, true);
    $data = is_array($decoded) ? ($decoded['data'] ?? $decoded) : [];
    if (!is_array($data)) {
        $data = [];
    }
    sendJSON([
        'data' => [
            'ip' => $target['ip'],
            'http_protocol' => $data['http_protocol'] ?? null,
            'user_agent' => 'LinkNest-SpeedTest-Proxy',
            'proxied' => true,
            'proxy_target' => $target['baseUrl'],
            'proxy_target_host' => $target['label'],
            'endpoint' => $data['endpoint'] ?? null,
        ],
    ]);
}

/** Relay ping/download, streaming the octet stream back to the browser unmodified. */
function speedtestProxyPingOrDownload(string $action, string $method, array $target): void
{
    $bytes = isset($_GET['bytes']) ? (int)$_GET['bytes'] : 1048576;
    if ($bytes < 1) {
        $bytes = 1;
    }
    $bytes = min($bytes, SPEEDTEST_MAX_DOWNLOAD_BYTES);

    $query = ['r' => (string)time()];
    if ($action === 'download') {
        $query['bytes'] = (string)$bytes;
    }
    $url = speedtestProxyBuildUrl($target['baseUrl'], $action, $query);

    if (headers_sent()) {
        sendJSON(['error' => 'Headers already sent — cannot stream the proxied response.'], 500);
    }

    if ($method === 'HEAD') {
        // Cheap reachability probe against the endpoint.
        $ch = speedtestProxyCurlInit($url, 8);
        curl_setopt($ch, CURLOPT_NOBODY, true);
        curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($status < 200 || $status >= 300) {
            speedtestProxyRelayError($action, $status, $err);
        }
        http_response_code(200);
        exit;
    }

    // Stream through. Headers are emitted lazily on the first real chunk, and only when the
    // upstream status is 2xx — otherwise the upstream error is relayed as JSON instead of a
    // bogus 200 octet-stream (which would silently poison the throughput measurement).
    $emitted = false;
    $upstreamStatus = 0;
    $errorBody = '';
    $ch = speedtestProxyCurlInit($url, 20);
    curl_setopt($ch, CURLOPT_HEADERFUNCTION, function ($ch, $header) use (&$upstreamStatus) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $header, $m)) {
            $upstreamStatus = (int)$m[1];
        }
        return strlen($header);
    });
    curl_setopt($ch, CURLOPT_WRITEFUNCTION, function ($ch, $chunk) use (&$emitted, &$upstreamStatus, &$errorBody) {
        if (!$emitted) {
            if ($upstreamStatus >= 200 && $upstreamStatus < 300) {
                $emitted = true;
                header('Content-Type: application/octet-stream');
                header('Cache-Control: no-store, no-cache, must-revalidate');
                header('X-Accel-Buffering: no');
            } else {
                // Upstream refused: keep the payload for the error message, then stop the transfer.
                if (strlen($errorBody) < 512) {
                    $errorBody .= $chunk;
                }
                return 0;
            }
        }
        echo $chunk;
        @flush();
        return strlen($chunk);
    });
    curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if (!$emitted) {
        $effective = $status ?: $upstreamStatus;
        $detail = preg_replace('/\s+/', ' ', trim($errorBody)) ?? '';
        if (strlen($detail) > 300) {
            $detail = substr($detail, 0, 300) . '…';
        }
        $reason = $effective === 401 || $effective === 403
            ? 'the endpoint refused the probe'
                . ' (enable its public speed-test probe, or use Browser → endpoint against a LinkNest host)'
            : ($detail !== '' ? $detail : ($err !== '' ? $err : 'no response body'));
        speedtestProxyRelayError($action, $effective, $reason);
    }
}

/** Send a JSON error for a failed proxied transfer (only safe before any body was streamed). */
function speedtestProxyRelayError(string $action, int $status, string $reason): void
{
    sendJSON([
        'error' => 'Proxied ' . $action . ' failed'
            . ($status ? ' (' . $status . ')' : '')
            . ': ' . $reason,
    ], 502);
}

/** Relay an upload body to the endpoint and discard the response. */
function speedtestProxyUpload(array $target): void
{
    $url = speedtestProxyBuildUrl($target['baseUrl'], 'upload', ['r' => (string)time()]);
    $ch = speedtestProxyCurlInit($url, 20);

    // php://input is one-shot (and not seekable), so an earlier consumer can drain it and cURL
    // then reads zero bytes. Buffer the body once so the relay always forwards the full payload.
    $lenHeader = $_SERVER['CONTENT_LENGTH'] ?? ($_SERVER['HTTP_CONTENT_LENGTH'] ?? null);
    $length = is_numeric($lenHeader) ? (int)$lenHeader : 0;

    $in = fopen('php://temp', 'w+b');
    if ($in === false) {
        curl_close($ch);
        sendJSON(['error' => 'Could not open a buffer for the upload body'], 500);
    }
    $raw = fopen('php://input', 'rb');
    if ($raw !== false) {
        stream_copy_to_stream($raw, $in);
        fclose($raw);
    }
    $buffered = (int)ftell($in);
    if ($buffered > 0) {
        $length = $buffered;
    }
    rewind($in);

    if ($length <= 0) {
        fclose($in);
        curl_close($ch);
        sendJSON(['error' => 'No upload body received'], 400);
    }

    curl_setopt($ch, CURLOPT_UPLOAD, true);
    curl_setopt($ch, CURLOPT_INFILE, $in);
    curl_setopt($ch, CURLOPT_INFILESIZE, $length);
    curl_setopt($ch, CURLOPT_WRITEFUNCTION, function ($ch, $chunk) {
        return strlen($chunk);
    });

    curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    fclose($in);
    curl_close($ch);

    if ($status < 200 || $status >= 300) {
        sendJSON([
            'error' => 'Proxied upload failed'
                . ($status ? ' (' . $status . ')' : '')
                . ($err ? ': ' . $err : '')
                . ' — the endpoint must expose /api/speedtest/upload.',
        ], 502);
    }

    sendJSON(['data' => ['ok' => true]]);
}

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
