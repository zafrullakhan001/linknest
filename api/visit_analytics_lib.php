<?php
/**
 * Durable visit analytics for million-scale hits and multi-year retention.
 *
 * Storage model:
 * - tile_visit_counters — lifetime totals per space (O(1) reads)
 * - tile_visit_visitors — one row per unique visitor per space (scales with uniques, not hits)
 * - tile_visit_daily — daily rollups per space (kept ~3 years)
 * - page_visit_daily — site-wide daily page visits (kept ~3 years)
 * - settings.page_visit_count — lifetime website visit counter (unchanged)
 *
 * Raw tile_visits event rows are backfilled once, then pruned; new hits only update aggregates.
 */

if (!defined('LINKNEST_VISIT_DAILY_RETENTION_DAYS')) {
    // Keep >1 year of daily series; default 3 years
    define('LINKNEST_VISIT_DAILY_RETENTION_DAYS', 1095);
}

if (!defined('LINKNEST_VISIT_ANALYTICS_BACKFILL_KEY')) {
    define('LINKNEST_VISIT_ANALYTICS_BACKFILL_KEY', 'visit_analytics_backfilled_v1');
}

function visitAnalyticsUtcDay(int $ts = null): string
{
    return gmdate('Y-m-d', $ts ?? time());
}

function visitAnalyticsUtcDayStart(string $day): int
{
    $parts = explode('-', $day);
    if (count($parts) !== 3) {
        return 0;
    }
    return (int)gmmktime(0, 0, 0, (int)$parts[1], (int)$parts[2], (int)$parts[0]);
}

/**
 * Create durable visit analytics tables. Safe on every connection.
 */
function ensureVisitAnalyticsTables(PDO $db): void
{
    static $ensured = false;
    if ($ensured) {
        return;
    }

    try {
        $db->exec('CREATE TABLE IF NOT EXISTS tile_visit_counters (
            tile_id TEXT PRIMARY KEY,
            hit_count INTEGER NOT NULL DEFAULT 0,
            unique_visitors INTEGER NOT NULL DEFAULT 0,
            guest_hits INTEGER NOT NULL DEFAULT 0,
            user_hits INTEGER NOT NULL DEFAULT 0,
            last_visit INTEGER,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE
        )');

        $db->exec('CREATE TABLE IF NOT EXISTS tile_visit_visitors (
            tile_id TEXT NOT NULL,
            visitor_key TEXT NOT NULL,
            user_id INTEGER,
            hit_count INTEGER NOT NULL DEFAULT 1,
            first_visit INTEGER NOT NULL,
            last_visit INTEGER NOT NULL,
            last_day TEXT NOT NULL,
            PRIMARY KEY (tile_id, visitor_key),
            FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )');

        $db->exec('CREATE TABLE IF NOT EXISTS tile_visit_daily (
            tile_id TEXT NOT NULL,
            day TEXT NOT NULL,
            hits INTEGER NOT NULL DEFAULT 0,
            unique_visitors INTEGER NOT NULL DEFAULT 0,
            guest_hits INTEGER NOT NULL DEFAULT 0,
            user_hits INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (tile_id, day),
            FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE
        )');

        $db->exec('CREATE TABLE IF NOT EXISTS page_visit_daily (
            day TEXT PRIMARY KEY,
            hits INTEGER NOT NULL DEFAULT 0
        )');

        $db->exec('CREATE INDEX IF NOT EXISTS idx_tile_visit_visitors_last ON tile_visit_visitors(tile_id, last_visit DESC)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_tile_visit_daily_day ON tile_visit_daily(day)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_tile_visit_counters_hits ON tile_visit_counters(hit_count DESC)');

        $ensured = true;
    } catch (PDOException $e) {
        error_log('ensureVisitAnalyticsTables warning: ' . $e->getMessage());
    }
}

function visitAnalyticsIsBackfilled(PDO $db): bool
{
    try {
        $stmt = $db->prepare('SELECT value FROM settings WHERE key = ?');
        $stmt->execute([LINKNEST_VISIT_ANALYTICS_BACKFILL_KEY]);
        $value = $stmt->fetchColumn();
        return $value === '1' || $value === 1;
    } catch (PDOException $e) {
        return false;
    }
}

