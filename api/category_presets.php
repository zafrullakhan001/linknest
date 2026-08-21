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
            } else {
                sendJSON(['error' => 'Invalid endpoint'], 404);
            }
            break;

        case 'POST':
            if ($path === '' || $path === '/') {
                handleSaveCategoryPreset($db, $allowedTabs);
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
            if (preg_match('#^/(\d+)$#', $path, $m)) {
                handleUpdateCategoryPreset($db, (int)$m[1], $allowedTabs);
            } else {
                sendJSON(['error' => 'Invalid endpoint'], 404);
            }
            break;

        case 'DELETE':
            if (preg_match('#^/(\d+)$#', $path, $m)) {
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

function categoryPresetAllowedTabs(array $allowedTabs): array
{
    return $allowedTabs;
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
    return [
        'id' => (string)$row['id'],
        'tab_key' => (string)$row['tab_key'],
        'name' => (string)$row['name'],
        'visible' => $visible,
        'is_active' => ((int)$row['is_active']) === 1,
        'created_at' => (int)$row['created_at'],
        'updated_at' => (int)$row['updated_at'],
    ];
}

function listCategoryPresetRows(PDO $db, int $userId): array
{
    $stmt = $db->prepare(
        'SELECT id, tab_key, name, visible_json, is_active, created_at, updated_at
         FROM category_visibility_presets
         WHERE user_id = ?
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

function clearActiveCategoryPresetForTab(PDO $db, int $userId, string $tabKey): void
{
    $stmt = $db->prepare('UPDATE category_visibility_presets SET is_active = 0, updated_at = ? WHERE user_id = ? AND tab_key = ? AND is_active = 1');
    $stmt->execute([time(), $userId, $tabKey]);
}

function setActiveCategoryPresetRow(PDO $db, int $userId, int $presetId, string $tabKey): bool
{
    clearActiveCategoryPresetForTab($db, $userId, $tabKey);
    $stmt = $db->prepare('UPDATE category_visibility_presets SET is_active = 1, updated_at = ? WHERE id = ? AND user_id = ? AND tab_key = ?');
    $stmt->execute([time(), $presetId, $userId, $tabKey]);
    return $stmt->rowCount() > 0;
}

function fetchCategoryPresetRow(PDO $db, int $userId, int $presetId): ?array
{
    $stmt = $db->prepare(
        'SELECT id, tab_key, name, visible_json, is_active, created_at, updated_at
         FROM category_visibility_presets WHERE id = ? AND user_id = ?'
    );
    $stmt->execute([$presetId, $userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function upsertCategoryPresetRow(PDO $db, int $userId, string $tabKey, string $name, array $visible, bool $makeActive): array
{
    $now = time();
    $visibleJson = json_encode(array_values($visible), JSON_UNESCAPED_UNICODE);
    $existing = $db->prepare('SELECT id FROM category_visibility_presets WHERE user_id = ? AND tab_key = ? AND name = ? COLLATE NOCASE');
    $existing->execute([$userId, $tabKey, $name]);
    $existingId = $existing->fetchColumn();

    if ($existingId) {
        $id = (int)$existingId;
        $stmt = $db->prepare('UPDATE category_visibility_presets SET name = ?, visible_json = ?, updated_at = ? WHERE id = ? AND user_id = ?');
        $stmt->execute([$name, $visibleJson, $now, $id, $userId]);
    } else {
        $countStmt = $db->prepare('SELECT COUNT(*) FROM category_visibility_presets WHERE user_id = ?');
        $countStmt->execute([$userId]);
        if ((int)$countStmt->fetchColumn() >= 50) {
            sendJSON(['error' => 'Maximum of 50 category presets reached'], 400);
        }
        $stmt = $db->prepare(
            'INSERT INTO category_visibility_presets (user_id, tab_key, name, visible_json, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, 0, ?, ?)'
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

function handleListCategoryPresets(PDO $db, array $allowedTabs): void
{
    $user = requireAuth();
    $userId = (int)$user['id'];
    migrateLegacyCategoryPresetsFromPreferences($db, $userId, $allowedTabs);
    sendJSON(listCategoryPresetRows($db, $userId));
}

function migrateLegacyCategoryPresetsFromPreferences(PDO $db, int $userId, array $allowedTabs): void
{
    $countStmt = $db->prepare('SELECT COUNT(*) FROM category_visibility_presets WHERE user_id = ?');
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
        'INSERT OR IGNORE INTO category_visibility_presets (user_id, tab_key, name, visible_json, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)'
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
        $lookup = $db->prepare('SELECT id FROM category_visibility_presets WHERE user_id = ? AND tab_key = ? AND name = ? COLLATE NOCASE');
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
        $stmt = $db->prepare('UPDATE category_visibility_presets SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?');
        $stmt->execute([$name, $now, $presetId, $userId]);
    } else {
        $stmt = $db->prepare('UPDATE category_visibility_presets SET name = ?, visible_json = ?, updated_at = ? WHERE id = ? AND user_id = ?');
        $stmt->execute([$name, json_encode(array_values($visible), JSON_UNESCAPED_UNICODE), $now, $presetId, $userId]);
    }

    $updated = fetchCategoryPresetRow($db, $userId, $presetId);
    sendJSON(['preset' => categoryPresetRowToApi($updated)]);
}

function handleDeleteCategoryPreset(PDO $db, int $presetId): void
{
    $user = requireAuth();
    $stmt = $db->prepare('DELETE FROM category_visibility_presets WHERE id = ? AND user_id = ?');
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
    $presetId = (int)$data['id'];
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
    $countStmt = $db->prepare('SELECT COUNT(*) FROM category_visibility_presets WHERE user_id = ?');
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
        $tabKey = isset($item['tab_key']) ? trim((string)$item['tab_key']) : '';
        $name = normalizeCategoryPresetName((string)($item['name'] ?? ''));
        if (!in_array($tabKey, $allowedTabs, true) || $name === '') {
            continue;
        }
        $visible = normalizeVisibleCategories($item['visible'] ?? []);
        $id = isset($item['id']) && ctype_digit((string)$item['id']) ? (int)$item['id'] : 0;
        if ($id > 0) {
            $row = fetchCategoryPresetRow($db, $userId, $id);
            if ($row) {
                $stmt = $db->prepare('UPDATE category_visibility_presets SET name = ?, visible_json = ?, tab_key = ?, updated_at = ? WHERE id = ? AND user_id = ?');
                $stmt->execute([$name, json_encode(array_values($visible), JSON_UNESCAPED_UNICODE), $tabKey, time(), $id, $userId]);
                $keepIds[] = $id;
                if (!empty($item['is_active'])) {
                    setActiveCategoryPresetRow($db, $userId, $id, $tabKey);
                }
                continue;
            }
        }
        $saved = upsertCategoryPresetRow($db, $userId, $tabKey, $name, $visible, !empty($item['is_active']));
        $keepIds[] = (int)$saved['id'];
    }

    if ($keepIds === []) {
        $db->prepare('DELETE FROM category_visibility_presets WHERE user_id = ?')->execute([$userId]);
    } else {
        $placeholders = implode(',', array_fill(0, count($keepIds), '?'));
        $params = array_merge([$userId], $keepIds);
        $db->prepare("DELETE FROM category_visibility_presets WHERE user_id = ? AND id NOT IN ($placeholders)")->execute($params);
    }

    sendJSON(listCategoryPresetRows($db, $userId));
}
