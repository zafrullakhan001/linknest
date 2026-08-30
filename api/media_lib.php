<?php
/**
 * Media library helpers — shared site media catalog (images, PDF, audio, video).
 * Files live flat under uploads/ as media_{uuid}.ext; folders are virtual (DB tree).
 */

require_once __DIR__ . '/image_helpers.php';

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

function mediaPublicUrl(string $storedName): string {
    return mediaBasePath() . '/uploads/' . $storedName;
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
function mediaMapFileRow(PDO $db, array $row, bool $includeTags = true): array {
    $stored = (string)$row['stored_name'];
    $status = (string)$row['status'];
    $url = null;
    $thumbUrl = null;
    if ($status !== 'trash' && $stored !== '') {
        $url = mediaPublicUrl($stored);
        if (!empty($row['thumb_name'])) {
            $thumbUrl = mediaPublicUrl((string)$row['thumb_name']);
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
        $out['tags'] = mediaTagsForFile($db, (int)$row['id']);
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
 * Create a ~240px thumbnail next to the original. Returns thumb filename or null.
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
    $resized = resizeGdImageFit($src, 240, 240);
    $thumbName = 'media_' . $uuid . '_thumb.webp';
    $thumbPath = mediaUploadsDir() . DIRECTORY_SEPARATOR . $thumbName;
    $ok = false;
    if (function_exists('imagewebp')) {
        $ok = @imagewebp($resized, $thumbPath, 80);
    }
    if (!$ok) {
        $thumbName = 'media_' . $uuid . '_thumb.jpg';
        $thumbPath = mediaUploadsDir() . DIRECTORY_SEPARATOR . $thumbName;
        $ok = @imagejpeg($resized, $thumbPath, 80);
    }
    imagedestroy($resized);
    return $ok ? $thumbName : null;
}

/**
 * @param array<string,mixed> $file $_FILES entry
 * @return array<string,mixed>
 */
function mediaSaveUploadedFile(PDO $db, array $file, ?int $folderId, int $userId, ?array $tags = null, bool $removeBackground = false, ?string $bgColorHex = null): array {
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

    if ($allowed['kind'] === 'image' && $allowed['ext'] !== 'svg' && ($removeBackground || extension_loaded('gd'))) {
        if ($removeBackground && !extension_loaded('gd')) {
            throw new RuntimeException('PHP GD extension is required for background removal. Enable extension=gd in php.ini.');
        }
        if (extension_loaded('gd')) {
            $src = loadGdImageFromFile($tmp, $allowed['mime'], $allowed['ext']);
            if ($src !== false) {
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
                $width = imagesx($src);
                $height = imagesy($src);
                imagealphablending($src, false);
                imagesavealpha($src, true);
                $saved = false;
                if ($allowed['ext'] === 'png') {
                    $saved = imagepng($src, $dest, 6);
                } elseif ($allowed['ext'] === 'jpg' || $allowed['ext'] === 'jpeg') {
                    $saved = imagejpeg($src, $dest, 90);
                } elseif ($allowed['ext'] === 'webp' && function_exists('imagewebp')) {
                    $saved = imagewebp($src, $dest, 90);
                } elseif ($allowed['ext'] === 'gif') {
                    $saved = imagegif($src, $dest);
                }
                imagedestroy($src);
                if ($saved) {
                    if (is_uploaded_file($tmp)) {
                        @unlink($tmp);
                    }
                    $thumbName = mediaGenerateThumb($dest, $uuid);
                } else {
                    // fall through to raw move
                    if (!move_uploaded_file($tmp, $dest) && !@rename($tmp, $dest) && !@copy($tmp, $dest)) {
                        throw new RuntimeException('Failed to save uploaded file');
                    }
                }
            } else {
                if (!move_uploaded_file($tmp, $dest)) {
                    throw new RuntimeException('Failed to save uploaded file');
                }
            }
        } else {
            if (!move_uploaded_file($tmp, $dest)) {
                throw new RuntimeException('Failed to save uploaded file');
            }
        }
    } else {
        if (!move_uploaded_file($tmp, $dest)) {
            throw new RuntimeException('Failed to save uploaded file');
        }
        if ($allowed['kind'] === 'image' && $allowed['ext'] !== 'svg') {
            $info = @getimagesize($dest);
            if ($info) {
                $width = (int)$info[0];
                $height = (int)$info[1];
            }
            $thumbName = mediaGenerateThumb($dest, $uuid);
        }
    }

    $now = time();
    $title = pathinfo($originalName, PATHINFO_FILENAME);
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
        filesize($dest) ?: $size,
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

    $src = loadGdImageFromFile($srcPath, (string)$row['mime'], $ext);
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

    $maxW = isset($opts['width']) ? max(1, (int)$opts['width']) : imagesx($src);
    $maxH = isset($opts['height']) ? max(1, (int)$opts['height']) : imagesy($src);
    if ($maxW < imagesx($src) || $maxH < imagesy($src)) {
        $src = resizeGdImageFit($src, $maxW, $maxH);
    }

    $format = strtolower((string)($opts['format'] ?? 'png'));
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
    $uuid = $replace ? (string)$row['uuid'] : mediaGenerateUuid();
    $newStored = 'media_' . $uuid . '.' . $format;
    $dest = mediaUploadsDir() . DIRECTORY_SEPARATOR . $newStored;

    imagealphablending($src, false);
    imagesavealpha($src, true);
    $ok = false;
    if ($format === 'png') {
        $ok = imagepng($src, $dest, (int)round((100 - $quality) / 10));
    } elseif ($format === 'jpg') {
        $ok = imagejpeg($src, $dest, $quality);
    } elseif ($format === 'webp' && function_exists('imagewebp')) {
        $ok = imagewebp($src, $dest, $quality);
    }
    $width = imagesx($src);
    $height = imagesy($src);
    imagedestroy($src);

    if (!$ok) {
        throw new RuntimeException('Failed to write transformed image');
    }

    $thumbName = mediaGenerateThumb($dest, $uuid);
    $mimeMap = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'webp' => 'image/webp'];
    $now = time();

    if ($replace) {
        // Remove old public file if name changed
        if ($stored !== $newStored) {
            mediaSafeUnlinkUnderUploads($stored);
        }
        if (!empty($row['thumb_name']) && $row['thumb_name'] !== $thumbName) {
            mediaSafeUnlinkUnderUploads((string)$row['thumb_name']);
        }
        $upd = $db->prepare(
            'UPDATE media_files SET stored_name = ?, thumb_name = ?, mime = ?, size_bytes = ?, width = ?, height = ?, updated_at = ? WHERE id = ?'
        );
        $upd->execute([
            $newStored,
            $thumbName,
            $mimeMap[$format],
            filesize($dest) ?: 0,
            $width,
            $height,
            $now,
            $fileId,
        ]);
        $id = $fileId;
    } else {
        $ins = $db->prepare(
            'INSERT INTO media_files (
                folder_id, uuid, original_name, stored_name, thumb_name, mime, kind, size_bytes,
                width, height, title, alt_text, description, status, uploaded_by, created_at, updated_at, trashed_at
            ) VALUES (?, ?, ?, ?, ?, ?, \'image\', ?, ?, ?, ?, ?, ?, \'active\', ?, ?, ?, NULL)'
        );
        $baseTitle = (string)($row['title'] ?: pathinfo((string)$row['original_name'], PATHINFO_FILENAME));
        $ins->execute([
            $row['folder_id'],
            $uuid,
            $baseTitle . '_edited.' . $format,
            $newStored,
            $thumbName,
            $mimeMap[$format],
            filesize($dest) ?: 0,
            $width,
            $height,
            $baseTitle . ' (edited)',
            $row['alt_text'],
            $row['description'],
            $userId,
            $now,
            $now,
        ]);
        $id = (int)$db->lastInsertId();
        // Copy tags
        $tags = mediaTagsForFile($db, $fileId);
        mediaSetFileTags($db, $id, $tags);
    }

    $fresh = $db->prepare('SELECT * FROM media_files WHERE id = ?');
    $fresh->execute([$id]);
    return mediaMapFileRow($db, $fresh->fetch(PDO::FETCH_ASSOC));
}
