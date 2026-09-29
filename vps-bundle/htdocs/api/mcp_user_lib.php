<?php
/**
 * MCP admin user-management tools (create, LDAP search/add, passwords, delete, admin flag, bulk, ownership).
 * Loaded by mcp_admin_lib.php — requires mcpAdminFindUser and related helpers from that file.
 */

function mcpAdminValidatePassword(string $password): ?string {
    if (strlen($password) < 8) {
        return 'Password must be at least 8 characters';
    }
    if (!preg_match('/[A-Z]/', $password)) {
        return 'Password must contain at least one uppercase letter';
    }
    if (!preg_match('/[0-9]/', $password)) {
        return 'Password must contain at least one number';
    }
    if (!preg_match('/[!@#$%^&*()_+\-=[\]{};\':"\\\\|,.<>\/?`~]/', $password)) {
        return 'Password must contain at least one special character';
    }
    return null;
}

function mcpAdminValidateEmail(string $email): ?string {
    $email = trim($email);
    if ($email === '') {
        return 'Email is required';
    }
    $emailLower = strtolower($email);
    if (strpos($emailLower, '@localhost') !== false) {
        return null;
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return 'Invalid email address';
    }
    return null;
}

function mcpAdminResolveUserIds(PDO $db, array $args): array {
    $ids = [];
    if (isset($args['user_ids']) && is_array($args['user_ids'])) {
        foreach ($args['user_ids'] as $id) {
            $id = (int)$id;
            if ($id > 0) {
                $ids[] = $id;
            }
        }
    }
    if (isset($args['usernames']) && is_array($args['usernames'])) {
        foreach ($args['usernames'] as $name) {
            $row = mcpAdminFindUser($db, ['username' => trim((string)$name)]);
            if ($row) {
                $ids[] = (int)$row['id'];
            }
        }
    }
    if (isset($args['user_id']) || isset($args['username'])) {
        $row = mcpAdminFindUser($db, $args);
        if ($row) {
            $ids[] = (int)$row['id'];
        }
    }
    return array_values(array_unique($ids));
}

function mcpAdminCleanupUserLinkReferences(PDO $db, int $userId): void {
    try {
        $db->beginTransaction();
        $linksStmt = $db->prepare('SELECT id, allowed_users, visibility FROM links WHERE allowed_users IS NOT NULL AND allowed_users != ""');
        $linksStmt->execute();
        $updateStmt = $db->prepare('UPDATE links SET allowed_users = ?, visibility = ? WHERE id = ?');
        while ($link = $linksStmt->fetch(PDO::FETCH_ASSOC)) {
            $allowedUsers = json_decode($link['allowed_users'], true);
            if (!is_array($allowedUsers) || !in_array($userId, $allowedUsers, true)) {
                continue;
            }
            $allowedUsers = array_values(array_filter($allowedUsers, static function ($id) use ($userId) {
                return (int)$id !== $userId;
            }));
            $newVisibility = $link['visibility'];
            if ($link['visibility'] === 'private' && $allowedUsers === []) {
                $newVisibility = 'authenticated';
                $allowedUsers = null;
            }
            $updateStmt->execute([
                $allowedUsers ? json_encode($allowedUsers) : null,
                $newVisibility,
                $link['id'],
            ]);
        }
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('MCP user link cleanup: ' . $e->getMessage());
    }
}

