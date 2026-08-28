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
    try {
        $db->exec('ALTER TABLE monitor_check_jobs ADD COLUMN progress_json TEXT');
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

/**
 * @param list<int> $ids
 * @return list<array{id:int,name:string,status:string,response_ms:?int,seq:int}>
 */
function monitorCheckJobsSeedProgressItems(PDO $db, array $ids): array {
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static function ($v) {
        return $v > 0;
    })));
    if ($ids === []) {
        return [];
    }
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $db->prepare('SELECT id, name FROM monitors WHERE id IN (' . $placeholders . ')');
    $stmt->execute($ids);
    $names = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $names[(int)$r['id']] = trim((string)($r['name'] ?? ''));
    }
    $items = [];
    foreach ($ids as $id) {
        $name = $names[$id] ?? '';
        $items[] = [
            'id' => $id,
            'name' => $name !== '' ? $name : ('Monitor #' . $id),
            'status' => 'pending',
            'response_ms' => null,
            'seq' => count($items) + 1,
        ];
    }
    return $items;
}

/**
 * @return list<array{id:int,name:string,status:string,response_ms:?int,seq:int}>
 */
function monitorCheckJobsParseProgressJson(?string $json): array {
    if ($json === null || trim($json) === '') {
        return [];
    }
    $decoded = json_decode($json, true);
    if (!is_array($decoded)) {
        return [];
    }
    $items = [];
    foreach ($decoded as $row) {
        if (!is_array($row)) {
            continue;
        }
        $id = (int)($row['id'] ?? 0);
        if ($id <= 0) {
            continue;
        }
        $ms = $row['response_ms'] ?? null;
        $status = strtolower(trim((string)($row['status'] ?? 'pending')));
        if (!in_array($status, ['pending', 'checking', 'up', 'down', 'error', 'skipped'], true)) {
            $status = 'pending';
        }
        $name = trim((string)($row['name'] ?? ''));
        $seq = (int)($row['seq'] ?? 0);
        $items[] = [
            'id' => $id,
            'name' => $name !== '' ? $name : ('Monitor #' . $id),
            'status' => $status,
            'response_ms' => ($ms === null || $ms === '') ? null : (int)$ms,
            'seq' => $seq > 0 ? $seq : 0,
        ];
    }
    return $items;
}

