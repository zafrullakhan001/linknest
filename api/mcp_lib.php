<?php
/**
 * LinkNest MCP protocol helpers and tools.
 */

const MCP_SUPPORTED_PROTOCOL_VERSIONS = [
    '2025-11-25',
    '2025-06-18',
    '2025-03-26',
    '2024-11-05',
];
const MCP_DEFAULT_PROTOCOL_VERSION = '2025-03-26';
const MCP_SERVER_NAME = 'linknest';

function mcpIsJsonRpcBatch(array $decoded): bool {
    if ($decoded === []) {
        return true;
    }
    return array_keys($decoded) === range(0, count($decoded) - 1);
}

function mcpSendJson($data): void {
    if (!headers_sent()) {
        http_response_code(200);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
    }
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function mcpHttpJsonRpcError($id, int $code, string $message, int $http = 400): void {
    http_response_code($http);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'jsonrpc' => '2.0',
        'id' => $id,
        'error' => ['code' => $code, 'message' => $message],
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function mcpResult($id, $result): array {
    return ['jsonrpc' => '2.0', 'id' => $id, 'result' => $result];
}

function mcpError($id, int $code, string $message, $data = null): array {
    $error = ['code' => $code, 'message' => $message];
    if ($data !== null) {
        $error['data'] = $data;
    }
    return ['jsonrpc' => '2.0', 'id' => $id, 'error' => $error];
}

function mcpTextResult($id, $payload, bool $isError = false): array {
    $text = is_string($payload)
        ? $payload
        : json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    return mcpResult($id, [
        'content' => [['type' => 'text', 'text' => $text]],
        'isError' => $isError,
    ]);
}

function mcpHasWriteScope(array $user): bool {
    $scopes = $user['_mcp_scopes'] ?? ['read'];
    return in_array('write', $scopes, true);
}

require_once __DIR__ . '/mcp_admin_lib.php';

function mcpAppVersion(): string {
    $pkg = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'package.json';
    if (is_readable($pkg)) {
        $json = json_decode((string)file_get_contents($pkg), true);
        if (is_array($json) && !empty($json['version'])) {
            return (string)$json['version'];
        }
    }
    return '2.3.8';
}

function mcpNegotiateProtocolVersion(?string $requested): string {
    $requested = trim((string)$requested);
    if ($requested !== '' && in_array($requested, MCP_SUPPORTED_PROTOCOL_VERSIONS, true)) {
        return $requested;
    }
    return MCP_DEFAULT_PROTOCOL_VERSION;
}

/**
 * @param array<string, mixed> $message
 * @param array<string, mixed> $user
 * @return array<string, mixed>|null Null for notifications (no JSON-RPC response)
 */
function mcpHandleMessage(array $message, array $user): ?array {
    if (($message['jsonrpc'] ?? '') !== '2.0') {
        $id = $message['id'] ?? null;
        if (!array_key_exists('id', $message)) {
            return null;
        }
        return mcpError($id, -32600, 'Invalid Request: jsonrpc must be "2.0"');
    }

    $method = isset($message['method']) ? (string)$message['method'] : '';
    $id = $message['id'] ?? null;
    $params = isset($message['params']) && is_array($message['params']) ? $message['params'] : [];
    $isNotification = !array_key_exists('id', $message);

    switch ($method) {
        case 'initialize':
            if ($isNotification) {
                return null;
            }
            $protocol = mcpNegotiateProtocolVersion($params['protocolVersion'] ?? null);
            return mcpResult($id, [
                'protocolVersion' => $protocol,
                'capabilities' => [
                    'tools' => ['listChanged' => false],
                    'resources' => ['subscribe' => false, 'listChanged' => false],
                    'prompts' => ['listChanged' => false],
                ],
                'serverInfo' => [
                    'name' => MCP_SERVER_NAME,
                    'title' => 'LinkNest',
                    'version' => mcpAppVersion(),
                ],
                'instructions' => 'LinkNest organizes links into spaces (tiles), each with tabs and sections. Start with whoami. Use list_spaces and search_links for bookmarks. Write tools need the write scope. Admin tokens (admin user + admin scope) can call get_auth_status, list_users, list_roles, list_device_presets, get_database_info, export_database, and guarded LDAP/SAML, Access Manager, and Device Presets tools. import_database is destructive and needs write plus confirm=true. replace_device_presets and reset_device_presets also need confirm=true. Assign tools default to mode add so they do not wipe existing grants.',
            ]);

        case 'notifications/initialized':
        case 'notifications/cancelled':
            return null;

        case 'ping':
            if ($isNotification) {
                return null;
            }
            return mcpResult($id, new stdClass());

        case 'tools/list':
            if ($isNotification) {
                return null;
            }
            return mcpResult($id, ['tools' => mcpToolsList($user)]);

        case 'tools/call':
            if ($isNotification) {
                return null;
            }
            $name = isset($params['name']) ? (string)$params['name'] : '';
            $args = isset($params['arguments']) && is_array($params['arguments']) ? $params['arguments'] : [];
            return mcpCallTool($id, $name, $args, $user);

        case 'resources/list':
            if ($isNotification) {
                return null;
            }
            return mcpResult($id, ['resources' => mcpResourcesList($user)]);

        case 'resources/read':
            if ($isNotification) {
                return null;
            }
            $uri = isset($params['uri']) ? (string)$params['uri'] : '';
            return mcpReadResource($id, $uri, $user);

        case 'resources/templates/list':
            if ($isNotification) {
                return null;
            }
            return mcpResult($id, [
                'resourceTemplates' => [
                    [
                        'uriTemplate' => 'linknest://space/{id}',
                        'name' => 'space',
                        'title' => 'LinkNest space',
                        'description' => 'A space (tile) with tabs, sections, and links',
                        'mimeType' => 'application/json',
                    ],
                ],
            ]);

        case 'prompts/list':
            if ($isNotification) {
                return null;
            }
            return mcpResult($id, ['prompts' => mcpPromptsList()]);

        case 'prompts/get':
            if ($isNotification) {
                return null;
            }
            return mcpGetPrompt($id, isset($params['name']) ? (string)$params['name'] : '', $params['arguments'] ?? []);

        default:
            if ($isNotification) {
                return null;
            }
            return mcpError($id, -32601, 'Method not found: ' . $method);
    }
}

function mcpToolsList(array $user): array {
    $read = [
        [
            'name' => 'whoami',
            'description' => 'Return the LinkNest user bound to this MCP token (id, username, admin flag, token scopes including admin, hasAdminTools).',
            'inputSchema' => ['type' => 'object', 'properties' => new stdClass(), 'additionalProperties' => false],
        ],
        [
            'name' => 'list_spaces',
            'description' => 'List spaces (tiles) the token user can see. Returns id, title, emoji, description, category, visibility, and link count. Use query to filter by title/category.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'query' => ['type' => 'string', 'description' => 'Optional case-insensitive filter on title, description, or category'],
                    'limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 200, 'description' => 'Max spaces to return (default 50)'],
                ],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'get_space',
            'description' => 'Get one space including tabs, sections, and links. Omit htmlContent unless include_html is true.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'space_id' => ['type' => 'string', 'description' => 'Space (tile) UUID'],
                    'include_html' => ['type' => 'boolean', 'description' => 'Include htmlContent (can be large)'],
                ],
                'required' => ['space_id'],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'search_links',
            'description' => 'Search links across accessible spaces by label, URL, notes, or space title.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'query' => ['type' => 'string', 'description' => 'Search text'],
                    'limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 100, 'description' => 'Max results (default 25)'],
                ],
                'required' => ['query'],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'list_categories',
            'description' => 'List space categories (groups) visible to this user.',
            'inputSchema' => ['type' => 'object', 'properties' => new stdClass(), 'additionalProperties' => false],
        ],
        [
            'name' => 'list_notes',
            'description' => 'List personal notes for the token user, optionally filtered by tab name.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'tab_name' => ['type' => 'string', 'description' => 'Optional notes tab (e.g. General)'],
                ],
                'additionalProperties' => false,
            ],
        ],
    ];

    $tools = $read;
    if (function_exists('mcpHasAdminScope') && mcpHasAdminScope($user)) {
        $tools = array_merge($tools, mcpAdminReadTools());
    }

    if (!mcpHasWriteScope($user)) {
        return $tools;
    }

    $write = [
        [
            'name' => 'create_space',
            'description' => 'Create a new space. Optionally seed it with links (tab/section default to General / Links).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'title' => ['type' => 'string'],
                    'description' => ['type' => 'string'],
                    'emoji' => ['type' => 'string'],
                    'group' => ['type' => 'string', 'description' => 'Category name (default General)'],
                    'visibility' => ['type' => 'string', 'enum' => ['public', 'authenticated', 'private']],
                    'theme_color' => ['type' => 'string'],
                    'links' => [
                        'type' => 'array',
                        'items' => [
                            'type' => 'object',
                            'properties' => [
                                'label' => ['type' => 'string'],
                                'url' => ['type' => 'string'],
                                'notes' => ['type' => 'string'],
                                'tab' => ['type' => 'string'],
                                'section' => ['type' => 'string'],
                            ],
                            'required' => ['label', 'url'],
                        ],
                    ],
                ],
                'required' => ['title'],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'update_space',
            'description' => 'Update space title, description, emoji, category, or visibility.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'space_id' => ['type' => 'string'],
                    'title' => ['type' => 'string'],
                    'description' => ['type' => 'string'],
                    'emoji' => ['type' => 'string'],
                    'group' => ['type' => 'string'],
                    'visibility' => ['type' => 'string', 'enum' => ['public', 'authenticated', 'private']],
                ],
                'required' => ['space_id'],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'add_link',
            'description' => 'Add a link to a space. Creates the tab and section if they do not exist.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'space_id' => ['type' => 'string'],
                    'label' => ['type' => 'string'],
                    'url' => ['type' => 'string'],
                    'notes' => ['type' => 'string'],
                    'icon' => ['type' => 'string'],
                    'tab' => ['type' => 'string', 'description' => 'Tab title (default: first tab or General)'],
                    'section' => ['type' => 'string', 'description' => 'Section title (default: first section or Links)'],
                ],
                'required' => ['space_id', 'label', 'url'],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'update_link',
            'description' => 'Update a link label, URL, or notes.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'link_id' => ['type' => 'string'],
                    'label' => ['type' => 'string'],
                    'url' => ['type' => 'string'],
                    'notes' => ['type' => 'string'],
                ],
                'required' => ['link_id'],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'delete_link',
            'description' => 'Permanently delete a link.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'link_id' => ['type' => 'string'],
                ],
                'required' => ['link_id'],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'delete_space',
            'description' => 'Move a space to the recycle bin (soft delete).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'space_id' => ['type' => 'string'],
                ],
                'required' => ['space_id'],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'create_note',
            'description' => 'Create a personal note for the token user.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'content' => ['type' => 'string'],
                    'tab_name' => ['type' => 'string', 'description' => 'Notes tab (default General)'],
                ],
                'required' => ['content'],
                'additionalProperties' => false,
            ],
        ],
        [
            'name' => 'update_note',
            'description' => 'Update a personal note.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'note_id' => ['type' => 'integer'],
                    'content' => ['type' => 'string'],
                    'tab_name' => ['type' => 'string'],
                ],
                'required' => ['note_id'],
                'additionalProperties' => false,
            ],
        ],
    ];

    $tools = array_merge($tools, $write);
    if (function_exists('mcpHasAdminScope') && mcpHasAdminScope($user)) {
        $tools = array_merge($tools, mcpAdminWriteTools());
    }
    return $tools;
}

