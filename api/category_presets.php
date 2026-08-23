<?php
require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$allowedTabs = [
    'favorites', 'public', 'public-favorites', 'your-apps', 'staging', 'private',
    'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring', 'monitorv2',
];

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

try {
    $db = getDB();
    ensureCategoryVisibilityPresetsTable($db);

    switch ($method) {
        case 'GET':
            if ($path === '' || $path === '/') {
                handleListCategoryPresets($db, $allowedTabs);
            } elseif ($path === '/builtin') {
                handleListBuiltinCategoryPresets($db, $allowedTabs);
            } else {
                sendJSON(['error' => 'Invalid endpoint'], 404);
            }
            break;

        case 'POST':
            if ($path === '' || $path === '/') {
                handleSaveCategoryPreset($db, $allowedTabs);
            } elseif ($path === '/builtin') {
                handleSaveBuiltinCategoryPreset($db, $allowedTabs);
            } elseif ($path === '/import') {
                handleImportCategoryPresets($db, $allowedTabs);
            } elseif ($path === '/sync') {
                handleSyncCategoryPresets($db, $allowedTabs);
            } elseif ($path === '/active') {
                handleSetActiveCategoryPreset($db, $allowedTabs);
            } elseif (preg_match('#^/(\d+)/apply$#', $path, $m)) {
                handleApplyCategoryPreset($db, (int)$m[1], $allowedTabs);
            } else {
                sendJSON(['error' => 'Invalid endpoint'], 404);
            }
            break;

        case 'PUT':
            if (preg_match('#^/builtin/(\d+)$#', $path, $m)) {
                handleUpdateBuiltinCategoryPreset($db, (int)$m[1], $allowedTabs);
            } elseif (preg_match('#^/(\d+)$#', $path, $m)) {
                handleUpdateCategoryPreset($db, (int)$m[1], $allowedTabs);
            } else {
                sendJSON(['error' => 'Invalid endpoint'], 404);
            }
            break;

        case 'DELETE':
            if (preg_match('#^/builtin/(\d+)$#', $path, $m)) {
                handleDeleteBuiltinCategoryPreset($db, (int)$m[1]);
            } elseif (preg_match('#^/(\d+)$#', $path, $m)) {
                handleDeleteCategoryPreset($db, (int)$m[1]);
            } else {
                sendJSON(['error' => 'Invalid endpoint'], 404);
            }
            break;

        default:
            sendJSON(['error' => 'Method not allowed'], 405);
    }
} catch (Throwable $e) {
    error_log('category_presets.php: ' . $e->getMessage());
    sendJSON(['error' => 'Failed to process category presets'], 500);
}

function normalizeCategoryPresetName(string $name): string
{
    $name = trim($name);
    if (function_exists('mb_substr')) {
        $name = mb_substr($name, 0, 60);
    } else {
        $name = substr($name, 0, 60);
    }
    return $name;
}

function normalizeVisibleCategories($visible): array
{
    if (!is_array($visible)) {
        return [];
    }
    $out = [];
    $seen = [];
    foreach ($visible as $name) {
        if (!is_string($name)) {
            continue;
        }
        $trimmed = trim($name);
        if ($trimmed === '' || isset($seen[$trimmed])) {
            continue;
        }
        if (function_exists('mb_strlen') ? mb_strlen($trimmed) > 200 : strlen($trimmed) > 200) {
            continue;
        }
        $seen[$trimmed] = true;
        $out[] = $trimmed;
        if (count($out) >= 200) {
            break;
        }
    }
    return $out;
}

function categoryPresetRowToApi(array $row): array
{
    $visible = [];
    $decoded = json_decode((string)($row['visible_json'] ?? '[]'), true);
    if (is_array($decoded)) {
        $visible = normalizeVisibleCategories($decoded);
    }
    $scope = (($row['scope'] ?? 'user') === 'builtin') ? 'builtin' : 'user';
    $id = (string)$row['id'];
    return [
        'id' => $scope === 'builtin' ? ('builtin-' . $id) : $id,
        'db_id' => $id,
        'tab_key' => (string)$row['tab_key'],
        'name' => (string)$row['name'],
        'visible' => $visible,
        'is_active' => $scope === 'user' && ((int)$row['is_active']) === 1,
        'scope' => $scope,
        'source' => $scope,
        'created_at' => (int)$row['created_at'],
        'updated_at' => (int)$row['updated_at'],
    ];
}

