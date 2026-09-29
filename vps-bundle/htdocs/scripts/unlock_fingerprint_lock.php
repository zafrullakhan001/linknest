<?php
/**
 * Unlock Fingerprint-only access (site fingerprint lock)
 *
 * Use when Fingerprint-only access is on and the allowlisted browser hash
 * changed (browser update, excluded signals, new PC), so guests and
 * non-admin users are locked out — or when you need to turn the lock off
 * from the server without using the Admin UI.
 *
 * Administrators can always sign in with their credentials even when their
 * browser fingerprint does not match the allowlist. Prefer that first.
 * Use this script when you cannot reach Admin → Access to disable the lock.
 *
 * This script:
 *   1. Sets settings.fingerprint_lock_enabled = '0'
 *   2. Optionally clears settings.fingerprint_lock_hashes (--clear-hashes)
 *   3. Clears public settings response cache under data/cache/
 *
 * Usage:
 *   Command line: php unlock_fingerprint_lock.php [--clear-hashes] [--yes]
 *   Web browser:  Open the script and confirm
 *
 * Examples:
 *   php scripts/unlock_fingerprint_lock.php --yes
 *   php scripts/unlock_fingerprint_lock.php --clear-hashes --yes
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
 * @return array{ok:bool, message:string, type:string, was_enabled?:bool, hashes_cleared?:bool}
 */
function unlockFingerprintLock(PDO $db, string $cacheDir, bool $clearHashes): array {
    $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'fingerprint_lock_enabled' LIMIT 1");
    $stmt->execute();
    $current = $stmt->fetchColumn();
    $wasEnabled = ($current === '1' || $current === 1 || $current === true);

    $now = time();
    $upsert = $db->prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
    );
    $upsert->execute(['fingerprint_lock_enabled', '0', $now]);

    $hashesCleared = false;
    if ($clearHashes) {
        $upsert->execute(['fingerprint_lock_hashes', '[]', $now]);
        $hashesCleared = true;
    }

    clearSettingsCache($cacheDir);

    $msg = $wasEnabled
        ? 'Fingerprint-only access has been turned OFF. Guests and public users can load spaces again (subject to Guest Access).'
        : 'Fingerprint-only access was already off. Settings cache was cleared.';
    if ($hashesCleared) {
        $msg .= ' Allowed fingerprint hashes were cleared.';
    }

    return [
        'ok' => true,
        'message' => $msg,
        'type' => 'success',
        'was_enabled' => $wasEnabled,
        'hashes_cleared' => $hashesCleared,
    ];
}

