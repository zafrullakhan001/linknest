<?php
/**
 * Enterprise SQLite Configuration Script
 *
 * Applies SQLite 3.53+ performance settings used by LinkNest:
 * - Journal Mode: WAL
 * - Synchronous: NORMAL (safe with WAL, much faster than FULL)
 * - Cache Size: 32 MB
 * - mmap_size: 256 MB (maps only what the file needs)
 * - Temp Store: MEMORY
 * - Worker threads: 4 (sort / index builds)
 * - Busy Timeout: 5000 ms
 * - Foreign Keys: DISABLED
 * - WAL Auto Checkpoint: 1000 pages
 * - journal_size_limit: 64 MB
 *
 * Usage: php configure_enterprise_sqlite.php
 * Or access via web: http://your-domain/api/configure_enterprise_sqlite.php
 */

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

try {
    $db = getDB();

    $applied = applySqlitePerformancePragmas($db);

    $dbFile = DB_PATH;
    $fileSize = file_exists($dbFile) ? filesize($dbFile) : 0;

    $verifyKeys = [
        'journal_mode',
        'synchronous',
        'cache_size',
        'mmap_size',
        'temp_store',
        'busy_timeout',
        'foreign_keys',
        'wal_autocheckpoint',
        'threads',
        'journal_size_limit',
        'page_size',
    ];

    $currentSettings = [];
    foreach ($verifyKeys as $setting) {
        try {
            $currentSettings[$setting] = $db->query("PRAGMA {$setting}")->fetchColumn();
        } catch (PDOException $e) {
            $currentSettings[$setting] = 'N/A';
        }
    }

    try {
        $currentSettings['sqlite_version'] = $db->query('SELECT sqlite_version()')->fetchColumn();
    } catch (PDOException $e) {
        $currentSettings['sqlite_version'] = 'N/A';
    }

    sendJSON([
        'success' => true,
        'message' => 'SQLite 3.53+ performance configuration applied',
        'applied' => $applied,
        'current_settings' => $currentSettings,
        'database' => [
            'file' => $dbFile,
            'size' => $fileSize,
            'size_formatted' => formatBytes($fileSize),
        ],
        'notes' => [
            'WAL + synchronous=NORMAL is the recommended high-performance durable mode',
            'mmap_size enables memory-mapped I/O (supported in SQLite 3.53.4 Windows build)',
            'cache_size=-32768 gives a 32 MB page cache',
            'PRAGMA threads uses up to 4 auxiliary worker threads for sorts/indexes',
            'page_size can only change on an empty database',
        ],
    ]);
} catch (Exception $e) {
    sendJSON([
        'success' => false,
        'error' => 'Failed to configure SQLite: ' . $e->getMessage(),
    ], 500);
}

function formatBytes($bytes, $precision = 2) {
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= (1 << (10 * $pow));
    return round($bytes, $precision) . ' ' . $units[$pow];
}
