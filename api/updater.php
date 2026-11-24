<?php
/**
 * App updater API — GitHub commits + Releases (admin only).
 * Routes: /api/updater/status|releases|commits|preview|check|apply|rollback|job|history
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
            } elseif ($path === '/preview') {
                $tag = isset($_GET['tag']) ? trim((string)$_GET['tag']) : '';
                $sha = isset($_GET['sha']) ? trim((string)$_GET['sha']) : '';
                if ($tag === '' && $sha === '') {
                    sendJSON(['error' => 'Provide sha= or tag= query parameter'], 400);
                    break;
                }
                sendJSON([
                    'data' => updaterBuildPreview(
                        $tag !== '' ? $tag : null,
                        $sha !== '' ? $sha : null
                    ),
                ]);
            } elseif ($path === '/history') {
                sendJSON([
                    'data' => [
                        'entries' => updaterHistoryForApi(),
                        'dbSnapshots' => updaterListDbSnapshots(),
                    ],
                ]);
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

    updaterRecoverStaleApplyState();

    $existingJob = updaterReadJob();
    if (is_array($existingJob) && ($existingJob['status'] ?? '') === 'running') {
        sendJSON(['error' => 'An update is already in progress', 'data' => $existingJob], 409);
        return;
    }

    if (!updaterAcquireLock()) {
        updaterRecoverStaleApplyState(true);
        if (!updaterAcquireLock()) {
            sendJSON(['error' => 'Updater is locked (another update may be running)'], 409);
            return;
        }
    }

    try {
        $tag = isset($input['tag']) ? trim((string)$input['tag']) : '';
        $sha = isset($input['sha']) ? trim((string)$input['sha']) : '';
        // Default ON when omitted
        $backupDatabase = !array_key_exists('backupDatabase', $input) || !empty($input['backupDatabase']);

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

        $spec = ($target['type'] === 'sha')
            ? ('sha:' . $target['ref'])
            : ('tag:' . $target['ref']);

        $previewFiles = isset($input['previewFilesChanged']) ? (int)$input['previewFilesChanged'] : null;
        $previewBytes = isset($input['previewApproxBytes']) ? (int)$input['previewApproxBytes'] : null;

        $job = [
            'status' => 'running',
            'percent' => 0,
            'message' => 'Starting update...',
            'log' => ['[' . date('H:i:s') . '] Starting update to ' . $spec],
            'tag' => $target['tag'] ?? null,
            'sha' => $target['ref'],
            'version' => $target['version'] ?? null,
            'mode' => $caps['mode'],
            'backupDatabase' => $backupDatabase,
            'previewFilesChanged' => $previewFiles,
            'previewApproxBytes' => $previewBytes,
            'startedAt' => time(),
            'updatedAt' => time(),
            'error' => null,
        ];
        updaterWriteJob($job);

        // Windows/XAMPP: inline under Apache (detached SYSTEM workers are unreliable).
        $preferInline = updaterIsWindows();
        $canSpawn = !$preferInline && (function_exists('popen') || function_exists('exec'));
        if ($canSpawn && updaterSpawnApplyWorker($spec)) {
            sendJSON([
                'data' => [
                    'started' => true,
                    'async' => true,
                    'spec' => $spec,
                    'tag' => $target['tag'] ?? null,
                    'sha' => $target['ref'],
                    'mode' => $caps['mode'],
                    'backupDatabase' => $backupDatabase,
                    'job' => updaterReadJob(),
                ],
            ]);
            return;
        }

        updaterAppendLog($preferInline
            ? 'Running update inline (Windows/XAMPP)...'
            : 'Running update inline (background spawn unavailable)...');
        @ignore_user_abort(true);
        @set_time_limit(0);
        try {
            updaterApplyTarget($target, true);
            updaterReleaseLock();
            sendJSON([
                'data' => [
                    'started' => true,
                    'async' => false,
                    'spec' => $spec,
                    'backupDatabase' => $backupDatabase,
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
    $input = updaterParseJsonBody();
    updaterRecoverStaleApplyState();

    $existingJob = updaterReadJob();
    if (is_array($existingJob) && ($existingJob['status'] ?? '') === 'running') {
        sendJSON(['error' => 'An update is already in progress', 'data' => $existingJob], 409);
        return;
    }

    $historyId = isset($input['historyId']) ? trim((string)$input['historyId']) : '';
    $restoreDatabase = !array_key_exists('restoreDatabase', $input) || !empty($input['restoreDatabase']);

    if ($historyId !== '') {
        $peek = updaterHistoryFindById($historyId);
    } else {
        // Legacy: roll back to newest entry
        $peek = updaterHistoryPeek();
    }
    if (!$peek || empty($peek['gitCommit'])) {
        sendJSON(['error' => 'No rollback snapshot available'], 400);
        return;
    }
    if (empty($peek['id'])) {
        $peek['id'] = 'legacy_' . (string)($peek['capturedAt'] ?? 0);
    }

    if (!updaterAcquireLock()) {
        updaterRecoverStaleApplyState(true);
        if (!updaterAcquireLock()) {
            sendJSON(['error' => 'Updater is locked'], 409);
            return;
        }
    }

    try {
        $caps = updaterCapabilities();
        if (!updaterCanApply($caps)) {
            updaterReleaseLock();
            sendJSON(['error' => 'Cannot rollback: git/node (or zip tools) not available'], 400);
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
            'historyId' => $peek['id'],
            'restoreDatabase' => $restoreDatabase,
            'backupDatabase' => false,
            'startedAt' => time(),
            'updatedAt' => time(),
            'error' => null,
        ];
        updaterWriteJob($job);

        $preferInline = updaterIsWindows();
        $canSpawn = !$preferInline && (function_exists('popen') || function_exists('exec'));
        if ($canSpawn && updaterSpawnApplyWorker('rollback')) {
            sendJSON([
                'data' => [
                    'started' => true,
                    'async' => true,
                    'rollback' => true,
                    'target' => $peek,
                    'restoreDatabase' => $restoreDatabase,
                    'job' => updaterReadJob(),
                ],
            ]);
            return;
        }

        updaterAppendLog($preferInline
            ? 'Running rollback inline (Windows/XAMPP)...'
            : 'Running rollback inline (background spawn unavailable)...');
        @ignore_user_abort(true);
        @set_time_limit(0);
        try {
            updaterExecuteRollbackToEntry($peek, $restoreDatabase);
            updaterReleaseLock();
            sendJSON([
                'data' => [
                    'started' => true,
                    'async' => false,
                    'restoreDatabase' => $restoreDatabase,
                    'job' => updaterReadJob(),
                ],
            ]);
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
 * CLI / legacy helper — prefers job.historyId when present.
 */
function updaterExecuteRollback(): void {
    $job = updaterReadJob() ?: [];
    $historyId = isset($job['historyId']) ? trim((string)$job['historyId']) : '';
    $restoreDatabase = !array_key_exists('restoreDatabase', $job) || !empty($job['restoreDatabase']);

    if ($historyId !== '') {
        $snapshot = updaterHistoryFindById($historyId);
    } else {
        $snapshot = updaterHistoryPop();
    }
    if (!$snapshot || empty($snapshot['gitCommit'])) {
        throw new RuntimeException('No rollback snapshot available');
    }
    updaterExecuteRollbackToEntry($snapshot, $restoreDatabase);
}
