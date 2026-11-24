<?php
/**
 * Force Reset Admin Password Script
 * 
 * This script allows you to reset the admin password in the SQLite database
 * when the password has been forgotten. It only works for local authentication
 * users (auth_source = 'local' or NULL).
 * 
 * Usage:
 *   Command line: php reset_admin_password.php [username] [new_password]
 *   Web browser: Access via browser and follow prompts
 * 
 * Security Note: This script should be removed or secured after use in production.
 */

// Set error reporting for debugging
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Database path (relative to this script)
$dbPath = __DIR__ . '/../data/linknest.db';

// Check if running from command line
$isCli = php_sapi_name() === 'cli';

// Function to display output
function output($message, $type = 'info') {
    global $isCli;
    if ($isCli) {
        $colors = [
            'info' => '',
            'success' => "\033[32m", // Green
            'error' => "\033[31m",   // Red
            'warning' => "\033[33m", // Yellow
            'reset' => "\033[0m"     // Reset
        ];
        echo $colors[$type] . $message . $colors['reset'] . PHP_EOL;
    } else {
        $styles = [
            'info' => 'color: #333;',
            'success' => 'color: #28a745; font-weight: bold;',
            'error' => 'color: #dc3545; font-weight: bold;',
            'warning' => 'color: #ffc107; font-weight: bold;'
        ];
        echo '<p style="' . ($styles[$type] ?? $styles['info']) . '">' . htmlspecialchars($message) . '</p>';
    }
}

// Function to get input
function getInput($prompt) {
    global $isCli;
    if ($isCli) {
        echo $prompt;
        return trim(fgets(STDIN));
    } else {
        // For web interface, we'll use POST
        return null;
    }
}

// Check if database exists
if (!file_exists($dbPath)) {
    output("Error: Database file not found at: $dbPath", 'error');
    output("Please ensure the database file exists.", 'error');
    exit(1);
}

// Check if PDO SQLite is available
if (!extension_loaded('pdo_sqlite')) {
    output("Error: PDO SQLite extension is not enabled.", 'error');
    output("Please enable it in php.ini", 'error');
    exit(1);
}

// Connect to database
try {
    $db = new PDO('sqlite:' . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    output("Error: Failed to connect to database: " . $e->getMessage(), 'error');
    exit(1);
}

// Handle web interface
if (!$isCli) {
    // Set content type
    header('Content-Type: text/html; charset=utf-8');
    
    // Simple HTML interface
    echo '<!DOCTYPE html>
<html>
<head>
    <title>Reset Admin Password - LinkNest</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        form { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        input, select { width: 100%; padding: 10px; margin: 10px 0; box-sizing: border-box; }
        button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 3px; cursor: pointer; }
        button:hover { background: #0056b3; }
        .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px; }
    </style>
</head>
<body>
    <h1>Reset Admin Password</h1>
    <div class="warning">
        <strong>Warning:</strong> This script should only be used when the admin password has been forgotten.
        After use, consider removing or securing this script.
    </div>';
    
    // Process form submission
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $username = trim($_POST['username'] ?? '');
        $newPassword = $_POST['new_password'] ?? '';
        
        if (empty($username)) {
            output("Error: Username is required.", 'error');
        } elseif (empty($newPassword)) {
            output("Error: New password is required.", 'error');
        } elseif (strlen($newPassword) < 6) {
            output("Error: Password must be at least 6 characters long.", 'error');
        } else {
            // Find admin user
            $stmt = $db->prepare('SELECT id, username, email, auth_source FROM users WHERE username = ? AND is_admin = 1');
            $stmt->execute([$username]);
            $admin = $stmt->fetch();
            
            if (!$admin) {
                output("Error: Admin user '$username' not found.", 'error');
            } elseif ($admin['auth_source'] === 'ldap') {
                output("Error: Cannot reset password for LDAP-authenticated users.", 'error');
                output("User '$username' uses LDAP authentication. Please reset the password in your LDAP directory.", 'error');
            } else {
                // Update password
                $passwordHash = password_hash($newPassword, PASSWORD_DEFAULT);
                $updateStmt = $db->prepare('UPDATE users SET password_hash = ? WHERE id = ? AND is_admin = 1');
                $updateStmt->execute([$passwordHash, $admin['id']]);
                
                if ($updateStmt->rowCount() > 0) {
                    output("Success: Admin password for '$username' has been reset successfully!", 'success');
                    output("You can now log in with the new password.", 'info');
                } else {
                    output("Error: Failed to update password.", 'error');
                }
            }
        }
        
        echo '<br><a href="' . $_SERVER['PHP_SELF'] . '">Reset Another Password</a>';
    } else {
        // Show form
        // Get list of admin users
        $stmt = $db->prepare('SELECT username, email, auth_source FROM users WHERE is_admin = 1 ORDER BY username');
        $stmt->execute();
        $admins = $stmt->fetchAll();
        
        if (empty($admins)) {
            output("Error: No admin users found in the database.", 'error');
        } else {
            echo '<form method="POST">
                <label>Admin Username:</label>
                <select name="username" required>';
            foreach ($admins as $admin) {
                $display = $admin['username'] . ' (' . $admin['email'] . ')';
                if ($admin['auth_source'] === 'ldap') {
                    $display .= ' [LDAP]';
                }
                echo '<option value="' . htmlspecialchars($admin['username']) . '">' . htmlspecialchars($display) . '</option>';
            }
            echo '</select>
                <label>New Password:</label>
                <input type="password" name="new_password" required minlength="6" placeholder="Minimum 6 characters">
                <button type="submit">Reset Password</button>
            </form>';
        }
    }
    
    echo '</body></html>';
    exit;
}

