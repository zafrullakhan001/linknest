<?php
/**
 * Probe Windows Task Scheduler (or Docker) for LinkNest Python worker jobs.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/monitor_check_jobs_lib.php';

const MONITOR_WORKER_TASK_MONITOR = 'LinkNest - Monitor Runner';
const MONITOR_WORKER_TASK_EMAIL = 'LinkNest - Email Sender';

function monitorWorkerSchedulerIsDocker(): bool {
    if (is_file('/.dockerenv')) {
        return true;
    }
    $flag = getenv('LINKNEST_IN_DOCKER');
    return $flag !== false && $flag !== '' && $flag !== '0';
}

const MONITOR_DOCKER_SETTING_MONITOR = 'docker_workers_monitor_enabled';
const MONITOR_DOCKER_SETTING_EMAIL = 'docker_workers_email_enabled';

function monitorWorkerSchedulerDockerHasPython(): bool {
    $out = [];
    $code = 1;
    @exec('command -v python3 2>/dev/null', $out, $code);
    return $code === 0;
}

function monitorWorkerSchedulerDockerEnvEnabledDefault(): bool {
    $enabled = getenv('LINKNEST_WORKERS_ENABLED');
    if ($enabled === false || $enabled === '') {
        return true;
    }
    return in_array(strtolower((string)$enabled), ['1', 'true', 'yes', 'on'], true);
}

function monitorWorkerSchedulerDockerComponentReady(string $taskKey): bool {
    if (!monitorWorkerSchedulerDockerHasPython()) {
        return false;
    }
    $script = $taskKey === 'email_sender'
        ? '/var/www/html/scripts/email_sender.py'
        : '/var/www/html/scripts/monitor_runner.py';
    return is_file($script);
}

function monitorWorkerSchedulerReadDockerTaskEnabled(string $taskKey): bool {
    $settingKey = $taskKey === 'email_sender'
        ? MONITOR_DOCKER_SETTING_EMAIL
        : MONITOR_DOCKER_SETTING_MONITOR;
    $val = getSetting($settingKey, '');
    if ($val === '1') {
        return true;
    }
    if ($val === '0') {
        return false;
    }
    return monitorWorkerSchedulerDockerEnvEnabledDefault();
}

function monitorWorkerSchedulerBuildDockerTask(string $taskKey, string $label): array {
    $exists = monitorWorkerSchedulerDockerComponentReady($taskKey);
    $enabled = $exists && monitorWorkerSchedulerReadDockerTaskEnabled($taskKey);
    return [
        'name' => $label,
        'exists' => $exists,
        'enabled' => $enabled,
        'state' => !$exists ? 'missing' : ($enabled ? 'Enabled' : 'Disabled'),
        'status' => !$exists
            ? 'Missing Python worker'
            : ($enabled ? 'Running via entrypoint loop' : 'Paused'),
        'next_run' => null,
        'last_run' => null,
        'last_result' => null,
    ];
}

function monitorWorkerSchedulerBuildDockerStatus(): array {
    $monitor = monitorWorkerSchedulerBuildDockerTask('monitor_runner', 'Docker entrypoint — Monitor Runner');
    $email = monitorWorkerSchedulerBuildDockerTask('email_sender', 'Docker entrypoint — Email Sender');
    $interval = (int)(getenv('LINKNEST_WORKER_INTERVAL_SECONDS') ?: 60);
    if ($interval < 1) {
        $interval = 60;
    }

    $monitorOk = !empty($monitor['exists']) && !empty($monitor['enabled']);
    $emailOk = !empty($email['exists']) && !empty($email['enabled']);
    $pythonReady = $monitorOk;

    $status = 'ok';
    $message = 'Docker entrypoint runs monitor_runner.py and email_sender.py on an interval (no Task Scheduler needed).';

    if (!$monitor['exists'] && !$email['exists']) {
        $status = 'not_installed';
        $message = 'Python workers are not available in this container (Python 3 or worker scripts missing).';
        $pythonReady = false;
    } elseif (!$monitor['exists']) {
        $status = 'partial';
        $message = 'Monitor Runner script or Python 3 is missing in this container.';
        $pythonReady = false;
    } elseif (!$monitor['enabled']) {
        $status = 'disabled';
        $message = 'Docker Monitor Runner is disabled. Python checks and Py force-all pickup will not run on a schedule until you enable it.';
        $pythonReady = false;
    } elseif (!$emailOk) {
        $status = 'partial';
        if (!$email['exists']) {
            $message = 'Monitor Runner is enabled, but the Email Sender worker is missing in this container — checks will run but alert emails may not send.';
        } else {
            $message = 'Monitor Runner is enabled, but Docker Email Sender is disabled — checks will run but alert emails may not send.';
        }
        $pythonReady = true;
    }

    return monitorWorkerSchedulerAttachPythonHealth([
        'platform' => 'docker',
        'scheduler_applicable' => true,
        'python_ready' => (bool)$pythonReady,
        'status' => $status,
        'message' => $message,
        'tasks' => [
            'monitor_runner' => $monitor,
            'email_sender' => $email,
        ],
        'install_hint' => $status === 'not_installed'
            ? 'Rebuild or update the LinkNest Docker image so Python 3 and scripts/monitor_runner.py are present.'
            : 'Use Install tasks in the scheduler panel to enable both workers, or Enable / Disable each worker below.',
        'docker' => [
            'interval_seconds' => $interval,
            'runtime_control' => true,
        ],
    ]);
}

/**
 * Enable or disable a Docker entrypoint worker (persisted in settings; picked up each loop).
 *
 * @return array{ok:bool,error?:string,http?:int,message?:string,already?:bool,task_key?:string,task_name?:string,enabled?:bool}
 */
