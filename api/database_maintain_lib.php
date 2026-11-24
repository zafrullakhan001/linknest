<?php
/**
 * SQLite3 database maintenance helpers used by Admin → Database Export & Import.
 * Actions: status, integrity, analyze, optimize, checkpoint, vacuum, full.
 */

declare(strict_types=1);

/**
 * @return list<string>
 */
function linknestMaintainAllowedActions(): array
{
    return ['status', 'integrity', 'analyze', 'optimize', 'checkpoint', 'vacuum', 'full'];
}

function linknestMaintainFormatBytes(int $bytes): string
{
    if (function_exists('linknestFormatBytes')) {
        return linknestFormatBytes($bytes, 2);
    }
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

/**
 * @return array{
 *   db_bytes:int,wal_bytes:int,shm_bytes:int,total_disk_bytes:int,
 *   logical_bytes:int,page_count:int,page_size:int,freelist_count:int,
 *   freelist_bytes:int,fragmentation_percent:float
 * }
 */
function linknestMaintainMeasureDisk(PDO $db): array
{
    $pageCount = (int)$db->query('PRAGMA page_count')->fetchColumn();
    $pageSize = (int)$db->query('PRAGMA page_size')->fetchColumn();
    $freelist = 0;
    try {
        $freelist = (int)$db->query('PRAGMA freelist_count')->fetchColumn();
    } catch (Throwable $e) {
        // ignore
    }

    $dbBytes = $pageCount * $pageSize;
    $walBytes = 0;
    $shmBytes = 0;

    if (defined('DB_PATH') && is_string(DB_PATH) && DB_PATH !== '') {
        clearstatcache(true, DB_PATH);
        if (is_file(DB_PATH)) {
            $dbBytes = (int)filesize(DB_PATH);
        }
        $walPath = DB_PATH . '-wal';
        $shmPath = DB_PATH . '-shm';
        if (is_file($walPath)) {
            clearstatcache(true, $walPath);
            $walBytes = (int)filesize($walPath);
        }
        if (is_file($shmPath)) {
            clearstatcache(true, $shmPath);
            $shmBytes = (int)filesize($shmPath);
        }
    }

    $freelistBytes = $freelist * $pageSize;
    $fragPct = $pageCount > 0 ? round(($freelist / $pageCount) * 100, 2) : 0.0;

    return [
        'db_bytes' => $dbBytes,
        'wal_bytes' => $walBytes,
        'shm_bytes' => $shmBytes,
        'total_disk_bytes' => $dbBytes + $walBytes + $shmBytes,
        'logical_bytes' => $pageCount * $pageSize,
        'page_count' => $pageCount,
        'page_size' => $pageSize,
        'freelist_count' => $freelist,
        'freelist_bytes' => $freelistBytes,
        'fragmentation_percent' => $fragPct,
    ];
}

/**
 * @param array<string,mixed> $m
 * @return array<string,mixed>
 */
function linknestMaintainHumanizeMeasure(array $m): array
{
    return array_merge($m, [
        'db_human' => linknestMaintainFormatBytes((int)($m['db_bytes'] ?? 0)),
        'wal_human' => linknestMaintainFormatBytes((int)($m['wal_bytes'] ?? 0)),
        'shm_human' => linknestMaintainFormatBytes((int)($m['shm_bytes'] ?? 0)),
        'total_disk_human' => linknestMaintainFormatBytes((int)($m['total_disk_bytes'] ?? 0)),
        'logical_human' => linknestMaintainFormatBytes((int)($m['logical_bytes'] ?? 0)),
        'freelist_human' => linknestMaintainFormatBytes((int)($m['freelist_bytes'] ?? 0)),
    ]);
}

/**
 * @return array<string,mixed>
 */
function linknestMaintainPragmaSnapshot(PDO $db): array
{
    $read = static function (string $pragma) use ($db) {
        try {
            return $db->query('PRAGMA ' . $pragma)->fetchColumn();
        } catch (Throwable $e) {
            return null;
        }
    };

    return [
        'sqlite_version' => (string)$db->query('SELECT sqlite_version()')->fetchColumn(),
        'journal_mode' => (string)$read('journal_mode'),
        'synchronous' => $read('synchronous'),
        'cache_size' => $read('cache_size'),
        'mmap_size' => $read('mmap_size'),
        'page_size' => (int)$read('page_size'),
        'page_count' => (int)$read('page_count'),
        'freelist_count' => (int)$read('freelist_count'),
        'auto_vacuum' => $read('auto_vacuum'),
        'temp_store' => $read('temp_store'),
        'locking_mode' => $read('locking_mode'),
        'threads' => $read('threads'),
        'user_version' => (int)$read('user_version'),
        'encoding' => (string)$read('encoding'),
    ];
}

/**
 * @return array{ok:bool,result:list<string>,quick_check:string}
 */
function linknestMaintainIntegrity(PDO $db, bool $full = true): array
{
    $integrity = ['unavailable'];
    $ok = false;
    try {
        $pragma = $full ? 'PRAGMA integrity_check' : 'PRAGMA quick_check';
        $integrity = $db->query($pragma)->fetchAll(PDO::FETCH_COLUMN);
        $ok = count($integrity) === 1 && strtolower((string)$integrity[0]) === 'ok';
    } catch (Throwable $e) {
        $integrity = ['error: ' . $e->getMessage()];
        $ok = false;
    }

    $quick = 'unknown';
    try {
        $qc = $db->query('PRAGMA quick_check')->fetchColumn();
        $quick = (strtolower((string)$qc) === 'ok') ? 'ok' : (string)$qc;
    } catch (Throwable $e) {
        $quick = 'unavailable';
    }

    return [
        'ok' => $ok,
        'result' => array_values(array_map('strval', $integrity)),
        'quick_check' => $quick,
    ];
}

/**
 * @return array{created:list<string>,skipped:list<string>,errors:list<string>,total_indexes:int}
 */
function linknestMaintainCreateIndexes(PDO $db): array
{
    $created = [];
    $skipped = [];
    $errors = [];

    $indexSql = [
        'idx_users_is_approved' => 'CREATE INDEX IF NOT EXISTS idx_users_is_approved ON users(is_approved)',
        'idx_users_is_admin' => 'CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin)',
        'idx_users_approved_admin' => 'CREATE INDEX IF NOT EXISTS idx_users_approved_admin ON users(is_approved, is_admin)',
        'idx_users_created_at' => 'CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC)',
        'idx_tiles_user_id' => 'CREATE INDEX IF NOT EXISTS idx_tiles_user_id ON tiles(user_id)',
        'idx_tiles_position' => 'CREATE INDEX IF NOT EXISTS idx_tiles_position ON tiles(position ASC)',
        'idx_sections_tile_id' => 'CREATE INDEX IF NOT EXISTS idx_sections_tile_id ON sections(tile_id)',
        'idx_links_section_id' => 'CREATE INDEX IF NOT EXISTS idx_links_section_id ON links(section_id)',
        'idx_links_health_checked_at' => 'CREATE INDEX IF NOT EXISTS idx_links_health_checked_at ON links(health_checked_at)',
        'idx_links_health_status' => 'CREATE INDEX IF NOT EXISTS idx_links_health_status ON links(health_status)',
        'idx_links_health_composite' => 'CREATE INDEX IF NOT EXISTS idx_links_health_composite ON links(health_status, health_checked_at)',
        'idx_tile_arrangements_user_id' => 'CREATE INDEX IF NOT EXISTS idx_tile_arrangements_user_id ON tile_arrangements(user_id)',
        'idx_tile_arrangements_position' => 'CREATE INDEX IF NOT EXISTS idx_tile_arrangements_position ON tile_arrangements(user_id, position)',
        'idx_category_arrangements_user_id' => 'CREATE INDEX IF NOT EXISTS idx_category_arrangements_user_id ON category_arrangements(user_id)',
        'idx_category_arrangements_position' => 'CREATE INDEX IF NOT EXISTS idx_category_arrangements_position ON category_arrangements(user_id, position)',
    ];

    $startedTx = false;
    if (!$db->inTransaction()) {
        $db->beginTransaction();
        $startedTx = true;
    }

    foreach ($indexSql as $name => $sql) {
        try {
            $db->exec($sql);
            $created[] = $name;
        } catch (PDOException $e) {
            $msg = $e->getMessage();
            if (stripos($msg, 'already exists') !== false || stripos($msg, 'no such table') !== false) {
                $skipped[] = $name;
            } else {
                $errors[] = $name . ': ' . $msg;
            }
        }
    }

    if ($startedTx) {
        if ($errors === []) {
            $db->commit();
        } else {
            $db->rollBack();
        }
    }

    $total = 0;
    try {
        $total = (int)$db->query("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'")->fetchColumn();
    } catch (Throwable $e) {
        // ignore
    }

    return [
        'created' => $created,
        'skipped' => $skipped,
        'errors' => $errors,
        'total_indexes' => $total,
    ];
}

/**
 * @return array<string,int|null>
 */
function linknestMaintainTableCounts(PDO $db): array
{
    $tables = [
        'users', 'tiles', 'tabs', 'sections', 'links', 'settings',
        'tile_arrangements', 'category_arrangements', 'rich_text_content',
        'user_tile_favorites', 'user_tile_permissions', 'style_profiles',
        'user_preferences', 'clones', 'user_audit_log',
    ];
    $counts = [];
    foreach ($tables as $table) {
        try {
            $counts[$table] = (int)$db->query("SELECT COUNT(*) FROM {$table}")->fetchColumn();
        } catch (Throwable $e) {
            $counts[$table] = null;
        }
    }
    return $counts;
}

/**
 * @return list<string>
 */
function linknestMaintainSuggestions(array $measure, array $pragmas, bool $integrityOk): array
{
    $suggestions = [];
    if (!$integrityOk) {
        $suggestions[] = 'Integrity check failed. Create a snapshot, then try Optimize + Vacuum. If errors persist, restore from a known-good backup.';
    }
    $frag = (float)($measure['fragmentation_percent'] ?? 0);
    if ($frag >= 5) {
        $suggestions[] = 'Freelist fragmentation is about ' . $frag . '%. Run Vacuum to reclaim space and defragment.';
    }
    $wal = (int)($measure['wal_bytes'] ?? 0);
    if ($wal > 8 * 1024 * 1024) {
        $suggestions[] = 'WAL file is large (' . linknestMaintainFormatBytes($wal) . '). Run WAL Checkpoint (TRUNCATE) or Vacuum.';
    }
    $journal = strtolower((string)($pragmas['journal_mode'] ?? ''));
    if ($journal !== '' && $journal !== 'wal') {
        $suggestions[] = 'Journal mode is ' . $journal . ' (WAL is preferred for LinkNest). Run Optimize to apply performance PRAGMAs.';
    }
    $sizeMb = ((int)($measure['total_disk_bytes'] ?? 0)) / (1024 * 1024);
    if ($sizeMb > 50) {
        $suggestions[] = 'Database is ' . round($sizeMb, 1) . ' MB. After large deletions or imports, run Analyze then Vacuum.';
    }
    if ($suggestions === []) {
        $suggestions[] = 'Database looks healthy. Periodic Analyze after bulk changes and Vacuum after large deletes is still recommended.';
    }
    return $suggestions;
}

/**
 * @return array<string,mixed>
 */
function linknestMaintainRunStatus(PDO $db): array
{
    $measure = linknestMaintainHumanizeMeasure(linknestMaintainMeasureDisk($db));
    $pragmas = linknestMaintainPragmaSnapshot($db);
    $integrity = linknestMaintainIntegrity($db, false);
    $tableCounts = linknestMaintainTableCounts($db);
    $suggestions = linknestMaintainSuggestions($measure, $pragmas, (bool)$integrity['ok']);

    $health = 'good';
    if (!$integrity['ok']) {
        $health = 'critical';
    } elseif (($measure['fragmentation_percent'] ?? 0) >= 10 || ($measure['wal_bytes'] ?? 0) > 32 * 1024 * 1024) {
        $health = 'attention';
    }

    return [
        'success' => true,
        'action' => 'status',
        'message' => $health === 'good'
            ? 'SQLite performance check completed — database looks healthy.'
            : ($health === 'critical'
                ? 'SQLite performance check found integrity problems.'
                : 'SQLite performance check completed — maintenance recommended.'),
        'health_status' => $health,
        'measure' => $measure,
        'pragmas' => $pragmas,
        'integrity' => $integrity,
        'table_counts' => $tableCounts,
        'suggestions' => $suggestions,
    ];
}

/**
 * @return array<string,mixed>
 */
function linknestMaintainRunIntegrity(PDO $db): array
{
    set_time_limit(120);
    $integrity = linknestMaintainIntegrity($db, true);
    return [
        'success' => true,
        'action' => 'integrity',
        'message' => $integrity['ok']
            ? 'Full integrity check passed (ok).'
            : 'Integrity check reported issues — review the result and restore from backup if needed.',
        'integrity' => $integrity,
        'integrity_ok' => $integrity['ok'],
    ];
}

/**
 * @return array<string,mixed>
 */
function linknestMaintainRunAnalyze(PDO $db): array
{
    set_time_limit(120);
    $before = linknestMaintainPragmaSnapshot($db);
    $db->exec('ANALYZE');
    return [
        'success' => true,
        'action' => 'analyze',
        'message' => 'ANALYZE completed. Query planner statistics were refreshed.',
        'pragmas' => linknestMaintainPragmaSnapshot($db),
        'before_user_version' => $before['user_version'] ?? null,
    ];
}

/**
 * @return array<string,mixed>
 */
function linknestMaintainRunOptimize(PDO $db): array
{
    set_time_limit(120);
    $pragmaSettings = [];
    if (function_exists('applySqlitePerformancePragmas')) {
        $pragmaSettings = applySqlitePerformancePragmas($db);
    }
    $indexes = linknestMaintainCreateIndexes($db);
    $db->exec('ANALYZE');

    return [
        'success' => $indexes['errors'] === [],
        'action' => 'optimize',
        'message' => $indexes['errors'] === []
            ? 'Optimize completed: indexes verified, performance PRAGMAs applied, ANALYZE ran.'
            : 'Optimize finished with some index errors.',
        'pragma_settings' => $pragmaSettings,
        'indexes_created' => count($indexes['created']),
        'indexes_skipped' => count($indexes['skipped']),
        'indexesCreated' => $indexes['created'],
        'indexes_skipped_list' => $indexes['skipped'],
        'total_indexes' => $indexes['total_indexes'],
        'errors' => $indexes['errors'],
        'pragmas' => linknestMaintainPragmaSnapshot($db),
        'measure' => linknestMaintainHumanizeMeasure(linknestMaintainMeasureDisk($db)),
    ];
}

/**
 * @return array<string,mixed>
 */
function linknestMaintainRunCheckpoint(PDO $db): array
{
    $before = linknestMaintainHumanizeMeasure(linknestMaintainMeasureDisk($db));
    $db->exec('PRAGMA busy_timeout = 30000');
    $result = null;
    try {
        $row = $db->query('PRAGMA wal_checkpoint(TRUNCATE)')->fetch(PDO::FETCH_NUM);
        $result = [
            'busy' => isset($row[0]) ? (int)$row[0] : null,
            'log' => isset($row[1]) ? (int)$row[1] : null,
            'checkpointed' => isset($row[2]) ? (int)$row[2] : null,
        ];
    } catch (PDOException $e) {
        // Not in WAL mode
        return [
            'success' => false,
            'action' => 'checkpoint',
            'message' => 'WAL checkpoint failed (database may not be in WAL mode).',
            'error' => $e->getMessage(),
            'before' => $before,
            'pragmas' => linknestMaintainPragmaSnapshot($db),
        ];
    }

    if (defined('DB_PATH')) {
        clearstatcache(true, DB_PATH);
        clearstatcache(true, DB_PATH . '-wal');
        clearstatcache(true, DB_PATH . '-shm');
    }
    $after = linknestMaintainHumanizeMeasure(linknestMaintainMeasureDisk($db));
    $reclaimed = max(0, (int)$before['total_disk_bytes'] - (int)$after['total_disk_bytes']);

    return [
        'success' => true,
        'action' => 'checkpoint',
        'message' => $reclaimed > 0
            ? 'WAL checkpoint (TRUNCATE) completed. Reclaimed ' . linknestMaintainFormatBytes($reclaimed) . '.'
            : 'WAL checkpoint (TRUNCATE) completed.',
        'checkpoint' => $result,
        'before' => $before,
        'after' => $after,
        'reclaimed' => [
            'disk_bytes' => $reclaimed,
            'disk_human' => linknestMaintainFormatBytes($reclaimed),
        ],
    ];
}

/**
 * @return array<string,mixed>
 */
function linknestMaintainRunVacuum(PDO $db): array
{
    set_time_limit(300);
    $before = linknestMaintainHumanizeMeasure(linknestMaintainMeasureDisk($db));

    $db->exec('PRAGMA busy_timeout = 30000');
    try {
        $db->exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch (PDOException $e) {
        // ignore if not WAL
    }

    $db->exec('VACUUM');

    if (defined('DB_PATH')) {
        clearstatcache(true, DB_PATH);
        clearstatcache(true, DB_PATH . '-wal');
        clearstatcache(true, DB_PATH . '-shm');
    }
    $after = linknestMaintainHumanizeMeasure(linknestMaintainMeasureDisk($db));

    $reclaimedDisk = max(0, (int)$before['total_disk_bytes'] - (int)$after['total_disk_bytes']);
    $reclaimedLogical = max(0, (int)$before['logical_bytes'] - (int)$after['logical_bytes']);
    $reclaimedFreelist = max(0, (int)$before['freelist_count'] - (int)$after['freelist_count']);

    return [
        'success' => true,
        'action' => 'vacuum',
        'message' => $reclaimedDisk > 0
            ? 'Vacuum / defrag completed. Reclaimed ' . linknestMaintainFormatBytes($reclaimedDisk) . ' on disk.'
            : 'Vacuum / defrag completed. File was already compact.',
        'before' => $before,
        'after' => $after,
        'reclaimed' => [
            'disk_bytes' => $reclaimedDisk,
            'logical_bytes' => $reclaimedLogical,
            'freelist_pages' => $reclaimedFreelist,
            'disk_human' => linknestMaintainFormatBytes($reclaimedDisk),
            'logical_human' => linknestMaintainFormatBytes($reclaimedLogical),
            'percent' => ((int)$before['total_disk_bytes'] > 0)
                ? round(($reclaimedDisk / (int)$before['total_disk_bytes']) * 100, 1)
                : 0,
        ],
    ];
}

/**
 * Full maintenance: checkpoint → optimize indexes/pragmas → analyze → vacuum.
 *
 * @return array<string,mixed>
 */
function linknestMaintainRunFull(PDO $db): array
{
    set_time_limit(300);
    $steps = [];
    $errors = [];

    try {
        $steps['checkpoint'] = linknestMaintainRunCheckpoint($db);
    } catch (Throwable $e) {
        $errors[] = 'checkpoint: ' . $e->getMessage();
        $steps['checkpoint'] = ['success' => false, 'error' => $e->getMessage()];
    }

    try {
        $steps['optimize'] = linknestMaintainRunOptimize($db);
    } catch (Throwable $e) {
        $errors[] = 'optimize: ' . $e->getMessage();
        $steps['optimize'] = ['success' => false, 'error' => $e->getMessage()];
    }

    try {
        $steps['vacuum'] = linknestMaintainRunVacuum($db);
    } catch (Throwable $e) {
        $errors[] = 'vacuum: ' . $e->getMessage();
        $steps['vacuum'] = ['success' => false, 'error' => $e->getMessage()];
    }

    $status = linknestMaintainRunStatus($db);
    $ok = $errors === [];

    return [
        'success' => $ok,
        'action' => 'full',
        'message' => $ok
            ? 'Full SQLite maintenance completed (checkpoint, optimize, analyze, vacuum).'
            : 'Full maintenance finished with errors — see steps.',
        'steps' => $steps,
        'errors' => $errors,
        'status' => $status,
        'measure' => $status['measure'] ?? null,
        'suggestions' => $status['suggestions'] ?? [],
    ];
}

/**
 * Dispatch a maintenance action.
 *
 * @return array<string,mixed>
 */
function linknestMaintainRun(PDO $db, string $action): array
{
    $action = strtolower(trim($action));
    if (!in_array($action, linknestMaintainAllowedActions(), true)) {
        throw new InvalidArgumentException(
            'Invalid action. Allowed: ' . implode(', ', linknestMaintainAllowedActions())
        );
    }

    switch ($action) {
        case 'status':
            return linknestMaintainRunStatus($db);
        case 'integrity':
            return linknestMaintainRunIntegrity($db);
        case 'analyze':
            return linknestMaintainRunAnalyze($db);
        case 'optimize':
            return linknestMaintainRunOptimize($db);
        case 'checkpoint':
            return linknestMaintainRunCheckpoint($db);
        case 'vacuum':
            return linknestMaintainRunVacuum($db);
        case 'full':
            return linknestMaintainRunFull($db);
        default:
            throw new InvalidArgumentException('Unsupported action.');
    }
}
