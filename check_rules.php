<?php
require_once __DIR__ . '/api/config.php';
$db = getDB();
$stmt = $db->query("SELECT id, subject_template, body_template FROM monitor_notification_rules");
$rules = $stmt->fetchAll(PDO::FETCH_ASSOC);
foreach ($rules as $rule) {
    echo "Rule ID: " . $rule['id'] . "\n";
    echo "Subject: " . $rule['subject_template'] . "\n";
    echo "Body: " . $rule['body_template'] . "\n";
    echo "-------------------\n";
}
