<?php
require_once __DIR__ . '/api/config.php';
$db = getDB();

echo "=== MONITORS WITH NOTIFICATION RULES ===\n\n";

$stmt = $db->query("
    SELECT m.id, m.name, m.type, m.target, m.is_active, m.last_status,
           COUNT(r.id) as rule_count
    FROM monitors m
    LEFT JOIN monitor_notification_rules r ON m.id = r.monitor_id AND r.is_enabled = 1
    GROUP BY m.id
    HAVING rule_count > 0
");

$monitors = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($monitors as $mon) {
    echo "Monitor ID: {$mon['id']}\n";
    echo "Name: {$mon['name']}\n";
    echo "Type: {$mon['type']}\n";
    echo "Target: {$mon['target']}\n";
    echo "Active: " . ($mon['is_active'] ? 'YES' : 'NO') . "\n";
    echo "Last Status: " . ($mon['last_status'] ?? 'NULL') . "\n";
    echo "Active Rules: {$mon['rule_count']}\n";
    
    // Get rules for this monitor
    $ruleStmt = $db->prepare("
        SELECT id, name, status_trigger, is_enabled, subject_template
        FROM monitor_notification_rules
        WHERE monitor_id = ?
        ORDER BY COALESCE(sort_order, 0) ASC
    ");
    $ruleStmt->execute([$mon['id']]);
    $rules = $ruleStmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo "\nRules:\n";
    foreach ($rules as $rule) {
        echo "  - Rule #{$rule['id']}: {$rule['name']}\n";
        echo "    Trigger: {$rule['status_trigger']}\n";
        echo "    Enabled: " . ($rule['is_enabled'] ? 'YES' : 'NO') . "\n";
        echo "    Subject: {$rule['subject_template']}\n";
        
        // Get recipients
        $recStmt = $db->prepare("SELECT email FROM monitor_notification_recipients WHERE rule_id = ?");
        $recStmt->execute([$rule['id']]);
        $recipients = $recStmt->fetchAll(PDO::FETCH_COLUMN);
        echo "    Recipients: " . implode(', ', $recipients) . "\n";
    }
    
    echo "\n" . str_repeat('-', 60) . "\n\n";
}

echo "\n=== NOTIFICATION LOGS (Last 5) ===\n\n";
$logStmt = $db->query("
    SELECT l.*, m.name as monitor_name, r.name as rule_name
    FROM monitor_notification_logs l
    LEFT JOIN monitors m ON l.monitor_id = m.id
    LEFT JOIN monitor_notification_rules r ON l.rule_id = r.id
    ORDER BY l.sent_at DESC
    LIMIT 5
");
$logs = $logStmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($logs as $log) {
    echo "Log ID: {$log['id']}\n";
    echo "Monitor: {$log['monitor_name']} (ID: {$log['monitor_id']})\n";
    echo "Rule: {$log['rule_name']} (ID: {$log['rule_id']})\n";
    echo "Recipient: {$log['recipient_email']}\n";
    echo "Trigger: {$log['status_trigger']}\n";
    echo "Subject: {$log['subject']}\n";
    echo "Success: " . ($log['success'] ? 'YES' : 'NO') . "\n";
    if (!$log['success']) {
        echo "Error: {$log['error_message']}\n";
    }
    echo "Sent At: " . date('Y-m-d H:i:s', $log['sent_at']) . "\n";
    echo "\n";
}
