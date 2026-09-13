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
    if ($host === 'localhost' || $host === '127.0.0.1' || $host === '::1') {
        return true;
    }
    return false;
}

/**
 * @return list<string>
 */
function apacheMonitorStatusUrlCandidates(): array
{
    $urls = [];
    $env = trim((string) getenv('LINKNEST_APACHE_STATUS_URL'));
    if ($env !== '' && apacheMonitorIsLocalStatusUrl($env)) {
        $urls[] = $env;
    }

    $port = (int) ($_SERVER['SERVER_PORT'] ?? 0);
    $bases = ['http://127.0.0.1', 'http://localhost', 'http://[::1]'];
    $ports = [];
    if ($port > 0 && $port !== 80 && $port !== 443) {
        $ports[] = $port;
    }
    $ports[] = 80;
    $ports[] = 8080;
    $ports[] = 8090;

    foreach ($bases as $base) {
        $urls[] = $base . '/server-status?auto';
        foreach ($ports as $p) {
            $urls[] = $base . ':' . $p . '/server-status?auto';
        }
    }

    $unique = [];
    foreach ($urls as $url) {
        if (!isset($unique[$url])) {
            $unique[$url] = true;
        }
    }
    return array_keys($unique);
}

/**
 * @return array{ok:bool,body:string,httpCode:int,error:string,url:string}
 */
function apacheMonitorHttpGet(string $url): array
{
    $result = [
        'ok' => false,
        'body' => '',
        'httpCode' => 0,
        'error' => '',
        'url' => $url,
    ];

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        if ($ch === false) {
            $result['error'] = 'curl_init failed';
            return $result;
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_TIMEOUT => 3,
            CURLOPT_HTTPHEADER => [
                'Accept: text/plain,*/*',
                'Connection: close',
            ],
            CURLOPT_USERAGENT => 'LinkNest-ApacheMonitor/1.0',
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
        ]);
        if (strpos($url, '[::1]') === false) {
            curl_setopt($ch, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
        }
        $body = curl_exec($ch);
        $errno = curl_errno($ch);
        $error = curl_error($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($body === false || $errno !== 0) {
            $result['error'] = $error !== '' ? $error : ('curl errno ' . $errno);
            $result['httpCode'] = $code;
            return $result;
        }
        $result['body'] = (string) $body;
        $result['httpCode'] = $code;
        $result['ok'] = $code >= 200 && $code < 300 && $result['body'] !== '';
        if (!$result['ok'] && $result['error'] === '') {
            $result['error'] = 'HTTP ' . $code;
        }
        return $result;
    }

    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 3,
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
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
        $code = (int) $m[1];
    }
    $result['httpCode'] = $code;
    if ($body === false) {
        $result['error'] = 'file_get_contents failed';
        return $result;
    }
    $result['body'] = (string) $body;
    $result['ok'] = $code >= 200 && $code < 300 && $result['body'] !== '';
    if (!$result['ok']) {
        $result['error'] = 'HTTP ' . $code;
    }
    return $result;
}

/**
 * @return array{status:?array,url:?string,error:?string}
 */
function apacheMonitorFetchStatus(): array
{
    $lastError = 'Apache /server-status was not reachable from PHP.';
    foreach (apacheMonitorStatusUrlCandidates() as $url) {
        $fetch = apacheMonitorHttpGet($url);
        if (!$fetch['ok']) {
            $lastError = $fetch['error'] !== '' ? $fetch['error'] : ('HTTP ' . $fetch['httpCode']);
            continue;
        }
        $parsed = apacheMonitorParseAuto($fetch['body']);
        if ($parsed === null) {
            $lastError = 'Unexpected /server-status response (is ExtendedStatus/mod_status enabled?)';
            continue;
        }
        return ['status' => $parsed, 'url' => $url, 'error' => null];
    }

    return ['status' => null, 'url' => null, 'error' => $lastError];
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
        '/var/log/apache2/access.log',
        '/var/log/apache2/other_vhosts_access.log',
        '/var/log/httpd/access_log',
        '/usr/local/apache2/logs/access_log',
        '/opt/lampp/logs/access_log',
    ]);

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
    return (bool) preg_match(
        '/^(access|error|other_vhosts_access|ssl_request|php[_-]?errors?)(\.log|_log)?(\.\d+|\.old|-old)?$|^php_error_log(\.\d+)?$/',
        $name
    );
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

function apacheMonitorSetupHint(?string $error): string
{
    return 'Apache monitoring reads http://127.0.0.1/server-status?auto (mod_status, Require local). '
        . 'On XAMPP this is usually already enabled via conf/extra/httpd-info.conf. '
        . 'On Docker, the image enables a2enmod status. '
        . 'On vanilla Apache, load status_module and include apache/linknest-server-status.conf. '
        . ($error ? 'Last error: ' . $error : '');
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

    apacheMonitorStoreSample($db, $now, $available, $available ? $status : null);
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
        : ($available ? 100.0 : 0.0);

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
        'setupHint' => $available ? null : apacheMonitorSetupHint($fetched['error']),
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