function mcpCallTool($id, string $name, array $args, array $user): array {
    $writeTools = [
        'create_space', 'update_space', 'add_link', 'update_link',
        'delete_link', 'delete_space', 'create_note', 'update_note',
    ];
    if (in_array($name, $writeTools, true) && !mcpHasWriteScope($user)) {
        return mcpTextResult($id, ['error' => 'This token is read-only. Create a token with write scope.'], true);
    }

    try {
        switch ($name) {
            case 'whoami':
                return mcpTextResult($id, mcpToolWhoami($user));
            case 'list_spaces':
                return mcpTextResult($id, mcpToolListSpaces($user, $args));
            case 'get_space':
                return mcpTextResult($id, mcpToolGetSpace($user, $args));
            case 'search_links':
                return mcpTextResult($id, mcpToolSearchLinks($user, $args));
            case 'list_categories':
                return mcpTextResult($id, mcpToolListCategories($user));
            case 'list_notes':
                return mcpTextResult($id, mcpToolListNotes($user, $args));
            case 'create_space':
                return mcpTextResult($id, mcpToolCreateSpace($user, $args));
            case 'update_space':
                return mcpTextResult($id, mcpToolUpdateSpace($user, $args));
            case 'add_link':
                return mcpTextResult($id, mcpToolAddLink($user, $args));
            case 'update_link':
                return mcpTextResult($id, mcpToolUpdateLink($user, $args));
            case 'delete_link':
                return mcpTextResult($id, mcpToolDeleteLink($user, $args));
            case 'delete_space':
                return mcpTextResult($id, mcpToolDeleteSpace($user, $args));
            case 'create_note':
                return mcpTextResult($id, mcpToolCreateNote($user, $args));
            case 'update_note':
                return mcpTextResult($id, mcpToolUpdateNote($user, $args));
            default:
                if (function_exists('mcpHasAdminScope') && mcpHasAdminScope($user) && function_exists('mcpAdminDispatch')) {
                    $admin = mcpAdminDispatch($name, $args, $user);
                    if (!isset($admin['error']) || $admin['error'] !== 'Unknown admin tool: ' . $name) {
                        $isErr = isset($admin['error']);
                        return mcpTextResult($id, $admin, $isErr);
                    }
                }
                return mcpError($id, -32602, 'Unknown tool: ' . $name);
        }
    } catch (Throwable $e) {
        error_log('MCP tool ' . $name . ': ' . $e->getMessage());
        return mcpTextResult($id, ['error' => $e->getMessage()], true);
    }
}

