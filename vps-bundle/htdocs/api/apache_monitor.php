<?php
/**
 * Apache monitoring dashboard API (admin only).
 * GET  /api/apache-monitor
 * POST /api/apache-monitor/purge-logs       { target: "apache"|"php"|"all", confirm: true }
 * POST /api/apache-monitor/enable-opcache   { confirm: true }
 * POST /api/apache-monitor/restart-apache   { confirm: true }
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/app_presence_lib.php';
require_once __DIR__ . '/apache_monitor_lib.php';
if (is_file(__DIR__ . '/user_audit_helper.php')) {
    require_once __DIR__ . '/user_audit_helper.php';
}

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$sub = rtrim((string) ($_SERVER['PATH_INFO'] ?? '/'), '/');
if ($sub === '') {
    $sub = '/';
}

requireAdmin();
if (function_exists('linknestReleaseSessionLock')) {
    linknestReleaseSessionLock();
}

function apacheMonitorRequireConfirm(array $input, string $error): void
{
    $confirm = $input['confirm'] ?? false;
    if ($confirm !== true && $confirm !== 1 && $confirm !== 'true' && $confirm !== '1') {
        sendJSON(['error' => $error], 400);
    }
}

if ($method === 'POST' && ($sub === '/purge-logs' || $sub === 'purge-logs')) {
    $input = getJSONInput();
    apacheMonitorRequireConfirm($input, 'Set confirm to true to empty log files.');
    $target = strtolower(trim((string) ($input['target'] ?? '')));
    if (!in_array($target, ['apache', 'php', 'all'], true)) {
        sendJSON(['error' => 'target must be apache, php, or all'], 400);
    }

    try {
        $result = apacheMonitorPurgeLogs($target);
    } catch (InvalidArgumentException $e) {
        sendJSON(['error' => $e->getMessage()], 400);
    } catch (Throwable $e) {
        error_log('apache_monitor purge failed: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to purge log files'], 500);
    }

    if (function_exists('logUserAudit')) {
        logUserAudit('apache_monitor.logs_purged', [
            'details' => [
                'target' => $target,
                'freedBytes' => $result['freedBytes'] ?? 0,
                'files' => array_map(static function ($row) {
                    return [
                        'label' => $row['label'] ?? '',
                        'ok' => !empty($row['ok']),
                    ];
                }, $result['purged'] ?? []),
            ],
        ]);
    }

    sendJSON(['success' => true] + $result);
}

if ($method === 'POST' && ($sub === '/enable-opcache' || $sub === 'enable-opcache')) {
    $input = getJSONInput();
    apacheMonitorRequireConfirm($input, 'Set confirm to true to update php.ini.');

    try {
        $result = apacheMonitorEnableOpcache();
    } catch (RuntimeException $e) {
        sendJSON(['error' => $e->getMessage()], 400);
    } catch (Throwable $e) {
        error_log('apache_monitor enable-opcache failed: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to update php.ini'], 500);
    }

    if (function_exists('logUserAudit')) {
        logUserAudit('apache_monitor.opcache_enabled', [
            'details' => [
                'phpIni' => $result['phpIni'] ?? null,
                'changed' => $result['changed'] ?? [],
            ],
        ]);
    }

    sendJSON(['success' => true] + $result);
}

if ($method === 'POST' && ($sub === '/restart-apache' || $sub === 'restart-apache')) {
    $input = getJSONInput();
    apacheMonitorRequireConfirm($input, 'Set confirm to true to restart Apache.');

    try {
        $result = apacheMonitorRestartApache();
    } catch (RuntimeException $e) {
        sendJSON(['error' => $e->getMessage()], 400);
    } catch (Throwable $e) {
        error_log('apache_monitor restart-apache failed: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to restart Apache'], 500);
    }

    if (function_exists('logUserAudit')) {
        logUserAudit('apache_monitor.apache_restarted', [
            'details' => [
                'method' => $result['method'] ?? null,
                'binary' => $result['binary'] ?? null,
                'service' => $result['service'] ?? null,
            ],
        ]);
    }

    sendJSON(['success' => true] + $result);
}

if ($method !== 'GET' || ($sub !== '/' && $sub !== '')) {
    sendJSON(['error' => 'Method not allowed'], 405);
}

try {
    $db = getDB();
} catch (Throwable $e) {
    error_log('apache_monitor getDB failed: ' . $e->getMessage());
    sendJSON(['error' => 'Failed to connect to database'], 500);
    exit;
}

try {
    $fresh = isset($_GET['fresh']) && ($_GET['fresh'] === '1' || $_GET['fresh'] === 'true');
    $payload = apacheMonitorBuildDashboard($db, $fresh);
    sendJSON($payload);
} catch (Throwable $e) {
    error_log('apache_monitor failed: ' . $e->getMessage());
    sendJSON(['error' => 'Failed to load Apache monitoring data'], 500);
}
