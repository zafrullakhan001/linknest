<?php
/**
 * Cross-instance space sync.
 *
 * An imported space can remember the instance and space id it came from.
 * Sync pulls that space and updates tabs, sections, and links. Sharing,
 * visibility, dashboard placement, published flag, and message-board rows stay.
 */

function ensureSpaceSyncColumns(PDO $db): void {
    static $ensured = false;
    if ($ensured) {
        return;
    }
    try {
        $tileExists = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='tiles'")->fetchColumn();
        if (!$tileExists) {
            return;
        }
        $tileCols = array_column($db->query('PRAGMA table_info(tiles)')->fetchAll(PDO::FETCH_ASSOC), 'name');
        $tileNeeded = [
            'sync_source_base_url' => 'TEXT',
            'sync_source_tile_id' => 'TEXT',
            'sync_source_token' => 'TEXT',
            'sync_last_at' => 'INTEGER',
        ];
        foreach ($tileNeeded as $col => $type) {
            if (!in_array($col, $tileCols, true)) {
                $db->exec("ALTER TABLE tiles ADD COLUMN {$col} {$type}");
            }
        }
        foreach (['tabs', 'sections', 'links'] as $table) {
            $exists = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name=" . $db->quote($table))->fetchColumn();
            if (!$exists) {
                continue;
            }
            $names = array_column($db->query("PRAGMA table_info({$table})")->fetchAll(PDO::FETCH_ASSOC), 'name');
            if (!in_array('sync_source_id', $names, true)) {
                $db->exec("ALTER TABLE {$table} ADD COLUMN sync_source_id TEXT");
            }
        }
        $ensured = true;
    } catch (PDOException $e) {
        error_log('ensureSpaceSyncColumns warning: ' . $e->getMessage());
    }
}

function spaceSyncSourceForApi(array $row): ?array {
    $base = trim((string)($row['sync_source_base_url'] ?? ''));
    $tileId = trim((string)($row['sync_source_tile_id'] ?? ''));
    if ($base === '' || $tileId === '') {
        return null;
    }
    return [
        'baseUrl' => $base,
        'tileId' => $tileId,
        'hasToken' => trim((string)($row['sync_source_token'] ?? '')) !== '',
        'lastSyncAt' => !empty($row['sync_last_at']) ? (int)$row['sync_last_at'] : null,
    ];
}

function spaceSyncChildId(array $row): ?string {
    $id = trim((string)($row['sync_source_id'] ?? ''));
    return $id !== '' ? $id : null;
}

/**
 * Remember source ids sent with a create/update so a later sync can match rows.
 * The read token is never taken from a full tile save (only from the sync-source endpoint).
 */
function persistTileSyncSource(PDO $db, string $tileId, array $data): void {
    if (!array_key_exists('syncSource', $data)) {
        return;
    }
    ensureSpaceSyncColumns($db);
    $src = $data['syncSource'];
    if ($src === null || $src === '' || !is_array($src)) {
        $db->prepare('UPDATE tiles SET sync_source_base_url = NULL, sync_source_tile_id = NULL, sync_source_token = NULL WHERE id = ?')
            ->execute([$tileId]);
        return;
    }
    $base = spaceSyncNormalizeBaseUrl((string)($src['baseUrl'] ?? ''));
    $sourceTileId = spaceSyncNormalizeTileId((string)($src['tileId'] ?? ''));
    if ($base === null || $sourceTileId === null) {
        $db->prepare('UPDATE tiles SET sync_source_base_url = NULL, sync_source_tile_id = NULL, sync_source_token = NULL WHERE id = ?')
            ->execute([$tileId]);
        return;
    }
    $db->prepare('UPDATE tiles SET sync_source_base_url = ?, sync_source_tile_id = ? WHERE id = ?')
        ->execute([$base, $sourceTileId, $tileId]);
    if (array_key_exists('token', $src)) {
        $token = is_string($src['token']) ? trim($src['token']) : '';
        $db->prepare('UPDATE tiles SET sync_source_token = ? WHERE id = ?')
            ->execute([$token !== '' ? $token : null, $tileId]);
    }
}