function listCategoryPresetRows(PDO $db, int $userId): array
{
    $stmt = $db->prepare(
        'SELECT id, user_id, scope, tab_key, name, visible_json, is_active, created_at, updated_at
         FROM category_visibility_presets
         WHERE user_id = ? AND scope = \'user\'
         ORDER BY name COLLATE NOCASE ASC, id ASC'
    );
    $stmt->execute([$userId]);
    $presets = [];
    $activeByTab = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $preset = categoryPresetRowToApi($row);
        $presets[] = $preset;
        if ($preset['is_active']) {
            $activeByTab[$preset['tab_key']] = $preset['id'];
        }
    }
    return ['presets' => $presets, 'activeByTab' => $activeByTab];
}

function listBuiltinCategoryPresetRows(PDO $db, ?string $tabKey = null): array
{
    if ($tabKey !== null && $tabKey !== '') {
        $stmt = $db->prepare(
            'SELECT id, user_id, scope, tab_key, name, visible_json, is_active, created_at, updated_at
             FROM category_visibility_presets
             WHERE scope = \'builtin\' AND tab_key = ?
             ORDER BY name COLLATE NOCASE ASC, id ASC'
        );
        $stmt->execute([$tabKey]);
    } else {
        $stmt = $db->query(
            'SELECT id, user_id, scope, tab_key, name, visible_json, is_active, created_at, updated_at
             FROM category_visibility_presets
             WHERE scope = \'builtin\'
             ORDER BY tab_key ASC, name COLLATE NOCASE ASC, id ASC'
        );
    }
    $presets = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $presets[] = categoryPresetRowToApi($row);
    }
    return ['presets' => $presets];
}

function clearActiveCategoryPresetForTab(PDO $db, int $userId, string $tabKey): void
{
    $stmt = $db->prepare(
        'UPDATE category_visibility_presets SET is_active = 0, updated_at = ?
         WHERE user_id = ? AND tab_key = ? AND scope = \'user\' AND is_active = 1'
    );
    $stmt->execute([time(), $userId, $tabKey]);
}

function setActiveCategoryPresetRow(PDO $db, int $userId, int $presetId, string $tabKey): bool
{
    clearActiveCategoryPresetForTab($db, $userId, $tabKey);
    $stmt = $db->prepare(
        'UPDATE category_visibility_presets SET is_active = 1, updated_at = ?
         WHERE id = ? AND user_id = ? AND tab_key = ? AND scope = \'user\''
    );
    $stmt->execute([time(), $presetId, $userId, $tabKey]);
    return $stmt->rowCount() > 0;
}

