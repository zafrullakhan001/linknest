<?php
/**
 * Admin-gated MCP tools: LDAP/SAML, users, Access Manager, Device Presets.
 * Requires bound user is_admin AND token admin scope.
 */

require_once __DIR__ . '/user_notes_helper.php';
require_once __DIR__ . '/user_audit_helper.php';
require_once __DIR__ . '/database_transfer_lib.php';
require_once __DIR__ . '/database_maintain_lib.php';

// mcp_user_lib.php and mcp_device_presets_lib.php are loaded at the bottom after shared helpers.

function mcpHasAdminScope(array $user): bool {
    if (empty($user['is_admin'])) {
        return false;
    }
    $scopes = $user['_mcp_scopes'] ?? [];
    if (in_array('admin', $scopes, true)) {
        return true;
    }
    // Administrators with write scope get admin MCP (same as Device Presets — no extra checkbox required).
    return in_array('write', $scopes, true);
}

function mcpAdminReadActionNames(): array {
    return [
        'get_auth_status',
        'test_ldap',
        'test_saml',
        'list_users',
        'list_pending_users',
        'get_user',
        'search_ldap_users',
        'list_roles',
        'get_role',
        'list_teams',
        'list_space_editors',
        'get_database_info',
        'list_database_exports',
        'export_database',
        'maintain_database',
    ];
}

function mcpAdminWriteActionNames(): array {
    return [
        'update_ldap',
        'update_saml',
        'purge_ldap_settings',
        'create_local_user',
        'add_ldap_user',
        'update_user',
        'set_user_status',
        'reset_user_password',
        'change_admin_password',
        'delete_user',
        'set_user_admin',
        'bulk_user_action',
        'transfer_space_ownership',
        'create_role',
        'update_role',
        'assign_user_roles',
        'set_role_spaces',
        'set_role_widgets',
        'set_role_tabs',
        'assign_team_roles',
        'add_team_members',
        'set_space_editor',
        'import_database',
        'maintain_database',
    ];
}

function mcpAdminNavTabIds(): array {
    return ['public', 'your-apps', 'favorites', 'private', 'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring'];
}

function mcpAdminBuiltInWidgetIds(): array {
    return [
        'clock', 'weather', 'calculator', 'notes', 'password-generator',
        'phonetic-alphabet', 'zoom-control', 'theme', 'fav-organizer',
        'chat', 'snake-game', 'vnc-viewer', 'ssh-terminal', 'internet-speed-tester',
    ];
}

function mcpAdminMergeIds(array $current, array $incoming, string $mode): array {
    $mode = strtolower(trim($mode));
    $incoming = array_values(array_unique(array_map('strval', $incoming)));
    $current = array_values(array_unique(array_map('strval', $current)));
    if ($mode === 'replace') {
        return $incoming;
    }
    if ($mode === 'remove') {
        $drop = array_flip($incoming);
        return array_values(array_filter($current, static function ($id) use ($drop) {
            return !isset($drop[(string)$id]);
        }));
    }
    return array_values(array_unique(array_merge($current, $incoming)));
}

function mcpAdminMergeIntIds(array $current, array $incoming, string $mode): array {
    $merged = mcpAdminMergeIds($current, $incoming, $mode);
    return array_values(array_map('intval', $merged));
}

function mcpAdminCertFingerprint(string $pem): ?string {
    $pem = trim($pem);
    if ($pem === '') {
        return null;
    }
    if (strpos($pem, 'BEGIN CERTIFICATE') === false) {
        $b64 = preg_replace('/\s+/', '', $pem);
        $pem = "-----BEGIN CERTIFICATE-----\n" . chunk_split($b64, 64, "\n") . "-----END CERTIFICATE-----\n";
    }
    $cert = @openssl_x509_read($pem);
    if ($cert === false) {
        return null;
    }
    $fp = @openssl_x509_fingerprint($cert, 'sha256');
    return is_string($fp) && $fp !== '' ? $fp : null;
}

function mcpAdminLoadLdapServers(): array {
    $raw = getSetting('ldap_servers', '');
    if (is_string($raw) && trim($raw) !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded) && $decoded !== []) {
            return $decoded;
        }
    }
    $host = trim((string)getSetting('ldap_server', ''));
    if ($host === '') {
        return [];
    }
    return [[
        'name' => 'Primary',
        'server' => $host,
        'port' => (int)getSetting('ldap_port', '389'),
        'protocol' => getSetting('ldap_protocol', 'ldap'),
        'tls' => getSetting('ldap_tls', '0'),
        'timeout' => getSetting('ldap_timeout', '30'),
        'bind_dn' => getSetting('ldap_bind_dn', ''),
        'bind_password' => getSetting('ldap_bind_password', ''),
        'user_search_base' => getSetting('ldap_user_search_base', ''),
        'user_filter' => getSetting('ldap_user_filter', '(sAMAccountName={username})'),
        'login_domain' => getSetting('ldap_login_domain', ''),
        'user_dn_template' => getSetting('ldap_user_dn_template', ''),
        'case_sensitive' => getSetting('ldap_case_sensitive', '0'),
    ]];
}

function mcpAdminRedactLdapServer(array $server): array {
    $pw = (string)($server['bind_password'] ?? '');
    unset($server['bind_password']);
    $server['has_bind_password'] = $pw !== '';
    return $server;
}

function mcpAdminDecryptBindPassword(string $stored): string {
    $stored = trim($stored);
    if ($stored === '') {
        return '';
    }
    if (function_exists('isLikelyEncryptedPassword') && isLikelyEncryptedPassword($stored)) {
        try {
            return (string)decryptPassword($stored);
        } catch (Throwable $e) {
            return '';
        }
    }
    return $stored;
}

function mcpAdminMirrorLdapFlat(array $first): void {
    $mirror = [
        'ldap_server' => (string)($first['server'] ?? ''),
        'ldap_port' => (string)($first['port'] ?? '389'),
        'ldap_protocol' => (string)($first['protocol'] ?? 'ldap'),
        'ldap_tls' => (string)($first['tls'] ?? '0'),
        'ldap_timeout' => (string)($first['timeout'] ?? '30'),
        'ldap_bind_dn' => (string)($first['bind_dn'] ?? ''),
        'ldap_bind_password' => (string)($first['bind_password'] ?? ''),
        'ldap_user_search_base' => (string)($first['user_search_base'] ?? ''),
        'ldap_user_filter' => (string)($first['user_filter'] ?? '(sAMAccountName={username})'),
        'ldap_login_domain' => (string)($first['login_domain'] ?? ''),
        'ldap_user_dn_template' => (string)($first['user_dn_template'] ?? ''),
        'ldap_case_sensitive' => (string)($first['case_sensitive'] ?? '0'),
    ];
    foreach ($mirror as $key => $value) {
        setSetting($key, $value);
    }
}

function mcpAdminOneloginAvailable(): bool {
    $autoload = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php';
    if (is_file($autoload)) {
        require_once $autoload;
    }
    return class_exists('OneLogin\\Saml2\\Auth') || class_exists('OneLogin\\Saml2\\Settings');
}

function mcpAdminFindUser(PDO $db, array $args): ?array {
    $id = isset($args['user_id']) ? (int)$args['user_id'] : 0;
    $username = trim((string)($args['username'] ?? ''));
    if ($id > 0) {
        $stmt = $db->prepare('SELECT id, username, email, is_admin, is_approved, COALESCE(is_disabled, 0) AS is_disabled, auth_source, display_name, notes, created_at FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }
    if ($username !== '') {
        $stmt = $db->prepare('SELECT id, username, email, is_admin, is_approved, COALESCE(is_disabled, 0) AS is_disabled, auth_source, display_name, notes, created_at FROM users WHERE LOWER(username) = LOWER(?)');
        $stmt->execute([$username]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }
    return null;
}

function mcpAdminUserRoles(PDO $db, int $userId): array {
    $stmt = $db->prepare('SELECT r.id, r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? ORDER BY r.name');
    $stmt->execute([$userId]);
    $out = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $out[] = ['id' => (int)$row['id'], 'name' => $row['name']];
    }
    return $out;
}

function mcpAdminMapUserRow(array $row, array $roles = []): array {
    return [
        'id' => (int)$row['id'],
        'username' => $row['username'],
        'email' => $row['email'],
        'isAdmin' => !empty($row['is_admin']),
        'isApproved' => !empty($row['is_approved']),
        'isDisabled' => !empty($row['is_disabled']),
        'authSource' => $row['auth_source'] ?? 'local',
        'displayName' => isset($row['display_name']) && $row['display_name'] !== '' ? (string)$row['display_name'] : null,
        'notes' => $row['notes'] !== null && $row['notes'] !== '' ? (string)$row['notes'] : null,
        'createdAt' => (int)($row['created_at'] ?? 0),
        'roles' => $roles,
    ];
}

function mcpAdminResolveSpaceIds(PDO $db, array $idsOrTitles): array {
    $out = [];
    $notes = [];
    foreach ($idsOrTitles as $raw) {
        $v = trim((string)$raw);
        if ($v === '') {
            continue;
        }
        $stmt = $db->prepare("SELECT id, title FROM tiles WHERE id = ? AND deleted_at IS NULL LIMIT 1");
        $stmt->execute([$v]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $out[] = $row['id'];
            continue;
        }
        $stmt = $db->prepare("SELECT id, title FROM tiles WHERE LOWER(title) = LOWER(?) AND deleted_at IS NULL");
        $stmt->execute([$v]);
        $matches = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if (count($matches) === 1) {
            $out[] = $matches[0]['id'];
        } elseif (count($matches) > 1) {
            $notes[] = 'Multiple spaces titled "' . $v . '"; pass a space id.';
        }
    }
    return ['ids' => array_values(array_unique($out)), 'notes' => $notes];
}

function mcpAdminRoleIdsFromArgs(PDO $db, array $args): array {
    $ids = [];
    if (isset($args['role_ids']) && is_array($args['role_ids'])) {
        foreach ($args['role_ids'] as $id) {
            $ids[] = (int)$id;
        }
    }
    if (isset($args['role_names']) && is_array($args['role_names'])) {
        foreach ($args['role_names'] as $name) {
            $name = trim((string)$name);
            if ($name === '') {
                continue;
            }
            $stmt = $db->prepare('SELECT id FROM roles WHERE LOWER(name) = LOWER(?) LIMIT 1');
            $stmt->execute([$name]);
            $found = $stmt->fetchColumn();
            if ($found) {
                $ids[] = (int)$found;
            }
        }
    }
    return array_values(array_unique(array_filter($ids)));
}

function mcpAdminValidWidgetIds(PDO $db): array {
    $ids = mcpAdminBuiltInWidgetIds();
    try {
        $stmt = $db->query('SELECT widget_id FROM custom_widgets WHERE enabled = 1');
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $ids[] = (string)$row['widget_id'];
        }
    } catch (Throwable $e) {
        // ignore
    }
    return $ids;
}

function mcpAdminReadTools(): array {
    return [
        [
            'name' => 'admin_query',
            'description' => 'Admin read (administrator + write scope, or explicit admin scope). tool: get_auth_status, test_ldap, test_saml, list_users, list_pending_users, get_user, search_ldap_users, list_roles, get_role, list_teams, list_space_editors, get_database_info, list_database_exports, export_database, maintain_database (status/integrity). Pass tool plus that handler\'s normal fields. Secrets are never returned.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'tool' => ['type' => 'string', 'enum' => mcpAdminReadActionNames()],
                ],
                'required' => ['tool'],
                'additionalProperties' => true,
            ],
        ],
    ];
}

