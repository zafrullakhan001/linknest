<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

switch ($method) {
    case 'GET':
        if ($path === '' || $path === '/') {
            handleGetArrangement();
        } elseif ($path === '/categories' || $path === '/categories/') {
            handleGetCategoryArrangement();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'POST':
    case 'PUT':
        if ($path === '' || $path === '/') {
            handleSaveArrangement();
        } elseif ($path === '/categories' || $path === '/categories/') {
            handleSaveCategoryArrangement();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleGetArrangement() {
    // Global arrangement - no authentication required
    $db = getDB();
    
    // Get global tile arrangement (user_id IS NULL)
    $stmt = $db->prepare('SELECT tile_id, position, group_name FROM tile_arrangements WHERE user_id IS NULL ORDER BY position ASC');
    $stmt->execute();
    
    $arrangement = [];
    while ($row = $stmt->fetch()) {
        $arrangement[] = [
            'tileId' => $row['tile_id'],
            'position' => (int)$row['position'],
            'groupName' => $row['group_name']
        ];
    }
    
    sendJSON($arrangement);
}

function handleSaveArrangement() {
    // Require authentication to save global arrangement
    $user = requireAuth();
    $data = getJSONInput();
    
    if (!isset($data['arrangement']) || !is_array($data['arrangement'])) {
        sendJSON(['error' => 'Invalid arrangement data'], 400);
    }
    
    $db = getDB();
    $db->beginTransaction();
    
    try {
        // Delete existing global arrangement (user_id IS NULL)
        $deleteStmt = $db->prepare('DELETE FROM tile_arrangements WHERE user_id IS NULL');
        $deleteStmt->execute();
        
        // Insert new global arrangement (user_id IS NULL for global)
        $insertStmt = $db->prepare('INSERT INTO tile_arrangements (user_id, tile_id, position, group_name) VALUES (?, ?, ?, ?)');
        
        foreach ($data['arrangement'] as $item) {
            if (!isset($item['tileId']) || !isset($item['position'])) {
                continue;
            }
            
            // Verify tile exists
            $checkStmt = $db->prepare('SELECT id FROM tiles WHERE id = ?');
            $checkStmt->execute([$item['tileId']]);
            if (!$checkStmt->fetch()) {
                continue; // Skip if tile doesn't exist
            }
            
            $insertStmt->execute([
                null, // NULL for global arrangement
                $item['tileId'],
                (int)$item['position'],
                $item['groupName'] ?? null
            ]);
        }
        
        $db->commit();
        sendJSON(['success' => true]);
        
    } catch (PDOException $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to save arrangement: ' . $e->getMessage()], 500);
    }
}

function handleGetCategoryArrangement() {
    // Global arrangement - no authentication required
    $db = getDB();
    
    // Get global category arrangement (user_id IS NULL)
    $stmt = $db->prepare('SELECT category_name, position FROM category_arrangements WHERE user_id IS NULL ORDER BY position ASC');
    $stmt->execute();
    
    $arrangement = [];
    while ($row = $stmt->fetch()) {
        $arrangement[] = [
            'categoryName' => $row['category_name'],
            'position' => (int)$row['position']
        ];
    }
    
    sendJSON($arrangement);
}

function handleSaveCategoryArrangement() {
    // Require authentication to save global arrangement
    $user = requireAuth();
    $data = getJSONInput();
    
    if (!isset($data['categories']) || !is_array($data['categories'])) {
        sendJSON(['error' => 'Invalid category arrangement data'], 400);
    }
    
    $db = getDB();
    $db->beginTransaction();
    
    try {
        // Delete existing global category arrangement (user_id IS NULL)
        $deleteStmt = $db->prepare('DELETE FROM category_arrangements WHERE user_id IS NULL');
        $deleteStmt->execute();
        
        // Insert new global category arrangement (user_id IS NULL for global)
        $insertStmt = $db->prepare('INSERT INTO category_arrangements (user_id, category_name, position) VALUES (?, ?, ?)');
        
        foreach ($data['categories'] as $item) {
            if (!isset($item['categoryName']) || !isset($item['position'])) {
                continue;
            }
            
            $insertStmt->execute([
                null, // NULL for global arrangement
                $item['categoryName'],
                (int)$item['position']
            ]);
        }
        
        $db->commit();
        sendJSON(['success' => true]);
        
    } catch (PDOException $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to save category arrangement: ' . $e->getMessage()], 500);
    }
}