function mcpResourcesList(array $user): array {
    $spaces = mcpToolListSpaces($user, ['limit' => 50]);
    $resources = [
        [
            'uri' => 'linknest://catalog',
            'name' => 'catalog',
            'title' => 'Space catalog',
            'description' => 'Summary of spaces visible to this token',
            'mimeType' => 'application/json',
        ],
    ];
    foreach (($spaces['spaces'] ?? []) as $space) {
        $resources[] = [
            'uri' => 'linknest://space/' . $space['id'],
            'name' => $space['title'] ?? $space['id'],
            'title' => ($space['emoji'] ?? '') . ' ' . ($space['title'] ?? $space['id']),
            'description' => $space['description'] ?? '',
            'mimeType' => 'application/json',
        ];
    }
    return $resources;
}

function mcpReadResource($id, string $uri, array $user): array {
    if ($uri === 'linknest://catalog') {
        $body = json_encode(mcpToolListSpaces($user, ['limit' => 100]), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        return mcpResult($id, [
            'contents' => [[
                'uri' => $uri,
                'mimeType' => 'application/json',
                'text' => $body,
            ]],
        ]);
    }
    if (preg_match('#^linknest://space/([^/]+)$#', $uri, $m)) {
        $space = mcpToolGetSpace($user, ['space_id' => $m[1]]);
        if (isset($space['error'])) {
            return mcpError($id, -32002, (string)$space['error']);
        }
        return mcpResult($id, [
            'contents' => [[
                'uri' => $uri,
                'mimeType' => 'application/json',
                'text' => json_encode($space, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            ]],
        ]);
    }
    return mcpError($id, -32002, 'Unknown resource URI: ' . $uri);
}

function mcpPromptsList(): array {
    return [
        [
            'name' => 'find_a_link',
            'title' => 'Find a link',
            'description' => 'Search LinkNest for a bookmark matching the user request',
            'arguments' => [
                ['name' => 'query', 'description' => 'What to look for', 'required' => true],
            ],
        ],
        [
            'name' => 'add_bookmark',
            'title' => 'Add a bookmark',
            'description' => 'Save a URL into the right space / tab / section',
            'arguments' => [
                ['name' => 'url', 'description' => 'URL to save', 'required' => true],
                ['name' => 'label', 'description' => 'Link title', 'required' => false],
                ['name' => 'space', 'description' => 'Target space title if known', 'required' => false],
            ],
        ],
        [
            'name' => 'summarize_space',
            'title' => 'Summarize a space',
            'description' => 'Summarize the links inside a space',
            'arguments' => [
                ['name' => 'space', 'description' => 'Space title or id', 'required' => true],
            ],
        ],
    ];
}

function mcpGetPrompt($id, string $name, $arguments): array {
    $args = is_array($arguments) ? $arguments : [];
    if ($name === 'find_a_link') {
        $q = trim((string)($args['query'] ?? ''));
        $text = "Search LinkNest for links matching: {$q}\nUse search_links, then cite the space, tab, section, label, and URL.";
    } elseif ($name === 'add_bookmark') {
        $url = trim((string)($args['url'] ?? ''));
        $label = trim((string)($args['label'] ?? ''));
        $space = trim((string)($args['space'] ?? ''));
        $text = "Save this bookmark in LinkNest.\nURL: {$url}\nLabel: " . ($label !== '' ? $label : '(infer from the URL)') . "\nPreferred space: " . ($space !== '' ? $space : '(pick the best existing space, or create one)') . "\nUse list_spaces / search_links first, then add_link or create_space. Confirm where it was saved.";
    } elseif ($name === 'summarize_space') {
        $space = trim((string)($args['space'] ?? ''));
        $text = "Summarize the LinkNest space \"{$space}\": list tabs, section counts, and notable links. Use list_spaces then get_space.";
    } else {
        return mcpError($id, -32602, 'Unknown prompt: ' . $name);
    }
    return mcpResult($id, [
        'description' => $name,
        'messages' => [
            ['role' => 'user', 'content' => ['type' => 'text', 'text' => $text]],
        ],
    ]);
}

function mcpUserGroupIds(PDO $db, array $user): array {
    $ids = [];
    $stmt = $db->prepare('SELECT group_id FROM user_group_members WHERE user_id = ?');
    $stmt->execute([(int)$user['id']]);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $ids[] = (int)$row['group_id'];
    }
    return $ids;
}

function mcpTileIsVisible(PDO $db, array $user, array $row, array $groupIds): bool {
    if (!empty($user['is_admin'])) {
        return true;
    }
    $sourceTab = isset($row['source_tab']) ? trim((string)$row['source_tab']) : 'public';
    $hasRole = canUserViewTileByRole((int)$user['id'], (string)$row['id'], $db);
    if ($sourceTab === 'staging' && !$hasRole) {
        return false;
    }
    if (!canUserSeePublishedContent($user, $row)) {
        return false;
    }
    if (canUserSeeByVisibility($user, $row, $groupIds)) {
        return true;
    }
    if (isset($row['user_id']) && (int)$row['user_id'] === (int)$user['id']) {
        return true;
    }
    if ($hasRole) {
        return true;
    }
    $share = $db->prepare('SELECT id FROM tile_share_invitations WHERE tile_id = ? AND receiver_user_id = ? AND status = ?');
    $share->execute([$row['id'], $user['id'], 'accepted']);
    return (bool)$share->fetch();
}

function mcpCanEditSpace(PDO $db, array $user, string $tileId): bool {
    if (!empty($user['is_admin'])) {
        return true;
    }
    $perm = $db->prepare('SELECT can_edit FROM user_tile_permissions WHERE user_id = ? AND tile_id = ?');
    $perm->execute([(int)$user['id'], $tileId]);
    $row = $perm->fetch(PDO::FETCH_ASSOC);
    if ($row !== false) {
        return (bool)$row['can_edit'];
    }
    $owner = $db->prepare('SELECT user_id FROM tiles WHERE id = ?');
    $owner->execute([$tileId]);
    $tile = $owner->fetch(PDO::FETCH_ASSOC);
    return $tile && isset($tile['user_id']) && (int)$tile['user_id'] === (int)$user['id'];
}

function mcpCanDeleteSpace(PDO $db, array $user, string $tileId): bool {
    if (!empty($user['is_admin'])) {
        return true;
    }
    $perm = $db->prepare('SELECT can_delete FROM user_tile_permissions WHERE user_id = ? AND tile_id = ?');
    $perm->execute([(int)$user['id'], $tileId]);
    $row = $perm->fetch(PDO::FETCH_ASSOC);
    if ($row !== false) {
        return (bool)$row['can_delete'];
    }
    $owner = $db->prepare('SELECT user_id FROM tiles WHERE id = ?');
    $owner->execute([$tileId]);
    $tile = $owner->fetch(PDO::FETCH_ASSOC);
    return $tile && isset($tile['user_id']) && (int)$tile['user_id'] === (int)$user['id'];
}

function mcpLoadVisibleTileRow(PDO $db, array $user, string $tileId): ?array {
    $stmt = $db->prepare('SELECT * FROM tiles WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$tileId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return null;
    }
    $groups = mcpUserGroupIds($db, $user);
    if (!mcpTileIsVisible($db, $user, $row, $groups)) {
        return null;
    }
    return $row;
}

function mcpLikeEscape(string $value): string {
    return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value);
}

