<?php
/**
 * System specs / environment validator for LinkNest
 *
 * Compares this runtime against the known-good configuration required for
 * performance (SQLite 3.53+, WAL/mmap, schema fast-path, caches, writable dirs).
 * Use before shipping to another XAMPP host so the target can match these specs.
 *
 * Usage (CLI):
 *   php api/system_specs_check.php
 *   php api/system_specs_check.php --json
 *
 * Usage (API / Admin):
 *   GET /api/system-specs-check  (admin)
 *   Admin → Maintenance Scripts → System Specs Check
 */

require_once __DIR__ . '/config.php';

$isCli = (PHP_SAPI === 'cli' || PHP_SAPI === 'phpdbg');
$cliJson = $isCli && in_array('--json', $argv ?? [], true);

if (!$isCli) {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false, 'error' => 'Not authenticated']);
        exit;
    }
    $dbAuth = getDB();
    $stmt = $dbAuth->prepare('SELECT is_admin FROM users WHERE id = ?');
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    if (!$user || !(int)$user['is_admin']) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false, 'error' => 'Admin access required']);
        exit;
    }
    header('Content-Type: application/json; charset=utf-8');
}

/** @return array{id:string,category:string,ok:bool,severity:string,required:string,actual:string,advice?:string} */
function specsCheck(
    string $id,
    string $category,
    bool $ok,
    string $required,
    $actual,
    string $advice = ''
): array {
    return [
        'id' => $id,
        'category' => $category,
        'ok' => $ok,
        'severity' => $ok ? 'pass' : 'fail',
        'required' => $required,
        'actual' => is_bool($actual) ? ($actual ? 'yes' : 'no') : (string)$actual,
        'advice' => $advice,
    ];
}

