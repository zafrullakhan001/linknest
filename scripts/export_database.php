<?php
/**
 * SQLite Database Export Script
 * 
 * Exports all database objects (tables, data, indexes, schema) to JSON files
 * for backup purposes. Compatible with PHP 8+.
 * 
 * Usage: php export_database.php [database_path] [output_directory]
 * 
 * Arguments:
 *   database_path    - Optional. Path to SQLite database file to export.
 *                      Default: ./data/linknest.db
 *   output_directory - Optional. Directory to save export files.
 *                      Default: ./data/backups/export_YYYY-MM-DD_HHMMSS/
 * 
 * Examples:
 *   php export_database.php
 *   php export_database.php /path/to/database.db
 *   php export_database.php /path/to/database.db /path/to/backup/
 */

// Set error reporting
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// Default database configuration
define('DEFAULT_DB_PATH', __DIR__ . '/../data/linknest.db');
define('DEFAULT_DB_DIR', __DIR__ . '/../data');

// Check if PDO SQLite is available
if (!extension_loaded('pdo_sqlite')) {
    die("Error: PDO SQLite extension is not enabled. Please enable it in php.ini\n");
}

// Parse command line arguments
$dbPath = null;
$outputDir = null;

// Check arguments
if (isset($argv[1])) {
    // Check if first argument is an existing file (database) or directory (output)
    if (file_exists($argv[1])) {
        if (is_file($argv[1])) {
            // First argument is a file, treat as database path
            $dbPath = $argv[1];
            // Second argument would be output directory
            $outputDir = isset($argv[2]) ? $argv[2] : null;
        } else {
            // First argument is a directory, treat as output directory
            $outputDir = $argv[1];
        }
    } else {
        // File/directory doesn't exist yet - check extension to determine type
        if (pathinfo($argv[1], PATHINFO_EXTENSION) === 'db' || 
            pathinfo($argv[1], PATHINFO_EXTENSION) === 'sqlite' ||
            pathinfo($argv[1], PATHINFO_EXTENSION) === 'sqlite3') {
            // Looks like a database file
            $dbPath = $argv[1];
            $outputDir = isset($argv[2]) ? $argv[2] : null;
        } else {
            // Assume it's an output directory
            $outputDir = $argv[1];
        }
    }
}

// Use default database path if not provided
if ($dbPath === null) {
    $dbPath = DEFAULT_DB_PATH;
}

// Resolve database path (convert relative to absolute if needed)
if (!file_exists($dbPath)) {
    // Try relative to script directory
    $relativePath = __DIR__ . '/' . $dbPath;
    if (file_exists($relativePath)) {
        $dbPath = $relativePath;
    }
}
$dbPath = realpath($dbPath) ?: $dbPath;

// Use default output directory if not provided
if ($outputDir === null) {
    // Create default backup directory with timestamp
    $timestamp = date('Y-m-d_His');
    $outputDir = DEFAULT_DB_DIR . '/backups/export_' . $timestamp;
}

// Resolve output directory path
if (!is_dir($outputDir)) {
    // Try to resolve parent directory
    $parentDir = dirname($outputDir);
    if ($parentDir && $parentDir !== '.' && $parentDir !== $outputDir) {
        if (!file_exists($parentDir)) {
            if (!mkdir($parentDir, 0755, true)) {
                die("Error: Failed to create parent directory: $parentDir\n");
            }
        }
    }
}

// Create output directory if it doesn't exist
if (!file_exists($outputDir)) {
    if (!mkdir($outputDir, 0755, true)) {
        die("Error: Failed to create output directory: $outputDir\n");
    }
}

// Check if database file exists
if (!file_exists($dbPath)) {
    die("Error: Database file not found: $dbPath\n");
}

