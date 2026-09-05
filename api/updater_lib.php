<?php
/**
 * Shared helpers for GitHub Releases in-app updater (XAMPP).
 */

if (!defined('UPDATER_ROOT')) {
    define('UPDATER_ROOT', realpath(__DIR__ . '/..') ?: dirname(__DIR__));
}

define('UPDATER_LOCK_FILE', UPDATER_ROOT . '/data/updater.lock');
define('UPDATER_JOB_FILE', UPDATER_ROOT . '/data/updater-job.json');
define('UPDATER_CACHE_FILE', UPDATER_ROOT . '/data/updater-cache.json');
define('UPDATER_COMMITS_CACHE_FILE', UPDATER_ROOT . '/data/updater-commits-cache.json');
define('UPDATER_HISTORY_FILE', UPDATER_ROOT . '/data/updater-history.json');
define('UPDATER_SNAPSHOTS_DIR', UPDATER_ROOT . '/data/updater-snapshots');
define('UPDATER_TMP_DIR', UPDATER_ROOT . '/data/tmp');
define('UPDATER_HISTORY_MAX', 10);
/** If GitHub compare vs a stored SHA is this far ahead, retry against the Release tag. */
define('UPDATER_STALE_BASE_AHEAD', 25);

/** Top-level paths allowed when extracting an update ZIP (never data/, uploads/, .env*). */
const UPDATER_ZIP_ALLOW_PREFIXES = [
    'api/',
    'dist/',
    'components/',
    'contexts/',
    'services/',
    'hooks/',
    'utils/',
    'constants/',
    'styles/',
    'scripts/',
    'land/',
    'vendor/',
    'addons/',
    'analytics/',
    'monitorv2/',
    'public/',
    'assets/',
    'docs/',
    'docker/',
    'apache/',
    'config/',
    'runtime/',
    'bin/',
    'load-tests/',
];

const UPDATER_ZIP_ALLOW_ROOT_FILES = [
    'index.html',
    'index.php',
    'index.tsx',
    'index.css',
    'App.tsx',
    'types.ts',
    'package.json',
    'package-lock.json',
    'BUILD_INFO.json',
    '.htaccess',
    'robots.txt',
    'sw.js',
    'sw-cache-first.php',
    'manifest.webmanifest',
    'favicon.ico',
    'vite.config.ts',
    'vite.docker.config.ts',
    'vite.runtime.config.ts',
    'tsconfig.json',
    'tailwind.config.js',
    'postcss.config.js',
    'deploy-xampp.bat',
    'update-xampp.bat',
    'verify-install.bat',
    'install-sqlite-xampp.bat',
    'SOURCE_SPECS.json',
    'README.md',
    'AGENTS.md',
];

function updaterProjectRoot(): string {
    return UPDATER_ROOT;
}

function updaterNormalizeVersion(string $version): string {
    $v = trim($version);
    if ($v === '') {
        return '0.0.0';
    }
    if (preg_match('/^v/i', $v)) {
        $v = substr($v, 1);
    }
    // Drop prerelease / build metadata for compare
    $v = preg_replace('/[-+].*$/', '', $v) ?? $v;
    return $v !== '' ? $v : '0.0.0';
}

/**
 * @return int negative if $a < $b, 0 if equal, positive if $a > $b
 */
function updaterCompareSemver(string $a, string $b): int {
    $pa = array_map('intval', explode('.', updaterNormalizeVersion($a) . '.0.0.0'));
    $pb = array_map('intval', explode('.', updaterNormalizeVersion($b) . '.0.0.0'));
    for ($i = 0; $i < 3; $i++) {
        if ($pa[$i] !== $pb[$i]) {
            return $pa[$i] <=> $pb[$i];
        }
    }
    return 0;
}

function updaterTagToVersion(string $tag): string {
    return updaterNormalizeVersion($tag);
}

function updaterReadBuildInfo(): array {
    $paths = [
        UPDATER_ROOT . '/BUILD_INFO.json',
        UPDATER_ROOT . '/dist/BUILD_INFO.json',
    ];
    foreach ($paths as $path) {
        if (!is_file($path)) {
            continue;
        }
        $raw = @file_get_contents($path);
        if ($raw === false || $raw === '') {
            continue;
        }
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            return $decoded;
        }
    }
    return [];
}

function updaterInstalledVersion(): string {
    $candidates = [];
    $info = updaterReadBuildInfo();
    if (!empty($info['appVersion']) && is_string($info['appVersion'])) {
        $candidates[] = updaterNormalizeVersion($info['appVersion']);
    }
    $pkgPath = UPDATER_ROOT . '/package.json';
    if (is_file($pkgPath)) {
        $raw = @file_get_contents($pkgPath);
        $pkg = $raw !== false ? json_decode($raw, true) : null;
        if (is_array($pkg) && !empty($pkg['version'])) {
            $candidates[] = updaterNormalizeVersion((string)$pkg['version']);
        }
    }
    $best = '0.0.0';
    foreach ($candidates as $v) {
        if (updaterCompareSemver($v, $best) > 0) {
            $best = $v;
        }
    }
    return $best;
}

