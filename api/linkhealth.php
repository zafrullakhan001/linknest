<?php
// Set execution time limit early to prevent hangs (tile checks may probe many URLs)
set_time_limit(20);

// Start output buffering to prevent any accidental output
ob_start();

require_once __DIR__ . '/config.php';

/** Max redirects to follow during health probes (SSO chains can exceed 50 hops). */
if (!defined('HEALTH_MAX_REDIRS')) {
    define('HEALTH_MAX_REDIRS', 55);
}

/** Checker could not reach the internet. Must be defined before the router switch (handlers exit). */
if (!defined('HEALTH_NETWORK_ERROR')) {
    define('HEALTH_NETWORK_ERROR', 'Network not reachable — this is not a broken link');
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

switch ($method) {
    case 'GET':
        if ($path === '' || $path === '/') {
            handleGetHealthStatus();
        } elseif ($path === '/stats') {
            handleGetHealthStats();
        } elseif ($path === '/url-inventory') {
            handleGetUrlInventory();
        } elseif ($path === '/tooltip-inventory') {
            handleGetTooltipInventory();
        } else {
            sendJSON(['error' => 'Invalid endpoint', 'received_path' => $path, 'path_type' => gettype($path)], 404);
        }
        break;
        
    case 'POST':
        if ($path === '/check') {
            handleCheckSingleLink();
        } elseif ($path === '/check-url') {
            handleCheckUrl();
        } elseif ($path === '/check-urls') {
            handleCheckUrls();
        } elseif ($path === '/check-tile') {
            handleCheckTileLinks();
        } elseif ($path === '/check-all') {
            handleCheckAllLinks();
        } elseif ($path === '/fix-urls') {
            handleFixUrls();
        } elseif ($path === '/sync-tooltips') {
            handleSyncTooltips();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

/**
 * Determine health status from HTTP code, curl error, and error message
 * This centralizes the status logic so both single and parallel checks use the same logic
 *
 * @param int $httpCode Final HTTP status code
 * @param int $errno cURL errno
 * @param string|null $error cURL / status error message
 * @param int $redirectCount Number of redirects followed (CURLINFO_REDIRECT_COUNT)
 */
function determineHealthStatus($httpCode, $errno, $error, $redirectCount = 0) {
    // Determine status based on response
    if ($errno !== 0) {
        // Redirect loop / still redirecting after HEALTH_MAX_REDIRS — not a hard failure
        if ($errno === CURLE_TOO_MANY_REDIRECTS) {
            $status = 'redirected';
            $error = 'Maximum (' . (int)HEALTH_MAX_REDIRS . ') redirects followed';
        } elseif ($errno === CURLE_OPERATION_TIMEDOUT || $errno === CURLE_OPERATION_TIMEOUTED) {
            // Host responded but SSO/redirect chain never settled within the probe budget.
            // Prefer "redirected" over "timeout" so working browser links are not flagged as down.
            $sawRedirect = $redirectCount > 0 || ($httpCode >= 300 && $httpCode < 400);
            if ($sawRedirect) {
                $status = 'redirected';
                if ($redirectCount > 0) {
                    $error = 'Redirect chain did not settle within probe time (' . (int)$redirectCount . ' redirect(s))';
                } else {
                    $error = 'Redirect chain did not settle within probe time (HTTP ' . (int)$httpCode . ')';
                }
            } else {
                $status = 'timeout';
                $error = 'Connection timed out';
            }
        } else {
            // Other cURL errors
            $status = 'broken';
            if ($errno === CURLE_COULDNT_RESOLVE_HOST) {
                $error = 'Could not resolve host';
            } elseif ($errno === CURLE_COULDNT_CONNECT) {
                $error = 'Could not connect to server';
            } elseif ($errno === CURLE_SSL_CONNECT_ERROR) {
                $error = 'SSL connection error';
            }
        }
    } elseif ($httpCode >= 300 && $httpCode < 400) {
        // Final response is still a redirect
        $status = 'redirected';
        $error = 'Redirected (HTTP ' . $httpCode . ')';
    } elseif ($httpCode >= 200 && $httpCode < 300) {
        // Success (2xx) — mark as redirected when the check followed one or more redirects
        if ($redirectCount > 0) {
            $status = 'redirected';
            $error = 'Reached after ' . (int)$redirectCount . ' redirect(s)';
        } else {
            $status = 'healthy';
            $error = null;
        }
    } elseif ($httpCode >= 400 && $httpCode < 500) {
        // Client error (4xx)
        if ($httpCode === 404) {
            // 404 could mean:
            // 1. Page doesn't exist (broken)
            // 2. Server is up but HEAD request not supported (common for some sites)
            // 3. Internal/corporate site that requires specific path
            // Since server responded (not timeout/connection error), treat as "unknown" rather than "broken"
            // The link might work when clicked even if HEAD returns 404
            $status = 'unknown';
            $error = 'Page not found (404) - Server is reachable but page may not exist or HEAD not supported';
        } elseif ($httpCode === 403 || $httpCode === 401) {
            // Treat auth/permission errors as "accessible" - server is online, just requires authentication (SSO/proxy/SharePoint)
            $status = 'accessible';
            if ($httpCode === 403) {
                $error = 'Access forbidden (403) - Server is online, authentication required';
            } else { // 401
                $error = 'Unauthorized (401) - Server is online, authentication required';
            }
        } else {
            // All other 4xx codes (405, 406, 407, 408, etc.) indicate server is reachable and responding
            // These are often behind SSO proxies, SharePoint, or require specific methods/headers
            // Since the server responded, the link is accessible/online
            $status = 'accessible';
            $error = 'Server is online (HTTP ' . $httpCode . ') - May require authentication or specific access method';
        }
    } elseif ($httpCode >= 500) {
        // Server error (5xx)
        $status = 'broken';
        $error = 'Server error: ' . $httpCode;
    } else {
        // Unknown status
        $status = 'unknown';
        $error = 'Unknown response code: ' . $httpCode;
    }
    
    return ['status' => $status, 'error' => $error];
}

function networkUnreachableHealthResult($base = []) {
    $out = is_array($base) ? $base : [];
    $out['status'] = 'network';
    $out['http_code'] = 0;
    $out['error'] = defined('HEALTH_NETWORK_ERROR')
        ? HEALTH_NETWORK_ERROR
        : 'Network not reachable — this is not a broken link';
    return $out;
}

function healthResultLooksLikeConnectivityFailure($result) {
    if (!is_array($result) || !empty($result['skipped'])) {
        return false;
    }
    if (($result['error'] ?? '') === 'Invalid URL format') {
        return false;
    }
    if ((int)($result['http_code'] ?? 0) > 0) {
        return false;
    }

    $errno = (int)($result['errno'] ?? 0);
    $timeoutErrno = defined('CURLE_OPERATION_TIMEOUTED') ? CURLE_OPERATION_TIMEOUTED : CURLE_OPERATION_TIMEDOUT;
    $connectivityErrnos = [
        CURLE_COULDNT_RESOLVE_HOST,
        CURLE_COULDNT_RESOLVE_PROXY,
        CURLE_COULDNT_CONNECT,
        CURLE_OPERATION_TIMEDOUT,
        $timeoutErrno,
        CURLE_GOT_NOTHING,
        CURLE_SEND_ERROR,
        CURLE_RECV_ERROR,
    ];
    if (defined('CURLE_INTERFACE_FAILED')) {
        $connectivityErrnos[] = CURLE_INTERFACE_FAILED;
    }
    if (in_array($errno, $connectivityErrnos, true)) {
        return true;
    }

    $status = (string)($result['status'] ?? '');
    $error = strtolower((string)($result['error'] ?? ''));
    if ($status === 'timeout') {
        return true;
    }
    if ($status === 'broken' || $status === 'unknown' || $status === 'network') {
        if ($error === '') {
            return $errno !== 0;
        }
        return str_contains($error, 'could not resolve')
            || str_contains($error, 'could not connect')
            || str_contains($error, 'timed out')
            || str_contains($error, 'timeout')
            || str_contains($error, 'network')
            || str_contains($error, 'no result');
    }
    return false;
}

/**
 * True when THIS PHP process can reach the public internet.
 * Independent of the vhost hostname (localhost, LAN name, or public DNS).
 * Do not probe HTTP_HOST — that succeeds on LAN even when WAN is down.
 */
function probeCheckerHasOutboundNetwork() {
    static $cached = null;
    static $cachedAt = 0.0;
    $now = microtime(true);
    if ($cached !== null && ($now - $cachedAt) < 8.0) {
        return $cached;
    }

    $mark = function ($up) use ($now, &$cached, &$cachedAt) {
        $cached = $up;
        $cachedAt = $now;
        return $up;
    };

    try {
        // IP:443 first so DNS for google/cloudflare is not required on the future host.
        foreach ([['1.1.1.1', 443], ['8.8.8.8', 443], ['9.9.9.9', 443]] as $pair) {
            $fp = @fsockopen($pair[0], $pair[1], $errno, $errstr, 1.0);
            if ($fp) {
                fclose($fp);
                return $mark(true);
            }
        }

        $targets = [
            'https://www.gstatic.com/generate_204',
            'https://1.1.1.1',
            'http://detectportal.firefox.com/success.txt',
        ];

        foreach ($targets as $url) {
            $ch = curl_init();
            if ($ch === false) {
                continue;
            }
            curl_setopt_array($ch, [
                CURLOPT_URL => $url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_NOBODY => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS => 2,
                CURLOPT_TIMEOUT => 1,
                CURLOPT_CONNECTTIMEOUT => 1,
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => 0,
                CURLOPT_USERAGENT => (function_exists('getAppName') ? (getAppName() ?: 'LinkNest') : 'LinkNest') . ' Health Checker/1.0',
            ]);
            curl_exec($ch);
            $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            if ($code > 0) {
                return $mark(true);
            }
        }
    } catch (Throwable $e) {
        return $mark(false);
    }

    return $mark(false);
}

/**
 * If every probed URL failed with DNS/connect/timeout AND a public probe also fails,
 * rewrite results to status=network so the UI does not call them Broken.
 */
function reclassifyHealthResultsIfNetworkUnreachable(&$healthResults) {
    if (!is_array($healthResults) || $healthResults === []) {
        return false;
    }

    $probeableUrls = [];
    foreach ($healthResults as $url => $result) {
        if (!is_array($result) || !empty($result['skipped'])) {
            continue;
        }
        if (($result['error'] ?? '') === 'Invalid URL format') {
            continue;
        }
        $probeableUrls[] = $url;
    }

    if ($probeableUrls === []) {
        return false;
    }

    foreach ($probeableUrls as $url) {
        $result = $healthResults[$url];
        if ((int)($result['http_code'] ?? 0) > 0) {
            return false;
        }
        if (!healthResultLooksLikeConnectivityFailure($result)) {
            return false;
        }
    }

    if (probeCheckerHasOutboundNetwork()) {
        return false;
    }

    foreach ($probeableUrls as $url) {
        $healthResults[$url] = networkUnreachableHealthResult($healthResults[$url]);
    }
    return true;
}

function reclassifySingleHealthIfNetworkUnreachable($healthResult) {
    if (!healthResultLooksLikeConnectivityFailure($healthResult)) {
        return $healthResult;
    }
    if (probeCheckerHasOutboundNetwork()) {
        return $healthResult;
    }
    return networkUnreachableHealthResult($healthResult);
}

function isPersistableLinkHealthStatus($status) {
    return $status !== 'checking';
}

/**
 * Release PHP session lock so long-running health checks do not block
 * other authenticated API requests (e.g. navigating back to the main page).
 */
function releaseSessionLock() {
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
}

/**
 * Non-HTTP schemes (SSH, VNC, RDP, etc.) cannot be probed with cURL HEAD — skip health checks.
 */
function isNonHttpHealthUrl($url) {
    return isNonHttpLinkHealthUrl($url);
}

/**
 * Load admin-configured link check exception patterns (cached per request).
 * @return string[]
 */
function getLinkCheckExceptions() {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    $raw = function_exists('getSetting') ? (string)getSetting('link_check_exceptions', '[]') : '[]';
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        $cached = [];
        return $cached;
    }
    $out = [];
    foreach ($decoded as $item) {
        if (is_string($item)) {
            $p = trim($item);
            if ($p !== '') {
                $out[] = $p;
            }
        }
    }
    $cached = $out;
    return $cached;
}

/**
 * Normalize a URL or exception pattern for comparison (mirrors settings normalizer lightly).
 */
function normalizeLinkHealthMatchTarget($raw) {
    $value = trim((string)$raw);
    if ($value === '') {
        return '';
    }
    $hashPos = strpos($value, '#');
    if ($hashPos !== false) {
        $value = trim(substr($value, 0, $hashPos));
    }
    if ($value === '') {
        return '';
    }

    if (!preg_match('#^[a-z][a-z0-9+.-]*:#i', $value) && strpos($value, '/') === false && strpos($value, ' ') === false) {
        return rtrim(strtolower($value), '.');
    }

    $hadScheme = (bool)preg_match('#^[a-z][a-z0-9+.-]*:#i', $value);
    $withScheme = $hadScheme ? $value : ('https://' . $value);
    $parts = @parse_url($withScheme);
    if (!is_array($parts) || empty($parts['host'])) {
        return rtrim(strtolower($value), '/');
    }

    $host = strtolower((string)$parts['host']);
    $path = isset($parts['path']) ? (string)$parts['path'] : '';
    if ($path === '/') {
        $path = '';
    } elseif ($path !== '' && str_ends_with($path, '/')) {
        $path = rtrim($path, '/');
    }
    $query = isset($parts['query']) && $parts['query'] !== '' ? ('?' . $parts['query']) : '';

    if (!$hadScheme) {
        return $host . $path . $query;
    }
    $scheme = strtolower((string)($parts['scheme'] ?? 'https'));
    return $scheme . '://' . $host . $path . $query;
}

function linkHealthExtractHost($normalized) {
    if ($normalized === '') {
        return '';
    }
    $withScheme = preg_match('#^[a-z][a-z0-9+.-]*:#i', $normalized) ? $normalized : ('https://' . $normalized);
    $parts = @parse_url($withScheme);
    if (is_array($parts) && !empty($parts['host'])) {
        return strtolower((string)$parts['host']);
    }
    $slash = strpos($normalized, '/');
    return strtolower($slash === false ? $normalized : substr($normalized, 0, $slash));
}

function linkHealthExtractPathQuery($normalized) {
    if ($normalized === '') {
        return '';
    }
    $withScheme = preg_match('#^[a-z][a-z0-9+.-]*:#i', $normalized) ? $normalized : ('https://' . $normalized);
    $parts = @parse_url($withScheme);
    if (!is_array($parts)) {
        $slash = strpos($normalized, '/');
        return $slash === false ? '' : substr($normalized, $slash);
    }
    $path = isset($parts['path']) ? (string)$parts['path'] : '';
    if ($path === '/') {
        $path = '';
    } elseif ($path !== '' && str_ends_with($path, '/')) {
        $path = rtrim($path, '/');
    }
    $query = isset($parts['query']) && $parts['query'] !== '' ? ('?' . $parts['query']) : '';
    return $path . $query;
}

/**
 * Whether a URL matches a single exception pattern (host, prefix, or * wildcard).
 */
function urlMatchesLinkCheckException($url, $pattern) {
    $u = normalizeLinkHealthMatchTarget($url);
    $p = normalizeLinkHealthMatchTarget($pattern);
    if ($u === '' || $p === '') {
        return false;
    }
    if ($u === $p) {
        return true;
    }

    if (strpos($p, '*') !== false) {
        $regex = '#^' . str_replace('\\*', '.*', preg_quote($p, '#')) . '$#i';
        if (@preg_match($regex, $u)) {
            return true;
        }
    }

    $urlHost = linkHealthExtractHost($u);
    $patternHost = linkHealthExtractHost($p);
    $patternPath = linkHealthExtractPathQuery($p);
    $urlPath = linkHealthExtractPathQuery($u);

    if ($patternHost !== '' && $patternPath === '') {
        if (strpos($patternHost, '*') !== false) {
            $regex = '#^' . str_replace('\\*', '.*', preg_quote($patternHost, '#')) . '$#i';
            if ($urlHost !== '' && @preg_match($regex, $urlHost)) {
                return true;
            }
        } elseif ($urlHost !== '' && $urlHost === $patternHost) {
            return true;
        }
    }

    if ($patternHost !== '' && $patternPath !== '' && $urlHost === $patternHost) {
        if ($urlPath === $patternPath || str_starts_with($urlPath, $patternPath . '/')) {
            return true;
        }
    }

    if (strpos($p, '*') === false && (str_starts_with($u, $p . '/') || str_starts_with($u, $p . '?'))) {
        return true;
    }

    return false;
}

/**
 * True when the URL is on the admin link-check exception list.
 */
function isLinkCheckExceptionUrl($url) {
    $exceptions = getLinkCheckExceptions();
    if (empty($exceptions)) {
        return false;
    }
    foreach ($exceptions as $pattern) {
        if (urlMatchesLinkCheckException($url, $pattern)) {
            return true;
        }
    }
    return false;
}

/**
 * Skip health probes for non-HTTP schemes and admin exception list.
 */
function shouldSkipLinkHealthCheck($url) {
    return isNonHttpHealthUrl($url) || isLinkCheckExceptionUrl($url);
}

/**
 * Clear stored health for links that should not be checked (e.g. SSH).
 */
function clearLinkHealth($linkId) {
    try {
        $db = getDB();
        $db->exec('PRAGMA busy_timeout = 500');
        $stmt = $db->prepare('UPDATE links SET health_status = NULL, health_http_code = NULL, health_error = NULL, health_checked_at = NULL WHERE id = ?');
        $stmt->execute([$linkId]);
    } catch (Exception $e) {
        error_log('Failed to clear link health for ' . $linkId . ': ' . $e->getMessage());
    }
}

/**
 * Check if a URL is reachable and return health status
 * @param string $url
 * @param int $timeoutSeconds Total cURL timeout (default 2s)
 */
function checkUrlHealth($url, $timeoutSeconds = 2) {
    if (shouldSkipLinkHealthCheck($url)) {
        return [
            'status' => null,
            'http_code' => 0,
            'error' => null,
            'server_latency' => 0,
            'skipped' => true
        ];
    }
    // Validate URL format
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        return [
            'status' => 'broken',
            'http_code' => 0,
            'error' => 'Invalid URL format',
            'server_latency' => 0
        ];
    }

    $ch = createHealthCurlHandle($url, $timeoutSeconds);

    // Measure ONLY cURL execution time (excluding PHP overhead)
    $curlStartTime = microtime(true);
    curl_exec($ch);
    $serverLatency = round((microtime(true) - $curlStartTime) * 1000); // Convert to milliseconds
    
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $redirectCount = (int)curl_getinfo($ch, CURLINFO_REDIRECT_COUNT);
    $effectiveUrl = (string)curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    $error = curl_error($ch);
    $errno = curl_errno($ch);
    // Determine status using shared logic
    $statusResult = determineHealthStatus($httpCode, $errno, $error, $redirectCount);
    $status = $statusResult['status'];
    $error = $statusResult['error'];

    $finalUrl = null;
    if ($effectiveUrl !== '' && strcasecmp($effectiveUrl, $url) !== 0) {
        $finalUrl = $effectiveUrl;
    } elseif ($redirectCount > 0 && $effectiveUrl !== '') {
        $finalUrl = $effectiveUrl;
    }

    return [
        'status' => $status,
        'http_code' => $httpCode,
        'error' => $error,
        'errno' => (int)$errno,
        'server_latency' => $serverLatency,
        'final_url' => $finalUrl,
        'redirect_count' => $redirectCount
    ];
}

/**
 * Build a fast cURL handle for health probing (HEAD, short timeouts, connection reuse).
 * @param bool $followLocation When false, caller follows redirects manually (for hop chain).
 */
function createHealthCurlHandle($url, $timeoutSeconds = 2, $followLocation = true) {
    $timeoutSeconds = max(1, min(5, (int)$timeoutSeconds));
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => $followLocation,
        CURLOPT_MAXREDIRS => $followLocation ? (int)HEALTH_MAX_REDIRS : 0,
        CURLOPT_TIMEOUT => $timeoutSeconds,
        CURLOPT_CONNECTTIMEOUT => min(1, $timeoutSeconds),
        CURLOPT_NOBODY => true, // HEAD — fastest probe
        CURLOPT_HEADER => !$followLocation, // need Location when not auto-following
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_USERAGENT => (function_exists('getAppName') ? (getAppName() ?: 'LinkNest') : 'LinkNest') . ' Health Checker/1.0',
        CURLOPT_HTTPHEADER => [
            'Accept: */*',
            'Cache-Control: no-cache'
        ],
        // Reuse connections when checking multiple URLs (much faster than fresh connect each time)
        CURLOPT_FRESH_CONNECT => false,
        CURLOPT_FORBID_REUSE => false,
        CURLOPT_ENCODING => ''
    ]);
    return $ch;
}

