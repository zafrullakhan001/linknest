<?php
/**
 * Live presence: who is currently viewing or editing a space.
 * Heartbeats are ephemeral; stale rows are ignored and periodically deleted.
 */

if (!defined('LINKNEST_TILE_PRESENCE_TTL')) {
    define('LINKNEST_TILE_PRESENCE_TTL', 45);
}

if (!defined('LINKNEST_TILE_PRESENCE_CLEANUP_TTL')) {
    define('LINKNEST_TILE_PRESENCE_CLEANUP_TTL', 90);
}

function ensureTilePresenceTable(PDO $db): void
{
    static $ensured = false;
    if ($ensured) {
        return;
    }

    try {
        $db->exec('CREATE TABLE IF NOT EXISTS tile_presence (
            tile_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            mode TEXT NOT NULL DEFAULT \'viewing\',
            last_seen INTEGER NOT NULL,
            PRIMARY KEY (tile_id, user_id),
            FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_tile_presence_last_seen ON tile_presence(last_seen)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_tile_presence_user ON tile_presence(user_id)');
    } catch (PDOException $e) {
        error_log('ensureTilePresenceTable warning: ' . $e->getMessage());
    }

    $ensured = true;
}

function cleanupStaleTilePresence(PDO $db, int $now = null): void
{
    $cutoff = ($now ?? time()) - (int)LINKNEST_TILE_PRESENCE_CLEANUP_TTL;
    try {
        $stmt = $db->prepare('DELETE FROM tile_presence WHERE last_seen < ?');
        $stmt->execute([$cutoff]);
    } catch (PDOException $e) {
        error_log('cleanupStaleTilePresence warning: ' . $e->getMessage());
    }
}

function normalizeTilePresenceMode($mode): string
{
    return $mode === 'editing' ? 'editing' : 'viewing';
}

function upsertTilePresence(PDO $db, string $tileId, int $userId, string $mode, int $now = null): void
{
    $now = $now ?? time();
    $mode = normalizeTilePresenceMode($mode);

    $leaveOthers = $db->prepare('DELETE FROM tile_presence WHERE user_id = ? AND tile_id != ?');
    $leaveOthers->execute([$userId, $tileId]);

    $stmt = $db->prepare(
        'INSERT INTO tile_presence (tile_id, user_id, mode, last_seen)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(tile_id, user_id) DO UPDATE SET
            mode = excluded.mode,
            last_seen = excluded.last_seen'
    );
    $stmt->execute([$tileId, $userId, $mode, $now]);
}

function clearTilePresence(PDO $db, string $tileId, int $userId): void
{
    $stmt = $db->prepare('DELETE FROM tile_presence WHERE tile_id = ? AND user_id = ?');
    $stmt->execute([$tileId, $userId]);
}

/**
 * @return list<array{userId:int,username:string,displayName:?string,isAdmin:bool,mode:string,lastSeen:int}>
 */
function listTilePresence(PDO $db, string $tileId, int $now = null): array
{
    $now = $now ?? time();
    $cutoff = $now - (int)LINKNEST_TILE_PRESENCE_TTL;

    $stmt = $db->prepare(
        'SELECT
            p.user_id,
            p.mode,
            p.last_seen,
            u.username,
            u.display_name,
            u.is_admin
         FROM tile_presence p
         INNER JOIN users u ON u.id = p.user_id
         WHERE p.tile_id = ?
           AND p.last_seen >= ?
           AND COALESCE(u.is_disabled, 0) = 0
           AND COALESCE(u.is_approved, 1) = 1
         ORDER BY
            COALESCE(u.is_admin, 0) DESC,
            CASE WHEN p.mode = \'editing\' THEN 0 ELSE 1 END,
            COALESCE(NULLIF(TRIM(u.display_name), \'\'), u.username) COLLATE NOCASE'
    );
    $stmt->execute([$tileId, $cutoff]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $viewers = [];
    foreach ($rows as $row) {
        $username = isset($row['username']) ? trim((string)$row['username']) : '';
        if ($username === '') {
            continue;
        }
        $displayName = isset($row['display_name']) ? trim((string)$row['display_name']) : '';
        $viewers[] = [
            'userId' => (int)$row['user_id'],
            'username' => $username,
            'displayName' => $displayName !== '' ? $displayName : null,
            'isAdmin' => !empty($row['is_admin']),
            'mode' => normalizeTilePresenceMode($row['mode'] ?? 'viewing'),
            'lastSeen' => (int)($row['last_seen'] ?? 0),
        ];
    }

    return $viewers;
}