function stampSyncSourceIds(PDO $db, array $data): void {
    ensureSpaceSyncColumns($db);
    $tabs = $data['tabs'] ?? null;
    if (!is_array($tabs)) {
        return;
    }
    $tabStmt = $db->prepare('UPDATE tabs SET sync_source_id = ? WHERE id = ?');
    $sectionStmt = $db->prepare('UPDATE sections SET sync_source_id = ? WHERE id = ?');
    $linkStmt = $db->prepare('UPDATE links SET sync_source_id = ? WHERE id = ?');
    foreach ($tabs as $tab) {
        if (!is_array($tab)) {
            continue;
        }
        spaceSyncStampOne($tabStmt, $tab);
        foreach ($tab['sections'] ?? [] as $section) {
            if (!is_array($section)) {
                continue;
            }
            spaceSyncStampOne($sectionStmt, $section);
            foreach ($section['links'] ?? [] as $link) {
                if (is_array($link)) {
                    spaceSyncStampOne($linkStmt, $link);
                }
            }
        }
    }
}

function spaceSyncStampOne(PDOStatement $stmt, array $node): void {
    $id = isset($node['id']) ? trim((string)$node['id']) : '';
    $sourceId = isset($node['syncSourceId']) ? trim((string)$node['syncSourceId']) : '';
    if ($id === '' || $sourceId === '' || strlen($sourceId) > 80) {
        return;
    }
    $stmt->execute([$sourceId, $id]);
}

function spaceSyncNormalizeBaseUrl(string $raw): ?string {
    $raw = trim($raw);
    if ($raw === '' || strlen($raw) > 300) {
        return null;
    }
    if (!preg_match('#^https?://#i', $raw)) {
        return null;
    }
    $parts = parse_url($raw);
    if (!is_array($parts) || empty($parts['host']) || isset($parts['user']) || isset($parts['pass'])) {
        return null;
    }
    $scheme = strtolower((string)$parts['scheme']);
    if ($scheme !== 'http' && $scheme !== 'https') {
        return null;
    }
    $base = $scheme . '://' . $parts['host'];
    if (!empty($parts['port'])) {
        $base .= ':' . (int)$parts['port'];
    }
    $path = isset($parts['path']) ? rtrim((string)$parts['path'], '/') : '';
    if (str_ends_with(strtolower($path), '/api')) {
        $path = substr($path, 0, -4);
        $path = rtrim($path, '/');
    }
    return $base . $path;
}

function spaceSyncNormalizeTileId(string $raw): ?string {
    $raw = trim($raw);
    if ($raw === '' || strlen($raw) > 80 || !preg_match('/^[A-Za-z0-9_-]+$/', $raw)) {
        return null;
    }
    return $raw;
}

function spaceSyncAllowsPrivateHosts(): bool {
    $flag = getenv('LINKNEST_SYNC_ALLOW_PRIVATE');
    if ($flag === false || $flag === '') {
        $flag = $_ENV['LINKNEST_SYNC_ALLOW_PRIVATE'] ?? '';
    }
    $flag = strtolower(trim((string)$flag));
    return $flag === '1' || $flag === 'true' || $flag === 'yes';
}

function spaceSyncHostIsBlocked(string $host): bool {
    $host = strtolower(trim($host, "[] \t"));
    if ($host === '' || $host === 'localhost' || str_ends_with($host, '.localhost') || $host === 'metadata.google.internal') {
        return !spaceSyncAllowsPrivateHosts();
    }
    $ips = [];
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        $ips[] = $host;
    } else {
        $resolved = @gethostbynamel($host);
        if (is_array($resolved)) {
            $ips = $resolved;
        }
        $v6 = @dns_get_record($host, DNS_AAAA);
        if (is_array($v6)) {
            foreach ($v6 as $rec) {
                if (!empty($rec['ipv6'])) {
                    $ips[] = $rec['ipv6'];
                }
            }
        }
    }
    if ($ips === []) {
        return true;
    }
    if (spaceSyncAllowsPrivateHosts()) {
        return false;
    }
    foreach ($ips as $ip) {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            return true;
        }
    }
    return false;
}

function spaceSyncAssertUrl(string $url): array {
    $parts = parse_url($url);
    if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
        throw new InvalidArgumentException('Source URL is not a valid http(s) address.');
    }
    $scheme = strtolower((string)$parts['scheme']);
    if ($scheme !== 'http' && $scheme !== 'https') {
        throw new InvalidArgumentException('Source URL must use http or https.');
    }
    if (isset($parts['user']) || isset($parts['pass'])) {
        throw new InvalidArgumentException('Source URL must not include a username or password.');
    }
    if (spaceSyncHostIsBlocked((string)$parts['host'])) {
        throw new InvalidArgumentException('Source host is not allowed. Set LINKNEST_SYNC_ALLOW_PRIVATE=1 for a lab address on this machine.');
    }
    return $parts;
}

