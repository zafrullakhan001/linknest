<?php
/**
 * Vacuum Database API
 *
 * Reclaims disk space and defragments the SQLite database. Admin only.
 * Returns before/after sizes so the UI can show how much was reclaimed.
 */

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

function vacuumFormatBytes(int $bytes): string {
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
 * Measure on-disk DB + WAL/SHM and logical SQLite size (page_count * page_size).
 *
 * @return array{db_bytes:int,wal_bytes:int,shm_bytes:int,total_disk_bytes:int,logical_bytes:int,page_count:int,page_size:int,freelist_count:int}
 */
function measureSqliteDiskUsage(PDO $db): array {
    $pageCount = (int)$db->query('PRAGMA page_count')->fetchColumn();
    $pageSize = (int)$db->query('PRAGMA page_size')->fetchColumn();
    $freelist = 0;
    try {
        $freelist = (int)$db->query('PRAGMA freelist_count')->fetchColumn();
    } catch (Throwable $e) {
        // ignore
    }

    $dbBytes = (defined('DB_PATH') && is_file(DB_PATH)) ? (int)filesize(DB_PATH) : ($pageCount * $pageSize);
    $walBytes = (defined('DB_PATH') && is_file(DB_PATH . '-wal')) ? (int)filesize(DB_PATH . '-wal') : 0;
    $shmBytes = (defined('DB_PATH') && is_file(DB_PATH . '-shm')) ? (int)filesize(DB_PATH . '-shm') : 0;

    // Prefer real file size for main DB when available
    clearstatcache(true, DB_PATH);
    if (defined('DB_PATH') && is_file(DB_PATH)) {
        $dbBytes = (int)filesize(DB_PATH);
    }
    if (defined('DB_PATH') && is_file(DB_PATH . '-wal')) {
        clearstatcache(true, DB_PATH . '-wal');
        $walBytes = (int)filesize(DB_PATH . '-wal');
    } else {
        $walBytes = 0;
    }
    if (defined('DB_PATH') && is_file(DB_PATH . '-shm')) {
        clearstatcache(true, DB_PATH . '-shm');
        $shmBytes = (int)filesize(DB_PATH . '-shm');
    } else {
        $shmBytes = 0;
    }

    return [
        'db_bytes' => $dbBytes,
        'wal_bytes' => $walBytes,
        'shm_bytes' => $shmBytes,
        'total_disk_bytes' => $dbBytes + $walBytes + $shmBytes,
        'logical_bytes' => $pageCount * $pageSize,
        'page_count' => $pageCount,
        'page_size' => $pageSize,
        'freelist_count' => $freelist,
    ];
}

try {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Not authenticated']);
        exit;
    }

    $db = getDB();
    $stmt = $db->prepare('SELECT is_admin FROM users WHERE id = ?');
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    $stmt = null; // free statement before VACUUM
    if (!$user || empty($user['is_admin'])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Admin access required']);
        exit;
    }

    $before = measureSqliteDiskUsage($db);

    // VACUUM requires exclusive access; ensure no open transaction
    $db->exec('PRAGMA busy_timeout = 30000');
    // In WAL mode, checkpoint first so VACUUM can run and reclaim WAL space
    try {
        $db->exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch (PDOException $e) {
        // Ignore if not in WAL mode or checkpoint fails
    }

    $db->exec('VACUUM');

    // Refresh file stats after vacuum
    if (defined('DB_PATH')) {
        clearstatcache(true, DB_PATH);
        clearstatcache(true, DB_PATH . '-wal');
        clearstatcache(true, DB_PATH . '-shm');
    }
    $after = measureSqliteDiskUsage($db);

    $reclaimedDisk = max(0, $before['total_disk_bytes'] - $after['total_disk_bytes']);
    $reclaimedLogical = max(0, $before['logical_bytes'] - $after['logical_bytes']);
    $reclaimedFreelist = max(0, $before['freelist_count'] - $after['freelist_count']);

    $message = $reclaimedDisk > 0
        ? ('Database vacuum completed. Reclaimed ' . vacuumFormatBytes($reclaimedDisk) . ' on disk.')
        : 'Database vacuum completed. File was already compact (little or no space to reclaim).';

    echo json_encode([
        'success' => true,
        'message' => $message,
        'before' => [
            'db_bytes' => $before['db_bytes'],
            'wal_bytes' => $before['wal_bytes'],
            'shm_bytes' => $before['shm_bytes'],
            'total_disk_bytes' => $before['total_disk_bytes'],
            'logical_bytes' => $before['logical_bytes'],
            'page_count' => $before['page_count'],
            'freelist_count' => $before['freelist_count'],
            'db_human' => vacuumFormatBytes($before['db_bytes']),
            'wal_human' => vacuumFormatBytes($before['wal_bytes']),
            'total_disk_human' => vacuumFormatBytes($before['total_disk_bytes']),
            'logical_human' => vacuumFormatBytes($before['logical_bytes']),
        ],
        'after' => [
            'db_bytes' => $after['db_bytes'],
            'wal_bytes' => $after['wal_bytes'],
            'shm_bytes' => $after['shm_bytes'],
            'total_disk_bytes' => $after['total_disk_bytes'],
            'logical_bytes' => $after['logical_bytes'],
            'page_count' => $after['page_count'],
            'freelist_count' => $after['freelist_count'],
            'db_human' => vacuumFormatBytes($after['db_bytes']),
            'wal_human' => vacuumFormatBytes($after['wal_bytes']),
            'total_disk_human' => vacuumFormatBytes($after['total_disk_bytes']),
            'logical_human' => vacuumFormatBytes($after['logical_bytes']),
        ],
        'reclaimed' => [
            'disk_bytes' => $reclaimedDisk,
            'logical_bytes' => $reclaimedLogical,
            'freelist_pages' => $reclaimedFreelist,
            'disk_human' => vacuumFormatBytes($reclaimedDisk),
            'logical_human' => vacuumFormatBytes($reclaimedLogical),
            'percent' => $before['total_disk_bytes'] > 0
                ? round(($reclaimedDisk / $before['total_disk_bytes']) * 100, 1)
                : 0,
        ],
    ], JSON_UNESCAPED_UNICODE);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Vacuum failed: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Error: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