function mcpAdminWriteTools(): array {
    return [
        [
            'name' => 'admin_manage',
            'description' => 'Admin write (administrator + write scope). tool: update_ldap, update_saml, purge_ldap_settings, create_local_user, add_ldap_user, update_user, set_user_status, reset_user_password, change_admin_password, delete_user, set_user_admin, bulk_user_action, transfer_space_ownership, create_role, update_role, assign_user_roles, set_role_spaces, set_role_widgets, set_role_tabs, assign_team_roles, add_team_members, set_space_editor, import_database, maintain_database (analyze/optimize/checkpoint/vacuum/full). Pass tool plus that handler\'s fields. Passwords write-only. import_database and purge_ldap_settings need confirm=true.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'tool' => ['type' => 'string', 'enum' => mcpAdminWriteActionNames()],
                ],
                'required' => ['tool'],
                'additionalProperties' => true,
            ],
        ],
    ];
}

/** @deprecated Internal list only — Cursor uses collapsed admin_query / admin_manage. */
function mcpAdminReadToolsDetailed(): array {
    $empty = ['type' => 'object', 'properties' => new stdClass(), 'additionalProperties' => false];
    $tools = [
        [
            'name' => 'get_auth_status',
            'description' => 'LDAP/SAML status for admins. Never returns bind passwords or IdP certificate PEM (fingerprint only).',
            'inputSchema' => $empty,
        ],
        [
            'name' => 'test_ldap',
            'description' => 'Test LDAP connect/bind using saved settings, or optional host/port/bind overrides. Optional test_username/test_password for a user bind. Passwords are never echoed.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'server' => ['type' => 'string'],
                    'port' => ['type' => 'integer'],
                    'protocol' => ['type' => 'string'],
                    'tls' => ['type' => 'boolean'],
                    'bind_dn' => ['type' => 'string'],
                    'bind_password' => ['type' => 'string', 'description' => 'Write-only; omit to use saved password'],
                    'test_username' => ['type' => 'string'],
                    'test_password' => ['type' => 'string'],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'test_saml',
            'description' => 'Test SAML configuration. action: test_configuration (default), test_metadata, test_idp_connectivity, or validate_certificate.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'action' => ['type' => 'string', 'enum' => ['test_configuration', 'test_metadata', 'test_idp_connectivity', 'validate_certificate']],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'list_users',
            'description' => 'List users (no password hashes). Filter with query, pending, disabled, auth_source.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'query' => ['type' => 'string'],
                    'pending' => ['type' => 'boolean'],
                    'disabled' => ['type' => 'boolean'],
                    'auth_source' => ['type' => 'string', 'enum' => ['local', 'ldap', 'saml']],
                    'limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 500],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'get_user',
            'description' => 'Get one user plus assigned roles. Pass user_id or username.',
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
            'name' => 'list_roles',
            'description' => 'List Access Manager roles with user/space/widget counts.',
            'inputSchema' => $empty,
        ],
        [
            'name' => 'get_role',
            'description' => 'Get a role including assigned spaces, widgets, and nav tabs. Pass role_id or name.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'role_id' => ['type' => 'integer'],
                    'name' => ['type' => 'string'],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'list_teams',
            'description' => 'List Access Manager teams (user groups) with member and role counts.',
            'inputSchema' => $empty,
        ],
        [
            'name' => 'list_space_editors',
            'description' => 'List space editor assignments. Optional space_id or user_id filter.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'space_id' => ['type' => 'string'],
                    'user_id' => ['type' => 'integer'],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'get_database_info',
            'description' => 'SQLite file size, pragmas, and table row counts. Same data as Admin → Database. Does not return table rows or secrets.',
            'inputSchema' => $empty,
        ],
        [
            'name' => 'list_database_exports',
            'description' => 'List JSON database export files in data/exports (filename, size, modified time). Use export_database to create one. Never read or paste file contents (they contain password hashes).',
            'inputSchema' => $empty,
        ],
        [
            'name' => 'export_database',
            'description' => 'Write a JSON database backup to data/exports (same format as Admin → Database Export & Import). Returns filename, size, and row counts only — never the file contents. Optional filename (basename.json).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'filename' => [
                        'type' => 'string',
                        'description' => 'Optional basename ending in .json. Default: linknest-database-export-YYYY-MM-DD-His.json',
                    ],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'maintain_database',
            'description' => 'SQLite maintenance (same as Admin → Database → SQLite Maintenance). Read actions: status (performance/freelist/WAL/suggestions), integrity. For analyze/optimize/checkpoint/vacuum/full use admin_manage with tool maintain_database.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'action' => [
                        'type' => 'string',
                        'enum' => ['status', 'integrity'],
                        'description' => 'Default status',
                    ],
                ],
                'additionalProperties' => false,
            ],
        ],
    ];
    if (function_exists('mcpAdminUserReadToolsExtra')) {
        $tools = array_merge($tools, mcpAdminUserReadToolsExtra());
    }
    return $tools;
}

