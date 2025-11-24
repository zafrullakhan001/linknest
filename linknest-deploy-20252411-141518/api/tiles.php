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
    
    // All users (authenticated and guests) see all tiles - shared public repository
    $stmt = $db->prepare('SELECT * FROM tiles ORDER BY created_at DESC');
    $stmt->execute();
    
    $tiles = [];
    
    while ($row = $stmt->fetch()) {
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
        $sectionStmt->execute([$row['id']]);
        
        while ($sectionRow = $sectionStmt->fetch()) {
            $section = [
                'id' => $sectionRow['id'],
                'title' => $sectionRow['title'],
                'links' => []
            ];
            
            // Get links for this section
            $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ?');
            $linkStmt->execute([$sectionRow['id']]);
            
            while ($linkRow = $linkStmt->fetch()) {
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
    $stmt->execute([$tileId]);
    $row = $stmt->fetch();
    
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
    $sectionStmt->execute([$tileId]);
    
    while ($sectionRow = $sectionStmt->fetch()) {
        $section = [
            'id' => $sectionRow['id'],
            'title' => $sectionRow['title'],
            'links' => []
        ];
        
        // Get links
        $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ?');
        $linkStmt->execute([$sectionRow['id']]);
        
        while ($linkRow = $linkStmt->fetch()) {
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
    
    if (!$stmt->execute([
        $tileId,
        $user['id'],
        $data['title'],
        $data['description'] ?? '',
        $data['htmlContent'] ?? '',
        $data['emoji'] ?? '📁',
        $data['themeColor'] ?? 'blue',
        $data['group'] ?? 'General',
        $data['createdAt'] ?? time()
    ])) {
        sendJSON(['error' => 'Failed to create tile'], 500);
    }
    
    // Insert sections and links
    if (isset($data['sections']) && is_array($data['sections'])) {
        foreach ($data['sections'] as $section) {
            $sectionId = $section['id'] ?? uniqid('section_', true);
            $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, title) VALUES (?, ?, ?)');
            $sectionStmt->execute([
                $sectionId,
                $tileId,
                $section['title'] ?? ''
            ]);
            
            if (isset($section['links']) && is_array($section['links'])) {
                foreach ($section['links'] as $link) {
                    $linkId = $link['id'] ?? uniqid('link_', true);
                    $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url) VALUES (?, ?, ?, ?)');
                    $linkStmt->execute([
                        $linkId,
                        $sectionId,
                        $link['label'],
                        $link['url']
                    ]);
                }
            }
        }
    }
    
    sendJSON(['success' => true, 'id' => $tileId], 201);
}

function handleUpdateTile($tileId) {
    $user = requireAuth(); // Any authenticated user can edit any tile
    $data = getJSONInput();
    
    $db = getDB();
    
    // Verify tile exists
    $checkStmt = $db->prepare('SELECT id FROM tiles WHERE id = ?');
    $checkStmt->execute([$tileId]);
    $tile = $checkStmt->fetch();
    
    if (!$tile) {
        sendJSON(['error' => 'Tile not found'], 404);
    }
    
    // All authenticated users can edit any tile - shared public repository
    
    // Update tile
    $stmt = $db->prepare('UPDATE tiles SET title = ?, description = ?, html_content = ?, emoji = ?, theme_color = ?, "group" = ? WHERE id = ?');
    $stmt->execute([
        $data['title'] ?? '',
        $data['description'] ?? '',
        $data['htmlContent'] ?? '',
        $data['emoji'] ?? '📁',
        $data['themeColor'] ?? 'blue',
        $data['group'] ?? 'General',
        $tileId
    ]);
    
    // Delete existing sections and links
    $deleteLinksStmt = $db->prepare('DELETE FROM links WHERE section_id IN (SELECT id FROM sections WHERE tile_id = ?)');
    $deleteLinksStmt->execute([$tileId]);
    
    $deleteSectionsStmt = $db->prepare('DELETE FROM sections WHERE tile_id = ?');
    $deleteSectionsStmt->execute([$tileId]);
    
    // Insert new sections and links
    if (isset($data['sections']) && is_array($data['sections'])) {
        foreach ($data['sections'] as $section) {
            $sectionId = $section['id'] ?? uniqid('section_', true);
            $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, title) VALUES (?, ?, ?)');
            $sectionStmt->execute([
                $sectionId,
                $tileId,
                $section['title'] ?? ''
            ]);
            
            if (isset($section['links']) && is_array($section['links'])) {
                foreach ($section['links'] as $link) {
                    $linkId = $link['id'] ?? uniqid('link_', true);
                    $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url) VALUES (?, ?, ?, ?)');
                    $linkStmt->execute([
                        $linkId,
                        $sectionId,
                        $link['label'],
                        $link['url']
                    ]);
                }
            }
        }
    }
    
    sendJSON(['success' => true]);
}

function handleDeleteTile($tileId) {
    $user = requireAuth(); // Any authenticated user can delete any tile
    $db = getDB();
    
    // Verify tile exists
    $checkStmt = $db->prepare('SELECT id FROM tiles WHERE id = ?');
    $checkStmt->execute([$tileId]);
    $tile = $checkStmt->fetch();
    
    if (!$tile) {
        sendJSON(['error' => 'Tile not found'], 404);
    }
    
    // All authenticated users can delete any tile - shared public repository
    
    // Delete tile (cascade will delete sections and links)
    $stmt = $db->prepare('DELETE FROM tiles WHERE id = ?');
    $stmt->execute([$tileId]);
    
    sendJSON(['success' => true]);
}
