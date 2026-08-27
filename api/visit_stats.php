<?php
/**
 * Admin visit counter dashboard.
 * GET /api/visit-stats — app page visits + per-space aggregates from durable stores
 *
 * Query: days (optional, 1–1095 / ~3 years, default 30) for chart series
 *
 * Reads O(1) counters and compact daily rollups — safe for millions of hits.
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/visit_analytics_lib.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';
$path = rtrim((string)$path, '/');
if ($path === '') {
    $path = '/';
}

if ($path !== '/' && $path !== '') {
    sendJSON(['error' => 'Invalid endpoint'], 404);
    exit;
}

if ($method !== 'GET') {
    sendJSON(['error' => 'Method not allowed'], 405);
    exit;
}

requireAdmin();

try {
    $db = getDB();
} catch (Throwable $e) {
    error_log('visit_stats getDB failed: ' . $e->getMessage());
    sendJSON(['error' => 'Failed to connect to database'], 500);
    exit;
}

ensureVisitAnalyticsTables($db);
backfillVisitAnalyticsIfNeeded($db);

// Occasional prune (about 1% of dashboard loads) keeps daily tables bounded
if (random_int(1, 100) === 1) {
    pruneVisitAnalyticsDaily($db);
}

$maxDays = (int)LINKNEST_VISIT_DAILY_RETENTION_DAYS;
$days = isset($_GET['days']) ? (int)$_GET['days'] : 30;
if ($days < 1) {
    $days = 1;
}
if ($days > $maxDays) {
    $days = $maxDays;
}

try {
    $appVisits = readPageVisitCount($db);

    $totals = [
        'hitCount' => 0,
        'uniqueVisitors' => 0,
        'guestHits' => 0,
        'userHits' => 0,
    ];
    try {
        $agg = $db->query('
            SELECT
                COALESCE(SUM(hit_count), 0) AS hit_count,
                COALESCE(SUM(unique_visitors), 0) AS unique_visitors,
                COALESCE(SUM(guest_hits), 0) AS guest_hits,
                COALESCE(SUM(user_hits), 0) AS user_hits
            FROM tile_visit_counters
        ')->fetch(PDO::FETCH_ASSOC);
        if ($agg) {
            $totals['hitCount'] = (int)($agg['hit_count'] ?? 0);
            // Note: sum of per-space uniques can over-count visitors who open multiple spaces.
            // Lifetime cross-space distinct would require a global visitor table; this matches prior UX.
            $totals['uniqueVisitors'] = (int)($agg['unique_visitors'] ?? 0);
            $totals['guestHits'] = (int)($agg['guest_hits'] ?? 0);
            $totals['userHits'] = (int)($agg['user_hits'] ?? 0);
        }
    } catch (PDOException $e) {
        error_log('visit_stats aggregate warning: ' . $e->getMessage());
    }

    $spaces = [];
    try {
        $spaceStmt = $db->query('
            SELECT
                t.id,
                t.title,
                t.emoji,
                t.theme_color,
                t."group",
                t.visibility,
                t.deleted_at,
                t.archived_at,
                COALESCE(c.hit_count, 0) AS hit_count,
                COALESCE(c.unique_visitors, 0) AS unique_visitors,
                c.last_visit
            FROM tiles t
            LEFT JOIN tile_visit_counters c ON c.tile_id = t.id
            WHERE t.deleted_at IS NULL
               OR COALESCE(c.hit_count, 0) > 0
            ORDER BY COALESCE(c.hit_count, 0) DESC, t.title COLLATE NOCASE ASC
        ');
        foreach ($spaceStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $spaces[] = [
                'id' => (string)$row['id'],
                'title' => (string)($row['title'] ?? ''),
                'emoji' => $row['emoji'] !== null && $row['emoji'] !== '' ? (string)$row['emoji'] : null,
                'themeColor' => $row['theme_color'] !== null && $row['theme_color'] !== '' ? (string)$row['theme_color'] : null,
                'group' => $row['group'] !== null && $row['group'] !== '' ? (string)$row['group'] : null,
                'visibility' => $row['visibility'] !== null && $row['visibility'] !== '' ? (string)$row['visibility'] : 'public',
                'deleted' => !empty($row['deleted_at']),
                'archived' => !empty($row['archived_at']),
                'hitCount' => (int)($row['hit_count'] ?? 0),
                'uniqueVisitors' => (int)($row['unique_visitors'] ?? 0),
                'lastVisit' => isset($row['last_visit']) && $row['last_visit'] !== null ? (int)$row['last_visit'] : null,
            ];
        }
    } catch (PDOException $e) {
        error_log('visit_stats spaces warning: ' . $e->getMessage());
    }

    $activeSpaceCount = 0;
    $spacesWithVisits = 0;
    foreach ($spaces as $space) {
        if (!$space['deleted']) {
            $activeSpaceCount++;
        }
        if ($space['hitCount'] > 0) {
            $spacesWithVisits++;
        }
    }

    $now = time();
    $today = visitAnalyticsUtcDay($now);
    $startDay = visitAnalyticsUtcDay($now - (($days - 1) * 86400));

    $spaceHitsByDay = [];
    $spaceUniquesByDay = [];
    try {
        $dailyStmt = $db->prepare('
            SELECT day,
                   SUM(hits) AS hits,
                   SUM(unique_visitors) AS unique_visitors
            FROM tile_visit_daily
            WHERE day >= ? AND day <= ?
            GROUP BY day
            ORDER BY day ASC
        ');
        $dailyStmt->execute([$startDay, $today]);
        foreach ($dailyStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $d = (string)$row['day'];
            $spaceHitsByDay[$d] = (int)($row['hits'] ?? 0);
            $spaceUniquesByDay[$d] = (int)($row['unique_visitors'] ?? 0);
        }
    } catch (PDOException $e) {
        error_log('visit_stats daily warning: ' . $e->getMessage());
    }

    $appHitsByDay = [];
    try {
        $appStmt = $db->prepare('SELECT day, hits FROM page_visit_daily WHERE day >= ? AND day <= ?');
        $appStmt->execute([$startDay, $today]);
        foreach ($appStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $appHitsByDay[(string)$row['day']] = (int)($row['hits'] ?? 0);
        }
    } catch (PDOException $e) {
        error_log('visit_stats app daily warning: ' . $e->getMessage());
    }

    $daily = [];
    $appDaily = [];
    $cursor = visitAnalyticsUtcDayStart($startDay);
    $end = visitAnalyticsUtcDayStart($today);
    for ($ts = $cursor; $ts <= $end; $ts += 86400) {
        $day = gmdate('Y-m-d', $ts);
        $daily[] = [
            'date' => $day,
            'label' => gmdate($days > 365 ? 'M Y' : 'M j', $ts),
            'hits' => $spaceHitsByDay[$day] ?? 0,
            'uniqueVisitors' => $spaceUniquesByDay[$day] ?? 0,
        ];
        $appDaily[] = [
            'date' => $day,
            'label' => gmdate($days > 365 ? 'M Y' : 'M j', $ts),
            'hits' => $appHitsByDay[$day] ?? 0,
        ];
    }

    // For long ranges, downsample to weekly buckets so charts stay readable
    $granularity = 'day';
    if ($days > 120) {
        $granularity = 'week';
        $daily = visitStatsBucketSeries($daily, 'week');
        $appDaily = visitStatsBucketSeries($appDaily, 'week');
    }

    sendJSON([
        'appVisits' => $appVisits,
        'totals' => $totals,
        'spaceCount' => $activeSpaceCount,
        'spacesWithVisits' => $spacesWithVisits,
        'days' => $days,
        'retentionDays' => $maxDays,
        'granularity' => $granularity,
        'daily' => $daily,
        'appDaily' => $appDaily,
        'spaces' => $spaces,
    ]);
} catch (Throwable $e) {
    error_log('visit_stats failed: ' . $e->getMessage());
    sendJSON(['error' => 'Failed to load visit statistics'], 500);
}

/**
 * Bucket daily points into ISO weeks for long-range charts.
 *
 * @param array<int, array<string, mixed>> $points
 * @return array<int, array<string, mixed>>
 */
function visitStatsBucketSeries(array $points, string $mode): array
{
    if ($mode !== 'week' || count($points) === 0) {
        return $points;
    }
    $buckets = [];
    foreach ($points as $point) {
        $date = (string)($point['date'] ?? '');
        $ts = visitAnalyticsUtcDayStart($date);
        if ($ts <= 0) {
            continue;
        }
        // Monday of week (UTC)
        $dow = (int)gmdate('N', $ts); // 1=Mon .. 7=Sun
        $weekStart = $ts - (($dow - 1) * 86400);
        $key = gmdate('Y-m-d', $weekStart);
        if (!isset($buckets[$key])) {
            $buckets[$key] = [
                'date' => $key,
                'label' => gmdate('M j', $weekStart),
                'hits' => 0,
                'uniqueVisitors' => 0,
            ];
        }
        $buckets[$key]['hits'] += (int)($point['hits'] ?? 0);
        if (isset($point['uniqueVisitors'])) {
            $buckets[$key]['uniqueVisitors'] += (int)$point['uniqueVisitors'];
        }
    }
    return array_values($buckets);
}