function mcpAdminLdapServiceBind(array $serverConfig): array {
    if (!extension_loaded('ldap')) {
        return ['ok' => false, 'error' => 'PHP LDAP extension is not loaded'];
    }
    $host = trim((string)($serverConfig['server'] ?? ''));
    $port = (int)($serverConfig['port'] ?? 389);
    $protocol = (string)($serverConfig['protocol'] ?? 'ldap');
    $tls = !empty($serverConfig['tls']);
    $timeout = (int)($serverConfig['timeout'] ?? 30);
    if ($host === '' || $port < 1) {
        return ['ok' => false, 'error' => 'LDAP server host/port not configured'];
    }
    $prefix = $protocol === 'ldaps' ? 'ldaps://' : 'ldap://';
    $uri = $prefix . $host . ':' . $port;
    $ldap = @ldap_connect($uri);
    if (!$ldap) {
        return ['ok' => false, 'error' => 'Could not connect to ' . $uri];
    }
    @ldap_set_option($ldap, LDAP_OPT_PROTOCOL_VERSION, 3);
    @ldap_set_option($ldap, LDAP_OPT_REFERRALS, 0);
    @ldap_set_option($ldap, LDAP_OPT_NETWORK_TIMEOUT, $timeout);
    if ($tls && $protocol !== 'ldaps') {
        if (!@ldap_start_tls($ldap)) {
            $err = ldap_error($ldap);
            @ldap_close($ldap);
            return ['ok' => false, 'error' => 'StartTLS failed: ' . $err];
        }
    }
    $bindDn = trim((string)($serverConfig['bind_dn'] ?? ''));
    $bindPass = mcpAdminDecryptBindPassword((string)($serverConfig['bind_password'] ?? ''));
    if ($bindDn !== '') {
        if ($bindPass === '') {
            @ldap_close($ldap);
            return ['ok' => false, 'error' => 'Bind DN is set but no bind password is stored'];
        }
        if (!@ldap_bind($ldap, $bindDn, $bindPass)) {
            $err = ldap_error($ldap);
            @ldap_close($ldap);
            return ['ok' => false, 'error' => 'Service bind failed: ' . $err];
        }
    } elseif (!@ldap_bind($ldap)) {
        $err = ldap_error($ldap);
        @ldap_close($ldap);
        return ['ok' => false, 'error' => 'Anonymous bind failed: ' . $err];
    }
    return ['ok' => true, 'ldap' => $ldap, 'uri' => $uri, 'timeout' => $timeout];
}

function mcpAdminLdapServerByIndex(?int $index): array {
    $servers = mcpAdminLoadLdapServers();
    if ($servers === []) {
        return ['ok' => false, 'error' => 'No LDAP servers configured'];
    }
    $selected = $index === null ? 0 : $index;
    if ($selected < 0 || $selected >= count($servers)) {
        return ['ok' => false, 'error' => 'Invalid ldap_server_index ' . $selected];
    }
    return ['ok' => true, 'server' => $servers[$selected], 'index' => $selected];
}

function mcpAdminUserReadToolsExtra(): array {
    return [
        [
            'name' => 'list_pending_users',
            'description' => 'List users awaiting admin approval (same as list_users with pending=true).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'query' => ['type' => 'string'],
                    'limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 500],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'search_ldap_users',
            'description' => 'Search the LDAP directory for users to add. Requires LDAP enabled.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'query' => ['type' => 'string', 'description' => 'Username, email prefix, or display name'],
                    'ldap_server_index' => ['type' => 'integer', 'description' => 'LDAP server index (default 0)'],
                    'limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 20],
                ],
                'required' => ['query'],
                'additionalProperties' => false,
            ],
        ],
    ];
}

function mcpAdminUserWriteToolsExtra(): array {
    return [
        [
            'name' => 'create_local_user',
            'description' => 'Create a local user (pending approval unless auto_approve). Password is write-only.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'username' => ['type' => 'string'],
                    'email' => ['type' => 'string'],
                    'password' => ['type' => 'string'],
                    'notes' => ['type' => 'string'],
                    'auto_approve' => ['type' => 'boolean'],
                ],
                'required' => ['username', 'email', 'password'],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'add_ldap_user',
            'description' => 'Add an LDAP user after verifying DN exists. User is pending until approved.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'username' => ['type' => 'string'],
                    'dn' => ['type' => 'string'],
                    'email' => ['type' => 'string'],
                    'notes' => ['type' => 'string'],
                    'ldap_server_index' => ['type' => 'integer'],
                ],
                'required' => ['username', 'dn'],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'reset_user_password',
            'description' => 'Reset password for a non-admin local user. new_password is write-only and never echoed.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'user_id' => ['type' => 'integer'],
                    'username' => ['type' => 'string'],
                    'new_password' => ['type' => 'string'],
                ],
                'required' => ['new_password'],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'change_admin_password',
            'description' => 'Change the bound administrator password. Requires current_password and new_password (write-only).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'current_password' => ['type' => 'string'],
                    'new_password' => ['type' => 'string'],
                ],
                'required' => ['current_password', 'new_password'],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'delete_user',
            'description' => 'Delete a non-admin user account and clean private link references.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'user_id' => ['type' => 'integer'],
                    'username' => ['type' => 'string'],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'set_user_admin',
            'description' => 'Promote or demote administrator flag. Cannot demote yourself.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'user_id' => ['type' => 'integer'],
                    'username' => ['type' => 'string'],
                    'is_admin' => ['type' => 'boolean'],
                ],
                'required' => ['is_admin'],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'bulk_user_action',
            'description' => 'Bulk approve, disable, enable, reject, promote, demote, or set auth_source. Pass user_ids and/or usernames.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'user_ids' => ['type' => 'array', 'items' => ['type' => 'integer']],
                    'usernames' => ['type' => 'array', 'items' => ['type' => 'string']],
                    'action' => [
                        'type' => 'string',
                        'enum' => ['approve', 'disable', 'enable', 'reject', 'promote', 'demote', 'set_auth_source'],
                    ],
                    'auth_source' => ['type' => 'string', 'enum' => ['local', 'ldap', 'saml']],
                ],
                'required' => ['action'],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'transfer_space_ownership',
            'description' => 'Transfer a space (tile) to another user. Optionally keep the previous owner as editor.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'space_id' => ['type' => 'string'],
                    'space_title' => ['type' => 'string'],
                    'new_owner_user_id' => ['type' => 'integer'],
                    'new_owner_username' => ['type' => 'string'],
                    'keep_previous_owner_as_editor' => ['type' => 'boolean'],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'purge_ldap_settings',
            'description' => 'Delete all ldap_* settings rows and disable LDAP. Requires confirm: true.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'confirm' => ['type' => 'boolean'],
                ],
                'required' => ['confirm'],
                'additionalProperties' => false,
            ],
        ],
    ];
}

