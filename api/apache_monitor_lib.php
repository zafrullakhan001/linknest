<?php
/**
 * Apache realtime monitoring for admins: mod_status (?auto) + access-log tops.
 */

if (!defined('LINKNEST_APACHE_MONITOR_HISTORY_SEC')) {
    define('LINKNEST_APACHE_MONITOR_HISTORY_SEC', 7200);
}

if (!defined('LINKNEST_APACHE_MONITOR_MIN_INTERVAL')) {
    define('LINKNEST_APACHE_MONITOR_MIN_INTERVAL', 4);
}

if (!defined('LINKNEST_APACHE_MONITOR_LOG_BYTES')) {
    define('LINKNEST_APACHE_MONITOR_LOG_BYTES', 262144);
}

if (!defined('LINKNEST_APACHE_MONITOR_HISTORY_POINTS')) {
    define('LINKNEST_APACHE_MONITOR_HISTORY_POINTS', 80);
}

function apacheMonitorCacheDir(): string
{
    $dir = (defined('DB_DIR') ? DB_DIR : (__DIR__ . '/../data')) . DIRECTORY_SEPARATOR . 'cache';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir;
}

function apacheMonitorCacheFile(string $name): string
{
    $safe = preg_replace('/[^a-z0-9_]+/i', '_', $name) ?: 'item';
    return apacheMonitorCacheDir() . DIRECTORY_SEPARATOR . 'apache_monitor_' . $safe . '.json';
}

function apacheMonitorClearTtlCache(): void
{
    foreach (['requests', 'logs', 'disk', 'sqlite'] as $name) {
        $file = apacheMonitorCacheFile($name);
        if (is_file($file)) {
            @unlink($file);
        }
    }
}

/**
 * Short-lived file cache so dashboard polls do not re-parse logs / stat disks every hit.
 *
 * @template T of array
 * @param callable():T $builder
 * @return T
 */
function apacheMonitorTtlCache(string $name, int $ttlSec, callable $builder)
{
    $file = apacheMonitorCacheFile($name);
    if ($ttlSec > 0 && is_file($file)) {
        $age = time() - (int) filemtime($file);
        if ($age >= 0 && $age < $ttlSec) {
            $raw = @file_get_contents($file);
            if (is_string($raw) && $raw !== '') {
                $decoded = json_decode($raw, true);
                if (is_array($decoded)) {
                    return $decoded;
                }
            }
        }
    }
    $value = $builder();
    if (is_array($value)) {
        $json = json_encode(apacheMonitorJsonSafe($value));
        if (is_string($json)) {
            @file_put_contents($file, $json, LOCK_EX);
        }
    }
    return $value;
}

function ensureApacheMonitorSamplesTable(PDO $db): void
{
    static $ensured = false;
    if ($ensured) {
        return;
    }

    try {
        $db->exec('CREATE TABLE IF NOT EXISTS apache_monitor_samples (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sampled_at INTEGER NOT NULL,
            available INTEGER NOT NULL DEFAULT 0,
            busy_workers INTEGER,
            idle_workers INTEGER,
            req_per_sec REAL,
            bytes_per_sec REAL,
            bytes_per_req REAL,
            total_accesses INTEGER,
            total_kbytes INTEGER,
            uptime_seconds INTEGER
        )');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_apache_monitor_samples_at ON apache_monitor_samples(sampled_at)');
    } catch (PDOException $e) {
        error_log('ensureApacheMonitorSamplesTable warning: ' . $e->getMessage());
    }

    $ensured = true;
}

function apacheMonitorScoreboardCounts(string $scoreboard): array
{
    $counts = [
        'waiting' => 0,
        'starting' => 0,
        'reading' => 0,
        'sending' => 0,
        'keepalive' => 0,
        'dns' => 0,
        'closing' => 0,
        'logging' => 0,
        'graceful' => 0,
        'idleCleanup' => 0,
        'open' => 0,
        'other' => 0,
    ];

    $len = strlen($scoreboard);
    for ($i = 0; $i < $len; $i++) {
        $ch = $scoreboard[$i];
        if ($ch === "\r" || $ch === "\n" || $ch === ' ') {
            continue;
        }
        switch ($ch) {
            case '_':
                $counts['waiting']++;
                break;
            case 'S':
                $counts['starting']++;
                break;
            case 'R':
                $counts['reading']++;
                break;
            case 'W':
                $counts['sending']++;
                break;
            case 'K':
                $counts['keepalive']++;
                break;
            case 'D':
                $counts['dns']++;
                break;
            case 'C':
                $counts['closing']++;
                break;
            case 'L':
                $counts['logging']++;
                break;
            case 'G':
                $counts['graceful']++;
                break;
            case 'I':
                $counts['idleCleanup']++;
                break;
            case '.':
                $counts['open']++;
                break;
            default:
                $counts['other']++;
                break;
        }
    }

    return $counts;
}

function apacheMonitorParseAuto(string $body): ?array
{
    $body = trim(str_replace("\r\n", "\n", $body));
    if ($body === '' || stripos($body, '<html') !== false) {
        return null;
    }

    $fields = [];
    $scoreboard = '';
    $inScoreboard = false;

    foreach (explode("\n", $body) as $line) {
        $line = trim($line);
        if ($line === '') {
            continue;
        }
        if ($inScoreboard) {
            if (strpos($line, ':') !== false && preg_match('/^[A-Za-z][A-Za-z0-9 ]*:/', $line)) {
                $inScoreboard = false;
            } else {
                $scoreboard .= $line;
                continue;
            }
        }
        $pos = strpos($line, ':');
        if ($pos === false) {
            continue;
        }
        $key = trim(substr($line, 0, $pos));
        $value = trim(substr($line, $pos + 1));
        if ($key === 'Scoreboard') {
            $scoreboard = $value;
            $inScoreboard = true;
            continue;
        }
        $fields[$key] = $value;
    }

    $busy = apacheMonitorInt($fields['BusyWorkers'] ?? null);
    $idle = apacheMonitorInt($fields['IdleWorkers'] ?? null);
    $accesses = apacheMonitorInt($fields['Total Accesses'] ?? null);
    if ($busy === null && $idle === null && $accesses === null) {
        return null;
    }

    $uptime = apacheMonitorInt($fields['ServerUptimeSeconds'] ?? ($fields['Uptime'] ?? null));

    return [
        'serverVersion' => (string) ($fields['ServerVersion'] ?? ''),
        'mpm' => (string) ($fields['ServerMPM'] ?? ''),
        'currentTime' => (string) ($fields['CurrentTime'] ?? ''),
        'restartTime' => (string) ($fields['RestartTime'] ?? ''),
        'uptimeSeconds' => $uptime,
        'uptimeLabel' => apacheMonitorFormatUptime($uptime),
        'load1' => apacheMonitorFloat($fields['Load1'] ?? null),
        'load5' => apacheMonitorFloat($fields['Load5'] ?? null),
        'load15' => apacheMonitorFloat($fields['Load15'] ?? null),
        'totalAccesses' => $accesses ?? 0,
        'totalKBytes' => apacheMonitorInt($fields['Total kBytes'] ?? null) ?? 0,
        'reqPerSec' => apacheMonitorFloat($fields['ReqPerSec'] ?? null) ?? 0.0,
        'bytesPerSec' => apacheMonitorFloat($fields['BytesPerSec'] ?? null) ?? 0.0,
        'bytesPerReq' => apacheMonitorFloat($fields['BytesPerReq'] ?? null) ?? 0.0,
        'durationPerReq' => apacheMonitorFloat($fields['DurationPerReq'] ?? null),
        'busyWorkers' => $busy ?? 0,
        'idleWorkers' => $idle ?? 0,
        'gracefulWorkers' => apacheMonitorInt($fields['GracefulWorkers'] ?? null) ?? 0,
        'connsTotal' => apacheMonitorInt($fields['ConnsTotal'] ?? null),
        'scoreboard' => $scoreboard,
        'scoreboardCounts' => apacheMonitorScoreboardCounts($scoreboard),
    ];
}

function apacheMonitorInt($value): ?int
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_numeric($value)) {
        return null;
    }
    return (int) $value;
}

function apacheMonitorFloat($value): ?float
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_numeric($value)) {
        return null;
    }
    $n = (float) $value;
    return is_finite($n) ? $n : null;
}

function apacheMonitorFormatUptime(?int $seconds): string
{
    if ($seconds === null || $seconds < 0) {
        return '—';
    }
    if ($seconds < 60) {
        return $seconds . ' sec';
    }
    if ($seconds < 3600) {
        $m = intdiv($seconds, 60);
        $s = $seconds % 60;
        return $m . 'm ' . $s . 's';
    }
    $hours = $seconds / 3600;
    if ($hours < 48) {
        return number_format($hours, 1) . ' Hr(s)';
    }
    $days = $seconds / 86400;
    return number_format($days, 1) . ' day(s)';
}

function apacheMonitorIsLocalStatusUrl(string $url): bool
{
    $parts = parse_url($url);
    if (!is_array($parts)) {
        return false;
    }
    $scheme = strtolower((string) ($parts['scheme'] ?? ''));
    if ($scheme !== 'http' && $scheme !== 'https') {
        return false;
    }
    $host = strtolower((string) ($parts['host'] ?? ''));
    return $host === 'localhost' || $host === '127.0.0.1' || $host === '::1';
}

function apacheMonitorIsDocker(): bool
{
    if (is_file('/.dockerenv')) {
        return true;
    }
    $marker = strtolower(trim((string) getenv('LINKNEST_IN_DOCKER')));
    return $marker === '1' || $marker === 'true' || $marker === 'yes';
}

function apacheMonitorIsXampp(): bool
{
    $needles = [
        (string) ($_SERVER['DOCUMENT_ROOT'] ?? ''),
        (string) ($_SERVER['SCRIPT_FILENAME'] ?? ''),
    ];
    $ini = apacheMonitorPhpIniPath();
    if (is_string($ini) && $ini !== '') {
        $needles[] = $ini;
    }
    $httpd = apacheMonitorFindHttpd();
    if (is_array($httpd) && !empty($httpd['bin'])) {
        $needles[] = (string) $httpd['bin'];
    }
    foreach ($needles as $path) {
        if ($path !== '' && stripos($path, 'xampp') !== false) {
            return true;
        }
    }
    return false;
}

function apacheMonitorRequestIsHttps(): bool
{
    $https = $_SERVER['HTTPS'] ?? '';
    if (is_string($https) && $https !== '' && strcasecmp($https, 'off') !== 0) {
        return true;
    }
    if ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443) {
        return true;
    }
    return strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

function apacheMonitorRequestHost(): string
{
    $raw = trim((string) ($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? ''));
    if ($raw === '') {
        return '';
    }
    if ($raw[0] === '[') {
        $end = strpos($raw, ']');
        return $end !== false ? strtolower(substr($raw, 1, $end - 1)) : strtolower($raw);
    }
    if (substr_count($raw, ':') === 1) {
        return strtolower(explode(':', $raw, 2)[0]);
    }
    return strtolower($raw);
}

function apacheMonitorRequestPort(): int
{
    $port = (int) ($_SERVER['SERVER_PORT'] ?? 0);
    if ($port > 0) {
        return $port;
    }
    return apacheMonitorRequestIsHttps() ? 443 : 80;
}

function apacheMonitorStatusUrl(string $scheme, string $host, int $port): string
{
    $default = ($scheme === 'https' && $port === 443) || ($scheme === 'http' && $port === 80);
    return $scheme . '://' . $host . ($default ? '' : ':' . $port) . '/server-status?auto';
}

function apacheMonitorUrlIsServerStatus(string $url): bool
{
    $path = (string) (parse_url($url, PHP_URL_PATH) ?? '');
    return $path === '/server-status' || str_starts_with($path, '/server-status/');
}

function apacheMonitorEnsureStatusAuto(string $url): string
{
    $query = (string) (parse_url($url, PHP_URL_QUERY) ?? '');
    if ($query === '') {
        return $url . (str_contains($url, '?') ? 'auto' : '?auto');
    }
    parse_str($query, $params);
    if (!isset($params['auto'])) {
        return $url . '&auto';
    }
    return $url;
}

function apacheMonitorResolveRedirect(string $base, string $location): ?string
{
    $location = trim($location);
    if ($location === '' || preg_match('/[\r\n]/', $location)) {
        return null;
    }
    if (preg_match('#^https?://#i', $location) === 1) {
        return $location;
    }
    $b = parse_url($base);
    if (!is_array($b)) {
        return null;
    }
    $scheme = strtolower((string) ($b['scheme'] ?? ''));
    $host = (string) ($b['host'] ?? '');
    if (($scheme !== 'http' && $scheme !== 'https') || $host === '') {
        return null;
    }
    $port = isset($b['port']) ? ':' . (int) $b['port'] : '';
    if (str_starts_with($location, '//')) {
        return $scheme . ':' . $location;
    }
    if (str_starts_with($location, '/')) {
        return $scheme . '://' . $host . $port . $location;
    }
    $basePath = (string) ($b['path'] ?? '/');
    $dir = preg_replace('#/[^/]*$#', '/', $basePath);
    if (!is_string($dir) || $dir === '') {
        $dir = '/';
    }
    return $scheme . '://' . $host . $port . $dir . $location;
}

