<?php
/**
 * Probe Windows Task Scheduler (or Docker) for LinkNest Python worker jobs.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/monitor_check_jobs_lib.php';

const MONITOR_WORKER_TASK_MONITOR = 'LinkNest - Monitor Runner';
const MONITOR_WORKER_TASK_EMAIL = 'LinkNest - Email Sender';

function monitorWorkerSchedulerFolderLabel(): string {
    $root = function_exists('monitorWorkerSchedulerProjectRoot')
        ? monitorWorkerSchedulerProjectRoot()
        : (realpath(__DIR__ . '/..') ?: (__DIR__ . '/..'));
    $base = basename(str_replace('\\', '/', (string)$root));
    $safe = preg_replace('/[^A-Za-z0-9._ -]+/', '', $base);
    $safe = is_string($safe) ? trim($safe, " .-") : '';
    return $safe !== '' ? $safe : 'LinkNest';
}

function monitorWorkerSchedulerNormalizedRoot(): string {
    $root = function_exists('monitorWorkerSchedulerProjectRoot')
        ? monitorWorkerSchedulerProjectRoot()
        : (realpath(__DIR__ . '/..') ?: (__DIR__ . '/..'));
    $real = realpath($root);
    if ($real !== false) {
        $root = $real;
    }
    // Keep in sync with Get-PathFingerprint in scripts/schedule-monitor-workers.ps1
    return rtrim(strtolower(str_replace('/', '\\', (string)$root)), '\\');
}

function monitorWorkerSchedulerInstallFingerprint(): string {
    return substr(sha1(monitorWorkerSchedulerNormalizedRoot()), 0, 6);
}

function monitorWorkerSchedulerFolderTaskName(string $kind): string {
    $label = monitorWorkerSchedulerFolderLabel();
    return $kind === 'email'
        ? $label . ' - Email Sender'
        : $label . ' - Monitor Runner';
}

function monitorWorkerSchedulerUniqueTaskName(string $kind): string {
    $label = monitorWorkerSchedulerFolderLabel() . '-' . monitorWorkerSchedulerInstallFingerprint();
    return $kind === 'email'
        ? $label . ' - Email Sender'
        : $label . ' - Monitor Runner';
}

function monitorWorkerSchedulerTaskNamesFile(): string {
    $dir = defined('DB_DIR') ? DB_DIR : (monitorWorkerSchedulerProjectRoot() . DIRECTORY_SEPARATOR . 'data');
    return rtrim((string)$dir, '\\/') . DIRECTORY_SEPARATOR . 'monitor_worker_tasks.json';
}

/**
 * @return array{monitor?:string,email?:string}
 */
function monitorWorkerSchedulerSavedTaskNames(): array {
    $file = monitorWorkerSchedulerTaskNamesFile();
    if (!is_file($file)) {
        return [];
    }
    $raw = @file_get_contents($file);
    if (!is_string($raw) || $raw === '') {
        return [];
    }
    $json = json_decode($raw, true);
    if (!is_array($json)) {
        return [];
    }
    $out = [];
    if (!empty($json['monitor']) && is_string($json['monitor'])) {
        $out['monitor'] = $json['monitor'];
    }
    if (!empty($json['email']) && is_string($json['email'])) {
        $out['email'] = $json['email'];
    }
    return $out;
}

