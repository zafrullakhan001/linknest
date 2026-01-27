<?php
/**
 * Export SQLite LinkNest data to MariaDB-compatible SQL (INSERTs).
 * Run with MariaDB schema already applied; this script only exports data.
 *
 * Usage: php export_sqlite_to_mariadb.php [sqlite_db_path] [output.sql]
 *
 * Examples:
 *   php export_sqlite_to_mariadb.php
 *   php export_sqlite_to_mariadb.php ../data/linknest.db
 *   php export_sqlite_to_mariadb.php ../data/linknest.db ../data/linknest_data_mariadb.sql
 *
 * Then in MariaDB:
 *   mysql -u user -p linknest < linknest_data_mariadb.sql
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

$baseDir = dirname(__DIR__);
$defaultDbPath = $baseDir . '/data/linknest.db';
$defaultOutput = $baseDir . '/data/linknest_data_mariadb.sql';

$sqlitePath = $argv[1] ?? $defaultDbPath;
$outputPath = $argv[2] ?? $defaultOutput;

if (!file_exists($sqlitePath)) {
    fwrite(STDERR, "Error: SQLite database not found: {$sqlitePath}\n");
    exit(1);
}

if (!extension_loaded('pdo_sqlite')) {
    fwrite(STDERR, "Error: PDO SQLite extension is required.\n");
    exit(1);
}

$pdo = new PDO('sqlite:' . $sqlitePath, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

/** Escape a value for MariaDB single-quoted string and backtick identifiers */
function escape_mariadb_string($value): string {
    if ($value === null) {
        return 'NULL';
    }
    return "'" . str_replace(
        ['\\', "'", "\n", "\r", "\x00"],
        ['\\\\', "\\'", "\\n", "\\r", "\\0"],
        (string) $value
    ) . "'";
}

function quote_identifier(string $name): string {
    return '`' . str_replace('`', '``', $name) . '`';
}

/** Tables in dependency-safe order (parents before children) for cleaner output */
$tableOrder = [
    'users',
    'tiles',
    'tile_versions',
    'tabs',
    'sections',
    'links',
    'rich_text_content',
    'settings',
    'addon_status',
    'tile_arrangements',
    'category_arrangements',
    'tile_messages',
    'user_tile_favorites',
    'user_link_favorites',
    'user_tile_permissions',
    'clones',
    'user_preferences',
    'user_custom_timezones',
    'user_alarms',
    'user_notes',
    'broadcast_messages',
    'chat_messages',
    'monitors',
    'user_monitor_permissions',
    'monitor_logs',
    'monitor_notification_rules',
    'smtp_servers',
    'monitor_notification_recipients',
    'monitor_notification_logs',
    'email_outbox',
    'roles',
    'user_roles',
    'role_tile_permissions',
    'role_link_permissions',
    'role_tab_permissions',
    'role_widget_permissions',
    'custom_widgets',
    'user_groups',
    'user_group_members',
    'group_roles',
    'group_tile_permissions',
    'style_profiles',
];

$existingTables = [];
$stmt = $pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
while (($name = $stmt->fetchColumn()) !== false) {
    $existingTables[$name] = true;
}

$out = fopen($outputPath, 'wb');
if ($out === false) {
    fwrite(STDERR, "Error: Cannot write output file: {$outputPath}\n");
    exit(1);
}

fwrite($out, "-- LinkNest data export from SQLite for MariaDB\n");
fwrite($out, "-- Generated " . date('Y-m-d H:i:s') . "\n\n");
fwrite($out, "SET NAMES utf8mb4;\n");
fwrite($out, "SET FOREIGN_KEY_CHECKS = 0;\n\n");

$totalRows = 0;
foreach ($tableOrder as $table) {
    if (!isset($existingTables[$table])) {
        continue;
    }

    $columns = [];
    foreach ($pdo->query("PRAGMA table_info(" . $pdo->quote($table) . ")") as $col) {
        $columns[] = $col['name'];
    }
    if (empty($columns)) {
        continue;
    }

    $quotedColumns = array_map('quote_identifier', $columns);
    $tableQuoted = quote_identifier($table);
    $stmt = $pdo->query("SELECT * FROM " . $table);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $count = count($rows);

    if ($count === 0) {
        continue;
    }

    fwrite($out, "-- {$table} ({$count} rows)\n");
    $colList = implode(', ', $quotedColumns);

    $batchSize = 100;
    $batches = array_chunk($rows, $batchSize);
    foreach ($batches as $batch) {
        $values = [];
        foreach ($batch as $row) {
            $rowValues = [];
            foreach ($columns as $c) {
                $v = $row[$c] ?? null;
                if ($v === null) {
                    $rowValues[] = 'NULL';
                } else {
                    $rowValues[] = escape_mariadb_string($v);
                }
            }
            $values[] = '(' . implode(', ', $rowValues) . ')';
        }
        fwrite($out, "INSERT INTO {$tableQuoted} ({$colList}) VALUES\n  " . implode(",\n  ", $values) . ";\n\n");
    }
    $totalRows += $count;
}

fwrite($out, "SET FOREIGN_KEY_CHECKS = 1;\n");
fwrite($out, "-- Total rows: {$totalRows}\n");
fclose($out);

echo "Exported {$totalRows} rows to {$outputPath}\n";
echo "Import in MariaDB with: mysql -u user -p linknest < " . basename($outputPath) . "\n";
