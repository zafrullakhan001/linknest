<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

switch ($method) {
    case 'GET':
        if ($path === '' || $path === '/') {
            handleGetTiles();
        } elseif (preg_match('#^/([^/]+)$#', $path, $matches)) {
            handleGetTile($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'POST':
        if ($path === '' || $path === '/') {
            handleCreateTile();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'PUT':
        if (preg_match('#^/([^/]+)$#', $path, $matches)) {
            handleUpdateTile($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'DELETE':
        if (preg_match('#^/([^/]+)$#', $path, $matches)) {
            handleDeleteTile($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleGetTiles() {
    $user = getAuthenticatedUser();
    $db = getDB();
    
    if ($user) {
        // Authenticated: get user's tiles
        $stmt = $db->prepare('SELECT * FROM tiles WHERE user_id = ? ORDER BY created_at DESC');
        $stmt->bindValue(1, $user['id'], SQLITE3_INTEGER);
    } else {
        // Guest: get all public tiles (all tiles for now, can be filtered later)
        $stmt = $db->prepare('SELECT * FROM tiles ORDER BY created_at DESC');
    }
    
    $result = $stmt->execute();
    $tiles = [];
    
    while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
        $tile = [
            'id' => $row['id'],
            'title' => $row['title'],
            'description' => $row['description'],
            'htmlContent' => $row['html_content'],
            'emoji' => $row['emoji'],
            'themeColor' => $row['theme_color'],
            'group' => $row['group'],
            'createdAt' => (int)$row['created_at'],
            'sections' => []
        ];
        
        // Get sections for this tile
        $sectionStmt = $db->prepare('SELECT * FROM sections WHERE tile_id = ?');
        $sectionStmt->bindValue(1, $row['id'], SQLITE3_TEXT);
        $sectionResult = $sectionStmt->execute();
        
        while ($sectionRow = $sectionResult->fetchArray(SQLITE3_ASSOC)) {
            $section = [
                'id' => $sectionRow['id'],
                'title' => $sectionRow['title'],
                'links' => []
            ];
            
            // Get links for this section
            $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ?');
            $linkStmt->bindValue(1, $sectionRow['id'], SQLITE3_TEXT);
            $linkResult = $linkStmt->execute();
            
            while ($linkRow = $linkResult->fetchArray(SQLITE3_ASSOC)) {
                $section['links'][] = [
                    'id' => $linkRow['id'],
                    'label' => $linkRow['label'],
                    'url' => $linkRow['url']
                ];
            }
            
            $tile['sections'][] = $section;
        }
        
        $tiles[] = $tile;
    }
    
    sendJSON($tiles);
}

function handleGetTile($tileId) {
    $db = getDB();
    $stmt = $db->prepare('SELECT * FROM tiles WHERE id = ?');
    $stmt->bindValue(1, $tileId, SQLITE3_TEXT);
    $result = $stmt->execute();
    $row = $result->fetchArray(SQLITE3_ASSOC);
    
    if (!$row) {
        sendJSON(['error' => 'Tile not found'], 404);
    }
    
    $tile = [
        'id' => $row['id'],
        'title' => $row['title'],
        'description' => $row['description'],
        'htmlContent' => $row['html_content'],
        'emoji' => $row['emoji'],
        'themeColor' => $row['theme_color'],
        'group' => $row['group'],
        'createdAt' => (int)$row['created_at'],
        'sections' => []
    ];
    
    // Get sections
    $sectionStmt = $db->prepare('SELECT * FROM sections WHERE tile_id = ?');
    $sectionStmt->bindValue(1, $tileId, SQLITE3_TEXT);
    $sectionResult = $sectionStmt->execute();
    
    while ($sectionRow = $sectionResult->fetchArray(SQLITE3_ASSOC)) {
        $section = [
            'id' => $sectionRow['id'],
            'title' => $sectionRow['title'],
            'links' => []
        ];
        
        // Get links
        $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ?');
        $linkStmt->bindValue(1, $sectionRow['id'], SQLITE3_TEXT);
        $linkResult = $linkStmt->execute();
        
        while ($linkRow = $linkResult->fetchArray(SQLITE3_ASSOC)) {
            $section['links'][] = [
                'id' => $linkRow['id'],
                'label' => $linkRow['label'],
                'url' => $linkRow['url']
            ];
        }
        
        $tile['sections'][] = $section;
    }
    
    sendJSON($tile);
}

function handleCreateTile() {
    $user = requireAuth();
    $data = getJSONInput();
    
    if (!isset($data['title'])) {
        sendJSON(['error' => 'Title is required'], 400);
    }
    
    $db = getDB();
    $tileId = $data['id'] ?? uniqid('tile_', true);
    
    $stmt = $db->prepare('INSERT INTO tiles (id, user_id, title, description, html_content, emoji, theme_color, "group", created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->bindValue(1, $tileId, SQLITE3_TEXT);
    $stmt->bindValue(2, $user['id'], SQLITE3_INTEGER);
    $stmt->bindValue(3, $data['title'], SQLITE3_TEXT);
    $stmt->bindValue(4, $data['description'] ?? '', SQLITE3_TEXT);
    $stmt->bindValue(5, $data['htmlContent'] ?? '', SQLITE3_TEXT);
    $stmt->bindValue(6, $data['emoji'] ?? '📁', SQLITE3_TEXT);
    $stmt->bindValue(7, $data['themeColor'] ?? 'blue', SQLITE3_TEXT);
    $stmt->bindValue(8, $data['group'] ?? 'General', SQLITE3_TEXT);
    $stmt->bindValue(9, $data['createdAt'] ?? time(), SQLITE3_INTEGER);
    
    if (!$stmt->execute()) {
        sendJSON(['error' => 'Failed to create tile'], 500);
    }
    
    // Insert sections and links
    if (isset($data['sections']) && is_array($data['sections'])) {
        foreach ($data['sections'] as $section) {
            $sectionId = $section['id'] ?? uniqid('section_', true);
            $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, title) VALUES (?, ?, ?)');
            $sectionStmt->bindValue(1, $sectionId, SQLITE3_TEXT);
            $sectionStmt->bindValue(2, $tileId, SQLITE3_TEXT);
            $sectionStmt->bindValue(3, $section['title'] ?? '', SQLITE3_TEXT);
            $sectionStmt->execute();
            
            if (isset($section['links']) && is_array($section['links'])) {
                foreach ($section['links'] as $link) {
                    $linkId = $link['id'] ?? uniqid('link_', true);
                    $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url) VALUES (?, ?, ?, ?)');
                    $linkStmt->bindValue(1, $linkId, SQLITE3_TEXT);
                    $linkStmt->bindValue(2, $sectionId, SQLITE3_TEXT);
                    $linkStmt->bindValue(3, $link['label'], SQLITE3_TEXT);
                    $linkStmt->bindValue(4, $link['url'], SQLITE3_TEXT);
                    $linkStmt->execute();
                }
            }
        }
    }
    
    sendJSON(['success' => true, 'id' => $tileId], 201);
}

function handleUpdateTile($tileId) {
    $user = requireAuth();
    $data = getJSONInput();
    
    $db = getDB();
    
    // Verify ownership
    $checkStmt = $db->prepare('SELECT user_id FROM tiles WHERE id = ?');
    $checkStmt->bindValue(1, $tileId, SQLITE3_TEXT);
    $checkResult = $checkStmt->execute();
    $tile = $checkResult->fetchArray(SQLITE3_ASSOC);
    
    if (!$tile) {
        sendJSON(['error' => 'Tile not found'], 404);
    }
    
    if ($tile['user_id'] != $user['id']) {
        sendJSON(['error' => 'Unauthorized'], 403);
    }
    
    // Update tile
    $stmt = $db->prepare('UPDATE tiles SET title = ?, description = ?, html_content = ?, emoji = ?, theme_color = ?, "group" = ? WHERE id = ?');
    $stmt->bindValue(1, $data['title'] ?? '', SQLITE3_TEXT);
    $stmt->bindValue(2, $data['description'] ?? '', SQLITE3_TEXT);
    $stmt->bindValue(3, $data['htmlContent'] ?? '', SQLITE3_TEXT);
    $stmt->bindValue(4, $data['emoji'] ?? '📁', SQLITE3_TEXT);
    $stmt->bindValue(5, $data['themeColor'] ?? 'blue', SQLITE3_TEXT);
    $stmt->bindValue(6, $data['group'] ?? 'General', SQLITE3_TEXT);
    $stmt->bindValue(7, $tileId, SQLITE3_TEXT);
    $stmt->execute();
    
    // Delete existing sections and links
    $db->exec('DELETE FROM links WHERE section_id IN (SELECT id FROM sections WHERE tile_id = "' . $db->escapeString($tileId) . '")');
    $db->exec('DELETE FROM sections WHERE tile_id = "' . $db->escapeString($tileId) . '"');
    
    // Insert new sections and links
    if (isset($data['sections']) && is_array($data['sections'])) {
        foreach ($data['sections'] as $section) {
            $sectionId = $section['id'] ?? uniqid('section_', true);
            $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, title) VALUES (?, ?, ?)');
            $sectionStmt->bindValue(1, $sectionId, SQLITE3_TEXT);
            $sectionStmt->bindValue(2, $tileId, SQLITE3_TEXT);
            $sectionStmt->bindValue(3, $section['title'] ?? '', SQLITE3_TEXT);
            $sectionStmt->execute();
            
            if (isset($section['links']) && is_array($section['links'])) {
                foreach ($section['links'] as $link) {
                    $linkId = $link['id'] ?? uniqid('link_', true);
                    $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url) VALUES (?, ?, ?, ?)');
                    $linkStmt->bindValue(1, $linkId, SQLITE3_TEXT);
                    $linkStmt->bindValue(2, $sectionId, SQLITE3_TEXT);
                    $linkStmt->bindValue(3, $link['label'], SQLITE3_TEXT);
                    $linkStmt->bindValue(4, $link['url'], SQLITE3_TEXT);
                    $linkStmt->execute();
                }
            }
        }
    }
    
    sendJSON(['success' => true]);
}

function handleDeleteTile($tileId) {
    $user = requireAuth();
    $db = getDB();
    
    // Verify ownership
    $checkStmt = $db->prepare('SELECT user_id FROM tiles WHERE id = ?');
    $checkStmt->bindValue(1, $tileId, SQLITE3_TEXT);
    $checkResult = $checkStmt->execute();
    $tile = $checkResult->fetchArray(SQLITE3_ASSOC);
    
    if (!$tile) {
        sendJSON(['error' => 'Tile not found'], 404);
    }
    
    if ($tile['user_id'] != $user['id']) {
        sendJSON(['error' => 'Unauthorized'], 403);
    }
    
    // Delete tile (cascade will delete sections and links)
    $stmt = $db->prepare('DELETE FROM tiles WHERE id = ?');
    $stmt->bindValue(1, $tileId, SQLITE3_TEXT);
    $stmt->execute();
    
    sendJSON(['success' => true]);
}

