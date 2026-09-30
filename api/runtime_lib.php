<?php
/**
 * Runtime (underlying software) visibility library — PHP / Node.js / npm / Apache / SQLite.
 *
 * Reports what this host is running, compares it with the official vendor indexes
 * (downloads.php.net, nodejs.org, php.net) and returns copy-paste command lines for
 * the operator. This library is deliberately READ-ONLY / ADVISORY:
 *
 *   - never upgrades, installs or removes anything
 *   - never writes to a PHP / Node / Apache / SQLite installation
 *   - never touches php.ini, httpd.conf, data/, uploads/ or dist/
 *   - the only file it writes is its own cache: data/runtime-cache.json
 *   - the only child processes it starts are read-only version probes
 *     (node -v, node -p process.arch, npm -v, httpd -v, git --version)
 *   - outbound network is GET-only against RUNTIME_HOST_ALLOWLIST
 *
 * Endpoint: api/runtime.php (admin only).  Guide: docs/RUNTIME_UPDATES.md
 */

if (!defined('RUNTIME_PROJECT_ROOT')) {
    define('RUNTIME_PROJECT_ROOT', realpath(__DIR__ . '/..') ?: dirname(__DIR__));
}

if (!defined('RUNTIME_CACHE_FILE')) {
    define('RUNTIME_CACHE_FILE', RUNTIME_PROJECT_ROOT . '/data/runtime-cache.json');
}
if (!defined('RUNTIME_CACHE_TTL')) {
    /** Vendor indexes move slowly; 6 hours keeps the panel responsive and polite. */
    define('RUNTIME_CACHE_TTL', 21600);
}
if (!defined('RUNTIME_DEFAULT_CHECK_INTERVAL')) {
    define('RUNTIME_DEFAULT_CHECK_INTERVAL', 360);
}
if (!defined('RUNTIME_HTTP_TIMEOUT')) {
    define('RUNTIME_HTTP_TIMEOUT', 20);
}
if (!defined('RUNTIME_HTTP_MAX_BYTES')) {
    define('RUNTIME_HTTP_MAX_BYTES', 8388608);
}

/** GET-only allowlist — anything else is refused before a socket is opened. */
const RUNTIME_HOST_ALLOWLIST = [
    'downloads.php.net',
    'www.php.net',
    'php.net',
    'nodejs.org',
];

/** Extensions LinkNest needs from PHP (see health.php / docs/SETUP.md). */
const RUNTIME_REQUIRED_PHP_EXTENSIONS = [
    'pdo_sqlite',
    'sqlite3',
    'curl',
    'mbstring',
    'openssl',
    'zip',
];

/** Reported separately because Windows PHP 8.5+ often builds OPcache in. */
const RUNTIME_OPTIONAL_PHP_EXTENSIONS = ['ldap', 'Zend OPcache', 'gd', 'intl', 'imagick'];

function runtimeIsWindows(): bool
{
    return PHP_OS_FAMILY === 'Windows';
}

function runtimeProjectRoot(): string
{
    return RUNTIME_PROJECT_ROOT;
}

/**
 * Docker / container detection (mirrors api/updater_lib.php without requiring it).
 */
function runtimeIsDocker(): bool
{
    if (getenv('LINKNEST_DOCKER') === '1' || getenv('SSH_GATEWAY_DOCKER') === '1') {
        return true;
    }
    if (runtimeIsWindows()) {
        return false;
    }
    if (@is_file('/.dockerenv')) {
        return true;
    }
    $identity = RUNTIME_PROJECT_ROOT . '/data/install_identity.php';
    if (is_file($identity)) {
        $raw = (string)@file_get_contents($identity);
        if (preg_match("/define\\('LINKNEST_INSTALL_FOLDER',\\s*'docker'\\)/", $raw)) {
            return true;
        }
    }
    if (is_readable('/proc/1/cgroup')) {
        $cgroup = (string)@file_get_contents('/proc/1/cgroup');
        if ($cgroup !== ''
            && (stripos($cgroup, 'docker') !== false
                || stripos($cgroup, 'containerd') !== false
                || stripos($cgroup, 'kubepods') !== false)) {
            return true;
        }
    }
    return false;
}

/** Respect disable_functions before attempting a child process. */
function runtimeCmdAllowed(string $fn): bool
{
    if (!function_exists($fn)) {
        return false;
    }
    $disabled = array_filter(array_map('trim', explode(',', (string)ini_get('disable_functions'))));
    foreach ($disabled as $entry) {
        if (strcasecmp($entry, $fn) === 0) {
            return false;
        }
    }
    return true;
}

/**
 * Read-only argv probe. Never uses a shell; never accepts a command string.
 *
 * @param list<string> $argv
 */
function runtimeRunArgv(array $argv, int $timeoutSec = 4): string
{
    if ($argv === [] || !runtimeCmdAllowed('proc_open')) {
        return '';
    }
    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $proc = @proc_open($argv, $descriptors, $pipes, null, null, ['bypass_shell' => true]);
    if (!is_resource($proc)) {
        return '';
    }
    fclose($pipes[0]);
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    $out = '';
    $err = '';
    $deadline = microtime(true) + max(1, $timeoutSec);
    while (true) {
        $status = proc_get_status($proc);
        $out .= (string)stream_get_contents($pipes[1]);
        $err .= (string)stream_get_contents($pipes[2]);
        if (!$status['running']) {
            break;
        }
        if (microtime(true) >= $deadline) {
            proc_terminate($proc);
            break;
        }
        usleep(20000);
    }
    $out .= (string)stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($proc);
    return trim($out !== '' ? $out : $err);
}

/** Locate an executable on PATH (read-only `where` / `which`). */
function runtimeWhere(string $exe): ?string
{
    if (!runtimeCmdAllowed('proc_open')) {
        return null;
    }
    $probe = runtimeIsWindows() ? ['where.exe', $exe] : ['which', $exe];
    $out = runtimeRunArgv($probe);
    if ($out === '') {
        return null;
    }
    foreach (preg_split('/\r\n|\n|\r/', $out) ?: [] as $line) {
        $line = trim($line);
        if ($line !== '' && is_file($line)) {
            return $line;
        }
    }
    return null;
}

/**
 * @param list<string> $candidates
 */
function runtimeFirstFile(array $candidates): ?string
{
    foreach ($candidates as $candidate) {
        if (is_string($candidate) && $candidate !== '' && @is_file($candidate)) {
            return $candidate;
        }
    }
    return null;
}

/**
 * Read the PE COFF machine type of a Windows EXE/DLL.
 *
 * @return 'x64'|'x86'|null
 */
function runtimePeMachine(?string $path): ?string
{
    if (!is_string($path) || $path === '' || !@is_file($path) || !@is_readable($path)) {
        return null;
    }
    $fh = @fopen($path, 'rb');
    if ($fh === false) {
        return null;
    }
    try {
        $dos = @fread($fh, 64);
        if ($dos === false || strlen($dos) < 64 || substr($dos, 0, 2) !== 'MZ') {
            return null;
        }
        $peOffset = unpack('V', substr($dos, 60, 4));
        if ($peOffset === false) {
            return null;
        }
        $e_lfanew = (int)$peOffset[1];
        if ($e_lfanew < 64 || $e_lfanew > 1048576) {
            return null;
        }
        if (@fseek($fh, $e_lfanew) !== 0) {
            return null;
        }
        $pe = @fread($fh, 6);
        if ($pe === false || strlen($pe) < 6 || substr($pe, 0, 4) !== "PE\0\0") {
            return null;
        }
        $machine = unpack('v', substr($pe, 4, 2));
        if ($machine === false) {
            return null;
        }
        $code = (int)$machine[1];
        if ($code === 0x8664) {
            return 'x64';
        }
        if ($code === 0x14c) {
            return 'x86';
        }
        return null;
    } finally {
        fclose($fh);
    }
}

function runtimeArchLabel(?string $arch): string
{
    if ($arch === 'x64') {
        return '64-bit (x64)';
    }
    if ($arch === 'x86') {
        return '32-bit (x86)';
    }
    if ($arch === 'arm64') {
        return '64-bit (arm64)';
    }
    return $arch !== null && $arch !== '' ? $arch : 'unknown';
}

function runtimeFormatBytes(int $bytes): string
{
    $bytes = max(0, $bytes);
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $index = 0;
    $value = (float)$bytes;
    while ($value >= 1024 && $index < count($units) - 1) {
        $value /= 1024;
        $index++;
    }
    return round($value, $index === 0 ? 0 : 2) . ' ' . $units[$index];
}

function runtimeNormalizeVersion(?string $version): string
{
    $version = trim((string)$version);
    $version = ltrim($version, 'vV');
    $version = preg_replace('/[^0-9.].*$/', '', $version) ?? '';
    return trim($version, '.');
}

/** Semantic-ish compare for dotted numeric versions. -1 / 0 / 1 */
function runtimeCompareVersions(?string $a, ?string $b): int
{
    $pa = array_map('intval', explode('.', runtimeNormalizeVersion($a)));
    $pb = array_map('intval', explode('.', runtimeNormalizeVersion($b)));
    $len = max(count($pa), count($pb));
    for ($i = 0; $i < $len; $i++) {
        $va = $pa[$i] ?? 0;
        $vb = $pb[$i] ?? 0;
        if ($va !== $vb) {
            return $va < $vb ? -1 : 1;
        }
    }
    return 0;
}

/**
 * @param array<int|string, mixed> $versions
 */
function runtimeMaxVersion(array $versions): ?string
{
    $best = null;
    foreach ($versions as $candidate) {
        if (!is_string($candidate) || $candidate === '') {
            continue;
        }
        if ($best === null || runtimeCompareVersions($candidate, $best) > 0) {
            $best = $candidate;
        }
    }
    return $best;
}

/** "8.5.11" → "8.5"; "22.19.0" → "22" (parts = 1). */
function runtimeVersionLine(?string $version, int $parts = 2): string
{
    $normalized = runtimeNormalizeVersion($version);
    if ($normalized === '') {
        return '';
    }
    $segments = explode('.', $normalized);
    return implode('.', array_slice($segments, 0, max(1, $parts)));
}

function runtimeHostAllowed(string $host): bool
{
    $host = strtolower(trim($host));
    if ($host === '') {
        return false;
    }
    foreach (RUNTIME_HOST_ALLOWLIST as $allowed) {
        if ($host === $allowed || str_ends_with($host, '.' . $allowed)) {
            return true;
        }
    }
    return false;
}

/**
 * GET-only fetch against the vendor allowlist. Never posts, never follows to another host.
 *
 * @return array{ok:bool,status:int,body:string,error:?string}
 */