/** @deprecated Internal list only — Cursor uses collapsed admin_query / admin_manage. */
function mcpAdminWriteToolsDetailed(): array {
    $tools = [
        [
            'name' => 'update_ldap',
            'description' => 'Guarded LDAP setup. bind_password is write-only (blank keeps existing). Never returned in the result.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'ldap_enabled' => ['type' => 'boolean'],
                    'server' => ['type' => 'string'],
                    'port' => ['type' => 'integer'],
                    'protocol' => ['type' => 'string'],
                    'tls' => ['type' => 'boolean'],
                    'timeout' => ['type' => 'integer'],
                    'bind_dn' => ['type' => 'string'],
                    'bind_password' => ['type' => 'string'],
                    'user_search_base' => ['type' => 'string'],
                    'user_filter' => ['type' => 'string'],
                    'login_domain' => ['type' => 'string'],
                    'user_dn_template' => ['type' => 'string'],
                    'name' => ['type' => 'string', 'description' => 'Display name for the first LDAP server'],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'update_saml',
            'description' => 'Guarded SAML setup. idp_x509cert is write-only; reads show fingerprint only.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'saml_enabled' => ['type' => 'boolean'],
                    'local_auth_enabled' => ['type' => 'boolean'],
                    'idp_entity_id' => ['type' => 'string'],
                    'idp_sso_url' => ['type' => 'string'],
                    'idp_slo_url' => ['type' => 'string'],
                    'idp_x509cert' => ['type' => 'string'],
                    'sp_entity_id' => ['type' => 'string'],
                    'sp_assertion_consumer_service' => ['type' => 'string'],
                    'sp_single_logout_service' => ['type' => 'string'],
                    'sp_site_url' => ['type' => 'string'],
                    'nameid_format' => ['type' => 'string'],
                    'map_name_to' => ['type' => 'string'],
                    'map_email_to' => ['type' => 'string'],
                    'map_display_name_to' => ['type' => 'string'],
                    'auto_provision' => ['type' => 'boolean'],
                    'strict' => ['type' => 'boolean'],
                    'debug' => ['type' => 'boolean'],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'update_user',
            'description' => 'Update username, email, display_name, notes, or auth_source (local|ldap|saml). Pass user_id or username.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'user_id' => ['type' => 'integer'],
                    'username' => ['type' => 'string'],
                    'new_username' => ['type' => 'string'],
                    'email' => ['type' => 'string'],
                    'display_name' => ['type' => 'string'],
                    'notes' => ['type' => 'string'],
                    'auth_source' => ['type' => 'string', 'enum' => ['local', 'ldap', 'saml']],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'set_user_status',
            'description' => 'approve, disable, enable, or reject a non-admin user. Reject deletes a pending (unapproved) account.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'user_id' => ['type' => 'integer'],
                    'username' => ['type' => 'string'],
                    'action' => ['type' => 'string', 'enum' => ['approve', 'disable', 'enable', 'reject']],
                ],
                'required' => ['action'],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'create_role',
            'description' => 'Create an Access Manager role.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'name' => ['type' => 'string'],
                    'description' => ['type' => 'string'],
                    'is_guest' => ['type' => 'boolean'],
                ],
                'required' => ['name'],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'update_role',
            'description' => 'Update role name, description, or guest flag.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'role_id' => ['type' => 'integer'],
                    'name' => ['type' => 'string'],
                    'description' => ['type' => 'string'],
                    'is_guest' => ['type' => 'boolean'],
                ],
                'required' => ['role_id'],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'assign_user_roles',
            'description' => 'Assign roles to a user. mode defaults to add (merge). Use replace to set the exact list, remove to take roles away.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'user_id' => ['type' => 'integer'],
                    'username' => ['type' => 'string'],
                    'role_ids' => ['type' => 'array', 'items' => ['type' => 'integer']],
                    'role_names' => ['type' => 'array', 'items' => ['type' => 'string']],
                    'mode' => ['type' => 'string', 'enum' => ['add', 'replace', 'remove']],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'set_role_spaces',
            'description' => 'Assign spaces (tiles) a role can view. space_ids may be UUIDs or titles. mode defaults to add.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'role_id' => ['type' => 'integer'],
                    'name' => ['type' => 'string'],
                    'space_ids' => ['type' => 'array', 'items' => ['type' => 'string']],
                    'mode' => ['type' => 'string', 'enum' => ['add', 'replace', 'remove']],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'set_role_widgets',
            'description' => 'Assign widgets a role can view (clock, notes, ssh-terminal, …). mode defaults to add.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'role_id' => ['type' => 'integer'],
                    'name' => ['type' => 'string'],
                    'widget_ids' => ['type' => 'array', 'items' => ['type' => 'string']],
                    'mode' => ['type' => 'string', 'enum' => ['add', 'replace', 'remove']],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'set_role_tabs',
            'description' => 'Assign app nav tabs (public, favorites, private, monitoring, …), not space content tabs. mode defaults to add.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'role_id' => ['type' => 'integer'],
                    'name' => ['type' => 'string'],
                    'tab_ids' => ['type' => 'array', 'items' => ['type' => 'string']],
                    'mode' => ['type' => 'string', 'enum' => ['add', 'replace', 'remove']],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'assign_team_roles',
            'description' => 'Assign roles to a team (user group). mode defaults to add.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'team_id' => ['type' => 'integer'],
                    'team_name' => ['type' => 'string'],
                    'role_ids' => ['type' => 'array', 'items' => ['type' => 'integer']],
                    'role_names' => ['type' => 'array', 'items' => ['type' => 'string']],
                    'mode' => ['type' => 'string', 'enum' => ['add', 'replace', 'remove']],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'add_team_members',
            'description' => 'Add users to a team. Pass team_id or team_name and user_ids and/or usernames.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'team_id' => ['type' => 'integer'],
                    'team_name' => ['type' => 'string'],
                    'user_ids' => ['type' => 'array', 'items' => ['type' => 'integer']],
                    'usernames' => ['type' => 'array', 'items' => ['type' => 'string']],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'set_space_editor',
            'description' => 'Grant or revoke space editor access. can_edit false removes the assignment.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'user_id' => ['type' => 'integer'],
                    'username' => ['type' => 'string'],
                    'space_id' => ['type' => 'string'],
                    'space_title' => ['type' => 'string'],
                    'can_edit' => ['type' => 'boolean'],
                    'can_view' => ['type' => 'boolean'],
                    'can_add_links' => ['type' => 'boolean'],
                    'can_edit_links' => ['type' => 'boolean'],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'import_database',
            'description' => 'DESTRUCTIVE. Replace the live database with a JSON export from data/exports (Admin → Database Export format). Requires confirm=true. Default backup_first=true writes a new export before replacing. Do not paste JSON into this tool. After import, call whoami — MCP tokens are not in the JSON export and user ids may change.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'filename' => [
                        'type' => 'string',
                        'description' => 'Basename of a .json file in data/exports',
                    ],
                    'confirm' => [
                        'type' => 'boolean',
                        'description' => 'Must be true. Confirms replacing all users, spaces, settings, and related tables.',
                    ],
                    'backup_first' => [
                        'type' => 'boolean',
                        'description' => 'Write a JSON backup to data/exports before import (default true)',
                    ],
                ],
                'required' => ['filename', 'confirm'],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'maintain_database',
            'description' => 'SQLite maintenance on the live DB (Admin → Database → SQLite Maintenance). action: status, integrity, analyze, optimize, checkpoint, vacuum, full. vacuum/full briefly lock the DB — prefer a snapshot first.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'action' => [
                        'type' => 'string',
                        'enum' => ['status', 'integrity', 'analyze', 'optimize', 'checkpoint', 'vacuum', 'full'],
                        'description' => 'Default status',
                    ],
                ],
                'additionalProperties' => false,
            ],
        ],
    ];
    if (function_exists('mcpAdminUserWriteToolsExtra')) {
        $tools = array_merge($tools, mcpAdminUserWriteToolsExtra());
    }
    return $tools;
}

function mcpAdminQueryTool(array $args, array $user): array {
    $tool = strtolower(trim((string)($args['tool'] ?? $args['action'] ?? '')));
    if ($tool === '') {
        return ['error' => 'tool is required. Examples: list_users, get_auth_status, list_roles.'];
    }
    unset($args['tool'], $args['action']);
    if (!in_array($tool, mcpAdminReadActionNames(), true)) {
        return ['error' => 'Unknown admin read tool: ' . $tool];
    }
    return mcpAdminDispatch($tool, $args, $user);
}

function mcpAdminManageTool(array $args, array $user): array {
    $tool = strtolower(trim((string)($args['tool'] ?? $args['action'] ?? '')));
    if ($tool === '') {
        return ['error' => 'tool is required. Examples: create_local_user, update_user, assign_user_roles.'];
    }
    unset($args['tool'], $args['action']);
    if (!in_array($tool, mcpAdminWriteActionNames(), true)) {
        return ['error' => 'Unknown admin write tool: ' . $tool];
    }
    return mcpAdminDispatch($tool, $args, $user);
}

function mcpAdminDispatch(string $name, array $args, array $user): array {
    if (!mcpHasAdminScope($user)) {
        return ['error' => 'Admin MCP tools require an administrator bound user and write scope (or explicit admin scope on the token).'];
    }
    if ($name === 'admin_query') {
        return mcpAdminQueryTool($args, $user);
    }
    if ($name === 'admin_manage') {
        if (!mcpHasWriteScope($user)) {
            return ['error' => 'admin_manage requires write scope on the token.'];
        }
        return mcpAdminManageTool($args, $user);
    }
    if ($name === 'maintain_database') {
        $action = strtolower(trim((string)($args['action'] ?? 'status')));
        $mutating = !in_array($action, ['status', 'integrity', ''], true);
        if ($mutating && !mcpHasWriteScope($user)) {
            return ['error' => 'Mutating SQLite maintenance (analyze/optimize/checkpoint/vacuum/full) requires write scope. Use action status or integrity for read-only checks.'];
        }
        return mcpAdminMaintainDatabase($args, $user);
    }
    $write = array_merge(mcpAdminWriteActionNames(), ['admin_manage']);
    if (in_array($name, $write, true) && !mcpHasWriteScope($user)) {
        return ['error' => 'This token cannot write admin settings. Enable write plus admin on the token.'];
    }

    switch ($name) {
        case 'get_auth_status':
            return mcpAdminGetAuthStatus();
        case 'test_ldap':
            return mcpAdminTestLdap($args);
        case 'test_saml':
            return mcpAdminTestSaml($args);
        case 'update_ldap':
            return mcpAdminUpdateLdap($args);
        case 'update_saml':
            return mcpAdminUpdateSaml($args);
        case 'list_users':
            return mcpAdminListUsers($args);
        case 'get_user':
            return mcpAdminGetUser($args);
        case 'update_user':
            return mcpAdminUpdateUser($args, $user);
        case 'set_user_status':
            return mcpAdminSetUserStatus($args, $user);
        case 'list_roles':
            return mcpAdminListRoles();
        case 'get_role':
            return mcpAdminGetRole($args);
        case 'create_role':
            return mcpAdminCreateRole($args);
        case 'update_role':
            return mcpAdminUpdateRole($args);
        case 'assign_user_roles':
            return mcpAdminAssignUserRoles($args, $user);
        case 'set_role_spaces':
            return mcpAdminSetRoleSpaces($args);
        case 'set_role_widgets':
            return mcpAdminSetRoleWidgets($args);
        case 'set_role_tabs':
            return mcpAdminSetRoleTabs($args);
        case 'list_teams':
            return mcpAdminListTeams();
        case 'assign_team_roles':
            return mcpAdminAssignTeamRoles($args);
        case 'add_team_members':
            return mcpAdminAddTeamMembers($args, $user);
        case 'list_space_editors':
            return mcpAdminListSpaceEditors($args);
        case 'set_space_editor':
            return mcpAdminSetSpaceEditor($args);
        case 'get_database_info':
            return mcpAdminGetDatabaseInfo();
        case 'list_database_exports':
            return mcpAdminListDatabaseExports();
        case 'export_database':
            return mcpAdminExportDatabase($args, $user);
        case 'import_database':
            return mcpAdminImportDatabase($args, $user);
        case 'maintain_database':
            return mcpAdminMaintainDatabase($args, $user);
        default:
            if (function_exists('mcpAdminUserDispatch')) {
                $userResult = mcpAdminUserDispatch($name, $args, $user);
                if ($userResult !== null) {
                    return $userResult;
                }
            }
            return ['error' => 'Unknown admin tool: ' . $name];
    }
}