function monitorWorkerSchedulerSetDockerTaskEnabled(string $taskKey, bool $enabled): array {
    if (!monitorWorkerSchedulerIsDocker()) {
        return ['ok' => false, 'error' => 'Not running in Docker.', 'http' => 400];
    }
    if (!in_array($taskKey, ['monitor_runner', 'email_sender'], true)) {
        return ['ok' => false, 'error' => 'Invalid task key.', 'http' => 400];
    }

    if (!monitorWorkerSchedulerDockerComponentReady($taskKey)) {
        return [
            'ok' => false,
            'error' => 'Worker is not available in this container (Python 3 or worker script missing).',
            'http' => 404,
        ];
    }

    $label = $taskKey === 'email_sender' ? 'Email Sender' : 'Monitor Runner';
    $current = monitorWorkerSchedulerReadDockerTaskEnabled($taskKey);
    if ($current === $enabled) {
        return [
            'ok' => true,
            'already' => true,
            'message' => $enabled
                ? $label . ' is already enabled.'
                : $label . ' is already disabled.',
            'task_key' => $taskKey,
            'task_name' => 'Docker ' . $label,
            'enabled' => $enabled,
        ];
    }

    $settingKey = $taskKey === 'email_sender'
        ? MONITOR_DOCKER_SETTING_EMAIL
        : MONITOR_DOCKER_SETTING_MONITOR;
    setSetting($settingKey, $enabled ? '1' : '0');

    return [
        'ok' => true,
        'message' => ($enabled ? 'Enabled' : 'Disabled') . ' Docker ' . $label . '. Changes apply on the next worker loop (within '
            . (int)(getenv('LINKNEST_WORKER_INTERVAL_SECONDS') ?: 60) . 's).',
        'task_key' => $taskKey,
        'task_name' => 'Docker ' . $label,
        'enabled' => $enabled,
    ];
}

/**
 * Enable both Docker workers (equivalent to Install on Windows).
 *
 * @return array{ok:bool,error?:string,http?:int,message?:string,scheduler?:array}
 */
function monitorWorkerSchedulerInstallDockerTasks(): array {
    if (!monitorWorkerSchedulerIsDocker()) {
        return ['ok' => false, 'error' => 'Not running in Docker.', 'http' => 400];
    }

    $monitorReady = monitorWorkerSchedulerDockerComponentReady('monitor_runner');
    $emailReady = monitorWorkerSchedulerDockerComponentReady('email_sender');
    if (!$monitorReady && !$emailReady) {
        return [
            'ok' => false,
            'error' => 'Python 3 or worker scripts are missing in this container. Rebuild the LinkNest Docker image.',
            'http' => 500,
        ];
    }

    if ($monitorReady) {
        setSetting(MONITOR_DOCKER_SETTING_MONITOR, '1');
    }
    if ($emailReady) {
        setSetting(MONITOR_DOCKER_SETTING_EMAIL, '1');
    }

    $scheduler = monitorWorkerSchedulerBuildDockerStatus();
    $parts = [];
    if ($monitorReady) {
        $parts[] = 'Monitor Runner';
    }
    if ($emailReady) {
        $parts[] = 'Email Sender';
    }

    return [
        'ok' => true,
        'message' => 'Enabled Docker workers: ' . implode(' and ', $parts) . '.',
        'scheduler' => $scheduler,
    ];
}

function monitorWorkerSchedulerParseListValue(string $line): ?string {
    $pos = strpos($line, ':');
    if ($pos === false) {
        return null;
    }
    return trim(substr($line, $pos + 1));
}

function monitorWorkerSchedulerQueryWindowsTask(string $taskName): array {
    $task = [
        'name' => $taskName,
        'exists' => false,
        'enabled' => false,
        'state' => 'missing',
        'status' => 'missing',
        'next_run' => null,
        'last_run' => null,
        'last_result' => null,
    ];

    if (stripos(PHP_OS, 'WIN') !== 0) {
        return $task;
    }

    $cmd = 'schtasks /Query /TN ' . escapeshellarg($taskName) . ' /FO LIST /V 2>&1';
    $out = [];
    $code = 1;
    @exec($cmd, $out, $code);
    if ($code !== 0 || empty($out)) {
        return $task;
    }

    $task['exists'] = true;
    $scheduledState = '';
    $statusLine = '';

    foreach ($out as $line) {
        $line = rtrim((string)$line);
        if (stripos($line, 'Scheduled Task State:') === 0) {
            $scheduledState = monitorWorkerSchedulerParseListValue($line) ?? '';
        } elseif (stripos($line, 'Status:') === 0) {
            $statusLine = monitorWorkerSchedulerParseListValue($line) ?? '';
        } elseif (stripos($line, 'Next Run Time:') === 0) {
            $val = monitorWorkerSchedulerParseListValue($line);
            if ($val !== null && $val !== '' && strcasecmp($val, 'N/A') !== 0) {
                $task['next_run'] = $val;
            }
        } elseif (stripos($line, 'Last Run Time:') === 0) {
            $val = monitorWorkerSchedulerParseListValue($line);
            if ($val !== null && $val !== '') {
                $task['last_run'] = $val;
            }
        } elseif (stripos($line, 'Last Result:') === 0) {
            $val = monitorWorkerSchedulerParseListValue($line);
            if ($val !== null && $val !== '' && is_numeric($val)) {
                $task['last_result'] = (int)$val;
            }
        }
    }

    $state = $scheduledState !== '' ? $scheduledState : $statusLine;
    $task['state'] = $state !== '' ? $state : 'unknown';
    $task['status'] = $statusLine !== '' ? $statusLine : $task['state'];

    $disabled = static function (string $text): bool {
        return stripos($text, 'disabled') !== false;
    };

    $task['enabled'] = !$disabled($scheduledState) && !$disabled($statusLine);
    if ($task['enabled'] && $scheduledState !== '' && $disabled($scheduledState)) {
        $task['enabled'] = false;
    }
    $task['enabled'] = (bool)$task['enabled'];
    $task['exists'] = (bool)$task['exists'];

    return $task;
}

