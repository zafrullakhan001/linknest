<?php
/**
 * Unlock login allowlist (Restrict login to authorized users)
 *
 * Use when login allowlist is on and you cannot reach Admin to turn it off.
 * Administrators can always sign in with their credentials even when not on
 * the allowlist. Prefer that first.
 *
 * This script:
 *   1. Sets settings.login_allowlist_enabled = '0'
 *   2. Optionally clears user/group lists (--clear-lists)
 *   3. Clears public settings response cache under data/cache/
 *
 * Usage:
 *   Command line: php unlock_login_allowlist.php [--clear-lists] [--yes]
 *   Web browser:  Open the script and confirm
 *
 * Examples:
 *   php scripts/unlock_login_allowlist.php --yes
 *   php scripts/unlock_login_allowlist.php --clear-lists --yes
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
        echo ($colors[$type] ?? '') . $message . ($colors['reset'] ?? '') . PHP_EOL;
    } else {
        $styles = [
            'info' => 'color: #333;',
            'success' => 'color: #28a745; font-weight: bold;',
            'error' => 'color: #dc3545; font-weight: bold;',
            'warning' => 'color: #b45309; font-weight: bold;',
        ];
        echo '<p style="' . ($styles[$type] ?? $styles['info']) . '">' . htmlspecialchars((string) $message) . '</p>';
    }
}

function clearSettingsCache(string $cacheDir): void {
    if (!is_dir($cacheDir)) {
        return;
    }
    foreach (['settings_public.json', 'setting_guest_access_enabled.json'] as $file) {
        $path = $cacheDir . DIRECTORY_SEPARATOR . $file;
        if (is_file($path)) {
            @unlink($path);
        }
    }
    foreach (glob($cacheDir . DIRECTORY_SEPARATOR . '*settings_public*') ?: [] as $path) {
        if (is_file($path)) {
            @unlink($path);
        }
    }
}

/**
 * @return array{ok:bool, message:string, type:string, was_enabled?:bool, lists_cleared?:bool}
 */
function unlockLoginAllowlist(PDO $db, string $cacheDir, bool $clearLists): array {
    $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'login_allowlist_enabled' LIMIT 1");
    $stmt->execute();
    $current = $stmt->fetchColumn();
    $wasEnabled = ($current === '1' || $current === 1 || $current === true);

    $now = time();
    $upsert = $db->prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
    );
    $upsert->execute(['login_allowlist_enabled', '0', $now]);

    $listsCleared = false;
    if ($clearLists) {
        $upsert->execute(['login_allowed_user_ids', '[]', $now]);
        $upsert->execute(['login_allowed_ldap_groups', '', $now]);
        $listsCleared = true;
    }

    clearSettingsCache($cacheDir);

    $msg = $wasEnabled
        ? 'Login allowlist has been turned OFF. All approved users can sign in again (subject to other access rules).'
        : 'Login allowlist was already off. Settings cache was cleared.';
    if ($listsCleared) {
        $msg .= ' Authorized user and AD group lists were cleared.';
    }

    return [
        'ok' => true,
        'message' => $msg,
        'type' => 'success',
        'was_enabled' => $wasEnabled,
        'lists_cleared' => $listsCleared,
    ];
}

function readAllowlistStatus(PDO $db): array {
    $enabled = '0';
    $userIdsRaw = '[]';
    $groupsRaw = '';
    $stmt = $db->prepare("SELECT key, value FROM settings WHERE key IN ('login_allowlist_enabled', 'login_allowed_user_ids', 'login_allowed_ldap_groups')");
    $stmt->execute();
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        if ($row['key'] === 'login_allowlist_enabled') {
            $enabled = (string) $row['value'];
        } elseif ($row['key'] === 'login_allowed_user_ids') {
            $userIdsRaw = (string) $row['value'];
        } elseif ($row['key'] === 'login_allowed_ldap_groups') {
            $groupsRaw = (string) $row['value'];
        }
    }
    $userCount = 0;
    if (trim($userIdsRaw) !== '') {
        $decoded = json_decode($userIdsRaw, true);
        if (is_array($decoded)) {
            $userCount = count($decoded);
        }
    }
    $groupCount = 0;
    if (trim($groupsRaw) !== '') {
        $groupCount = count(array_filter(array_map('trim', preg_split('/\R/', str_replace(';', "\n", $groupsRaw)) ?: [])));
    }
    return [
        'enabled' => ($enabled === '1'),
        'user_count' => $userCount,
        'group_count' => $groupCount,
    ];
}

if (!file_exists($dbPath)) {
    output('Error: Database not found at ' . $dbPath, 'error');
    exit(1);
}