function mcpAdminListPendingUsers(array $args): array {
    $args['pending'] = true;
    return mcpAdminListUsers($args);
}

function mcpAdminSearchLdapUsers(array $args): array {
    $query = trim((string)($args['query'] ?? ''));
    if ($query === '') {
        return ['error' => 'query is required'];
    }
    if ((string)getSetting('ldap_enabled', '0') !== '1') {
        return ['error' => 'LDAP is not enabled'];
    }
    $idx = array_key_exists('ldap_server_index', $args) ? (int)$args['ldap_server_index'] : null;
    $resolved = mcpAdminLdapServerByIndex($idx);
    if (!$resolved['ok']) {
        return ['error' => $resolved['error']];
    }
    $server = $resolved['server'];
    $conn = mcpAdminLdapServiceBind($server);
    if (!$conn['ok']) {
        return ['error' => $conn['error']];
    }
    $ldap = $conn['ldap'];
    $searchBase = trim((string)($server['user_search_base'] ?? getSetting('ldap_user_search_base', '')));
    if ($searchBase === '') {
        @ldap_close($ldap);
        return ['error' => 'LDAP user search base is not configured'];
    }
    $safe = ldap_escape($query, '', LDAP_ESCAPE_FILTER);
    $filter = '(|(sAMAccountName=' . $safe . '*)(mail=' . $safe . '*)(userPrincipalName=' . $safe . '*)(cn=' . $safe . '*)(displayName=' . $safe . '*))';
    $template = trim((string)($server['user_filter'] ?? getSetting('ldap_user_filter', '')));
    if ($template !== '' && strpos($template, '{username}') !== false) {
        $filter = str_replace('{username}', $safe, $template);
    }
    $attributes = ['sAMAccountName', 'mail', 'displayName', 'userPrincipalName', 'cn'];
    $limit = isset($args['limit']) ? max(1, min(20, (int)$args['limit'])) : 20;
    @ldap_set_option($ldap, LDAP_OPT_SIZELIMIT, $limit);
    $scope = strtolower((string)($server['search_scope'] ?? getSetting('ldap_search_scope', 'sub')));
    $timeout = (int)$conn['timeout'];
    if ($scope === 'base') {
        $result = @ldap_read($ldap, $searchBase, $filter, $attributes, 0, $limit, $timeout);
    } elseif ($scope === 'one') {
        $result = @ldap_list($ldap, $searchBase, $filter, $attributes, 0, $limit, $timeout);
    } else {
        $result = @ldap_search($ldap, $searchBase, $filter, $attributes, 0, $limit, $timeout);
    }
    if ($result === false) {
        $err = ldap_error($ldap);
        @ldap_close($ldap);
        return ['error' => 'LDAP search failed: ' . $err, 'filter' => $filter];
    }
    $entries = @ldap_get_entries($ldap, $result);
    @ldap_close($ldap);
    if ($entries === false) {
        return ['error' => 'Failed to read LDAP entries'];
    }
    $users = [];
    $count = min((int)($entries['count'] ?? 0), $limit);
    for ($i = 0; $i < $count; $i++) {
        $entry = $entries[$i];
        $username = '';
        if (isset($entry['samaccountname'][0])) {
            $username = (string)$entry['samaccountname'][0];
        } elseif (isset($entry['userprincipalname'][0])) {
            $username = explode('@', (string)$entry['userprincipalname'][0])[0];
        }
        if ($username === '') {
            continue;
        }
        $email = isset($entry['mail'][0]) ? (string)$entry['mail'][0] : '';
        $displayName = isset($entry['displayname'][0]) ? (string)$entry['displayname'][0] : '';
        $users[] = [
            'username' => $username,
            'email' => $email,
            'displayName' => $displayName,
            'dn' => (string)($entry['dn'] ?? ''),
        ];
    }
    return ['count' => count($users), 'ldap_server_index' => $resolved['index'], 'users' => $users];
}

