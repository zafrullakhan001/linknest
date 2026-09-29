<?php
/**
 * Force Reset Admin Password + Enable Local Auth
 *
 * Use when locked out of LinkNest (forgotten local admin password and/or
 * Local authentication was disabled in Settings → Access → Sign-in).
 *
 * This script:
 *   1. Ensures settings.local_auth_enabled = '1' (turns Local auth back on)
 *   2. Clears the public settings response cache (if present)
 *   3. Resets the local admin user's password_hash
 *
 * Only local accounts (auth_source = 'local' or NULL) can be reset.
 * LDAP/SAML passwords must be changed in the identity provider.
 *
 * Usage:
 *   Command line: php reset_admin_password.php [username] [new_password]
 *   Web browser:  Access via browser and follow prompts
 *
 * Examples:
 *   php scripts/reset_admin_password.php admin "NewStrongPass1!"
 *   php scripts/reset_admin_password.php
 *
 * Security Note: Remove or block public access to this script after use in production.
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

$dbPath = __DIR__ . '/../data/linknest.db';
$cacheDir = __DIR__ . '/../data/cache';
$isCli = php_sapi_name() === 'cli';

function output($message, $type = 'info') {
    global $isCli;
    if ($isCli) {
        $colors = [
            'info' => '',
            'success' => "\033[32m",
            'error' => "\033[31m",
            'warning' => "\033[33m",
            'reset' => "\033[0m",
        ];
        echo $colors[$type] . $message . $colors['reset'] . PHP_EOL;
    } else {
        $styles = [
            'info' => 'color: #333;',
            'success' => 'color: #28a745; font-weight: bold;',
            'error' => 'color: #dc3545; font-weight: bold;',
            'warning' => 'color: #b45309; font-weight: bold;',
        ];
        echo '<p style="' . ($styles[$type] ?? $styles['info']) . '">' . htmlspecialchars($message) . '</p>';
    }
}

function getInput($prompt) {
    global $isCli;
    if ($isCli) {
        echo $prompt;
        return trim(fgets(STDIN));
    }
    return null;
}

/**
 * Turn Local authentication back on and drop stale settings cache files.
 *
 * @return bool true if the setting was changed from off → on
 */
function ensureLocalAuthEnabled(PDO $db, string $cacheDir): bool {
    $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'local_auth_enabled' LIMIT 1");
    $stmt->execute();
    $current = $stmt->fetchColumn();
    $wasOff = ($current === false || $current === null || (string)$current === '0');

    $now = time();
    $upsert = $db->prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
    );
    $upsert->execute(['local_auth_enabled', '1', $now]);

    // Drop response-cache files that may still advertise local auth as disabled.
    if (is_dir($cacheDir)) {
        foreach (['settings_public.json', 'setting_guest_access_enabled.json'] as $file) {
            $path = $cacheDir . DIRECTORY_SEPARATOR . $file;
            if (is_file($path)) {
                @unlink($path);
            }
        }
        // Also clear any hashed settings_public cache variants.
        foreach (glob($cacheDir . DIRECTORY_SEPARATOR . '*settings_public*') ?: [] as $path) {
            if (is_file($path)) {
                @unlink($path);
            }
        }
    }

    return $wasOff;
}

/**
 * @return array{ok:bool, message:string, type:string}
 */
function resetLocalAdminPassword(PDO $db, string $username, string $newPassword): array {
    if ($username === '') {
        return ['ok' => false, 'message' => 'Username is required.', 'type' => 'error'];
    }
    if ($newPassword === '') {
        return ['ok' => false, 'message' => 'New password is required.', 'type' => 'error'];
    }
    if (strlen($newPassword) < 6) {
        return ['ok' => false, 'message' => 'Password must be at least 6 characters long.', 'type' => 'error'];
    }

    $stmt = $db->prepare('SELECT id, username, email, auth_source FROM users WHERE username = ? AND is_admin = 1');
    $stmt->execute([$username]);
    $admin = $stmt->fetch();

    if (!$admin) {
        return ['ok' => false, 'message' => "Admin user '$username' not found.", 'type' => 'error'];
    }

    $source = strtolower(trim((string)($admin['auth_source'] ?? 'local')));
    if ($source === 'ldap' || $source === 'saml') {
        return [
            'ok' => false,
            'message' => "Cannot reset password for $source-authenticated users. Change the password in your identity provider.",
            'type' => 'error',
        ];
    }

    $passwordHash = password_hash($newPassword, PASSWORD_DEFAULT);
    $updateStmt = $db->prepare('UPDATE users SET password_hash = ? WHERE id = ? AND is_admin = 1');
    $updateStmt->execute([$passwordHash, $admin['id']]);

    if ($updateStmt->rowCount() <= 0) {
        return ['ok' => false, 'message' => 'Failed to update password. No rows were affected.', 'type' => 'error'];
    }

    return [
        'ok' => true,
        'message' => "Admin password for '$username' has been reset successfully.",
        'type' => 'success',
    ];
}

if (!file_exists($dbPath)) {
    output("Error: Database file not found at: $dbPath", 'error');
    output('Please ensure the database file exists.', 'error');
    exit(1);
}

if (!extension_loaded('pdo_sqlite')) {
    output('Error: PDO SQLite extension is not enabled.', 'error');
    output('Please enable it in php.ini', 'error');
    exit(1);
}

