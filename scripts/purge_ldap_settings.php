<?php
require_once dirname(__DIR__) . '/api/config.php';

$db = getDB();

echo "=== LDAP settings BEFORE purge ===\n";
$stmt = $db->query("SELECT key, length(value) AS len, value FROM settings WHERE key LIKE 'ldap_%' ORDER BY key");
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
if (!$rows) {
    echo "(none)\n";
} else {
    foreach ($rows as $r) {
        $preview = $r['value'];
        if (stripos($r['key'], 'password') !== false) {
            $preview = '[redacted len=' . $r['len'] . ']';
        } elseif (strlen($preview) > 160) {
            $preview = substr($preview, 0, 160) . '...';
        }
        echo $r['key'] . "\t" . $r['len'] . "\t" . $preview . "\n";
    }
}

$tables = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%ldap%' OR name LIKE '%directory%')")->fetchAll(PDO::FETCH_COLUMN);
echo "ldap_tables: " . (empty($tables) ? '(none)' : implode(',', $tables)) . "\n";

// Purge all ldap_* settings keys (includes ldap_servers, bind DN/password, etc.)
$deleted = $db->exec("DELETE FROM settings WHERE key LIKE 'ldap_%'");
echo "\nDeleted settings rows: " . (int)$deleted . "\n";

$db->prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
    ->execute(['ldap_servers', '[]', time()]);
$db->prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
    ->execute(['ldap_enabled', '0', time()]);
echo "Reset ldap_servers=[] and ldap_enabled=0\n";

echo "\n=== LDAP settings AFTER purge ===\n";
$after = $db->query("SELECT key, value FROM settings WHERE key LIKE 'ldap_%' ORDER BY key")->fetchAll(PDO::FETCH_ASSOC);
if (!$after) {
    echo "(none — clean)\n";
} else {
    foreach ($after as $r) {
        echo $r['key'] . "\t" . $r['value'] . "\n";
    }
}

echo "\nDone.\n";