function spaceSyncFetch(string $url, string $token): array {
    spaceSyncAssertUrl($url);
    if (!function_exists('curl_init')) {
        throw new RuntimeException('PHP cURL is required to sync from another instance.');
    }
    $headers = ['Accept: application/json'];
    if ($token !== '') {
        $headers[] = 'Authorization: Bearer ' . $token;
    }
    $ch = curl_init($url);
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_USERAGENT => 'LinkNest-SpaceSync',
    ];
    if (defined('CURLPROTO_HTTP') && defined('CURLPROTO_HTTPS')) {
        $opts[CURLOPT_PROTOCOLS] = CURLPROTO_HTTP | CURLPROTO_HTTPS;
        $opts[CURLOPT_REDIR_PROTOCOLS] = CURLPROTO_HTTP | CURLPROTO_HTTPS;
    }
    curl_setopt_array($ch, $opts);
    $raw = curl_exec($ch);
    if ($raw === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException('Could not reach the source instance' . ($err !== '' ? ': ' . $err : '.'));
    }
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $headerSize = (int)curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    $header = substr($raw, 0, $headerSize);
    $body = substr($raw, $headerSize);
    if ($status >= 300 && $status < 400) {
        if (!preg_match('/^Location:\s*(\S+)/mi', $header, $m)) {
            throw new RuntimeException('Source redirected without a location.');
        }
        $next = spaceSyncResolveRedirect($url, trim($m[1]));
        spaceSyncAssertUrl($next);
        return ['redirect' => $next];
    }
    if (strlen($body) > 8 * 1024 * 1024) {
        throw new RuntimeException('Source response is too large.');
    }
    return ['status' => $status, 'body' => $body];
}

function spaceSyncResolveRedirect(string $from, string $location): string {
    if (preg_match('#^https?://#i', $location)) {
        return $location;
    }
    $parts = parse_url($from);
    $origin = ($parts['scheme'] ?? 'https') . '://' . ($parts['host'] ?? '');
    if (!empty($parts['port'])) {
        $origin .= ':' . (int)$parts['port'];
    }
    if (str_starts_with($location, '/')) {
        return $origin . $location;
    }
    $path = $parts['path'] ?? '/';
    $dir = rtrim(str_replace('\\', '/', dirname($path)), '/');
    return $origin . $dir . '/' . $location;
}

function spaceSyncFetchTile(string $baseUrl, string $sourceTileId, string $token): array {
    $url = rtrim($baseUrl, '/') . '/api/tiles/' . rawurlencode($sourceTileId);
    for ($hop = 0; $hop < 3; $hop++) {
        $result = spaceSyncFetch($url, $token);
        if (isset($result['redirect'])) {
            $url = $result['redirect'];
            continue;
        }
        $status = (int)$result['status'];
        if ($status === 401 || $status === 403) {
            throw new RuntimeException('Source refused the request. Save a read token from that instance if the space is not public.');
        }
        if ($status === 404) {
            throw new RuntimeException('Source space was not found.');
        }
        if ($status < 200 || $status >= 300) {
            throw new RuntimeException('Source returned HTTP ' . $status . '.');
        }
        $decoded = json_decode((string)$result['body'], true);
        if (!is_array($decoded)) {
            throw new RuntimeException('Source did not return JSON.');
        }
        if (isset($decoded['data']) && is_array($decoded['data'])) {
            $decoded = $decoded['data'];
        }
        if (isset($decoded['tile']) && is_array($decoded['tile'])) {
            $decoded = $decoded['tile'];
        }
        if (!isset($decoded['tabs']) && !isset($decoded['title'])) {
            throw new RuntimeException('Source response is not a space.');
        }
        return $decoded;
    }
    throw new RuntimeException('Source redirected too many times.');
}

function spaceSyncColumns(PDO $db, string $table): array {
    static $cache = [];
    if (!isset($cache[$table])) {
        $cache[$table] = array_column($db->query('PRAGMA table_info(' . $table . ')')->fetchAll(PDO::FETCH_ASSOC), 'name');
    }
    return $cache[$table];
}