try {
    $db = new PDO('sqlite:' . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    output('Error: Failed to connect to database: ' . $e->getMessage(), 'error');
    exit(1);
}

// ---------- Web interface ----------
if (!$isCli) {
    header('Content-Type: text/html; charset=utf-8');

    echo '<!DOCTYPE html>
<html>
<head>
    <title>Reset Admin Password - LinkNest</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 640px; margin: 50px auto; padding: 20px; }
        form { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        input, select { width: 100%; padding: 10px; margin: 10px 0; box-sizing: border-box; }
        button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 3px; cursor: pointer; }
        button:hover { background: #0056b3; }
        .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px; }
        .info { background: #e7f3ff; border: 1px solid #90caf9; padding: 15px; margin: 20px 0; border-radius: 5px; }
    </style>
</head>
<body>
    <h1>Reset Admin Password</h1>
    <div class="warning">
        <strong>Warning:</strong> Use only for lockout recovery. After use, remove or block public access to this script.
    </div>
    <div class="info">
        This tool also turns <strong>Local authentication</strong> back on if it was disabled,
        then resets the local admin password so you can sign in again.
    </div>';

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $username = trim($_POST['username'] ?? '');
        $newPassword = $_POST['new_password'] ?? '';

        try {
            $enabledLocal = ensureLocalAuthEnabled($db, $cacheDir);
            if ($enabledLocal) {
                output('Local authentication was off — it has been enabled again.', 'warning');
            } else {
                output('Local authentication is already enabled.', 'info');
            }

            $result = resetLocalAdminPassword($db, $username, $newPassword);
            output(($result['ok'] ? 'Success: ' : 'Error: ') . $result['message'], $result['type']);
            if ($result['ok']) {
                output('Sign in with the new password using Local authentication.', 'info');
            }
        } catch (Throwable $e) {
            output('Error: ' . $e->getMessage(), 'error');
        }

        echo '<br><a href="' . htmlspecialchars($_SERVER['PHP_SELF']) . '">Run again</a>';
    } else {
        $stmt = $db->prepare('SELECT username, email, auth_source FROM users WHERE is_admin = 1 ORDER BY username');
        $stmt->execute();
        $admins = $stmt->fetchAll();

        if (empty($admins)) {
            output('Error: No admin users found in the database.', 'error');
        } else {
            echo '<form method="POST">
                <label>Admin Username:</label>
                <select name="username" required>';
            foreach ($admins as $admin) {
                $display = $admin['username'] . ' (' . $admin['email'] . ')';
                $src = strtolower(trim((string)($admin['auth_source'] ?? 'local')));
                if ($src === 'ldap' || $src === 'saml') {
                    $display .= ' [' . strtoupper($src) . ' — cannot reset]';
                } else {
                    $display .= ' [Local]';
                }
                echo '<option value="' . htmlspecialchars($admin['username']) . '">' . htmlspecialchars($display) . '</option>';
            }
            echo '</select>
                <label>New Password:</label>
                <input type="password" name="new_password" required minlength="6" placeholder="Minimum 6 characters">
                <button type="submit">Enable Local Auth + Reset Password</button>
            </form>';
        }
    }

    echo '</body></html>';
    exit;
}

// ---------- Command line ----------
output('LinkNest - Admin Lockout Recovery', 'info');
output('================================', 'info');
output('1) Enable Local authentication (if off)', 'info');
output('2) Reset local admin password', 'info');
output('', 'info');

$username = $argv[1] ?? null;
$newPassword = $argv[2] ?? null;

try {
    $enabledLocal = ensureLocalAuthEnabled($db, $cacheDir);
    if ($enabledLocal) {
        output('Local authentication was OFF — re-enabled successfully.', 'success');
    } else {
        output('Local authentication is already ON.', 'info');
    }
    output('', 'info');
} catch (Throwable $e) {
    output('Error enabling Local authentication: ' . $e->getMessage(), 'error');
    exit(1);
}

if (empty($username)) {
    $stmt = $db->prepare('SELECT username, email, auth_source FROM users WHERE is_admin = 1 ORDER BY username');
    $stmt->execute();
    $admins = $stmt->fetchAll();

    if (empty($admins)) {
        output('Error: No admin users found in the database.', 'error');
        exit(1);
    }

    output('Available admin users:', 'info');
    foreach ($admins as $admin) {
        $src = strtolower(trim((string)($admin['auth_source'] ?? 'local')));
        $authInfo = ($src === 'ldap' || $src === 'saml')
            ? ' [' . strtoupper($src) . ' - cannot reset]'
            : ' [Local]';
        output('  - ' . $admin['username'] . ' (' . $admin['email'] . ')' . $authInfo, 'info');
    }
    output('', 'info');
    $username = getInput('Enter admin username to reset: ');
}

if (empty($username)) {
    output('Error: Username is required.', 'error');
    exit(1);
}

if (empty($newPassword)) {
    output('', 'info');
    output("Resetting password for: $username", 'info');
    $newPassword = getInput('Enter new password (minimum 6 characters): ');
    $confirmPassword = getInput('Confirm new password: ');
    if ($newPassword !== $confirmPassword) {
        output('Error: Passwords do not match.', 'error');
        exit(1);
    }
}

$result = resetLocalAdminPassword($db, (string)$username, (string)$newPassword);
output(($result['ok'] ? 'Success: ' : 'Error: ') . $result['message'], $result['type']);
if (!$result['ok']) {
    exit(1);
}

output('', 'info');
output('Recovery complete. Sign in with Local authentication and the new password.', 'success');
output('Tip: After you regain access, change the password again from the admin profile.', 'info');