/**
 * Resolve a Location header against the current request URL.
 * @return string|null Absolute URL or null if unusable
 */
function resolveHealthRedirectUrl($baseUrl, $location) {
    $location = trim((string)$location);
    if ($location === '' || preg_match('/[\r\n]/', $location)) {
        return null;
    }
    // Strip optional quotes / angle brackets some servers send
    if ($location[0] === '<' && substr($location, -1) === '>') {
        $location = substr($location, 1, -1);
    }
    $location = trim($location, " \t\"'");

    if (preg_match('#^https?://#i', $location)) {
        return $location;
    }

    $base = parse_url($baseUrl);
    if (!$base || empty($base['scheme']) || empty($base['host'])) {
        return null;
    }
    $scheme = $base['scheme'];
    $host = $base['host'];
    $port = isset($base['port']) ? (':' . $base['port']) : '';

    if (str_starts_with($location, '//')) {
        return $scheme . ':' . $location;
    }
    if (str_starts_with($location, '/')) {
        return $scheme . '://' . $host . $port . $location;
    }

    $path = $base['path'] ?? '/';
    $dir = preg_replace('#/[^/]*$#', '/', $path);
    if ($dir === null || $dir === '') {
        $dir = '/';
    }
    return $scheme . '://' . $host . $port . $dir . $location;
}