try {
    $db = new PDO('sqlite:' . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (Throwable $e) {
    output('Error connecting to database: ' . $e->getMessage(), 'error');
    exit(1);
}

$clearLists = false;
$assumeYes = false;
if ($isCli) {
    global $argv;
    $args = array_slice($argv ?? [], 1);
    foreach ($args as $arg) {
        $a = strtolower(trim((string) $arg));
        if ($a === '--clear-lists' || $a === '-c') {
            $clearLists = true;
        } elseif ($a === '--yes' || $a === '-y') {
            $assumeYes = true;
        } elseif ($a === '--help' || $a === '-h') {
            echo "Unlock login allowlist\n\n";
            echo "Usage:\n";
            echo "  php unlock_login_allowlist.php [--clear-lists] [--yes]\n\n";
            echo "  --clear-lists, -c   Also clear authorized users and AD group lists\n";
            echo "  --yes, -y           Skip confirmation prompt\n\n";
            echo "Tip: Administrators can always sign in with credentials even when not\n";
            echo "on the allowlist. Prefer Admin → Access to update the list; use this\n";
            echo "script when you cannot reach the Admin UI.\n";
            exit(0);
        }
    }
}

$status = readAllowlistStatus($db);

if ($isCli) {
    output('LinkNest — Unlock login allowlist', 'info');
    output('Database: ' . $dbPath, 'info');
    output(
        'Current allowlist: ' . ($status['enabled'] ? 'ON' : 'OFF') .
        ' | authorized users: ' . (string) $status['user_count'] .
        ' | AD groups: ' . (string) $status['group_count'],
        'info'
    );
    output('Administrators can always sign in with their password even when not on the list.', 'warning');

    if (!$assumeYes) {
        echo 'Turn OFF login allowlist' . ($clearLists ? ' and clear lists' : '') . '? [y/N] ';
        $line = trim((string) fgets(STDIN));
        if (strtolower($line) !== 'y' && strtolower($line) !== 'yes') {
            output('Cancelled. No changes made.', 'warning');
            exit(0);
        }
    }

    try {
        $result = unlockLoginAllowlist($db, $cacheDir, $clearLists);
        output($result['message'], $result['type']);
        output('Next: reload the site. Optionally sign in as admin and update the allowlist under Settings → Access → Guest & UI.', 'info');
    } catch (Throwable $e) {
        output('Error: ' . $e->getMessage(), 'error');
        exit(1);
    }
    exit(0);
}

// --- Web UI ---
header('Content-Type: text/html; charset=utf-8');
echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unlock Login Allowlist</title>
<style>
body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;background:#f8fafc;color:#0f172a}
code{background:#e2e8f0;padding:0.1rem 0.35rem;border-radius:0.25rem}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:0.75rem;padding:1.25rem;margin:1rem 0}
button{background:#0ea5e9;color:#fff;border:0;padding:0.6rem 1rem;border-radius:0.5rem;font-weight:600;cursor:pointer}
label{display:flex;align-items:center;gap:0.5rem;margin:0.75rem 0}
</style></head><body>';
echo '<h1>Unlock login allowlist</h1>';
echo '<div class="card"><p><strong>Prefer admin sign-in first.</strong> Administrators can always log in with their credentials even when not on the authorized user or AD group list. Then open <em>Admin → Settings → Access → Guest &amp; UI</em> to update the list or turn it off.</p></div>';

echo '<div class="card">';
echo '<p>Allowlist enabled: <strong>' . ($status['enabled'] ? 'Yes' : 'No') . '</strong><br>';
echo 'Authorized users: <strong>' . (int) $status['user_count'] . '</strong><br>';
echo 'AD groups: <strong>' . (int) $status['group_count'] . '</strong></p>';
echo '</div>';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $clearLists = !empty($_POST['clear_lists']);
    try {
        $result = unlockLoginAllowlist($db, $cacheDir, $clearLists);
        output($result['message'], $result['type']);
        output('Reload the application home page.', 'info');
    } catch (Throwable $e) {
        output('Error: ' . $e->getMessage(), 'error');
    }
    echo '<p><a href="' . htmlspecialchars($_SERVER['PHP_SELF'] ?? '') . '">Back</a></p>';
} else {
    echo '<form method="POST" class="card">';
    echo '<label><input type="checkbox" name="clear_lists" value="1"> Also clear authorized users and AD group lists</label>';
    echo '<p><button type="submit">Turn OFF login allowlist</button></p>';
    echo '</form>';
    echo '<p>CLI: <code>php scripts/unlock_login_allowlist.php --yes</code></p>';
}

echo '</body></html>';