function fetchCategoryPresetRow(PDO $db, int $userId, int $presetId): ?array
{
    $stmt = $db->prepare(
        'SELECT id, user_id, scope, tab_key, name, visible_json, is_active, created_at, updated_at
         FROM category_visibility_presets WHERE id = ? AND user_id = ? AND scope = \'user\''
    );
    $stmt->execute([$presetId, $userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function fetchBuiltinCategoryPresetRow(PDO $db, int $presetId): ?array
{
    $stmt = $db->prepare(
        'SELECT id, user_id, scope, tab_key, name, visible_json, is_active, created_at, updated_at
         FROM category_visibility_presets WHERE id = ? AND scope = \'builtin\''
    );
    $stmt->execute([$presetId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function upsertCategoryPresetRow(PDO $db, int $userId, string $tabKey, string $name, array $visible, bool $makeActive): array
{
    $now = time();
    $visibleJson = json_encode(array_values($visible), JSON_UNESCAPED_UNICODE);
    $existing = $db->prepare(
        'SELECT id FROM category_visibility_presets
         WHERE user_id = ? AND tab_key = ? AND name = ? COLLATE NOCASE AND scope = \'user\''
    );
    $existing->execute([$userId, $tabKey, $name]);
    $existingId = $existing->fetchColumn();

    if ($existingId) {
        $id = (int)$existingId;
        $stmt = $db->prepare(
            'UPDATE category_visibility_presets SET name = ?, visible_json = ?, updated_at = ?
             WHERE id = ? AND user_id = ? AND scope = \'user\''
        );
        $stmt->execute([$name, $visibleJson, $now, $id, $userId]);
    } else {
        $countStmt = $db->prepare(
            'SELECT COUNT(*) FROM category_visibility_presets WHERE user_id = ? AND scope = \'user\''
        );
        $countStmt->execute([$userId]);
        if ((int)$countStmt->fetchColumn() >= 50) {
            sendJSON(['error' => 'Maximum of 50 category presets reached'], 400);
        }
        $stmt = $db->prepare(
            'INSERT INTO category_visibility_presets (user_id, scope, tab_key, name, visible_json, is_active, created_at, updated_at)
             VALUES (?, \'user\', ?, ?, ?, 0, ?, ?)'
        );
        $stmt->execute([$userId, $tabKey, $name, $visibleJson, $now, $now]);
        $id = (int)$db->lastInsertId();
    }

    if ($makeActive) {
        setActiveCategoryPresetRow($db, $userId, $id, $tabKey);
    }

    $row = fetchCategoryPresetRow($db, $userId, $id);
    if (!$row) {
        sendJSON(['error' => 'Failed to save preset'], 500);
    }
    return categoryPresetRowToApi($row);
}

function upsertBuiltinCategoryPresetRow(PDO $db, string $tabKey, string $name, array $visible, ?int $existingId = null): array
{
    $now = time();
    $visibleJson = json_encode(array_values($visible), JSON_UNESCAPED_UNICODE);

    if ($existingId !== null && $existingId > 0) {
        $row = fetchBuiltinCategoryPresetRow($db, $existingId);
        if (!$row) {
            sendJSON(['error' => 'Built-in preset not found'], 404);
        }
        // Unique name check against other builtins on same tab
        $dup = $db->prepare(
            'SELECT id FROM category_visibility_presets
             WHERE scope = \'builtin\' AND tab_key = ? AND name = ? COLLATE NOCASE AND id != ?'
        );
        $dup->execute([$tabKey, $name, $existingId]);
        if ($dup->fetchColumn()) {
            sendJSON(['error' => 'A built-in preset with this name already exists for this tab'], 409);
        }
        $stmt = $db->prepare(
            'UPDATE category_visibility_presets SET tab_key = ?, name = ?, visible_json = ?, updated_at = ?
             WHERE id = ? AND scope = \'builtin\''
        );
        $stmt->execute([$tabKey, $name, $visibleJson, $now, $existingId]);
        $id = $existingId;
    } else {
        $dup = $db->prepare(
            'SELECT id FROM category_visibility_presets
             WHERE scope = \'builtin\' AND tab_key = ? AND name = ? COLLATE NOCASE'
        );
        $dup->execute([$tabKey, $name]);
        $dupId = $dup->fetchColumn();
        if ($dupId) {
            $id = (int)$dupId;
            $stmt = $db->prepare(
                'UPDATE category_visibility_presets SET visible_json = ?, updated_at = ?
                 WHERE id = ? AND scope = \'builtin\''
            );
            $stmt->execute([$visibleJson, $now, $id]);
        } else {
            $countStmt = $db->query('SELECT COUNT(*) FROM category_visibility_presets WHERE scope = \'builtin\'');
            if ((int)$countStmt->fetchColumn() >= 100) {
                sendJSON(['error' => 'Maximum of 100 built-in category presets reached'], 400);
            }
            $stmt = $db->prepare(
                'INSERT INTO category_visibility_presets (user_id, scope, tab_key, name, visible_json, is_active, created_at, updated_at)
                 VALUES (NULL, \'builtin\', ?, ?, ?, 0, ?, ?)'
            );
            $stmt->execute([$tabKey, $name, $visibleJson, $now, $now]);
            $id = (int)$db->lastInsertId();
        }
    }

    $row = fetchBuiltinCategoryPresetRow($db, $id);
    if (!$row) {
        sendJSON(['error' => 'Failed to save built-in preset'], 500);
    }
    return categoryPresetRowToApi($row);
}

function handleListCategoryPresets(PDO $db, array $allowedTabs): void
{
    $user = requireAuth();
    $userId = (int)$user['id'];
    migrateLegacyCategoryPresetsFromPreferences($db, $userId, $allowedTabs);
    sendJSON(listCategoryPresetRows($db, $userId));
}

function handleListBuiltinCategoryPresets(PDO $db, array $allowedTabs): void
{
    $tabKey = isset($_GET['tab_key']) ? trim((string)$_GET['tab_key']) : '';
    if ($tabKey !== '' && !in_array($tabKey, $allowedTabs, true)) {
        sendJSON(['error' => 'Invalid tab'], 400);
    }
    sendJSON(listBuiltinCategoryPresetRows($db, $tabKey !== '' ? $tabKey : null));
}

function handleSaveBuiltinCategoryPreset(PDO $db, array $allowedTabs): void
{
    requireAdmin();
    $data = getJSONInput();
    $tabKey = isset($data['tab_key']) ? trim((string)$data['tab_key']) : '';
    $name = normalizeCategoryPresetName((string)($data['name'] ?? ''));
    $visible = normalizeVisibleCategories($data['visible'] ?? []);

    if (!in_array($tabKey, $allowedTabs, true)) {
        sendJSON(['error' => 'Invalid tab'], 400);
    }
    if ($name === '') {
        sendJSON(['error' => 'Preset name is required'], 400);
    }

    $preset = upsertBuiltinCategoryPresetRow($db, $tabKey, $name, $visible, null);
    sendJSON(['preset' => $preset], 201);
}

function handleUpdateBuiltinCategoryPreset(PDO $db, int $presetId, array $allowedTabs): void
{
    requireAdmin();
    $row = fetchBuiltinCategoryPresetRow($db, $presetId);
    if (!$row) {
        sendJSON(['error' => 'Built-in preset not found'], 404);
    }

    $data = getJSONInput();
    $tabKey = array_key_exists('tab_key', $data)
        ? trim((string)$data['tab_key'])
        : (string)$row['tab_key'];
    $name = array_key_exists('name', $data)
        ? normalizeCategoryPresetName((string)$data['name'])
        : (string)$row['name'];
    $visible = array_key_exists('visible', $data)
        ? normalizeVisibleCategories($data['visible'])
        : normalizeVisibleCategories(json_decode((string)$row['visible_json'], true));

    if (!in_array($tabKey, $allowedTabs, true)) {
        sendJSON(['error' => 'Invalid tab'], 400);
    }
    if ($name === '') {
        sendJSON(['error' => 'Preset name is required'], 400);
    }

    $preset = upsertBuiltinCategoryPresetRow($db, $tabKey, $name, $visible, $presetId);
    sendJSON(['preset' => $preset]);
}

function handleDeleteBuiltinCategoryPreset(PDO $db, int $presetId): void
{
    requireAdmin();
    $stmt = $db->prepare('DELETE FROM category_visibility_presets WHERE id = ? AND scope = \'builtin\'');
    $stmt->execute([$presetId]);
    if ($stmt->rowCount() === 0) {
        sendJSON(['error' => 'Built-in preset not found'], 404);
    }
    sendJSON(['success' => true]);
}

function migrateLegacyCategoryPresetsFromPreferences(PDO $db, int $userId, array $allowedTabs): void
{
    $countStmt = $db->prepare(
        'SELECT COUNT(*) FROM category_visibility_presets WHERE user_id = ? AND scope = \'user\''
    );
    $countStmt->execute([$userId]);
    if ((int)$countStmt->fetchColumn() > 0) {
        return;
    }

    $prefStmt = $db->prepare('SELECT preference_key, preference_value FROM user_preferences WHERE user_id = ? AND preference_key IN (?, ?)');
    $prefStmt->execute([$userId, 'categoryPresets', 'categoryPresetActive']);
    $prefs = [];
    foreach ($prefStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $prefs[$row['preference_key']] = $row['preference_value'];
    }
    if (empty($prefs['categoryPresets'])) {
        return;
    }

    $decoded = json_decode((string)$prefs['categoryPresets'], true);
    if (!is_array($decoded)) {
        return;
    }
    $active = [];
    if (!empty($prefs['categoryPresetActive'])) {
        $activeDecoded = json_decode((string)$prefs['categoryPresetActive'], true);
        if (is_array($activeDecoded)) {
            $active = $activeDecoded;
        }
    }

    $imported = [];
    foreach ($decoded as $tabKey => $list) {
        if (!is_string($tabKey) || !in_array($tabKey, $allowedTabs, true) || !is_array($list)) {
            continue;
        }
        $activeId = isset($active[$tabKey]) ? (string)$active[$tabKey] : '';
        foreach ($list as $item) {
            if (!is_array($item)) {
                continue;
            }
            $name = normalizeCategoryPresetName((string)($item['name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $visible = normalizeVisibleCategories($item['visible'] ?? []);
            $legacyId = isset($item['id']) ? (string)$item['id'] : '';
            $imported[] = [
                'tab_key' => $tabKey,
                'name' => $name,
                'visible' => $visible,
                'is_active' => $legacyId !== '' && $legacyId === $activeId,
            ];
        }
    }

    if ($imported === []) {
        return;
    }

    insertImportedCategoryPresets($db, $userId, $imported);

    $cleanup = $db->prepare('DELETE FROM user_preferences WHERE user_id = ? AND preference_key IN (?, ?)');
    $cleanup->execute([$userId, 'categoryPresets', 'categoryPresetActive']);
}

function insertImportedCategoryPresets(PDO $db, int $userId, array $imported): void
{
    $now = time();
    $insert = $db->prepare(
        'INSERT OR IGNORE INTO category_visibility_presets (user_id, scope, tab_key, name, visible_json, is_active, created_at, updated_at)
         VALUES (?, \'user\', ?, ?, ?, 0, ?, ?)'
    );
    foreach ($imported as $item) {
        $insert->execute([
            $userId,
            $item['tab_key'],
            $item['name'],
            json_encode(array_values($item['visible']), JSON_UNESCAPED_UNICODE),
            $now,
            $now,
        ]);
    }
    foreach ($imported as $item) {
        if (empty($item['is_active'])) {
            continue;
        }
        $lookup = $db->prepare(
            'SELECT id FROM category_visibility_presets
             WHERE user_id = ? AND tab_key = ? AND name = ? COLLATE NOCASE AND scope = \'user\''
        );
        $lookup->execute([$userId, $item['tab_key'], $item['name']]);
        $id = $lookup->fetchColumn();
        if ($id) {
            setActiveCategoryPresetRow($db, $userId, (int)$id, $item['tab_key']);
        }
    }
}

function handleSaveCategoryPreset(PDO $db, array $allowedTabs): void
{
    $user = requireAuth();
    $data = getJSONInput();
    $tabKey = isset($data['tab_key']) ? trim((string)$data['tab_key']) : '';
    $name = normalizeCategoryPresetName((string)($data['name'] ?? ''));
    $visible = normalizeVisibleCategories($data['visible'] ?? []);

    if (!in_array($tabKey, $allowedTabs, true)) {
        sendJSON(['error' => 'Invalid tab'], 400);
    }
    if ($name === '') {
        sendJSON(['error' => 'Preset name is required'], 400);
    }

    $preset = upsertCategoryPresetRow($db, (int)$user['id'], $tabKey, $name, $visible, true);
    sendJSON(['preset' => $preset], isset($data['id']) ? 200 : 201);
}

function handleUpdateCategoryPreset(PDO $db, int $presetId, array $allowedTabs): void
{
    $user = requireAuth();
    $userId = (int)$user['id'];

    // Never allow updating builtins via user route
    $builtin = fetchBuiltinCategoryPresetRow($db, $presetId);
    if ($builtin) {
        sendJSON(['error' => 'Built-in presets cannot be modified'], 403);
    }

    $row = fetchCategoryPresetRow($db, $userId, $presetId);
    if (!$row) {
        sendJSON(['error' => 'Preset not found'], 404);
    }

    $data = getJSONInput();
    $name = array_key_exists('name', $data) ? normalizeCategoryPresetName((string)$data['name']) : (string)$row['name'];
    $visible = array_key_exists('visible', $data) ? normalizeVisibleCategories($data['visible']) : null;
    if ($name === '') {
        sendJSON(['error' => 'Preset name is required'], 400);
    }

    $now = time();
    if ($visible === null) {
        $stmt = $db->prepare(
            'UPDATE category_visibility_presets SET name = ?, updated_at = ? WHERE id = ? AND user_id = ? AND scope = \'user\''
        );
        $stmt->execute([$name, $now, $presetId, $userId]);
    } else {
        $stmt = $db->prepare(
            'UPDATE category_visibility_presets SET name = ?, visible_json = ?, updated_at = ? WHERE id = ? AND user_id = ? AND scope = \'user\''
        );
        $stmt->execute([$name, json_encode(array_values($visible), JSON_UNESCAPED_UNICODE), $now, $presetId, $userId]);
    }

    $updated = fetchCategoryPresetRow($db, $userId, $presetId);
    sendJSON(['preset' => categoryPresetRowToApi($updated)]);
}

function handleDeleteCategoryPreset(PDO $db, int $presetId): void
{
    $user = requireAuth();

    $builtin = fetchBuiltinCategoryPresetRow($db, $presetId);
    if ($builtin) {
        sendJSON(['error' => 'Built-in presets cannot be deleted'], 403);
    }

    $stmt = $db->prepare(
        'DELETE FROM category_visibility_presets WHERE id = ? AND user_id = ? AND scope = \'user\''
    );
    $stmt->execute([$presetId, (int)$user['id']]);
    if ($stmt->rowCount() === 0) {
        sendJSON(['error' => 'Preset not found'], 404);
    }
    sendJSON(['success' => true]);
}

function handleApplyCategoryPreset(PDO $db, int $presetId, array $allowedTabs): void
{
    $user = requireAuth();
    $userId = (int)$user['id'];
    $row = fetchCategoryPresetRow($db, $userId, $presetId);
    if (!$row) {
        sendJSON(['error' => 'Preset not found'], 404);
    }
    $tabKey = (string)$row['tab_key'];
    if (!in_array($tabKey, $allowedTabs, true)) {
        sendJSON(['error' => 'Invalid tab'], 400);
    }
    setActiveCategoryPresetRow($db, $userId, $presetId, $tabKey);
    $updated = fetchCategoryPresetRow($db, $userId, $presetId);
    sendJSON(['preset' => categoryPresetRowToApi($updated)]);
}

function handleSetActiveCategoryPreset(PDO $db, array $allowedTabs): void
{
    $user = requireAuth();
    $data = getJSONInput();
    $tabKey = isset($data['tab_key']) ? trim((string)$data['tab_key']) : '';
    if (!in_array($tabKey, $allowedTabs, true)) {
        sendJSON(['error' => 'Invalid tab'], 400);
    }
    $userId = (int)$user['id'];
    if (!isset($data['id']) || $data['id'] === null || $data['id'] === '') {
        clearActiveCategoryPresetForTab($db, $userId, $tabKey);
        sendJSON(['success' => true, 'active_id' => null]);
        return;
    }
    // Active tracking in DB is only for personal presets
    $rawId = (string)$data['id'];
    if (str_starts_with($rawId, 'builtin-') || !ctype_digit($rawId)) {
        clearActiveCategoryPresetForTab($db, $userId, $tabKey);
        sendJSON(['success' => true, 'active_id' => null]);
        return;
    }
    $presetId = (int)$rawId;
    $row = fetchCategoryPresetRow($db, $userId, $presetId);
    if (!$row || (string)$row['tab_key'] !== $tabKey) {
        sendJSON(['error' => 'Preset not found'], 404);
    }
    setActiveCategoryPresetRow($db, $userId, $presetId, $tabKey);
    sendJSON(['success' => true, 'active_id' => (string)$presetId]);
}

function handleImportCategoryPresets(PDO $db, array $allowedTabs): void
{
    $user = requireAuth();
    $userId = (int)$user['id'];
    $countStmt = $db->prepare(
        'SELECT COUNT(*) FROM category_visibility_presets WHERE user_id = ? AND scope = \'user\''
    );
    $countStmt->execute([$userId]);
    if ((int)$countStmt->fetchColumn() > 0) {
        sendJSON(listCategoryPresetRows($db, $userId));
        return;
    }

    $data = getJSONInput();
    $incoming = $data['presets'] ?? [];
    if (!is_array($incoming)) {
        sendJSON(['error' => 'presets must be an array'], 400);
    }

    $imported = [];
    foreach ($incoming as $item) {
        if (!is_array($item)) {
            continue;
        }
        // Never import builtins into personal table
        if (($item['scope'] ?? $item['source'] ?? 'user') === 'builtin') {
            continue;
        }
        $idHint = isset($item['id']) ? (string)$item['id'] : '';
        if (str_starts_with($idHint, 'builtin-')) {
            continue;
        }
        $tabKey = isset($item['tab_key']) ? trim((string)$item['tab_key']) : '';
        $name = normalizeCategoryPresetName((string)($item['name'] ?? ''));
        if (!in_array($tabKey, $allowedTabs, true) || $name === '') {
            continue;
        }
        $imported[] = [
            'tab_key' => $tabKey,
            'name' => $name,
            'visible' => normalizeVisibleCategories($item['visible'] ?? []),
            'is_active' => !empty($item['is_active']),
        ];
        if (count($imported) >= 50) {
            break;
        }
    }

    if ($imported !== []) {
        insertImportedCategoryPresets($db, $userId, $imported);
    }

    sendJSON(listCategoryPresetRows($db, $userId));
}

function handleSyncCategoryPresets(PDO $db, array $allowedTabs): void
{
    $user = requireAuth();
    $userId = (int)$user['id'];
    $data = getJSONInput();
    $incoming = $data['presets'] ?? [];
    if (!is_array($incoming)) {
        sendJSON(['error' => 'presets must be an array'], 400);
    }

    $keepIds = [];
    foreach ($incoming as $item) {
        if (!is_array($item)) {
            continue;
        }
        if (($item['scope'] ?? $item['source'] ?? 'user') === 'builtin') {
            continue;
        }
        $idRaw = isset($item['id']) ? (string)$item['id'] : '';
        if (str_starts_with($idRaw, 'builtin-')) {
            continue;
        }
        $tabKey = isset($item['tab_key']) ? trim((string)$item['tab_key']) : '';
        $name = normalizeCategoryPresetName((string)($item['name'] ?? ''));
        if (!in_array($tabKey, $allowedTabs, true) || $name === '') {
            continue;
        }
        $visible = normalizeVisibleCategories($item['visible'] ?? []);
        $id = ctype_digit($idRaw) ? (int)$idRaw : 0;
        if ($id > 0) {
            $row = fetchCategoryPresetRow($db, $userId, $id);
            if ($row) {
                $stmt = $db->prepare(
                    'UPDATE category_visibility_presets SET name = ?, visible_json = ?, tab_key = ?, updated_at = ?
                     WHERE id = ? AND user_id = ? AND scope = \'user\''
                );
                $stmt->execute([$name, json_encode(array_values($visible), JSON_UNESCAPED_UNICODE), $tabKey, time(), $id, $userId]);
                $keepIds[] = $id;
                if (!empty($item['is_active'])) {
                    setActiveCategoryPresetRow($db, $userId, $id, $tabKey);
                }
                continue;
            }
        }
        $saved = upsertCategoryPresetRow($db, $userId, $tabKey, $name, $visible, !empty($item['is_active']));
        $keepIds[] = (int)($saved['db_id'] ?? $saved['id']);
    }

    if ($keepIds === []) {
        $db->prepare('DELETE FROM category_visibility_presets WHERE user_id = ? AND scope = \'user\'')->execute([$userId]);
    } else {
        $placeholders = implode(',', array_fill(0, count($keepIds), '?'));
        $params = array_merge([$userId], $keepIds);
        $db->prepare(
            "DELETE FROM category_visibility_presets WHERE user_id = ? AND scope = 'user' AND id NOT IN ($placeholders)"
        )->execute($params);
    }

    sendJSON(listCategoryPresetRows($db, $userId));
}
