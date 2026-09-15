<?php
/**
 * SQLite RAM / performance diagnostics for LinkNest
 *
 * Reports whether the DB is set up for memory-fast reads (page cache + mmap)
 * while still committing durable changes to the on-disk SQLite file.
 *
 * Usage (CLI):
 *   php api/check_sqlite_memory.php
 *
 * Usage (API / Admin panel):
 *   GET /api/check-sqlite-memory  (admin session)
 *   Admin → Maintenance Scripts → SQLite RAM / Performance Check
 *
 * Usage (direct browser, admin):
 *   http://localhost/linknest/api/check_sqlite_memory.php
 */

require_once __DIR__ . '/config.php';

$isCli = (PHP_SAPI === 'cli' || PHP_SAPI === 'phpdbg');

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

function sqlitePragma(PDO $db, string $name) {
    try {
        return $db->query('PRAGMA ' . $name)->fetchColumn();
    } catch (Throwable $e) {
        return null;
    }
}

function formatBytes($bytes): string {
    $bytes = (float)max(0, (int)$bytes);
    $units = ['B', 'KB', 'MB', 'GB'];
    $i = 0;
    while ($bytes >= 1024 && $i < count($units) - 1) {
        $bytes /= 1024;
        $i++;
    }
    return round($bytes, $i === 0 ? 0 : 2) . ' ' . $units[$i];
}