/**
 * @return list<string>
 */
function apacheMonitorStatusResolveForUrl(string $url): array
{
    $parts = parse_url($url);
    if (!is_array($parts)) {
        return [];
    }
    $host = strtolower((string) ($parts['host'] ?? ''));
    if ($host === '' || $host === '127.0.0.1' || $host === 'localhost' || $host === '::1') {
        return [];
    }
    if (strpos($host, ':') !== false) {
        return [];
    }
    $scheme = strtolower((string) ($parts['scheme'] ?? 'http'));
    $port = (int) ($parts['port'] ?? 0);
    if ($port < 1) {
        $port = $scheme === 'https' ? 443 : 80;
    }
    return [$host . ':' . $port . ':127.0.0.1'];
}

function apacheMonitorSchemePortAllowed(string $scheme, int $port, string $requestScheme, int $requestPort): bool
{
    if ($port < 1 || $port > 65535) {
        return false;
    }
    if ($scheme === $requestScheme && $port === $requestPort) {
        return true;
    }
    if ($scheme === 'https' && $port === 80) {
        return false;
    }
    if ($scheme === 'http' && $port === 443) {
        return false;
    }
    return true;
}

/**
 * @param array<string,array{url:string,resolve:list<string>}> $out
 */
function apacheMonitorPushStatusCandidate(array &$out, string $url, array $resolve = []): void
{
    $key = $url . "\0" . implode(',', $resolve);
    if (isset($out[$key])) {
        return;
    }
    $out[$key] = ['url' => $url, 'resolve' => $resolve];
}

/**
 * Probe this Apache, not a canned XAMPP/Docker port list.
 *
 * @return list<array{url:string,resolve:list<string>}>
 */
function apacheMonitorStatusUrlCandidates(): array
{
    $ordered = [];

    $env = apacheMonitorEnvValue('LINKNEST_APACHE_STATUS_URL');
    if ($env !== '' && apacheMonitorIsLocalStatusUrl($env)) {
        apacheMonitorPushStatusCandidate($ordered, $env);
    }

    $https = apacheMonitorRequestIsHttps();
    $port = apacheMonitorRequestPort();
    $host = apacheMonitorRequestHost();
    $scheme = $https ? 'https' : 'http';

    $push = static function (string $sch, string $h, int $p, array $resolve = []) use (&$ordered, $scheme, $port): void {
        if (!apacheMonitorSchemePortAllowed($sch, $p, $scheme, $port)) {
            return;
        }
        apacheMonitorPushStatusCandidate($ordered, apacheMonitorStatusUrl($sch, $h, $p), $resolve);
    };

    // HTTP loopback first: Require local, no TLS, no canonical-host vhost.
    $push('http', '127.0.0.1', 80);
    $push('http', 'localhost', 80);

    if (
        $host !== ''
        && $host !== '127.0.0.1'
        && $host !== 'localhost'
        && $host !== '::1'
        && strpos($host, ':') === false
    ) {
        $push($scheme, $host, $port, [$host . ':' . $port . ':127.0.0.1']);
        if ($https) {
            $push('http', $host, 80, [$host . ':80:127.0.0.1']);
            if ($port !== 443) {
                $push('https', $host, 443, [$host . ':443:127.0.0.1']);
            }
        }
    }

    $push($scheme, '127.0.0.1', $port);
    $push($scheme, 'localhost', $port);
    $push('https', '127.0.0.1', 443);
    $push('https', 'localhost', 443);
    if ($port !== 80 && $port !== 443) {
        $push('http', '127.0.0.1', $port);
    }

    if (apacheMonitorIsDocker()) {
        $push('http', '127.0.0.1', 8080);
        $push('http', '127.0.0.1', 8090);
    }

    return array_values($ordered);
}

/**
 * @return array{ok:bool,body:string,httpCode:int,error:string,url:string,location:string}
 * @param list<string> $resolve CURLOPT_RESOLVE entries such as host:443:127.0.0.1
 */
function apacheMonitorHttpGet(string $url, array $resolve = []): array
{
    $result = [
        'ok' => false,
        'body' => '',
        'httpCode' => 0,
        'error' => '',
        'url' => $url,
        'location' => '',
    ];

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        if ($ch === false) {
            $result['error'] = 'curl_init failed';
            return $result;
        }
        $location = '';
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 1,
            CURLOPT_TIMEOUT => 2,
            CURLOPT_HTTPHEADER => [
                'Accept: text/plain,*/*',
                'Connection: close',
            ],
            CURLOPT_USERAGENT => 'LinkNest-ApacheMonitor/1.0',
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
            CURLOPT_HEADERFUNCTION => static function ($ch, string $header) use (&$location): int {
                if (stripos($header, 'Location:') === 0) {
                    $location = trim(substr($header, 9));
                }
                return strlen($header);
            },
        ]);
        if ($resolve !== []) {
            curl_setopt($ch, CURLOPT_RESOLVE, $resolve);
        }
        if (strpos($url, '[::1]') === false) {
            curl_setopt($ch, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
        }
        $body = curl_exec($ch);
        $errno = curl_errno($ch);
        $error = curl_error($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        if ($location === '') {
            $redir = curl_getinfo($ch, CURLINFO_REDIRECT_URL);
            if (is_string($redir) && $redir !== '') {
                $location = $redir;
            }
        }
        curl_close($ch);
        $result['location'] = $location;
        if ($body === false || $errno !== 0) {
            $result['error'] = $error !== '' ? $error : ('curl errno ' . $errno);
            $result['httpCode'] = $code;
            return $result;
        }
        $result['body'] = (string) $body;
        $result['httpCode'] = $code;
        $result['ok'] = $code >= 200 && $code < 300 && $result['body'] !== '';
        if (!$result['ok'] && $result['error'] === '') {
            $result['error'] = apacheMonitorHttpStatusError($code, $location);
        }
        return $result;
    }

    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 2,
            'follow_location' => 0,
            'max_redirects' => 0,
            'header' => "Accept: text/plain,*/*\r\nConnection: close\r\nUser-Agent: LinkNest-ApacheMonitor/1.0\r\n",
            'ignore_errors' => true,
        ],
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
        ],
    ]);
    $body = @file_get_contents($url, false, $ctx);
    $code = 0;
    $location = '';
    if (isset($http_response_header) && is_array($http_response_header)) {
        foreach ($http_response_header as $headerLine) {
            $headerLine = (string) $headerLine;
            if ($code === 0 && preg_match('/\s(\d{3})\s/', $headerLine, $m)) {
                $code = (int) $m[1];
            }
            if (stripos($headerLine, 'Location:') === 0) {
                $location = trim(substr($headerLine, 9));
            }
        }
    }
    $result['httpCode'] = $code;
    $result['location'] = $location;
    if ($body === false) {
        $result['error'] = 'file_get_contents failed';
        return $result;
    }
    $result['body'] = (string) $body;
    $result['ok'] = $code >= 200 && $code < 300 && $result['body'] !== '';
    if (!$result['ok']) {
        $result['error'] = apacheMonitorHttpStatusError($code, $location);
    }
    return $result;
}

function apacheMonitorHttpStatusError(int $code, string $location): string
{
    if ($code >= 300 && $code < 400 && $location !== '') {
        return 'HTTP ' . $code . ' → ' . $location;
    }
    return $code > 0 ? ('HTTP ' . $code) : 'HTTP 0';
}

/**
 * @param list<string> $resolve
 * @return array{ok:bool,body:string,httpCode:int,error:string,url:string,location:string}
 */
function apacheMonitorHttpGetStatus(string $url, array $resolve = []): array
{
    $current = $url;
    $currentResolve = $resolve;
    $last = null;
    for ($hop = 0; $hop < 5; $hop++) {
        $fetch = apacheMonitorHttpGet($current, $currentResolve);
        $fetch['url'] = $current;
        $last = $fetch;
        if ($fetch['ok']) {
            return $fetch;
        }
        $code = (int) $fetch['httpCode'];
        $location = trim((string) ($fetch['location'] ?? ''));
        if ($code < 300 || $code >= 400 || $location === '') {
            return $fetch;
        }
        $next = apacheMonitorResolveRedirect($current, $location);
        if ($next === null || $next === $current) {
            return $fetch;
        }
        if (!apacheMonitorUrlIsServerStatus($next)) {
            $fetch['error'] = 'HTTP ' . $code . ' → ' . $next
                . ' (not /server-status; exclude this path from HTTPS/canonical/SSO rewrites)';
            return $fetch;
        }
        $current = apacheMonitorEnsureStatusAuto($next);
        $currentResolve = $resolve !== [] ? $resolve : apacheMonitorStatusResolveForUrl($current);
    }
    return is_array($last) ? $last : apacheMonitorHttpGet($url, $resolve);
}

/**
 * @return array{status:?array,url:?string,error:?string,attempts:list<array{url:string,ok:bool,httpCode:int,error:string}>}
 */
function apacheMonitorFetchStatus(): array
{
    $attempts = [];
    $lastError = 'Apache /server-status was not reachable from PHP.';
    foreach (apacheMonitorStatusUrlCandidates() as $candidate) {
        $url = (string) $candidate['url'];
        $fetch = apacheMonitorHttpGetStatus($url, $candidate['resolve'] ?? []);
        $attempts[] = [
            'url' => (string) ($fetch['url'] ?? $url),
            'ok' => $fetch['ok'],
            'httpCode' => $fetch['httpCode'],
            'error' => $fetch['error'],
        ];
        if (!$fetch['ok']) {
            $lastError = $fetch['error'] !== '' ? $fetch['error'] : ('HTTP ' . $fetch['httpCode']);
            continue;
        }
        $parsed = apacheMonitorParseAuto($fetch['body']);
        if ($parsed === null) {
            $lastError = 'Unexpected /server-status response (is ExtendedStatus/mod_status enabled?)';
            continue;
        }
        return ['status' => $parsed, 'url' => $url, 'error' => null, 'attempts' => $attempts];
    }

    return ['status' => null, 'url' => null, 'error' => $lastError, 'attempts' => $attempts];
}

/**
 * @return list<string>
 */
function apacheMonitorAccessLogCandidates(): array
{
    $paths = [];
    $env = trim((string) getenv('LINKNEST_APACHE_ACCESS_LOG'));
    if ($env !== '') {
        $paths[] = $env;
    }

    $sapi = (string) php_sapi_name();
    $docRoot = (string) ($_SERVER['DOCUMENT_ROOT'] ?? '');
    $serverRootHints = [];
    $logDirsEarly = [];

    foreach (apacheMonitorDiscoveredLogDirs() as $dir) {
        $serverRootHints[] = $dir . '/access.log';
        $serverRootHints[] = $dir . '/access_log';
        $logDirsEarly[] = $dir;
    }

    if ($docRoot !== '') {
        $serverRootHints[] = $docRoot . '/../apache/logs/access.log';
        $serverRootHints[] = $docRoot . '/../../apache/logs/access.log';
        $serverRootHints[] = $docRoot . '/../logs/access.log';
        $serverRootHints[] = $docRoot . '/../../logs/access.log';
    }

    $appRoot = dirname(__DIR__);
    $serverRootHints[] = $appRoot . '/../../../apache/logs/access.log';
    $serverRootHints[] = $appRoot . '/../../apache/logs/access.log';
    $serverRootHints[] = dirname($appRoot) . '/../apache/logs/access.log';

    $paths = array_merge($paths, $serverRootHints, [
        'C:/xampp/apache/logs/access.log',
        'C:\\xampp\\apache\\logs\\access.log',
        'D:/Apache/logs/access.log',
        'D:\\Apache\\logs\\access.log',
        'C:/Apache24/logs/access.log',
        '/var/log/apache2/access.log',
        '/var/log/apache2/other_vhosts_access.log',
        '/var/log/httpd/access_log',
        '/usr/local/apache2/logs/access_log',
        '/opt/lampp/logs/access_log',
    ]);

    $logDirs = array_merge($logDirsEarly ?? [], [
        'C:/xampp/apache/logs',
        'D:/Apache/logs',
        'C:/Apache24/logs',
        '/var/log/apache2',
        '/var/log/httpd',
    ]);
    if ($docRoot !== '') {
        $logDirs[] = $docRoot . '/../logs';
        $logDirs[] = $docRoot . '/../../logs';
        $logDirs[] = $docRoot . '/../apache/logs';
    }
    foreach ($logDirs as $dir) {
        $resolved = realpath($dir);
        if ($resolved === false || !is_dir($resolved)) {
            continue;
        }
        foreach (glob($resolved . DIRECTORY_SEPARATOR . '*access*') ?: [] as $found) {
            if (is_file($found)) {
                $paths[] = $found;
            }
        }
    }

    unset($sapi);
    return $paths;
}