function specsFormatBytes(int $bytes): string {
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

function specsPathWritable(string $path): bool {
    if (!file_exists($path)) {
        return @mkdir($path, 0755, true) && is_writable($path);
    }
    return is_dir($path) && is_writable($path);
}

try {
    $checks = [];
    $db = getDB();
    applySqlitePerformancePragmas($db, false);

    $sqliteVersion = (string)$db->query('SELECT sqlite_version()')->fetchColumn();
    $journalMode = strtolower((string)$db->query('PRAGMA journal_mode')->fetchColumn());
    $synchronous = (int)$db->query('PRAGMA synchronous')->fetchColumn();
    $tempStore = (int)$db->query('PRAGMA temp_store')->fetchColumn();
    $mmapSize = (int)$db->query('PRAGMA mmap_size')->fetchColumn();
    $cacheSize = (int)$db->query('PRAGMA cache_size')->fetchColumn();
    $threads = (int)$db->query('PRAGMA threads')->fetchColumn();
    $userVersion = (int)$db->query('PRAGMA user_version')->fetchColumn();
    $pageCount = (int)$db->query('PRAGMA page_count')->fetchColumn();
    $pageSize = (int)$db->query('PRAGMA page_size')->fetchColumn();
    $dbBytes = $pageCount * $pageSize;
    $cacheBytes = $cacheSize < 0 ? abs($cacheSize) * 1024 : abs($cacheSize) * max($pageSize, 1);

    $schemaRequired = defined('LINKNEST_SCHEMA_VERSION') ? (int)LINKNEST_SCHEMA_VERSION : 60;

    // ---- PHP ----
    $checks[] = specsCheck(
        'php_version',
        'PHP',
        version_compare(PHP_VERSION, '8.2.0', '>='),
        'PHP >= 8.2',
        PHP_VERSION,
        'Install PHP 8.2+ (XAMPP 8.2 recommended).'
    );
    $checks[] = specsCheck(
        'pdo_sqlite',
        'PHP',
        extension_loaded('pdo_sqlite'),
        'pdo_sqlite enabled',
        extension_loaded('pdo_sqlite'),
        'Enable extension=pdo_sqlite in php.ini.'
    );
    $checks[] = specsCheck(
        'sqlite3_ext',
        'PHP',
        extension_loaded('sqlite3'),
        'sqlite3 enabled',
        extension_loaded('sqlite3'),
        'Enable extension=sqlite3 in php.ini.'
    );
    foreach (['json', 'mbstring', 'openssl', 'session', 'fileinfo'] as $ext) {
        $checks[] = specsCheck(
            'ext_' . $ext,
            'PHP',
            extension_loaded($ext),
            $ext . ' enabled',
            extension_loaded($ext),
            "Enable extension={$ext} in php.ini."
        );
    }
    $memoryLimit = ini_get('memory_limit') ?: 'unknown';
    $memoryBytes = 0;
    if (preg_match('/^(\d+)\s*([KMG])?/i', (string)$memoryLimit, $m)) {
        $memoryBytes = (int)$m[1];
        $u = strtoupper($m[2] ?? '');
        if ($u === 'K') $memoryBytes *= 1024;
        elseif ($u === 'M') $memoryBytes *= 1024 * 1024;
        elseif ($u === 'G') $memoryBytes *= 1024 * 1024 * 1024;
        elseif ($u === '') $memoryBytes = (int)$memoryLimit;
    }
    $checks[] = specsCheck(
        'memory_limit',
        'PHP',
        $memoryLimit === '-1' || $memoryBytes >= 128 * 1024 * 1024,
        'memory_limit >= 128M',
        (string)$memoryLimit,
        'Set memory_limit=256M (or higher) in php.ini.'
    );
    $checks[] = specsCheck(
        'opcache',
        'PHP',
        extension_loaded('Zend OPcache') || function_exists('opcache_get_status'),
        'OPcache recommended',
        extension_loaded('Zend OPcache') || function_exists('opcache_get_status'),
        'Enable zend_extension=opcache for production performance.'
    );

    // ---- SQLite engine ----
    $checks[] = specsCheck(
        'sqlite_version',
        'SQLite',
        version_compare($sqliteVersion, '3.53.0', '>='),
        'SQLite >= 3.53.0 (3.53.4 recommended)',
        $sqliteVersion,
        'On Windows XAMPP replace php/libsqlite3.dll using install-sqlite-xampp.bat from the deployment package.'
    );
    $checks[] = specsCheck(
        'schema_version',
        'SQLite',
        $userVersion >= $schemaRequired,
        'PRAGMA user_version >= ' . $schemaRequired,
        (string)$userVersion,
        'Open the app once as admin (getDB migrates) or run Optimize Database.'
    );
    $checks[] = specsCheck(
        'journal_wal',
        'SQLite',
        $journalMode === 'wal',
        'journal_mode=WAL',
        $journalMode,
        'Applied automatically by applySqlitePerformancePragmas(); ensure DB folder is writable.'
    );
    $checks[] = specsCheck(
        'synchronous_normal',
        'SQLite',
        $synchronous === 1,
        'synchronous=NORMAL (1)',
        (string)$synchronous,
        'Applied on connect; NORMAL is required with WAL for load-test throughput.'
    );
    $checks[] = specsCheck(
        'temp_store_memory',
        'SQLite',
        $tempStore === 2,
        'temp_store=MEMORY (2)',
        (string)$tempStore,
        'Applied on connect via applySqlitePerformancePragmas().'
    );
    $checks[] = specsCheck(
        'mmap_enabled',
        'SQLite',
        $mmapSize > 0,
        'mmap_size > 0 (256MB recommended)',
        specsFormatBytes($mmapSize),
        'Use official sqlite.org Windows x64 DLL (mmap enabled). Old XAMPP builds often leave mmap at 0.'
    );
    $checks[] = specsCheck(
        'cache_holds_db',
        'SQLite',
        $cacheBytes >= $dbBytes && $dbBytes > 0,
        'page cache >= database size',
        specsFormatBytes($cacheBytes) . ' cache / ' . specsFormatBytes($dbBytes) . ' DB',
        'Page cache is auto-sized in applySqlitePerformancePragmas().'
    );
    $checks[] = specsCheck(
        'worker_threads',
        'SQLite',
        $threads >= 1,
        'PRAGMA threads >= 1',
        (string)$threads,
        'Requires SQLite build with MAX_WORKER_THREADS (official 3.53.4 Windows build).'
    );

    // ---- Filesystem ----
    $dataDir = defined('DB_DIR') ? DB_DIR : (__DIR__ . '/../data');
    $uploadsDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'uploads';
    $cacheDir = $dataDir . DIRECTORY_SEPARATOR . 'cache';
    $logsDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'logs';

    $checks[] = specsCheck(
        'data_writable',
        'Filesystem',
        specsPathWritable($dataDir),
        'data/ writable',
        $dataDir,
        'chmod 775/777 data (Linux) or grant IIS/Apache modify rights (Windows).'
    );
    $checks[] = specsCheck(
        'db_file',
        'Filesystem',
        defined('DB_PATH') && (is_file(DB_PATH) || is_writable($dataDir)),
        'linknest.db present or creatable',
        defined('DB_PATH') ? DB_PATH : 'n/a',
        'Ensure data/ exists; DB is created on first API request.'
    );
    $checks[] = specsCheck(
        'uploads_writable',
        'Filesystem',
        specsPathWritable($uploadsDir),
        'uploads/ writable',
        $uploadsDir,
        'Required for logos/favicons.'
    );
    $checks[] = specsCheck(
        'cache_writable',
        'Filesystem',
        specsPathWritable($cacheDir),
        'data/cache/ writable',
        $cacheDir,
        'Required for guest response cache (home load performance).'
    );
    $checks[] = specsCheck(
        'logs_writable',
        'Filesystem',
        specsPathWritable($logsDir),
        'logs/ writable (recommended)',
        $logsDir,
        'Create logs/ and make writable for troubleshooting.'
    );

    // ---- Response cache ----
    $cacheProbeKey = 'system_specs_probe_' . getmypid();
    responseCacheSet($cacheProbeKey, ['ok' => true, 'ts' => time()], 30);
    $cacheRoundTrip = responseCacheGet($cacheProbeKey, 30);
    responseCacheInvalidate($cacheProbeKey);
    $checks[] = specsCheck(
        'response_cache',
        'Cache',
        is_array($cacheRoundTrip) && !empty($cacheRoundTrip['ok']),
        'response file cache read/write',
        is_array($cacheRoundTrip) ? 'working' : 'failed',
        'Ensure data/cache is writable; home endpoints rely on short-TTL cache under load.'
    );

    // ---- Optional / environment (Windows XAMPP DLL) ----
    $isWindows = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
    $libSqlitePath = '';
    $libSqliteBytes = 0;
    if ($isWindows) {
        $phpDir = dirname(PHP_BINARY);
        foreach ([$phpDir . DIRECTORY_SEPARATOR . 'libsqlite3.dll', 'C:\\xampp\\php\\libsqlite3.dll'] as $cand) {
            if (is_file($cand)) {
                $libSqlitePath = $cand;
                $libSqliteBytes = (int)@filesize($cand);
                break;
            }
        }
        // Official 3.53.x Windows x64 builds are ~3 MB; stock XAMPP 3.39 DLLs were ~1.3 MB
        $dllLooksModern = $libSqlitePath !== '' && $libSqliteBytes >= 2 * 1024 * 1024;
        $sqliteOk = version_compare($sqliteVersion, '3.53.0', '>=');
        $checks[] = specsCheck(
            'windows_libsqlite',
            'Deploy',
            $sqliteOk && $dllLooksModern,
            'Windows: php/libsqlite3.dll from sqlite.org 3.53.4 (~3 MB)',
            $libSqlitePath !== ''
                ? $libSqlitePath . ' (' . specsFormatBytes($libSqliteBytes) . '), runtime ' . $sqliteVersion
                : 'DLL not found next to php.exe; runtime ' . $sqliteVersion,
            'Run install-sqlite-xampp.bat from the deployment package, then restart Apache.'
        );
    } else {
        $checks[] = specsCheck(
            'windows_libsqlite',
            'Deploy',
            version_compare($sqliteVersion, '3.53.0', '>='),
            'SQLite >= 3.53.0 via system libsqlite3',
            $sqliteVersion . ' (non-Windows)',
            'Install/upgrade libsqlite3 on the host so PHP sees SQLite 3.53+.'
        );
    }

    $pass = count(array_filter($checks, static fn($c) => $c['ok']));
    $fail = count($checks) - $pass;
    $allCriticalOk = $fail === 0;

    $targetSpecs = [
        'php' => '8.2+',
        'extensions' => ['pdo_sqlite', 'sqlite3', 'json', 'mbstring', 'openssl', 'session', 'fileinfo', 'Zend OPcache (recommended)'],
        'sqlite' => '3.53.4 Windows x64 DLL (libsqlite3.dll) from https://sqlite.org/',
        'sqlite_pragmas' => [
            'journal_mode=WAL',
            'synchronous=NORMAL',
            'temp_store=MEMORY',
            'mmap_size>=256MB (capability)',
            'cache sized to hold DB',
            'threads>=1',
        ],
        'schema' => 'PRAGMA user_version >= ' . $schemaRequired . ' (auto on first request)',
        'directories' => ['data/', 'data/cache/', 'uploads/', 'logs/'],
        'memory_limit' => '256M recommended (min 128M)',
        'deploy_hint' => 'Use package-for-deployment.ps1 (bundles SQLite DLL + install-sqlite-xampp.bat). After deploy run Admin → System Specs Check.',
        'reference_host' => [
            'os' => PHP_OS . ' / ' . php_uname('s') . ' ' . php_uname('r'),
            'php' => PHP_VERSION,
            'sqlite' => $sqliteVersion,
            'sapi' => PHP_SAPI,
            'checked_at' => date('c'),
        ],
    ];

    $result = [
        'success' => true,
        'summary' => $allCriticalOk
            ? 'All system specs match the known-good LinkNest configuration.'
            : "System specs incomplete: {$fail} check(s) failed — fix before expecting production/load-test parity.",
        'verdict' => [
            'ready_for_target_parity' => $allCriticalOk,
            'checks_passed' => $pass,
            'checks_failed' => $fail,
            'checks_total' => count($checks),
        ],
        'checks' => $checks,
        'target_specs' => $targetSpecs,
        'snapshot' => [
            'php_version' => PHP_VERSION,
            'sqlite_version' => $sqliteVersion,
            'schema_version' => $userVersion,
            'schema_required' => $schemaRequired,
            'journal_mode' => $journalMode,
            'mmap_size' => $mmapSize,
            'cache_bytes' => $cacheBytes,
            'database_bytes' => $dbBytes,
            'threads' => $threads,
            'db_path' => defined('DB_PATH') ? DB_PATH : null,
        ],
    ];

    if ($isCli) {
        if ($cliJson) {
            echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            exit($allCriticalOk ? 0 : 2);
        }
        echo "============================================\n";
        echo "  LinkNest System Specs Check\n";
        echo "============================================\n";
        echo '  ' . $result['summary'] . "\n\n";
        $cats = [];
        foreach ($checks as $c) {
            $cats[$c['category']][] = $c;
        }
        foreach ($cats as $cat => $items) {
            echo "  [{$cat}]\n";
            foreach ($items as $c) {
                echo '    [' . ($c['ok'] ? 'OK' : '!!') . '] ' . $c['id'] . "\n";
                echo '         required: ' . $c['required'] . "\n";
                echo '         actual:   ' . $c['actual'] . "\n";
                if (!$c['ok'] && $c['advice'] !== '') {
                    echo '         fix:      ' . $c['advice'] . "\n";
                }
            }
            echo "\n";
        }
        echo '  Passed: ' . $pass . '/' . count($checks) . "\n";
        echo "============================================\n";
        exit($allCriticalOk ? 0 : 2);
    }

    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    if ($isCli) {
        fwrite(STDERR, 'ERROR: ' . $e->getMessage() . PHP_EOL);
        exit(1);
    }
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
    ], JSON_PRETTY_PRINT);
}
