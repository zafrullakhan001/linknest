<?php
/**
 * Recyclable short URLs for tiles, tabs, sections, and links.
 */

const SHORT_URL_TARGET_TYPES = ['tile', 'tab', 'section', 'link'];
const SHORT_URL_CODE_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SHORT_URL_CODE_LENGTH = 8;

function shortUrlTargetTypes(): array {
    return SHORT_URL_TARGET_TYPES;
}

function isValidShortUrlTargetType($type): bool {
    return is_string($type) && in_array($type, SHORT_URL_TARGET_TYPES, true);
}

function mapShowShortUrlsFromRow(array $row): bool {
    $raw = $row['show_short_urls'] ?? $row['showShortUrls'] ?? 0;
    return !empty($raw) && $raw !== '0' && $raw !== false;
}

/** On (default) inherits parent short-URL display. Off overrides to original URLs. */
function mapInheritShortUrlsFromRow(array $row): bool {
    if (!array_key_exists('inherit_short_urls', $row) && !array_key_exists('inheritShortUrls', $row)) {
        return true;
    }
    $raw = $row['inherit_short_urls'] ?? $row['inheritShortUrls'];
    return !($raw === 0 || $raw === '0' || $raw === false || $raw === 'false');
}

function inheritShortUrlsDbValue($item): int {
    if (!is_array($item)) {
        return 1;
    }
    if (array_key_exists('inheritShortUrls', $item)) {
        $raw = $item['inheritShortUrls'];
        return ($raw === false || $raw === 0 || $raw === '0') ? 0 : 1;
    }
    if (array_key_exists('inherit_short_urls', $item)) {
        return ((int)$item['inherit_short_urls'] === 0) ? 0 : 1;
    }
    return 1;
}

function persistInheritShortUrls(PDO $db, string $table, string $id, $source): void {
    if ($id === '' || !in_array($table, ['tabs', 'sections', 'links'], true)) {
        return;
    }
    try {
        $stmt = $db->prepare("UPDATE {$table} SET inherit_short_urls = ? WHERE id = ?");
        $stmt->execute([inheritShortUrlsDbValue($source), $id]);
    } catch (PDOException $e) {
        error_log('persistInheritShortUrls: ' . $e->getMessage());
    }
}

function persistTileShowShortUrls(PDO $db, string $tileId, $data, ?array $fallbackRow = null): void {
    $value = null;
    if (is_array($data) && array_key_exists('showShortUrls', $data)) {
        $value = (!empty($data['showShortUrls']) && $data['showShortUrls'] !== '0' && $data['showShortUrls'] !== false) ? 1 : 0;
    } elseif (is_array($fallbackRow)) {
        if (array_key_exists('show_short_urls', $fallbackRow)) {
            $value = mapShowShortUrlsFromRow($fallbackRow) ? 1 : 0;
        } elseif (array_key_exists('showShortUrls', $fallbackRow)) {
            $value = mapShowShortUrlsFromRow($fallbackRow) ? 1 : 0;
        }
    }
    if ($value === null || $tileId === '') {
        return;
    }
    try {
        $stmt = $db->prepare('UPDATE tiles SET show_short_urls = ? WHERE id = ?');
        $stmt->execute([$value, $tileId]);
    } catch (PDOException $e) {
        error_log('persistTileShowShortUrls: ' . $e->getMessage());
    }
}

function linknestPublicBaseUrl(): string {
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ((string)($_SERVER['SERVER_PORT'] ?? '') === '443')
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string)$_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https');
    $protocol = $https ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $script = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? ''));
    if (preg_match('#/api/index\.php$#i', $script)) {
        $basePath = substr($script, 0, -strlen('/api/index.php'));
    } elseif (preg_match('#/s\.php$#i', $script)) {
        $basePath = substr($script, 0, -strlen('/s.php'));
    } else {
        $basePath = rtrim(str_replace('\\', '/', dirname($script)), '/');
        if ($basePath === '/' || $basePath === '.' || $basePath === '\\') {
            $basePath = '';
        }
    }
    return $protocol . '://' . $host . $basePath;
}

function shortUrlForCode(string $code): string {
    return rtrim(linknestPublicBaseUrl(), '/') . '/s/' . rawurlencode($code);
}

function generateShortUrlCode(PDO $db): string {
    $alphabet = SHORT_URL_CODE_ALPHABET;
    $len = strlen($alphabet);
    $stmt = $db->prepare('SELECT 1 FROM short_urls WHERE code = ? LIMIT 1');
    for ($attempt = 0; $attempt < 24; $attempt++) {
        $code = '';
        for ($i = 0; $i < SHORT_URL_CODE_LENGTH; $i++) {
            $code .= $alphabet[random_int(0, $len - 1)];
        }
        $stmt->execute([$code]);
        if (!$stmt->fetchColumn()) {
            return $code;
        }
    }
    throw new RuntimeException('Unable to allocate a unique short URL code');
}

