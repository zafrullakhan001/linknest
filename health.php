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

header('X-Robots-Tag: noindex, nofollow');

$wantJson = isset($_GET['format']) && strtolower((string)$_GET['format']) === 'json';
if (!$wantJson && isset($_SERVER['HTTP_ACCEPT']) && str_contains((string)$_SERVER['HTTP_ACCEPT'], 'application/json')
    && !str_contains((string)$_SERVER['HTTP_ACCEPT'], 'text/html')) {
    $wantJson = true;
}

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

$root = __DIR__;
$checks = [];
$isWindows = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
$sapi = PHP_SAPI;
$iniFile = (string)(php_ini_loaded_file() ?: '');
$iniDir = $iniFile !== '' ? dirname($iniFile) : '';
$mods = function_exists('apache_get_modules') ? apache_get_modules() : [];

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
$checks[] = lnHealthCheck(
    'sqlite_version',
    'SQLite',
    $sqliteOk,
    'fail',
    'SQLite >= 3.53.0 (3.53.4 recommended)',
    $sqliteVersion !== '' ? $sqliteVersion : ('unavailable' . ($sqliteError !== '' ? ': ' . $sqliteError : '')),
    $isWindows
        ? 'Replace php/libsqlite3.dll with the official sqlite.org Windows x64 3.53.4 DLL (install-sqlite-xampp.bat), then restart Apache.'
        : 'Upgrade system libsqlite3 so PHP reports 3.53+.'
);

$libSqlitePath = '';
$libSqliteBytes = 0;
$libCandidates = [];
if ($iniDir !== '') {
    $libCandidates[] = $iniDir . DIRECTORY_SEPARATOR . 'libsqlite3.dll';
}
$libCandidates[] = dirname((string)PHP_BINARY) . DIRECTORY_SEPARATOR . 'libsqlite3.dll';
$libCandidates[] = 'D:\\php\\libsqlite3.dll';
$libCandidates[] = 'C:\\xampp\\php\\libsqlite3.dll';
$extDir = (string)ini_get('extension_dir');
if ($extDir !== '') {
    $libCandidates[] = dirname($extDir) . DIRECTORY_SEPARATOR . 'libsqlite3.dll';
}
foreach ($libCandidates as $cand) {
    if ($cand !== '' && is_file($cand)) {
        $libSqlitePath = $cand;
        $libSqliteBytes = (int)@filesize($cand);
        break;
    }
}
if ($isWindows) {
    $dllLooksModern = $libSqlitePath !== '' && $libSqliteBytes >= 2 * 1024 * 1024;
    $checks[] = lnHealthCheck(
        'libsqlite3_dll',
        'SQLite',
        $sqliteOk && $dllLooksModern,
        'warn',
        'Windows libsqlite3.dll from sqlite.org 3.53.4 (~3 MB)',
        $libSqlitePath !== ''
            ? $libSqlitePath . ' (' . lnHealthBytes($libSqliteBytes) . '), runtime ' . ($sqliteVersion !== '' ? $sqliteVersion : '?')
            : 'DLL not found next to php.ini; runtime ' . ($sqliteVersion !== '' ? $sqliteVersion : '?'),
        'Official 3.53.x DLLs are ~3 MB. Stock XAMPP 3.39 DLLs were ~1.3 MB and lack mmap. Run install-sqlite-xampp.bat, restart Apache.'
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
        'os' => PHP_OS . ' ' . php_uname('s') . ' ' . php_uname('r'),
        'ini' => $iniFile,
        'sqlite' => $sqliteVersion,
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

$catOrder = ['PHP', 'Extensions', 'OPcache', 'Apache', 'App', 'Filesystem', 'SQLite'];
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
<?php endforeach; ?>
    <p class="foot">Critical failures return HTTP 503. Warnings return HTTP 200 with status=degraded. This page does not require login so you can verify a fresh Apache/PHP deploy.</p>
  </div>
</body>
</html>