function monitorWorkerSchedulerSaveTaskNames(string $monitorName, string $emailName): void {
    $file = monitorWorkerSchedulerTaskNamesFile();
    $dir = dirname($file);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $payload = json_encode([
        'monitor' => $monitorName,
        'email' => $emailName,
        'root' => monitorWorkerSchedulerProjectRoot(),
        'updated_at' => time(),
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if (is_string($payload)) {
        @file_put_contents($file, $payload);
    }
}

function monitorWorkerSchedulerPreferredTaskName(string $kind): string {
    return monitorWorkerSchedulerIntendedTaskName($kind);
}

/**
 * Name this install will register. Uses folder name unless that job already belongs to another copy.
 */
function monitorWorkerSchedulerIntendedTaskName(string $kind): string {
    $saved = monitorWorkerSchedulerSavedTaskNames();
    $key = $kind === 'email' ? 'email' : 'monitor';
    if (!empty($saved[$key])) {
        $existing = monitorWorkerSchedulerQueryWindowsTask($saved[$key]);
        if (empty($existing['exists']) || monitorWorkerSchedulerTaskBelongsToThisInstall($existing)) {
            return $saved[$key];
        }
    }
    $folderName = monitorWorkerSchedulerFolderTaskName($kind);
    $existing = monitorWorkerSchedulerQueryWindowsTask($folderName);
    if (!empty($existing['exists']) && !monitorWorkerSchedulerTaskBelongsToThisInstall($existing)) {
        return monitorWorkerSchedulerUniqueTaskName($kind);
    }
    return $folderName;
}

function monitorWorkerSchedulerLegacyTaskName(string $kind): string {
    return $kind === 'email' ? MONITOR_WORKER_TASK_EMAIL : MONITOR_WORKER_TASK_MONITOR;
}

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
        'last_result_label' => null,
        'run_as' => null,
        'logon_mode' => null,
        'logon_type' => null,
        'run_level' => null,
        'start_in' => null,
        'task_to_run' => null,
        'schedule_type' => null,
        'repeat_every' => null,
        'repeat_duration' => null,
        'power_management' => null,
        'stop_if_runs_x' => null,
        'comment' => null,
        'interval_minutes' => null,
        'interval_iso' => null,
        'start_when_available' => null,
        'allow_start_on_batteries' => null,
        'dont_stop_on_batteries' => null,
        'multiple_instances' => null,
        'wake_to_run' => null,
        'execution_time_limit' => null,
        'runs_without_logon' => false,
        'unattended_summary' => null,
        'properties' => [],
        'never_run' => false,
        'needs_logged_on_user' => false,
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
            if ($val !== null && $val !== '') {
                if (is_numeric($val)) {
                    $task['last_result'] = (int)$val;
                } elseif (preg_match('/^0x([0-9a-f]+)$/i', trim($val), $hm)) {
                    $task['last_result'] = hexdec($hm[1]);
                }
            }
        } elseif (stripos($line, 'Run As User:') === 0) {
            $val = monitorWorkerSchedulerParseListValue($line);
            if ($val !== null && $val !== '') {
                $task['run_as'] = $val;
            }
        } elseif (stripos($line, 'Logon Mode:') === 0) {
            $val = monitorWorkerSchedulerParseListValue($line);
            if ($val !== null && $val !== '') {
                $task['logon_mode'] = $val;
            }
        } elseif (stripos($line, 'Start In:') === 0) {
            $val = monitorWorkerSchedulerParseListValue($line);
            if ($val !== null && $val !== '') {
                $task['start_in'] = $val;
            }
        } elseif (stripos($line, 'Task To Run:') === 0) {
            $val = monitorWorkerSchedulerParseListValue($line);
            if ($val !== null && $val !== '') {
                $task['task_to_run'] = $val;
            }
        } elseif (stripos($line, 'Schedule Type:') === 0) {
            $val = monitorWorkerSchedulerParseListValue($line);
            if ($val !== null && $val !== '') {
                $task['schedule_type'] = $val;
            }
        } elseif (stripos($line, 'Repeat: Every:') === 0) {
            $val = monitorWorkerSchedulerParseListValue($line);
            if ($val !== null && $val !== '') {
                $task['repeat_every'] = $val;
            }
        } elseif (stripos($line, 'Repeat: Until: Duration:') === 0) {
            $val = monitorWorkerSchedulerParseListValue($line);
            if ($val !== null && $val !== '') {
                $task['repeat_duration'] = $val;
            }
        } elseif (stripos($line, 'Power Management:') === 0) {
            $val = monitorWorkerSchedulerParseListValue($line);
            if ($val !== null && $val !== '') {
                $task['power_management'] = $val;
            }
        } elseif (stripos($line, 'Stop Task If Runs X Hours And X Mins:') === 0) {
            $val = monitorWorkerSchedulerParseListValue($line);
            if ($val !== null && $val !== '') {
                $task['stop_if_runs_x'] = $val;
            }
        } elseif (stripos($line, 'Comment:') === 0) {
            $val = monitorWorkerSchedulerParseListValue($line);
            if ($val !== null && $val !== '') {
                $task['comment'] = $val;
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
    $task['never_run'] = monitorWorkerSchedulerTaskNeverRan($task['last_run'] ?? null, $task['last_result'] ?? null);
    $logon = (string)($task['logon_mode'] ?? '');
    $task['needs_logged_on_user'] = stripos($logon, 'Interactive only') !== false
        || (stripos($logon, 'Interactive') !== false && stripos($logon, 'Background') === false);
    $task['last_result_label'] = monitorWorkerSchedulerDecodeLastResult(
        isset($task['last_result']) ? $task['last_result'] : null,
        !empty($task['never_run']),
        !empty($task['needs_logged_on_user'])
    );

    $task = monitorWorkerSchedulerMergeScheduledTaskCom($task);
    return monitorWorkerSchedulerFinalizeWindowsTask($task);
}

function monitorWorkerSchedulerTaskNeverRan(?string $lastRun, $lastResult): bool {
    if ($lastResult === 267011) {
        return true;
    }
    if ($lastRun === null || $lastRun === '') {
        return true;
    }
    if (strcasecmp($lastRun, 'N/A') === 0 || stripos($lastRun, 'Never') !== false) {
        return true;
    }
    if (preg_match('/11[\/\-]30[\/\-]1999/', $lastRun) || preg_match('/1999-11-30/', $lastRun)) {
        return true;
    }
    return false;
}

function monitorWorkerSchedulerDecodeLastResult($code, bool $neverRun, bool $needsLogon): ?string {
    if ($neverRun) {
        return 'Never run — Task Scheduler has not started this job yet.';
    }
    if ($code === null || $code === '') {
        return $needsLogon ? 'Requires a logged-on user (reinstall tasks so they run as SYSTEM).' : null;
    }
    $n = (int)$code;
    $map = [
        0 => 'Last run succeeded',
        267009 => 'Currently running',
        267010 => 'Disabled',
        267011 => 'Never run',
        267012 => 'No more runs scheduled (first trigger was missed — reinstall tasks)',
    ];
    if (isset($map[$n])) {
        return $map[$n];
    }
    if ($n === -2147216624 || $n === 2147942672) {
        return 'User was not logged on (0x80041310). Reinstall so the task runs as SYSTEM.';
    }
    if ($n === -2147216625) {
        return 'Account information not set. Reinstall so the task runs as SYSTEM.';
    }
    if ($n === -2147023570) {
        return 'Logon failure. Reinstall so the task runs as SYSTEM.';
    }
    return 'Last result ' . $n . ($needsLogon ? ' — task requires a logged-on user; reinstall as SYSTEM.' : '');
}

function monitorWorkerSchedulerParseIsoDurationMinutes(?string $iso): ?int {
    $iso = trim((string)$iso);
    if ($iso === '') {
        return null;
    }
    if (preg_match('/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i', $iso, $m)) {
        $hours = isset($m[1]) && $m[1] !== '' ? (int)$m[1] : 0;
        $mins = isset($m[2]) && $m[2] !== '' ? (int)$m[2] : 0;
        $secs = isset($m[3]) && $m[3] !== '' ? (float)$m[3] : 0.0;
        $total = $hours * 60 + $mins + (int)round($secs / 60);
        return $total > 0 ? $total : ($secs > 0 ? 1 : null);
    }
    if (preg_match('/^(\d+):(\d+):(\d+)$/', $iso, $m)) {
        $total = ((int)$m[1] * 60) + (int)$m[2];
        return $total > 0 ? $total : null;
    }
    return null;
}

/**
 * Extra Task Scheduler CIM fields via Get-ScheduledTask (interval, logon type, batteries).
 *
 * @param array<string,mixed> $task
 * @return array<string,mixed>
 */
function monitorWorkerSchedulerMergeScheduledTaskCom(array $task): array {
    if (empty($task['exists']) || empty($task['name']) || stripos(PHP_OS, 'WIN') !== 0) {
        return $task;
    }
    $ps = function_exists('monitorWorkerSchedulerResolvePowerShell')
        ? monitorWorkerSchedulerResolvePowerShell()
        : null;
    if (!is_string($ps) || $ps === '' || !is_file($ps)) {
        return $task;
    }

    $scriptPath = monitorWorkerSchedulerProjectRoot() . DIRECTORY_SEPARATOR . 'scripts'
        . DIRECTORY_SEPARATOR . 'query-scheduled-task.ps1';
    if (!is_file($scriptPath)) {
        return $task;
    }

    $cmd = escapeshellarg($ps)
        . ' -NoProfile -NonInteractive -NoLogo -ExecutionPolicy Bypass -File '
        . escapeshellarg($scriptPath)
        . ' -TaskName '
        . escapeshellarg((string)$task['name'])
        . ' 2>nul';
    $out = [];
    $code = 1;
    @exec($cmd, $out, $code);
    if (empty($out)) {
        return $task;
    }
    $json = trim(implode('', $out));
    $start = strpos($json, '{');
    if ($start === false) {
        return $task;
    }
    $decoded = json_decode(substr($json, $start), true);
    if (!is_array($decoded) || $decoded === []) {
        return $task;
    }

    if (!empty($decoded['logon_type'])) {
        $task['logon_type'] = (string)$decoded['logon_type'];
    }
    if (!empty($decoded['run_as'])) {
        $task['run_as'] = (string)$decoded['run_as'];
    }
    if (!empty($decoded['run_level'])) {
        $task['run_level'] = (string)$decoded['run_level'];
    }
    if (isset($decoded['repetition_interval']) && $decoded['repetition_interval'] !== null && $decoded['repetition_interval'] !== '') {
        $task['interval_iso'] = (string)$decoded['repetition_interval'];
        $mins = monitorWorkerSchedulerParseIsoDurationMinutes((string)$decoded['repetition_interval']);
        if ($mins !== null) {
            $task['interval_minutes'] = $mins;
        }
    }
    if (isset($decoded['repetition_duration']) && $decoded['repetition_duration'] !== null && $decoded['repetition_duration'] !== '') {
        $task['repeat_duration'] = (string)$decoded['repetition_duration'];
    }
    if (array_key_exists('start_when_available', $decoded)) {
        $task['start_when_available'] = (bool)$decoded['start_when_available'];
    }
    if (array_key_exists('disallow_start_on_batteries', $decoded)) {
        $task['allow_start_on_batteries'] = empty($decoded['disallow_start_on_batteries']);
    }
    if (array_key_exists('stop_if_going_on_batteries', $decoded)) {
        $task['dont_stop_on_batteries'] = empty($decoded['stop_if_going_on_batteries']);
    }
    if (!empty($decoded['multiple_instances'])) {
        $task['multiple_instances'] = (string)$decoded['multiple_instances'];
    }
    if (array_key_exists('wake_to_run', $decoded)) {
        $task['wake_to_run'] = (bool)$decoded['wake_to_run'];
    }
    if (isset($decoded['execution_time_limit']) && $decoded['execution_time_limit'] !== '') {
        $task['execution_time_limit'] = (string)$decoded['execution_time_limit'];
    }

    return $task;
}

/**
 * @param array<string,mixed> $task
 * @return array<string,mixed>
 */
function monitorWorkerSchedulerFinalizeWindowsTask(array $task): array {
    $logonType = strtolower(trim((string)($task['logon_type'] ?? '')));
    $logonMode = strtolower(trim((string)($task['logon_mode'] ?? '')));
    $runAs = trim((string)($task['run_as'] ?? ''));
    $isSystem = $runAs !== '' && (strcasecmp($runAs, 'SYSTEM') === 0
        || stripos($runAs, '\\SYSTEM') !== false
        || stripos($runAs, 'NT AUTHORITY\\SYSTEM') !== false);
    $isServiceAccount = $logonType === 'serviceaccount' || $logonType === 'password' || $logonType === 's4u'
        || stripos($logonMode, 's4u') !== false
        || stripos($logonMode, 'background') !== false;
    $isInteractive = !empty($task['needs_logged_on_user'])
        || $logonType === 'interactive'
        || stripos($logonMode, 'interactive only') !== false;

    $runsWithoutLogon = ($isSystem || $isServiceAccount) && !$isInteractive;
    if ($isSystem && ($logonType === 'serviceaccount' || $logonType === 'password' || $logonType === '')) {
        $runsWithoutLogon = true;
        $task['needs_logged_on_user'] = false;
        $isInteractive = false;
    }
    if ($isInteractive && !$isSystem) {
        $runsWithoutLogon = false;
    }
    $task['runs_without_logon'] = $runsWithoutLogon;

    if ($task['interval_minutes'] === null && !empty($task['repeat_every'])) {
        $rep = strtolower((string)$task['repeat_every']);
        if (preg_match('/(\d+)\s*minute/', $rep, $m)) {
            $task['interval_minutes'] = (int)$m[1];
        } elseif (preg_match('/(\d+)\s*hour/', $rep, $m)) {
            $task['interval_minutes'] = (int)$m[1] * 60;
        }
    }

    $interval = $task['interval_minutes'];
    $intervalLabel = $interval ? ('Every ' . $interval . ' minute' . ($interval === 1 ? '' : 's')) : 'Interval not detected';
    if (!empty($task['interval_iso'])) {
        $intervalLabel .= ' (' . $task['interval_iso'] . ')';
    } elseif (!empty($task['repeat_every'])) {
        $intervalLabel .= ' (schtasks: ' . $task['repeat_every'] . ')';
    }

    $intervalOk = is_int($interval) && $interval >= 1 && $interval <= 5;
    $unattendedOk = $runsWithoutLogon && !empty($task['enabled']) && $intervalOk;

    if (empty($task['exists'])) {
        $task['unattended_summary'] = 'Not installed';
    } elseif ($unattendedOk) {
        $task['unattended_summary'] = $intervalLabel . ' as ' . ($runAs !== '' ? $runAs : 'SYSTEM') . ' — runs even if nobody is logged onto this Windows server.';
    } elseif ($isInteractive) {
        $task['unattended_summary'] = 'Run only when a user is logged on — will not fire on a disconnected RDP/console session. Uninstall then Install tasks to register as SYSTEM.';
    } elseif (!$runsWithoutLogon) {
        $task['unattended_summary'] = 'Logon type is not SYSTEM/S4U. Reinstall tasks so they run without an interactive login.';
    } else {
        $task['unattended_summary'] = $intervalLabel . ($runAs !== '' ? (' as ' . $runAs) : '');
    }

    $task['last_result_label'] = monitorWorkerSchedulerDecodeLastResult(
        $task['last_result'] ?? null,
        !empty($task['never_run']),
        !empty($task['needs_logged_on_user'])
    );

    $props = [];
    $add = static function (string $name, $value, bool $ok) use (&$props): void {
        $text = $value === null || $value === '' ? '(not set)' : (is_bool($value) ? ($value ? 'Yes' : 'No') : (string)$value);
        $props[] = ['name' => $name, 'value' => $text, 'ok' => $ok];
    };

    $add(
        'Runs without a logged-on user',
        $runsWithoutLogon
            ? 'Yes — no console or RDP session is required'
            : 'No — Windows will not start this job unless that user is logged on',
        $runsWithoutLogon
    );
    $add('Logon type', $task['logon_type'] ?: ($task['logon_mode'] ?: '(unknown)'), $runsWithoutLogon);
    $add('Run as', $runAs !== '' ? $runAs : '(unknown)', $isSystem || $runsWithoutLogon);
    if (!empty($task['run_level'])) {
        $add('Run level', $task['run_level'], true);
    }
    $add('Enabled', !empty($task['enabled']) ? 'Yes' : 'No', !empty($task['enabled']));
    $add('Repeat interval', $intervalLabel, $intervalOk);
    if (!empty($task['repeat_duration'])) {
        $add('Repeat duration', $task['repeat_duration'], true);
    }
    if (!empty($task['schedule_type'])) {
        $add('Schedule type', $task['schedule_type'], true);
    }
    if ($task['start_when_available'] !== null) {
        $add('Start when available (catch up missed runs)', $task['start_when_available'] ? 'Yes' : 'No', (bool)$task['start_when_available']);
    }
    if ($task['allow_start_on_batteries'] !== null) {
        $add('Allow start on batteries', $task['allow_start_on_batteries'] ? 'Yes' : 'No', (bool)$task['allow_start_on_batteries']);
    }
    if ($task['dont_stop_on_batteries'] !== null) {
        $add('Stop if going on batteries', $task['dont_stop_on_batteries'] ? 'No' : 'Yes', (bool)$task['dont_stop_on_batteries']);
    }
    if (!empty($task['multiple_instances'])) {
        $ignoreNew = stripos((string)$task['multiple_instances'], 'IgnoreNew') !== false
            || stripos((string)$task['multiple_instances'], 'Ignore New') !== false;
        $add('If already running', $task['multiple_instances'], $ignoreNew);
    }
    if ($task['wake_to_run'] !== null) {
        $add('Wake the computer to run', $task['wake_to_run'] ? 'Yes' : 'No', true);
    }
    if (!empty($task['execution_time_limit'])) {
        $add('Stop task if it runs longer than', $task['execution_time_limit'], true);
    } elseif (!empty($task['stop_if_runs_x'])) {
        $add('Stop task if it runs longer than', $task['stop_if_runs_x'], true);
    }
    if (!empty($task['next_run'])) {
        $add('Next run', $task['next_run'], true);
    }
    if (!empty($task['last_run'])) {
        $add('Last run', $task['last_run'], empty($task['never_run']));
    }
    if (!empty($task['start_in'])) {
        $add('Start in (working directory)', $task['start_in'], true);
    }
    if (!empty($task['task_to_run'])) {
        $add('Program / arguments', $task['task_to_run'], true);
    }
    if (!empty($task['power_management'])) {
        $add('Power management (schtasks)', $task['power_management'], true);
    }
    if (!empty($task['comment'])) {
        $add('Description', $task['comment'], true);
    }

    $task['properties'] = $props;
    return $task;
}

function monitorWorkerSchedulerTaskBelongsToThisInstall(array $task): bool {
    $root = monitorWorkerSchedulerProjectRoot();
    $rootNorm = strtolower(rtrim(str_replace('/', '\\', $root), '\\'));
    if ($rootNorm === '') {
        return false;
    }
    foreach (['start_in', 'task_to_run'] as $key) {
        $val = strtolower(str_replace('/', '\\', (string)($task[$key] ?? '')));
        if ($val !== '' && str_contains($val, $rootNorm)) {
            return true;
        }
    }
    return false;
}

/**
 * Folder-specific task name (ERP3 - Monitor Runner) with fallback to legacy
 * "LinkNest - …" only when that job's Start In / command points at this install.
 *
 * @param 'monitor'|'email' $kind
 */
function monitorWorkerSchedulerResolveInstalledTask(string $kind): array {
    $candidates = [];
    $saved = monitorWorkerSchedulerSavedTaskNames();
    $key = $kind === 'email' ? 'email' : 'monitor';
    if (!empty($saved[$key])) {
        $candidates[] = $saved[$key];
    }
    $candidates[] = monitorWorkerSchedulerUniqueTaskName($kind);
    $candidates[] = monitorWorkerSchedulerFolderTaskName($kind);
    $legacyName = monitorWorkerSchedulerLegacyTaskName($kind);
    $candidates[] = $legacyName;
    $candidates = array_values(array_unique(array_filter($candidates)));

    foreach ($candidates as $name) {
        $task = monitorWorkerSchedulerQueryWindowsTask($name);
        if (!empty($task['exists']) && monitorWorkerSchedulerTaskBelongsToThisInstall($task)) {
            return $task;
        }
    }

    $intended = monitorWorkerSchedulerIntendedTaskName($kind);
    $missing = monitorWorkerSchedulerQueryWindowsTask($intended);
    $missing['exists'] = false;
    $missing['enabled'] = false;
    $missing['name'] = $intended;
    $missing['state'] = 'missing';
    $missing['status'] = 'missing';
    return $missing;
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
                'monitor_runner' => monitorWorkerSchedulerResolveInstalledTask('monitor'),
                'email_sender' => monitorWorkerSchedulerResolveInstalledTask('email'),
            ],
            'install_hint' => 'See docs/PYTHON_WORKERS.md (Linux cron examples).',
        ]);
    }

    $monitor = monitorWorkerSchedulerResolveInstalledTask('monitor');
    $email = monitorWorkerSchedulerResolveInstalledTask('email');

    $monitorOk = !empty($monitor['exists']) && !empty($monitor['enabled']);
    $emailOk = !empty($email['exists']) && !empty($email['enabled']);

    $status = 'ok';
    $message = 'Both LinkNest Task Scheduler jobs are installed and enabled.';
    $pythonReady = $monitorOk;
    if ($monitorOk && $emailOk && !empty($monitor['runs_without_logon']) && !empty($email['runs_without_logon'])) {
        $interval = (int)($monitor['interval_minutes'] ?? 1);
        $message = 'Both jobs are installed and enabled. They run as '
            . trim((string)($monitor['run_as'] ?: 'SYSTEM'))
            . ' every ' . ($interval > 0 ? $interval : 1) . ' minute'
            . ($interval === 1 ? '' : 's')
            . ' whether or not anyone is logged onto this Windows server.';
    }

    if (!$monitor['exists'] && !$email['exists']) {
        $status = 'not_installed';
        $message = 'LinkNest Python worker tasks are not scheduled. Force-all (Py) and scheduled checks will not run until you install Task Scheduler jobs.';
        $pythonReady = false;
    } elseif (!$monitor['exists']) {
        $status = 'partial';
        $message = 'Task "' . ($monitor['name'] ?? monitorWorkerSchedulerPreferredTaskName('monitor')) . '" is missing. Python monitor checks will not run on a schedule or pick up queued jobs reliably.';
        $pythonReady = false;
    } elseif (!$monitor['enabled']) {
        $status = 'disabled';
        $message = 'Task "' . ($monitor['name'] ?? monitorWorkerSchedulerPreferredTaskName('monitor')) . '" is disabled in Task Scheduler. Python checks and Py force-all pickup will not run until you enable it (or re-run scripts\\schedule-monitor-workers.bat).';
        $pythonReady = false;
    } elseif (!$emailOk) {
        $status = 'partial';
        if (!$email['exists']) {
            $message = 'Monitor Runner is enabled, but "' . ($email['name'] ?? monitorWorkerSchedulerPreferredTaskName('email')) . '" is not installed — checks will run but alert emails may not send.';
        } else {
            $message = 'Monitor Runner is enabled, but "' . ($email['name'] ?? monitorWorkerSchedulerPreferredTaskName('email')) . '" is disabled — checks will run but alert emails may not send.';
        }
        $pythonReady = true;
    }

    if ($monitorOk && (!empty($monitor['needs_logged_on_user']) || !empty($monitor['never_run']))) {
        $status = 'not_running';
        $pythonReady = false;
        if (!empty($monitor['needs_logged_on_user'])) {
            $message = 'Monitor Runner is installed but set to "Run only when user is logged on". If the first trigger is missed, Windows never starts the repeating schedule — queued Py jobs stay queued. Reinstall tasks (now registers SYSTEM/S4U) then click Run now.';
        } else {
            $message = 'Monitor Runner is installed but has never run, so queued Py jobs are not picked up. Click Run now, or Uninstall then Install tasks so they start immediately as SYSTEM.';
        }
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
        'install_hint' => ($status === 'not_running')
            ? 'Uninstall then Install tasks in this panel (registers SYSTEM so no login is required), then Run now. Check data\\monitor_runner_last.log on the server to confirm Python started.'
            : 'Use Install tasks in the scheduler panel, run scripts\\schedule-monitor-workers.bat from the project root, or enable tasks in Task Scheduler → Task Scheduler Library.',
    ]);
}