function mcpIsSafeUrl(string $url): bool {
    $url = trim($url);
    if ($url === '' || strlen($url) > 4000) {
        return false;
    }
    if (preg_match('#^(javascript|data|vbscript):#i', $url)) {
        return false;
    }
    return true;
}

function mcpToolWhoami(array $user): array {
    return [
        'id' => (int)$user['id'],
        'username' => $user['username'],
        'displayName' => $user['display_name'] ?? null,
        'isAdmin' => !empty($user['is_admin']),
        'scopes' => $user['_mcp_scopes'] ?? ['read'],
        'hasAdminTools' => function_exists('mcpHasAdminScope') && mcpHasAdminScope($user),
        'server' => ['name' => MCP_SERVER_NAME, 'version' => mcpAppVersion()],
    ];
}

function mcpToolListSpaces(array $user, array $args): array {
    $db = getDB();
    $limit = isset($args['limit']) ? max(1, min(200, (int)$args['limit'])) : 50;
    $query = trim((string)($args['query'] ?? ''));
    $stmt = $db->query('SELECT id, title, description, emoji, theme_color, "group", visibility, source_tab, published, user_id, allowed_users, allowed_groups, created_at, position FROM tiles WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY position, title');
    $groups = mcpUserGroupIds($db, $user);
    $out = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        if (!mcpTileIsVisible($db, $user, $row, $groups)) {
            continue;
        }
        if ($query !== '') {
            $hay = strtolower(($row['title'] ?? '') . ' ' . ($row['description'] ?? '') . ' ' . ($row['group'] ?? ''));
            if (strpos($hay, strtolower($query)) === false) {
                continue;
            }
        }
        $countStmt = $db->prepare('SELECT COUNT(*) FROM links l INNER JOIN sections s ON l.section_id = s.id INNER JOIN tabs tb ON s.tab_id = tb.id WHERE tb.tile_id = ?');
        $countStmt->execute([$row['id']]);
        $out[] = [
            'id' => $row['id'],
            'title' => $row['title'],
            'emoji' => $row['emoji'] ?: '📁',
            'description' => $row['description'] ?: '',
            'group' => $row['group'] ?: 'General',
            'visibility' => $row['visibility'] ?: 'public',
            'themeColor' => $row['theme_color'] ?: 'blue',
            'linkCount' => (int)$countStmt->fetchColumn(),
            'canEdit' => mcpCanEditSpace($db, $user, $row['id']),
        ];
        if (count($out) >= $limit) {
            break;
        }
    }
    return ['count' => count($out), 'spaces' => $out];
}

