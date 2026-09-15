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
            handleListVncConnections();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;

    case 'POST':
        if ($path === '/bulk') {
            handleBulkUpsertVncConnections();
        } elseif ($path === '' || $path === '/') {
            handleCreateVncConnection();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;

    case 'PUT':
        if (preg_match('#^/([A-Za-z0-9_-]+)$#', $path, $m)) {
            handleUpdateVncConnection($m[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;

    case 'DELETE':
        if (preg_match('#^/([A-Za-z0-9_-]+)$#', $path, $m)) {
            handleDeleteVncConnection($m[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;

    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function vncRejectSecrets(array $data): void {
    foreach (['password', 'passwd', 'secret', 'privateKey', 'private_key', 'authToken', 'auth_token', 'token'] as $key) {
        if (array_key_exists($key, $data) && $data[$key] !== null && $data[$key] !== '') {
            sendJSON(['error' => 'Secrets (passwords/tokens/keys) must not be stored'], 400);
        }
    }
}

function vncNormalizeWsUrl(string $raw): string {
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

function vncValidateWsUrl(string $url): ?string {
    $trimmed = trim($url);
    // auto-vnc://host:port — LinkNest local websockify launcher target
    if (preg_match('#^auto-vnc://#i', $trimmed)) {
        if (mb_strlen($trimmed) > 512) {
            return null;
        }
        if (!preg_match('#^auto-vnc://([A-Za-z0-9.-]+):(\d{1,5})$#i', $trimmed, $m)) {
            return null;
        }
        $port = (int)$m[2];
        if ($port < 1 || $port > 65535) {
            return null;
        }
        return 'auto-vnc://' . $m[1] . ':' . $port;
    }

    $normalized = vncNormalizeWsUrl($url);
    if ($normalized === '' || !preg_match('#^wss?://#i', $normalized)) {
        return null;
    }
    if (mb_strlen($normalized) > 2048) {
        return null;
    }
    return $normalized;
}

function vncNormalizeTags($raw): array {
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

function newVncConnectionId(): string {
    try {
        return 'vnc_' . bin2hex(random_bytes(8));
    } catch (Exception $e) {
        return 'vnc_' . uniqid() . '_' . mt_rand(1000, 9999);
    }
}

function vncNormalizeColor($raw): string {
    $c = strtolower(trim((string)$raw));
    if (preg_match('/^#[0-9a-f]{6}$/', $c)) {
        return $c;
    }
    return '#0ea5e9';
}

function vncBool($raw, bool $default = false): bool {
    if ($raw === null) {
        return $default;
    }
    if (is_bool($raw)) {
        return $raw;
    }
    if (is_int($raw) || is_float($raw)) {
        return ((int)$raw) !== 0;
    }
    $s = strtolower(trim((string)$raw));
    if ($s === '' || $s === '0' || $s === 'false' || $s === 'no' || $s === 'off') {
        return false;
    }
    if ($s === '1' || $s === 'true' || $s === 'yes' || $s === 'on') {
        return true;
    }
    return $default;
}

function vncRowToConnection(array $row): array {
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
        'color' => vncNormalizeColor($row['color'] ?? '#0ea5e9'),
        'viewOnly' => ((int)($row['view_only'] ?? 0)) === 1,
        'scaleViewport' => ((int)($row['scale_viewport'] ?? 1)) === 1,
        'createdAt' => (int)$row['created_at'],
        'lastUsedAt' => $row['last_used_at'] !== null ? (int)$row['last_used_at'] : null,
    ];
}

function handleListVncConnections() {
    $user = requireAuth();
    $db = getDB();
    $userId = (int)$user['id'];

    $stmt = $db->prepare('SELECT id, name, ws_url, tags, notes, color, view_only, scale_viewport, created_at, last_used_at, updated_at FROM user_vnc_connections WHERE user_id = ? ORDER BY COALESCE(last_used_at, created_at) DESC');
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $connections = array_map('vncRowToConnection', $rows);
    sendJSON([
        'connections' => $connections,
        'ownerUserId' => $userId,
        'ownerUsername' => (string)($user['username'] ?? ''),
    ]);
}

function handleCreateVncConnection() {
    $user = requireAuth();
    $data = getJSONInput();
    vncRejectSecrets($data);

    $wsUrl = vncValidateWsUrl(
        isset($data['wsUrl']) ? (string)$data['wsUrl'] : (isset($data['ws_url']) ? (string)$data['ws_url'] : '')
    );
    if ($wsUrl === null) {
        sendJSON(['error' => 'Valid WebSocket URL (ws:// or wss://) or auto-vnc://host:port is required'], 400);
    }

    $name = isset($data['name']) ? trim((string)$data['name']) : '';
    if ($name === '') {
        if (preg_match('#^auto-vnc://(.+)$#i', $wsUrl, $m)) {
            $name = $m[1];
        } else {
            $hostPart = preg_replace('#^wss?://#i', '', $wsUrl);
            $name = explode('/', $hostPart)[0] ?: 'VNC host';
        }
    }
    if (mb_strlen($name) > 128) {
        sendJSON(['error' => 'Name is too long (max 128 chars)'], 400);
    }

    $tags = vncNormalizeTags($data['tags'] ?? []);
    $notes = isset($data['notes']) ? trim((string)$data['notes']) : '';
    if (mb_strlen($notes) > 1000) {
        sendJSON(['error' => 'Notes are too long (max 1000 chars)'], 400);
    }
    $color = vncNormalizeColor($data['color'] ?? '#0ea5e9');
    $viewOnly = vncBool($data['viewOnly'] ?? $data['view_only'] ?? false, false);
    $scaleViewport = vncBool($data['scaleViewport'] ?? $data['scale_viewport'] ?? true, true);

    $id = isset($data['id']) && is_string($data['id']) && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $data['id'])
        ? $data['id']
        : newVncConnectionId();

    $db = getDB();
    $now = time();
    $stmt = $db->prepare('INSERT INTO user_vnc_connections (id, user_id, name, ws_url, tags, notes, color, view_only, scale_viewport, created_at, last_used_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)');
    try {
        $stmt->execute([
            $id,
            (int)$user['id'],
            $name,
            $wsUrl,
            json_encode($tags, JSON_UNESCAPED_UNICODE),
            $notes !== '' ? $notes : null,
            $color,
            $viewOnly ? 1 : 0,
            $scaleViewport ? 1 : 0,
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
            'color' => $color,
            'viewOnly' => $viewOnly,
            'scaleViewport' => $scaleViewport,
            'createdAt' => $now,
            'lastUsedAt' => null,
        ]
    ], 201);
}

function handleUpdateVncConnection(string $id) {
    $user = requireAuth();
    $data = getJSONInput();
    vncRejectSecrets($data);

    $db = getDB();
    $check = $db->prepare('SELECT id FROM user_vnc_connections WHERE id = ? AND user_id = ?');
    $check->execute([$id, (int)$user['id']]);
    if (!$check->fetch(PDO::FETCH_ASSOC)) {
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
        $wsUrl = vncValidateWsUrl($raw);
        if ($wsUrl === null) {
            sendJSON(['error' => 'Valid WebSocket URL (ws:// or wss://) or auto-vnc://host:port is required'], 400);
        }
        $fields[] = 'ws_url = ?';
        $params[] = $wsUrl;
    }

    if (array_key_exists('tags', $data)) {
        $tags = vncNormalizeTags($data['tags']);
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

    if (array_key_exists('color', $data)) {
        $fields[] = 'color = ?';
        $params[] = vncNormalizeColor($data['color']);
    }

    if (array_key_exists('viewOnly', $data) || array_key_exists('view_only', $data)) {
        $fields[] = 'view_only = ?';
        $params[] = vncBool($data['viewOnly'] ?? $data['view_only'], false) ? 1 : 0;
    }

    if (array_key_exists('scaleViewport', $data) || array_key_exists('scale_viewport', $data)) {
        $fields[] = 'scale_viewport = ?';
        $params[] = vncBool($data['scaleViewport'] ?? $data['scale_viewport'], true) ? 1 : 0;
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

    $sql = 'UPDATE user_vnc_connections SET ' . implode(', ', $fields) . ' WHERE id = ? AND user_id = ?';
    $stmt = $db->prepare($sql);
    $stmt->execute($params);

    $fetch = $db->prepare('SELECT id, name, ws_url, tags, notes, color, view_only, scale_viewport, created_at, last_used_at, updated_at FROM user_vnc_connections WHERE id = ? AND user_id = ?');
    $fetch->execute([$id, (int)$user['id']]);
    $row = $fetch->fetch(PDO::FETCH_ASSOC);
    sendJSON(['connection' => vncRowToConnection($row)]);
}

function handleDeleteVncConnection(string $id) {
    $user = requireAuth();
    $db = getDB();
    $stmt = $db->prepare('DELETE FROM user_vnc_connections WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, (int)$user['id']]);
    if ($stmt->rowCount() === 0) {
        sendJSON(['error' => 'Connection not found'], 404);
    }
    sendJSON(['success' => true]);
}

function handleBulkUpsertVncConnections() {
    $user = requireAuth();
    $data = getJSONInput();
    vncRejectSecrets($data);

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

    $existingStmt = $db->prepare('SELECT id, name, ws_url FROM user_vnc_connections WHERE user_id = ?');
    $existingStmt->execute([$userId]);
    $byUrl = [];
    while ($row = $existingStmt->fetch(PDO::FETCH_ASSOC)) {
        $byUrl[(string)$row['ws_url']] = (string)$row['id'];
    }

    $insert = $db->prepare('INSERT INTO user_vnc_connections (id, user_id, name, ws_url, tags, notes, color, view_only, scale_viewport, created_at, last_used_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $update = $db->prepare('UPDATE user_vnc_connections SET name = ?, tags = ?, notes = ?, color = ?, view_only = ?, scale_viewport = ?, last_used_at = COALESCE(?, last_used_at), updated_at = ? WHERE id = ? AND user_id = ?');

    $db->beginTransaction();
    try {
        foreach ($list as $item) {
            if (!is_array($item)) {
                continue;
            }
            vncRejectSecrets($item);
            $wsUrl = vncValidateWsUrl(
                isset($item['wsUrl']) ? (string)$item['wsUrl'] : (isset($item['ws_url']) ? (string)$item['ws_url'] : '')
            );
            if ($wsUrl === null) {
                continue;
            }
            $name = isset($item['name']) ? trim((string)$item['name']) : '';
            if ($name === '') {
                $hostPart = preg_replace('#^wss?://#i', '', $wsUrl);
                $name = explode('/', $hostPart)[0] ?: 'VNC host';
            }
            if (mb_strlen($name) > 128) {
                $name = mb_substr($name, 0, 128);
            }
            $tags = vncNormalizeTags($item['tags'] ?? []);
            $notes = isset($item['notes']) ? trim((string)$item['notes']) : '';
            if (mb_strlen($notes) > 1000) {
                $notes = mb_substr($notes, 0, 1000);
            }
            $color = vncNormalizeColor($item['color'] ?? '#0ea5e9');
            $viewOnly = vncBool($item['viewOnly'] ?? $item['view_only'] ?? false, false);
            $scaleViewport = vncBool($item['scaleViewport'] ?? $item['scale_viewport'] ?? true, true);
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
                    $color,
                    $viewOnly ? 1 : 0,
                    $scaleViewport ? 1 : 0,
                    $lastUsed,
                    $now,
                    $byUrl[$wsUrl],
                    $userId,
                ]);
            } else {
                $id = isset($item['id']) && is_string($item['id']) && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $item['id'])
                    ? $item['id']
                    : newVncConnectionId();
                $idCheck = $db->prepare('SELECT id FROM user_vnc_connections WHERE id = ?');
                $idCheck->execute([$id]);
                if ($idCheck->fetch()) {
                    $id = newVncConnectionId();
                }
                $insert->execute([
                    $id,
                    $userId,
                    $name,
                    $wsUrl,
                    json_encode($tags, JSON_UNESCAPED_UNICODE),
                    $notes !== '' ? $notes : null,
                    $color,
                    $viewOnly ? 1 : 0,
                    $scaleViewport ? 1 : 0,
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
        error_log('VNC bulk upsert failed: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to import connections'], 500);
    }

    $stmt = $db->prepare('SELECT id, name, ws_url, tags, notes, color, view_only, scale_viewport, created_at, last_used_at, updated_at FROM user_vnc_connections WHERE user_id = ? ORDER BY COALESCE(last_used_at, created_at) DESC');
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    sendJSON(['connections' => array_map('vncRowToConnection', $rows)]);
}
