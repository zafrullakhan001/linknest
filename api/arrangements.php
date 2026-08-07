<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';
$path = $path === '' ? '/' : ('/' . ltrim($path, '/'));

switch ($method) {
    case 'GET':
        if ($path === '/' || $path === '') {
            handleGetArrangement();
        } elseif ($path === '/categories' || $path === '/categories/') {
            handleGetCategoryArrangement();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'POST':
    case 'PUT':
        if ($path === '/' || $path === '') {
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
    
    // Get global tile arrangement (user_id = 0 for global)
    $stmt = $db->prepare('SELECT tile_id, position, group_name FROM tile_arrangements WHERE user_id = 0 ORDER BY position ASC');
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
    $data = getJSONInput();
    
    if (!isset($data['arrangement']) || !is_array($data['arrangement'])) {
        sendJSON(['error' => 'Invalid arrangement data'], 400);
    }
    
    $scope = isset($data['scope']) && $data['scope'] === 'private' ? 'private' : 'global';
    
    if ($scope === 'private') {
        handleSavePrivateArrangement($data['arrangement']);
        return;
    }
    
    // Global arrangement: require admin access
    requireAdmin();
    $db = getDB();
    
    // Ensure the table exists with correct schema
    try {
        $db->exec('CREATE TABLE IF NOT EXISTS tile_arrangements (
            user_id INTEGER NOT NULL DEFAULT 0,
            tile_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            group_name TEXT,
            PRIMARY KEY (user_id, tile_id),
            FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE
        )');
    } catch (PDOException $e) {
        // Table might already exist, that's fine
        error_log('Table creation check: ' . $e->getMessage());
    }
    
    $db->beginTransaction();
    
    try {
        // Delete existing global arrangement (user_id = 0 for global)
        $deleteStmt = $db->prepare('DELETE FROM tile_arrangements WHERE user_id = 0');
        $deleteStmt->execute();
        
        // Insert new global arrangement (user_id = 0 for global)
        // Using INSERT OR REPLACE to handle any conflicts
        // Using 0 instead of NULL because SQLite doesn't allow NULL in composite PRIMARY KEY
        $insertStmt = $db->prepare('INSERT OR REPLACE INTO tile_arrangements (user_id, tile_id, position, group_name) VALUES (?, ?, ?, ?)');
        
        // Also persist order and group directly on tiles table so /tiles can read it
        $updateTileStmt = $db->prepare('UPDATE tiles SET "group" = ?, position = ? WHERE id = ?');
        
        $count = 0;
        
        foreach ($data['arrangement'] as $item) {
            if (!isset($item['tileId']) || !isset($item['position'])) {
                continue;
            }
            
            $tileId = $item['tileId'];
            $position = (int)$item['position'];
            $groupName = $item['groupName'] ?? 'General';
            
            // Verify tile exists
            $checkStmt = $db->prepare('SELECT id FROM tiles WHERE id = ?');
            $checkStmt->execute([$tileId]);
            if (!$checkStmt->fetch()) {
                error_log('Tile not found: ' . $tileId);
                continue; // Skip if tile doesn't exist
            }
            
            try {
                // Save to tile_arrangements for backwards compatibility
                $insertStmt->execute([
                    0, // 0 for global arrangement (SQLite doesn't allow NULL in PRIMARY KEY)
                    $tileId,
                    $position,
                    $groupName
                ]);
                
                // Also persist order and group directly on tiles table
                $updateTileStmt->execute([
                    $groupName,
                    $position,
                    $tileId
                ]);
                
                $count++;
            } catch (PDOException $e) {
                error_log('Failed to save tile arrangement for tile: ' . $tileId . ' - ' . $e->getMessage());
                error_log('Error details: ' . print_r($e->errorInfo, true));
                // Continue with other tiles even if one fails
            }
        }
        
        // Ensure all positions are sequential and unique based on the saved arrangement
        // This prevents any gaps or duplicates that could cause ordering issues
        $updatePositionStmt = $db->prepare('UPDATE tiles SET position = ? WHERE id = ?');
        $savedTileIds = [];
        
        // First, collect all tile IDs in the order they were saved
        foreach ($data['arrangement'] as $item) {
            if (isset($item['tileId'])) {
                $savedTileIds[] = $item['tileId'];
            }
        }
        
        // Assign sequential positions (0, 1, 2, ...) based on saved order
        foreach ($savedTileIds as $index => $tileId) {
            $updatePositionStmt->execute([$index, $tileId]);
        }
        
        // Handle any tiles that weren't in the arrangement (shouldn't happen, but safety check)
        $allTilesStmt = $db->prepare('SELECT id FROM tiles');
        $allTilesStmt->execute();
        $allTiles = $allTilesStmt->fetchAll();
        $savedTileIdsSet = array_flip($savedTileIds);
        
        $nextPosition = count($savedTileIds);
        foreach ($allTiles as $tileRow) {
            if (!isset($savedTileIdsSet[$tileRow['id']])) {
                // Tile wasn't in arrangement, assign it a position after all saved tiles
                $updatePositionStmt->execute([$nextPosition, $tileRow['id']]);
                $nextPosition++;
            }
        }
        
        $db->commit();
        
        // Log success
        error_log('Successfully saved ' . $count . ' tile arrangements (and updated tiles.position)');
        error_log('Normalized all tile positions to be sequential (0, 1, 2, ...)');
        
        invalidateGuestTilesListCache();
        sendJSON(['success' => true, 'count' => $count]);
        
    } catch (PDOException $e) {
        $db->rollBack();
        $errorMsg = $e->getMessage();
        $errorCode = $e->getCode();
        $errorInfo = $e->errorInfo ?? [];
        error_log('Tile arrangement save error: ' . $errorMsg);
        error_log('Error code: ' . $errorCode);
        error_log('Error info: ' . print_r($errorInfo, true));
        
        sendJSON([
            'error' => 'Failed to save tile arrangement',
            'details' => $errorMsg,
            'code' => $errorCode
        ], 500);
    } catch (Exception $e) {
        $db->rollBack();
        error_log('Tile arrangement save error (non-PDO): ' . $e->getMessage());
        sendJSON(['error' => 'Failed to save tile arrangement: ' . $e->getMessage()], 500);
    }
}

/**
 * Save arrangement for private tab: only tiles owned by the current user.
 * Requires authentication (not admin). Updates only those tiles' group/position.
 */
function handleSavePrivateArrangement(array $arrangement) {
    $user = requireAuth();
    $db = getDB();
    
    // Ensure the table exists with correct schema
    try {
        $db->exec('CREATE TABLE IF NOT EXISTS tile_arrangements (
            user_id INTEGER NOT NULL DEFAULT 0,
            tile_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            group_name TEXT,
            PRIMARY KEY (user_id, tile_id),
            FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE
        )');
    } catch (PDOException $e) {
        error_log('Table creation check: ' . $e->getMessage());
    }
    
    $userId = (int) $user['id'];
    $checkStmt = $db->prepare('SELECT id, user_id FROM tiles WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL');
    $updateTileStmt = $db->prepare('UPDATE tiles SET "group" = ?, position = ? WHERE id = ? AND user_id = ?');
    
    $owned = [];
    foreach ($arrangement as $item) {
        if (!isset($item['tileId']) || !isset($item['position'])) {
            continue;
        }
        $tileId = $item['tileId'];
        $checkStmt->execute([$tileId]);
        $row = $checkStmt->fetch();
        if (!$row) {
            error_log('Private arrangement: tile not found or deleted/archived: ' . $tileId);
            continue;
        }
        if (!isset($row['user_id']) || (int) $row['user_id'] !== $userId) {
            sendJSON(['error' => 'Only your own private tiles can be reordered within the Private tab.'], 403);
            return;
        }
        $owned[] = [
            'tileId' => $tileId,
            'position' => (int) $item['position'],
            'groupName' => $item['groupName'] ?? 'General',
        ];
    }
    
    $db->beginTransaction();
    try {
        $deleteStmt = $db->prepare('DELETE FROM tile_arrangements WHERE user_id = ?');
        $deleteStmt->execute([$userId]);
        
        $insertStmt = $db->prepare('INSERT OR REPLACE INTO tile_arrangements (user_id, tile_id, position, group_name) VALUES (?, ?, ?, ?)');
        $count = 0;
        foreach ($owned as $idx => $item) {
            $insertStmt->execute([$userId, $item['tileId'], $idx, $item['groupName']]);
            $updateTileStmt->execute([$item['groupName'], $idx, $item['tileId'], $userId]);
            $count++;
        }
        $db->commit();
        sendJSON(['success' => true, 'count' => $count]);
    } catch (PDOException $e) {
        $db->rollBack();
        error_log('Private arrangement save error: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to save tile arrangement', 'details' => $e->getMessage()], 500);
    } catch (Exception $e) {
        $db->rollBack();
        error_log('Private arrangement save error (non-PDO): ' . $e->getMessage());
        sendJSON(['error' => 'Failed to save tile arrangement: ' . $e->getMessage()], 500);
    }
}

function handleGetCategoryArrangement() {
    // Global arrangement - no authentication required
    try {
        $db = getDB();
        
        // Check if table exists, create if it doesn't
        try {
            $tableCheck = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='category_arrangements'");
            $tableExists = false;
            if ($tableCheck) {
                $result = $tableCheck->fetchColumn();
                $tableExists = ($result !== false);
            }
            
            if (!$tableExists) {
                // Table doesn't exist, create it
                $db->exec('CREATE TABLE IF NOT EXISTS category_arrangements (
                    user_id INTEGER NOT NULL DEFAULT 0,
                    category_name TEXT NOT NULL,
                    position INTEGER NOT NULL,
                    visible_from TEXT,
                    expires_at TEXT,
                    PRIMARY KEY (user_id, category_name)
                )');
            }
        } catch (PDOException $tableError) {
            error_log("Category arrangement: Table check/create error: " . $tableError->getMessage());
            // Try to create table anyway
            try {
                $db->exec('CREATE TABLE IF NOT EXISTS category_arrangements (
                    user_id INTEGER NOT NULL DEFAULT 0,
                    category_name TEXT NOT NULL,
                    position INTEGER NOT NULL,
                    visible_from TEXT,
                    expires_at TEXT,
                    PRIMARY KEY (user_id, category_name)
                )');
            } catch (PDOException $createError) {
                error_log("Category arrangement: Failed to create table: " . $createError->getMessage());
            }
        }
        
        // Get global category arrangement (user_id = 0 for global)
        $stmt = $db->prepare('SELECT category_name, position, visible_from, expires_at FROM category_arrangements WHERE user_id = 0 ORDER BY position ASC');
        if ($stmt) {
            $stmt->execute();
            
            $arrangement = [];
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $arrangement[] = [
                    'categoryName' => $row['category_name'],
                    'position' => (int)$row['position'],
                    'visibleFrom' => $row['visible_from'] ?: null,
                    'expiresAt' => $row['expires_at'] ?: null
                ];
            }
            
            sendJSON($arrangement);
        } else {
            // If prepare failed, return empty array
            error_log("Category arrangement: Failed to prepare statement");
            sendJSON([]);
        }
        
    } catch (PDOException $e) {
        error_log("Category arrangement PDO error: " . $e->getMessage() . " | Code: " . $e->getCode());
        error_log("Category arrangement error trace: " . $e->getTraceAsString());
        // Return empty array on error instead of crashing
        sendJSON([]);
    } catch (Exception $e) {
        error_log("Category arrangement error: " . $e->getMessage() . " | File: " . $e->getFile() . " | Line: " . $e->getLine());
        error_log("Category arrangement error trace: " . $e->getTraceAsString());
        sendJSON([]);
    } catch (Throwable $e) {
        error_log("Category arrangement fatal error: " . $e->getMessage() . " | File: " . $e->getFile() . " | Line: " . $e->getLine());
        error_log("Category arrangement error trace: " . $e->getTraceAsString());
        sendJSON([]);
    }
}

