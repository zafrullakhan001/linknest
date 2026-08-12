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

function normalizeProtocol($raw): string {
    return strtolower(trim((string)$raw)) === 'rdp' ? 'rdp' : 'ssh';
}

function validateWsUrl(string $url, string $protocol = 'ssh'): ?string {
    $trimmed = trim($url);
    $protocol = normalizeProtocol($protocol);

    // RDP: embeddable Guacamole / web RDP page (http/https). Keep as-is — do not coerce to ws://.
    if ($protocol === 'rdp') {
        if ($trimmed === '' || mb_strlen($trimmed) > 2048) {
            return null;
        }
        if (preg_match('#^https?://#i', $trimmed)) {
            return $trimmed;
        }
        // Optional: some deployments expose a Guacamole tunnel as ws(s)
        if (preg_match('#^wss?://#i', $trimmed)) {
            return $trimmed;
        }
        return null;
    }

    // auto://user@host:port — LinkNest local ttyd launcher target (not a WebSocket URL)
    // Username is percent-encoded so PAM characters (\ + @ /) round-trip safely.
    // ssh://user@host:port — accepted and normalized to auto:// for storage.
    if (preg_match('#^ssh://#i', $trimmed)) {
        if (mb_strlen($trimmed) > 1024) {
            return null;
        }
        $without = preg_replace('#^ssh://#i', '', $trimmed);
        $at = strrpos($without, '@');
        if ($at === false || $at < 1) {
            return null;
        }
        $userRaw = substr($without, 0, $at);
        $hostPort = substr($without, $at + 1);
        if (!preg_match('#^([A-Za-z0-9.-]+|\\[[0-9a-fA-F:]+\\])(?::(\\d{1,5}))?$#', $hostPort, $hm)) {
            return null;
        }
        $host = $hm[1];
        if ($host !== '' && $host[0] === '[') {
            $host = trim($host, '[]');
        }
        $port = isset($hm[2]) ? (int)$hm[2] : 22;
        if ($port < 1 || $port > 65535 || $host === '') {
            return null;
        }
        $decodedUser = rawurldecode($userRaw);
        if ($decodedUser === '' || mb_strlen($decodedUser) > 256) {
            return null;
        }
        if (preg_match('/[\x00-\x1F\x7F;|&$`<>(){}\[\]"\'\s]/u', $decodedUser)) {
            return null;
        }
        if (!preg_match('/^[A-Za-z0-9._\-\\\\+@\/%=:,]+$/u', $decodedUser)) {
            return null;
        }
        return 'auto://' . rawurlencode($decodedUser) . '@' . $host . ':' . $port;
    }
    if (preg_match('#^auto://#i', $trimmed)) {
        if (mb_strlen($trimmed) > 1024) {
            return null;
        }
        if (!preg_match('#^auto://([^@]+)@([A-Za-z0-9.-]+):(\d{1,5})$#', $trimmed, $m)) {
            return null;
        }
        $decodedUser = rawurldecode($m[1]);
        if ($decodedUser === '' || mb_strlen($decodedUser) > 256) {
            return null;
        }
        if (preg_match('/[\x00-\x1F\x7F;|&$`<>(){}\[\]"\'\s]/u', $decodedUser)) {
            return null;
        }
        if (!preg_match('/^[A-Za-z0-9._\-\\\\+@\/%=:,]+$/u', $decodedUser)) {
            return null;
        }
        $port = (int)$m[3];
        if ($port < 1 || $port > 65535) {
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

function normalizeSshColor($raw): string {
    $c = strtolower(trim((string)$raw));
    if (preg_match('/^#[0-9a-f]{6}$/', $c)) {
        return $c;
    }
    return '#0ea5e9';
}

function normalizeSshAppearance($raw): ?array {
    if ($raw === null || $raw === '') {
        return null;
    }
    $obj = $raw;
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            return null;
        }
        $obj = $decoded;
    }
    if (!is_array($obj)) {
        return null;
    }

    $out = [];
    if (isset($obj['themePresetId']) && is_string($obj['themePresetId'])) {
        $preset = trim($obj['themePresetId']);
        if ($preset !== '' && mb_strlen($preset) <= 64) {
            $out['themePresetId'] = $preset;
        }
    }
    if (isset($obj['fontSize']) && is_numeric($obj['fontSize'])) {
        $size = (int)$obj['fontSize'];
        if ($size >= 11 && $size <= 24) {
            $out['fontSize'] = $size;
        }
    }
    if (isset($obj['fontFamily']) && is_string($obj['fontFamily'])) {
        $family = trim($obj['fontFamily']);
        if ($family !== '' && mb_strlen($family) <= 256) {
            $out['fontFamily'] = $family;
        }
    }
    foreach (['bgColor', 'fgColor', 'cursorColor', 'selectionBg'] as $key) {
        if (!isset($obj[$key])) {
            continue;
        }
        $hex = strtolower(trim((string)$obj[$key]));
        if (preg_match('/^#[0-9a-f]{6}$/', $hex)) {
            $out[$key] = $hex;
        }
    }
    if (isset($obj['ansi']) && is_array($obj['ansi'])) {
        $ansi = [];
        foreach ($obj['ansi'] as $k => $v) {
            if (!is_string($k) || mb_strlen($k) > 32) {
                continue;
            }
            $hex = strtolower(trim((string)$v));
            if (preg_match('/^#[0-9a-f]{6}$/', $hex)) {
                $ansi[$k] = $hex;
            }
        }
        if (!empty($ansi)) {
            $out['ansi'] = $ansi;
        }
    }

    return empty($out) ? null : $out;
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
    $appearance = normalizeSshAppearance($row['appearance'] ?? null);
    return [
        'id' => (string)$row['id'],
        'name' => (string)$row['name'],
        'wsUrl' => (string)$row['ws_url'],
        'protocol' => normalizeProtocol($row['protocol'] ?? 'ssh'),
        'tags' => $tags,
        'notes' => $notes !== '' ? $notes : null,
        'color' => normalizeSshColor($row['color'] ?? '#0ea5e9'),
        'appearance' => $appearance,
        'createdAt' => (int)$row['created_at'],
        'lastUsedAt' => $row['last_used_at'] !== null ? (int)$row['last_used_at'] : null,
    ];
}

function handleListSshConnections() {
    $user = requireAuth();
    $db = getDB();

    $stmt = $db->prepare('SELECT id, name, ws_url, tags, notes, color, protocol, appearance, created_at, last_used_at, updated_at FROM user_ssh_connections WHERE user_id = ? ORDER BY COALESCE(last_used_at, created_at) DESC');
    $stmt->execute([(int)$user['id']]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $connections = array_map('rowToConnection', $rows);
    sendJSON(['connections' => $connections]);
}

function handleCreateSshConnection() {
    $user = requireAuth();
    $data = getJSONInput();
    rejectSecrets($data);

    $protocol = normalizeProtocol($data['protocol'] ?? 'ssh');
    $wsUrl = validateWsUrl(
        isset($data['wsUrl']) ? (string)$data['wsUrl'] : (isset($data['ws_url']) ? (string)$data['ws_url'] : ''),
        $protocol
    );
    if ($wsUrl === null) {
        sendJSON([
            'error' => $protocol === 'rdp'
                ? 'Valid RDP gateway URL (https:// or http://) is required'
                : 'Valid WebSocket URL (ws:// or wss://) is required',
        ], 400);
    }

    $name = isset($data['name']) ? trim((string)$data['name']) : '';
    if ($name === '') {
        $hostPart = preg_replace('#^(wss?|https?)://#i', '', $wsUrl);
        $name = explode('/', $hostPart)[0] ?: ($protocol === 'rdp' ? 'RDP host' : 'SSH host');
    }
    if (mb_strlen($name) > 128) {
        sendJSON(['error' => 'Name is too long (max 128 chars)'], 400);
    }

    $tags = normalizeTags($data['tags'] ?? []);
    $notes = isset($data['notes']) ? trim((string)$data['notes']) : '';
    if (mb_strlen($notes) > 1000) {
        sendJSON(['error' => 'Notes are too long (max 1000 chars)'], 400);
    }
    $color = normalizeSshColor($data['color'] ?? '#0ea5e9');
    $appearance = array_key_exists('appearance', $data) ? normalizeSshAppearance($data['appearance']) : null;
    $appearanceJson = $appearance !== null ? json_encode($appearance, JSON_UNESCAPED_UNICODE) : null;

    $id = isset($data['id']) && is_string($data['id']) && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $data['id'])
        ? $data['id']
        : newSshConnectionId();

    $db = getDB();
    $now = time();
    $stmt = $db->prepare('INSERT INTO user_ssh_connections (id, user_id, name, ws_url, tags, notes, color, protocol, appearance, created_at, last_used_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)');
    try {
        $stmt->execute([
            $id,
            (int)$user['id'],
            $name,
            $wsUrl,
            json_encode($tags, JSON_UNESCAPED_UNICODE),
            $notes !== '' ? $notes : null,
            $color,
            $protocol,
            $appearanceJson,
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
            'protocol' => $protocol,
            'tags' => $tags,
            'notes' => $notes !== '' ? $notes : null,
            'color' => $color,
            'appearance' => $appearance,
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
    $check = $db->prepare('SELECT id, protocol, ws_url FROM user_ssh_connections WHERE id = ? AND user_id = ?');
    $check->execute([$id, (int)$user['id']]);
    $existing = $check->fetch(PDO::FETCH_ASSOC);
    if (!$existing) {
        sendJSON(['error' => 'Connection not found'], 404);
    }

    $fields = [];
    $params = [];
    $protocol = normalizeProtocol($data['protocol'] ?? ($existing['protocol'] ?? 'ssh'));

    if (isset($data['protocol'])) {
        $fields[] = 'protocol = ?';
        $params[] = $protocol;
    }

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
        $wsUrl = validateWsUrl($raw, $protocol);
        if ($wsUrl === null) {
            sendJSON([
                'error' => $protocol === 'rdp'
                    ? 'Valid RDP gateway URL (https:// or http://) is required'
                    : 'Valid WebSocket URL (ws:// or wss://) is required',
            ], 400);
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

    if (array_key_exists('color', $data)) {
        $fields[] = 'color = ?';
        $params[] = normalizeSshColor($data['color']);
    }

    if (array_key_exists('appearance', $data)) {
        $appearance = normalizeSshAppearance($data['appearance']);
        $fields[] = 'appearance = ?';
        $params[] = $appearance !== null ? json_encode($appearance, JSON_UNESCAPED_UNICODE) : null;
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

    $fetch = $db->prepare('SELECT id, name, ws_url, tags, notes, color, protocol, appearance, created_at, last_used_at, updated_at FROM user_ssh_connections WHERE id = ? AND user_id = ?');
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

    $insert = $db->prepare('INSERT INTO user_ssh_connections (id, user_id, name, ws_url, tags, notes, color, protocol, appearance, created_at, last_used_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $update = $db->prepare('UPDATE user_ssh_connections SET name = ?, tags = ?, notes = ?, color = ?, protocol = ?, appearance = COALESCE(?, appearance), last_used_at = COALESCE(?, last_used_at), updated_at = ? WHERE id = ? AND user_id = ?');

    $db->beginTransaction();
    try {
        foreach ($list as $item) {
            if (!is_array($item)) {
                continue;
            }
            rejectSecrets($item);
            $protocol = normalizeProtocol($item['protocol'] ?? 'ssh');
            $wsUrl = validateWsUrl(
                isset($item['wsUrl']) ? (string)$item['wsUrl'] : (isset($item['ws_url']) ? (string)$item['ws_url'] : ''),
                $protocol
            );
            if ($wsUrl === null) {
                continue;
            }
            $name = isset($item['name']) ? trim((string)$item['name']) : '';
            if ($name === '') {
                $hostPart = preg_replace('#^(wss?|https?)://#i', '', $wsUrl);
                $name = explode('/', $hostPart)[0] ?: ($protocol === 'rdp' ? 'RDP host' : 'SSH host');
            }
            if (mb_strlen($name) > 128) {
                $name = mb_substr($name, 0, 128);
            }
            $tags = normalizeTags($item['tags'] ?? []);
            $notes = isset($item['notes']) ? trim((string)$item['notes']) : '';
            if (mb_strlen($notes) > 1000) {
                $notes = mb_substr($notes, 0, 1000);
            }
            $color = normalizeSshColor($item['color'] ?? '#0ea5e9');
            $appearance = array_key_exists('appearance', $item) ? normalizeSshAppearance($item['appearance']) : null;
            $appearanceJson = $appearance !== null ? json_encode($appearance, JSON_UNESCAPED_UNICODE) : null;
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
                    $protocol,
                    $appearanceJson,
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
                    $color,
                    $protocol,
                    $appearanceJson,
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

    $stmt = $db->prepare('SELECT id, name, ws_url, tags, notes, color, protocol, appearance, created_at, last_used_at, updated_at FROM user_ssh_connections WHERE user_id = ? ORDER BY COALESCE(last_used_at, created_at) DESC');
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    sendJSON(['connections' => array_map('rowToConnection', $rows)]);
}
