<?php
require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE) {
    try {
        @session_start();
    } catch (Throwable $e) {
        error_log('Broadcast session start failed: ' . $e->getMessage());
    }
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

// Normalize path - remove trailing slash for consistent matching
$path = rtrim($path, '/');
if (empty($path)) {
    $path = '/';
}

try {
    $db = getDB();
} catch (Throwable $e) {
    error_log('Broadcast getDB failed: ' . $e->getMessage());
    sendJSON(['error' => 'Failed to connect to database'], 500);
    exit;
}

switch ($method) {
    case 'GET':
        if ($path === '' || $path === '/') {
            handleGetBroadcast($db);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'POST':
        if ($path === '' || $path === '/') {
            handleCreateBroadcast($db);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'PUT':
        if ($path === '' || $path === '/') {
            handleUpdateBroadcast($db);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'DELETE':
        if ($path === '' || $path === '/') {
            handleDeleteBroadcast($db);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleGetBroadcast($db) {
    try {
        $now = time();
        // Get active broadcast message that hasn't expired
        $stmt = $db->prepare('SELECT id, message, font_family, font_size, color, scroll_speed, expires_at, created_at, updated_at FROM broadcast_messages WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 1');
        $stmt->execute([$now]);
        $broadcast = $stmt->fetch();
        
        if ($broadcast) {
            sendJSON([
                'id' => (int)$broadcast['id'],
                'message' => (string)($broadcast['message'] ?? ''),
                'fontFamily' => (string)($broadcast['font_family'] ?? 'Arial, sans-serif'),
                'fontSize' => (string)($broadcast['font_size'] ?? '16px'),
                'color' => (string)($broadcast['color'] ?? '#ff0000'),
                'scrollSpeed' => isset($broadcast['scroll_speed']) ? (int)$broadcast['scroll_speed'] : 30,
                'expiresAt' => !empty($broadcast['expires_at']) ? (int)$broadcast['expires_at'] : null,
                'createdAt' => (int)($broadcast['created_at'] ?? 0),
                'updatedAt' => (int)($broadcast['updated_at'] ?? 0),
            ]);
        } else {
            sendJSON(null);
        }
    } catch (PDOException $e) {
        error_log('Broadcast fetch PDO: ' . $e->getMessage());
        sendJSON(null);
    } catch (Throwable $e) {
        error_log('Broadcast fetch: ' . $e->getMessage());
        sendJSON(null);
    }
}

function handleCreateBroadcast($db) {
    requireAdmin(); // Only admins can create broadcast messages
    
    $data = getJSONInput();
    $message = $data['message'] ?? '';
    $fontFamily = $data['fontFamily'] ?? 'Arial, sans-serif';
    $fontSize = $data['fontSize'] ?? '16px';
    $color = $data['color'] ?? '#ff0000';
    $scrollSpeed = isset($data['scrollSpeed']) ? (int)$data['scrollSpeed'] : 30;
    $expiresAt = isset($data['expiresAt']) && $data['expiresAt'] ? (int)$data['expiresAt'] : null;
    
    if (empty($message)) {
        sendJSON(['error' => 'Message cannot be empty'], 400);
    }
    
    $userId = $_SESSION['user_id'] ?? null;
    $now = time();
    
    try {
        // Deactivate all existing broadcast messages
        $stmt = $db->prepare('UPDATE broadcast_messages SET is_active = 0, updated_at = ?');
        $stmt->execute([$now]);
        
        // Create new broadcast message
        $stmt = $db->prepare('INSERT INTO broadcast_messages (message, font_family, font_size, color, scroll_speed, is_active, expires_at, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)');
        $stmt->execute([$message, $fontFamily, $fontSize, $color, $scrollSpeed, $expiresAt, $now, $now, $userId]);
        
        $broadcastId = $db->lastInsertId();
        
        sendJSON([
            'success' => true,
            'id' => (int)$broadcastId,
            'message' => 'Broadcast message created successfully'
        ]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to create broadcast message: ' . $e->getMessage()], 500);
    }
}

function handleUpdateBroadcast($db) {
    requireAdmin(); // Only admins can update broadcast messages
    
    $data = getJSONInput();
    $id = isset($data['id']) ? (int)$data['id'] : null;
    
    if (!$id) {
        sendJSON(['error' => 'Message ID is required'], 400);
    }
    
    try {
        // Verify message exists
        $stmt = $db->prepare('SELECT id FROM broadcast_messages WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            sendJSON(['error' => 'Broadcast message not found'], 404);
        }
        
        $updates = [];
        $params = [];
        
        if (isset($data['message'])) {
            if (empty($data['message'])) {
                sendJSON(['error' => 'Message cannot be empty'], 400);
            }
            $updates[] = 'message = ?';
            $params[] = $data['message'];
        }
        
        if (isset($data['fontFamily'])) {
            $updates[] = 'font_family = ?';
            $params[] = $data['fontFamily'];
        }
        
        if (isset($data['fontSize'])) {
            $updates[] = 'font_size = ?';
            $params[] = $data['fontSize'];
        }
        
        if (isset($data['color'])) {
            $updates[] = 'color = ?';
            $params[] = $data['color'];
        }
        
        if (isset($data['scrollSpeed'])) {
            $updates[] = 'scroll_speed = ?';
            $params[] = (int)$data['scrollSpeed'];
        }
        
        if (isset($data['isActive'])) {
            $updates[] = 'is_active = ?';
            $params[] = $data['isActive'] ? 1 : 0;
        }
        
        if (isset($data['expiresAt'])) {
            $updates[] = 'expires_at = ?';
            $params[] = $data['expiresAt'] ? (int)$data['expiresAt'] : null;
        }
        
        if (empty($updates)) {
            sendJSON(['error' => 'No fields to update'], 400);
        }
        
        $updates[] = 'updated_at = ?';
        $params[] = time();
        $params[] = $id;
        
        $stmt = $db->prepare('UPDATE broadcast_messages SET ' . implode(', ', $updates) . ' WHERE id = ?');
        $stmt->execute($params);
        
        sendJSON(['success' => true, 'message' => 'Broadcast message updated successfully']);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to update broadcast message: ' . $e->getMessage()], 500);
    }
}

function handleDeleteBroadcast($db) {
    requireAdmin(); // Only admins can delete broadcast messages
    
    $data = getJSONInput();
    $id = isset($data['id']) ? (int)$data['id'] : null;
    
    if (!$id) {
        sendJSON(['error' => 'Message ID is required'], 400);
    }
    
    try {
        $stmt = $db->prepare('DELETE FROM broadcast_messages WHERE id = ?');
        $stmt->execute([$id]);
        
        if ($stmt->rowCount() === 0) {
            sendJSON(['error' => 'Broadcast message not found'], 404);
        }
        
        sendJSON(['success' => true, 'message' => 'Broadcast message deleted successfully']);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to delete broadcast message: ' . $e->getMessage()], 500);
    }
}