/**
 * @return list<string>
 */
function apacheMonitorErrorLogCandidates(): array
{
    $paths = [];
    $env = trim((string) getenv('LINKNEST_APACHE_ERROR_LOG'));
    if ($env !== '') {
        $paths[] = $env;
    }
    foreach (apacheMonitorAccessLogCandidates() as $access) {
        $dir = dirname($access);
        $paths[] = $dir . DIRECTORY_SEPARATOR . 'error.log';
        $paths[] = $dir . DIRECTORY_SEPARATOR . 'error_log';
    }
    $paths[] = 'C:/xampp/apache/logs/error.log';
    $paths[] = 'D:/Apache/logs/error.log';
    $paths[] = 'C:/Apache24/logs/error.log';
    $paths[] = '/var/log/apache2/error.log';
    $paths[] = '/var/log/httpd/error_log';
    return $paths;
}

/**
 * @return list<string>
 */
function apacheMonitorSslLogCandidates(): array
{
    $paths = [];
    foreach (apacheMonitorAccessLogCandidates() as $access) {
        $paths[] = dirname($access) . DIRECTORY_SEPARATOR . 'ssl_request.log';
    }
    $paths[] = 'C:/xampp/apache/logs/ssl_request.log';
    $paths[] = 'D:/Apache/logs/ssl_request.log';
    return $paths;
}

/**
 * @return list<string>
 */
function apacheMonitorPhpLogCandidates(): array
{
    $paths = [];
    $env = trim((string) getenv('LINKNEST_PHP_ERROR_LOG'));
    if ($env !== '') {
        $paths[] = $env;
    }
    $ini = trim((string) ini_get('error_log'));
    if ($ini !== '' && strcasecmp($ini, 'syslog') !== 0 && strcasecmp($ini, 'stderr') !== 0) {
        $paths[] = $ini;
    }
    foreach (apacheMonitorAccessLogCandidates() as $access) {
        $dir = dirname($access);
        $paths[] = $dir . DIRECTORY_SEPARATOR . 'php_error_log';
        $paths[] = $dir . DIRECTORY_SEPARATOR . 'php_errors.log';
        $paths[] = $dir . DIRECTORY_SEPARATOR . 'php_error.log';
    }
    $paths = array_merge($paths, [
        'C:/xampp/php/logs/php_error_log',
        'C:/xampp/php/logs/php_errors.log',
        'C:\\xampp\\php\\logs\\php_error_log',
        'D:/php/logs/php_error_log',
        '/var/log/php/error.log',
        '/var/log/php8/error.log',
        '/var/log/php-fpm/error.log',
    ]);
    return $paths;
}

function apacheMonitorIsAllowedLogBasename(string $name): bool
{
    $name = strtolower($name);
    if (preg_match(
        '/^(access|error|other_vhosts_access|ssl_request|php[_-]?errors?)(\.log|_log)?(\.\d+|\.old|-old)?$|^php_error_log(\.\d+)?$/',
        $name
    )) {
        return true;
    }
    // Vanilla / vhost CustomLog names: erpland-access.log, site_error.log
    return (bool) preg_match('/(^|[._-])(access|error|ssl.?request)(\.log|_log)?(\.\d+)?$/', $name);
}

function apacheMonitorLogLabel(string $path): string
{
    $norm = str_replace('\\', '/', $path);
    $parts = array_values(array_filter(explode('/', $norm), static function ($part) {
        return $part !== '';
    }));
    $n = count($parts);
    if ($n >= 3) {
        return $parts[$n - 3] . '/' . $parts[$n - 2] . '/' . $parts[$n - 1];
    }
    if ($n >= 2) {
        return $parts[$n - 2] . '/' . $parts[$n - 1];
    }
    return $parts[0] ?? $path;
}

/**
 * @return list<array{role:string,path:string,label:string,sizeBytes:int,sizeHuman:string,writable:bool,note:?string}>
 */
function apacheMonitorDescribeLogFiles(array $candidates, string $role, ?string $note = null): array
{
    $out = [];
    $seen = [];
    foreach ($candidates as $raw) {
        $raw = trim((string) $raw);
        if ($raw === '') {
            continue;
        }
        $path = realpath($raw);
        if ($path === false || !is_file($path)) {
            continue;
        }
        $base = basename($path);
        if (!apacheMonitorIsAllowedLogBasename($base)) {
            continue;
        }
        $key = strtolower($path);
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $size = (int) (@filesize($path) ?: 0);
        $out[] = [
            'role' => $role,
            'path' => $path,
            'label' => apacheMonitorLogLabel($path),
            'sizeBytes' => $size,
            'sizeHuman' => apacheMonitorFormatBytes($size),
            'writable' => is_writable($path),
            'note' => $note,
        ];
    }
    return $out;
}

function apacheMonitorCollectLogInventory(): array
{
    $apache = array_merge(
        apacheMonitorDescribeLogFiles(apacheMonitorAccessLogCandidates(), 'access'),
        apacheMonitorDescribeLogFiles(apacheMonitorErrorLogCandidates(), 'error'),
        apacheMonitorDescribeLogFiles(apacheMonitorSslLogCandidates(), 'ssl')
    );
    $php = apacheMonitorDescribeLogFiles(apacheMonitorPhpLogCandidates(), 'php');
    $phpNote = null;
    if ($php === []) {
        $ini = trim((string) ini_get('error_log'));
        if ($ini === '' || strcasecmp($ini, 'syslog') === 0 || strcasecmp($ini, 'stderr') === 0) {
            $phpNote = 'PHP error_log is not a separate file; SAPI errors go to the Apache error log.';
            $php = apacheMonitorDescribeLogFiles(apacheMonitorErrorLogCandidates(), 'php-via-apache', $phpNote);
        }
    }

    return [
        'apache' => $apache,
        'php' => $php,
        'phpNote' => $phpNote,
    ];
}

/**
 * @return array{ok:bool,bytesBefore:int,error:?string}
 */
function apacheMonitorTruncateLogFile(string $path): array
{
    $resolved = realpath($path);
    if ($resolved === false || !is_file($resolved) || !apacheMonitorIsAllowedLogBasename(basename($resolved))) {
        return ['ok' => false, 'bytesBefore' => 0, 'error' => 'Refusing to truncate unrecognized log path'];
    }
    $before = (int) (@filesize($resolved) ?: 0);
    $fh = @fopen($resolved, 'c+b');
    if ($fh === false) {
        $fh = @fopen($resolved, 'wb');
    }
    if ($fh === false) {
        return ['ok' => false, 'bytesBefore' => $before, 'error' => 'Could not open log file for writing'];
    }
    $ok = false;
    $error = null;
    try {
        @flock($fh, LOCK_EX);
        if (!@ftruncate($fh, 0)) {
            $error = 'Could not empty log file (it may be locked by Apache)';
        } else {
            @rewind($fh);
            @fflush($fh);
            $ok = true;
        }
        @flock($fh, LOCK_UN);
    } finally {
        fclose($fh);
    }
    return ['ok' => $ok, 'bytesBefore' => $before, 'error' => $ok ? null : ($error ?: 'Truncate failed')];
}

/**
 * @return array{target:string,purged:list<array{path:string,label:string,bytesBefore:int,ok:bool,error:?string}>,freedBytes:int,freedHuman:string}
 */
function apacheMonitorPurgeLogs(string $target): array
{
    $target = strtolower(trim($target));
    if (!in_array($target, ['apache', 'php', 'all'], true)) {
        throw new InvalidArgumentException('target must be apache, php, or all');
    }

    $inventory = apacheMonitorCollectLogInventory();
    $files = [];
    if ($target === 'apache' || $target === 'all') {
        $files = array_merge($files, $inventory['apache']);
    }
    if ($target === 'php' || $target === 'all') {
        $files = array_merge($files, $inventory['php']);
    }

    $seen = [];
    $purged = [];
    $freed = 0;
    foreach ($files as $file) {
        $key = strtolower((string) ($file['path'] ?? ''));
        if ($key === '' || isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $result = apacheMonitorTruncateLogFile((string) $file['path']);
        if ($result['ok']) {
            $freed += (int) $result['bytesBefore'];
        }
        $purged[] = [
            'path' => $file['path'],
            'label' => $file['label'],
            'bytesBefore' => $result['bytesBefore'],
            'ok' => $result['ok'],
            'error' => $result['error'],
        ];
    }

    apacheMonitorClearTtlCache();

    return [
        'target' => $target,
        'purged' => $purged,
        'freedBytes' => $freed,
        'freedHuman' => apacheMonitorFormatBytes($freed),
    ];
}

function apacheMonitorResolveReadableFile(array $candidates): ?string
{
    $best = null;
    $bestMtime = -1;
    foreach ($candidates as $raw) {
        $raw = trim((string) $raw);
        if ($raw === '') {
            continue;
        }
        $path = realpath($raw);
        if ($path === false || !is_file($path) || !is_readable($path)) {
            continue;
        }
        $mtime = (int) @filemtime($path);
        if ($mtime >= $bestMtime) {
            $best = $path;
            $bestMtime = $mtime;
        }
    }
    return $best;
}

function apacheMonitorReadLogTail(string $path, int $maxBytes): string
{
    $size = @filesize($path);
    if (!is_int($size) || $size <= 0) {
        return '';
    }
    $read = min($maxBytes, $size);
    $fh = @fopen($path, 'rb');
    if ($fh === false) {
        return '';
    }
    try {
        if ($size > $read) {
            fseek($fh, $size - $read);
        }
        $data = stream_get_contents($fh);
        return is_string($data) ? $data : '';
    } finally {
        fclose($fh);
    }
}

function apacheMonitorNormalizePath(string $path): string
{
    $path = trim($path);
    if ($path === '') {
        return '/';
    }
    if (strlen($path) > 96) {
        $path = substr($path, 0, 93) . '...';
    }
    return $path;
}

/**
 * @return array{failedTotal:int,successTotal:int,linesParsed:int,logPath:?string,topFailed:list<array{path:string,count:int}>,topSuccess:list<array{path:string,count:int}>}
 */
function apacheMonitorParseAccessLog(): array
{
    $empty = [
        'failedTotal' => 0,
        'successTotal' => 0,
        'linesParsed' => 0,
        'logPath' => null,
        'topFailed' => [],
        'topSuccess' => [],
    ];

    $path = apacheMonitorResolveReadableFile(apacheMonitorAccessLogCandidates());
    if ($path === null) {
        return $empty;
    }

    $raw = apacheMonitorReadLogTail($path, (int) LINKNEST_APACHE_MONITOR_LOG_BYTES);
    if ($raw === '') {
        $empty['logPath'] = $path;
        return $empty;
    }

    if ($raw[0] !== "\n" && strpos($raw, "\n") !== false) {
        $raw = substr($raw, (int) strpos($raw, "\n") + 1);
    }

    $failed = [];
    $success = [];
    $failedTotal = 0;
    $successTotal = 0;
    $parsed = 0;

    foreach (explode("\n", $raw) as $line) {
        if ($line === '' || !preg_match('/"([A-Z]+) (\S+)(?: HTTP\/[0-9.]+)?" (\d{3}) /', $line, $m)) {
            continue;
        }
        $status = (int) $m[3];
        $reqPath = apacheMonitorNormalizePath($m[2]);
        $parsed++;
        if (stripos($reqPath, '/apache-monitor') !== false || stripos($reqPath, '/server-status') !== false) {
            continue;
        }
        if ($status >= 400) {
            $failedTotal++;
            $failed[$reqPath] = ($failed[$reqPath] ?? 0) + 1;
        } else {
            $successTotal++;
            $success[$reqPath] = ($success[$reqPath] ?? 0) + 1;
        }
    }

    arsort($failed);
    arsort($success);

    $toRows = static function (array $counts, int $limit): array {
        $rows = [];
        $i = 0;
        foreach ($counts as $path => $count) {
            $rows[] = ['path' => (string) $path, 'count' => (int) $count];
            $i++;
            if ($i >= $limit) {
                break;
            }
        }
        return $rows;
    };

    return [
        'failedTotal' => $failedTotal,
        'successTotal' => $successTotal,
        'linesParsed' => $parsed,
        'logPath' => $path,
        'topFailed' => $toRows($failed, 20),
        'topSuccess' => $toRows($success, 50),
    ];
}

function apacheMonitorPruneSamples(PDO $db, int $now): void
{
    $cutoff = $now - (int) LINKNEST_APACHE_MONITOR_HISTORY_SEC;
    try {
        $stmt = $db->prepare('DELETE FROM apache_monitor_samples WHERE sampled_at < ?');
        $stmt->execute([$cutoff]);
        $db->exec('DELETE FROM apache_monitor_samples WHERE available = 0');
    } catch (PDOException $e) {
        error_log('apacheMonitorPruneSamples warning: ' . $e->getMessage());
    }
}

function apacheMonitorPruneSamplesThrottled(PDO $db, int $now): void
{
    $marker = apacheMonitorCacheDir() . DIRECTORY_SEPARATOR . 'apache_monitor_pruned.at';
    $last = is_file($marker) ? (int) @file_get_contents($marker) : 0;
    if ($last > 0 && ($now - $last) < 60) {
        return;
    }
    apacheMonitorPruneSamples($db, $now);
    @file_put_contents($marker, (string) $now, LOCK_EX);
}

/**
 * @param list<array<string,mixed>> $rows
 * @return list<array<string,mixed>>
 */
function apacheMonitorDownsampleHistory(array $rows, int $maxPoints = 80): array
{
    $n = count($rows);
    if ($n <= $maxPoints || $maxPoints < 3) {
        return $rows;
    }
    $out = [];
    $seen = [];
    $lastIdx = $n - 1;
    for ($i = 0; $i < $maxPoints; $i++) {
        $idx = (int) round($i * $lastIdx / ($maxPoints - 1));
        if (isset($seen[$idx])) {
            continue;
        }
        $seen[$idx] = true;
        $out[] = $rows[$idx];
    }
    return $out;
}

function apacheMonitorStoreSample(PDO $db, int $now, bool $available, ?array $status): void
{
    try {
        $last = (int) $db->query('SELECT sampled_at FROM apache_monitor_samples ORDER BY id DESC LIMIT 1')->fetchColumn();
        if ($last > 0 && ($now - $last) < (int) LINKNEST_APACHE_MONITOR_MIN_INTERVAL) {
            return;
        }
        $stmt = $db->prepare(
            'INSERT INTO apache_monitor_samples (
                sampled_at, available, busy_workers, idle_workers, req_per_sec,
                bytes_per_sec, bytes_per_req, total_accesses, total_kbytes, uptime_seconds
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $now,
            $available ? 1 : 0,
            $status['busyWorkers'] ?? null,
            $status['idleWorkers'] ?? null,
            $status['reqPerSec'] ?? null,
            $status['bytesPerSec'] ?? null,
            $status['bytesPerReq'] ?? null,
            $status['totalAccesses'] ?? null,
            $status['totalKBytes'] ?? null,
            $status['uptimeSeconds'] ?? null,
        ]);
    } catch (PDOException $e) {
        error_log('apacheMonitorStoreSample warning: ' . $e->getMessage());
    }
}