try {
    $t0 = microtime(true);
    $db = getDB();
    $connectMs = round((microtime(true) - $t0) * 1000, 2);

    // Re-apply / re-measure the same path production uses
    $applied = applySqlitePerformancePragmas($db);

    $pageCount = (int)sqlitePragma($db, 'page_count');
    $pageSize = (int)sqlitePragma($db, 'page_size');
    $dbBytes = $pageCount * $pageSize;
    $fileBytes = (defined('DB_PATH') && is_file(DB_PATH)) ? (int)filesize(DB_PATH) : $dbBytes;

    $cachePragma = (int)sqlitePragma($db, 'cache_size');
    // Negative cache_size = KiB; positive = pages
    $cacheBytes = $cachePragma < 0
        ? abs($cachePragma) * 1024
        : abs($cachePragma) * max($pageSize, 1);

    $mmapSize = (int)sqlitePragma($db, 'mmap_size');
    $journalMode = strtolower((string)sqlitePragma($db, 'journal_mode'));
    $synchronous = (int)sqlitePragma($db, 'synchronous');
    $tempStore = (int)sqlitePragma($db, 'temp_store');
    $threads = (int)sqlitePragma($db, 'threads');
    $busyTimeout = (int)sqlitePragma($db, 'busy_timeout');
    $walAutocheckpoint = (int)sqlitePragma($db, 'wal_autocheckpoint');
    $journalSizeLimit = (int)sqlitePragma($db, 'journal_size_limit');

    $sqliteVersion = (string)$db->query('SELECT sqlite_version()')->fetchColumn();
    $sourceId = (string)$db->query('SELECT sqlite_source_id()')->fetchColumn();

    // Tiny read benchmark (cached pages after warm)
    $t1 = microtime(true);
    $db->query('SELECT COUNT(*) FROM sqlite_master')->fetchColumn();
    try {
        $db->query('SELECT COUNT(*) FROM tiles')->fetchColumn();
    } catch (Throwable $e) {
        // table may not exist on empty install
    }
    $readMs = round((microtime(true) - $t1) * 1000, 2);

    $cacheHoldsDb = $cacheBytes >= $dbBytes && $dbBytes > 0;
    $mmapEnabled = $mmapSize > 0;
    $mmapCoversDb = $mmapEnabled && $mmapSize >= $dbBytes;
    $walOk = ($journalMode === 'wal');
    $syncOk = ($synchronous === 1); // NORMAL
    $tempOk = ($tempStore === 2);   // MEMORY
    $versionOk = version_compare($sqliteVersion, '3.53.0', '>=');

    $inMemoryPrimary = false; // LinkNest never uses :memory: as primary (by design)
    $ramFastReads = $cacheHoldsDb && $mmapEnabled && $walOk;

    $checks = [
        [
            'id' => 'sqlite_version',
            'ok' => $versionOk,
            'detail' => $sqliteVersion . ($versionOk ? '' : ' (want 3.53.4+)'),
        ],
        [
            'id' => 'not_volatile_memory_db',
            'ok' => true,
            'detail' => 'Primary DB is on-disk (safe for multi-worker Apache); RAM used as cache',
        ],
        [
            'id' => 'page_cache_holds_db',
            'ok' => $cacheHoldsDb,
            'detail' => 'cache ' . formatBytes($cacheBytes) . ' vs DB ' . formatBytes($dbBytes),
        ],
        [
            'id' => 'mmap_enabled',
            'ok' => $mmapEnabled,
            'detail' => 'mmap_size=' . formatBytes($mmapSize),
        ],
        [
            'id' => 'mmap_covers_db',
            'ok' => $mmapCoversDb,
            'detail' => $mmapCoversDb ? 'mmap >= database file' : 'mmap smaller than DB or disabled',
        ],
        [
            'id' => 'wal_mode',
            'ok' => $walOk,
            'detail' => 'journal_mode=' . $journalMode,
        ],
        [
            'id' => 'synchronous_normal',
            'ok' => $syncOk,
            'detail' => 'synchronous=' . $synchronous . ' (1=NORMAL)',
        ],
        [
            'id' => 'temp_store_memory',
            'ok' => $tempOk,
            'detail' => 'temp_store=' . $tempStore . ' (2=MEMORY)',
        ],
        [
            'id' => 'worker_threads',
            'ok' => $threads >= 1,
            'detail' => 'threads=' . $threads,
        ],
        [
            'id' => 'ram_prefetch',
            'ok' => !empty($applied['ram_prefetch']),
            'detail' => !empty($applied['ram_prefetch']) ? 'OS page cache warmed this worker' : 'prefetch skipped/failed',
        ],
    ];

    $passCount = count(array_filter($checks, static fn($c) => !empty($c['ok'])));
    $allCriticalOk = $ramFastReads && $versionOk;

    $result = [
        'success' => true,
        'summary' => $allCriticalOk
            ? 'RAM-fast reads YES — page cache + mmap cover the DB; commits go to disk via WAL'
            : 'RAM-fast setup incomplete — see checks[]',
        'verdict' => [
            'in_memory_primary_db' => $inMemoryPrimary,
            'ram_fast_reads' => $ramFastReads,
            'durable_commits_to_disk' => true,
            'database_path' => defined('DB_PATH') ? DB_PATH : null,
        ],
        'sizes' => [
            'database_bytes' => $dbBytes,
            'database_human' => formatBytes($dbBytes),
            'file_bytes' => $fileBytes,
            'file_human' => formatBytes($fileBytes),
            'cache_bytes' => $cacheBytes,
            'cache_human' => formatBytes($cacheBytes),
            'mmap_bytes' => $mmapSize,
            'mmap_human' => formatBytes($mmapSize),
            'cache_holds_entire_db' => $cacheHoldsDb,
            'mmap_covers_entire_db' => $mmapCoversDb,
        ],
        'pragmas' => [
            'sqlite_version' => $sqliteVersion,
            'sqlite_source_id' => $sourceId,
            'journal_mode' => $journalMode,
            'synchronous' => $synchronous,
            'cache_size' => $cachePragma,
            'mmap_size' => $mmapSize,
            'temp_store' => $tempStore,
            'threads' => $threads,
            'busy_timeout' => $busyTimeout,
            'wal_autocheckpoint' => $walAutocheckpoint,
            'journal_size_limit' => $journalSizeLimit,
            'page_count' => $pageCount,
            'page_size' => $pageSize,
        ],
        'applied' => $applied,
        'checks' => $checks,
        'checks_passed' => $passCount . '/' . count($checks),
        'timing_ms' => [
            'getDB_connect' => $connectMs,
            'warmup_read' => $readMs,
        ],
        'notes' => [
            'LinkNest does not use sqlite::memory: as the primary database (unsafe with multiple Apache workers).',
            'Reads are accelerated by SQLite page cache + mmap + OS prefetch; writes commit to the file via WAL.',
            'After upgrading libsqlite3.dll, restart Apache so PHP loads the new library.',
        ],
    ];

    if ($isCli) {
        echo "============================================\n";
        echo "  LinkNest SQLite RAM / Performance Check\n";
        echo "============================================\n";
        echo '  ' . $result['summary'] . "\n\n";
        echo '  SQLite version : ' . $sqliteVersion . "\n";
        echo '  DB path        : ' . (defined('DB_PATH') ? DB_PATH : '?') . "\n";
        echo '  DB size        : ' . formatBytes($dbBytes) . "\n";
        echo '  Page cache     : ' . formatBytes($cacheBytes) . ($cacheHoldsDb ? ' (holds entire DB)' : ' (TOO SMALL)') . "\n";
        echo '  mmap           : ' . formatBytes($mmapSize) . ($mmapEnabled ? '' : ' (OFF)') . "\n";
        echo '  journal_mode   : ' . $journalMode . "\n";
        echo '  temp_store     : ' . ($tempOk ? 'MEMORY' : (string)$tempStore) . "\n";
        echo '  threads        : ' . $threads . "\n";
        echo '  ram_prefetch   : ' . (!empty($applied['ram_prefetch']) ? 'yes' : 'no') . "\n";
        echo '  connect ms     : ' . $connectMs . "\n";
        echo '  sample read ms : ' . $readMs . "\n\n";
        echo "  Checks:\n";
        foreach ($checks as $c) {
            echo '    [' . ($c['ok'] ? 'OK' : '!!') . '] ' . $c['id'] . ' — ' . $c['detail'] . "\n";
        }
        echo "\n  Passed: {$result['checks_passed']}\n";
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
