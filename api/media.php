<?php
/**
 * Media library API — shared site media catalog.
 * Admins: upload, organize, transform, archive, trash, purge.
 * Authenticated users: list / browse / get metadata (for RTE picker).
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/media_lib.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '/';
$path = rtrim($path, '/');
if ($path === '') {
    $path = '/';
}

$db = getDB();
ensureMediaLibrarySchema($db);

try {
    if ($method === 'GET') {
        if ($path === '/' || $path === '') {
            mediaHandleList($db);
        } elseif ($path === '/folders') {
            mediaHandleListFolders($db);
        } elseif ($path === '/tags') {
            mediaHandleListTags($db);
        } elseif (preg_match('#^/(\d+)$#', $path, $m)) {
            mediaHandleGet($db, (int)$m[1]);
        } else {
            sendJSON(['error' => 'Not found'], 404);
        }
    } elseif ($method === 'POST') {
        if ($path === '/' || $path === '') {
            mediaHandleUpload($db);
        } elseif ($path === '/folders') {
            mediaHandleCreateFolder($db);
        } elseif ($path === '/purge') {
            mediaHandlePurge($db);
        } elseif ($path === '/purge-all') {
            mediaHandlePurgeAll($db);
        } elseif (preg_match('#^/(\d+)/transform$#', $path, $m)) {
            mediaHandleTransform($db, (int)$m[1]);
        } else {
            sendJSON(['error' => 'Not found'], 404);
        }
    } elseif ($method === 'PATCH' || $method === 'PUT') {
        if (preg_match('#^/(\d+)$#', $path, $m)) {
            mediaHandleUpdate($db, (int)$m[1]);
        } elseif (preg_match('#^/folders/(\d+)$#', $path, $m)) {
            mediaHandleUpdateFolder($db, (int)$m[1]);
        } else {
            sendJSON(['error' => 'Not found'], 404);
        }
    } elseif ($method === 'DELETE') {
        if (preg_match('#^/(\d+)$#', $path, $m)) {
            mediaHandleDelete($db, (int)$m[1]);
        } elseif (preg_match('#^/folders/(\d+)$#', $path, $m)) {
            mediaHandleDeleteFolder($db, (int)$m[1]);
        } else {
            sendJSON(['error' => 'Not found'], 404);
        }
    } else {
        sendJSON(['error' => 'Method not allowed'], 405);
    }
} catch (Throwable $e) {
    error_log('media API error: ' . $e->getMessage());
    sendJSON(['error' => $e->getMessage()], 500);
}

function mediaHandleList(PDO $db): void {
    requireAuth();
    $q = trim((string)($_GET['q'] ?? ''));
    $folderId = isset($_GET['folder_id']) && $_GET['folder_id'] !== '' ? (int)$_GET['folder_id'] : null;
    $kind = trim((string)($_GET['kind'] ?? ''));
    $status = trim((string)($_GET['status'] ?? 'active'));
    $tag = trim((string)($_GET['tag'] ?? ''));
    $page = max(1, (int)($_GET['page'] ?? 1));
    $perPage = min(100, max(1, (int)($_GET['per_page'] ?? 48)));
    $offset = ($page - 1) * $perPage;

    if (!in_array($status, ['active', 'archived', 'trash', 'all'], true)) {
        $status = 'active';
    }

    $where = [];
    $params = [];

    if ($status !== 'all') {
        $where[] = 'f.status = ?';
        $params[] = $status;
    }
    if ($folderId !== null && $status !== 'trash') {
        $where[] = 'f.folder_id = ?';
        $params[] = $folderId;
    }
    if ($kind !== '' && in_array($kind, ['image', 'pdf', 'audio', 'video', 'other'], true)) {
        $where[] = 'f.kind = ?';
        $params[] = $kind;
    }
    if ($q !== '') {
        $where[] = '(f.original_name LIKE ? OR f.title LIKE ? OR f.alt_text LIKE ? OR f.description LIKE ?)';
        $like = '%' . $q . '%';
        array_push($params, $like, $like, $like, $like);
    }
    if ($tag !== '') {
        $where[] = 'EXISTS (
            SELECT 1 FROM media_file_tags ft
            INNER JOIN media_tags t ON t.id = ft.tag_id
            WHERE ft.file_id = f.id AND t.name = ? COLLATE NOCASE
        )';
        $params[] = $tag;
    }

    $sqlWhere = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
    $countStmt = $db->prepare("SELECT COUNT(*) FROM media_files f $sqlWhere");
    $countStmt->execute($params);
    $total = (int)$countStmt->fetchColumn();

    $listSql = "SELECT f.* FROM media_files f $sqlWhere ORDER BY f.created_at DESC LIMIT " . (int)$perPage . ' OFFSET ' . (int)$offset;
    $stmt = $db->prepare($listSql);
    $stmt->execute($params);
    $files = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $files[] = mediaMapFileRow($db, $row);
    }

    sendJSON([
        'data' => $files,
        'total' => $total,
        'page' => $page,
        'perPage' => $perPage,
    ]);
}

function mediaHandleListFolders(PDO $db): void {
    requireAuth();
    $stmt = $db->query('SELECT * FROM media_folders ORDER BY sort_order ASC, name COLLATE NOCASE ASC');
    $folders = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $folders[] = mediaMapFolderRow($row);
    }
    sendJSON(['data' => $folders]);
}

function mediaHandleListTags(PDO $db): void {
    requireAuth();
    $stmt = $db->query('SELECT id, name FROM media_tags ORDER BY name COLLATE NOCASE ASC');
    $tags = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $tags[] = ['id' => (int)$row['id'], 'name' => (string)$row['name']];
    }
    sendJSON(['data' => $tags]);
}

function mediaHandleGet(PDO $db, int $id): void {
    requireAuth();
    $stmt = $db->prepare('SELECT * FROM media_files WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        sendJSON(['error' => 'File not found'], 404);
    }
    sendJSON(['data' => mediaMapFileRow($db, $row)]);
}

function mediaHandleUpload(PDO $db): void {
    $user = requireAdmin();
    $userId = (int)$user['id'];
    $folderId = isset($_POST['folder_id']) && $_POST['folder_id'] !== '' ? (int)$_POST['folder_id'] : null;
    $removeBackground = !empty($_POST['remove_background']) && $_POST['remove_background'] !== '0';
    $bgColor = isset($_POST['bg_color']) ? trim((string)$_POST['bg_color']) : null;
    $tags = null;
    if (isset($_POST['tags'])) {
        $raw = $_POST['tags'];
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $tags = $decoded;
            } else {
                $tags = array_filter(array_map('trim', explode(',', $raw)));
            }
        } elseif (is_array($raw)) {
            $tags = $raw;
        }
    }

    $uploaded = [];
    $errors = [];

    // Support files[] multi or single "file"
    $fileList = [];
    if (isset($_FILES['files']) && is_array($_FILES['files']['name'] ?? null)) {
        $n = count($_FILES['files']['name']);
        for ($i = 0; $i < $n; $i++) {
            $fileList[] = [
                'name' => $_FILES['files']['name'][$i],
                'type' => $_FILES['files']['type'][$i],
                'tmp_name' => $_FILES['files']['tmp_name'][$i],
                'error' => $_FILES['files']['error'][$i],
                'size' => $_FILES['files']['size'][$i],
            ];
        }
    } elseif (isset($_FILES['files']) && is_string($_FILES['files']['name'] ?? null)) {
        $fileList[] = $_FILES['files'];
    } elseif (isset($_FILES['files']['tmp_name']) && is_string($_FILES['files']['tmp_name'])) {
        $fileList[] = $_FILES['files'];
    } elseif (isset($_FILES['file'])) {
        $fileList[] = $_FILES['file'];
    }

    if (empty($fileList)) {
        sendJSON(['error' => 'No file uploaded'], 400);
    }

    foreach ($fileList as $file) {
        try {
            $uploaded[] = mediaSaveUploadedFile($db, $file, $folderId, $userId, $tags, $removeBackground, $bgColor);
        } catch (Throwable $e) {
            $errors[] = [
                'name' => $file['name'] ?? 'file',
                'error' => $e->getMessage(),
            ];
        }
    }

    if (empty($uploaded) && !empty($errors)) {
        sendJSON(['error' => $errors[0]['error'], 'errors' => $errors], 400);
    }

    sendJSON([
        'success' => true,
        'data' => $uploaded,
        'errors' => $errors,
    ]);
}

function mediaHandleCreateFolder(PDO $db): void {
    $user = requireAdmin();
    $input = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
    $name = trim((string)($input['name'] ?? ''));
    $parentId = isset($input['parentId']) && $input['parentId'] !== null && $input['parentId'] !== ''
        ? (int)$input['parentId']
        : null;
    if ($name === '') {
        sendJSON(['error' => 'Folder name is required'], 400);
    }
    if ($parentId !== null) {
        $chk = $db->prepare('SELECT id FROM media_folders WHERE id = ?');
        $chk->execute([$parentId]);
        if (!$chk->fetchColumn()) {
            sendJSON(['error' => 'Parent folder not found'], 404);
        }
    }
    $now = time();
    $stmt = $db->prepare(
        'INSERT INTO media_folders (parent_id, name, sort_order, created_by, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)'
    );
    $stmt->execute([$parentId, $name, (int)$user['id'], $now, $now]);
    $id = (int)$db->lastInsertId();
    $row = $db->prepare('SELECT * FROM media_folders WHERE id = ?');
    $row->execute([$id]);
    sendJSON(['data' => mediaMapFolderRow($row->fetch(PDO::FETCH_ASSOC))], 201);
}

function mediaHandleUpdateFolder(PDO $db, int $id): void {
    requireAdmin();
    $stmt = $db->prepare('SELECT * FROM media_folders WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        sendJSON(['error' => 'Folder not found'], 404);
    }
    $input = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
    $name = array_key_exists('name', $input) ? trim((string)$input['name']) : (string)$row['name'];
    $parentId = array_key_exists('parentId', $input)
        ? ($input['parentId'] !== null && $input['parentId'] !== '' ? (int)$input['parentId'] : null)
        : ($row['parent_id'] !== null ? (int)$row['parent_id'] : null);
    $sortOrder = array_key_exists('sortOrder', $input) ? (int)$input['sortOrder'] : (int)$row['sort_order'];

    if ($name === '') {
        sendJSON(['error' => 'Folder name is required'], 400);
    }
    if ($parentId === $id) {
        sendJSON(['error' => 'Folder cannot be its own parent'], 400);
    }
    if ($parentId !== null) {
        $chk = $db->prepare('SELECT id FROM media_folders WHERE id = ?');
        $chk->execute([$parentId]);
        if (!$chk->fetchColumn()) {
            sendJSON(['error' => 'Parent folder not found'], 404);
        }
    }

    $upd = $db->prepare('UPDATE media_folders SET parent_id = ?, name = ?, sort_order = ?, updated_at = ? WHERE id = ?');
    $upd->execute([$parentId, $name, $sortOrder, time(), $id]);
    $fresh = $db->prepare('SELECT * FROM media_folders WHERE id = ?');
    $fresh->execute([$id]);
    sendJSON(['data' => mediaMapFolderRow($fresh->fetch(PDO::FETCH_ASSOC))]);
}

function mediaHandleDeleteFolder(PDO $db, int $id): void {
    requireAdmin();
    $stmt = $db->prepare('SELECT * FROM media_folders WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        sendJSON(['error' => 'Folder not found'], 404);
    }
    $cStmt = $db->prepare('SELECT COUNT(*) FROM media_folders WHERE parent_id = ?');
    $cStmt->execute([$id]);
    if ((int)$cStmt->fetchColumn() > 0) {
        sendJSON(['error' => 'Folder has subfolders; move or delete them first'], 400);
    }
    $fStmt = $db->prepare('SELECT COUNT(*) FROM media_files WHERE folder_id = ? AND status != \'trash\'');
    $fStmt->execute([$id]);
    if ((int)$fStmt->fetchColumn() > 0) {
        sendJSON(['error' => 'Folder is not empty; move or trash files first'], 400);
    }
    // Prevent deleting last root
    if ($row['parent_id'] === null) {
        $roots = (int)$db->query('SELECT COUNT(*) FROM media_folders WHERE parent_id IS NULL')->fetchColumn();
        if ($roots <= 1) {
            sendJSON(['error' => 'Cannot delete the root Library folder'], 400);
        }
    }
    $db->prepare('UPDATE media_files SET folder_id = NULL WHERE folder_id = ?')->execute([$id]);
    $db->prepare('DELETE FROM media_folders WHERE id = ?')->execute([$id]);
    sendJSON(['success' => true]);
}

function mediaHandleUpdate(PDO $db, int $id): void {
    requireAdmin();
    $stmt = $db->prepare('SELECT * FROM media_files WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        sendJSON(['error' => 'File not found'], 404);
    }
    $input = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];

    $title = array_key_exists('title', $input) ? (string)$input['title'] : $row['title'];
    $altText = array_key_exists('altText', $input) ? (string)$input['altText'] : $row['alt_text'];
    $description = array_key_exists('description', $input) ? (string)$input['description'] : $row['description'];
    $folderId = array_key_exists('folderId', $input)
        ? ($input['folderId'] !== null && $input['folderId'] !== '' ? (int)$input['folderId'] : null)
        : ($row['folder_id'] !== null ? (int)$row['folder_id'] : null);

    $status = array_key_exists('status', $input) ? (string)$input['status'] : (string)$row['status'];
    if (!in_array($status, ['active', 'archived', 'trash'], true)) {
        sendJSON(['error' => 'Invalid status'], 400);
    }

    $currentStatus = (string)$row['status'];
    $trashedAt = $row['trashed_at'];
    $stored = (string)$row['stored_name'];
    $thumb = $row['thumb_name'] !== null ? (string)$row['thumb_name'] : null;

    // Status transitions with disk moves
    if ($status === 'trash' && $currentStatus !== 'trash') {
        mediaMoveToTrash($stored);
        if ($thumb) {
            mediaMoveToTrash($thumb);
        }
        $trashedAt = time();
    } elseif ($currentStatus === 'trash' && $status !== 'trash') {
        mediaRestoreFromTrash($stored);
        if ($thumb) {
            mediaRestoreFromTrash($thumb);
        }
        $trashedAt = null;
    }

    $upd = $db->prepare(
        'UPDATE media_files SET folder_id = ?, title = ?, alt_text = ?, description = ?, status = ?, trashed_at = ?, updated_at = ? WHERE id = ?'
    );
    $upd->execute([$folderId, $title, $altText, $description, $status, $trashedAt, time(), $id]);

    if (array_key_exists('tags', $input) && is_array($input['tags'])) {
        mediaSetFileTags($db, $id, $input['tags']);
    }

    $fresh = $db->prepare('SELECT * FROM media_files WHERE id = ?');
    $fresh->execute([$id]);
    sendJSON(['data' => mediaMapFileRow($db, $fresh->fetch(PDO::FETCH_ASSOC))]);
}

function mediaHandleDelete(PDO $db, int $id): void {
    requireAdmin();
    $stmt = $db->prepare('SELECT * FROM media_files WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        sendJSON(['error' => 'File not found'], 404);
    }
    // Soft-delete → trash
    if ((string)$row['status'] !== 'trash') {
        mediaMoveToTrash((string)$row['stored_name']);
        if (!empty($row['thumb_name'])) {
            mediaMoveToTrash((string)$row['thumb_name']);
        }
        $db->prepare('UPDATE media_files SET status = \'trash\', trashed_at = ?, updated_at = ? WHERE id = ?')
            ->execute([time(), time(), $id]);
        $fresh = $db->prepare('SELECT * FROM media_files WHERE id = ?');
        $fresh->execute([$id]);
        sendJSON(['data' => mediaMapFileRow($db, $fresh->fetch(PDO::FETCH_ASSOC))]);
        return;
    }
    // Already trash — permanent delete
    mediaPurgeTrashFile((string)$row['stored_name']);
    if (!empty($row['thumb_name'])) {
        mediaPurgeTrashFile((string)$row['thumb_name']);
    }
    $db->prepare('DELETE FROM media_files WHERE id = ?')->execute([$id]);
    sendJSON(['success' => true]);
}

function mediaHandlePurge(PDO $db): void {
    requireAdmin();
    $input = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
    $ids = $input['ids'] ?? [];
    if (!is_array($ids) || empty($ids)) {
        sendJSON(['error' => 'ids array is required'], 400);
    }
    $purged = 0;
    foreach ($ids as $id) {
        $id = (int)$id;
        $stmt = $db->prepare('SELECT * FROM media_files WHERE id = ? AND status = \'trash\'');
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            continue;
        }
        mediaPurgeTrashFile((string)$row['stored_name']);
        if (!empty($row['thumb_name'])) {
            mediaPurgeTrashFile((string)$row['thumb_name']);
        }
        $db->prepare('DELETE FROM media_files WHERE id = ?')->execute([$id]);
        $purged++;
    }
    sendJSON(['success' => true, 'purged' => $purged]);
}

function mediaHandlePurgeAll(PDO $db): void {
    requireAdmin();
    $stmt = $db->query('SELECT * FROM media_files WHERE status = \'trash\'');
    $purged = 0;
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        mediaPurgeTrashFile((string)$row['stored_name']);
        if (!empty($row['thumb_name'])) {
            mediaPurgeTrashFile((string)$row['thumb_name']);
        }
        $db->prepare('DELETE FROM media_files WHERE id = ?')->execute([(int)$row['id']]);
        $purged++;
    }
    sendJSON(['success' => true, 'purged' => $purged]);
}

function mediaHandleTransform(PDO $db, int $id): void {
    $user = requireAdmin();
    $input = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
    try {
        $result = mediaTransformFile($db, $id, $input, (int)$user['id']);
        sendJSON(['data' => $result]);
    } catch (Throwable $e) {
        $code = str_contains($e->getMessage(), 'not found') ? 404 : 400;
        sendJSON(['error' => $e->getMessage()], $code);
    }
}
