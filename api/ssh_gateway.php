<?php
/**
 * Start/stop local ttyd SSH gateways from LinkNest (Windows XAMPP-friendly).
 *
 * POST /api/ssh-gateway/start  { host, port?, username, x11? }
 * POST /api/ssh-gateway/stop   { sessionId }
 * POST /api/ssh-gateway/stop-all
 * GET  /api/ssh-gateway/status
 */

require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';
$path = rtrim($path, '/') ?: '/';

define('SSH_GATEWAY_DIR', DB_DIR . '/ssh_gateway');
// Override via env in Docker when host XAMPP already uses 17681–17780
define('SSH_GATEWAY_PORT_MIN', (int)(getenv('SSH_GATEWAY_PORT_MIN') ?: 17681));
define('SSH_GATEWAY_PORT_MAX', (int)(getenv('SSH_GATEWAY_PORT_MAX') ?: 17780));
define('SSH_GATEWAY_MAX_PER_USER', 8);
define('SSH_GATEWAY_TTL_SEC', 6 * 3600);

if (SSH_GATEWAY_PORT_MIN < 1024 || SSH_GATEWAY_PORT_MAX > 65535 || SSH_GATEWAY_PORT_MIN > SSH_GATEWAY_PORT_MAX) {
    // Keep safe defaults if env is misconfigured
    // (constants already set; allocatePort still bounds-checks each port)
}

if ($method === 'GET' && ($path === '/' || $path === '/status')) {
    handleSshGatewayStatus();
} elseif ($method === 'GET' && $path === '/config') {
    handleSshGatewayGetConfig();
} elseif ($method === 'PUT' && $path === '/config') {
    handleSshGatewayPutConfig();
} elseif ($method === 'POST' && $path === '/start') {
    handleSshGatewayStart();
} elseif ($method === 'POST' && $path === '/stop') {
    handleSshGatewayStop();
} elseif ($method === 'POST' && $path === '/stop-all') {
    handleSshGatewayStopAll();
} else {
    sendJSON(['error' => 'Invalid endpoint'], 404);
}

function sshGatewayEnsureDir(): string {
    if (!is_dir(SSH_GATEWAY_DIR)) {
        if (!mkdir(SSH_GATEWAY_DIR, 0755, true) && !is_dir(SSH_GATEWAY_DIR)) {
            sendJSON(['error' => 'Failed to create ssh_gateway data directory'], 500);
        }
    }
    return SSH_GATEWAY_DIR;
}

function sshGatewaySessionsFile(): string {
    return sshGatewayEnsureDir() . '/sessions.json';
}