/**
 * Parse --db from a Task Scheduler "Task To Run" command line.
 */
function monitorWorkerSchedulerParseDbFromTaskToRun(?string $taskToRun): ?string {
    if ($taskToRun === null || trim($taskToRun) === '') {
        return null;
    }
    if (!preg_match('/--db(?:\s+|=)(?:"([^"]+)"|\'([^\']+)\'|(\S+))/i', $taskToRun, $m)) {
        return null;
    }
    $path = ($m[1] ?? '') !== '' ? $m[1] : (($m[2] ?? '') !== '' ? $m[2] : ($m[3] ?? ''));
    $path = trim((string)$path);
    return $path !== '' ? $path : null;
}

function monitorWorkerSchedulerNormalizeDbPath(string $path): string {
    $real = realpath($path);
    if ($real !== false) {
        return strtolower(str_replace('\\', '/', $real));
    }
    return strtolower(rtrim(str_replace('\\', '/', $path), '/'));
}

/**
 * SQLite file workers (and PHP) use for monitor checks / email outbox.
 *
 * @param array<string,mixed> $status
 * @return array<string,mixed>
 */
function monitorWorkerSchedulerDatabaseInfo(array $status): array {
    $phpPath = monitorWorkerDbPath();
    $phpReal = realpath($phpPath);
    if ($phpReal !== false) {
        $phpPath = $phpReal;
    }
    $taskPath = null;
    $taskToRun = (string)($status['tasks']['monitor_runner']['task_to_run'] ?? '');
    if ($taskToRun !== '') {
        $taskPath = monitorWorkerSchedulerParseDbFromTaskToRun($taskToRun);
    }
    $path = $taskPath ?: $phpPath;
    $exists = is_file($path);
    $source = $taskPath ? 'scheduled_task' : 'php';
    $mismatch = false;
    if ($taskPath && $phpPath !== '') {
        $mismatch = monitorWorkerSchedulerNormalizeDbPath($taskPath) !== monitorWorkerSchedulerNormalizeDbPath($phpPath);
    }

    if ($mismatch) {
        $message = 'Scheduled workers point at a different database than this PHP app. Reinstall tasks to use the current SQLite file.';
    } elseif ($exists) {
        $message = $source === 'scheduled_task'
            ? 'Scheduled workers read and write this SQLite file (--db).'
            : 'Workers use this SQLite file (same path as PHP).';
    } else {
        $message = 'Database file not found yet. Open the app once so PHP can create it, then Recheck.';
    }

    return [
        'engine' => 'sqlite',
        'path' => $path,
        'php_path' => $phpPath,
        'exists' => $exists,
        'source' => $source,
        'mismatch' => $mismatch,
        'message' => $message,
    ];
}