function monitorWorkerSchedulerBuildStatus(): array {
    if (monitorWorkerSchedulerIsDocker()) {
        return monitorWorkerSchedulerBuildDockerStatus();
    }

    if (stripos(PHP_OS, 'WIN') !== 0) {
        return monitorWorkerSchedulerAttachPythonHealth([
            'platform' => 'linux',
            'scheduler_applicable' => true,
            'python_ready' => null,
            'status' => 'unavailable',
            'message' => 'Task Scheduler probe is Windows-only. Ensure cron (or systemd) runs monitor_runner.py and email_sender.py — see Help → Python Monitor Workers.',
            'tasks' => [
                'monitor_runner' => monitorWorkerSchedulerQueryWindowsTask(MONITOR_WORKER_TASK_MONITOR),
                'email_sender' => monitorWorkerSchedulerQueryWindowsTask(MONITOR_WORKER_TASK_EMAIL),
            ],
            'install_hint' => 'See docs/PYTHON_WORKERS.md (Linux cron examples).',
        ]);
    }

    $monitor = monitorWorkerSchedulerQueryWindowsTask(MONITOR_WORKER_TASK_MONITOR);
    $email = monitorWorkerSchedulerQueryWindowsTask(MONITOR_WORKER_TASK_EMAIL);

    $monitorOk = !empty($monitor['exists']) && !empty($monitor['enabled']);
    $emailOk = !empty($email['exists']) && !empty($email['enabled']);

    $status = 'ok';
    $message = 'Both LinkNest Task Scheduler jobs are installed and enabled.';
    $pythonReady = $monitorOk;

    if (!$monitor['exists'] && !$email['exists']) {
        $status = 'not_installed';
        $message = 'LinkNest Python worker tasks are not scheduled. Force-all (Py) and scheduled checks will not run until you install Task Scheduler jobs.';
        $pythonReady = false;
    } elseif (!$monitor['exists']) {
        $status = 'partial';
        $message = 'Task "' . MONITOR_WORKER_TASK_MONITOR . '" is missing. Python monitor checks will not run on a schedule or pick up queued jobs reliably.';
        $pythonReady = false;
    } elseif (!$monitor['enabled']) {
        $status = 'disabled';
        $message = 'Task "' . MONITOR_WORKER_TASK_MONITOR . '" is disabled in Task Scheduler. Python checks and Py force-all pickup will not run until you enable it (or re-run scripts\\schedule-monitor-workers.bat).';
        $pythonReady = false;
    } elseif (!$emailOk) {
        $status = 'partial';
        if (!$email['exists']) {
            $message = 'Monitor Runner is enabled, but "' . MONITOR_WORKER_TASK_EMAIL . '" is not installed — checks will run but alert emails may not send.';
        } else {
            $message = 'Monitor Runner is enabled, but "' . MONITOR_WORKER_TASK_EMAIL . '" is disabled — checks will run but alert emails may not send.';
        }
        $pythonReady = true;
    }

    return monitorWorkerSchedulerAttachPythonHealth([
        'platform' => 'windows',
        'scheduler_applicable' => true,
        'python_ready' => (bool)$pythonReady,
        'status' => $status,
        'message' => $message,
        'tasks' => [
            'monitor_runner' => $monitor,
            'email_sender' => $email,
        ],
        'install_hint' => 'Use Install tasks in the scheduler panel, run scripts\\schedule-monitor-workers.bat from the project root, or enable tasks in Task Scheduler → Task Scheduler Library.',
    ]);
}

/**
 * Attach Python interpreter health and, on Windows, block scheduling until Python 3.9+ is present.
 *
 * @param array<string,mixed> $status
 * @return array<string,mixed>
 */
function monitorWorkerSchedulerAttachPythonHealth(array $status): array {
    $health = monitorWorkerPythonHealth();
    $status['python'] = $health;

    $platform = $status['platform'] ?? '';
    if (!empty($health['available'])) {
        return $status;
    }

    $status['python_ready'] = false;
    if ($platform === 'windows') {
        $status['status'] = 'python_missing';
        $status['message'] = $health['message'];
        $status['install_hint'] = !empty($health['can_install'])
            ? 'Use Install Python in the scheduler panel to download a bundled Python 3.12 runtime into bin\\python (no admin required), then Install tasks. Or install system Python from python.org and Recheck.'
            : 'Install Python 3.9+ from https://www.python.org/downloads/windows/ (enable Add python.exe to PATH), then Recheck and Install tasks.';
    } elseif ($platform === 'linux') {
        $status['status'] = 'python_missing';
        $status['message'] = $health['message'];
        $status['install_hint'] = 'Install Python 3.9+ (python3) on the host, then add cron jobs for monitor_runner.py and email_sender.py — see docs/PYTHON_WORKERS.md.';
    }

    return $status;
}