function updaterWriteBuildInfo(array $patch): void {
    $info = updaterReadBuildInfo();
    foreach ($patch as $k => $v) {
        $info[$k] = $v;
    }
    if (empty($info['buildId'])) {
        $info['buildId'] = date('Ymd-His');
    }
    if (empty($info['builtAt'])) {
        $info['builtAt'] = date('Y-m-d H:i:s');
    }
    $json = json_encode($info, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    @file_put_contents(UPDATER_ROOT . '/BUILD_INFO.json', $json . "\n");
    $distDir = UPDATER_ROOT . '/dist';
    if (is_dir($distDir)) {
        @file_put_contents($distDir . '/BUILD_INFO.json', $json . "\n");
    }
}

function updaterDetectRepoFromGit(): ?string {
    if (!is_dir(UPDATER_ROOT . '/.git') || !updaterCommandExists('git')) {
        return null;
    }
    $r = updaterRunCommand('git remote get-url origin');
    if (!$r['ok'] || $r['stdout'] === '') {
        return null;
    }
    $url = trim($r['stdout']);
    // https://github.com/owner/repo.git or git@github.com:owner/repo.git
    if (preg_match('#github\.com[:/]([^/]+)/([^/\s]+?)(?:\.git)?$#i', $url, $m)) {
        return $m[1] . '/' . preg_replace('/\.git$/i', '', $m[2]);
    }
    return null;
}

function updaterRepoSlug(): string {
    $repo = trim((string)getSetting('updater_repo', ''));
    if ($repo === '') {
        $detected = updaterDetectRepoFromGit();
        $repo = $detected ?: 'zafrullakhan001/linknest';
    }
    if (!preg_match('#^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$#', $repo)) {
        return 'zafrullakhan001/linknest';
    }
    return $repo;
}

function updaterCheckIntervalMinutes(): int {
    $raw = getSetting('updater_check_interval_minutes', '360');
    $n = (int)$raw;
    if ($n < 5) {
        $n = 5;
    }
    if ($n > 10080) {
        $n = 10080;
    }
    return $n;
}

function updaterGithubToken(): string {
    $token = (string)getSetting('updater_github_token', '');
    if ($token === '') {
        $env = getenv('GITHUB_TOKEN') ?: getenv('GH_TOKEN') ?: '';
        return is_string($env) ? trim($env) : '';
    }
    if (function_exists('isLikelyEncryptedPassword') && isLikelyEncryptedPassword($token)) {
        try {
            return decryptPassword($token);
        } catch (Throwable $e) {
            error_log('updater: failed to decrypt github token: ' . $e->getMessage());
            return '';
        }
    }
    return $token;
}

function updaterHasGithubToken(): bool {
    return updaterGithubToken() !== '';
}

function updaterTrackBranch(): string {
    $branch = trim((string)getSetting('updater_track_branch', 'main'));
    if ($branch === '' || !preg_match('/^[A-Za-z0-9._\/-]+$/', $branch)) {
        return 'main';
    }
    return $branch;
}

/**
 * True when gitCommit looks like a real git SHA (not a tag like v2.3.6).
 */
function updaterLooksLikeGitSha(string $value): bool {
    $raw = trim($value);
    return (bool)preg_match('/^[a-f0-9]{7,40}$/i', $raw);
}

function updaterIsZipInstall(array $info): bool {
    $via = strtolower(trim((string)($info['updatedVia'] ?? '')));
    return in_array($via, ['zip', 'package-for-deployment.ps1'], true)
        || (!empty($info['releaseTag']) && !is_dir(UPDATER_ROOT . '/.git'));
}

function updaterNormalizeReleaseTag(string $value): ?string {
    $v = trim($value);
    if ($v === '' || !preg_match('/^v?\d+\.\d+\.\d+/i', $v)) {
        return null;
    }
    return str_starts_with(strtolower($v), 'v') ? $v : ('v' . $v);
}

/**
 * Applied Release tag (BUILD_INFO.releaseTag, else v{appVersion}).
 */
function updaterInstalledReleaseTag(): ?string {
    $info = updaterReadBuildInfo();
    $fromField = updaterNormalizeReleaseTag((string)($info['releaseTag'] ?? ''));
    if ($fromField) {
        return $fromField;
    }
    $ver = updaterInstalledVersion();
    if ($ver !== '' && $ver !== '0.0.0') {
        return updaterNormalizeReleaseTag($ver);
    }
    return null;
}

/**
 * Installed commit SHA.
 * Git checkouts: HEAD is the source of truth (BUILD_INFO.json in the repo is often stale).
 * Zip installs: BUILD_INFO only — leftover .git HEAD stays on the pre-release commit.
 */
function updaterInstalledCommit(): ?string {
    $info = updaterReadBuildInfo();
    $zipInstall = updaterIsZipInstall($info);
    $caps = updaterCapabilities();

    if (!$zipInstall && $caps['gitAvailable']) {
        $r = updaterRunCommand('git rev-parse HEAD');
        if ($r['ok'] && updaterLooksLikeGitSha($r['stdout'])) {
            return strtolower($r['stdout']);
        }
    }

    if (!empty($info['gitCommit']) && is_string($info['gitCommit']) && updaterLooksLikeGitSha($info['gitCommit'])) {
        return strtolower(trim($info['gitCommit']));
    }
    if ($zipInstall) {
        return null;
    }
    if ($caps['gitAvailable']) {
        $r = updaterRunCommand('git rev-parse HEAD');
        if ($r['ok'] && updaterLooksLikeGitSha($r['stdout'])) {
            return strtolower($r['stdout']);
        }
    }
    return null;
}

/**
 * GitHub compare base: real SHA, or the applied Release tag (vX.Y.Z).
 */
function updaterInstalledBaseRef(): ?string {
    $sha = updaterInstalledCommit();
    if ($sha) {
        return $sha;
    }
    return updaterInstalledReleaseTag();
}

function updaterShaPrefixMatch(string $a, string $b): bool {
    $a = strtolower(preg_replace('/[^a-f0-9]/i', '', $a) ?? '');
    $b = strtolower(preg_replace('/[^a-f0-9]/i', '', $b) ?? '');
    if ($a === '' || $b === '') {
        return false;
    }
    $n = min(strlen($a), strlen($b), 40);
    if ($n < 7) {
        return false;
    }
    return substr($a, 0, $n) === substr($b, 0, $n);
}

/**
 * Resolve a tag / branch / SHA to a 40-char commit via GitHub.
 */
function updaterResolveRefCommitSha(string $ref): ?string {
    $ref = trim($ref);
    if ($ref === '') {
        return null;
    }
    if (updaterLooksLikeGitSha($ref) && strlen($ref) >= 40) {
        return strtolower($ref);
    }
    try {
        $repo = updaterRepoSlug();
        $payload = updaterHttpJson('https://api.github.com/repos/' . $repo . '/commits/' . rawurlencode($ref));
        $sha = (string)($payload['sha'] ?? '');
        if (updaterLooksLikeGitSha($sha)) {
            return strtolower($sha);
        }
    } catch (Throwable $e) {
        error_log('updater resolve ref sha failed: ' . $e->getMessage());
    }
    return null;
}

function updaterReadHistory(): array {
    if (!is_file(UPDATER_HISTORY_FILE)) {
        return [];
    }
    $raw = @file_get_contents(UPDATER_HISTORY_FILE);
    $data = $raw !== false ? json_decode($raw, true) : null;
    return (is_array($data) && isset($data['entries']) && is_array($data['entries']))
        ? $data['entries']
        : [];
}

function updaterWriteHistory(array $entries): void {
    if (!is_dir(dirname(UPDATER_HISTORY_FILE))) {
        @mkdir(dirname(UPDATER_HISTORY_FILE), 0755, true);
    }
    if (count($entries) > UPDATER_HISTORY_MAX) {
        $entries = array_slice($entries, -UPDATER_HISTORY_MAX);
    }
    @file_put_contents(UPDATER_HISTORY_FILE, json_encode([
        'updatedAt' => time(),
        'entries' => array_values($entries),
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

function updaterNewHistoryId(): string {
    try {
        return 'upd_' . bin2hex(random_bytes(8));
    } catch (Throwable $e) {
        return 'upd_' . dechex(time()) . substr(md5(uniqid('', true)), 0, 8);
    }
}

/**
 * Snapshot current install before applying a change (for rollback).
 * @param array|null $extra optional fields: dbSnapshotId, dbBytes, filesChanged, approxBytes
 * @return array the entry that was stored (or the existing consecutive duplicate)
 */
function updaterPushHistorySnapshot(string $label = '', ?array $extra = null): array {
    $info = updaterReadBuildInfo();
    $commit = updaterInstalledCommit();
    $entry = [
        'id' => updaterNewHistoryId(),
        'capturedAt' => time(),
        'label' => $label !== '' ? $label : ('Before update @ ' . date('Y-m-d H:i:s')),
        'gitCommit' => $commit,
        'appVersion' => updaterInstalledVersion(),
        'releaseTag' => $info['releaseTag'] ?? null,
        'message' => $info['commitMessage'] ?? null,
        'dbSnapshotId' => null,
        'dbBytes' => null,
        'filesChanged' => null,
        'approxBytes' => null,
    ];
    if (is_array($extra)) {
        foreach (['dbSnapshotId', 'dbBytes', 'filesChanged', 'approxBytes'] as $k) {
            if (array_key_exists($k, $extra)) {
                $entry[$k] = $extra[$k];
            }
        }
    }
    $entries = updaterReadHistory();
    $last = $entries[count($entries) - 1] ?? null;
    // Same SHA, no new DB snapshot → skip duplicate
    if (
        is_array($last)
        && !empty($last['gitCommit'])
        && $last['gitCommit'] === $commit
        && empty($entry['dbSnapshotId'])
    ) {
        return $last;
    }
    $entries[] = $entry;
    updaterWriteHistory($entries);
    updaterPruneSnapshots(UPDATER_HISTORY_MAX);
    return $entry;
}

function updaterHistoryPeek(): ?array {
    $entries = updaterReadHistory();
    if (empty($entries)) {
        return null;
    }
    return $entries[count($entries) - 1];
}

function updaterHistoryFindById(string $id): ?array {
    $id = trim($id);
    if ($id === '') {
        return null;
    }
    foreach (updaterReadHistory() as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        if (($entry['id'] ?? '') === $id) {
            return $entry;
        }
        // Legacy entries without id: allow matching capturedAt-based synthetic key
        if (empty($entry['id']) && isset($entry['capturedAt']) && ('legacy_' . $entry['capturedAt']) === $id) {
            return $entry;
        }
    }
    return null;
}

/** @deprecated Prefer updaterHistoryFindById — kept for older CLI */
function updaterHistoryPop(): ?array {
    $entries = updaterReadHistory();
    if (empty($entries)) {
        return null;
    }
    $last = array_pop($entries);
    updaterWriteHistory($entries);
    return is_array($last) ? $last : null;
}

/** Enrich history for UI (newest first). */
function updaterHistoryForApi(): array {
    $out = [];
    foreach (array_reverse(updaterReadHistory()) as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        if (empty($entry['id'])) {
            $entry['id'] = 'legacy_' . (string)($entry['capturedAt'] ?? 0);
        }
        $snapId = $entry['dbSnapshotId'] ?? null;
        $entry['hasDbBackup'] = is_string($snapId) && $snapId !== '' && updaterDbSnapshotExists($snapId);
        $entry['capturedAtIso'] = !empty($entry['capturedAt'])
            ? date('c', (int)$entry['capturedAt'])
            : null;
        $out[] = $entry;
    }
    return $out;
}

/**
 * Map GitHub HTTP errors to actionable admin guidance.
 */
function updaterFormatGithubHttpError(int $status, string $body, string $repo): string {
    $apiMessage = '';
    $decoded = json_decode($body, true);
    if (is_array($decoded) && !empty($decoded['message'])) {
        $apiMessage = (string)$decoded['message'];
    }

    if ($status === 404) {
        if (!updaterHasGithubToken()) {
            return 'GitHub returned 404 for repo "' . $repo . '". '
                . 'Private repositories require a Personal Access Token (classic) with the "repo" scope. '
                . 'Paste the token under Updater settings below, Save, then Check again. '
                . 'If the repo is public, confirm the owner/name is correct.';
        }
        return 'GitHub returned 404 for repo "' . $repo . '". '
            . 'Check that updater_repo is correct and the token can access this repository '
            . '(fine-grained: Contents + Metadata read; classic: repo scope).';
    }
    if ($status === 401) {
        return 'GitHub authentication failed (401). The saved token is invalid or expired — generate a new PAT and save it again.';
    }
    if ($status === 403) {
        return 'GitHub access denied (403) for "' . $repo . '". '
            . ($apiMessage !== '' ? $apiMessage . ' ' : '')
            . 'Ensure the token has permission to read releases, or wait if you hit a rate limit.';
    }

    $msg = 'GitHub API HTTP ' . $status;
    if ($apiMessage !== '') {
        $msg .= ': ' . $apiMessage;
    }
    return $msg;
}

function updaterIsDockerRuntime(): bool {
    if (getenv('LINKNEST_DOCKER') === '1' || getenv('SSH_GATEWAY_DOCKER') === '1') {
        return true;
    }
    $server = $_SERVER['LINKNEST_DOCKER'] ?? $_SERVER['SSH_GATEWAY_DOCKER'] ?? '';
    if ((string)$server === '1') {
        return true;
    }
    if (@is_file('/.dockerenv')) {
        return true;
    }
    $identity = UPDATER_ROOT . '/data/install_identity.php';
    if (is_file($identity)) {
        $raw = (string)@file_get_contents($identity);
        if (preg_match("/define\\('LINKNEST_INSTALL_FOLDER',\\s*'docker'\\)/", $raw)) {
            return true;
        }
    }
    if (is_readable('/proc/1/cgroup')) {
        $cgroup = (string)@file_get_contents('/proc/1/cgroup');
        if ($cgroup !== '' && (
            stripos($cgroup, 'docker') !== false
            || stripos($cgroup, 'containerd') !== false
            || stripos($cgroup, 'kubepods') !== false
        )) {
            return true;
        }
    }
    return false;
}

function updaterCommandExists(string $cmd): bool {
    $isWin = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
    $check = $isWin ? 'where ' . escapeshellarg($cmd) : 'command -v ' . escapeshellarg($cmd);
    $out = [];
    $code = 1;
    @exec($check . ' 2>&1', $out, $code);
    return $code === 0;
}

function updaterCapabilities(): array {
    $hasGitDir = is_dir(UPDATER_ROOT . '/.git');
    $gitAvailable = $hasGitDir && updaterCommandExists('git');
    $nodeAvailable = updaterCommandExists('node') && updaterCommandExists('npm');
    $zipAvailable = class_exists('ZipArchive') && function_exists('curl_init');
    $mode = $gitAvailable ? 'git' : 'zip';
    return [
        'gitAvailable' => $gitAvailable,
        'nodeAvailable' => $nodeAvailable,
        'zipAvailable' => $zipAvailable,
        'dockerRuntime' => updaterIsDockerRuntime(),
        'mode' => $mode,
        'projectRoot' => UPDATER_ROOT,
    ];
}

function updaterIsWindows(): bool {
    return strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
}

function updaterAugmentGitCommand(string $command): string {
    if (!preg_match('/^\s*git(\s|$)/i', $command)) {
        return $command;
    }
    $safe = escapeshellarg(str_replace('\\', '/', UPDATER_ROOT));
    $inject = ' -c safe.directory=' . $safe . ' -c safe.directory=*';
    $token = updaterGithubToken();
    if ($token !== '') {
        $basic = base64_encode('x-access-token:' . $token);
        $inject .= ' -c credential.helper=';
        $inject .= ' -c http.extraHeader=' . escapeshellarg('Authorization: Basic ' . $basic);
    }
    return preg_replace('/^\s*git\b/i', 'git' . $inject, $command, 1);
}

/**
 * On Windows, npm/npx are .cmd shims — run via cmd.exe so proc_open gets a real exit code.
 */
function updaterAugmentShellCommand(string $command): string {
    $command = updaterAugmentGitCommand($command);
    if (!updaterIsWindows()) {
        return $command;
    }
    if (preg_match('/^\s*cmd(\.exe)?\s/i', $command)) {
        return $command;
    }
    if (preg_match('/^\s*(npm|npx|node)(\s|$)/i', $command)) {
        return 'cmd /c ' . $command;
    }
    return $command;
}

/**
 * @param int $timeoutSec 0 = no timeout
 * @param array<string, string> $extraEnv extra environment variables for the child process
 */
function updaterRunCommand(string $command, ?string $cwd = null, int $timeoutSec = 180, array $extraEnv = []): array {
    $cwd = $cwd ?: UPDATER_ROOT;
    $command = updaterAugmentShellCommand($command);

    $descriptor = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];

    $env = null;
    if (updaterIsWindows()) {
        $env = [];
        foreach ($_SERVER as $k => $v) {
            if (is_string($k) && is_string($v) && preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $k)) {
                $env[$k] = $v;
            }
        }
        foreach (['Path', 'PATHEXT', 'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'HOME'] as $keep) {
            $val = getenv($keep);
            if (is_string($val) && $val !== '') {
                $env[$keep] = $val;
            }
        }
        $env['GIT_TERMINAL_PROMPT'] = '0';
        $env['GCM_INTERACTIVE'] = 'never';
        $env['GIT_ASKPASS'] = '';
    } else {
        $env = [];
        if (is_array($_ENV)) {
            foreach ($_ENV as $k => $v) {
                if (is_string($k) && is_string($v) && preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $k)) {
                    $env[$k] = $v;
                }
            }
        }
        foreach (['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'TMPDIR', 'TZ'] as $keep) {
            $val = getenv($keep);
            if (is_string($val) && $val !== '' && !isset($env[$keep])) {
                $env[$keep] = $val;
            }
        }
        if (empty($env['PATH'])) {
            $env['PATH'] = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
        } elseif (strpos($env['PATH'], '/usr/local/bin') === false) {
            $env['PATH'] = '/usr/local/bin:' . $env['PATH'];
        }
        if (empty($env['HOME'])) {
            $env['HOME'] = updaterIsDockerRuntime() ? '/var/www' : '/tmp';
        }
        $env['GIT_TERMINAL_PROMPT'] = '0';
        $env['GIT_ASKPASS'] = '';
    }

    foreach ($extraEnv as $k => $v) {
        if (is_string($k) && preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $k)) {
            $env[$k] = (string)$v;
        }
    }

    $proc = @proc_open($command, $descriptor, $pipes, $cwd, $env);
    if (!is_resource($proc)) {
        return ['ok' => false, 'code' => 1, 'stdout' => '', 'stderr' => 'Failed to start process'];
    }
    fclose($pipes[0]);
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);

    $stdout = '';
    $stderr = '';
    $start = time();
    $timedOut = false;
    // PHP only reports exitcode once via proc_get_status(); later calls / proc_close()
    // often return -1 even when the process succeeded (common on Windows).
    $statusExitCode = null;
    while (true) {
        $status = proc_get_status($proc);
        $chunkOut = stream_get_contents($pipes[1]);
        $chunkErr = stream_get_contents($pipes[2]);
        if (is_string($chunkOut) && $chunkOut !== '') {
            $stdout .= $chunkOut;
        }
        if (is_string($chunkErr) && $chunkErr !== '') {
            $stderr .= $chunkErr;
        }
        if (!$status['running']) {
            if (array_key_exists('exitcode', $status) && is_int($status['exitcode']) && $status['exitcode'] >= 0) {
                $statusExitCode = $status['exitcode'];
            }
            break;
        }
        if ($timeoutSec > 0 && (time() - $start) >= $timeoutSec) {
            $timedOut = true;
            @proc_terminate($proc, 9);
            usleep(200000);
            break;
        }
        usleep(100000);
    }
    $chunkOut = stream_get_contents($pipes[1]);
    $chunkErr = stream_get_contents($pipes[2]);
    if (is_string($chunkOut) && $chunkOut !== '') {
        $stdout .= $chunkOut;
    }
    if (is_string($chunkErr) && $chunkErr !== '') {
        $stderr .= $chunkErr;
    }
    fclose($pipes[1]);
    fclose($pipes[2]);
    $closeCode = proc_close($proc);
    $code = $statusExitCode !== null ? $statusExitCode : (int)$closeCode;

    if ($timedOut) {
        return [
            'ok' => false,
            'code' => 124,
            'stdout' => trim($stdout),
            'stderr' => trim($stderr . "\nCommand timed out after {$timeoutSec}s"),
        ];
    }
    return [
        'ok' => $code === 0,
        'code' => $code,
        'stdout' => trim($stdout),
        'stderr' => trim($stderr),
    ];
}

function updaterEnsureGitSafeDirectory(): void {
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;
    $safe = str_replace('\\', '/', UPDATER_ROOT);
    updaterRunCommand('git config --global --add safe.directory ' . escapeshellarg($safe), null, 15);
}

function updaterHttpJson(string $url, bool $forceDownload = false): array {
    $token = updaterGithubToken();
    $ch = curl_init($url);
    $headers = [
        'Accept: application/vnd.github+json',
        'User-Agent: LinkNest-Updater',
        'X-GitHub-Api-Version: 2022-11-28',
    ];
    if ($token !== '') {
        $headers[] = 'Authorization: Bearer ' . $token;
    }
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => $forceDownload ? 600 : 30,
        CURLOPT_HTTPHEADER => $headers,
        // XAMPP Windows often lacks a CA bundle; match other outbound HTTPS in this app
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
    ]);
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    if ($body === false) {
        throw new RuntimeException('GitHub request failed: ' . ($err ?: 'unknown error'));
    }
    if ($status < 200 || $status >= 300) {
        $repo = updaterRepoSlug();
        throw new RuntimeException(updaterFormatGithubHttpError($status, is_string($body) ? $body : '', $repo));
    }
    $decoded = json_decode($body, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Invalid JSON from GitHub');
    }
    return $decoded;
}