/**
 * Extract the first Location header value from a raw header block.
 */
function extractHealthLocationHeader($rawHeaders) {
    if (!is_string($rawHeaders) || $rawHeaders === '') {
        return null;
    }
    if (preg_match('/^Location:\s*(.+)$/im', $rawHeaders, $m)) {
        return trim($m[1]);
    }
    return null;
}

/**
 * Interactive probe: follow redirects hop-by-hop and return the full chain
 * (URL + status per hop) for the edit-form redirect badge.
 */
function checkUrlHealthWithRedirectChain($url, $timeoutSeconds = 5) {
    if (shouldSkipLinkHealthCheck($url)) {
        return [
            'status' => null,
            'http_code' => 0,
            'error' => null,
            'server_latency' => 0,
            'skipped' => true,
            'redirect_count' => 0,
            'redirect_chain' => []
        ];
    }
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        return [
            'status' => 'broken',
            'http_code' => 0,
            'error' => 'Invalid URL format',
            'server_latency' => 0,
            'redirect_count' => 0,
            'redirect_chain' => []
        ];
    }

    $timeoutSeconds = max(1, min(60, (int)$timeoutSeconds));
    $deadline = microtime(true) + $timeoutSeconds;
    $start = microtime(true);
    $chain = [];
    $currentUrl = $url;
    $redirectCount = 0;
    $httpCode = 0;
    $errno = 0;
    $error = '';

    while (true) {
        $remaining = $deadline - microtime(true);
        if ($remaining <= 0.05) {
            $errno = CURLE_OPERATION_TIMEDOUT;
            $error = 'Connection timed out';
            break;
        }

        $hopTimeout = max(1, min(5, (int)ceil($remaining)));
        $ch = createHealthCurlHandle($currentUrl, $hopTimeout, false);
        $raw = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $hopErrno = curl_errno($ch);
        $hopError = curl_error($ch);
        curl_close($ch);

        if ($hopErrno !== 0 && $code === 0) {
            $errno = $hopErrno;
            $error = $hopError;
            $chain[] = [
                'step' => count($chain),
                'url' => $currentUrl,
                'httpCode' => 0,
                'error' => $hopError !== '' ? $hopError : 'Request failed'
            ];
            break;
        }

        $location = null;
        if ($code >= 300 && $code < 400) {
            $location = extractHealthLocationHeader($raw);
        }

        $entry = [
            'step' => count($chain),
            'url' => $currentUrl,
            'httpCode' => $code
        ];
        if ($location !== null && $location !== '') {
            $entry['location'] = $location;
        }
        $chain[] = $entry;
        $httpCode = $code;
        $errno = 0;
        $error = '';

        if ($code < 300 || $code >= 400) {
            // Final non-redirect response
            break;
        }

        // 3xx — follow if under the hop cap
        if ($redirectCount >= (int)HEALTH_MAX_REDIRS) {
            $errno = CURLE_TOO_MANY_REDIRECTS;
            $error = 'Maximum (' . (int)HEALTH_MAX_REDIRS . ') redirects followed';
            break;
        }

        $next = resolveHealthRedirectUrl($currentUrl, $location ?? '');
        if ($next === null) {
            // Redirect response without a usable Location
            break;
        }

        $redirectCount++;
        $currentUrl = $next;
    }

    $serverLatency = round((microtime(true) - $start) * 1000);
    $statusResult = determineHealthStatus($httpCode, $errno, $error, $redirectCount);

    $finalUrl = null;
    if (!empty($chain)) {
        $lastUrl = (string)$chain[count($chain) - 1]['url'];
        if ($lastUrl !== '' && strcasecmp($lastUrl, $url) !== 0) {
            $finalUrl = $lastUrl;
        } elseif ($redirectCount > 0 && $currentUrl !== '' && strcasecmp($currentUrl, $url) !== 0) {
            $finalUrl = $currentUrl;
        }
    }

    return [
        'status' => $statusResult['status'],
        'http_code' => $httpCode,
        'error' => $statusResult['error'],
        'errno' => (int)$errno,
        'server_latency' => $serverLatency,
        'final_url' => $finalUrl,
        'redirect_count' => $redirectCount,
        'redirect_chain' => $chain
    ];
}