/**
 * @return list<array<string,mixed>>
 */
function apacheMonitorLoadHistory(PDO $db, int $now): array
{
    $cutoff = $now - (int) LINKNEST_APACHE_MONITOR_HISTORY_SEC;
    try {
        $stmt = $db->prepare(
            'SELECT sampled_at, available, busy_workers, idle_workers, req_per_sec,
                    bytes_per_sec, bytes_per_req, total_accesses, total_kbytes, uptime_seconds
             FROM apache_monitor_samples
             WHERE sampled_at >= ?
             ORDER BY sampled_at ASC'
        );
        $stmt->execute([$cutoff]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } catch (PDOException $e) {
        error_log('apacheMonitorLoadHistory warning: ' . $e->getMessage());
        return [];
    }

    $out = [];
    foreach ($rows as $row) {
        $ts = (int) ($row['sampled_at'] ?? 0);
        $out[] = [
            't' => $ts,
            'label' => $ts > 0 ? date('g:i A', $ts) : '',
            'available' => (int) ($row['available'] ?? 0),
            'busy' => $row['busy_workers'] !== null ? (int) $row['busy_workers'] : null,
            'idle' => $row['idle_workers'] !== null ? (int) $row['idle_workers'] : null,
            'reqPerSec' => $row['req_per_sec'] !== null ? (float) $row['req_per_sec'] : null,
            'bytesPerSec' => $row['bytes_per_sec'] !== null ? (float) $row['bytes_per_sec'] : null,
            'bytesPerReq' => $row['bytes_per_req'] !== null ? (float) $row['bytes_per_req'] : null,
            'accesses' => $row['total_accesses'] !== null ? (int) $row['total_accesses'] : null,
            'kBytes' => $row['total_kbytes'] !== null ? (int) $row['total_kbytes'] : null,
        ];
    }
    return $out;
}

function apacheMonitorSetupHint(?string $error, array $attempts = []): string
{
    if (apacheMonitorIsDocker()) {
        $intro = 'Docker: PHP reads /server-status?auto on loopback inside the container (a2enmod status).';
    } elseif (apacheMonitorIsXampp()) {
        $intro = 'XAMPP: Include conf/extra/httpd-info.conf from httpd.conf and keep Require local on /server-status.';
    } else {
        $intro = 'Vanilla Apache: LoadModule status_module, copy apache/linknest-server-status.conf to conf/extra/, Include it from httpd.conf, then restart Apache. '
            . 'HTTP 302 means a RewriteRule/Redirect (HTTP→HTTPS, canonical host, or app path) is catching /server-status — add RewriteCond %{REQUEST_URI} !^/server-status before that rule. '
            . 'Optional override: set LINKNEST_APACHE_STATUS_URL to http://127.0.0.1/server-status?auto.';
    }

    $bits = [$intro];
    if ($error) {
        $bits[] = 'Last error: ' . $error;
    }
    $tried = [];
    foreach ($attempts as $row) {
        if (!empty($row['ok'])) {
            continue;
        }
        $url = (string) ($row['url'] ?? '');
        $why = (string) ($row['error'] ?? '');
        if ($url === '') {
            continue;
        }
        $tried[] = $url . ($why !== '' ? ' → ' . $why : '');
        if (count($tried) >= 4) {
            break;
        }
    }
    if ($tried) {
        $bits[] = 'Tried: ' . implode('; ', $tried);
    }
    return implode("\n", $bits);
}

function apacheMonitorBuildDashboard(PDO $db, bool $fresh = false): array
{
    ensureApacheMonitorSamplesTable($db);
    if (function_exists('ensureAppPresenceTable')) {
        ensureAppPresenceTable($db);
    }

    $now = time();
    $fetched = apacheMonitorFetchStatus();
    $status = $fetched['status'];
    $available = is_array($status);

    if ($available) {
        apacheMonitorStoreSample($db, $now, true, $status);
    } else {
        try {
            $db->exec('DELETE FROM apache_monitor_samples WHERE available = 0');
        } catch (PDOException $e) {
            error_log('apacheMonitor clear failed samples: ' . $e->getMessage());
        }
    }
    apacheMonitorPruneSamplesThrottled($db, $now);
    $historyFull = apacheMonitorLoadHistory($db, $now);
    $history = apacheMonitorDownsampleHistory(
        $historyFull,
        (int) LINKNEST_APACHE_MONITOR_HISTORY_POINTS
    );

    $upCount = 0;
    $totalCount = count($historyFull);
    foreach ($historyFull as $row) {
        if (!empty($row['available'])) {
            $upCount++;
        }
    }
    $availabilityPercent = $totalCount > 0
        ? round(100.0 * $upCount / $totalCount, 2)
        : ($available ? 100.0 : null);

    $presence = ['count' => 0, 'guests' => 0, 'signedIn' => 0];
    if (function_exists('countAppPresence')) {
        $presence = countAppPresence($db, $now);
    }

    $logTtl = $fresh ? 0 : 12;
    $slowTtl = $fresh ? 0 : 20;
    $requests = apacheMonitorTtlCache('requests', $logTtl, static function () {
        $parsed = apacheMonitorParseAccessLog();
        $logPath = $parsed['logPath'];
        if (is_string($logPath)) {
            $parsed['logPath'] = basename($logPath);
        }
        return $parsed;
    });

    $current = null;
    $server = null;
    if ($available && $status) {
        $current = [
            'totalAccesses' => $status['totalAccesses'],
            'totalKBytes' => $status['totalKBytes'],
            'reqPerSec' => $status['reqPerSec'],
            'bytesPerSec' => $status['bytesPerSec'],
            'bytesPerReq' => $status['bytesPerReq'],
            'durationPerReq' => $status['durationPerReq'],
            'busyWorkers' => $status['busyWorkers'],
            'idleWorkers' => $status['idleWorkers'],
            'gracefulWorkers' => $status['gracefulWorkers'],
            'connsTotal' => $status['connsTotal'],
            'scoreboardCounts' => $status['scoreboardCounts'],
        ];
        $uptimeSeconds = $status['uptimeSeconds'];
        $server = [
            'version' => $status['serverVersion'],
            'mpm' => $status['mpm'],
            'currentTime' => $status['currentTime'],
            'restartTime' => $status['restartTime'],
            'uptimeSeconds' => $uptimeSeconds,
            'uptimeLabel' => $status['uptimeLabel'] !== ''
                ? $status['uptimeLabel']
                : apacheMonitorFormatUptime($uptimeSeconds),
            'load1' => $status['load1'],
            'load5' => $status['load5'],
            'load15' => $status['load15'],
        ];
    }

    if ($current !== null) {
        $pool = (int) $current['busyWorkers'] + (int) $current['idleWorkers'];
        $current['workerUtilizationPercent'] = $pool > 0
            ? round(100.0 * (int) $current['busyWorkers'] / $pool, 1)
            : 0.0;
        $current['workerPool'] = $pool;
    }

    $payload = [
        'available' => $available,
        'availabilityPercent' => $availabilityPercent,
        'lastUpdated' => $now,
        'pollIntervalMs' => 5000,
        'statusUrl' => $fetched['url'],
        'error' => $available ? null : $fetched['error'],
        'setupHint' => $available ? null : apacheMonitorSetupHint($fetched['error'], $fetched['attempts'] ?? []),
        'server' => $server,
        'current' => $current,
        'history' => $history,
        'requests' => $requests,
        'presence' => $presence,
        'opcache' => apacheMonitorSafeCollect('opcache'),
        'php' => apacheMonitorSafeCollect('php'),
        'sqlite' => apacheMonitorTtlCache('sqlite', $slowTtl, static function () use ($db) {
            return apacheMonitorSafeCollect('sqlite', $db);
        }),
        'disk' => apacheMonitorTtlCache('disk', $slowTtl, static function () {
            return apacheMonitorSafeCollect('disk');
        }),
        'logs' => apacheMonitorTtlCache('logs', $slowTtl, static function () {
            return apacheMonitorCollectLogInventory();
        }),
        'actions' => apacheMonitorCollectActions(),
        'instance' => (string) ($_SERVER['SERVER_NAME'] ?? 'instance-1'),
    ];

    return apacheMonitorJsonSafe($payload);
}

/**
 * json_encode rejects INF/NAN and invalid UTF-8 (common in access-log paths).
 */
function apacheMonitorJsonSafe($value)
{
    if (is_array($value)) {
        $out = [];
        foreach ($value as $k => $v) {
            $key = is_string($k) ? apacheMonitorUtf8($k) : $k;
            $out[$key] = apacheMonitorJsonSafe($v);
        }
        return $out;
    }
    if (is_float($value) && !is_finite($value)) {
        return null;
    }
    if (is_string($value)) {
        return apacheMonitorUtf8($value);
    }
    return $value;
}

function apacheMonitorUtf8(string $value): string
{
    if ($value === '' || preg_match('//u', $value)) {
        return $value;
    }
    if (function_exists('iconv')) {
        $converted = @iconv('UTF-8', 'UTF-8//IGNORE', $value);
        if (is_string($converted)) {
            return $converted;
        }
    }
    return preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $value) ?? $value;
}

function apacheMonitorSafeCollect(string $which, ?PDO $db = null)
{
    try {
        if ($which === 'opcache') {
            return apacheMonitorCollectOpcache();
        }
        if ($which === 'php') {
            return apacheMonitorCollectPhpRuntime();
        }
        if ($which === 'sqlite' && $db) {
            return apacheMonitorCollectSqlite($db);
        }
        if ($which === 'disk') {
            return apacheMonitorCollectDisk();
        }
    } catch (Throwable $e) {
        error_log('apacheMonitorSafeCollect ' . $which . ': ' . $e->getMessage());
    }
    return null;
}

function apacheMonitorFormatBytes(int $bytes): string
{
    $bytes = max(0, $bytes);
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $pow = $bytes > 0 ? (int) floor(log($bytes) / log(1024)) : 0;
    $pow = min($pow, count($units) - 1);
    $val = $pow === 0 ? $bytes : $bytes / (1024 ** $pow);
    return round($val, $pow === 0 ? 0 : 2) . ' ' . $units[$pow];
}