function mcpAdminGetAuthStatus(): array {
    $cert = (string)getSetting('idp_x509cert', '');
    $servers = [];
    foreach (mcpAdminLoadLdapServers() as $s) {
        if (is_array($s)) {
            $servers[] = mcpAdminRedactLdapServer($s);
        }
    }
    return [
        'ldap_enabled' => (string)getSetting('ldap_enabled', '0') === '1',
        'saml_enabled' => (string)getSetting('saml_enabled', '0') === '1',
        'local_auth_enabled' => (string)getSetting('local_auth_enabled', '1') !== '0',
        'php_ldap_extension_loaded' => extension_loaded('ldap'),
        'onelogin_saml_available' => mcpAdminOneloginAvailable(),
        'ldap_servers' => $servers,
        'saml' => [
            'idp_entity_id' => getSetting('idp_entity_id', ''),
            'idp_sso_url' => getSetting('idp_sso_url', ''),
            'idp_slo_url' => getSetting('idp_slo_url', ''),
            'sp_entity_id' => getSetting('sp_entity_id', ''),
            'sp_assertion_consumer_service' => getSetting('sp_assertion_consumer_service', ''),
            'sp_single_logout_service' => getSetting('sp_single_logout_service', ''),
            'sp_site_url' => getSetting('sp_site_url', ''),
            'nameid_format' => getSetting('nameid_format', ''),
            'map_name_to' => getSetting('map_name_to', ''),
            'map_email_to' => getSetting('map_email_to', ''),
            'map_display_name_to' => getSetting('map_display_name_to', ''),
            'auto_provision' => (string)getSetting('auto_provision', '1') === '1',
            'strict' => (string)getSetting('strict', '1') === '1',
            'debug' => (string)getSetting('debug', '0') === '1',
            'idp_cert_present' => trim($cert) !== '',
            'idp_cert_fingerprint_sha256' => mcpAdminCertFingerprint($cert),
        ],
    ];
}

function mcpAdminTestLdap(array $args): array {
    if (!extension_loaded('ldap')) {
        return ['success' => false, 'message' => 'PHP LDAP extension is not loaded. Enable it in php.ini.'];
    }
    $servers = mcpAdminLoadLdapServers();
    $first = is_array($servers[0] ?? null) ? $servers[0] : [];
    $host = trim((string)($args['server'] ?? $first['server'] ?? getSetting('ldap_server', '')));
    $port = (int)($args['port'] ?? $first['port'] ?? getSetting('ldap_port', 389));
    $protocol = (string)($args['protocol'] ?? $first['protocol'] ?? getSetting('ldap_protocol', 'ldap'));
    $tls = array_key_exists('tls', $args)
        ? !empty($args['tls'])
        : ((string)($first['tls'] ?? getSetting('ldap_tls', '0')) === '1');
    $timeout = (int)($first['timeout'] ?? getSetting('ldap_timeout', 30));
    if ($host === '' || $port < 1) {
        return ['error' => 'LDAP host and port are required (save settings first or pass server/port).'];
    }
    $bindDn = trim((string)($args['bind_dn'] ?? $first['bind_dn'] ?? getSetting('ldap_bind_dn', '')));
    $bindPass = '';
    if (isset($args['bind_password']) && trim((string)$args['bind_password']) !== '') {
        $bindPass = (string)$args['bind_password'];
    } else {
        $bindPass = mcpAdminDecryptBindPassword((string)($first['bind_password'] ?? getSetting('ldap_bind_password', '')));
    }

    $prefix = $protocol === 'ldaps' ? 'ldaps://' : 'ldap://';
    $uri = $prefix . $host . ':' . $port;
    $ldap = @ldap_connect($uri);
    if (!$ldap) {
        return ['success' => false, 'message' => 'Could not connect to ' . $uri];
    }
    @ldap_set_option($ldap, LDAP_OPT_PROTOCOL_VERSION, 3);
    @ldap_set_option($ldap, LDAP_OPT_REFERRALS, 0);
    @ldap_set_option($ldap, LDAP_OPT_NETWORK_TIMEOUT, $timeout);
    if ($tls && $protocol !== 'ldaps') {
        if (!@ldap_start_tls($ldap)) {
            $err = ldap_error($ldap);
            @ldap_close($ldap);
            return ['success' => false, 'message' => 'StartTLS failed: ' . $err, 'uri' => $uri];
        }
    }

    $bound = false;
    if ($bindDn !== '') {
        if ($bindPass === '') {
            @ldap_close($ldap);
            return ['success' => false, 'message' => 'Bind DN is set but no bind password is available (pass bind_password or save one in Admin).'];
        }
        $bound = @ldap_bind($ldap, $bindDn, $bindPass);
        if (!$bound) {
            $msg = 'Service account bind failed: ' . ldap_error($ldap);
            $diag = '';
            if (defined('LDAP_OPT_DIAGNOSTIC_MESSAGE')) {
                @ldap_get_option($ldap, LDAP_OPT_DIAGNOSTIC_MESSAGE, $diag);
            }
            if (is_string($diag) && $diag !== '') {
                $msg .= ' Diagnostic: ' . $diag;
            }
            $msg .= ' Bind DN: ' . $bindDn . ' Password length: ' . strlen($bindPass) . ' (value not shown). URI: ' . $uri;
            @ldap_close($ldap);
            return ['success' => false, 'message' => $msg];
        }
    } else {
        $bound = @ldap_bind($ldap);
        if (!$bound) {
            $err = ldap_error($ldap);
            @ldap_close($ldap);
            return ['success' => false, 'message' => 'Anonymous bind failed: ' . $err, 'uri' => $uri];
        }
    }

    $testUser = trim((string)($args['test_username'] ?? ''));
    $testPass = (string)($args['test_password'] ?? '');
    $userOk = null;
    if ($testUser !== '' && $testPass !== '') {
        $template = (string)($first['user_dn_template'] ?? getSetting('ldap_user_dn_template', ''));
        $userDn = $template !== '' ? str_replace('{username}', $testUser, $template) : $testUser;
        $userOk = @ldap_bind($ldap, $userDn, $testPass);
        if (!$userOk) {
            @ldap_close($ldap);
            return [
                'success' => true,
                'bind' => 'service_or_anonymous_ok',
                'user_auth' => false,
                'message' => 'Directory bind succeeded but user authentication failed for ' . $testUser . ' (password not shown). URI: ' . $uri,
            ];
        }
    }
    @ldap_close($ldap);
    return [
        'success' => true,
        'message' => 'LDAP bind succeeded',
        'uri' => $uri,
        'user_auth' => $userOk,
    ];
}

function mcpAdminTestSaml(array $args): array {
    $action = trim((string)($args['action'] ?? 'test_configuration'));
    $settings = [
        'saml_enabled' => (string)getSetting('saml_enabled', '0') === '1',
        'idp_entity_id' => (string)getSetting('idp_entity_id', ''),
        'idp_sso_url' => (string)getSetting('idp_sso_url', ''),
        'idp_slo_url' => (string)getSetting('idp_slo_url', ''),
        'idp_x509cert' => (string)getSetting('idp_x509cert', ''),
        'sp_entity_id' => (string)getSetting('sp_entity_id', ''),
        'sp_acs' => (string)getSetting('sp_assertion_consumer_service', ''),
        'sp_slo' => (string)getSetting('sp_single_logout_service', ''),
    ];
    $library = mcpAdminOneloginAvailable();

    if ($action === 'validate_certificate') {
        $fp = mcpAdminCertFingerprint($settings['idp_x509cert']);
        return [
            'action' => $action,
            'success' => $fp !== null,
            'idp_cert_present' => trim($settings['idp_x509cert']) !== '',
            'idp_cert_fingerprint_sha256' => $fp,
            'message' => $fp ? 'Certificate parsed' : 'Could not parse IdP certificate',
        ];
    }
    if ($action === 'test_idp_connectivity') {
        $url = $settings['idp_sso_url'];
        if ($url === '') {
            return ['action' => $action, 'success' => false, 'message' => 'idp_sso_url is empty'];
        }
        $ctx = stream_context_create(['http' => ['method' => 'GET', 'timeout' => 8, 'ignore_errors' => true]]);
        $body = @file_get_contents($url, false, $ctx);
        $ok = $body !== false;
        return [
            'action' => $action,
            'success' => $ok,
            'idp_sso_url' => $url,
            'message' => $ok ? 'Reached IdP SSO URL' : 'Could not reach IdP SSO URL',
        ];
    }
    if ($action === 'test_metadata') {
        return [
            'action' => $action,
            'success' => $settings['sp_entity_id'] !== '' && $settings['sp_acs'] !== '',
            'sp_entity_id' => $settings['sp_entity_id'],
            'sp_assertion_consumer_service' => $settings['sp_acs'],
            'sp_single_logout_service' => $settings['sp_slo'],
            'onelogin_saml_available' => $library,
        ];
    }
    $missing = [];
    foreach (['idp_entity_id' => $settings['idp_entity_id'], 'idp_sso_url' => $settings['idp_sso_url'], 'idp_x509cert' => $settings['idp_x509cert']] as $k => $v) {
        if (trim((string)$v) === '') {
            $missing[] = $k;
        }
    }
    return [
        'action' => 'test_configuration',
        'success' => $settings['saml_enabled'] && $missing === [] && $library,
        'saml_enabled' => $settings['saml_enabled'],
        'onelogin_saml_available' => $library,
        'missing' => $missing,
        'idp_cert_present' => trim($settings['idp_x509cert']) !== '',
        'idp_cert_fingerprint_sha256' => mcpAdminCertFingerprint($settings['idp_x509cert']),
        'idp_entity_id' => $settings['idp_entity_id'],
        'idp_sso_url' => $settings['idp_sso_url'],
    ];
}