/**
 * Check multiple URLs in parallel using curl_multi (rolling concurrency window).
 * Returns array of results indexed by URL.
 */
function checkUrlsParallel($urls, $maxConcurrent = 12) {
    if (empty($urls)) {
        return [];
    }

    $urls = array_values(array_unique($urls));
    $maxConcurrent = max(1, min(20, (int)$maxConcurrent));

    if (count($urls) === 1) {
        $url = $urls[0];
        return [$url => checkUrlHealth($url, 2)];
    }

    $results = [];
    $queue = [];

    foreach ($urls as $url) {
        if (!filter_var($url, FILTER_VALIDATE_URL)) {
            $results[$url] = [
                'status' => 'broken',
                'http_code' => 0,
                'error' => 'Invalid URL format',
                'server_latency' => 0
            ];
            continue;
        }
        $queue[] = $url;
    }

    if (empty($queue)) {
        return $results;
    }

    $multiHandle = curl_multi_init();
    if (defined('CURLMOPT_MAX_TOTAL_CONNECTIONS')) {
        curl_multi_setopt($multiHandle, CURLMOPT_MAX_TOTAL_CONNECTIONS, $maxConcurrent);
    }

    // url => ['ch' => resource, 'started' => float]
    $active = [];
    $queueIndex = 0;
    $queueCount = count($queue);
    $overallStart = microtime(true);
    $maxTotalTime = min(8.0, 1.5 + (ceil($queueCount / $maxConcurrent) * 2.0));

    $recordResult = function ($url, $ch, $startedAt) use (&$results) {
        $serverLatency = round((microtime(true) - $startedAt) * 1000);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $redirectCount = (int)curl_getinfo($ch, CURLINFO_REDIRECT_COUNT);
        $effectiveUrl = (string)curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
        $error = curl_error($ch);
        $errno = curl_errno($ch);
        $statusResult = determineHealthStatus($httpCode, $errno, $error, $redirectCount);
        $finalUrl = null;
        if ($effectiveUrl !== '' && strcasecmp($effectiveUrl, $url) !== 0) {
            $finalUrl = $effectiveUrl;
        } elseif ($redirectCount > 0 && $effectiveUrl !== '') {
            $finalUrl = $effectiveUrl;
        }
        $results[$url] = [
            'status' => $statusResult['status'],
            'http_code' => $httpCode,
            'error' => $statusResult['error'],
            'errno' => (int)$errno,
            'server_latency' => $serverLatency,
            'final_url' => $finalUrl,
            'redirect_count' => $redirectCount
        ];
    };

    $addNext = function () use (&$queue, &$queueIndex, $queueCount, $multiHandle, &$active) {
        if ($queueIndex >= $queueCount) {
            return false;
        }
        $url = $queue[$queueIndex++];
        $ch = createHealthCurlHandle($url, 2);
        curl_multi_add_handle($multiHandle, $ch);
        $active[$url] = ['ch' => $ch, 'started' => microtime(true)];
        return true;
    };

    for ($i = 0; $i < $maxConcurrent && $queueIndex < $queueCount; $i++) {
        $addNext();
    }

    $running = null;
    $mrc = CURLM_OK;
    do {
        do {
            $mrc = curl_multi_exec($multiHandle, $running);
        } while ($mrc === CURLM_CALL_MULTI_PERFORM);

        while ($info = curl_multi_info_read($multiHandle)) {
            if ($info['msg'] !== CURLMSG_DONE) {
                continue;
            }
            $ch = $info['handle'];
            $doneUrl = null;
            foreach ($active as $url => $meta) {
                if ($meta['ch'] === $ch) {
                    $doneUrl = $url;
                    break;
                }
            }
            if ($doneUrl !== null) {
                $recordResult($doneUrl, $ch, $active[$doneUrl]['started']);
                unset($active[$doneUrl]);
            }
            curl_multi_remove_handle($multiHandle, $ch);
            $addNext();
        }

        if ((microtime(true) - $overallStart) > $maxTotalTime) {
            break;
        }

        if ($running > 0) {
            curl_multi_select($multiHandle, 0.05);
        }
    } while (($running > 0 || $queueIndex < $queueCount) && $mrc === CURLM_OK);

    // Cancel anything still in-flight (wall-clock cap reached)
    foreach ($active as $url => $meta) {
        $ch = $meta['ch'];
        $results[$url] = [
            'status' => 'timeout',
            'http_code' => 0,
            'error' => 'Request timeout',
            'errno' => CURLE_OPERATION_TIMEDOUT,
            'server_latency' => round((microtime(true) - $meta['started']) * 1000)
        ];
        curl_multi_remove_handle($multiHandle, $ch);
    }
    $active = [];
    foreach ($queue as $url) {
        if (!isset($results[$url])) {
            $results[$url] = [
                'status' => 'timeout',
                'http_code' => 0,
                'error' => 'Request timeout',
                'errno' => CURLE_OPERATION_TIMEDOUT,
                'server_latency' => 0
            ];
        }
    }

    return $results;
}

/**
 * Update link health status in database (non-blocking with timeout)
 */
function updateLinkHealth($linkId, $healthResult) {
    if (!isPersistableLinkHealthStatus($healthResult['status'] ?? '')) {
        return;
    }
    // Use a very short timeout to prevent hanging
    $maxRetries = 2; // Reduced from 3
    $retryDelay = 50000; // 50ms in microseconds (reduced from 100ms)
    
    for ($attempt = 0; $attempt < $maxRetries; $attempt++) {
        try {
            $db = getDB();
            // Set very short busy timeout to fail fast
            $db->exec('PRAGMA busy_timeout = 500'); // Only wait 500ms for locks
            
            // Use a prepared statement for safety
            $stmt = $db->prepare('UPDATE links SET health_status = ?, health_http_code = ?, health_error = ?, health_checked_at = ? WHERE id = ?');
            
            // Set a timeout for the execute operation
            $startTime = microtime(true);
            $stmt->execute([
                $healthResult['status'],
                $healthResult['http_code'],
                $healthResult['error'],
                time(),
                $linkId
            ]);
            $executeTime = microtime(true) - $startTime;
            
            // If execute took too long, log it but continue
            if ($executeTime > 0.5) {
                error_log("Slow DB update for link $linkId: " . number_format($executeTime, 2) . "s");
            }
            
            return; // Success - exit function
        } catch (PDOException $e) {
            $errorCode = $e->getCode();
            $errorMsg = $e->getMessage();
            
            // SQLITE_BUSY = 5, SQLITE_LOCKED = 6
            if (($errorCode == 5 || $errorCode == 6) && $attempt < $maxRetries - 1) {
                // Database is busy/locked - retry after short delay
                usleep($retryDelay * ($attempt + 1));
                continue;
            }
            
            // Log but don't throw - allow operation to continue
            error_log("Failed to update link health for $linkId (attempt " . ($attempt + 1) . "): $errorMsg");
            return; // Exit on final failure
        }
    }
    
    // If we get here, all retries failed - log and continue
    error_log("All retries failed for link $linkId");
}

/**
 * Batch update link health statuses in database (much faster with transaction)
 */
function updateLinkHealthBatch($updates) {
    if (empty($updates)) {
        return;
    }
    
    // For small batches, use individual updates to avoid lock issues
    if (count($updates) <= 3) {
        foreach ($updates as $linkId => $healthResult) {
            updateLinkHealth($linkId, $healthResult);
        }
        return;
    }
    
    try {
        $db = getDB();
        // Set busy timeout to handle concurrent access
        $db->exec('PRAGMA busy_timeout = 3000'); // Wait up to 3 seconds for locks
        
        // Use deferred transaction (default) instead of immediate to reduce contention
        $db->beginTransaction();
        
        $stmt = $db->prepare('UPDATE links SET health_status = ?, health_http_code = ?, health_error = ?, health_checked_at = ? WHERE id = ?');
        $now = time();
        
        foreach ($updates as $linkId => $healthResult) {
            if (!isPersistableLinkHealthStatus($healthResult['status'] ?? '')) {
                continue;
            }
            try {
                $stmt->execute([
                    $healthResult['status'],
                    $healthResult['http_code'],
                    $healthResult['error'],
                    $now,
                    $linkId
                ]);
            } catch (PDOException $e) {
                // Log individual update failure but continue with others
                error_log("Failed to update health for link $linkId: " . $e->getMessage());
            }
        }
        
        $db->commit();
    } catch (PDOException $e) {
        try {
            if (isset($db) && $db->inTransaction()) {
                $db->rollBack();
            }
        } catch (Exception $rollbackError) {
            // Ignore rollback errors
        }
        error_log('Batch health update failed: ' . $e->getMessage());
        // Fallback: try individual updates without transaction
        foreach ($updates as $linkId => $healthResult) {
            updateLinkHealth($linkId, $healthResult);
        }
    }
}