function runtimeHttpGet(string $url, int $maxBytes = RUNTIME_HTTP_MAX_BYTES): array
{
    $parts = @parse_url($url);
    $host = is_array($parts) ? (string)($parts['host'] ?? '') : '';
    $scheme = is_array($parts) ? strtolower((string)($parts['scheme'] ?? '')) : '';
    if ($scheme !== 'https' || !runtimeHostAllowed($host)) {
        return ['ok' => false, 'status' => 0, 'body' => '', 'error' => 'Blocked host: ' . $host];
    }

    if (function_exists('curl_init')) {
        $ch = @curl_init($url);
        if ($ch === false) {
            return ['ok' => false, 'status' => 0, 'body' => '', 'error' => 'curl_init failed'];
        }
        $body = '';
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => RUNTIME_HTTP_TIMEOUT,
            CURLOPT_USERAGENT => 'LinkNest-RuntimeCheck/1.0 (read-only)',
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_WRITEFUNCTION => static function ($handle, $chunk) use (&$body, $maxBytes) {
                $body .= $chunk;
                if (strlen($body) > $maxBytes) {
                    return 0; // abort oversize response
                }
                return strlen($chunk);
            },
        ]);
        $ok = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = $ok === false ? (string)curl_error($ch) : null;
        curl_close($ch);
        if ($ok === false) {
            return ['ok' => false, 'status' => $status, 'body' => '', 'error' => $error ?: 'request failed'];
        }
        if (strlen($body) > $maxBytes) {
            return ['ok' => false, 'status' => $status, 'body' => '', 'error' => 'Response exceeded size cap'];
        }
        if ($status < 200 || $status >= 300) {
            return ['ok' => false, 'status' => $status, 'body' => '', 'error' => 'HTTP ' . $status];
        }
        return ['ok' => true, 'status' => $status, 'body' => $body, 'error' => null];
    }

    $context = @stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => RUNTIME_HTTP_TIMEOUT,
            'user_agent' => 'LinkNest-RuntimeCheck/1.0 (read-only)',
            'follow_location' => 1,
            'max_redirects' => 3,
            'ignore_errors' => true,
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
        ],
    ]);
    $body = @file_get_contents($url, false, $context, 0, $maxBytes);
    if ($body === false) {
        return ['ok' => false, 'status' => 0, 'body' => '', 'error' => 'Request failed (no curl)'];
    }
    return ['ok' => true, 'status' => 200, 'body' => (string)$body, 'error' => null];
}

/**
 * @return array{updatedAt:?int,entries:array<string,array{fetchedAt:int,value:mixed}>}
 */
function runtimeCacheRead(): array
{
    $empty = ['updatedAt' => null, 'entries' => []];
    if (!is_file(RUNTIME_CACHE_FILE)) {
        return $empty;
    }
    $raw = @file_get_contents(RUNTIME_CACHE_FILE);
    if (!is_string($raw) || $raw === '') {
        return $empty;
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return $empty;
    }
    $entries = isset($decoded['entries']) && is_array($decoded['entries']) ? $decoded['entries'] : [];
    return [
        'updatedAt' => isset($decoded['updatedAt']) ? (int)$decoded['updatedAt'] : null,
        'entries' => $entries,
    ];
}

