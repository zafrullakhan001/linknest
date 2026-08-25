<?php
/**
 * LinkNest Apache + PHP deploy health check.
 *
 * Does not load api/config.php first — a missing pdo_sqlite must still render.
 *
 *   HTML:  /health.php
 *   JSON:  /health.php?format=json
 *
 * HTTP 200 = no critical failures (warnings allowed)
 * HTTP 503 = at least one critical check failed
 */
declare(strict_types=1);

header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet');

$wantJson = isset($_GET['format']) && strtolower((string)$_GET['format']) === 'json';
if (!$wantJson && isset($_SERVER['HTTP_ACCEPT']) && str_contains((string)$_SERVER['HTTP_ACCEPT'], 'application/json')
    && !str_contains((string)$_SERVER['HTTP_ACCEPT'], 'text/html')) {
    $wantJson = true;
}

/** LinkNest Windows SQLite package (same URLs as package-for-deployment.ps1). */
const LN_HEALTH_SQLITE_VERSION = '3.53.4';
const LN_HEALTH_SQLITE_DLL_ZIP = 'sqlite-dll-win-x64-3530400.zip';
const LN_HEALTH_SQLITE_DLL_URL = 'https://www.sqlite.org/2026/sqlite-dll-win-x64-3530400.zip';
const LN_HEALTH_SQLITE_TOOLS_URL = 'https://www.sqlite.org/2026/sqlite-tools-win-x64-3530400.zip';
/** Minimum Node for npm run build / Vite (AGENTS.md). Not required to serve dist/. */
const LN_HEALTH_NODE_MIN = '20.0.0';

/**
 * @return array{id:string,category:string,ok:bool,level:string,required:string,actual:string,advice:string}
 */
function lnHealthCheck(
    string $id,
    string $category,
    bool $ok,
    string $level,
    string $required,
    string $actual,
    string $advice = ''
): array {
    return [
        'id' => $id,
        'category' => $category,
        'ok' => $ok,
        'level' => $ok ? 'pass' : $level,
        'required' => $required,
        'actual' => $actual,
        'advice' => $advice,
    ];
}

function lnHealthBytes(int $bytes): string {
    $bytes = max(0, $bytes);
    $units = ['B', 'KB', 'MB', 'GB'];
    $i = 0;
    $n = (float)$bytes;
    while ($n >= 1024 && $i < count($units) - 1) {
        $n /= 1024;
        $i++;
    }
    return round($n, $i === 0 ? 0 : 2) . ' ' . $units[$i];
}

function lnHealthIniBytes(string $raw): int {
    $raw = trim($raw);
    if ($raw === '' || $raw === '-1') {
        return -1;
    }
    if (!preg_match('/^(\d+)\s*([KMG])?$/i', $raw, $m)) {
        return 0;
    }
    $n = (int)$m[1];
    $u = strtoupper($m[2] ?? '');
    if ($u === 'K') {
        return $n * 1024;
    }
    if ($u === 'M') {
        return $n * 1024 * 1024;
    }
    if ($u === 'G') {
        return $n * 1024 * 1024 * 1024;
    }
    return $n;
}

function lnHealthDirWritable(string $path): bool {
    if (!file_exists($path)) {
        return @mkdir($path, 0755, true) && is_writable($path);
    }
    return is_dir($path) && is_writable($path);
}

function lnHealthHasModule(array $mods, string $name): bool {
    foreach ($mods as $m) {
        if (strcasecmp((string)$m, $name) === 0) {
            return true;
        }
    }
    return false;
}

/**
 * Read PE COFF Machine from a Windows EXE/DLL.
 *
 * @return 'x64'|'x86'|null
 */
