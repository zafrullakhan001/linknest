<?php
/**
 * Start/stop local websockify VNC gateways from LinkNest (Windows XAMPP-friendly).
 *
 * POST /api/vnc-gateway/start  { host, port? }
 * POST /api/vnc-gateway/stop   { sessionId }
 * POST /api/vnc-gateway/stop-all
 * GET  /api/vnc-gateway/status
 * GET/PUT /api/vnc-gateway/config
 */

require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';
$path = rtrim($path, '/') ?: '/';

define('VNC_GATEWAY_DIR', DB_DIR . '/vnc_gateway');
// Keep VNC above SSH's expanded range (17681–18680) to avoid listen-port collisions
define('VNC_GATEWAY_PORT_MIN', (int)(getenv('VNC_GATEWAY_PORT_MIN') ?: 19000));
define('VNC_GATEWAY_PORT_MAX', (int)(getenv('VNC_GATEWAY_PORT_MAX') ?: 19999));
define('VNC_GATEWAY_MAX_PER_USER_DEFAULT', 8);
define('VNC_GATEWAY_MAX_PER_USER_CEILING', 1000);
define('VNC_GATEWAY_TTL_SEC', 6 * 3600);

/** Hard ceiling for admin max-connections setting (also bounded by listen-port span). */
function vncGatewayMaxConnectionsCeiling(): int {
    $portSpan = max(1, VNC_GATEWAY_PORT_MAX - VNC_GATEWAY_PORT_MIN + 1);
    return min(VNC_GATEWAY_MAX_PER_USER_CEILING, $portSpan);
}

/** Active concurrent Easy-mode sessions per user (admin-configurable, 1–ceiling). */
function vncGatewayMaxPerUser(): int {
    $raw = getSetting('vnc_gateway_max_per_user', (string)VNC_GATEWAY_MAX_PER_USER_DEFAULT);
    $n = (int)$raw;
    if ($n < 1) {
        return VNC_GATEWAY_MAX_PER_USER_DEFAULT;
    }
    return min(vncGatewayMaxConnectionsCeiling(), $n);
}

if ($method === 'GET' && ($path === '/' || $path === '/status')) {
    handleVncGatewayStatus();
} elseif ($method === 'GET' && $path === '/config') {
    handleVncGatewayGetConfig();
} elseif ($method === 'PUT' && $path === '/config') {
    handleVncGatewayPutConfig();
} elseif ($method === 'POST' && $path === '/start') {
    handleVncGatewayStart();
} elseif ($method === 'POST' && $path === '/stop') {
    handleVncGatewayStop();
} elseif ($method === 'POST' && $path === '/stop-all') {
    handleVncGatewayStopAll();
} else {
    sendJSON(['error' => 'Invalid endpoint'], 404);
}

function vncGatewayEnsureDir(): string {
    if (!is_dir(VNC_GATEWAY_DIR)) {
        if (!mkdir(VNC_GATEWAY_DIR, 0755, true) && !is_dir(VNC_GATEWAY_DIR)) {
            sendJSON(['error' => 'Failed to create vnc_gateway data directory'], 500);
        }
    }
    return VNC_GATEWAY_DIR;
}

function vncGatewaySessionsFile(): string {
    return vncGatewayEnsureDir() . '/sessions.json';
}