function apacheMonitorParseIniBytes(?string $value): ?int
{
    if ($value === null) {
        return null;
    }
    $value = trim($value);
    if ($value === '' || $value === '-1') {
        return null;
    }
    if (!preg_match('/^(\d+)\s*([KMG])?B?$/i', $value, $m)) {
        if (!is_numeric($value)) {
            return null;
        }
        return (int) $value;
    }
    $n = (int) $m[1];
    $unit = strtoupper($m[2] ?? '');
    if ($unit === 'K') {
        return $n * 1024;
    }
    if ($unit === 'M') {
        return $n * 1024 * 1024;
    }
    if ($unit === 'G') {
        return $n * 1024 * 1024 * 1024;
    }
    return $n;
}

function apacheMonitorCollectOpcache(): array
{
    $loaded = extension_loaded('Zend OPcache');
    $out = [
        'loaded' => $loaded,
        'active' => false,
        'message' => null,
        'memory' => null,
        'interned' => null,
        'statistics' => null,
        'jit' => null,
        'config' => null,
    ];

    if (!$loaded) {
        $out['message'] = 'OPcache extension is not loaded. Enable zend_extension=opcache in php.ini.';
        return $out;
    }

    $status = @opcache_get_status(false);
    if ($status === false || !is_array($status)) {
        $out['message'] = 'OPcache is loaded but not active. Check opcache.enable=1 in php.ini.';
        return $out;
    }

    $out['active'] = true;
    $mem = $status['memory_usage'] ?? [];
    $used = (int) ($mem['used_memory'] ?? 0);
    $free = (int) ($mem['free_memory'] ?? 0);
    $wasted = (int) ($mem['wasted_memory'] ?? 0);
    $total = $used + $free;
    $out['memory'] = [
        'usedBytes' => $used,
        'freeBytes' => $free,
        'wastedBytes' => $wasted,
        'totalBytes' => $total,
        'usedPercent' => $total > 0 ? round(100.0 * $used / $total, 1) : 0.0,
        'wastedPercent' => isset($mem['current_wasted_percentage'])
            ? round((float) $mem['current_wasted_percentage'], 2)
            : ($total > 0 ? round(100.0 * $wasted / $total, 2) : 0.0),
        'usedHuman' => apacheMonitorFormatBytes($used),
        'freeHuman' => apacheMonitorFormatBytes($free),
        'totalHuman' => apacheMonitorFormatBytes($total),
        'wastedHuman' => apacheMonitorFormatBytes($wasted),
    ];

    $interned = $status['interned_strings_usage'] ?? [];
    $iUsed = (int) ($interned['used_memory'] ?? 0);
    $iFree = (int) ($interned['free_memory'] ?? 0);
    $iBuf = (int) ($interned['buffer_size'] ?? ($iUsed + $iFree));
    $out['interned'] = [
        'usedBytes' => $iUsed,
        'freeBytes' => $iFree,
        'bufferBytes' => $iBuf,
        'usedPercent' => $iBuf > 0 ? round(100.0 * $iUsed / $iBuf, 1) : 0.0,
        'usedHuman' => apacheMonitorFormatBytes($iUsed),
        'bufferHuman' => apacheMonitorFormatBytes($iBuf),
    ];

    $stats = $status['opcache_statistics'] ?? [];
    $hits = (int) ($stats['hits'] ?? 0);
    $misses = (int) ($stats['misses'] ?? 0);
    $totalReq = $hits + $misses;
    $maxKeys = (int) ($stats['max_cached_keys'] ?? 0);
    $numKeys = (int) ($stats['num_cached_keys'] ?? 0);
    $out['statistics'] = [
        'hits' => $hits,
        'misses' => $misses,
        'hitRatePercent' => $totalReq > 0 ? round(100.0 * $hits / $totalReq, 2) : 0.0,
        'cachedScripts' => (int) ($stats['num_cached_scripts'] ?? 0),
        'cachedKeys' => $numKeys,
        'maxCachedKeys' => $maxKeys,
        'keysPercent' => $maxKeys > 0 ? round(100.0 * $numKeys / $maxKeys, 1) : 0.0,
        'oomRestarts' => (int) ($stats['oom_restarts'] ?? 0),
        'hashRestarts' => (int) ($stats['hash_restarts'] ?? 0),
        'manualRestarts' => (int) ($stats['manual_restarts'] ?? 0),
    ];

    $jit = $status['jit'] ?? [];
    $out['jit'] = [
        'enabled' => !empty($jit['enabled']),
        'on' => !empty($jit['on']),
        'bufferSize' => (int) ($jit['buffer_size'] ?? 0),
        'bufferFree' => (int) ($jit['buffer_free'] ?? 0),
    ];

    $config = function_exists('opcache_get_configuration') ? @opcache_get_configuration() : null;
    if (is_array($config) && isset($config['directives']) && is_array($config['directives'])) {
        $d = $config['directives'];
        $out['config'] = [
            'memoryConsumptionMb' => (int) ($d['opcache.memory_consumption'] ?? 0),
            'maxAcceleratedFiles' => (int) ($d['opcache.max_accelerated_files'] ?? 0),
            'validateTimestamps' => !empty($d['opcache.validate_timestamps']),
            'revalidateFreq' => (int) ($d['opcache.revalidate_freq'] ?? 0),
        ];
    }

    return $out;
}

function apacheMonitorCollectPhpRuntime(): array
{
    $limitRaw = (string) ini_get('memory_limit');
    $limitBytes = apacheMonitorParseIniBytes($limitRaw);
    $used = (int) memory_get_usage(true);
    $peak = (int) memory_get_peak_usage(true);
    $usedPercent = ($limitBytes !== null && $limitBytes > 0)
        ? round(100.0 * $used / $limitBytes, 1)
        : null;

    $load = null;
    if (function_exists('sys_getloadavg')) {
        $avg = @sys_getloadavg();
        if (is_array($avg) && isset($avg[0]) && (float) $avg[0] >= 0) {
            $load = [
                'load1' => round((float) $avg[0], 2),
                'load5' => round((float) ($avg[1] ?? 0), 2),
                'load15' => round((float) ($avg[2] ?? 0), 2),
            ];
        }
    }

    return [
        'version' => PHP_VERSION,
        'sapi' => php_sapi_name(),
        'memoryUsedBytes' => $used,
        'memoryPeakBytes' => $peak,
        'memoryLimitBytes' => $limitBytes,
        'memoryLimitRaw' => $limitRaw,
        'memoryUsedPercent' => $usedPercent,
        'memoryUsedHuman' => apacheMonitorFormatBytes($used),
        'memoryPeakHuman' => apacheMonitorFormatBytes($peak),
        'memoryLimitHuman' => $limitBytes !== null ? apacheMonitorFormatBytes($limitBytes) : $limitRaw,
        'load' => $load,
    ];
}

function apacheMonitorCollectSqlite(PDO $db): array
{
    $pageCount = 0;
    $pageSize = 0;
    $journal = null;
    try {
        $pageCount = (int) $db->query('PRAGMA page_count')->fetchColumn();
        $pageSize = (int) $db->query('PRAGMA page_size')->fetchColumn();
        $journal = (string) $db->query('PRAGMA journal_mode')->fetchColumn();
    } catch (Throwable $e) {
        // keep defaults
    }
    $bytes = $pageCount * $pageSize;
    if ($bytes <= 0 && defined('DB_PATH') && is_file(DB_PATH)) {
        $bytes = (int) @filesize(DB_PATH);
    }
    $walBytes = 0;
    if (defined('DB_PATH')) {
        foreach ([DB_PATH . '-wal', DB_PATH . '-shm'] as $side) {
            if (is_file($side)) {
                $walBytes += (int) @filesize($side);
            }
        }
    }

    return [
        'sizeBytes' => $bytes,
        'sizeHuman' => apacheMonitorFormatBytes($bytes),
        'walBytes' => $walBytes,
        'walHuman' => apacheMonitorFormatBytes($walBytes),
        'journalMode' => $journal,
        'pageCount' => $pageCount,
        'pageSize' => $pageSize,
    ];
}