function mcpAdminCreateLocalUser(array $args, array $actor): array {
    $username = trim((string)($args['username'] ?? ''));
    $email = trim((string)($args['email'] ?? ''));
    $password = (string)($args['password'] ?? '');
    $notes = sanitizeUserNotes($args['notes'] ?? null);
    $autoApprove = !empty($args['auto_approve']);
    if ($username === '' || strlen($username) < 3) {
        return ['error' => 'Username must be at least 3 characters'];
    }
    $emailErr = mcpAdminValidateEmail($email);
    if ($emailErr !== null) {
        return ['error' => $emailErr];
    }
    if ($password === '') {
        return ['error' => 'password is required'];
    }
    $passErr = mcpAdminValidatePassword($password);
    if ($passErr !== null) {
        return ['error' => $passErr];
    }
    $db = getDB();
    $dup = $db->prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)');
    $dup->execute([$username]);
    if ($dup->fetch()) {
        return ['error' => 'Username already exists'];
    }
    $dup = $db->prepare('SELECT id FROM users WHERE email = ?');
    $dup->execute([$email]);
    if ($dup->fetch()) {
        return ['error' => 'Email already exists'];
    }
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $approved = $autoApprove ? 1 : 0;
    $stmt = $db->prepare('INSERT INTO users (username, email, password_hash, is_admin, is_approved, auth_source, uuid, notes, created_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)');
    if (!$stmt->execute([$username, $email, $hash, $approved, 'local', generateUuid(), $notes, time()])) {
        return ['error' => 'Failed to create user'];
    }
    $userId = (int)$db->lastInsertId();
    if (function_exists('logUserAudit')) {
        logUserAudit('user.created', [
            'actor' => $actor,
            'target_user_id' => $userId,
            'target_username' => $username,
            'details' => ['source' => 'local', 'via' => 'mcp', 'auto_approve' => $autoApprove],
        ]);
    }
    $row = mcpAdminFindUser($db, ['user_id' => $userId]);
    return [
        'ok' => true,
        'user' => mcpAdminMapUserRow($row, mcpAdminUserRoles($db, $userId)),
        'note' => 'Password was set but is not returned.',
    ];
}

function mcpAdminAddLdapUser(array $args, array $actor): array {
    $username = trim((string)($args['username'] ?? ''));
    $dn = trim((string)($args['dn'] ?? ''));
    if ($username === '' || $dn === '') {
        return ['error' => 'username and dn are required'];
    }
    if ((string)getSetting('ldap_enabled', '0') !== '1') {
        return ['error' => 'LDAP is not enabled'];
    }
    $idx = array_key_exists('ldap_server_index', $args) ? (int)$args['ldap_server_index'] : null;
    $resolved = mcpAdminLdapServerByIndex($idx);
    if (!$resolved['ok']) {
        return ['error' => $resolved['error']];
    }
    $server = $resolved['server'];
    $conn = mcpAdminLdapServiceBind($server);
    if (!$conn['ok']) {
        return ['error' => $conn['error']];
    }
    $ldap = $conn['ldap'];
    $result = @ldap_read($ldap, $dn, '(objectClass=*)', ['sAMAccountName', 'mail', 'displayName', 'userPrincipalName']);
    $verified = false;
    if ($result !== false) {
        $entries = @ldap_get_entries($ldap, $result);
        $verified = $entries !== false && (int)($entries['count'] ?? 0) > 0;
    }
    @ldap_close($ldap);
    if (!$verified) {
        return ['error' => 'User DN not found in LDAP on the selected server'];
    }
    $email = trim((string)($args['email'] ?? ''));
    if ($email === '') {
        $domain = trim((string)($server['login_domain'] ?? getSetting('ldap_login_domain', '')));
        if ($domain === '') {
            $domain = 'ldap.local';
        }
        $email = $username . '@' . $domain;
    }
    $emailErr = mcpAdminValidateEmail($email);
    if ($emailErr !== null) {
        return ['error' => $emailErr];
    }
    $notes = sanitizeUserNotes($args['notes'] ?? null);
    $db = getDB();
    $dup = $db->prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)');
    $dup->execute([$username]);
    if ($dup->fetch()) {
        return ['error' => 'Username already exists'];
    }
    $dup = $db->prepare('SELECT id FROM users WHERE email = ?');
    $dup->execute([$email]);
    if ($dup->fetch()) {
        return ['error' => 'Email already exists'];
    }
    $hash = password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT);
    $stmt = $db->prepare('INSERT INTO users (username, email, password_hash, is_admin, is_approved, auth_source, uuid, notes, created_at) VALUES (?, ?, ?, 0, 0, ?, ?, ?, ?)');
    if (!$stmt->execute([$username, $email, $hash, 'ldap', generateUuid(), $notes, time()])) {
        return ['error' => 'Failed to create LDAP user record'];
    }
    $userId = (int)$db->lastInsertId();
    if (function_exists('logUserAudit')) {
        logUserAudit('user.created', [
            'actor' => $actor,
            'target_user_id' => $userId,
            'target_username' => $username,
            'details' => ['source' => 'ldap', 'via' => 'mcp', 'dn' => $dn],
        ]);
    }
    $row = mcpAdminFindUser($db, ['user_id' => $userId]);
    return ['ok' => true, 'user' => mcpAdminMapUserRow($row, mcpAdminUserRoles($db, $userId))];
}

