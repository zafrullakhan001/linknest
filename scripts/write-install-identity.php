<?php
/**
 * Write data/install_identity.php for a clone or Docker container.
 *
 * Usage:
 *   php scripts/write-install-identity.php <app-root> <folder-name> [url]
 *
 * Examples:
 *   php scripts/write-install-identity.php C:\xampp\htdocs\myspaces myspaces http://localhost/myspaces/
 *   php scripts/write-install-identity.php /var/www/html docker http://localhost:8090/
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This script can only be run from the command line.\n");
    exit(1);
}

require_once dirname(__DIR__) . '/api/session_bootstrap.php';

$appRoot = $argv[1] ?? '';
$folderName = $argv[2] ?? '';
$url = $argv[3] ?? null;

if ($appRoot === '' || $folderName === '') {
    fwrite(STDERR, "Usage: php write-install-identity.php <app-root> <folder-name> [url]\n");
    exit(1);
}

try {
    $info = linknestWriteInstallIdentity($appRoot, $folderName, $url);
    echo "session=" . $info['sessionName'] . " path=" . $info['cookiePath'] . PHP_EOL;
    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . PHP_EOL);
    exit(1);
}