function readLockStatus(PDO $db): array {
    $enabled = '0';
    $hashesRaw = '';
    $stmt = $db->prepare("SELECT key, value FROM settings WHERE key IN ('fingerprint_lock_enabled', 'fingerprint_lock_hashes')");
    $stmt->execute();
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        if ($row['key'] === 'fingerprint_lock_enabled') {
            $enabled = (string) $row['value'];
        } elseif ($row['key'] === 'fingerprint_lock_hashes') {
            $hashesRaw = (string) $row['value'];
        }
    }
    $count = 0;
    if (trim($hashesRaw) !== '') {
        $decoded = json_decode($hashesRaw, true);
        if (is_array($decoded)) {
            $count = count($decoded);
        } elseif (trim($hashesRaw) !== '') {
            $count = preg_match_all('/lnfp_[a-f0-9]{64}|[a-f0-9]{64}/i', $hashesRaw) ?: 0;
        }
    }
    return [
        'enabled' => ($enabled === '1'),
        'hash_count' => $count,
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

$clearHashes = false;
$assumeYes = false;
if ($isCli) {
    global $argv;
    $args = array_slice($argv ?? [], 1);
    foreach ($args as $arg) {
        $a = strtolower(trim((string) $arg));
        if ($a === '--clear-hashes' || $a === '-c') {
            $clearHashes = true;
        } elseif ($a === '--yes' || $a === '-y') {
            $assumeYes = true;
        } elseif ($a === '--help' || $a === '-h') {
            echo "Unlock Fingerprint-only access\n\n";
            echo "Usage:\n";
            echo "  php unlock_fingerprint_lock.php [--clear-hashes] [--yes]\n\n";
            echo "  --clear-hashes, -c   Also clear the allowlist of fingerprint hashes\n";
            echo "  --yes, -y            Skip confirmation prompt\n\n";
            echo "Tip: Administrators can always sign in with credentials even when the\n";
            echo "browser fingerprint does not match. Prefer Admin → Access to update\n";
            echo "hashes; use this script when you cannot reach the Admin UI.\n";
            exit(0);
        }
    }
}

$status = readLockStatus($db);

if ($isCli) {
    output('LinkNest — Unlock Fingerprint-only access', 'info');
    output('Database: ' . $dbPath, 'info');
    output(
        'Current lock: ' . ($status['enabled'] ? 'ON' : 'OFF') .
        ' | allowlisted hashes: ' . (string) $status['hash_count'],
        'info'
    );
    output('Administrators can always sign in with their password even with a mismatched hash.', 'warning');

    if (!$assumeYes) {
        echo 'Turn OFF fingerprint-only access' . ($clearHashes ? ' and clear hashes' : '') . '? [y/N] ';
        $line = trim((string) fgets(STDIN));
        if (strtolower($line) !== 'y' && strtolower($line) !== 'yes') {
            output('Cancelled. No changes made.', 'warning');
            exit(0);
        }
    }

    try {
        $result = unlockFingerprintLock($db, $cacheDir, $clearHashes);
        output($result['message'], $result['type']);
        output('Next: reload the site. Optionally sign in as admin and update hashes under Settings → Access → Guest & UI.', 'info');
    } catch (Throwable $e) {
        output('Error: ' . $e->getMessage(), 'error');
        exit(1);
    }
    exit(0);
}

// --- Web UI ---
header('Content-Type: text/html; charset=utf-8');
echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unlock Fingerprint Lock</title>
<style>
body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;background:#f8fafc;color:#0f172a}
code{background:#e2e8f0;padding:0.1rem 0.35rem;border-radius:0.25rem}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:0.75rem;padding:1.25rem;margin:1rem 0}
button{background:#0ea5e9;color:#fff;border:0;padding:0.6rem 1rem;border-radius:0.5rem;font-weight:600;cursor:pointer}
label{display:flex;align-items:center;gap:0.5rem;margin:0.75rem 0}
</style></head><body>';
echo '<h1>Unlock Fingerprint-only access</h1>';
echo '<div class="card"><p><strong>Prefer admin sign-in first.</strong> Administrators can always log in with their credentials even when this browser’s fingerprint hash does not match the allowlist. Then open <em>Admin → Settings → Access → Guest &amp; UI</em> to update hashes or turn the lock off.</p>';
echo '<p>Use this page only when you cannot reach the Admin UI (for example Local auth is also broken — then also use <code>reset_admin_password.php</code>).</p></div>';

echo '<div class="card">';
echo '<p>Lock enabled: <strong>' . ($status['enabled'] ? 'Yes' : 'No') . '</strong><br>';
echo 'Allowlisted hashes: <strong>' . (int) $status['hash_count'] . '</strong></p>';
echo '</div>';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $clearHashes = !empty($_POST['clear_hashes']);
    try {
        $result = unlockFingerprintLock($db, $cacheDir, $clearHashes);
        output($result['message'], $result['type']);
        output('Reload the application home page.', 'info');
    } catch (Throwable $e) {
        output('Error: ' . $e->getMessage(), 'error');
    }
    echo '<p><a href="' . htmlspecialchars($_SERVER['PHP_SELF'] ?? '') . '">Back</a></p>';
} else {
    echo '<form method="POST" class="card">';
    echo '<label><input type="checkbox" name="clear_hashes" value="1"> Also clear allowed fingerprint hashes</label>';
    echo '<p><button type="submit">Turn OFF fingerprint-only access</button></p>';
    echo '</form>';
    echo '<p>CLI: <code>php scripts/unlock_fingerprint_lock.php --yes</code></p>';
}

echo '</body></html>';
