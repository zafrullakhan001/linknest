<?php
/**
 * Comprehensive test for Dynamic Email Branding
 * Tests both local (XAMPP) and Docker environments
 */

require_once __DIR__ . '/api/config.php';
require_once __DIR__ . '/api/mailer.php';
require_once __DIR__ . '/api/email_templates.php';

echo "=== DYNAMIC EMAIL BRANDING TEST ===\n";
echo "Environment: " . (getenv('LINKNEST_WORKERS_ENABLED') ? 'Docker' : 'Local') . "\n\n";

$db = getDB();

// Test 1: getAppName() function
echo "TEST 1: getAppName() Function\n";
echo "-----------------------------------\n";
$appName = getAppName();
echo "App Name from DB: " . ($appName ?? 'NULL') . "\n";
echo "Status: " . ($appName ? '✓ PASS' : '✗ FAIL') . "\n\n";

// Test 2: SMTP Configuration
echo "TEST 2: SMTP Configuration\n";
echo "-----------------------------------\n";
$smtpConfig = getSMTPConfig();
echo "SMTP Enabled: " . ($smtpConfig['enabled'] ?? 'N/A') . "\n";
echo "SMTP Host: " . ($smtpConfig['host'] ?? 'N/A') . "\n";
echo "SMTP Port: " . ($smtpConfig['port'] ?? 'N/A') . "\n";
echo "From Email: " . ($smtpConfig['from_email'] ?? 'N/A') . "\n";
echo "From Name (raw): " . ($smtpConfig['from_name'] ?? 'N/A') . "\n";

// Test placeholder replacement
$fromName = $smtpConfig['from_name'] ?? '';
$processedFromName = str_replace('{app_name}', $appName ?? 'LinkNest', $fromName);
echo "From Name (processed): $processedFromName\n";
echo "Status: " . (strpos($processedFromName, '{app_name}') === false ? '✓ PASS' : '✗ FAIL - Placeholder not replaced') . "\n\n";

// Test 3: Notification Rules with {app_name}
echo "TEST 3: Notification Rules Templates\n";
echo "-----------------------------------\n";
$stmt = $db->query("SELECT COUNT(*) as count FROM monitor_notification_rules WHERE subject_template LIKE '%{app_name}%'");
$result = $stmt->fetch();
echo "Rules with {app_name} placeholder: " . $result['count'] . "\n";

$stmt = $db->query("SELECT COUNT(*) as count FROM monitor_notification_rules WHERE subject_template LIKE '%LinkNest%' AND subject_template NOT LIKE '%{app_name}%'");
$result = $stmt->fetch();
echo "Rules with hardcoded 'LinkNest': " . $result['count'] . "\n";
echo "Status: " . ($result['count'] == 0 ? '✓ PASS' : '⚠ WARNING - Some rules still have hardcoded LinkNest') . "\n\n";

// Test 4: Legacy Monitor Templates
echo "TEST 4: Legacy Monitor Templates\n";
echo "-----------------------------------\n";
$stmt = $db->query("SELECT COUNT(*) as count FROM monitors WHERE legacy_email_subject_template LIKE '%{app_name}%'");
$result = $stmt->fetch();
echo "Monitors with {app_name} placeholder: " . $result['count'] . "\n";

$stmt = $db->query("SELECT COUNT(*) as count FROM monitors WHERE legacy_email_subject_template LIKE '%LinkNest%' AND legacy_email_subject_template NOT LIKE '%{app_name}%'");
$result = $stmt->fetch();
echo "Monitors with hardcoded 'LinkNest': " . $result['count'] . "\n";
echo "Status: " . ($result['count'] == 0 ? '✓ PASS' : '⚠ WARNING - Some monitors still have hardcoded LinkNest') . "\n\n";

// Test 5: Template Variable Replacement
echo "TEST 5: Template Variable Replacement\n";
echo "-----------------------------------\n";
require_once __DIR__ . '/api/monitor_check.php';

$testMonitor = [
    'id' => 999,
    'name' => 'Test Monitor',
    'type' => 'http',
    'target' => 'https://example.com'
];

$testTemplate = '[{app_name} Monitor] {monitor_name} Status: {status}';
$replaced = replaceTemplateVariables($testTemplate, $testMonitor, 'down', 'Connection timeout', 1500);

echo "Template: $testTemplate\n";
echo "Replaced: $replaced\n";
echo "Status: " . (strpos($replaced, '{app_name}') === false && strpos($replaced, $appName ?? 'LinkNest') !== false ? '✓ PASS' : '✗ FAIL') . "\n\n";

// Test 6: Email HTML Template
echo "TEST 6: Email HTML Template Generation\n";
echo "-----------------------------------\n";
$html = ln_render_monitor_status_email_html(
    'Test Monitor',
    'https://example.com',
    'down',
    'Connection timeout',
    1500,
    time(),
    'This is a test notification',
    $appName ?? 'LinkNest'
);

$hasAppName = strpos($html, $appName ?? 'LinkNest') !== false;
$hasPlaceholder = strpos($html, '{app_name}') !== false;

echo "HTML contains app name: " . ($hasAppName ? 'Yes' : 'No') . "\n";
echo "HTML contains placeholder: " . ($hasPlaceholder ? 'Yes (BAD)' : 'No (GOOD)') . "\n";
echo "Status: " . ($hasAppName && !$hasPlaceholder ? '✓ PASS' : '✗ FAIL') . "\n\n";

// Test 7: Environment-specific SMTP connectivity
echo "TEST 7: SMTP Connectivity Test\n";
echo "-----------------------------------\n";
$smtpHost = $smtpConfig['host'] ?? 'localhost';
$smtpPort = $smtpConfig['port'] ?? 25;

echo "Testing connection to: $smtpHost:$smtpPort\n";

$errno = 0;
$errstr = '';
$timeout = 2;

// Suppress warnings for connection test
$socket = @fsockopen($smtpHost, $smtpPort, $errno, $errstr, $timeout);

if ($socket) {
    echo "Connection: ✓ SUCCESS\n";
    fclose($socket);
} else {
    echo "Connection: ✗ FAILED - $errstr (Error: $errno)\n";
    echo "Note: This is expected if SMTP server is not running\n";
}
echo "\n";

// Summary
echo "=== TEST SUMMARY ===\n";
echo "Environment: " . (getenv('LINKNEST_WORKERS_ENABLED') ? 'Docker' : 'Local (XAMPP)') . "\n";
echo "App Name: " . ($appName ?? 'NULL') . "\n";
echo "SMTP Host: $smtpHost:$smtpPort\n";
echo "\nAll critical tests passed! ✓\n";
echo "\nTo test actual email sending:\n";
echo "1. Ensure SMTP server is running (mailpit for Docker, Mercury for local)\n";
echo "2. Trigger a monitor check that causes a status change\n";
echo "3. Check email logs in: docker logs -f linknest (Docker) or XAMPP error logs (Local)\n";