/**
 * GET /api/linkhealth.php - Get health status for all links
 */
function handleGetHealthStatus() {
    try {
        // Clean any existing output
        if (ob_get_level() > 0) {
            ob_clean();
        }
        
        $db = getDB();
        
        if (!$db) {
            throw new Exception('Database connection failed');
        }
        
        // Check if links table exists
        try {
            $tableCheck = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='links'");
            if (!$tableCheck || !$tableCheck->fetch()) {
                // Clean output before sending
                if (ob_get_level() > 0) {
                    ob_clean();
                }
                sendJSON(['health' => []]);
                return;
            }
        } catch (Exception $e) {
            // Table check failed, try query anyway
            error_log('Table check failed: ' . $e->getMessage());
        }
        
        // Get all links with their health status
        // Use LEFT JOIN to handle links without sections
        $stmt = $db->prepare('
            SELECT l.id, l.url, l.health_status, l.health_http_code, l.health_error, l.health_checked_at,
                   s.tile_id
            FROM links l
            LEFT JOIN sections s ON l.section_id = s.id
        ');
        
        if (!$stmt) {
            throw new Exception('Failed to prepare query');
        }
        
        $stmt->execute();
        $links = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        if ($links === false) {
            $links = [];
        }
        
        $result = [];
        foreach ($links as $link) {
            if (!isset($link['id'])) {
                continue; // Skip invalid rows
            }

            // Never surface health for SSH / non-HTTP / exception-listed links
            if (shouldSkipLinkHealthCheck($link['url'] ?? '')) {
                if (!empty($link['health_status'])) {
                    clearLinkHealth($link['id']);
                }
                continue;
            }
            
            $result[$link['id']] = [
                'status' => $link['health_status'] ?? 'unknown',
                'httpCode' => isset($link['health_http_code']) && $link['health_http_code'] !== '' ? (int)$link['health_http_code'] : null,
                'error' => $link['health_error'] ?? null,
                'checkedAt' => isset($link['health_checked_at']) && $link['health_checked_at'] ? (int)$link['health_checked_at'] : null,
                'tileId' => $link['tile_id'] ?? null
            ];
        }
        
        // Clean output buffer before sending JSON
        if (ob_get_level() > 0) {
            ob_clean();
        }
        
        sendJSON(['health' => $result]);
        
    } catch (PDOException $e) {
        error_log('LinkHealth API PDO error: ' . $e->getMessage() . ' | SQL State: ' . $e->getCode());
        // Clean output buffer before sending error
        if (ob_get_level() > 0) {
            ob_clean();
        }
        // Try to send error response
        if (!headers_sent()) {
            sendJSON([
                'error' => 'Database error',
                'details' => $e->getMessage()
            ], 500);
        } else {
            error_log('Cannot send JSON response - headers already sent');
        }
    } catch (Exception $e) {
        error_log('LinkHealth API error: ' . $e->getMessage() . ' | File: ' . $e->getFile() . ' | Line: ' . $e->getLine());
        // Clean output buffer before sending error
        if (ob_get_level() > 0) {
            ob_clean();
        }
        // Try to send error response
        if (!headers_sent()) {
            sendJSON([
                'error' => 'Failed to get health status',
                'details' => $e->getMessage()
            ], 500);
        } else {
            error_log('Cannot send JSON response - headers already sent');
        }
    }
}

/**
 * GET /api/linkhealth.php/stats - Get health statistics
 */
function handleGetHealthStats() {
    try {
        $db = getDB();
        
        $stmt = $db->prepare('
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN health_status = "healthy" THEN 1 ELSE 0 END) as healthy,
                SUM(CASE WHEN health_status = "broken" THEN 1 ELSE 0 END) as broken,
                SUM(CASE WHEN health_status = "timeout" THEN 1 ELSE 0 END) as timeout,
                SUM(CASE WHEN health_status = "restricted" OR health_status = "accessible" THEN 1 ELSE 0 END) as accessible,
                SUM(CASE WHEN health_status = "network" THEN 1 ELSE 0 END) as network,
                SUM(CASE WHEN health_status = "unknown" OR health_status IS NULL THEN 1 ELSE 0 END) as unknown
            FROM links
        ');
        $stmt->execute();
        $stats = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$stats) {
            $stats = [
                'total' => 0,
                'healthy' => 0,
                'broken' => 0,
                'timeout' => 0,
                'accessible' => 0,
                'network' => 0,
                'unknown' => 0
            ];
        }
        
        sendJSON([
            'stats' => [
                'total' => (int)($stats['total'] ?? 0),
                'healthy' => (int)($stats['healthy'] ?? 0),
                'broken' => (int)($stats['broken'] ?? 0),
                'timeout' => (int)($stats['timeout'] ?? 0),
                'accessible' => (int)($stats['accessible'] ?? 0),
                'network' => (int)($stats['network'] ?? 0),
                'unknown' => (int)($stats['unknown'] ?? 0)
            ]
        ]);
        
    } catch (PDOException $e) {
        error_log('LinkHealth Stats API error: ' . $e->getMessage());
        sendJSON([
            'error' => 'Database error',
            'details' => $e->getMessage()
        ], 500);
    } catch (Exception $e) {
        error_log('LinkHealth Stats API error: ' . $e->getMessage() . ' | File: ' . $e->getFile() . ' | Line: ' . $e->getLine());
        sendJSON([
            'error' => 'Failed to get health stats',
            'details' => $e->getMessage()
        ], 500);
    }
}

/**
 * POST /api/linkhealth.php/check-url - Probe an arbitrary URL (edit-form preview / guest bookmarks)
 * Returns round-trip latency and HTTP status without requiring a saved link ID.
 * Guests are allowed (Your Bookmarks) with a per-session rate limit.
 */
function enforceUrlProbeRateLimit($maxPerMinute = 80) {
    $key = 'linkhealth_url_probe_ts';
    $now = time();
    if (!isset($_SESSION[$key]) || !is_array($_SESSION[$key])) {
        $_SESSION[$key] = [];
    }
    $_SESSION[$key] = array_values(array_filter($_SESSION[$key], function ($t) use ($now) {
        return ($now - (int)$t) < 60;
    }));
    if (count($_SESSION[$key]) >= (int)$maxPerMinute) {
        sendJSON(['error' => 'Too many link checks. Please wait a minute and try again.'], 429);
        return false;
    }
    $_SESSION[$key][] = $now;
    return true;
}

/**
 * POST /api/linkhealth.php/check-urls — Probe up to 20 URLs in parallel (guest bookmarks).
 */
function handleCheckUrls() {
    // Count one rate token per batch (not per URL) so large spaces can finish
    if (!enforceUrlProbeRateLimit(120)) {
        return;
    }
    releaseSessionLock();
    set_time_limit(30);

    try {
        $data = getJSONInput();
        $rawUrls = isset($data['urls']) && is_array($data['urls']) ? $data['urls'] : [];
        $urls = [];
        foreach ($rawUrls as $u) {
            if (!is_string($u)) continue;
            $url = trim($u);
            if ($url === '') continue;
            if (!preg_match('#^https?://#i', $url)) {
                $url = 'https://' . $url;
            }
            $parts = parse_url($url);
            $scheme = strtolower((string)($parts['scheme'] ?? ''));
            if ($scheme !== 'http' && $scheme !== 'https') continue;
            if (isLinkCheckExceptionUrl($url) || shouldSkipLinkHealthCheck($url)) {
                $urls[] = $url;
                if (count($urls) >= 20) break;
                continue;
            }
            if (!filter_var($url, FILTER_VALIDATE_URL)) continue;
            $urls[] = $url;
            if (count($urls) >= 20) break;
        }

        if (empty($urls)) {
            sendJSON(['error' => 'Provide a non-empty urls array (http/https only).'], 400);
            return;
        }

        $probe = [];
        $skipped = [];
        foreach ($urls as $url) {
            if (isLinkCheckExceptionUrl($url) || shouldSkipLinkHealthCheck($url)) {
                $skipped[$url] = true;
            } else {
                $probe[] = $url;
            }
        }

        $parallel = !empty($probe) ? checkUrlsParallel($probe, 10) : [];
        $networkUnreachable = reclassifyHealthResultsIfNetworkUnreachable($parallel);
        $results = [];
        foreach ($urls as $url) {
            if (!empty($skipped[$url])) {
                $results[] = [
                    'url' => $url,
                    'skipped' => true,
                    'health' => null
                ];
                continue;
            }
            $healthResult = $parallel[$url] ?? (
                $networkUnreachable
                    ? networkUnreachableHealthResult(['server_latency' => 0])
                    : [
                        'status' => 'broken',
                        'http_code' => 0,
                        'error' => 'No result',
                        'server_latency' => 0
                    ]
            );
            if (!empty($healthResult['skipped'])) {
                $results[] = [
                    'url' => $url,
                    'skipped' => true,
                    'health' => null
                ];
                continue;
            }
            $results[] = [
                'url' => $url,
                'health' => [
                    'status' => $healthResult['status'],
                    'httpCode' => !empty($healthResult['http_code']) ? (int)$healthResult['http_code'] : null,
                    'error' => $healthResult['error'] ?? null,
                    'serverLatency' => $healthResult['server_latency'] ?? 0,
                    'finalUrl' => !empty($healthResult['final_url']) ? (string)$healthResult['final_url'] : null,
                    'redirectCount' => isset($healthResult['redirect_count']) ? (int)$healthResult['redirect_count'] : 0,
                    'checkedAt' => time()
                ]
            ];
        }

        sendJSON([
            'success' => true,
            'results' => $results
        ]);
    } catch (Exception $e) {
        error_log('URL batch probe failed: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to check URLs: ' . $e->getMessage()], 500);
    }
}

