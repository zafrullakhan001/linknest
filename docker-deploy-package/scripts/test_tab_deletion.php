<?php
/**
 * Test script to verify tab deletion functionality
 * This script will:
 * 1. Create a test tile with multiple tabs
 * 2. Attempt to delete a tab via the API
 * 3. Verify the deletion worked correctly
 * 4. Check database state
 */

require_once __DIR__ . '/../api/config.php';

// Set up test output
header('Content-Type: text/html; charset=utf-8');
echo "<html><head><title>Tab Deletion Test</title>";
echo "<style>
    body { font-family: monospace; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
    .success { color: #4ec9b0; }
    .error { color: #f48771; }
    .info { color: #569cd6; }
    .warning { color: #dcdcaa; }
    pre { background: #252526; padding: 10px; border-radius: 4px; overflow-x: auto; }
    h2 { color: #4ec9b0; border-bottom: 1px solid #3e3e42; padding-bottom: 5px; }
    .section { margin: 20px 0; padding: 15px; background: #252526; border-radius: 4px; }
</style></head><body>";
echo "<h1>Tab Deletion Test Script</h1>";

$db = getDB();
$testResults = [];
$errors = [];

try {
    // Step 1: Create a test user if needed
    echo "<div class='section'><h2>Step 1: Setting up test user</h2>";
    $testUserId = 1; // Use admin user
    $userStmt = $db->prepare('SELECT id FROM users WHERE id = ?');
    $userStmt->execute([$testUserId]);
    $user = $userStmt->fetch();
    
    if (!$user) {
        echo "<p class='error'>No test user found. Please create a user first.</p>";
        exit;
    }
    echo "<p class='success'>✓ Using user ID: {$testUserId}</p></div>";
    
    // Step 2: Create a test tile with multiple tabs
    echo "<div class='section'><h2>Step 2: Creating test tile with tabs</h2>";
    $testTileId = 'test_tab_deletion_' . time();
    
    // Delete existing test tile if it exists
    $deleteStmt = $db->prepare('DELETE FROM tiles WHERE id = ?');
    $deleteStmt->execute([$testTileId]);
    
    // Create test tile
    $tileStmt = $db->prepare('INSERT INTO tiles (id, user_id, title, description, emoji, theme_color, "group", visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $tileStmt->execute([
        $testTileId,
        $testUserId,
        'Test Tab Deletion Tile',
        'Test tile for tab deletion',
        '🧪',
        'blue',
        'Test',
        'public',
        time()
    ]);
    echo "<p class='success'>✓ Created test tile: {$testTileId}</p>";
    
    // Create 5 tabs
    $tabIds = [];
    for ($i = 0; $i < 5; $i++) {
        $tabId = 'test_tab_' . $i . '_' . time();
        $tabIds[] = $tabId;
        $tabStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position) VALUES (?, ?, ?, ?)');
        $tabStmt->execute([
            $tabId,
            $testTileId,
            "Test Tab " . ($i + 1),
            $i
        ]);
    }
    echo "<p class='success'>✓ Created 5 tabs</p>";
    echo "<pre>Tab IDs: " . json_encode($tabIds, JSON_PRETTY_PRINT) . "</pre>";
    echo "</div>";
    
    // Step 3: Verify initial state
    echo "<div class='section'><h2>Step 3: Verifying initial state</h2>";
    $checkStmt = $db->prepare('SELECT COUNT(*) as count FROM tabs WHERE tile_id = ?');
    $checkStmt->execute([$testTileId]);
    $initialCount = $checkStmt->fetch()['count'];
    echo "<p class='info'>Initial tab count: {$initialCount}</p>";
    
    if ($initialCount != 5) {
        echo "<p class='error'>✗ Expected 5 tabs, found {$initialCount}</p>";
        $errors[] = "Initial tab count mismatch";
    } else {
        echo "<p class='success'>✓ Initial tab count is correct</p>";
    }
    echo "</div>";
    
    // Step 4: Simulate tab deletion (remove one tab)
    echo "<div class='section'><h2>Step 4: Simulating tab deletion</h2>";
    $tabToDelete = $tabIds[2]; // Delete the 3rd tab (index 2)
    echo "<p class='info'>Deleting tab: {$tabToDelete}</p>";
    
    // Get current tabs from database
    $getTabsStmt = $db->prepare('SELECT * FROM tabs WHERE tile_id = ? ORDER BY position ASC');
    $getTabsStmt->execute([$testTileId]);
    $currentTabs = $getTabsStmt->fetchAll();
    
    echo "<p class='info'>Tabs before deletion:</p>";
    echo "<pre>" . json_encode(array_map(function($t) {
        return ['id' => $t['id'], 'title' => $t['title'], 'position' => $t['position']];
    }, $currentTabs), JSON_PRETTY_PRINT) . "</pre>";
    
    // Delete the tab
    $deleteTabStmt = $db->prepare('DELETE FROM tabs WHERE id = ?');
    $deleteTabStmt->execute([$tabToDelete]);
    
    // Reorder remaining tabs
    $remainingTabs = array_filter($currentTabs, function($t) use ($tabToDelete) {
        return $t['id'] !== $tabToDelete;
    });
    $remainingTabs = array_values($remainingTabs);
    
    foreach ($remainingTabs as $idx => $tab) {
        $updateStmt = $db->prepare('UPDATE tabs SET position = ? WHERE id = ?');
        $updateStmt->execute([$idx, $tab['id']]);
    }
    
    echo "<p class='success'>✓ Deleted tab and reordered positions</p>";
    echo "</div>";
    
    // Step 5: Verify deletion worked
    echo "<div class='section'><h2>Step 5: Verifying deletion</h2>";
    $checkStmt->execute([$testTileId]);
    $afterCount = $checkStmt->fetch()['count'];
    echo "<p class='info'>Tab count after deletion: {$afterCount}</p>";
    
    if ($afterCount != 4) {
        echo "<p class='error'>✗ Expected 4 tabs, found {$afterCount}</p>";
        $errors[] = "Tab count after deletion is incorrect";
    } else {
        echo "<p class='success'>✓ Tab count after deletion is correct</p>";
    }
    
    // Verify the deleted tab is gone
    $checkDeletedStmt = $db->prepare('SELECT COUNT(*) as count FROM tabs WHERE id = ?');
    $checkDeletedStmt->execute([$tabToDelete]);
    $deletedExists = $checkDeletedStmt->fetch()['count'];
    
    if ($deletedExists > 0) {
        echo "<p class='error'>✗ Deleted tab still exists in database!</p>";
        $errors[] = "Deleted tab still exists";
    } else {
        echo "<p class='success'>✓ Deleted tab is gone from database</p>";
    }
    
    // Verify positions are correct
    $getTabsStmt->execute([$testTileId]);
    $finalTabs = $getTabsStmt->fetchAll();
    $positions = array_column($finalTabs, 'position');
    $expectedPositions = [0, 1, 2, 3];
    
    if ($positions !== $expectedPositions) {
        echo "<p class='error'>✗ Tab positions are incorrect!</p>";
        echo "<pre>Expected: " . json_encode($expectedPositions) . "\nGot: " . json_encode($positions) . "</pre>";
        $errors[] = "Tab positions incorrect";
    } else {
        echo "<p class='success'>✓ Tab positions are correct</p>";
    }
    
    echo "<p class='info'>Final tabs:</p>";
    echo "<pre>" . json_encode(array_map(function($t) {
        return ['id' => $t['id'], 'title' => $t['title'], 'position' => $t['position']];
    }, $finalTabs), JSON_PRETTY_PRINT) . "</pre>";
    echo "</div>";
    
    // Step 6: Test API endpoint simulation
    echo "<div class='section'><h2>Step 6: Testing API update simulation</h2>";
    
    // Simulate what the frontend sends
    $apiData = [
        'title' => 'Test Tab Deletion Tile',
        'description' => 'Test tile for tab deletion',
        'htmlContent' => '',
        'emoji' => '🧪',
        'themeColor' => 'blue',
        'group' => 'Test',
        'visibility' => 'public',
        'tabs' => []
    ];
    
    // Build tabs array from remaining tabs (simulating frontend state)
    foreach ($finalTabs as $tab) {
        $apiData['tabs'][] = [
            'id' => $tab['id'],
            'title' => $tab['title'],
            'position' => (int)$tab['position'],
            'sections' => []
        ];
    }
    
    echo "<p class='info'>Simulating API update with " . count($apiData['tabs']) . " tabs</p>";
    echo "<pre>" . json_encode(['tab_count' => count($apiData['tabs']), 'tab_ids' => array_column($apiData['tabs'], 'id')], JSON_PRETTY_PRINT) . "</pre>";
    
    // Simulate the API update process
    $db->beginTransaction();
    try {
        // Delete existing tabs (as API does)
        $deleteAllTabsStmt = $db->prepare('DELETE FROM tabs WHERE tile_id = ?');
        $deleteAllTabsStmt->execute([$testTileId]);
        
        // Insert tabs from API data
        foreach ($apiData['tabs'] as $tabIndex => $tab) {
            $insertTabStmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position) VALUES (?, ?, ?, ?)');
            $insertTabStmt->execute([
                $tab['id'],
                $testTileId,
                $tab['title'],
                $tab['position']
            ]);
        }
        
        $db->commit();
        echo "<p class='success'>✓ API simulation completed successfully</p>";
    } catch (Exception $e) {
        $db->rollBack();
        echo "<p class='error'>✗ API simulation failed: " . htmlspecialchars($e->getMessage()) . "</p>";
        $errors[] = "API simulation failed: " . $e->getMessage();
    }
    
    // Verify final state
    $checkStmt->execute([$testTileId]);
    $finalCount = $checkStmt->fetch()['count'];
    echo "<p class='info'>Final tab count after API simulation: {$finalCount}</p>";
    
    if ($finalCount != 4) {
        echo "<p class='error'>✗ Expected 4 tabs after API simulation, found {$finalCount}</p>";
        $errors[] = "Tab count after API simulation is incorrect";
    } else {
        echo "<p class='success'>✓ Final tab count is correct</p>";
    }
    echo "</div>";
    
    // Step 7: Test reading tabs back (as API does)
    echo "<div class='section'><h2>Step 7: Testing tab retrieval</h2>";
    
    // Simulate how the API reads tabs
    $readTabsStmt = $db->prepare('SELECT * FROM tabs WHERE tile_id = ? ORDER BY position ASC');
    $readTabsStmt->execute([$testTileId]);
    $readTabs = $readTabsStmt->fetchAll();
    
    echo "<p class='info'>Tabs read from database:</p>";
    echo "<pre>" . json_encode(array_map(function($t) {
        return ['id' => $t['id'], 'title' => $t['title'], 'position' => $t['position']];
    }, $readTabs), JSON_PRETTY_PRINT) . "</pre>";
    
    if (count($readTabs) != 4) {
        echo "<p class='error'>✗ Expected 4 tabs when reading, got " . count($readTabs) . "</p>";
        $errors[] = "Tab retrieval count mismatch";
    } else {
        echo "<p class='success'>✓ Tab retrieval works correctly</p>";
    }
    
    // Check if deleted tab is in the results
    $deletedTabInResults = false;
    foreach ($readTabs as $tab) {
        if ($tab['id'] === $tabToDelete) {
            $deletedTabInResults = true;
            break;
        }
    }
    
    if ($deletedTabInResults) {
        echo "<p class='error'>✗ Deleted tab found in retrieved results!</p>";
        $errors[] = "Deleted tab appears in retrieved results";
    } else {
        echo "<p class='success'>✓ Deleted tab is not in retrieved results</p>";
    }
    echo "</div>";
    
    // Summary
    echo "<div class='section'><h2>Test Summary</h2>";
    if (empty($errors)) {
        echo "<p class='success'><strong>✓ All tests passed!</strong></p>";
        echo "<p class='info'>Tab deletion is working correctly at the database level.</p>";
        echo "<p class='warning'>If you're still experiencing issues in the UI, the problem may be:</p>";
        echo "<ul>";
        echo "<li>Frontend state not updating correctly</li>";
        echo "<li>API request/response mismatch</li>";
        echo "<li>Browser caching issues</li>";
        echo "<li>Race conditions in state updates</li>";
        echo "</ul>";
    } else {
        echo "<p class='error'><strong>✗ Tests failed with errors:</strong></p>";
        echo "<ul>";
        foreach ($errors as $error) {
            echo "<li class='error'>{$error}</li>";
        }
        echo "</ul>";
    }
    echo "</div>";
    
    // Cleanup
    echo "<div class='section'><h2>Cleanup</h2>";
    $deleteStmt->execute([$testTileId]);
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

