<?php
/**
 * Shared JSON database export/import used by Admin → Database and MCP.
 * Export files live in data/exports/ (gitignored with the rest of data/).
 */

const LINKNEST_DB_EXPORT_VERSION = '3.1';
const LINKNEST_DB_EXPORT_MAX_BYTES = 536870912; // 512 MB

function linknestDatabaseExportTableNames(): array
{
    return [
        'users', 'tiles', 'tabs', 'sections', 'links', 'settings',
        'tile_arrangements', 'category_arrangements', 'rich_text_content',
        'user_tile_favorites', 'user_link_favorites', 'user_tile_permissions',
        'style_profiles', 'user_preferences', 'user_custom_timezones', 'user_alarms',
        'category_visibility_presets',
        'monitors', 'monitor_logs', 'user_monitor_permissions',
        'monitor_notification_rules', 'monitor_notification_recipients', 'monitor_notification_logs',
        'email_outbox',
        'speedtest_schedules', 'speedtest_results',
        'browser_list', 'browser_list_metadata',
        'roles', 'user_roles', 'role_tile_permissions', 'role_link_permissions', 'role_tab_permissions',
        'user_audit_log',
        'user_two_factor', 'user_two_factor_devices',
    ];
}

function linknestDatabaseImportClearTableNames(): array
{
    return [
        'speedtest_results', 'speedtest_worker_queue', 'speedtest_schedules',
        'monitor_notification_logs', 'monitor_notification_recipients', 'monitor_notification_rules',
        'user_monitor_permissions', 'email_outbox',
        'monitor_logs', 'monitors',
        'role_link_permissions', 'role_tile_permissions', 'role_tab_permissions', 'user_roles',
        'user_tile_permissions', 'user_link_favorites', 'user_tile_favorites',
        'user_preferences', 'user_custom_timezones', 'user_alarms', 'category_visibility_presets', 'user_audit_log',
        'rich_text_content', 'category_arrangements', 'tile_arrangements',
        'links', 'sections', 'tabs', 'tiles',
        'browser_list', 'browser_list_metadata',
        'user_two_factor_devices', 'user_two_factor',
        'style_profiles', 'settings', 'roles', 'users',
    ];
}

function linknestIsSafeSqlIdent(string $name): bool
{
    return (bool)preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $name);
}

function linknestFormatBytes(int $bytes, int $precision = 2): string
{
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $bytes = max($bytes, 0);
    $pow = (int)floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $value = $pow > 0 ? $bytes / pow(1024, $pow) : $bytes;
    return round($value, $precision) . ' ' . $units[$pow];
}

function linknestPathIsInside(string $path, string $directory): bool
{
    $norm = static function (string $p): string {
        return strtolower(str_replace('\\', '/', $p));
    };
    $dir = rtrim($norm($directory), '/') . '/';
    $path = $norm($path);
    return $path === rtrim($dir, '/') || str_starts_with($path, $dir);
}

function linknestDatabaseExportsDir(bool $create = true): string
{
    $dir = rtrim((string)DB_DIR, '/\\') . DIRECTORY_SEPARATOR . 'exports';
    if ($create && !is_dir($dir)) {
        if (!mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new RuntimeException('Failed to create database exports directory.');
        }
    }
    return $dir;
}

function linknestSanitizeExportBasename(?string $name, bool $allowEmpty = false): string
{
    $name = trim((string)$name);
    if ($name === '') {
        if ($allowEmpty) {
            return '';
        }
        return 'linknest-database-export-' . date('Y-m-d-His') . '.json';
    }
    $base = basename(str_replace('\\', '/', $name));
    $base = preg_replace('/[^A-Za-z0-9._-]/', '_', $base) ?? '';
    if ($base === '' || $base === '.' || $base === '..') {
        throw new InvalidArgumentException('Invalid export filename.');
    }
    if (!preg_match('/\.json$/i', $base)) {
        $base .= '.json';
    }
    return $base;
}

function linknestResolveExportPath(string $filename, bool $mustExist): string
{
    $base = linknestSanitizeExportBasename($filename);
    $dir = linknestDatabaseExportsDir(!$mustExist);
    $realDir = realpath($dir);
    if ($realDir === false) {
        if ($mustExist) {
            throw new InvalidArgumentException('Export file not found: ' . $base);
        }
        throw new RuntimeException('Exports directory is not available.');
    }
    $path = $realDir . DIRECTORY_SEPARATOR . $base;
    if ($mustExist) {
        if (!is_file($path)) {
            throw new InvalidArgumentException('Export file not found: ' . $base);
        }
        $real = realpath($path);
        if ($real === false || !linknestPathIsInside($real, $realDir)) {
            throw new InvalidArgumentException('Invalid export path.');
        }
        return $real;
    }
    $parent = realpath(dirname($path));
    if ($parent === false || !linknestPathIsInside($parent, $realDir)) {
        throw new InvalidArgumentException('Invalid export path.');
    }
    return $path;
}