function mcpToolGetSpace(array $user, array $args): array {
    $spaceId = trim((string)($args['space_id'] ?? ''));
    if ($spaceId === '') {
        return ['error' => 'space_id is required'];
    }
    $db = getDB();
    $row = mcpLoadVisibleTileRow($db, $user, $spaceId);
    if (!$row) {
        return ['error' => 'Space not found'];
    }
    $includeHtml = !empty($args['include_html']);
    $tabsStmt = $db->prepare('SELECT id, title, emoji, position FROM tabs WHERE tile_id = ? ORDER BY position, title');
    $tabsStmt->execute([$spaceId]);
    $tabs = [];
    while ($tab = $tabsStmt->fetch(PDO::FETCH_ASSOC)) {
        $secStmt = $db->prepare('SELECT id, title, emoji, position FROM sections WHERE tab_id = ? ORDER BY position, title');
        $secStmt->execute([$tab['id']]);
        $sections = [];
        while ($sec = $secStmt->fetch(PDO::FETCH_ASSOC)) {
            $linkStmt = $db->prepare('SELECT id, label, url, icon, notes, tooltip, visibility FROM links WHERE section_id = ? ORDER BY position, label');
            $linkStmt->execute([$sec['id']]);
            $links = [];
            while ($link = $linkStmt->fetch(PDO::FETCH_ASSOC)) {
                $links[] = [
                    'id' => $link['id'],
                    'label' => $link['label'],
                    'url' => $link['url'],
                    'icon' => $link['icon'] ?: null,
                    'notes' => $link['notes'] ?: null,
                    'tooltip' => $link['tooltip'] ?: null,
                    'visibility' => $link['visibility'] ?: 'public',
                ];
            }
            $sections[] = [
                'id' => $sec['id'],
                'title' => $sec['title'],
                'emoji' => $sec['emoji'] ?: null,
                'links' => $links,
            ];
        }
        $tabs[] = [
            'id' => $tab['id'],
            'title' => $tab['title'],
            'emoji' => $tab['emoji'] ?: null,
            'sections' => $sections,
        ];
    }
    $result = [
        'id' => $row['id'],
        'title' => $row['title'],
        'emoji' => $row['emoji'] ?: '📁',
        'description' => $row['description'] ?: '',
        'group' => $row['group'] ?: 'General',
        'visibility' => $row['visibility'] ?: 'public',
        'themeColor' => $row['theme_color'] ?: 'blue',
        'canEdit' => mcpCanEditSpace($db, $user, $row['id']),
        'tabs' => $tabs,
    ];
    if ($includeHtml) {
        $result['htmlContent'] = $row['html_content'] ?? '';
    }
    return $result;
}

function mcpToolSearchLinks(array $user, array $args): array {
    $query = trim((string)($args['query'] ?? ''));
    if ($query === '') {
        return ['error' => 'query is required'];
    }
    $limit = isset($args['limit']) ? max(1, min(100, (int)$args['limit'])) : 25;
    $db = getDB();
    $like = '%' . mcpLikeEscape($query) . '%';
    $sql = 'SELECT l.id AS link_id, l.label, l.url, l.notes, s.id AS section_id, s.title AS section_title,
                   tb.id AS tab_id, tb.title AS tab_title, t.id AS space_id, t.title AS space_title, t.emoji AS space_emoji,
                   t.visibility, t.source_tab, t.published, t.user_id, t.allowed_users, t.allowed_groups, t.deleted_at, t.archived_at
            FROM links l
            INNER JOIN sections s ON l.section_id = s.id
            INNER JOIN tabs tb ON s.tab_id = tb.id
            INNER JOIN tiles t ON tb.tile_id = t.id
            WHERE t.deleted_at IS NULL AND t.archived_at IS NULL
              AND (l.label LIKE ? ESCAPE \'\\\' OR l.url LIKE ? ESCAPE \'\\\' OR IFNULL(l.notes, \'\') LIKE ? ESCAPE \'\\\' OR t.title LIKE ? ESCAPE \'\\\')
            LIMIT 400';
    $stmt = $db->prepare($sql);
    $stmt->execute([$like, $like, $like, $like]);
    $groups = mcpUserGroupIds($db, $user);
    $matches = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        if (!mcpTileIsVisible($db, $user, $row, $groups)) {
            continue;
        }
        $matches[] = [
            'linkId' => $row['link_id'],
            'label' => $row['label'],
            'url' => $row['url'],
            'notes' => $row['notes'] ?: null,
            'spaceId' => $row['space_id'],
            'spaceTitle' => $row['space_title'],
            'spaceEmoji' => $row['space_emoji'] ?: '📁',
            'tab' => $row['tab_title'],
            'section' => $row['section_title'],
        ];
        if (count($matches) >= $limit) {
            break;
        }
    }
    return ['count' => count($matches), 'query' => $query, 'links' => $matches];
}