function sshGatewayLoadSessions(): array {
    $file = sshGatewaySessionsFile();
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

function sshGatewaySaveSessions(array $sessions): void {
    $file = sshGatewaySessionsFile();
    $tmp = $file . '.tmp';
    $json = json_encode(array_values($sessions), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if (@file_put_contents($tmp, $json) === false) {
        sendJSON(['error' => 'Failed to persist gateway sessions'], 500);
    }
    @rename($tmp, $file);
}

function sshGatewayIsProcessAlive(?int $pid): bool {
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

function sshGatewayKillPid(int $pid): void {
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

function sshGatewayCleanup(array $sessions): array {
    $now = time();
    $out = [];
    foreach ($sessions as $s) {
        if (!is_array($s) || empty($s['id'])) {
            continue;
        }
        $pid = isset($s['pid']) ? (int)$s['pid'] : 0;
        $listenPort = isset($s['listenPort']) ? (int)$s['listenPort'] : 0;
        $created = isset($s['createdAt']) ? (int)$s['createdAt'] : 0;
        $expired = $created > 0 && ($now - $created) > SSH_GATEWAY_TTL_SEC;

        // A gateway slot is only "active" if ttyd is actually listening.
        // Stale launcher/cmd PIDs without a listen port were filling the max-8 quota.
        $portPid = $listenPort > 0 ? sshGatewayPidListeningOnPort($listenPort) : 0;
        $alive = $portPid > 0;
        if ($alive) {
            $s['pid'] = $portPid;
            $pid = $portPid;
        }

        if (!$alive || $expired) {
            if ($pid > 0) {
                sshGatewayKillPid($pid);
            }
            if ($listenPort > 0 && $portPid > 0 && $portPid !== $pid) {
                sshGatewayKillPid($portPid);
            } elseif ($listenPort > 0 && !$alive) {
                $again = sshGatewayPidListeningOnPort($listenPort);
                if ($again > 0) {
                    sshGatewayKillPid($again);
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

function sshGatewayFindBinary(string $name, array $extraPaths = []): ?string {
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

function sshGatewayDefaultTtydCandidates(): array {
    $root = realpath(__DIR__ . '/..') ?: (__DIR__ . '/..');
    $candidates = [
        $root . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'ttyd.exe',
        $root . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'ttyd',
    ];
    if (stripos(PHP_OS, 'WIN') === 0) {
        $local = getenv('LOCALAPPDATA') ?: '';
        $pkgRoot = $local . '\\Microsoft\\WinGet\\Packages';
        if (is_dir($pkgRoot)) {
            $dirs = glob($pkgRoot . DIRECTORY_SEPARATOR . 'tsl0922.ttyd*', GLOB_ONLYDIR) ?: [];
            foreach ($dirs as $dir) {
                foreach (glob($dir . DIRECTORY_SEPARATOR . 'ttyd.exe') ?: [] as $exe) {
                    $candidates[] = $exe;
                }
            }
        }
        $candidates[] = $local . '\\Microsoft\\WinGet\\Links\\ttyd.exe';
        $pf = getenv('ProgramFiles') ?: 'C:\\Program Files';
        $candidates[] = $pf . '\\ttyd\\ttyd.exe';
    } else {
        $candidates[] = '/usr/bin/ttyd';
        $candidates[] = '/usr/local/bin/ttyd';
    }
    return $candidates;
}

function sshGatewayDefaultSshCandidates(): array {
    $candidates = [];
    if (stripos(PHP_OS, 'WIN') === 0) {
        $candidates[] = 'C:\\Windows\\System32\\OpenSSH\\ssh.exe';
        $sysRoot = getenv('SystemRoot') ?: 'C:\\Windows';
        $candidates[] = $sysRoot . '\\System32\\OpenSSH\\ssh.exe';
    } else {
        $candidates[] = '/usr/bin/ssh';
        $candidates[] = '/usr/local/bin/ssh';
    }
    return $candidates;
}

function sshGatewayConfiguredPath(string $settingKey): string {
    $raw = trim((string)getSetting($settingKey, ''));
    return $raw;
}

/**
 * True when a configured path belongs to the other OS (e.g. Windows .exe path
 * baked into a DB that was copied into a Linux Docker image).
 */
function sshGatewayIsForeignOsPath(string $path): bool {
    $path = trim($path);
    if ($path === '') {
        return false;
    }
    $isWin = stripos(PHP_OS, 'WIN') === 0;
    if ($isWin) {
        // Absolute Unix path on Windows (e.g. /usr/local/bin/ttyd)
        return str_starts_with($path, '/') && !preg_match('/^[A-Za-z]:/', $path);
    }
    // Windows drive / backslash / .exe paths on Linux/Docker
    if (preg_match('/^[A-Za-z]:[\\\\\\/]/', $path)) {
        return true;
    }
    if (str_contains($path, '\\')) {
        return true;
    }
    if (preg_match('/\.exe$/i', $path)) {
        return true;
    }
    return false;
}

function sshGatewayResolveTtyd(): string {
    $configured = sshGatewayConfiguredPath('ssh_gateway_ttyd_path');
    if ($configured !== '') {
        if (!sshGatewayIsForeignOsPath($configured) && is_file($configured)) {
            return $configured;
        }
        // Stale Windows paths in a Docker DB: fall through to Linux auto-detect
        if (!sshGatewayIsForeignOsPath($configured)) {
            sendJSON([
                'error' => 'Configured ttyd path was not found: ' . $configured . '. Update Admin → Add-ons → SSH Gateway paths.',
                'code' => 'ttyd_missing',
                'configuredPath' => $configured,
            ], 503);
        }
    }

    $found = sshGatewayFindBinary('ttyd', sshGatewayDefaultTtydCandidates());
    if ($found) {
        return $found;
    }
    sendJSON([
        'error' => 'ttyd was not found. Install it (winget install tsl0922.ttyd --source winget) or set a custom path in Admin → Add-ons → SSH Gateway.',
        'code' => 'ttyd_missing',
    ], 503);
    return '';
}

function sshGatewayResolveSsh(): string {
    $configured = sshGatewayConfiguredPath('ssh_gateway_ssh_path');
    if ($configured !== '') {
        if (!sshGatewayIsForeignOsPath($configured) && is_file($configured)) {
            return $configured;
        }
        if (!sshGatewayIsForeignOsPath($configured)) {
            sendJSON([
                'error' => 'Configured OpenSSH path was not found: ' . $configured . '. Update Admin → Add-ons → SSH Gateway paths.',
                'code' => 'ssh_missing',
                'configuredPath' => $configured,
            ], 503);
        }
    }

    $found = sshGatewayFindBinary('ssh', sshGatewayDefaultSshCandidates());
    if ($found) {
        return $found;
    }
    sendJSON([
        'error' => 'OpenSSH ssh client was not found. Install OpenSSH Client or set a custom path in Admin → Add-ons → SSH Gateway.',
        'code' => 'ssh_missing',
    ], 503);
    return '';
}

function sshGatewaySoftResolve(string $kind): ?string {
    $key = $kind === 'ssh' ? 'ssh_gateway_ssh_path' : 'ssh_gateway_ttyd_path';
    $configured = sshGatewayConfiguredPath($key);
    if ($configured !== '' && !sshGatewayIsForeignOsPath($configured) && is_file($configured)) {
        return $configured;
    }
    $candidates = $kind === 'ssh' ? sshGatewayDefaultSshCandidates() : sshGatewayDefaultTtydCandidates();
    $name = $kind === 'ssh' ? 'ssh' : 'ttyd';
    return sshGatewayFindBinary($name, $candidates);
}

function handleSshGatewayGetConfig() {
    requireAdmin();
    $ttydConfigured = sshGatewayConfiguredPath('ssh_gateway_ttyd_path');
    $sshConfigured = sshGatewayConfiguredPath('ssh_gateway_ssh_path');
    $displayConfigured = trim((string)getSetting('ssh_gateway_x11_display', ''));
    $ttydResolved = sshGatewaySoftResolve('ttyd');
    $sshResolved = sshGatewaySoftResolve('ssh');

    $vcxsrv = null;
    if (stripos(PHP_OS, 'WIN') === 0) {
        foreach (['C:\\Program Files\\VcXsrv\\vcxsrv.exe', 'C:\\Program Files (x86)\\VcXsrv\\vcxsrv.exe'] as $p) {
            if (is_file($p)) {
                $vcxsrv = $p;
                break;
            }
        }
    }

    sendJSON([
        'config' => [
            'ttydPath' => $ttydConfigured,
            'sshPath' => $sshConfigured,
            'x11Display' => sshGatewayDefaultDisplay(),
        ],
        'resolved' => [
            'ttydPath' => $ttydResolved,
            'sshPath' => $sshResolved,
            'ttydExists' => $ttydResolved !== null,
            'sshExists' => $sshResolved !== null,
            'vcxsrvPath' => $vcxsrv,
        ],
        'defaults' => [
            'ttydCandidates' => array_values(array_filter(sshGatewayDefaultTtydCandidates(), 'is_file')),
            'sshCandidates' => array_values(array_filter(sshGatewayDefaultSshCandidates(), 'is_file')),
        ],
    ]);
}

function handleSshGatewayPutConfig() {
    requireAdmin();
    $data = getJSONInput();

    $ttydPath = isset($data['ttydPath']) ? trim((string)$data['ttydPath']) : null;
    $sshPath = isset($data['sshPath']) ? trim((string)$data['sshPath']) : null;
    $x11Display = isset($data['x11Display']) ? trim((string)$data['x11Display']) : null;

    if ($ttydPath !== null) {
        if ($ttydPath !== '' && preg_match('/[;\|&<>]/i', $ttydPath)) {
            sendJSON(['error' => 'ttyd path contains invalid characters'], 400);
        }
        if ($ttydPath !== '' && !is_file($ttydPath)) {
            sendJSON(['error' => 'ttyd path does not exist on this server: ' . $ttydPath], 400);
        }
        setSetting('ssh_gateway_ttyd_path', $ttydPath);
    }

    if ($sshPath !== null) {
        if ($sshPath !== '' && preg_match('/[;\|&<>]/i', $sshPath)) {
            sendJSON(['error' => 'SSH path contains invalid characters'], 400);
        }
        if ($sshPath !== '' && !is_file($sshPath)) {
            sendJSON(['error' => 'SSH path does not exist on this server: ' . $sshPath], 400);
        }
        setSetting('ssh_gateway_ssh_path', $sshPath);
    }

    if ($x11Display !== null) {
        if ($x11Display !== '' && !preg_match('/^[0-9A-Za-z.:_-]+$/', $x11Display)) {
            sendJSON(['error' => 'Invalid X11 display value'], 400);
        }
        setSetting('ssh_gateway_x11_display', $x11Display);
    }

    handleSshGatewayGetConfig();
}

function sshGatewayAllocatePort(): int {
    for ($port = SSH_GATEWAY_PORT_MIN; $port <= SSH_GATEWAY_PORT_MAX; $port++) {
        $errno = 0;
        $errstr = '';
        $sock = @stream_socket_server('tcp://127.0.0.1:' . $port, $errno, $errstr);
        if ($sock) {
            fclose($sock);
            return $port;
        }
    }
    sendJSON(['error' => 'No free localhost port for ttyd (range ' . SSH_GATEWAY_PORT_MIN . '-' . SSH_GATEWAY_PORT_MAX . ')'], 503);
    return 0;
}

function sshGatewayValidateHost(string $host): string {
    $host = trim($host);
    if ($host === '' || mb_strlen($host) > 253) {
        sendJSON(['error' => 'Invalid host'], 400);
    }
    // hostname or IPv4 — reject shell metacharacters
    if (!preg_match('/^(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?|(?:\d{1,3}\.){3}\d{1,3})$/', $host)) {
        sendJSON(['error' => 'Host must be a hostname or IPv4 address'], 400);
    }
    return $host;
}

function sshGatewayValidateUsername(string $user): string {
    // Trim only ends — PAM / PSM usernames may include \, +, @, / and long target chains.
    $user = trim($user);
    if ($user === '' || mb_strlen($user) > 256) {
        sendJSON(['error' => 'Invalid username (empty or longer than 256 characters)'], 400);
    }
    // Reject shell / control metacharacters and whitespace; allow typical PAM tokens.
    if (preg_match('/[\x00-\x1F\x7F]/u', $user)) {
        sendJSON(['error' => 'Username contains invalid characters'], 400);
    }
    if (preg_match('/[;|&$`<>(){}\[\]"\'\s]/u', $user)) {
        sendJSON(['error' => 'Username contains invalid characters'], 400);
    }
    // Letters, digits, and common PAM separators: . _ - \ + @ / % = : ,
    if (!preg_match('/^[A-Za-z0-9._\-\\\\+@\/%=:,]+$/u', $user)) {
        sendJSON(['error' => 'Username contains invalid characters'], 400);
    }
    return $user;
}

function sshGatewayValidatePort($port): int {
    $p = (int)$port;
    if ($p < 1 || $p > 65535) {
        sendJSON(['error' => 'SSH port must be 1–65535'], 400);
    }
    return $p;
}

function sshGatewayRequestIsHttps(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string)$_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https')
        || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443);
}

/** Apache self-signed certs (Docker) — used so HTTPS UI can open wss:// to ttyd. */
function sshGatewaySslPaths(): ?array {
    $candidates = [
        ['cert' => '/etc/apache2/ssl/linknest.crt', 'key' => '/etc/apache2/ssl/linknest.key'],
        ['cert' => '/var/www/html/data/ssh_gateway/ttyd.crt', 'key' => '/var/www/html/data/ssh_gateway/ttyd.key'],
    ];
    foreach ($candidates as $pair) {
        if (is_readable($pair['cert']) && is_readable($pair['key'])) {
            return $pair;
        }
    }
    return null;
}

function sshGatewayBuildWsUrl(int $listenPort, ?bool $useSsl = null): string {
    $https = $useSsl === null ? sshGatewayRequestIsHttps() : $useSsl;
    // Only advertise wss when ttyd was (or will be) started with TLS certs
    if ($https && sshGatewaySslPaths() === null) {
        $https = false;
    }
    $scheme = $https ? 'wss' : 'ws';
    $host = $_SERVER['HTTP_HOST'] ?? '127.0.0.1';
    // Strip :port from HTTP_HOST if present — ttyd uses its own listen port
    if (str_contains($host, ':') && !str_starts_with($host, '[')) {
        $host = explode(':', $host)[0];
    }
    // Prefer localhost when the page host is local loopback for firewall friendliness
    $reqHost = strtolower($host);
    if (in_array($reqHost, ['localhost', '127.0.0.1', '::1'], true)) {
        $host = '127.0.0.1';
    }
    return $scheme . '://' . $host . ':' . $listenPort . '/ws';
}

function sshGatewayWorkingDir(): string {
    if (stripos(PHP_OS, 'WIN') === 0) {
        $profile = getenv('USERPROFILE') ?: getenv('SystemDrive') . '\\Users\\Public';
        if (is_dir($profile)) {
            return $profile;
        }
    }
    $home = getenv('HOME');
    if (is_string($home) && is_dir($home)) {
        return $home;
    }
    return sys_get_temp_dir();
}

function sshGatewayIsDocker(): bool {
    if (getenv('LINKNEST_DOCKER') === '1' || getenv('SSH_GATEWAY_DOCKER') === '1') {
        return true;
    }
    return is_file('/.dockerenv');
}

function sshGatewayDisplayIsLoopback(string $display): bool {
    return (bool)preg_match('/^(127\.0\.0\.1|localhost|::1)(:|$)/i', trim($display));
}

/**
 * Resolve DISPLAY for ssh -Y.
 * In Docker, 127.0.0.1 is the container — X must go to the Docker host (VcXsrv).
 *
 * @return array{host:string,port:int,display:string}
 */
function sshGatewayParseDisplay(string $display): array {
    $display = trim($display);
    $host = '127.0.0.1';
    $num = 0;
    if (preg_match('/^([^:]*):(\d+)(?:\.\d+)?$/', $display, $m)) {
        $hostPart = $m[1];
        $num = (int)$m[2];
        if ($hostPart === '' || strcasecmp($hostPart, 'unix') === 0) {
            $host = '127.0.0.1';
        } else {
            $host = $hostPart;
        }
    } elseif (preg_match('/^:(\d+)/', $display, $m)) {
        $num = (int)$m[1];
    }
    return [
        'host' => $host,
        'port' => 6000 + $num,
        'display' => $display !== '' ? $display : '127.0.0.1:0.0',
    ];
}

/** Prefer IPv4 — Docker Desktop often resolves host.docker.internal to IPv6 first; VcXsrv is IPv4. */
function sshGatewayResolveDisplayHost(string $host): string {
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        return $host;
    }
    $ip = gethostbyname($host);
    if (is_string($ip) && $ip !== '' && $ip !== $host && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        return $ip;
    }
    return $host;
}

/**
 * Canonical DISPLAY string for ssh -Y (hostname rewritten to IPv4 when useful).
 */
function sshGatewayNormalizeDisplay(string $display): string {
    $parsed = sshGatewayParseDisplay($display);
    $host = sshGatewayResolveDisplayHost($parsed['host']);
    $num = max(0, $parsed['port'] - 6000);
    return $host . ':' . $num . '.0';
}

function sshGatewayDefaultDisplay(): string {
    $fromEnv = getenv('DISPLAY');
    $fromDockerOverride = getenv('SSH_GATEWAY_X11_DISPLAY');
    $fromSetting = trim((string)getSetting('ssh_gateway_x11_display', ''));

    if (sshGatewayIsDocker()) {
        if (is_string($fromDockerOverride) && trim($fromDockerOverride) !== '' && !sshGatewayDisplayIsLoopback(trim($fromDockerOverride))) {
            return sshGatewayNormalizeDisplay(trim($fromDockerOverride));
        }
        if (is_string($fromEnv) && trim($fromEnv) !== '' && !sshGatewayDisplayIsLoopback(trim($fromEnv))) {
            return sshGatewayNormalizeDisplay(trim($fromEnv));
        }
        if ($fromSetting !== '' && !sshGatewayDisplayIsLoopback($fromSetting)) {
            return sshGatewayNormalizeDisplay($fromSetting);
        }
        return sshGatewayNormalizeDisplay('host.docker.internal:0.0');
    }

    if ($fromSetting !== '') {
        return $fromSetting;
    }
    if (is_string($fromEnv) && trim($fromEnv) !== '') {
        return trim($fromEnv);
    }
    return '127.0.0.1:0.0';
}

function handleSshGatewayStatus() {
    $user = requireAuth();
    $sessions = sshGatewayCleanup(sshGatewayLoadSessions());
    sshGatewaySaveSessions($sessions);
    $mine = array_values(array_filter($sessions, static function ($s) use ($user) {
        return (int)($s['userId'] ?? 0) === (int)$user['id'];
    }));

    $ttydPath = sshGatewaySoftResolve('ttyd');
    $sshPath = sshGatewaySoftResolve('ssh');

    $display = sshGatewayDefaultDisplay();
    $parsed = sshGatewayParseDisplay($display);
    $connectHost = sshGatewayResolveDisplayHost($parsed['host']);
    $displayReachable = false;
    $fp = @fsockopen($connectHost, $parsed['port'], $errno, $errstr, 0.35);
    if ($fp) {
        fclose($fp);
        $displayReachable = true;
    }

    $inDocker = sshGatewayIsDocker();
    if ($displayReachable) {
        $hint = 'X server looks reachable at ' . $display . ' — GUI mode can forward apps to your desktop.';
    } elseif ($inDocker) {
        $hint = 'Docker cannot reach an X server at ' . $display . '. Start VcXsrv on Windows (XLaunch → Multiple windows → Start no client → check “Disable access control”), allow it in the firewall, then retry. DISPLAY must be host.docker.internal:0.0 (not 127.0.0.1).';
    } else {
        $hint = 'Start VcXsrv (or another X server) on this PC before using GUI mode. XLaunch → Multiple windows → Start no client → Disable access control (recommended).';
    }

    sendJSON([
        'available' => $ttydPath !== null && $sshPath !== null,
        'ttydPath' => $ttydPath,
        'sshPath' => $sshPath,
        'platform' => PHP_OS,
        'docker' => $inDocker,
        'gui' => [
            'supported' => true,
            'display' => $display,
            'displayHost' => $parsed['host'],
            'displayPort' => $parsed['port'],
            'displayReachable' => $displayReachable,
            'hint' => $hint,
        ],
        'sessions' => array_map(static function ($s) {
            return [
                'sessionId' => $s['id'],
                'host' => $s['host'] ?? null,
                'port' => $s['sshPort'] ?? null,
                'username' => $s['username'] ?? null,
                'listenPort' => $s['listenPort'] ?? null,
                'wsUrl' => $s['wsUrl'] ?? null,
                'x11' => !empty($s['x11']),
                'createdAt' => $s['createdAt'] ?? null,
            ];
        }, $mine),
    ]);
}

function sshGatewayQuoteCmd(string $s): string {
    return '"' . str_replace('"', '""', $s) . '"';
}

/** Find OS PID listening on TCP port (Windows netstat / Linux ss|lsof). */
function sshGatewayPidListeningOnPort(int $port): int {
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
            // Match :PORT before whitespace (IPv4 / IPv6 forms)
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

/**
 * Spawn ttyd detached so it survives after the PHP/Apache request ends (critical on Windows).
 * @return array{pid:int,ready:bool}
 */
function sshGatewaySpawnTtyd(
    string $ttyd,
    string $ssh,
    int $listenPort,
    string $cwd,
    array $sshArgs,
    bool $x11,
    string $x11Display,
    string $logFile,
    bool $useSsl = false
): array {
    if (stripos(PHP_OS, 'WIN') === 0) {
        $bat = sshGatewayEnsureDir() . DIRECTORY_SEPARATOR . 'run_' . bin2hex(random_bytes(6)) . '.cmd';
        $lines = ['@echo off'];
        if ($x11) {
            // Safe charset already validated by caller
            $lines[] = 'set "DISPLAY=' . $x11Display . '"';
            $lines[] = 'set "LIBGL_ALWAYS_INDIRECT=1"';
        }
        $line = sshGatewayQuoteCmd($ttyd)
            . ' -W -i 0.0.0.0 -p ' . (int)$listenPort
            . ' -w ' . sshGatewayQuoteCmd($cwd)
            . ' ' . sshGatewayQuoteCmd($ssh);
        foreach ($sshArgs as $a) {
            $line .= ' ' . sshGatewayQuoteCmd((string)$a);
        }
        $lines[] = $line . ' >> ' . sshGatewayQuoteCmd($logFile) . ' 2>&1';
        if (@file_put_contents($bat, implode("\r\n", $lines) . "\r\n") === false) {
            sendJSON(['error' => 'Failed to write ttyd launcher script'], 500);
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
            $ok = true;
        }
        if (!$ok) {
            @unlink($bat);
            sendJSON(['error' => 'Failed to launch detached ttyd process'], 500);
        }

        $ready = false;
        $pid = 0;
        for ($i = 0; $i < 25; $i++) {
            usleep(200000);
            $fp = @fsockopen('127.0.0.1', $listenPort, $errno, $errstr, 0.2);
            if ($fp) {
                fclose($fp);
                $ready = true;
                $pid = sshGatewayPidListeningOnPort($listenPort);
                break;
            }
        }
        // Do not delete $bat while ttyd is alive — cmd.exe keeps reading the .cmd and will fail with
        // "The batch file cannot be found" if we unlink it, which can kill the gateway.
        return ['pid' => $pid, 'ready' => $ready, 'launcher' => $bat, 'ssl' => false];
    }

    // Unix: process group + nohup-style detach via proc_open then exit
    $cmd = [$ttyd, '-W', '-i', '0.0.0.0', '-p', (string)$listenPort];
    $sslPaths = $useSsl ? sshGatewaySslPaths() : null;
    if ($sslPaths !== null) {
        $cmd[] = '--ssl';
        $cmd[] = '--ssl-cert';
        $cmd[] = $sslPaths['cert'];
        $cmd[] = '--ssl-key';
        $cmd[] = $sslPaths['key'];
    } else {
        $useSsl = false;
    }
    $cmd = array_merge($cmd, ['-w', $cwd, $ssh], $sshArgs);
    $env = null;
    if ($x11) {
        $env = [];
        foreach ($_ENV as $k => $v) {
            if (is_string($k) && is_string($v)) {
                $env[$k] = $v;
            }
        }
        foreach ($_SERVER as $k => $v) {
            if (is_string($k) && is_string($v) && !array_key_exists($k, $env) && preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $k)) {
                $env[$k] = $v;
            }
        }
        $env['DISPLAY'] = $x11Display;
        $env['LIBGL_ALWAYS_INDIRECT'] = $env['LIBGL_ALWAYS_INDIRECT'] ?? '1';
    }

    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['file', $logFile, 'a'],
        2 => ['file', $logFile, 'a'],
    ];
    $process = @proc_open($cmd, $descriptors, $pipes, $cwd, $env, ['bypass_shell' => true]);
    if (!is_resource($process)) {
        sendJSON(['error' => 'Failed to start ttyd process. Ensure PHP may spawn executables and ttyd is installed.'], 500);
    }
    if (isset($pipes[0]) && is_resource($pipes[0])) {
        @fclose($pipes[0]);
    }
    $status = proc_get_status($process);
    $pid = isset($status['pid']) ? (int)$status['pid'] : 0;

    $ready = false;
    for ($i = 0; $i < 20; $i++) {
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

    // Don't proc_close — that would wait/reap. Leave process running.
    return [
        'pid' => $pid > 0 ? $pid : sshGatewayPidListeningOnPort($listenPort),
        'ready' => $ready,
        'ssl' => $useSsl && $sslPaths !== null,
    ];
}

function handleSshGatewayStart() {
    $user = requireAuth();
    $data = getJSONInput();

    foreach (['password', 'passwd', 'privateKey', 'private_key', 'authToken'] as $k) {
        if (!empty($data[$k])) {
            sendJSON(['error' => 'Passwords/keys must not be sent to the gateway start API — enter them in the terminal prompt'], 400);
        }
    }

    $host = sshGatewayValidateHost(isset($data['host']) ? (string)$data['host'] : '');
    $username = sshGatewayValidateUsername(isset($data['username']) ? (string)$data['username'] : '');
    $sshPort = sshGatewayValidatePort($data['port'] ?? $data['sshPort'] ?? 22);
    $x11 = !empty($data['x11']);
    $x11Display = isset($data['x11Display']) ? trim((string)$data['x11Display']) : '';
    if ($x11Display === '') {
        $x11Display = sshGatewayDefaultDisplay();
    } elseif (sshGatewayIsDocker() && sshGatewayDisplayIsLoopback($x11Display)) {
        // Never use container loopback for X11 inside Docker
        $x11Display = sshGatewayDefaultDisplay();
    }
    if ($x11 && !preg_match('/^[0-9A-Za-z.:_-]+$/', $x11Display)) {
        sendJSON(['error' => 'Invalid X11 display value'], 400);
    }

    $sessions = sshGatewayCleanup(sshGatewayLoadSessions());
    sshGatewaySaveSessions($sessions);
    $mine = 0;
    foreach ($sessions as $s) {
        if ((int)($s['userId'] ?? 0) === (int)$user['id']) {
            $mine++;
        }
    }
    if ($mine >= SSH_GATEWAY_MAX_PER_USER) {
        sendJSON([
            'error' => 'Too many active SSH gateways (max ' . SSH_GATEWAY_MAX_PER_USER . '). Close a session tab first, or use stop-all if tabs are already gone.',
            'code' => 'gateway_limit',
            'active' => $mine,
            'max' => SSH_GATEWAY_MAX_PER_USER,
        ], 429);
    }

    $ttyd = sshGatewayResolveTtyd();
    $ssh = sshGatewayResolveSsh();
    $listenPort = sshGatewayAllocatePort();
    $cwd = sshGatewayWorkingDir();
    $sessionId = 'gw_' . bin2hex(random_bytes(8));
    $logFile = sshGatewayEnsureDir() . DIRECTORY_SEPARATOR . $sessionId . '.log';

    $sshArgs = [];
    if ($x11) {
        $sshArgs[] = '-Y';
        $sshArgs[] = '-o';
        $sshArgs[] = 'ForwardX11=yes';
        $sshArgs[] = '-o';
        $sshArgs[] = 'ForwardX11Trusted=yes';
    }
    $sshArgs[] = '-tt';
    $sshArgs[] = '-p';
    $sshArgs[] = (string)$sshPort;
    // Use -l for username so PAM strings with \, +, @ stay intact (avoid user@host parsing issues).
    $sshArgs[] = '-l';
    $sshArgs[] = $username;
    $sshArgs[] = $host;

    // On HTTPS pages (e.g. Docker :8443), start ttyd with the container TLS certs so the browser can use wss://
    $wantSsl = sshGatewayRequestIsHttps() && sshGatewaySslPaths() !== null;
    $spawn = sshGatewaySpawnTtyd($ttyd, $ssh, $listenPort, $cwd, $sshArgs, $x11, $x11Display, $logFile, $wantSsl);
    $pid = (int)($spawn['pid'] ?? 0);
    $ready = !empty($spawn['ready']);
    $usedSsl = !empty($spawn['ssl']);

    if (!$ready) {
        if ($pid > 0) {
            sshGatewayKillPid($pid);
        }
        if (!empty($spawn['launcher']) && is_string($spawn['launcher']) && is_file($spawn['launcher'])) {
            @unlink($spawn['launcher']);
        }
        $tail = is_file($logFile) ? substr((string)@file_get_contents($logFile), -800) : '';
        sendJSON([
            'error' => 'ttyd did not open a listening port. Check Admin → Add-ons → SSH Gateway paths, or install ttyd.',
            'log' => $tail,
            'code' => 'ttyd_not_listening',
        ], 500);
    }

    if ($pid < 1) {
        $pid = sshGatewayPidListeningOnPort($listenPort);
    }

    $wsUrl = sshGatewayBuildWsUrl($listenPort, $usedSsl);
    $record = [
        'id' => $sessionId,
        'userId' => (int)$user['id'],
        'pid' => $pid,
        'listenPort' => $listenPort,
        'host' => $host,
        'sshPort' => $sshPort,
        'username' => $username,
        'x11' => $x11,
        'x11Display' => $x11 ? $x11Display : null,
        'wsUrl' => $wsUrl,
        'createdAt' => time(),
        'logFile' => $logFile,
        'launcher' => $spawn['launcher'] ?? null,
    ];
    $sessions[] = $record;
    sshGatewaySaveSessions($sessions);

    sendJSON([
        'session' => [
            'sessionId' => $sessionId,
            'wsUrl' => $wsUrl,
            'listenPort' => $listenPort,
            'host' => $host,
            'port' => $sshPort,
            'username' => $username,
            'pid' => $pid,
            'x11' => $x11,
            'x11Display' => $x11 ? $x11Display : null,
        ],
    ], 201);
}

function handleSshGatewayStop() {
    $user = requireAuth();
    $data = getJSONInput();
    $sessionId = isset($data['sessionId']) ? trim((string)$data['sessionId']) : '';
    if ($sessionId === '' || !preg_match('/^[A-Za-z0-9_-]{8,64}$/', $sessionId)) {
        sendJSON(['error' => 'sessionId is required'], 400);
    }

    $sessions = sshGatewayCleanup(sshGatewayLoadSessions());
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
                sshGatewayKillPid($pid);
            } elseif ($listenPort > 0) {
                $portPid = sshGatewayPidListeningOnPort($listenPort);
                if ($portPid > 0) {
                    sshGatewayKillPid($portPid);
                }
            }
            if (!empty($s['launcher']) && is_string($s['launcher']) && is_file($s['launcher'])) {
                @unlink($s['launcher']);
            }
            continue;
        }
        $kept[] = $s;
    }
    sshGatewaySaveSessions($kept);
    if (!$found) {
        sendJSON(['success' => true, 'message' => 'Session already gone']);
    }
    sendJSON(['success' => true]);
}

/** Stop every gateway session for the current user (orphans left when UI tabs were closed). */
function handleSshGatewayStopAll() {
    $user = requireAuth();
    $sessions = sshGatewayCleanup(sshGatewayLoadSessions());
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
            sshGatewayKillPid($pid);
        }
        if ($listenPort > 0) {
            $portPid = sshGatewayPidListeningOnPort($listenPort);
            if ($portPid > 0) {
                sshGatewayKillPid($portPid);
            }
        }
        if (!empty($s['launcher']) && is_string($s['launcher']) && is_file($s['launcher'])) {
            @unlink($s['launcher']);
        }
    }
    sshGatewaySaveSessions($kept);
    sendJSON(['success' => true, 'stopped' => $stopped]);
}
