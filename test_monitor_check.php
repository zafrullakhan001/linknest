<?php
require_once __DIR__ . '/api/config.php';
require_once __DIR__ . '/api/monitor_check.php';

// Enable error reporting
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "=== TESTING MONITOR CHECK AND NOTIFICATION TRIGGERING ===\n\n";

$db = getDB();

// Find a monitor with active rules
$stmt = $db->query("
    SELECT m.*, COUNT(r.id) as rule_count
    FROM monitors m
    LEFT JOIN monitor_notification_rules r ON m.id = r.monitor_id AND r.is_enabled = 1
    WHERE m.is_active = 1
    GROUP BY m.id
    HAVING rule_count > 0
    LIMIT 1
");

$monitor = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$monitor) {
    echo "No active monitors with notification rules found.\n";
    exit(1);
}

echo "Testing monitor: {$monitor['name']} (ID: {$monitor['id']})\n";
echo "Type: {$monitor['type']}\n";
echo "Target: {$monitor['target']}\n";
echo "Current Status: " . ($monitor['last_status'] ?? 'NULL') . "\n";
echo "Rule Count: {$monitor['rule_count']}\n\n";

// Show the rules
$ruleStmt = $db->prepare("SELECT * FROM monitor_notification_rules WHERE monitor_id = ? AND is_enabled = 1");
$ruleStmt->execute([$monitor['id']]);
$rules = $ruleStmt->fetchAll(PDO::FETCH_ASSOC);

echo "Active Rules:\n";
foreach ($rules as $rule) {
    echo "  - {$rule['name']} (Trigger: {$rule['status_trigger']})\n";
}
echo "\n";

// Perform a check
echo "Performing monitor check...\n";
$result = performMonitorCheck($monitor);

echo "Check Result:\n";
echo "  Status: {$result['status']}\n";
echo "  Details: {$result['details']}\n";
echo "  Response Time: {$result['response_time']}ms\n\n";

// Check if any notifications were logged
$logStmt = $db->prepare("
    SELECT * FROM monitor_notification_logs 
    WHERE monitor_id = ? 
    ORDER BY sent_at DESC 
    LIMIT 3
");
$logStmt->execute([$monitor['id']]);
$logs = $logStmt->fetchAll(PDO::FETCH_ASSOC);

echo "Recent notification logs for this monitor:\n";
if (empty($logs)) {
    echo "  (No logs found)\n";
} else {
    foreach ($logs as $log) {
        echo "  - Sent at: " . date('Y-m-d H:i:s', $log['sent_at']) . "\n";
        echo "    Trigger: {$log['status_trigger']}\n";
        echo "    Recipient: {$log['recipient_email']}\n";
        echo "    Success: " . ($log['success'] ? 'YES' : 'NO') . "\n";
        if (!$log['success']) {
            echo "    Error: {$log['error_message']}\n";
        }
        echo "\n";
    }
}
