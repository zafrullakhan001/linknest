<?php
require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

switch ($method) {
    case 'GET':
        if ($path === '' || $path === '/') {
            handleListAlarms();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;

    case 'POST':
        if ($path === '' || $path === '/') {
            handleCreateAlarm();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;

    case 'PUT':
        if (preg_match('#^/(\d+)$#', $path, $m)) {
            handleUpdateAlarm((int)$m[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;

    case 'DELETE':
        if (preg_match('#^/(\d+)$#', $path, $m)) {
            handleDeleteAlarm((int)$m[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;

    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleListAlarms() {
    $user = requireAuth();
    $db = getDB();

    $stmt = $db->prepare('SELECT id, time, label, enabled, created_at, updated_at FROM user_alarms WHERE user_id = ? ORDER BY id DESC');
    $stmt->execute([(int)$user['id']]);
    $rows = $stmt->fetchAll();

    // Normalize enabled to boolean-like int
    foreach ($rows as &$r) {
        $r['enabled'] = (int)$r['enabled'];
    }

    sendJSON(['alarms' => $rows]);
}

function handleCreateAlarm() {
    $user = requireAuth();
    $data = getJSONInput();

    $time = isset($data['time']) ? trim((string)$data['time']) : '';
    $label = isset($data['label']) ? trim((string)$data['label']) : 'Alarm';
    $enabled = isset($data['enabled']) ? (int)(!!$data['enabled']) : 1;

    if (!preg_match('/^\d{2}:\d{2}$/', $time)) {
        sendJSON(['error' => 'Invalid time format (expected HH:MM)'], 400);
    }
    $hh = (int)substr($time, 0, 2);
    $mm = (int)substr($time, 3, 2);
    if ($hh < 0 || $hh > 23 || $mm < 0 || $mm > 59) {
        sendJSON(['error' => 'Invalid time value'], 400);
    }

    if ($label === '') {
        $label = 'Alarm';
    }
    if (mb_strlen($label) > 64) {
        sendJSON(['error' => 'Label is too long (max 64 chars)'], 400);
    }

    $db = getDB();
    $now = time();
    $stmt = $db->prepare('INSERT INTO user_alarms (user_id, time, label, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    $stmt->execute([(int)$user['id'], $time, $label, $enabled, $now, $now]);

    $id = (int)$db->lastInsertId();
    sendJSON([
        'alarm' => [
            'id' => $id,
            'time' => $time,
            'label' => $label,
            'enabled' => $enabled,
            'created_at' => $now,
            'updated_at' => $now
        ]
    ], 201);
}

function handleUpdateAlarm($alarmId) {
    $user = requireAuth();
    $data = getJSONInput();

    $fields = [];
    $params = [];

    if (isset($data['time'])) {
        $time = trim((string)$data['time']);
        if (!preg_match('/^\d{2}:\d{2}$/', $time)) {
            sendJSON(['error' => 'Invalid time format (expected HH:MM)'], 400);
        }
        $hh = (int)substr($time, 0, 2);
        $mm = (int)substr($time, 3, 2);
        if ($hh < 0 || $hh > 23 || $mm < 0 || $mm > 59) {
            sendJSON(['error' => 'Invalid time value'], 400);
        }
        $fields[] = 'time = ?';
        $params[] = $time;
    }

    if (isset($data['label'])) {
        $label = trim((string)$data['label']);
        if ($label === '') $label = 'Alarm';
        if (mb_strlen($label) > 64) {
            sendJSON(['error' => 'Label is too long (max 64 chars)'], 400);
        }
        $fields[] = 'label = ?';
        $params[] = $label;
    }

    if (isset($data['enabled'])) {
        $enabled = (int)(!!$data['enabled']);
        $fields[] = 'enabled = ?';
        $params[] = $enabled;
    }

    if (count($fields) === 0) {
        sendJSON(['error' => 'No fields to update'], 400);
    }

    $fields[] = 'updated_at = ?';
    $params[] = time();

    $db = getDB();
    $sql = 'UPDATE user_alarms SET ' . implode(', ', $fields) . ' WHERE id = ? AND user_id = ?';
    $params[] = (int)$alarmId;
    $params[] = (int)$user['id'];

    $stmt = $db->prepare($sql);
    $stmt->execute($params);

    if ($stmt->rowCount() === 0) {
        sendJSON(['error' => 'Alarm not found'], 404);
    }

    // Return updated row
    $stmt2 = $db->prepare('SELECT id, time, label, enabled, created_at, updated_at FROM user_alarms WHERE id = ? AND user_id = ?');
    $stmt2->execute([(int)$alarmId, (int)$user['id']]);
    $row = $stmt2->fetch();
    if (!$row) {
        sendJSON(['error' => 'Alarm not found'], 404);
    }
    $row['enabled'] = (int)$row['enabled'];
    sendJSON(['alarm' => $row]);
}

function handleDeleteAlarm($alarmId) {
    $user = requireAuth();
    $db = getDB();

    $stmt = $db->prepare('DELETE FROM user_alarms WHERE id = ? AND user_id = ?');
    $stmt->execute([(int)$alarmId, (int)$user['id']]);

    if ($stmt->rowCount() === 0) {
        sendJSON(['error' => 'Alarm not found'], 404);
    }

    sendJSON(['success' => true]);
}