/** The only file this feature ever writes. */
function runtimeCacheWrite(array $cache): void
{
    $dir = dirname(RUNTIME_CACHE_FILE);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    @file_put_contents(
        RUNTIME_CACHE_FILE,
        json_encode([
            'updatedAt' => time(),
            'entries' => $cache['entries'] ?? [],
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
        LOCK_EX
    );
}

/**
 * @return array{value:mixed,fetchedAt:?int,fresh:bool}
 */
function runtimeCacheGet(string $key, int $ttl = RUNTIME_CACHE_TTL): array
{
    $cache = runtimeCacheRead();
    $entry = $cache['entries'][$key] ?? null;
    if (!is_array($entry) || !array_key_exists('value', $entry)) {
        return ['value' => null, 'fetchedAt' => null, 'fresh' => false];
    }
    $fetchedAt = isset($entry['fetchedAt']) ? (int)$entry['fetchedAt'] : null;
    $fresh = $fetchedAt !== null && (time() - $fetchedAt) < max(60, $ttl);
    return ['value' => $entry['value'], 'fetchedAt' => $fetchedAt, 'fresh' => $fresh];
}

function runtimeCachePut(string $key, $value): void
{
    $cache = runtimeCacheRead();
    $cache['entries'][$key] = ['fetchedAt' => time(), 'value' => $value];
    runtimeCacheWrite($cache);
}

function runtimeCheckIntervalMinutes(): int
{
    $seconds = RUNTIME_DEFAULT_CHECK_INTERVAL;
    if (function_exists('getDB')) {
        try {
            $db = getDB();
            $stmt = $db->prepare('SELECT value FROM settings WHERE key = ?');
            $stmt->execute(['runtime_check_interval_minutes']);
            $raw = $stmt->fetchColumn();
            if ($raw !== false && is_numeric($raw)) {
                // Stored in minutes by the settings UI; 0 disables auto checks.
                $seconds = max(60, (int)$raw * 60);
            }
        } catch (Throwable $e) {
            // Fall back to the default interval.
        }
    }
    return $seconds;
}

/** Absolute path to php.exe / php (never the Apache binary under mod_php). */
function runtimePhpBinaryPath(): ?string
{
    $candidates = [];
    if (defined('PHP_BINARY') && is_string(PHP_BINARY) && PHP_BINARY !== '') {
        if (preg_match('/^php[\d.]*(\.exe)?$/i', basename(PHP_BINARY))) {
            $candidates[] = PHP_BINARY;
        }
    }
    $ini = php_ini_loaded_file();
    if (is_string($ini) && $ini !== '') {
        $dir = dirname($ini);
        $candidates[] = $dir . DIRECTORY_SEPARATOR . (runtimeIsWindows() ? 'php.exe' : 'php');
    }
    if (runtimeIsWindows()) {
        $candidates[] = 'C:\\xampp\\php\\php.exe';
        $candidates[] = 'D:\\php\\php.exe';
        $candidates[] = 'C:\\php\\php.exe';
    } else {
        $candidates[] = '/usr/local/bin/php';
        $candidates[] = '/usr/bin/php';
    }
    $found = runtimeFirstFile($candidates);
    if ($found !== null) {
        return $found;
    }
    return runtimeWhere('php');
}

function runtimePhpFolder(): ?string
{
    $binary = runtimePhpBinaryPath();
    if ($binary !== null) {
        return dirname($binary);
    }
    $ini = php_ini_loaded_file();
    if (is_string($ini) && $ini !== '') {
        return dirname($ini);
    }
    return null;
}

function runtimeResolveIniPath(string $value, ?string $phpFolder): ?string
{
    $value = trim($value);
    if ($value === '') {
        return null;
    }
    if (preg_match('/^([A-Za-z]:[\\\\\/]|\/)/', $value)) {
        return rtrim($value, '\\/');
    }
    if ($phpFolder === null) {
        return null;
    }
    return rtrim($phpFolder, '\\/') . DIRECTORY_SEPARATOR . $value;
}

/**
 * PHP as it is actually serving this request (constants only — no child process).
 *
 * @return array<string, mixed>
 */
function runtimePhpInfo(): array
{
    $binary = runtimePhpBinaryPath();
    $folder = runtimePhpFolder();
    $iniPath = php_ini_loaded_file();
    $iniPath = is_string($iniPath) && $iniPath !== '' ? $iniPath : null;

    $loaded = array_map('strtolower', get_loaded_extensions());
    $hasExtension = static function (string $ext) use ($loaded): bool {
        return in_array(strtolower($ext), $loaded, true);
    };

    $required = [];
    $missing = [];
    foreach (RUNTIME_REQUIRED_PHP_EXTENSIONS as $ext) {
        $present = $hasExtension($ext);
        $required[$ext] = $present;
        if (!$present) {
            $missing[] = $ext;
        }
    }
    $optional = [];
    foreach (RUNTIME_OPTIONAL_PHP_EXTENSIONS as $ext) {
        $optional[$ext] = $hasExtension($ext);
    }

    $extensionDirRaw = (string)ini_get('extension_dir');
    $extensionDir = runtimeResolveIniPath($extensionDirRaw, $folder);

    return [
        'version' => PHP_VERSION,
        'line' => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION,
        'major' => PHP_MAJOR_VERSION,
        'release' => PHP_VERSION,
        'zts' => defined('PHP_ZTS') ? (bool)PHP_ZTS : false,
        'arch' => PHP_INT_SIZE === 8 ? 'x64' : 'x86',
        'sapi' => php_sapi_name(),
        'binary' => $binary,
        'folder' => $folder,
        'iniPath' => $iniPath,
        'iniWritable' => $iniPath !== null && @is_writable($iniPath),
        'iniAdditional' => php_ini_scanned_files() ?: null,
        'extensionDir' => $extensionDir,
        'extensionDirRaw' => $extensionDirRaw,
        'requiredExtensions' => $required,
        'optionalExtensions' => $optional,
        'missingExtensions' => $missing,
        'loadedExtensionCount' => count($loaded),
        'memoryLimit' => (string)ini_get('memory_limit'),
        'threadSafeRequired' => runtimeIsWindows(),
        'windows' => runtimeIsWindows(),
    ];
}

/**
 * @return list<string>
 */
function runtimeNodeCandidates(): array
{
    $candidates = [RUNTIME_PROJECT_ROOT . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'nodejs' . DIRECTORY_SEPARATOR . (runtimeIsWindows() ? 'node.exe' : 'bin/node')];
    if (runtimeIsWindows()) {
        $pf = getenv('ProgramFiles') ?: 'C:\\Program Files';
        $pf86 = getenv('ProgramFiles(x86)') ?: 'C:\\Program Files (x86)';
        $local = (string)getenv('LOCALAPPDATA');
        $appData = (string)getenv('APPDATA');
        $candidates[] = $pf . '\\nodejs\\node.exe';
        $candidates[] = $pf86 . '\\nodejs\\node.exe';
        if ($local !== '') {
            $candidates[] = $local . '\\Programs\\node\\node.exe';
        }
        if ($appData !== '') {
            $candidates[] = $appData . '\\nvm\\current\\node.exe';
        }
        $candidates[] = 'C:\\Program Files\\nodejs\\node.exe';
    } else {
        $candidates[] = '/usr/local/bin/node';
        $candidates[] = '/usr/bin/node';
        $candidates[] = '/opt/nodejs/bin/node';
    }
    return $candidates;
}

/** npm exposes its version in its own package.json — no child process needed. */
function runtimeNpmVersionFor(string $nodePath): ?string
{
    $nodeDir = dirname($nodePath);
    foreach ([
        $nodeDir . DIRECTORY_SEPARATOR . 'node_modules' . DIRECTORY_SEPARATOR . 'npm' . DIRECTORY_SEPARATOR . 'package.json',
        $nodeDir . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'node_modules' . DIRECTORY_SEPARATOR . 'npm' . DIRECTORY_SEPARATOR . 'package.json',
        '/usr/lib/node_modules/npm/package.json',
        '/usr/local/lib/node_modules/npm/package.json',
        '/usr/share/nodejs/npm/package.json',
    ] as $packageFile) {
        if (!@is_file($packageFile)) {
            continue;
        }
        $raw = @file_get_contents($packageFile);
        if (!is_string($raw) || $raw === '') {
            continue;
        }
        $decoded = json_decode($raw, true);
        if (is_array($decoded) && isset($decoded['version'])) {
            return runtimeNormalizeVersion((string)$decoded['version']);
        }
    }

    // Last resort: read-only probe (npm is a .cmd shim on Windows).
    $probe = runtimeIsWindows() ? ['cmd.exe', '/c', 'npm', '-v'] : ['npm', '-v'];
    $out = runtimeRunArgv($probe, 8);
    if (preg_match('/(\d+\.\d+\.\d+)/', $out, $m)) {
        return $m[1];
    }
    return null;
}

/**
 * Node.js runtime on this host (read-only probes: node -v, node -p process.arch).
 *
 * @return array<string, mixed>
 */
function runtimeNodeInfo(): array
{
    $path = runtimeFirstFile(runtimeNodeCandidates());
    $source = $path !== null ? 'common location' : null;
    if ($path === null) {
        $path = runtimeWhere('node');
        $source = $path !== null ? 'PATH' : null;
    }

    $info = [
        'installed' => false,
        'version' => null,
        'raw' => null,
        'line' => '',
        'major' => null,
        'arch' => null,
        'path' => $path,
        'source' => $source,
        'npmVersion' => null,
        'probeAllowed' => runtimeCmdAllowed('proc_open'),
        'error' => null,
    ];

    if ($path === null) {
        $info['error'] = runtimeCmdAllowed('proc_open')
            ? 'node not found on PATH or in common install locations'
            : 'proc_open is disabled — cannot locate Node.js';
        return $info;
    }

    $versionOutput = runtimeRunArgv([$path, '-v']);
    if (preg_match('/v?(\d+\.\d+\.\d+)/', $versionOutput, $m)) {
        $info['version'] = $m[1];
        $info['raw'] = $versionOutput;
        $info['line'] = runtimeVersionLine($m[1], 1);
        $info['major'] = (int)explode('.', $m[1])[0];
        $info['installed'] = true;
    } else {
        $info['error'] = 'Could not read the Node.js version from ' . $path;
    }

    $archOutput = runtimeRunArgv([$path, '-p', 'process.arch']);
    if ($archOutput !== '' && preg_match('/^(x64|arm64|ia32|arm)$/i', trim($archOutput), $m)) {
        $info['arch'] = strtolower($m[1]) === 'ia32' ? 'x86' : strtolower($m[1]);
    } else {
        $info['arch'] = runtimePeMachine($path);
    }

    $info['npmVersion'] = runtimeNpmVersionFor($path);
    return $info;
}

/**
 * @return list<string>
 */
function runtimeHttpdCandidates(): array
{
    $candidates = [];
    $env = trim((string)getenv('LINKNEST_APACHE_HTTPD'));
    if ($env !== '') {
        $candidates[] = $env;
    }
    $phpFolder = runtimePhpFolder();
    if ($phpFolder !== null) {
        $root = dirname($phpFolder);
        $candidates[] = $root . DIRECTORY_SEPARATOR . 'apache' . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'httpd.exe';
    }
    if (runtimeIsWindows()) {
        $candidates[] = 'C:\\xampp\\apache\\bin\\httpd.exe';
        $candidates[] = 'D:\\xampp\\apache\\bin\\httpd.exe';
        $candidates[] = 'D:\\Apache\\bin\\httpd.exe';
        $candidates[] = 'C:\\Apache24\\bin\\httpd.exe';
        $candidates[] = 'C:\\Apache\\Apache24\\bin\\httpd.exe';
    } else {
        $candidates[] = '/usr/sbin/apachectl';
        $candidates[] = '/usr/sbin/httpd';
        $candidates[] = '/usr/sbin/apache2';
        $candidates[] = '/usr/local/apache2/bin/httpd';
    }
    return $candidates;
}

/**
 * Apache httpd as installed here. Path + PE header first (no execution);
 * the version string needs a read-only `httpd -v` probe.
 *
 * @return array<string, mixed>
 */
function runtimeApacheInfo(): array
{
    $path = runtimeFirstFile(runtimeHttpdCandidates());
    if ($path === null && runtimeIsWindows()) {
        $path = runtimeWhere('httpd');
    }
    if ($path === null && !runtimeIsWindows()) {
        $path = runtimeWhere('apachectl') ?? runtimeWhere('httpd') ?? runtimeWhere('apache2');
    }

    $info = [
        'installed' => $path !== null,
        'version' => null,
        'arch' => $path !== null ? runtimePeMachine($path) : null,
        'path' => $path,
        'service' => trim((string)getenv('LINKNEST_APACHE_SERVICE')) ?: null,
        'control' => $path !== null && str_contains(basename($path), 'ctl') ? 'apachectl' : 'httpd',
        'error' => null,
    ];

    if ($path === null) {
        $info['error'] = 'httpd / apachectl not found in common locations';
        return $info;
    }

    $output = runtimeRunArgv([$path, '-v'], 6);
    if ($output !== '' && preg_match('#Apache/(\d+(?:\.\d+)+)#i', $output, $m)) {
        $info['version'] = $m[1];
    } elseif (!runtimeCmdAllowed('proc_open')) {
        $info['error'] = 'proc_open is disabled — Apache version could not be read';
    } else {
        $info['error'] = 'Apache version not reported by ' . basename($path);
    }

    return $info;
}

/**
 * SQLite engine + database facts (all from PDO/file metadata).
 *
 * @return array<string, mixed>
 */
function runtimeSqliteInfo(): array
{
    $info = [
        'engineVersion' => null,
        'libraryVersion' => null,
        'dbPath' => defined('DB_PATH') ? DB_PATH : null,
        'dbBytes' => null,
        'journalMode' => null,
        'schemaVersion' => null,
        'walBytes' => 0,
        'libDllPath' => null,
        'libDllArch' => null,
        'healthCheck' => null,
        'error' => null,
    ];

    try {
        if (class_exists('PDO') && defined('DB_PATH') && function_exists('getDB')) {
            $db = getDB();
            $info['engineVersion'] = (string)$db->query('SELECT sqlite_version()')->fetchColumn();
            $info['journalMode'] = strtolower((string)$db->query('PRAGMA journal_mode')->fetchColumn());
            $info['schemaVersion'] = (int)$db->query('PRAGMA user_version')->fetchColumn();
            $info['libraryVersion'] = defined('SQLITE_LIBRARY_VERSION') ? SQLITE_LIBRARY_VERSION : null;
        }
    } catch (Throwable $e) {
        $info['error'] = 'SQLite probe failed: ' . $e->getMessage();
    }

    if (is_string($info['dbPath']) && $info['dbPath'] !== '' && @is_file($info['dbPath'])) {
        $info['dbBytes'] = (int)@filesize($info['dbPath']);
        foreach ([$info['dbPath'] . '-wal', $info['dbPath'] . '-shm'] as $side) {
            if (@is_file($side)) {
                $info['walBytes'] += (int)@filesize($side);
            }
        }
    }

    if (runtimeIsWindows()) {
        $phpFolder = runtimePhpFolder();
        $candidates = [];
        if ($phpFolder !== null) {
            $candidates[] = $phpFolder . DIRECTORY_SEPARATOR . 'libsqlite3.dll';
        }
        $candidates[] = 'C:\\xampp\\php\\libsqlite3.dll';
        $dll = runtimeFirstFile($candidates);
        if ($dll !== null) {
            $info['libDllPath'] = $dll;
            $info['libDllArch'] = runtimePeMachine($dll);
        }
    }

    return $info;
}

/**
 * @return array<string, mixed>
 */
function runtimeGitInfo(): array
{
    $output = runtimeRunArgv(['git', '--version'], 6);
    $version = null;
    if ($output !== '' && preg_match('/(\d+\.\d+\.\d+)/', $output, $m)) {
        $version = $m[1];
    }
    $buildInfo = [];
    $buildInfoPath = RUNTIME_PROJECT_ROOT . '/BUILD_INFO.json';
    if (@is_file($buildInfoPath)) {
        $decoded = json_decode((string)@file_get_contents($buildInfoPath), true);
        if (is_array($decoded)) {
            $buildInfo = $decoded;
        }
    }
    return [
        'version' => $version,
        'available' => $version !== null,
        'appVersion' => $buildInfo['version'] ?? (defined('LINKNEST_APP_VERSION') ? LINKNEST_APP_VERSION : null),
        'gitCommit' => isset($buildInfo['gitCommit']) ? (string)$buildInfo['gitCommit'] : null,
        'buildId' => $buildInfo['buildId'] ?? null,
    ];
}

/**
 * Classify this install so the guidance can match the host exactly.
 *
 * @param array<string, mixed>|null $phpInfo
 * @param array<string, mixed>|null $apacheInfo
 * @return array<string, mixed>
 */
function runtimeDetectLayout(?array $phpInfo = null, ?array $apacheInfo = null): array
{
    $phpInfo = $phpInfo ?? runtimePhpInfo();
    $apacheInfo = $apacheInfo ?? runtimeApacheInfo();

    $phpFolder = is_string($phpInfo['folder'] ?? null) ? (string)$phpInfo['folder'] : null;
    $normalized = $phpFolder !== null ? str_replace('\\', '/', strtolower($phpFolder)) : '';
    $isWindows = runtimeIsWindows();
    $notes = [];

    if (runtimeIsDocker()) {
        $id = 'docker';
        $label = 'Docker container';
        $notes[] = 'PHP and Node.js come from the container image — rebuild the image instead of patching inside it.';
    } elseif (($phpInfo['sapi'] ?? '') === 'cli-server') {
        $id = 'dev-cli-server';
        $label = 'PHP built-in dev server (npm run dev)';
        $notes[] = 'Development mode: the app is served by PHP\'s built-in server, so restart it after a runtime change.';
    } elseif ($isWindows && $normalized !== '' && preg_match('#^[a-z]:/xampp/php$#', $normalized)) {
        $id = 'xampp';
        $label = 'Windows XAMPP';
        $notes[] = 'Use the XAMPP upgrader scripts; they stop Apache, swap the PHP folder, keep php.ini and re-check LDAP.';
        $notes[] = 'Stopping/starting the Apache2.4 service needs an elevated (Administrator) shell.';
    } elseif ($isWindows && ($apacheInfo['installed'] ?? false)) {
        $id = 'vanilla';
        $label = 'Windows stock Apache + PHP';
        $notes[] = 'Use upgrade-vanilla-apache-php.ps1: it replaces php and Apache bin/modules but keeps php.ini, httpd.conf and htdocs.';
        $notes[] = 'Needs an elevated shell to stop/start the Apache service.';
    } elseif ($isWindows) {
        $id = 'native';
        $label = 'Windows PHP (no Apache detected)';
        $notes[] = 'Restart whatever process serves PHP after a patch — IIS/FastCGI worker, or the service that launched php-cgi.';
    } else {
        $id = 'linux';
        $label = 'Linux / macOS host';
        $notes[] = 'Prefer the distribution packages or your version manager, then reload php-fpm/Apache gracefully.';
    }

    if (!runtimeCmdAllowed('proc_open')) {
        $notes[] = 'proc_open is disabled in php.ini — version probes read from files only (some versions may be unknown).';
    }

    return [
        'id' => $id,
        'label' => $label,
        'os' => PHP_OS_FAMILY,
        'windows' => $isWindows,
        'docker' => runtimeIsDocker(),
        'phpFolder' => $phpFolder,
        'phpIniPath' => $phpInfo['iniPath'] ?? null,
        'phpBinary' => $phpInfo['binary'] ?? null,
        'apachePath' => $apacheInfo['path'] ?? null,
        'apacheControl' => $apacheInfo['control'] ?? null,
        'apacheService' => $apacheInfo['service'] ?? null,
        'requiresElevation' => $isWindows || $id === 'docker',
        'projectRoot' => RUNTIME_PROJECT_ROOT,
        'notes' => $notes,
    ];
}

/**
 * @return array<string, mixed>
 */
function runtimeHostInfo(?array $layout = null): array
{
    $layout = $layout ?? runtimeDetectLayout();
    return [
        'os' => PHP_OS . ' / ' . php_uname('s') . ' ' . php_uname('r'),
        'family' => PHP_OS_FAMILY,
        'arch' => PHP_INT_SIZE === 8 ? 'x64' : 'x86',
        'phpSapi' => php_sapi_name(),
        'layout' => $layout['id'],
        'layoutLabel' => $layout['label'],
        'docker' => (bool)$layout['docker'],
        'windows' => (bool)$layout['windows'],
        'projectRoot' => RUNTIME_PROJECT_ROOT,
        'dataDir' => defined('DB_DIR') ? DB_DIR : (RUNTIME_PROJECT_ROOT . '/data'),
        'procOpenAllowed' => runtimeCmdAllowed('proc_open'),
        'curlAvailable' => function_exists('curl_init'),
        'checkedAt' => time(),
        'checkedAtIso' => date('c'),
    ];
}

/**
 * Official Windows PHP build index (downloads.php.net). Non-Windows hosts get a
 * tolerant lookup against php.net instead of a fabricated data shape.
 *
 * @return array<string, mixed>
 */
function runtimePhpCatalog(bool $force = false): array
{
    $key = 'php';
    $cached = runtimeCacheGet($key, RUNTIME_CACHE_TTL);
    if (!$force && $cached['fresh'] && is_array($cached['value'])) {
        return $cached['value'];
    }

    $result = [
        'source' => 'downloads.php.net',
        'url' => 'https://downloads.php.net/~windows/releases/releases.json',
        'fetchedAt' => null,
        'error' => null,
        'stale' => false,
        'lines' => [],
        'latestAny' => null,
        'latestLine' => null,
        'windowsBuildIndex' => runtimeIsWindows(),
    ];

    if (runtimeIsWindows()) {
        $response = runtimeHttpGet('https://downloads.php.net/~windows/releases/releases.json');
        if ($response['ok']) {
            $decoded = json_decode($response['body'], true);
            if (is_array($decoded)) {
                $lines = [];
                foreach ($decoded as $lineKey => $lineData) {
                    if (!is_array($lineData) || !isset($lineData['version'])) {
                        continue;
                    }
                    $build = null;
                    foreach (['ts-vs17-x64', 'ts-vs16-x64', 'ts-vc15-x64'] as $preferred) {
                        if (isset($lineData[$preferred]) && is_array($lineData[$preferred])) {
                            $build = $lineData[$preferred];
                            break;
                        }
                    }
                    if ($build === null) {
                        foreach ($lineData as $buildKey => $buildData) {
                            if (is_string($buildKey)
                                && str_starts_with($buildKey, 'ts-')
                                && str_ends_with($buildKey, '-x64')
                                && is_array($buildData)) {
                                $build = $buildData;
                                break;
                            }
                        }
                    }
                    if (!is_array($build) || !isset($build['zip']['path'])) {
                        continue;
                    }
                    $lines[(string)$lineKey] = [
                        'line' => (string)$lineKey,
                        'version' => (string)$lineData['version'],
                        'releasedAt' => isset($build['mtime']) ? (string)$build['mtime'] : null,
                        'assetName' => (string)$build['zip']['path'],
                        'assetUrl' => 'https://downloads.php.net/~windows/releases/' . rawurlencode((string)$build['zip']['path']),
                        'sha256' => isset($build['zip']['sha256']) ? (string)$build['zip']['sha256'] : null,
                        'size' => isset($build['zip']['size']) ? (string)$build['zip']['size'] : null,
                        'threadSafe' => true,
                        'arch' => 'x64',
                    ];
                }
                $result['lines'] = $lines;
                $result['latestAny'] = runtimeMaxVersion(array_map(
                    static fn ($row) => $row['version'] ?? null,
                    $lines
                ));
                $result['latestLine'] = $result['latestAny'] !== null
                    ? runtimeVersionLine($result['latestAny'], 2)
                    : null;
                $result['fetchedAt'] = time();
            } else {
                $result['error'] = 'PHP release index was not valid JSON';
            }
        } else {
            $result['error'] = $response['error'] ?? 'PHP release index unavailable';
        }
    } else {
        $major = PHP_MAJOR_VERSION;
        $url = 'https://www.php.net/releases/index.php?json&version=' . $major;
        $result['source'] = 'php.net';
        $result['url'] = $url;
        $response = runtimeHttpGet($url);
        $versions = [];
        if ($response['ok']) {
            $decoded = json_decode($response['body'], true);
            if (is_array($decoded)) {
                $stack = [$decoded];
                while ($stack !== []) {
                    $node = array_pop($stack);
                    if (!is_array($node)) {
                        continue;
                    }
                    foreach ($node as $nodeKey => $nodeValue) {
                        if (is_string($nodeKey) && preg_match('/^\d+\.\d+\.\d+$/', $nodeKey)) {
                            $versions[$nodeKey] = true;
                        }
                        if (is_array($nodeValue)) {
                            $stack[] = $nodeValue;
                        }
                    }
                }
            }
        } else {
            $result['error'] = $response['error'] ?? 'php.net lookup failed';
        }
        foreach (array_keys($versions) as $version) {
            $line = runtimeVersionLine($version, 2);
            $existing = $result['lines'][$line]['version'] ?? null;
            if ($existing === null || runtimeCompareVersions($version, (string)$existing) > 0) {
                $result['lines'][$line] = [
                    'line' => $line,
                    'version' => $version,
                    'releasedAt' => null,
                    'assetName' => null,
                    'assetUrl' => 'https://www.php.net/downloads.php',
                    'sha256' => null,
                    'size' => null,
                    'threadSafe' => false,
                    'arch' => null,
                ];
            }
        }
        if ($result['lines'] !== []) {
            $result['latestAny'] = runtimeMaxVersion(array_map(static fn ($row) => $row['version'] ?? null, $result['lines']));
            $result['latestLine'] = $result['latestAny'] !== null ? runtimeVersionLine($result['latestAny'], 2) : null;
            $result['fetchedAt'] = time();
        } elseif ($result['error'] === null) {
            $result['error'] = 'No PHP versions parsed from php.net';
        }
    }

    if ($result['error'] !== null && is_array($cached['value']) && !empty($cached['value']['lines'])) {
        $stale = $cached['value'];
        $stale['stale'] = true;
        $stale['error'] = $result['error'];
        return $stale;
    }

    if (!empty($result['lines'])) {
        runtimeCachePut($key, $result);
    }
    return $result;
}

/**
 * Official Node.js release index (nodejs.org/dist/index.json).
 * The `security` flag on a release is vendor-declared, so it drives our badge.
 *
 * @return array<string, mixed>
 */
function runtimeNodeCatalog(bool $force = false): array
{
    $key = 'node';
    $cached = runtimeCacheGet($key, RUNTIME_CACHE_TTL);
    if (!$force && $cached['fresh'] && is_array($cached['value'])) {
        return $cached['value'];
    }

    $result = [
        'source' => 'nodejs.org/dist/index.json',
        'url' => 'https://nodejs.org/dist/index.json',
        'fetchedAt' => null,
        'error' => null,
        'stale' => false,
        'lines' => [],
        'ltsLines' => [],
        'latestCurrent' => null,
        'latestLts' => null,
    ];

    $response = runtimeHttpGet('https://nodejs.org/dist/index.json', 2097152);
    if (!$response['ok']) {
        $result['error'] = $response['error'] ?? 'Node release index unavailable';
    } else {
        $decoded = json_decode($response['body'], true);
        if (!is_array($decoded)) {
            $result['error'] = 'Node release index was not valid JSON';
        } else {
            foreach ($decoded as $entry) {
                if (!is_array($entry) || !isset($entry['version'])) {
                    continue;
                }
                $version = runtimeNormalizeVersion((string)$entry['version']);
                if ($version === '') {
                    continue;
                }
                $major = runtimeVersionLine($version, 1);
                $normalized = [
                    'version' => $version,
                    'date' => isset($entry['date']) ? (string)$entry['date'] : null,
                    'security' => !empty($entry['security']),
                    'lts' => isset($entry['lts']) && $entry['lts'] !== false ? (string)$entry['lts'] : false,
                    'npm' => isset($entry['npm']) ? (string)$entry['npm'] : null,
                    'files' => isset($entry['files']) && is_array($entry['files']) ? array_values($entry['files']) : [],
                ];
                // index.json is newest-first: the first hit per major is that line's latest.
                if (!isset($result['lines'][$major])) {
                    $normalized['securityVersions'] = $normalized['security'] ? [$version] : [];
                    $result['lines'][$major] = $normalized;
                } elseif ($normalized['security']) {
                    $result['lines'][$major]['securityVersions'][] = $version;
                }
                if ($normalized['lts'] !== false && !isset($result['ltsLines'][$major])) {
                    $result['ltsLines'][$major] = $normalized['lts'];
                }
                if ($result['latestLts'] === null && $normalized['lts'] !== false) {
                    $result['latestLts'] = $normalized;
                }
                if ($result['latestCurrent'] === null) {
                    $result['latestCurrent'] = $normalized;
                }
            }
            if ($result['lines'] === []) {
                $result['error'] = 'No Node.js releases parsed from the index';
            } else {
                $result['fetchedAt'] = time();
            }
        }
    }

    if ($result['error'] !== null && is_array($cached['value']) && !empty($cached['value']['lines'])) {
        $stale = $cached['value'];
        $stale['stale'] = true;
        $stale['error'] = $result['error'];
        return $stale;
    }

    if (!empty($result['lines'])) {
        runtimeCachePut($key, $result);
    }
    return $result;
}

/**
 * Vendor "this was a security release" hint for a PHP patch, read from the
 * official php.net news feed. Advisory only — always paired with the real link.
 *
 * @return array<string, mixed>
 */
function runtimePhpSecurityHint(string $version, bool $force = false): array
{
    $version = runtimeNormalizeVersion($version);
    $key = 'phpSecurity:' . $version;
    $cached = runtimeCacheGet($key, 86400);
    if (!$force && $cached['fresh'] && is_array($cached['value'])) {
        return $cached['value'];
    }

    $result = [
        'version' => $version,
        'status' => 'unknown',
        'source' => 'https://www.php.net/feed.atom',
        'excerpt' => null,
        'error' => null,
    ];

    if ($version === '') {
        $result['error'] = 'No version supplied';
        return $result;
    }

    $response = runtimeHttpGet('https://www.php.net/feed.atom', 4194304);
    if (!$response['ok']) {
        $result['error'] = $response['error'] ?? 'php.net news feed unavailable';
        return $result;
    }

    $body = $response['body'];
    $position = stripos($body, 'PHP ' . $version);
    if ($position === false) {
        $position = stripos($body, '>' . $version . '<');
    }
    if ($position === false) {
        $result['error'] = 'Version not mentioned in the recent PHP news feed';
        return $result;
    }

    $snippet = substr($body, max(0, $position - 200), 2500);
    $plain = trim((string)preg_replace('/\s+/', ' ', strip_tags($snippet)));
    $result['excerpt'] = mb_substr($plain, 0, 400);
    $isSecurity = (bool)preg_match('/CVE-\d{4}-\d{3,7}/i', $snippet)
        || (bool)preg_match('/\bsecurit(y|ies)\b/i', $snippet);
    $result['status'] = $isSecurity ? 'security' : 'patch';

    runtimeCachePut($key, $result);
    return $result;
}

/**
 * PHP: installed vs newest published patch for the same minor (and newest minor).
 *
 * @param array<string, mixed> $phpInfo
 * @param array<string, mixed> $catalog
 * @return array<string, mixed>
 */
function runtimePhpCandidate(array $phpInfo, array $catalog, bool $force = false): array
{
    $current = (string)($phpInfo['version'] ?? '');
    $line = runtimeVersionLine($current, 2);
    $row = is_array($catalog['lines'][$line] ?? null) ? $catalog['lines'][$line] : null;
    $latestForLine = $row['version'] ?? null;
    $latestAny = $catalog['latestAny'] ?? null;
    $latestLine = $catalog['latestLine'] ?? ($latestAny !== null ? runtimeVersionLine($latestAny, 2) : null);

    $error = $catalog['error'] ?? null;
    $patchAvailable = is_string($latestForLine) && runtimeCompareVersions($latestForLine, $current) > 0;
    $newerMinor = is_string($latestAny) && runtimeCompareVersions((string)$latestLine, $line) > 0;

    if ($patchAvailable) {
        $status = 'patch-available';
    } elseif ($newerMinor) {
        $status = 'minor-available';
    } elseif (is_string($latestForLine)) {
        $status = 'up-to-date';
    } else {
        $status = 'unknown';
    }

    $hint = $patchAvailable
        ? runtimePhpSecurityHint((string)$latestForLine, $force)
        : ['status' => 'unknown', 'excerpt' => null, 'source' => 'https://www.php.net/feed.atom', 'error' => null];

    return [
        'component' => 'php',
        'currentVersion' => $current,
        'line' => $line,
        'latestForLine' => $latestForLine,
        'latestForLineInfo' => $row,
        'latestAny' => $latestAny,
        'latestAnyLine' => $latestLine,
        'status' => $status,
        'patchAvailable' => $patchAvailable,
        'newerMinorAvailable' => $newerMinor,
        'security' => ($hint['status'] ?? 'unknown') === 'security',
        'securityHint' => $hint,
        'source' => $catalog['source'] ?? null,
        'sourceUrl' => $catalog['url'] ?? null,
        'stale' => (bool)($catalog['stale'] ?? false),
        'notesUrl' => PHP_MAJOR_VERSION > 0
            ? 'https://www.php.net/ChangeLog-' . PHP_MAJOR_VERSION . '.php'
            : 'https://www.php.net/ChangeLog-8.php',
        'publishedAt' => $row['releasedAt'] ?? null,
        'assetName' => $row['assetName'] ?? null,
        'assetUrl' => $row['assetUrl'] ?? null,
        'sha256' => $row['sha256'] ?? null,
        'assetSize' => $row['size'] ?? null,
        'error' => $error,
    ];
}

/**
 * Node.js: installed vs newest release on the same major line (plus the current LTS).
 *
 * @param array<string, mixed> $nodeInfo
 * @param array<string, mixed> $catalog
 * @return array<string, mixed>
 */
function runtimeNodeCandidate(array $nodeInfo, array $catalog): array
{
    $current = (string)($nodeInfo['version'] ?? '');
    $installed = !empty($nodeInfo['installed']);
    $line = $installed ? runtimeVersionLine($current, 1) : '';
    $row = ($line !== '' && is_array($catalog['lines'][$line] ?? null)) ? $catalog['lines'][$line] : null;
    $latestForLine = $row['version'] ?? null;
    // Any vendor-declared security release newer than what is installed means the
    // host is missing those fixes, even when the newest patch itself is not flagged.
    $securityVersions = is_array($row['securityVersions'] ?? null) ? $row['securityVersions'] : [];
    $missingSecurity = [];
    foreach ($securityVersions as $securityVersion) {
        if (!is_string($securityVersion) || $securityVersion === '') {
            continue;
        }
        if (runtimeCompareVersions($securityVersion, $current) > 0) {
            $missingSecurity[] = $securityVersion;
        }
    }
    $security = $missingSecurity !== [];
    $patchAvailable = $installed && is_string($latestForLine) && runtimeCompareVersions($latestForLine, $current) > 0;

    $latestLts = is_array($catalog['latestLts'] ?? null) ? $catalog['latestLts'] : null;
    $latestCurrent = is_array($catalog['latestCurrent'] ?? null) ? $catalog['latestCurrent'] : null;
    $ltsMajor = $latestLts !== null ? runtimeVersionLine((string)$latestLts['version'], 1) : null;
    $ltsUpgrade = $installed && $ltsMajor !== null && runtimeCompareVersions($ltsMajor, $line) > 0;

    if (!$installed) {
        $status = 'not-installed';
    } elseif ($patchAvailable && $security) {
        $status = 'security-patch-available';
    } elseif ($patchAvailable) {
        $status = 'patch-available';
    } elseif ($ltsUpgrade) {
        $status = 'lts-upgrade-available';
    } elseif (is_string($latestForLine)) {
        $status = 'up-to-date';
    } else {
        $status = 'unknown';
    }

    $target = is_string($latestForLine) && $latestForLine !== '' ? $latestForLine : $current;
    $tag = 'v' . $target;
    $assetUrl = null;
    $assetName = null;
    $shasumsUrl = null;
    if ($target !== '') {
        $shasumsUrl = 'https://nodejs.org/dist/' . $tag . '/SHASUMS256.txt';
        if (runtimeIsWindows()) {
            $assetName = 'node-' . $tag . '-win-x64.zip';
            $assetUrl = 'https://nodejs.org/dist/' . $tag . '/' . $assetName;
        } else {
            $assetName = 'node-' . $tag . '-linux-x64.tar.xz';
            $assetUrl = 'https://nodejs.org/dist/' . $tag . '/' . $assetName;
        }
    }

    return [
        'component' => 'node',
        'installed' => $installed,
        'currentVersion' => $current !== '' ? $current : null,
        'line' => $line,
        'path' => $nodeInfo['path'] ?? null,
        'pathSource' => $nodeInfo['source'] ?? null,
        'arch' => $nodeInfo['arch'] ?? null,
        'npmVersion' => $nodeInfo['npmVersion'] ?? null,
        'latestForLine' => $latestForLine,
        'latestForLineNpm' => $row['npm'] ?? null,
        'latestForLineDate' => $row['date'] ?? null,
        'latestLts' => $latestLts,
        'latestCurrent' => $latestCurrent,
        'ltsName' => $row['lts'] ?? false,
        'status' => $status,
        'patchAvailable' => $patchAvailable,
        'security' => $security,
        'missingSecurityVersions' => $missingSecurity,
        'ltsUpgradeAvailable' => $ltsUpgrade,
        'source' => $catalog['source'] ?? null,
        'sourceUrl' => $catalog['url'] ?? null,
        'stale' => (bool)($catalog['stale'] ?? false),
        'notesUrl' => $target !== ''
            ? 'https://github.com/nodejs/node/blob/main/doc/changelogs/CHANGELOG_V' . runtimeVersionLine($target, 1) . '.md'
            : 'https://nodejs.org/en/download/releases',
        'releaseNotesUrl' => $target !== '' ? 'https://nodejs.org/en/blog/release/v' . $target : null,
        'assetName' => $assetName,
        'assetUrl' => $assetUrl,
        'shasumsUrl' => $shasumsUrl,
        'error' => $nodeInfo['error'] ?? null,
    ];
}

/**
 * Copy-paste PHP patch commands for the detected host layout.
 *
 * @param array<string, mixed> $layout
 * @return list<array<string, mixed>>
 */
function runtimeInstructionsPhp(array $layout, ?string $targetVersion = null): array
{
    $root = (string)($layout['projectRoot'] ?? RUNTIME_PROJECT_ROOT);
    $line = runtimeVersionLine(PHP_VERSION, 2);
    $target = $targetVersion !== null && $targetVersion !== '' ? $targetVersion : null;
    $targetArg = $target !== null ? ' -Patch ' . $target : '';
    $steps = [];
    $layoutId = (string)($layout['id'] ?? '');

    if ($layoutId === 'xampp') {
        $phpFolder = (string)($layout['phpFolder'] ?? 'C:\\xampp\\php');
        $steps[] = [
            'id' => 'elevated-pinned',
            'title' => 'Elevated PowerShell (recommended)' . ($target !== null ? ' — pin ' . $target : ''),
            'shell' => 'powershell',
            'code' => 'cd "' . $root . '"' . "\n"
                . '.\\scripts\\upgrade-xampp-php-run-elevated.ps1 -Version ' . $line . $targetArg . ' -RestartApache',
            'note' => 'Approves UAC, stops Apache, swaps the PHP folder, keeps your php.ini and re-checks LDAP before activating.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'minor-latest',
            'title' => 'Newest published patch on this minor (no -Patch)',
            'shell' => 'powershell',
            'code' => 'cd "' . $root . '"' . "\n"
                . '.\\scripts\\upgrade-xampp-php.ps1 -Version ' . $line . ' -RestartApache',
            'note' => 'Run from an already elevated PowerShell window.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'newest-minor',
            'title' => 'Newest published TS x64 minor',
            'shell' => 'powershell',
            'code' => 'cd "' . $root . '"' . "\n"
                . '.\\scripts\\upgrade-xampp-php.ps1 -RestartApache',
            'note' => 'Omit -Version to take the newest Thread-Safe x64 build in the official index.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'dry-run',
            'title' => 'Dry run — change nothing, print the plan',
            'shell' => 'powershell',
            'code' => '.\\scripts\\upgrade-xampp-php.ps1 -Version ' . $line . $targetArg . ' -WhatIf',
            'note' => 'Confirms the exact zip URL and SHA256 before you touch anything.',
            'elevated' => false,
        ];
        $steps[] = [
            'id' => 'offline-zip',
            'title' => 'Air-gapped host — reuse a pre-downloaded zip',
            'shell' => 'powershell',
            'code' => '.\\scripts\\upgrade-xampp-php.ps1 -Version ' . $line
                . ' -ZipPath D:\\installers\\' . (string)($layout['phpAssetName'] ?? ('php-' . ($target ?? $line . '.x') . '-Win32-vs17-x64.zip'))
                . ' -RestartApache',
            'note' => 'Copy the official zip to the host first; the script still verifies SHA256 and the LDAP gate.',
            'elevated' => true,
        ];
        $assetUrl = (string)($layout['phpAssetUrl'] ?? '');
        if ($assetUrl === '' || !str_starts_with($assetUrl, 'http')) {
            $assetUrl = 'https://downloads.php.net/~windows/releases/'
                . (string)($layout['phpAssetName'] ?? ('php-' . $line . '.x-Win32-vs17-x64.zip'));
        }
        $steps[] = [
            'id' => 'manual-download',
            'title' => 'Manual download + hash check (no script)',
            'shell' => 'powershell',
            'code' => '$url = "' . $assetUrl . '"' . "\n"
                . '$zip = Join-Path $env:TEMP (Split-Path $url -Leaf)' . "\n"
                . 'Invoke-WebRequest $url -OutFile $zip' . "\n"
                . '(Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()'
                . (isset($layout['phpSha256']) && (string)$layout['phpSha256'] !== ''
                    ? "\n" . '# expect: ' . (string)$layout['phpSha256']
                    : ''),
            'note' => 'Then stop Apache, rename ' . $phpFolder . ' to php-backup-<timestamp>, extract the zip into '
                . $phpFolder . ', copy your saved php.ini back and start Apache.',
            'elevated' => true,
        ];
    } elseif ($layoutId === 'vanilla') {
        $steps[] = [
            'id' => 'bat',
            'title' => 'Double-click helper (UAC prompt)' . ($target !== null ? ' — pin ' . $target : ''),
            'shell' => 'cmd',
            'code' => 'upgrade-vanilla-apache-php.bat',
            'note' => 'Replaces ' . (string)($layout['phpFolder'] ?? 'D:\\php')
                . ' and Apache bin/modules in place; keeps php.ini, httpd.conf, htdocs and logs.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'elevated-pinned',
            'title' => 'Elevated PowerShell' . ($target !== null ? ' — pin ' . $target : ''),
            'shell' => 'powershell',
            'code' => 'cd "' . $root . '"' . "\n"
                . '.\\scripts\\upgrade-vanilla-apache-php.ps1 -Version ' . $line . $targetArg,
            'note' => 'Stops the Apache service, swaps, verifies, restarts.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'php-only',
            'title' => 'PHP only (Apache files untouched)',
            'shell' => 'powershell',
            'code' => '.\\scripts\\upgrade-vanilla-apache-php.ps1 -SkipApache',
            'note' => 'Add -RefreshCacert if you also want a fresh cacert.pem.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'newest-minor',
            'title' => 'Newest TS x64 minor',
            'shell' => 'powershell',
            'code' => '.\\scripts\\upgrade-vanilla-apache-php.ps1 -LatestMinor',
            'note' => 'Moves to the newest published minor (for example 8.6.x when it exists).',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'dry-run',
            'title' => 'Dry run — print target URLs only',
            'shell' => 'powershell',
            'code' => '.\\scripts\\upgrade-vanilla-apache-php.ps1 -WhatIf',
            'note' => 'Nothing is stopped or replaced.',
            'elevated' => false,
        ];
    } else {
        if ($layoutId === 'docker') {
            $steps[] = [
                'id' => 'docker-rebuild',
                'title' => 'Rebuild the image on the host (PHP lives in the image)',
                'shell' => 'bash',
                'code' => 'cd docker' . "\n"
                    . 'docker compose build --pull' . "\n"
                    . 'docker compose up -d',
                'note' => 'Run on the Docker host — a running container cannot replace its own PHP runtime. '
                    . 'data/ and uploads/ live outside the image, so the rebuild keeps them.',
                'elevated' => false,
            ];
            $steps[] = [
                'id' => 'docker-verify',
                'title' => 'Verify the new container',
                'shell' => 'bash',
                'code' => 'docker compose exec web php -v' . "\n"
                    . 'curl -s http://localhost:8090/health.php?format=json',
                'note' => 'Confirm php_version, pdo_sqlite and curl in the JSON.',
                'elevated' => false,
            ];
        } elseif ($layoutId === 'dev-cli-server') {
            $steps[] = [
                'id' => 'dev-restart',
                'title' => 'Development mode — restart the built-in server',
                'shell' => 'bash',
                'code' => '# stop "npm run dev" (Ctrl+C), patch PHP with your usual installer,' . "\n"
                    . '# then start both servers again:' . "\n"
                    . 'npm run dev',
                'note' => 'Vite (3000) and the PHP built-in server (8000) both restart with npm run dev.',
                'elevated' => false,
            ];
        } else {
            $steps[] = [
                'id' => 'deb-packages',
                'title' => 'Distribution packages (Debian / Ubuntu)',
                'shell' => 'bash',
                'code' => 'sudo apt-get update' . "\n"
                    . 'sudo apt-get install --only-upgrade php' . str_replace('.', '', $line) . '-cli php' . str_replace('.', '', $line) . '-fpm' . "\n"
                    . 'sudo systemctl reload php' . $line . '-fpm   # or: sudo systemctl reload apache2',
                'note' => 'A graceful reload is enough for a patch upgrade — no downtime.',
                'elevated' => true,
            ];
            $steps[] = [
                'id' => 'rpm-packages',
                'title' => 'Distribution packages (RHEL / Rocky / Alma)',
                'shell' => 'bash',
                'code' => 'sudo dnf upgrade php' . "\n"
                    . 'sudo systemctl reload php-fpm',
                'note' => 'Check the module stream (dnf module list php) before a minor jump.',
                'elevated' => true,
            ];
            $steps[] = [
                'id' => 'source-build',
                'title' => 'Build from source (last resort)',
                'shell' => 'bash',
                'code' => 'curl -fsSLO https://www.php.net/distributions/php-' . ($target ?? $line . '.x') . '.tar.gz' . "\n"
                    . './configure --with-apxs2 --with-pdo-sqlite --with-curl --enable-mbstring --with-openssl --with-zip' . "\n"
                    . 'make -j"$(nproc)" && sudo make install && sudo systemctl reload apache2',
                'note' => 'Keep the previous prefix/binary until the app passes /health.php?format=json.',
                'elevated' => true,
            ];
        }
    }

    return $steps;
}

/**
 * Copy-paste Node.js upgrade commands. Node never serves this app (dist/ is
 * prebuilt), so every option here is zero-downtime for the web app.
 *
 * @param array<string, mixed> $layout
 * @param array<string, mixed>|null $candidate
 * @return list<array<string, mixed>>
 */
function runtimeInstructionsNode(array $layout, ?array $candidate = null): array
{
    $target = null;
    if (is_array($candidate)) {
        if (!empty($candidate['latestForLine'])) {
            $target = (string)$candidate['latestForLine'];
        } elseif (is_array($candidate['latestLts'] ?? null) && !empty($candidate['latestLts']['version'])) {
            $target = (string)$candidate['latestLts']['version'];
        }
    }
    if ($target === null || $target === '') {
        $target = runtimeNormalizeVersion((string)($candidate['currentVersion'] ?? ''));
    }
    $placeholder = $target !== '' ? $target : 'X.Y.Z';
    $major = $target !== '' ? runtimeVersionLine($target, 1) : '22';
    $layoutId = (string)($layout['id'] ?? '');
    $steps = [];

    if ($layoutId === 'docker') {
        $steps[] = [
            'id' => 'docker-node',
            'title' => 'Node in the image — rebuild on the host',
            'shell' => 'bash',
            'code' => 'cd docker' . "\n"
                . 'docker compose build --pull' . "\n"
                . 'docker compose up -d',
            'note' => 'The in-container Node is only used to build dist/; the app keeps serving from the image.',
            'elevated' => false,
        ];
        return $steps;
    }

    if (runtimeIsWindows()) {
        $steps[] = [
            'id' => 'winget-lts',
            'title' => 'winget (elevated PowerShell) — official LTS channel',
            'shell' => 'powershell',
            'code' => 'winget upgrade OpenJS.NodeJS.LTS' . "\n"
                . '# or pin an exact release:' . "\n"
                . 'winget install --id OpenJS.NodeJS.LTS --version ' . $placeholder . ' --accept-source-agreements',
            'note' => 'Updates the machine-wide Node.js. Nothing needs to restart: the app is served by PHP/Apache.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'msi-silent',
            'title' => 'Official MSI (elevated, silent)',
            'shell' => 'powershell',
            'code' => '$v = "' . $placeholder . '"' . "\n"
                . '$msi = Join-Path $env:TEMP "node-$v-x64.msi"' . "\n"
                . 'Invoke-WebRequest "https://nodejs.org/dist/v$v/node-v$v-x64.msi" -OutFile $msi' . "\n"
                . 'Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn" -Wait -Verb RunAs',
            'note' => 'Use this when winget is unavailable or blocked by policy.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'zip-portable',
            'title' => 'Portable zip — no admin rights (build-only toolchain)',
            'shell' => 'powershell',
            'code' => '$v = "' . $placeholder . '"' . "\n"
                . '$tmp = Join-Path $env:TEMP "node-$v"' . "\n"
                . 'Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue' . "\n"
                . 'New-Item -ItemType Directory -Path $tmp | Out-Null' . "\n"
                . 'Invoke-WebRequest "https://nodejs.org/dist/v$v/node-v$v-win-x64.zip" -OutFile "$tmp\\node.zip"' . "\n"
                . 'Invoke-WebRequest "https://nodejs.org/dist/v$v/SHASUMS256.txt" -OutFile "$tmp\\SHASUMS256.txt"' . "\n"
                . '$want = (Select-String -Path "$tmp\\SHASUMS256.txt" -Pattern "node-v$v-win-x64.zip").Line.Split(" ")[0]' . "\n"
                . '$got = (Get-FileHash "$tmp\\node.zip" -Algorithm SHA256).Hash.ToLower()' . "\n"
                . 'if ($want -ne $got) { throw "SHA256 mismatch: $got" }' . "\n"
                . 'Expand-Archive "$tmp\\node.zip" -DestinationPath "$tmp\\x" -Force' . "\n"
                . '$env:Path = "$tmp\\x\\node-v$v-win-x64;" + $env:Path' . "\n"
                . 'node -v; npm -v',
            'note' => 'Session-only PATH change: ideal for running npm run build without touching the machine install.',
            'elevated' => false,
        ];
        $steps[] = [
            'id' => 'nvm-windows',
            'title' => 'nvm-windows (if you switch Node versions often)',
            'shell' => 'powershell',
            'code' => 'nvm install ' . $placeholder . "\n"
                . 'nvm use ' . $placeholder,
            'note' => 'Requires nvm-windows to be installed already.',
            'elevated' => true,
        ];
    } else {
        $steps[] = [
            'id' => 'nvm',
            'title' => 'nvm / fnm (recommended on Linux and macOS)',
            'shell' => 'bash',
            'code' => 'nvm install ' . $placeholder . "\n"
                . 'nvm use ' . $placeholder . "\n"
                . 'node -v && npm -v',
            'note' => 'Per-user install — no service restart and no downtime for the app.',
            'elevated' => false,
        ];
        $steps[] = [
            'id' => 'nodesource',
            'title' => 'NodeSource packages (Debian / Ubuntu)',
            'shell' => 'bash',
            'code' => 'curl -fsSL https://deb.nodesource.com/setup_' . $major . '.x | sudo -E bash -' . "\n"
                . 'sudo apt-get install -y nodejs',
            'note' => 'Machine-wide install used by build jobs and the MCP stdio adapter.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'rpm',
            'title' => 'RHEL / Rocky / Alma / Fedora',
            'shell' => 'bash',
            'code' => 'sudo dnf install -y nodejs' . "\n"
                . 'node -v && npm -v',
            'note' => 'NodeSource repositories carry newer lines than the base distribution repos.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'brew',
            'title' => 'macOS (Homebrew)',
            'shell' => 'bash',
            'code' => 'brew upgrade node',
            'note' => 'Homebrew upgrades to the current release; use nvm when you need an exact LTS patch.',
            'elevated' => false,
        ];
    }

    $steps[] = [
        'id' => 'after-node',
        'title' => 'After upgrading Node',
        'shell' => 'bash',
        'code' => 'node -v' . "\n"
            . 'npm -v' . "\n"
            . '# optional: refresh the built UI with the new toolchain' . "\n"
            . 'npm ci' . "\n"
            . 'npm run build',
        'note' => 'The running app stays online throughout — Node is not part of the request path.',
        'elevated' => false,
    ];

    return $steps;
}

/**
 * Apache patch/upgrade commands. Apache Lounge has no machine-readable index we
 * trust, so this component is always reported as "check the vendor page".
 *
 * @param array<string, mixed> $layout
 * @return list<array<string, mixed>>
 */
function runtimeInstructionsApache(array $layout): array
{
    $layoutId = (string)($layout['id'] ?? '');
    $steps = [];

    if ($layoutId === 'vanilla') {
        $steps[] = [
            'id' => 'vanilla-apache',
            'title' => 'Replace Apache bin/modules only (keeps conf, htdocs, logs)',
            'shell' => 'powershell',
            'code' => 'cd "' . (string)($layout['projectRoot'] ?? RUNTIME_PROJECT_ROOT) . '"' . "\n"
                . '.\\scripts\\upgrade-vanilla-apache-php.ps1 -SkipPhp',
            'note' => 'Backs up to Apache-bin-backup-<timestamp> and restarts the Apache service.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'vanilla-apache-url',
            'title' => 'Or point the run at an explicit Apache Lounge zip',
            'shell' => 'powershell',
            'code' => '.\\scripts\\upgrade-vanilla-apache-php.ps1 -SkipPhp -ApacheZipUrl "https://www.apachelounge.com/download/VS17/binaries/httpd-2.4.xx-win64-VS17.zip"',
            'note' => 'Useful for a controlled rollout or an air-gapped host (file:/// path also works).',
            'elevated' => true,
        ];
    } elseif ($layoutId === 'docker') {
        $steps[] = [
            'id' => 'docker-apache',
            'title' => 'Rebuild the image on the host',
            'shell' => 'bash',
            'code' => 'cd docker' . "\n"
                . 'docker compose build --pull' . "\n"
                . 'docker compose up -d',
            'note' => 'Apache comes from the image, so it is patched at build time.',
            'elevated' => false,
        ];
    } elseif ($layoutId === 'xampp') {
        $steps[] = [
            'id' => 'xampp-apache',
            'title' => 'XAMPP has no standalone Apache patcher',
            'shell' => 'powershell',
            'code' => '# Options, in order of preference:' . "\n"
                . '# 1) Install the current XAMPP release over the existing folder (keep htdocs + config)' . "\n"
                . '# 2) Swap in a current Apache Lounge Win64 build, keeping conf/htdocs/logs:' . "\n"
                . '$url = "https://www.apachelounge.com/download/VS17/binaries/httpd-2.4.xx-win64-VS17.zip"' . "\n"
                . 'Invoke-WebRequest $url -OutFile (Join-Path $env:TEMP (Split-Path $url -Leaf))',
            'note' => 'Always run httpd -t (config test) and keep a copy of conf/ before swapping Apache.',
            'elevated' => true,
        ];
    } else {
        $steps[] = [
            'id' => 'linux-apache',
            'title' => 'Distribution packages (graceful reload, no downtime)',
            'shell' => 'bash',
            'code' => 'sudo apt-get install --only-upgrade apache2   # or: sudo dnf upgrade httpd' . "\n"
                . 'sudo apachectl configtest && sudo systemctl reload apache2',
            'note' => 'A reload keeps existing connections alive — prefer it over a restart.',
            'elevated' => true,
        ];
    }

    $steps[] = [
        'id' => 'apache-verify',
        'title' => 'Verify the configuration',
        'shell' => 'bash',
        'code' => '# Windows' . "\n"
            . '& "C:\\xampp\\apache\\bin\\httpd.exe" -t' . "\n"
            . '# Linux' . "\n"
            . 'sudo apachectl configtest',
        'note' => 'Then open the app and the Apache monitoring dashboard (footer "online now").',
        'elevated' => false,
    ];

    return $steps;
}

/**
 * SQLite engine / libsqlite3.dll commands.
 *
 * @param array<string, mixed> $layout
 * @return list<array<string, mixed>>
 */
function runtimeInstructionsSqlite(array $layout): array
{
    $layoutId = (string)($layout['id'] ?? '');
    $root = (string)($layout['projectRoot'] ?? RUNTIME_PROJECT_ROOT);
    $steps = [];

    if ($layoutId === 'xampp' || $layoutId === 'vanilla') {
        $steps[] = [
            'id' => 'windows-sqlite',
            'title' => 'Install the supported SQLite build into PHP (elevated)',
            'shell' => 'powershell',
            'code' => 'cd "' . $root . '"' . "\n"
                . '.\\scripts\\install-sqlite-xampp.ps1',
            'note' => 'Stop Apache first — libsqlite3.dll is locked while the module is loaded.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'windows-sqlite-manual',
            'title' => 'Manual DLL refresh',
            'shell' => 'powershell',
            'code' => '$url = "https://www.sqlite.org/2026/sqlite-dll-win-x64-3530400.zip"' . "\n"
                . '$zip = Join-Path $env:TEMP (Split-Path $url -Leaf)' . "\n"
                . 'Invoke-WebRequest $url -OutFile $zip' . "\n"
                . 'Expand-Archive $zip -DestinationPath (Split-Path $zip) -Force' . "\n"
                . '# copy sqlite3.dll -> libsqlite3.dll next to php.ini (stop Apache first)',
            'note' => 'Match PHP bitness (x64) and keep the previous DLL so you can roll back.',
            'elevated' => true,
        ];
    } elseif ($layoutId === 'docker') {
        $steps[] = [
            'id' => 'docker-sqlite',
            'title' => 'Rebuild the image on the host',
            'shell' => 'bash',
            'code' => 'cd docker' . "\n"
                . 'docker compose build --pull && docker compose up -d',
            'note' => 'The PHP SQLite extension and library ship inside the image.',
            'elevated' => false,
        ];
    } else {
        $steps[] = [
            'id' => 'linux-sqlite',
            'title' => 'Distribution packages',
            'shell' => 'bash',
            'code' => 'sudo apt-get install --only-upgrade libsqlite3-0 sqlite3   # or: sudo dnf upgrade sqlite' . "\n"
                . 'sudo systemctl reload php-fpm   # reload so the new library is picked up',
            'note' => 'Back the database up before changing the library underneath it.',
            'elevated' => true,
        ];
    }

    $steps[] = [
        'id' => 'sqlite-verify',
        'title' => 'Verify the engine',
        'shell' => 'bash',
        'code' => 'php -r "echo SQLite3::version()[\'versionString\'], PHP_EOL;"' . "\n"
            . '# then open /health.php?format=json and check the SQLite row',
        'note' => 'LinkNest expects SQLite 3.53+ (health.php / TARGET_REQUIREMENTS.json).',
        'elevated' => false,
    ];

    return $steps;
}

/**
 * Downtime reality for each component — shown next to the commands so nobody
 * is surprised by an Apache restart.
 *
 * @return array<string, array<string, mixed>>
 */
function runtimeDowntimeNotes(): array
{
    return [
        'php' => [
            'requiresRestart' => true,
            'window' => runtimeIsWindows() ? '5–20 seconds' : '0 seconds (graceful reload)',
            'summary' => runtimeIsWindows()
                ? 'Apache loads php8apache2_4.dll, so the PHP folder cannot be swapped while it runs. '
                    . 'Stop Apache, replace the folder, start Apache again — that is the whole outage.'
                : 'php-fpm / mod_php patch upgrades can be applied with a graceful reload, so there is no outage.',
            'planning' => 'Do the download, SHA256 check, extraction and php.ini merge first; only the swap needs the stop.',
        ],
        'node' => [
            'requiresRestart' => false,
            'window' => '0 seconds',
            'summary' => 'Node.js is not part of the request path: the browser loads the prebuilt dist/ bundle and PHP serves the API.',
            'planning' => 'Safe to do at any time, including during business hours.',
        ],
        'apache' => [
            'requiresRestart' => true,
            'window' => runtimeIsWindows() ? '5–20 seconds' : '0 seconds (systemctl reload)',
            'summary' => 'Swapping httpd binaries requires stopping the service; a Linux reload keeps connections alive.',
            'planning' => 'Run httpd -t first and keep a copy of conf/ plus the previous bin folder.',
        ],
        'sqlite' => [
            'requiresRestart' => true,
            'window' => runtimeIsWindows() ? '5–20 seconds' : '0 seconds (reload)',
            'summary' => 'libsqlite3.dll is loaded by PHP, so Apache must be stopped to replace it on Windows.',
            'planning' => 'Take a database backup first (Admin → Database → snapshot) even though the library swap is not a schema change.',
        ],
    ];
}

/**
 * Dispatcher: copy-paste guidance for one component.
 *
 * @param array<string, mixed> $layout enriched by runtimeBuildStatusPayload()
 * @param array<string, mixed>|null $candidate
 * @return array<string, mixed>
 */
function runtimeInstructions(string $component, array $layout, ?array $candidate = null): array
{
    $component = strtolower(trim($component));
    $downtime = runtimeDowntimeNotes();

    switch ($component) {
        case 'php':
            $steps = runtimeInstructionsPhp($layout, $candidate['latestForLine'] ?? null);
            break;
        case 'node':
        case 'npm':
            $steps = runtimeInstructionsNode($layout, $candidate);
            break;
        case 'apache':
            $steps = runtimeInstructionsApache($layout);
            break;
        case 'sqlite':
            $steps = runtimeInstructionsSqlite($layout);
            break;
        default:
            return [
                'component' => $component,
                'layout' => $layout['id'] ?? null,
                'steps' => [],
                'downtime' => null,
                'error' => 'Unknown component: ' . $component,
            ];
    }

    return [
        'component' => $component,
        'layout' => $layout['id'] ?? null,
        'layoutLabel' => $layout['label'] ?? null,
        'requiresElevation' => (bool)($layout['requiresElevation'] ?? false),
        'steps' => $steps,
        'downtime' => $downtime[$component] ?? null,
        'docs' => [
            'runtime' => 'RUNTIME_UPDATES.md',
            'phpXampp' => 'XAMPP_PHP_UPGRADE.md',
            'phpVanilla' => 'VANILLA_APACHE_PHP_UPGRADE.md',
            'appUpdates' => 'APP_UPDATES.md',
        ],
        'readOnly' => true,
    ];
}

/**
 * One-line "what is out of date" summary used by the nav bell and the panel header.
 *
 * @param array<string, mixed> $php
 * @param array<string, mixed> $node
 */
function runtimeSummaryMessage(array $php, array $node): string
{
    $parts = [];
    if (!empty($php['patchAvailable'])) {
        $parts[] = 'PHP ' . (string)$php['currentVersion'] . ' → ' . (string)$php['latestForLine']
            . (!empty($php['security']) ? ' (security)' : '');
    } elseif (!empty($php['newerMinorAvailable'])) {
        $parts[] = 'PHP ' . (string)$php['currentVersion'] . ' → newer minor ' . (string)$php['latestAny'];
    }
    if (!empty($node['patchAvailable'])) {
        $parts[] = 'Node ' . (string)$node['currentVersion'] . ' → ' . (string)$node['latestForLine']
            . (!empty($node['security']) ? ' (security)' : '');
    }
    return $parts === [] ? 'Underlying software is up to date.' : implode(' · ', $parts);
}

/**
 * What this feature can and cannot do. Kept in the payload so the UI can state
 * the read-only contract explicitly.
 *
 * @return array<string, mixed>
 */
function runtimeCapabilities(): array
{
    return [
        'readOnly' => true,
        'inAppUpgrade' => false,
        'reason' => 'Read-only mode: versions and patches are reported, upgrades are run by the operator '
            . 'from an elevated shell using the generated commands.',
        'networkGetOnly' => true,
        'hostAllowlist' => RUNTIME_HOST_ALLOWLIST,
        'cacheTtlSeconds' => RUNTIME_CACHE_TTL,
        'procOpen' => runtimeCmdAllowed('proc_open'),
        'curl' => function_exists('curl_init'),
        'writes' => 'data/runtime-cache.json only',
    ];
}

/**
 * Full read-only status payload for the admin panel and the JSON report.
 *
 * @return array<string, mixed>
 */
function runtimeBuildStatusPayload(bool $forceCheck = false): array
{
    $phpInfo = runtimePhpInfo();
    $nodeInfo = runtimeNodeInfo();
    $apacheInfo = runtimeApacheInfo();
    $sqliteInfo = runtimeSqliteInfo();
    $gitInfo = runtimeGitInfo();
    $layout = runtimeDetectLayout($phpInfo, $apacheInfo);

    $phpCatalog = runtimePhpCatalog($forceCheck);
    $nodeCatalog = runtimeNodeCatalog($forceCheck);

    $php = runtimePhpCandidate($phpInfo, $phpCatalog, $forceCheck);
    $node = runtimeNodeCandidate($nodeInfo, $nodeCatalog);

    $layoutRich = $layout;
    $layoutRich['phpAssetName'] = $php['assetName'];
    $layoutRich['phpAssetUrl'] = $php['assetUrl'];
    $layoutRich['phpSha256'] = $php['sha256'];

    $phpPatchAvailable = !empty($php['patchAvailable']);
    $nodePatchAvailable = !empty($node['patchAvailable']);
    $securityAvailable = !empty($php['security']) || !empty($node['security']);

    $cache = runtimeCacheRead();

    return [
        'readOnly' => true,
        'generatedAt' => time(),
        'generatedAtIso' => date('c'),
        'host' => runtimeHostInfo($layout),
        'layout' => $layoutRich,
        'capabilities' => runtimeCapabilities(),
        'components' => [
            'php' => [
                'component' => 'php',
                'info' => $phpInfo,
                'update' => $php,
                'instructions' => runtimeInstructions('php', $layoutRich, $php),
            ],
            'node' => [
                'component' => 'node',
                'info' => $nodeInfo,
                'update' => $node,
                'instructions' => runtimeInstructions('node', $layoutRich, $node),
            ],
            'apache' => [
                'component' => 'apache',
                'info' => $apacheInfo,
                'update' => null,
                'instructions' => runtimeInstructions('apache', $layoutRich, null),
            ],
            'sqlite' => [
                'component' => 'sqlite',
                'info' => $sqliteInfo,
                'update' => null,
                'instructions' => runtimeInstructions('sqlite', $layoutRich, null),
            ],
            'git' => [
                'component' => 'git',
                'info' => $gitInfo,
                'update' => null,
                'instructions' => null,
            ],
        ],
        'downtime' => runtimeDowntimeNotes(),
        'sources' => [
            'php' => [
                'source' => $phpCatalog['source'] ?? null,
                'url' => $phpCatalog['url'] ?? null,
                'fetchedAt' => $phpCatalog['fetchedAt'] ?? null,
                'stale' => (bool)($phpCatalog['stale'] ?? false),
                'error' => $phpCatalog['error'] ?? null,
                'lineCount' => count($phpCatalog['lines'] ?? []),
            ],
            'node' => [
                'source' => $nodeCatalog['source'] ?? null,
                'url' => $nodeCatalog['url'] ?? null,
                'fetchedAt' => $nodeCatalog['fetchedAt'] ?? null,
                'stale' => (bool)($nodeCatalog['stale'] ?? false),
                'error' => $nodeCatalog['error'] ?? null,
                'lineCount' => count($nodeCatalog['lines'] ?? []),
            ],
        ],
        'cacheFile' => RUNTIME_CACHE_FILE,
        'cacheUpdatedAt' => $cache['updatedAt'],
        // Advisory auto-recheck hint (settings.runtime_check_interval_minutes, default 6).
        // Vendor indexes themselves stay cached for capabilities.cacheTtlSeconds (6 h).
        'checkIntervalMinutes' => max(1, (int)round(runtimeCheckIntervalMinutes() / 60)),
        'summary' => [
            'updateAvailable' => $phpPatchAvailable || $nodePatchAvailable,
            'securityAvailable' => $securityAvailable,
            'patchCount' => (int)$phpPatchAvailable + (int)$nodePatchAvailable,
            'php' => $php['status'] ?? 'unknown',
            'node' => $node['status'] ?? 'unknown',
            'message' => runtimeSummaryMessage($php, $node),
        ],
    ];
}

/**
 * Downloadable Markdown diagnostics report (same data the panel shows).
 *
 * @param array<string, mixed> $payload
 */
function runtimeBuildMarkdownReport(array $payload): string
{
    $lines = [];
    $host = $payload['host'] ?? [];
    $layout = $payload['layout'] ?? [];
    $components = $payload['components'] ?? [];
    $php = $components['php']['update'] ?? [];
    $node = $components['node']['update'] ?? [];

    $lines[] = '# Underlying software report (read-only)';
    $lines[] = '';
    $lines[] = '- Generated: ' . (string)($payload['generatedAtIso'] ?? date('c'));
    $lines[] = '- Host: ' . (string)($host['os'] ?? 'unknown');
    $lines[] = '- Layout: ' . (string)($layout['label'] ?? 'unknown') . ' (`' . (string)($layout['id'] ?? '?') . '`)';
    $lines[] = '- Summary: ' . (string)($payload['summary']['message'] ?? '');
    $lines[] = '- This report was produced by the LinkNest runtime panel. **Nothing was installed, replaced or restarted.**';
    $lines[] = '';

    $lines[] = '## Current versions';
    $lines[] = '';
    $lines[] = '| Component | Version | Details |';
    $lines[] = '| --- | --- | --- |';
    $phpInfo = $components['php']['info'] ?? [];
    $nodeInfo = $components['node']['info'] ?? [];
    $apacheInfo = $components['apache']['info'] ?? [];
    $sqliteInfo = $components['sqlite']['info'] ?? [];
    $gitInfo = $components['git']['info'] ?? [];

    $lines[] = '| PHP | ' . (string)($phpInfo['version'] ?? '?') . ' | '
        . ((!empty($phpInfo['zts']) ? 'TS' : 'NTS') . ' · ' . (string)($phpInfo['arch'] ?? '?')
            . ' · ' . (string)($phpInfo['sapi'] ?? '?') . ' · ' . (string)($phpInfo['iniPath'] ?? 'php.ini unknown'))
        . ' |';
    $lines[] = '| Node.js | ' . (string)($nodeInfo['version'] ?? 'not installed') . ' | '
        . (string)($nodeInfo['arch'] ?? '?') . ' · ' . (string)($nodeInfo['path'] ?? 'path unknown') . ' |';
    $lines[] = '| npm | ' . (string)($nodeInfo['npmVersion'] ?? 'unknown') . ' | bundled with Node.js |';
    $lines[] = '| Apache | ' . (string)($apacheInfo['version'] ?? 'unknown') . ' | '
        . (string)($apacheInfo['path'] ?? 'not found') . ' |';
    $lines[] = '| SQLite | ' . (string)($sqliteInfo['engineVersion'] ?? 'unknown') . ' | '
        . (string)($sqliteInfo['journalMode'] ?? '?') . ' · schema ' . (string)($sqliteInfo['schemaVersion'] ?? '?')
        . ' · ' . runtimeFormatBytes((int)($sqliteInfo['dbBytes'] ?? 0)) . ' |';
    $lines[] = '| git | ' . (string)($gitInfo['version'] ?? 'not found') . ' | app '
        . (string)($gitInfo['appVersion'] ?? '?') . ' |';
    $lines[] = '';

    $lines[] = '## Available updates';
    $lines[] = '';
    $lines[] = '| Component | Current | Available | Security | Status |';
    $lines[] = '| --- | --- | --- | --- | --- |';
    $lines[] = '| PHP | ' . (string)($php['currentVersion'] ?? '?') . ' → ' . (string)($php['latestForLine'] ?? 'n/a')
        . ' | line ' . (string)($php['latestAny'] ?? 'n/a') . ' | ' . (!empty($php['security']) ? 'yes' : 'no')
        . ' | ' . (string)($php['status'] ?? 'unknown') . ' |';
    $lines[] = '| Node.js | ' . (string)($node['currentVersion'] ?? '?') . ' → ' . (string)($node['latestForLine'] ?? 'n/a')
        . ' | LTS ' . (string)($node['latestLts']['version'] ?? 'n/a') . ' | ' . (!empty($node['security']) ? 'yes' : 'no')
        . ' | ' . (string)($node['status'] ?? 'unknown') . ' |';
    $lines[] = '';

    foreach (['php' => 'PHP', 'node' => 'Node.js', 'apache' => 'Apache', 'sqlite' => 'SQLite'] as $key => $label) {
        $instructions = $components[$key]['instructions'] ?? null;
        if (!is_array($instructions) || empty($instructions['steps'])) {
            continue;
        }
        $lines[] = '## ' . $label . ' — commands';
        $lines[] = '';
        if (!empty($instructions['downtime']['summary'])) {
            $lines[] = 'Downtime: **' . (string)$instructions['downtime']['window'] . '** — '
                . (string)$instructions['downtime']['summary'];
            $lines[] = '';
        }
        foreach ($instructions['steps'] as $step) {
            $lines[] = '### ' . (string)($step['title'] ?? 'Step');
            $lines[] = '';
            $lines[] = '```' . (string)($step['shell'] ?? '') ;
            $lines[] = rtrim((string)($step['code'] ?? ''));
            $lines[] = '```';
            if (!empty($step['note'])) {
                $lines[] = '_' . (string)$step['note'] . '_';
            }
            $lines[] = '';
        }
    }

    $lines[] = '## Sources';
    $lines[] = '';
    foreach (($payload['sources'] ?? []) as $key => $source) {
        $lines[] = '- ' . $key . ': ' . (string)($source['source'] ?? '?')
            . ' (' . (string)($source['url'] ?? '') . ')'
            . (!empty($source['stale']) ? ' — cached copy' : '')
            . (!empty($source['error']) ? ' — ' . (string)$source['error'] : '');
    }
    $lines[] = '';
    $lines[] = 'Guide: `docs/RUNTIME_UPDATES.md`';
    $lines[] = '';

    return implode("\n", $lines);
}




