function mcpAdminUpdateLdap(array $args): array {
    if ($args === []) {
        return ['error' => 'Provide at least one LDAP field to update.'];
    }
    if (array_key_exists('ldap_enabled', $args)) {
        setSetting('ldap_enabled', !empty($args['ldap_enabled']) ? '1' : '0');
    }
    $servers = mcpAdminLoadLdapServers();
    $first = is_array($servers[0] ?? null) ? $servers[0] : ['name' => 'Primary', 'protocol' => 'ldap', 'port' => 389];
    $map = [
        'name' => 'name',
        'server' => 'server',
        'port' => 'port',
        'protocol' => 'protocol',
        'timeout' => 'timeout',
        'bind_dn' => 'bind_dn',
        'user_search_base' => 'user_search_base',
        'user_filter' => 'user_filter',
        'login_domain' => 'login_domain',
        'user_dn_template' => 'user_dn_template',
    ];
    foreach ($map as $arg => $field) {
        if (array_key_exists($arg, $args) && $args[$arg] !== null && $args[$arg] !== '') {
            $first[$field] = $args[$arg];
        }
    }
    if (array_key_exists('tls', $args)) {
        $first['tls'] = !empty($args['tls']) ? '1' : '0';
    }
    if (isset($args['bind_password']) && trim((string)$args['bind_password']) !== '') {
        $pw = trim((string)$args['bind_password']);
        if (function_exists('isMaskedPasswordPlaceholder') && isMaskedPasswordPlaceholder($pw)) {
            return ['error' => 'Bind password looks masked. Pass the real password.'];
        }
        try {
            $first['bind_password'] = encryptPassword($pw);
        } catch (Throwable $e) {
            return ['error' => 'Could not encrypt bind password'];
        }
    }
    $servers[0] = $first;
    setSetting('ldap_servers', json_encode($servers, JSON_UNESCAPED_SLASHES));
    mcpAdminMirrorLdapFlat($first);
    $redacted = [];
    foreach ($servers as $s) {
        if (is_array($s)) {
            $redacted[] = mcpAdminRedactLdapServer($s);
        }
    }
    return [
        'ok' => true,
        'ldap_enabled' => (string)getSetting('ldap_enabled', '0') === '1',
        'ldap_servers' => $redacted,
        'note' => 'Bind password not returned. Call test_ldap to verify.',
    ];
}

function mcpAdminUpdateSaml(array $args): array {
    if ($args === []) {
        return ['error' => 'Provide at least one SAML field to update.'];
    }
    $boolKeys = ['saml_enabled', 'local_auth_enabled', 'auto_provision', 'strict', 'debug'];
    foreach ($boolKeys as $k) {
        if (array_key_exists($k, $args)) {
            setSetting($k, !empty($args[$k]) ? '1' : '0');
        }
    }
    $strKeys = [
        'idp_entity_id', 'idp_sso_url', 'idp_slo_url', 'idp_x509cert',
        'sp_entity_id', 'sp_assertion_consumer_service', 'sp_single_logout_service', 'sp_site_url',
        'nameid_format', 'map_name_to', 'map_email_to', 'map_display_name_to',
    ];
    foreach ($strKeys as $k) {
        if (array_key_exists($k, $args) && $args[$k] !== null) {
            $val = trim((string)$args[$k]);
            if ($k === 'idp_x509cert' && $val === '') {
                continue;
            }
            setSetting($k, $val);
        }
    }
    $cert = (string)getSetting('idp_x509cert', '');
    return [
        'ok' => true,
        'saml_enabled' => (string)getSetting('saml_enabled', '0') === '1',
        'local_auth_enabled' => (string)getSetting('local_auth_enabled', '1') !== '0',
        'idp_entity_id' => getSetting('idp_entity_id', ''),
        'idp_sso_url' => getSetting('idp_sso_url', ''),
        'idp_cert_present' => trim($cert) !== '',
        'idp_cert_fingerprint_sha256' => mcpAdminCertFingerprint($cert),
        'note' => 'IdP certificate PEM is not returned.',
    ];
}

function mcpAdminListUsers(array $args): array {
    $db = getDB();
    $limit = isset($args['limit']) ? max(1, min(500, (int)$args['limit'])) : 200;
    $stmt = $db->query('SELECT id, username, email, is_admin, is_approved, COALESCE(is_disabled, 0) AS is_disabled, auth_source, display_name, notes, created_at FROM users ORDER BY username');
    $query = strtolower(trim((string)($args['query'] ?? '')));
    $pending = array_key_exists('pending', $args) ? !empty($args['pending']) : null;
    $disabled = array_key_exists('disabled', $args) ? !empty($args['disabled']) : null;
    $auth = isset($args['auth_source']) ? strtolower(trim((string)$args['auth_source'])) : '';
    $out = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        if ($pending === true && !empty($row['is_approved'])) {
            continue;
        }
        if ($pending === false && empty($row['is_approved'])) {
            continue;
        }
        if ($disabled === true && empty($row['is_disabled'])) {
            continue;
        }
        if ($disabled === false && !empty($row['is_disabled'])) {
            continue;
        }
        $src = strtolower((string)($row['auth_source'] ?? 'local'));
        if ($auth !== '' && $src !== $auth) {
            continue;
        }
        if ($query !== '') {
            $hay = strtolower(($row['username'] ?? '') . ' ' . ($row['email'] ?? ''));
            if (strpos($hay, $query) === false) {
                continue;
            }
        }
        $out[] = mcpAdminMapUserRow($row, mcpAdminUserRoles($db, (int)$row['id']));
        if (count($out) >= $limit) {
            break;
        }
    }
    return ['count' => count($out), 'users' => $out];
}

function mcpAdminGetUser(array $args): array {
    $db = getDB();
    $row = mcpAdminFindUser($db, $args);
    if (!$row) {
        return ['error' => 'User not found'];
    }
    return mcpAdminMapUserRow($row, mcpAdminUserRoles($db, (int)$row['id']));
}

function mcpAdminUpdateUser(array $args, array $actor): array {
    $db = getDB();
    $row = mcpAdminFindUser($db, $args);
    if (!$row) {
        return ['error' => 'User not found'];
    }
    $username = array_key_exists('new_username', $args) ? trim((string)$args['new_username']) : (string)$row['username'];
    if (array_key_exists('username', $args) && (int)($args['user_id'] ?? 0) > 0) {
        $username = trim((string)$args['username']) !== '' ? trim((string)$args['username']) : $username;
    }
    $email = array_key_exists('email', $args) ? trim((string)$args['email']) : (string)$row['email'];
    $auth = array_key_exists('auth_source', $args) ? strtolower(trim((string)$args['auth_source'])) : strtolower((string)($row['auth_source'] ?? 'local'));
    if (!in_array($auth, ['local', 'ldap', 'saml'], true)) {
        return ['error' => 'auth_source must be local, ldap, or saml'];
    }
    if (strlen($username) < 3) {
        return ['error' => 'Username must be at least 3 characters'];
    }
    if (array_key_exists('email', $args)) {
        $emailErr = mcpAdminValidateEmail($email);
        if ($emailErr !== null) {
            return ['error' => $emailErr];
        }
    }
    $notesProvided = array_key_exists('notes', $args);
    $notes = $notesProvided ? sanitizeUserNotes($args['notes']) : ($row['notes'] ?? null);
    $displayName = array_key_exists('display_name', $args)
        ? trim((string)$args['display_name'])
        : (string)($row['display_name'] ?? '');
    if ($displayName === '') {
        $displayName = null;
    }

    $dup = $db->prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?');
    $dup->execute([$username, $row['id']]);
    if ($dup->fetch()) {
        return ['error' => 'Username already exists'];
    }
    $dup = $db->prepare('SELECT id FROM users WHERE email = ? AND id != ?');
    $dup->execute([$email, $row['id']]);
    if ($dup->fetch()) {
        return ['error' => 'Email already exists'];
    }

    $stmt = $db->prepare('UPDATE users SET username = ?, email = ?, auth_source = ?, notes = ?, display_name = ? WHERE id = ?');
    $stmt->execute([$username, $email, $auth, $notes, $displayName, $row['id']]);
    if (function_exists('logUserAudit')) {
        logUserAudit('user.updated', [
            'actor' => $actor,
            'target_user_id' => (int)$row['id'],
            'target_username' => $username,
            'details' => ['via' => 'mcp'],
        ]);
    }
    $fresh = mcpAdminFindUser($db, ['user_id' => (int)$row['id']]);
    return ['ok' => true, 'user' => mcpAdminMapUserRow($fresh, mcpAdminUserRoles($db, (int)$row['id']))];
}

