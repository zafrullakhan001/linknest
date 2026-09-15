<?php
/**
 * Speed-test schedules, results, and rate-limit helpers (SQLite).
 */

function speedtestEnsureSchema(PDO $db): void
{
    try {
        $db->exec("CREATE TABLE IF NOT EXISTS speedtest_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            target TEXT NOT NULL CHECK(target IN ('internet','server')),
            profile TEXT NOT NULL CHECK(profile IN ('quick','standard','thorough')),
            executor TEXT NOT NULL CHECK(executor IN ('browser','worker')),
            owner_user_id INTEGER,
            interval_minutes INTEGER NOT NULL DEFAULT 60,
            is_enabled INTEGER NOT NULL DEFAULT 1,
            last_run_at TEXT,
            next_run_at TEXT,
            last_status TEXT,
            last_error TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            created_by INTEGER
        )");
        $db->exec("CREATE TABLE IF NOT EXISTS speedtest_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            schedule_id INTEGER,
            executor TEXT NOT NULL CHECK(executor IN ('browser','worker')),
            target TEXT NOT NULL,
            profile TEXT NOT NULL,
            run_at TEXT NOT NULL DEFAULT (datetime('now')),
            duration_ms INTEGER,
            status TEXT NOT NULL DEFAULT 'complete',
            result_json TEXT,
            bytes_downloaded INTEGER DEFAULT 0,
            bytes_uploaded INTEGER DEFAULT 0,
            created_by INTEGER,
            trigger TEXT NOT NULL DEFAULT 'manual',
            FOREIGN KEY(schedule_id) REFERENCES speedtest_schedules(id) ON DELETE SET NULL
        )");
        $db->exec("CREATE TABLE IF NOT EXISTS speedtest_rate_limits (
            bucket_key TEXT PRIMARY KEY,
            window_start INTEGER NOT NULL,
            bytes INTEGER NOT NULL DEFAULT 0,
            requests INTEGER NOT NULL DEFAULT 0
        )");
        $db->exec("CREATE TABLE IF NOT EXISTS speedtest_worker_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            schedule_id INTEGER,
            requested_at TEXT NOT NULL DEFAULT (datetime('now')),
            status TEXT NOT NULL DEFAULT 'pending',
            requested_by INTEGER
        )");
        $db->exec('CREATE INDEX IF NOT EXISTS idx_speedtest_schedules_exec ON speedtest_schedules(executor, is_enabled)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_speedtest_results_run ON speedtest_results(run_at DESC)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_speedtest_results_exec ON speedtest_results(executor, run_at DESC)');
    } catch (Throwable $e) {
        error_log('speedtestEnsureSchema: ' . $e->getMessage());
    }
}

function speedtestSettingInt(string $key, int $default): int
{
    try {
        $db = getDB();
        $stmt = $db->prepare('SELECT value FROM settings WHERE key = ? LIMIT 1');
        $stmt->execute([$key]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row && is_numeric($row['value'])) {
            return (int)$row['value'];
        }
    } catch (Throwable $e) {
        // ignore
    }
    return $default;
}

function speedtestInteractiveMaxPerHour(): int
{
    return max(1, speedtestSettingInt('speedtest_interactive_max_per_hour', 12));
}

function speedtestWorkerDailyCapBytes(): int
{
    $mb = max(50, speedtestSettingInt('speedtest_worker_daily_cap_mb', 500));
    return $mb * 1024 * 1024;
}

function speedtestWorkerMinIntervalMinutes(): int
{
    return max(5, speedtestSettingInt('speedtest_worker_min_interval_minutes', 15));
}