function updaterDownloadFile(string $url, string $destPath): void {
    $dir = dirname($destPath);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $token = updaterGithubToken();
    $ch = curl_init($url);
    $headers = [
        'Accept: application/octet-stream',
        'User-Agent: LinkNest-Updater',
        'X-GitHub-Api-Version: 2022-11-28',
    ];
    if ($token !== '') {
        $headers[] = 'Authorization: Bearer ' . $token;
    }
    $fp = fopen($destPath, 'wb');
    if ($fp === false) {
        throw new RuntimeException('Cannot write download to ' . $destPath);
    }
    curl_setopt_array($ch, [
        CURLOPT_FILE => $fp,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 600,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
    ]);
    $ok = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    fclose($fp);
    if ($ok === false || $status < 200 || $status >= 300) {
        @unlink($destPath);
        throw new RuntimeException('Download failed (HTTP ' . $status . '): ' . ($err ?: 'unknown'));
    }
}

/**
 * Fetch / cache GitHub releases list.
 * @return array{fetchedAt:int, releases:list<array>}
 */
function updaterFetchReleases(bool $force = false): array {
    $ttl = updaterCheckIntervalMinutes() * 60;
    if (!$force && is_file(UPDATER_CACHE_FILE)) {
        $raw = @file_get_contents(UPDATER_CACHE_FILE);
        $cache = $raw !== false ? json_decode($raw, true) : null;
        if (is_array($cache) && isset($cache['fetchedAt'], $cache['releases']) && (time() - (int)$cache['fetchedAt']) < $ttl) {
            return $cache;
        }
    }

    $repo = updaterRepoSlug();
    $url = 'https://api.github.com/repos/' . $repo . '/releases?per_page=30';
    $payload = updaterHttpJson($url);
    $releases = [];
    foreach ($payload as $rel) {
        if (!is_array($rel)) {
            continue;
        }
        if (!empty($rel['draft']) || !empty($rel['prerelease'])) {
            continue;
        }
        $tag = (string)($rel['tag_name'] ?? '');
        if ($tag === '' || !preg_match('/^v?\d+\.\d+\.\d+/i', $tag)) {
            continue;
        }
        $assetName = null;
        $assetUrl = null;
        $assetId = null;
        $assets = $rel['assets'] ?? [];
        if (is_array($assets)) {
            foreach ($assets as $asset) {
                if (!is_array($asset)) {
                    continue;
                }
                $name = (string)($asset['name'] ?? '');
                if (preg_match('/^linknest-update-v?\d+\.\d+\.\d+.*\.zip$/i', $name)
                    || preg_match('/^linknest-update-.*\.zip$/i', $name)) {
                    $assetName = $name;
                    $assetUrl = (string)($asset['browser_download_url'] ?? '');
                    $assetId = isset($asset['id']) ? (int)$asset['id'] : null;
                    break;
                }
            }
        }
        $releases[] = [
            'tag' => $tag,
            'version' => updaterTagToVersion($tag),
            'name' => (string)($rel['name'] ?? $tag),
            'body' => (string)($rel['body'] ?? ''),
            'publishedAt' => (string)($rel['published_at'] ?? ''),
            'htmlUrl' => (string)($rel['html_url'] ?? ''),
            'assetName' => $assetName,
            'assetUrl' => $assetUrl,
            'assetId' => $assetId,
        ];
    }

    usort($releases, static function ($a, $b) {
        return updaterCompareSemver($b['version'], $a['version']);
    });

    $cache = [
        'fetchedAt' => time(),
        'repo' => $repo,
        'releases' => $releases,
    ];
    if (!is_dir(dirname(UPDATER_CACHE_FILE))) {
        @mkdir(dirname(UPDATER_CACHE_FILE), 0755, true);
    }
    @file_put_contents(UPDATER_CACHE_FILE, json_encode($cache, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    return $cache;
}

function updaterNewerReleases(array $releases, string $currentVersion): array {
    $out = [];
    foreach ($releases as $rel) {
        if (updaterCompareSemver($rel['version'], $currentVersion) > 0) {
            $out[] = $rel;
        }
    }
    return $out;
}

function updaterFindReleaseByTag(array $releases, string $tag): ?array {
    $want = updaterNormalizeVersion($tag);
    foreach ($releases as $rel) {
        if (updaterNormalizeVersion($rel['tag']) === $want || updaterNormalizeVersion($rel['version']) === $want) {
            return $rel;
        }
    }
    return null;
}

/**
 * Commits on track branch that are ahead of the installed SHA.
 * @return array{fetchedAt:int,branch:string,base:string|null,aheadBy:int,commits:list<array>}
 */
/**
 * Parse `git log` lines into commit update rows.
 * @return list<array{sha:string,shortSha:string,message:string,body:string,author:string,date:string,htmlUrl:string,kind:string,localOnly?:bool}>
 */
function updaterParseGitLogCommits(string $range, int $max = 30): array {
    $cmd = 'git log --format=%H%x1f%s%x1f%an%x1f%aI --max-count=' . (int)$max . ' ' . escapeshellarg($range);
    $r = updaterRunCommand($cmd, null, 60);
    if (!$r['ok'] || $r['stdout'] === '') {
        return [];
    }
    $out = [];
    foreach (preg_split('/\r\n|\n|\r/', $r['stdout']) as $line) {
        $line = trim($line);
        if ($line === '') {
            continue;
        }
        $parts = explode("\x1f", $line);
        if (count($parts) < 2) {
            continue;
        }
        $sha = trim($parts[0]);
        if (!preg_match('/^[a-f0-9]{7,40}$/i', $sha)) {
            continue;
        }
        $out[] = [
            'sha' => $sha,
            'shortSha' => substr($sha, 0, 7),
            'message' => trim($parts[1] ?? ''),
            'body' => trim($parts[1] ?? ''),
            'author' => trim($parts[2] ?? ''),
            'date' => trim($parts[3] ?? ''),
            'htmlUrl' => '',
            'kind' => 'commit',
            'localOnly' => false,
        ];
    }
    return $out;
}

function updaterMergeCommitLists(array ...$lists): array {
    $bySha = [];
    foreach ($lists as $list) {
        foreach ($list as $c) {
            if (!is_array($c) || empty($c['sha'])) {
                continue;
            }
            $key = strtolower((string)$c['sha']);
            if (!isset($bySha[$key])) {
                $bySha[$key] = $c;
            } else {
                // Prefer remote (localOnly false) over local-only
                if (!empty($bySha[$key]['localOnly']) && empty($c['localOnly'])) {
                    $bySha[$key] = $c;
                } elseif (empty($bySha[$key]['localOnly']) && !empty($c['localOnly'])) {
                    $bySha[$key]['localOnly'] = false;
                }
            }
        }
    }
    return array_values($bySha);
}

/**
 * @return array<string, mixed>|null GitHub compare JSON
 */
function updaterGithubCompare(string $base, string $head): ?array {
    $base = trim($base);
    $head = trim($head);
    if ($base === '' || $head === '') {
        return null;
    }
    try {
        $repo = updaterRepoSlug();
        $url = 'https://api.github.com/repos/' . $repo . '/compare/'
            . rawurlencode($base) . '...' . rawurlencode($head);
        $payload = updaterHttpJson($url);
        return is_array($payload) ? $payload : null;
    } catch (Throwable $e) {
        error_log('updater compare failed (' . $base . '...' . $head . '): ' . $e->getMessage());
        return null;
    }
}

/**
 * @param array<string, mixed> $payload
 * @return list<array{sha:string,shortSha:string,message:string,body:string,author:string,date:string,htmlUrl:string,kind:string,localOnly:bool}>
 */
function updaterMapGithubCompareCommits(array $payload): array {
    $out = [];
    if (empty($payload['commits']) || !is_array($payload['commits'])) {
        return $out;
    }
    $list = array_reverse($payload['commits']);
    foreach ($list as $c) {
        if (!is_array($c)) {
            continue;
        }
        $sha = (string)($c['sha'] ?? '');
        if ($sha === '') {
            continue;
        }
        $msg = (string)($c['commit']['message'] ?? '');
        $subject = trim(explode("\n", $msg)[0]);
        $out[] = [
            'sha' => $sha,
            'shortSha' => substr($sha, 0, 7),
            'message' => $subject,
            'body' => $msg,
            'author' => (string)($c['commit']['author']['name'] ?? $c['author']['login'] ?? ''),
            'date' => (string)($c['commit']['author']['date'] ?? ''),
            'htmlUrl' => (string)($c['html_url'] ?? ''),
            'kind' => 'commit',
            'localOnly' => false,
        ];
    }
    return $out;
}

function updaterCompareLooksStale(?array $payload): bool {
    if (!is_array($payload)) {
        return true;
    }
    $status = strtolower((string)($payload['status'] ?? ''));
    if ($status === 'diverged') {
        return true;
    }
    return (int)($payload['ahead_by'] ?? 0) >= UPDATER_STALE_BASE_AHEAD;
}

function updaterFetchCommitsAhead(bool $force = false): array {
    $ttl = updaterCheckIntervalMinutes() * 60;
    $branch = updaterTrackBranch();
    $shaBase = updaterInstalledCommit();
    $tagBase = updaterInstalledReleaseTag();
    $base = $shaBase ?: $tagBase;

    if (!$force && is_file(UPDATER_COMMITS_CACHE_FILE)) {
        $raw = @file_get_contents(UPDATER_COMMITS_CACHE_FILE);
        $cache = $raw !== false ? json_decode($raw, true) : null;
        if (
            is_array($cache)
            && isset($cache['fetchedAt'], $cache['commits'])
            && ($cache['branch'] ?? '') === $branch
            && ($cache['shaBase'] ?? null) === $shaBase
            && ($cache['tagBase'] ?? null) === $tagBase
            && (time() - (int)$cache['fetchedAt']) < $ttl
        ) {
            return $cache;
        }
    }

    $repo = updaterRepoSlug();
    $remoteCommits = [];
    $localCommits = [];
    $aheadBy = 0;
    $headSha = null;
    $hint = null;
    $caps = updaterCapabilities();

    // Always refresh origin tip when local git is available (helps after recent pushes).
    if ($caps['gitAvailable']) {
        updaterEnsureGitSafeDirectory();
        updaterRunCommand('git fetch origin ' . escapeshellarg($branch) . ' --prune', null, 120);
        if ($tagBase) {
            updaterRunCommand('git fetch origin --tags --force', null, 60);
        }
    }

    $compareOk = false;
    $payload = null;
    if ($base) {
        $payload = updaterGithubCompare($base, $branch);
        if (!$payload && $tagBase && strtolower((string)$base) !== strtolower($tagBase)) {
            $payload = updaterGithubCompare($tagBase, $branch);
            if ($payload) {
                $base = $tagBase;
            }
        }
        // Zipballs stamp a stale SHA from BUILD_INFO.json in git. If that SHA
        // is not the applied Release, compare returns the whole branch history.
        if (
            $payload
            && $tagBase
            && $shaBase
            && strtolower((string)$base) !== strtolower($tagBase)
            && updaterCompareLooksStale($payload)
        ) {
            $viaTag = updaterGithubCompare($tagBase, $branch);
            if (is_array($viaTag)) {
                $shaAhead = (int)($payload['ahead_by'] ?? 0);
                $tagAhead = (int)($viaTag['ahead_by'] ?? 0);
                $tagStatus = strtolower((string)($viaTag['status'] ?? ''));
                if ($tagStatus !== 'diverged' && $tagAhead < $shaAhead) {
                    $payload = $viaTag;
                    $base = $tagBase;
                }
            }
        }
        if (is_array($payload)) {
            $compareOk = true;
            $aheadBy = (int)($payload['ahead_by'] ?? 0);
            $remoteCommits = updaterMapGithubCompareCommits($payload);
            if ($shaBase) {
                $remoteCommits = array_values(array_filter(
                    $remoteCommits,
                    static function ($c) use ($shaBase) {
                        return empty($c['sha']) || !updaterShaPrefixMatch((string)$c['sha'], $shaBase);
                    }
                ));
            }
            if (!empty($remoteCommits)) {
                $headSha = $remoteCommits[0]['sha'];
            }
        }
    }

    // Only list the branch tip when we have no installed baseline at all.
    // Do not do this when compare already succeeded (ahead_by=0 means up to date).
    if (!$compareOk && $base === null) {
        try {
            $url = 'https://api.github.com/repos/' . $repo . '/commits?sha='
                . rawurlencode($branch) . '&per_page=30';
            $payload = updaterHttpJson($url);
            foreach ($payload as $c) {
                if (!is_array($c)) {
                    continue;
                }
                $sha = (string)($c['sha'] ?? '');
                if ($sha === '') {
                    continue;
                }
                if ($base && str_starts_with(strtolower($sha), substr(strtolower($base), 0, 7))) {
                    break;
                }
                $msg = (string)($c['commit']['message'] ?? '');
                $subject = trim(explode("\n", $msg)[0]);
                $remoteCommits[] = [
                    'sha' => $sha,
                    'shortSha' => substr($sha, 0, 7),
                    'message' => $subject,
                    'body' => $msg,
                    'author' => (string)($c['commit']['author']['name'] ?? $c['author']['login'] ?? ''),
                    'date' => (string)($c['commit']['author']['date'] ?? ''),
                    'htmlUrl' => (string)($c['html_url'] ?? ''),
                    'kind' => 'commit',
                    'localOnly' => false,
                ];
            }
            if ($base && !empty($remoteCommits)
                && str_starts_with(strtolower($remoteCommits[0]['sha']), substr(strtolower($base), 0, 7))) {
                $remoteCommits = [];
            }
            $aheadBy = count($remoteCommits);
            $headSha = $remoteCommits[0]['sha'] ?? null;
        } catch (Throwable $e) {
            error_log('updater commits list failed: ' . $e->getMessage());
        }
    }

    // Local/git mode: also surface commits present on this machine but not yet on origin/<branch>.
    if ($caps['gitAvailable'] && $base) {
        $originTip = 'origin/' . $branch;
        $fromOrigin = updaterParseGitLogCommits($base . '..' . $originTip, 30);
        foreach ($fromOrigin as &$c) {
            $c['localOnly'] = false;
        }
        unset($c);

        $fromHead = updaterParseGitLogCommits($base . '..HEAD', 30);
        $remoteShaSet = [];
        foreach (array_merge($remoteCommits, $fromOrigin) as $c) {
            $remoteShaSet[strtolower((string)($c['sha'] ?? ''))] = true;
        }
        foreach ($fromHead as &$c) {
            $key = strtolower((string)$c['sha']);
            $c['localOnly'] = empty($remoteShaSet[$key]);
        }
        unset($c);

        $localOnlyCount = 0;
        foreach ($fromHead as $c) {
            if (!empty($c['localOnly'])) {
                $localOnlyCount++;
                $localCommits[] = $c;
            }
        }
        $remoteCommits = updaterMergeCommitLists($remoteCommits, $fromOrigin);
        if ($localOnlyCount > 0) {
            $hint = $localOnlyCount . ' local commit(s) are not on origin/' . $branch
                . '. Push first (git push origin HEAD:' . $branch . ') or select a local commit to apply.';
        }
    }

    $commits = updaterMergeCommitLists($remoteCommits, $localCommits);
    // Newest first — git log is already newest-first; GitHub compare may differ
    usort($commits, static function ($a, $b) {
        $da = strtotime((string)($a['date'] ?? '')) ?: 0;
        $db = strtotime((string)($b['date'] ?? '')) ?: 0;
        if ($da !== $db) {
            return $db <=> $da;
        }
        return strcmp((string)($b['sha'] ?? ''), (string)($a['sha'] ?? ''));
    });

    // Zip apply used to record a stale SHA while commitMessage is the applied tip.
    // If HEAD's subject matches the installed message, this install is current.
    $installedMsg = trim(explode("\n", (string)(updaterReadBuildInfo()['commitMessage'] ?? ''))[0]);
    if ($installedMsg !== '' && !empty($commits)) {
        $tipSha = (string)($commits[0]['sha'] ?? '');
        $tipMsg = trim((string)($commits[0]['message'] ?? ''));
        if (
            $tipMsg !== ''
            && strcasecmp($installedMsg, $tipMsg) === 0
            && (!$shaBase || !updaterShaPrefixMatch($shaBase, $tipSha))
        ) {
            $commits = [];
        }
    }

    $aheadBy = count($commits);
    $headSha = $commits[0]['sha'] ?? $headSha;

    $localOnlyInMerge = 0;
    foreach ($commits as $c) {
        if (!empty($c['localOnly'])) {
            $localOnlyInMerge++;
        }
    }

    $cache = [
        'fetchedAt' => time(),
        'repo' => $repo,
        'branch' => $branch,
        'base' => $base,
        'shaBase' => $shaBase,
        'tagBase' => $tagBase,
        'aheadBy' => $aheadBy,
        'headSha' => $headSha,
        'commits' => $commits,
        'hint' => $hint,
        'localOnlyCount' => $localOnlyInMerge,
    ];
    if (!is_dir(dirname(UPDATER_COMMITS_CACHE_FILE))) {
        @mkdir(dirname(UPDATER_COMMITS_CACHE_FILE), 0755, true);
    }
    @file_put_contents(UPDATER_COMMITS_CACHE_FILE, json_encode($cache, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    return $cache;
}

function updaterFindCommitBySha(array $commits, string $sha): ?array {
    $want = strtolower(preg_replace('/[^a-f0-9]/i', '', $sha) ?? '');
    if ($want === '') {
        return null;
    }
    foreach ($commits as $c) {
        $have = strtolower((string)($c['sha'] ?? ''));
        if ($have === $want || str_starts_with($have, $want) || str_starts_with($want, substr($have, 0, 7))) {
            return $c;
        }
    }
    return null;
}

/**
 * Build apply target from tag or sha.
 * @return array{type:string,ref:string,version:string,message:?string,tag:?string,assetName:?string,assetUrl:?string,assetId:?int}
 */
function updaterResolveApplyTarget(?string $tag, ?string $sha): array {
    if ($sha !== null && $sha !== '') {
        $clean = preg_replace('/[^a-f0-9]/i', '', $sha);
        if (!is_string($clean) || strlen($clean) < 7) {
            throw new RuntimeException('Invalid commit SHA');
        }
        $cache = updaterFetchCommitsAhead(true);
        $commit = updaterFindCommitBySha($cache['commits'] ?? [], $clean);
        $message = $commit['message'] ?? null;
        $fullSha = $commit['sha'] ?? $clean;

        // Allow applying a local-only SHA even if GitHub has not seen it yet
        if ($commit === null && updaterCapabilities()['gitAvailable']) {
            $probe = updaterRunCommand('git cat-file -t ' . escapeshellarg($clean), null, 15);
            if ($probe['ok'] && trim($probe['stdout']) === 'commit') {
                $rev = updaterRunCommand('git rev-parse ' . escapeshellarg($clean), null, 15);
                $fullSha = ($rev['ok'] && preg_match('/^[a-f0-9]{7,40}$/i', $rev['stdout']))
                    ? $rev['stdout']
                    : $clean;
                $meta = updaterRunCommand('git log -1 --format=%s ' . escapeshellarg($fullSha), null, 15);
                $message = $meta['ok'] ? $meta['stdout'] : ('Commit ' . substr($fullSha, 0, 7));
            } else {
                throw new RuntimeException(
                    'Commit not found locally or on GitHub: ' . substr($clean, 0, 7)
                    . '. Push to origin/' . updaterTrackBranch() . ' first, or ensure the SHA exists in this git clone.'
                );
            }
        }

        return [
            'type' => 'sha',
            'ref' => $fullSha,
            'version' => updaterInstalledVersion(),
            'message' => $message ?? ('Commit ' . substr($fullSha, 0, 7)),
            'tag' => null,
            'assetName' => null,
            'assetUrl' => null,
            'assetId' => null,
        ];
    }

    $cache = updaterFetchReleases(true);
    $releases = $cache['releases'] ?? [];
    $current = updaterInstalledVersion();
    $newer = updaterNewerReleases($releases, $current);
    if ($tag !== null && $tag !== '') {
        $release = updaterFindReleaseByTag($releases, $tag);
        if (!$release) {
            throw new RuntimeException('Release tag not found: ' . $tag);
        }
    } else {
        if (empty($newer)) {
            // Fall back to latest commit on branch
            $cc = updaterFetchCommitsAhead(true);
            if (empty($cc['commits'][0])) {
                throw new RuntimeException('No newer releases or commits available');
            }
            return updaterResolveApplyTarget(null, $cc['commits'][0]['sha']);
        }
        $release = $newer[0];
    }

    return [
        'type' => 'tag',
        'ref' => $release['tag'],
        'version' => $release['version'],
        'message' => $release['name'] ?? $release['tag'],
        'tag' => $release['tag'],
        'assetName' => $release['assetName'] ?? null,
        'assetUrl' => $release['assetUrl'] ?? null,
        'assetId' => $release['assetId'] ?? null,
    ];
}

function updaterReadJob(): ?array {
    if (!is_file(UPDATER_JOB_FILE)) {
        return null;
    }
    $raw = @file_get_contents(UPDATER_JOB_FILE);
    $job = $raw !== false ? json_decode($raw, true) : null;
    return is_array($job) ? $job : null;
}

function updaterWriteJob(array $job): void {
    $job['updatedAt'] = time();
    if (!is_dir(dirname(UPDATER_JOB_FILE))) {
        @mkdir(dirname(UPDATER_JOB_FILE), 0755, true);
    }
    @file_put_contents(UPDATER_JOB_FILE, json_encode($job, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

function updaterAppendLog(string $line): void {
    $job = updaterReadJob() ?: [];
    $logs = isset($job['log']) && is_array($job['log']) ? $job['log'] : [];
    $logs[] = '[' . date('H:i:s') . '] ' . $line;
    if (count($logs) > 200) {
        $logs = array_slice($logs, -200);
    }
    $job['log'] = $logs;
    updaterWriteJob($job);
}

function updaterSetProgress(int $percent, ?string $message = null, ?string $status = null): void {
    $job = updaterReadJob() ?: [];
    $job['percent'] = max(0, min(100, $percent));
    if ($message !== null) {
        $job['message'] = $message;
        updaterAppendLog($message);
    }
    if ($status !== null) {
        $job['status'] = $status;
    }
    updaterWriteJob($job);
}

function updaterAcquireLock(): bool {
    if (is_file(UPDATER_LOCK_FILE)) {
        $raw = @file_get_contents(UPDATER_LOCK_FILE);
        $data = $raw !== false ? json_decode($raw, true) : null;
        $started = is_array($data) ? (int)($data['startedAt'] ?? 0) : 0;
        // Stale lock after 2 hours
        if ($started > 0 && (time() - $started) < 7200) {
            return false;
        }
    }
    if (!is_dir(dirname(UPDATER_LOCK_FILE))) {
        @mkdir(dirname(UPDATER_LOCK_FILE), 0755, true);
    }
    $ok = @file_put_contents(UPDATER_LOCK_FILE, json_encode([
        'startedAt' => time(),
        'pid' => getmypid(),
    ]), LOCK_EX);
    return $ok !== false;
}

function updaterReleaseLock(): void {
    if (is_file(UPDATER_LOCK_FILE)) {
        @unlink(UPDATER_LOCK_FILE);
    }
}

function updaterIsZipPathAllowed(string $entryName): bool {
    $name = str_replace('\\', '/', $entryName);
    $name = ltrim($name, '/');
    if ($name === '' || str_contains($name, '..')) {
        return false;
    }
    // Strip single root folder prefix if ZIP has linknest-.../ or GitHub zipball owner-repo-sha/
    $parts = explode('/', $name);
    if (count($parts) > 1 && (
        preg_match('/^linknest/i', $parts[0])
        || preg_match('/^[A-Za-z0-9_.-]+-[A-Za-z0-9_.-]+-[a-f0-9]{7,40}$/i', $parts[0])
    )) {
        $name = implode('/', array_slice($parts, 1));
    }
    if ($name === '' || str_starts_with($name, 'data/') || str_starts_with($name, 'uploads/')) {
        return false;
    }
    $base = basename($name);
    if (preg_match('/^\.env/i', $base)) {
        return false;
    }
    // Bytecode and caches must never be extracted — Docker workers often
    // recreate __pycache__ as root, and www-data cannot overwrite those files.
    if (preg_match('/\.(pyc|pyo|pyd)$/i', $base)) {
        return false;
    }
    foreach (explode('/', $name) as $part) {
        if ($part === '__pycache__' || $part === '.pytest_cache' || $part === '.mypy_cache') {
            return false;
        }
    }
    if (in_array($name, UPDATER_ZIP_ALLOW_ROOT_FILES, true)) {
        return true;
    }
    foreach (UPDATER_ZIP_ALLOW_PREFIXES as $prefix) {
        if (str_starts_with($name, $prefix)) {
            return true;
        }
    }
    // Allow other root-level files that look safe (no dirs outside allowlist)
    if (!str_contains($name, '/') && preg_match('/^[A-Za-z0-9._-]+$/', $name)) {
        return true;
    }
    return false;
}

function updaterResolveExtractRelative(string $entryName): ?string {
    $name = str_replace('\\', '/', $entryName);
    $name = ltrim($name, '/');
    if ($name === '' || str_contains($name, '..')) {
        return null;
    }
    $parts = explode('/', $name);
    if (count($parts) > 1 && (
        preg_match('/^linknest/i', $parts[0])
        || preg_match('/^[A-Za-z0-9_.-]+-[A-Za-z0-9_.-]+-[a-f0-9]{7,40}$/i', $parts[0])
    )) {
        $name = implode('/', array_slice($parts, 1));
    }
    if ($name === '' || !updaterIsZipPathAllowed($entryName)) {
        return null;
    }
    return $name;
}

function updaterExtractUpdateZip(string $zipPath): void {
    if (!class_exists('ZipArchive')) {
        throw new RuntimeException('ZipArchive extension is required');
    }
    $zip = new ZipArchive();
    if ($zip->open($zipPath) !== true) {
        throw new RuntimeException('Cannot open update ZIP');
    }
    $extracted = 0;
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $stat = $zip->statIndex($i);
        if ($stat === false) {
            continue;
        }
        $entry = (string)$stat['name'];
        $rel = updaterResolveExtractRelative($entry);
        if ($rel === null) {
            continue;
        }
        // .NET ZipFile.CreateFromDirectory on Windows stores folders as "scripts\data\"
        // (backslash, often no forward slash). Treat those as directories, not files.
        $entryNorm = str_replace('\\', '/', $entry);
        $rel = str_replace('\\', '/', $rel);
        $isDir = str_ends_with($entryNorm, '/') || str_ends_with($rel, '/');
        if ($isDir) {
            $dir = UPDATER_ROOT . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, trim($rel, '/'));
            if ($dir !== '' && !is_dir($dir)) {
                @mkdir($dir, 0755, true);
            }
            continue;
        }
        $target = UPDATER_ROOT . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
        if (is_dir($target)) {
            continue;
        }
        $parent = dirname($target);
        if (!is_dir($parent)) {
            @mkdir($parent, 0755, true);
        }
        $content = $zip->getFromIndex($i);
        if ($content === false) {
            continue;
        }
        if (@file_put_contents($target, $content) === false) {
            if (is_file($target)) {
                @chmod($target, 0644);
                @unlink($target);
            }
            if (@file_put_contents($target, $content) === false) {
                $zip->close();
                throw new RuntimeException('Failed writing ' . $rel);
            }
        }
        $extracted++;
    }
    $zip->close();
    if ($extracted < 1) {
        throw new RuntimeException('Update ZIP contained no allowed files');
    }
}

function updaterGitWorkingTreeDirty(): bool {
    $r = updaterRunCommand('git status --porcelain');
    return $r['ok'] && $r['stdout'] !== '';
}

function updaterDistFingerprint(): string {
    $parts = [];
    $idx = UPDATER_ROOT . '/dist/index.html';
    if (is_file($idx)) {
        $parts[] = 'idx:' . (string)@filesize($idx) . ':' . (string)@filemtime($idx);
        $hash = @md5_file($idx);
        if (is_string($hash) && $hash !== '') {
            $parts[] = $hash;
        }
    }
    $assets = UPDATER_ROOT . '/dist/assets';
    if (is_dir($assets)) {
        $files = glob($assets . '/*.{js,css}', GLOB_BRACE) ?: [];
        sort($files);
        foreach ($files as $f) {
            $parts[] = basename($f) . ':' . (string)@filesize($f);
        }
    }
    return $parts === [] ? '' : md5(implode('|', $parts));
}

/**
 * True when this apply likely changed React/Vite sources that only affect the UI after npm run build.
 */
function updaterFrontendSourcesNeedRebuild(): bool {
    $markers = [
        UPDATER_ROOT . '/components',
        UPDATER_ROOT . '/services',
        UPDATER_ROOT . '/contexts',
        UPDATER_ROOT . '/hooks',
        UPDATER_ROOT . '/utils',
        UPDATER_ROOT . '/constants',
        UPDATER_ROOT . '/App.tsx',
        UPDATER_ROOT . '/index.tsx',
        UPDATER_ROOT . '/package.json',
        UPDATER_ROOT . '/vite.config.ts',
    ];
    $distIdx = UPDATER_ROOT . '/dist/index.html';
    $distMtime = is_file($distIdx) ? (int)@filemtime($distIdx) : 0;
    foreach ($markers as $path) {
        if (is_file($path)) {
            if ((int)@filemtime($path) > $distMtime + 5) {
                return true;
            }
            continue;
        }
        if (!is_dir($path)) {
            continue;
        }
        $it = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS)
        );
        foreach ($it as $file) {
            /** @var SplFileInfo $file */
            if (!$file->isFile()) {
                continue;
            }
            $ext = strtolower($file->getExtension());
            if (!in_array($ext, ['tsx', 'ts', 'jsx', 'js', 'css'], true)) {
                continue;
            }
            if ((int)$file->getMTime() > $distMtime + 5) {
                return true;
            }
        }
    }
    return false;
}

function updaterEnsureFrontendBuilt(bool $nodeAvailable, string $distFingerprintBefore): void {
    $distIdx = UPDATER_ROOT . '/dist/index.html';
    $hasDist = is_file($distIdx);
    $distAfter = updaterDistFingerprint();
    $distChanged = $hasDist && $distAfter !== '' && $distAfter !== $distFingerprintBefore;
    $needsRebuild = updaterFrontendSourcesNeedRebuild();

    if ($nodeAvailable && is_file(UPDATER_ROOT . '/package.json')) {
        // Always rebuild after checkout/extract when Node is present so widgets/UI land in dist/.
        updaterRebuildFrontend();
        return;
    }

    if ($distChanged) {
        updaterAppendLog('Prebuilt dist/ applied from update package (Node not required).');
        return;
    }

    if (!$hasDist) {
        throw new RuntimeException(
            'Update applied source files but dist/ is missing. '
            . 'Install Node.js + npm on this server and re-apply, or publish a GitHub Release with '
            . 'scripts/publish-update-release.ps1 (includes built dist/ for SSH/VNC widgets and UI).'
        );
    }

    if ($needsRebuild) {
        if (updaterIsDockerRuntime()) {
            updaterAppendLog(
                'WARNING: Frontend source changed but this Docker image has no Node.js, so dist/ was not rebuilt. '
                . 'PHP/API from the update are in place. Refresh the UI with redeploy-docker.bat / redeploy-docker.sh '
                . '(or apply a Release ZIP that includes dist/).'
            );
            return;
        }
        throw new RuntimeException(
            'This update includes frontend/widget source (e.g. SSH Terminal) but could not rebuild dist/. '
            . 'Office XAMPP installs usually have no Node.js, so commit zipballs leave the old UI in place. '
            . 'Fix: on a build PC run scripts/publish-update-release.ps1 -Version X.Y.Z, then in App Updates '
            . 'apply that Release (not only a commit). Or install Node.js/npm on this server and re-apply the commit.'
        );
    }

    updaterAppendLog('No frontend rebuild required (dist/ already matches this update).');
}

/**
 * Portable Vite env for rebuilds: one dist works under ArchLinks, ERP3, linknest, etc.
 * Absolute VITE_BASE_PATH from .env is honored only when it looks like /FolderName.
 *
 * @return array<string, string>
 */
function updaterPortableViteEnv(): array {
    $readEnvFile = static function (string $path): array {
        if (!is_file($path)) {
            return [];
        }
        $out = [];
        $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines)) {
            return [];
        }
        foreach ($lines as $line) {
            $line = trim((string)$line);
            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
                continue;
            }
            [$k, $v] = array_map('trim', explode('=', $line, 2));
            $v = trim($v, " \t\"'");
            if ($k !== '') {
                $out[$k] = $v;
            }
        }
        return $out;
    };

    $fileEnv = array_merge(
        $readEnvFile(UPDATER_ROOT . '/.env'),
        $readEnvFile(UPDATER_ROOT . '/.env.local')
    );
    $raw = trim((string)($fileEnv['VITE_BASE_PATH'] ?? ''));

    // Explicit absolute folder bake (legacy single-instance .env)
    if ($raw !== '' && $raw !== '/' && !preg_match('#^(?i)(\.\/?|relative|auto|portable)$#', $raw)) {
        $base = '/' . trim(str_replace('\\', '/', $raw), '/');
        if (preg_match('#^/[^/]+$#', $base)) {
            updaterAppendLog('Frontend rebuild using install .env base path ' . $base);
            return [
                'VITE_BASE_PATH' => $base,
                'VITE_API_BASE' => $base . '/api',
            ];
        }
    }

    updaterAppendLog('Frontend rebuild using portable relative base ./ (ArchLinks/ERP3/any folder)');
    return [
        'VITE_BASE_PATH' => './',
        'VITE_API_BASE' => './api',
    ];
}