function monitorWorkerSchedulerResolveTaskKey(string $key): ?string {
    $map = [
        'monitor_runner' => MONITOR_WORKER_TASK_MONITOR,
        'email_sender' => MONITOR_WORKER_TASK_EMAIL,
    ];
    return $map[$key] ?? null;
}

/**
 * Enable or disable a registered LinkNest Windows Task Scheduler job.
 *
 * @return array{ok:bool,error?:string,http?:int,message?:string,already?:bool,task_key?:string,task_name?:string,enabled?:bool}
 */
function monitorWorkerSchedulerSetTaskEnabled(string $taskKey, bool $enabled): array {
    if (monitorWorkerSchedulerIsDocker()) {
        return monitorWorkerSchedulerSetDockerTaskEnabled($taskKey, $enabled);
    }
    if (stripos(PHP_OS, 'WIN') !== 0) {
        return ['ok' => false, 'error' => 'Task Scheduler control is Windows-only.', 'http' => 400];
    }

    $taskName = monitorWorkerSchedulerResolveTaskKey($taskKey);
    if ($taskName === null) {
        return ['ok' => false, 'error' => 'Invalid task key.', 'http' => 400];
    }

    $current = monitorWorkerSchedulerQueryWindowsTask($taskName);
    if (empty($current['exists'])) {
        return [
            'ok' => false,
            'error' => 'Task is not installed. Use Install tasks in the scheduler panel or run scripts\\schedule-monitor-workers.bat.',
            'http' => 404,
        ];
    }

    if (!empty($current['enabled']) === $enabled) {
        return [
            'ok' => true,
            'already' => true,
            'message' => $enabled
                ? 'Task is already enabled.'
                : 'Task is already disabled.',
            'task_key' => $taskKey,
            'task_name' => $taskName,
            'enabled' => $enabled,
        ];
    }

    $flag = $enabled ? '/ENABLE' : '/DISABLE';
    $cmd = 'schtasks /Change /TN ' . escapeshellarg($taskName) . ' ' . $flag . ' 2>&1';
    $out = [];
    $code = 1;
    @exec($cmd, $out, $code);
    if ($code !== 0) {
        $detail = trim(implode("\n", array_map('strval', $out)));
        $hint = 'Ensure Apache/PHP runs as a Windows user with permission to change scheduled tasks.';
        return [
            'ok' => false,
            'error' => ($detail !== '' ? $detail : 'schtasks failed to change task state.') . ' ' . $hint,
            'http' => 500,
        ];
    }

    $verified = monitorWorkerSchedulerQueryWindowsTask($taskName);
    if (!empty($verified['enabled']) !== $enabled) {
        return [
            'ok' => false,
            'error' => 'Task state did not change after schtasks command. ' .
                'Ensure Apache/PHP runs as a user with Task Scheduler permissions.',
            'http' => 500,
        ];
    }

    return [
        'ok' => true,
        'message' => ($enabled ? 'Enabled' : 'Disabled') . ' "' . $taskName . '".',
        'task_key' => $taskKey,
        'task_name' => $taskName,
        'enabled' => $enabled,
    ];
}

function monitorWorkerSchedulerProjectRoot(): string {
    return realpath(__DIR__ . '/..') ?: (__DIR__ . '/..');
}

function monitorWorkerSchedulerResolvePowerShell(): ?string {
    $systemRoot = getenv('SystemRoot') ?: getenv('WINDIR');
    $candidates = [];
    if (is_string($systemRoot) && $systemRoot !== '') {
        $candidates[] = rtrim($systemRoot, '\\/') . DIRECTORY_SEPARATOR . 'System32'
            . DIRECTORY_SEPARATOR . 'WindowsPowerShell' . DIRECTORY_SEPARATOR . 'v1.0'
            . DIRECTORY_SEPARATOR . 'powershell.exe';
    }
    $candidates[] = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

    foreach ($candidates as $path) {
        if (is_string($path) && $path !== '' && is_file($path)) {
            return $path;
        }
    }

    $out = [];
    $code = 1;
    @exec('where powershell.exe 2>nul', $out, $code);
    if ($code === 0 && !empty($out[0]) && is_file(trim((string)$out[0]))) {
        return trim((string)$out[0]);
    }

    return null;
}

function monitorWorkerSchedulerIntervalMinutes(): int {
    $raw = getSetting('monitor_worker_interval_minutes', '1');
    $n = (int)$raw;
    if ($n < 1) {
        $n = 1;
    }
    if ($n > 60) {
        $n = 60;
    }
    return $n;
}

function monitorWorkerSchedulerTasksNeedInstall(?array $scheduler = null): bool {
    $scheduler = $scheduler ?? monitorWorkerSchedulerBuildStatus();
    $platform = $scheduler['platform'] ?? '';
    $tasks = $scheduler['tasks'] ?? [];
    $monitor = $tasks['monitor_runner'] ?? [];
    $email = $tasks['email_sender'] ?? [];

    if ($platform === 'windows') {
        return empty($monitor['exists']) || empty($email['exists']);
    }
    if ($platform === 'docker') {
        if (empty($monitor['exists']) || empty($email['exists'])) {
            return true;
        }
        return empty($monitor['enabled']) || empty($email['enabled']);
    }
    return false;
}

/**
 * Register LinkNest Monitor Runner + Email Sender Windows Task Scheduler jobs.
 *
 * @return array{ok:bool,error?:string,http?:int,message?:string,scheduler?:array,output_tail?:string[]}
 */