/**
 * Values Python workers resolve for email templates (not Windows env vars).
 *
 * @param array<string,mixed> $status
 * @return array<string,mixed>
 */
function monitorWorkerSchedulerWorkerEnv(array $status): array {
    $envOverride = trim((string)(getenv('LINKNEST_APP_NAME') ?: getenv('APP_NAME') ?: ''));
    $raw = '';
    try {
        $db = getDB();
        $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'app_name' LIMIT 1");
        $stmt->execute();
        $raw = trim((string)$stmt->fetchColumn());
    } catch (Throwable $e) {
        $raw = '';
    }
    $appName = $envOverride !== '' ? $envOverride : ($raw !== '' ? $raw : 'LinkNest');

    $pausedRaw = (string)getSetting('notifications_paused', '0');
    $paused = ($pausedRaw === '1' || strcasecmp($pausedRaw, 'true') === 0);

    $smtp = [
        'enabled' => false,
        'host' => null,
        'from_email' => null,
        'from_name_raw' => null,
        'from_name_resolved' => $appName . ' Monitor',
        'source' => 'none',
    ];
    try {
        $db = getDB();
        $row = $db->query('SELECT host, from_email, from_name, is_enabled FROM smtp_servers WHERE is_active = 1 LIMIT 1')->fetch(PDO::FETCH_ASSOC);
        if (is_array($row) && $row) {
            $rawFrom = trim((string)($row['from_name'] ?? ''));
            $smtp['source'] = 'smtp_servers';
            $smtp['enabled'] = !empty($row['is_enabled']);
            $smtp['host'] = $row['host'] ?? null;
            $smtp['from_email'] = $row['from_email'] ?? null;
            $smtp['from_name_raw'] = $rawFrom !== '' ? $rawFrom : null;
            $smtp['from_name_resolved'] = str_replace('{app_name}', $appName, $rawFrom !== '' ? $rawFrom : ($appName . ' Monitor'));
        }
    } catch (Throwable $e) {
        // ignore
    }

    $placeholders = [
        ['token' => '{app_name}', 'source' => $envOverride !== '' ? 'LINKNEST_APP_NAME / APP_NAME' : 'settings.app_name', 'value' => $appName, 'ok' => ($envOverride !== '' || $raw !== '')],
        ['token' => '{monitor_name}', 'source' => 'monitor.name', 'value' => '(per check)', 'ok' => true],
        ['token' => '{monitor_type}', 'source' => 'monitor.type', 'value' => '(per check)', 'ok' => true],
        ['token' => '{monitor_target}', 'source' => 'monitor.target', 'value' => '(per check)', 'ok' => true],
        ['token' => '{status}', 'source' => 'check result', 'value' => 'UP / DOWN / WARNING', 'ok' => true],
        ['token' => '{details}', 'source' => 'check result', 'value' => '(per check)', 'ok' => true],
        ['token' => '{response_time}', 'source' => 'check result', 'value' => '(ms)', 'ok' => true],
        ['token' => '{time}', 'source' => 'worker clock', 'value' => date('Y-m-d H:i:s'), 'ok' => true],
        ['token' => '{date}', 'source' => 'worker clock', 'value' => date('Y-m-d'), 'ok' => true],
        ['token' => '{timestamp}', 'source' => 'worker clock', 'value' => (string)time(), 'ok' => true],
    ];

    $osEnv = [];
    foreach (['USERNAME', 'USER', 'COMPUTERNAME', 'USERPROFILE', 'LINKNEST_APP_NAME', 'APP_NAME', 'LINKNEST_WORKERS_ENABLED', 'LINKNEST_WORKER_INTERVAL_SECONDS', 'LINKNEST_IN_DOCKER'] as $key) {
        $val = getenv($key);
        if ($val !== false && $val !== '') {
            $osEnv[] = ['name' => $key, 'value' => $val];
        }
    }

    return [
        'app_name' => $appName,
        'app_name_configured' => ($envOverride !== '' || $raw !== ''),
        'notifications_paused' => $paused,
        'working_directory' => function_exists('monitorWorkerSchedulerProjectRoot')
            ? monitorWorkerSchedulerProjectRoot()
            : null,
        'python_path' => $status['python']['path'] ?? null,
        'db_path' => $status['database']['path'] ?? null,
        'smtp' => $smtp,
        'placeholders' => $placeholders,
        'os_env' => $osEnv,
        'message' => $envOverride !== ''
            ? 'Python workers use LINKNEST_APP_NAME (or APP_NAME) from the process environment, then fall back to settings.app_name in SQLite. {app_name} is a template token, not a Windows env var named {app_name}.'
            : ($raw !== ''
                ? 'Python workers substitute {app_name} from the settings table (same SQLite file as --db), not from a Windows environment variable named {app_name}. Optional override: LINKNEST_APP_NAME.'
                : 'settings.app_name is empty. Python falls back to LinkNest until you set the app name under Admin branding (or set LINKNEST_APP_NAME).'),
    ];
}