try {
    // Connect to database
    $db = new PDO('sqlite:' . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    
    echo "Connected to database: $dbPath\n";
    echo "Exporting to: $outputDir\n\n";
    
    // Export metadata
    $metadata = [
        'version' => '1.0',
        'exported_at' => time(),
        'exported_at_formatted' => date('Y-m-d H:i:s'),
        'database_path' => $dbPath,
        'database_size' => filesize($dbPath),
        'php_version' => PHP_VERSION,
        'sqlite_version' => $db->query('SELECT sqlite_version()')->fetchColumn()
    ];
    
    file_put_contents(
        $outputDir . '/metadata.json',
        json_encode($metadata, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
    );
    echo "✓ Exported metadata\n";
    
    // Export schema (table structures)
    $schema = [
        'tables' => [],
        'indexes' => [],
        'triggers' => []
    ];
    
    // Get all tables
    $tables = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);
    
    foreach ($tables as $table) {
        // Get table schema (CREATE TABLE statement)
        $createTable = $db->query("SELECT sql FROM sqlite_master WHERE type='table' AND name='$table'")->fetchColumn();
        
        // Get column information
        $columns = $db->query("PRAGMA table_info($table)")->fetchAll();
        
        $schema['tables'][$table] = [
            'create_statement' => $createTable,
            'columns' => $columns
        ];
    }
    
    // Get all indexes
    $indexes = $db->query("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name")->fetchAll();
    
    foreach ($indexes as $index) {
        $schema['indexes'][] = [
            'name' => $index['name'],
            'table' => $index['tbl_name'],
            'create_statement' => $index['sql']
        ];
    }
    
    // Get all triggers
    $triggers = $db->query("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name")->fetchAll();
    
    foreach ($triggers as $trigger) {
        $schema['triggers'][] = [
            'name' => $trigger['name'],
            'table' => $trigger['tbl_name'],
            'create_statement' => $trigger['sql']
        ];
    }
    
    file_put_contents(
        $outputDir . '/schema.json',
        json_encode($schema, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
    );
    echo "✓ Exported schema (tables, indexes, triggers)\n";
    
    // Export table data
    $dataExport = [
        'version' => '1.0',
        'exported_at' => time(),
        'tables' => []
    ];
    
    $totalRows = 0;
    
    foreach ($tables as $table) {
        try {
            $stmt = $db->prepare("SELECT * FROM `$table`");
            $stmt->execute();
            $rows = $stmt->fetchAll();
            
            $dataExport['tables'][$table] = $rows;
            $rowCount = count($rows);
            $totalRows += $rowCount;
            
            echo "✓ Exported table '$table': $rowCount rows\n";
        } catch (PDOException $e) {
            echo "⚠ Warning: Failed to export table '$table': " . $e->getMessage() . "\n";
            $dataExport['tables'][$table] = [];
        }
    }
    
    // Save data export
    file_put_contents(
        $outputDir . '/data.json',
        json_encode($dataExport, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
    );
    echo "✓ Exported data: $totalRows total rows across " . count($tables) . " tables\n";
    
    // Export PRAGMA settings
    $pragmas = [
        'foreign_keys' => $db->query('PRAGMA foreign_keys')->fetchColumn(),
        'journal_mode' => $db->query('PRAGMA journal_mode')->fetchColumn(),
        'synchronous' => $db->query('PRAGMA synchronous')->fetchColumn(),
        'page_size' => $db->query('PRAGMA page_size')->fetchColumn(),
        'cache_size' => $db->query('PRAGMA cache_size')->fetchColumn(),
        'temp_store' => $db->query('PRAGMA temp_store')->fetchColumn(),
        'busy_timeout' => $db->query('PRAGMA busy_timeout')->fetchColumn(),
        'user_version' => $db->query('PRAGMA user_version')->fetchColumn()
    ];
    
    file_put_contents(
        $outputDir . '/pragmas.json',
        json_encode($pragmas, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
    );
    echo "✓ Exported PRAGMA settings\n";
    
    // Create a summary file
    $summary = [
        'export_info' => $metadata,
        'statistics' => [
            'total_tables' => count($tables),
            'total_rows' => $totalRows,
            'total_indexes' => count($schema['indexes']),
            'total_triggers' => count($schema['triggers']),
            'table_row_counts' => []
        ]
    ];
    
    foreach ($tables as $table) {
        $summary['statistics']['table_row_counts'][$table] = count($dataExport['tables'][$table]);
    }
    
    file_put_contents(
        $outputDir . '/summary.json',
        json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
    );
    
    echo "\n";
    echo "========================================\n";
    echo "Export completed successfully!\n";
    echo "========================================\n";
    echo "Output directory: $outputDir\n";
    echo "Files created:\n";
    echo "  - metadata.json (export information)\n";
    echo "  - schema.json (table structures, indexes, triggers)\n";
    echo "  - data.json (all table data)\n";
    echo "  - pragmas.json (SQLite PRAGMA settings)\n";
    echo "  - summary.json (export summary and statistics)\n";
    echo "\n";
    echo "Total tables: " . count($tables) . "\n";
    echo "Total rows: $totalRows\n";
    echo "Total indexes: " . count($schema['indexes']) . "\n";
    echo "Total triggers: " . count($schema['triggers']) . "\n";
    echo "\n";
    echo "To import this backup, use:\n";
    echo "  php scripts/import_database.php \"$outputDir\"\n";
    echo "\n";
    
} catch (PDOException $e) {
    die("Database error: " . $e->getMessage() . "\n");
} catch (Exception $e) {
    die("Error: " . $e->getMessage() . "\n");
}