function visitAnalyticsMarkBackfilled(PDO $db): void
{
    $now = time();
    $stmt = $db->prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
    );
    $stmt->execute([LINKNEST_VISIT_ANALYTICS_BACKFILL_KEY, '1', $now]);
}

/**
 * One-time migrate raw tile_visits into durable counters/visitors/daily, then prune raw events.
 */
function backfillVisitAnalyticsIfNeeded(PDO $db): void
{
    static $doneThisRequest = false;
    if ($doneThisRequest) {
        return;
    }

    ensureVisitAnalyticsTables($db);
    if (visitAnalyticsIsBackfilled($db)) {
        $doneThisRequest = true;
        return;
    }

    try {
        $db->beginTransaction();

        // Re-check inside transaction
        $check = $db->prepare('SELECT value FROM settings WHERE key = ?');
        $check->execute([LINKNEST_VISIT_ANALYTICS_BACKFILL_KEY]);
        $value = $check->fetchColumn();
        if ($value === '1' || $value === 1) {
            $db->commit();
            return;
        }

        // Only backfill if there is raw history and counters are empty
        $rawCount = 0;
        try {
            $rawCount = (int)$db->query('SELECT COUNT(*) FROM tile_visits')->fetchColumn();
        } catch (PDOException $e) {
            $rawCount = 0;
        }
        $counterCount = (int)$db->query('SELECT COUNT(*) FROM tile_visit_counters')->fetchColumn();

        if ($rawCount > 0 && $counterCount === 0) {
            $db->exec("
                INSERT INTO tile_visit_visitors (tile_id, visitor_key, user_id, hit_count, first_visit, last_visit, last_day)
                SELECT
                    tile_id,
                    visitor_key,
                    MAX(user_id) AS user_id,
                    COUNT(*) AS hit_count,
                    MIN(visited_at) AS first_visit,
                    MAX(visited_at) AS last_visit,
                    strftime('%Y-%m-%d', MAX(visited_at), 'unixepoch') AS last_day
                FROM tile_visits
                GROUP BY tile_id, visitor_key
            ");

            $db->exec("
                INSERT INTO tile_visit_daily (tile_id, day, hits, unique_visitors, guest_hits, user_hits)
                SELECT
                    tile_id,
                    strftime('%Y-%m-%d', visited_at, 'unixepoch') AS day,
                    COUNT(*) AS hits,
                    COUNT(DISTINCT visitor_key) AS unique_visitors,
                    SUM(CASE WHEN visitor_key LIKE 'g:%' THEN 1 ELSE 0 END) AS guest_hits,
                    SUM(CASE WHEN visitor_key LIKE 'u:%' THEN 1 ELSE 0 END) AS user_hits
                FROM tile_visits
                GROUP BY tile_id, day
            ");

            $db->exec("
                INSERT INTO tile_visit_counters (tile_id, hit_count, unique_visitors, guest_hits, user_hits, last_visit, updated_at)
                SELECT
                    tile_id,
                    COUNT(*) AS hit_count,
                    COUNT(DISTINCT visitor_key) AS unique_visitors,
                    SUM(CASE WHEN visitor_key LIKE 'g:%' THEN 1 ELSE 0 END) AS guest_hits,
                    SUM(CASE WHEN visitor_key LIKE 'u:%' THEN 1 ELSE 0 END) AS user_hits,
                    MAX(visited_at) AS last_visit,
                    " . time() . " AS updated_at
                FROM tile_visits
                GROUP BY tile_id
            ");
        }

        // Historical website daily series cannot be reconstructed from the single lifetime counter.
        // page_visit_daily grows from this point forward; lifetime settings.page_visit_count stays authoritative.

        // Prune raw event log only after we migrated it into aggregates
        try {
            if ($rawCount > 0 && $counterCount === 0) {
                $db->exec('DELETE FROM tile_visits');
            }
        } catch (PDOException $e) {
            error_log('visit analytics prune tile_visits warning: ' . $e->getMessage());
        }

        visitAnalyticsMarkBackfilled($db);
        $db->commit();
        $doneThisRequest = true;
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('backfillVisitAnalyticsIfNeeded failed: ' . $e->getMessage());
    }
}

/**
 * Drop daily rows older than retention window. Cheap when little/nothing to prune.
 */
function pruneVisitAnalyticsDaily(PDO $db): void
{
    $cutoffDay = visitAnalyticsUtcDay(time() - ((int)LINKNEST_VISIT_DAILY_RETENTION_DAYS * 86400));
    try {
        $stmt = $db->prepare('DELETE FROM tile_visit_daily WHERE day < ?');
        $stmt->execute([$cutoffDay]);
        $stmt = $db->prepare('DELETE FROM page_visit_daily WHERE day < ?');
        $stmt->execute([$cutoffDay]);
    } catch (PDOException $e) {
        error_log('pruneVisitAnalyticsDaily warning: ' . $e->getMessage());
    }
}

/**
 * Record one space hit into durable stores. Returns [recorded(bool), stats(array)].
 */
function recordDurableTileVisit(PDO $db, string $tileId, string $visitorKey, ?int $userId): array
{
    ensureVisitAnalyticsTables($db);
    backfillVisitAnalyticsIfNeeded($db);

    $now = time();
    $day = visitAnalyticsUtcDay($now);
    $isGuest = str_starts_with($visitorKey, 'g:');
    $guestInc = $isGuest ? 1 : 0;
    $userInc = $isGuest ? 0 : 1;

    $db->beginTransaction();
    try {
        $sel = $db->prepare('SELECT hit_count, last_visit, last_day FROM tile_visit_visitors WHERE tile_id = ? AND visitor_key = ?');
        $sel->execute([$tileId, $visitorKey]);
        $existing = $sel->fetch(PDO::FETCH_ASSOC);

        // Coalesce rapid duplicate hits (e.g. React Strict Mode) within 10 seconds
        if ($existing && (int)$existing['last_visit'] >= ($now - 10)) {
            $db->commit();
            return [false, getDurableTileVisitStats($tileId, $db)];
        }

        $isNewVisitor = !$existing;
        $isNewDayForVisitor = $isNewVisitor || ((string)$existing['last_day'] !== $day);

        if ($isNewVisitor) {
            $ins = $db->prepare('
                INSERT INTO tile_visit_visitors (tile_id, visitor_key, user_id, hit_count, first_visit, last_visit, last_day)
                VALUES (?, ?, ?, 1, ?, ?, ?)
            ');
            $ins->execute([$tileId, $visitorKey, $userId, $now, $now, $day]);
        } else {
            $upd = $db->prepare('
                UPDATE tile_visit_visitors
                SET hit_count = hit_count + 1,
                    last_visit = ?,
                    last_day = ?,
                    user_id = COALESCE(?, user_id)
                WHERE tile_id = ? AND visitor_key = ?
            ');
            $upd->execute([$now, $day, $userId, $tileId, $visitorKey]);
        }

        $uniqueInc = $isNewVisitor ? 1 : 0;
        $dayUniqueInc = $isNewDayForVisitor ? 1 : 0;

        $db->prepare('
            INSERT INTO tile_visit_counters (tile_id, hit_count, unique_visitors, guest_hits, user_hits, last_visit, updated_at)
            VALUES (?, 1, ?, ?, ?, ?, ?)
            ON CONFLICT(tile_id) DO UPDATE SET
                hit_count = hit_count + 1,
                unique_visitors = unique_visitors + excluded.unique_visitors,
                guest_hits = guest_hits + excluded.guest_hits,
                user_hits = user_hits + excluded.user_hits,
                last_visit = excluded.last_visit,
                updated_at = excluded.updated_at
        ')->execute([$tileId, $uniqueInc, $guestInc, $userInc, $now, $now]);

        $db->prepare('
            INSERT INTO tile_visit_daily (tile_id, day, hits, unique_visitors, guest_hits, user_hits)
            VALUES (?, ?, 1, ?, ?, ?)
            ON CONFLICT(tile_id, day) DO UPDATE SET
                hits = hits + 1,
                unique_visitors = unique_visitors + excluded.unique_visitors,
                guest_hits = guest_hits + excluded.guest_hits,
                user_hits = user_hits + excluded.user_hits
        ')->execute([$tileId, $day, $dayUniqueInc, $guestInc, $userInc]);

        $db->commit();
        return [true, getDurableTileVisitStats($tileId, $db)];
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }
}

function getDurableTileVisitStats(string $tileId, PDO $db = null): array
{
    if ($db === null) {
        $db = getDB();
    }
    ensureVisitAnalyticsTables($db);
    backfillVisitAnalyticsIfNeeded($db);

    try {
        $stmt = $db->prepare('SELECT hit_count, unique_visitors FROM tile_visit_counters WHERE tile_id = ?');
        $stmt->execute([$tileId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            return [
                'hitCount' => (int)($row['hit_count'] ?? 0),
                'uniqueVisitors' => (int)($row['unique_visitors'] ?? 0),
            ];
        }
    } catch (PDOException $e) {
        // fall through
    }

    // Legacy fallback before backfill completes
    try {
        $stmt = $db->prepare('
            SELECT COUNT(*) as hit_count, COUNT(DISTINCT visitor_key) as unique_visitors
            FROM tile_visits WHERE tile_id = ?
        ');
        $stmt->execute([$tileId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return [
            'hitCount' => (int)($row['hit_count'] ?? 0),
            'uniqueVisitors' => (int)($row['unique_visitors'] ?? 0),
        ];
    } catch (PDOException $e) {
        return ['hitCount' => 0, 'uniqueVisitors' => 0];
    }
}

/**
 * Increment lifetime + daily website visit counters.
 */
function incrementDurablePageVisit(PDO $db): int
{
    ensureVisitAnalyticsTables($db);
    $now = time();
    $day = visitAnalyticsUtcDay($now);

    $db->beginTransaction();
    try {
        $stmt = $db->prepare('SELECT value FROM settings WHERE key = ?');
        $stmt->execute(['page_visit_count']);
        $value = $stmt->fetchColumn();
        $count = ($value === false || $value === null || $value === '') ? 0 : max(0, (int)$value);
        $count++;

        $upsert = $db->prepare(
            'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
        );
        $upsert->execute(['page_visit_count', (string)$count, $now]);

        $daily = $db->prepare(
            'INSERT INTO page_visit_daily (day, hits) VALUES (?, 1)
             ON CONFLICT(day) DO UPDATE SET hits = hits + 1'
        );
        $daily->execute([$day]);

        $db->commit();
        return $count;
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }
}

function readPageVisitCount(PDO $db): int
{
    $stmt = $db->prepare('SELECT value FROM settings WHERE key = ?');
    $stmt->execute(['page_visit_count']);
    $value = $stmt->fetchColumn();
    if ($value === false || $value === null || $value === '') {
        return 0;
    }
    return max(0, (int)$value);
}

/**
 * Purge visit analytics data.
 * $scope: all | spaces | website | daily | space
 * $tileId required when scope=space
 *
 * @return array{scope: string, deleted: array<string, int>}
 */
function purgeVisitAnalytics(PDO $db, string $scope, ?string $tileId = null): array
{
    ensureVisitAnalyticsTables($db);
    $scope = strtolower(trim($scope));
    $deleted = [
        'tile_visit_counters' => 0,
        'tile_visit_visitors' => 0,
        'tile_visit_daily' => 0,
        'page_visit_daily' => 0,
        'tile_visits' => 0,
        'page_visit_count_reset' => 0,
    ];

    $db->beginTransaction();
    try {
        if ($scope === 'space') {
            if ($tileId === null || $tileId === '') {
                throw new InvalidArgumentException('tileId is required for space purge');
            }
            foreach (['tile_visit_counters', 'tile_visit_visitors', 'tile_visit_daily', 'tile_visits'] as $table) {
                $stmt = $db->prepare("DELETE FROM {$table} WHERE tile_id = ?");
                $stmt->execute([$tileId]);
                $deleted[$table] = $stmt->rowCount();
            }
        } elseif ($scope === 'spaces') {
            foreach (['tile_visit_counters', 'tile_visit_visitors', 'tile_visit_daily', 'tile_visits'] as $table) {
                $deleted[$table] = (int)$db->exec("DELETE FROM {$table}");
            }
        } elseif ($scope === 'website') {
            $deleted['page_visit_daily'] = (int)$db->exec('DELETE FROM page_visit_daily');
            $now = time();
            $upsert = $db->prepare(
                'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
            );
            $upsert->execute(['page_visit_count', '0', $now]);
            $deleted['page_visit_count_reset'] = 1;
        } elseif ($scope === 'daily') {
            $deleted['tile_visit_daily'] = (int)$db->exec('DELETE FROM tile_visit_daily');
            $deleted['page_visit_daily'] = (int)$db->exec('DELETE FROM page_visit_daily');
        } elseif ($scope === 'all') {
            foreach (['tile_visit_counters', 'tile_visit_visitors', 'tile_visit_daily', 'page_visit_daily', 'tile_visits'] as $table) {
                $deleted[$table] = (int)$db->exec("DELETE FROM {$table}");
            }
            $now = time();
            $upsert = $db->prepare(
                'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
            );
            $upsert->execute(['page_visit_count', '0', $now]);
            $deleted['page_visit_count_reset'] = 1;
        } else {
            throw new InvalidArgumentException('Invalid purge scope');
        }

        $db->commit();
        return ['scope' => $scope, 'deleted' => $deleted, 'tileId' => $tileId];
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }
}

/**
 * Rebuild visit-analytics indexes and run ANALYZE for query planner stats.
 *
 * @return array{indexes: string[], analyzed: string[], elapsedMs: float}
 */
function reindexVisitAnalytics(PDO $db): array
{
    ensureVisitAnalyticsTables($db);
    $started = microtime(true);

    $indexDefs = [
        'idx_tile_visit_visitors_last' => 'CREATE INDEX IF NOT EXISTS idx_tile_visit_visitors_last ON tile_visit_visitors(tile_id, last_visit DESC)',
        'idx_tile_visit_daily_day' => 'CREATE INDEX IF NOT EXISTS idx_tile_visit_daily_day ON tile_visit_daily(day)',
        'idx_tile_visit_counters_hits' => 'CREATE INDEX IF NOT EXISTS idx_tile_visit_counters_hits ON tile_visit_counters(hit_count DESC)',
        'idx_tile_visit_visitors_key' => 'CREATE INDEX IF NOT EXISTS idx_tile_visit_visitors_key ON tile_visit_visitors(visitor_key)',
        'idx_tile_visit_daily_tile' => 'CREATE INDEX IF NOT EXISTS idx_tile_visit_daily_tile ON tile_visit_daily(tile_id, day)',
        'idx_tile_visits_tile_id' => 'CREATE INDEX IF NOT EXISTS idx_tile_visits_tile_id ON tile_visits(tile_id)',
        'idx_tile_visits_tile_visitor' => 'CREATE INDEX IF NOT EXISTS idx_tile_visits_tile_visitor ON tile_visits(tile_id, visitor_key)',
        'idx_tile_visits_visited_at' => 'CREATE INDEX IF NOT EXISTS idx_tile_visits_visited_at ON tile_visits(tile_id, visited_at)',
    ];

    $rebuilt = [];
    foreach ($indexDefs as $name => $createSql) {
        try {
            // Drop + recreate refreshes a fragmented index; IF EXISTS keeps older DBs safe
            $db->exec("DROP INDEX IF EXISTS {$name}");
            $db->exec($createSql);
            $rebuilt[] = $name;
        } catch (PDOException $e) {
            error_log("reindexVisitAnalytics {$name}: " . $e->getMessage());
        }
    }

    $analyzed = [];
    foreach (['tile_visit_counters', 'tile_visit_visitors', 'tile_visit_daily', 'page_visit_daily', 'tile_visits'] as $table) {
        try {
            $db->exec("ANALYZE {$table}");
            $analyzed[] = $table;
        } catch (PDOException $e) {
            error_log("reindexVisitAnalytics ANALYZE {$table}: " . $e->getMessage());
        }
    }

    // Compact freelist after large purges when possible
    try {
        $db->exec('PRAGMA optimize');
    } catch (PDOException $e) {
        // ignore
    }

    $elapsedMs = round((microtime(true) - $started) * 1000, 1);
    return [
        'indexes' => $rebuilt,
        'analyzed' => $analyzed,
        'elapsedMs' => $elapsedMs,
    ];
}