function lnHealthPeMachine(string $path): ?string {
    if ($path === '' || !is_file($path) || !is_readable($path)) {
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
        if ($e_lfanew < 64 || $e_lfanew > 1024 * 1024) {
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

function lnHealthArchLabel(string $arch): string {
    if ($arch === 'x64') {
        return '64-bit (x64)';
    }
    if ($arch === 'x86') {
        return '32-bit (x86)';
    }
    if ($arch === 'arm64') {
        return '64-bit (arm64)';
    }
    return $arch !== '' ? $arch : 'unknown';
}

/**
 * @param list<string> $candidates
 */
function lnHealthFirstExistingFile(array $candidates): string {
    foreach ($candidates as $cand) {
        if ($cand !== '' && is_file($cand)) {
            return $cand;
        }
    }
    return '';
}

function lnHealthCmdAllowed(string $fn): bool {
    if (!function_exists($fn)) {
        return false;
    }
    $disabled = array_filter(array_map('trim', explode(',', (string)ini_get('disable_functions'))));
    foreach ($disabled as $d) {
        if (strcasecmp($d, $fn) === 0) {
            return false;
        }
    }
    return true;
}

/**
 * Run a short command; returns trimmed stdout or ''.
 *
 * @param list<string> $argv
 */
function lnHealthRunArgv(array $argv, int $timeoutSec = 3): string {
    if ($argv === [] || !lnHealthCmdAllowed('proc_open')) {
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

/**
 * Detect Node.js on PATH or common install locations.
 *
 * @return array{version:string,arch:string|null,path:string,error:string}
 */
function lnHealthDetectNode(bool $isWindows): array {
    $empty = ['version' => '', 'arch' => null, 'path' => '', 'error' => ''];
    $candidates = [];
    if ($isWindows) {
        $pf = getenv('ProgramFiles') ?: 'C:\\Program Files';
        $pf86 = getenv('ProgramFiles(x86)') ?: 'C:\\Program Files (x86)';
        $local = getenv('LOCALAPPDATA') ?: '';
        $candidates[] = $pf . '\\nodejs\\node.exe';
        $candidates[] = $pf86 . '\\nodejs\\node.exe';
        if ($local !== '') {
            $candidates[] = $local . '\\Programs\\node\\node.exe';
        }
    } else {
        $candidates[] = '/usr/local/bin/node';
        $candidates[] = '/usr/bin/node';
    }

    $nodePath = lnHealthFirstExistingFile($candidates);
    if ($nodePath === '' && lnHealthCmdAllowed('proc_open')) {
        if ($isWindows) {
            $where = lnHealthRunArgv(['where.exe', 'node']);
            if ($where !== '') {
                foreach (preg_split('/\r\n|\n|\r/', $where) ?: [] as $line) {
                    $line = trim($line);
                    if ($line !== '' && is_file($line)) {
                        $nodePath = $line;
                        break;
                    }
                }
            }
        } else {
            $which = lnHealthRunArgv(['which', 'node']);
            if ($which !== '') {
                $first = trim(explode("\n", $which)[0]);
                if ($first !== '' && is_file($first)) {
                    $nodePath = $first;
                }
            }
        }
    }

    if ($nodePath === '') {
        $empty['error'] = !lnHealthCmdAllowed('proc_open')
            ? 'proc_open disabled; cannot probe node'
            : 'node not found on PATH or common install paths';
        return $empty;
    }

    $verOut = lnHealthRunArgv([$nodePath, '-v']);
    $version = '';
    if (preg_match('/v?(\d+\.\d+\.\d+)/', $verOut, $m)) {
        $version = $m[1];
    }

    $archOut = lnHealthRunArgv([$nodePath, '-p', 'process.arch']);
    $arch = null;
    $archRaw = strtolower(trim($archOut));
    if ($archRaw === 'x64' || $archRaw === 'arm64' || $archRaw === 'ia32') {
        $arch = $archRaw === 'ia32' ? 'x86' : $archRaw;
    } elseif ($isWindows) {
        $pe = lnHealthPeMachine($nodePath);
        if ($pe !== null) {
            $arch = $pe;
        }
    }

    if ($version === '') {
        return [
            'version' => '',
            'arch' => $arch,
            'path' => $nodePath,
            'error' => 'node found but -v failed: ' . ($verOut !== '' ? $verOut : 'empty output'),
        ];
    }

    return ['version' => $version, 'arch' => $arch, 'path' => $nodePath, 'error' => ''];
}

$root = __DIR__;
$checks = [];
$isWindows = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
$sapi = PHP_SAPI;
$iniFile = (string)(php_ini_loaded_file() ?: '');
$iniDir = $iniFile !== '' ? dirname($iniFile) : '';
$mods = function_exists('apache_get_modules') ? apache_get_modules() : [];
$extDir = (string)ini_get('extension_dir');
$phpBinaryDir = dirname((string)PHP_BINARY);

$phpArch = PHP_INT_SIZE === 8 ? 'x64' : (PHP_INT_SIZE === 4 ? 'x86' : 'unknown');
$phpZts = defined('ZEND_THREAD_SAFE') && ZEND_THREAD_SAFE;
$osArch = (string)php_uname('m');

$libCandidates = [];
if ($iniDir !== '') {
    $libCandidates[] = $iniDir . DIRECTORY_SEPARATOR . 'libsqlite3.dll';
}
$libCandidates[] = $phpBinaryDir . DIRECTORY_SEPARATOR . 'libsqlite3.dll';
$libCandidates[] = 'D:\\php\\libsqlite3.dll';
$libCandidates[] = 'C:\\xampp\\php\\libsqlite3.dll';
if ($extDir !== '') {
    $libCandidates[] = dirname($extDir) . DIRECTORY_SEPARATOR . 'libsqlite3.dll';
}
$libSqlitePath = $isWindows ? lnHealthFirstExistingFile($libCandidates) : '';
$libSqliteBytes = $libSqlitePath !== '' ? (int)@filesize($libSqlitePath) : 0;
$libSqliteArch = $libSqlitePath !== '' ? lnHealthPeMachine($libSqlitePath) : null;
$libSqliteReplaceTarget = $iniDir !== ''
    ? $iniDir . DIRECTORY_SEPARATOR . 'libsqlite3.dll'
    : ($phpBinaryDir !== '' && $phpBinaryDir !== '.'
        ? $phpBinaryDir . DIRECTORY_SEPARATOR . 'libsqlite3.dll'
        : 'C:\\xampp\\php\\libsqlite3.dll');

$httpdCandidates = [];
if ($iniDir !== '') {
    $httpdCandidates[] = dirname($iniDir) . DIRECTORY_SEPARATOR . 'apache' . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'httpd.exe';
    $httpdCandidates[] = dirname($iniDir, 2) . DIRECTORY_SEPARATOR . 'apache' . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'httpd.exe';
}
$httpdCandidates[] = 'C:\\xampp\\apache\\bin\\httpd.exe';
$httpdCandidates[] = 'D:\\Apache\\bin\\httpd.exe';
$httpdCandidates[] = 'D:\\xampp\\apache\\bin\\httpd.exe';
$httpdPath = $isWindows ? lnHealthFirstExistingFile($httpdCandidates) : '';
$apacheArch = $httpdPath !== '' ? lnHealthPeMachine($httpdPath) : null;

$sqlite3DllPath = '';
$pdoSqliteDllPath = '';
$sqlite3DllArch = null;
$pdoSqliteDllArch = null;
if ($isWindows && $extDir !== '') {
    $extDirNorm = rtrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $extDir), DIRECTORY_SEPARATOR);
    $sqlite3DllPath = lnHealthFirstExistingFile([
        $extDirNorm . DIRECTORY_SEPARATOR . 'php_sqlite3.dll',
        $extDirNorm . DIRECTORY_SEPARATOR . 'sqlite3.dll',
    ]);
    $pdoSqliteDllPath = lnHealthFirstExistingFile([
        $extDirNorm . DIRECTORY_SEPARATOR . 'php_pdo_sqlite.dll',
        $extDirNorm . DIRECTORY_SEPARATOR . 'pdo_sqlite.dll',
    ]);
    $sqlite3DllArch = $sqlite3DllPath !== '' ? lnHealthPeMachine($sqlite3DllPath) : null;
    $pdoSqliteDllArch = $pdoSqliteDllPath !== '' ? lnHealthPeMachine($pdoSqliteDllPath) : null;
    $extDir = $extDirNorm;
}

// ---- Architecture ----
$checks[] = lnHealthCheck(
    'php_architecture',
    'Architecture',
    $phpArch === 'x64',
    'fail',
    'PHP 64-bit (x64)',
    lnHealthArchLabel($phpArch) . ' · uname=' . ($osArch !== '' ? $osArch : '?') . ' · PHP_INT_SIZE=' . PHP_INT_SIZE,
    'LinkNest requires Thread Safe x64 PHP for Apache (php8apache2_4.dll). Install the TS x64 build from downloads.php.net, not x86.'
);
$checks[] = lnHealthCheck(
    'php_thread_safety',
    'Architecture',
    $phpZts,
    'fail',
    'PHP Thread Safe (ZTS)',
    $phpZts ? 'Thread Safe (ZTS)' : 'Non-Thread Safe (NTS)',
    'Use Thread Safe PHP with Apache mod_php. NTS builds are for IIS/FastCGI, not XAMPP LoadModule.'
);

if ($isWindows) {
    if ($httpdPath !== '' && $apacheArch !== null) {
        $checks[] = lnHealthCheck(
            'apache_architecture',
            'Architecture',
            $apacheArch === 'x64',
            $apacheArch === $phpArch ? 'warn' : 'fail',
            'Apache httpd.exe 64-bit (x64)',
            lnHealthArchLabel($apacheArch) . ' · ' . $httpdPath,
            $apacheArch === 'x64'
                ? 'Apache matches LinkNest x64 requirement.'
                : 'Install Apache Lounge Win64 (or XAMPP x64). Mixing 32-bit Apache with 64-bit PHP will not load php8apache2_4.dll.'
        );
    } else {
        $checks[] = lnHealthCheck(
            'apache_architecture',
            'Architecture',
            false,
            'warn',
            'Apache httpd.exe architecture readable',
            $httpdPath !== '' ? ($httpdPath . ' (PE machine unread)') : 'httpd.exe not found in common XAMPP/vanilla paths',
            'Confirm Win64 Apache next to PHP. Typical paths: C:\\xampp\\apache\\bin\\httpd.exe or D:\\Apache\\bin\\httpd.exe.'
        );
    }

    if ($libSqlitePath !== '') {
        $libArchOk = $libSqliteArch === 'x64' && $phpArch === 'x64';
        $checks[] = lnHealthCheck(
            'libsqlite3_architecture',
            'Architecture',
            $libArchOk,
            'fail',
            'libsqlite3.dll 64-bit (x64), matching PHP',
            ($libSqliteArch !== null ? lnHealthArchLabel($libSqliteArch) : 'unknown PE') . ' · ' . $libSqlitePath,
            'Replace with the official sqlite.org Windows x64 DLL (' . LN_HEALTH_SQLITE_DLL_URL . '). Wrong bitness will not load.'
        );
    } else {
        $checks[] = lnHealthCheck(
            'libsqlite3_architecture',
            'Architecture',
            false,
            'warn',
            'libsqlite3.dll present and x64',
            'DLL not found next to php.ini / PHP folder',
            'Download ' . LN_HEALTH_SQLITE_DLL_URL . ' and place libsqlite3.dll at ' . $libSqliteReplaceTarget . '.'
        );
    }

    $extArchParts = [];
    $extArchMismatch = false;
    $extArchMissing = false;
    foreach (
        [
            'php_sqlite3.dll' => [$sqlite3DllPath, $sqlite3DllArch],
            'php_pdo_sqlite.dll' => [$pdoSqliteDllPath, $pdoSqliteDllArch],
        ] as $label => [$path, $arch]
    ) {
        if ($path === '') {
            $extArchParts[] = $label . '=missing';
            $extArchMissing = true;
            continue;
        }
        $archLabel = $arch !== null ? lnHealthArchLabel($arch) : 'unknown';
        $extArchParts[] = $label . '=' . $archLabel;
        if ($arch !== null && $arch !== $phpArch) {
            $extArchMismatch = true;
        }
        if ($arch !== null && $arch !== 'x64') {
            $extArchMismatch = true;
        }
    }
    $extArchOk = !$extArchMismatch && !$extArchMissing && $phpArch === 'x64';
    $checks[] = lnHealthCheck(
        'sqlite_ext_dll_architecture',
        'Architecture',
        $extArchOk,
        $extArchMismatch ? 'fail' : 'warn',
        'php_sqlite3.dll / php_pdo_sqlite.dll match PHP x64',
        implode('; ', $extArchParts) . ($extDir !== '' ? ' · ext=' . $extDir : ''),
        'These DLLs ship with PHP (extension_dir). Enable extension=sqlite3 and extension=pdo_sqlite in php.ini. Do not replace them with the sqlite.org zip — only replace libsqlite3.dll.'
    );
}

// ---- Node.js (build toolchain; warn-only for production serve) ----
$nodeInfo = lnHealthDetectNode($isWindows);
$nodeVersion = $nodeInfo['version'];
$nodeArch = $nodeInfo['arch'];
$nodePath = $nodeInfo['path'];
$nodeError = $nodeInfo['error'];
$nodeOk = $nodeVersion !== '' && version_compare($nodeVersion, LN_HEALTH_NODE_MIN, '>=');
$nodeActual = $nodeVersion !== ''
    ? ('v' . $nodeVersion
        . ($nodeArch !== null ? ' · ' . lnHealthArchLabel($nodeArch) : '')
        . ($nodePath !== '' ? ' · ' . $nodePath : ''))
    : ($nodeError !== '' ? $nodeError : 'not found');
$checks[] = lnHealthCheck(
    'node_version',
    'Node',
    $nodeOk,
    'warn',
    'Node.js >= ' . LN_HEALTH_NODE_MIN . ' (for npm run build / Vite)',
    $nodeActual,
    'Required to build the frontend (npm run build). Production can serve dist/ without Node. Install from https://nodejs.org/ (LTS 20+).'
);
if ($nodeVersion !== '' && $nodeArch !== null) {
    $nodeArchOk = $nodeArch === 'x64' || $nodeArch === 'arm64';
    $checks[] = lnHealthCheck(
        'node_architecture',
        'Node',
        $nodeArchOk,
        'warn',
        'Node.js 64-bit (x64 or arm64)',
        lnHealthArchLabel($nodeArch) . ($nodePath !== '' ? ' · ' . $nodePath : ''),
        'Prefer the 64-bit Node installer. 32-bit Node is not recommended for LinkNest builds.'
    );
}

// ---- PHP runtime ----
$checks[] = lnHealthCheck(
    'php_version',
    'PHP',
    version_compare(PHP_VERSION, '8.2.0', '>='),
    'fail',
    'PHP >= 8.2 (8.5 recommended)',
    PHP_VERSION,
    'Install PHP 8.2+ Thread Safe x64 for Apache. PHP 8.5.x is verified for LinkNest.'
);
$checks[] = lnHealthCheck(
    'php_sapi',
    'PHP',
    in_array($sapi, ['apache2handler', 'litespeed'], true),
    'warn',
    'Apache module (apache2handler)',
    $sapi,
    'Use Thread Safe PHP with php8apache2_4.dll. cgi/cli means this URL is not being served by Apache mod_php.'
);
$checks[] = lnHealthCheck(
    'php_ini',
    'PHP',
    $iniFile !== '' && is_file($iniFile),
    'fail',
    'php.ini loaded',
    $iniFile !== '' ? $iniFile : '(none)',
    'Set PHPIniDir in httpd.conf to the PHP folder (e.g. D:/php).'
);
$tz = (string)ini_get('date.timezone');
$checks[] = lnHealthCheck(
    'timezone',
    'PHP',
    $tz !== '',
    'warn',
    'date.timezone set',
    $tz !== '' ? $tz : '(empty)',
    'Set date.timezone in php.ini (e.g. America/New_York).'
);

$memoryRaw = (string)(ini_get('memory_limit') ?: '');
$memoryBytes = lnHealthIniBytes($memoryRaw);
$checks[] = lnHealthCheck(
    'memory_limit',
    'PHP',
    $memoryBytes === -1 || $memoryBytes >= 128 * 1024 * 1024,
    'fail',
    'memory_limit >= 128M (512M recommended)',
    $memoryRaw !== '' ? $memoryRaw : 'unknown',
    'Set memory_limit=512M in php.ini for link health and monitors.'
);
$maxExec = (int)ini_get('max_execution_time');
$checks[] = lnHealthCheck(
    'max_execution_time',
    'PHP',
    $maxExec === 0 || $maxExec >= 60,
    'warn',
    'max_execution_time >= 60 (120 recommended)',
    (string)$maxExec,
    'Set max_execution_time=120 for multi-link curl checks.'
);
$uploadRaw = (string)ini_get('upload_max_filesize');
$postRaw = (string)ini_get('post_max_size');
$checks[] = lnHealthCheck(
    'upload_limits',
    'PHP',
    lnHealthIniBytes($uploadRaw) >= 8 * 1024 * 1024 && lnHealthIniBytes($postRaw) >= 8 * 1024 * 1024,
    'warn',
    'upload_max_filesize and post_max_size >= 8M (50M recommended)',
    'upload=' . $uploadRaw . ', post=' . $postRaw,
    'Set upload_max_filesize=50M and post_max_size=50M in php.ini.'
);

$disabled = array_filter(array_map('trim', explode(',', (string)ini_get('disable_functions'))));
$blocked = array_values(array_intersect(['exec', 'proc_open', 'shell_exec'], $disabled));
$checks[] = lnHealthCheck(
    'disable_functions',
    'PHP',
    $blocked === [],
    'warn',
    'exec / proc_open / shell_exec not disabled',
    $blocked === [] ? 'ok' : ('blocked: ' . implode(', ', $blocked)),
    'Remove those names from disable_functions if Clone Instance or SSH/VNC Easy is used.'
);

// ---- Extensions (critical) ----
$criticalExt = [
    'pdo_sqlite' => 'SQLite database (API hard-fails without this)',
    'sqlite3' => 'SQLite3 extension',
    'mbstring' => 'Encoding, auth, uploads',
    'openssl' => 'HTTPS, encryption',
    'fileinfo' => 'Uploads / MIME',
    'curl' => 'Link health and monitors',
    'json' => 'API JSON (usually built-in)',
    'session' => 'Login sessions (usually built-in)',
];
foreach ($criticalExt as $ext => $why) {
    $on = extension_loaded($ext);
    $checks[] = lnHealthCheck(
        'ext_' . $ext,
        'Extensions',
        $on,
        'fail',
        $ext . ' enabled',
        $on ? 'loaded' : 'missing',
        'Enable extension=' . $ext . ' in php.ini. ' . $why
    );
}

$recommendedExt = [
    'ldap' => 'LDAP login',
    'zip' => 'App Updates / packages',
    'gd' => 'Image helpers',
    'intl' => 'Localization (needs ICU DLLs in Apache\\bin on Windows)',
];
foreach ($recommendedExt as $ext => $why) {
    $on = extension_loaded($ext);
    $checks[] = lnHealthCheck(
        'ext_' . $ext,
        'Extensions',
        $on,
        'warn',
        $ext . ' enabled',
        $on ? 'loaded' : 'missing',
        'Enable extension=' . $ext . ' in php.ini (' . $why . ').'
    );
}

$opcacheOn = extension_loaded('Zend OPcache') || function_exists('opcache_get_status');
$opcacheEnabled = $opcacheOn && filter_var(ini_get('opcache.enable'), FILTER_VALIDATE_BOOLEAN);
$checks[] = lnHealthCheck(
    'opcache',
    'OPcache',
    $opcacheEnabled,
    'warn',
    'Zend OPcache enabled under Apache',
    $opcacheEnabled
        ? ('on, jit=' . (string)ini_get('opcache.jit') . ', buffer=' . (string)ini_get('opcache.jit_buffer_size') . ', mem=' . (string)ini_get('opcache.memory_consumption') . 'MB')
        : ($opcacheOn ? 'loaded but opcache.enable=0' : 'not loaded'),
    'PHP 8.5 Windows often has OPcache built-in (no php_opcache.dll). Set opcache.enable=1. CLI php -m may hide it because opcache.enable_cli=0.'
);

$cainfo = (string)ini_get('curl.cainfo');
$cafile = (string)ini_get('openssl.cafile');
$caOk = ($cainfo !== '' && is_file($cainfo)) || ($cafile !== '' && is_file($cafile));
$checks[] = lnHealthCheck(
    'cacert',
    'PHP',
    $caOk,
    'warn',
    'curl.cainfo or openssl.cafile points at an existing cacert.pem',
    'curl.cainfo=' . ($cainfo !== '' ? $cainfo : '(empty)') . '; openssl.cafile=' . ($cafile !== '' ? $cafile : '(empty)'),
    'Download https://curl.se/ca/cacert.pem into D:/php/cacert.pem and set both php.ini keys.'
);

// ---- Apache modules ----
if ($mods !== []) {
    $checks[] = lnHealthCheck(
        'mod_rewrite',
        'Apache',
        lnHealthHasModule($mods, 'mod_rewrite') || lnHealthHasModule($mods, 'rewrite_module'),
        'fail',
        'mod_rewrite loaded',
        lnHealthHasModule($mods, 'mod_rewrite') || lnHealthHasModule($mods, 'rewrite_module') ? 'loaded' : 'missing',
        'Uncomment LoadModule rewrite_module in httpd.conf. Required for /api/* and the SPA.'
    );
    $checks[] = lnHealthCheck(
        'mod_headers',
        'Apache',
        lnHealthHasModule($mods, 'mod_headers') || lnHealthHasModule($mods, 'headers_module'),
        'warn',
        'mod_headers loaded',
        lnHealthHasModule($mods, 'mod_headers') || lnHealthHasModule($mods, 'headers_module') ? 'loaded' : 'missing',
        'Uncomment LoadModule headers_module for Cache-Control in .htaccess.'
    );
    $phpMod = lnHealthHasModule($mods, 'php_module') || lnHealthHasModule($mods, 'mod_php');
    $checks[] = lnHealthCheck(
        'php_module',
        'Apache',
        $phpMod || $sapi === 'apache2handler',
        'fail',
        'php_module / apache2handler',
        $phpMod ? 'php_module loaded' : $sapi,
        'LoadFile php8ts.dll and LoadModule php_module php8apache2_4.dll in httpd.conf.'
    );
} else {
    $checks[] = lnHealthCheck(
        'apache_modules',
        'Apache',
        $sapi === 'apache2handler',
        'warn',
        'apache_get_modules() available (mod_php)',
        'apache_get_modules() not available (SAPI ' . $sapi . ')',
        'If this page runs, PHP is executing. Confirm AllowOverride All and mod_rewrite separately if API 404s.'
    );
}

$htaccess = $root . DIRECTORY_SEPARATOR . '.htaccess';
$checks[] = lnHealthCheck(
    'htaccess_file',
    'Apache',
    is_file($htaccess),
    'fail',
    '.htaccess present in app root',
    is_file($htaccess) ? $htaccess : 'missing',
    'Deploy the LinkNest .htaccess. Apache needs AllowOverride All on htdocs.'
);

$distIndex = $root . DIRECTORY_SEPARATOR . 'dist' . DIRECTORY_SEPARATOR . 'index.html';
$checks[] = lnHealthCheck(
    'dist_index',
    'App',
    is_file($distIndex),
    'fail',
    'dist/index.html exists (production UI)',
    is_file($distIndex) ? 'present' : 'missing',
    'Run npm run build or extract a deploy ZIP that includes dist/.'
);

// ---- Filesystem ----
$sessionPath = (string)ini_get('session.save_path');
if ($sessionPath === '') {
    $sessionPath = sys_get_temp_dir();
}
$checks[] = lnHealthCheck(
    'session_save_path',
    'Filesystem',
    lnHealthDirWritable($sessionPath),
    'fail',
    'session.save_path writable',
    $sessionPath,
    'Create D:/Apache/tmp (vanilla) or C:/xampp/tmp (XAMPP) and match session.save_path in php.ini.'
);

$dataDir = $root . DIRECTORY_SEPARATOR . 'data';
$uploadsDir = $root . DIRECTORY_SEPARATOR . 'uploads';
$cacheDir = $dataDir . DIRECTORY_SEPARATOR . 'cache';
$logsDir = $root . DIRECTORY_SEPARATOR . 'logs';
$checks[] = lnHealthCheck('data_writable', 'Filesystem', lnHealthDirWritable($dataDir), 'fail', 'data/ writable', $dataDir, 'Grant Modify to the Apache service account.');
$checks[] = lnHealthCheck('uploads_writable', 'Filesystem', lnHealthDirWritable($uploadsDir), 'fail', 'uploads/ writable', $uploadsDir, 'Required for logos and favicons.');
$checks[] = lnHealthCheck('cache_writable', 'Filesystem', lnHealthDirWritable($cacheDir), 'warn', 'data/cache/ writable', $cacheDir, 'Guest response cache.');
$checks[] = lnHealthCheck('logs_writable', 'Filesystem', lnHealthDirWritable($logsDir), 'warn', 'logs/ writable', $logsDir, 'Create logs/ for troubleshooting.');

// ---- SQLite engine + Windows DLL ----
$sqliteVersion = '';
$sqliteError = '';
if (extension_loaded('pdo_sqlite')) {
    try {
        $mem = new PDO('sqlite::memory:');
        $sqliteVersion = (string)$mem->query('SELECT sqlite_version()')->fetchColumn();
    } catch (Throwable $e) {
        $sqliteError = $e->getMessage();
    }
}
$sqliteOk = $sqliteVersion !== '' && version_compare($sqliteVersion, '3.53.0', '>=');
$sqliteDllAdvice = $isWindows
    ? 'Download ' . LN_HEALTH_SQLITE_DLL_URL . ' → extract libsqlite3.dll → replace ' . $libSqliteReplaceTarget
        . ' (or run install-sqlite-xampp.bat from a full deploy ZIP), then restart Apache.'
    : 'Upgrade system libsqlite3 so PHP reports 3.53+.';
$checks[] = lnHealthCheck(
    'sqlite_version',
    'SQLite',
    $sqliteOk,
    'fail',
    'SQLite >= 3.53.0 (3.53.4 recommended)',
    $sqliteVersion !== '' ? $sqliteVersion : ('unavailable' . ($sqliteError !== '' ? ': ' . $sqliteError : '')),
    $sqliteDllAdvice
);

if ($isWindows) {
    $dllLooksModern = $libSqlitePath !== '' && $libSqliteBytes >= 2 * 1024 * 1024;
    $checks[] = lnHealthCheck(
        'libsqlite3_dll',
        'SQLite',
        $sqliteOk && $dllLooksModern && $libSqliteArch === 'x64',
        'warn',
        'Windows libsqlite3.dll from sqlite.org 3.53.4 x64 (~3 MB)',
        $libSqlitePath !== ''
            ? $libSqlitePath . ' (' . lnHealthBytes($libSqliteBytes) . ', '
                . ($libSqliteArch !== null ? lnHealthArchLabel($libSqliteArch) : 'arch?')
                . '), runtime ' . ($sqliteVersion !== '' ? $sqliteVersion : '?')
            : 'DLL not found next to php.ini; runtime ' . ($sqliteVersion !== '' ? $sqliteVersion : '?'),
        'Official 3.53.x x64 DLLs are ~3 MB. Stock XAMPP 3.39 DLLs were ~1.3 MB and lack mmap. Package: '
            . LN_HEALTH_SQLITE_DLL_ZIP . ' — ' . LN_HEALTH_SQLITE_DLL_URL
    );
}

$dbFile = $dataDir . DIRECTORY_SEPARATOR . 'linknest.db';
$checks[] = lnHealthCheck(
    'database_file',
    'SQLite',
    is_file($dbFile) || lnHealthDirWritable($dataDir),
    'warn',
    'data/linknest.db present or creatable',
    is_file($dbFile) ? $dbFile . ' (' . lnHealthBytes((int)@filesize($dbFile)) . ')' : 'not created yet (OK on a fresh install)',
    'The API creates the database on first request if data/ is writable.'
);

$fail = 0;
$warn = 0;
$pass = 0;
foreach ($checks as $c) {
    if ($c['ok']) {
        $pass++;
    } elseif ($c['level'] === 'fail') {
        $fail++;
    } else {
        $warn++;
    }
}
$status = $fail > 0 ? 'fail' : ($warn > 0 ? 'degraded' : 'ok');
$http = $fail > 0 ? 503 : 200;

$sqlitePackage = [
    'required_version' => LN_HEALTH_SQLITE_VERSION,
    'arch' => 'x64',
    'archive' => LN_HEALTH_SQLITE_DLL_ZIP,
    'download_url' => LN_HEALTH_SQLITE_DLL_URL,
    'tools_url' => LN_HEALTH_SQLITE_TOOLS_URL,
    'replace_dll' => 'libsqlite3.dll',
    'replace_path' => $isWindows ? $libSqliteReplaceTarget : null,
    'note' => 'Only replace libsqlite3.dll from the sqlite.org zip. Keep php_sqlite3.dll / php_pdo_sqlite.dll from PHP ext/; enable them in php.ini. Prefer install-sqlite-xampp.bat from a full LinkNest deploy ZIP.',
    'installed' => [
        'runtime_version' => $sqliteVersion !== '' ? $sqliteVersion : null,
        'path' => $libSqlitePath !== '' ? $libSqlitePath : null,
        'bytes' => $libSqlitePath !== '' ? $libSqliteBytes : null,
        'arch' => $libSqliteArch,
        'looks_modern_size' => $libSqlitePath !== '' && $libSqliteBytes >= 2 * 1024 * 1024,
        'ext_sqlite3' => $sqlite3DllPath !== '' ? $sqlite3DllPath : null,
        'ext_pdo_sqlite' => $pdoSqliteDllPath !== '' ? $pdoSqliteDllPath : null,
        'extension_sqlite3_loaded' => extension_loaded('sqlite3'),
        'extension_pdo_sqlite_loaded' => extension_loaded('pdo_sqlite'),
    ],
];

$archMeta = 'PHP ' . lnHealthArchLabel($phpArch) . ' ' . ($phpZts ? 'TS' : 'NTS');
if ($libSqliteArch !== null) {
    $archMeta .= ' · SQLite DLL ' . $libSqliteArch;
} elseif ($isWindows) {
    $archMeta .= ' · SQLite DLL ?';
}
if ($apacheArch !== null) {
    $archMeta .= ' · Apache ' . $apacheArch;
}
if ($nodeVersion !== '') {
    $archMeta .= ' · Node v' . $nodeVersion . ($nodeArch !== null ? ' ' . $nodeArch : '');
}

$payload = [
    'success' => $fail === 0,
    'status' => $status,
    'summary' => $fail === 0
        ? ($warn === 0
            ? 'LinkNest Apache/PHP runtime looks ready.'
            : "Runtime usable, but {$warn} recommended check(s) need attention.")
        : "{$fail} critical check(s) failed — LinkNest will not run correctly until those are fixed.",
    'verdict' => [
        'ready' => $fail === 0,
        'passed' => $pass,
        'warnings' => $warn,
        'failed' => $fail,
        'total' => count($checks),
    ],
    'runtime' => [
        'php' => PHP_VERSION,
        'sapi' => $sapi,
        'php_arch' => $phpArch,
        'php_zts' => $phpZts,
        'os' => PHP_OS . ' ' . php_uname('s') . ' ' . php_uname('r'),
        'os_arch' => $osArch,
        'apache_arch' => $apacheArch,
        'apache_httpd' => $httpdPath !== '' ? $httpdPath : null,
        'node' => $nodeVersion !== '' ? $nodeVersion : null,
        'node_arch' => $nodeArch,
        'node_path' => $nodePath !== '' ? $nodePath : null,
        'ini' => $iniFile,
        'sqlite' => $sqliteVersion,
        'libsqlite3_path' => $libSqlitePath !== '' ? $libSqlitePath : null,
        'libsqlite3_arch' => $libSqliteArch,
        'sqlite_package' => $sqlitePackage,
        'checked_at' => date('c'),
    ],
    'checks' => $checks,
];

http_response_code($http);

if ($wantJson) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

header('Content-Type: text/html; charset=utf-8');

$esc = static function ($v): string {
    return htmlspecialchars((string)$v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
};

$badgeClass = $status === 'ok' ? 'ok' : ($status === 'degraded' ? 'warn' : 'fail');
$badgeLabel = $status === 'ok' ? 'READY' : ($status === 'degraded' ? 'DEGRADED' : 'NOT READY');

$catOrder = ['Architecture', 'Node', 'PHP', 'Extensions', 'OPcache', 'Apache', 'App', 'Filesystem', 'SQLite'];
$grouped = [];
foreach ($checks as $c) {
    $grouped[$c['category']][] = $c;
}

?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LinkNest deploy health</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, sans-serif; background: #0f172a; color: #e2e8f0; }
    .wrap { max-width: 960px; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }
    h1 { font-size: 1.5rem; margin: 0 0 .35rem; }
    .sub { color: #94a3b8; margin: 0 0 1.25rem; font-size: .95rem; }
    .banner { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; padding: 1rem 1.15rem; border-radius: 12px; margin-bottom: 1.25rem; border: 1px solid #334155; }
    .banner.ok { background: #052e16; border-color: #166534; }
    .banner.warn { background: #422006; border-color: #a16207; }
    .banner.fail { background: #450a0a; border-color: #b91c1c; }
    .pill { font-weight: 700; letter-spacing: .04em; font-size: .75rem; padding: .35rem .65rem; border-radius: 999px; }
    .pill.ok { background: #16a34a; color: #fff; }
    .pill.warn { background: #ca8a04; color: #111; }
    .pill.fail { background: #dc2626; color: #fff; }
    .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: .5rem .75rem; font-size: .82rem; color: #cbd5e1; margin-bottom: 1.5rem; }
    .meta b { color: #94a3b8; font-weight: 500; display: block; }
    .cat { margin: 1.25rem 0 .5rem; font-size: 1.05rem; }
    table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 10px; overflow: hidden; }
    th, td { text-align: left; padding: .55rem .7rem; font-size: .82rem; vertical-align: top; border-bottom: 1px solid #334155; }
    th { color: #94a3b8; font-weight: 600; background: #0f172a; }
    tr:last-child td { border-bottom: 0; }
    .st { font-weight: 700; font-size: .72rem; letter-spacing: .03em; }
    .st.pass { color: #4ade80; }
    .st.warn { color: #facc15; }
    .st.fail { color: #f87171; }
    .advice { color: #94a3b8; font-size: .78rem; margin-top: .2rem; }
    code { font-size: .78rem; background: #0f172a; padding: .1rem .3rem; border-radius: 4px; }
    a { color: #93c5fd; }
    .foot { margin-top: 1.5rem; color: #64748b; font-size: .8rem; }
    .pkg { margin: 1rem 0 1.5rem; padding: 1rem 1.15rem; border-radius: 10px; border: 1px solid #334155; background: #1e293b; font-size: .82rem; }
    .pkg h3 { margin: 0 0 .65rem; font-size: .95rem; }
    .pkg dl { margin: 0; display: grid; grid-template-columns: minmax(120px, 160px) 1fr; gap: .35rem .75rem; }
    .pkg dt { color: #94a3b8; }
    .pkg dd { margin: 0; word-break: break-word; }
    .pkg ol { margin: .75rem 0 0; padding-left: 1.2rem; color: #cbd5e1; }
    .pkg li { margin: .25rem 0; }
    .pkg .note { margin: .75rem 0 0; color: #94a3b8; font-size: .78rem; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>LinkNest deploy health</h1>
    <p class="sub">Apache + PHP + SQLite checks for this install. JSON: <a href="?format=json">health.php?format=json</a></p>
    <div class="banner <?php echo $esc($badgeClass); ?>">
      <span class="pill <?php echo $esc($badgeClass); ?>"><?php echo $esc($badgeLabel); ?></span>
      <div><?php echo $esc($payload['summary']); ?> (<?php echo (int)$pass; ?> pass, <?php echo (int)$warn; ?> warn, <?php echo (int)$fail; ?> fail)</div>
    </div>
    <div class="meta">
      <div><b>PHP</b><?php echo $esc(PHP_VERSION); ?> / <?php echo $esc($sapi); ?></div>
      <div><b>Node</b><?php echo $esc($nodeVersion !== '' ? ('v' . $nodeVersion . ($nodeArch !== null ? ' / ' . $nodeArch : '')) : 'n/a'); ?></div>
      <div><b>Arch</b><?php echo $esc($archMeta); ?></div>
      <div><b>SQLite</b><?php echo $esc($sqliteVersion !== '' ? $sqliteVersion : 'n/a'); ?></div>
      <div><b>php.ini</b><?php echo $esc($iniFile !== '' ? $iniFile : 'not loaded'); ?></div>
      <div><b>Checked</b><?php echo $esc($payload['runtime']['checked_at']); ?></div>
    </div>
<?php foreach ($catOrder as $cat):
    if (empty($grouped[$cat])) {
        continue;
    } ?>
    <h2 class="cat"><?php echo $esc($cat); ?></h2>
    <table>
      <thead><tr><th>Check</th><th>Required</th><th>Actual</th></tr></thead>
      <tbody>
<?php foreach ($grouped[$cat] as $c): ?>
        <tr>
          <td>
            <span class="st <?php echo $esc($c['level']); ?>"><?php echo $esc(strtoupper($c['level'])); ?></span>
            <div><?php echo $esc(str_replace('_', ' ', $c['id'])); ?></div>
            <?php if ($c['advice'] !== '' && !$c['ok']): ?><div class="advice"><?php echo $esc($c['advice']); ?></div><?php endif; ?>
          </td>
          <td><?php echo $esc($c['required']); ?></td>
          <td><code><?php echo $esc($c['actual']); ?></code></td>
        </tr>
<?php endforeach; ?>
      </tbody>
    </table>
<?php if ($cat === 'SQLite' && $isWindows): ?>
    <div class="pkg">
      <h3>SQLite package for LinkNest (Windows)</h3>
      <dl>
        <dt>Runtime</dt>
        <dd><?php echo $esc($sqliteVersion !== '' ? $sqliteVersion : 'n/a'); ?>
          · sqlite3 <?php echo extension_loaded('sqlite3') ? 'loaded' : 'missing'; ?>
          · pdo_sqlite <?php echo extension_loaded('pdo_sqlite') ? 'loaded' : 'missing'; ?></dd>
        <dt>Installed DLL</dt>
        <dd><?php if ($libSqlitePath !== ''): ?>
          <code><?php echo $esc($libSqlitePath); ?></code>
          (<?php echo $esc(lnHealthBytes($libSqliteBytes)); ?>,
          <?php echo $esc($libSqliteArch !== null ? lnHealthArchLabel($libSqliteArch) : 'arch unknown'); ?><?php
            echo $libSqliteBytes >= 2 * 1024 * 1024 ? ', modern size' : ', likely stock/old XAMPP size'; ?>)
        <?php else: ?>
          not found — replace target: <code><?php echo $esc($libSqliteReplaceTarget); ?></code>
        <?php endif; ?></dd>
        <dt>Target package</dt>
        <dd><?php echo $esc(LN_HEALTH_SQLITE_VERSION); ?> Windows <strong>x64</strong>
          — <code><?php echo $esc(LN_HEALTH_SQLITE_DLL_ZIP); ?></code></dd>
        <dt>Download</dt>
        <dd><a href="<?php echo $esc(LN_HEALTH_SQLITE_DLL_URL); ?>"><?php echo $esc(LN_HEALTH_SQLITE_DLL_URL); ?></a>
          <br><span class="note">CLI tools (optional): <a href="<?php echo $esc(LN_HEALTH_SQLITE_TOOLS_URL); ?>"><?php echo $esc(LN_HEALTH_SQLITE_TOOLS_URL); ?></a></span></dd>
        <dt>Replace path</dt>
        <dd><code><?php echo $esc($libSqliteReplaceTarget); ?></code>
          — only <code>libsqlite3.dll</code> from that zip</dd>
        <dt>PHP ext DLLs</dt>
        <dd>Keep in <code>ext\</code> (do not replace from sqlite.org):
          <code><?php echo $esc($sqlite3DllPath !== '' ? $sqlite3DllPath : 'php_sqlite3.dll'); ?></code>,
          <code><?php echo $esc($pdoSqliteDllPath !== '' ? $pdoSqliteDllPath : 'php_pdo_sqlite.dll'); ?></code>
          — enable <code>extension=sqlite3</code> and <code>extension=pdo_sqlite</code> in php.ini</dd>
      </dl>
      <ol>
        <li>Prefer <code>install-sqlite-xampp.bat</code> from a full LinkNest deploy ZIP (elevated).</li>
        <li>Or: stop Apache → download the zip above → copy <code>libsqlite3.dll</code> over <code><?php echo $esc($libSqliteReplaceTarget); ?></code>.</li>
        <li>Ensure <code>extension=sqlite3</code> and <code>extension=pdo_sqlite</code> are enabled in php.ini.</li>
        <li>Start Apache and reload this page — runtime should report SQLite <?php echo $esc(LN_HEALTH_SQLITE_VERSION); ?>+ and a ~3&nbsp;MB x64 DLL.</li>
      </ol>
      <?php if ($phpArch !== 'x64'): ?>
      <p class="note">This PHP build is <?php echo $esc(lnHealthArchLabel($phpArch)); ?>. LinkNest requires <strong>64-bit (x64)</strong> PHP/Apache; the x64 SQLite package above will not load until PHP is upgraded to TS x64.</p>
      <?php else: ?>
      <p class="note"><?php echo $esc($sqlitePackage['note']); ?></p>
      <?php endif; ?>
    </div>
<?php endif; ?>
<?php endforeach; ?>
    <p class="foot">Critical failures return HTTP 503. Warnings return HTTP 200 with status=degraded. This page does not require login so you can verify a fresh Apache/PHP deploy.</p>
  </div>
</body>
</html>