// Command line interface
output("LinkNest - Admin Password Reset Tool", 'info');
output("====================================", 'info');
output("", 'info');

// Get command line arguments
$username = $argv[1] ?? null;
$newPassword = $argv[2] ?? null;

// If arguments not provided, prompt for them
if (empty($username)) {
    // List available admin users
    $stmt = $db->prepare('SELECT username, email, auth_source FROM users WHERE is_admin = 1 ORDER BY username');
    $stmt->execute();
    $admins = $stmt->fetchAll();
    
    if (empty($admins)) {
        output("Error: No admin users found in the database.", 'error');
        exit(1);
    }
    
    output("Available admin users:", 'info');
    foreach ($admins as $admin) {
        $authInfo = $admin['auth_source'] === 'ldap' ? ' [LDAP - cannot reset]' : ' [Local]';
        output("  - " . $admin['username'] . " (" . $admin['email'] . ")" . $authInfo, 'info');
    }
    output("", 'info');
    
    $username = getInput("Enter admin username to reset: ");
}

if (empty($username)) {
    output("Error: Username is required.", 'error');
    exit(1);
}

// Find admin user
$stmt = $db->prepare('SELECT id, username, email, auth_source FROM users WHERE username = ? AND is_admin = 1');
$stmt->execute([$username]);
$admin = $stmt->fetch();

if (!$admin) {
    output("Error: Admin user '$username' not found.", 'error');
    exit(1);
}

// Check if it's an LDAP user
if ($admin['auth_source'] === 'ldap') {
    output("Error: Cannot reset password for LDAP-authenticated users.", 'error');
    output("User '$username' uses LDAP authentication. Please reset the password in your LDAP directory.", 'error');
    exit(1);
}

// Get new password
if (empty($newPassword)) {
    output("", 'info');
    output("Resetting password for: " . $admin['username'] . " (" . $admin['email'] . ")", 'info');
    $newPassword = getInput("Enter new password (minimum 6 characters): ");
}

if (empty($newPassword)) {
    output("Error: New password is required.", 'error');
    exit(1);
}

if (strlen($newPassword) < 6) {
    output("Error: Password must be at least 6 characters long.", 'error');
    exit(1);
}

// Confirm password
if (empty($argv[2])) {
    $confirmPassword = getInput("Confirm new password: ");
    if ($newPassword !== $confirmPassword) {
        output("Error: Passwords do not match.", 'error');
        exit(1);
    }
}

// Update password
try {
    $passwordHash = password_hash($newPassword, PASSWORD_DEFAULT);
    $updateStmt = $db->prepare('UPDATE users SET password_hash = ? WHERE id = ? AND is_admin = 1');
    $updateStmt->execute([$passwordHash, $admin['id']]);
    
    if ($updateStmt->rowCount() > 0) {
        output("", 'info');
        output("Success: Admin password for '$username' has been reset successfully!", 'success');
        output("You can now log in with the new password.", 'info');
    } else {
        output("Error: Failed to update password. No rows were affected.", 'error');
        exit(1);
    }
} catch (PDOException $e) {
    output("Error: Failed to update password: " . $e->getMessage(), 'error');
    exit(1);
}

output("", 'info');
output("Password reset complete!", 'success');





































