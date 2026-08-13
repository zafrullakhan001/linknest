<?php
/**
 * User-management audit logging. Failures are swallowed so they never block the action.
 */

function logUserAudit(string $action, array $opts = []): void
{
    try {
        if (!function_exists('getDB')) {
            return;
        }
        $db = getDB();
        if (function_exists('ensureUserAuditLogTable')) {
            ensureUserAuditLogTable($db);
        }

        $actor = $opts['actor'] ?? null;
        if ($actor === null && function_exists('getAuthenticatedUser')) {
            $actor = getAuthenticatedUser();
        }

        $actorId = array_key_exists('actor_id', $opts) ? $opts['actor_id'] : ($actor['id'] ?? null);
        $actorUsername = array_key_exists('actor_username', $opts) ? $opts['actor_username'] : ($actor['username'] ?? null);

        if (is_array($actor) && !empty($actor['impersonating']) && !empty($actor['impersonating_admin_id'])) {
            $actorId = (int) $actor['impersonating_admin_id'];
            if (!empty($actor['impersonating_admin_username'])) {
                $actorUsername = $actor['impersonating_admin_username'];
            }
        }

        $details = $opts['details'] ?? null;
        if (is_array($details)) {
            $details = json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        if (is_string($details) && strlen($details) > 8000) {
            $details = substr($details, 0, 8000);
        }

        $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
        if (strlen($ua) > 512) {
            $ua = substr($ua, 0, 512);
        }

        $ip = null;
        if (function_exists('getClientIpAddress')) {
            $ip = getClientIpAddress();
        } elseif (!empty($_SERVER['REMOTE_ADDR'])) {
            $ip = (string) $_SERVER['REMOTE_ADDR'];
        }

        $stmt = $db->prepare('INSERT INTO user_audit_log (
            created_at, actor_id, actor_username, action,
            target_user_id, target_username, details, ip_address, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

        $targetId = $opts['target_user_id'] ?? null;
        $stmt->execute([
            time(),
            $actorId !== null && $actorId !== '' ? (int) $actorId : null,
            $actorUsername !== null && $actorUsername !== '' ? (string) $actorUsername : null,
            $action,
            $targetId !== null && $targetId !== '' ? (int) $targetId : null,
            isset($opts['target_username']) && $opts['target_username'] !== '' ? (string) $opts['target_username'] : null,
            $details !== null && $details !== '' ? (string) $details : null,
            $ip,
            $ua !== '' ? $ua : null,
        ]);
    } catch (Throwable $e) {
        error_log('user audit log failed: ' . $e->getMessage());
    }
}

function fetchUsersForAudit($db, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static function ($id) {
        return $id > 0;
    })));
    if (empty($ids)) {
        return [];
    }
    $placeholders = str_repeat('?,', count($ids) - 1) . '?';
    $stmt = $db->prepare("SELECT id, username, email, is_admin, is_approved, is_disabled, auth_source FROM users WHERE id IN ($placeholders)");
    $stmt->execute($ids);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return $rows ?: [];
}

function fetchAuditNames($db, string $table, array $ids): array
{
    $allowed = [
        'roles' => 'name',
        'user_groups' => 'name',
    ];
    if (!isset($allowed[$table])) {
        return [];
    }
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static function ($id) {
        return $id > 0;
    })));
    if (empty($ids)) {
        return [];
    }
    $col = $allowed[$table];
    $placeholders = str_repeat('?,', count($ids) - 1) . '?';
    $stmt = $db->prepare("SELECT {$col} FROM {$table} WHERE id IN ($placeholders) ORDER BY {$col}");
    $stmt->execute($ids);
    $names = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        if (!empty($row[$col])) {
            $names[] = (string) $row[$col];
        }
    }
    return $names;
}

function logUserAuditForUsers(string $action, array $users, array $sharedDetails = []): void
{
    foreach ($users as $user) {
        if (!is_array($user)) {
            continue;
        }
        $details = $sharedDetails;
        if (isset($user['email']) && !isset($details['email'])) {
            $details['email'] = $user['email'];
        }
        logUserAudit($action, [
            'target_user_id' => $user['id'] ?? null,
            'target_username' => $user['username'] ?? null,
            'details' => empty($details) ? null : $details,
        ]);
    }
}

function logUserAuditBulkCreated(string $source, array $created, array $summary = []): void
{
    logUserAuditForUsers('user.created', $created, ['source' => $source]);
    if (!empty($summary) || !empty($created)) {
        logUserAudit('user.bulk_import', [
            'details' => array_merge([
                'source' => $source,
                'created' => count($created),
            ], $summary),
        ]);
    }
}
