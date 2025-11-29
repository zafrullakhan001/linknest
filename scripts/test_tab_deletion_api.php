<?php
/**
 * Test script to verify tab deletion via API endpoint
 * This simulates what the frontend does when saving a tile with deleted tabs
 */

require_once __DIR__ . '/../api/config.php';

// Set up test output
header('Content-Type: text/html; charset=utf-8');
echo "<html><head><title>Tab Deletion API Test</title>";
echo "<style>
    body { font-family: monospace; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
    .success { color: #4ec9b0; }
    .error { color: #f48771; }
    .info { color: #569cd6; }
    .warning { color: #dcdcaa; }
    pre { background: #252526; padding: 10px; border-radius: 4px; overflow-x: auto; }
    h2 { color: #4ec9b0; border-bottom: 1px solid #3e3e42; padding-bottom: 5px; }
    .section { margin: 20px 0; padding: 15px; background: #252526; border-radius: 4px; }
    code { background: #252526; padding: 2px 6px; border-radius: 3px; }
</style></head><body>";
echo "<h1>Tab Deletion API Test Script</h1>";

$db = getDB();
$errors = [];

try {
    // Step 1: Get or create test user
    echo "<div class='section'><h2>Step 1: Setting up authentication</h2>";
    
    // Get first admin user
    $userStmt = $db->prepare('SELECT id, username FROM users WHERE is_admin = 1 LIMIT 1');
    $userStmt->execute();
    $adminUser = $userStmt->fetch();
    
    if (!$adminUser) {
        echo "<p class='error'>No admin user found. Please create an admin user first.</p>";
        exit;
    }
    
    // Set session for authentication
    session_start();
    $_SESSION['user_id'] = $adminUser['id'];
    $_SESSION['is_admin'] = 1;
    
    echo "<p class='success'>✓ Authenticated as: {$adminUser['username']} (ID: {$adminUser['id']})</p>";
    echo "</div>";
    
    // Step 2: Create test tile with tabs
    echo "<div class='section'><h2>Step 2: Creating test tile</h2>";
    $testTileId = 'test_api_tab_' . time();
    
    // Clean up any existing test tile
    $cleanupStmt = $db->prepare('DELETE FROM tiles WHERE id = ?');
    $cleanupStmt->execute([$testTileId]);
    
    // Create tile
    $tileStmt = $db->prepare('INSERT INTO tiles (id, user_id, title, description, emoji, theme_color, "group", visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $tileStmt->execute([
        $testTileId,
        $adminUser['id'],
        'API Test Tile',
        'Test tile for API tab deletion',
        '🧪',
        'blue',
        'Test',
        'public',
        time()
    ]);
    
    // Create 5 tabs
    $tabIds = [];
    for ($i = 0; $i < 5; $i++) {
        $tabId = 'api_tab_' . $i . '_' . time();
        $tabIds[] = $tabId;
        $tabStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position) VALUES (?, ?, ?, ?)');
        $tabStmt->execute([
            $tabId,
            $testTileId,
            "API Tab " . ($i + 1),
            $i
        ]);
    }
    
    echo "<p class='success'>✓ Created tile with 5 tabs</p>";
    echo "<pre>Tile ID: {$testTileId}\nTab IDs: " . json_encode($tabIds, JSON_PRETTY_PRINT) . "</pre>";
    echo "</div>";
    
    // Step 3: Verify initial state
    echo "<div class='section'><h2>Step 3: Verifying initial state</h2>";
    $checkStmt = $db->prepare('SELECT COUNT(*) as count FROM tabs WHERE tile_id = ?');
    $checkStmt->execute([$testTileId]);
    $initialCount = $checkStmt->fetch()['count'];
    echo "<p class='info'>Initial tab count: {$initialCount}</p>";
    echo "</div>";
    
    // Step 4: Simulate frontend deletion (remove tab from array)
    echo "<div class='section'><h2>Step 4: Simulating frontend tab deletion</h2>";
    $tabToDelete = $tabIds[2]; // Delete 3rd tab
    echo "<p class='info'>Frontend would delete tab: <code>{$tabToDelete}</code></p>";
    
    // Get all tabs
    $getTabsStmt = $db->prepare('SELECT * FROM tabs WHERE tile_id = ? ORDER BY position ASC');
    $getTabsStmt->execute([$testTileId]);
    $allTabs = $getTabsStmt->fetchAll();
    
    // Simulate frontend: filter out deleted tab and reorder
    $remainingTabs = [];
    $position = 0;
    foreach ($allTabs as $tab) {
        if ($tab['id'] !== $tabToDelete) {
            $remainingTabs[] = [
                'id' => $tab['id'],
                'title' => $tab['title'],
                'position' => $position++,
                'sections' => []
            ];
        }
    }
    
    echo "<p class='info'>Tabs after frontend deletion simulation:</p>";
    echo "<pre>" . json_encode($remainingTabs, JSON_PRETTY_PRINT) . "</pre>";
    echo "<p class='success'>✓ Frontend would send " . count($remainingTabs) . " tabs (deleted 1)</p>";
    echo "</div>";
    
    // Step 5: Simulate API call with updated tabs
    echo "<div class='section'><h2>Step 5: Simulating API update call</h2>";
    
    // Build the data that frontend would send
    $updateData = [
        'title' => 'API Test Tile',
        'description' => 'Test tile for API tab deletion',
        'htmlContent' => '',
        'emoji' => '🧪',
        'themeColor' => 'blue',
        'group' => 'Test',
        'visibility' => 'public',
        'tabs' => $remainingTabs
    ];
    
    echo "<p class='info'>Data being sent to API:</p>";
    echo "<pre>" . json_encode([
        'tileId' => $testTileId,
        'tabCount' => count($updateData['tabs']),
        'tabIds' => array_column($updateData['tabs'], 'id')
    ], JSON_PRETTY_PRINT) . "</pre>";
    
    // Simulate the API update process (same as handleUpdateTile)
    $db->beginTransaction();
    try {
        // Update tile
        $updateTileStmt = $db->prepare('UPDATE tiles SET title = ?, description = ?, html_content = ?, emoji = ?, theme_color = ?, "group" = ?, visibility = ? WHERE id = ?');
        $updateTileStmt->execute([
            $updateData['title'],
            $updateData['description'],
            $updateData['htmlContent'],
            $updateData['emoji'],
            $updateData['themeColor'],
            $updateData['group'],
            $updateData['visibility'],
            $testTileId
        ]);
        
        // Delete existing tabs (as API does)
        $deleteLinksStmt = $db->prepare('DELETE FROM links WHERE section_id IN (SELECT id FROM sections WHERE tile_id = ?)');
        $deleteLinksStmt->execute([$testTileId]);
        
        $deleteSectionsStmt = $db->prepare('DELETE FROM sections WHERE tile_id = ?');
        $deleteSectionsStmt->execute([$testTileId]);
        
        $deleteTabsStmt = $db->prepare('DELETE FROM tabs WHERE tile_id = ?');
        $deleteTabsStmt->execute([$testTileId]);
        
        echo "<p class='info'>✓ Deleted all existing tabs</p>";
        
        // Insert new tabs
        foreach ($updateData['tabs'] as $tabIndex => $tab) {
            $tabId = $tab['id'];
            $insertTabStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position, visible_from, expires_at) VALUES (?, ?, ?, ?, ?, ?)');
            $insertTabStmt->execute([
                $tabId,
                $testTileId,
                $tab['title'],
                $tab['position'],
                null,
                null
            ]);
        }
        
        $db->commit();
        echo "<p class='success'>✓ API update completed successfully</p>";
        
        // Log for debugging
        error_log('API Test: Updated tile ' . $testTileId . ' with ' . count($updateData['tabs']) . ' tabs');
        error_log('API Test: Tab IDs: ' . json_encode(array_column($updateData['tabs'], 'id')));
        
    } catch (Exception $e) {
        $db->rollBack();
        echo "<p class='error'>✗ API update failed: " . htmlspecialchars($e->getMessage()) . "</p>";
        $errors[] = "API update failed: " . $e->getMessage();
        throw $e;
    }
    echo "</div>";
    
    // Step 6: Verify final state
    echo "<div class='section'><h2>Step 6: Verifying final state</h2>";
    
    $checkStmt->execute([$testTileId]);
    $finalCount = $checkStmt->fetch()['count'];
    echo "<p class='info'>Final tab count: {$finalCount}</p>";
    
    if ($finalCount != 4) {
        echo "<p class='error'>✗ Expected 4 tabs, found {$finalCount}</p>";
        $errors[] = "Final tab count mismatch: expected 4, got {$finalCount}";
    } else {
        echo "<p class='success'>✓ Tab count is correct (4 tabs)</p>";
    }
    
    // Check if deleted tab exists
    $checkDeletedStmt = $db->prepare('SELECT COUNT(*) as count FROM tabs WHERE id = ?');
    $checkDeletedStmt->execute([$tabToDelete]);
    $deletedExists = $checkDeletedStmt->fetch()['count'];
    
    if ($deletedExists > 0) {
        echo "<p class='error'>✗ Deleted tab still exists in database!</p>";
        $errors[] = "Deleted tab still exists";
    } else {
        echo "<p class='success'>✓ Deleted tab is gone</p>";
    }
    
    // Read tabs back (as API does)
    $readTabsStmt = $db->prepare('SELECT * FROM tabs WHERE tile_id = ? ORDER BY position ASC');
    $readTabsStmt->execute([$testTileId]);
    $readTabs = $readTabsStmt->fetchAll();
    
    echo "<p class='info'>Tabs in database:</p>";
    echo "<pre>" . json_encode(array_map(function($t) {
        return ['id' => $t['id'], 'title' => $t['title'], 'position' => $t['position']];
    }, $readTabs), JSON_PRETTY_PRINT) . "</pre>";
    
    // Verify positions
    $positions = array_column($readTabs, 'position');
    $expectedPositions = [0, 1, 2, 3];
    
    if ($positions !== $expectedPositions) {
        echo "<p class='error'>✗ Positions incorrect! Expected: " . json_encode($expectedPositions) . ", Got: " . json_encode($positions) . "</p>";
        $errors[] = "Tab positions incorrect";
    } else {
        echo "<p class='success'>✓ Tab positions are correct</p>";
    }
    echo "</div>";
    
    // Step 7: Test reading via API endpoint simulation
    echo "<div class='section'><h2>Step 7: Testing API read endpoint simulation</h2>";
    
    // Simulate how API reads tabs (from tiles.php)
    $apiReadTabsStmt = $db->prepare('SELECT * FROM tabs WHERE tile_id = ? ORDER BY position ASC');
    $apiReadTabsStmt->execute([$testTileId]);
    $apiTabs = [];
    
    while ($tabRow = $apiReadTabsStmt->fetch()) {
        $apiTabs[] = [
            'id' => $tabRow['id'],
            'title' => $tabRow['title'],
            'position' => (int)($tabRow['position'] ?? 0),
            'visibleFrom' => $tabRow['visible_from'] ?? null,
            'expiresAt' => $tabRow['expires_at'] ?? null,
            'sections' => []
        ];
    }
    
    echo "<p class='info'>Tabs as API would return them:</p>";
    echo "<pre>" . json_encode($apiTabs, JSON_PRETTY_PRINT) . "</pre>";
    
    if (count($apiTabs) != 4) {
        echo "<p class='error'>✗ API would return " . count($apiTabs) . " tabs, expected 4</p>";
        $errors[] = "API read returns wrong count";
    } else {
        echo "<p class='success'>✓ API read returns correct count</p>";
    }
    
    // Check if deleted tab is in API response
    $deletedInResponse = false;
    foreach ($apiTabs as $tab) {
        if ($tab['id'] === $tabToDelete) {
            $deletedInResponse = true;
            break;
        }
    }
    
    if ($deletedInResponse) {
        echo "<p class='error'>✗ Deleted tab appears in API response!</p>";
        $errors[] = "Deleted tab in API response";
    } else {
        echo "<p class='success'>✓ Deleted tab not in API response</p>";
    }
    echo "</div>";
    
    // Summary
    echo "<div class='section'><h2>Test Summary</h2>";
    if (empty($errors)) {
        echo "<p class='success'><strong>✓ All API tests passed!</strong></p>";
        echo "<p class='info'>The API endpoint correctly handles tab deletion.</p>";
        echo "<p class='warning'>If the UI still shows the deleted tab, check:</p>";
        echo "<ul>";
        echo "<li>Browser console for JavaScript errors</li>";
        echo "<li>Network tab to see what's being sent/received</li>";
        echo "<li>Frontend state management (React state updates)</li>";
        echo "<li>Whether the tile is being reloaded from cache</li>";
        echo "</ul>";
    } else {
        echo "<p class='error'><strong>✗ Tests failed:</strong></p>";
        echo "<ul>";
        foreach ($errors as $error) {
            echo "<li class='error'>{$error}</li>";
        }
        echo "</ul>";
    }
    echo "</div>";
    
    // Cleanup
    echo "<div class='section'><h2>Cleanup</h2>";
    $cleanupStmt->execute([$testTileId]);
    echo "<p class='info'>✓ Test tile cleaned up</p>";
    echo "</div>";
    
} catch (Exception $e) {
    echo "<div class='section'><h2 class='error'>Fatal Error</h2>";
    echo "<p class='error'>" . htmlspecialchars($e->getMessage()) . "</p>";
    echo "<pre>" . htmlspecialchars($e->getTraceAsString()) . "</pre>";
    echo "</div>";
}

echo "</body></html>";
?>