function spaceSyncWrite(PDO $db, string $table, array $values, ?string $id = null): void {
    $allowed = spaceSyncColumns($db, $table);
    $cols = [];
    $params = [];
    foreach ($values as $col => $val) {
        if (!in_array($col, $allowed, true)) {
            continue;
        }
        $cols[] = $col;
        $params[] = $val;
    }
    if ($cols === []) {
        return;
    }
    if ($id === null) {
        $ph = implode(',', array_fill(0, count($cols), '?'));
        $db->prepare('INSERT INTO ' . $table . ' (' . implode(',', $cols) . ') VALUES (' . $ph . ')')->execute($params);
        return;
    }
    $sets = [];
    $updateParams = [];
    foreach ($cols as $i => $col) {
        if ($col === 'id') {
            continue;
        }
        $sets[] = $col . ' = ?';
        $updateParams[] = $params[$i];
    }
    if ($sets === []) {
        return;
    }
    $updateParams[] = $id;
    $db->prepare('UPDATE ' . $table . ' SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($updateParams);
}

function spaceSyncAbsUrl(string $base, $value): ?string {
    if (!is_string($value) || trim($value) === '') {
        return is_string($value) ? $value : null;
    }
    $value = trim($value);
    if (preg_match('#^https?://#i', $value) || str_starts_with($value, 'data:')) {
        return $value;
    }
    if (str_starts_with($value, '/')) {
        return rtrim($base, '/') . $value;
    }
    return $value;
}

function spaceSyncBoolInt($value): int {
    return !empty($value) ? 1 : 0;
}

function spaceSyncJsonOrNull($value): ?string {
    if (!is_array($value) || $value === []) {
        return null;
    }
    return json_encode(array_values($value), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function spaceSyncApplyTileContent(PDO $db, string $tileId, array $source, string $baseUrl): int {
    $row = $db->prepare('SELECT * FROM tiles WHERE id = ?');
    $row->execute([$tileId]);
    $current = $row->fetch(PDO::FETCH_ASSOC);
    if (!$current) {
        throw new RuntimeException('Space not found.');
    }
    $values = [
        'title' => (string)($source['title'] ?? $current['title']),
        'description' => (string)($source['description'] ?? ''),
        'html_content' => (string)($source['htmlContent'] ?? ''),
        'emoji' => (string)($source['emoji'] ?? '📁'),
        'theme_color' => (string)($source['themeColor'] ?? 'blue'),
        'search_tags' => spaceSyncJsonOrNull($source['searchTags'] ?? null),
        'header_image' => spaceSyncAbsUrl($baseUrl, $source['headerImage'] ?? null),
        'header_image_align' => $source['headerImageAlign'] ?? null,
        'header_image_opacity' => isset($source['headerImageOpacity']) ? (int)$source['headerImageOpacity'] : null,
        'header_image_offset_x' => isset($source['headerImageOffsetX']) ? (int)$source['headerImageOffsetX'] : null,
        'header_image_offset_y' => isset($source['headerImageOffsetY']) ? (int)$source['headerImageOffsetY'] : null,
        'header_image_zoom' => isset($source['headerImageZoom']) ? (int)$source['headerImageZoom'] : null,
        'header_image_fit' => $source['headerImageFit'] ?? null,
        'emoji_image' => spaceSyncAbsUrl($baseUrl, $source['emojiImage'] ?? null),
        'emoji_image_opacity' => isset($source['emojiImageOpacity']) ? (int)$source['emojiImageOpacity'] : null,
        'emoji_image_offset_x' => isset($source['emojiImageOffsetX']) ? (int)$source['emojiImageOffsetX'] : null,
        'emoji_image_offset_y' => isset($source['emojiImageOffsetY']) ? (int)$source['emojiImageOffsetY'] : null,
        'emoji_image_zoom' => isset($source['emojiImageZoom']) ? (int)$source['emojiImageZoom'] : null,
        'show_emoji' => array_key_exists('showEmoji', $source) ? spaceSyncBoolInt($source['showEmoji']) : 1,
        'show_title' => array_key_exists('showTitle', $source) ? spaceSyncBoolInt($source['showTitle']) : 1,
        'show_description' => array_key_exists('showDescription', $source) ? spaceSyncBoolInt($source['showDescription']) : 1,
        'page_animation' => $source['pageAnimation'] ?? null,
        'links_animation' => $source['linksAnimation'] ?? null,
        'is_hyperlink' => spaceSyncBoolInt($source['isHyperlink'] ?? false),
        'hyperlink_url' => $source['hyperlinkUrl'] ?? null,
        'open_in_new_tab' => spaceSyncBoolInt($source['openInNewTab'] ?? true),
        'is_video' => spaceSyncBoolInt($source['isVideo'] ?? false),
        'video_url' => $source['videoUrl'] ?? null,
        'video_source' => $source['videoSource'] ?? null,
        'browser' => $source['browser'] ?? null,
        'tile_background_color' => $source['tileBackgroundColor'] ?? null,
        'tile_gradient_enabled' => array_key_exists('tileGradientEnabled', $source) ? spaceSyncBoolInt($source['tileGradientEnabled']) : null,
        'tile_gradient_colors' => spaceSyncJsonOrNull($source['tileGradientColors'] ?? null),
        'tile_gradient_color_positions' => spaceSyncJsonOrNull($source['tileGradientColorPositions'] ?? null),
        'tile_gradient_direction' => $source['tileGradientDirection'] ?? null,
        'tile_gradient_type' => $source['tileGradientType'] ?? null,
        'tile_border_radius' => isset($source['tileBorderRadius']) ? (int)$source['tileBorderRadius'] : null,
        'tile_text_color' => $source['tileTextColor'] ?? null,
    ];
    $changed = 0;
    foreach ($values as $col => $val) {
        if (!array_key_exists($col, $current)) {
            continue;
        }
        $before = $current[$col];
        if ((string)($before ?? '') !== (string)($val ?? '')) {
            $changed = 1;
            break;
        }
    }
    spaceSyncWrite($db, 'tiles', $values, $tileId);
    return $changed;
}

function spaceSyncAcl(array $node): array {
    $users = isset($node['allowedUsers']) && is_array($node['allowedUsers']) ? json_encode(array_values($node['allowedUsers'])) : null;
    $groups = isset($node['allowedGroups']) && is_array($node['allowedGroups']) ? json_encode(array_values($node['allowedGroups'])) : null;
    return [
        'visibility' => is_string($node['visibility'] ?? null) ? $node['visibility'] : 'public',
        'allowed_users' => $users,
        'allowed_groups' => $groups,
        'published' => array_key_exists('published', $node) ? spaceSyncBoolInt($node['published']) : 1,
    ];
}

function spaceSyncTabValues(array $tab, bool $withAcl): array {
    $values = [
        'title' => (string)($tab['title'] ?? 'Tab'),
        'emoji' => $tab['emoji'] ?? null,
        'position' => isset($tab['position']) ? (int)$tab['position'] : 0,
        'text_color' => $tab['textColor'] ?? null,
        'background_color' => $tab['backgroundColor'] ?? null,
        'background_style' => encodeBackgroundStyleJson($tab),
    ];
    if ($withAcl) {
        $values = array_merge($values, spaceSyncAcl($tab));
    }
    return $values;
}

function spaceSyncSectionValues(array $section, bool $withAcl): array {
    $values = [
        'title' => (string)($section['title'] ?? ''),
        'emoji' => $section['emoji'] ?? null,
        'position' => isset($section['position']) ? (int)$section['position'] : 0,
        'text_color' => $section['textColor'] ?? null,
        'background_color' => $section['backgroundColor'] ?? null,
        'background_style' => encodeBackgroundStyleJson($section),
        'force_stacked_view' => !empty($section['forceStackedView']) ? 1 : 0,
        'ignore_side_by_side' => !empty($section['ignoreSideBySide']) ? 1 : 0,
        'show_read_aloud' => sectionShowReadAloudFlag($section) ? 1 : 0,
    ];
    if ($withAcl) {
        $values = array_merge($values, spaceSyncAcl($section));
    }
    return $values;
}

function spaceSyncLinkValues(array $link, string $baseUrl, bool $withAcl): array {
    $infoTopics = linkContentTopicsFromInput($link, 'info');
    $notesTopics = linkContentTopicsFromInput($link, 'notes');
    $maintTopics = linkContentTopicsFromInput($link, 'maintenance');
    $infoTopicsJson = empty($infoTopics) ? null : linkInfoTopicsCanonicalJson($infoTopics);
    $notesTopicsJson = empty($notesTopics) ? null : linkInfoTopicsCanonicalJson($notesTopics);
    $maintTopicsJson = empty($maintTopics) ? null : linkInfoTopicsCanonicalJson($maintTopics);
    $infoMirror = linkInfoTopicsToRichTextHtml($infoTopics, 'Information');
    $notesMirror = linkInfoTopicsToRichTextHtml($notesTopics, 'Notes');
    $maintMirror = linkInfoTopicsToRichTextHtml($maintTopics, 'Maintenance');
    $values = [
        'label' => (string)($link['label'] ?? ''),
        'url' => spaceSyncAbsUrl($baseUrl, $link['url'] ?? '') ?? '',
        'icon' => $link['icon'] ?? null,
        'notes' => $notesMirror ?? ($link['notes'] ?? null),
        'tooltip' => $link['tooltip'] ?? null,
        'text_color' => $link['textColor'] ?? null,
        'position' => isset($link['position']) ? (int)$link['position'] : 0,
        'browser' => $link['browser'] ?? null,
        'rich_text_content' => $infoMirror ?? ($link['richTextContent'] ?? null),
        'info_topics' => $infoTopicsJson,
        'notes_topics' => $notesTopicsJson,
        'maintenance_topics' => $maintTopicsJson,
        'animation' => $link['animation'] ?? null,
        'notes_enabled' => array_key_exists('notesEnabled', $link) ? spaceSyncBoolInt($link['notesEnabled']) : null,
        'rich_text_enabled' => array_key_exists('richTextEnabled', $link) ? spaceSyncBoolInt($link['richTextEnabled']) : null,
        'info_show_open_link' => array_key_exists('infoShowOpenLink', $link) ? spaceSyncBoolInt($link['infoShowOpenLink']) : null,
        'notes_video_url' => spaceSyncAbsUrl($baseUrl, $link['notesVideoUrl'] ?? null),
        'info_video_url' => spaceSyncAbsUrl($baseUrl, $link['infoVideoUrl'] ?? null),
        'maintenance_enabled' => array_key_exists('maintenanceEnabled', $link) ? spaceSyncBoolInt($link['maintenanceEnabled']) : null,
        'maintenance_message' => $maintMirror ?? ($link['maintenanceMessage'] ?? null),
        'maintenance_video_url' => spaceSyncAbsUrl($baseUrl, $link['maintenanceVideoUrl'] ?? null),
        'tooltip_style' => $link['tooltipStyle'] ?? null,
        'open_target' => $link['openTarget'] ?? null,
    ];
    if ($withAcl) {
        $values = array_merge($values, spaceSyncAcl($link));
    }
    return $values;
}

function spaceSyncIndexBySource(PDO $db, string $sql, array $params): array {
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $bySource = [];
    $localOnly = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $sourceId = trim((string)($row['sync_source_id'] ?? ''));
        if ($sourceId === '') {
            $localOnly[] = $row;
        } else {
            $bySource[$sourceId] = $row;
        }
    }
    return [$bySource, $localOnly];
}

function spaceSyncSectionHasLocalLinks(PDO $db, string $sectionId): bool {
    $stmt = $db->prepare("SELECT 1 FROM links WHERE section_id = ? AND (sync_source_id IS NULL OR sync_source_id = '') LIMIT 1");
    $stmt->execute([$sectionId]);
    return (bool)$stmt->fetchColumn();
}

function spaceSyncTabHasLocalChildren(PDO $db, string $tabId): bool {
    $stmt = $db->prepare("SELECT id, sync_source_id FROM sections WHERE tab_id = ?");
    $stmt->execute([$tabId]);
    while ($section = $stmt->fetch(PDO::FETCH_ASSOC)) {
        if (trim((string)($section['sync_source_id'] ?? '')) === '') {
            return true;
        }
        if (spaceSyncSectionHasLocalLinks($db, (string)$section['id'])) {
            return true;
        }
    }
    return false;
}

function spaceSyncMergeLinks(PDO $db, string $sectionId, array $links, string $baseUrl, array &$counts): void {
    [$bySource] = spaceSyncIndexBySource($db, 'SELECT * FROM links WHERE section_id = ?', [$sectionId]);
    $seen = [];
    foreach ($links as $link) {
        if (!is_array($link)) {
            continue;
        }
        $sourceId = trim((string)($link['id'] ?? ''));
        if ($sourceId === '') {
            continue;
        }
        $seen[$sourceId] = true;
        if (isset($bySource[$sourceId])) {
            spaceSyncWrite($db, 'links', spaceSyncLinkValues($link, $baseUrl, false), (string)$bySource[$sourceId]['id']);
            $counts['updated']++;
            continue;
        }
        $newId = generateUuid();
        spaceSyncWrite($db, 'links', array_merge(
            spaceSyncLinkValues($link, $baseUrl, true),
            ['id' => $newId, 'section_id' => $sectionId, 'sync_source_id' => $sourceId]
        ));
        $counts['added']++;
    }
    foreach ($bySource as $sourceId => $row) {
        if (isset($seen[$sourceId])) {
            continue;
        }
        $db->prepare('DELETE FROM links WHERE id = ?')->execute([$row['id']]);
        $counts['removed']++;
    }
}

function spaceSyncMergeSections(PDO $db, string $tileId, string $tabId, array $sections, string $baseUrl, array &$counts): void {
    [$bySource] = spaceSyncIndexBySource($db, 'SELECT * FROM sections WHERE tab_id = ?', [$tabId]);
    $seen = [];
    foreach ($sections as $section) {
        if (!is_array($section)) {
            continue;
        }
        $sourceId = trim((string)($section['id'] ?? ''));
        if ($sourceId === '') {
            continue;
        }
        $seen[$sourceId] = true;
        if (isset($bySource[$sourceId])) {
            $localId = (string)$bySource[$sourceId]['id'];
            spaceSyncWrite($db, 'sections', spaceSyncSectionValues($section, false), $localId);
            $counts['updated']++;
        } else {
            $localId = generateUuid();
            spaceSyncWrite($db, 'sections', array_merge(
                spaceSyncSectionValues($section, true),
                ['id' => $localId, 'tile_id' => $tileId, 'tab_id' => $tabId, 'sync_source_id' => $sourceId]
            ));
            $counts['added']++;
        }
        spaceSyncMergeLinks($db, $localId, is_array($section['links'] ?? null) ? $section['links'] : [], $baseUrl, $counts);
    }
    foreach ($bySource as $sourceId => $row) {
        if (isset($seen[$sourceId])) {
            continue;
        }
        $localId = (string)$row['id'];
        if (spaceSyncSectionHasLocalLinks($db, $localId)) {
            $db->prepare("DELETE FROM links WHERE section_id = ? AND sync_source_id IS NOT NULL AND sync_source_id != ''")->execute([$localId]);
            $counts['removed']++;
            continue;
        }
        $db->prepare('DELETE FROM links WHERE section_id = ?')->execute([$localId]);
        $db->prepare('DELETE FROM rich_text_content WHERE section_id = ?')->execute([$localId]);
        $db->prepare('DELETE FROM sections WHERE id = ?')->execute([$localId]);
        $counts['removed']++;
    }
}

function spaceSyncMergeFromSource(PDO $db, string $tileId, array $source, string $baseUrl): array {
    $counts = ['added' => 0, 'updated' => 0, 'removed' => 0];
    $counts['updated'] += spaceSyncApplyTileContent($db, $tileId, $source, $baseUrl);
    $tabs = is_array($source['tabs'] ?? null) ? $source['tabs'] : [];
    [$bySource] = spaceSyncIndexBySource($db, 'SELECT * FROM tabs WHERE tile_id = ?', [$tileId]);
    $seen = [];
    foreach ($tabs as $tab) {
        if (!is_array($tab)) {
            continue;
        }
        $sourceId = trim((string)($tab['id'] ?? ''));
        if ($sourceId === '') {
            continue;
        }
        $seen[$sourceId] = true;
        if (isset($bySource[$sourceId])) {
            $localId = (string)$bySource[$sourceId]['id'];
            spaceSyncWrite($db, 'tabs', spaceSyncTabValues($tab, false), $localId);
            $counts['updated']++;
        } else {
            $localId = generateUuid();
            spaceSyncWrite($db, 'tabs', array_merge(
                spaceSyncTabValues($tab, true),
                ['id' => $localId, 'tile_id' => $tileId, 'sync_source_id' => $sourceId]
            ));
            $counts['added']++;
        }
        spaceSyncMergeSections(
            $db,
            $tileId,
            $localId,
            is_array($tab['sections'] ?? null) ? $tab['sections'] : [],
            $baseUrl,
            $counts
        );
    }
    foreach ($bySource as $sourceId => $row) {
        if (isset($seen[$sourceId])) {
            continue;
        }
        $localId = (string)$row['id'];
        if (spaceSyncTabHasLocalChildren($db, $localId)) {
            $sectionStmt = $db->prepare("SELECT id FROM sections WHERE tab_id = ? AND sync_source_id IS NOT NULL AND sync_source_id != ''");
            $sectionStmt->execute([$localId]);
            while ($section = $sectionStmt->fetch(PDO::FETCH_ASSOC)) {
                $sectionId = (string)$section['id'];
                if (spaceSyncSectionHasLocalLinks($db, $sectionId)) {
                    $db->prepare("DELETE FROM links WHERE section_id = ? AND sync_source_id IS NOT NULL AND sync_source_id != ''")->execute([$sectionId]);
                } else {
                    $db->prepare('DELETE FROM links WHERE section_id = ?')->execute([$sectionId]);
                    $db->prepare('DELETE FROM rich_text_content WHERE section_id = ?')->execute([$sectionId]);
                    $db->prepare('DELETE FROM sections WHERE id = ?')->execute([$sectionId]);
                }
            }
            $counts['removed']++;
            continue;
        }
        $db->prepare('DELETE FROM links WHERE section_id IN (SELECT id FROM sections WHERE tab_id = ?)')->execute([$localId]);
        $db->prepare('DELETE FROM rich_text_content WHERE section_id IN (SELECT id FROM sections WHERE tab_id = ?)')->execute([$localId]);
        $db->prepare('DELETE FROM sections WHERE tab_id = ?')->execute([$localId]);
        $db->prepare('DELETE FROM tabs WHERE id = ?')->execute([$localId]);
        $counts['removed']++;
    }
    $db->prepare('UPDATE tiles SET sync_last_at = ? WHERE id = ?')->execute([time(), $tileId]);
    return $counts;
}

function handleSaveSpaceSyncSource(string $tileId): void {
    $user = requireAuth();
    $db = getDB();
    ensureSpaceSyncColumns($db);
    if (!canUserEditTile($user['id'], $tileId, $db)) {
        sendJSON(['error' => 'You do not have permission to edit this space'], 403);
    }
    $data = getJSONInput();
    if (!is_array($data)) {
        sendJSON(['error' => 'Invalid source'], 400);
    }
    $baseRaw = trim((string)($data['baseUrl'] ?? ''));
    $tileRaw = trim((string)($data['tileId'] ?? ''));
    if ($baseRaw === '' && $tileRaw === '') {
        $db->prepare('UPDATE tiles SET sync_source_base_url = NULL, sync_source_tile_id = NULL, sync_source_token = NULL, sync_last_at = NULL WHERE id = ?')
            ->execute([$tileId]);
        sendJSON(['syncSource' => null]);
    }
    $base = spaceSyncNormalizeBaseUrl($baseRaw);
    $sourceTileId = spaceSyncNormalizeTileId($tileRaw);
    if ($base === null || $sourceTileId === null) {
        sendJSON(['error' => 'Enter an http(s) source address and the source space id.'], 400);
    }
    try {
        spaceSyncAssertUrl($base . '/api/tiles/' . rawurlencode($sourceTileId));
    } catch (InvalidArgumentException $e) {
        sendJSON(['error' => $e->getMessage()], 400);
    }
    $db->prepare('UPDATE tiles SET sync_source_base_url = ?, sync_source_tile_id = ? WHERE id = ?')
        ->execute([$base, $sourceTileId, $tileId]);
    if (array_key_exists('token', $data)) {
        $token = is_string($data['token']) ? trim($data['token']) : '';
        if (strlen($token) > 500) {
            sendJSON(['error' => 'Token is too long.'], 400);
        }
        $db->prepare('UPDATE tiles SET sync_source_token = ? WHERE id = ?')
            ->execute([$token !== '' ? $token : null, $tileId]);
    }
    $row = $db->prepare('SELECT sync_source_base_url, sync_source_tile_id, sync_source_token, sync_last_at FROM tiles WHERE id = ?');
    $row->execute([$tileId]);
    sendJSON(['syncSource' => spaceSyncSourceForApi($row->fetch(PDO::FETCH_ASSOC) ?: [])]);
}

function handleSyncSpaceFromSource(string $tileId): void {
    $user = requireAuth();
    $db = getDB();
    ensureSpaceSyncColumns($db);
    if (!canUserEditTile($user['id'], $tileId, $db)) {
        sendJSON(['error' => 'You do not have permission to edit this space'], 403);
    }
    $stmt = $db->prepare('SELECT sync_source_base_url, sync_source_tile_id, sync_source_token FROM tiles WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$tileId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        sendJSON(['error' => 'Space not found'], 404);
    }
    $base = trim((string)($row['sync_source_base_url'] ?? ''));
    $sourceTileId = trim((string)($row['sync_source_tile_id'] ?? ''));
    if ($base === '' || $sourceTileId === '') {
        sendJSON(['error' => 'This space is not linked to a source.'], 400);
    }
    try {
        $source = spaceSyncFetchTile($base, $sourceTileId, trim((string)($row['sync_source_token'] ?? '')));
        if (!$db->inTransaction()) {
            $db->beginTransaction();
        }
        $summary = spaceSyncMergeFromSource($db, $tileId, $source, $base);
        $db->commit();
    } catch (InvalidArgumentException $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        sendJSON(['error' => $e->getMessage()], 400);
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        sendJSON(['error' => $e->getMessage()], 502);
    }
    sendJSON(['summary' => $summary, 'tileId' => $tileId]);
}