function handleSaveCategoryArrangement() {
    // Require admin access to save global category arrangement
    requireAdmin();
    $data = getJSONInput();
    
    if (!isset($data['categories']) || !is_array($data['categories'])) {
        sendJSON(['error' => 'Invalid category arrangement data'], 400);
    }
    
    $db = getDB();
    
    // First, check and fix table structure if needed (before transaction)
    try {
        // Check if table has any foreign keys (it shouldn't)
        $foreignKeys = $db->query("PRAGMA foreign_key_list(category_arrangements)")->fetchAll();
        if (!empty($foreignKeys)) {
            // Table has foreign keys - this is wrong, recreate it
            error_log('category_arrangements table has foreign keys - recreating without them');
            $db->exec('DROP TABLE IF EXISTS category_arrangements');
            $db->exec('CREATE TABLE category_arrangements (
                user_id INTEGER NOT NULL DEFAULT 0,
                category_name TEXT NOT NULL,
                position INTEGER NOT NULL,
                visible_from TEXT,
                expires_at TEXT,
                PRIMARY KEY (user_id, category_name)
            )');
        }
    } catch (PDOException $e) {
        // Table might not exist, create it
        try {
            $db->exec('CREATE TABLE IF NOT EXISTS category_arrangements (
                user_id INTEGER NOT NULL DEFAULT 0,
                category_name TEXT NOT NULL,
                position INTEGER NOT NULL,
                visible_from TEXT,
                expires_at TEXT,
                PRIMARY KEY (user_id, category_name)
            )');
        } catch (PDOException $createError) {
            error_log('Failed to create category_arrangements table: ' . $createError->getMessage());
        }
    }
    
    $db->beginTransaction();
    
    try {
        
        // Delete existing global category arrangement (user_id = 0 for global)
        $deleteStmt = $db->prepare('DELETE FROM category_arrangements WHERE user_id = 0');
        $deleteStmt->execute();
        
        // Insert new global category arrangement (user_id = 0 for global)
        // Using INSERT OR REPLACE to handle any conflicts
        // Using 0 instead of NULL because SQLite doesn't allow NULL in composite PRIMARY KEY
        $insertStmt = $db->prepare('INSERT OR REPLACE INTO category_arrangements (user_id, category_name, position, visible_from, expires_at) VALUES (?, ?, ?, ?, ?)');
        
        foreach ($data['categories'] as $item) {
            if (!isset($item['categoryName']) || !isset($item['position'])) {
                continue;
            }
            
            // Validate category name is not empty
            $categoryName = trim($item['categoryName']);
            if (empty($categoryName)) {
                continue;
            }
            
            // Get scheduling fields (optional)
            $visibleFrom = isset($item['visibleFrom']) && !empty($item['visibleFrom']) ? $item['visibleFrom'] : null;
            $expiresAt = isset($item['expiresAt']) && !empty($item['expiresAt']) ? $item['expiresAt'] : null;
            
            try {
                $insertStmt->execute([
                    0, // 0 for global arrangement (SQLite doesn't allow NULL in PRIMARY KEY)
                    $categoryName,
                    (int)$item['position'],
                    $visibleFrom,
                    $expiresAt
                ]);
            } catch (PDOException $e) {
                error_log('Failed to insert category: ' . $categoryName . ' - ' . $e->getMessage());
                // Continue with other categories even if one fails
            }
        }
        
        $db->commit();
        sendJSON(['success' => true]);
        
    } catch (PDOException $e) {
        $db->rollBack();
        $errorMsg = $e->getMessage();
        $errorCode = $e->getCode();
        $errorInfo = $e->errorInfo ?? [];
        error_log('Category arrangement save error: ' . $errorMsg);
        error_log('Error code: ' . $errorCode);
        error_log('Error info: ' . print_r($errorInfo, true));
        
        // Check if it's a foreign key error and provide helpful message
        if (strpos($errorMsg, 'FOREIGN KEY') !== false || $errorCode == 23000) {
            // This shouldn't happen, but if it does, try to fix the table
            try {
                // Drop and recreate the table without any foreign keys
                $db->exec('DROP TABLE IF EXISTS category_arrangements');
                $db->exec('CREATE TABLE category_arrangements (
                    user_id INTEGER NOT NULL DEFAULT 0,
                    category_name TEXT NOT NULL,
                    position INTEGER NOT NULL,
                    visible_from TEXT,
                    expires_at TEXT,
                    PRIMARY KEY (user_id, category_name)
                )');
                error_log('Recreated category_arrangements table to fix foreign key issue');
            } catch (PDOException $fixError) {
                error_log('Failed to fix table: ' . $fixError->getMessage());
            }
        }
        
        sendJSON([
            'error' => 'Failed to save category arrangement',
            'details' => $errorMsg,
            'code' => $errorCode
        ], 500);
    } catch (Exception $e) {
        $db->rollBack();
        error_log('Category arrangement save error (non-PDO): ' . $e->getMessage());
        sendJSON(['error' => 'Failed to save category arrangement: ' . $e->getMessage()], 500);
    }
}