function handleCheckUrl() {
    if (!enforceUrlProbeRateLimit(120)) {
        return;
    }
    releaseSessionLock();
    set_time_limit(90);

    try {
        $data = getJSONInput();
        $url = isset($data['url']) ? trim((string)$data['url']) : '';

        if ($url === '') {
            sendJSON(['error' => 'URL is required'], 400);
            return;
        }

        // Normalize scheme-less URLs
        if (!preg_match('#^https?://#i', $url)) {
            $url = 'https://' . $url;
        }

        $parts = parse_url($url);
        $scheme = strtolower((string)($parts['scheme'] ?? ''));
        if ($scheme !== 'http' && $scheme !== 'https') {
            sendJSON(['error' => 'Only HTTP and HTTPS URLs are supported'], 400);
            return;
        }

        if (isLinkCheckExceptionUrl($url)) {
            sendJSON([
                'success' => true,
                'url' => $url,
                'scheme' => $scheme,
                'skipped' => true,
                'health' => null
            ]);
            return;
        }

        if (!filter_var($url, FILTER_VALIDATE_URL)) {
            sendJSON([
                'success' => true,
                'url' => $url,
                'scheme' => $scheme,
                'health' => [
                    'status' => 'broken',
                    'httpCode' => null,
                    'error' => 'Invalid URL format',
                    'serverLatency' => 0,
                    'checkedAt' => time()
                ]
            ]);
            return;
        }

        // Interactive edit-form probe: hop-by-hop chain for the redirects badge
        $healthResult = checkUrlHealthWithRedirectChain($url, 60);
        $healthResult = reclassifySingleHealthIfNetworkUnreachable($healthResult);

        $redirectChain = [];
        if (!empty($healthResult['redirect_chain']) && is_array($healthResult['redirect_chain'])) {
            foreach ($healthResult['redirect_chain'] as $hop) {
                if (!is_array($hop) || empty($hop['url'])) {
                    continue;
                }
                $item = [
                    'step' => isset($hop['step']) ? (int)$hop['step'] : count($redirectChain),
                    'url' => (string)$hop['url'],
                    'httpCode' => isset($hop['httpCode']) ? (int)$hop['httpCode'] : 0
                ];
                if (!empty($hop['location'])) {
                    $item['location'] = (string)$hop['location'];
                }
                if (!empty($hop['error'])) {
                    $item['error'] = (string)$hop['error'];
                }
                $redirectChain[] = $item;
            }
        }

        sendJSON([
            'success' => true,
            'url' => $url,
            'scheme' => $scheme,
            'health' => [
                'status' => $healthResult['status'],
                'httpCode' => $healthResult['http_code'] ?: null,
                'error' => $healthResult['error'],
                'serverLatency' => $healthResult['server_latency'],
                'finalUrl' => !empty($healthResult['final_url']) ? (string)$healthResult['final_url'] : null,
                'redirectCount' => isset($healthResult['redirect_count']) ? (int)$healthResult['redirect_count'] : 0,
                'redirectChain' => $redirectChain,
                'checkedAt' => time()
            ]
        ]);
    } catch (Exception $e) {
        error_log('URL probe failed: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to check URL: ' . $e->getMessage()], 500);
    }
}

/**
 * POST /api/linkhealth.php/check - Check a single link
 */
function handleCheckSingleLink() {
    // Set execution time limit for this specific request
    set_time_limit(5);
    // Unlock session immediately so other page loads are not blocked while we curl
    releaseSessionLock();
    
    $startTime = microtime(true);
    $healthResult = null;
    $link = null;
    
    try {
        $data = getJSONInput();
        
        if (!isset($data['linkId'])) {
            sendJSON(['error' => 'Link ID is required'], 400);
            return;
        }
        
        // Get link info quickly
        $db = getDB();
        $db->exec('PRAGMA busy_timeout = 500'); // Very short timeout - 500ms max wait
        
        $stmt = $db->prepare('SELECT id, url, health_status, health_http_code FROM links WHERE id = ?');
        $stmt->execute([$data['linkId']]);
        $link = $stmt->fetch();
        
        if (!$link) {
            sendJSON(['error' => 'Link not found'], 404);
            return;
        }

        // SSH / RDP / non-HTTP / exception-listed links are not HTTP-probed
        if (shouldSkipLinkHealthCheck($link['url'])) {
            clearLinkHealth($link['id']);
            sendJSON([
                'success' => true,
                'linkId' => $link['id'],
                'skipped' => true,
                'health' => null
            ]);
            return;
        }
        
        // Always perform a fresh check for individual link health checks
        // This ensures consistent results with the "Check Links" button
        
        // Check the link (this should complete in ~1 second with our timeout)
        $checkStart = microtime(true);
        $healthResult = checkUrlHealth($link['url']);
        $healthResult = reclassifySingleHealthIfNetworkUnreachable($healthResult);
        $checkTime = microtime(true) - $checkStart;
        
        // Log if check took too long
        if ($checkTime > 1.5) {
            error_log("Slow link check for {$link['url']}: " . number_format($checkTime, 2) . "s");
        }
        
        // Update database in background (non-blocking)
        // Don't wait for DB update - return result immediately
        updateLinkHealth($link['id'], $healthResult);
        
        $totalTime = microtime(true) - $startTime;
        
        sendJSON([
            'success' => true,
            'linkId' => $link['id'],
            'health' => [
                'status' => $healthResult['status'],
                'httpCode' => $healthResult['http_code'],
                'error' => $healthResult['error'],
                'serverLatency' => $healthResult['server_latency'],
                'checkedAt' => time()
            ]
        ]);
    } catch (PDOException $e) {
        error_log('Single link check database error: ' . $e->getMessage());
        // Return health result if we have it, even if DB failed
        if ($healthResult && $link) {
            sendJSON([
                'success' => true,
                'linkId' => $link['id'],
                'health' => [
                    'status' => $healthResult['status'],
                    'httpCode' => $healthResult['http_code'],
                    'error' => $healthResult['error'],
                    'serverLatency' => $healthResult['server_latency'],
                    'checkedAt' => time()
                ]
            ]);
        } else {
            sendJSON(['error' => 'Database error. Please try again.'], 500);
        }
    } catch (Exception $e) {
        error_log('Single link check failed: ' . $e->getMessage());
        // Still return health result if we have it
        if ($healthResult && $link) {
            sendJSON([
                'success' => true,
                'linkId' => $link['id'],
                'health' => [
                    'status' => $healthResult['status'],
                    'httpCode' => $healthResult['http_code'],
                    'error' => $healthResult['error'],
                    'serverLatency' => $healthResult['server_latency'],
                    'checkedAt' => time()
                ]
            ]);
        } else {
            sendJSON(['error' => 'Failed to check link: ' . $e->getMessage()], 500);
        }
    }
}

/**
 * POST /api/linkhealth.php/check-tile - Check all links in a tile
 */
