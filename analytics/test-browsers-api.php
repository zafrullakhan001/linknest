<?php
/**
 * Test the browsers API endpoint
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "=== Testing Browsers API ===\n\n";

// Simulate a GET request
$_SERVER['REQUEST_METHOD'] = 'GET';

// Start session
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Set a test user (you may need to adjust this)
$_SESSION['user_id'] = 1;

echo "Session user_id: " . ($_SESSION['user_id'] ?? 'NOT SET') . "\n\n";

// Test database connection and table creation
try {
    require_once __DIR__ . '/../api/config.php';
    $db = getDB();
    echo "✓ Database connection successful\n";
    
    // Test table creation
    $db->exec('CREATE TABLE IF NOT EXISTS browser_list (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        browser_id TEXT NOT NULL UNIQUE,
        browser_name TEXT NOT NULL,
        browser_path TEXT,
        browser_version TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    )');
    echo "✓ browser_list table exists/created\n";
    
    $db->exec('CREATE TABLE IF NOT EXISTS browser_list_metadata (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_updated INTEGER NOT NULL,
        source TEXT NOT NULL
    )');
    echo "✓ browser_list_metadata table exists/created\n";
    
    // Test the GET query
    echo "\nTesting GET query...\n";
    $stmt = $db->query('SELECT browser_id, browser_name, browser_path, browser_version FROM browser_list ORDER BY browser_name');
    if ($stmt) {
        $browsers = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo "✓ Query successful, found " . count($browsers) . " browsers\n";
    } else {
        echo "✗ Query returned false\n";
    }
    
    // Test metadata query
    echo "\nTesting metadata query...\n";
    try {
        $metaStmt = $db->query('SELECT last_updated, source FROM browser_list_metadata WHERE id = 1');
        if ($metaStmt) {
            $metadata = $metaStmt->fetch(PDO::FETCH_ASSOC);
            echo "✓ Metadata query successful\n";
            if ($metadata) {
                echo "  Metadata: " . json_encode($metadata) . "\n";
            } else {
                echo "  No metadata row found (this is okay)\n";
            }
        } else {
            echo "✗ Metadata query returned false\n";
        }
    } catch (Exception $e) {
        echo "⚠ Metadata query error (non-critical): " . $e->getMessage() . "\n";
    }
    
    // Test user query
    echo "\nTesting user query...\n";
    try {
        $userStmt = $db->prepare('SELECT is_admin FROM users WHERE id = ?');
        $userStmt->execute([$_SESSION['user_id']]);
        $user = $userStmt->fetch(PDO::FETCH_ASSOC);
        if ($user) {
            echo "✓ User query successful\n";
            echo "  is_admin: " . ($user['is_admin'] ? 'true' : 'false') . "\n";
        } else {
            echo "✗ User not found\n";
        }
    } catch (Exception $e) {
        echo "✗ User query error: " . $e->getMessage() . "\n";
    }
    
} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
    echo "Stack trace:\n" . $e->getTraceAsString() . "\n";
}