function mcpToolListCategories(array $user): array {
    $listed = mcpToolListSpaces($user, ['limit' => 200]);
    $cats = [];
    foreach ($listed['spaces'] as $space) {
        $g = $space['group'] ?: 'General';
        if (!isset($cats[$g])) {
            $cats[$g] = 0;
        }
        $cats[$g]++;
    }
    ksort($cats, SORT_NATURAL | SORT_FLAG_CASE);
    $out = [];
    foreach ($cats as $name => $count) {
        $out[] = ['name' => $name, 'spaceCount' => $count];
    }
    return ['categories' => $out];
}

function mcpToolListNotes(array $user, array $args): array {
    $db = getDB();
    $tab = trim((string)($args['tab_name'] ?? ''));
    if ($tab !== '') {
        $stmt = $db->prepare('SELECT id, tab_name, content, position, created_at, updated_at FROM user_notes WHERE user_id = ? AND tab_name = ? ORDER BY position, created_at');
        $stmt->execute([(int)$user['id'], $tab]);
    } else {
        $stmt = $db->prepare('SELECT id, tab_name, content, position, created_at, updated_at FROM user_notes WHERE user_id = ? ORDER BY tab_name, position, created_at');
        $stmt->execute([(int)$user['id']]);
    }
    $notes = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $notes[] = [
            'id' => (int)$row['id'],
            'tabName' => $row['tab_name'],
            'content' => $row['content'],
            'position' => (int)$row['position'],
            'updatedAt' => (int)$row['updated_at'],
        ];
    }
    return ['count' => count($notes), 'notes' => $notes];
}

function mcpEnsureTabSection(PDO $db, string $tileId, ?string $tabTitle, ?string $sectionTitle): array {
    $tabTitle = trim((string)$tabTitle);
    $sectionTitle = trim((string)$sectionTitle);

    $tabId = null;
    if ($tabTitle !== '') {
        $stmt = $db->prepare('SELECT id FROM tabs WHERE tile_id = ? AND LOWER(title) = LOWER(?) ORDER BY position LIMIT 1');
        $stmt->execute([$tileId, $tabTitle]);
        $tabId = $stmt->fetchColumn() ?: null;
    }
    if (!$tabId && $tabTitle === '') {
        $stmt = $db->prepare('SELECT id FROM tabs WHERE tile_id = ? ORDER BY position LIMIT 1');
        $stmt->execute([$tileId]);
        $tabId = $stmt->fetchColumn() ?: null;
    }
    if (!$tabId) {
        $tabId = function_exists('generateUuid') ? generateUuid() : uniqid('tab_', true);
        $posStmt = $db->prepare('SELECT COALESCE(MAX(position), -1) + 1 FROM tabs WHERE tile_id = ?');
        $posStmt->execute([$tileId]);
        $tabPosition = (int)$posStmt->fetchColumn();
        $ins = $db->prepare('INSERT INTO tabs (id, tile_id, title, position, visibility, published) VALUES (?, ?, ?, ?, ?, 1)');
        $ins->execute([$tabId, $tileId, $tabTitle !== '' ? $tabTitle : 'General', $tabPosition, 'public']);
    }

    $sectionId = null;
    if ($sectionTitle !== '') {
        $stmt = $db->prepare('SELECT id FROM sections WHERE tab_id = ? AND LOWER(title) = LOWER(?) ORDER BY position LIMIT 1');
        $stmt->execute([$tabId, $sectionTitle]);
        $sectionId = $stmt->fetchColumn() ?: null;
    }
    if (!$sectionId && $sectionTitle === '') {
        $stmt = $db->prepare('SELECT id FROM sections WHERE tab_id = ? ORDER BY position LIMIT 1');
        $stmt->execute([$tabId]);
        $sectionId = $stmt->fetchColumn() ?: null;
    }
    if (!$sectionId) {
        $sectionId = function_exists('generateUuid') ? generateUuid() : uniqid('section_', true);
        $posStmt = $db->prepare('SELECT COALESCE(MAX(position), -1) + 1 FROM sections WHERE tab_id = ?');
        $posStmt->execute([$tabId]);
        $sectionPosition = (int)$posStmt->fetchColumn();
        $ins = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, position, visibility, published) VALUES (?, ?, ?, ?, ?, ?, 1)');
        $ins->execute([$sectionId, $tileId, $tabId, $sectionTitle !== '' ? $sectionTitle : 'Links', $sectionPosition, 'public']);
    }

    return ['tabId' => $tabId, 'sectionId' => $sectionId];
}