function speedtestRateLimitAllow(string $bucketKey, int $maxRequests, int $windowSeconds, int $addBytes = 0): bool
{
    $db = getDB();
    speedtestEnsureSchema($db);
    $now = time();
    $windowStart = $now - ($now % $windowSeconds);
    $stmt = $db->prepare('SELECT window_start, requests, bytes FROM speedtest_rate_limits WHERE bucket_key = ?');
    $stmt->execute([$bucketKey]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || (int)$row['window_start'] !== $windowStart) {
        $db->prepare('INSERT INTO speedtest_rate_limits(bucket_key, window_start, bytes, requests) VALUES(?,?,?,?)
            ON CONFLICT(bucket_key) DO UPDATE SET window_start=excluded.window_start, bytes=excluded.bytes, requests=excluded.requests')
            ->execute([$bucketKey, $windowStart, $addBytes, 1]);
        return true;
    }
    if ((int)$row['requests'] >= $maxRequests) {
        return false;
    }
    $db->prepare('UPDATE speedtest_rate_limits SET requests = requests + 1, bytes = bytes + ? WHERE bucket_key = ?')
        ->execute([$addBytes, $bucketKey]);
    return true;
}

function speedtestInteractiveRemaining(int $userId): int
{
    $db = getDB();
    speedtestEnsureSchema($db);
    $max = speedtestInteractiveMaxPerHour();
    $now = time();
    $windowStart = $now - ($now % 3600);
    $stmt = $db->prepare('SELECT requests FROM speedtest_rate_limits WHERE bucket_key = ?');
    $stmt->execute(['user:' . $userId . ':hour']);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) return $max;
    // If window rolled, treat as fresh
    $ws = $db->prepare('SELECT window_start FROM speedtest_rate_limits WHERE bucket_key = ?');
    $ws->execute(['user:' . $userId . ':hour']);
    $wsRow = $ws->fetch(PDO::FETCH_ASSOC);
    if (!$wsRow || (int)$wsRow['window_start'] !== $windowStart) return $max;
    return max(0, $max - (int)$row['requests']);
}