function apacheMonitorCollectDisk(): array
{
    $dataDir = defined('DB_PATH') ? dirname(DB_PATH) : (dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data');
    $path = is_dir($dataDir) ? $dataDir : dirname(__DIR__);
    $total = @disk_total_space($path);
    $free = @disk_free_space($path);
    $total = is_numeric($total) ? (int) $total : 0;
    $free = is_numeric($free) ? (int) $free : 0;
    $used = $total > 0 ? max(0, $total - $free) : 0;

    return [
        'path' => $path,
        'totalBytes' => $total,
        'freeBytes' => $free,
        'usedBytes' => $used,
        'usedPercent' => $total > 0 ? round(100.0 * $used / $total, 1) : 0.0,
        'totalHuman' => apacheMonitorFormatBytes($total),
        'freeHuman' => apacheMonitorFormatBytes($free),
        'usedHuman' => apacheMonitorFormatBytes($used),
    ];
}

function apacheMonitorPhpIniPath(): ?string
{
    $loaded = php_ini_loaded_file();
    if (!is_string($loaded) || $loaded === '') {
        $loaded = (string) get_cfg_var('cfg_file_path');
    }
    $loaded = trim($loaded);
    if ($loaded === '') {
        return null;
    }
    $real = realpath($loaded);
    if ($real === false || !is_file($real)) {
        return null;
    }
    $base = strtolower(basename($real));
    if (!preg_match('/^php.*\.ini$/i', $base)) {
        return null;
    }
    return $real;
}

function apacheMonitorIniSetKey(string $content, string $key, string $value): array
{
    $nl = strpos($content, "\r\n") !== false ? "\r\n" : "\n";
    $line = $key . '=' . $value;
    $pattern = '/^[ \t]*;?[ \t]*' . preg_quote($key, '/') . '[ \t]*=[ \t]*.*$/m';
    if (preg_match($pattern, $content, $m)) {
        if (trim($m[0]) === $line) {
            return [$content, false];
        }
        return [preg_replace($pattern, $line, $content, 1), true];
    }
    if (preg_match('/^[ \t]*\[opcache\][ \t]*$/m', $content)) {
        return [preg_replace('/^([ \t]*\[opcache\][ \t]*)$/m', '$1' . $nl . $line, $content, 1), true];
    }
    return [rtrim($content) . $nl . $line . $nl, true];
}

function apacheMonitorOpcacheDllPath(): ?string
{
    $dir = trim((string) ini_get('extension_dir'));
    if ($dir === '') {
        return null;
    }
    if (!preg_match('#[\\\\/]#', $dir)) {
        $ini = apacheMonitorPhpIniPath();
        if ($ini) {
            $dir = dirname($ini) . DIRECTORY_SEPARATOR . 'ext';
        }
    }
    $name = PHP_OS_FAMILY === 'Windows' ? 'php_opcache.dll' : 'opcache.so';
    $full = rtrim($dir, "\\/") . DIRECTORY_SEPARATOR . $name;
    return is_file($full) ? $full : null;
}

function apacheMonitorEnvValue(string $key): string
{
    $v = getenv($key);
    if (is_string($v) && trim($v) !== '') {
        return trim($v);
    }
    $v = $_SERVER[$key] ?? $_ENV[$key] ?? '';
    return is_string($v) ? trim($v) : '';
}

function apacheMonitorIsSafeBinPath(string $path): bool
{
    return $path !== '' && !preg_match('/["&|<>%\r\n]/', $path);
}

/**
 * @param list<string> $basenames
 */
function apacheMonitorAcceptBin(string $path, array $basenames): ?string
{
    $path = trim($path);
    if ($path === '') {
        return null;
    }
    if (($path[0] === '"' || $path[0] === "'") && strlen($path) >= 2) {
        $path = trim($path, "\"'");
    }
    if (!apacheMonitorIsSafeBinPath($path)) {
        return null;
    }
    $real = realpath($path);
    if ($real === false || !is_file($real)) {
        return null;
    }
    $want = [];
    foreach ($basenames as $name) {
        $want[strtolower($name)] = true;
    }
    if (!isset($want[strtolower(basename($real))])) {
        return null;
    }
    return $real;
}

function apacheMonitorSanitizeServiceName(string $name): ?string
{
    $name = trim($name);
    // Windows Apache services commonly use dots: Apache2.4
    if ($name === '' || !preg_match('/^[A-Za-z0-9][A-Za-z0-9._\-]{0,63}$/', $name)) {
        return null;
    }
    return $name;
}

function apacheMonitorExtractQuotedExe(string $pathName): ?string
{
    $pathName = trim($pathName);
    if ($pathName === '') {
        return null;
    }
    if ($pathName[0] === '"') {
        $end = strpos($pathName, '"', 1);
        if ($end !== false) {
            return substr($pathName, 1, $end - 1);
        }
    }
    if (preg_match('/^(.+?\.exe)(?:\s|$)/i', $pathName, $m)) {
        return $m[1];
    }
    return $pathName;
}

/**
 * @return list<string>
 */
function apacheMonitorAncestorDirs(string $start, int $maxLevels = 12): array
{
    $dirs = [];
    $dir = $start;
    $realStart = realpath($start);
    if ($realStart !== false) {
        $dir = is_file($realStart) ? dirname($realStart) : $realStart;
    } elseif (is_file($dir)) {
        $dir = dirname($dir);
    }
    for ($i = 0; $i < $maxLevels && is_string($dir) && $dir !== ''; $i++) {
        $resolved = realpath($dir);
        $use = $resolved !== false ? $resolved : $dir;
        $dirs[] = $use;
        $parent = dirname($use);
        if ($parent === $use) {
            break;
        }
        $dir = $parent;
    }
    return $dirs;
}

/**
 * @return list<string>
 */
function apacheMonitorHttpdRelativeFragments(): array
{
    if (PHP_OS_FAMILY === 'Windows') {
        return [
            '/bin/httpd.exe',
            '/apache/bin/httpd.exe',
            '/Apache/bin/httpd.exe',
            '/Apache24/bin/httpd.exe',
            '/apache24/bin/httpd.exe',
            '/Apache2.4/bin/httpd.exe',
            '/httpd/bin/httpd.exe',
            '/xampp/apache/bin/httpd.exe',
        ];
    }
    return [
        '/bin/httpd',
        '/bin/apachectl',
        '/bin/apache2ctl',
        '/bin/apache2',
        '/sbin/httpd',
        '/sbin/apachectl',
        '/sbin/apache2ctl',
        '/sbin/apache2',
    ];
}

/**
 * @return list<string>
 */
function apacheMonitorWindowsHttpdBasenames(): array
{
    return ['httpd.exe'];
}

/**
 * @return list<string>
 */
function apacheMonitorUnixServerBasenames(): array
{
    return ['apache2ctl', 'apachectl', 'httpd', 'apache2'];
}

function apacheMonitorHttpdKindFromBasename(string $path): string
{
    $base = strtolower(basename($path));
    if ($base === 'apache2ctl' || $base === 'apachectl') {
        return 'ctl';
    }
    return 'httpd';
}

/**
 * @param array{bin:string,kind:string,label:string,service:?string,source:string} $found
 */
function apacheMonitorHttpdResult(string $bin, string $kind, string $source, ?string $service = null): array
{
    return [
        'bin' => $bin,
        'kind' => $kind,
        'label' => $bin,
        'service' => $service,
        'source' => $source,
    ];
}

function apacheMonitorPreferUnixCtl(string $bin, string $source): array
{
    $base = strtolower(basename($bin));
    if ($base === 'apache2' || $base === 'httpd') {
        foreach (['/usr/sbin/apache2ctl', '/usr/sbin/apachectl', '/usr/local/sbin/apachectl'] as $ctl) {
            $ok = apacheMonitorAcceptBin($ctl, ['apache2ctl', 'apachectl']);
            if ($ok !== null) {
                return apacheMonitorHttpdResult($ok, 'ctl', $source);
            }
        }
    }
    return apacheMonitorHttpdResult($bin, apacheMonitorHttpdKindFromBasename($bin), $source);
}

/**
 * @return list<string>
 */
function apacheMonitorWalkHttpdCandidates(array $starts): array
{
    $out = [];
    $fragments = apacheMonitorHttpdRelativeFragments();
    $seen = [];
    foreach ($starts as $start) {
        if (!is_string($start) || $start === '') {
            continue;
        }
        foreach (apacheMonitorAncestorDirs($start) as $dir) {
            foreach ($fragments as $rel) {
                $path = $dir . str_replace('/', DIRECTORY_SEPARATOR, $rel);
                $key = strtolower($path);
                if (isset($seen[$key])) {
                    continue;
                }
                $seen[$key] = true;
                $out[] = $path;
            }
        }
    }
    return $out;
}

function apacheMonitorApacheGetenvServerRoot(): ?string
{
    if (!function_exists('apache_getenv')) {
        return null;
    }
    foreach ([false, true] as $walk) {
        try {
            $sr = trim((string) apache_getenv('SERVER_ROOT', $walk));
        } catch (Throwable $e) {
            continue;
        }
        if ($sr === '') {
            continue;
        }
        $real = realpath($sr);
        if ($real !== false && is_dir($real)) {
            return $real;
        }
    }
    return null;
}

function apacheMonitorLinuxReadlinkExe(int $pid): ?string
{
    $link = '/proc/' . $pid . '/exe';
    $target = @readlink($link);
    if (!is_string($target) || $target === '') {
        return null;
    }
    $target = preg_replace('/ \(deleted\)$/', '', $target);
    return is_string($target) && $target !== '' ? $target : null;
}

function apacheMonitorLinuxPpid(int $pid): ?int
{
    $status = @file_get_contents('/proc/' . $pid . '/status');
    if (!is_string($status) || $status === '') {
        return null;
    }
    if (preg_match('/^PPid:\s*(\d+)/m', $status, $m)) {
        return (int) $m[1];
    }
    return null;
}

function apacheMonitorLinuxRunningServer(): ?array
{
    $pid = (int) getmypid();
    $allowed = apacheMonitorUnixServerBasenames();
    $guard = 0;
    while ($pid > 1 && $guard++ < 24) {
        $exe = apacheMonitorLinuxReadlinkExe($pid);
        if ($exe !== null) {
            $ok = apacheMonitorAcceptBin($exe, $allowed);
            if ($ok !== null) {
                return apacheMonitorPreferUnixCtl($ok, 'process');
            }
        }
        $ppid = apacheMonitorLinuxPpid($pid);
        if ($ppid === null || $ppid === $pid || $ppid < 1) {
            break;
        }
        $pid = $ppid;
    }
    return null;
}

function apacheMonitorWindowsWmi(): ?object
{
    if (!class_exists('COM')) {
        return null;
    }
    try {
        $wmi = new COM('winmgmts://./root/cimv2');
        return is_object($wmi) ? $wmi : null;
    } catch (Throwable $e) {
        return null;
    }
}

function apacheMonitorWindowsRunningHttpd(): ?array
{
    $wmi = apacheMonitorWindowsWmi();
    $paths = [];
    if ($wmi !== null) {
        try {
            $pid = (int) getmypid();
            $guard = 0;
            while ($pid > 0 && $guard++ < 24) {
                $q = $wmi->ExecQuery(
                    'SELECT ProcessId, ParentProcessId, Name, ExecutablePath FROM Win32_Process WHERE ProcessId = ' . $pid
                );
                $found = false;
                foreach ($q as $row) {
                    $found = true;
                    $name = strtolower((string) $row->Name);
                    $exe = trim((string) $row->ExecutablePath);
                    if ($name === 'httpd.exe' && $exe !== '') {
                        $ok = apacheMonitorAcceptBin($exe, apacheMonitorWindowsHttpdBasenames());
                        if ($ok !== null) {
                            return apacheMonitorHttpdResult($ok, 'httpd', 'process');
                        }
                    }
                    $pid = (int) $row->ParentProcessId;
                    break;
                }
                if (!$found) {
                    break;
                }
            }
            $q = $wmi->ExecQuery("SELECT ExecutablePath FROM Win32_Process WHERE Name = 'httpd.exe'");
            foreach ($q as $row) {
                $ok = apacheMonitorAcceptBin((string) $row->ExecutablePath, apacheMonitorWindowsHttpdBasenames());
                if ($ok !== null) {
                    $paths[$ok] = true;
                }
            }
        } catch (Throwable $e) {
            $paths = [];
        }
    }
    if ($paths === []) {
        $out = [];
        @exec('wmic process where "name=\'httpd.exe\'" get ExecutablePath /VALUE 2>NUL', $out);
        foreach ($out as $line) {
            $line = trim((string) $line);
            if (stripos($line, 'ExecutablePath=') !== 0) {
                continue;
            }
            $ok = apacheMonitorAcceptBin(trim(substr($line, strlen('ExecutablePath='))), apacheMonitorWindowsHttpdBasenames());
            if ($ok !== null) {
                $paths[$ok] = true;
            }
        }
    }
    if ($paths === []) {
        return null;
    }
    $keys = array_keys($paths);
    if (count($keys) === 1) {
        return apacheMonitorHttpdResult($keys[0], 'httpd', 'process');
    }
    $hint = strtolower((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''));
    $ini = apacheMonitorPhpIniPath();
    if (is_string($ini)) {
        $hint .= ' ' . strtolower($ini);
    }
    foreach ($keys as $path) {
        $dir = strtolower(dirname(dirname($path)));
        if ($hint !== '' && $dir !== '' && strpos($hint, $dir) !== false) {
            return apacheMonitorHttpdResult($path, 'httpd', 'process');
        }
        if ($hint !== '' && strpos(strtolower($path), $dir) !== false) {
            return apacheMonitorHttpdResult($path, 'httpd', 'process');
        }
    }
    return apacheMonitorHttpdResult($keys[0], 'httpd', 'process');
}

/**
 * @return list<string>
 */
function apacheMonitorWindowsCommonServiceNames(): array
{
    return [
        'Apache2.4',
        'Apache24',
        'Apache24-Vanilla',
        'Apache2.4_D',
        'Apache2.4-64',
        'Apache2.2',
        'Apache2',
        'Apache',
        'apache',
        'httpd',
        'xampp',
        'wampapache64',
        'wampapache',
        'laragon',
    ];
}

function apacheMonitorWindowsNormPath(string $path): string
{
    return strtolower(str_replace('/', '\\', $path));
}

/**
 * @return array{name:string,state:string,bin:?string,pathName:string}|null
 */
function apacheMonitorWindowsScQc(string $name): ?array
{
    $name = apacheMonitorSanitizeServiceName($name);
    if ($name === null) {
        return null;
    }
    $out = [];
    $code = 1;
    @exec('sc.exe qc ' . $name . ' 2>NUL', $out, $code);
    if ($code !== 0 || $out === []) {
        return null;
    }
    $text = implode("\n", $out);
    if (!preg_match('/BINARY_PATH_NAME\s*:\s*(.+)/i', $text, $m)) {
        return null;
    }
    $pathName = trim($m[1]);
    if (stripos($pathName, 'httpd.exe') === false) {
        return null;
    }
    $exe = apacheMonitorExtractQuotedExe($pathName);
    $bin = $exe !== null ? apacheMonitorAcceptBin($exe, apacheMonitorWindowsHttpdBasenames()) : null;
    $state = 'unknown';
    $query = [];
    @exec('sc.exe query ' . $name . ' 2>NUL', $query);
    $qtext = implode("\n", $query);
    if (preg_match('/STATE\s*:\s*\d+\s+(\w+)/i', $qtext, $sm)) {
        $state = strtolower($sm[1]);
    }
    return [
        'name' => $name,
        'state' => $state,
        'bin' => $bin,
        'pathName' => $pathName,
    ];
}

/**
 * @param array<string,array{name:string,state:string,bin:?string,pathName:string}> $found
 */
function apacheMonitorWindowsRememberService(array &$found, ?array $item): void
{
    if ($item === null) {
        return;
    }
    $name = (string) ($item['name'] ?? '');
    if ($name === '' || isset($found[$name])) {
        return;
    }
    $found[$name] = $item;
}

/**
 * @return list<array{name:string,state:string,bin:?string,pathName:string}>
 */
function apacheMonitorWindowsListHttpdServices(): array
{
    static $done = false;
    static $list = [];
    if ($done) {
        return $list;
    }
    $done = true;
    $found = [];

    foreach (apacheMonitorWindowsCommonServiceNames() as $name) {
        $item = apacheMonitorWindowsScQc($name);
        apacheMonitorWindowsRememberService($found, $item);
        if (
            is_array($item)
            && strtolower((string) ($item['state'] ?? '')) === 'running'
            && !empty($item['bin'])
        ) {
            $list = array_values($found);
            return $list;
        }
    }

    $queryOut = [];
    @exec('sc.exe query state= all', $queryOut);
    foreach ($queryOut as $line) {
        if (!preg_match('/SERVICE_NAME:\s*(.+)\s*$/i', (string) $line, $m)) {
            continue;
        }
        $name = trim($m[1]);
        if (!preg_match('/apache|httpd|xampp|wamp|laragon/i', $name)) {
            continue;
        }
        $item = apacheMonitorWindowsScQc($name);
        apacheMonitorWindowsRememberService($found, $item);
        if (
            is_array($item)
            && strtolower((string) ($item['state'] ?? '')) === 'running'
            && !empty($item['bin'])
        ) {
            $list = array_values($found);
            return $list;
        }
    }

    if ($found !== []) {
        $list = array_values($found);
        return $list;
    }

    $wmi = apacheMonitorWindowsWmi();
    if ($wmi !== null) {
        try {
            $q = $wmi->ExecQuery(
                "SELECT Name, PathName, State FROM Win32_Service WHERE PathName LIKE '%httpd.exe%'"
            );
            foreach ($q as $row) {
                $svc = apacheMonitorSanitizeServiceName((string) $row->Name);
                if ($svc === null) {
                    continue;
                }
                $pathName = trim((string) $row->PathName);
                $exe = apacheMonitorExtractQuotedExe($pathName);
                $bin = $exe !== null ? apacheMonitorAcceptBin($exe, apacheMonitorWindowsHttpdBasenames()) : null;
                apacheMonitorWindowsRememberService($found, [
                    'name' => $svc,
                    'state' => strtolower((string) $row->State),
                    'bin' => $bin,
                    'pathName' => $pathName,
                ]);
            }
        } catch (Throwable $e) {
            // sc.exe discovery above is enough when COM is missing
        }
    }

    if ($found === []) {
        $ps = 'Get-CimInstance Win32_Service | Where-Object {$_.PathName -like \'*httpd.exe*\'} | ForEach-Object { $_.Name + \'|\' + $_.State + \'|\' + $_.PathName }';
        $cim = [];
        @exec(
            'powershell.exe -NoProfile -NonInteractive -NoLogo -WindowStyle Hidden -Command ' . escapeshellarg($ps),
            $cim
        );
        foreach ($cim as $line) {
            $parts = explode('|', trim((string) $line), 3);
            if (count($parts) < 3) {
                continue;
            }
            $svc = apacheMonitorSanitizeServiceName($parts[0]);
            if ($svc === null) {
                continue;
            }
            $pathName = trim($parts[2]);
            $exe = apacheMonitorExtractQuotedExe($pathName);
            $bin = $exe !== null ? apacheMonitorAcceptBin($exe, apacheMonitorWindowsHttpdBasenames()) : null;
            apacheMonitorWindowsRememberService($found, [
                'name' => $svc,
                'state' => strtolower($parts[1]),
                'bin' => $bin,
                'pathName' => $pathName,
            ]);
        }
    }

    $list = array_values($found);
    return $list;
}

function apacheMonitorWindowsServiceHttpd(): ?array
{
    $running = null;
    $any = null;
    foreach (apacheMonitorWindowsListHttpdServices() as $svc) {
        $bin = $svc['bin'] ?? null;
        if (!is_string($bin) || $bin === '') {
            continue;
        }
        $item = apacheMonitorHttpdResult($bin, 'httpd', 'service', $svc['name']);
        $state = strtolower((string) ($svc['state'] ?? ''));
        if ($state === 'running') {
            $running = $item;
            break;
        }
        if ($any === null) {
            $any = $item;
        }
    }
    return $running ?? $any;
}

function apacheMonitorPsSingleQuote(string $value): string
{
    return "'" . str_replace("'", "''", $value) . "'";
}

function apacheMonitorWindowsSpawnDetached(string $bat): bool
{
    $bat = str_replace('/', '\\', $bat);
    if (!is_file($bat) || preg_match('/["&|<>%\r\n]/', $bat)) {
        return false;
    }

    $wmi = apacheMonitorWindowsWmi();
    if ($wmi !== null) {
        try {
            $pid = 0;
            $res = $wmi->Get('Win32_Process')->Create('cmd.exe /c "' . $bat . '"', null, null, $pid);
            if ((int) $res === 0) {
                return true;
            }
        } catch (Throwable $e) {
            // fall through
        }
    }

    $ps = 'Start-Process -FilePath ' . apacheMonitorPsSingleQuote($bat) . ' -WindowStyle Hidden';
    $out = [];
    $code = 1;
    @exec(
        'powershell.exe -NoProfile -NonInteractive -NoLogo -WindowStyle Hidden -Command ' . escapeshellarg($ps),
        $out,
        $code
    );
    if ($code === 0) {
        return true;
    }

    $comspec = getenv('ComSpec');
    if (!is_string($comspec) || $comspec === '') {
        $comspec = 'C:\\Windows\\System32\\cmd.exe';
    }
    $comspec = str_replace('/', '\\', $comspec);
    $proc = @proc_open(
        [$comspec, '/c', 'start', '/B', '', $bat],
        [
            0 => ['file', 'NUL', 'r'],
            1 => ['file', 'NUL', 'a'],
            2 => ['file', 'NUL', 'a'],
        ],
        $pipes,
        null,
        null,
        ['bypass_shell' => true, 'create_process_group' => true]
    );
    if (is_resource($proc)) {
        @proc_close($proc);
        return true;
    }

    @pclose(@popen('"' . $comspec . '" /c start "" /B "' . $bat . '"', 'r'));
    return is_file($bat);
}

/**
 * @return list<string>
 */
function apacheMonitorPathLookup(array $names): array
{
    $found = [];
    if (PHP_OS_FAMILY === 'Windows') {
        foreach ($names as $name) {
            $out = [];
            @exec('where.exe ' . escapeshellarg($name) . ' 2>NUL', $out);
            foreach ($out as $line) {
                $ok = apacheMonitorAcceptBin(trim((string) $line), $names);
                if ($ok !== null) {
                    $found[$ok] = true;
                }
            }
        }
        return array_keys($found);
    }
    foreach ($names as $name) {
        $out = [];
        @exec('command -v ' . escapeshellarg($name) . ' 2>/dev/null', $out);
        foreach ($out as $line) {
            $ok = apacheMonitorAcceptBin(trim((string) $line), $names);
            if ($ok !== null) {
                $found[$ok] = true;
            }
        }
    }
    return array_keys($found);
}

/**
 * @return list<string>
 */
function apacheMonitorConventionalHttpdCandidates(): array
{
    $paths = [];
    if (PHP_OS_FAMILY === 'Windows') {
        $relatives = [
            'Apache/bin/httpd.exe',
            'Apache24/bin/httpd.exe',
            'Apache2.4/bin/httpd.exe',
            'xampp/apache/bin/httpd.exe',
            'httpd/bin/httpd.exe',
            'Program Files/Apache Software Foundation/Apache2.4/bin/httpd.exe',
            'Program Files/Apache Software Foundation/Apache24/bin/httpd.exe',
            'Program Files (x86)/Apache Software Foundation/Apache2.4/bin/httpd.exe',
            'Program Files/Apache Group/Apache2/bin/httpd.exe',
        ];
        foreach (range('C', 'Z') as $letter) {
            $root = $letter . ':\\';
            if (!@is_dir($root)) {
                continue;
            }
            foreach ($relatives as $rel) {
                $paths[] = $letter . ':/' . $rel;
            }
            $stacks = [
                $letter . ':/laragon/bin/apache/*/bin/httpd.exe',
                $letter . ':/wamp64/bin/apache/*/bin/httpd.exe',
                $letter . ':/wamp/bin/apache/*/bin/httpd.exe',
                $letter . ':/Bitnami/*/apache2/bin/httpd.exe',
            ];
            foreach ($stacks as $pattern) {
                $parent = dirname(str_replace('\\', '/', $pattern));
                while (strpos($parent, '*') !== false) {
                    $parent = dirname($parent);
                }
                if (!is_dir(str_replace('/', DIRECTORY_SEPARATOR, $parent))) {
                    continue;
                }
                foreach (glob($pattern) ?: [] as $hit) {
                    $paths[] = $hit;
                }
            }
        }
        return $paths;
    }
    return [
        '/usr/sbin/apache2ctl',
        '/usr/sbin/apachectl',
        '/usr/sbin/httpd',
        '/usr/sbin/apache2',
        '/usr/local/sbin/apachectl',
        '/usr/local/apache2/bin/httpd',
        '/usr/local/apache2/bin/apachectl',
        '/opt/apache2/bin/httpd',
        '/opt/lampp/bin/httpd',
        '/opt/bitnami/apache/bin/httpd',
    ];
}

/**
 * @return list<string>
 */
function apacheMonitorDiscoveredLogDirs(): array
{
    $dirs = [];
    $root = apacheMonitorApacheGetenvServerRoot();
    if ($root === null) {
        $httpd = apacheMonitorFindHttpd();
        if (is_array($httpd) && !empty($httpd['bin'])) {
            $maybe = realpath(dirname((string) $httpd['bin']) . DIRECTORY_SEPARATOR . '..');
            if ($maybe !== false && is_dir($maybe)) {
                $root = $maybe;
            }
        }
    }
    if (is_string($root) && $root !== '') {
        $dirs[] = $root . DIRECTORY_SEPARATOR . 'logs';
        $dirs[] = $root . DIRECTORY_SEPARATOR . 'log';
    }
    return $dirs;
}

/**
 * Locate the Apache binary that is serving this request, wherever it is installed.
 *
 * @return array{bin:string,kind:string,label:string,service:?string,source:string}|null
 */
function apacheMonitorFindHttpd(): ?array
{
    static $cached = false;
    static $result = null;
    if ($cached) {
        return $result;
    }
    $cached = true;

    $env = apacheMonitorEnvValue('LINKNEST_APACHE_HTTPD');
    if ($env !== '') {
        if (PHP_OS_FAMILY === 'Windows') {
            $ok = apacheMonitorAcceptBin($env, apacheMonitorWindowsHttpdBasenames());
            if ($ok !== null) {
                $result = apacheMonitorHttpdResult($ok, 'httpd', 'env');
                return $result;
            }
        } else {
            $ok = apacheMonitorAcceptBin($env, apacheMonitorUnixServerBasenames());
            if ($ok !== null) {
                $result = apacheMonitorPreferUnixCtl($ok, 'env');
                return $result;
            }
        }
    }

    if (PHP_OS_FAMILY === 'Windows') {
        $running = apacheMonitorWindowsRunningHttpd();
        if ($running !== null) {
            $result = $running;
            return $result;
        }

        $serverRoot = apacheMonitorApacheGetenvServerRoot();
        $starts = [];
        if ($serverRoot !== null) {
            $starts[] = $serverRoot;
        }
        $starts[] = (string) ($_SERVER['DOCUMENT_ROOT'] ?? '');
        $starts[] = (string) ($_SERVER['SCRIPT_FILENAME'] ?? '');
        $ini = apacheMonitorPhpIniPath();
        if (is_string($ini)) {
            $starts[] = $ini;
        }
        $starts[] = __DIR__;
        $starts[] = dirname(__DIR__);

        foreach (apacheMonitorWalkHttpdCandidates($starts) as $path) {
            $ok = apacheMonitorAcceptBin($path, apacheMonitorWindowsHttpdBasenames());
            if ($ok !== null) {
                $result = apacheMonitorHttpdResult($ok, 'httpd', 'layout');
                return $result;
            }
        }

        $svc = apacheMonitorWindowsServiceHttpd();
        if ($svc !== null) {
            $result = $svc;
            return $result;
        }

        foreach (apacheMonitorPathLookup(apacheMonitorWindowsHttpdBasenames()) as $path) {
            $result = apacheMonitorHttpdResult($path, 'httpd', 'path');
            return $result;
        }

        foreach (apacheMonitorConventionalHttpdCandidates() as $path) {
            $ok = apacheMonitorAcceptBin($path, apacheMonitorWindowsHttpdBasenames());
            if ($ok !== null) {
                $result = apacheMonitorHttpdResult($ok, 'httpd', 'fallback');
                return $result;
            }
        }

        $result = null;
        return $result;
    }

    $running = apacheMonitorLinuxRunningServer();
    if ($running !== null) {
        $result = $running;
        return $result;
    }

    $serverRoot = apacheMonitorApacheGetenvServerRoot();
    $starts = [];
    if ($serverRoot !== null) {
        $starts[] = $serverRoot;
    }
    $starts[] = (string) ($_SERVER['DOCUMENT_ROOT'] ?? '');
    $starts[] = (string) ($_SERVER['SCRIPT_FILENAME'] ?? '');
    $ini = apacheMonitorPhpIniPath();
    if (is_string($ini)) {
        $starts[] = $ini;
    }
    $starts[] = __DIR__;
    $starts[] = dirname(__DIR__);

    foreach (apacheMonitorWalkHttpdCandidates($starts) as $path) {
        $ok = apacheMonitorAcceptBin($path, apacheMonitorUnixServerBasenames());
        if ($ok !== null) {
            $result = apacheMonitorPreferUnixCtl($ok, 'layout');
            return $result;
        }
    }

    foreach (apacheMonitorConventionalHttpdCandidates() as $path) {
        $ok = apacheMonitorAcceptBin($path, apacheMonitorUnixServerBasenames());
        if ($ok !== null) {
            $result = apacheMonitorPreferUnixCtl($ok, 'fallback');
            return $result;
        }
    }

    foreach (apacheMonitorPathLookup(apacheMonitorUnixServerBasenames()) as $path) {
        $result = apacheMonitorPreferUnixCtl($path, 'path');
        return $result;
    }

    $result = null;
    return $result;
}

function apacheMonitorCollectActions(): array
{
    $ini = apacheMonitorPhpIniPath();
    $httpd = apacheMonitorFindHttpd();
    if (is_array($httpd)) {
        $httpd = apacheMonitorAttachWindowsService($httpd);
    }
    $opcacheActive = false;
    try {
        $op = apacheMonitorCollectOpcache();
        $opcacheActive = !empty($op['active']);
    } catch (Throwable $e) {
        $opcacheActive = false;
    }

    return [
        'phpIniPath' => $ini,
        'phpIniWritable' => $ini !== null && is_writable($ini),
        'opcacheActive' => $opcacheActive,
        'canEnableOpcache' => $ini !== null && is_writable($ini),
        'canRestartApache' => $httpd !== null,
        'apacheBinary' => $httpd['label'] ?? null,
        'apacheBinarySource' => $httpd['source'] ?? null,
        'apacheService' => $httpd['service'] ?? null,
        'layout' => apacheMonitorIsDocker() ? 'docker' : (apacheMonitorIsXampp() ? 'xampp' : 'vanilla'),
    ];
}

/**
 * @return array{ok:bool,phpIni:?string,backup:?string,changed:list<string>,message:string}
 */
function apacheMonitorEnableOpcache(): array
{
    $ini = apacheMonitorPhpIniPath();
    if ($ini === null) {
        throw new RuntimeException('Could not locate the php.ini Apache is using.');
    }
    if (!is_writable($ini)) {
        throw new RuntimeException('php.ini is not writable: ' . $ini);
    }

    $raw = @file_get_contents($ini);
    if (!is_string($raw) || $raw === '') {
        throw new RuntimeException('Could not read php.ini: ' . $ini);
    }

    $content = $raw;
    $changed = [];
    $dll = apacheMonitorOpcacheDllPath();
    $loaded = extension_loaded('Zend OPcache');

    if ($dll !== null) {
        $zendLine = 'zend_extension=opcache';
        $zendPattern = '/^[ \t]*;?[ \t]*zend_extension[ \t]*=[ \t]*.*opcache.*$/mi';
        if (preg_match($zendPattern, $content, $m)) {
            if (trim($m[0]) !== $zendLine) {
                $content = preg_replace($zendPattern, $zendLine, $content, 1) ?? $content;
                $changed[] = 'zend_extension';
            }
        } else {
            $nl = strpos($content, "\r\n") !== false ? "\r\n" : "\n";
            $content = rtrim($content) . $nl . $zendLine . $nl;
            $changed[] = 'zend_extension';
        }
    } elseif (!$loaded && PHP_OS_FAMILY !== 'Windows') {
        $zendPattern = '/^[ \t]*;?[ \t]*zend_extension[ \t]*=[ \t]*.*opcache.*$/mi';
        if (!preg_match($zendPattern, $content)) {
            $nl = strpos($content, "\r\n") !== false ? "\r\n" : "\n";
            $content = rtrim($content) . $nl . 'zend_extension=opcache' . $nl;
            $changed[] = 'zend_extension';
        }
    }

    $settings = [
        'opcache.enable' => '1',
        'opcache.enable_cli' => '0',
        'opcache.memory_consumption' => '256',
        'opcache.interned_strings_buffer' => '32',
        'opcache.max_accelerated_files' => '20000',
        'opcache.max_wasted_percentage' => '10',
        'opcache.validate_timestamps' => '1',
        'opcache.revalidate_freq' => '60',
        'opcache.enable_file_override' => '1',
        'opcache.save_comments' => '1',
        'realpath_cache_size' => '4096K',
        'realpath_cache_ttl' => '600',
    ];
    foreach ($settings as $key => $value) {
        [$content, $did] = apacheMonitorIniSetKey($content, $key, $value);
        if ($did) {
            $changed[] = $key;
        }
    }

    $backup = null;
    if ($content !== $raw) {
        $backup = $ini . '.linknest.bak';
        if (!is_file($backup)) {
            if (@copy($ini, $backup) === false) {
                throw new RuntimeException('Could not write php.ini backup: ' . $backup);
            }
        }
        if (@file_put_contents($ini, $content, LOCK_EX) === false) {
            throw new RuntimeException('Could not write php.ini: ' . $ini);
        }
    }

    return [
        'ok' => true,
        'phpIni' => $ini,
        'backup' => $backup,
        'changed' => array_values(array_unique($changed)),
        'message' => $changed === []
            ? 'php.ini already has the recommended OPcache settings. Restart Apache if OPcache is still inactive.'
            : 'Updated php.ini OPcache settings. Restart Apache for them to take effect.',
    ];
}

/**
 * @return list<string>
 */
function apacheMonitorWindowsServiceNamesForBin(string $bin): array
{
    $want = apacheMonitorWindowsNormPath($bin);
    $matched = [];
    $runningMatched = [];
    $others = [];
    foreach (apacheMonitorWindowsListHttpdServices() as $svc) {
        $name = apacheMonitorSanitizeServiceName((string) ($svc['name'] ?? ''));
        if ($name === null) {
            continue;
        }
        $svcBin = apacheMonitorWindowsNormPath((string) ($svc['bin'] ?? ''));
        $state = strtolower((string) ($svc['state'] ?? ''));
        if ($want !== '' && $svcBin === $want) {
            if ($state === 'running') {
                $runningMatched[] = $name;
            } else {
                $matched[] = $name;
            }
            continue;
        }
        $others[] = $name;
    }
    $names = array_values(array_unique(array_merge($runningMatched, $matched)));
    if ($names === [] && count($others) === 1) {
        $names = $others;
    }
    return $names;
}

function apacheMonitorBuildWindowsRestartCmd(string $bin, array $serviceNames): string
{
    $bin = str_replace('/', '\\', $bin);
    $safe = [];
    foreach ($serviceNames as $name) {
        $name = apacheMonitorSanitizeServiceName((string) $name);
        if ($name !== null) {
            $safe[$name] = true;
        }
    }
    if ($safe === []) {
        foreach (apacheMonitorWindowsCommonServiceNames() as $name) {
            $safe[$name] = true;
        }
    }
    $svcList = implode(' ', array_keys($safe));
    $nl = "\r\n";
    return '@echo off' . $nl
        . 'setlocal EnableExtensions' . $nl
        . 'set "LOG=%TEMP%\\linknest-apache-restart.log"' . $nl
        . 'echo ===== %DATE% %TIME% =====>>"%LOG%"' . $nl
        . 'echo httpd=' . $bin . '>>"%LOG%"' . $nl
        . 'echo services=' . $svcList . '>>"%LOG%"' . $nl
        . 'ping 127.0.0.1 -n 5 >nul' . $nl
        . 'set "HTTPD=' . $bin . '"' . $nl
        . 'for %%S in (' . $svcList . ') do (' . $nl
        . '  echo [try] httpd -k restart -n %%S>>"%LOG%"' . $nl
        . '  "%HTTPD%" -k restart -n %%S >>"%LOG%" 2>&1' . $nl
        . '  if not errorlevel 1 goto :ok' . $nl
        . ')' . $nl
        . 'echo [try] httpd -k restart>>"%LOG%"' . $nl
        . '"%HTTPD%" -k restart >>"%LOG%" 2>&1' . $nl
        . 'if not errorlevel 1 goto :ok' . $nl
        . 'for %%S in (' . $svcList . ') do (' . $nl
        . '  echo [try] net stop/start %%S>>"%LOG%"' . $nl
        . '  net.exe stop %%S /y >>"%LOG%" 2>&1' . $nl
        . '  ping 127.0.0.1 -n 5 >nul' . $nl
        . '  net.exe start %%S >>"%LOG%" 2>&1' . $nl
        . '  if not errorlevel 1 goto :ok' . $nl
        . '  echo [try] sc start %%S>>"%LOG%"' . $nl
        . '  sc.exe start %%S >>"%LOG%" 2>&1' . $nl
        . '  if not errorlevel 1 goto :ok' . $nl
        . ')' . $nl
        . 'for %%S in (' . $svcList . ') do (' . $nl
        . '  echo [try] sc stop/start %%S>>"%LOG%"' . $nl
        . '  sc.exe stop %%S >>"%LOG%" 2>&1' . $nl
        . '  ping 127.0.0.1 -n 6 >nul' . $nl
        . '  sc.exe start %%S >>"%LOG%" 2>&1' . $nl
        . '  if not errorlevel 1 goto :ok' . $nl
        . ')' . $nl
        . 'for %%S in (' . $svcList . ') do (' . $nl
        . '  echo [try] httpd -k stop/start -n %%S>>"%LOG%"' . $nl
        . '  "%HTTPD%" -k stop -n %%S >>"%LOG%" 2>&1' . $nl
        . '  ping 127.0.0.1 -n 5 >nul' . $nl
        . '  "%HTTPD%" -k start -n %%S >>"%LOG%" 2>&1' . $nl
        . '  if not errorlevel 1 goto :ok' . $nl
        . ')' . $nl
        . 'echo FAILED>>"%LOG%"' . $nl
        . 'exit /b 1' . $nl
        . ':ok' . $nl
        . 'echo OK>>"%LOG%"' . $nl
        . 'exit /b 0' . $nl;
}

function apacheMonitorSpawnDelayedRestart(array $httpd): void
{
    ignore_user_abort(true);
    if (($httpd['kind'] ?? '') === 'ctl') {
        $bin = (string) $httpd['bin'];
        $script = 'sleep 2; ' . escapeshellarg($bin) . ' graceful >/dev/null 2>&1';
        $proc = @proc_open(
            ['sh', '-c', $script],
            [
                0 => ['file', '/dev/null', 'r'],
                1 => ['file', '/dev/null', 'a'],
                2 => ['file', '/dev/null', 'a'],
            ],
            $pipes,
            null,
            null,
            ['bypass_shell' => true]
        );
        if (!is_resource($proc)) {
            throw new RuntimeException('Could not schedule apachectl graceful.');
        }
        return;
    }

    $bin = str_replace('/', '\\', (string) $httpd['bin']);
    $names = [];
    if (isset($httpd['services']) && is_array($httpd['services'])) {
        $names = $httpd['services'];
    }
    $primary = apacheMonitorSanitizeServiceName((string) ($httpd['service'] ?? ''));
    if ($primary !== null) {
        array_unshift($names, $primary);
    }
    $names = array_values(array_unique(array_merge($names, apacheMonitorWindowsServiceNamesForBin($bin))));

    $bat = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'linknest-apache-restart.cmd';
    $body = apacheMonitorBuildWindowsRestartCmd($bin, $names);
    if (@file_put_contents($bat, $body) === false) {
        throw new RuntimeException('Could not write Apache restart helper: ' . $bat);
    }
    if (!apacheMonitorWindowsSpawnDetached($bat)) {
        throw new RuntimeException(
            'Could not start a detached Apache restart. From an elevated Command Prompt run: '
            . '"' . $bin . '" -k restart'
            . ($primary !== null ? ' -n ' . $primary : '')
            . '  or  net stop ' . ($primary ?? 'Apache2.4') . ' & net start ' . ($primary ?? 'Apache2.4')
        );
    }
}

function apacheMonitorAttachWindowsService(array $httpd): array
{
    if (PHP_OS_FAMILY !== 'Windows' || ($httpd['kind'] ?? '') !== 'httpd') {
        return $httpd;
    }
    $bin = (string) ($httpd['bin'] ?? '');
    $names = apacheMonitorWindowsServiceNamesForBin($bin);
    $envSvc = apacheMonitorSanitizeServiceName(apacheMonitorEnvValue('LINKNEST_APACHE_SERVICE'));
    if ($envSvc !== null) {
        array_unshift($names, $envSvc);
        $names = array_values(array_unique($names));
    }
    if ($names === []) {
        return $httpd;
    }
    $httpd['service'] = $names[0];
    $httpd['services'] = $names;
    return $httpd;
}

/**
 * @return array{ok:bool,method:string,binary:?string,message:string}
 */
function apacheMonitorRestartApache(): array
{
    $httpd = apacheMonitorFindHttpd();
    if ($httpd === null) {
        throw new RuntimeException(
            'Could not find httpd.exe / apachectl. Set LINKNEST_APACHE_HTTPD to the full path of the Apache binary, or start Apache from its service / control panel and retry.'
        );
    }
    $httpd = apacheMonitorAttachWindowsService($httpd);
    apacheMonitorSpawnDelayedRestart($httpd);

    $svc = is_string($httpd['service'] ?? null) ? (string) $httpd['service'] : null;
    if (($httpd['kind'] ?? '') === 'ctl') {
        $method = 'apachectl graceful';
        $message = 'Apache graceful restart is scheduled in about 2 seconds. This page may disconnect briefly.';
    } elseif ($svc !== null) {
        $method = 'windows-service:' . $svc;
        $message = 'Windows service ' . $svc . ' will restart in a few seconds (httpd -k restart, then net/sc stop+start if needed). This page may disconnect briefly.';
    } else {
        $method = 'httpd -k restart';
        $message = 'Apache restart is scheduled in a few seconds (httpd -k restart, then Windows service stop/start). This page may disconnect briefly.';
    }

    return [
        'ok' => true,
        'method' => $method,
        'binary' => $httpd['label'] ?? null,
        'service' => $svc,
        'message' => $message,
    ];
}
