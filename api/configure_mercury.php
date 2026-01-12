<?php
/**
 * Configure Mercury Email Server for Testing
 * 
 * This script configures SMTP settings for Mercury mail server in XAMPP.
 * Mercury runs on localhost:25 and typically doesn't require authentication for local testing.
 */

require_once __DIR__ . '/config.php';

// Ensure we have admin access (or allow direct access for setup script)
// For a setup script, we'll allow direct access but you should protect this in production

try {
    $db = getDB();
    
    // Mercury SMTP settings for local testing
    $settings = [
        'smtp_enabled' => '1',
        'smtp_host' => 'localhost',
        'smtp_port' => '25',
        'smtp_username' => '',
        'smtp_password' => base64_encode(''), // Empty password, base64 encoded
        'smtp_from_email' => 'noreply@localhost.com',
        'smtp_from_name' => 'LinkNest Monitor',
        'smtp_encryption' => 'none' // No encryption for local Mercury testing
    ];
    
    $db->beginTransaction();
    
    foreach ($settings as $key => $value) {
        $stmt = $db->prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
        $stmt->execute([$key, $value, time()]);
    }
    
    $db->commit();
    
    echo "Mercury email server configuration completed successfully!\n\n";
    echo "Configured Settings:\n";
    echo "- SMTP Enabled: Yes\n";
    echo "- SMTP Host: localhost\n";
    echo "- SMTP Port: 25\n";
    echo "- SMTP Encryption: None (plain text)\n";
    echo "- SMTP Authentication: Disabled (no username/password)\n";
    echo "- From Email: noreply@localhost.com\n";
    echo "- From Name: LinkNest Monitor\n\n";
    echo "Test Users Available:\n";
    echo "- test@localhost.com\n";
    echo "- admin@localhost.com\n";
    echo "- zafar@localhost.com\n";
    echo "- noreply@localhost.com\n\n";
    echo "Note: Make sure Mercury mail server is running in XAMPP Control Panel.\n";
    echo "You can test the email configuration from the SMTP Settings page in your application.\n";
    
} catch (Exception $e) {
    if (isset($db)) {
        $db->rollBack();
    }
    echo "Error configuring Mercury email server: " . $e->getMessage() . "\n";
    exit(1);
}
