<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

// Normalize path - remove trailing slash for consistent matching
$path = rtrim($path, '/');
if (empty($path)) {
    $path = '/';
}

switch ($method) {
    case 'GET':
        if ($path === '/') {
            handleGetMessages();
        } elseif (preg_match('#^/([^/]+)$#', $path, $matches)) {
            handleGetMessage($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint', 'path' => $path], 404);
        }
        break;
        
    case 'POST':
        if ($path === '/') {
            handleCreateMessage();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'DELETE':
        if (preg_match('#^/([^/]+)$#', $path, $matches)) {
            handleDeleteMessage($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleGetMessages() {
    try {
        $user = getAuthenticatedUser();
        if (!$user) {
            sendJSON(['error' => 'Authentication required'], 401);
        }
        
        $db = getDB();
        
        // Get query parameters
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;
        $offset = isset($_GET['offset']) ? (int)$_GET['offset'] : 0;
        $recipientId = isset($_GET['recipient_id']) ? (int)$_GET['recipient_id'] : null;
        $limit = min(max(0, $limit), 500); // Cap at 500 messages, ensure non-negative
        $offset = max(0, $offset);

        // Use literal LIMIT/OFFSET (already validated as int) – bound params can fail on MySQL/Doctrine
        $sqlLimit = (string)(int)$limit;
        $sqlOffset = (string)(int)$offset;

        // Fetch messages: public messages (recipient_user_id IS NULL) OR messages sent to/from current user
        if ($recipientId !== null) {
            // Direct messages between current user and recipient
            $stmt = $db->prepare('SELECT * FROM chat_messages WHERE (user_id = ? AND recipient_user_id = ?) OR (user_id = ? AND recipient_user_id = ?) OR (recipient_user_id IS NULL) ORDER BY created_at DESC LIMIT ' . $sqlLimit . ' OFFSET ' . $sqlOffset);
            $stmt->execute([$user['id'], $recipientId, $recipientId, $user['id']]);
        } else {
            // All public messages or messages sent to/from current user
            $stmt = $db->prepare('SELECT * FROM chat_messages WHERE recipient_user_id IS NULL OR user_id = ? OR recipient_user_id = ? ORDER BY created_at DESC LIMIT ' . $sqlLimit . ' OFFSET ' . $sqlOffset);
            $stmt->execute([$user['id'], $user['id']]);
        }
        $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Reverse to show oldest first in UI
        $messages = array_reverse($messages);
        
        // Parse tile_data JSON if present
        foreach ($messages as &$message) {
            if ($message['tile_data']) {
                $message['tile_data'] = json_decode($message['tile_data'], true);
            }
            // Convert timestamps to ISO strings
            $message['created_at_iso'] = date('c', $message['created_at']);
        }
        
        sendJSON($messages);
    } catch (Exception $e) {
        error_log('Error fetching chat messages: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to fetch messages: ' . $e->getMessage()], 500);
    }
}

function handleGetMessage($messageId) {
    try {
        $user = getAuthenticatedUser();
        if (!$user) {
            sendJSON(['error' => 'Authentication required'], 401);
        }
        
        $db = getDB();
        $stmt = $db->prepare('SELECT * FROM chat_messages WHERE id = ?');
        $stmt->execute([$messageId]);
        $message = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$message) {
            sendJSON(['error' => 'Message not found'], 404);
        }
        
        // Parse tile_data JSON if present
        if ($message['tile_data']) {
            $message['tile_data'] = json_decode($message['tile_data'], true);
        }
        $message['created_at_iso'] = date('c', $message['created_at']);
        
        sendJSON($message);
    } catch (Exception $e) {
        error_log('Error fetching chat message: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to fetch message: ' . $e->getMessage()], 500);
    }
}

function handleCreateMessage() {
    try {
        $user = requireAuth();
        $db = getDB();
        
        $data = getJSONInput();
        
        // Validate required fields
        if (!isset($data['message']) && !isset($data['tile_data'])) {
            sendJSON(['error' => 'Message or tile_data is required'], 400);
        }
        
        // Determine message type
        $messageType = $data['message_type'] ?? 'text';
        if (isset($data['tile_data'])) {
            $messageType = 'tile';
        } elseif (isset($data['message']) && (strpos($data['message'], '{') === 0 || strpos($data['message'], '[') === 0)) {
            // Check if message looks like JSON
            $jsonTest = json_decode($data['message'], true);
            if ($jsonTest !== null) {
                $messageType = 'json';
            }
        }
        
        $message = $data['message'] ?? '';
        $tileData = null;
        $recipientId = isset($data['recipient_user_id']) ? (int)$data['recipient_user_id'] : null;
        
        // Validate recipient exists if provided
        if ($recipientId !== null) {
            $recipientStmt = $db->prepare('SELECT id FROM users WHERE id = ? AND is_approved = 1');
            $recipientStmt->execute([$recipientId]);
            $recipient = $recipientStmt->fetch();
            if (!$recipient) {
                sendJSON(['error' => 'Invalid recipient user'], 400);
            }
        }
        
        if (isset($data['tile_data'])) {
            $tileData = json_encode($data['tile_data'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        
        $createdAt = time();
        
        // Insert message
        $stmt = $db->prepare('INSERT INTO chat_messages (user_id, username, message, message_type, tile_data, recipient_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $user['id'],
            $user['username'],
            $message,
            $messageType,
            $tileData,
            $recipientId,
            $createdAt
        ]);
        
        $messageId = $db->lastInsertId('chat_messages');
        
        // Fetch created message
        $stmt = $db->prepare('SELECT * FROM chat_messages WHERE id = ?');
        $stmt->execute([$messageId]);
        $createdMessage = $stmt->fetch(PDO::FETCH_ASSOC);
        
        // Parse tile_data JSON if present
        if ($createdMessage['tile_data']) {
            $createdMessage['tile_data'] = json_decode($createdMessage['tile_data'], true);
        }
        $createdMessage['created_at_iso'] = date('c', $createdMessage['created_at']);
        
        sendJSON($createdMessage, 201);
    } catch (Exception $e) {
        error_log('Error creating chat message: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to create message: ' . $e->getMessage()], 500);
    }
}

function handleDeleteMessage($messageId) {
    try {
        $user = requireAuth();
        $db = getDB();
        
        // Check if message exists and user owns it or is admin
        $stmt = $db->prepare('SELECT user_id FROM chat_messages WHERE id = ?');
        $stmt->execute([$messageId]);
        $message = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$message) {
            sendJSON(['error' => 'Message not found'], 404);
        }
        
        // Only allow deletion if user owns the message or is admin
        if ($message['user_id'] != $user['id'] && !$user['is_admin']) {
            sendJSON(['error' => 'Permission denied'], 403);
        }
        
        // Delete message
        $stmt = $db->prepare('DELETE FROM chat_messages WHERE id = ?');
        $stmt->execute([$messageId]);
        
        sendJSON(['success' => true]);
    } catch (Exception $e) {
        error_log('Error deleting chat message: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to delete message: ' . $e->getMessage()], 500);
    }
}
