<?php
/**
 * Media library helpers — shared site media catalog (images, PDF, audio, video).
 * Files live flat under uploads/ as media_{uuid}.ext; folders are virtual (DB tree).
 */

require_once __DIR__ . '/image_helpers.php';

/**
 * Debug-mode NDJSON logger (session cee2c4). Do not log secrets.
 */
function mediaAgentDebugLog(string $location, string $message, array $data, string $hypothesisId, string $runId = 'uplift-1'): void {
    // #region agent log
    $payload = [
        'sessionId' => 'cee2c4',
        'timestamp' => (int) round(microtime(true) * 1000),
        'location' => $location,
        'message' => $message,
        'data' => $data,
        'hypothesisId' => $hypothesisId,
        'runId' => $runId,
    ];
    @file_put_contents(dirname(__DIR__) . DIRECTORY_SEPARATOR . 'debug-cee2c4.log', json_encode($payload, JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX);
    // #endregion
}

/**
 * Ensure media_* tables exist and seed the root Library folder.
 */
function ensureMediaLibrarySchema($db): void {
    static $ensured = false;
    if ($ensured) {
        return;
    }
    try {
        $db->exec('CREATE TABLE IF NOT EXISTS media_folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_id INTEGER,
            name TEXT NOT NULL COLLATE NOCASE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_by INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (parent_id) REFERENCES media_folders(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_media_folders_parent ON media_folders(parent_id)');

        $db->exec('CREATE TABLE IF NOT EXISTS media_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_id INTEGER,
            uuid TEXT NOT NULL UNIQUE,
            original_name TEXT NOT NULL,
            stored_name TEXT NOT NULL,
            thumb_name TEXT,
            mime TEXT NOT NULL,
            kind TEXT NOT NULL,
            size_bytes INTEGER NOT NULL DEFAULT 0,
            width INTEGER,
            height INTEGER,
            title TEXT,
            alt_text TEXT,
            description TEXT,
            status TEXT NOT NULL DEFAULT \'active\',
            uploaded_by INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            trashed_at INTEGER,
            FOREIGN KEY (folder_id) REFERENCES media_folders(id) ON DELETE SET NULL,
            FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
        )');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_media_files_folder ON media_files(folder_id)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_media_files_status ON media_files(status)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_media_files_kind ON media_files(kind)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_media_files_created ON media_files(created_at DESC)');

        $db->exec('CREATE TABLE IF NOT EXISTS media_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL COLLATE NOCASE UNIQUE
        )');

        $db->exec('CREATE TABLE IF NOT EXISTS media_file_tags (
            file_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (file_id, tag_id),
            FOREIGN KEY (file_id) REFERENCES media_files(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES media_tags(id) ON DELETE CASCADE
        )');

        $count = (int)$db->query('SELECT COUNT(*) FROM media_folders')->fetchColumn();
        if ($count === 0) {
            $now = time();
            $stmt = $db->prepare('INSERT INTO media_folders (parent_id, name, sort_order, created_by, created_at, updated_at) VALUES (NULL, ?, 0, NULL, ?, ?)');
            $stmt->execute(['Library', $now, $now]);
        }

        $ensured = true;
    } catch (PDOException $e) {
        error_log('ensureMediaLibrarySchema warning: ' . $e->getMessage());
    }
}

function mediaUploadsDir(): string {
    $dir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'uploads';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir;
}

function mediaTrashDir(): string {
    $dir = mediaUploadsDir() . DIRECTORY_SEPARATOR . '.media_trash';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir;
}

/** Sidecar backups for undo-after-remove-background (not publicly listed). */
function mediaUndoDir(): string {
    $dir = mediaUploadsDir() . DIRECTORY_SEPARATOR . '.media_undo';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir;
}

/**
 * Snapshot the pre-remove-background file so replace can be undone.
 *
 * @param array<string,mixed> $meta
 */
function mediaSaveRemoveBgUndo(int $fileId, string $srcPath, array $meta): void {
    if ($fileId <= 0 || !is_file($srcPath)) {
        return;
    }
    $dir = mediaUndoDir();
    $bin = $dir . DIRECTORY_SEPARATOR . $fileId . '.bin';
    $json = $dir . DIRECTORY_SEPARATOR . $fileId . '.json';
    if (!@copy($srcPath, $bin)) {
        return;
    }
    $meta['fileId'] = $fileId;
    $meta['savedAt'] = time();
    @file_put_contents($json, json_encode($meta, JSON_UNESCAPED_SLASHES));
}

function mediaClearRemoveBgUndo(int $fileId): void {
    $dir = mediaUndoDir();
    @unlink($dir . DIRECTORY_SEPARATOR . $fileId . '.bin');
    @unlink($dir . DIRECTORY_SEPARATOR . $fileId . '.json');
}

function mediaHasRemoveBgUndo(int $fileId): bool {
    $dir = mediaUndoDir();
    return is_file($dir . DIRECTORY_SEPARATOR . $fileId . '.bin')
        && is_file($dir . DIRECTORY_SEPARATOR . $fileId . '.json');
}

/**
 * Restore the file bytes + DB row from the last remove-background backup.
 *
 * @return array<string,mixed> Mapped media file row
 */
function mediaRestoreRemoveBgUndo(PDO $db, int $fileId): array {
    $dir = mediaUndoDir();
    $bin = $dir . DIRECTORY_SEPARATOR . $fileId . '.bin';
    $jsonPath = $dir . DIRECTORY_SEPARATOR . $fileId . '.json';
    if (!is_file($bin) || !is_file($jsonPath)) {
        throw new RuntimeException('No remove-background undo available for this file');
    }
    $meta = json_decode((string)file_get_contents($jsonPath), true);
    if (!is_array($meta) || empty($meta['storedName'])) {
        throw new RuntimeException('Invalid remove-background undo data');
    }

    $stmt = $db->prepare('SELECT * FROM media_files WHERE id = ?');
    $stmt->execute([$fileId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        throw new RuntimeException('File not found');
    }
    if ((string)$row['status'] === 'trash') {
        throw new RuntimeException('Cannot undo a trashed file');
    }

    $restoreName = basename((string)$meta['storedName']);
    if (!preg_match('/^media_[a-zA-Z0-9._-]+$/', $restoreName)) {
        throw new RuntimeException('Invalid undo filename');
    }

    $dest = mediaUploadsDir() . DIRECTORY_SEPARATOR . $restoreName;
    $currentStored = (string)$row['stored_name'];
    $currentThumb = $row['thumb_name'] !== null ? (string)$row['thumb_name'] : null;

    $tmp = $dest . '.undo.' . getmypid() . '.' . bin2hex(random_bytes(4));
    if (!@copy($bin, $tmp)) {
        throw new RuntimeException('Failed to restore image from undo backup');
    }
    if (is_file($dest) && $dest !== $tmp) {
        @unlink($dest);
    }
    if (!@rename($tmp, $dest)) {
        if (!@copy($tmp, $dest)) {
            @unlink($tmp);
            throw new RuntimeException('Failed to finalize restored image');
        }
        @unlink($tmp);
    }

    if ($currentStored !== $restoreName) {
        mediaSafeUnlinkUnderUploads($currentStored);
    }

    $uuid = (string)$row['uuid'];
    // Prefer uuid from restored name: media_{uuid}.ext
    if (preg_match('/^media_([a-f0-9-]+)\./i', $restoreName, $m)) {
        $uuid = $m[1];
    }
    if ($currentThumb) {
        mediaSafeUnlinkUnderUploads($currentThumb);
    }
    $thumbName = mediaGenerateThumb($dest, $uuid);

    $mime = isset($meta['mime']) ? (string)$meta['mime'] : mediaMimeForFilename($restoreName, (string)$row['mime']);
    $sizeBytes = isset($meta['sizeBytes']) ? (int)$meta['sizeBytes'] : (is_file($dest) ? (int)filesize($dest) : 0);
    $width = array_key_exists('width', $meta) ? ($meta['width'] !== null ? (int)$meta['width'] : null) : null;
    $height = array_key_exists('height', $meta) ? ($meta['height'] !== null ? (int)$meta['height'] : null) : null;
    if (($width === null || $height === null) && is_file($dest)) {
        $info = @getimagesize($dest);
        if ($info) {
            $width = (int)$info[0];
            $height = (int)$info[1];
        }
    }

    $db->prepare(
        'UPDATE media_files SET stored_name = ?, thumb_name = ?, mime = ?, size_bytes = ?, width = ?, height = ?, updated_at = ? WHERE id = ?'
    )->execute([
        $restoreName,
        $thumbName,
        $mime,
        $sizeBytes,
        $width,
        $height,
        time(),
        $fileId,
    ]);

    mediaClearRemoveBgUndo($fileId);

    $fresh = $db->prepare('SELECT * FROM media_files WHERE id = ?');
    $fresh->execute([$fileId]);
    return mediaMapFileRow($db, $fresh->fetch(PDO::FETCH_ASSOC));
}

function mediaBasePath(): string {
    $requestUri = $_SERVER['REQUEST_URI'] ?? '';
    if (($pos = strpos($requestUri, '?')) !== false) {
        $requestUri = substr($requestUri, 0, $pos);
    }
    $apiPos = strpos($requestUri, '/api/');
    if ($apiPos !== false) {
        return substr($requestUri, 0, $apiPos);
    }
    return '';
}

function mediaPublicUrl(string $storedName, ?int $cacheBust = null): string {
    $url = mediaBasePath() . '/uploads/' . $storedName;
    if ($cacheBust !== null && $cacheBust > 0) {
        $url .= '?v=' . $cacheBust;
    }
    return $url;
}

/** Authenticated preview (used for trash — files are not on the public /uploads/ path). */
function mediaAuthPreviewUrl(int $id, string $variant = 'file', ?int $cacheBust = null): string {
    $suffix = $variant === 'thumb' ? 'thumb' : 'file';
    $url = mediaBasePath() . '/api/media/' . $id . '/' . $suffix;
    if ($cacheBust !== null && $cacheBust > 0) {
        $url .= '?v=' . $cacheBust;
    }
    return $url;
}

function mediaSafeStoredName(string $filename): ?string {
    $filename = basename($filename);
    if ($filename === '' || !preg_match('/^media_[a-zA-Z0-9._-]+$/', $filename)) {
        return null;
    }
    return $filename;
}

/**
 * Resolve a stored media filename on disk (public uploads or trash).
 */
function mediaResolveDiskFile(string $storedName, bool $preferTrash): ?string {
    $storedName = mediaSafeStoredName($storedName);
    if ($storedName === null) {
        return null;
    }
    $primary = ($preferTrash ? mediaTrashDir() : mediaUploadsDir()) . DIRECTORY_SEPARATOR . $storedName;
    if (is_file($primary)) {
        return $primary;
    }
    $fallback = ($preferTrash ? mediaUploadsDir() : mediaTrashDir()) . DIRECTORY_SEPARATOR . $storedName;
    return is_file($fallback) ? $fallback : null;
}

function mediaMimeForFilename(string $filename, string $fallback = 'application/octet-stream'): string {
    $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    $map = [
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
        'svg' => 'image/svg+xml',
        'pdf' => 'application/pdf',
        'mp3' => 'audio/mpeg',
        'wav' => 'audio/wav',
        'ogg' => 'audio/ogg',
        'm4a' => 'audio/mp4',
        'mp4' => 'video/mp4',
        'webm' => 'video/webm',
        'ogv' => 'video/ogg',
        'mov' => 'video/quicktime',
    ];
    return $map[$ext] ?? $fallback;
}

/**
 * @return array{ext:string,mime:string,kind:string,max:int}|null
 */
function mediaResolveAllowedType(string $mime, string $extension): ?array {
    $ext = strtolower(preg_replace('/[^a-z0-9]/', '', $extension) ?: '');
    $map = [
        'image/jpeg' => ['ext' => 'jpg', 'kind' => 'image', 'max' => 10 * 1024 * 1024],
        'image/jpg' => ['ext' => 'jpg', 'kind' => 'image', 'max' => 10 * 1024 * 1024],
        'image/png' => ['ext' => 'png', 'kind' => 'image', 'max' => 10 * 1024 * 1024],
        'image/gif' => ['ext' => 'gif', 'kind' => 'image', 'max' => 10 * 1024 * 1024],
        'image/webp' => ['ext' => 'webp', 'kind' => 'image', 'max' => 10 * 1024 * 1024],
        'image/svg+xml' => ['ext' => 'svg', 'kind' => 'image', 'max' => 10 * 1024 * 1024],
        'application/pdf' => ['ext' => 'pdf', 'kind' => 'pdf', 'max' => 20 * 1024 * 1024],
        'audio/mpeg' => ['ext' => 'mp3', 'kind' => 'audio', 'max' => 25 * 1024 * 1024],
        'audio/mp3' => ['ext' => 'mp3', 'kind' => 'audio', 'max' => 25 * 1024 * 1024],
        'audio/wav' => ['ext' => 'wav', 'kind' => 'audio', 'max' => 25 * 1024 * 1024],
        'audio/x-wav' => ['ext' => 'wav', 'kind' => 'audio', 'max' => 25 * 1024 * 1024],
        'audio/ogg' => ['ext' => 'ogg', 'kind' => 'audio', 'max' => 25 * 1024 * 1024],
        'audio/mp4' => ['ext' => 'm4a', 'kind' => 'audio', 'max' => 25 * 1024 * 1024],
        'audio/x-m4a' => ['ext' => 'm4a', 'kind' => 'audio', 'max' => 25 * 1024 * 1024],
        'video/mp4' => ['ext' => 'mp4', 'kind' => 'video', 'max' => 50 * 1024 * 1024],
        'video/webm' => ['ext' => 'webm', 'kind' => 'video', 'max' => 50 * 1024 * 1024],
        'video/ogg' => ['ext' => 'ogv', 'kind' => 'video', 'max' => 50 * 1024 * 1024],
        'video/quicktime' => ['ext' => 'mov', 'kind' => 'video', 'max' => 50 * 1024 * 1024],
    ];

    if (isset($map[$mime])) {
        $row = $map[$mime];
        // Prefer client extension when it matches the family
        if ($ext !== '' && $ext !== $row['ext']) {
            $allowedExt = [
                'jpg' => ['jpg', 'jpeg'],
                'png' => ['png'],
                'gif' => ['gif'],
                'webp' => ['webp'],
                'svg' => ['svg'],
                'pdf' => ['pdf'],
                'mp3' => ['mp3'],
                'wav' => ['wav'],
                'ogg' => ['ogg'],
                'm4a' => ['m4a'],
                'mp4' => ['mp4'],
                'webm' => ['webm'],
                'ogv' => ['ogv', 'ogg'],
                'mov' => ['mov'],
            ];
            if (isset($allowedExt[$row['ext']]) && in_array($ext, $allowedExt[$row['ext']], true)) {
                $row['ext'] = $ext === 'jpeg' ? 'jpg' : $ext;
            }
        }
        return ['ext' => $row['ext'], 'mime' => $mime, 'kind' => $row['kind'], 'max' => $row['max']];
    }

    // Extension fallback for odd MIME labels
    $extMap = [
        'jpg' => ['image/jpeg', 'image', 10 * 1024 * 1024],
        'jpeg' => ['image/jpeg', 'image', 10 * 1024 * 1024],
        'png' => ['image/png', 'image', 10 * 1024 * 1024],
        'gif' => ['image/gif', 'image', 10 * 1024 * 1024],
        'webp' => ['image/webp', 'image', 10 * 1024 * 1024],
        'svg' => ['image/svg+xml', 'image', 10 * 1024 * 1024],
        'pdf' => ['application/pdf', 'pdf', 20 * 1024 * 1024],
        'mp3' => ['audio/mpeg', 'audio', 25 * 1024 * 1024],
        'wav' => ['audio/wav', 'audio', 25 * 1024 * 1024],
        'ogg' => ['audio/ogg', 'audio', 25 * 1024 * 1024],
        'm4a' => ['audio/mp4', 'audio', 25 * 1024 * 1024],
        'mp4' => ['video/mp4', 'video', 50 * 1024 * 1024],
        'webm' => ['video/webm', 'video', 50 * 1024 * 1024],
        'ogv' => ['video/ogg', 'video', 50 * 1024 * 1024],
        'mov' => ['video/quicktime', 'video', 50 * 1024 * 1024],
    ];
    if ($ext !== '' && isset($extMap[$ext])) {
        return ['ext' => $ext === 'jpeg' ? 'jpg' : $ext, 'mime' => $extMap[$ext][0], 'kind' => $extMap[$ext][1], 'max' => $extMap[$ext][2]];
    }
    return null;
}

function mediaGenerateUuid(): string {
    return bin2hex(random_bytes(16));
}

/**
 * @return list<string>
 */
function mediaTagsForFile(PDO $db, int $fileId): array {
    $stmt = $db->prepare(
        'SELECT t.name FROM media_tags t
         INNER JOIN media_file_tags ft ON ft.tag_id = t.id
         WHERE ft.file_id = ?
         ORDER BY t.name COLLATE NOCASE'
    );
    $stmt->execute([$fileId]);
    return array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

/**
 * @param list<int> $fileIds
 * @return array<int, list<string>>
 */
function mediaTagsForFileIds(PDO $db, array $fileIds): array {
    $ids = array_values(array_unique(array_filter(array_map('intval', $fileIds), static fn($id) => $id > 0)));
    if ($ids === []) {
        return [];
    }
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $db->prepare(
        "SELECT ft.file_id, t.name FROM media_tags t
         INNER JOIN media_file_tags ft ON ft.tag_id = t.id
         WHERE ft.file_id IN ($placeholders)
         ORDER BY t.name COLLATE NOCASE"
    );
    $stmt->execute($ids);
    $map = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $fid = (int)$row['file_id'];
        if (!isset($map[$fid])) {
            $map[$fid] = [];
        }
        $map[$fid][] = (string)$row['name'];
    }
    return $map;
}

/**
 * @param list<string>|null $tags
 */
function mediaSetFileTags(PDO $db, int $fileId, ?array $tags): void {
    if ($tags === null) {
        return;
    }
    $db->prepare('DELETE FROM media_file_tags WHERE file_id = ?')->execute([$fileId]);
    $seen = [];
    foreach ($tags as $raw) {
        $name = trim((string)$raw);
        if ($name === '' || isset($seen[strtolower($name)])) {
            continue;
        }
        $seen[strtolower($name)] = true;
        $find = $db->prepare('SELECT id FROM media_tags WHERE name = ? COLLATE NOCASE');
        $find->execute([$name]);
        $tagId = $find->fetchColumn();
        if (!$tagId) {
            $ins = $db->prepare('INSERT INTO media_tags (name) VALUES (?)');
            $ins->execute([$name]);
            $tagId = (int)$db->lastInsertId();
        } else {
            $tagId = (int)$tagId;
        }
        $db->prepare('INSERT OR IGNORE INTO media_file_tags (file_id, tag_id) VALUES (?, ?)')->execute([$fileId, $tagId]);
    }
}

/**
 * @param array<string,mixed> $row
 * @return array<string,mixed>
 */
function mediaMapFileRow(PDO $db, array $row, bool $includeTags = true, ?array $preloadedTags = null): array {
    $stored = (string)$row['stored_name'];
    $status = (string)$row['status'];
    $url = null;
    $thumbUrl = null;
    $bust = isset($row['updated_at']) ? (int)$row['updated_at'] : null;
    $id = (int)$row['id'];
    if ($stored !== '') {
        if ($status === 'trash') {
            $url = mediaAuthPreviewUrl($id, 'file', $bust);
            if (!empty($row['thumb_name'])) {
                $thumbUrl = mediaAuthPreviewUrl($id, 'thumb', $bust);
            } else {
                $thumbUrl = $url;
            }
        } else {
            $url = mediaPublicUrl($stored, $bust);
            if (!empty($row['thumb_name'])) {
                $thumbUrl = mediaPublicUrl((string)$row['thumb_name'], $bust);
            }
        }
    }

    $out = [
        'id' => (int)$row['id'],
        'folderId' => $row['folder_id'] !== null ? (int)$row['folder_id'] : null,
        'uuid' => (string)$row['uuid'],
        'originalName' => (string)$row['original_name'],
        'storedName' => $stored,
        'thumbName' => $row['thumb_name'] !== null ? (string)$row['thumb_name'] : null,
        'mime' => (string)$row['mime'],
        'kind' => (string)$row['kind'],
        'sizeBytes' => (int)$row['size_bytes'],
        'width' => $row['width'] !== null ? (int)$row['width'] : null,
        'height' => $row['height'] !== null ? (int)$row['height'] : null,
        'title' => $row['title'] !== null ? (string)$row['title'] : null,
        'altText' => $row['alt_text'] !== null ? (string)$row['alt_text'] : null,
        'description' => $row['description'] !== null ? (string)$row['description'] : null,
        'status' => $status,
        'uploadedBy' => $row['uploaded_by'] !== null ? (int)$row['uploaded_by'] : null,
        'createdAt' => (int)$row['created_at'],
        'updatedAt' => (int)$row['updated_at'],
        'trashedAt' => $row['trashed_at'] !== null ? (int)$row['trashed_at'] : null,
        'url' => $url,
        'thumbUrl' => $thumbUrl,
    ];
    if ($includeTags) {
        $out['tags'] = $preloadedTags !== null ? $preloadedTags : mediaTagsForFile($db, (int)$row['id']);
    }
    return $out;
}

/**
 * @param array<string,mixed> $row
 * @return array<string,mixed>
 */
function mediaMapFolderRow(array $row): array {
    return [
        'id' => (int)$row['id'],
        'parentId' => $row['parent_id'] !== null ? (int)$row['parent_id'] : null,
        'name' => (string)$row['name'],
        'sortOrder' => (int)$row['sort_order'],
        'createdBy' => $row['created_by'] !== null ? (int)$row['created_by'] : null,
        'createdAt' => (int)$row['created_at'],
        'updatedAt' => (int)$row['updated_at'],
    ];
}

/**
 * Folder id plus all descendant folder ids (breadth-first).
 *
 * @return list<int>
 */
function mediaCollectFolderSubtreeIds(PDO $db, int $rootId): array {
    $rows = $db->query('SELECT id, parent_id FROM media_folders')->fetchAll(PDO::FETCH_ASSOC);
    $byParent = [];
    foreach ($rows as $row) {
        $pid = $row['parent_id'] !== null ? (int)$row['parent_id'] : null;
        if ($pid === null) {
            continue;
        }
        $byParent[$pid][] = (int)$row['id'];
    }
    $ids = [];
    $seen = [];
    $queue = [$rootId];
    while ($queue) {
        $id = array_shift($queue);
        if (isset($seen[$id])) {
            continue;
        }
        $seen[$id] = true;
        $ids[] = $id;
        foreach ($byParent[$id] ?? [] as $childId) {
            $queue[] = $childId;
        }
    }
    return $ids;
}

/**
 * Trash all non-trash files in the given folders (disk move + status).
 *
 * @param list<int> $folderIds
 * @return int Number of files moved to trash
 */
function mediaTrashFilesInFolders(PDO $db, array $folderIds): int {
    if ($folderIds === []) {
        return 0;
    }
    $placeholders = implode(',', array_fill(0, count($folderIds), '?'));
    $stmt = $db->prepare(
        "SELECT id, stored_name, thumb_name, status FROM media_files
         WHERE folder_id IN ($placeholders) AND status != 'trash'"
    );
    $stmt->execute(array_values($folderIds));
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $now = time();
    $upd = $db->prepare(
        'UPDATE media_files SET status = \'trash\', trashed_at = ?, updated_at = ?, folder_id = NULL WHERE id = ?'
    );
    $count = 0;
    foreach ($rows as $row) {
        mediaMoveToTrash((string)$row['stored_name']);
        if (!empty($row['thumb_name'])) {
            mediaMoveToTrash((string)$row['thumb_name']);
        }
        $upd->execute([$now, $now, (int)$row['id']]);
        $count++;
    }
    // Detach already-trashed files so folders can be removed cleanly
    $detach = $db->prepare(
        "UPDATE media_files SET folder_id = NULL WHERE folder_id IN ($placeholders)"
    );
    $detach->execute(array_values($folderIds));
    return $count;
}

function mediaSafeUnlinkUnderUploads(string $filename): bool {
    $filename = basename($filename);
    if ($filename === '' || !preg_match('/^media_[a-zA-Z0-9._-]+$/', $filename)) {
        return false;
    }
    $dir = realpath(mediaUploadsDir());
    if ($dir === false) {
        return false;
    }
    $path = $dir . DIRECTORY_SEPARATOR . $filename;
    $real = realpath($path);
    if ($real === false || !is_file($real)) {
        return false;
    }
    if (!str_starts_with($real, $dir . DIRECTORY_SEPARATOR) && $real !== $dir) {
        return false;
    }
    return @unlink($real);
}

function mediaMoveToTrash(string $storedName): bool {
    $storedName = basename($storedName);
    if ($storedName === '' || !preg_match('/^media_[a-zA-Z0-9._-]+$/', $storedName)) {
        return false;
    }
    $src = mediaUploadsDir() . DIRECTORY_SEPARATOR . $storedName;
    if (!is_file($src)) {
        return false;
    }
    $dest = mediaTrashDir() . DIRECTORY_SEPARATOR . $storedName;
    return @rename($src, $dest);
}

function mediaRestoreFromTrash(string $storedName): bool {
    $storedName = basename($storedName);
    if ($storedName === '' || !preg_match('/^media_[a-zA-Z0-9._-]+$/', $storedName)) {
        return false;
    }
    $src = mediaTrashDir() . DIRECTORY_SEPARATOR . $storedName;
    if (!is_file($src)) {
        return false;
    }
    $dest = mediaUploadsDir() . DIRECTORY_SEPARATOR . $storedName;
    return @rename($src, $dest);
}

function mediaPurgeTrashFile(string $storedName): bool {
    $storedName = basename($storedName);
    if ($storedName === '' || !preg_match('/^media_[a-zA-Z0-9._-]+$/', $storedName)) {
        return false;
    }
    $path = mediaTrashDir() . DIRECTORY_SEPARATOR . $storedName;
    if (is_file($path)) {
        return @unlink($path);
    }
    // Also try public uploads in case trash move failed earlier
    return mediaSafeUnlinkUnderUploads($storedName);
}

/**
 * Create a ~480px thumbnail (sharp on 2× displays). Returns thumb filename or null.
 */
function mediaGenerateThumb(string $diskPath, string $uuid): ?string {
    if (!extension_loaded('gd') || !is_file($diskPath)) {
        return null;
    }
    $ext = strtolower(pathinfo($diskPath, PATHINFO_EXTENSION));
    if ($ext === 'svg') {
        return null;
    }
    $info = @getimagesize($diskPath);
    $mime = $info['mime'] ?? '';
    $src = loadGdImageFromFile($diskPath, $mime, $ext);
    if ($src === false) {
        return null;
    }
    $src = applyGdExifOrientation($src, $diskPath);
    $resized = resizeGdImageFit($src, 480, 480);
    $thumbName = 'media_' . $uuid . '_thumb.webp';
    $thumbPath = mediaUploadsDir() . DIRECTORY_SEPARATOR . $thumbName;
    $ok = false;
    if (function_exists('imagewebp')) {
        $ok = @imagewebp($resized, $thumbPath, 84);
    }
    if (!$ok) {
        $thumbName = 'media_' . $uuid . '_thumb.jpg';
        $thumbPath = mediaUploadsDir() . DIRECTORY_SEPARATOR . $thumbName;
        $ok = @imagejpeg($resized, $thumbPath, 84);
    }
    imagedestroy($resized);
    return $ok ? $thumbName : null;
}

/**
 * @param array<string,mixed> $file $_FILES entry
 * @return array<string,mixed>
 */
function mediaSaveUploadedFile(PDO $db, array $file, ?int $folderId, int $userId, ?array $tags = null, bool $removeBackground = false, ?string $bgColorHex = null, bool $optimize = false): array {
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $err = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if (in_array($err, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
            throw new RuntimeException('File exceeds PHP upload_max_filesize / post_max_size. Raise limits (videos need at least 50MB).');
        }
        throw new RuntimeException('Upload failed (error code ' . $err . ')');
    }

    $tmp = (string)$file['tmp_name'];
    $originalName = (string)($file['name'] ?? 'file');
    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $tmp) ?: '';
    finfo_close($finfo);

    $allowed = mediaResolveAllowedType($mime, $extension);
    if ($allowed === null) {
        throw new RuntimeException('Invalid file type. Allowed: JPEG, PNG, GIF, WebP, SVG, PDF, MP3, WAV, OGG, M4A, MP4, WebM, OGV, MOV');
    }
    $size = (int)($file['size'] ?? 0);
    if ($size <= 0 || $size > $allowed['max']) {
        $mb = (int)ceil($allowed['max'] / (1024 * 1024));
        throw new RuntimeException('File size too large. Maximum for this type: ' . $mb . 'MB');
    }

    if ($folderId !== null) {
        $chk = $db->prepare('SELECT id FROM media_folders WHERE id = ?');
        $chk->execute([$folderId]);
        if (!$chk->fetchColumn()) {
            throw new RuntimeException('Folder not found');
        }
    }

    $uuid = mediaGenerateUuid();
    $storedName = 'media_' . $uuid . '.' . $allowed['ext'];
    $dest = mediaUploadsDir() . DIRECTORY_SEPARATOR . $storedName;
    $width = null;
    $height = null;
    $thumbName = null;
    $reencoded = false;

    $needsGdWrite = $removeBackground || ($optimize && $allowed['kind'] === 'image' && $allowed['ext'] !== 'svg' && $allowed['ext'] !== 'gif');
    if ($needsGdWrite && !extension_loaded('gd')) {
        throw new RuntimeException('PHP GD extension is required for image processing. Enable extension=gd in php.ini.');
    }

    if ($needsGdWrite) {
        $src = loadGdImageFromFile($tmp, $allowed['mime'], $allowed['ext']);
        if ($src === false) {
            if (!move_uploaded_file($tmp, $dest) && !@rename($tmp, $dest) && !@copy($tmp, $dest)) {
                throw new RuntimeException('Failed to save uploaded file');
            }
        } else {
            $src = applyGdExifOrientation($src, $tmp);
            if ($removeBackground) {
                $rgb = $bgColorHex ? parseHexColorToRgb($bgColorHex) : null;
                if ($rgb === null) {
                    $rgb = sampleCornerBackgroundColor($src);
                }
                if ($rgb !== null) {
                    $src = removeGdImageBackgroundColor($src, $rgb[0], $rgb[1], $rgb[2]);
                    $allowed['ext'] = 'png';
                    $allowed['mime'] = 'image/png';
                    $storedName = 'media_' . $uuid . '.png';
                    $dest = mediaUploadsDir() . DIRECTORY_SEPARATOR . $storedName;
                }
            }
            if ($optimize && !$removeBackground) {
                $src = resizeGdImageFit($src, 2560, 2560);
            }
            $width = imagesx($src);
            $height = imagesy($src);
            imagealphablending($src, false);
            imagesavealpha($src, true);
            $saved = false;
            if ($allowed['ext'] === 'png') {
                $saved = imagepng($src, $dest, 6);
            } elseif ($allowed['ext'] === 'jpg' || $allowed['ext'] === 'jpeg') {
                $saved = imagejpeg($src, $dest, $optimize ? 88 : 92);
            } elseif ($allowed['ext'] === 'webp' && function_exists('imagewebp')) {
                $saved = imagewebp($src, $dest, $optimize ? 86 : 90);
            } elseif ($allowed['ext'] === 'gif') {
                $saved = imagegif($src, $dest);
            }
            imagedestroy($src);
            if (!$saved) {
                if (!move_uploaded_file($tmp, $dest) && !@rename($tmp, $dest) && !@copy($tmp, $dest)) {
                    throw new RuntimeException('Failed to save uploaded file');
                }
            } else {
                $reencoded = true;
                if (is_uploaded_file($tmp)) {
                    @unlink($tmp);
                }
            }
        }
    } else {
        if (!move_uploaded_file($tmp, $dest) && !@rename($tmp, $dest) && !@copy($tmp, $dest)) {
            throw new RuntimeException('Failed to save uploaded file');
        }
    }

    if ($allowed['kind'] === 'image' && $allowed['ext'] !== 'svg' && is_file($dest)) {
        $info = @getimagesize($dest);
        if ($info) {
            $width = $width ?? (int)$info[0];
            $height = $height ?? (int)$info[1];
            $orient = mediaReadExifOrientation($dest);
            if (in_array($orient, [5, 6, 7, 8], true)) {
                $tmpW = $width;
                $width = $height;
                $height = $tmpW;
            }
        }
        $thumbName = mediaGenerateThumb($dest, $uuid);
    }

    $now = time();
    $title = pathinfo($originalName, PATHINFO_FILENAME);
    $savedBytes = is_file($dest) ? (int)filesize($dest) : $size;
    // #region agent log
    mediaAgentDebugLog('media_lib.php:mediaSaveUploadedFile', 'upload saved', [
        'originalName' => $originalName,
        'kind' => $allowed['kind'],
        'ext' => $allowed['ext'],
        'incomingBytes' => $size,
        'savedBytes' => $savedBytes,
        'width' => $width,
        'height' => $height,
        'reencoded' => $reencoded,
        'optimize' => $optimize,
        'removeBackground' => $removeBackground,
        'hasThumb' => $thumbName !== null,
    ], 'A');
    // #endregion
    $stmt = $db->prepare(
        'INSERT INTO media_files (
            folder_id, uuid, original_name, stored_name, thumb_name, mime, kind, size_bytes,
            width, height, title, alt_text, description, status, uploaded_by, created_at, updated_at, trashed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, \'active\', ?, ?, ?, NULL)'
    );
    $stmt->execute([
        $folderId,
        $uuid,
        $originalName,
        $storedName,
        $thumbName,
        $allowed['mime'],
        $allowed['kind'],
        $savedBytes,
        $width,
        $height,
        $title,
        $userId,
        $now,
        $now,
    ]);
    $id = (int)$db->lastInsertId();
    if ($tags !== null) {
        mediaSetFileTags($db, $id, $tags);
    }

    $row = $db->prepare('SELECT * FROM media_files WHERE id = ?');
    $row->execute([$id]);
    return mediaMapFileRow($db, $row->fetch(PDO::FETCH_ASSOC));
}

/**
 * @param array<string,mixed> $opts
 * @return array<string,mixed>
 */
function mediaTransformFile(PDO $db, int $fileId, array $opts, int $userId): array {
    if (!extension_loaded('gd')) {
        throw new RuntimeException('PHP GD extension is required for image transforms. Enable extension=gd in php.ini.');
    }

    try {
        $db->exec('PRAGMA busy_timeout = 30000');
    } catch (Throwable $e) {
        // ignore
    }

    $stmt = $db->prepare('SELECT * FROM media_files WHERE id = ?');
    $stmt->execute([$fileId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        throw new RuntimeException('File not found');
    }
    if ((string)$row['kind'] !== 'image') {
        throw new RuntimeException('Only images can be transformed');
    }
    if ((string)$row['status'] === 'trash') {
        throw new RuntimeException('Cannot transform a trashed file');
    }

    $stored = (string)$row['stored_name'];
    $srcPath = mediaUploadsDir() . DIRECTORY_SEPARATOR . $stored;
    if (!is_file($srcPath)) {
        throw new RuntimeException('Source file missing on disk');
    }

    $ext = strtolower(pathinfo($stored, PATHINFO_EXTENSION));
    if ($ext === 'svg') {
        throw new RuntimeException('SVG transforms are not supported');
    }

    // Snapshot row fields then release the statement so GD work does not hold locks as long
    $folderId = $row['folder_id'];
    $oldThumb = $row['thumb_name'] !== null ? (string)$row['thumb_name'] : null;
    $oldTitle = $row['title'];
    $oldAlt = $row['alt_text'];
    $oldDesc = $row['description'];
    $oldUuid = (string)$row['uuid'];
    $oldOriginal = (string)$row['original_name'];
    $oldMime = (string)$row['mime'];
    $oldWidth = $row['width'] !== null ? (int)$row['width'] : null;
    $oldHeight = $row['height'] !== null ? (int)$row['height'] : null;
    $oldSizeBytes = (int)$row['size_bytes'];
    $stmt = null;
    $row = null;

    // Backup original before in-place remove-background so the UI can Undo
    if (!empty($opts['removeBackground']) && !empty($opts['replace'])) {
        mediaSaveRemoveBgUndo($fileId, $srcPath, [
            'storedName' => $stored,
            'thumbName' => $oldThumb,
            'mime' => $oldMime,
            'width' => $oldWidth,
            'height' => $oldHeight,
            'sizeBytes' => $oldSizeBytes,
            'originalName' => $oldOriginal,
        ]);
    }

    $srcBytes = is_file($srcPath) ? (int)filesize($srcPath) : 0;
    $src = loadGdImageFromFile($srcPath, $oldMime, $ext);
    if ($src === false) {
        throw new RuntimeException('Could not decode image');
    }

    // Crop first (pixel coords relative to original)
    if (!empty($opts['crop']) && is_array($opts['crop'])) {
        $cx = max(0, (int)($opts['crop']['x'] ?? 0));
        $cy = max(0, (int)($opts['crop']['y'] ?? 0));
        $cw = max(1, (int)($opts['crop']['w'] ?? imagesx($src)));
        $ch = max(1, (int)($opts['crop']['h'] ?? imagesy($src)));
        $cw = min($cw, imagesx($src) - $cx);
        $ch = min($ch, imagesy($src) - $cy);
        if ($cw > 0 && $ch > 0) {
            $cropped = imagecreatetruecolor($cw, $ch);
            imagealphablending($cropped, false);
            imagesavealpha($cropped, true);
            $transparent = imagecolorallocatealpha($cropped, 0, 0, 0, 127);
            imagefilledrectangle($cropped, 0, 0, $cw, $ch, $transparent);
            imagealphablending($cropped, true);
            imagecopy($cropped, $src, 0, 0, $cx, $cy, $cw, $ch);
            imagedestroy($src);
            $src = $cropped;
        }
    }

    // Rotate: UI sends clockwise degrees (90 / 180 / 270). GD imagerotate is counter-clockwise.
    $rotateCw = isset($opts['rotate']) ? (int)$opts['rotate'] : 0;
    if (in_array($rotateCw, [90, 180, 270], true)) {
        if (!function_exists('imagerotate')) {
            imagedestroy($src);
            throw new RuntimeException('imagerotate() is not available in this PHP GD build');
        }
        $ccw = (360 - $rotateCw) % 360;
        imagealphablending($src, true);
        imagesavealpha($src, true);
        $bg = imagecolorallocatealpha($src, 0, 0, 0, 127);
        $rotated = imagerotate($src, $ccw, $bg);
        if ($rotated === false) {
            imagedestroy($src);
            throw new RuntimeException('Image rotation failed');
        }
        imagedestroy($src);
        $src = $rotated;
        imagealphablending($src, false);
        imagesavealpha($src, true);
    }

    if (!empty($opts['removeBackground'])) {
        $bgHex = isset($opts['bgColor']) ? (string)$opts['bgColor'] : null;
        $rgb = $bgHex ? parseHexColorToRgb($bgHex) : null;
        if ($rgb === null) {
            $rgb = sampleCornerBackgroundColor($src);
        }
        if ($rgb !== null) {
            $src = removeGdImageBackgroundColor($src, $rgb[0], $rgb[1], $rgb[2]);
        }
    }

    $beforeW = imagesx($src);
    $beforeH = imagesy($src);
    $hasW = isset($opts['width']) && (int)$opts['width'] > 0;
    $hasH = isset($opts['height']) && (int)$opts['height'] > 0;
    $targetW = $hasW ? max(1, (int)$opts['width']) : $beforeW;
    $targetH = $hasH ? max(1, (int)$opts['height']) : $beforeH;
    $resizeMode = isset($opts['resizeMode']) && (string)$opts['resizeMode'] === 'exact' ? 'exact' : 'fit';
    if ($hasW || $hasH) {
        if ($resizeMode === 'exact' && $hasW && $hasH) {
            $src = resizeGdImageExact($src, $targetW, $targetH);
        } else {
            $allowUpscale = $resizeMode === 'exact';
            $src = resizeGdImageFit($src, $targetW, $targetH, $allowUpscale);
        }
    }

    // Preserve original format when not explicitly converting
    $origExt = $ext === 'jpeg' ? 'jpg' : $ext;
    if (isset($opts['format']) && $opts['format'] !== '') {
        $format = strtolower((string)$opts['format']);
    } else {
        $format = in_array($origExt, ['png', 'jpg', 'webp', 'gif'], true) ? ($origExt === 'gif' ? 'png' : $origExt) : 'png';
    }
    if (!in_array($format, ['png', 'jpg', 'jpeg', 'webp'], true)) {
        $format = 'png';
    }
    if ($format === 'jpeg') {
        $format = 'jpg';
    }
    // Alpha needs PNG/WebP
    if (!empty($opts['removeBackground']) && $format === 'jpg') {
        $format = 'png';
    }

    $quality = isset($opts['quality']) ? max(1, min(100, (int)$opts['quality'])) : 85;
    $replace = !empty($opts['replace']);
    $uuid = $replace ? $oldUuid : mediaGenerateUuid();
    $newStored = 'media_' . $uuid . '.' . $format;
    $dest = mediaUploadsDir() . DIRECTORY_SEPARATOR . $newStored;
    $tmpDest = $dest . '.tmp.' . getmypid() . '.' . bin2hex(random_bytes(4));

    $ok = false;
    if ($format === 'jpg') {
        // Flatten onto white — imagejpeg does not support alpha
        $w = imagesx($src);
        $h = imagesy($src);
        $flat = imagecreatetruecolor($w, $h);
        $white = imagecolorallocate($flat, 255, 255, 255);
        imagefilledrectangle($flat, 0, 0, $w, $h, $white);
        imagealphablending($flat, true);
        imagecopy($flat, $src, 0, 0, 0, 0, $w, $h);
        imagedestroy($src);
        $src = $flat;
        $ok = imagejpeg($src, $tmpDest, $quality);
    } elseif ($format === 'webp' && function_exists('imagewebp')) {
        imagealphablending($src, false);
        imagesavealpha($src, true);
        $ok = imagewebp($src, $tmpDest, $quality);
    } else {
        // png (default)
        $format = 'png';
        $newStored = 'media_' . $uuid . '.png';
        $dest = mediaUploadsDir() . DIRECTORY_SEPARATOR . $newStored;
        $tmpDest = $dest . '.tmp.' . getmypid() . '.' . bin2hex(random_bytes(4));
        imagealphablending($src, false);
        imagesavealpha($src, true);
        $ok = imagepng($src, $tmpDest, (int)round((100 - $quality) / 10));
    }
    $width = imagesx($src);
    $height = imagesy($src);
    imagedestroy($src);

    if (!$ok || !is_file($tmpDest)) {
        @unlink($tmpDest);
        throw new RuntimeException('Failed to write transformed image');
    }

    // Atomic replace into final path
    if (is_file($dest) && !@unlink($dest)) {
        // Windows may lock briefly — try rename over
    }
    if (!@rename($tmpDest, $dest)) {
        if (!@copy($tmpDest, $dest)) {
            @unlink($tmpDest);
            throw new RuntimeException('Failed to finalize transformed image');
        }
        @unlink($tmpDest);
    }

    $thumbName = mediaGenerateThumb($dest, $uuid);
    $mimeMap = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'webp' => 'image/webp'];
    $now = time();
    $sizeBytes = filesize($dest) ?: 0;

    // Brief pause before DB write under Apache ZTS contention
    try {
        $db->exec('PRAGMA busy_timeout = 30000');
    } catch (Throwable $e) {
        // ignore
    }

    if ($replace) {
        if ($stored !== $newStored) {
            mediaSafeUnlinkUnderUploads($stored);
        }
        if ($oldThumb && $oldThumb !== $thumbName) {
            mediaSafeUnlinkUnderUploads($oldThumb);
        }
        $upd = $db->prepare(
            'UPDATE media_files SET stored_name = ?, thumb_name = ?, mime = ?, size_bytes = ?, width = ?, height = ?, updated_at = ? WHERE id = ?'
        );
        $attempts = 0;
        while (true) {
            try {
                $upd->execute([
                    $newStored,
                    $thumbName,
                    $mimeMap[$format],
                    $sizeBytes,
                    $width,
                    $height,
                    $now,
                    $fileId,
                ]);
                break;
            } catch (PDOException $e) {
                if (++$attempts < 8 && str_contains($e->getMessage(), 'database is locked')) {
                    usleep(100000 * $attempts);
                    continue;
                }
                throw $e;
            }
        }
        $id = $fileId;
    } else {
        $ins = $db->prepare(
            'INSERT INTO media_files (
                folder_id, uuid, original_name, stored_name, thumb_name, mime, kind, size_bytes,
                width, height, title, alt_text, description, status, uploaded_by, created_at, updated_at, trashed_at
            ) VALUES (?, ?, ?, ?, ?, ?, \'image\', ?, ?, ?, ?, ?, ?, \'active\', ?, ?, ?, NULL)'
        );
        $baseTitle = (string)($oldTitle ?: pathinfo($oldOriginal, PATHINFO_FILENAME));
        $ins->execute([
            $folderId,
            $uuid,
            $baseTitle . '_edited.' . $format,
            $newStored,
            $thumbName,
            $mimeMap[$format],
            $sizeBytes,
            $width,
            $height,
            $baseTitle . ' (edited)',
            $oldAlt,
            $oldDesc,
            $userId,
            $now,
            $now,
        ]);
        $id = (int)$db->lastInsertId();
        $tags = mediaTagsForFile($db, $fileId);
        mediaSetFileTags($db, $id, $tags);
    }

    $fresh = $db->prepare('SELECT * FROM media_files WHERE id = ?');
    $fresh->execute([$id]);
    $mapped = mediaMapFileRow($db, $fresh->fetch(PDO::FETCH_ASSOC));
    // #region agent log
    mediaAgentDebugLog('media_lib.php:mediaTransformFile', 'transform done', [
        'fileId' => $fileId,
        'replace' => $replace,
        'format' => $format,
        'quality' => $quality,
        'resizeMode' => $resizeMode,
        'requestedW' => $hasW ? $targetW : null,
        'requestedH' => $hasH ? $targetH : null,
        'beforeBytes' => $srcBytes,
        'afterBytes' => $sizeBytes,
        'afterW' => $width,
        'afterH' => $height,
        'hadCrop' => !empty($opts['crop']),
        'rotate' => $rotateCw,
    ], 'D');
    // #endregion
    return $mapped;
}
