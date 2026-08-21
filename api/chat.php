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

function formatChatMessage(array $message): array {
    if (!empty($message['tile_data']) && is_string($message['tile_data'])) {
        $decoded = json_decode($message['tile_data'], true);
        if (is_array($decoded)) {
            $message['tile_data'] = $decoded;
        }
    }

    $ts = isset($message['created_at']) ? (int) $message['created_at'] : 0;
    $message['created_at'] = $ts;
    $message['created_at_iso'] = date('c', $ts);

    if (!array_key_exists('recipient_user_id', $message) || $message['recipient_user_id'] === null || $message['recipient_user_id'] === '') {
        $message['recipient_user_id'] = null;
        $message['recipient_username'] = null;
    } else {
        $message['recipient_user_id'] = (int) $message['recipient_user_id'];
        $username = $message['recipient_username'] ?? null;
        $message['recipient_username'] = ($username !== null && $username !== '') ? (string) $username : null;
    }

    return $message;
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
        $limit = min($limit, 500); // Cap at 500 messages
        
        // Fetch messages: public messages (recipient_user_id IS NULL) OR messages sent to/from current user
        if ($recipientId !== null) {
            // Direct messages between current user and recipient
            $stmt = $db->prepare('SELECT m.*, r.username AS recipient_username FROM chat_messages m LEFT JOIN users r ON r.id = m.recipient_user_id WHERE (m.user_id = ? AND m.recipient_user_id = ?) OR (m.user_id = ? AND m.recipient_user_id = ?) OR (m.recipient_user_id IS NULL) ORDER BY m.created_at DESC LIMIT ? OFFSET ?');
            $stmt->execute([$user['id'], $recipientId, $recipientId, $user['id'], $limit, $offset]);
        } else {
            // All public messages or messages sent to/from current user
            $stmt = $db->prepare('SELECT m.*, r.username AS recipient_username FROM chat_messages m LEFT JOIN users r ON r.id = m.recipient_user_id WHERE m.recipient_user_id IS NULL OR m.user_id = ? OR m.recipient_user_id = ? ORDER BY m.created_at DESC LIMIT ? OFFSET ?');
            $stmt->execute([$user['id'], $user['id'], $limit, $offset]);
        }
        $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Reverse to show oldest first in UI
        $messages = array_reverse($messages);
        
        foreach ($messages as &$message) {
            $message = formatChatMessage($message);
        }
        unset($message);

        sendJSON($messages);
    } catch (PDOException $e) {
        // During clone or DB busy: return 200 with empty list so polling does not spam console
        error_log('Chat getMessages: ' . $e->getMessage());
        sendJSON([]);
    } catch (Throwable $e) {
        error_log('Chat getMessages: ' . $e->getMessage());
        sendJSON([]);
    }
}

function handleGetMessage($messageId) {
    try {
        $user = getAuthenticatedUser();
        if (!$user) {
            sendJSON(['error' => 'Authentication required'], 401);
        }
        
        $db = getDB();
        $stmt = $db->prepare('SELECT m.*, r.username AS recipient_username FROM chat_messages m LEFT JOIN users r ON r.id = m.recipient_user_id WHERE m.id = ?');
        $stmt->execute([$messageId]);
        $message = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$message) {
            sendJSON(['error' => 'Message not found'], 404);
        }

        sendJSON(formatChatMessage($message));
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
        
        $messageId = $db->lastInsertId();
        
        // Fetch created message
        $stmt = $db->prepare('SELECT m.*, r.username AS recipient_username FROM chat_messages m LEFT JOIN users r ON r.id = m.recipient_user_id WHERE m.id = ?');
        $stmt->execute([$messageId]);
        $createdMessage = $stmt->fetch(PDO::FETCH_ASSOC);

        sendJSON(formatChatMessage($createdMessage), 201);
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
