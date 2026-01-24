<?php
/**
 * Test linkhealth endpoint
 */

require_once __DIR__ . '/../api/config.php';

echo "=== Testing LinkHealth Endpoint ===\n\n";

try {
    $db = getDB();
    echo "✓ Database connection successful\n";
    
    // Check if sections table exists
    $stmt = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='sections'");
    $result = $stmt->fetch();
    if ($result) {
        echo "✓ sections table exists\n";
    } else {
        echo "✗ sections table does NOT exist\n";
    }
    
    // Check if links table exists
    $stmt = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='links'");
    $result = $stmt->fetch();
    if ($result) {
        echo "✓ links table exists\n";
    } else {
        echo "✗ links table does NOT exist\n";
        exit(1);
    }
    
    // Test the query
    echo "\nTesting query...\n";
    $stmt = $db->prepare('
        SELECT l.id, l.url, l.health_status, l.health_http_code, l.health_error, l.health_checked_at,
               s.tile_id
        FROM links l
        LEFT JOIN sections s ON l.section_id = s.id
        LIMIT 5
    ');
    $stmt->execute();
    $links = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo "✓ Query successful, found " . count($links) . " links\n";
    
    if (count($links) > 0) {
        echo "\nSample result:\n";
        print_r($links[0]);
    }
    
} catch (PDOException $e) {
    echo "✗ PDO Error: " . $e->getMessage() . "\n";
    echo "SQL State: " . $e->getCode() . "\n";
} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
}