function monitorWorkerSchedulerInstallTasks(?int $intervalMinutes = null, ?int $maxWorkers = null): array {
    if (monitorWorkerSchedulerIsDocker()) {
        return monitorWorkerSchedulerInstallDockerTasks();
    }

    require_once __DIR__ . '/monitor_check_jobs_lib.php';

    if (stripos(PHP_OS, 'WIN') !== 0) {
        return ['ok' => false, 'error' => 'Task Scheduler install is Windows-only.', 'http' => 400];
    }

    $pythonHealth = monitorWorkerPythonHealth();
    if (empty($pythonHealth['available'])) {
        $hint = !empty($pythonHealth['can_install'])
            ? 'Use Install Python in the scheduler panel first (downloads a bundled runtime into bin\\python), or install Python 3.9+ from python.org and Recheck.'
            : 'Install Python 3.9+ from https://www.python.org/downloads/windows/ (enable Add python.exe to PATH), then Recheck.';
        return [
            'ok' => false,
            'error' => ($pythonHealth['message'] ?? 'Python 3.9+ was not found.') . "\n\n" . $hint,
            'http' => 400,
            'scheduler' => monitorWorkerSchedulerBuildStatus(),
        ];
    }

    $root = monitorWorkerSchedulerProjectRoot();
    $ps1 = $root . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'schedule-monitor-workers.ps1';
    if (!is_file($ps1)) {
        return ['ok' => false, 'error' => 'Installer script not found: scripts\\schedule-monitor-workers.ps1', 'http' => 500];
    }

    $powershell = monitorWorkerSchedulerResolvePowerShell();
    if (!$powershell) {
        return ['ok' => false, 'error' => 'PowerShell was not found on this host.', 'http' => 500];
    }

    $interval = $intervalMinutes ?? monitorWorkerSchedulerIntervalMinutes();
    $interval = max(1, min(60, (int)$interval));
    $workers = $maxWorkers ?? monitorWorkerMaxWorkers();
    $workers = max(1, min(64, (int)$workers));
    $dbPath = monitorWorkerDbPath();

    $dataDir = defined('DB_DIR') ? DB_DIR : ($root . DIRECTORY_SEPARATOR . 'data');
    if (!is_dir($dataDir)) {
        @mkdir($dataDir, 0755, true);
    }
    $logFile = $dataDir . DIRECTORY_SEPARATOR . 'monitor_scheduler_install.log';

    $argList = [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', $ps1,
        '-Action', 'install',
        '-SkipSmoke',
        '-Root', $root,
        '-DbPath', $dbPath,
        '-IntervalMinutes', (string)$interval,
        '-MaxWorkers', (string)$workers,
    ];

    $python = monitorWorkerResolvePython();
    if ($python) {
        $argList[] = '-Python';
        $argList[] = $python;
    }

    $taskUser = trim((string)getSetting('monitor_worker_task_user', ''));
    if ($taskUser !== '') {
        $argList[] = '-TaskUser';
        $argList[] = $taskUser;
    }

    $cmd = escapeshellarg($powershell);
    foreach ($argList as $arg) {
        $cmd .= ' ' . escapeshellarg((string)$arg);
    }
    $cmd .= ' 2>&1';

    if (function_exists('set_time_limit')) {
        @set_time_limit(120);
    }

    $out = [];
    $code = 1;
    @exec($cmd, $out, $code);

    $logBody = date('c') . " install exit={$code}\n" . implode("\n", array_map('strval', $out)) . "\n\n";
    @file_put_contents($logFile, $logBody, FILE_APPEND);

    if ($code !== 0) {
        $tail = array_slice(array_map('strval', $out), -24);
        $detail = trim(implode("\n", $tail));
        $hint = 'Ensure Apache/PHP runs as a Windows user with permission to register scheduled tasks, and Python 3.9+ is installed.';
        return [
            'ok' => false,
            'error' => ($detail !== '' ? $detail : 'Scheduler install failed.') . "\n\n" . $hint,
            'http' => 500,
            'output_tail' => $tail,
        ];
    }

    $scheduler = monitorWorkerSchedulerBuildStatus();
    if (monitorWorkerSchedulerTasksNeedInstall($scheduler)) {
        return [
            'ok' => false,
            'error' => 'Install finished but one or more LinkNest worker tasks are still missing. Check data/monitor_scheduler_install.log on the server.',
            'http' => 500,
            'scheduler' => $scheduler,
        ];
    }

    return [
        'ok' => true,
        'message' => 'Installed LinkNest Monitor Runner and Email Sender Task Scheduler jobs (every '
            . $interval . ' min, max workers ' . $workers . ').',
        'scheduler' => $scheduler,
        'output_tail' => array_slice(array_map('strval', $out), -12),
    ];
}

function monitorWorkerSchedulerTasksCanUninstall(?array $scheduler = null): bool {
    $scheduler = $scheduler ?? monitorWorkerSchedulerBuildStatus();
    $platform = $scheduler['platform'] ?? '';
    $tasks = $scheduler['tasks'] ?? [];
    $monitor = $tasks['monitor_runner'] ?? [];
    $email = $tasks['email_sender'] ?? [];

    if ($platform === 'windows') {
        return !empty($monitor['exists']) || !empty($email['exists']);
    }
    if ($platform === 'docker') {
        return !empty($monitor['exists']) || !empty($email['exists']);
    }
    return false;
}

/**
 * Disable Docker entrypoint workers (persisted settings).
 *
 * @return array{ok:bool,error?:string,http?:int,message?:string,scheduler?:array,already?:bool}
 */