/**
 * Attach Python interpreter health and SQLite path, and on Windows block scheduling until Python 3.9+ is present.
 *
 * @param array<string,mixed> $status
 * @return array<string,mixed>
 */
function monitorWorkerSchedulerAttachPythonHealth(array $status): array {
    $health = monitorWorkerPythonHealth();
    $status['python'] = $health;
    $status['database'] = monitorWorkerSchedulerDatabaseInfo($status);
    $status['worker_env'] = monitorWorkerSchedulerWorkerEnv($status);

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
    if ($key === 'monitor_runner') {
        $task = monitorWorkerSchedulerResolveInstalledTask('monitor');
        return (string)($task['name'] ?? monitorWorkerSchedulerPreferredTaskName('monitor'));
    }
    if ($key === 'email_sender') {
        $task = monitorWorkerSchedulerResolveInstalledTask('email');
        return (string)($task['name'] ?? monitorWorkerSchedulerPreferredTaskName('email'));
    }
    return null;
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

    $monitorName = (string)($scheduler['tasks']['monitor_runner']['name'] ?? '');
    $emailName = (string)($scheduler['tasks']['email_sender']['name'] ?? '');
    if ($monitorName !== '' && $emailName !== '') {
        monitorWorkerSchedulerSaveTaskNames($monitorName, $emailName);
    }

    return [
        'ok' => true,
        'message' => 'Installed Task Scheduler jobs'
            . ($monitorName !== '' ? ' "' . $monitorName . '"' : '')
            . ($emailName !== '' ? ' and "' . $emailName . '"' : '')
            . ' (every ' . $interval . ' min, max workers ' . $workers
            . '). Other LinkNest folders on this PC keep their own job names.',
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
        $saved = monitorWorkerSchedulerSavedTaskNames();
        $nameList = array_values(array_unique(array_filter([
            $saved['monitor'] ?? null,
            $saved['email'] ?? null,
            monitorWorkerSchedulerUniqueTaskName('monitor'),
            monitorWorkerSchedulerUniqueTaskName('email'),
            monitorWorkerSchedulerFolderTaskName('monitor'),
            monitorWorkerSchedulerFolderTaskName('email'),
            MONITOR_WORKER_TASK_MONITOR,
            MONITOR_WORKER_TASK_EMAIL,
        ])));
        $removed = 0;
        foreach ($nameList as $taskName) {
            $current = monitorWorkerSchedulerQueryWindowsTask($taskName);
            if (empty($current['exists']) || !monitorWorkerSchedulerTaskBelongsToThisInstall($current)) {
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
        @unlink(monitorWorkerSchedulerTaskNamesFile());
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

/**
 * Start a registered Windows Task Scheduler job immediately (does not wait for the next interval).
 *
 * @return array{ok:bool,error?:string,http?:int,message?:string,task_key?:string,task_name?:string}
 */
function monitorWorkerSchedulerRunTask(string $taskKey): array {
    if (monitorWorkerSchedulerIsDocker()) {
        return [
            'ok' => false,
            'error' => 'Docker workers run on the entrypoint loop. Enable the worker instead of Run now.',
            'http' => 400,
        ];
    }
    if (stripos(PHP_OS, 'WIN') !== 0) {
        return ['ok' => false, 'error' => 'Run now is Windows-only.', 'http' => 400];
    }

    $taskName = monitorWorkerSchedulerResolveTaskKey($taskKey);
    if ($taskName === null) {
        return ['ok' => false, 'error' => 'Invalid task key.', 'http' => 400];
    }

    $current = monitorWorkerSchedulerQueryWindowsTask($taskName);
    if (empty($current['exists'])) {
        return [
            'ok' => false,
            'error' => 'Task is not installed. Install tasks first.',
            'http' => 404,
        ];
    }
    if (empty($current['enabled'])) {
        return [
            'ok' => false,
            'error' => 'Task is disabled. Enable it, then Run now.',
            'http' => 409,
        ];
    }

    $cmd = 'schtasks /Run /TN ' . escapeshellarg($taskName) . ' 2>&1';
    $out = [];
    $code = 1;
    @exec($cmd, $out, $code);
    if ($code !== 0) {
        $detail = trim(implode("\n", array_map('strval', $out)));
        $hint = !empty($current['needs_logged_on_user'])
            ? ' This task is set to run only when a user is logged on. Uninstall then Install tasks so they run as SYSTEM, then Run now.'
            : ' Ensure Apache/PHP can start scheduled tasks.';
        return [
            'ok' => false,
            'error' => ($detail !== '' ? $detail : 'schtasks /Run failed.') . $hint,
            'http' => 500,
        ];
    }

    return [
        'ok' => true,
        'message' => 'Started "' . $taskName . '". Queued Py jobs should move to running within a few seconds.',
        'task_key' => $taskKey,
        'task_name' => $taskName,
    ];
}

function monitorWorkerSchedulerHandleRun(): void {
    requireAdmin();

    $raw = file_get_contents('php://input');
    $input = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
    if (!is_array($input)) {
        $input = [];
    }

    $taskKey = isset($input['task']) ? trim((string)$input['task']) : 'monitor_runner';
    $result = monitorWorkerSchedulerRunTask($taskKey);
    if (empty($result['ok'])) {
        sendJSON(['error' => $result['error'] ?? 'Failed to start task'], (int)($result['http'] ?? 500));
        return;
    }

    require_once __DIR__ . '/user_audit_helper.php';
    logUserAudit('monitor.worker_scheduler_run', [
        'details' => [
            'task_key' => $taskKey,
            'task_name' => $result['task_name'] ?? $taskKey,
        ],
    ]);

    sendJSON([
        'success' => true,
        'message' => $result['message'] ?? 'Task started.',
        'scheduler' => monitorWorkerSchedulerBuildStatus(),
    ]);
}
