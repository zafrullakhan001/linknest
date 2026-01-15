<?php
require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

switch ($method) {
    case 'GET':
        if ($path === '' || $path === '/' ) {
            handleListTimezones();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;

    case 'POST':
        if ($path === '' || $path === '/' ) {
            handleCreateTimezone();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;

    case 'DELETE':
        if (preg_match('#^/(\d+)$#', $path, $m)) {
            handleDeleteTimezone((int)$m[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;

    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleListTimezones() {
    $user = requireAuth();
    $db = getDB();

    $stmt = $db->prepare('SELECT id, name, utc_offset_minutes, created_at FROM user_custom_timezones WHERE user_id = ? ORDER BY id DESC');
    $stmt->execute([(int)$user['id']]);
    $rows = $stmt->fetchAll();

    sendJSON(['timezones' => $rows]);
}

function handleCreateTimezone() {
    $user = requireAuth();
    $data = getJSONInput();

    $name = isset($data['name']) ? trim((string)$data['name']) : '';
    $offset = $data['utc_offset_minutes'] ?? $data['utcOffsetMinutes'] ?? null;

    if ($name === '') {
        sendJSON(['error' => 'Name is required'], 400);
    }
    if (mb_strlen($name) > 64) {
        sendJSON(['error' => 'Name is too long (max 64 chars)'], 400);
    }
    if (!is_numeric($offset)) {
        sendJSON(['error' => 'utc_offset_minutes is required'], 400);
    }

    $offsetMinutes = (int)$offset;
    // Common real-world range: UTC-12:00 to UTC+14:00
    if ($offsetMinutes < -720 || $offsetMinutes > 840) {
        sendJSON(['error' => 'utc_offset_minutes out of range (-720..840)'], 400);
    }

    $db = getDB();
    $stmt = $db->prepare('INSERT INTO user_custom_timezones (user_id, name, utc_offset_minutes, created_at) VALUES (?, ?, ?, ?)');
    $createdAt = time();
    $stmt->execute([(int)$user['id'], $name, $offsetMinutes, $createdAt]);

    $id = (int)$db->lastInsertId();
    sendJSON([
        'timezone' => [
            'id' => $id,
            'name' => $name,
            'utc_offset_minutes' => $offsetMinutes,
            'created_at' => $createdAt
        ]
    ], 201);
}

function handleDeleteTimezone($timezoneId) {
    $user = requireAuth();
    $db = getDB();

    $stmt = $db->prepare('DELETE FROM user_custom_timezones WHERE id = ? AND user_id = ?');
    $stmt->execute([(int)$timezoneId, (int)$user['id']]);

    if ($stmt->rowCount() === 0) {
        sendJSON(['error' => 'Timezone not found'], 404);
    }

    sendJSON(['success' => true]);
}

