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
define('UPDATER_TMP_DIR', UPDATER_ROOT . '/data/tmp');

/** Top-level paths allowed when extracting an update ZIP (never data/, uploads/, .env*). */
const UPDATER_ZIP_ALLOW_PREFIXES = [
    'api/',
    'dist/',
    'components/',
    'contexts/',
    'services/',
    'hooks/',
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
    'config/',
    'runtime/',
    'load-tests/',
];

const UPDATER_ZIP_ALLOW_ROOT_FILES = [
    'index.html',
    'index.php',
    'package.json',
    'package-lock.json',
    'BUILD_INFO.json',
    '.htaccess',
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
    $info = updaterReadBuildInfo();
    if (!empty($info['appVersion']) && is_string($info['appVersion'])) {
        return updaterNormalizeVersion($info['appVersion']);
    }
    $pkgPath = UPDATER_ROOT . '/package.json';
    if (is_file($pkgPath)) {
        $raw = @file_get_contents($pkgPath);
        $pkg = $raw !== false ? json_decode($raw, true) : null;
        if (is_array($pkg) && !empty($pkg['version'])) {
            return updaterNormalizeVersion((string)$pkg['version']);
        }
    }
    return '0.0.0';
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
 * Installed commit SHA (BUILD_INFO, then local git HEAD).
 */
function updaterInstalledCommit(): ?string {
    $info = updaterReadBuildInfo();
    if (!empty($info['gitCommit']) && is_string($info['gitCommit'])) {
        $sha = preg_replace('/[^a-f0-9]/i', '', $info['gitCommit']);
        if (is_string($sha) && strlen($sha) >= 7) {
            return strtolower($sha);
        }
    }
    $caps = updaterCapabilities();
    if ($caps['gitAvailable']) {
        $r = updaterRunCommand('git rev-parse HEAD');
        if ($r['ok'] && preg_match('/^[a-f0-9]{7,40}$/i', $r['stdout'])) {
            return strtolower($r['stdout']);
        }
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
    // Keep last 20 snapshots
    if (count($entries) > 20) {
        $entries = array_slice($entries, -20);
    }
    @file_put_contents(UPDATER_HISTORY_FILE, json_encode([
        'updatedAt' => time(),
        'entries' => array_values($entries),
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

/**
 * Snapshot current install before applying a change (for rollback).
 */
function updaterPushHistorySnapshot(string $label = ''): void {
    $info = updaterReadBuildInfo();
    $commit = updaterInstalledCommit();
    $entry = [
        'capturedAt' => time(),
        'label' => $label !== '' ? $label : ('Before update @ ' . date('Y-m-d H:i:s')),
        'gitCommit' => $commit,
        'appVersion' => updaterInstalledVersion(),
        'releaseTag' => $info['releaseTag'] ?? null,
        'message' => $info['commitMessage'] ?? null,
    ];
    $entries = updaterReadHistory();
    // Avoid duplicate consecutive identical SHAs
    $last = $entries[count($entries) - 1] ?? null;
    if (is_array($last) && !empty($last['gitCommit']) && $last['gitCommit'] === $commit) {
        return;
    }
    $entries[] = $entry;
    updaterWriteHistory($entries);
}

function updaterHistoryPeek(): ?array {
    $entries = updaterReadHistory();
    if (empty($entries)) {
        return null;
    }
    return $entries[count($entries) - 1];
}

function updaterHistoryPop(): ?array {
    $entries = updaterReadHistory();
    if (empty($entries)) {
        return null;
    }
    $last = array_pop($entries);
    updaterWriteHistory($entries);
    return is_array($last) ? $last : null;
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
        'mode' => $mode,
        'projectRoot' => UPDATER_ROOT,
    ];
}

function updaterRunCommand(string $command, ?string $cwd = null): array {
    $cwd = $cwd ?: UPDATER_ROOT;
    $descriptor = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $proc = @proc_open($command, $descriptor, $pipes, $cwd);
    if (!is_resource($proc)) {
        return ['ok' => false, 'code' => 1, 'stdout' => '', 'stderr' => 'Failed to start process'];
    }
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $code = proc_close($proc);
    return [
        'ok' => $code === 0,
        'code' => $code,
        'stdout' => is_string($stdout) ? trim($stdout) : '',
        'stderr' => is_string($stderr) ? trim($stderr) : '',
    ];
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
    curl_close($ch);
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
    curl_close($ch);
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
function updaterFetchCommitsAhead(bool $force = false): array {
    $ttl = updaterCheckIntervalMinutes() * 60;
    $branch = updaterTrackBranch();
    $base = updaterInstalledCommit();

    if (!$force && is_file(UPDATER_COMMITS_CACHE_FILE)) {
        $raw = @file_get_contents(UPDATER_COMMITS_CACHE_FILE);
        $cache = $raw !== false ? json_decode($raw, true) : null;
        if (
            is_array($cache)
            && isset($cache['fetchedAt'], $cache['commits'])
            && ($cache['branch'] ?? '') === $branch
            && ($cache['base'] ?? null) === $base
            && (time() - (int)$cache['fetchedAt']) < $ttl
        ) {
            return $cache;
        }
    }

    $repo = updaterRepoSlug();
    $commits = [];
    $aheadBy = 0;
    $headSha = null;

    if ($base) {
        // compare base...branch
        $url = 'https://api.github.com/repos/' . $repo . '/compare/'
            . rawurlencode($base) . '...' . rawurlencode($branch);
        try {
            $payload = updaterHttpJson($url);
            $aheadBy = (int)($payload['ahead_by'] ?? 0);
            $headSha = $payload['commits'][count($payload['commits'] ?? []) - 1]['sha']
                ?? ($payload['merge_base_commit']['sha'] ?? null);
            // Prefer status head
            if (!empty($payload['commits']) && is_array($payload['commits'])) {
                // API returns oldest→newest; reverse for UI (newest first)
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
                    $commits[] = [
                        'sha' => $sha,
                        'shortSha' => substr($sha, 0, 7),
                        'message' => $subject,
                        'body' => $msg,
                        'author' => (string)($c['commit']['author']['name'] ?? $c['author']['login'] ?? ''),
                        'date' => (string)($c['commit']['author']['date'] ?? ''),
                        'htmlUrl' => (string)($c['html_url'] ?? ''),
                        'kind' => 'commit',
                    ];
                }
                if (!empty($commits)) {
                    $headSha = $commits[0]['sha'];
                }
            }
            // If identical / behind, ahead_by may be 0
        } catch (Throwable $e) {
            // Base SHA may be unknown to GitHub (local-only). Fall through to branch tip list.
            error_log('updater compare failed: ' . $e->getMessage());
        }
    }

    if ($base === null || ($aheadBy === 0 && empty($commits))) {
        // No known base, or compare empty: list recent branch commits and mark tip as available if different
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
                break; // reached installed commit
            }
            $msg = (string)($c['commit']['message'] ?? '');
            $subject = trim(explode("\n", $msg)[0]);
            $commits[] = [
                'sha' => $sha,
                'shortSha' => substr($sha, 0, 7),
                'message' => $subject,
                'body' => $msg,
                'author' => (string)($c['commit']['author']['name'] ?? $c['author']['login'] ?? ''),
                'date' => (string)($c['commit']['author']['date'] ?? ''),
                'htmlUrl' => (string)($c['html_url'] ?? ''),
                'kind' => 'commit',
            ];
        }
        $aheadBy = count($commits);
        $headSha = $commits[0]['sha'] ?? null;
        if ($base && !empty($commits)) {
            // If first commit equals base, no updates
            if (str_starts_with(strtolower($commits[0]['sha']), substr(strtolower($base), 0, 7))) {
                $commits = [];
                $aheadBy = 0;
            }
        }
    }

    $cache = [
        'fetchedAt' => time(),
        'repo' => $repo,
        'branch' => $branch,
        'base' => $base,
        'aheadBy' => $aheadBy,
        'headSha' => $headSha,
        'commits' => $commits,
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
        $message = $commit['message'] ?? ('Commit ' . substr($clean, 0, 7));
        return [
            'type' => 'sha',
            'ref' => $commit['sha'] ?? $clean,
            'version' => updaterInstalledVersion(), // keep version unless package.json changes after apply
            'message' => $message,
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
        $entry = $stat['name'];
        $rel = updaterResolveExtractRelative($entry);
        if ($rel === null) {
            continue;
        }
        if (str_ends_with($entry, '/')) {
            $dir = UPDATER_ROOT . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, rtrim($rel, '/'));
            if (!is_dir($dir)) {
                @mkdir($dir, 0755, true);
            }
            continue;
        }
        $target = UPDATER_ROOT . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
        $parent = dirname($target);
        if (!is_dir($parent)) {
            @mkdir($parent, 0755, true);
        }
        $content = $zip->getFromIndex($i);
        if ($content === false) {
            continue;
        }
        if (@file_put_contents($target, $content) === false) {
            $zip->close();
            throw new RuntimeException('Failed writing ' . $rel);
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

function updaterRebuildFrontend(): void {
    $caps = updaterCapabilities();
    if (!$caps['nodeAvailable']) {
        throw new RuntimeException('Node.js/npm required to rebuild after checkout');
    }
    updaterSetProgress(55, 'Installing npm dependencies...');
    $ci = updaterRunCommand('npm ci');
    if (!$ci['ok']) {
        updaterAppendLog('npm ci failed, trying npm install...');
        $ci = updaterRunCommand('npm install');
        if (!$ci['ok']) {
            throw new RuntimeException('npm install failed: ' . ($ci['stderr'] ?: $ci['stdout']));
        }
    }
    updaterSetProgress(75, 'Building frontend...');
    $build = updaterRunCommand('npm run build');
    if (!$build['ok']) {
        throw new RuntimeException('npm run build failed: ' . ($build['stderr'] ?: $build['stdout']));
    }
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

    updaterSetProgress(5, 'Applying ' . $label . ' via ' . $mode . ' mode...', 'running');

    if ($pushHistory) {
        updaterPushHistorySnapshot('Before applying ' . $label);
    }

    if ($mode === 'git') {
        if (updaterGitWorkingTreeDirty()) {
            throw new RuntimeException('Working tree has uncommitted changes. Commit or stash before updating.');
        }
        updaterSetProgress(20, 'Fetching from origin...');
        $fetch = updaterRunCommand('git fetch --tags --force origin');
        if (!$fetch['ok']) {
            throw new RuntimeException('git fetch failed: ' . ($fetch['stderr'] ?: $fetch['stdout']));
        }
        // Also fetch branch tips for commit SHAs
        updaterRunCommand('git fetch origin ' . escapeshellarg(updaterTrackBranch()));

        updaterSetProgress(40, 'Checking out ' . $label . '...');
        $co = updaterRunCommand('git checkout --force ' . escapeshellarg($ref));
        if (!$co['ok']) {
            throw new RuntimeException('git checkout failed: ' . ($co['stderr'] ?: $co['stdout']));
        }
        updaterRebuildFrontend();
        $commit = updaterRunCommand('git rev-parse HEAD');
        $pkgVer = updaterInstalledVersion();
        // After checkout, re-read package.json version if present
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
            // Commit / tag without asset: GitHub zipball (source). Reminder: needs npm on this host after extract OR prebuilt dist in tree.
            updaterSetProgress(15, 'Downloading source zipball for ' . $label . '...');
            $url = 'https://api.github.com/repos/' . $repo . '/zipball/' . rawurlencode($ref);
            // zipball prefers Accept application/vnd.github+json then follows to archive
            updaterDownloadZipball($url, $zipPath);
        }

        $bi = UPDATER_ROOT . '/BUILD_INFO.json';
        if (is_file($bi)) {
            @copy($bi, UPDATER_ROOT . '/data/BUILD_INFO.pre-update.json');
        }
        updaterSetProgress(55, 'Extracting update (preserving data/ and uploads/)...');
        updaterExtractUpdateZip($zipPath);
        @unlink($zipPath);

        // Rebuild if node available (zipball is source)
        if ($caps['nodeAvailable'] && is_file(UPDATER_ROOT . '/package.json')) {
            try {
                updaterRebuildFrontend();
            } catch (Throwable $e) {
                updaterAppendLog('Rebuild skipped/failed: ' . $e->getMessage());
            }
        }

        $pkgVer = (string)($target['version'] ?? updaterInstalledVersion());
        if (is_file(UPDATER_ROOT . '/package.json')) {
            $pkg = json_decode((string)@file_get_contents(UPDATER_ROOT . '/package.json'), true);
            if (is_array($pkg) && !empty($pkg['version'])) {
                $pkgVer = updaterNormalizeVersion((string)$pkg['version']);
            }
        }
        updaterWriteBuildInfo([
            'appVersion' => $pkgVer,
            'releaseTag' => $target['tag'] ?? null,
            'gitCommit' => $ref,
            'commitMessage' => $target['message'] ?? null,
            'trackBranch' => updaterTrackBranch(),
            'updatedVia' => 'zip',
            'updatedAt' => date('Y-m-d H:i:s'),
            'builtAt' => date('Y-m-d H:i:s'),
            'buildId' => date('Ymd-His'),
        ]);
    }

    updaterClearOpcache();
    // Invalidate commit cache after apply
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
    curl_close($ch);
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
 */
function updaterSpawnApplyWorker(string $spec): void {
    $scriptPath = __DIR__ . '/updater_apply_cli.php';
    $php = PHP_BINARY;
    if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
        $command = 'start /B "" ' . escapeshellarg($php) . ' ' . escapeshellarg($scriptPath) . ' ' . escapeshellarg($spec) . ' > NUL 2>&1';
        pclose(popen($command, 'r'));
    } else {
        $command = 'nohup ' . escapeshellarg($php) . ' ' . escapeshellarg($scriptPath) . ' ' . escapeshellarg($spec) . ' > /dev/null 2>&1 &';
        exec($command);
    }
}

function updaterCanApply(array $caps): bool {
    if ($caps['mode'] === 'git') {
        return $caps['gitAvailable'] && $caps['nodeAvailable'];
    }
    return $caps['zipAvailable'];
}

function updaterBuildStatusPayload(bool $forceCheck = false): array {
    $current = updaterInstalledVersion();
    $caps = updaterCapabilities();
    $error = null;
    $releases = [];
    $commits = [];
    $aheadBy = 0;
    $fetchedAt = null;
    $branch = updaterTrackBranch();
    $installedCommit = updaterInstalledCommit();

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
    } catch (Throwable $e) {
        $error = $error ? ($error . ' | ' . $e->getMessage()) : $e->getMessage();
    }

    $newerReleases = updaterNewerReleases($releases, $current);
    $latestRelease = $releases[0] ?? null;
    $latestCommit = $commits[0] ?? null;
    $buildInfo = updaterReadBuildInfo();
    $job = updaterReadJob();
    $history = updaterReadHistory();
    $canRollback = !empty($history);
    $rollbackTarget = $canRollback ? $history[count($history) - 1] : null;

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
        'historyCount' => count($history),
        'repo' => updaterRepoSlug(),
        'tokenConfigured' => updaterHasGithubToken(),
        'checkedAt' => $fetchedAt,
        'checkIntervalMinutes' => updaterCheckIntervalMinutes(),
        'job' => $job,
        'error' => $error,
    ];
}