function mcpAdminSetUserStatus(array $args, array $actor): array {
    $action = strtolower(trim((string)($args['action'] ?? '')));
    $db = getDB();
    $row = mcpAdminFindUser($db, $args);
    if (!$row) {
        return ['error' => 'User not found'];
    }
    if (!empty($row['is_admin'])) {
        return ['error' => 'Cannot change status of an administrator via MCP'];
    }
    $id = (int)$row['id'];
    if ($action === 'approve') {
        $stmt = $db->prepare('UPDATE users SET is_approved = 1 WHERE id = ? AND is_admin = 0');
        $stmt->execute([$id]);
        if (function_exists('logUserAudit')) {
            logUserAudit('user.approved', ['actor' => $actor, 'target_user_id' => $id, 'target_username' => $row['username']]);
        }
        return ['ok' => true, 'action' => 'approve', 'user_id' => $id];
    }
    if ($action === 'disable') {
        $stmt = $db->prepare('UPDATE users SET is_disabled = 1 WHERE id = ? AND is_admin = 0');
        $stmt->execute([$id]);
        if (function_exists('logUserAudit')) {
            logUserAudit('user.disabled', ['actor' => $actor, 'target_user_id' => $id, 'target_username' => $row['username']]);
        }
        return ['ok' => true, 'action' => 'disable', 'user_id' => $id];
    }
    if ($action === 'enable') {
        $stmt = $db->prepare('UPDATE users SET is_disabled = 0 WHERE id = ? AND is_admin = 0');
        $stmt->execute([$id]);
        if (function_exists('logUserAudit')) {
            logUserAudit('user.enabled', ['actor' => $actor, 'target_user_id' => $id, 'target_username' => $row['username']]);
        }
        return ['ok' => true, 'action' => 'enable', 'user_id' => $id];
    }
    if ($action === 'reject') {
        if (!empty($row['is_approved'])) {
            return ['error' => 'Only pending (unapproved) users can be rejected'];
        }
        $stmt = $db->prepare('DELETE FROM users WHERE id = ? AND is_admin = 0 AND is_approved = 0');
        $stmt->execute([$id]);
        if (function_exists('logUserAudit')) {
            logUserAudit('user.rejected', ['actor' => $actor, 'target_user_id' => $id, 'target_username' => $row['username']]);
        }
        return ['ok' => true, 'action' => 'reject', 'user_id' => $id];
    }
    return ['error' => 'action must be approve, disable, enable, or reject'];
}

function mcpAdminFindRole(PDO $db, array $args): ?array {
    $id = isset($args['role_id']) ? (int)$args['role_id'] : 0;
    $name = trim((string)($args['name'] ?? ''));
    if ($id > 0) {
        $stmt = $db->prepare('SELECT * FROM roles WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }
    if ($name !== '') {
        $stmt = $db->prepare('SELECT * FROM roles WHERE LOWER(name) = LOWER(?)');
        $stmt->execute([$name]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }
    return null;
}

function mcpAdminListRoles(): array {
    $db = getDB();
    $stmt = $db->query('
        SELECT r.*,
            COUNT(DISTINCT ur.user_id) as user_count,
            COUNT(DISTINCT rtp.tile_id) as space_count,
            COUNT(DISTINCT rwp.widget_id) as widget_count
        FROM roles r
        LEFT JOIN user_roles ur ON r.id = ur.role_id
        LEFT JOIN role_tile_permissions rtp ON r.id = rtp.role_id
        LEFT JOIN role_widget_permissions rwp ON r.id = rwp.role_id
        GROUP BY r.id
        ORDER BY r.name
    ');
    $roles = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $roles[] = [
            'id' => (int)$row['id'],
            'name' => $row['name'],
            'description' => $row['description'],
            'isGuest' => !empty($row['is_guest']),
            'userCount' => (int)$row['user_count'],
            'spaceCount' => (int)$row['space_count'],
            'widgetCount' => (int)$row['widget_count'],
        ];
    }
    return ['count' => count($roles), 'roles' => $roles];
}

function mcpAdminRoleAssignments(PDO $db, int $roleId): array {
    $spaces = [];
    $stmt = $db->prepare('SELECT rtp.tile_id, t.title FROM role_tile_permissions rtp LEFT JOIN tiles t ON t.id = rtp.tile_id WHERE rtp.role_id = ?');
    $stmt->execute([$roleId]);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $spaces[] = ['id' => $row['tile_id'], 'title' => $row['title']];
    }
    $widgets = [];
    $stmt = $db->prepare('SELECT widget_id FROM role_widget_permissions WHERE role_id = ?');
    $stmt->execute([$roleId]);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $widgets[] = $row['widget_id'];
    }
    $tabs = [];
    $stmt = $db->prepare('SELECT tab_id FROM role_tab_permissions WHERE role_id = ?');
    $stmt->execute([$roleId]);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $tabs[] = $row['tab_id'];
    }
    return ['spaces' => $spaces, 'widgets' => $widgets, 'tabs' => $tabs];
}

function mcpAdminGetRole(array $args): array {
    $db = getDB();
    $role = mcpAdminFindRole($db, $args);
    if (!$role) {
        return ['error' => 'Role not found'];
    }
    $assign = mcpAdminRoleAssignments($db, (int)$role['id']);
    return [
        'id' => (int)$role['id'],
        'name' => $role['name'],
        'description' => $role['description'],
        'isGuest' => !empty($role['is_guest']),
        'spaces' => $assign['spaces'],
        'widgets' => $assign['widgets'],
        'tabs' => $assign['tabs'],
        'validTabs' => mcpAdminNavTabIds(),
        'builtInWidgets' => mcpAdminBuiltInWidgetIds(),
    ];
}

