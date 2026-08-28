<?php
/**
 * Force-all monitor check job queue (Python handover).
 */

require_once __DIR__ . '/config.php';

const MONITOR_CHECK_JOB_STALE_SECONDS = 300;

function monitorCheckJobsEnsureSchema(PDO $db): void {
    $db->exec('CREATE TABLE IF NOT EXISTS monitor_check_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER,
        requested_by INTEGER,
        scope TEXT NOT NULL DEFAULT "all",
        monitor_ids TEXT NOT NULL,
        force_notify_rules INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT "queued",
        checked_count INTEGER DEFAULT 0,
        total_count INTEGER DEFAULT 0,
        up_count INTEGER DEFAULT 0,
        down_count INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        last_error TEXT
    )');
    try {
        $db->exec('ALTER TABLE monitor_check_jobs ADD COLUMN worker_kicked INTEGER DEFAULT 0');
    } catch (PDOException $e) {
        // column already exists
    }
}

function monitorCheckJobsRecoverStale(PDO $db): void {
    $cutoff = time() - MONITOR_CHECK_JOB_STALE_SECONDS;
    $stmt = $db->prepare('
        UPDATE monitor_check_jobs
        SET status = "queued", started_at = NULL
        WHERE status = "running" AND started_at IS NOT NULL AND started_at < ?
    ');
    $stmt->execute([$cutoff]);
}

function monitorCheckJobsParseIds(?string $json): array {
    if ($json === null || trim($json) === '') {
        return [];
    }
    $decoded = json_decode($json, true);
    if (!is_array($decoded)) {
        return [];
    }
    $ids = [];
    foreach ($decoded as $id) {
        $v = (int)$id;
        if ($v > 0) {
            $ids[] = $v;
        }
    }
    return array_values(array_unique($ids));
}

function monitorCheckJobsGetPendingMonitorIds(PDO $db): array {
    monitorCheckJobsRecoverStale($db);
    $stmt = $db->query('
        SELECT monitor_ids FROM monitor_check_jobs
        WHERE status IN ("queued", "running")
        ORDER BY id ASC
    ');
    $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_COLUMN) : [];
    $pending = [];
    foreach ($rows as $json) {
        foreach (monitorCheckJobsParseIds(is_string($json) ? $json : null) as $id) {
            $pending[$id] = true;
        }
    }
    return array_map('intval', array_keys($pending));
}

function monitorCheckJobsFindActiveAllJob(PDO $db): ?array {
    monitorCheckJobsRecoverStale($db);
    $stmt = $db->query('
        SELECT * FROM monitor_check_jobs
        WHERE scope = "all" AND status IN ("queued", "running")
        ORDER BY id ASC
        LIMIT 1
    ');
    $row = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : false;
    return $row ?: null;
}

function monitorCheckJobsFormatRow(array $row): array {
    $status = (string)($row['status'] ?? '');
    $startedAt = isset($row['started_at']) ? (int)$row['started_at'] : null;
    return [
        'id' => (int)$row['id'],
        'status' => $status,
        'created_at' => isset($row['created_at']) ? (int)$row['created_at'] : null,
        'started_at' => $startedAt,
        'finished_at' => isset($row['finished_at']) ? (int)$row['finished_at'] : null,
        'scope' => (string)($row['scope'] ?? 'all'),
        'force_notify_rules' => !empty($row['force_notify_rules']),
        'worker_kicked' => !empty($row['worker_kicked']),
        'awaiting_pickup' => $status === 'queued' && ($startedAt === null || $startedAt <= 0),
        'checked_count' => (int)($row['checked_count'] ?? 0),
        'total_count' => (int)($row['total_count'] ?? 0),
        'up_count' => (int)($row['up_count'] ?? 0),
        'down_count' => (int)($row['down_count'] ?? 0),
        'error_count' => (int)($row['error_count'] ?? 0),
        'last_error' => isset($row['last_error']) ? (string)$row['last_error'] : null,
    ];
}

function monitorCheckJobsGetById(PDO $db, int $jobId): ?array {
    $stmt = $db->prepare('SELECT * FROM monitor_check_jobs WHERE id = ? LIMIT 1');
    $stmt->execute([$jobId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function monitorCheckJobsEnqueueAll(PDO $db, array $user, array $monitorIds, bool $forceNotifyRules): array {
    monitorCheckJobsEnsureSchema($db);
    monitorCheckJobsRecoverStale($db);

    $existing = monitorCheckJobsFindActiveAllJob($db);
    if ($existing) {
        return [
            'job_id' => (int)$existing['id'],
            'coalesced' => true,
            'total' => (int)($existing['total_count'] ?? count($monitorIds)),
            'job_status' => (string)($existing['status'] ?? 'queued'),
            'checked_count' => (int)($existing['checked_count'] ?? 0),
        ];
    }

    $now = time();
    $stmt = $db->prepare('
        INSERT INTO monitor_check_jobs (
            created_at, requested_by, scope, monitor_ids, force_notify_rules,
            status, checked_count, total_count
        ) VALUES (?, ?, "all", ?, ?, "queued", 0, ?)
    ');
    $stmt->execute([
        $now,
        isset($user['id']) ? (int)$user['id'] : null,
        json_encode(array_values(array_map('intval', $monitorIds))),
        $forceNotifyRules ? 1 : 0,
        count($monitorIds),
    ]);

    return [
        'job_id' => (int)$db->lastInsertId(),
        'coalesced' => false,
        'total' => count($monitorIds),
    ];
}

function monitorWorkerDefaultPythonCandidates(): array {
    $root = realpath(__DIR__ . '/..') ?: (__DIR__ . '/..');
    $candidates = [];
    if (stripos(PHP_OS, 'WIN') === 0) {
        $candidates[] = $root . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'python' . DIRECTORY_SEPARATOR . 'python.exe';
        $candidates[] = 'C:\\Program Files\\Python312\\python.exe';
        $candidates[] = 'C:\\Program Files\\Python311\\python.exe';
        $candidates[] = 'C:\\Program Files\\Python310\\python.exe';
        $local = getenv('LOCALAPPDATA') ?: '';
        if ($local !== '') {
            $candidates[] = $local . '\\Programs\\Python\\Python312\\python.exe';
            $candidates[] = $local . '\\Programs\\Python\\Python311\\python.exe';
        }
    } else {
        $candidates[] = '/usr/bin/python3';
        $candidates[] = '/usr/local/bin/python3';
        $candidates[] = '/usr/bin/python';
    }
    return $candidates;
}

function monitorWorkerFindBinary(string $name, array $candidates): ?string {
    if (function_exists('vncGatewayFindBinary')) {
        return vncGatewayFindBinary($name, $candidates);
    }
    foreach ($candidates as $path) {
        if (is_string($path) && $path !== '' && is_file($path)) {
            return $path;
        }
    }
    $which = stripos(PHP_OS, 'WIN') === 0 ? 'where' : 'command -v';
    $out = [];
    $code = 1;
    @exec($which . ' ' . escapeshellarg($name) . ' 2>&1', $out, $code);
    if ($code === 0 && !empty($out[0]) && is_file(trim($out[0]))) {
        return trim($out[0]);
    }
    return null;
}

function monitorWorkerResolvePython(): ?string {
    $configured = trim((string)getSetting('monitor_worker_python_path', ''));
    if ($configured !== '' && is_file($configured)) {
        return $configured;
    }
    return monitorWorkerFindBinary('python3', monitorWorkerDefaultPythonCandidates())
        ?: monitorWorkerFindBinary('python', monitorWorkerDefaultPythonCandidates());
}

function monitorWorkerDbPath(): string {
    if (defined('DB_PATH') && DB_PATH) {
        return DB_PATH;
    }
    return realpath(__DIR__ . '/../data/linknest.db') ?: (__DIR__ . '/../data/linknest.db');
}

function monitorWorkerMaxWorkers(): int {
    $raw = getSetting('monitor_worker_max_workers', '20');
    $n = (int)$raw;
    if ($n < 1) {
        $n = 20;
    }
    if ($n > 64) {
        $n = 64;
    }
    return $n;
}

function monitorWorkerKickRunner(): bool {
    if (!function_exists('proc_open') && !function_exists('popen')) {
        error_log('[MONITOR] Cannot kick Python worker: proc_open/popen disabled');
        return false;
    }

    $python = monitorWorkerResolvePython();
    if (!$python) {
        error_log('[MONITOR] Cannot kick Python worker: python not found');
        return false;
    }

    $root = realpath(__DIR__ . '/..') ?: (__DIR__ . '/..');
    $runner = $root . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'monitor_runner.py';
    if (!is_file($runner)) {
        error_log('[MONITOR] Cannot kick Python worker: monitor_runner.py missing');
        return false;
    }

    $dbPath = monitorWorkerDbPath();
    $dataDir = defined('DB_DIR') ? DB_DIR : ($root . DIRECTORY_SEPARATOR . 'data');
    if (!is_dir($dataDir)) {
        @mkdir($dataDir, 0755, true);
    }
    $logFile = $dataDir . DIRECTORY_SEPARATOR . 'monitor_runner_kick.log';

    $args = escapeshellarg($python) . ' '
        . escapeshellarg($runner)
        . ' --db ' . escapeshellarg($dbPath)
        . ' --max-workers ' . monitorWorkerMaxWorkers();

    if (stripos(PHP_OS, 'WIN') === 0) {
        $cmd = 'start /B "" ' . $args . ' >> ' . escapeshellarg($logFile) . ' 2>&1';
        $handle = @popen($cmd, 'r');
        if ($handle === false) {
            return false;
        }
        pclose($handle);
        return true;
    }

    $cmd = $args . ' >> ' . escapeshellarg($logFile) . ' 2>&1 &';
    @exec($cmd, $out, $code);
    return true;
}

function monitorCheckJobsHandleCancel(int $jobId): void {
    $db = getDB();
    monitorCheckJobsEnsureSchema($db);
    monitorCheckJobsRecoverStale($db);

    $row = monitorCheckJobsGetById($db, $jobId);
    if (!$row) {
        sendJSON(['error' => 'Check job not found'], 404);
        return;
    }

    $status = (string)($row['status'] ?? '');
    if ($status === 'cancelled') {
        sendJSON([
            'success' => true,
            'already_cancelled' => true,
            'job' => monitorCheckJobsFormatRow($row),
            'message' => 'Job was already cancelled.',
        ]);
        return;
    }

    if (!in_array($status, ['queued', 'running'], true)) {
        sendJSON([
            'error' => 'Job cannot be cancelled',
            'job' => monitorCheckJobsFormatRow($row),
        ], 409);
        return;
    }

    $now = time();
    $stmt = $db->prepare('
        UPDATE monitor_check_jobs SET
          status = "cancelled",
          finished_at = ?,
          last_error = ?
        WHERE id = ? AND status IN ("queued", "running")
    ');
    $stmt->execute([$now, 'Cancelled by user', $jobId]);

    if ($stmt->rowCount() !== 1) {
        $row = monitorCheckJobsGetById($db, $jobId);
        if (!$row) {
            sendJSON(['error' => 'Check job not found'], 404);
            return;
        }
        if ((string)($row['status'] ?? '') === 'cancelled') {
            sendJSON([
                'success' => true,
                'already_cancelled' => true,
                'job' => monitorCheckJobsFormatRow($row),
                'message' => 'Job was already cancelled.',
            ]);
            return;
        }
        sendJSON([
            'error' => 'Job could not be cancelled',
            'job' => monitorCheckJobsFormatRow($row),
        ], 409);
        return;
    }

    $updated = monitorCheckJobsGetById($db, $jobId);
    sendJSON([
        'success' => true,
        'job' => monitorCheckJobsFormatRow($updated ?: $row),
        'message' => $status === 'running'
            ? 'Cancellation requested. The worker will stop after the current probes finish.'
            : 'Job cancelled before the worker started.',
    ]);
}

function monitorCheckJobsHandleGetActive(): void {
    $db = getDB();
    monitorCheckJobsEnsureSchema($db);
    monitorCheckJobsRecoverStale($db);

    $row = monitorCheckJobsFindActiveAllJob($db);
    if (!$row) {
        sendJSON(['success' => true, 'job' => null]);
        return;
    }

    sendJSON(['success' => true, 'job' => monitorCheckJobsFormatRow($row)]);
}

function monitorCheckJobsHandleGet(int $jobId): void {
    $db = getDB();
    monitorCheckJobsEnsureSchema($db);
    monitorCheckJobsRecoverStale($db);

    $row = monitorCheckJobsGetById($db, $jobId);
    if (!$row) {
        sendJSON(['error' => 'Check job not found'], 404);
        return;
    }

    sendJSON(['success' => true, 'job' => monitorCheckJobsFormatRow($row)]);
}

function monitorCheckJobsHandleEnqueueAll(array $user, array $monitors, bool $forceNotifyRules): void {
    $db = getDB();
    $monitorIds = array_map(static function ($m) {
        return (int)$m['id'];
    }, $monitors);

    $enqueue = monitorCheckJobsEnqueueAll($db, $user, $monitorIds, $forceNotifyRules);
    $coalesced = !empty($enqueue['coalesced']);
    $kicked = $coalesced ? false : monitorWorkerKickRunner();

    if ($kicked && !$coalesced) {
        $stmt = $db->prepare('UPDATE monitor_check_jobs SET worker_kicked = 1 WHERE id = ?');
        $stmt->execute([(int)$enqueue['job_id']]);
    }

    $jobRow = monitorCheckJobsGetById($db, (int)$enqueue['job_id']);
    $payload = [
        'success' => true,
        'queued' => true,
        'engine' => 'python',
        'job_id' => (int)$enqueue['job_id'],
        'coalesced' => $coalesced,
        'kicked' => $kicked,
        'total' => (int)$enqueue['total'],
        'message' => $coalesced
            ? 'A Python check is already in progress for these monitors.'
            : ($kicked
                ? 'Queued for Python monitor_runner (worker started).'
                : 'Queued for Python monitor_runner (waiting for scheduled worker).'),
    ];
    if ($jobRow) {
        $payload['job'] = monitorCheckJobsFormatRow($jobRow);
    }

    sendJSON($payload);
}