function linknestBuildDatabaseExport(PDO $db): array
{
    $export = [
        'version' => LINKNEST_DB_EXPORT_VERSION,
        'exported_at' => time(),
        'tables' => [],
    ];
    foreach (linknestDatabaseExportTableNames() as $table) {
        if (!linknestIsSafeSqlIdent($table)) {
            continue;
        }
        try {
            $stmt = $db->query('SELECT * FROM "' . $table . '"');
            $export['tables'][$table] = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
        } catch (PDOException $e) {
            $export['tables'][$table] = [];
        }
    }
    return $export;
}

function linknestDatabaseExportCounts(array $export): array
{
    $counts = [];
    $tables = $export['tables'] ?? [];
    if (!is_array($tables)) {
        return $counts;
    }
    foreach ($tables as $table => $rows) {
        $counts[(string)$table] = is_array($rows) ? count($rows) : 0;
    }
    return $counts;
}

function linknestWriteDatabaseExportFile(PDO $db, ?string $filename = null): array
{
    $export = linknestBuildDatabaseExport($db);
    $path = linknestResolveExportPath($filename ?? '', false);
    $json = json_encode($export, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        throw new RuntimeException('Failed to encode database export JSON.');
    }
    if (file_put_contents($path, $json, LOCK_EX) === false) {
        throw new RuntimeException('Failed to write database export file.');
    }
    $size = (int)@filesize($path);
    $base = basename($path);
    return [
        'success' => true,
        'filename' => $base,
        'path' => 'data/exports/' . $base,
        'absolute_path' => $path,
        'size' => $size,
        'size_formatted' => linknestFormatBytes($size),
        'version' => $export['version'],
        'exported_at' => $export['exported_at'],
        'exported_at_formatted' => date('Y-m-d H:i:s', (int)$export['exported_at']),
        'tables' => linknestDatabaseExportCounts($export),
        'note' => 'The JSON file contains password hashes and other secrets. Do not paste file contents into chat.',
    ];
}

function linknestListDatabaseExports(): array
{
    $dir = linknestDatabaseExportsDir(true);
    $files = glob($dir . DIRECTORY_SEPARATOR . '*.json') ?: [];
    $exports = [];
    foreach ($files as $file) {
        if (!is_file($file)) {
            continue;
        }
        $mtime = (int)filemtime($file);
        $size = (int)filesize($file);
        $exports[] = [
            'filename' => basename($file),
            'path' => 'data/exports/' . basename($file),
            'size' => $size,
            'size_formatted' => linknestFormatBytes($size),
            'modified_at' => $mtime,
            'modified_at_formatted' => date('Y-m-d H:i:s', $mtime),
        ];
    }
    usort($exports, static function ($a, $b) {
        return ($b['modified_at'] ?? 0) <=> ($a['modified_at'] ?? 0);
    });
    return [
        'directory' => 'data/exports',
        'absolute_directory' => $dir,
        'count' => count($exports),
        'exports' => $exports,
    ];
}

function linknestGetDatabaseInfo(): array
{
    $dbPath = DB_PATH;
    $exists = is_file($dbPath);
    $size = $exists ? (int)filesize($dbPath) : 0;
    $modified = $exists ? (int)filemtime($dbPath) : null;
    $stats = null;
    if ($exists) {
        try {
            $db = getDB();
            $stats = [
                'page_count' => (int)$db->query('PRAGMA page_count')->fetchColumn(),
                'page_size' => (int)$db->query('PRAGMA page_size')->fetchColumn(),
                'journal_mode' => (string)$db->query('PRAGMA journal_mode')->fetchColumn(),
                'user_version' => (int)$db->query('PRAGMA user_version')->fetchColumn(),
            ];
            $tableCounts = [];
            foreach (linknestDatabaseExportTableNames() as $table) {
                if (!linknestIsSafeSqlIdent($table)) {
                    continue;
                }
                try {
                    $tableCounts[$table] = (int)$db->query('SELECT COUNT(*) FROM "' . $table . '"')->fetchColumn();
                } catch (PDOException $e) {
                    $tableCounts[$table] = null;
                }
            }
            $stats['table_counts'] = $tableCounts;
        } catch (Throwable $e) {
            $stats = ['error' => 'Could not read database: ' . $e->getMessage()];
        }
    }
    $exportsDir = linknestDatabaseExportsDir(false);
    return [
        'database' => [
            'path' => $dbPath,
            'absolute_path' => realpath($dbPath) ?: $dbPath,
            'exists' => $exists,
            'size' => $size,
            'size_formatted' => $exists ? linknestFormatBytes($size) : 'N/A',
            'readable' => $exists && is_readable($dbPath),
            'writable' => $exists && is_writable($dbPath),
            'modified' => $modified,
            'modified_formatted' => $modified ? date('Y-m-d H:i:s', $modified) : null,
            'stats' => $stats,
        ],
        'exports_directory' => 'data/exports',
        'exports_directory_exists' => is_dir($exportsDir),
    ];
}