function lookupShortUrlByCode(PDO $db, string $code): ?array {
    $stmt = $db->prepare('SELECT * FROM short_urls WHERE code = ? LIMIT 1');
    $stmt->execute([$code]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function getActiveShortUrlRow(PDO $db, string $targetType, string $targetId): ?array {
    $stmt = $db->prepare('SELECT * FROM short_urls WHERE target_type = ? AND target_id = ? AND revoked = 0 LIMIT 1');
    $stmt->execute([$targetType, $targetId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function ensureActiveShortUrl(PDO $db, string $targetType, string $targetId, string $tileId, $createdBy = null): string {
    if (!isValidShortUrlTargetType($targetType) || $targetId === '' || $tileId === '') {
        return '';
    }
    $existing = getActiveShortUrlRow($db, $targetType, $targetId);
    if ($existing && !empty($existing['code'])) {
        if ((string)$existing['tile_id'] !== $tileId) {
            $db->prepare('UPDATE short_urls SET tile_id = ? WHERE id = ?')->execute([$tileId, $existing['id']]);
        }
        return (string)$existing['code'];
    }

    $code = generateShortUrlCode($db);
    $now = time();
    $userId = is_numeric($createdBy) ? (int)$createdBy : null;
    try {
        $stmt = $db->prepare('INSERT INTO short_urls (code, target_type, target_id, tile_id, revoked, created_at, created_by) VALUES (?, ?, ?, ?, 0, ?, ?)');
        $stmt->execute([$code, $targetType, $targetId, $tileId, $now, $userId]);
        return $code;
    } catch (PDOException $e) {
        $again = getActiveShortUrlRow($db, $targetType, $targetId);
        if ($again && !empty($again['code'])) {
            return (string)$again['code'];
        }
        throw $e;
    }
}

function recycleShortUrl(PDO $db, string $targetType, string $targetId, string $tileId, $createdBy = null): string {
    if (!isValidShortUrlTargetType($targetType) || $targetId === '' || $tileId === '') {
        throw new InvalidArgumentException('Invalid short URL target');
    }
    $now = time();
    $db->prepare('UPDATE short_urls SET revoked = 1, revoked_at = ? WHERE target_type = ? AND target_id = ? AND revoked = 0')
        ->execute([$now, $targetType, $targetId]);
    return ensureActiveShortUrl($db, $targetType, $targetId, $tileId, $createdBy);
}

/**
 * @param array<int, array{type:string,id:string}> $targets
 * @return array<string, string> map "type:id" => code
 */
function ensureShortUrlsForTargets(PDO $db, string $tileId, array $targets, $createdBy = null): array {
    $out = [];
    if ($tileId === '' || $targets === []) {
        return $out;
    }
    $started = false;
    try {
        if (!$db->inTransaction()) {
            $db->beginTransaction();
            $started = true;
        }
        foreach ($targets as $target) {
            $type = $target['type'] ?? '';
            $id = $target['id'] ?? '';
            if (!isValidShortUrlTargetType($type) || $id === '') {
                continue;
            }
            $code = ensureActiveShortUrl($db, $type, $id, $tileId, $createdBy);
            if ($code !== '') {
                $out[$type . ':' . $id] = $code;
            }
        }
        if ($started) {
            $db->commit();
        }
    } catch (Throwable $e) {
        if ($started && $db->inTransaction()) {
            $db->rollBack();
        }
        error_log('ensureShortUrlsForTargets: ' . $e->getMessage());
        foreach ($targets as $target) {
            $type = $target['type'] ?? '';
            $id = $target['id'] ?? '';
            if (!isValidShortUrlTargetType($type) || $id === '') {
                continue;
            }
            $row = getActiveShortUrlRow($db, $type, $id);
            if ($row && !empty($row['code'])) {
                $out[$type . ':' . $id] = (string)$row['code'];
            }
        }
    }
    return $out;
}

/**
 * @param array<int, array{type:string,id:string}> $targets
 * @return array<string, string> map "type:id" => code (existing only)
 */
function lookupActiveShortUrlCodes(PDO $db, array $targets): array {
    $out = [];
    if ($targets === []) {
        return $out;
    }
    $byType = [];
    foreach ($targets as $target) {
        $type = $target['type'] ?? '';
        $id = $target['id'] ?? '';
        if (!isValidShortUrlTargetType($type) || $id === '') {
            continue;
        }
        $byType[$type][] = $id;
    }
    foreach ($byType as $type => $ids) {
        $ids = array_values(array_unique($ids));
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $db->prepare("SELECT target_type, target_id, code FROM short_urls WHERE revoked = 0 AND target_type = ? AND target_id IN ($placeholders)");
        $stmt->execute(array_merge([$type], $ids));
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $out[$row['target_type'] . ':' . $row['target_id']] = (string)$row['code'];
        }
    }
    return $out;
}

function collectShortUrlTargetsFromTilePayload(array $tile): array {
    $tileId = (string)($tile['id'] ?? '');
    if ($tileId === '') {
        return [];
    }
    $targets = [['type' => 'tile', 'id' => $tileId]];
    foreach ($tile['tabs'] ?? [] as $tab) {
        if (!is_array($tab) || empty($tab['id'])) {
            continue;
        }
        $targets[] = ['type' => 'tab', 'id' => (string)$tab['id']];
        foreach ($tab['sections'] ?? [] as $section) {
            if (!is_array($section) || empty($section['id'])) {
                continue;
            }
            $targets[] = ['type' => 'section', 'id' => (string)$section['id']];
            foreach ($section['links'] ?? [] as $link) {
                if (!is_array($link) || empty($link['id'])) {
                    continue;
                }
                $targets[] = ['type' => 'link', 'id' => (string)$link['id']];
            }
        }
    }
    foreach ($tile['searchLinks'] ?? [] as $link) {
        if (!is_array($link) || empty($link['id'])) {
            continue;
        }
        $targets[] = ['type' => 'link', 'id' => (string)$link['id']];
    }
    return $targets;
}

function applyShortUrlCodesToTilePayload(array &$tile, array $codes): void {
    $tileId = (string)($tile['id'] ?? '');
    if ($tileId !== '' && isset($codes['tile:' . $tileId])) {
        $tile['shortUrl'] = shortUrlForCode($codes['tile:' . $tileId]);
    }
    if (!empty($tile['tabs']) && is_array($tile['tabs'])) {
        foreach ($tile['tabs'] as &$tab) {
            if (!is_array($tab) || empty($tab['id'])) {
                continue;
            }
            $tabKey = 'tab:' . $tab['id'];
            if (isset($codes[$tabKey])) {
                $tab['shortUrl'] = shortUrlForCode($codes[$tabKey]);
            }
            if (empty($tab['sections']) || !is_array($tab['sections'])) {
                continue;
            }
            foreach ($tab['sections'] as &$section) {
                if (!is_array($section) || empty($section['id'])) {
                    continue;
                }
                $sectionKey = 'section:' . $section['id'];
                if (isset($codes[$sectionKey])) {
                    $section['shortUrl'] = shortUrlForCode($codes[$sectionKey]);
                }
                if (empty($section['links']) || !is_array($section['links'])) {
                    continue;
                }
                foreach ($section['links'] as &$link) {
                    if (!is_array($link) || empty($link['id'])) {
                        continue;
                    }
                    $linkKey = 'link:' . $link['id'];
                    if (isset($codes[$linkKey])) {
                        $link['shortUrl'] = shortUrlForCode($codes[$linkKey]);
                    }
                }
                unset($link);
            }
            unset($section);
        }
        unset($tab);
    }
    if (!empty($tile['searchLinks']) && is_array($tile['searchLinks'])) {
        foreach ($tile['searchLinks'] as &$link) {
            if (!is_array($link) || empty($link['id'])) {
                continue;
            }
            $linkKey = 'link:' . $link['id'];
            if (isset($codes[$linkKey])) {
                $link['shortUrl'] = shortUrlForCode($codes[$linkKey]);
            }
        }
        unset($link);
    }
}

function attachShortUrlsToTilePayload(PDO $db, array &$tile, bool $ensure = true, $createdBy = null): void {
    $tileId = (string)($tile['id'] ?? '');
    $targets = collectShortUrlTargetsFromTilePayload($tile);
    if ($tileId === '' || $targets === []) {
        return;
    }
    $codes = $ensure
        ? ensureShortUrlsForTargets($db, $tileId, $targets, $createdBy)
        : lookupActiveShortUrlCodes($db, $targets);
    applyShortUrlCodesToTilePayload($tile, $codes);
}

function attachShortUrlsToTilesList(PDO $db, array &$tiles, $createdBy = null): void {
    foreach ($tiles as &$tile) {
        if (!is_array($tile) || empty($tile['id'])) {
            continue;
        }
        $ensure = mapShowShortUrlsFromRow($tile);
        attachShortUrlsToTilePayload($db, $tile, $ensure, $createdBy);
    }
    unset($tile);
}

function resolveShortUrlTargetContext(PDO $db, array $shortRow): ?array {
    $type = (string)($shortRow['target_type'] ?? '');
    $targetId = (string)($shortRow['target_id'] ?? '');
    $tileId = (string)($shortRow['tile_id'] ?? '');
    if (!isValidShortUrlTargetType($type) || $targetId === '') {
        return null;
    }

    $tileStmt = $db->prepare('SELECT * FROM tiles WHERE id = ? LIMIT 1');
    $tileStmt->execute([$tileId !== '' ? $tileId : $targetId]);
    $tile = $tileStmt->fetch(PDO::FETCH_ASSOC);
    if (!$tile) {
        return null;
    }
    $tileId = (string)$tile['id'];

    $tab = null;
    $section = null;
    $link = null;

    if ($type === 'tile') {
        return [
            'type' => 'tile',
            'tile' => $tile,
            'tab' => null,
            'section' => null,
            'link' => null,
        ];
    }

    if ($type === 'tab') {
        $stmt = $db->prepare('SELECT * FROM tabs WHERE id = ? AND tile_id = ? LIMIT 1');
        $stmt->execute([$targetId, $tileId]);
        $tab = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        if (!$tab) {
            return null;
        }
        return ['type' => 'tab', 'tile' => $tile, 'tab' => $tab, 'section' => null, 'link' => null];
    }

    if ($type === 'section') {
        $stmt = $db->prepare('SELECT * FROM sections WHERE id = ? LIMIT 1');
        $stmt->execute([$targetId]);
        $section = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        if (!$section) {
            return null;
        }
        $sectionTileId = (string)($section['tile_id'] ?? '');
        $tabId = (string)($section['tab_id'] ?? '');
        if ($sectionTileId !== '' && $sectionTileId !== $tileId) {
            $tileStmt->execute([$sectionTileId]);
            $tile = $tileStmt->fetch(PDO::FETCH_ASSOC) ?: $tile;
            $tileId = (string)$tile['id'];
        }
        if ($tabId !== '') {
            $tabStmt = $db->prepare('SELECT * FROM tabs WHERE id = ? LIMIT 1');
            $tabStmt->execute([$tabId]);
            $tab = $tabStmt->fetch(PDO::FETCH_ASSOC) ?: null;
        }
        return ['type' => 'section', 'tile' => $tile, 'tab' => $tab, 'section' => $section, 'link' => null];
    }

    $stmt = $db->prepare('SELECT * FROM links WHERE id = ? LIMIT 1');
    $stmt->execute([$targetId]);
    $link = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    if (!$link) {
        return null;
    }
    $sectionId = (string)($link['section_id'] ?? '');
    if ($sectionId !== '') {
        $secStmt = $db->prepare('SELECT * FROM sections WHERE id = ? LIMIT 1');
        $secStmt->execute([$sectionId]);
        $section = $secStmt->fetch(PDO::FETCH_ASSOC) ?: null;
        if ($section) {
            $sectionTileId = (string)($section['tile_id'] ?? '');
            if ($sectionTileId !== '' && $sectionTileId !== $tileId) {
                $tileStmt->execute([$sectionTileId]);
                $found = $tileStmt->fetch(PDO::FETCH_ASSOC);
                if ($found) {
                    $tile = $found;
                    $tileId = (string)$tile['id'];
                }
            }
            $tabId = (string)($section['tab_id'] ?? '');
            if ($tabId !== '') {
                $tabStmt = $db->prepare('SELECT * FROM tabs WHERE id = ? LIMIT 1');
                $tabStmt->execute([$tabId]);
                $tab = $tabStmt->fetch(PDO::FETCH_ASSOC) ?: null;
            }
        }
    }

    return ['type' => 'link', 'tile' => $tile, 'tab' => $tab, 'section' => $section, 'link' => $link];
}

function userCanSeeShortUrlContext(PDO $db, ?array $user, array $ctx, array $userGroupIds): bool {
    $tile = $ctx['tile'] ?? null;
    if (!is_array($tile)) {
        return false;
    }
    if (!empty($tile['deleted_at']) || !empty($tile['archived_at'])) {
        return false;
    }
    if (!canUserSeePublishedContent($user, $tile)) {
        return false;
    }

    $tileId = (string)$tile['id'];
    $isOwner = $user && isset($tile['user_id']) && (int)$tile['user_id'] === (int)$user['id'];
    $shareOk = $user && userHasAcceptedTileShare($db, $tileId, $user);
    $roleOk = $user && !empty($user['id']) && function_exists('canUserViewTileByRole') && canUserViewTileByRole($user['id'], $tileId, $db);
    $tileVisible = canUserSeeByVisibility($user, $tile, $userGroupIds) || $isOwner || $shareOk || $roleOk || !empty($user['is_admin']);
    if (!$tileVisible) {
        return false;
    }

    $isAcceptedShare = $shareOk || $isOwner || !empty($user['is_admin']);
    foreach (['tab', 'section'] as $nestedKey) {
        $row = $ctx[$nestedKey] ?? null;
        if (!is_array($row)) {
            continue;
        }
        if (!canUserSeePublishedContent($user, $row)) {
            return false;
        }
        if (!canUserSeeNestedInTile($db, $tileId, $user, $row, $userGroupIds, $isAcceptedShare)) {
            return false;
        }
    }

    $link = $ctx['link'] ?? null;
    if (is_array($link)) {
        if (!canUserSeePublishedContent($user, $link)) {
            return false;
        }
        $linkVisible = canUserSeeNestedInTile($db, $tileId, $user, $link, $userGroupIds, $isAcceptedShare);
        if (!$linkVisible && $user && empty($user['is_admin']) && function_exists('canUserViewLinkByRole')) {
            $linkVisible = canUserViewLinkByRole($user['id'], $link['id'], $db);
        }
        if (!$linkVisible && empty($user['is_admin'])) {
            return false;
        }
    }

    return true;
}

function shortUrlContextNeedsAuth(?array $user, array $ctx): bool {
    if ($user) {
        return false;
    }
    $rows = array_filter([$ctx['tile'] ?? null, $ctx['tab'] ?? null, $ctx['section'] ?? null, $ctx['link'] ?? null], 'is_array');
    foreach ($rows as $row) {
        $visibility = $row['visibility'] ?? 'public';
        if ($visibility === 'authenticated' || $visibility === 'private') {
            return true;
        }
        if (!isContentPublished($row)) {
            return true;
        }
    }
    $sourceTab = isset($ctx['tile']['source_tab']) ? trim((string)$ctx['tile']['source_tab']) : 'public';
    if ($sourceTab === 'staging') {
        return true;
    }
    return false;
}

function spaHashForShortUrlContext(array $ctx): string {
    $tileId = (string)($ctx['tile']['id'] ?? '');
    $hash = '#/tile/' . rawurlencode($tileId);
    $params = [];
    $tab = $ctx['tab'] ?? null;
    if (is_array($tab) && !empty($tab['id'])) {
        $params['tab'] = (string)$tab['id'];
    }
    $section = $ctx['section'] ?? null;
    if (is_array($section) && !empty($section['id'])) {
        $params['section'] = (string)$section['id'];
    }
    $link = $ctx['link'] ?? null;
    if (is_array($link) && !empty($link['id'])) {
        $params['link'] = (string)$link['id'];
    }
    if ($params) {
        $hash .= '?' . http_build_query($params);
    }
    return $hash;
}

function isHttpOrHttpsDestination($url): bool {
    return (bool)preg_match('#^https?://#i', trim((string)$url));
}

function resolveShortUrlTargetOwnerTileId(PDO $db, string $targetType, string $targetId): ?string {
    if ($targetType === 'tile') {
        $stmt = $db->prepare('SELECT id FROM tiles WHERE id = ? LIMIT 1');
        $stmt->execute([$targetId]);
        $id = $stmt->fetchColumn();
        return $id ? (string)$id : null;
    }
    if ($targetType === 'tab') {
        $stmt = $db->prepare('SELECT tile_id FROM tabs WHERE id = ? LIMIT 1');
        $stmt->execute([$targetId]);
        $id = $stmt->fetchColumn();
        return $id ? (string)$id : null;
    }
    if ($targetType === 'section') {
        $stmt = $db->prepare('SELECT COALESCE(NULLIF(tile_id, \'\'), (SELECT tile_id FROM tabs WHERE tabs.id = sections.tab_id)) FROM sections WHERE id = ? LIMIT 1');
        $stmt->execute([$targetId]);
        $id = $stmt->fetchColumn();
        return $id ? (string)$id : null;
    }
    if ($targetType === 'link') {
        $stmt = $db->prepare(
            'SELECT COALESCE(s.tile_id, t.tile_id) FROM links l
             LEFT JOIN sections s ON s.id = l.section_id
             LEFT JOIN tabs t ON t.id = s.tab_id
             WHERE l.id = ? LIMIT 1'
        );
        $stmt->execute([$targetId]);
        $id = $stmt->fetchColumn();
        return $id ? (string)$id : null;
    }
    return null;
}
