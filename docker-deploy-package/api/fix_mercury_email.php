<?php
/**
 * Fix Email Address for Mercury Mail Server
 * 
 * This script converts email addresses to use @localhost domain
 * which Mercury accepts by default for testing.
 */

require_once __DIR__ . '/config.php';

echo "====================================================\n";
echo "Mercury Email Address Fixer\n";
echo "====================================================\n\n";

try {
    $db = getDB();
    
    // Get all users
    $stmt = $db->prepare('SELECT id, username, email FROM users');
    $stmt->execute();
    $users = $stmt->fetchAll();
    
    if (empty($users)) {
        echo "No users found in database.\n";
        exit(0);
    }
    
    echo "Current user emails:\n";
    echo "----------------------------------------\n";
    foreach ($users as $user) {
        echo sprintf("ID: %d | Username: %s | Email: %s\n", $user['id'], $user['username'], $user['email']);
    }
    echo "\n";
    
    $db->beginTransaction();
    $updated = 0;
    
    foreach ($users as $user) {
        $email = $user['email'];
        
        // Convert email to @localhost format if it has a domain extension
        if (preg_match('/^(.+)@(.+)\.(.+)$/', $email, $matches)) {
            $username = $matches[1];
            $domain = $matches[2];
            $extension = $matches[3];
            
            // Skip if already @localhost
            if ($domain === 'localhost' && empty($extension)) {
                echo "Skipping {$email} (already @localhost)\n";
                continue;
            }
            
            // Convert to @localhost
            $newEmail = $username . '@localhost';
            
            $updateStmt = $db->prepare('UPDATE users SET email = ? WHERE id = ?');
            $updateStmt->execute([$newEmail, $user['id']]);
            
            echo "Updated: {$email} -> {$newEmail}\n";
            $updated++;
        }
    }
    
    $db->commit();
    
    echo "\n";
    echo "====================================================\n";
    if ($updated > 0) {
        echo "Successfully updated {$updated} email address(es)\n";
        echo "====================================================\n\n";
        echo "All email addresses now use @localhost domain which\n";
        echo "Mercury mail server accepts by default.\n\n";
        echo "You can now test email sending from LinkNest.\n\n";
    } else {
        echo "No email addresses needed updating.\n";
        echo "====================================================\n\n";
    }
    
} catch (Exception $e) {
    if (isset($db) && $db->inTransaction()) {
        $db->rollBack();
    }
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
