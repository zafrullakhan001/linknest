<?php
/**
 * Migration script to encrypt existing plain text LDAP bind passwords in the database
 * 
 * This script will:
 * 1. Find all LDAP bind passwords in the settings table
 * 2. Check if they are already encrypted (contain dots in the format: base64.base64.base64)
 * 3. Encrypt any plain text passwords
 * 4. Update the database with encrypted passwords
 * 
 * Usage: php scripts/encrypt_ldap_passwords.php
 */

require_once __DIR__ . '/../api/config.php';

function isEncrypted($password) {
    if (empty($password)) {
        return false;
    }
    
    // Encrypted passwords have the format: base64(iv).base64(tag).base64(encrypted)
    // They will contain exactly 2 dots
    if (strpos($password, '.') === false) {
        return false; // No dots = plain text
    }
    
    $parts = explode('.', $password);
    if (count($parts) !== 3) {
        return false; // Wrong format = plain text
    }
    
    // Try to decode the parts to verify they're valid base64
    foreach ($parts as $part) {
        $decoded = @base64_decode($part, true);
        if ($decoded === false || empty($decoded)) {
            return false; // Invalid base64 = plain text
        }
    }
    
    return true; // Valid encrypted format
}

try {
    $db = getDB();
    
    // Get current LDAP bind password
    $stmt = $db->prepare('SELECT key, value FROM settings WHERE key = ?');
    $stmt->execute(['ldap_bind_password']);
    $row = $stmt->fetch();
    
    if (!$row) {
        echo "No LDAP bind password found in settings table.\n";
        exit(0);
    }
    
    $currentPassword = $row['value'];
    
    if (empty($currentPassword)) {
        echo "LDAP bind password is empty. Nothing to encrypt.\n";
        exit(0);
    }
    
    // Check if already encrypted
    if (isEncrypted($currentPassword)) {
        echo "LDAP bind password is already encrypted. No action needed.\n";
        exit(0);
    }
    
    echo "Found plain text LDAP bind password. Encrypting...\n";
    
    // Encrypt the password
    try {
        $encryptedPassword = encryptPassword($currentPassword);
        
        // Update the database
        $updateStmt = $db->prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?');
        $updateStmt->execute([$encryptedPassword, time(), 'ldap_bind_password']);
        
        if ($updateStmt->rowCount() > 0) {
            echo "✓ Successfully encrypted LDAP bind password!\n";
            echo "  The password has been encrypted and stored securely.\n";
        } else {
            echo "✗ Failed to update password in database.\n";
            exit(1);
        }
        
    } catch (Exception $e) {
        echo "✗ Error encrypting password: " . $e->getMessage() . "\n";
        exit(1);
    }
    
} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
    exit(1);
}
























