<?php
require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

requireAuth(); // Only logged in users can access notes

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

// Normalize path - remove trailing slash for consistent matching
$path = rtrim($path, '/');
if (empty($path)) {
    $path = '/';
}

$userId = $_SESSION['user_id'] ?? null;
if (!$userId) {
    sendJSON(['error' => 'Unauthorized'], 401);
}

$db = getDB();

switch ($method) {
    case 'GET':
        if ($path === '' || $path === '/') {
            handleGetNotes($db, $userId);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'POST':
        if ($path === '' || $path === '/') {
            handleCreateNote($db, $userId);
        } elseif (preg_match('/^\/tabs\/(.+)$/', $path, $matches)) {
            handleCreateTab($db, $userId, $matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'PUT':
        if (preg_match('/^\/(\d+)$/', $path, $matches)) {
            handleUpdateNote($db, $userId, (int)$matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'DELETE':
        if (preg_match('/^\/(\d+)$/', $path, $matches)) {
            handleDeleteNote($db, $userId, (int)$matches[1]);
        } elseif (preg_match('/^\/tabs\/(.+)$/', $path, $matches)) {
            handleDeleteTab($db, $userId, $matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleGetNotes($db, $userId) {
    try {
        // Get all notes for the user, grouped by tab
        $stmt = $db->prepare('SELECT id, tab_name, content, position, created_at, updated_at FROM user_notes WHERE user_id = ? ORDER BY tab_name, position, created_at');
        $stmt->execute([$userId]);
        $notes = $stmt->fetchAll();
        
        // Get unique tab names
        $stmt = $db->prepare('SELECT DISTINCT tab_name FROM user_notes WHERE user_id = ? ORDER BY tab_name');
        $stmt->execute([$userId]);
        $tabs = $stmt->fetchAll(PDO::FETCH_COLUMN);
        
        // If no tabs exist, create a default "General" tab
        if (empty($tabs)) {
            $tabs = ['General'];
        }
        
        // Group notes by tab
        $notesByTab = [];
        foreach ($notes as $note) {
            $tabName = $note['tab_name'];
            if (!isset($notesByTab[$tabName])) {
                $notesByTab[$tabName] = [];
            }
            $notesByTab[$tabName][] = [
                'id' => (int)$note['id'],
                'content' => $note['content'],
                'position' => (int)$note['position'],
                'created_at' => (int)$note['created_at'],
                'updated_at' => (int)$note['updated_at'],
            ];
        }
        
        sendJSON([
            'tabs' => $tabs,
            'notes' => $notesByTab
        ]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to fetch notes: ' . $e->getMessage()], 500);
    }
}

function handleCreateNote($db, $userId) {
    $data = getJSONInput();
    $tabName = $data['tab_name'] ?? 'General';
    $content = $data['content'] ?? '';
    
    if (empty($content)) {
        sendJSON(['error' => 'Note content cannot be empty'], 400);
    }
    
    try {
        // Get max position for this tab
        $stmt = $db->prepare('SELECT MAX(position) FROM user_notes WHERE user_id = ? AND tab_name = ?');
        $stmt->execute([$userId, $tabName]);
        $maxPosition = $stmt->fetchColumn() ?? -1;
        $newPosition = $maxPosition + 1;
        
        $now = time();
        $stmt = $db->prepare('INSERT INTO user_notes (user_id, tab_name, content, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
        $stmt->execute([$userId, $tabName, $content, $newPosition, $now, $now]);
        
        $noteId = $db->lastInsertId();
        
        sendJSON([
            'success' => true,
            'note' => [
                'id' => (int)$noteId,
                'tab_name' => $tabName,
                'content' => $content,
                'position' => $newPosition,
                'created_at' => $now,
                'updated_at' => $now,
            ]
        ]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to create note: ' . $e->getMessage()], 500);
    }
}

function handleUpdateNote($db, $userId, $noteId) {
    $data = getJSONInput();
    $content = $data['content'] ?? null;
    $tabName = $data['tab_name'] ?? null;
    
    try {
        // Verify note belongs to user
        $stmt = $db->prepare('SELECT id FROM user_notes WHERE id = ? AND user_id = ?');
        $stmt->execute([$noteId, $userId]);
        if (!$stmt->fetch()) {
            sendJSON(['error' => 'Note not found'], 404);
        }
        
        $updates = [];
        $params = [];
        
        if ($content !== null) {
            $updates[] = 'content = ?';
            $params[] = $content;
        }
        
        if ($tabName !== null) {
            $updates[] = 'tab_name = ?';
            $params[] = $tabName;
        }
        
        if (empty($updates)) {
            sendJSON(['error' => 'No fields to update'], 400);
        }
        
        $updates[] = 'updated_at = ?';
        $params[] = time();
        $params[] = $noteId;
        $params[] = $userId;
        
        $stmt = $db->prepare('UPDATE user_notes SET ' . implode(', ', $updates) . ' WHERE id = ? AND user_id = ?');
        $stmt->execute($params);
        
        sendJSON(['success' => true]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to update note: ' . $e->getMessage()], 500);
    }
}

function handleDeleteNote($db, $userId, $noteId) {
    try {
        $stmt = $db->prepare('DELETE FROM user_notes WHERE id = ? AND user_id = ?');
        $stmt->execute([$noteId, $userId]);
        
        if ($stmt->rowCount() === 0) {
            sendJSON(['error' => 'Note not found'], 404);
        }
        
        sendJSON(['success' => true]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to delete note: ' . $e->getMessage()], 500);
    }
}

function handleCreateTab($db, $userId, $tabName) {
    // Tab is created automatically when a note is added to it
    // This endpoint can be used to verify/create empty tab
    try {
        // Check if tab already exists
        $stmt = $db->prepare('SELECT COUNT(*) FROM user_notes WHERE user_id = ? AND tab_name = ?');
        $stmt->execute([$userId, $tabName]);
        $exists = $stmt->fetchColumn() > 0;
        
        sendJSON([
            'success' => true,
            'tab_name' => $tabName,
            'exists' => $exists
        ]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to create tab: ' . $e->getMessage()], 500);
    }
}

function handleDeleteTab($db, $userId, $tabName) {
    try {
        // Delete all notes in this tab
        $stmt = $db->prepare('DELETE FROM user_notes WHERE user_id = ? AND tab_name = ?');
        $stmt->execute([$userId, $tabName]);
        
        sendJSON(['success' => true, 'deleted_count' => $stmt->rowCount()]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to delete tab: ' . $e->getMessage()], 500);
    }
}