function mcpAdminResetUserPassword(array $args, array $actor): array {
    $newPassword = (string)($args['new_password'] ?? '');
    if ($newPassword === '') {
        return ['error' => 'new_password is required'];
    }
    $passErr = mcpAdminValidatePassword($newPassword);
    if ($passErr !== null) {
        return ['error' => $passErr];
    }
    $db = getDB();
    $row = mcpAdminFindUser($db, $args);
    if (!$row) {
        return ['error' => 'User not found'];
    }
    if (!empty($row['is_admin'])) {
        return ['error' => 'Cannot reset an administrator password here. Use change_admin_password for the bound admin account.'];
    }
    $auth = strtolower((string)($row['auth_source'] ?? 'local'));
    if ($auth !== 'local') {
        return ['error' => 'Password can only be reset for local users (auth source: ' . $auth . ')'];
    }
    $hash = password_hash($newPassword, PASSWORD_DEFAULT);
    $stmt = $db->prepare('UPDATE users SET password_hash = ? WHERE id = ? AND is_admin = 0');
    $stmt->execute([$hash, $row['id']]);
    if ($stmt->rowCount() < 1) {
        return ['error' => 'Failed to reset password'];
    }
    if (function_exists('logUserAudit')) {
        logUserAudit('user.password_reset', [
            'actor' => $actor,
            'target_user_id' => (int)$row['id'],
            'target_username' => $row['username'],
            'details' => ['via' => 'mcp'],
        ]);
    }
    return ['ok' => true, 'user_id' => (int)$row['id'], 'username' => $row['username'], 'note' => 'Password was updated but is not returned.'];
}

function mcpAdminChangeAdminPassword(array $args, array $actor): array {
    if (empty($actor['is_admin'])) {
        return ['error' => 'Only an administrator can change the admin password'];
    }
    $current = (string)($args['current_password'] ?? '');
    $newPassword = (string)($args['new_password'] ?? '');
    if ($current === '' || $newPassword === '') {
        return ['error' => 'current_password and new_password are required'];
    }
    $passErr = mcpAdminValidatePassword($newPassword);
    if ($passErr !== null) {
        return ['error' => $passErr];
    }
    $db = getDB();
    $stmt = $db->prepare('SELECT password_hash FROM users WHERE id = ? AND is_admin = 1');
    $stmt->execute([(int)$actor['id']]);
    $admin = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$admin || !password_verify($current, $admin['password_hash'])) {
        return ['error' => 'Current password is incorrect'];
    }
    $hash = password_hash($newPassword, PASSWORD_DEFAULT);
    $upd = $db->prepare('UPDATE users SET password_hash = ? WHERE id = ? AND is_admin = 1');
    $upd->execute([$hash, (int)$actor['id']]);
    if ($upd->rowCount() < 1) {
        return ['error' => 'Failed to change password'];
    }
    if (function_exists('logUserAudit')) {
        logUserAudit('user.password_changed', [
            'actor' => $actor,
            'target_user_id' => (int)$actor['id'],
            'target_username' => $actor['username'] ?? null,
            'details' => ['via' => 'mcp', 'self' => true],
        ]);
    }
    return ['ok' => true, 'note' => 'Admin password updated. New password is not returned.'];
}

