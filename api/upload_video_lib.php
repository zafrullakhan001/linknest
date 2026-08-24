<?php
/**
 * Helpers for LinkNest uploaded videos (maintvid_* under uploads/).
 * Used by space video tiles (file/webcam) and link maintenance clips.
 */

/**
 * Extract a safe maintvid_* basename from a stored video URL, or null if not one.
 */
function maintvidFilenameFromUrl(?string $url): ?string {
    if ($url === null) {
        return null;
    }
    $url = trim($url);
    if ($url === '') {
        return null;
    }
    if (!preg_match('#(?:^|/)uploads/(maintvid_[A-Za-z0-9._-]+)$#', $url, $m)) {
        return null;
    }
    $name = $m[1];
    if ($name === '' || str_contains($name, '..') || str_contains($name, '/') || str_contains($name, '\\')) {
        return null;
    }
    return $name;
}

/**
 * Unlink a local uploads/maintvid_* file referenced by URL. Returns true if removed.
 */
function unlinkMaintvidByUrl(?string $url): bool {
    $name = maintvidFilenameFromUrl($url);
    if ($name === null) {
        return false;
    }
    $uploadDir = realpath(__DIR__ . '/../uploads');
    if ($uploadDir === false || !is_dir($uploadDir)) {
        return false;
    }
    $path = $uploadDir . DIRECTORY_SEPARATOR . $name;
    $real = realpath($path);
    if ($real === false || !is_file($real)) {
        return false;
    }
    // Stay inside uploads/
    $prefix = $uploadDir . DIRECTORY_SEPARATOR;
    if (!str_starts_with($real, $prefix) && $real !== $uploadDir) {
        return false;
    }
    return @unlink($real);
}

/**
 * How many other tiles/links still reference this video URL (excluding one tile).
 */
function countMaintvidReferencesExcludingTile(PDO $db, string $url, string $excludeTileId): int {
    $count = 0;
    $tileStmt = $db->prepare('SELECT COUNT(*) FROM tiles WHERE video_url = ? AND id != ?');
    $tileStmt->execute([$url, $excludeTileId]);
    $count += (int)$tileStmt->fetchColumn();

    $linkStmt = $db->prepare(
        'SELECT COUNT(*) FROM links l
         INNER JOIN sections s ON l.section_id = s.id
         WHERE l.maintenance_video_url = ? AND s.tile_id != ?'
    );
    $linkStmt->execute([$url, $excludeTileId]);
    $count += (int)$linkStmt->fetchColumn();

    return $count;
}

/**
 * Collect maintvid URLs owned by a tile: space video (file) + link maintenance videos.
 *
 * @return list<string>
 */
function collectTileMaintvidUrls(PDO $db, string $tileId): array {
    $urls = [];

    $tileStmt = $db->prepare('SELECT video_url, video_source FROM tiles WHERE id = ?');
    $tileStmt->execute([$tileId]);
    $row = $tileStmt->fetch(PDO::FETCH_ASSOC);
    if (is_array($row)) {
        $vu = isset($row['video_url']) ? trim((string)$row['video_url']) : '';
        if ($vu !== '') {
            $source = $row['video_source'] ?? null;
            if ($source === 'file' || maintvidFilenameFromUrl($vu) !== null) {
                $urls[] = $vu;
            }
        }
    }

    $linkStmt = $db->prepare(
        'SELECT DISTINCT l.maintenance_video_url AS url
         FROM links l
         INNER JOIN sections s ON l.section_id = s.id
         WHERE s.tile_id = ?
           AND l.maintenance_video_url IS NOT NULL
           AND TRIM(l.maintenance_video_url) != \'\''
    );
    $linkStmt->execute([$tileId]);
    while ($linkRow = $linkStmt->fetch(PDO::FETCH_ASSOC)) {
        $u = isset($linkRow['url']) ? trim((string)$linkRow['url']) : '';
        if ($u !== '' && maintvidFilenameFromUrl($u) !== null) {
            $urls[] = $u;
        }
    }

    return array_values(array_unique($urls));
}

/**
 * Unlink orphaned maintvid files for a tile. Optionally clear DB URL refs after unlink.
 */
function purgeTileMaintvidUploads(PDO $db, string $tileId, bool $clearDbRefs = true): void {
    $urls = collectTileMaintvidUrls($db, $tileId);
    if ($urls === []) {
        return;
    }

    $deleted = [];
    foreach ($urls as $url) {
        if (countMaintvidReferencesExcludingTile($db, $url, $tileId) > 0) {
            continue;
        }
        if (unlinkMaintvidByUrl($url)) {
            $deleted[$url] = true;
        } elseif (maintvidFilenameFromUrl($url) !== null) {
            // File already gone — still clear DB refs
            $deleted[$url] = true;
        }
    }

    if (!$clearDbRefs || $deleted === []) {
        return;
    }

    $tileClear = $db->prepare(
        'UPDATE tiles SET video_url = NULL, video_source = NULL
         WHERE id = ? AND video_url = ?'
    );
    $linkClear = $db->prepare(
        'UPDATE links SET maintenance_video_url = NULL
         WHERE maintenance_video_url = ?
           AND section_id IN (SELECT id FROM sections WHERE tile_id = ?)'
    );

    foreach (array_keys($deleted) as $url) {
        $tileClear->execute([$tileId, $url]);
        $linkClear->execute([$url, $tileId]);
    }
}

/**
 * After a tile update, remove the previous space video file if it was replaced/cleared.
 */
function purgeReplacedTileVideoUpload(PDO $db, string $tileId, ?string $oldVideoUrl, ?string $newVideoUrl): void {
    $old = $oldVideoUrl !== null ? trim($oldVideoUrl) : '';
    $new = $newVideoUrl !== null ? trim($newVideoUrl) : '';
    if ($old === '' || $old === $new) {
        return;
    }
    if (maintvidFilenameFromUrl($old) === null) {
        return;
    }
    if (countMaintvidReferencesExcludingTile($db, $old, $tileId) > 0) {
        return;
    }
    // Tile row already points at $new (or null); safe to unlink old if unused elsewhere
    $stillOnTile = $db->prepare('SELECT COUNT(*) FROM tiles WHERE id = ? AND video_url = ?');
    $stillOnTile->execute([$tileId, $old]);
    if ((int)$stillOnTile->fetchColumn() > 0) {
        return;
    }
    unlinkMaintvidByUrl($old);
}
