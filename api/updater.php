<?php
/**
 * App updater API — GitHub commits + Releases (admin only).
 * Routes: /api/updater/status|releases|commits|check|apply|rollback|job|history
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/updater_lib.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$AUTH_USER = requireAdmin();

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '/';
$path = rtrim($path, '/') ?: '/';

try {
    switch ($method) {
        case 'GET':
            if ($path === '/status' || $path === '/') {
                sendJSON(['data' => updaterBuildStatusPayload(false)]);
            } elseif ($path === '/releases') {
                $cache = updaterFetchReleases(false);
                $current = updaterInstalledVersion();
                $newer = updaterNewerReleases($cache['releases'] ?? [], $current);
                sendJSON([
                    'data' => [
                        'currentVersion' => $current,
                        'releases' => $newer,
                        'allReleases' => $cache['releases'] ?? [],
                        'fetchedAt' => $cache['fetchedAt'] ?? null,
                        'repo' => updaterRepoSlug(),
                    ],
                ]);
            } elseif ($path === '/commits') {
                $cache = updaterFetchCommitsAhead(false);
                sendJSON([
                    'data' => [
                        'branch' => $cache['branch'] ?? updaterTrackBranch(),
                        'base' => $cache['base'] ?? updaterInstalledCommit(),
                        'aheadBy' => $cache['aheadBy'] ?? 0,
                        'commits' => $cache['commits'] ?? [],
                        'fetchedAt' => $cache['fetchedAt'] ?? null,
                        'repo' => updaterRepoSlug(),
                    ],
                ]);
            } elseif ($path === '/history') {
                sendJSON(['data' => ['entries' => updaterReadHistory()]]);
            } elseif ($path === '/job') {
                sendJSON(['data' => updaterReadJob()]);
            } else {
                sendJSON(['error' => 'Invalid endpoint'], 404);
            }
            break;

        case 'POST':
            if ($path === '/check') {
                sendJSON(['data' => updaterBuildStatusPayload(true)]);
            } elseif ($path === '/apply') {
                handleUpdaterApply();
            } elseif ($path === '/rollback') {
                handleUpdaterRollback();
            } else {
                sendJSON(['error' => 'Invalid endpoint'], 404);
            }
            break;

        default:
            sendJSON(['error' => 'Method not allowed'], 405);
    }
} catch (Throwable $e) {
    error_log('updater API: ' . $e->getMessage());
    sendJSON(['error' => $e->getMessage()], 500);
}

function updaterParseJsonBody(): array {
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || $raw === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function handleUpdaterApply(): void {
    $input = updaterParseJsonBody();

    $existingJob = updaterReadJob();
    if (is_array($existingJob) && ($existingJob['status'] ?? '') === 'running') {
        sendJSON(['error' => 'An update is already in progress', 'data' => $existingJob], 409);
        return;
    }

    if (!updaterAcquireLock()) {
        sendJSON(['error' => 'Updater is locked (another update may be running)'], 409);
        return;
    }

    try {
        $tag = isset($input['tag']) ? trim((string)$input['tag']) : '';
        $sha = isset($input['sha']) ? trim((string)$input['sha']) : '';

        $target = updaterResolveApplyTarget(
            $tag !== '' ? $tag : null,
            $sha !== '' ? $sha : null
        );

        $caps = updaterCapabilities();
        if (!updaterCanApply($caps)) {
            updaterReleaseLock();
            sendJSON([
                'error' => $caps['mode'] === 'git'
                    ? 'Git mode requires .git plus git, node, and npm on PATH'
                    : 'ZIP mode requires ZipArchive and cURL',
            ], 400);
            return;
        }

        if ($caps['mode'] === 'git' && updaterGitWorkingTreeDirty()) {
            updaterReleaseLock();
            sendJSON(['error' => 'Working tree has uncommitted changes. Commit or stash before updating.'], 400);
            return;
        }

        $spec = ($target['type'] === 'sha')
            ? ('sha:' . $target['ref'])
            : ('tag:' . $target['ref']);

        $job = [
            'status' => 'running',
            'percent' => 0,
            'message' => 'Starting update...',
            'log' => ['[' . date('H:i:s') . '] Starting update to ' . $spec],
            'tag' => $target['tag'] ?? null,
            'sha' => $target['ref'],
            'version' => $target['version'] ?? null,
            'mode' => $caps['mode'],
            'startedAt' => time(),
            'updatedAt' => time(),
            'error' => null,
        ];
        updaterWriteJob($job);

        $canSpawn = function_exists('popen') || function_exists('exec');
        if ($canSpawn) {
            updaterSpawnApplyWorker($spec);
            sendJSON([
                'data' => [
                    'started' => true,
                    'async' => true,
                    'spec' => $spec,
                    'tag' => $target['tag'] ?? null,
                    'sha' => $target['ref'],
                    'mode' => $caps['mode'],
                    'job' => updaterReadJob(),
                ],
            ]);
            return;
        }

        @set_time_limit(0);
        try {
            updaterApplyTarget($target, true);
            updaterReleaseLock();
            sendJSON([
                'data' => [
                    'started' => true,
                    'async' => false,
                    'spec' => $spec,
                    'job' => updaterReadJob(),
                ],
            ]);
        } catch (Throwable $e) {
            updaterAppendLog('ERROR: ' . $e->getMessage());
            $job = updaterReadJob() ?: [];
            $job['status'] = 'error';
            $job['error'] = $e->getMessage();
            $job['message'] = $e->getMessage();
            updaterWriteJob($job);
            updaterReleaseLock();
            sendJSON(['error' => $e->getMessage(), 'data' => $job], 500);
        }
    } catch (Throwable $e) {
        updaterReleaseLock();
        throw $e;
    }
}

function handleUpdaterRollback(): void {
    $existingJob = updaterReadJob();
    if (is_array($existingJob) && ($existingJob['status'] ?? '') === 'running') {
        sendJSON(['error' => 'An update is already in progress', 'data' => $existingJob], 409);
        return;
    }

    $peek = updaterHistoryPeek();
    if (!$peek || empty($peek['gitCommit'])) {
        sendJSON(['error' => 'No rollback snapshot available'], 400);
        return;
    }

    if (!updaterAcquireLock()) {
        sendJSON(['error' => 'Updater is locked'], 409);
        return;
    }

    try {
        $caps = updaterCapabilities();
        if (!updaterCanApply($caps)) {
            updaterReleaseLock();
            sendJSON(['error' => 'Cannot rollback: git/node (or zip tools) not available'], 400);
            return;
        }
        if ($caps['mode'] === 'git' && updaterGitWorkingTreeDirty()) {
            updaterReleaseLock();
            sendJSON(['error' => 'Working tree has uncommitted changes. Commit or stash before rollback.'], 400);
            return;
        }

        $job = [
            'status' => 'running',
            'percent' => 0,
            'message' => 'Starting rollback...',
            'log' => ['[' . date('H:i:s') . '] Rollback to ' . substr((string)$peek['gitCommit'], 0, 7)],
            'sha' => $peek['gitCommit'],
            'mode' => $caps['mode'],
            'rollback' => true,
            'startedAt' => time(),
            'updatedAt' => time(),
            'error' => null,
        ];
        updaterWriteJob($job);

        $canSpawn = function_exists('popen') || function_exists('exec');
        if ($canSpawn) {
            updaterSpawnApplyWorker('rollback');
            sendJSON([
                'data' => [
                    'started' => true,
                    'async' => true,
                    'rollback' => true,
                    'target' => $peek,
                    'job' => updaterReadJob(),
                ],
            ]);
            return;
        }

        @set_time_limit(0);
        try {
            updaterExecuteRollback();
            updaterReleaseLock();
            sendJSON(['data' => ['started' => true, 'async' => false, 'job' => updaterReadJob()]]);
        } catch (Throwable $e) {
            updaterAppendLog('ERROR: ' . $e->getMessage());
            $job = updaterReadJob() ?: [];
            $job['status'] = 'error';
            $job['error'] = $e->getMessage();
            updaterWriteJob($job);
            updaterReleaseLock();
            sendJSON(['error' => $e->getMessage()], 500);
        }
    } catch (Throwable $e) {
        updaterReleaseLock();
        throw $e;
    }
}

/**
 * Pop history and apply previous snapshot. Used by CLI + inline path.
 */
function updaterExecuteRollback(): void {
    $snapshot = updaterHistoryPop();
    if (!$snapshot || empty($snapshot['gitCommit'])) {
        throw new RuntimeException('No rollback snapshot available');
    }
    // Push current state so user can undo the rollback
    updaterPushHistorySnapshot('Before rollback @ ' . date('Y-m-d H:i:s'));

    $target = [
        'type' => 'sha',
        'ref' => $snapshot['gitCommit'],
        'version' => $snapshot['appVersion'] ?? updaterInstalledVersion(),
        'message' => $snapshot['message'] ?? ('Rollback to ' . substr($snapshot['gitCommit'], 0, 7)),
        'tag' => $snapshot['releaseTag'] ?? null,
        'assetName' => null,
        'assetUrl' => null,
        'assetId' => null,
    ];
    // pushHistory=false because we already managed history above
    updaterApplyTarget($target, false);
}
