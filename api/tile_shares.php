<?php
/**
 * Tile Shares API - Share tiles with other users, accept/reject invitations,
 * remove shared tiles, and block/unblock sharers.
 * PHP 8+ compatible.
 */
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';
$path = rtrim($path, '/');
if (empty($path)) {
    $path = '/';
}

switch ($method) {
    case 'GET':
        if ($path === '/' || $path === '') {
            handleListPending();
        } elseif ($path === '/blocked') {
            handleListBlocked();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
    case 'POST':
        if ($path === '/share') {
            handleShare();
        } elseif (preg_match('#^/(\d+)/accept$#', $path, $m)) {
            handleAccept((int)$m[1]);
        } elseif (preg_match('#^/(\d+)/reject$#', $path, $m)) {
            handleReject((int)$m[1]);
        } elseif (preg_match('#^/(\d+)/remove$#', $path, $m)) {
            handleRemove((int)$m[1]);
        } elseif ($path === '/block') {
            handleBlock();
        } elseif ($path === '/unblock') {
            handleUnblock();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleListPending(): void {
    $user = requireAuth();
    $db = getDB();
    
    $stmt = $db->prepare('
        SELECT tsi.id, tsi.tile_id, tsi.sharer_user_id, tsi.receiver_user_id, tsi.status, tsi.created_at,
               u.username as sharer_username
        FROM tile_share_invitations tsi
        JOIN users u ON u.id = tsi.sharer_user_id
        WHERE tsi.receiver_user_id = ? AND tsi.status = ?
        ORDER BY tsi.created_at DESC
    ');
    $stmt->execute([$user['id'], 'pending']);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Fetch full tile data for each invitation (for preview)
    $invitations = [];
    foreach ($rows as $row) {
        $tile = fetchTileForShare($db, $row['tile_id'], $user['id']);
        $invitations[] = [
            'id' => (int)$row['id'],
            'tileId' => $row['tile_id'],
            'sharerUserId' => (int)$row['sharer_user_id'],
            'sharerUsername' => $row['sharer_username'],
            'receiverUserId' => (int)$row['receiver_user_id'],
            'status' => $row['status'],
            'createdAt' => (int)$row['created_at'],
            'tile' => $tile
        ];
    }
    
    sendJSON(['invitations' => $invitations]);
}

function handleListBlocked(): void {
    $user = requireAuth();
    $db = getDB();
    
    $stmt = $db->prepare('
        SELECT ubs.blocked_user_id, u.username as blocked_username, ubs.created_at
        FROM user_blocked_sharers ubs
        JOIN users u ON u.id = ubs.blocked_user_id
        WHERE ubs.user_id = ?
        ORDER BY ubs.created_at DESC
    ');
    $stmt->execute([$user['id']]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $blocked = array_map(function ($r) {
        return [
            'userId' => (int)$r['blocked_user_id'],
            'username' => $r['blocked_username'],
            'blockedAt' => (int)$r['created_at']
        ];
    }, $rows);
    
    sendJSON(['blocked' => $blocked]);
}

function handleShare(): void {
    $user = requireAuth();
    $db = getDB();
    $data = getJSONInput();
    
    $tileId = $data['tile_id'] ?? null;
    $receiverUserId = isset($data['receiver_user_id']) ? (int)$data['receiver_user_id'] : null;
    
    if (empty($tileId) || $receiverUserId <= 0) {
        sendJSON(['error' => 'tile_id and receiver_user_id are required'], 400);
    }
    
    if ($receiverUserId === (int)$user['id']) {
        sendJSON(['error' => 'You cannot share a tile with yourself'], 400);
    }
    
    // Check if receiver has blocked this user
    $blockStmt = $db->prepare('SELECT 1 FROM user_blocked_sharers WHERE user_id = ? AND blocked_user_id = ?');
    $blockStmt->execute([$receiverUserId, $user['id']]);
    if ($blockStmt->fetch()) {
        sendJSON(['error' => 'This user has blocked you from sharing tiles'], 403);
    }
    
    // Verify tile exists and user owns it or has share permission
    $tileStmt = $db->prepare('SELECT id, user_id FROM tiles WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL');
    $tileStmt->execute([$tileId]);
    $tile = $tileStmt->fetch(PDO::FETCH_ASSOC);
    if (!$tile) {
        sendJSON(['error' => 'Tile not found'], 404);
    }
    
    if ((int)$tile['user_id'] !== (int)$user['id'] && !$user['is_admin']) {
        sendJSON(['error' => 'You can only share tiles you own'], 403);
    }
    
    // Verify receiver exists
    $recStmt = $db->prepare('SELECT id FROM users WHERE id = ? AND is_approved = 1');
    $recStmt->execute([$receiverUserId]);
    if (!$recStmt->fetch()) {
        sendJSON(['error' => 'Receiver user not found'], 400);
    }
    
    $now = time();
    
    // Upsert: if already pending, return existing; otherwise create
    $existingStmt = $db->prepare('SELECT id FROM tile_share_invitations WHERE tile_id = ? AND sharer_user_id = ? AND receiver_user_id = ? AND status = ?');
    $existingStmt->execute([$tileId, $user['id'], $receiverUserId, 'pending']);
    $existing = $existingStmt->fetch();
    if ($existing) {
        sendJSON(['success' => true, 'invitation_id' => (int)$existing['id'], 'message' => 'Invitation already sent']);
    }
    
    // If previously rejected/removed, update to pending; otherwise insert
    $updStmt = $db->prepare('UPDATE tile_share_invitations SET status = ?, updated_at = ? WHERE tile_id = ? AND sharer_user_id = ? AND receiver_user_id = ?');
    $updStmt->execute(['pending', $now, $tileId, $user['id'], $receiverUserId]);
    if ($updStmt->rowCount() > 0) {
        $selStmt = $db->prepare('SELECT id FROM tile_share_invitations WHERE tile_id = ? AND sharer_user_id = ? AND receiver_user_id = ?');
        $selStmt->execute([$tileId, $user['id'], $receiverUserId]);
        $row = $selStmt->fetch(PDO::FETCH_ASSOC);
        sendJSON(['success' => true, 'invitation_id' => (int)$row['id'], 'message' => 'Share invitation sent']);
    }
    
    $insertStmt = $db->prepare('INSERT INTO tile_share_invitations (tile_id, sharer_user_id, receiver_user_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    $insertStmt->execute([$tileId, $user['id'], $receiverUserId, 'pending', $now, $now]);
    $invitationId = (int)$db->lastInsertId();
    sendJSON(['success' => true, 'invitation_id' => $invitationId, 'message' => 'Share invitation sent'], 201);
}

function handleAccept(int $invitationId): void {
    $user = requireAuth();
    $db = getDB();
    
    $stmt = $db->prepare('SELECT * FROM tile_share_invitations WHERE id = ? AND receiver_user_id = ? AND status = ?');
    $stmt->execute([$invitationId, $user['id'], 'pending']);
    $inv = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$inv) {
        sendJSON(['error' => 'Invitation not found or already processed'], 404);
    }
    
    $now = time();
    $upd = $db->prepare('UPDATE tile_share_invitations SET status = ?, updated_at = ? WHERE id = ?');
    $upd->execute(['accepted', $now, $invitationId]);
    
    // Add receiver to tile's allowed_users so they have persistent access
    $tileStmt = $db->prepare('SELECT allowed_users, user_id FROM tiles WHERE id = ?');
    $tileStmt->execute([$inv['tile_id']]);
    $tile = $tileStmt->fetch(PDO::FETCH_ASSOC);
    if ($tile) {
        $allowedUsers = $tile['allowed_users'] ? json_decode($tile['allowed_users'], true) : [];
        if (!is_array($allowedUsers)) $allowedUsers = [];
        $receiverId = (int)$user['id'];
        if (!in_array($receiverId, $allowedUsers)) {
            $allowedUsers[] = $receiverId;
            $updTile = $db->prepare('UPDATE tiles SET allowed_users = ? WHERE id = ?');
            $updTile->execute([json_encode($allowedUsers), $inv['tile_id']]);
        }
    }
    
    sendJSON(['success' => true, 'message' => 'Tile accepted and added to your Private tab']);
}

function handleReject(int $invitationId): void {
    $user = requireAuth();
    $db = getDB();
    
    $stmt = $db->prepare('SELECT id FROM tile_share_invitations WHERE id = ? AND receiver_user_id = ? AND status = ?');
    $stmt->execute([$invitationId, $user['id'], 'pending']);
    if (!$stmt->fetch()) {
        sendJSON(['error' => 'Invitation not found or already processed'], 404);
    }
    
    $now = time();
    $upd = $db->prepare('UPDATE tile_share_invitations SET status = ?, updated_at = ? WHERE id = ?');
    $upd->execute(['rejected', $now, $invitationId]);
    
    sendJSON(['success' => true, 'message' => 'Invitation rejected']);
}

function handleRemove(int $invitationId): void {
    $user = requireAuth();
    $db = getDB();
    
    $stmt = $db->prepare('SELECT * FROM tile_share_invitations WHERE id = ? AND receiver_user_id = ? AND status = ?');
    $stmt->execute([$invitationId, $user['id'], 'accepted']);
    $inv = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$inv) {
        sendJSON(['error' => 'Shared tile not found or already removed'], 404);
    }
    
    $now = time();
    $upd = $db->prepare('UPDATE tile_share_invitations SET status = ?, updated_at = ? WHERE id = ?');
    $upd->execute(['removed', $now, $invitationId]);
    
    // Remove receiver from tile's allowed_users
    $tileStmt = $db->prepare('SELECT allowed_users FROM tiles WHERE id = ?');
    $tileStmt->execute([$inv['tile_id']]);
    $tile = $tileStmt->fetch(PDO::FETCH_ASSOC);
    if ($tile && $tile['allowed_users']) {
        $allowedUsers = json_decode($tile['allowed_users'], true);
        if (is_array($allowedUsers)) {
            $allowedUsers = array_values(array_filter($allowedUsers, fn($id) => (int)$id !== (int)$user['id']));
            $updTile = $db->prepare('UPDATE tiles SET allowed_users = ? WHERE id = ?');
            $updTile->execute([!empty($allowedUsers) ? json_encode($allowedUsers) : null, $inv['tile_id']]);
        }
    }
    
    sendJSON(['success' => true, 'message' => 'Shared tile removed from your Private tab']);
}

function handleBlock(): void {
    $user = requireAuth();
    $db = getDB();
    $data = getJSONInput();
    
    $blockedUserId = isset($data['user_id']) ? (int)$data['user_id'] : null;
    if ($blockedUserId <= 0) {
        sendJSON(['error' => 'user_id is required'], 400);
    }
    if ($blockedUserId === (int)$user['id']) {
        sendJSON(['error' => 'You cannot block yourself'], 400);
    }
    
    $recStmt = $db->prepare('SELECT id FROM users WHERE id = ?');
    $recStmt->execute([$blockedUserId]);
    if (!$recStmt->fetch()) {
        sendJSON(['error' => 'User not found'], 400);
    }
    
    $now = time();
    try {
        $stmt = $db->prepare('INSERT INTO user_blocked_sharers (user_id, blocked_user_id, created_at) VALUES (?, ?, ?)');
        $stmt->execute([$user['id'], $blockedUserId, $now]);
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'UNIQUE') !== false) {
            sendJSON(['success' => true, 'message' => 'User is already blocked']);
        }
        throw $e;
    }
    sendJSON(['success' => true, 'message' => 'User blocked from sharing tiles'], 201);
}

function handleUnblock(): void {
    $user = requireAuth();
    $db = getDB();
    $data = getJSONInput();
    
    $blockedUserId = isset($data['user_id']) ? (int)$data['user_id'] : null;
    if ($blockedUserId <= 0) {
        sendJSON(['error' => 'user_id is required'], 400);
    }
    
    $stmt = $db->prepare('DELETE FROM user_blocked_sharers WHERE user_id = ? AND blocked_user_id = ?');
    $stmt->execute([$user['id'], $blockedUserId]);
    sendJSON(['success' => true, 'message' => 'User unblocked']);
}

/**
 * Fetch tile data for share preview. Returns tile if sharer owns it and tile exists.
 */
function fetchTileForShare(PDO $db, string $tileId, int $receiverUserId): ?array {
    $stmt = $db->prepare('SELECT t.*, u.username as owner_username FROM tiles t LEFT JOIN users u ON u.id = t.user_id WHERE t.id = ? AND t.deleted_at IS NULL AND t.archived_at IS NULL');
    $stmt->execute([$tileId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return null;
    }
    
    // Build minimal tile object for preview (no full tabs/sections unless needed - tiles API does full load)
    return buildTilePreviewFromRow($db, $row);
}

function buildTilePreviewFromRow(PDO $db, array $row): array {
    $tileId = $row['id'];
    $allowedUsers = $row['allowed_users'] ? json_decode($row['allowed_users'], true) : [];
    $allowedGroups = $row['allowed_groups'] ? json_decode($row['allowed_groups'], true) : [];
    
    $tile = [
        'id' => $row['id'],
        'userId' => isset($row['user_id']) ? (int)$row['user_id'] : null,
        'ownerUsername' => $row['owner_username'] ?? null,
        'title' => $row['title'],
        'description' => $row['description'] ?? '',
        'emoji' => $row['emoji'] ?? '📄',
        'themeColor' => $row['theme_color'] ?? 'blue',
        'group' => $row['group'] ?? null,
        'visibility' => $row['visibility'] ?? 'private',
        'allowedUsers' => $allowedUsers,
        'allowedGroups' => $allowedGroups,
        'tileBackgroundColor' => $row['tile_background_color'] ?? null,
        'tileGradientEnabled' => !empty($row['tile_gradient_enabled']),
        'tileGradientColors' => $row['tile_gradient_colors'] ? json_decode($row['tile_gradient_colors'], true) : null,
        'tileGradientDirection' => $row['tile_gradient_direction'] ?? null,
        'tileBorderRadius' => isset($row['tile_border_radius']) ? (int)$row['tile_border_radius'] : null,
        'tileTextColor' => $row['tile_text_color'] ?? null,
        'tabs' => []
    ];
    
    // Load tabs and sections for preview
    $tabStmt = $db->prepare('SELECT * FROM tabs WHERE tile_id = ? ORDER BY position ASC');
    $tabStmt->execute([$tileId]);
    $tabs = $tabStmt->fetchAll(PDO::FETCH_ASSOC);
    
    foreach ($tabs as $tabRow) {
        $tab = [
            'id' => $tabRow['id'],
            'title' => $tabRow['title'],
            'position' => (int)$tabRow['position'],
            'sections' => []
        ];
        $secStmt = $db->prepare('SELECT * FROM sections WHERE tab_id = ? ORDER BY position ASC');
        $secStmt->execute([$tabRow['id']]);
        $sections = $secStmt->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($sections as $secRow) {
            $section = [
                'id' => $secRow['id'],
                'title' => $secRow['title'],
                'position' => (int)$secRow['position'],
                'links' => []
            ];
            $linkStmt = $db->prepare('SELECT id, label, url, icon FROM links WHERE section_id = ? ORDER BY position ASC LIMIT 20');
            $linkStmt->execute([$secRow['id']]);
            while ($linkRow = $linkStmt->fetch(PDO::FETCH_ASSOC)) {
                $section['links'][] = [
                    'id' => $linkRow['id'],
                    'label' => $linkRow['label'],
                    'url' => $linkRow['url'],
                    'icon' => $linkRow['icon'] ?? null
                ];
            }
            $tab['sections'][] = $section;
        }
        
        // Legacy sections (tile_id direct)
        $legSecStmt = $db->prepare('SELECT * FROM sections WHERE tile_id = ? AND (tab_id IS NULL OR tab_id = \'\') ORDER BY position ASC');
        $legSecStmt->execute([$tileId]);
        while ($secRow = $legSecStmt->fetch(PDO::FETCH_ASSOC)) {
            $section = [
                'id' => $secRow['id'],
                'title' => $secRow['title'],
                'position' => (int)$secRow['position'],
                'links' => []
            ];
            $linkStmt = $db->prepare('SELECT id, label, url, icon FROM links WHERE section_id = ? ORDER BY position ASC LIMIT 20');
            $linkStmt->execute([$secRow['id']]);
            while ($linkRow = $linkStmt->fetch(PDO::FETCH_ASSOC)) {
                $section['links'][] = [
                    'id' => $linkRow['id'],
                    'label' => $linkRow['label'],
                    'url' => $linkRow['url'],
                    'icon' => $linkRow['icon'] ?? null
                ];
            }
            if (empty($tab['sections'])) {
                $tab['sections'] = [];
            }
            $tab['sections'][] = $section;
        }
        
        $tile['tabs'][] = $tab;
    }
    
    return $tile;
}
