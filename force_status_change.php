<?php
require_once __DIR__ . '/api/config.php';

$db = getDB();

echo "=== FORCING A STATUS CHANGE TEST ===\n\n";

// Find a monitor with rules
$stmt = $db->query("
    SELECT m.*
    FROM monitors m
    INNER JOIN monitor_notification_rules r ON m.id = r.monitor_id AND r.is_enabled = 1
    WHERE m.is_active = 1
    LIMIT 1
");

$monitor = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$monitor) {
    echo "No monitors with rules found.\n";
    exit(1);
}

echo "Monitor: {$monitor['name']} (ID: {$monitor['id']})\n";
echo "Current Status: " . ($monitor['last_status'] ?? 'NULL') . "\n\n";

// Force a status change by setting it to NULL
echo "Resetting status to NULL to force a status change on next check...\n";
$updateStmt = $db->prepare("UPDATE monitors SET last_status = NULL WHERE id = ?");
$updateStmt->execute([$monitor['id']]);

echo "Status reset. Now run a check to trigger notifications.\n";
echo "\nTo test: php test_monitor_check.php\n";
