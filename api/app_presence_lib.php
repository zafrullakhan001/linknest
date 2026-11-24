<?php
/**
 * Live site presence: browsers currently using the app (footer "online now").
 * Heartbeats are ephemeral; stale rows are ignored and periodically deleted.
 */

if (!defined('LINKNEST_APP_PRESENCE_TTL')) {
    define('LINKNEST_APP_PRESENCE_TTL', 45);
}

if (!defined('LINKNEST_APP_PRESENCE_CLEANUP_TTL')) {
    define('LINKNEST_APP_PRESENCE_CLEANUP_TTL', 90);
}

function ensureAppPresenceTable(PDO $db): void
{
    static $ensured = false;
    if ($ensured) {
        return;
    }

    try {
        $db->exec('CREATE TABLE IF NOT EXISTS app_presence (
            visitor_key TEXT PRIMARY KEY,
            user_id INTEGER,
            last_seen INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_app_presence_last_seen ON app_presence(last_seen)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_app_presence_user ON app_presence(user_id)');
    } catch (PDOException $e) {
        error_log('ensureAppPresenceTable warning: ' . $e->getMessage());
    }

    $ensured = true;
}

function cleanupStaleAppPresence(PDO $db, int $now = null): void
{
    $cutoff = ($now ?? time()) - (int)LINKNEST_APP_PRESENCE_CLEANUP_TTL;
    try {
        $stmt = $db->prepare('DELETE FROM app_presence WHERE last_seen < ?');
        $stmt->execute([$cutoff]);
    } catch (PDOException $e) {
        error_log('cleanupStaleAppPresence warning: ' . $e->getMessage());
    }
}

function normalizeAppPresenceVisitorKey(string $visitorKey): string
{
    $visitorKey = trim($visitorKey);
    if ($visitorKey === '' || !preg_match('/^[a-zA-Z0-9_-]{8,64}$/', $visitorKey)) {
        return '';
    }
    return $visitorKey;
}

function upsertAppPresence(PDO $db, string $visitorKey, ?int $userId, int $now = null): void
{
    $now = $now ?? time();
    $stmt = $db->prepare(
        'INSERT INTO app_presence (visitor_key, user_id, last_seen)
         VALUES (?, ?, ?)
         ON CONFLICT(visitor_key) DO UPDATE SET
            user_id = excluded.user_id,
            last_seen = excluded.last_seen'
    );
    $stmt->execute([$visitorKey, $userId, $now]);
}

function clearAppPresence(PDO $db, string $visitorKey): void
{
    $stmt = $db->prepare('DELETE FROM app_presence WHERE visitor_key = ?');
    $stmt->execute([$visitorKey]);
}

/**
 * @return array{count:int,guests:int,signedIn:int}
 */
function countAppPresence(PDO $db, int $now = null): array
{
    $now = $now ?? time();
    $cutoff = $now - (int)LINKNEST_APP_PRESENCE_TTL;

    $stmt = $db->prepare(
        'SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN user_id IS NULL THEN 1 ELSE 0 END) AS guests,
            SUM(CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END) AS signed_in
         FROM app_presence
         WHERE last_seen >= ?'
    );
    $stmt->execute([$cutoff]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

    return [
        'count' => (int)($row['total'] ?? 0),
        'guests' => (int)($row['guests'] ?? 0),
        'signedIn' => (int)($row['signed_in'] ?? 0),
    ];
}
