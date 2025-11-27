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
        } elseif ($path === '/bulk-import' || $path === '/bulk-import/') {
            handleBulkImport();
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
    // Order ONLY by position - no secondary sorting to preserve exact saved order
    $stmt = $db->prepare('SELECT * FROM tiles ORDER BY position ASC');
    $stmt->execute();
    
    $tiles = [];
    $tilesById = [];
    $positions = [];
    $hasDuplicatePositions = false;
    
    while ($row = $stmt->fetch()) {
        $position = (int)$row['position'];
        
        // Check for duplicate positions
        if (isset($positions[$position])) {
            $hasDuplicatePositions = true;
        }
        $positions[$position] = true;
        
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
            
            // Get links for this section with visibility filtering
            $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ?');
            $linkStmt->execute([$sectionRow['id']]);
            
            while ($linkRow = $linkStmt->fetch()) {
                // Filter links based on visibility
                $visibility = $linkRow['visibility'] ?? 'public';
                $allowedUsers = $linkRow['allowed_users'] ? json_decode($linkRow['allowed_users'], true) : [];
                
                // Check if link should be visible to current user
                // Admin users can see all links regardless of visibility
                $isVisible = false;
                if ($user && $user['is_admin']) {
                    $isVisible = true; // Admins see everything
                } elseif ($visibility === 'public') {
                    $isVisible = true; // Public links visible to everyone
                } elseif ($visibility === 'authenticated' && $user) {
                    $isVisible = true; // Authenticated links visible to logged-in users
                } elseif ($visibility === 'private' && $user) {
                    // Private links visible only to specific users
                    $isVisible = in_array($user['id'], $allowedUsers);
                }
                
                if (!$isVisible) {
                    continue; // Skip this link
                }
                
                $link = [
                    'id' => $linkRow['id'],
                    'label' => $linkRow['label'],
                    'url' => $linkRow['url'],
                    'visibility' => $visibility,
                    'allowedUsers' => $allowedUsers,
                    'notes' => $linkRow['notes'] ?? null,
                    'tooltip' => $linkRow['tooltip'] ?? null
                ];
                
                // Include health data if available
                if (isset($linkRow['health_status'])) {
                    $link['health'] = [
                        'status' => $linkRow['health_status'] ?? 'unknown',
                        'httpCode' => $linkRow['health_http_code'] ? (int)$linkRow['health_http_code'] : null,
                        'error' => $linkRow['health_error'],
                        'checkedAt' => $linkRow['health_checked_at'] ? (int)$linkRow['health_checked_at'] : null
                    ];
                }
                
                $section['links'][] = $link;
            }
            
            $tile['sections'][] = $section;
        }
        
        $tiles[] = $tile;
        $tilesById[$row['id']] = $tile;
    }
    
    // Normalize positions if there are duplicates or all positions are 0
    // This ensures tiles always have unique, sequential positions
    if (($hasDuplicatePositions || (count($positions) === 1 && isset($positions[0]))) && count($tiles) > 0) {
        try {
            $db->beginTransaction();
            $updateStmt = $db->prepare('UPDATE tiles SET position = ? WHERE id = ?');
            foreach ($tiles as $index => $tile) {
                $updateStmt->execute([$index, $tile['id']]);
            }
            $db->commit();
            error_log('Normalized tile positions: assigned sequential positions to ' . count($tiles) . ' tiles');
            
            // Reload tiles with updated positions
            $stmt = $db->prepare('SELECT * FROM tiles ORDER BY position ASC');
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
                    
                    // Get links for this section with visibility filtering
                    $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ?');
                    $linkStmt->execute([$sectionRow['id']]);
                    
                    while ($linkRow = $linkStmt->fetch()) {
                        // Filter links based on visibility
                        $visibility = $linkRow['visibility'] ?? 'public';
                        $allowedUsers = $linkRow['allowed_users'] ? json_decode($linkRow['allowed_users'], true) : [];
                        
                        // Check if link should be visible to current user
                        // Admin users can see all links regardless of visibility
                        $isVisible = false;
                        if ($user && $user['is_admin']) {
                            $isVisible = true; // Admins see everything
                        } elseif ($visibility === 'public') {
                            $isVisible = true;
                        } elseif ($visibility === 'authenticated' && $user) {
                            $isVisible = true;
                        } elseif ($visibility === 'private' && $user) {
                            $isVisible = in_array($user['id'], $allowedUsers);
                        }
                        
                        if (!$isVisible) {
                            continue;
                        }
                        
                        $section['links'][] = [
                            'id' => $linkRow['id'],
                            'label' => $linkRow['label'],
                            'url' => $linkRow['url'],
                            'visibility' => $visibility,
                            'allowedUsers' => $allowedUsers,
                            'notes' => $linkRow['notes'] ?? null
                        ];
                    }
                    
                    $tile['sections'][] = $section;
                }
                
                $tiles[] = $tile;
            }
        } catch (PDOException $e) {
            $db->rollBack();
            error_log('Failed to normalize tile positions: ' . $e->getMessage());
        }
    }
    
    // We now rely on the tiles.position column for ordering.
    // tile_arrangements is still written for compatibility, but not required for reading.
    
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
        
        // Get links with visibility filtering
        $user = getAuthenticatedUser();
        $linkStmt = $db->prepare('SELECT * FROM links WHERE section_id = ?');
        $linkStmt->execute([$sectionRow['id']]);
        
        while ($linkRow = $linkStmt->fetch()) {
            // Filter links based on visibility
            $visibility = $linkRow['visibility'] ?? 'public';
            $allowedUsers = $linkRow['allowed_users'] ? json_decode($linkRow['allowed_users'], true) : [];
            
            // Check if link should be visible to current user
            // Admin users can see all links regardless of visibility
            $isVisible = false;
            if ($user && $user['is_admin']) {
                $isVisible = true; // Admins see everything
            } elseif ($visibility === 'public') {
                $isVisible = true;
            } elseif ($visibility === 'authenticated' && $user) {
                $isVisible = true;
            } elseif ($visibility === 'private' && $user) {
                $isVisible = in_array($user['id'], $allowedUsers);
            }
            
            if (!$isVisible) {
                continue;
            }
            
            $link = [
                'id' => $linkRow['id'],
                'label' => $linkRow['label'],
                'url' => $linkRow['url'],
                'visibility' => $visibility,
                'allowedUsers' => $allowedUsers,
                'notes' => $linkRow['notes'] ?? null
            ];
            
            // Include health data if available
            if (isset($linkRow['health_status'])) {
                $link['health'] = [
                    'status' => $linkRow['health_status'] ?? 'unknown',
                    'httpCode' => $linkRow['health_http_code'] ? (int)$linkRow['health_http_code'] : null,
                    'error' => $linkRow['health_error'],
                    'checkedAt' => $linkRow['health_checked_at'] ? (int)$linkRow['health_checked_at'] : null
                ];
            }
            
            $section['links'][] = $link;
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
                    $visibility = $link['visibility'] ?? 'public';
                    $allowedUsers = isset($link['allowedUsers']) && is_array($link['allowedUsers']) 
                        ? json_encode($link['allowedUsers']) 
                        : null;
                    $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, visibility, allowed_users, notes, tooltip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
                    $linkStmt->execute([
                        $linkId,
                        $sectionId,
                        $link['label'],
                        $link['url'],
                        $visibility,
                        $allowedUsers,
                        $link['notes'] ?? null,
                        $link['tooltip'] ?? null
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
                    $visibility = $link['visibility'] ?? 'public';
                    $allowedUsers = isset($link['allowedUsers']) && is_array($link['allowedUsers']) 
                        ? json_encode($link['allowedUsers']) 
                        : null;
                    $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, visibility, allowed_users, notes, tooltip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
                    $linkStmt->execute([
                        $linkId,
                        $sectionId,
                        $link['label'],
                        $link['url'],
                        $visibility,
                        $allowedUsers,
                        $link['notes'] ?? null,
                        $link['tooltip'] ?? null
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

function handleBulkImport() {
    $user = requireAuth();
    
    // Check if file was uploaded
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        sendJSON(['error' => 'No file uploaded or upload error'], 400);
    }
    
    $file = $_FILES['file'];
    $filePath = $file['tmp_name'];
    
    // Validate file type (CSV)
    $fileExt = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if ($fileExt !== 'csv') {
        sendJSON(['error' => 'Invalid file type. Please upload a CSV file.'], 400);
    }
    
    // Read CSV file
    $csvData = [];
    if (($handle = fopen($filePath, 'r')) !== false) {
        // Read header row
        $headers = fgetcsv($handle);
        if ($headers === false) {
            fclose($handle);
            sendJSON(['error' => 'Invalid CSV file. Could not read header row.'], 400);
        }
        
        // Normalize headers (trim and lowercase for comparison)
        $headers = array_map('trim', $headers);
        $headerMap = [];
        
        // Map of expected header keys to possible variations
        $headerVariations = [
            'tile_title' => ['tile title', 'tile_title', 'tiletitle'],
            'tile_description' => ['tile description', 'tile_description', 'tiledescription'],
            'tile_emoji' => ['tile emoji', 'tile_emoji', 'tileemoji'],
            'tile_theme_color' => ['tile theme color', 'tile_theme_color', 'tilethemecolor', 'tile theme', 'tile_theme'],
            'tile_group' => ['tile group', 'tile_group', 'tilegroup'],
            'section_title' => ['section title', 'section_title', 'sectiontitle'],
            'link_label' => ['link label', 'link_label', 'linklabel'],
            'link_url' => ['link url', 'link_url', 'linkurl'],
            'link_visibility' => ['link visibility', 'link_visibility', 'linkvisibility'],
            'link_notes' => ['link notes', 'link_notes', 'linknotes'],
            'link_tooltip' => ['link tooltip', 'link_tooltip', 'linktooltip']
        ];
        
        // Match headers
        foreach ($headerVariations as $key => $variations) {
            foreach ($headers as $idx => $header) {
                $normalizedHeader = strtolower(preg_replace('/[\s_\-]/', '', $header));
                foreach ($variations as $variation) {
                    $normalizedVariation = strtolower(preg_replace('/[\s_\-]/', '', $variation));
                    if ($normalizedHeader === $normalizedVariation) {
                        $headerMap[$key] = $idx;
                        break 2; // Break out of both loops
                    }
                }
            }
        }
        
        // Check required headers
        if (!isset($headerMap['tile_title']) || !isset($headerMap['link_label']) || !isset($headerMap['link_url'])) {
            fclose($handle);
            sendJSON(['error' => 'CSV file missing required columns: Tile Title, Link Label, Link URL'], 400);
        }
        
        // Read data rows
        $rowNum = 1;
        while (($row = fgetcsv($handle)) !== false) {
            $rowNum++;
            if (count($row) < count($headers)) {
                continue; // Skip incomplete rows
            }
            
            $csvData[] = [
                'tile_title' => isset($headerMap['tile_title']) ? trim($row[$headerMap['tile_title']]) : '',
                'tile_description' => isset($headerMap['tile_description']) ? trim($row[$headerMap['tile_description']]) : '',
                'tile_emoji' => isset($headerMap['tile_emoji']) ? trim($row[$headerMap['tile_emoji']]) : '📁',
                'tile_theme_color' => isset($headerMap['tile_theme_color']) ? trim($row[$headerMap['tile_theme_color']]) : 'blue',
                'tile_group' => isset($headerMap['tile_group']) ? trim($row[$headerMap['tile_group']]) : 'General',
                'section_title' => isset($headerMap['section_title']) ? trim($row[$headerMap['section_title']]) : 'General',
                'link_label' => isset($headerMap['link_label']) ? trim($row[$headerMap['link_label']]) : '',
                'link_url' => isset($headerMap['link_url']) ? trim($row[$headerMap['link_url']]) : '',
                'link_visibility' => isset($headerMap['link_visibility']) ? trim($row[$headerMap['link_visibility']]) : 'public',
                'link_notes' => isset($headerMap['link_notes']) ? trim($row[$headerMap['link_notes']]) : '',
                'link_tooltip' => isset($headerMap['link_tooltip']) ? trim($row[$headerMap['link_tooltip']]) : '',
                'row_num' => $rowNum
            ];
        }
        fclose($handle);
    } else {
        sendJSON(['error' => 'Failed to read CSV file'], 400);
    }
    
    if (empty($csvData)) {
        sendJSON(['error' => 'CSV file is empty or contains no valid data'], 400);
    }
    
    $db = getDB();
    $created = [];
    $errors = [];
    $currentTime = time();
    
    // Get current max position to append new tiles
    $maxPositionStmt = $db->prepare('SELECT MAX(position) as max_pos FROM tiles');
    $maxPositionStmt->execute();
    $maxPosRow = $maxPositionStmt->fetch();
    $nextPosition = ($maxPosRow && $maxPosRow['max_pos'] !== null) ? (int)$maxPosRow['max_pos'] + 1 : 0;
    
    // Group CSV rows by tile and section
    $tilesMap = [];
    foreach ($csvData as $row) {
        // Skip rows with missing required fields
        if (empty($row['tile_title']) || empty($row['link_label']) || empty($row['link_url'])) {
            $errors[] = "Row {$row['row_num']}: Missing required fields (Tile Title, Link Label, or Link URL)";
            continue;
        }
        
        $tileKey = $row['tile_title'] . '|' . ($row['tile_group'] ?: 'General');
        $sectionKey = $row['section_title'] ?: 'General';
        
        if (!isset($tilesMap[$tileKey])) {
            $tilesMap[$tileKey] = [
                'title' => $row['tile_title'],
                'description' => $row['tile_description'],
                'emoji' => $row['tile_emoji'] ?: '📁',
                'themeColor' => $row['tile_theme_color'] ?: 'blue',
                'group' => $row['tile_group'] ?: 'General',
                'sections' => []
            ];
        }
        
        if (!isset($tilesMap[$tileKey]['sections'][$sectionKey])) {
            $tilesMap[$tileKey]['sections'][$sectionKey] = [];
        }
        
        $tilesMap[$tileKey]['sections'][$sectionKey][] = [
            'label' => $row['link_label'],
            'url' => $row['link_url'],
            'visibility' => $row['link_visibility'] ?: 'public',
            'notes' => $row['link_notes'],
            'tooltip' => $row['link_tooltip']
        ];
    }
    
    if (empty($tilesMap)) {
        sendJSON(['error' => 'No valid tiles found in CSV file'], 400);
    }
    
    $db->beginTransaction();
    
    try {
        foreach ($tilesMap as $tileKey => $tileData) {
            try {
                // Generate unique tile ID
                $tileId = uniqid('tile_', true);
                
                // Insert tile
                $stmt = $db->prepare('INSERT INTO tiles (id, user_id, title, description, html_content, emoji, theme_color, "group", position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                
                if (!$stmt->execute([
                    $tileId,
                    $user['id'],
                    $tileData['title'],
                    $tileData['description'],
                    '',
                    $tileData['emoji'],
                    $tileData['themeColor'],
                    $tileData['group'],
                    $nextPosition++,
                    $currentTime
                ])) {
                    $errors[] = "Tile '{$tileData['title']}': Failed to create tile";
                    continue;
                }
                
                // Insert sections and links
                foreach ($tileData['sections'] as $sectionTitle => $links) {
                    $sectionId = uniqid('section_', true);
                    $sectionStmt = $db->prepare('INSERT INTO sections (id, tile_id, title) VALUES (?, ?, ?)');
                    $sectionStmt->execute([
                        $sectionId,
                        $tileId,
                        $sectionTitle
                    ]);
                    
                    foreach ($links as $link) {
                        $linkId = uniqid('link_', true);
                        $linkStmt = $db->prepare('INSERT INTO links (id, section_id, label, url, visibility, allowed_users, notes, tooltip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
                        $linkStmt->execute([
                            $linkId,
                            $sectionId,
                            $link['label'],
                            $link['url'],
                            $link['visibility'],
                            null,
                            $link['notes'] ?: null,
                            $link['tooltip'] ?: null
                        ]);
                    }
                }
                
                $created[] = [
                    'id' => $tileId,
                    'title' => $tileData['title']
                ];
                
            } catch (Exception $e) {
                $errors[] = "Tile '{$tileData['title']}': " . $e->getMessage();
                error_log('Bulk import error for tile: ' . $tileData['title'] . ' - ' . $e->getMessage());
            }
        }
        
        $db->commit();
        
        sendJSON([
            'success' => true,
            'created' => count($created),
            'errors' => count($errors),
            'createdTiles' => $created,
            'errorMessages' => $errors
        ], 201);
        
    } catch (Exception $e) {
        $db->rollBack();
        error_log('Bulk import transaction failed: ' . $e->getMessage());
        sendJSON(['error' => 'Bulk import failed: ' . $e->getMessage()], 500);
    }
}