function vncGatewayLoadSessions(): array {
    $file = vncGatewaySessionsFile();
    if (!is_file($file)) {
        return [];
    }
    $raw = @file_get_contents($file);
    if (!is_string($raw) || $raw === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function vncGatewaySaveSessions(array $sessions): void {
    $file = vncGatewaySessionsFile();
    $tmp = $file . '.tmp';
    $json = json_encode(array_values($sessions), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if (@file_put_contents($tmp, $json) === false) {
        sendJSON(['error' => 'Failed to persist gateway sessions'], 500);
    }
    @rename($tmp, $file);
}

function vncGatewayIsProcessAlive(?int $pid): bool {
    if (!$pid || $pid < 1) {
        return false;
    }
    if (stripos(PHP_OS, 'WIN') === 0) {
        $out = [];
        @exec('tasklist /FI "PID eq ' . (int)$pid . '" /NH 2>NUL', $out);
        $joined = strtolower(implode("\n", $out));
        return str_contains($joined, (string)$pid) && !str_contains($joined, 'no tasks');
    }
    return function_exists('posix_kill') ? @posix_kill($pid, 0) : (bool)@file_exists("/proc/{$pid}");
}

function vncGatewayKillPid(int $pid): void {
    if ($pid < 1) {
        return;
    }
    if (stripos(PHP_OS, 'WIN') === 0) {
        @exec('taskkill /PID ' . (int)$pid . ' /T /F 2>NUL');
        return;
    }
    if (function_exists('posix_kill')) {
        @posix_kill($pid, 15);
        usleep(200000);
        @posix_kill($pid, 9);
    } else {
        @exec('kill -TERM ' . (int)$pid . ' 2>/dev/null');
        @exec('kill -KILL ' . (int)$pid . ' 2>/dev/null');
    }
}

function vncGatewayPidListeningOnPort(int $port): int {
    if ($port < 1 || $port > 65535) {
        return 0;
    }
    if (stripos(PHP_OS, 'WIN') === 0) {
        $out = [];
        @exec('netstat -ano -p tcp 2>NUL', $out);
        foreach ($out as $line) {
            if (stripos($line, 'LISTENING') === false) {
                continue;
            }
            if (!preg_match('/[:\]]' . (int)$port . '\s/', $line)) {
                continue;
            }
            if (preg_match('/\s(\d+)\s*$/', $line, $m)) {
                $pid = (int)$m[1];
                if ($pid > 0) {
                    return $pid;
                }
            }
        }
        return 0;
    }

    $out = [];
    @exec('ss -ltnp \'sport = :' . (int)$port . '\' 2>/dev/null', $out);
    foreach ($out as $line) {
        if (preg_match('/pid=(\d+)/', $line, $m)) {
            return (int)$m[1];
        }
    }
    $out = [];
    @exec('lsof -nP -iTCP:' . (int)$port . ' -sTCP:LISTEN -t 2>/dev/null', $out);
    foreach ($out as $line) {
        $pid = (int)trim($line);
        if ($pid > 0) {
            return $pid;
        }
    }
    return 0;
}

function vncGatewayCleanup(array $sessions): array {
    $now = time();
    $out = [];
    foreach ($sessions as $s) {
        if (!is_array($s) || empty($s['id'])) {
            continue;
        }
        $pid = isset($s['pid']) ? (int)$s['pid'] : 0;
        $listenPort = isset($s['listenPort']) ? (int)$s['listenPort'] : 0;
        $created = isset($s['createdAt']) ? (int)$s['createdAt'] : 0;
        $expired = $created > 0 && ($now - $created) > VNC_GATEWAY_TTL_SEC;

        $portPid = $listenPort > 0 ? vncGatewayPidListeningOnPort($listenPort) : 0;
        $alive = $portPid > 0;
        if ($alive) {
            $s['pid'] = $portPid;
            $pid = $portPid;
        }

        if (!$alive || $expired) {
            if ($pid > 0) {
                vncGatewayKillPid($pid);
            }
            if ($listenPort > 0 && $portPid > 0 && $portPid !== $pid) {
                vncGatewayKillPid($portPid);
            } elseif ($listenPort > 0 && !$alive) {
                $again = vncGatewayPidListeningOnPort($listenPort);
                if ($again > 0) {
                    vncGatewayKillPid($again);
                }
            }
            if (!empty($s['launcher']) && is_string($s['launcher']) && is_file($s['launcher'])) {
                @unlink($s['launcher']);
            }
            continue;
        }
        $out[] = $s;
    }
    return $out;
}

function vncGatewayQuoteCmd(string $s): string {
    return '"' . str_replace('"', '""', $s) . '"';
}

function vncGatewayFindBinary(string $name, array $extraPaths = []): ?string {
    foreach ($extraPaths as $p) {
        if (is_string($p) && $p !== '' && is_file($p)) {
            return $p;
        }
    }
    $wh = [];
    if (stripos(PHP_OS, 'WIN') === 0) {
        @exec('where ' . escapeshellarg($name) . ' 2>NUL', $wh);
    } else {
        @exec('command -v ' . escapeshellarg($name) . ' 2>/dev/null', $wh);
    }
    foreach ($wh as $line) {
        $line = trim($line);
        if ($line !== '' && is_file($line)) {
            return $line;
        }
    }
    return null;
}

function vncGatewayIsForeignOsPath(string $path): bool {
    $path = trim($path);
    if ($path === '') {
        return false;
    }
    $isWin = stripos(PHP_OS, 'WIN') === 0;
    if ($isWin) {
        return str_starts_with($path, '/') && !preg_match('/^[A-Za-z]:/', $path);
    }
    if (preg_match('/^[A-Za-z]:[\\\\\\/]/', $path)) {
        return true;
    }
    if (str_contains($path, '\\')) {
        return true;
    }
    if (preg_match('/\.exe$/i', $path) || preg_match('/\.cmd$/i', $path)) {
        return true;
    }
    return false;
}

function vncGatewayPackagesDir(): string {
    $root = realpath(__DIR__ . '/..') ?: (__DIR__ . '/..');
    return $root . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'python-packages';
}

function vncGatewayDefaultPythonCandidates(): array {
    $root = realpath(__DIR__ . '/..') ?: (__DIR__ . '/..');
    $candidates = [];
    if (stripos(PHP_OS, 'WIN') === 0) {
        // Offline / packaged embeddable Python (package-remote-widgets-runtime)
        $candidates[] = $root . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'python' . DIRECTORY_SEPARATOR . 'python.exe';
        $candidates[] = 'C:\\Program Files\\Python312\\python.exe';
        $candidates[] = 'C:\\Program Files\\Python311\\python.exe';
        $candidates[] = 'C:\\Program Files\\Python310\\python.exe';
        $local = getenv('LOCALAPPDATA') ?: '';
        if ($local !== '') {
            $candidates[] = $local . '\\Programs\\Python\\Python312\\python.exe';
            $candidates[] = $local . '\\Programs\\Python\\Python311\\python.exe';
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

function vncGatewayDefaultLauncherCandidates(): array {
    $root = realpath(__DIR__ . '/..') ?: (__DIR__ . '/..');
    if (stripos(PHP_OS, 'WIN') === 0) {
        return [
            $root . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'run-websockify.cmd',
        ];
    }
    return [
        $root . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'run-websockify',
    ];
}

function vncGatewaySoftResolvePython(): ?string {
    $configured = trim((string)getSetting('vnc_gateway_python_path', ''));
    if ($configured !== '' && !vncGatewayIsForeignOsPath($configured) && is_file($configured)) {
        return $configured;
    }
    return vncGatewayFindBinary('python3', vncGatewayDefaultPythonCandidates())
        ?: vncGatewayFindBinary('python', vncGatewayDefaultPythonCandidates());
}

function vncGatewaySoftResolveLauncher(): ?string {
    $configured = trim((string)getSetting('vnc_gateway_websockify_path', ''));
    if ($configured !== '' && !vncGatewayIsForeignOsPath($configured) && is_file($configured)) {
        return $configured;
    }
    foreach (vncGatewayDefaultLauncherCandidates() as $p) {
        if (is_file($p)) {
            return $p;
        }
    }
    return vncGatewayFindBinary('websockify', []);
}

function vncGatewayWebsockifyModuleAvailable(?string $python): bool {
    $pkg = vncGatewayPackagesDir() . DIRECTORY_SEPARATOR . 'websockify';
    if (is_dir($pkg) || is_file($pkg . '.py')) {
        return true;
    }
    if (!$python) {
        return false;
    }
    // Fall back: module on default PYTHONPATH
    $out = [];
    $code = 1;
    if (stripos(PHP_OS, 'WIN') === 0) {
        @exec(vncGatewayQuoteCmd($python) . ' -c "import websockify" 2>NUL', $out, $code);
    } else {
        @exec(escapeshellarg($python) . ' -c "import websockify" 2>/dev/null', $out, $code);
    }
    return $code === 0;
}

/**
 * @return array{mode:string,python:?string,launcher:?string,packages:string}
 */
function vncGatewayResolveRunner(): array {
    $packages = vncGatewayPackagesDir();
    $python = vncGatewaySoftResolvePython();
    $launcher = vncGatewaySoftResolveLauncher();

    $configuredLauncher = trim((string)getSetting('vnc_gateway_websockify_path', ''));
    if ($configuredLauncher !== '') {
        if (vncGatewayIsForeignOsPath($configuredLauncher)) {
            // ignore foreign OS path
        } elseif (!is_file($configuredLauncher)) {
            sendJSON([
                'error' => 'Configured websockify path was not found: ' . $configuredLauncher . '. Update Admin → Add-ons → VNC Gateway.',
                'code' => 'websockify_missing',
                'configuredPath' => $configuredLauncher,
            ], 503);
        } else {
            return ['mode' => 'launcher', 'python' => $python, 'launcher' => $configuredLauncher, 'packages' => $packages];
        }
    }

    $configuredPython = trim((string)getSetting('vnc_gateway_python_path', ''));
    if ($configuredPython !== '' && !vncGatewayIsForeignOsPath($configuredPython) && !is_file($configuredPython)) {
        sendJSON([
            'error' => 'Configured Python path was not found: ' . $configuredPython . '. Update Admin → Add-ons → VNC Gateway.',
            'code' => 'python_missing',
            'configuredPath' => $configuredPython,
        ], 503);
    }

    if ($python && vncGatewayWebsockifyModuleAvailable($python)) {
        return ['mode' => 'python_module', 'python' => $python, 'launcher' => $launcher, 'packages' => $packages];
    }

    if ($launcher) {
        return ['mode' => 'launcher', 'python' => $python, 'launcher' => $launcher, 'packages' => $packages];
    }

    sendJSON([
        'error' => 'websockify was not found. Install Python 3, then: python -m pip install --target=bin/python-packages websockify — or set paths in Admin → Add-ons → VNC Gateway.',
        'code' => 'websockify_missing',
    ], 503);
    return ['mode' => 'missing', 'python' => null, 'launcher' => null, 'packages' => $packages];
}

function vncGatewayAllocatePort(): int {
    $sessions = vncGatewayLoadSessions();
    $used = [];
    foreach ($sessions as $s) {
        if (!empty($s['listenPort'])) {
            $used[(int)$s['listenPort']] = true;
        }
    }
    $min = VNC_GATEWAY_PORT_MIN;
    $max = VNC_GATEWAY_PORT_MAX;
    if ($min < 1024 || $max > 65535 || $min > $max) {
        $min = 19000;
        $max = 19999;
    }
    for ($port = $min; $port <= $max; $port++) {
        if (isset($used[$port])) {
            continue;
        }
        if (vncGatewayPidListeningOnPort($port) > 0) {
            continue;
        }
        $fp = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.05);
        if ($fp) {
            fclose($fp);
            continue;
        }
        return $port;
    }
    sendJSON(['error' => 'No free localhost port for websockify (range ' . $min . '-' . $max . ')'], 503);
    return 0;
}

function vncGatewayValidateHost(string $host): string {
    $host = trim($host);
    if ($host === '' || mb_strlen($host) > 253) {
        sendJSON(['error' => 'Invalid host'], 400);
    }
    if (!preg_match('/^(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?|(?:\d{1,3}\.){3}\d{1,3})$/', $host)) {
        sendJSON(['error' => 'Host must be a hostname or IPv4 address'], 400);
    }
    return $host;
}

function vncGatewayValidatePort($port): int {
    $p = (int)$port;
    if ($p < 1 || $p > 65535) {
        sendJSON(['error' => 'VNC port must be 1–65535'], 400);
    }
    return $p;
}

function vncGatewayRequestIsHttps(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string)$_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https')
        || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443);
}

function vncGatewayIsDocker(): bool {
    if (getenv('LINKNEST_DOCKER') === '1' || getenv('VNC_GATEWAY_DOCKER') === '1') {
        return true;
    }
    return is_file('/.dockerenv');
}

/**
 * Prefer same-origin Apache proxy (/_ln_vncgw/<port>/…) so HTTPS pages use wss://:443.
 */
function vncGatewayPreferHttpProxy(): bool {
    if (vncGatewayIsDocker()) {
        return true;
    }
    $env = getenv('LINKNEST_GATEWAY_HTTP_PROXY');
    if ($env === '1' || strcasecmp((string)$env, 'true') === 0 || strcasecmp((string)$env, 'on') === 0) {
        return true;
    }
    if ($env === '0' || strcasecmp((string)$env, 'false') === 0 || strcasecmp((string)$env, 'off') === 0) {
        return false;
    }
    $setting = strtolower(trim((string)getSetting('gateway_http_proxy', 'auto')));
    if (in_array($setting, ['1', 'on', 'true', 'yes'], true)) {
        return true;
    }
    if (in_array($setting, ['0', 'off', 'false', 'no'], true)) {
        return false;
    }
    return vncGatewayRequestIsHttps();
}

/** App base path when not deployed at domain root (any folder name). */
function vncGatewayHttpProxyBasePath(): string {
    return getAppBasePath();
}

function vncGatewaySslPaths(): ?array {
    $candidates = [
        ['cert' => '/etc/apache2/ssl/linknest.crt', 'key' => '/etc/apache2/ssl/linknest.key'],
        ['cert' => '/var/www/html/data/vnc_gateway/websockify.crt', 'key' => '/var/www/html/data/vnc_gateway/websockify.key'],
    ];
    foreach ($candidates as $pair) {
        if (is_readable($pair['cert']) && is_readable($pair['key'])) {
            return $pair;
        }
    }
    return null;
}

function vncGatewayBuildWsUrl(int $listenPort, bool $useSsl = false): string {
    if (vncGatewayPreferHttpProxy()) {
        $https = vncGatewayRequestIsHttps();
        $scheme = $https ? 'wss' : 'ws';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $base = vncGatewayHttpProxyBasePath();
        return $scheme . '://' . $host . $base . '/_ln_vncgw/' . $listenPort . '/websockify';
    }

    $https = $useSsl;
    if ($https && vncGatewaySslPaths() === null) {
        $https = false;
    }
    $scheme = $https ? 'wss' : 'ws';
    $host = $_SERVER['HTTP_HOST'] ?? '127.0.0.1';
    if (str_contains($host, ':') && !str_starts_with($host, '[')) {
        $host = explode(':', $host)[0];
    }
    $reqHost = strtolower($host);
    if (in_array($reqHost, ['localhost', '127.0.0.1', '::1'], true)) {
        $host = '127.0.0.1';
    }
    // Path /websockify matches common noVNC defaults; websockify accepts any WS path.
    return $scheme . '://' . $host . ':' . $listenPort . '/websockify';
}

/**
 * @return array{pid:int,ready:bool,launcher:?string,ssl:bool}
 */
function vncGatewaySpawnWebsockify(
    array $runner,
    int $listenPort,
    string $vncHost,
    int $vncPort,
    string $logFile,
    bool $useSsl = false
): array {
    $target = $vncHost . ':' . $vncPort;
    $listenHost = vncGatewayPreferHttpProxy() ? '127.0.0.1' : '0.0.0.0';
    $listen = $listenHost . ':' . $listenPort;
    $sslPaths = ($useSsl && !vncGatewayPreferHttpProxy()) ? vncGatewaySslPaths() : null;
    $sslArgs = [];
    if ($sslPaths !== null) {
        $sslArgs = ['--cert=' . $sslPaths['cert'], '--key=' . $sslPaths['key']];
    } else {
        $useSsl = false;
    }

    if (stripos(PHP_OS, 'WIN') === 0) {
        $bat = vncGatewayEnsureDir() . DIRECTORY_SEPARATOR . 'run_' . bin2hex(random_bytes(6)) . '.cmd';
        $lines = ['@echo off'];
        $packages = $runner['packages'] ?? vncGatewayPackagesDir();
        $lines[] = 'set "PYTHONPATH=' . $packages . ';%PYTHONPATH%"';

        if (($runner['mode'] ?? '') === 'python_module' && !empty($runner['python'])) {
            $line = vncGatewayQuoteCmd((string)$runner['python']) . ' -m websockify';
        } elseif (!empty($runner['launcher'])) {
            if (!empty($runner['python'])) {
                $lines[] = 'set "VNC_GATEWAY_PYTHON=' . str_replace('"', '', (string)$runner['python']) . '"';
            }
            $line = vncGatewayQuoteCmd((string)$runner['launcher']);
        } else {
            sendJSON(['error' => 'No websockify runner available'], 500);
            return ['pid' => 0, 'ready' => false, 'launcher' => null, 'ssl' => false];
        }

        foreach ($sslArgs as $a) {
            $line .= ' ' . vncGatewayQuoteCmd($a);
        }
        $line .= ' ' . vncGatewayQuoteCmd($listen) . ' ' . vncGatewayQuoteCmd($target);
        $lines[] = $line . ' >> ' . vncGatewayQuoteCmd($logFile) . ' 2>&1';

        if (@file_put_contents($bat, implode("\r\n", $lines) . "\r\n") === false) {
            sendJSON(['error' => 'Failed to write websockify launcher script'], 500);
        }

        $launch = 'cmd.exe /c start /B "" ' . escapeshellarg($bat);
        $ok = false;
        if (function_exists('popen') && function_exists('pclose')) {
            $h = @popen($launch, 'r');
            if (is_resource($h)) {
                pclose($h);
                $ok = true;
            }
        }
        if (!$ok) {
            @exec($launch);
        }

        $ready = false;
        $pid = 0;
        for ($i = 0; $i < 30; $i++) {
            usleep(200000);
            $fp = @fsockopen('127.0.0.1', $listenPort, $errno, $errstr, 0.2);
            if ($fp) {
                fclose($fp);
                $ready = true;
                $pid = vncGatewayPidListeningOnPort($listenPort);
                break;
            }
        }
        return ['pid' => $pid, 'ready' => $ready, 'launcher' => $bat, 'ssl' => $useSsl];
    }

    // Unix
    $env = [];
    foreach ($_ENV as $k => $v) {
        if (is_string($k) && is_string($v)) {
            $env[$k] = $v;
        }
    }
    $env['PYTHONPATH'] = ($runner['packages'] ?? vncGatewayPackagesDir())
        . (isset($env['PYTHONPATH']) && $env['PYTHONPATH'] !== '' ? ':' . $env['PYTHONPATH'] : '');

    if (($runner['mode'] ?? '') === 'python_module' && !empty($runner['python'])) {
        $cmd = array_merge([(string)$runner['python'], '-m', 'websockify'], $sslArgs, [$listen, $target]);
    } elseif (!empty($runner['launcher'])) {
        if (!empty($runner['python'])) {
            $env['VNC_GATEWAY_PYTHON'] = (string)$runner['python'];
        }
        $cmd = array_merge([(string)$runner['launcher']], $sslArgs, [$listen, $target]);
    } else {
        sendJSON(['error' => 'No websockify runner available'], 500);
        return ['pid' => 0, 'ready' => false, 'launcher' => null, 'ssl' => false];
    }

    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['file', $logFile, 'a'],
        2 => ['file', $logFile, 'a'],
    ];
    $process = @proc_open($cmd, $descriptors, $pipes, null, $env, ['bypass_shell' => true]);
    if (!is_resource($process)) {
        sendJSON(['error' => 'Failed to start websockify. Ensure PHP may spawn executables and Python/websockify are installed.'], 500);
    }
    if (isset($pipes[0]) && is_resource($pipes[0])) {
        @fclose($pipes[0]);
    }
    $status = proc_get_status($process);
    $pid = isset($status['pid']) ? (int)$status['pid'] : 0;

    $ready = false;
    for ($i = 0; $i < 25; $i++) {
        usleep(200000);
        $fp = @fsockopen('127.0.0.1', $listenPort, $errno, $errstr, 0.2);
        if ($fp) {
            fclose($fp);
            $ready = true;
            break;
        }
        $st = proc_get_status($process);
        if (isset($st['running']) && !$st['running']) {
            break;
        }
    }

    return [
        'pid' => $pid > 0 ? $pid : vncGatewayPidListeningOnPort($listenPort),
        'ready' => $ready,
        'launcher' => null,
        'ssl' => $useSsl,
    ];
}

function handleVncGatewayStatus() {
    $user = requireAuth();
    $sessions = vncGatewayCleanup(vncGatewayLoadSessions());
    vncGatewaySaveSessions($sessions);
    $mine = array_values(array_filter($sessions, static function ($s) use ($user) {
        return (int)($s['userId'] ?? 0) === (int)$user['id'];
    }));

    $python = vncGatewaySoftResolvePython();
    $launcher = vncGatewaySoftResolveLauncher();
    $moduleOk = vncGatewayWebsockifyModuleAvailable($python);
    $available = ($python && $moduleOk) || $launcher !== null;

    sendJSON([
        'available' => $available,
        'pythonPath' => $python,
        'websockifyPath' => $launcher,
        'websockifyModule' => $moduleOk,
        'packagesDir' => vncGatewayPackagesDir(),
        'platform' => PHP_OS,
        'maxConnections' => vncGatewayMaxPerUser(),
        'maxConnectionsCeiling' => vncGatewayMaxConnectionsCeiling(),
        'portRange' => [VNC_GATEWAY_PORT_MIN, VNC_GATEWAY_PORT_MAX],
        'sessions' => array_map(static function ($s) {
            return [
                'sessionId' => $s['id'],
                'host' => $s['host'] ?? null,
                'port' => $s['vncPort'] ?? null,
                'listenPort' => $s['listenPort'] ?? null,
                'wsUrl' => $s['wsUrl'] ?? null,
                'createdAt' => $s['createdAt'] ?? null,
            ];
        }, $mine),
    ]);
}

function handleVncGatewayGetConfig() {
    requireAdmin();
    $python = vncGatewaySoftResolvePython();
    $launcher = vncGatewaySoftResolveLauncher();
    sendJSON([
        'config' => [
            'pythonPath' => trim((string)getSetting('vnc_gateway_python_path', '')),
            'websockifyPath' => trim((string)getSetting('vnc_gateway_websockify_path', '')),
            'maxConnections' => vncGatewayMaxPerUser(),
        ],
        'resolved' => [
            'pythonPath' => $python,
            'websockifyPath' => $launcher,
            'pythonExists' => $python !== null,
            'websockifyExists' => ($python && vncGatewayWebsockifyModuleAvailable($python)) || $launcher !== null,
            'packagesDir' => vncGatewayPackagesDir(),
            'packagesPresent' => is_dir(vncGatewayPackagesDir() . DIRECTORY_SEPARATOR . 'websockify'),
        ],
        'defaults' => [
            'pythonCandidates' => vncGatewayDefaultPythonCandidates(),
            'launcherCandidates' => vncGatewayDefaultLauncherCandidates(),
            'maxConnectionsDefault' => VNC_GATEWAY_MAX_PER_USER_DEFAULT,
            'maxConnectionsCeiling' => vncGatewayMaxConnectionsCeiling(),
            'portRange' => [VNC_GATEWAY_PORT_MIN, VNC_GATEWAY_PORT_MAX],
        ],
    ]);
}

function handleVncGatewayPutConfig() {
    requireAdmin();
    $data = getJSONInput();

    if (array_key_exists('pythonPath', $data) || array_key_exists('python_path', $data)) {
        $path = trim((string)($data['pythonPath'] ?? $data['python_path'] ?? ''));
        if ($path !== '' && mb_strlen($path) > 512) {
            sendJSON(['error' => 'Python path is too long'], 400);
        }
        setSetting('vnc_gateway_python_path', $path);
    }
    if (array_key_exists('websockifyPath', $data) || array_key_exists('websockify_path', $data)) {
        $path = trim((string)($data['websockifyPath'] ?? $data['websockify_path'] ?? ''));
        if ($path !== '' && mb_strlen($path) > 512) {
            sendJSON(['error' => 'websockify path is too long'], 400);
        }
        setSetting('vnc_gateway_websockify_path', $path);
    }
    if (array_key_exists('maxConnections', $data) || array_key_exists('max_connections', $data)) {
        $maxConnections = $data['maxConnections'] ?? $data['max_connections'];
        if (!is_numeric($maxConnections)) {
            sendJSON(['error' => 'Max connections must be a number'], 400);
        }
        $maxN = (int)$maxConnections;
        $ceiling = vncGatewayMaxConnectionsCeiling();
        if ($maxN < 1 || $maxN > $ceiling) {
            sendJSON([
                'error' => 'Max connections must be between 1 and ' . $ceiling .
                    ' (limited by gateway port range ' . VNC_GATEWAY_PORT_MIN . '-' . VNC_GATEWAY_PORT_MAX . ')',
            ], 400);
        }
        setSetting('vnc_gateway_max_per_user', (string)$maxN);
    }

    handleVncGatewayGetConfig();
}

function handleVncGatewayStart() {
    $user = requireAuth();
    $data = getJSONInput();

    foreach (['password', 'passwd', 'privateKey', 'private_key', 'authToken'] as $k) {
        if (!empty($data[$k])) {
            sendJSON(['error' => 'Passwords must not be sent to the gateway start API — enter them in the VNC widget'], 400);
        }
    }

    $host = vncGatewayValidateHost(isset($data['host']) ? (string)$data['host'] : '');
    $vncPort = vncGatewayValidatePort($data['port'] ?? $data['vncPort'] ?? 5900);

    $sessions = vncGatewayCleanup(vncGatewayLoadSessions());
    vncGatewaySaveSessions($sessions);
    $mine = 0;
    foreach ($sessions as $s) {
        if ((int)($s['userId'] ?? 0) === (int)$user['id']) {
            $mine++;
        }
    }
    $maxPerUser = vncGatewayMaxPerUser();
    if ($mine >= $maxPerUser) {
        sendJSON([
            'error' => 'Too many active VNC gateways (max ' . $maxPerUser . '). Close a session tab first, or use stop-all if tabs are already gone.',
            'code' => 'gateway_limit',
            'active' => $mine,
            'max' => $maxPerUser,
        ], 429);
    }

    $runner = vncGatewayResolveRunner();
    $listenPort = vncGatewayAllocatePort();
    $sessionId = 'vgw_' . bin2hex(random_bytes(8));
    $logFile = vncGatewayEnsureDir() . DIRECTORY_SEPARATOR . $sessionId . '.log';

    // Docker: Apache proxies /_ln_vncgw/<port>/ — keep websockify plain HTTP on loopback
    $wantSsl = !vncGatewayPreferHttpProxy() && vncGatewayRequestIsHttps() && vncGatewaySslPaths() !== null;
    $spawn = vncGatewaySpawnWebsockify($runner, $listenPort, $host, $vncPort, $logFile, $wantSsl);
    $pid = (int)($spawn['pid'] ?? 0);
    $ready = !empty($spawn['ready']);
    $usedSsl = !empty($spawn['ssl']);

    if (!$ready) {
        if ($pid > 0) {
            vncGatewayKillPid($pid);
        }
        if (!empty($spawn['launcher']) && is_string($spawn['launcher']) && is_file($spawn['launcher'])) {
            @unlink($spawn['launcher']);
        }
        $tail = is_file($logFile) ? substr((string)@file_get_contents($logFile), -800) : '';
        sendJSON([
            'error' => 'websockify did not open a listening port. Check Admin → Add-ons → VNC Gateway paths, and that the VNC host is reachable from this server.',
            'log' => $tail,
            'code' => 'websockify_not_listening',
        ], 500);
    }

    if ($pid < 1) {
        $pid = vncGatewayPidListeningOnPort($listenPort);
    }

    $wsUrl = vncGatewayBuildWsUrl($listenPort, $usedSsl);
    $record = [
        'id' => $sessionId,
        'userId' => (int)$user['id'],
        'pid' => $pid,
        'listenPort' => $listenPort,
        'host' => $host,
        'vncPort' => $vncPort,
        'wsUrl' => $wsUrl,
        'createdAt' => time(),
        'logFile' => $logFile,
        'launcher' => $spawn['launcher'] ?? null,
    ];
    $sessions[] = $record;
    vncGatewaySaveSessions($sessions);

    sendJSON([
        'session' => [
            'sessionId' => $sessionId,
            'wsUrl' => $wsUrl,
            'listenPort' => $listenPort,
            'host' => $host,
            'port' => $vncPort,
            'pid' => $pid,
        ],
    ], 201);
}

function handleVncGatewayStop() {
    $user = requireAuth();
    $data = getJSONInput();
    $sessionId = isset($data['sessionId']) ? trim((string)$data['sessionId']) : '';
    if ($sessionId === '' || !preg_match('/^[A-Za-z0-9_-]{8,64}$/', $sessionId)) {
        sendJSON(['error' => 'sessionId is required'], 400);
    }

    $sessions = vncGatewayCleanup(vncGatewayLoadSessions());
    $kept = [];
    $found = false;
    foreach ($sessions as $s) {
        if (($s['id'] ?? '') === $sessionId) {
            if ((int)($s['userId'] ?? 0) !== (int)$user['id'] && empty($user['is_admin'])) {
                sendJSON(['error' => 'Forbidden'], 403);
            }
            $found = true;
            $pid = isset($s['pid']) ? (int)$s['pid'] : 0;
            $listenPort = isset($s['listenPort']) ? (int)$s['listenPort'] : 0;
            if ($pid > 0) {
                vncGatewayKillPid($pid);
            } elseif ($listenPort > 0) {
                $portPid = vncGatewayPidListeningOnPort($listenPort);
                if ($portPid > 0) {
                    vncGatewayKillPid($portPid);
                }
            }
            if (!empty($s['launcher']) && is_string($s['launcher']) && is_file($s['launcher'])) {
                @unlink($s['launcher']);
            }
            continue;
        }
        $kept[] = $s;
    }
    vncGatewaySaveSessions($kept);
    if (!$found) {
        sendJSON(['success' => true, 'message' => 'Session already gone']);
    }
    sendJSON(['success' => true]);
}

function handleVncGatewayStopAll() {
    $user = requireAuth();
    $sessions = vncGatewayCleanup(vncGatewayLoadSessions());
    $kept = [];
    $stopped = 0;
    foreach ($sessions as $s) {
        if ((int)($s['userId'] ?? 0) !== (int)$user['id']) {
            $kept[] = $s;
            continue;
        }
        $stopped++;
        $pid = isset($s['pid']) ? (int)$s['pid'] : 0;
        $listenPort = isset($s['listenPort']) ? (int)$s['listenPort'] : 0;
        if ($pid > 0) {
            vncGatewayKillPid($pid);
        }
        if ($listenPort > 0) {
            $portPid = vncGatewayPidListeningOnPort($listenPort);
            if ($portPid > 0) {
                vncGatewayKillPid($portPid);
            }
        }
        if (!empty($s['launcher']) && is_string($s['launcher']) && is_file($s['launcher'])) {
            @unlink($s['launcher']);
        }
    }
    vncGatewaySaveSessions($kept);
    sendJSON(['success' => true, 'stopped' => $stopped]);
}