function mcpAdminCreateRole(array $args): array {
    $name = trim((string)($args['name'] ?? ''));
    if ($name === '') {
        return ['error' => 'name is required'];
    }
    $description = isset($args['description']) ? trim((string)$args['description']) : null;
    $isGuest = !empty($args['is_guest']) || !empty($args['isGuest']);
    $db = getDB();
    $now = time();
    $db->beginTransaction();
    try {
        if ($isGuest) {
            $db->exec('UPDATE roles SET is_guest = 0, updated_at = ' . (int)$now . ' WHERE is_guest = 1');
        }
        $stmt = $db->prepare('INSERT INTO roles (name, description, is_guest, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([$name, $description, $isGuest ? 1 : 0, $now, $now]);
        $id = (int)$db->lastInsertId();
        if (function_exists('seedRoleLinkActionsIfEmpty')) {
            seedRoleLinkActionsIfEmpty($db, $id);
        }
        $db->commit();
        return ['ok' => true, 'role' => mcpAdminGetRole(['role_id' => $id])];
    } catch (Throwable $e) {
        $db->rollBack();
        return ['error' => 'Could not create role: ' . $e->getMessage()];
    }
}

function mcpAdminUpdateRole(array $args): array {
    $db = getDB();
    $role = mcpAdminFindRole($db, $args);
    if (!$role) {
        return ['error' => 'Role not found'];
    }
    $name = array_key_exists('name', $args) ? trim((string)$args['name']) : (string)$role['name'];
    if ($name === '') {
        return ['error' => 'name cannot be empty'];
    }
    $description = array_key_exists('description', $args) ? trim((string)$args['description']) : $role['description'];
    $isGuest = array_key_exists('is_guest', $args) ? (!empty($args['is_guest']) ? 1 : 0) : (int)!empty($role['is_guest']);
    $now = time();
    if ($isGuest) {
        $db->prepare('UPDATE roles SET is_guest = 0, updated_at = ? WHERE is_guest = 1 AND id != ?')->execute([$now, $role['id']]);
    }
    $stmt = $db->prepare('UPDATE roles SET name = ?, description = ?, is_guest = ?, updated_at = ? WHERE id = ?');
    $stmt->execute([$name, $description, $isGuest, $now, $role['id']]);
    return ['ok' => true, 'role' => mcpAdminGetRole(['role_id' => (int)$role['id']])];
}

function mcpAdminAssignUserRoles(array $args, array $actor): array {
    $db = getDB();
    $row = mcpAdminFindUser($db, $args);
    if (!$row) {
        return ['error' => 'User not found'];
    }
    $incoming = mcpAdminRoleIdsFromArgs($db, $args);
    if ($incoming === [] && strtolower((string)($args['mode'] ?? 'add')) !== 'replace') {
        return ['error' => 'role_ids or role_names required'];
    }
    $current = [];
    foreach (mcpAdminUserRoles($db, (int)$row['id']) as $r) {
        $current[] = (int)$r['id'];
    }
    $mode = (string)($args['mode'] ?? 'add');
    $next = mcpAdminMergeIntIds($current, $incoming, $mode);
    $now = time();
    $db->beginTransaction();
    try {
        $db->prepare('DELETE FROM user_roles WHERE user_id = ?')->execute([$row['id']]);
        $ins = $db->prepare('INSERT INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, ?)');
        foreach ($next as $rid) {
            $check = $db->prepare('SELECT id FROM roles WHERE id = ?');
            $check->execute([$rid]);
            if ($check->fetch()) {
                $ins->execute([$row['id'], $rid, $now]);
            }
        }
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        return ['error' => $e->getMessage()];
    }
    if (function_exists('logUserAudit')) {
        logUserAudit('user.roles_assigned', [
            'actor' => $actor,
            'target_user_id' => (int)$row['id'],
            'target_username' => $row['username'],
            'details' => ['mode' => $mode, 'via' => 'mcp'],
        ]);
    }
    return ['ok' => true, 'mode' => $mode, 'user' => mcpAdminGetUser(['user_id' => (int)$row['id']])];
}

function mcpAdminReplaceRoleColumn(PDO $db, int $roleId, string $table, string $idCol, array $ids, bool $widgets = false, bool $tabs = false): array {
    $now = time();
    if ($table === 'role_tile_permissions') {
        $db->prepare('DELETE FROM role_tile_permissions WHERE role_id = ?')->execute([$roleId]);
        $ins = $db->prepare('INSERT INTO role_tile_permissions (role_id, tile_id, can_view, created_at, updated_at) VALUES (?, ?, 1, ?, ?)');
        foreach ($ids as $tid) {
            $ok = $db->prepare('SELECT id FROM tiles WHERE id = ?');
            $ok->execute([$tid]);
            if ($ok->fetch()) {
                $ins->execute([$roleId, $tid, $now, $now]);
            }
        }
        return $ids;
    }
    if ($widgets) {
        $valid = mcpAdminValidWidgetIds($db);
        $db->prepare('DELETE FROM role_widget_permissions WHERE role_id = ?')->execute([$roleId]);
        $ins = $db->prepare('INSERT INTO role_widget_permissions (role_id, widget_id, can_view, created_at, updated_at) VALUES (?, ?, 1, ?, ?)');
        $kept = [];
        foreach ($ids as $wid) {
            if (in_array($wid, $valid, true)) {
                $ins->execute([$roleId, $wid, $now, $now]);
                $kept[] = $wid;
            }
        }
        return $kept;
    }
    if ($tabs) {
        $valid = mcpAdminNavTabIds();
        $db->prepare('DELETE FROM role_tab_permissions WHERE role_id = ?')->execute([$roleId]);
        $ins = $db->prepare('INSERT INTO role_tab_permissions (role_id, tab_id, can_view, created_at, updated_at) VALUES (?, ?, 1, ?, ?)');
        $kept = [];
        foreach ($ids as $tid) {
            if (in_array($tid, $valid, true)) {
                $ins->execute([$roleId, $tid, $now, $now]);
                $kept[] = $tid;
            }
        }
        return $kept;
    }
    return $ids;
}

function mcpAdminSetRoleSpaces(array $args): array {
    $db = getDB();
    $role = mcpAdminFindRole($db, $args);
    if (!$role) {
        return ['error' => 'Role not found'];
    }
    $raw = isset($args['space_ids']) && is_array($args['space_ids']) ? $args['space_ids'] : [];
    $resolved = mcpAdminResolveSpaceIds($db, $raw);
    $current = [];
    $stmt = $db->prepare('SELECT tile_id FROM role_tile_permissions WHERE role_id = ?');
    $stmt->execute([$role['id']]);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $current[] = $row['tile_id'];
    }
    $mode = (string)($args['mode'] ?? 'add');
    $next = mcpAdminMergeIds($current, $resolved['ids'], $mode);
    $db->beginTransaction();
    try {
        mcpAdminReplaceRoleColumn($db, (int)$role['id'], 'role_tile_permissions', 'tile_id', $next);
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        return ['error' => $e->getMessage()];
    }
    $out = mcpAdminGetRole(['role_id' => (int)$role['id']]);
    if ($resolved['notes'] !== []) {
        $out['warnings'] = $resolved['notes'];
    }
    $out['ok'] = true;
    $out['mode'] = $mode;
    return $out;
}

function mcpAdminSetRoleWidgets(array $args): array {
    $db = getDB();
    $role = mcpAdminFindRole($db, $args);
    if (!$role) {
        return ['error' => 'Role not found'];
    }
    $incoming = isset($args['widget_ids']) && is_array($args['widget_ids']) ? $args['widget_ids'] : [];
    $current = [];
    $stmt = $db->prepare('SELECT widget_id FROM role_widget_permissions WHERE role_id = ?');
    $stmt->execute([$role['id']]);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $current[] = $row['widget_id'];
    }
    $mode = (string)($args['mode'] ?? 'add');
    $next = mcpAdminMergeIds($current, $incoming, $mode);
    $db->beginTransaction();
    try {
        mcpAdminReplaceRoleColumn($db, (int)$role['id'], 'role_widget_permissions', 'widget_id', $next, true, false);
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        return ['error' => $e->getMessage()];
    }
    $out = mcpAdminGetRole(['role_id' => (int)$role['id']]);
    $out['ok'] = true;
    $out['mode'] = $mode;
    return $out;
}

function mcpAdminSetRoleTabs(array $args): array {
    $db = getDB();
    $role = mcpAdminFindRole($db, $args);
    if (!$role) {
        return ['error' => 'Role not found'];
    }
    $incoming = isset($args['tab_ids']) && is_array($args['tab_ids']) ? $args['tab_ids'] : [];
    $current = [];
    $stmt = $db->prepare('SELECT tab_id FROM role_tab_permissions WHERE role_id = ?');
    $stmt->execute([$role['id']]);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $current[] = $row['tab_id'];
    }
    $mode = (string)($args['mode'] ?? 'add');
    $next = mcpAdminMergeIds($current, $incoming, $mode);
    $db->beginTransaction();
    try {
        mcpAdminReplaceRoleColumn($db, (int)$role['id'], 'role_tab_permissions', 'tab_id', $next, false, true);
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        return ['error' => $e->getMessage()];
    }
    $out = mcpAdminGetRole(['role_id' => (int)$role['id']]);
    $out['ok'] = true;
    $out['mode'] = $mode;
    return $out;
}