function monitorCheckJobsFormatRow(array $row): array {
    $status = (string)($row['status'] ?? '');
    $startedAt = isset($row['started_at']) ? (int)$row['started_at'] : null;
    $ids = monitorCheckJobsParseIds(isset($row['monitor_ids']) ? (string)$row['monitor_ids'] : null);
    $items = monitorCheckJobsParseProgressJson(isset($row['progress_json']) ? (string)$row['progress_json'] : null);
    if ($items === [] && $ids !== [] && function_exists('getDB')) {
        try {
            $items = monitorCheckJobsSeedProgressItems(getDB(), $ids);
        } catch (Throwable $e) {
            $items = [];
        }
    }
    foreach ($items as $i => $item) {
        if ((int)($item['seq'] ?? 0) <= 0) {
            $items[$i]['seq'] = $i + 1;
        }
    }
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
        'items' => $items,
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
    $idList = array_values(array_map('intval', $monitorIds));
    $progressJson = json_encode(monitorCheckJobsSeedProgressItems($db, $idList), JSON_UNESCAPED_UNICODE);
    $stmt = $db->prepare('
        INSERT INTO monitor_check_jobs (
            created_at, requested_by, scope, monitor_ids, force_notify_rules,
            status, checked_count, total_count, progress_json
        ) VALUES (?, ?, "all", ?, ?, "queued", 0, ?, ?)
    ');
    $stmt->execute([
        $now,
        isset($user['id']) ? (int)$user['id'] : null,
        json_encode($idList),
        $forceNotifyRules ? 1 : 0,
        count($idList),
        is_string($progressJson) ? $progressJson : '[]',
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
        foreach (['314', '313', '312', '311', '310'] as $ver) {
            $candidates[] = 'C:\\Program Files\\Python' . $ver . '\\python.exe';
        }
        $local = getenv('LOCALAPPDATA') ?: '';
        if ($local !== '') {
            foreach (['Python314', 'Python313', 'Python312', 'Python311', 'Python310'] as $dir) {
                $candidates[] = $local . '\\Programs\\Python\\' . $dir . '\\python.exe';
            }
        }
        $pf86 = getenv('ProgramFiles(x86)') ?: 'C:\\Program Files (x86)';
        $candidates[] = $pf86 . '\\Python312\\python.exe';
    } else {
        $candidates[] = '/usr/bin/python3';
        $candidates[] = '/usr/local/bin/python3';
        $candidates[] = '/usr/bin/python';
    }
    return $candidates;
}

function monitorWorkerIsUsablePythonExe(?string $path): bool {
    if (!is_string($path) || $path === '' || !is_file($path)) {
        return false;
    }
    $norm = str_replace('/', '\\', $path);
    if (stripos($norm, '\\WindowsApps\\') !== false) {
        return false;
    }
    $size = @filesize($path);
    if (is_int($size) && $size > 0 && $size < 50000) {
        return false;
    }
    return true;
}

function monitorWorkerFindBinary(string $name, array $candidates): ?string {
    foreach ($candidates as $path) {
        if (is_string($path) && monitorWorkerIsUsablePythonExe($path)) {
            return $path;
        }
    }
    $which = stripos(PHP_OS, 'WIN') === 0 ? 'where' : 'command -v';
    $out = [];
    $code = 1;
    @exec($which . ' ' . escapeshellarg($name) . ' 2>&1', $out, $code);
    if ($code === 0) {
        foreach ($out as $line) {
            $candidate = trim((string)$line);
            if (monitorWorkerIsUsablePythonExe($candidate)) {
                return $candidate;
            }
        }
    }
    return null;
}

function monitorWorkerResolveViaPyLauncher(): ?string {
    if (stripos(PHP_OS, 'WIN') !== 0) {
        return null;
    }
    $out = [];
    $code = 1;
    @exec('py -3 -c "import sys; print(sys.executable)" 2>&1', $out, $code);
    if ($code === 0 && !empty($out[0])) {
        $exe = trim((string)$out[0]);
        if (monitorWorkerIsUsablePythonExe($exe)) {
            return $exe;
        }
    }
    return null;
}

function monitorWorkerResolvePython(): ?string {
    $configured = trim((string)getSetting('monitor_worker_python_path', ''));
    if ($configured !== '' && monitorWorkerIsUsablePythonExe($configured)) {
        return $configured;
    }
    return monitorWorkerFindBinary('python3', monitorWorkerDefaultPythonCandidates())
        ?: monitorWorkerFindBinary('python', monitorWorkerDefaultPythonCandidates())
        ?: monitorWorkerResolveViaPyLauncher();
}

/**
 * Run python.exe -c to read version. Returns null if the binary cannot start.
 *
 * @return array{version:string,major:int,minor:int,meets_min:bool,executable:string}|null
 */
function monitorWorkerPythonProbeVersion(string $exe, int $minMajor = 3, int $minMinor = 9): ?array {
    if (!monitorWorkerIsUsablePythonExe($exe)) {
        return null;
    }
    // Avoid % and double quotes: Windows PHP escapeshellarg strips both.
    $codeSnippet = 'import sys; v=sys.version_info; print(str(v.major)+chr(46)+str(v.minor)+chr(46)+str(v.micro)); print(sys.executable)';
    $cmd = escapeshellarg($exe) . ' -c ' . escapeshellarg($codeSnippet) . ' 2>&1';
    $out = [];
    $code = 1;
    @exec($cmd, $out, $code);
    if ($code !== 0 || empty($out)) {
        return null;
    }
    $lines = [];
    foreach ($out as $line) {
        $trim = trim((string)$line);
        if ($trim !== '') {
            $lines[] = $trim;
        }
    }
    if ($lines === [] || !preg_match('/^(\d+)\.(\d+)(?:\.(\d+))?$/', $lines[0], $m)) {
        return null;
    }
    $major = (int)$m[1];
    $minor = (int)$m[2];
    $executable = $exe;
    if (isset($lines[1]) && monitorWorkerIsUsablePythonExe($lines[1])) {
        $executable = $lines[1];
    }
    return [
        'version' => $lines[0],
        'major' => $major,
        'minor' => $minor,
        'meets_min' => ($major > $minMajor) || ($major === $minMajor && $minor >= $minMinor),
        'executable' => $executable,
    ];
}

/**
 * Health check used by the scheduler panel: interpreter, version, worker scripts.
 *
 * @return array{
 *   available:bool,
 *   meets_min:bool,
 *   min_version:string,
 *   version:?string,
 *   path:?string,
 *   source:string,
 *   scripts_ready:bool,
 *   scripts:array<string,bool>,
 *   can_install:bool,
 *   install_url:string,
 *   winget_command:string,
 *   message:string,
 *   checks:list<array{id:string,ok:bool,label:string,detail:string}>
 * }
 */
function monitorWorkerPythonHealth(): array {
    $root = realpath(__DIR__ . '/..') ?: (__DIR__ . '/..');
    $minVersion = '3.9';
    $scriptFiles = [
        'monitor_runner' => $root . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'monitor_runner.py',
        'email_sender' => $root . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'email_sender.py',
        'lib' => $root . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'linknest_worker_lib.py',
    ];
    $scripts = [];
    $scriptsOk = true;
    foreach ($scriptFiles as $key => $path) {
        $ok = is_file($path);
        $scripts[$key] = $ok;
        if (!$ok) {
            $scriptsOk = false;
        }
    }

    $isWin = stripos(PHP_OS, 'WIN') === 0;
    $isDocker = function_exists('monitorWorkerSchedulerIsDocker') && monitorWorkerSchedulerIsDocker();
    $ensurePs1 = $root . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'ensure-python-runtime.ps1';
    $canInstall = $isWin && !$isDocker && is_file($ensurePs1);
    $installUrl = 'https://www.python.org/downloads/windows/';
    $winget = 'winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements';

    $configured = trim((string)getSetting('monitor_worker_python_path', ''));
    $path = monitorWorkerResolvePython();
    $source = 'missing';
    $bundled = $root . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'python' . DIRECTORY_SEPARATOR . 'python.exe';
    if ($path) {
        if ($configured !== '' && strcasecmp($configured, $path) === 0) {
            $source = 'configured';
        } elseif (strcasecmp($path, $bundled) === 0) {
            $source = 'bundled';
        } else {
            $source = 'system';
        }
    }

    $version = null;
    $meetsMin = false;
    $runOk = false;
    if ($path) {
        $probed = monitorWorkerPythonProbeVersion($path);
        if ($probed !== null) {
            $runOk = true;
            $version = $probed['version'];
            $meetsMin = !empty($probed['meets_min']);
            if (!empty($probed['executable'])) {
                $path = $probed['executable'];
            }
        }
    }

    $available = $runOk && $meetsMin;
    $checks = [];
    $checks[] = [
        'id' => 'python',
        'ok' => $runOk,
        'label' => 'Python interpreter',
        'detail' => $runOk
            ? (($source === 'bundled' ? 'Bundled runtime' : ($source === 'configured' ? 'Configured path' : 'System Python')) . ($path ? ': ' . $path : ''))
            : ($isWin
                ? 'Not found. Install Python 3.9+ (bundled runtime, python.org, or winget) before scheduling workers.'
                : 'python3 was not found on this host.'),
    ];
    $checks[] = [
        'id' => 'version',
        'ok' => $meetsMin,
        'label' => 'Python ' . $minVersion . '+',
        'detail' => $runOk
            ? ($meetsMin ? ('Python ' . $version) : ('Python ' . $version . ' is too old (need ' . $minVersion . '+)'))
            : 'Cannot check version until Python is installed.',
    ];
    $missingScripts = [];
    foreach ($scripts as $key => $ok) {
        if (!$ok) {
            $missingScripts[] = $key . '.py';
        }
    }
    $checks[] = [
        'id' => 'scripts',
        'ok' => $scriptsOk,
        'label' => 'Worker scripts',
        'detail' => $scriptsOk
            ? 'monitor_runner.py, email_sender.py, and linknest_worker_lib.py are present.'
            : ('Missing: ' . implode(', ', $missingScripts)),
    ];

    if ($available && $scriptsOk) {
        $message = 'Python ' . $version . ' is ready for scheduled workers'
            . ($source === 'bundled' ? ' (bundled in bin\\python).' : '.');
    } elseif ($runOk && !$meetsMin) {
        $message = 'Python ' . $version . ' is too old. LinkNest workers need Python ' . $minVersion . '+.';
    } elseif ($runOk && !$scriptsOk) {
        $message = 'Python is installed, but one or more worker scripts are missing from scripts/.';
    } elseif ($isWin) {
        $message = 'Python 3.9+ was not found on this Windows host. Install Python first — then install Task Scheduler jobs.';
    } elseif ($isDocker) {
        $message = 'Python 3 is not available in this container. Rebuild the LinkNest Docker image.';
    } else {
        $message = 'Python 3.9+ was not found. Install python3, then schedule monitor_runner.py and email_sender.py with cron.';
    }

    return [
        'available' => $available,
        'meets_min' => $meetsMin,
        'min_version' => $minVersion,
        'version' => $version,
        'path' => $path,
        'source' => $source,
        'scripts_ready' => $scriptsOk,
        'scripts' => $scripts,
        'can_install' => $canInstall,
        'install_url' => $installUrl,
        'winget_command' => $winget,
        'message' => $message,
        'checks' => $checks,
    ];
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