function monitorWorkerSchedulerUninstallDockerTasks(): array {
    if (!monitorWorkerSchedulerIsDocker()) {
        return ['ok' => false, 'error' => 'Not running in Docker.', 'http' => 400];
    }

    $monitorReady = monitorWorkerSchedulerDockerComponentReady('monitor_runner');
    $emailReady = monitorWorkerSchedulerDockerComponentReady('email_sender');
    if (!$monitorReady && !$emailReady) {
        return [
            'ok' => false,
            'error' => 'Python workers are not available in this container.',
            'http' => 404,
        ];
    }

    $alreadyOff = true;
    if ($monitorReady && monitorWorkerSchedulerReadDockerTaskEnabled('monitor_runner')) {
        $alreadyOff = false;
    }
    if ($emailReady && monitorWorkerSchedulerReadDockerTaskEnabled('email_sender')) {
        $alreadyOff = false;
    }

    if ($monitorReady) {
        setSetting(MONITOR_DOCKER_SETTING_MONITOR, '0');
    }
    if ($emailReady) {
        setSetting(MONITOR_DOCKER_SETTING_EMAIL, '0');
    }

    $scheduler = monitorWorkerSchedulerBuildDockerStatus();
    $message = $alreadyOff
        ? 'Docker workers were already disabled.'
        : 'Removed Docker worker scheduling — Monitor Runner and Email Sender are disabled until you install/enable again.';

    return [
        'ok' => true,
        'already' => $alreadyOff,
        'message' => $message,
        'scheduler' => $scheduler,
    ];
}

/**
 * Remove LinkNest worker jobs from Windows Task Scheduler.
 *
 * @return array{ok:bool,error?:string,http?:int,message?:string,scheduler?:array,already?:bool,output_tail?:string[]}
 */
function monitorWorkerSchedulerUninstallWindowsTasks(): array {
    if (stripos(PHP_OS, 'WIN') !== 0) {
        return ['ok' => false, 'error' => 'Task Scheduler uninstall is Windows-only.', 'http' => 400];
    }

    $schedulerBefore = monitorWorkerSchedulerBuildStatus();
    if (!monitorWorkerSchedulerTasksCanUninstall($schedulerBefore)) {
        return [
            'ok' => true,
            'already' => true,
            'message' => 'No LinkNest Task Scheduler jobs are installed.',
            'scheduler' => $schedulerBefore,
        ];
    }

    $root = monitorWorkerSchedulerProjectRoot();
    $ps1 = $root . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'schedule-monitor-workers.ps1';
    if (!is_file($ps1)) {
        // Fallback: schtasks delete per task
        $removed = 0;
        foreach ([MONITOR_WORKER_TASK_MONITOR, MONITOR_WORKER_TASK_EMAIL] as $taskName) {
            $current = monitorWorkerSchedulerQueryWindowsTask($taskName);
            if (empty($current['exists'])) {
                continue;
            }
            $cmd = 'schtasks /Delete /TN ' . escapeshellarg($taskName) . ' /F 2>&1';
            $out = [];
            $code = 1;
            @exec($cmd, $out, $code);
            if ($code === 0) {
                $removed++;
            }
        }
        $scheduler = monitorWorkerSchedulerBuildStatus();
        if ($removed === 0 && monitorWorkerSchedulerTasksCanUninstall($scheduler)) {
            return [
                'ok' => false,
                'error' => 'Could not remove Task Scheduler jobs. Ensure Apache/PHP can delete scheduled tasks.',
                'http' => 500,
                'scheduler' => $scheduler,
            ];
        }
        return [
            'ok' => true,
            'message' => 'Removed LinkNest worker tasks from Task Scheduler.',
            'scheduler' => $scheduler,
        ];
    }

    $powershell = monitorWorkerSchedulerResolvePowerShell();
    if (!$powershell) {
        return ['ok' => false, 'error' => 'PowerShell was not found on this host.', 'http' => 500];
    }

    $dbPath = monitorWorkerDbPath();
    $dataDir = defined('DB_DIR') ? DB_DIR : ($root . DIRECTORY_SEPARATOR . 'data');
    if (!is_dir($dataDir)) {
        @mkdir($dataDir, 0755, true);
    }
    $logFile = $dataDir . DIRECTORY_SEPARATOR . 'monitor_scheduler_install.log';

    $argList = [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', $ps1,
        '-Action', 'uninstall',
        '-Root', $root,
        '-DbPath', $dbPath,
    ];

    $cmd = escapeshellarg($powershell);
    foreach ($argList as $arg) {
        $cmd .= ' ' . escapeshellarg((string)$arg);
    }
    $cmd .= ' 2>&1';

    if (function_exists('set_time_limit')) {
        @set_time_limit(120);
    }

    $out = [];
    $code = 1;
    @exec($cmd, $out, $code);

    $logBody = date('c') . " uninstall exit={$code}\n" . implode("\n", array_map('strval', $out)) . "\n\n";
    @file_put_contents($logFile, $logBody, FILE_APPEND);

    $scheduler = monitorWorkerSchedulerBuildStatus();
    if ($code !== 0 && monitorWorkerSchedulerTasksCanUninstall($scheduler)) {
        $tail = array_slice(array_map('strval', $out), -24);
        $detail = trim(implode("\n", $tail));
        return [
            'ok' => false,
            'error' => ($detail !== '' ? $detail : 'Scheduler uninstall failed.') .
                ' Ensure Apache/PHP runs as a Windows user with permission to delete scheduled tasks.',
            'http' => 500,
            'scheduler' => $scheduler,
            'output_tail' => $tail,
        ];
    }

    if (monitorWorkerSchedulerTasksCanUninstall($scheduler)) {
        return [
            'ok' => false,
            'error' => 'Uninstall finished but one or more LinkNest worker tasks are still registered. Check data/monitor_scheduler_install.log on the server.',
            'http' => 500,
            'scheduler' => $scheduler,
        ];
    }

    return [
        'ok' => true,
        'message' => 'Removed LinkNest Monitor Runner and Email Sender from Windows Task Scheduler.',
        'scheduler' => $scheduler,
        'output_tail' => array_slice(array_map('strval', $out), -12),
    ];
}