function updaterDockerViteEnv(): array
{
    updaterAppendLog('Frontend rebuild using Docker vite.docker.config.ts (base /)');
    return [
        'VITE_BASE_PATH' => '/',
        'VITE_API_BASE' => '/api',
        'HOME' => '/var/www',
        'NPM_CONFIG_CACHE' => '/var/www/.npm',
        'npm_config_cache' => '/var/www/.npm',
        'npm_config_strict_ssl' => 'false',
    ];
}

function updaterRebuildFrontend(): void {
    $caps = updaterCapabilities();
    if (!$caps['nodeAvailable']) {
        throw new RuntimeException('Node.js/npm required to rebuild after checkout');
    }
    $docker = updaterIsDockerRuntime();
    $viteEnv = $docker ? updaterDockerViteEnv() : updaterPortableViteEnv();
    // Stale caniuse-lite only prints a stderr warning, but on some hosts that noise
    // was the only text shown when a rebuild was mis-reported as failed.
    $viteEnv['BROWSERSLIST_IGNORE_OLD_DATA'] = '1';
    // Corporate SSL inspection / MITM antivirus breaks npm registry TLS
    // (UNABLE_TO_VERIFY_LEAF_SIGNATURE). Same workaround as the Docker image build.
    $viteEnv['npm_config_strict_ssl'] = 'false';
    $viteEnv['NPM_CONFIG_STRICT_SSL'] = 'false';
    $viteEnv['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
    updaterSetProgress(55, 'Installing npm dependencies...');
    $ci = updaterRunCommand('npm ci', null, 600, $viteEnv);
    if (!$ci['ok']) {
        updaterAppendLog('npm ci failed, trying npm install...');
        $ci = updaterRunCommand('npm install', null, 600, $viteEnv);
        if (!$ci['ok']) {
            throw new RuntimeException('npm install failed: ' . updaterCommandFailureMessage($ci));
        }
    }
    if ($docker) {
        updaterSetProgress(75, 'Building frontend (Docker Vite config, base /)...');
        $dockerVite = UPDATER_ROOT . DIRECTORY_SEPARATOR . 'vite.docker.config.ts';
        $buildCmd = is_file($dockerVite)
            ? 'npm run build:prod -- --config vite.docker.config.ts'
            : 'npm run build:prod';
        $build = updaterRunCommand($buildCmd, null, 600, $viteEnv);
    } else {
        updaterSetProgress(75, 'Building frontend (portable base for any folder name)...');
        $build = updaterRunCommand('npm run build:prod', null, 600, $viteEnv);
    }
    if (!$build['ok']) {
        $distIndex = UPDATER_ROOT . DIRECTORY_SEPARATOR . 'dist' . DIRECTORY_SEPARATOR . 'index.html';
        $combined = (string)($build['stdout'] ?? '') . "\n" . (string)($build['stderr'] ?? '');
        // Vite prints "✓ built in …" only on success. Windows proc_close can still
        // report -1, and warning-only stderr has been shown as a failed update.
        if (is_file($distIndex) && stripos($combined, 'built in') !== false) {
            updaterAppendLog('npm run build wrote dist/index.html; treating as success despite exit code ' . (int)($build['code'] ?? -1));
        } else {
            throw new RuntimeException('npm run build failed: ' . updaterCommandFailureMessage($build));
        }
    }
}

/**
 * Prefer actionable build output over noisy stderr-only warnings (e.g. Browserslist age).
 *
 * @param array{ok?:bool,code?:int,stdout?:string,stderr?:string} $result
 */
function updaterCommandFailureMessage(array $result): string {
    $stdout = trim((string)($result['stdout'] ?? ''));
    $stderr = trim((string)($result['stderr'] ?? ''));
    $code = isset($result['code']) ? (int)$result['code'] : -1;

    $isHarmlessViteNoise = static function (string $text): bool {
        if ($text === '') {
            return true;
        }
        $hasRealError = preg_match('/\b(error|failed|ERR!|ENOENT|SyntaxError|TypeError|ELIFECYCLE)\b/i', $text)
            && stripos($text, 'Browserslist') === false
            && stripos($text, "can't be bundled without type=\"module\"") === false;
        if ($hasRealError) {
            return false;
        }
        return stripos($text, 'Browserslist: browsers data') !== false
            || stripos($text, 'update-browserslist-db') !== false
            || stripos($text, "can't be bundled without type=\"module\"") !== false
            || stripos($text, 'dynamically imported by') !== false
            || stripos($text, 'Some chunks are larger than') !== false
            || stripos($text, 'chunkSizeWarningLimit') !== false;
    };

    $parts = [];
    if ($stdout !== '' && !$isHarmlessViteNoise($stdout)) {
        $parts[] = $stdout;
    }
    if ($stderr !== '' && !$isHarmlessViteNoise($stderr)) {
        $parts[] = $stderr;
    }
    if ($parts === []) {
        if ($stderr !== '') {
            $parts[] = $stderr;
        } elseif ($stdout !== '') {
            $parts[] = $stdout;
        } else {
            $parts[] = 'exit code ' . $code;
        }
    }

    $msg = trim(implode("\n", $parts));
    if (strlen($msg) > 4000) {
        $msg = substr($msg, -4000);
    }
    return $msg;
}

/**
 * Apply a resolved target (tag or sha) via git or zip/zipball.
 * @param array $target from updaterResolveApplyTarget
 * @param bool $pushHistory snapshot current before apply
 */
function updaterApplyTarget(array $target, bool $pushHistory = true): void {
    $caps = updaterCapabilities();
    $mode = $caps['mode'];
    $ref = (string)$target['ref'];
    $label = ($target['type'] === 'sha')
        ? ('commit ' . substr($ref, 0, 7))
        : ((string)($target['tag'] ?? $ref));

    updaterEnsureGitSafeDirectory();
    updaterSetProgress(5, 'Applying ' . $label . ' via ' . $mode . ' mode...', 'running');

    $job = updaterReadJob() ?: [];
    $backupDatabase = !array_key_exists('backupDatabase', $job) || !empty($job['backupDatabase']);

    if ($pushHistory) {
        $extra = [];
        if (!empty($job['previewFilesChanged'])) {
            $extra['filesChanged'] = (int)$job['previewFilesChanged'];
        }
        if (!empty($job['previewApproxBytes'])) {
            $extra['approxBytes'] = (int)$job['previewApproxBytes'];
        }
        if ($backupDatabase) {
            updaterSetProgress(8, 'Creating database snapshot...');
            try {
                $snap = updaterCreateDbSnapshot([
                    'reason' => 'pre-update',
                    'label' => 'Before applying ' . $label,
                    'gitCommit' => updaterInstalledCommit(),
                    'appVersion' => updaterInstalledVersion(),
                ]);
                $extra['dbSnapshotId'] = $snap['id'];
                $extra['dbBytes'] = $snap['dbBytes'] ?? null;
                updaterAppendLog('Database snapshot saved: ' . $snap['id']
                    . (!empty($snap['dbBytes']) ? (' (' . updaterFormatBytes((int)$snap['dbBytes']) . ')') : ''));
            } catch (Throwable $e) {
                throw new RuntimeException('Database snapshot failed: ' . $e->getMessage());
            }
        } else {
            updaterAppendLog('Database snapshot skipped (user opted out).');
        }
        updaterPushHistorySnapshot('Before applying ' . $label, $extra);
    }

    if ($mode === 'git') {
        if (updaterGitWorkingTreeDirty()) {
            updaterAppendLog('Working tree has local changes; continuing with force checkout.');
        }
        updaterSetProgress(20, 'Fetching from origin...');
        $fetch = updaterRunCommand('git fetch --tags --force origin');
        if (!$fetch['ok']) {
            throw new RuntimeException('git fetch failed: ' . ($fetch['stderr'] ?: $fetch['stdout']));
        }
        updaterRunCommand('git fetch origin ' . escapeshellarg(updaterTrackBranch()));

        updaterSetProgress(40, 'Checking out ' . $label . '...');
        $co = updaterRunCommand('git checkout --force ' . escapeshellarg($ref));
        if (!$co['ok']) {
            throw new RuntimeException('git checkout failed: ' . ($co['stderr'] ?: $co['stdout']));
        }
        $distBefore = updaterDistFingerprint();
        updaterEnsureFrontendBuilt($caps['nodeAvailable'], $distBefore);
        $commit = updaterRunCommand('git rev-parse HEAD');
        $pkgVer = updaterInstalledVersion();
        $pkgPath = UPDATER_ROOT . '/package.json';
        if (is_file($pkgPath)) {
            $pkg = json_decode((string)@file_get_contents($pkgPath), true);
            if (is_array($pkg) && !empty($pkg['version'])) {
                $pkgVer = updaterNormalizeVersion((string)$pkg['version']);
            }
        }
        updaterWriteBuildInfo([
            'appVersion' => $pkgVer,
            'releaseTag' => $target['tag'] ?? null,
            'gitCommit' => $commit['ok'] ? $commit['stdout'] : $ref,
            'commitMessage' => $target['message'] ?? null,
            'trackBranch' => updaterTrackBranch(),
            'updatedVia' => 'git',
            'updatedAt' => date('Y-m-d H:i:s'),
            'builtAt' => date('Y-m-d H:i:s'),
            'buildId' => date('Ymd-His'),
        ]);
    } else {
        if (!$caps['zipAvailable']) {
            throw new RuntimeException('ZIP mode requires ZipArchive and cURL');
        }
        if (!is_dir(UPDATER_TMP_DIR)) {
            @mkdir(UPDATER_TMP_DIR, 0755, true);
        }
        $zipPath = UPDATER_TMP_DIR . '/update-' . preg_replace('/[^A-Za-z0-9._-]/', '_', $ref) . '.zip';
        $repo = updaterRepoSlug();

        if ($target['type'] === 'tag' && (!empty($target['assetId']) || !empty($target['assetUrl']))) {
            updaterSetProgress(15, 'Downloading ' . ($target['assetName'] ?: 'release ZIP') . '...');
            if (!empty($target['assetId'])) {
                $url = 'https://api.github.com/repos/' . $repo . '/releases/assets/' . (int)$target['assetId'];
                updaterDownloadFile($url, $zipPath);
            } else {
                updaterDownloadFile((string)$target['assetUrl'], $zipPath);
            }
        } else {
            updaterSetProgress(15, 'Downloading source zipball for ' . $label . '...');
            $url = 'https://api.github.com/repos/' . $repo . '/zipball/' . rawurlencode($ref);
            updaterDownloadZipball($url, $zipPath);
        }

        $prevInfo = updaterReadBuildInfo();
        $prevReleaseTag = updaterNormalizeReleaseTag((string)($prevInfo['releaseTag'] ?? ''));
        $bi = UPDATER_ROOT . '/BUILD_INFO.json';
        if (is_file($bi)) {
            @copy($bi, UPDATER_ROOT . '/data/BUILD_INFO.pre-update.json');
        }
        $distBefore = updaterDistFingerprint();
        updaterSetProgress(55, 'Extracting update (preserving data/ and uploads/)...');
        updaterExtractUpdateZip($zipPath);
        @unlink($zipPath);

        updaterSetProgress(70, 'Ensuring frontend / widgets are built into dist/...');
        updaterEnsureFrontendBuilt($caps['nodeAvailable'], $distBefore);

        $pkgVer = (string)($target['version'] ?? updaterInstalledVersion());
        if (is_file(UPDATER_ROOT . '/package.json')) {
            $pkg = json_decode((string)@file_get_contents(UPDATER_ROOT . '/package.json'), true);
            if (is_array($pkg) && !empty($pkg['version'])) {
                $pkgVer = updaterNormalizeVersion((string)$pkg['version']);
            }
        }
        // Record the applied ref — never trust BUILD_INFO.gitCommit from inside
        // the zip/zipball (that file in git is often an old SHA).
        $appliedSha = null;
        if (updaterLooksLikeGitSha($ref)) {
            $appliedSha = strlen($ref) >= 40 ? strtolower($ref) : updaterResolveRefCommitSha($ref);
            if (!$appliedSha) {
                $appliedSha = strtolower($ref);
            }
        } else {
            $appliedSha = updaterResolveRefCommitSha((string)($target['tag'] ?? $ref));
        }
        updaterWriteBuildInfo([
            'appVersion' => $pkgVer,
            'releaseTag' => $target['tag'] ?? $prevReleaseTag,
            'gitCommit' => $appliedSha ?: $ref,
            'commitMessage' => $target['message'] ?? null,
            'trackBranch' => updaterTrackBranch(),
            'updatedVia' => 'zip',
            'updatedAt' => date('Y-m-d H:i:s'),
            'builtAt' => date('Y-m-d H:i:s'),
            'buildId' => date('Ymd-His'),
        ]);
    }

    updaterClearOpcache();
    if (is_file(UPDATER_COMMITS_CACHE_FILE)) {
        @unlink(UPDATER_COMMITS_CACHE_FILE);
    }

    updaterSetProgress(100, 'Update applied successfully. Reload the app.', 'success');
    $job = updaterReadJob() ?: [];
    $job['status'] = 'success';
    $job['percent'] = 100;
    $job['newVersion'] = updaterInstalledVersion();
    $job['tag'] = $target['tag'] ?? null;
    $job['sha'] = $ref;
    $job['finishedAt'] = time();
    updaterWriteJob($job);
}

/** @deprecated Use updaterApplyTarget */
function updaterApplyRelease(array $release): void {
    updaterApplyTarget([
        'type' => 'tag',
        'ref' => $release['tag'],
        'version' => $release['version'],
        'message' => $release['name'] ?? $release['tag'],
        'tag' => $release['tag'],
        'assetName' => $release['assetName'] ?? null,
        'assetUrl' => $release['assetUrl'] ?? null,
        'assetId' => $release['assetId'] ?? null,
    ], true);
}

function updaterDownloadZipball(string $url, string $destPath): void {
    $dir = dirname($destPath);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $token = updaterGithubToken();
    $ch = curl_init($url);
    $headers = [
        'Accept: application/vnd.github+json',
        'User-Agent: LinkNest-Updater',
        'X-GitHub-Api-Version: 2022-11-28',
    ];
    if ($token !== '') {
        $headers[] = 'Authorization: Bearer ' . $token;
    }
    $fp = fopen($destPath, 'wb');
    if ($fp === false) {
        throw new RuntimeException('Cannot write download to ' . $destPath);
    }
    curl_setopt_array($ch, [
        CURLOPT_FILE => $fp,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 600,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
    ]);
    $ok = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    fclose($fp);
    if ($ok === false || $status < 200 || $status >= 300) {
        @unlink($destPath);
        throw new RuntimeException('Zipball download failed (HTTP ' . $status . '): ' . ($err ?: 'unknown'));
    }
}

function updaterClearOpcache(): void {
    if (function_exists('opcache_reset')) {
        @opcache_reset();
    }
}

/**
 * @param string $spec tag:v2.2.0 | sha:abc1234 | rollback
 * @return bool true if background process launched
 */
function updaterResolvePhpBinary(): string {
    $candidates = [];
    if (defined('PHP_BINARY') && is_string(PHP_BINARY) && PHP_BINARY !== '') {
        $bin = PHP_BINARY;
        if (is_file($bin) && preg_match('/php(?:-cgi)?(?:\d+(?:\.\d+)*)?(?:\.exe)?$/i', basename($bin))) {
            $candidates[] = $bin;
        }
    }
    if (updaterIsWindows()) {
        $candidates[] = 'C:\\xampp\\php\\php.exe';
        $candidates[] = dirname(UPDATER_ROOT) . DIRECTORY_SEPARATOR . 'php' . DIRECTORY_SEPARATOR . 'php.exe';
    }
    foreach ($candidates as $c) {
        if (is_file($c)) {
            return $c;
        }
    }
    return 'php';
}

function updaterSpawnApplyWorker(string $spec): bool {
    $scriptPath = __DIR__ . '/updater_apply_cli.php';
    $php = updaterResolvePhpBinary();
    $logFile = UPDATER_ROOT . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'updater-worker.log';
    if (!is_dir(dirname($logFile))) {
        @mkdir(dirname($logFile), 0755, true);
    }
    @file_put_contents($logFile, "\n==== " . date('c') . " spawn spec={$spec} php={$php} ====\n", FILE_APPEND);

    if (updaterIsWindows()) {
        $cmdPath = UPDATER_ROOT . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'updater-run.cmd';
        $lines = [
            '@echo off',
            'cd /d ' . UPDATER_ROOT,
            '"' . $php . '" -f "' . $scriptPath . '" "' . $spec . '" >> "' . $logFile . '" 2>&1',
        ];
        @file_put_contents($cmdPath, implode("\r\n", $lines) . "\r\n");
        $launch = 'cmd.exe /c start /B "" ' . escapeshellarg($cmdPath);
        $ok = false;
        if (function_exists('popen') && function_exists('pclose')) {
            $h = @popen($launch, 'r');
            if (is_resource($h)) {
                pclose($h);
                $ok = true;
            }
        }
        if (!$ok && function_exists('exec')) {
            @exec($launch);
            $ok = true;
        }
        updaterAppendLog($ok ? 'Background worker launched (Windows).' : 'Failed to launch Windows worker.');
        return $ok;
    }

    $envPrefix = 'HOME=/var/www npm_config_strict_ssl=false NODE_TLS_REJECT_UNAUTHORIZED=0 LINKNEST_DOCKER=1 ';
    $command = $envPrefix . 'nohup ' . escapeshellarg($php) . ' -f ' . escapeshellarg($scriptPath) . ' '
        . escapeshellarg($spec) . ' >> ' . escapeshellarg($logFile) . ' 2>&1 &';
    if (function_exists('exec')) {
        @exec($command);
        updaterAppendLog('Background worker launched (Unix).');
        return true;
    }
    return false;
}

function updaterCanApply(array $caps): bool {
    if ($caps['mode'] === 'git') {
        return $caps['gitAvailable'] && $caps['nodeAvailable'];
    }
    return $caps['zipAvailable'];
}

function updaterFormatBytes(int $bytes): string {
    if ($bytes < 1024) {
        return $bytes . ' B';
    }
    if ($bytes < 1024 * 1024) {
        return round($bytes / 1024, 1) . ' KB';
    }
    return round($bytes / (1024 * 1024), 2) . ' MB';
}

function updaterFormatDuration(int $seconds): string {
    $seconds = max(0, $seconds);
    if ($seconds < 60) {
        return '~' . $seconds . 's';
    }
    $m = (int)floor($seconds / 60);
    $s = $seconds % 60;
    return $s > 0 ? "~{$m}m {$s}s" : "~{$m}m";
}

function updaterPathNeedsRebuild(string $path): bool {
    $path = str_replace('\\', '/', $path);
    $needles = [
        'package.json',
        'package-lock.json',
        'vite.config',
        'tsconfig',
        'tailwind.config',
        'postcss.config',
        'components/',
        'services/',
        'contexts/',
        'hooks/',
        'utils/',
        'App.tsx',
        'index.tsx',
        'index.css',
        'src/',
    ];
    foreach ($needles as $n) {
        if (str_contains($path, $n)) {
            return true;
        }
    }
    return false;
}

function updaterEstimateApplySeconds(int $filesChanged, int $approxBytes, bool $needsRebuild): int {
    $sec = 10 + 8; // base + fetch buffer
    $sec += (int)ceil($filesChanged * 0.05);
    $sec += (int)ceil($approxBytes / (2 * 1024 * 1024)); // ~1s per 2MB
    $sec += $needsRebuild ? 35 : 5;
    return max(15, min(600, $sec));
}

/**
 * Build change preview for a tag or sha.
 */
function updaterBuildPreview(?string $tag, ?string $sha): array {
    $target = updaterResolveApplyTarget($tag, $sha);
    $base = updaterInstalledCommit() ?: 'HEAD';
    $head = (string)$target['ref'];
    $caps = updaterCapabilities();

    $files = [];
    $commits = [];
    $source = 'none';

    if ($caps['mode'] === 'git' && $caps['gitAvailable']) {
        updaterEnsureGitSafeDirectory();
        updaterRunCommand('git fetch --tags --force origin', null, 120);
        updaterRunCommand('git fetch origin ' . escapeshellarg(updaterTrackBranch()), null, 120);
        $source = 'git';

        $ns = updaterRunCommand('git diff --name-status ' . escapeshellarg($base) . '...' . escapeshellarg($head), null, 60);
        $num = updaterRunCommand('git diff --numstat ' . escapeshellarg($base) . '...' . escapeshellarg($head), null, 60);
        $log = updaterRunCommand('git log --oneline --no-decorate ' . escapeshellarg($base) . '..' . escapeshellarg($head), null, 30);

        $statusByPath = [];
        if ($ns['ok'] && $ns['stdout'] !== '') {
            foreach (preg_split('/\r\n|\n|\r/', $ns['stdout']) as $line) {
                $line = trim($line);
                if ($line === '') {
                    continue;
                }
                $parts = preg_split('/\s+/', $line, 3);
                if (!$parts || count($parts) < 2) {
                    continue;
                }
                $status = $parts[0];
                if (str_starts_with($status, 'R') && count($parts) >= 3) {
                    $statusByPath[$parts[2]] = ['status' => 'R', 'from' => $parts[1]];
                } else {
                    $statusByPath[$parts[1]] = ['status' => substr($status, 0, 1), 'from' => null];
                }
            }
        }

        if ($num['ok'] && $num['stdout'] !== '') {
            foreach (preg_split('/\r\n|\n|\r/', $num['stdout']) as $line) {
                $line = trim($line);
                if ($line === '') {
                    continue;
                }
                $parts = preg_split('/\s+/', $line, 3);
                if (!$parts || count($parts) < 3) {
                    continue;
                }
                $add = $parts[0];
                $del = $parts[1];
                $path = $parts[2];
                $binary = ($add === '-' || $del === '-');
                $additions = $binary ? 0 : (int)$add;
                $deletions = $binary ? 0 : (int)$del;
                $meta = $statusByPath[$path] ?? ['status' => 'M', 'from' => null];
                $approx = $binary ? 0 : (($additions + $deletions) * 40);
                $files[] = [
                    'path' => $path,
                    'status' => $meta['status'],
                    'fromPath' => $meta['from'],
                    'additions' => $additions,
                    'deletions' => $deletions,
                    'approxBytes' => $approx,
                    'binary' => $binary,
                ];
                unset($statusByPath[$path]);
            }
        }
        foreach ($statusByPath as $path => $meta) {
            $files[] = [
                'path' => $path,
                'status' => $meta['status'],
                'fromPath' => $meta['from'],
                'additions' => 0,
                'deletions' => 0,
                'approxBytes' => 0,
                'binary' => false,
            ];
        }

        if ($log['ok'] && $log['stdout'] !== '') {
            foreach (preg_split('/\r\n|\n|\r/', $log['stdout']) as $line) {
                $line = trim($line);
                if ($line === '') {
                    continue;
                }
                if (preg_match('/^([0-9a-f]{7,40})\s+(.*)$/i', $line, $m)) {
                    $commits[] = ['shortSha' => substr($m[1], 0, 7), 'sha' => $m[1], 'message' => $m[2]];
                }
            }
        }
    } else {
        // ZIP installs: GitHub compare API
        $source = 'github';
        $repo = updaterRepoSlug();
        $baseRef = $base ?: 'HEAD';
        $url = 'https://api.github.com/repos/' . $repo . '/compare/' . rawurlencode($baseRef) . '...' . rawurlencode($head);
        try {
            $cmp = updaterHttpJson($url);
            foreach (($cmp['files'] ?? []) as $f) {
                if (!is_array($f)) {
                    continue;
                }
                $statusMap = ['added' => 'A', 'removed' => 'D', 'modified' => 'M', 'renamed' => 'R', 'copied' => 'C'];
                $st = $statusMap[(string)($f['status'] ?? 'modified')] ?? 'M';
                $add = (int)($f['additions'] ?? 0);
                $del = (int)($f['deletions'] ?? 0);
                $files[] = [
                    'path' => (string)($f['filename'] ?? ''),
                    'status' => $st,
                    'fromPath' => $f['previous_filename'] ?? null,
                    'additions' => $add,
                    'deletions' => $del,
                    'approxBytes' => ($add + $del) * 40,
                    'binary' => empty($f['patch']) && ($add + $del) === 0,
                ];
            }
            foreach (($cmp['commits'] ?? []) as $c) {
                if (!is_array($c)) {
                    continue;
                }
                $full = (string)($c['sha'] ?? '');
                $msg = (string)($c['commit']['message'] ?? '');
                $msg = explode("\n", $msg)[0];
                $commits[] = [
                    'sha' => $full,
                    'shortSha' => substr($full, 0, 7),
                    'message' => $msg,
                ];
            }
        } catch (Throwable $e) {
            throw new RuntimeException('Preview failed: ' . $e->getMessage());
        }
    }

    usort($files, static function ($a, $b) {
        return strcmp($a['path'] ?? '', $b['path'] ?? '');
    });

    $additions = 0;
    $deletions = 0;
    $approxBytes = 0;
    $needsRebuild = false;
    foreach ($files as $f) {
        $additions += (int)($f['additions'] ?? 0);
        $deletions += (int)($f['deletions'] ?? 0);
        $approxBytes += (int)($f['approxBytes'] ?? 0);
        if (!$needsRebuild && updaterPathNeedsRebuild((string)($f['path'] ?? ''))) {
            $needsRebuild = true;
        }
    }
    // Always rebuild in git mode after checkout when node is available — ETA should reflect that
    if ($caps['mode'] === 'git' && $caps['nodeAvailable']) {
        $needsRebuild = true;
    }

    $filesChanged = count($files);
    $estimateSeconds = updaterEstimateApplySeconds($filesChanged, $approxBytes, $needsRebuild);

    return [
        'base' => $base,
        'target' => [
            'type' => $target['type'],
            'ref' => $head,
            'tag' => $target['tag'] ?? null,
            'version' => $target['version'] ?? null,
            'message' => $target['message'] ?? null,
        ],
        'source' => $source,
        'files' => $files,
        'filesChanged' => $filesChanged,
        'additions' => $additions,
        'deletions' => $deletions,
        'approxBytes' => $approxBytes,
        'approxSizeLabel' => updaterFormatBytes($approxBytes),
        'needsRebuild' => $needsRebuild,
        'estimateSeconds' => $estimateSeconds,
        'estimateLabel' => updaterFormatDuration($estimateSeconds),
        'commits' => array_slice($commits, 0, 30),
        'commitCount' => count($commits),
        'note' => 'Size and duration are estimates based on line deltas and typical rebuild time.',
    ];
}

/* ---- SQLite DB snapshots ---- */

function updaterSnapshotsDir(): string {
    if (!is_dir(UPDATER_SNAPSHOTS_DIR)) {
        @mkdir(UPDATER_SNAPSHOTS_DIR, 0755, true);
    }
    return UPDATER_SNAPSHOTS_DIR;
}

function updaterDbSnapshotExists(string $id): bool {
    $id = preg_replace('/[^A-Za-z0-9_-]/', '', $id) ?? '';
    if ($id === '') {
        return false;
    }
    $db = updaterSnapshotsDir() . DIRECTORY_SEPARATOR . $id . DIRECTORY_SEPARATOR . 'linknest.db';
    return is_file($db);
}

function updaterCreateDbSnapshot(array $meta = []): array {
    if (!defined('DB_PATH') || !is_file(DB_PATH)) {
        throw new RuntimeException('Database file not found');
    }
    $id = 'dbs_' . date('Ymd_His') . '_' . substr(md5(uniqid('', true)), 0, 6);
    $dir = updaterSnapshotsDir() . DIRECTORY_SEPARATOR . $id;
    if (!@mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new RuntimeException('Cannot create snapshot directory');
    }

    // Flush WAL into the main DB file for a consistent copy
    try {
        $pdo = new PDO('sqlite:' . DB_PATH);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec('PRAGMA wal_checkpoint(TRUNCATE)');
        $pdo = null;
    } catch (Throwable $e) {
        // Continue with best-effort file copy
        error_log('updater snapshot checkpoint: ' . $e->getMessage());
    }

    $dest = $dir . DIRECTORY_SEPARATOR . 'linknest.db';
    if (!@copy(DB_PATH, $dest)) {
        throw new RuntimeException('Failed to copy database into snapshot');
    }
    $dbBytes = (int)@filesize($dest);
    $record = [
        'id' => $id,
        'createdAt' => time(),
        'createdAtIso' => date('c'),
        'gitCommit' => $meta['gitCommit'] ?? updaterInstalledCommit(),
        'appVersion' => $meta['appVersion'] ?? updaterInstalledVersion(),
        'label' => $meta['label'] ?? ('DB snapshot @ ' . date('Y-m-d H:i:s')),
        'reason' => $meta['reason'] ?? 'pre-update',
        'dbBytes' => $dbBytes,
        'dbSizeLabel' => updaterFormatBytes($dbBytes),
    ];
    @file_put_contents(
        $dir . DIRECTORY_SEPARATOR . 'meta.json',
        json_encode($record, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
        LOCK_EX
    );
    updaterPruneSnapshots(UPDATER_HISTORY_MAX);
    return $record;
}

function updaterListDbSnapshots(): array {
    $dir = updaterSnapshotsDir();
    $items = [];
    foreach (glob($dir . DIRECTORY_SEPARATOR . '*', GLOB_ONLYDIR) ?: [] as $path) {
        $metaFile = $path . DIRECTORY_SEPARATOR . 'meta.json';
        $dbFile = $path . DIRECTORY_SEPARATOR . 'linknest.db';
        if (!is_file($dbFile)) {
            continue;
        }
        $meta = [];
        if (is_file($metaFile)) {
            $decoded = json_decode((string)@file_get_contents($metaFile), true);
            if (is_array($decoded)) {
                $meta = $decoded;
            }
        }
        $id = $meta['id'] ?? basename($path);
        $items[] = [
            'id' => $id,
            'createdAt' => (int)($meta['createdAt'] ?? @filemtime($dbFile)),
            'createdAtIso' => $meta['createdAtIso'] ?? date('c', (int)($meta['createdAt'] ?? @filemtime($dbFile))),
            'gitCommit' => $meta['gitCommit'] ?? null,
            'appVersion' => $meta['appVersion'] ?? null,
            'label' => $meta['label'] ?? $id,
            'reason' => $meta['reason'] ?? null,
            'dbBytes' => (int)($meta['dbBytes'] ?? @filesize($dbFile)),
            'dbSizeLabel' => updaterFormatBytes((int)($meta['dbBytes'] ?? @filesize($dbFile))),
        ];
    }
    usort($items, static function ($a, $b) {
        return ($b['createdAt'] ?? 0) <=> ($a['createdAt'] ?? 0);
    });
    return $items;
}

function updaterRestoreDbSnapshot(string $id): void {
    $id = preg_replace('/[^A-Za-z0-9_-]/', '', $id) ?? '';
    if ($id === '' || !updaterDbSnapshotExists($id)) {
        throw new RuntimeException('Database snapshot not found: ' . $id);
    }
    if (!defined('DB_PATH')) {
        throw new RuntimeException('DB_PATH not defined');
    }
    $src = updaterSnapshotsDir() . DIRECTORY_SEPARATOR . $id . DIRECTORY_SEPARATOR . 'linknest.db';
    $dir = dirname(DB_PATH);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $tmp = DB_PATH . '.restoring-' . getmypid();
    if (!@copy($src, $tmp)) {
        throw new RuntimeException('Failed to stage database restore');
    }
    // Replace live DB
    if (is_file(DB_PATH)) {
        @unlink(DB_PATH . '.pre-restore');
        @rename(DB_PATH, DB_PATH . '.pre-restore');
    }
    if (!@rename($tmp, DB_PATH)) {
        @copy($tmp, DB_PATH);
        @unlink($tmp);
    }
    foreach ([DB_PATH . '-wal', DB_PATH . '-shm'] as $side) {
        if (is_file($side)) {
            @unlink($side);
        }
    }
    updaterAppendLog('Database restored from snapshot ' . $id);
}

function updaterPruneSnapshots(int $keep = UPDATER_HISTORY_MAX): void {
    $keep = max(1, $keep);
    $items = updaterListDbSnapshots();
    if (count($items) <= $keep) {
        return;
    }
    $drop = array_slice($items, $keep);
    foreach ($drop as $item) {
        $id = preg_replace('/[^A-Za-z0-9_-]/', '', (string)($item['id'] ?? '')) ?? '';
        if ($id === '') {
            continue;
        }
        $path = updaterSnapshotsDir() . DIRECTORY_SEPARATOR . $id;
        if (!is_dir($path)) {
            continue;
        }
        foreach (['linknest.db', 'meta.json'] as $f) {
            $fp = $path . DIRECTORY_SEPARATOR . $f;
            if (is_file($fp)) {
                @unlink($fp);
            }
        }
        @rmdir($path);
    }

    // Also drop orphaned history dbSnapshotId references are fine left as null-effective
    $referenced = [];
    foreach (updaterReadHistory() as $e) {
        if (!empty($e['dbSnapshotId'])) {
            $referenced[(string)$e['dbSnapshotId']] = true;
        }
    }
}

/**
 * Rollback to a specific history entry (keeps the entry for audit).
 */
function updaterExecuteRollbackToEntry(array $snapshot, bool $restoreDatabase): void {
    if (empty($snapshot['gitCommit'])) {
        throw new RuntimeException('History entry has no git commit');
    }
    updaterEnsureGitSafeDirectory();
    updaterPushHistorySnapshot('Before rollback @ ' . date('Y-m-d H:i:s'));

    $target = [
        'type' => 'sha',
        'ref' => $snapshot['gitCommit'],
        'version' => $snapshot['appVersion'] ?? updaterInstalledVersion(),
        'message' => $snapshot['message'] ?? ('Rollback to ' . substr((string)$snapshot['gitCommit'], 0, 7)),
        'tag' => $snapshot['releaseTag'] ?? null,
        'assetName' => null,
        'assetUrl' => null,
        'assetId' => null,
    ];
    // Do not push another history / DB snap for the apply itself
    $job = updaterReadJob() ?: [];
    $job['backupDatabase'] = false;
    updaterWriteJob($job);

    updaterApplyTarget($target, false);

    if ($restoreDatabase) {
        $snapId = $snapshot['dbSnapshotId'] ?? null;
        if (is_string($snapId) && $snapId !== '' && updaterDbSnapshotExists($snapId)) {
            updaterSetProgress(95, 'Restoring database snapshot...');
            updaterRestoreDbSnapshot($snapId);
        } else {
            updaterAppendLog('No database snapshot available for this rollback entry.');
        }
    } else {
        updaterAppendLog('Database restore skipped.');
    }

    updaterSetProgress(100, 'Rollback complete. Reload the app.', 'success');
    $job = updaterReadJob() ?: [];
    $job['status'] = 'success';
    $job['percent'] = 100;
    $job['finishedAt'] = time();
    updaterWriteJob($job);
}

function updaterRecoverStaleApplyState(bool $forceLockClear = false): void {
    $job = null;
    if (is_file(UPDATER_JOB_FILE)) {
        $raw = @file_get_contents(UPDATER_JOB_FILE);
        $job = $raw !== false ? json_decode($raw, true) : null;
    }
    $running = is_array($job) && ($job['status'] ?? '') === 'running';
    $started = is_array($job) ? (int)($job['startedAt'] ?? 0) : 0;
    $updated = is_array($job) ? (int)($job['updatedAt'] ?? $started) : 0;
    $percent = is_array($job) ? (int)($job['percent'] ?? 0) : 0;
    $age = $started > 0 ? (time() - $started) : 0;
    $sinceUpdate = $updated > 0 ? (time() - $updated) : $age;
    $staleJob = $running && (($percent <= 5 && $age >= 45) || $sinceUpdate >= 180 || $age >= 3600);

    $lockStale = false;
    if (is_file(UPDATER_LOCK_FILE)) {
        $raw = @file_get_contents(UPDATER_LOCK_FILE);
        $data = $raw !== false ? json_decode($raw, true) : null;
        $lockStarted = is_array($data) ? (int)($data['startedAt'] ?? 0) : 0;
        $lockAge = $lockStarted > 0 ? (time() - $lockStarted) : 99999;
        $lockStale = $lockAge >= 45 && (!$running || $staleJob || $percent <= 5);
    }

    if ($staleJob || $forceLockClear || $lockStale) {
        updaterReleaseLock();
        updaterWriteJob([
            'status' => 'idle',
            'percent' => 0,
            'message' => 'Cleared stuck updater state',
            'log' => ['[' . date('H:i:s') . '] Cleared stuck updater state'],
            'error' => null,
        ]);
    }
}

function updaterSettleCompletedJob(): void {
    $job = updaterReadJob();
    if (!is_array($job)) {
        return;
    }
    $status = (string)($job['status'] ?? '');
    if ($status !== 'success' && $status !== 'error') {
        return;
    }
    // Keep recent errors visible; archive success so the progress bar does not stick at 100%.
    if ($status === 'success') {
        $finished = (int)($job['finishedAt'] ?? $job['updatedAt'] ?? time());
        updaterWriteJob([
            'status' => 'idle',
            'percent' => 0,
            'message' => 'Ready',
            'log' => [],
            'lastSuccessAt' => $finished,
            'lastSuccessSha' => $job['sha'] ?? null,
            'error' => null,
        ]);
        return;
    }
    // Errors older than 30 minutes → idle
    $updated = (int)($job['updatedAt'] ?? 0);
    if ($updated > 0 && (time() - $updated) > 1800) {
        updaterWriteJob([
            'status' => 'idle',
            'percent' => 0,
            'message' => 'Ready',
            'log' => [],
            'error' => null,
        ]);
    }
}

function updaterBuildStatusPayload(bool $forceCheck = false): array {
    updaterSettleCompletedJob();
    updaterRecoverStaleApplyState();

    $current = updaterInstalledVersion();
    $caps = updaterCapabilities();
    $error = null;
    $releases = [];
    $commits = [];
    $aheadBy = 0;
    $fetchedAt = null;
    $branch = updaterTrackBranch();
    $installedCommit = updaterInstalledCommit();
    $hint = null;
    $localOnlyCount = 0;

    try {
        $cache = updaterFetchReleases($forceCheck);
        $releases = $cache['releases'] ?? [];
        $fetchedAt = $cache['fetchedAt'] ?? null;
    } catch (Throwable $e) {
        $error = $e->getMessage();
    }

    try {
        $cc = updaterFetchCommitsAhead($forceCheck);
        $commits = $cc['commits'] ?? [];
        $aheadBy = (int)($cc['aheadBy'] ?? count($commits));
        $fetchedAt = max((int)$fetchedAt, (int)($cc['fetchedAt'] ?? 0)) ?: $fetchedAt;
        $hint = $cc['hint'] ?? null;
        $localOnlyCount = (int)($cc['localOnlyCount'] ?? 0);
    } catch (Throwable $e) {
        $error = $error ? ($error . ' | ' . $e->getMessage()) : $e->getMessage();
    }

    $newerReleases = updaterNewerReleases($releases, $current);
    $latestRelease = $releases[0] ?? null;
    $latestCommit = $commits[0] ?? null;
    $buildInfo = updaterReadBuildInfo();
    $job = updaterReadJob();
    $historyApi = updaterHistoryForApi();
    $canRollback = !empty($historyApi);
    $rollbackTarget = $canRollback ? $historyApi[0] : null;

    $updateCount = $aheadBy > 0 ? $aheadBy : count($newerReleases);
    $updateAvailable = $aheadBy > 0 || count($newerReleases) > 0;
    $canApply = $updateAvailable && updaterCanApply($caps);

    return [
        'currentVersion' => $current,
        'releaseTag' => $buildInfo['releaseTag'] ?? null,
        'gitCommit' => $installedCommit,
        'commitMessage' => $buildInfo['commitMessage'] ?? null,
        'trackBranch' => $branch,
        'mode' => $caps['mode'],
        'capabilities' => $caps,
        'updateAvailable' => $updateAvailable,
        'updateCount' => $updateCount,
        'commitUpdates' => $commits,
        'aheadBy' => $aheadBy,
        'latestCommit' => $latestCommit,
        'releases' => $newerReleases,
        'latest' => $latestRelease,
        'canApply' => $canApply,
        'canRollback' => $canRollback,
        'rollbackTarget' => $rollbackTarget,
        'history' => $historyApi,
        'historyCount' => count($historyApi),
        'dbSnapshots' => updaterListDbSnapshots(),
        'repo' => updaterRepoSlug(),
        'tokenConfigured' => updaterHasGithubToken(),
        'checkedAt' => $fetchedAt,
        'checkIntervalMinutes' => updaterCheckIntervalMinutes(),
        'job' => $job,
        'error' => $error,
        'hint' => $hint,
        'localOnlyCount' => $localOnlyCount,
    ];
}
