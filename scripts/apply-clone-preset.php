<?php
/**
 * After a host CLI clone copies files, initialize the target DB, apply a clone preset,
 * and write install_identity.php so login cookies stay isolated.
 *
 * Usage:
 *   php scripts/apply-clone-preset.php <target-dir> <folder-name> <preset> [url]
 *
 * Presets: empty | structure | full | demo
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This script can only be run from the command line.\n");
    exit(1);
}

$targetDir = $argv[1] ?? '';
$folderName = $argv[2] ?? '';
$preset = $argv[3] ?? 'empty';
$url = $argv[4] ?? null;

if ($targetDir === '' || $folderName === '') {
    fwrite(STDERR, "Usage: php apply-clone-preset.php <target-dir> <folder-name> <preset> [url]\n");
    exit(1);
}

$targetDir = rtrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $targetDir), DIRECTORY_SEPARATOR);
if (!is_dir($targetDir) || !is_file($targetDir . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'clone_service.php')) {
    fwrite(STDERR, "Target is not a valid LinkNest directory: {$targetDir}\n");
    exit(1);
}

chdir($targetDir);
require_once $targetDir . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'clone_service.php';

$env = linknestGetCloneRuntimeEnvironment();
if (!$env['cloneAllowed']) {
    fwrite(STDERR, ($env['message'] ?? linknestCloneUnavailableMessage()) . PHP_EOL);
    exit(1);
}

$preset = linknestNormalizeClonePreset($preset);

try {
    $svc = new CloneService(null, false);
    $svc->applyPostCopyPreset($targetDir, $preset);
    $info = linknestWriteInstallIdentity($targetDir, $folderName, is_string($url) ? $url : null);
    echo "preset={$preset} session={$info['sessionName']} path={$info['cookiePath']}" . PHP_EOL;
    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . PHP_EOL);
    exit(1);
}
