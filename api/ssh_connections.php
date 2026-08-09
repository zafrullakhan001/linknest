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
            handleListSshConnections();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;

    case 'POST':
        if ($path === '/bulk') {
            handleBulkUpsertSshConnections();
        } elseif ($path === '' || $path === '/') {
            handleCreateSshConnection();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;

    case 'PUT':
        if (preg_match('#^/([A-Za-z0-9_-]+)$#', $path, $m)) {
            handleUpdateSshConnection($m[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;

    case 'DELETE':
        if (preg_match('#^/([A-Za-z0-9_-]+)$#', $path, $m)) {
            handleDeleteSshConnection($m[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;

    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function rejectSecrets(array $data): void {
    foreach (['password', 'passwd', 'secret', 'privateKey', 'private_key', 'authToken', 'auth_token', 'token'] as $key) {
        if (array_key_exists($key, $data) && $data[$key] !== null && $data[$key] !== '') {
            sendJSON(['error' => 'Secrets (passwords/tokens/keys) must not be stored'], 400);
        }
    }
}

function normalizeWsUrl(string $raw): string {
    $trimmed = trim($raw);
    if ($trimmed === '') {
        return '';
    }
    if (preg_match('#^wss?://#i', $trimmed)) {
        return $trimmed;
    }
    if (preg_match('#^https://#i', $trimmed)) {
        return 'wss://' . substr($trimmed, 8);
    }
    if (preg_match('#^http://#i', $trimmed)) {
        return 'ws://' . substr($trimmed, 7);
    }
    return 'ws://' . $trimmed;
}

function validateWsUrl(string $url): ?string {
    $trimmed = trim($url);
    // auto://user@host:port — LinkNest local ttyd launcher target (not a WebSocket URL)
    if (preg_match('#^auto://#i', $trimmed)) {
        if (mb_strlen($trimmed) > 512) {
            return null;
        }
        if (!preg_match('#^auto://[A-Za-z0-9._~%-]+@[A-Za-z0-9.-]+:\d{1,5}$#', $trimmed)) {
            return null;
        }
        return $trimmed;
    }
    $normalized = normalizeWsUrl($url);
    if ($normalized === '' || !preg_match('#^wss?://#i', $normalized)) {
        return null;
    }
    if (mb_strlen($normalized) > 2048) {
        return null;
    }
    return $normalized;
}

function normalizeTags($raw): array {
    $out = [];
    $seen = [];
    $parts = [];
    if (is_array($raw)) {
        $parts = $raw;
    } elseif (is_string($raw)) {
        $parts = preg_split('/[,#]+/', $raw) ?: [];
    }
    foreach ($parts as $part) {
        $tag = strtolower(trim(preg_replace('/\s+/', '-', (string)$part) ?? ''));
        if ($tag === '' || isset($seen[$tag])) {
            continue;
        }
        if (mb_strlen($tag) > 48) {
            $tag = mb_substr($tag, 0, 48);
        }
        $seen[$tag] = true;
        $out[] = $tag;
        if (count($out) >= 32) {
            break;
        }
    }
    return $out;
}

function newSshConnectionId(): string {
    try {
        return 'ssh_' . bin2hex(random_bytes(8));
    } catch (Exception $e) {
        return 'ssh_' . uniqid() . '_' . mt_rand(1000, 9999);
    }
}

function rowToConnection(array $row): array {
    $tags = [];
    if (!empty($row['tags'])) {
        $decoded = json_decode($row['tags'], true);
        if (is_array($decoded)) {
            $tags = array_values(array_map('strval', $decoded));
        }
    }
    $notes = isset($row['notes']) ? (string)$row['notes'] : '';
    return [
        'id' => (string)$row['id'],
        'name' => (string)$row['name'],
        'wsUrl' => (string)$row['ws_url'],
        'tags' => $tags,
        'notes' => $notes !== '' ? $notes : null,
        'createdAt' => (int)$row['created_at'],
        'lastUsedAt' => $row['last_used_at'] !== null ? (int)$row['last_used_at'] : null,
    ];
}

function handleListSshConnections() {
    $user = requireAuth();
    $db = getDB();

    $stmt = $db->prepare('SELECT id, name, ws_url, tags, notes, created_at, last_used_at, updated_at FROM user_ssh_connections WHERE user_id = ? ORDER BY COALESCE(last_used_at, created_at) DESC');
    $stmt->execute([(int)$user['id']]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $connections = array_map('rowToConnection', $rows);
    sendJSON(['connections' => $connections]);
}

function handleCreateSshConnection() {
    $user = requireAuth();
    $data = getJSONInput();
    rejectSecrets($data);

    $wsUrl = validateWsUrl(isset($data['wsUrl']) ? (string)$data['wsUrl'] : (isset($data['ws_url']) ? (string)$data['ws_url'] : ''));
    if ($wsUrl === null) {
        sendJSON(['error' => 'Valid WebSocket URL (ws:// or wss://) is required'], 400);
    }

    $name = isset($data['name']) ? trim((string)$data['name']) : '';
    if ($name === '') {
        $hostPart = preg_replace('#^wss?://#i', '', $wsUrl);
        $name = explode('/', $hostPart)[0] ?: 'SSH host';
    }
    if (mb_strlen($name) > 128) {
        sendJSON(['error' => 'Name is too long (max 128 chars)'], 400);
    }

    $tags = normalizeTags($data['tags'] ?? []);
    $notes = isset($data['notes']) ? trim((string)$data['notes']) : '';
    if (mb_strlen($notes) > 1000) {
        sendJSON(['error' => 'Notes are too long (max 1000 chars)'], 400);
    }

    $id = isset($data['id']) && is_string($data['id']) && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $data['id'])
        ? $data['id']
        : newSshConnectionId();

    $db = getDB();
    $now = time();
    $stmt = $db->prepare('INSERT INTO user_ssh_connections (id, user_id, name, ws_url, tags, notes, created_at, last_used_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)');
    try {
        $stmt->execute([
            $id,
            (int)$user['id'],
            $name,
            $wsUrl,
            json_encode($tags, JSON_UNESCAPED_UNICODE),
            $notes !== '' ? $notes : null,
            $now,
            $now,
        ]);
    } catch (PDOException $e) {
        if (str_contains($e->getMessage(), 'UNIQUE') || str_contains($e->getMessage(), 'PRIMARY')) {
            sendJSON(['error' => 'Connection id already exists'], 409);
        }
        throw $e;
    }

    sendJSON([
        'connection' => [
            'id' => $id,
            'name' => $name,
            'wsUrl' => $wsUrl,
            'tags' => $tags,
            'notes' => $notes !== '' ? $notes : null,
            'createdAt' => $now,
            'lastUsedAt' => null,
        ]
    ], 201);
}

function handleUpdateSshConnection(string $id) {
    $user = requireAuth();
    $data = getJSONInput();
    rejectSecrets($data);

    $db = getDB();
    $check = $db->prepare('SELECT id FROM user_ssh_connections WHERE id = ? AND user_id = ?');
    $check->execute([$id, (int)$user['id']]);
    if (!$check->fetch()) {
        sendJSON(['error' => 'Connection not found'], 404);
    }

    $fields = [];
    $params = [];

    if (isset($data['name'])) {
        $name = trim((string)$data['name']);
        if ($name === '' || mb_strlen($name) > 128) {
            sendJSON(['error' => 'Invalid name'], 400);
        }
        $fields[] = 'name = ?';
        $params[] = $name;
    }

    if (isset($data['wsUrl']) || isset($data['ws_url'])) {
        $raw = isset($data['wsUrl']) ? (string)$data['wsUrl'] : (string)$data['ws_url'];
        $wsUrl = validateWsUrl($raw);
        if ($wsUrl === null) {
            sendJSON(['error' => 'Valid WebSocket URL (ws:// or wss://) is required'], 400);
        }
        $fields[] = 'ws_url = ?';
        $params[] = $wsUrl;
    }

    if (array_key_exists('tags', $data)) {
        $tags = normalizeTags($data['tags']);
        $fields[] = 'tags = ?';
        $params[] = json_encode($tags, JSON_UNESCAPED_UNICODE);
    }

    if (array_key_exists('notes', $data)) {
        $notes = trim((string)$data['notes']);
        if (mb_strlen($notes) > 1000) {
            sendJSON(['error' => 'Notes are too long (max 1000 chars)'], 400);
        }
        $fields[] = 'notes = ?';
        $params[] = $notes !== '' ? $notes : null;
    }

    if (isset($data['lastUsedAt']) || isset($data['last_used_at'])) {
        $last = isset($data['lastUsedAt']) ? (int)$data['lastUsedAt'] : (int)$data['last_used_at'];
        $fields[] = 'last_used_at = ?';
        $params[] = $last > 0 ? $last : null;
    }

    if (empty($fields)) {
        sendJSON(['error' => 'No fields to update'], 400);
    }

    $now = time();
    $fields[] = 'updated_at = ?';
    $params[] = $now;
    $params[] = $id;
    $params[] = (int)$user['id'];

    $sql = 'UPDATE user_ssh_connections SET ' . implode(', ', $fields) . ' WHERE id = ? AND user_id = ?';
    $stmt = $db->prepare($sql);
    $stmt->execute($params);

    $fetch = $db->prepare('SELECT id, name, ws_url, tags, notes, created_at, last_used_at, updated_at FROM user_ssh_connections WHERE id = ? AND user_id = ?');
    $fetch->execute([$id, (int)$user['id']]);
    $row = $fetch->fetch(PDO::FETCH_ASSOC);
    sendJSON(['connection' => rowToConnection($row)]);
}

function handleDeleteSshConnection(string $id) {
    $user = requireAuth();
    $db = getDB();
    $stmt = $db->prepare('DELETE FROM user_ssh_connections WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, (int)$user['id']]);
    if ($stmt->rowCount() === 0) {
        sendJSON(['error' => 'Connection not found'], 404);
    }
    sendJSON(['success' => true]);
}

function handleBulkUpsertSshConnections() {
    $user = requireAuth();
    $data = getJSONInput();
    rejectSecrets($data);

    $list = isset($data['connections']) && is_array($data['connections']) ? $data['connections'] : null;
    if ($list === null) {
        sendJSON(['error' => 'connections array is required'], 400);
    }
    if (count($list) > 500) {
        sendJSON(['error' => 'Too many connections (max 500)'], 400);
    }

    $db = getDB();
    $now = time();
    $userId = (int)$user['id'];

    $existingStmt = $db->prepare('SELECT id, name, ws_url FROM user_ssh_connections WHERE user_id = ?');
    $existingStmt->execute([$userId]);
    $byUrl = [];
    while ($row = $existingStmt->fetch(PDO::FETCH_ASSOC)) {
        $byUrl[(string)$row['ws_url']] = (string)$row['id'];
    }

    $insert = $db->prepare('INSERT INTO user_ssh_connections (id, user_id, name, ws_url, tags, notes, created_at, last_used_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $update = $db->prepare('UPDATE user_ssh_connections SET name = ?, tags = ?, notes = ?, last_used_at = COALESCE(?, last_used_at), updated_at = ? WHERE id = ? AND user_id = ?');

    $db->beginTransaction();
    try {
        foreach ($list as $item) {
            if (!is_array($item)) {
                continue;
            }
            rejectSecrets($item);
            $wsUrl = validateWsUrl(isset($item['wsUrl']) ? (string)$item['wsUrl'] : (isset($item['ws_url']) ? (string)$item['ws_url'] : ''));
            if ($wsUrl === null) {
                continue;
            }
            $name = isset($item['name']) ? trim((string)$item['name']) : '';
            if ($name === '') {
                $hostPart = preg_replace('#^wss?://#i', '', $wsUrl);
                $name = explode('/', $hostPart)[0] ?: 'SSH host';
            }
            if (mb_strlen($name) > 128) {
                $name = mb_substr($name, 0, 128);
            }
            $tags = normalizeTags($item['tags'] ?? []);
            $notes = isset($item['notes']) ? trim((string)$item['notes']) : '';
            if (mb_strlen($notes) > 1000) {
                $notes = mb_substr($notes, 0, 1000);
            }
            $lastUsed = null;
            if (isset($item['lastUsedAt'])) {
                $lastUsed = (int)$item['lastUsedAt'] ?: null;
            } elseif (isset($item['last_used_at'])) {
                $lastUsed = (int)$item['last_used_at'] ?: null;
            }
            $createdAt = isset($item['createdAt']) ? (int)$item['createdAt'] : (isset($item['created_at']) ? (int)$item['created_at'] : $now);
            if ($createdAt <= 0) {
                $createdAt = $now;
            }

            if (isset($byUrl[$wsUrl])) {
                $update->execute([
                    $name,
                    json_encode($tags, JSON_UNESCAPED_UNICODE),
                    $notes !== '' ? $notes : null,
                    $lastUsed,
                    $now,
                    $byUrl[$wsUrl],
                    $userId,
                ]);
            } else {
                $id = isset($item['id']) && is_string($item['id']) && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $item['id'])
                    ? $item['id']
                    : newSshConnectionId();
                // Avoid colliding with another user's id or existing primary key
                $idCheck = $db->prepare('SELECT id FROM user_ssh_connections WHERE id = ?');
                $idCheck->execute([$id]);
                if ($idCheck->fetch()) {
                    $id = newSshConnectionId();
                }
                $insert->execute([
                    $id,
                    $userId,
                    $name,
                    $wsUrl,
                    json_encode($tags, JSON_UNESCAPED_UNICODE),
                    $notes !== '' ? $notes : null,
                    $createdAt,
                    $lastUsed,
                    $now,
                ]);
                $byUrl[$wsUrl] = $id;
            }
        }
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        error_log('SSH bulk upsert failed: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to import connections'], 500);
    }

    $stmt = $db->prepare('SELECT id, name, ws_url, tags, notes, created_at, last_used_at, updated_at FROM user_ssh_connections WHERE user_id = ? ORDER BY COALESCE(last_used_at, created_at) DESC');
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    sendJSON(['connections' => array_map('rowToConnection', $rows)]);
}