function mcpAdminFindTeam(PDO $db, array $args): ?array {
    $id = isset($args['team_id']) ? (int)$args['team_id'] : 0;
    $name = trim((string)($args['team_name'] ?? ''));
    if ($id > 0) {
        $stmt = $db->prepare('SELECT * FROM user_groups WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }
    if ($name !== '') {
        $stmt = $db->prepare('SELECT * FROM user_groups WHERE LOWER(name) = LOWER(?)');
        $stmt->execute([$name]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }
    return null;
}

function mcpAdminListTeams(): array {
    $db = getDB();
    try {
        $stmt = $db->query('
        SELECT ug.*,
            COUNT(DISTINCT ugm.user_id) as member_count,
            COUNT(DISTINCT gr.role_id) as role_count
        FROM user_groups ug
        LEFT JOIN user_group_members ugm ON ug.id = ugm.group_id
        LEFT JOIN group_roles gr ON ug.id = gr.group_id
        GROUP BY ug.id
        ORDER BY ug.name
    ');
    $teams = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $roles = [];
        $rstmt = $db->prepare('SELECT r.id, r.name FROM group_roles gr JOIN roles r ON r.id = gr.role_id WHERE gr.group_id = ?');
        $rstmt->execute([$row['id']]);
        while ($r = $rstmt->fetch(PDO::FETCH_ASSOC)) {
            $roles[] = ['id' => (int)$r['id'], 'name' => $r['name']];
        }
        $teams[] = [
            'id' => (int)$row['id'],
            'name' => $row['name'],
            'description' => $row['description'] ?? null,
            'memberCount' => (int)$row['member_count'],
            'roleCount' => (int)$row['role_count'],
            'roles' => $roles,
        ];
    }
        return ['count' => count($teams), 'teams' => $teams];
    } catch (Throwable $e) {
        return ['error' => 'Teams are not available: ' . $e->getMessage()];
    }
}

function mcpAdminAssignTeamRoles(array $args): array {
    $db = getDB();
    $team = mcpAdminFindTeam($db, $args);
    if (!$team) {
        return ['error' => 'Team not found'];
    }
    $incoming = mcpAdminRoleIdsFromArgs($db, $args);
    $current = [];
    $stmt = $db->prepare('SELECT role_id FROM group_roles WHERE group_id = ?');
    $stmt->execute([$team['id']]);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $current[] = (int)$row['role_id'];
    }
    $mode = (string)($args['mode'] ?? 'add');
    $next = mcpAdminMergeIntIds($current, $incoming, $mode);
    $now = time();
    $db->beginTransaction();
    try {
        $db->prepare('DELETE FROM group_roles WHERE group_id = ?')->execute([$team['id']]);
        $ins = $db->prepare('INSERT INTO group_roles (group_id, role_id, created_at) VALUES (?, ?, ?)');
        foreach ($next as $rid) {
            $ok = $db->prepare('SELECT id FROM roles WHERE id = ?');
            $ok->execute([$rid]);
            if ($ok->fetch()) {
                $ins->execute([$team['id'], $rid, $now]);
            }
        }
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        return ['error' => $e->getMessage()];
    }
    return ['ok' => true, 'mode' => $mode, 'team_id' => (int)$team['id'], 'role_ids' => $next];
}

function mcpAdminAddTeamMembers(array $args, array $actor): array {
    $db = getDB();
    $team = mcpAdminFindTeam($db, $args);
    if (!$team) {
        return ['error' => 'Team not found'];
    }
    $ids = [];
    if (isset($args['user_ids']) && is_array($args['user_ids'])) {
        foreach ($args['user_ids'] as $id) {
            $ids[] = (int)$id;
        }
    }
    if (isset($args['usernames']) && is_array($args['usernames'])) {
        foreach ($args['usernames'] as $un) {
            $found = mcpAdminFindUser($db, ['username' => $un]);
            if ($found) {
                $ids[] = (int)$found['id'];
            }
        }
    }
    $ids = array_values(array_unique(array_filter($ids)));
    if ($ids === []) {
        return ['error' => 'user_ids or usernames required'];
    }
    $now = time();
    $added = 0;
    $ins = $db->prepare('INSERT OR IGNORE INTO user_group_members (user_id, group_id, created_at) VALUES (?, ?, ?)');
    foreach ($ids as $uid) {
        $u = $db->prepare('SELECT id, username FROM users WHERE id = ?');
        $u->execute([$uid]);
        $member = $u->fetch(PDO::FETCH_ASSOC);
        if (!$member) {
            continue;
        }
        $ins->execute([$uid, $team['id'], $now]);
        if ($ins->rowCount() > 0) {
            $added++;
            if (function_exists('logUserAudit')) {
                logUserAudit('user.group_added', [
                    'actor' => $actor,
                    'target_user_id' => $uid,
                    'target_username' => $member['username'],
                    'details' => ['group' => $team['name'], 'via' => 'mcp'],
                ]);
            }
        }
    }
    return ['ok' => true, 'team_id' => (int)$team['id'], 'added' => $added];
}

function mcpAdminListSpaceEditors(array $args): array {
    $db = getDB();
    $sql = 'SELECT utp.user_id, utp.tile_id, utp.can_view, utp.can_edit, u.username, t.title as space_title
            FROM user_tile_permissions utp
            JOIN users u ON u.id = utp.user_id
            JOIN tiles t ON t.id = utp.tile_id
            WHERE 1=1';
    $params = [];
    if (!empty($args['space_id'])) {
        $sql .= ' AND utp.tile_id = ?';
        $params[] = $args['space_id'];
    }
    if (!empty($args['user_id'])) {
        $sql .= ' AND utp.user_id = ?';
        $params[] = (int)$args['user_id'];
    }
    $sql .= ' ORDER BY u.username, t.title';
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $editors = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $editors[] = [
            'userId' => (int)$row['user_id'],
            'username' => $row['username'],
            'spaceId' => $row['tile_id'],
            'spaceTitle' => $row['space_title'],
            'canView' => !empty($row['can_view']),
            'canEdit' => !empty($row['can_edit']),
        ];
    }
    return ['count' => count($editors), 'editors' => $editors];
}

function mcpAdminSetSpaceEditor(array $args): array {
    $db = getDB();
    $user = mcpAdminFindUser($db, $args);
    if (!$user) {
        return ['error' => 'User not found'];
    }
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
    $canEdit = array_key_exists('can_edit', $args) ? !empty($args['can_edit']) : true;
    if (!$canEdit) {
        $db->prepare('DELETE FROM user_tile_permissions WHERE user_id = ? AND tile_id = ?')->execute([$user['id'], $tileId]);
        return ['ok' => true, 'removed' => true, 'user_id' => (int)$user['id'], 'space_id' => $tileId];
    }
    $canView = array_key_exists('can_view', $args) ? (int)!empty($args['can_view']) : 1;
    $canAdd = array_key_exists('can_add_links', $args) ? (int)!empty($args['can_add_links']) : 1;
    $canEditLinks = array_key_exists('can_edit_links', $args) ? (int)!empty($args['can_edit_links']) : 1;
    $now = time();
    $check = $db->prepare('SELECT user_id FROM user_tile_permissions WHERE user_id = ? AND tile_id = ?');
    $check->execute([$user['id'], $tileId]);
    if ($check->fetch()) {
        $db->prepare('UPDATE user_tile_permissions SET can_view = ?, can_edit = 1, can_add_links = ?, can_edit_links = ?, can_edit_tile = 1, updated_at = ? WHERE user_id = ? AND tile_id = ?')
            ->execute([$canView, $canAdd, $canEditLinks, $now, $user['id'], $tileId]);
    } else {
        $db->prepare('INSERT INTO user_tile_permissions (user_id, tile_id, can_view, can_edit, can_delete, can_add_links, can_add_sections, can_add_tabs, can_edit_links, can_delete_links, can_delete_sections, can_delete_tabs, can_change_visibility, can_change_browser, can_clone_tile, can_view_tile_info, can_edit_tile, created_at, updated_at)
            VALUES (?, ?, ?, 1, 0, ?, 1, 1, ?, 0, 0, 0, 0, 0, 0, 1, 1, ?, ?)')
            ->execute([$user['id'], $tileId, $canView, $canAdd, $canEditLinks, $now, $now]);
    }
    return ['ok' => true, 'user_id' => (int)$user['id'], 'space_id' => $tileId, 'can_edit' => true];
}

function mcpAdminArgIsTrue($value): bool
{
    return $value === true || $value === 1 || $value === '1'
        || (is_string($value) && strtolower(trim($value)) === 'true');
}

function mcpAdminGetDatabaseInfo(): array
{
    return linknestGetDatabaseInfo();
}

/**
 * SQLite maintenance. Read path allows status/integrity; write path allows all actions.
 *
 * @param array<string,mixed> $args
 * @param array<string,mixed> $user
 * @return array<string,mixed>
 */
function mcpAdminMaintainDatabase(array $args, array $user): array
{
    $action = strtolower(trim((string)($args['action'] ?? 'status')));
    if ($action === '') {
        $action = 'status';
    }

    $readOnlyActions = ['status', 'integrity'];
    if (!in_array($action, linknestMaintainAllowedActions(), true)) {
        return [
            'error' => 'Invalid action. Allowed: ' . implode(', ', linknestMaintainAllowedActions()),
        ];
    }

    try {
        $result = linknestMaintainRun(getDB(), $action);
    } catch (Throwable $e) {
        return ['error' => 'Maintenance failed: ' . $e->getMessage()];
    }

    if (function_exists('logUserAudit') && !in_array($action, $readOnlyActions, true)) {
        logUserAudit('mcp.database_maintain', [
            'actor' => $user,
            'details' => [
                'action' => $action,
                'success' => !empty($result['success']),
            ],
        ]);
    }

    // Keep payload compact for chat — drop huge index name lists unless short
    if (isset($result['indexesCreated']) && is_array($result['indexesCreated']) && count($result['indexesCreated']) > 20) {
        $result['indexes_created_count'] = count($result['indexesCreated']);
        unset($result['indexesCreated']);
    }
    if (isset($result['indexes_skipped_list']) && is_array($result['indexes_skipped_list']) && count($result['indexes_skipped_list']) > 20) {
        unset($result['indexes_skipped_list']);
    }

    return $result;
}

function mcpAdminListDatabaseExports(): array
{
    return linknestListDatabaseExports();
}

function mcpAdminExportDatabase(array $args, array $user): array
{
    $filename = trim((string)($args['filename'] ?? ''));
    try {
        $result = linknestWriteDatabaseExportFile(getDB(), $filename !== '' ? $filename : null);
    } catch (InvalidArgumentException $e) {
        return ['error' => $e->getMessage()];
    } catch (Throwable $e) {
        return ['error' => 'Failed to export database: ' . $e->getMessage()];
    }
    if (function_exists('logUserAudit')) {
        logUserAudit('mcp.database_export', [
            'actor' => $user,
            'details' => [
                'filename' => $result['filename'] ?? null,
                'size' => $result['size'] ?? null,
            ],
        ]);
    }
    return $result;
}

function mcpAdminImportDatabase(array $args, array $user): array
{
    if (!mcpAdminArgIsTrue($args['confirm'] ?? false)) {
        return ['error' => 'Import refused. Pass confirm=true. This replaces all users, spaces, settings, and related tables.'];
    }
    $filename = trim((string)($args['filename'] ?? ''));
    if ($filename === '') {
        return ['error' => 'filename is required (a .json file in data/exports). Call list_database_exports first.'];
    }
    $backupFirst = array_key_exists('backup_first', $args)
        ? mcpAdminArgIsTrue($args['backup_first'])
        : true;

    $db = getDB();
    $backup = null;
    try {
        if ($backupFirst) {
            $backup = linknestWriteDatabaseExportFile($db, null);
        }
        $result = linknestImportDatabaseFromExportFile($db, $filename);
    } catch (InvalidArgumentException $e) {
        return ['error' => $e->getMessage(), 'backup' => $backup];
    } catch (Throwable $e) {
        return ['error' => 'Failed to import database: ' . $e->getMessage(), 'backup' => $backup];
    }

    $result['backup'] = $backup;
    $result['note'] = 'Live database replaced. MCP tokens are not part of the JSON export; call whoami. Do not paste export file contents into chat.';
    if (function_exists('logUserAudit')) {
        logUserAudit('mcp.database_import', [
            'actor' => $user,
            'details' => [
                'filename' => $result['filename'] ?? $filename,
                'backup' => is_array($backup) ? ($backup['filename'] ?? null) : null,
            ],
        ]);
    }
    return $result;
}

require_once __DIR__ . '/mcp_user_lib.php';
require_once __DIR__ . '/mcp_device_presets_lib.php';