function speedtestWorkerBytesToday(): int
{
    $db = getDB();
    speedtestEnsureSchema($db);
    $stmt = $db->query("SELECT COALESCE(SUM(bytes_downloaded + bytes_uploaded),0) AS b
        FROM speedtest_results
        WHERE executor = 'worker' AND date(run_at) = date('now')");
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return (int)($row['b'] ?? 0);
}

function speedtestIsWorkerRunning(): bool
{
    $db = getDB();
    speedtestEnsureSchema($db);
    // Recover stale "running" rows (crashed kick / killed process).
    $db->exec("UPDATE speedtest_worker_queue SET status='error'
        WHERE status='running' AND datetime(requested_at) < datetime('now', '-10 minutes')");
    $stmt = $db->query("SELECT COUNT(*) FROM speedtest_worker_queue WHERE status = 'running'");
    return ((int)$stmt->fetchColumn()) > 0;
}

function speedtestListSchedules(?array $user, bool $isAdmin): array
{
    $db = getDB();
    speedtestEnsureSchema($db);
    if ($isAdmin) {
        $stmt = $db->query('SELECT * FROM speedtest_schedules ORDER BY executor, id DESC');
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }
    $uid = (int)($user['id'] ?? 0);
    $stmt = $db->prepare("SELECT * FROM speedtest_schedules WHERE executor = 'browser' AND owner_user_id = ? ORDER BY id DESC");
    $stmt->execute([$uid]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function speedtestGetSchedule(int $id): ?array
{
    $db = getDB();
    speedtestEnsureSchema($db);
    $stmt = $db->prepare('SELECT * FROM speedtest_schedules WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function speedtestCreateSchedule(array $payload, array $user, bool $isAdmin): array
{
    $db = getDB();
    speedtestEnsureSchema($db);
    $executor = ($payload['executor'] ?? 'browser') === 'worker' ? 'worker' : 'browser';
    if ($executor === 'worker' && !$isAdmin) {
        sendJSON(['error' => 'Admin required for worker schedules'], 403);
    }
    $target = ($payload['target'] ?? 'internet') === 'server' ? 'server' : 'internet';
    $profile = in_array($payload['profile'] ?? 'standard', ['quick', 'standard', 'thorough'], true)
        ? $payload['profile']
        : 'standard';
    $minInterval = $executor === 'worker' ? speedtestWorkerMinIntervalMinutes() : 5;
    $interval = max($minInterval, min(10080, (int)($payload['interval_minutes'] ?? 60)));
    $name = trim((string)($payload['name'] ?? ($executor . ' ' . $target)));
    if ($name === '') $name = 'Speed test schedule';
    $enabled = !empty($payload['is_enabled']) ? 1 : 1;
    if (array_key_exists('is_enabled', $payload)) {
        $enabled = !empty($payload['is_enabled']) ? 1 : 0;
    }
    $owner = $executor === 'browser' ? (int)$user['id'] : null;
    $next = gmdate('Y-m-d H:i:s', time() + $interval * 60);
    $stmt = $db->prepare('INSERT INTO speedtest_schedules
        (name, target, profile, executor, owner_user_id, interval_minutes, is_enabled, next_run_at, created_by)
        VALUES (?,?,?,?,?,?,?,?,?)');
    $stmt->execute([$name, $target, $profile, $executor, $owner, $interval, $enabled, $next, (int)$user['id']]);
    $id = (int)$db->lastInsertId();
    if (function_exists('logUserAudit')) {
        logUserAudit('speedtest.schedule_create', [
            'actor' => $user,
            'details' => [
                'schedule_id' => $id,
                'executor' => $executor,
                'target' => $target,
                'interval_minutes' => $interval,
            ],
        ]);
    }
    $created = speedtestGetSchedule($id);
    if (!$created) {
        sendJSON(['error' => 'Schedule created but could not be loaded'], 500);
    }
    return $created;
}

function speedtestUpdateSchedule(int $id, array $payload, array $user, bool $isAdmin): array
{
    $row = speedtestGetSchedule($id);
    if (!$row) sendJSON(['error' => 'Schedule not found'], 404);
    if ($row['executor'] === 'worker' && !$isAdmin) sendJSON(['error' => 'Admin required'], 403);
    if ($row['executor'] === 'browser' && (int)$row['owner_user_id'] !== (int)$user['id'] && !$isAdmin) {
        sendJSON(['error' => 'Forbidden'], 403);
    }
    $db = getDB();
    $name = array_key_exists('name', $payload) ? trim((string)$payload['name']) : $row['name'];
    $target = array_key_exists('target', $payload)
        ? (($payload['target'] === 'server') ? 'server' : 'internet')
        : $row['target'];
    $profile = array_key_exists('profile', $payload) && in_array($payload['profile'], ['quick', 'standard', 'thorough'], true)
        ? $payload['profile']
        : $row['profile'];
    $minInterval = $row['executor'] === 'worker' ? speedtestWorkerMinIntervalMinutes() : 5;
    $interval = array_key_exists('interval_minutes', $payload)
        ? max($minInterval, min(10080, (int)$payload['interval_minutes']))
        : (int)$row['interval_minutes'];
    $enabled = array_key_exists('is_enabled', $payload) ? (!empty($payload['is_enabled']) ? 1 : 0) : (int)$row['is_enabled'];
    $db->prepare('UPDATE speedtest_schedules SET name=?, target=?, profile=?, interval_minutes=?, is_enabled=?, updated_at=datetime(\'now\') WHERE id=?')
        ->execute([$name, $target, $profile, $interval, $enabled, $id]);
    if (function_exists('logUserAudit')) {
        logUserAudit('speedtest.schedule_update', [
            'actor' => $user,
            'details' => [
                'schedule_id' => $id,
                'interval_minutes' => $interval,
                'is_enabled' => $enabled,
            ],
        ]);
    }
    $updated = speedtestGetSchedule($id);
    if (!$updated) {
        sendJSON(['error' => 'Schedule updated but could not be loaded'], 500);
    }
    return $updated;
}

function speedtestDeleteSchedule(int $id, array $user, bool $isAdmin): void
{
    $row = speedtestGetSchedule($id);
    if (!$row) sendJSON(['error' => 'Schedule not found'], 404);
    if ($row['executor'] === 'worker' && !$isAdmin) sendJSON(['error' => 'Admin required'], 403);
    if ($row['executor'] === 'browser' && (int)$row['owner_user_id'] !== (int)$user['id'] && !$isAdmin) {
        sendJSON(['error' => 'Forbidden'], 403);
    }
    $db = getDB();
    $db->prepare('DELETE FROM speedtest_schedules WHERE id = ?')->execute([$id]);
    if (function_exists('logUserAudit')) {
        logUserAudit('speedtest.schedule_delete', [
            'actor' => $user,
            'details' => ['schedule_id' => $id],
        ]);
    }
}

function speedtestStoreResult(array $payload, array $user): array
{
    $db = getDB();
    speedtestEnsureSchema($db);
    $result = $payload['result'] ?? null;
    if (!is_array($result)) sendJSON(['error' => 'result required'], 400);
    $executor = ($result['executor'] ?? 'browser') === 'worker' ? 'worker' : 'browser';
    if ($executor === 'worker' && empty($user['is_system'])) {
        // Browser clients may only post browser results.
        $executor = 'browser';
    }
    $target = ($result['target'] ?? 'internet') === 'server' ? 'server' : 'internet';
    $profile = in_array($result['profile'] ?? 'standard', ['quick', 'standard', 'thorough'], true)
        ? $result['profile']
        : 'standard';
    $trigger = in_array($payload['trigger'] ?? 'manual', ['manual', 'scheduled', 'worker'], true)
        ? $payload['trigger']
        : 'manual';
    $json = json_encode($result);
    if ($json === false || strlen($json) > 500000) {
        sendJSON(['error' => 'Result payload too large'], 400);
    }
    $stmt = $db->prepare('INSERT INTO speedtest_results
        (schedule_id, executor, target, profile, duration_ms, status, result_json, bytes_downloaded, bytes_uploaded, created_by, trigger)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    $stmt->execute([
        isset($payload['schedule_id']) ? (int)$payload['schedule_id'] : null,
        $executor,
        $target,
        $profile,
        isset($result['durationMs']) ? (int)$result['durationMs'] : null,
        'complete',
        $json,
        (int)($result['bytesDownloaded'] ?? 0),
        (int)($result['bytesUploaded'] ?? 0),
        (int)($user['id'] ?? 0) ?: null,
        $trigger,
    ]);
    return ['id' => (int)$db->lastInsertId()];
}

function speedtestListResults(array $user, bool $isAdmin, int $limit = 40): array
{
    $db = getDB();
    speedtestEnsureSchema($db);
    $limit = max(1, min(100, $limit));
    if ($isAdmin) {
        $stmt = $db->prepare('SELECT * FROM speedtest_results ORDER BY run_at DESC LIMIT ?');
        $stmt->execute([$limit]);
    } else {
        $stmt = $db->prepare("SELECT * FROM speedtest_results WHERE created_by = ? OR executor = 'worker' ORDER BY run_at DESC LIMIT ?");
        // Non-admins only see own browser results (not all worker results)
        $stmt = $db->prepare("SELECT * FROM speedtest_results WHERE created_by = ? ORDER BY run_at DESC LIMIT ?");
        $stmt->execute([(int)$user['id'], $limit]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }
    return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function speedtestPendingQueueCount(): int
{
    $db = getDB();
    speedtestEnsureSchema($db);
    $stmt = $db->query("SELECT COUNT(*) FROM speedtest_worker_queue WHERE status IN ('pending','running')");
    return (int)$stmt->fetchColumn();
}

/**
 * Prefer an enabled worker schedule when "run now" omits schedule_id.
 */
function speedtestDefaultWorkerScheduleId(): ?int
{
    $db = getDB();
    speedtestEnsureSchema($db);
    $stmt = $db->query("SELECT id FROM speedtest_schedules WHERE executor='worker' AND is_enabled=1 ORDER BY id ASC LIMIT 1");
    $id = $stmt->fetchColumn();
    return $id !== false ? (int)$id : null;
}

/**
 * Spawn scripts/speedtest_runner.py once (background) so queued jobs run without waiting for Task Scheduler.
 */
function speedtestKickRunner(): array
{
    $root = realpath(__DIR__ . '/..') ?: (__DIR__ . '/..');
    $runner = $root . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'speedtest_runner.py';
    if (!is_file($runner)) {
        return ['kicked' => false, 'reason' => 'speedtest_runner.py missing'];
    }

    $python = null;
    if (file_exists(__DIR__ . '/monitor_check_jobs_lib.php')) {
        require_once __DIR__ . '/monitor_check_jobs_lib.php';
        if (function_exists('monitorWorkerResolvePython')) {
            $python = monitorWorkerResolvePython();
        }
    }
    if (!$python) {
        $bundled = $root . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'python' . DIRECTORY_SEPARATOR . 'python.exe';
        if (is_file($bundled)) {
            $python = $bundled;
        }
    }
    if (!$python) {
        return ['kicked' => false, 'reason' => 'Python not found. Install the monitor Python runtime or schedule monitor_runner.py.'];
    }

    $dbPath = defined('DB_PATH') ? DB_PATH : ($root . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'linknest.db');
    $dataDir = defined('DB_DIR') ? DB_DIR : ($root . DIRECTORY_SEPARATOR . 'data');
    if (!is_dir($dataDir)) {
        @mkdir($dataDir, 0755, true);
    }
    $logFile = $dataDir . DIRECTORY_SEPARATOR . 'speedtest_runner_kick.log';

    $args = escapeshellarg($python) . ' '
        . escapeshellarg($runner) . ' '
        . escapeshellarg($dbPath);

    if (!function_exists('proc_open') && !function_exists('popen') && !function_exists('exec')) {
        return ['kicked' => false, 'reason' => 'PHP cannot spawn processes (proc_open/popen/exec disabled)'];
    }

    if (stripos(PHP_OS, 'WIN') === 0) {
        $cmd = 'start /B "" ' . $args . ' >> ' . escapeshellarg($logFile) . ' 2>&1';
        if (function_exists('popen')) {
            $handle = @popen($cmd, 'r');
            if ($handle === false) {
                return ['kicked' => false, 'reason' => 'Failed to start Python worker'];
            }
            pclose($handle);
            return ['kicked' => true, 'reason' => null];
        }
    }

    $cmd = $args . ' >> ' . escapeshellarg($logFile) . ' 2>&1 &';
    @exec($cmd);
    return ['kicked' => true, 'reason' => null];
}

function speedtestQueueWorkerRun(?int $scheduleId, array $user): array
{
    $db = getDB();
    speedtestEnsureSchema($db);
    if (speedtestIsWorkerRunning()) {
        sendJSON(['error' => 'A worker speed test is already running'], 409);
    }
    if (speedtestWorkerBytesToday() >= speedtestWorkerDailyCapBytes()) {
        sendJSON(['error' => 'Daily worker bandwidth cap reached'], 429);
    }
    if (!$scheduleId) {
        $scheduleId = speedtestDefaultWorkerScheduleId();
    }
    // Clear older stuck pending null jobs so a fresh run-now is unambiguous.
    $db->exec("UPDATE speedtest_worker_queue SET status='done' WHERE status='pending' AND schedule_id IS NULL");
    $db->prepare('INSERT INTO speedtest_worker_queue(schedule_id, status, requested_by) VALUES(?,?,?)')
        ->execute([$scheduleId, 'pending', (int)$user['id']]);
    $queueId = (int)$db->lastInsertId();
    if (function_exists('logUserAudit')) {
        logUserAudit('speedtest.worker_run_now', [
            'actor' => $user,
            'details' => ['schedule_id' => $scheduleId, 'queue_id' => $queueId],
        ]);
    }
    $kick = speedtestKickRunner();
    return [
        'queued' => true,
        'queue_id' => $queueId,
        'schedule_id' => $scheduleId,
        'kicked' => !empty($kick['kicked']),
        'kick_reason' => $kick['reason'] ?? null,
        'message' => !empty($kick['kicked'])
            ? 'Worker speed test queued and Python runner started.'
            : ('Worker speed test queued, but Python was not started: ' . ($kick['reason'] ?? 'unknown') . ' Start the monitor worker or install Python.'),
    ];
}

function speedtestStatusPayload(array $user, bool $isAdmin): array
{
    $db = getDB();
    speedtestEnsureSchema($db);
    $lastWorker = null;
    if ($isAdmin) {
        $stmt = $db->query("SELECT * FROM speedtest_results WHERE executor = 'worker' ORDER BY run_at DESC LIMIT 1");
        $lastWorker = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }
    return [
        'interactive_remaining' => speedtestInteractiveRemaining((int)$user['id']),
        'worker_bytes_today' => speedtestWorkerBytesToday(),
        'worker_daily_cap_bytes' => speedtestWorkerDailyCapBytes(),
        'worker_running' => speedtestIsWorkerRunning(),
        'pending_queue' => speedtestPendingQueueCount(),
        'last_worker_result' => $lastWorker,
        'worker_min_interval_minutes' => speedtestWorkerMinIntervalMinutes(),
    ];
}
