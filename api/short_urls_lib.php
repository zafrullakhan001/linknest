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

function mapForceShortUrlFromRow(array $row): bool {
    $raw = $row['force_short_url'] ?? $row['forceShortUrl'] ?? 0;
    return !empty($raw) && $raw !== '0' && $raw !== false && $raw !== 'false';
}

function forceShortUrlDbValue($item): int {
    if (!is_array($item)) {
        return 0;
    }
    if (array_key_exists('forceShortUrl', $item)) {
        $raw = $item['forceShortUrl'];
        return ($raw === true || $raw === 1 || $raw === '1') ? 1 : 0;
    }
    if (array_key_exists('force_short_url', $item)) {
        return ((int)$item['force_short_url'] === 1) ? 1 : 0;
    }
    return 0;
}

function applyLinkForceShortUrlToApi(array &$link, array $row): void {
    $link['forceShortUrl'] = mapForceShortUrlFromRow($row);
}

function persistLinkForceShortUrl(PDO $db, string $linkId, $source): void {
    if ($linkId === '') {
        return;
    }
    if (function_exists('ensureLinkForceShortUrlColumn')) {
        ensureLinkForceShortUrlColumn($db);
    }
    try {
        $value = forceShortUrlDbValue($source);
        $stmt = $db->prepare('UPDATE links SET force_short_url = ? WHERE id = ?');
        $stmt->execute([$value, $linkId]);
        if ($value !== 1) {
            return;
        }
        $q = $db->prepare('SELECT s.tile_id FROM links l INNER JOIN sections s ON l.section_id = s.id WHERE l.id = ? LIMIT 1');
        $q->execute([$linkId]);
        $tileId = $q->fetchColumn();
        if ($tileId) {
            ensureActiveShortUrl($db, 'link', $linkId, (string)$tileId, null);
        }
    } catch (PDOException $e) {
        error_log('persistLinkForceShortUrl: ' . $e->getMessage());
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
    if (!$ensure) {
        $forceTargets = [];
        foreach ($tile['tabs'] ?? [] as $tab) {
            if (!is_array($tab)) {
                continue;
            }
            foreach ($tab['sections'] ?? [] as $section) {
                if (!is_array($section)) {
                    continue;
                }
                foreach ($section['links'] ?? [] as $link) {
                    if (!is_array($link) || empty($link['id']) || empty($link['forceShortUrl'])) {
                        continue;
                    }
                    $forceTargets[] = ['type' => 'link', 'id' => (string)$link['id']];
                }
            }
        }
        foreach ($tile['searchLinks'] ?? [] as $link) {
            if (!is_array($link) || empty($link['id']) || empty($link['forceShortUrl'])) {
                continue;
            }
            $forceTargets[] = ['type' => 'link', 'id' => (string)$link['id']];
        }
        if ($forceTargets !== []) {
            $forced = ensureShortUrlsForTargets($db, $tileId, $forceTargets, $createdBy);
            $codes = array_merge($codes, $forced);
        }
    }
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

const SHORT_URL_ROTATION_LOG_KEEP = 100;

/**
 * Allocate unique short-URL codes without per-code DB round trips.
 *
 * @param array<string, true> $usedCodes
 * @return array<int, string>
 */
function allocateShortUrlCodes(int $count, array &$usedCodes): array {
    if ($count <= 0) {
        return [];
    }
    $alphabet = SHORT_URL_CODE_ALPHABET;
    $len = strlen($alphabet);
    $codes = [];
    $maxAttempts = $count * 80 + 200;
    $attempts = 0;
    while (count($codes) < $count && $attempts < $maxAttempts) {
        $attempts++;
        $code = '';
        for ($i = 0; $i < SHORT_URL_CODE_LENGTH; $i++) {
            $code .= $alphabet[random_int(0, $len - 1)];
        }
        if (isset($usedCodes[$code])) {
            continue;
        }
        $usedCodes[$code] = true;
        $codes[] = $code;
    }
    if (count($codes) < $count) {
        throw new RuntimeException('Unable to allocate enough unique short URL codes');
    }
    return $codes;
}

/**
 * @return array<string, mixed>
 */
function mapShortUrlRotationLogRow(array $row): array {
    $byType = ['tile' => 0, 'tab' => 0, 'section' => 0, 'link' => 0];
    $raw = $row['by_type_json'] ?? '';
    if (is_string($raw) && $raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            foreach ($byType as $type => $_) {
                $byType[$type] = (int)($decoded[$type] ?? 0);
            }
        }
    }
    return [
        'id' => (int)($row['id'] ?? 0),
        'startedAt' => (int)($row['started_at'] ?? 0),
        'finishedAt' => (int)($row['finished_at'] ?? 0),
        'durationMs' => (int)($row['duration_ms'] ?? 0),
        'rotatedBy' => isset($row['rotated_by']) && $row['rotated_by'] !== null && $row['rotated_by'] !== ''
            ? (int)$row['rotated_by']
            : null,
        'rotatedByUsername' => $row['rotated_by_username'] !== null && $row['rotated_by_username'] !== ''
            ? (string)$row['rotated_by_username']
            : null,
        'ipAddress' => $row['ip_address'] !== null && $row['ip_address'] !== ''
            ? (string)$row['ip_address']
            : null,
        'scope' => (string)($row['scope'] ?? 'all'),
        'activeBefore' => (int)($row['active_before'] ?? 0),
        'rotatedCount' => (int)($row['rotated_count'] ?? 0),
        'skippedCount' => (int)($row['skipped_count'] ?? 0),
        'errorCount' => (int)($row['error_count'] ?? 0),
        'byType' => $byType,
        'status' => (string)($row['status'] ?? 'completed'),
        'errorMessage' => $row['error_message'] !== null && $row['error_message'] !== ''
            ? (string)$row['error_message']
            : null,
    ];
}

function pruneShortUrlRotationLogs(PDO $db, int $keep = SHORT_URL_ROTATION_LOG_KEEP): void {
    $keep = max(10, $keep);
    try {
        $db->exec(
            'DELETE FROM short_url_rotation_logs WHERE id NOT IN (
                SELECT id FROM (
                    SELECT id FROM short_url_rotation_logs ORDER BY id DESC LIMIT ' . (int)$keep . '
                )
            )'
        );
    } catch (PDOException $e) {
        error_log('pruneShortUrlRotationLogs: ' . $e->getMessage());
    }
}