function handleCheckTileLinks() {
    try {
        // Critical: release session lock before slow network probes so navigating
        // back to the main page does not wait on this request (looks like a freeze/refresh).
        releaseSessionLock();
        set_time_limit(20);

        $data = getJSONInput();
        
        if (!isset($data['tileId'])) {
            sendJSON(['error' => 'Tile ID is required'], 400);
            return;
        }
        
        // Check if force re-check is requested (default to true for "Check Links" button)
        $force = isset($data['force']) ? (bool)$data['force'] : true;
        
        $db = getDB();
        // Set busy timeout to handle concurrent access
        $db->exec('PRAGMA busy_timeout = 1500');
        
        // Get all links for this tile (tabbed + legacy sections), including last health check info
        // NOTE: Some installations store sections under tabs with s.tile_id unset; those must be resolved via tabs.tile_id.
        $stmt = $db->prepare('
            SELECT l.id, l.url, l.health_status, l.health_http_code, l.health_error, l.health_checked_at
            FROM links l
            JOIN sections s ON l.section_id = s.id
            LEFT JOIN tabs t ON s.tab_id = t.id
            WHERE (t.tile_id = ? OR s.tile_id = ?)
        ');
        $stmt->execute([$data['tileId'], $data['tileId']]);
        $links = $stmt->fetchAll();
        
        if (empty($links)) {
            sendJSON(['success' => true, 'checked' => 0, 'results' => []]);
            return;
        }
        
        $results = [];
        $networkUnreachable = false;
        $now = time();
        $tileMaxAge = 300; // 5 minutes
        
        // Separate links that need checking from those that don't
        // Use array structure to handle duplicate URLs properly
        $linksToCheck = [];
        $urlToLinkIds = []; // Map URL to array of link IDs (handles duplicates)
        
        foreach ($links as $link) {
            $lastChecked = isset($link['health_checked_at']) ? (int)$link['health_checked_at'] : null;
            $currentStatus = $link['health_status'] ?? null;

            // Skip SSH / RDP / non-HTTP / exception-listed URLs — never mark them broken via HTTP probe
            if (shouldSkipLinkHealthCheck($link['url'])) {
                clearLinkHealth($link['id']);
                $results[$link['id']] = [
                    'skipped' => true,
                    'status' => null,
                    'httpCode' => null,
                    'error' => null,
                    'checkedAt' => null
                ];
                continue;
            }
            
            // If force is true, check all links regardless of when they were last checked
            if ($force) {
                // Force mode: check all links to ensure fresh results
                // Add to check queue
                if (!isset($urlToLinkIds[$link['url']])) {
                    $urlToLinkIds[$link['url']] = [];
                    $linksToCheck[] = $link['url'];
                }
                $urlToLinkIds[$link['url']][] = $link['id'];
            } else {
                // Non-force mode: skip recently checked links
                if ($lastChecked !== null && ($now - $lastChecked) < $tileMaxAge && !empty($currentStatus)) {
                    // Recently checked - return existing health info
                    $results[$link['id']] = [
                        'status' => $currentStatus,
                        'httpCode' => $link['health_http_code'] ? (int)$link['health_http_code'] : null,
                        'error' => $link['health_error'],
                        'checkedAt' => $lastChecked
                    ];
                } else {
                    // Needs a fresh check - add to batch
                    if (!isset($urlToLinkIds[$link['url']])) {
                        $urlToLinkIds[$link['url']] = [];
                        $linksToCheck[] = $link['url'];
                    }
                    $urlToLinkIds[$link['url']][] = $link['id'];
                }
            }
        }
        
        // Check all URLs in parallel (rolling window of concurrent probes)
        if (!empty($linksToCheck)) {
            $healthResults = checkUrlsParallel($linksToCheck, 12);
            $networkUnreachable = reclassifyHealthResultsIfNetworkUnreachable($healthResults);
            
            // Prepare batch update
            $batchUpdates = [];
            foreach ($healthResults as $url => $healthResult) {
                // Handle multiple links with the same URL
                if (isset($urlToLinkIds[$url])) {
                    foreach ($urlToLinkIds[$url] as $linkId) {
                        $batchUpdates[$linkId] = $healthResult;
                        
                        $results[$linkId] = [
                            'status' => $healthResult['status'],
                            'httpCode' => $healthResult['http_code'],
                            'error' => $healthResult['error'],
                            'serverLatency' => $healthResult['server_latency'],
                            'checkedAt' => $now
                        ];
                    }
                }
            }
            
            // Batch update database (faster than individual updates)
            updateLinkHealthBatch($batchUpdates);
        }
        
        sendJSON([
            'success' => true,
            'checked' => count($links),
            'networkUnreachable' => !empty($networkUnreachable),
            'results' => $results
        ]);
    } catch (PDOException $e) {
        error_log('Tile link check database error: ' . $e->getMessage());
        sendJSON(['error' => 'Database error. Please try again.'], 500);
    } catch (Throwable $e) {
        error_log('Tile link check failed: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to check tile links: ' . $e->getMessage()], 500);
    }
}

/**
 * POST /api/linkhealth.php/check-all - Check all links (admin only)
 */
function handleCheckAllLinks() {
    requireAuth(); // Require authentication for bulk check
    releaseSessionLock();
    set_time_limit(60);
    
    $data = getJSONInput();
    $forceRecheck = $data['force'] ?? false;
    $maxAge = $data['maxAge'] ?? 3600; // Default: recheck if older than 1 hour
    
    $db = getDB();
    
    // Get links that need checking
    if ($forceRecheck) {
        $stmt = $db->prepare('SELECT id, url FROM links');
        $stmt->execute();
    } else {
        // Only check links that haven't been checked recently
        $cutoff = time() - $maxAge;
        $stmt = $db->prepare('SELECT id, url FROM links WHERE health_checked_at IS NULL OR health_checked_at < ?');
        $stmt->execute([$cutoff]);
    }
    
    $links = $stmt->fetchAll();
    
    if (empty($links)) {
        sendJSON(['success' => true, 'checked' => 0, 'message' => 'All links are up to date']);
        return;
    }
    
    // Prepare URLs for parallel checking
    // Use array structure to handle duplicate URLs properly
    $urls = [];
    $urlToLinkIds = []; // Map URL to array of link IDs (handles duplicates)
    $skippedIds = [];
    foreach ($links as $link) {
        if (shouldSkipLinkHealthCheck($link['url'])) {
            clearLinkHealth($link['id']);
            $skippedIds[] = $link['id'];
            continue;
        }
        if (!isset($urlToLinkIds[$link['url']])) {
            $urlToLinkIds[$link['url']] = [];
            $urls[] = $link['url'];
        }
        $urlToLinkIds[$link['url']][] = $link['id'];
    }
    
    // Rolling parallel checks (12 at a time)
    $allHealthResults = empty($urls) ? [] : checkUrlsParallel($urls, 12);
    $networkUnreachable = reclassifyHealthResultsIfNetworkUnreachable($allHealthResults);
    
    // Prepare batch update
    $batchUpdates = [];
    $results = [
        'healthy' => 0,
        'broken' => 0,
        'timeout' => 0,
        'unknown' => 0,
        'restricted' => 0,
        'network' => 0
    ];
    
    foreach ($allHealthResults as $url => $healthResult) {
        // Handle multiple links with the same URL
        if (isset($urlToLinkIds[$url])) {
            foreach ($urlToLinkIds[$url] as $linkId) {
                $batchUpdates[$linkId] = $healthResult;
                
                $status = $healthResult['status'];
                if (isset($results[$status])) {
                    $results[$status]++;
                } else {
                    $results['unknown']++;
                }
            }
        }
    }
    
    // Batch update database (much faster than individual updates)
    updateLinkHealthBatch($batchUpdates);
    
    sendJSON([
        'success' => true,
        'checked' => count($links),
        'networkUnreachable' => !empty($networkUnreachable),
        'results' => $results
    ]);
}

/**
 * GET /linkhealth/url-inventory — all stored link URLs (admin scan & fix).
 */
