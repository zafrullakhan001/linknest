<?php
/**
 * Read-only runtime diagnostics (CLI only). Mirrors Admin → Tools → System Runtime.
 *
 * Usage:
 *   php api/runtime_check.php
 *   php api/runtime_check.php --json
 *   php api/runtime_check.php --markdown > runtime-report.md
 *   php api/runtime_check.php --force          # bypass the 6-hour vendor cache
 *
 * Nothing is installed, replaced or restarted by this script.
 * Guide: docs/RUNTIME_UPDATES.md
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/runtime_lib.php';

if (PHP_SAPI !== 'cli' && PHP_SAPI !== 'phpdbg') {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'CLI only. Use GET /api/runtime/status as an admin.']);
    exit(1);
}

$argvList = $argv ?? [];
$asJson = in_array('--json', $argvList, true);
$asMarkdown = in_array('--markdown', $argvList, true);
$force = in_array('--force', $argvList, true);

/** Windows consoles are not UTF-8 by default — keep the plain-text view readable. */
function runtimeCheckAscii(string $text): string
{
    return strtr($text, [
        '—' => '-',
        '–' => '-',
        '→' => '->',
        '·' => '|',
        '’' => "'",
        '“' => '"',
        '”' => '"',
        '…' => '...',
    ]);
}

try {
    $payload = runtimeBuildStatusPayload($force);
} catch (Throwable $e) {
    if ($asJson || $asMarkdown) {
        echo json_encode(['error' => $e->getMessage()], JSON_PRETTY_PRINT) . "\n";
    } else {
        fwrite(STDERR, 'ERROR: ' . $e->getMessage() . PHP_EOL);
    }
    exit(1);
}

if ($asMarkdown) {
    echo runtimeBuildMarkdownReport($payload) . "\n";
    exit(0);
}

if ($asJson) {
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
    exit(0);
}

$line = str_repeat('=', 72);
echo $line . PHP_EOL;
echo '  LinkNest - underlying software (read-only)' . PHP_EOL;
echo $line . PHP_EOL;
echo '  Host      : ' . (string)($payload['host']['os'] ?? '?') . PHP_EOL;
echo '  Layout    : ' . (string)($payload['layout']['label'] ?? '?') . ' (' . (string)($payload['layout']['id'] ?? '?') . ')' . PHP_EOL;
echo '  Summary   : ' . runtimeCheckAscii((string)($payload['summary']['message'] ?? '')) . PHP_EOL;
echo PHP_EOL . '  Current versions' . PHP_EOL;

$components = $payload['components'];
$phpInfo = $components['php']['info'];
$nodeInfo = $components['node']['info'];
$apacheInfo = $components['apache']['info'];
$sqliteInfo = $components['sqlite']['info'];
$gitInfo = $components['git']['info'];

echo '    PHP    : ' . (string)$phpInfo['version'] . ' ' . (!empty($phpInfo['zts']) ? 'TS' : 'NTS')
    . ' ' . (string)$phpInfo['arch'] . ' | ' . (string)$phpInfo['sapi']
    . ' | ' . (string)($phpInfo['iniPath'] ?? 'php.ini unknown') . PHP_EOL;
echo '    Node   : ' . (string)($nodeInfo['version'] ?? 'not installed') . ' ' . (string)($nodeInfo['arch'] ?? '')
    . ' | ' . (string)($nodeInfo['path'] ?? 'path unknown') . PHP_EOL;
echo '    npm    : ' . (string)($nodeInfo['npmVersion'] ?? 'unknown') . PHP_EOL;
echo '    Apache : ' . (string)($apacheInfo['version'] ?? 'unknown') . ' | ' . (string)($apacheInfo['path'] ?? 'not found') . PHP_EOL;
echo '    SQLite : ' . (string)($sqliteInfo['engineVersion'] ?? 'unknown') . ' | ' . (string)($sqliteInfo['journalMode'] ?? '?')
    . ' | schema ' . (string)($sqliteInfo['schemaVersion'] ?? '?') . ' | ' . runtimeFormatBytes((int)($sqliteInfo['dbBytes'] ?? 0)) . PHP_EOL;
echo '    git    : ' . (string)($gitInfo['version'] ?? 'not found') . ' | app ' . (string)($gitInfo['appVersion'] ?? '?') . PHP_EOL;

$php = $components['php']['update'];
$node = $components['node']['update'];
echo PHP_EOL . '  Available patches' . PHP_EOL;
echo '    PHP    : ' . (string)$php['currentVersion'] . ' -> ' . (string)($php['latestForLine'] ?? 'n/a')
    . '  [' . (string)$php['status'] . (!empty($php['security']) ? ', security' : '') . ']' . PHP_EOL;
echo '    Node   : ' . (string)($node['currentVersion'] ?? 'n/a') . ' -> ' . (string)($node['latestForLine'] ?? 'n/a')
    . '  [' . (string)$node['status'] . (!empty($node['security']) ? ', security' : '') . ']' . PHP_EOL;
echo '    (Apache and SQLite are reported for information - check the vendor page / distro packages.)' . PHP_EOL;

foreach (['php', 'node', 'apache', 'sqlite'] as $key) {
    $instructions = $components[$key]['instructions'] ?? null;
    if (!is_array($instructions) || empty($instructions['steps'])) {
        continue;
    }
    echo PHP_EOL . '  ' . strtoupper($key) . ' - commands (copy/paste; nothing is executed here)' . PHP_EOL;
    if (!empty($instructions['downtime']['window'])) {
        echo '    Downtime: ' . runtimeCheckAscii((string)$instructions['downtime']['window']) . PHP_EOL;
    }
    foreach ($instructions['steps'] as $step) {
        echo '    - ' . runtimeCheckAscii((string)($step['title'] ?? 'step')) . PHP_EOL;
        foreach (explode("\n", rtrim((string)($step['code'] ?? ''))) as $codeLine) {
            echo '        ' . $codeLine . PHP_EOL;
        }
    }
}

echo PHP_EOL . '  Sources' . PHP_EOL;
foreach (($payload['sources'] ?? []) as $key => $source) {
    echo '    ' . $key . ': ' . (string)($source['source'] ?? '?')
        . (!empty($source['stale']) ? ' (cached)' : '')
        . (!empty($source['error']) ? ' - ' . (string)$source['error'] : '') . PHP_EOL;
}
echo $line . PHP_EOL;
echo '  This command only reads. Guide: docs/RUNTIME_UPDATES.md' . PHP_EOL;
echo $line . PHP_EOL;

exit(0);
