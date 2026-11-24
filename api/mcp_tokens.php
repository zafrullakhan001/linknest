<?php
/**
 * Admin API for LinkNest MCP personal access tokens.
 * Routes: GET|POST /api/mcp-tokens  DELETE /api/mcp-tokens/{id}
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/user_audit_helper.php';

if (session_status() === PHP_SESSION_NONE) {
    @session_start();
}

$admin = requireAdmin();
$db = getDB();
ensureMcpTokensTable($db);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '/';
$path = rtrim($path, '/') ?: '/';

function mcpTokensNormalizeScopes($raw): string {
    $parts = [];
    if (is_array($raw)) {
        $parts = $raw;
    } elseif (is_string($raw)) {
        $parts = explode(',', $raw);
    }
    $out = [];
    foreach ($parts as $p) {
        $p = strtolower(trim((string)$p));
        if ($p === 'read' || $p === 'write' || $p === 'admin') {
            $out[] = $p;
        }
    }
    $out = array_values(array_unique($out));
    if (!in_array('read', $out, true)) {
        array_unshift($out, 'read');
    }
    return implode(',', $out);
}

function mcpTokensMapRow(array $row): array {
    return [
        'id' => (int)$row['id'],
        'userId' => (int)$row['user_id'],
        'username' => $row['username'] ?? null,
        'name' => $row['name'],
        'tokenPrefix' => $row['token_prefix'],
        'scopes' => array_values(array_filter(array_map('trim', explode(',', (string)$row['scopes'])))),
        'lastUsedAt' => $row['last_used_at'] !== null ? (int)$row['last_used_at'] : null,
        'expiresAt' => $row['expires_at'] !== null ? (int)$row['expires_at'] : null,
        'createdAt' => (int)$row['created_at'],
        'revokedAt' => $row['revoked_at'] !== null ? (int)$row['revoked_at'] : null,
    ];
}

switch ($method) {
    case 'GET':
        if ($path !== '/') {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        $includeRevoked = isset($_GET['include_revoked']) && in_array(strtolower((string)$_GET['include_revoked']), ['1', 'true', 'yes'], true);
        $sql = 'SELECT t.*, u.username FROM mcp_tokens t LEFT JOIN users u ON u.id = t.user_id';
        if (!$includeRevoked) {
            $sql .= ' WHERE t.revoked_at IS NULL';
        }
        $sql .= ' ORDER BY t.created_at DESC';
        $stmt = $db->query($sql);
        $tokens = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $tokens[] = mcpTokensMapRow($row);
        }
        sendJSON(['data' => $tokens]);
        break;

    case 'POST':
        if ($path !== '/') {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        $data = getJSONInput();
        $name = trim((string)($data['name'] ?? ''));
        if ($name === '') {
            sendJSON(['error' => 'Name is required'], 400);
        }
        if (strlen($name) > 80) {
            $name = substr($name, 0, 80);
        }
        $userId = isset($data['userId']) ? (int)$data['userId'] : (int)$admin['id'];
        if ($userId < 1) {
            $userId = (int)$admin['id'];
        }
        $userStmt = $db->prepare('SELECT id, username, is_admin, is_approved, COALESCE(is_disabled, 0) AS is_disabled FROM users WHERE id = ?');
        $userStmt->execute([$userId]);
        $target = $userStmt->fetch(PDO::FETCH_ASSOC);
        if (!$target || empty($target['is_approved'])) {
            sendJSON(['error' => 'Target user not found or not approved'], 400);
        }
        if (!empty($target['is_disabled'])) {
            sendJSON(['error' => 'Target user is disabled'], 400);
        }

        $scopes = mcpTokensNormalizeScopes($data['scopes'] ?? ['read']);
        if (strpos($scopes, 'admin') !== false && empty($target['is_admin'])) {
            sendJSON(['error' => 'Admin MCP scope can only be granted to an administrator user'], 400);
        }
        $expiresAt = null;
        if (isset($data['expiresInDays']) && is_numeric($data['expiresInDays'])) {
            $days = (int)$data['expiresInDays'];
            if ($days > 0) {
                $expiresAt = time() + ($days * 86400);
            }
        } elseif (!empty($data['expiresAt']) && is_numeric($data['expiresAt'])) {
            $expiresAt = (int)$data['expiresAt'];
        }

        $raw = 'lnmcp_' . bin2hex(random_bytes(32));
        $hash = hash('sha256', $raw);
        $prefix = substr($raw, 0, 12) . '…';
        $now = time();
        $ins = $db->prepare('INSERT INTO mcp_tokens (user_id, name, token_hash, token_prefix, scopes, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $ins->execute([$userId, $name, $hash, $prefix, $scopes, $expiresAt, $now]);
        $id = (int)$db->lastInsertId();

        if (function_exists('logUserAudit')) {
            logUserAudit('mcp.token_created', [
                'actor' => $admin,
                'target_user_id' => $userId,
                'target_username' => $target['username'],
                'details' => ['token_id' => $id, 'name' => $name, 'scopes' => $scopes],
            ]);
        }

        sendJSON([
            'data' => [
                'id' => $id,
                'userId' => $userId,
                'username' => $target['username'],
                'name' => $name,
                'tokenPrefix' => $prefix,
                'scopes' => explode(',', $scopes),
                'expiresAt' => $expiresAt,
                'createdAt' => $now,
                'token' => $raw,
            ],
        ], 201);
        break;

    case 'DELETE':
        if (!preg_match('#^/(\d+)$#', $path, $m)) {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        $id = (int)$m[1];
        $stmt = $db->prepare('SELECT t.*, u.username FROM mcp_tokens t LEFT JOIN users u ON u.id = t.user_id WHERE t.id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            sendJSON(['error' => 'Token not found'], 404);
        }
        if (!empty($row['revoked_at'])) {
            sendJSON(['data' => mcpTokensMapRow($row)]);
        }
        $db->prepare('UPDATE mcp_tokens SET revoked_at = ? WHERE id = ?')->execute([time(), $id]);
        if (function_exists('logUserAudit')) {
            logUserAudit('mcp.token_revoked', [
                'actor' => $admin,
                'target_user_id' => (int)$row['user_id'],
                'target_username' => $row['username'] ?? null,
                'details' => ['token_id' => $id, 'name' => $row['name']],
            ]);
        }
        $row['revoked_at'] = time();
        sendJSON(['data' => mcpTokensMapRow($row)]);
        break;

    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}
