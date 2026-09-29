<?php
/**
 * Database Health Report API
 * Returns integrity check, table row counts, DB size, and health status. Admin only.
 */

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

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
    if (!$user || empty($user['is_admin'])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Admin access required']);
        exit;
    }

    // PRAGMA integrity_check - returns "ok" if good, or list of errors
    $integrity = $db->query('PRAGMA integrity_check')->fetchAll(PDO::FETCH_COLUMN);
    $integrityOk = (count($integrity) === 1 && strtolower($integrity[0]) === 'ok');

    // Size and mode
    $pageCount = (int) $db->query('PRAGMA page_count')->fetchColumn();
    $pageSize = (int) $db->query('PRAGMA page_size')->fetchColumn();
    $sizeBytes = $pageCount * $pageSize;
    $sizeKb = round($sizeBytes / 1024, 1);
    $journalMode = $db->query('PRAGMA journal_mode')->fetchColumn();

    // Table row counts (main app tables)
    $tables = ['users', 'tiles', 'tabs', 'sections', 'links', 'tile_arrangements', 'category_arrangements', 'user_tile_permissions', 'settings', 'user_preferences', 'category_visibility_presets'];
    $tableCounts = [];
    foreach ($tables as $table) {
        try {
            $count = $db->query("SELECT COUNT(*) FROM {$table}")->fetchColumn();
            $tableCounts[$table] = (int) $count;
        } catch (PDOException $e) {
            $tableCounts[$table] = null; // table may not exist
        }
    }

    // Optional: quick_check for faster check (SQLite 3.8.8+)
    $quickCheck = 'unknown';
    try {
        $qc = $db->query('PRAGMA quick_check')->fetchColumn();
        $quickCheck = (strtolower((string)$qc) === 'ok') ? 'ok' : (string)$qc;
    } catch (Throwable $e) {
        $quickCheck = 'unavailable';
    }

    $healthStatus = $integrityOk ? 'good' : 'attention';
    $suggestions = [];
    if (!$integrityOk) {
        $suggestions[] = 'Run a backup, then try "Optimize Database" and "Vacuum Database". If errors persist, restore from backup.';
    }
    if ($sizeKb > 50 * 1024) {
        $suggestions[] = 'Database is large (' . round($sizeKb / 1024, 1) . ' MB). Consider running Vacuum after bulk deletions.';
    }

    echo json_encode([
        'success' => true,
        'integrity_ok' => $integrityOk,
        'integrity_result' => $integrity,
        'quick_check' => $quickCheck,
        'health_status' => $healthStatus,
        'size_kb' => $sizeKb,
        'size_bytes' => $sizeBytes,
        'page_count' => $pageCount,
        'page_size' => $pageSize,
        'journal_mode' => $journalMode,
        'table_counts' => $tableCounts,
        'suggestions' => $suggestions,
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Health check failed: ' . $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}