/**
 * @return array<string, mixed>
 */
function insertShortUrlRotationLog(PDO $db, array $fields): array {
    $stmt = $db->prepare(
        'INSERT INTO short_url_rotation_logs (
            started_at, finished_at, duration_ms, rotated_by, rotated_by_username, ip_address,
            scope, active_before, rotated_count, skipped_count, error_count, by_type_json, status, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $byType = $fields['by_type'] ?? ['tile' => 0, 'tab' => 0, 'section' => 0, 'link' => 0];
    $stmt->execute([
        (int)($fields['started_at'] ?? time()),
        (int)($fields['finished_at'] ?? time()),
        (int)($fields['duration_ms'] ?? 0),
        $fields['rotated_by'] ?? null,
        $fields['rotated_by_username'] ?? null,
        $fields['ip_address'] ?? null,
        (string)($fields['scope'] ?? 'all'),
        (int)($fields['active_before'] ?? 0),
        (int)($fields['rotated_count'] ?? 0),
        (int)($fields['skipped_count'] ?? 0),
        (int)($fields['error_count'] ?? 0),
        json_encode($byType, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        (string)($fields['status'] ?? 'completed'),
        $fields['error_message'] ?? null,
    ]);
    $id = (int)$db->lastInsertId();
    $rowStmt = $db->prepare('SELECT * FROM short_url_rotation_logs WHERE id = ? LIMIT 1');
    $rowStmt->execute([$id]);
    $row = $rowStmt->fetch(PDO::FETCH_ASSOC) ?: array_merge($fields, ['id' => $id, 'by_type_json' => json_encode($byType)]);
    return mapShortUrlRotationLogRow($row);
}

/**
 * Rotate every currently active short URL. Old codes stay revoked and never reveal the destination.
 *
 * @param array<string, mixed>|null $user
 * @return array{run: array<string, mixed>, rotatedCount: int}
 */
function rotateAllActiveShortUrls(PDO $db, $user = null): array {
    if (function_exists('ensureShortUrlRotationLogsTable')) {
        ensureShortUrlRotationLogsTable($db);
    }
    if (function_exists('ensureShortUrlsSchema')) {
        ensureShortUrlsSchema($db);
    }

    $startedAt = time();
    $t0 = function_exists('hrtime') ? hrtime(true) : (int) round(microtime(true) * 1e9);

    $actorId = null;
    $actorUsername = null;
    if (is_array($user)) {
        $actorId = isset($user['id']) ? (int)$user['id'] : null;
        $actorUsername = isset($user['username']) ? (string)$user['username'] : null;
        if (!empty($user['impersonating']) && !empty($user['impersonating_admin_id'])) {
            $actorId = (int)$user['impersonating_admin_id'];
            if (!empty($user['impersonating_admin_username'])) {
                $actorUsername = (string)$user['impersonating_admin_username'];
            }
        }
    }
    $ip = function_exists('getClientIpAddress') ? getClientIpAddress() : (string)($_SERVER['REMOTE_ADDR'] ?? '');
    if ($ip === '') {
        $ip = null;
    }

    $byType = ['tile' => 0, 'tab' => 0, 'section' => 0, 'link' => 0];
    $rotated = 0;
    $skipped = 0;
    $activeBefore = 0;

    try {
        $active = $db->query(
            'SELECT id, code, target_type, target_id, tile_id FROM short_urls WHERE revoked = 0 ORDER BY id ASC'
        )->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $activeBefore = count($active);

        $usedCodes = [];
        $codeStmt = $db->query('SELECT code FROM short_urls');
        if ($codeStmt) {
            while ($codeRow = $codeStmt->fetch(PDO::FETCH_NUM)) {
                if (!empty($codeRow[0])) {
                    $usedCodes[(string)$codeRow[0]] = true;
                }
            }
        }

        $now = time();
        $startedTxn = false;
        if (!$db->inTransaction()) {
            $db->beginTransaction();
            $startedTxn = true;
        }

        if ($activeBefore > 0) {
            $newCodes = allocateShortUrlCodes($activeBefore, $usedCodes);
            $revokeStmt = $db->prepare('UPDATE short_urls SET revoked = 1, revoked_at = ? WHERE id = ? AND revoked = 0');
            $insertStmt = $db->prepare(
                'INSERT INTO short_urls (code, target_type, target_id, tile_id, revoked, created_at, created_by) VALUES (?, ?, ?, ?, 0, ?, ?)'
            );
            foreach ($active as $index => $row) {
                $type = (string)($row['target_type'] ?? '');
                $targetId = (string)($row['target_id'] ?? '');
                $tileId = (string)($row['tile_id'] ?? '');
                if (!isValidShortUrlTargetType($type) || $targetId === '' || $tileId === '') {
                    $skipped++;
                    continue;
                }
                $code = $newCodes[$index] ?? null;
                if (!is_string($code) || $code === '') {
                    $skipped++;
                    continue;
                }
                $revokeStmt->execute([$now, (int)$row['id']]);
                $insertStmt->execute([$code, $type, $targetId, $tileId, $now, $actorId]);
                if (!isset($byType[$type])) {
                    $byType[$type] = 0;
                }
                $byType[$type]++;
                $rotated++;
            }
        }

        $finishedAt = time();
        $durationMs = (int) max(0, round(((function_exists('hrtime') ? hrtime(true) : (int) round(microtime(true) * 1e9)) - $t0) / 1e6));
        $run = insertShortUrlRotationLog($db, [
            'started_at' => $startedAt,
            'finished_at' => $finishedAt,
            'duration_ms' => $durationMs,
            'rotated_by' => $actorId,
            'rotated_by_username' => $actorUsername,
            'ip_address' => $ip,
            'scope' => 'all',
            'active_before' => $activeBefore,
            'rotated_count' => $rotated,
            'skipped_count' => $skipped,
            'error_count' => 0,
            'by_type' => $byType,
            'status' => 'completed',
        ]);
        pruneShortUrlRotationLogs($db);
        if ($startedTxn && $db->inTransaction()) {
            $db->commit();
        }
        return ['run' => $run, 'rotatedCount' => $rotated];
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        $finishedAt = time();
        $durationMs = (int) max(0, round(((function_exists('hrtime') ? hrtime(true) : (int) round(microtime(true) * 1e9)) - $t0) / 1e6));
        $run = [
            'id' => 0,
            'startedAt' => $startedAt,
            'finishedAt' => $finishedAt,
            'durationMs' => $durationMs,
            'rotatedBy' => $actorId,
            'rotatedByUsername' => $actorUsername,
            'ipAddress' => $ip,
            'scope' => 'all',
            'activeBefore' => $activeBefore,
            'rotatedCount' => 0,
            'skippedCount' => 0,
            'errorCount' => 1,
            'byType' => $byType,
            'status' => 'failed',
            'errorMessage' => $e->getMessage(),
        ];
        try {
            $run = insertShortUrlRotationLog($db, [
                'started_at' => $startedAt,
                'finished_at' => $finishedAt,
                'duration_ms' => $durationMs,
                'rotated_by' => $actorId,
                'rotated_by_username' => $actorUsername,
                'ip_address' => $ip,
                'scope' => 'all',
                'active_before' => $activeBefore,
                'rotated_count' => 0,
                'skipped_count' => 0,
                'error_count' => 1,
                'by_type' => $byType,
                'status' => 'failed',
                'error_message' => substr($e->getMessage(), 0, 1000),
            ]);
        } catch (Throwable $logError) {
            error_log('rotateAllActiveShortUrls log failed: ' . $logError->getMessage());
        }
        error_log('rotateAllActiveShortUrls: ' . $e->getMessage());
        return ['run' => $run, 'rotatedCount' => 0];
    }
}

/**
 * @return array<string, mixed>
 */
function getShortUrlRotationStats(PDO $db): array {
    if (function_exists('ensureShortUrlRotationLogsTable')) {
        ensureShortUrlRotationLogsTable($db);
    }
    if (function_exists('ensureShortUrlsSchema')) {
        ensureShortUrlsSchema($db);
    }

    $active = ['total' => 0, 'tile' => 0, 'tab' => 0, 'section' => 0, 'link' => 0];
    $revoked = 0;
    $oldestActiveAt = null;
    $newestActiveAt = null;
    try {
        $stmt = $db->query(
            "SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN revoked = 0 THEN 1 ELSE 0 END) AS active_total,
                SUM(CASE WHEN revoked = 1 THEN 1 ELSE 0 END) AS revoked_total,
                SUM(CASE WHEN revoked = 0 AND target_type = 'tile' THEN 1 ELSE 0 END) AS active_tile,
                SUM(CASE WHEN revoked = 0 AND target_type = 'tab' THEN 1 ELSE 0 END) AS active_tab,
                SUM(CASE WHEN revoked = 0 AND target_type = 'section' THEN 1 ELSE 0 END) AS active_section,
                SUM(CASE WHEN revoked = 0 AND target_type = 'link' THEN 1 ELSE 0 END) AS active_link,
                MIN(CASE WHEN revoked = 0 THEN created_at END) AS oldest_active_at,
                MAX(CASE WHEN revoked = 0 THEN created_at END) AS newest_active_at
             FROM short_urls"
        );
        $row = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : null;
        if ($row) {
            $active['total'] = (int)($row['active_total'] ?? 0);
            $active['tile'] = (int)($row['active_tile'] ?? 0);
            $active['tab'] = (int)($row['active_tab'] ?? 0);
            $active['section'] = (int)($row['active_section'] ?? 0);
            $active['link'] = (int)($row['active_link'] ?? 0);
            $revoked = (int)($row['revoked_total'] ?? 0);
            $oldestActiveAt = $row['oldest_active_at'] !== null ? (int)$row['oldest_active_at'] : null;
            $newestActiveAt = $row['newest_active_at'] !== null ? (int)$row['newest_active_at'] : null;
        }
    } catch (PDOException $e) {
        error_log('getShortUrlRotationStats inventory: ' . $e->getMessage());
    }

    $spacesShowing = 0;
    try {
        $spacesShowing = (int)$db->query(
            'SELECT COUNT(*) FROM tiles WHERE show_short_urls = 1'
        )->fetchColumn();
    } catch (PDOException $e) {
        $spacesShowing = 0;
    }

    $lifetimeRuns = 0;
    $lifetimeRotated = 0;
    $avgDurationMs = null;
    $lastRun = null;
    try {
        $agg = $db->query(
            "SELECT COUNT(*) AS run_count,
                    COALESCE(SUM(rotated_count), 0) AS lifetime_rotated,
                    AVG(CASE WHEN status = 'completed' THEN duration_ms END) AS avg_duration_ms
             FROM short_url_rotation_logs"
        )->fetch(PDO::FETCH_ASSOC);
        if ($agg) {
            $lifetimeRuns = (int)($agg['run_count'] ?? 0);
            $lifetimeRotated = (int)($agg['lifetime_rotated'] ?? 0);
            $avgDurationMs = $agg['avg_duration_ms'] !== null ? (int) round((float)$agg['avg_duration_ms']) : null;
        }
        $last = $db->query('SELECT * FROM short_url_rotation_logs ORDER BY id DESC LIMIT 1')->fetch(PDO::FETCH_ASSOC);
        if ($last) {
            $lastRun = mapShortUrlRotationLogRow($last);
        }
    } catch (PDOException $e) {
        error_log('getShortUrlRotationStats logs: ' . $e->getMessage());
    }

    $now = time();
    $oldestActiveAgeSeconds = $oldestActiveAt ? max(0, $now - $oldestActiveAt) : null;
    $newestActiveAgeSeconds = $newestActiveAt ? max(0, $now - $newestActiveAt) : null;

    return [
        'active' => $active,
        'revoked' => $revoked,
        'spacesShowingShortUrls' => $spacesShowing,
        'oldestActiveAt' => $oldestActiveAt,
        'newestActiveAt' => $newestActiveAt,
        'oldestActiveAgeSeconds' => $oldestActiveAgeSeconds,
        'newestActiveAgeSeconds' => $newestActiveAgeSeconds,
        'lifetimeRuns' => $lifetimeRuns,
        'lifetimeRotated' => $lifetimeRotated,
        'avgDurationMs' => $avgDurationMs,
        'lastRun' => $lastRun,
    ];
}

/**
 * @return array{logs: array<int, array<string, mixed>>, total: int, page: int, perPage: int}
 */
function listShortUrlRotationLogs(PDO $db, int $page = 1, int $perPage = 25): array {
    if (function_exists('ensureShortUrlRotationLogsTable')) {
        ensureShortUrlRotationLogsTable($db);
    }
    $page = max(1, $page);
    $perPage = max(1, min(100, $perPage));
    $total = 0;
    try {
        $total = (int)$db->query('SELECT COUNT(*) FROM short_url_rotation_logs')->fetchColumn();
    } catch (PDOException $e) {
        return ['logs' => [], 'total' => 0, 'page' => $page, 'perPage' => $perPage];
    }
    $offset = ($page - 1) * $perPage;
    $stmt = $db->prepare(
        'SELECT * FROM short_url_rotation_logs ORDER BY id DESC LIMIT ' . (int)$perPage . ' OFFSET ' . (int)$offset
    );
    $stmt->execute();
    $logs = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $logs[] = mapShortUrlRotationLogRow($row);
    }
    return [
        'logs' => $logs,
        'total' => $total,
        'page' => $page,
        'perPage' => $perPage,
    ];
}