function mcpInsertLink(PDO $db, string $sectionId, array $link): string {
    $linkId = function_exists('generateUuid') ? generateUuid() : uniqid('link_', true);
    $posStmt = $db->prepare('SELECT COALESCE(MAX(position), -1) + 1 FROM links WHERE section_id = ?');
    $posStmt->execute([$sectionId]);
    $position = (int)$posStmt->fetchColumn();
    $stmt = $db->prepare('INSERT INTO links (id, section_id, label, url, icon, notes, visibility, published, position) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)');
    $stmt->execute([
        $linkId,
        $sectionId,
        (string)$link['label'],
        (string)$link['url'],
        $link['icon'] ?? null,
        $link['notes'] ?? null,
        'public',
        $position,
    ]);
    return $linkId;
}

function mcpInvalidateGuestCache(): void {
    if (function_exists('invalidateGuestTilesListCache')) {
        invalidateGuestTilesListCache();
    }
}

function mcpToolCreateSpace(array $user, array $args): array {
    $title = trim((string)($args['title'] ?? ''));
    if ($title === '') {
        return ['error' => 'title is required'];
    }
    $db = getDB();
    $tileId = generateUuid();
    $visibility = $args['visibility'] ?? 'public';
    if (!in_array($visibility, ['public', 'authenticated', 'private'], true)) {
        $visibility = 'public';
    }
    $maxStmt = $db->query('SELECT COALESCE(MAX(position), -1) + 1 FROM tiles WHERE deleted_at IS NULL AND archived_at IS NULL');
    $position = (int)$maxStmt->fetchColumn();
    $stmt = $db->prepare('INSERT INTO tiles (id, user_id, title, description, html_content, emoji, theme_color, "group", visibility, published, source_tab, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)');
    $stmt->execute([
        $tileId,
        (int)$user['id'],
        $title,
        trim((string)($args['description'] ?? '')),
        '',
        trim((string)($args['emoji'] ?? '')) !== '' ? trim((string)$args['emoji']) : '📁',
        trim((string)($args['theme_color'] ?? '')) !== '' ? trim((string)$args['theme_color']) : 'blue',
        trim((string)($args['group'] ?? '')) !== '' ? trim((string)$args['group']) : 'General',
        $visibility,
        'public',
        $position,
        time(),
    ]);

    $added = [];
    $links = isset($args['links']) && is_array($args['links']) ? $args['links'] : [];
    if ($links === []) {
        mcpEnsureTabSection($db, $tileId, 'General', 'Links');
    } else {
        foreach ($links as $link) {
            if (!is_array($link) || empty($link['label']) || empty($link['url'])) {
                continue;
            }
            if (!mcpIsSafeUrl((string)$link['url'])) {
                continue;
            }
            $ids = mcpEnsureTabSection($db, $tileId, $link['tab'] ?? 'General', $link['section'] ?? 'Links');
            $added[] = mcpInsertLink($db, $ids['sectionId'], $link);
        }
    }
    mcpInvalidateGuestCache();
    return ['ok' => true, 'id' => $tileId, 'title' => $title, 'linksAdded' => count($added)];
}

function mcpToolUpdateSpace(array $user, array $args): array {
    $spaceId = trim((string)($args['space_id'] ?? ''));
    if ($spaceId === '') {
        return ['error' => 'space_id is required'];
    }
    $db = getDB();
    $row = mcpLoadVisibleTileRow($db, $user, $spaceId);
    if (!$row) {
        return ['error' => 'Space not found'];
    }
    if (!mcpCanEditSpace($db, $user, $spaceId)) {
        return ['error' => 'You do not have permission to edit this space'];
    }
    $sets = [];
    $params = [];
    foreach (['title' => 'title', 'description' => 'description', 'emoji' => 'emoji', 'group' => '"group"'] as $arg => $col) {
        if (array_key_exists($arg, $args) && is_string($args[$arg])) {
            $sets[] = $col . ' = ?';
            $params[] = $args[$arg];
        }
    }
    if (isset($args['visibility']) && in_array($args['visibility'], ['public', 'authenticated', 'private'], true)) {
        $sets[] = 'visibility = ?';
        $params[] = $args['visibility'];
    }
    if ($sets === []) {
        return ['error' => 'No fields to update'];
    }
    $params[] = $spaceId;
    $sql = 'UPDATE tiles SET ' . implode(', ', $sets) . ' WHERE id = ?';
    $db->prepare($sql)->execute($params);
    mcpInvalidateGuestCache();
    return ['ok' => true, 'id' => $spaceId];
}

function mcpToolAddLink(array $user, array $args): array {
    $spaceId = trim((string)($args['space_id'] ?? ''));
    $label = trim((string)($args['label'] ?? ''));
    $url = trim((string)($args['url'] ?? ''));
    if ($spaceId === '' || $label === '' || $url === '') {
        return ['error' => 'space_id, label, and url are required'];
    }
    if (!mcpIsSafeUrl($url)) {
        return ['error' => 'URL is not allowed'];
    }
    $db = getDB();
    $row = mcpLoadVisibleTileRow($db, $user, $spaceId);
    if (!$row) {
        return ['error' => 'Space not found'];
    }
    if (!mcpCanEditSpace($db, $user, $spaceId)) {
        return ['error' => 'You do not have permission to edit this space'];
    }
    $ids = mcpEnsureTabSection($db, $spaceId, $args['tab'] ?? null, $args['section'] ?? null);
    $linkId = mcpInsertLink($db, $ids['sectionId'], [
        'label' => $label,
        'url' => $url,
        'notes' => isset($args['notes']) ? (string)$args['notes'] : null,
        'icon' => isset($args['icon']) ? (string)$args['icon'] : null,
    ]);
    mcpInvalidateGuestCache();
    return ['ok' => true, 'id' => $linkId, 'spaceId' => $spaceId, 'label' => $label, 'url' => $url];
}