/**
 * @return array{ok:bool,error?:string,http?:int,message?:string,scheduler?:array,already?:bool,output_tail?:string[]}
 */
function monitorWorkerSchedulerUninstallTasks(): array {
    if (monitorWorkerSchedulerIsDocker()) {
        return monitorWorkerSchedulerUninstallDockerTasks();
    }
    if (stripos(PHP_OS, 'WIN') === 0) {
        return monitorWorkerSchedulerUninstallWindowsTasks();
    }
    return ['ok' => false, 'error' => 'Worker uninstall is only supported on Windows and Docker.', 'http' => 400];
}

function monitorWorkerSchedulerHandleStatus(): void {
    sendJSON([
        'success' => true,
        'scheduler' => monitorWorkerSchedulerBuildStatus(),
    ]);
}

function monitorWorkerSchedulerHandleSetTask(): void {
    requireAdmin();

    $raw = file_get_contents('php://input');
    $input = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
    if (!is_array($input)) {
        sendJSON(['error' => 'Invalid JSON body'], 400);
        return;
    }

    $taskKey = isset($input['task']) ? trim((string)$input['task']) : '';
    if (!array_key_exists('enabled', $input)) {
        sendJSON(['error' => 'enabled is required'], 400);
        return;
    }

    $enabledRaw = $input['enabled'];
    if (is_bool($enabledRaw)) {
        $enabled = $enabledRaw;
    } elseif (is_string($enabledRaw)) {
        $enabled = in_array(strtolower(trim($enabledRaw)), ['1', 'true', 'yes', 'on'], true);
    } else {
        $enabled = !empty($enabledRaw);
    }

    $result = monitorWorkerSchedulerSetTaskEnabled($taskKey, $enabled);
    if (empty($result['ok'])) {
        sendJSON(['error' => $result['error'] ?? 'Failed to update task'], (int)($result['http'] ?? 500));
        return;
    }

    require_once __DIR__ . '/user_audit_helper.php';
    logUserAudit('monitor.worker_scheduler_task', [
        'details' => [
            'platform' => monitorWorkerSchedulerIsDocker() ? 'docker' : 'windows',
            'task_key' => $taskKey,
            'task_name' => $result['task_name'] ?? monitorWorkerSchedulerResolveTaskKey($taskKey),
            'enabled' => $enabled,
            'already' => !empty($result['already']),
        ],
    ]);

    sendJSON([
        'success' => true,
        'already' => !empty($result['already']),
        'message' => $result['message'] ?? 'Task updated.',
        'scheduler' => monitorWorkerSchedulerBuildStatus(),
    ]);
}

function monitorWorkerSchedulerHandleInstall(): void {
    requireAdmin();

    $raw = file_get_contents('php://input');
    $input = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
    if (!is_array($input)) {
        $input = [];
    }

    $intervalMinutes = null;
    if (array_key_exists('interval_minutes', $input)) {
        $intervalMinutes = (int)$input['interval_minutes'];
    }

    $maxWorkers = null;
    if (array_key_exists('max_workers', $input)) {
        $maxWorkers = (int)$input['max_workers'];
    }

    $result = monitorWorkerSchedulerInstallTasks($intervalMinutes, $maxWorkers);
    if (empty($result['ok'])) {
        $payload = ['error' => $result['error'] ?? 'Failed to install scheduler tasks'];
        if (!empty($result['scheduler'])) {
            $payload['scheduler'] = $result['scheduler'];
        }
        sendJSON($payload, (int)($result['http'] ?? 500));
        return;
    }

    require_once __DIR__ . '/user_audit_helper.php';
    logUserAudit('monitor.worker_scheduler_install', [
        'details' => [
            'platform' => monitorWorkerSchedulerIsDocker() ? 'docker' : 'windows',
            'interval_minutes' => $intervalMinutes ?? monitorWorkerSchedulerIntervalMinutes(),
            'max_workers' => $maxWorkers ?? null,
        ],
    ]);

    sendJSON([
        'success' => true,
        'message' => $result['message'] ?? 'Scheduler tasks installed.',
        'scheduler' => $result['scheduler'] ?? monitorWorkerSchedulerBuildStatus(),
    ]);
}

function monitorWorkerSchedulerHandleUninstall(): void {
    requireAdmin();

    $result = monitorWorkerSchedulerUninstallTasks();
    if (empty($result['ok'])) {
        $payload = ['error' => $result['error'] ?? 'Failed to uninstall worker scheduler'];
        if (!empty($result['scheduler'])) {
            $payload['scheduler'] = $result['scheduler'];
        }
        sendJSON($payload, (int)($result['http'] ?? 500));
        return;
    }

    require_once __DIR__ . '/user_audit_helper.php';
    logUserAudit('monitor.worker_scheduler_uninstall', [
        'details' => [
            'platform' => monitorWorkerSchedulerIsDocker() ? 'docker' : 'windows',
            'already' => !empty($result['already']),
        ],
    ]);

    sendJSON([
        'success' => true,
        'already' => !empty($result['already']),
        'message' => $result['message'] ?? 'Scheduler tasks removed.',
        'scheduler' => $result['scheduler'] ?? monitorWorkerSchedulerBuildStatus(),
    ]);
}

