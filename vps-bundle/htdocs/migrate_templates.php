<?php
require_once __DIR__ . '/api/config.php';
$db = getDB();

echo "Migrating existing notification rules to use {app_name} placeholder...\n";

// Update subject_template
$stmt = $db->prepare("UPDATE monitor_notification_rules SET subject_template = REPLACE(subject_template, '[LinkNest Monitor]', '[{app_name} Monitor]') WHERE subject_template LIKE '%[LinkNest Monitor]%'");
$stmt->execute();
echo "Updated subjects: " . $stmt->rowCount() . "\n";

// Update body_template (if any)
$stmt = $db->prepare("UPDATE monitor_notification_rules SET body_template = REPLACE(body_template, 'LinkNest', '{app_name}') WHERE body_template LIKE '%LinkNest%'");
$stmt->execute();
echo "Updated bodies: " . $stmt->rowCount() . "\n";

// Update monitors legacy templates as well
echo "Migrating legacy monitor templates...\n";
$stmt = $db->prepare("UPDATE monitors SET legacy_email_subject_template = REPLACE(legacy_email_subject_template, '[LinkNest Monitor]', '[{app_name} Monitor]') WHERE legacy_email_subject_template LIKE '%[LinkNest Monitor]%'");
$stmt->execute();
echo "Updated legacy subjects: " . $stmt->rowCount() . "\n";

$stmt = $db->prepare("UPDATE monitors SET legacy_email_body_template = REPLACE(legacy_email_body_template, 'LinkNest', '{app_name}') WHERE legacy_email_body_template LIKE '%LinkNest%'");
$stmt->execute();
echo "Updated legacy bodies: " . $stmt->rowCount() . "\n";

echo "Done.\n";
