<?php
/**
 * Vacuum Database API
 *
 * Reclaims disk space and defragments the SQLite database. Admin only.
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
    $stmt = null; // free statement before VACUUM
    if (!$user || empty($user['is_admin'])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Admin access required']);
        exit;
    }

    // VACUUM requires exclusive access; ensure no open transaction
    $db->exec('PRAGMA busy_timeout = 30000');
    // In WAL mode, checkpoint first so VACUUM can run
    try {
        $db->exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch (PDOException $e) {
        // Ignore if not in WAL mode or checkpoint fails
    }
    $db->exec('VACUUM');
    echo json_encode([
        'success' => true,
        'message' => 'Database vacuum completed successfully. Disk space has been reclaimed.'
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