function linknestImportDatabaseData(PDO $db, array $data): array
{
    if (!isset($data['tables']) || !is_array($data['tables'])) {
        throw new InvalidArgumentException('Invalid import data. Expected a "tables" object.');
    }

    $allowed = array_fill_keys(linknestDatabaseExportTableNames(), true);
    $skipped = [];
    $db->beginTransaction();
    try {
        $db->exec('PRAGMA foreign_keys = OFF');

        foreach (linknestDatabaseImportClearTableNames() as $table) {
            if (!linknestIsSafeSqlIdent($table)) {
                continue;
            }
            try {
                $db->exec('DELETE FROM "' . $table . '"');
                if ($table === 'users') {
                    $db->exec('DELETE FROM sqlite_sequence WHERE name = "users"');
                }
            } catch (PDOException $e) {
                // Table might not exist yet.
            }
        }

        foreach ($data['tables'] as $tableName => $rows) {
            $tableName = (string)$tableName;
            if (!isset($allowed[$tableName]) || !linknestIsSafeSqlIdent($tableName)) {
                $skipped[] = $tableName;
                continue;
            }
            if (empty($rows) || !is_array($rows)) {
                continue;
            }
            $first = $rows[0];
            if (!is_array($first)) {
                continue;
            }
            $columns = [];
            foreach (array_keys($first) as $col) {
                $col = (string)$col;
                if (!linknestIsSafeSqlIdent($col)) {
                    throw new InvalidArgumentException('Invalid column name in table ' . $tableName);
                }
                $columns[] = $col;
            }
            if ($columns === []) {
                continue;
            }
            $quoted = array_map(static function ($c) {
                return '"' . $c . '"';
            }, $columns);
            $placeholders = implode(', ', array_fill(0, count($columns), '?'));
            $sql = 'INSERT INTO "' . $tableName . '" (' . implode(', ', $quoted) . ') VALUES (' . $placeholders . ')';
            $stmt = $db->prepare($sql);
            foreach ($rows as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $values = [];
                foreach ($columns as $col) {
                    $values[] = $row[$col] ?? null;
                }
                $stmt->execute($values);
            }
        }

        if (function_exists('createDatabaseIndexes')) {
            createDatabaseIndexes($db);
        }
        $db->exec('PRAGMA foreign_keys = ON');
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        try {
            $db->exec('PRAGMA foreign_keys = ON');
        } catch (Throwable $ignore) {
        }
        throw $e;
    }

    $importedCounts = [];
    foreach ($data['tables'] as $table => $rows) {
        $importedCounts[(string)$table] = is_array($rows) ? count($rows) : 0;
    }

    return [
        'success' => true,
        'message' => 'Database imported successfully',
        'imported' => $importedCounts,
        'skipped_tables' => $skipped,
    ];
}

function linknestImportDatabaseFromExportFile(PDO $db, string $filename): array
{
    $path = linknestResolveExportPath($filename, true);
    $size = (int)@filesize($path);
    if ($size <= 0) {
        throw new InvalidArgumentException('Export file is empty.');
    }
    if ($size > LINKNEST_DB_EXPORT_MAX_BYTES) {
        throw new InvalidArgumentException('Export file is too large (max 512 MB).');
    }
    $raw = file_get_contents($path);
    if ($raw === false || trim($raw) === '') {
        throw new InvalidArgumentException('Could not read export file.');
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new InvalidArgumentException('Export file is not valid JSON.');
    }
    $result = linknestImportDatabaseData($db, $data);
    $result['filename'] = basename($path);
    $result['path'] = 'data/exports/' . basename($path);
    return $result;
}
