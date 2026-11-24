<?php
/**
 * Background worker: apply update or rollback.
 * Usage:
 *   php api/updater_apply_cli.php tag:v2.2.0
 *   php api/updater_apply_cli.php sha:abc1234
 *   php api/updater_apply_cli.php rollback
 * Options (backupDatabase / historyId / restoreDatabase) are read from data/updater-job.json.
 */

@ini_set('max_execution_time', '0');
@ini_set('memory_limit', '512M');
@set_time_limit(0);

error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/updater_lib.php';

if (php_sapi_name() !== 'cli') {
    fwrite(STDERR, "CLI only\n");
    exit(1);
}

if ($argc < 2) {
    fwrite(STDERR, "Usage: php updater_apply_cli.php tag:vX.Y.Z|sha:HASH|rollback\n");
    exit(1);
}

$spec = trim((string)$argv[1]);
fwrite(STDERR, "updater_apply_cli: starting {$spec}\n");
error_log("updater_apply_cli: starting {$spec}");

try {
    updaterEnsureGitSafeDirectory();

    if (strcasecmp($spec, 'rollback') === 0) {
        $job = updaterReadJob() ?: [];
        $job['status'] = 'running';
        $job['rollback'] = true;
        $job['startedAt'] = $job['startedAt'] ?? time();
        updaterWriteJob($job);

        updaterExecuteRollback();
        updaterReleaseLock();
        error_log('updater_apply_cli: rollback success');
        exit(0);
    }

    $tag = null;
    $sha = null;
    if (str_starts_with($spec, 'sha:')) {
        $sha = substr($spec, 4);
    } elseif (str_starts_with($spec, 'tag:')) {
        $tag = substr($spec, 4);
    } else {
        $tag = $spec;
    }

    $target = updaterResolveApplyTarget($tag, $sha);

    $job = updaterReadJob() ?: [];
    $job['status'] = 'running';
    $job['tag'] = $target['tag'] ?? null;
    $job['sha'] = $target['ref'];
    $job['version'] = $target['version'] ?? null;
    $job['startedAt'] = $job['startedAt'] ?? time();
    updaterWriteJob($job);

    updaterApplyTarget($target, true);
    updaterReleaseLock();
    error_log("updater_apply_cli: success for {$spec}");
    exit(0);
} catch (Throwable $e) {
    error_log('updater_apply_cli ERROR: ' . $e->getMessage());
    updaterAppendLog('ERROR: ' . $e->getMessage());
    $job = updaterReadJob() ?: [];
    $job['status'] = 'error';
    $job['error'] = $e->getMessage();
    $job['message'] = $e->getMessage();
    $job['percent'] = (int)($job['percent'] ?? 0);
    updaterWriteJob($job);
    updaterReleaseLock();
    exit(1);
}