function mcpAdminDeleteUser(array $args, array $actor): array {
    $db = getDB();
    $row = mcpAdminFindUser($db, $args);
    if (!$row) {
        return ['error' => 'User not found'];
    }
    if (!empty($row['is_admin'])) {
        return ['error' => 'Cannot delete administrator accounts'];
    }
    $userId = (int)$row['id'];
    mcpAdminCleanupUserLinkReferences($db, $userId);
    $stmt = $db->prepare('DELETE FROM users WHERE id = ? AND is_admin = 0');
    $stmt->execute([$userId]);
    if ($stmt->rowCount() < 1) {
        return ['error' => 'Failed to delete user'];
    }
    if (function_exists('logUserAudit')) {
        logUserAudit('user.deleted', [
            'actor' => $actor,
            'target_user_id' => $userId,
            'target_username' => $row['username'],
            'details' => ['via' => 'mcp'],
        ]);
    }
    return ['ok' => true, 'deleted_user_id' => $userId, 'username' => $row['username']];
}

function mcpAdminSetUserAdmin(array $args, array $actor): array {
    if (!array_key_exists('is_admin', $args)) {
        return ['error' => 'is_admin is required'];
    }
    $db = getDB();
    $row = mcpAdminFindUser($db, $args);
    if (!$row) {
        return ['error' => 'User not found'];
    }
    $targetId = (int)$row['id'];
    $wantAdmin = !empty($args['is_admin']);
    $isAdmin = !empty($row['is_admin']);
    if ($isAdmin && !$wantAdmin && $targetId === (int)$actor['id']) {
        return ['error' => 'You cannot demote yourself from admin'];
    }
    if ($isAdmin === $wantAdmin) {
        return ['ok' => true, 'user_id' => $targetId, 'is_admin' => $isAdmin, 'unchanged' => true];
    }
    if ($wantAdmin) {
        $stmt = $db->prepare('UPDATE users SET is_admin = 1, is_approved = 1 WHERE id = ?');
    } else {
        $stmt = $db->prepare('UPDATE users SET is_admin = 0 WHERE id = ?');
    }
    $stmt->execute([$targetId]);
    if (function_exists('logUserAudit')) {
        logUserAudit($wantAdmin ? 'user.promoted' : 'user.demoted', [
            'actor' => $actor,
            'target_user_id' => $targetId,
            'target_username' => $row['username'],
            'details' => ['via' => 'mcp'],
        ]);
    }
    return ['ok' => true, 'user_id' => $targetId, 'username' => $row['username'], 'is_admin' => $wantAdmin];
}