function mcpFindLinkSpace(PDO $db, string $linkId): ?array {
    $stmt = $db->prepare('SELECT l.id AS link_id, l.label, l.url, l.notes, s.id AS section_id, tb.tile_id AS space_id
        FROM links l
        INNER JOIN sections s ON l.section_id = s.id
        INNER JOIN tabs tb ON s.tab_id = tb.id
        WHERE l.id = ?');
    $stmt->execute([$linkId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function mcpToolUpdateLink(array $user, array $args): array {
    $linkId = trim((string)($args['link_id'] ?? ''));
    if ($linkId === '') {
        return ['error' => 'link_id is required'];
    }
    $db = getDB();
    $found = mcpFindLinkSpace($db, $linkId);
    if (!$found) {
        return ['error' => 'Link not found'];
    }
    $row = mcpLoadVisibleTileRow($db, $user, $found['space_id']);
    if (!$row) {
        return ['error' => 'Space not found'];
    }
    if (!mcpCanEditSpace($db, $user, $found['space_id'])) {
        return ['error' => 'You do not have permission to edit this space'];
    }
    $sets = [];
    $params = [];
    if (isset($args['label']) && trim((string)$args['label']) !== '') {
        $sets[] = 'label = ?';
        $params[] = trim((string)$args['label']);
    }
    if (isset($args['url'])) {
        $url = trim((string)$args['url']);
        if (!mcpIsSafeUrl($url)) {
            return ['error' => 'URL is not allowed'];
        }
        $sets[] = 'url = ?';
        $params[] = $url;
    }
    if (array_key_exists('notes', $args)) {
        $sets[] = 'notes = ?';
        $params[] = $args['notes'] === null ? null : (string)$args['notes'];
    }
    if ($sets === []) {
        return ['error' => 'No fields to update'];
    }
    $params[] = $linkId;
    $db->prepare('UPDATE links SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
    mcpInvalidateGuestCache();
    return ['ok' => true, 'id' => $linkId];
}

function mcpToolDeleteLink(array $user, array $args): array {
    $linkId = trim((string)($args['link_id'] ?? ''));
    if ($linkId === '') {
        return ['error' => 'link_id is required'];
    }
    $db = getDB();
    $found = mcpFindLinkSpace($db, $linkId);
    if (!$found) {
        return ['error' => 'Link not found'];
    }
    $row = mcpLoadVisibleTileRow($db, $user, $found['space_id']);
    if (!$row) {
        return ['error' => 'Space not found'];
    }
    if (!mcpCanEditSpace($db, $user, $found['space_id'])) {
        return ['error' => 'You do not have permission to edit this space'];
    }
    $db->prepare('DELETE FROM links WHERE id = ?')->execute([$linkId]);
    mcpInvalidateGuestCache();
    return ['ok' => true, 'id' => $linkId];
}

function mcpToolDeleteSpace(array $user, array $args): array {
    $spaceId = trim((string)($args['space_id'] ?? ''));
    if ($spaceId === '') {
        return ['error' => 'space_id is required'];
    }
    $db = getDB();
    $row = mcpLoadVisibleTileRow($db, $user, $spaceId);
    if (!$row) {
        return ['error' => 'Space not found'];
    }
    if (!mcpCanDeleteSpace($db, $user, $spaceId)) {
        return ['error' => 'You do not have permission to delete this space'];
    }
    $db->prepare('UPDATE tiles SET deleted_at = ?, archived_at = NULL WHERE id = ?')->execute([time(), $spaceId]);
    mcpInvalidateGuestCache();
    return ['ok' => true, 'id' => $spaceId, 'movedTo' => 'recycle_bin'];
}

function mcpToolCreateNote(array $user, array $args): array {
    $content = trim((string)($args['content'] ?? ''));
    if ($content === '') {
        return ['error' => 'content is required'];
    }
    $tabName = trim((string)($args['tab_name'] ?? ''));
    if ($tabName === '') {
        $tabName = 'General';
    }
    $db = getDB();
    $stmt = $db->prepare('SELECT MAX(position) FROM user_notes WHERE user_id = ? AND tab_name = ?');
    $stmt->execute([(int)$user['id'], $tabName]);
    $position = ((int)$stmt->fetchColumn()) + 1;
    $now = time();
    $ins = $db->prepare('INSERT INTO user_notes (user_id, tab_name, content, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    $ins->execute([(int)$user['id'], $tabName, $content, $position, $now, $now]);
    return ['ok' => true, 'id' => (int)$db->lastInsertId(), 'tabName' => $tabName];
}

function mcpToolUpdateNote(array $user, array $args): array {
    $noteId = (int)($args['note_id'] ?? 0);
    if ($noteId < 1) {
        return ['error' => 'note_id is required'];
    }
    $db = getDB();
    $stmt = $db->prepare('SELECT id FROM user_notes WHERE id = ? AND user_id = ?');
    $stmt->execute([$noteId, (int)$user['id']]);
    if (!$stmt->fetch()) {
        return ['error' => 'Note not found'];
    }
    $sets = [];
    $params = [];
    if (isset($args['content'])) {
        $sets[] = 'content = ?';
        $params[] = (string)$args['content'];
    }
    if (isset($args['tab_name']) && trim((string)$args['tab_name']) !== '') {
        $sets[] = 'tab_name = ?';
        $params[] = trim((string)$args['tab_name']);
    }
    if ($sets === []) {
        return ['error' => 'No fields to update'];
    }
    $sets[] = 'updated_at = ?';
    $params[] = time();
    $params[] = $noteId;
    $params[] = (int)$user['id'];
    $db->prepare('UPDATE user_notes SET ' . implode(', ', $sets) . ' WHERE id = ? AND user_id = ?')->execute($params);
    return ['ok' => true, 'id' => $noteId];
}
