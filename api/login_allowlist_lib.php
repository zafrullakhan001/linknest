<?php
/**
 * Login allowlist: when enabled, only selected users and LDAP AD-group
 * members may sign in. Administrators always bypass.
 */

require_once __DIR__ . '/config.php';

/**
 * @return int[]
 */
function login_allowlist_user_ids(PDO $db): array {
    $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'login_allowed_user_ids' LIMIT 1");
    $stmt->execute();
    $raw = $stmt->fetchColumn();
    if (!is_string($raw) || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return [];
    }
    $ids = [];
    foreach ($decoded as $id) {
        $n = (int) $id;
        if ($n > 0 && !in_array($n, $ids, true)) {
            $ids[] = $n;
        }
    }
    return $ids;
}

/**
 * @return string[]
 */
function login_allowlist_ldap_groups(PDO $db): array {
    $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'login_allowed_ldap_groups' LIMIT 1");
    $stmt->execute();
    $raw = $stmt->fetchColumn();
    if (!is_string($raw)) {
        return [];
    }
    return login_allowlist_parse_group_list($raw);
}

function login_allowlist_enabled(PDO $db): bool {
    $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'login_allowlist_enabled' LIMIT 1");
    $stmt->execute();
    $val = $stmt->fetchColumn();
    return ($val === '1' || $val === 1 || $val === true);
}

function login_allowlist_is_active(PDO $db): bool {
    if (!login_allowlist_enabled($db)) {
        return false;
    }
    return login_allowlist_user_ids($db) !== [] || login_allowlist_ldap_groups($db) !== [];
}

/**
 * Parse newline/semicolon-separated AD group patterns (mirrors auth.php ldapParseGroupList).
 *
 * @return string[]
 */
function login_allowlist_parse_group_list(string $raw): array {
    $raw = trim($raw);
    if ($raw === '') {
        return [];
    }
    $raw = str_replace(["\r\n", "\r"], "\n", $raw);
    $raw = str_replace(';', "\n", $raw);
    if (strpos($raw, "\n") === false && strpos($raw, '=') === false) {
        $raw = str_replace(',', "\n", $raw);
    }
    $out = [];
    foreach (explode("\n", $raw) as $line) {
        $line = trim($line);
        if ($line !== '') {
            $out[] = $line;
        }
    }
    return array_values(array_unique($out));
}

/** True if any userGroup DN/CN matches any configured pattern (case-insensitive). */
function login_allowlist_user_matches_any_group(array $userGroups, array $patterns): bool {
    foreach ($patterns as $pattern) {
        foreach ($userGroups as $userGroup) {
            if (strcasecmp($userGroup, $pattern) === 0 || stripos($userGroup, $pattern) !== false) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Whether LDAP should fetch memberOf for login allowlist evaluation.
 */
function login_allowlist_needs_ldap_member_of(PDO $db): bool {
    return login_allowlist_enabled($db) && login_allowlist_ldap_groups($db) !== [];
}

/**
 * @param array<string, mixed>|null $user User row with id, is_admin
 * @param string[] $ldapGroupDns memberOf values from LDAP entry
 * @return array{allowed: bool, message?: string, reason?: string, active?: bool}
 */
function login_allowlist_evaluate(?array $user, array $ldapGroupDns, PDO $db): array {
    if (!login_allowlist_enabled($db)) {
        return ['allowed' => true, 'active' => false];
    }

    $allowedIds = login_allowlist_user_ids($db);
    $allowedLdapGroups = login_allowlist_ldap_groups($db);

    if ($allowedIds === [] && $allowedLdapGroups === []) {
        if ($user && !empty($user['is_admin'])) {
            return ['allowed' => true, 'active' => true, 'reason' => 'admin_bypass'];
        }
        return [
            'allowed' => false,
            'active' => true,
            'message' => 'You are not authorized to sign in. Contact your administrator.',
            'reason' => 'login_allowlist_empty',
        ];
    }

    if ($user && !empty($user['is_admin'])) {
        return ['allowed' => true, 'active' => true, 'reason' => 'admin_bypass'];
    }

    $userId = isset($user['id']) ? (int) $user['id'] : 0;
    if ($userId > 0 && in_array($userId, $allowedIds, true)) {
        return ['allowed' => true, 'active' => true];
    }

    if ($ldapGroupDns !== [] && $allowedLdapGroups !== []
        && login_allowlist_user_matches_any_group($ldapGroupDns, $allowedLdapGroups)) {
        return ['allowed' => true, 'active' => true];
    }

    return [
        'allowed' => false,
        'active' => true,
        'message' => 'You are not authorized to sign in. Contact your administrator.',
        'reason' => 'login_allowlist',
    ];
}

/**
 * Whether a new LDAP user (not yet in DB) may be provisioned via AD group list.
 */
function login_allowlist_ldap_provision_allowed(array $ldapGroupDns, PDO $db): bool {
    if (!login_allowlist_enabled($db)) {
        return true;
    }
    $allowedLdapGroups = login_allowlist_ldap_groups($db);
    if ($allowedLdapGroups === []) {
        return false;
    }
    return login_allowlist_user_matches_any_group($ldapGroupDns, $allowedLdapGroups);
}

/**
 * Enforce login allowlist; sends JSON 403 and exits when denied.
 *
 * @param array<string, mixed>|null $user
 * @param string[] $ldapGroupDns
 */
function require_login_allowlist_access(?array $user, array $ldapGroupDns, string $method): void {
    $db = getDB();
    $result = login_allowlist_evaluate($user, $ldapGroupDns, $db);
    if (!empty($result['allowed'])) {
        return;
    }
    logUserAudit('auth.login_failed', [
        'actor_id' => $user && isset($user['id']) ? (int) $user['id'] : null,
        'actor_username' => $user && isset($user['username']) ? (string) $user['username'] : null,
        'target_user_id' => $user && isset($user['id']) ? (int) $user['id'] : null,
        'target_username' => $user && isset($user['username']) ? (string) $user['username'] : null,
        'details' => [
            'method' => $method,
            'reason' => $result['reason'] ?? 'login_allowlist',
        ],
    ]);
    sendJSON([
        'error' => $result['message'] ?? 'You are not authorized to sign in. Contact your administrator.',
        'reason' => $result['reason'] ?? 'login_allowlist',
    ], 403);
}

/**
 * Normalize login_allowed_user_ids for storage.
 *
 * @param mixed $value
 */
function normalize_login_allowed_user_ids_setting($value): string {
    $ids = [];
    if (is_array($value)) {
        foreach ($value as $id) {
            $n = (int) $id;
            if ($n > 0 && !in_array($n, $ids, true)) {
                $ids[] = $n;
            }
        }
    } elseif (is_string($value) && trim($value) !== '') {
        $decoded = json_decode($value, true);
        if (is_array($decoded)) {
            foreach ($decoded as $id) {
                $n = (int) $id;
                if ($n > 0 && !in_array($n, $ids, true)) {
                    $ids[] = $n;
                }
            }
        }
    }
    sort($ids);
    return json_encode(array_values($ids));
}

/**
 * Normalize login_allowed_ldap_groups for storage (newline-separated).
 *
 * @param mixed $value
 */
function normalize_login_allowed_ldap_groups_setting($value): string {
    if (!is_string($value)) {
        if (is_array($value)) {
            $value = implode("\n", array_map('strval', $value));
        } else {
            $value = '';
        }
    }
    $groups = login_allowlist_parse_group_list($value);
    return implode("\n", $groups);
}
