<?php
require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE) {
    try {
        @session_start();
    } catch (Throwable $e) {
        error_log('Broadcast session start failed: ' . $e->getMessage());
    }
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

$path = rtrim($path, '/');
if (empty($path)) {
    $path = '/';
}

try {
    $db = getDB();
} catch (Throwable $e) {
    error_log('Broadcast getDB failed: ' . $e->getMessage());
    sendJSON(['error' => 'Failed to connect to database'], 500);
    exit;
}

switch ($method) {
    case 'GET':
        if ($path === '' || $path === '/') {
            handleGetBroadcast($db);
        } elseif ($path === '/history') {
            handleGetBroadcastHistory($db);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;

    case 'POST':
        if ($path === '' || $path === '/') {
            handleCreateBroadcast($db);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;

    case 'PUT':
        if ($path === '' || $path === '/') {
            handleUpdateBroadcast($db);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;

    case 'DELETE':
        if ($path === '' || $path === '/') {
            handleDeleteBroadcast($db);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;

    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function resolveBroadcastThreadId($db, $data) {
    if (!empty($data['threadId'])) {
        return (int)$data['threadId'];
    }
    if (!empty($data['id'])) {
        $stmt = $db->prepare('SELECT thread_id FROM broadcast_revisions WHERE id = ?');
        $stmt->execute([(int)$data['id']]);
        $tid = $stmt->fetchColumn();
        return $tid ? (int)$tid : 0;
    }
    return 0;
}

function revisionRowToJson($row, $threadCreatedAt, $threadUpdatedAt, $revisionCount) {
    return [
        'id' => (int)$row['id'],
        'threadId' => (int)$row['thread_id'],
        'message' => (string)($row['message'] ?? ''),
        'fontFamily' => (string)($row['font_family'] ?? 'Arial, sans-serif'),
        'fontSize' => (string)($row['font_size'] ?? '16px'),
        'color' => (string)($row['color'] ?? '#ff0000'),
        'scrollSpeed' => isset($row['scroll_speed']) ? (int)$row['scroll_speed'] : 30,
        'expiresAt' => !empty($row['expires_at']) ? (int)$row['expires_at'] : null,
        'createdAt' => (int)$threadCreatedAt,
        'updatedAt' => (int)$threadUpdatedAt,
        'revisionCount' => (int)$revisionCount,
        'latestRevisionAt' => (int)($row['created_at'] ?? 0),
    ];
}

function handleGetBroadcast($db) {
    try {
        $now = time();
        $sql = 'SELECT r.id, r.thread_id, r.message, r.font_family, r.font_size, r.color, r.scroll_speed, r.expires_at, r.created_at,
                t.created_at AS thread_created_at, t.updated_at AS thread_updated_at,
                (SELECT COUNT(*) FROM broadcast_revisions cr WHERE cr.thread_id = t.id) AS revision_count
            FROM broadcast_threads t
            INNER JOIN broadcast_revisions r ON r.thread_id = t.id
            WHERE t.is_active = 1 AND t.deleted_at IS NULL
            AND r.id = (SELECT MAX(r2.id) FROM broadcast_revisions r2 WHERE r2.thread_id = t.id)
            AND (r.expires_at IS NULL OR r.expires_at > ?)
            LIMIT 1';
        $stmt = $db->prepare($sql);
        $stmt->execute([$now]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($row) {
            sendJSON(revisionRowToJson(
                $row,
                (int)$row['thread_created_at'],
                (int)$row['thread_updated_at'],
                (int)$row['revision_count']
            ));
        } else {
            sendJSON(null);
        }
    } catch (PDOException $e) {
        error_log('Broadcast fetch PDO: ' . $e->getMessage());
        sendJSON(null);
    } catch (Throwable $e) {
        error_log('Broadcast fetch: ' . $e->getMessage());
        sendJSON(null);
    }
}

function handleGetBroadcastHistory($db) {
    try {
        $threadLimit = 100;
        $stmt = $db->prepare(
            'SELECT id, created_at, updated_at, is_active FROM broadcast_threads WHERE deleted_at IS NULL ORDER BY updated_at DESC, id DESC LIMIT ' . (int)$threadLimit
        );
        $stmt->execute();
        $threads = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $out = [];
        foreach ($threads as $t) {
            $tid = (int)$t['id'];
            $revStmt = $db->prepare(
                'SELECT id, thread_id, message, font_family, font_size, color, scroll_speed, expires_at, created_at FROM broadcast_revisions WHERE thread_id = ? ORDER BY created_at DESC, id DESC'
            );
            $revStmt->execute([$tid]);
            $revs = $revStmt->fetchAll(PDO::FETCH_ASSOC);
            $revOut = [];
            foreach ($revs as $r) {
                $revOut[] = [
                    'id' => (int)$r['id'],
                    'threadId' => (int)$r['thread_id'],
                    'message' => (string)($r['message'] ?? ''),
                    'fontFamily' => (string)($r['font_family'] ?? 'Arial, sans-serif'),
                    'fontSize' => (string)($r['font_size'] ?? '16px'),
                    'color' => (string)($r['color'] ?? '#ff0000'),
                    'scrollSpeed' => isset($r['scroll_speed']) ? (int)$r['scroll_speed'] : 30,
                    'expiresAt' => !empty($r['expires_at']) ? (int)$r['expires_at'] : null,
                    'createdAt' => (int)($r['created_at'] ?? 0),
                ];
            }
            $out[] = [
                'threadId' => $tid,
                'createdAt' => (int)($t['created_at'] ?? 0),
                'updatedAt' => (int)($t['updated_at'] ?? 0),
                'isActive' => ((int)($t['is_active'] ?? 0)) === 1,
                'revisions' => $revOut,
            ];
        }
        sendJSON(['threads' => $out]);
    } catch (PDOException $e) {
        error_log('Broadcast history PDO: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to load broadcast history'], 500);
    } catch (Throwable $e) {
        error_log('Broadcast history: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to load broadcast history'], 500);
    }
}

function handleCreateBroadcast($db) {
    requireAdmin();

    $data = getJSONInput();
    $message = $data['message'] ?? '';
    $fontFamily = $data['fontFamily'] ?? 'Arial, sans-serif';
    $fontSize = $data['fontSize'] ?? '16px';
    $color = $data['color'] ?? '#ff0000';
    $scrollSpeed = isset($data['scrollSpeed']) ? (int)$data['scrollSpeed'] : 30;
    $expiresAt = isset($data['expiresAt']) && $data['expiresAt'] ? (int)$data['expiresAt'] : null;

    if (empty($message)) {
        sendJSON(['error' => 'Message cannot be empty'], 400);
    }

    $userId = $_SESSION['user_id'] ?? null;
    $now = time();

    try {
        $db->beginTransaction();
        $db->exec('UPDATE broadcast_threads SET is_active = 0');
        $stmt = $db->prepare('INSERT INTO broadcast_threads (created_at, updated_at, deleted_at, is_active) VALUES (?, ?, NULL, 1)');
        $stmt->execute([$now, $now]);
        $threadId = (int)$db->lastInsertId();

        $stmt = $db->prepare('INSERT INTO broadcast_revisions (thread_id, message, font_family, font_size, color, scroll_speed, expires_at, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?)');
        $stmt->execute([$threadId, $message, $fontFamily, $fontSize, $color, $scrollSpeed, $expiresAt, $now, $userId]);
        $revisionId = (int)$db->lastInsertId();

        $db->commit();

        sendJSON([
            'success' => true,
            'id' => $revisionId,
            'threadId' => $threadId,
            'message' => 'Broadcast message created successfully',
        ]);
    } catch (PDOException $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        sendJSON(['error' => 'Failed to create broadcast message: ' . $e->getMessage()], 500);
    }
}

function handleUpdateBroadcast($db) {
    requireAdmin();

    $data = getJSONInput();
    $threadId = resolveBroadcastThreadId($db, $data);

    if (!$threadId) {
        sendJSON(['error' => 'Thread ID or revision ID is required'], 400);
    }

    $stmt = $db->prepare('SELECT id FROM broadcast_threads WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$threadId]);
    if (!$stmt->fetch()) {
        sendJSON(['error' => 'Broadcast thread not found'], 404);
    }

    $message = $data['message'] ?? null;
    $fontFamily = $data['fontFamily'] ?? null;
    $fontSize = $data['fontSize'] ?? null;
    $color = $data['color'] ?? null;
    $scrollSpeed = isset($data['scrollSpeed']) ? (int)$data['scrollSpeed'] : null;
    $expiresAt = array_key_exists('expiresAt', $data) ? ($data['expiresAt'] ? (int)$data['expiresAt'] : null) : null;

    if ($message !== null && $message === '') {
        sendJSON(['error' => 'Message cannot be empty'], 400);
    }

    $userId = $_SESSION['user_id'] ?? null;
    $now = time();

    try {
        $stmt = $db->prepare('SELECT message, font_family, font_size, color, scroll_speed, expires_at FROM broadcast_revisions WHERE thread_id = ? ORDER BY created_at DESC, id DESC LIMIT 1');
        $stmt->execute([$threadId]);
        $prev = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$prev) {
            sendJSON(['error' => 'No revisions in thread'], 404);
        }

        $newMessage = $message !== null ? $message : (string)$prev['message'];
        $newFontFamily = $fontFamily !== null ? $fontFamily : (string)($prev['font_family'] ?? 'Arial, sans-serif');
        $newFontSize = $fontSize !== null ? $fontSize : (string)($prev['font_size'] ?? '16px');
        $newColor = $color !== null ? $color : (string)($prev['color'] ?? '#ff0000');
        $newScroll = $scrollSpeed !== null ? $scrollSpeed : (int)($prev['scroll_speed'] ?? 30);
        $newExpires = array_key_exists('expiresAt', $data) ? $expiresAt : (!empty($prev['expires_at']) ? (int)$prev['expires_at'] : null);

        $db->beginTransaction();
        $stmt = $db->prepare('INSERT INTO broadcast_revisions (thread_id, message, font_family, font_size, color, scroll_speed, expires_at, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?)');
        $stmt->execute([$threadId, $newMessage, $newFontFamily, $newFontSize, $newColor, $newScroll, $newExpires, $now, $userId]);
        $revisionId = (int)$db->lastInsertId();

        $stmt = $db->prepare('UPDATE broadcast_threads SET updated_at = ? WHERE id = ?');
        $stmt->execute([$now, $threadId]);

        $db->commit();

        sendJSON([
            'success' => true,
            'id' => $revisionId,
            'threadId' => $threadId,
            'message' => 'Broadcast message updated successfully',
        ]);
    } catch (PDOException $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        sendJSON(['error' => 'Failed to update broadcast message: ' . $e->getMessage()], 500);
    }
}

function handleDeleteBroadcast($db) {
    requireAdmin();

    $data = getJSONInput();
    $threadId = resolveBroadcastThreadId($db, $data);

    if (!$threadId) {
        sendJSON(['error' => 'Thread ID or revision ID is required'], 400);
    }

    try {
        $stmt = $db->prepare('SELECT id FROM broadcast_threads WHERE id = ? AND deleted_at IS NULL');
        $stmt->execute([$threadId]);
        if (!$stmt->fetch()) {
            sendJSON(['error' => 'Broadcast thread not found'], 404);
        }

        $now = time();
        $stmt = $db->prepare('UPDATE broadcast_threads SET deleted_at = ?, is_active = 0, updated_at = ? WHERE id = ?');
        $stmt->execute([$now, $now, $threadId]);

        sendJSON(['success' => true, 'message' => 'Broadcast thread deleted successfully']);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to delete broadcast thread: ' . $e->getMessage()], 500);
    }
}