function mcpAdminBulkUserAction(array $args, array $actor): array {
    $action = strtolower(trim((string)($args['action'] ?? '')));
    $db = getDB();
    $ids = mcpAdminResolveUserIds($db, $args);
    if ($ids === []) {
        return ['error' => 'Provide at least one user_id or username'];
    }
    if ($action === 'set_auth_source') {
        $auth = strtolower(trim((string)($args['auth_source'] ?? '')));
        if (!in_array($auth, ['local', 'ldap', 'saml'], true)) {
            return ['error' => 'auth_source must be local, ldap, or saml'];
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $db->prepare("UPDATE users SET auth_source = ? WHERE id IN ($placeholders)");
        $stmt->execute(array_merge([$auth], $ids));
        return ['ok' => true, 'action' => $action, 'affected' => $stmt->rowCount(), 'auth_source' => $auth];
    }
    if ($action === 'promote') {
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $db->prepare("UPDATE users SET is_admin = 1, is_approved = 1 WHERE id IN ($placeholders)");
        $stmt->execute($ids);
        return ['ok' => true, 'action' => $action, 'affected' => $stmt->rowCount()];
    }
    if ($action === 'demote') {
        $ids = array_values(array_filter($ids, static function ($id) use ($actor) {
            return (int)$id !== (int)$actor['id'];
        }));
        if ($ids === []) {
            return ['error' => 'No users can be demoted. You cannot demote yourself.'];
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $db->prepare("UPDATE users SET is_admin = 0 WHERE id IN ($placeholders) AND is_admin = 1");
        $stmt->execute($ids);
        return ['ok' => true, 'action' => $action, 'affected' => $stmt->rowCount()];
    }
    if ($action === 'approve') {
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $db->prepare("UPDATE users SET is_approved = 1 WHERE id IN ($placeholders) AND is_admin = 0 AND is_approved = 0");
        $stmt->execute($ids);
        return ['ok' => true, 'action' => $action, 'affected' => $stmt->rowCount()];
    }
    if ($action === 'disable') {
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $db->prepare("UPDATE users SET is_disabled = 1 WHERE id IN ($placeholders) AND is_admin = 0");
        $stmt->execute($ids);
        return ['ok' => true, 'action' => $action, 'affected' => $stmt->rowCount()];
    }
    if ($action === 'enable') {
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $db->prepare("UPDATE users SET is_disabled = 0 WHERE id IN ($placeholders) AND is_admin = 0");
        $stmt->execute($ids);
        return ['ok' => true, 'action' => $action, 'affected' => $stmt->rowCount()];
    }
    if ($action === 'reject') {
        $affected = 0;
        foreach ($ids as $id) {
            $row = mcpAdminFindUser($db, ['user_id' => $id]);
            if (!$row || !empty($row['is_admin']) || !empty($row['is_approved'])) {
                continue;
            }
            mcpAdminCleanupUserLinkReferences($db, $id);
            $stmt = $db->prepare('DELETE FROM users WHERE id = ? AND is_admin = 0 AND is_approved = 0');
            $stmt->execute([$id]);
            $affected += $stmt->rowCount();
        }
        return ['ok' => true, 'action' => $action, 'affected' => $affected];
    }
    return ['error' => 'action must be approve, disable, enable, reject, promote, demote, or set_auth_source'];
}

function mcpAdminTransferSpaceOwnership(array $args): array {
    $db = getDB();
    $spaceRaw = [];
    if (!empty($args['space_id'])) {
        $spaceRaw[] = $args['space_id'];
    }
    if (!empty($args['space_title'])) {
        $spaceRaw[] = $args['space_title'];
    }
    $resolved = mcpAdminResolveSpaceIds($db, $spaceRaw);
    if ($resolved['ids'] === []) {
        return ['error' => 'Space not found. Pass space_id or space_title.'];
    }
    $tileId = $resolved['ids'][0];
    $ownerArgs = [];
    if (!empty($args['new_owner_user_id'])) {
        $ownerArgs['user_id'] = (int)$args['new_owner_user_id'];
    }
    if (!empty($args['new_owner_username'])) {
        $ownerArgs['username'] = $args['new_owner_username'];
    }
    $newOwner = mcpAdminFindUser($db, $ownerArgs);
    if (!$newOwner) {
        return ['error' => 'New owner user not found'];
    }
    $newOwnerId = (int)$newOwner['id'];
    $tileStmt = $db->prepare('SELECT id, user_id, visibility, allowed_users FROM tiles WHERE id = ? AND deleted_at IS NULL');
    $tileStmt->execute([$tileId]);
    $tile = $tileStmt->fetch(PDO::FETCH_ASSOC);
    if (!$tile) {
        return ['error' => 'Space not found'];
    }
    $previousOwnerId = isset($tile['user_id']) ? (int)$tile['user_id'] : null;
    if ($previousOwnerId === $newOwnerId) {
        return ['error' => 'User is already the owner of this space'];
    }
    $keepEditor = !array_key_exists('keep_previous_owner_as_editor', $args) || !empty($args['keep_previous_owner_as_editor']);
    $now = time();
    $startedTx = !$db->inTransaction();
    if ($startedTx) {
        $db->beginTransaction();
    }
    try {
        $db->prepare('UPDATE tiles SET user_id = ? WHERE id = ?')->execute([$newOwnerId, $tileId]);
        $checkNew = $db->prepare('SELECT user_id FROM user_tile_permissions WHERE user_id = ? AND tile_id = ?');
        $checkNew->execute([$newOwnerId, $tileId]);
        if ($checkNew->fetch()) {
            $db->prepare('
                UPDATE user_tile_permissions SET
                    can_view = 1, can_edit = 1, can_delete = 1,
                    can_add_links = 1, can_add_sections = 1, can_add_tabs = 1,
                    can_edit_links = 1, can_delete_links = 1, can_delete_sections = 1, can_delete_tabs = 1,
                    can_change_visibility = 1, can_change_browser = 1, can_clone_tile = 1,
                    can_view_tile_info = 1, can_edit_tile = 1, updated_at = ?
                WHERE user_id = ? AND tile_id = ?
            ')->execute([$now, $newOwnerId, $tileId]);
        } else {
            $db->prepare('
                INSERT INTO user_tile_permissions (
                    user_id, tile_id, can_view, can_edit, can_delete,
                    can_add_links, can_add_sections, can_add_tabs,
                    can_edit_links, can_delete_links, can_delete_sections, can_delete_tabs,
                    can_change_visibility, can_change_browser, can_clone_tile, can_view_tile_info, can_edit_tile,
                    created_at, updated_at
                ) VALUES (?, ?, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, ?, ?)
            ')->execute([$newOwnerId, $tileId, $now, $now]);
        }
        if (($tile['visibility'] ?? 'public') === 'private') {
            $allowed = $tile['allowed_users'] ? json_decode($tile['allowed_users'], true) : [];
            if (!is_array($allowed)) {
                $allowed = [];
            }
            $allowedInts = array_map('intval', $allowed);
            if (!in_array($newOwnerId, $allowedInts, true)) {
                $allowedInts[] = $newOwnerId;
            }
            $db->prepare('UPDATE tiles SET allowed_users = ? WHERE id = ?')
                ->execute([json_encode(array_values(array_unique($allowedInts))), $tileId]);
        }
        if ($previousOwnerId && !$keepEditor) {
            $db->prepare('DELETE FROM user_tile_permissions WHERE user_id = ? AND tile_id = ?')->execute([$previousOwnerId, $tileId]);
        } elseif ($previousOwnerId) {
            $checkPrev = $db->prepare('SELECT user_id FROM user_tile_permissions WHERE user_id = ? AND tile_id = ?');
            $checkPrev->execute([$previousOwnerId, $tileId]);
            if (!$checkPrev->fetch()) {
                $db->prepare('
                    INSERT INTO user_tile_permissions (
                        user_id, tile_id, can_view, can_edit, can_delete,
                        can_add_links, can_add_sections, can_add_tabs,
                        can_edit_links, can_delete_links, can_delete_sections, can_delete_tabs,
                        can_change_visibility, can_change_browser, can_clone_tile, can_view_tile_info, can_edit_tile,
                        created_at, updated_at
                    ) VALUES (?, ?, 1, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, ?, ?)
                ')->execute([$previousOwnerId, $tileId, $now, $now]);
            }
        }
        if ($startedTx) {
            $db->commit();
        }
    } catch (Throwable $e) {
        if ($startedTx && $db->inTransaction()) {
            $db->rollBack();
        }
        return ['error' => 'Failed to transfer ownership: ' . $e->getMessage()];
    }
    return [
        'ok' => true,
        'space_id' => $tileId,
        'previous_owner_user_id' => $previousOwnerId,
        'new_owner_user_id' => $newOwnerId,
        'new_owner_username' => $newOwner['username'],
        'keep_previous_owner_as_editor' => $keepEditor,
    ];
}

function mcpAdminPurgeLdapSettings(array $args): array {
    if (empty($args['confirm'])) {
        return ['error' => 'Set confirm: true to purge all LDAP settings'];
    }
    $db = getDB();
    $db->beginTransaction();
    try {
        $countStmt = $db->query("SELECT COUNT(*) AS c FROM settings WHERE key LIKE 'ldap_%'");
        $before = (int)(($countStmt->fetch(PDO::FETCH_ASSOC)['c'] ?? 0));
        $db->exec("DELETE FROM settings WHERE key LIKE 'ldap_%'");
        $db->prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
            ->execute(['ldap_servers', '[]', time()]);
        $db->prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
            ->execute(['ldap_enabled', '0', time()]);
        $db->commit();
        return [
            'ok' => true,
            'deleted_rows' => $before,
            'message' => 'LDAP settings purged. LDAP is disabled with no servers configured.',
        ];
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        return ['error' => 'Failed to purge LDAP settings: ' . $e->getMessage()];
    }
}

function mcpAdminUserDispatch(string $name, array $args, array $user): ?array {
    switch ($name) {
        case 'list_pending_users':
            return mcpAdminListPendingUsers($args);
        case 'search_ldap_users':
            return mcpAdminSearchLdapUsers($args);
        case 'create_local_user':
            return mcpAdminCreateLocalUser($args, $user);
        case 'add_ldap_user':
            return mcpAdminAddLdapUser($args, $user);
        case 'reset_user_password':
            return mcpAdminResetUserPassword($args, $user);
        case 'change_admin_password':
            return mcpAdminChangeAdminPassword($args, $user);
        case 'delete_user':
            return mcpAdminDeleteUser($args, $user);
        case 'set_user_admin':
            return mcpAdminSetUserAdmin($args, $user);
        case 'bulk_user_action':
            return mcpAdminBulkUserAction($args, $user);
        case 'transfer_space_ownership':
            return mcpAdminTransferSpaceOwnership($args);
        case 'purge_ldap_settings':
            return mcpAdminPurgeLdapSettings($args);
        default:
            return null;
    }
}