/**
 * Download embeddable CPython into bin/python via scripts/ensure-python-runtime.ps1 (Windows).
 *
 * @return array{ok:bool,error?:string,http?:int,message?:string,already?:bool,scheduler?:array,output_tail?:string[],python?:array}
 */
function monitorWorkerSchedulerInstallPythonRuntime(): array {
    if (monitorWorkerSchedulerIsDocker()) {
        return [
            'ok' => false,
            'error' => 'Python is provided by the LinkNest Docker image. Rebuild the image if python3 is missing.',
            'http' => 400,
        ];
    }
    if (stripos(PHP_OS, 'WIN') !== 0) {
        return [
            'ok' => false,
            'error' => 'In-app Python install is Windows-only. Install python3 with your package manager, then Recheck.',
            'http' => 400,
        ];
    }

    $existing = monitorWorkerPythonHealth();
    if (!empty($existing['available'])) {
        return [
            'ok' => true,
            'already' => true,
            'message' => $existing['message'] ?? 'Python is already available.',
            'scheduler' => monitorWorkerSchedulerBuildStatus(),
            'python' => $existing,
        ];
    }

    $root = monitorWorkerSchedulerProjectRoot();
    $ps1 = $root . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'ensure-python-runtime.ps1';
    if (!is_file($ps1)) {
        return [
            'ok' => false,
            'error' => 'Installer script not found: scripts\\ensure-python-runtime.ps1. Install Python 3.9+ from https://www.python.org/downloads/windows/ instead.',
            'http' => 500,
        ];
    }

    $powershell = monitorWorkerSchedulerResolvePowerShell();
    if (!$powershell) {
        return ['ok' => false, 'error' => 'PowerShell was not found on this host.', 'http' => 500];
    }

    $dataDir = defined('DB_DIR') ? DB_DIR : ($root . DIRECTORY_SEPARATOR . 'data');
    if (!is_dir($dataDir)) {
        @mkdir($dataDir, 0755, true);
    }
    $logFile = $dataDir . DIRECTORY_SEPARATOR . 'monitor_scheduler_install.log';

    $argList = [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', $ps1,
        '-ProjectRoot', $root,
        '-FailIfMissing',
    ];

    $cmd = escapeshellarg($powershell);
    foreach ($argList as $arg) {
        $cmd .= ' ' . escapeshellarg((string)$arg);
    }
    $cmd .= ' 2>&1';

    if (function_exists('set_time_limit')) {
        @set_time_limit(180);
    }

    $out = [];
    $code = 1;
    @exec($cmd, $out, $code);

    $logBody = date('c') . " python-runtime install exit={$code}\n" . implode("\n", array_map('strval', $out)) . "\n\n";
    @file_put_contents($logFile, $logBody, FILE_APPEND);

    $bundled = $root . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'python' . DIRECTORY_SEPARATOR . 'python.exe';
    if ($code === 0 && monitorWorkerIsUsablePythonExe($bundled)) {
        setSetting('monitor_worker_python_path', $bundled);
    }

    $health = monitorWorkerPythonHealth();
    if ($code !== 0 || empty($health['available'])) {
        $tail = array_slice(array_map('strval', $out), -24);
        $detail = trim(implode("\n", $tail));
        $hint = 'Connect this Windows host to the internet and try again, or install Python 3.9+ from https://www.python.org/downloads/windows/ (check "Add python.exe to PATH"), then Recheck.';
        return [
            'ok' => false,
            'error' => ($detail !== '' ? $detail : ($health['message'] ?? 'Python runtime install failed.')) . "\n\n" . $hint,
            'http' => 500,
            'scheduler' => monitorWorkerSchedulerBuildStatus(),
            'python' => $health,
            'output_tail' => $tail,
        ];
    }

    return [
        'ok' => true,
        'message' => 'Installed bundled Python ' . ($health['version'] ?? '') . ' at bin\\python\\python.exe. You can now Install tasks.',
        'scheduler' => monitorWorkerSchedulerBuildStatus(),
        'python' => $health,
        'output_tail' => array_slice(array_map('strval', $out), -12),
    ];
}

function monitorWorkerSchedulerHandleInstallPython(): void {
    requireAdmin();

    $result = monitorWorkerSchedulerInstallPythonRuntime();
    if (empty($result['ok'])) {
        $payload = ['error' => $result['error'] ?? 'Failed to install Python runtime'];
        if (!empty($result['scheduler'])) {
            $payload['scheduler'] = $result['scheduler'];
        }
        if (!empty($result['python'])) {
            $payload['python'] = $result['python'];
        }
        sendJSON($payload, (int)($result['http'] ?? 500));
        return;
    }

    require_once __DIR__ . '/user_audit_helper.php';
    logUserAudit('monitor.worker_python_install', [
        'details' => [
            'already' => !empty($result['already']),
            'path' => $result['python']['path'] ?? null,
            'version' => $result['python']['version'] ?? null,
        ],
    ]);

    sendJSON([
        'success' => true,
        'already' => !empty($result['already']),
        'message' => $result['message'] ?? 'Python runtime installed.',
        'scheduler' => $result['scheduler'] ?? monitorWorkerSchedulerBuildStatus(),
        'python' => $result['python'] ?? null,
    ]);
}