function handleGetUrlInventory() {
    requireAdmin();
    $db = getDB();
    $items = [];

    $stmt = $db->query("
        SELECT
            l.id AS id,
            l.url AS url,
            l.label AS label,
            COALESCE(tabs.tile_id, s.tile_id) AS tile_id,
            tiles.title AS tile_title,
            tiles.emoji AS tile_emoji,
            COALESCE(tiles.source_tab, 'public') AS source_tab,
            tabs.title AS tab_title,
            s.title AS section_title
        FROM links l
        INNER JOIN sections s ON l.section_id = s.id
        LEFT JOIN tabs ON tabs.id = s.tab_id
        INNER JOIN tiles ON tiles.id = COALESCE(tabs.tile_id, s.tile_id)
        WHERE tiles.deleted_at IS NULL
        ORDER BY tiles.title COLLATE NOCASE, tabs.title COLLATE NOCASE, s.title COLLATE NOCASE, l.label COLLATE NOCASE
    ");
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $items[] = [
            'kind' => 'link',
            'id' => (string)$row['id'],
            'url' => (string)($row['url'] ?? ''),
            'label' => (string)($row['label'] ?? ''),
            'tileId' => (string)($row['tile_id'] ?? ''),
            'tileTitle' => (string)($row['tile_title'] ?? ''),
            'tileEmoji' => (string)($row['tile_emoji'] ?? ''),
            'sourceTab' => (string)($row['source_tab'] ?? 'public'),
            'tabTitle' => (string)($row['tab_title'] ?? ''),
            'sectionTitle' => (string)($row['section_title'] ?? ''),
        ];
    }

    $hyper = $db->query("
        SELECT id, title, emoji, hyperlink_url, COALESCE(source_tab, 'public') AS source_tab
        FROM tiles
        WHERE deleted_at IS NULL
          AND is_hyperlink = 1
          AND hyperlink_url IS NOT NULL
          AND TRIM(hyperlink_url) != ''
        ORDER BY title COLLATE NOCASE
    ");
    while ($row = $hyper->fetch(PDO::FETCH_ASSOC)) {
        $items[] = [
            'kind' => 'hyperlink',
            'id' => (string)$row['id'],
            'url' => (string)($row['hyperlink_url'] ?? ''),
            'label' => (string)($row['title'] ?? ''),
            'tileId' => (string)$row['id'],
            'tileTitle' => (string)($row['title'] ?? ''),
            'tileEmoji' => (string)($row['emoji'] ?? ''),
            'sourceTab' => (string)($row['source_tab'] ?? 'public'),
            'tabTitle' => '',
            'sectionTitle' => '',
        ];
    }

    sendJSON([
        'success' => true,
        'count' => count($items),
        'items' => $items,
    ]);
}

/**
 * POST /linkhealth/fix-urls — apply suggested URL replacements (admin).
 */
function handleFixUrls() {
    requireAdmin();
    $data = getJSONInput();
    $changes = isset($data['changes']) && is_array($data['changes']) ? $data['changes'] : [];
    if (count($changes) === 0) {
        sendJSON(['error' => 'No URL changes provided'], 400);
        return;
    }
    if (count($changes) > 2000) {
        sendJSON(['error' => 'Too many URL changes in one request (max 2000)'], 400);
        return;
    }

    $db = getDB();
    $db->beginTransaction();
    $updated = 0;
    $skipped = 0;

    try {
        $linkStmt = $db->prepare('UPDATE links SET url = ?, health_status = NULL, health_http_code = NULL, health_error = NULL, health_checked_at = NULL WHERE id = ?');
        $hyperStmt = $db->prepare('UPDATE tiles SET hyperlink_url = ? WHERE id = ? AND is_hyperlink = 1 AND deleted_at IS NULL');

        foreach ($changes as $change) {
            if (!is_array($change)) {
                $skipped++;
                continue;
            }
            $id = isset($change['id']) ? trim((string)$change['id']) : '';
            $url = isset($change['url']) ? trim((string)$change['url']) : '';
            $kind = isset($change['kind']) ? strtolower(trim((string)$change['kind'])) : 'link';
            if ($id === '' || $url === '' || strlen($url) > 4096) {
                $skipped++;
                continue;
            }
            if ($kind === 'hyperlink') {
                $hyperStmt->execute([$url, $id]);
                $updated++;
            } else {
                $linkStmt->execute([$url, $id]);
                $updated++;
            }
        }

        $db->commit();
    } catch (Exception $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to update URLs: ' . $e->getMessage()], 500);
        return;
    }

    if (function_exists('invalidateGuestTilesListCache')) {
        invalidateGuestTilesListCache();
    }

    sendJSON([
        'success' => true,
        'updated' => $updated,
        'skipped' => $skipped,
    ]);
}

/**
 * Plain visible text for comparing / writing hover tooltips.
 */
function tooltipSyncPlainText($value): string {
    $text = html_entity_decode(strip_tags((string)$value), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = str_replace(["\xC2\xA0", "\xA0"], ' ', $text);
    $text = preg_replace('/\s+/u', ' ', $text) ?? $text;
    $text = trim($text);
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, 4096, 'UTF-8');
    }
    return substr($text, 0, 4096);
}

function tooltipSyncKey(string $plain): string {
    if (function_exists('mb_strtolower')) {
        return mb_strtolower($plain, 'UTF-8');
    }
    return strtolower($plain);
}

/**
 * GET /linkhealth/tooltip-inventory — links whose tooltip text does not match the link name.
 */
function handleGetTooltipInventory() {
    requireAdmin();
    $db = getDB();
    $items = [];
    $scanned = 0;
    $mismatched = 0;
    $empty = 0;

    $stmt = $db->query("
        SELECT
            l.id AS id,
            l.url AS url,
            l.label AS label,
            l.tooltip AS tooltip,
            COALESCE(tabs.tile_id, s.tile_id) AS tile_id,
            tiles.title AS tile_title,
            tiles.emoji AS tile_emoji,
            COALESCE(tiles.source_tab, 'public') AS source_tab,
            tabs.title AS tab_title,
            s.title AS section_title
        FROM links l
        INNER JOIN sections s ON l.section_id = s.id
        LEFT JOIN tabs ON tabs.id = s.tab_id
        INNER JOIN tiles ON tiles.id = COALESCE(tabs.tile_id, s.tile_id)
        WHERE tiles.deleted_at IS NULL
        ORDER BY tiles.title COLLATE NOCASE, tabs.title COLLATE NOCASE, s.title COLLATE NOCASE, l.label COLLATE NOCASE
    ");

    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $scanned++;
        $labelPlain = tooltipSyncPlainText($row['label'] ?? '');
        if ($labelPlain === '') {
            continue;
        }
        $tooltipPlain = tooltipSyncPlainText($row['tooltip'] ?? '');
        if (tooltipSyncKey($tooltipPlain) === tooltipSyncKey($labelPlain)) {
            continue;
        }
        $reason = $tooltipPlain === '' ? 'empty' : 'mismatch';
        if ($reason === 'empty') {
            $empty++;
        } else {
            $mismatched++;
        }
        $items[] = [
            'id' => (string)$row['id'],
            'url' => (string)($row['url'] ?? ''),
            'label' => (string)($row['label'] ?? ''),
            'tooltip' => (string)($row['tooltip'] ?? ''),
            'suggestedTooltip' => $labelPlain,
            'reason' => $reason,
            'tileId' => (string)($row['tile_id'] ?? ''),
            'tileTitle' => (string)($row['tile_title'] ?? ''),
            'tileEmoji' => (string)($row['tile_emoji'] ?? ''),
            'sourceTab' => (string)($row['source_tab'] ?? 'public'),
            'tabTitle' => (string)($row['tab_title'] ?? ''),
            'sectionTitle' => (string)($row['section_title'] ?? ''),
        ];
    }

    sendJSON([
        'success' => true,
        'scanned' => $scanned,
        'mismatched' => $mismatched,
        'empty' => $empty,
        'count' => count($items),
        'items' => $items,
    ]);
}

/**
 * POST /linkhealth/sync-tooltips — set selected link tooltips to the current link name (admin).
 */
function handleSyncTooltips() {
    requireAdmin();
    $data = getJSONInput();
    $ids = isset($data['ids']) && is_array($data['ids']) ? $data['ids'] : [];
    if (count($ids) === 0) {
        sendJSON(['error' => 'No links selected'], 400);
        return;
    }
    if (count($ids) > 2000) {
        sendJSON(['error' => 'Too many tooltip changes in one request (max 2000)'], 400);
        return;
    }

    $cleanIds = [];
    foreach ($ids as $id) {
        if (!is_string($id) && !is_int($id)) {
            continue;
        }
        $id = trim((string)$id);
        if ($id === '' || strlen($id) > 64) {
            continue;
        }
        $cleanIds[$id] = $id;
    }
    $cleanIds = array_values($cleanIds);
    if (count($cleanIds) === 0) {
        sendJSON(['error' => 'No valid link IDs provided'], 400);
        return;
    }

    $db = getDB();
    $db->beginTransaction();
    $updated = 0;
    $skipped = 0;

    try {
        $found = [];
        foreach (array_chunk($cleanIds, 400) as $chunk) {
            $placeholders = implode(',', array_fill(0, count($chunk), '?'));
            $select = $db->prepare("
                SELECT l.id, l.label, l.tooltip
                FROM links l
                INNER JOIN sections s ON l.section_id = s.id
                LEFT JOIN tabs ON tabs.id = s.tab_id
                INNER JOIN tiles ON tiles.id = COALESCE(tabs.tile_id, s.tile_id)
                WHERE tiles.deleted_at IS NULL
                  AND l.id IN ($placeholders)
            ");
            $select->execute($chunk);
            while ($row = $select->fetch(PDO::FETCH_ASSOC)) {
                $found[(string)$row['id']] = $row;
            }
        }

        $update = $db->prepare('UPDATE links SET tooltip = ? WHERE id = ?');
        foreach ($cleanIds as $id) {
            if (!isset($found[$id])) {
                $skipped++;
                continue;
            }
            $labelPlain = tooltipSyncPlainText($found[$id]['label'] ?? '');
            if ($labelPlain === '') {
                $skipped++;
                continue;
            }
            $currentPlain = tooltipSyncPlainText($found[$id]['tooltip'] ?? '');
            if (tooltipSyncKey($currentPlain) === tooltipSyncKey($labelPlain)
                && (string)($found[$id]['tooltip'] ?? '') === $labelPlain) {
                $skipped++;
                continue;
            }
            $update->execute([$labelPlain, $id]);
            $updated++;
        }

        $db->commit();
    } catch (Exception $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to sync tooltips: ' . $e->getMessage()], 500);
        return;
    }

    if (function_exists('invalidateGuestTilesListCache')) {
        invalidateGuestTilesListCache();
    }

    sendJSON([
        'success' => true,
        'updated' => $updated,
        'skipped' => $skipped,
    ]);
}


