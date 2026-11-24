<?php
/**
 * SQLite Database Import Script
 * 
 * Imports database objects from JSON files exported by export_database.php
 * into an empty SQLite database. Compatible with PHP 8+.
 * 
 * Usage: php import_database.php [export_directory] [target_database_path]
 * 
 * If export_directory is not specified, uses ./data/backups/export_latest/
 * If target_database_path is not specified, uses ./data/linknest.db
 * 
 * WARNING: This script will DELETE all existing data in the target database!
 */

// Set error reporting
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// Database configuration
define('DEFAULT_DB_PATH', __DIR__ . '/../data/linknest.db');
define('DEFAULT_DB_DIR', __DIR__ . '/../data');

// Check if PDO SQLite is available
if (!extension_loaded('pdo_sqlite')) {
    die("Error: PDO SQLite extension is not enabled. Please enable it in php.ini\n");
}

// Get export directory from command line argument
$exportDir = isset($argv[1]) ? $argv[1] : null;

// Get target database path from command line argument
$targetDbPath = isset($argv[2]) ? $argv[2] : DEFAULT_DB_PATH;

// If export directory not specified, try to find the latest export
if ($exportDir === null) {
    $backupsDir = DEFAULT_DB_DIR . '/backups';
    if (file_exists($backupsDir)) {
        $exports = glob($backupsDir . '/export_*');
        if (!empty($exports)) {
            // Sort by modification time, get the latest
            usort($exports, function($a, $b) {
                return filemtime($b) - filemtime($a);
            });
            $exportDir = $exports[0];
        }
    }
    
    if ($exportDir === null) {
        die("Error: Export directory not specified and no exports found.\n" .
            "Usage: php import_database.php [export_directory] [target_database_path]\n");
    }
}

// Validate export directory
if (!is_dir($exportDir)) {
    die("Error: Export directory does not exist: $exportDir\n");
}

// Check for required files
$requiredFiles = ['schema.json', 'data.json', 'metadata.json'];
foreach ($requiredFiles as $file) {
    if (!file_exists($exportDir . '/' . $file)) {
        die("Error: Required file not found: $exportDir/$file\n");
    }
}

// Load export files
echo "Loading export files from: $exportDir\n";
$metadata = json_decode(file_get_contents($exportDir . '/metadata.json'), true);
$schema = json_decode(file_get_contents($exportDir . '/schema.json'), true);
$data = json_decode(file_get_contents($exportDir . '/data.json'), true);
$pragmas = file_exists($exportDir . '/pragmas.json') 
    ? json_decode(file_get_contents($exportDir . '/pragmas.json'), true) 
    : null;

if (json_last_error() !== JSON_ERROR_NONE) {
    die("Error: Failed to parse JSON files: " . json_last_error_msg() . "\n");
}

echo "✓ Loaded export files\n";
echo "  Export date: " . ($metadata['exported_at_formatted'] ?? date('Y-m-d H:i:s', $metadata['exported_at'])) . "\n";
echo "  Database version: " . ($metadata['version'] ?? 'unknown') . "\n\n";

// Confirm before proceeding
echo "WARNING: This will DELETE all existing data in the target database!\n";
echo "Target database: $targetDbPath\n";
echo "\n";
echo "Press Enter to continue, or Ctrl+C to cancel...\n";
if (PHP_OS_FAMILY !== 'Windows') {
    // On Unix-like systems, read from stdin
    $handle = fopen("php://stdin", "r");
    fgets($handle);
    fclose($handle);
} else {
    // On Windows, just wait a moment
    sleep(2);
}

// Create target database directory if it doesn't exist
$targetDbDir = dirname($targetDbPath);
if (!file_exists($targetDbDir)) {
    if (!mkdir($targetDbDir, 0755, true)) {
        die("Error: Failed to create target database directory: $targetDbDir\n");
    }
}

// Remove existing database file if it exists
if (file_exists($targetDbPath)) {
    // Close any existing connections by removing WAL and SHM files
    $walFile = $targetDbPath . '-wal';
    $shmFile = $targetDbPath . '-shm';
    if (file_exists($walFile)) @unlink($walFile);
    if (file_exists($shmFile)) @unlink($shmFile);
    
    if (!unlink($targetDbPath)) {
        die("Error: Failed to delete existing database file. Make sure no other process is using it.\n");
    }
    echo "✓ Removed existing database file\n";
}

try {
    // Create new database connection
    $db = new PDO('sqlite:' . $targetDbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    
    echo "✓ Created new database: $targetDbPath\n\n";
    
    // Apply PRAGMA settings if available
    if ($pragmas) {
        echo "Applying PRAGMA settings...\n";
        
        // Set PRAGMAs that can be set on empty database
        if (isset($pragmas['page_size'])) {
            try {
                $db->exec('PRAGMA page_size = ' . (int)$pragmas['page_size']);
            } catch (PDOException $e) {
                // Page size can only be set on empty database, ignore if it fails
            }
        }
        
        if (isset($pragmas['cache_size'])) {
            try {
                $db->exec('PRAGMA cache_size = ' . (int)$pragmas['cache_size']);
            } catch (PDOException $e) {
                // Ignore
            }
        }
        
        if (isset($pragmas['temp_store'])) {
            try {
                $db->exec('PRAGMA temp_store = ' . (int)$pragmas['temp_store']);
            } catch (PDOException $e) {
                // Ignore
            }
        }
        
        if (isset($pragmas['busy_timeout'])) {
            try {
                $db->exec('PRAGMA busy_timeout = ' . (int)$pragmas['busy_timeout']);
            } catch (PDOException $e) {
                // Ignore
            }
        }
        
        if (isset($pragmas['user_version'])) {
            try {
                $db->exec('PRAGMA user_version = ' . (int)$pragmas['user_version']);
            } catch (PDOException $e) {
                // Ignore
            }
        }
        
        echo "✓ Applied PRAGMA settings\n\n";
    }
    
    // Disable foreign keys during import
    $db->exec('PRAGMA foreign_keys = OFF');
    
    // Create tables from schema
    echo "Creating tables...\n";
    $tableOrder = [];
    
    if (isset($schema['tables']) && is_array($schema['tables'])) {
        // First pass: create all tables
        foreach ($schema['tables'] as $tableName => $tableInfo) {
            if (isset($tableInfo['create_statement']) && !empty($tableInfo['create_statement'])) {
                try {
                    $db->exec($tableInfo['create_statement']);
                    $tableOrder[] = $tableName;
                    echo "✓ Created table: $tableName\n";
                } catch (PDOException $e) {
                    echo "⚠ Warning: Failed to create table '$tableName': " . $e->getMessage() . "\n";
                }
            }
        }
    }
    
    echo "\n";
    
    // Import data
    echo "Importing data...\n";
    $totalImported = 0;
    
    if (isset($data['tables']) && is_array($data['tables'])) {
        // Import in table order (to respect foreign key dependencies)
        foreach ($tableOrder as $tableName) {
            if (!isset($data['tables'][$tableName])) {
                continue;
            }
            
            $rows = $data['tables'][$tableName];
            if (empty($rows) || !is_array($rows)) {
                continue;
            }
            
            try {
                // Get columns from first row
                $columns = array_keys($rows[0]);
                
                // Build INSERT statement
                $placeholders = array_fill(0, count($columns), '?');
                $columnList = implode(', ', array_map(function($col) {
                    return '"' . str_replace('"', '""', $col) . '"';
                }, $columns));
                
                $sql = "INSERT INTO \"$tableName\" ($columnList) VALUES (" . implode(', ', $placeholders) . ")";
                $stmt = $db->prepare($sql);
                
                $imported = 0;
                $db->beginTransaction();
                
                foreach ($rows as $row) {
                    $values = [];
                    foreach ($columns as $col) {
                        $values[] = $row[$col] ?? null;
                    }
                    $stmt->execute($values);
                    $imported++;
                }
                
                $db->commit();
                $totalImported += $imported;
                echo "✓ Imported table '$tableName': $imported rows\n";
                
            } catch (PDOException $e) {
                if ($db->inTransaction()) {
                    $db->rollBack();
                }
                echo "⚠ Warning: Failed to import table '$tableName': " . $e->getMessage() . "\n";
            }
        }
        
        // Import any tables that weren't in the schema (shouldn't happen, but be safe)
        foreach ($data['tables'] as $tableName => $rows) {
            if (in_array($tableName, $tableOrder)) {
                continue; // Already imported
            }
            
            if (empty($rows) || !is_array($rows)) {
                continue;
            }
            
            // Try to import anyway
            try {
                $columns = array_keys($rows[0]);
                $placeholders = array_fill(0, count($columns), '?');
                $columnList = implode(', ', array_map(function($col) {
                    return '"' . str_replace('"', '""', $col) . '"';
                }, $columns));
                
                $sql = "INSERT INTO \"$tableName\" ($columnList) VALUES (" . implode(', ', $placeholders) . ")";
                $stmt = $db->prepare($sql);
                
                $imported = 0;
                $db->beginTransaction();
                
                foreach ($rows as $row) {
                    $values = [];
                    foreach ($columns as $col) {
                        $values[] = $row[$col] ?? null;
                    }
                    $stmt->execute($values);
                    $imported++;
                }
                
                $db->commit();
                $totalImported += $imported;
                echo "✓ Imported table '$tableName': $imported rows\n";
                
            } catch (PDOException $e) {
                if ($db->inTransaction()) {
                    $db->rollBack();
                }
                echo "⚠ Warning: Failed to import table '$tableName': " . $e->getMessage() . "\n";
            }
        }
    }
    
    echo "\n";
    
    // Create indexes
    echo "Creating indexes...\n";
    if (isset($schema['indexes']) && is_array($schema['indexes'])) {
        foreach ($schema['indexes'] as $index) {
            if (isset($index['create_statement']) && !empty($index['create_statement'])) {
                try {
                    $db->exec($index['create_statement']);
                    echo "✓ Created index: " . ($index['name'] ?? 'unnamed') . "\n";
                } catch (PDOException $e) {
                    echo "⚠ Warning: Failed to create index '" . ($index['name'] ?? 'unnamed') . "': " . $e->getMessage() . "\n";
                }
            }
        }
    }
    
    echo "\n";
    
    // Create triggers
    echo "Creating triggers...\n";
    if (isset($schema['triggers']) && is_array($schema['triggers'])) {
        foreach ($schema['triggers'] as $trigger) {
            if (isset($trigger['create_statement']) && !empty($trigger['create_statement'])) {
                try {
                    $db->exec($trigger['create_statement']);
                    echo "✓ Created trigger: " . ($trigger['name'] ?? 'unnamed') . "\n";
                } catch (PDOException $e) {
                    echo "⚠ Warning: Failed to create trigger '" . ($trigger['name'] ?? 'unnamed') . "': " . $e->getMessage() . "\n";
                }
            }
        }
    }
    
    // Re-enable foreign keys
    $db->exec('PRAGMA foreign_keys = ON');
    
    // Apply remaining PRAGMA settings (after tables are created)
    echo "\n";
    echo "Applying remaining PRAGMA settings...\n";
    if ($pragmas) {
        if (isset($pragmas['journal_mode'])) {
            try {
                $mode = strtoupper(trim($pragmas['journal_mode']));
                // Validate journal mode (only allow safe values)
                $validModes = ['DELETE', 'TRUNCATE', 'PERSIST', 'MEMORY', 'WAL', 'OFF'];
                if (in_array($mode, $validModes)) {
                    // PRAGMA journal_mode returns the actual mode set (may differ from requested)
                    $result = $db->query("PRAGMA journal_mode = $mode")->fetchColumn();
                    if (strtoupper($result) === $mode) {
                        echo "✓ Set journal_mode: $result (matches backup)\n";
                    } else {
                        echo "⚠ Set journal_mode: $result (backup had: $mode)\n";
                    }
                }
            } catch (PDOException $e) {
                echo "⚠ Warning: Failed to set journal_mode: " . $e->getMessage() . "\n";
            }
        }
        
        if (isset($pragmas['synchronous'])) {
            try {
                if (is_numeric($pragmas['synchronous'])) {
                    $sync = (int)$pragmas['synchronous'];
                    // Validate synchronous value (0, 1, or 2)
                    if ($sync >= 0 && $sync <= 2) {
                        $result = (int)$db->query("PRAGMA synchronous = $sync")->fetchColumn();
                        if ($result === $sync) {
                            echo "✓ Set synchronous: $result (matches backup)\n";
                        } else {
                            echo "⚠ Set synchronous: $result (backup had: $sync)\n";
                        }
                    }
                } else {
                    $sync = strtoupper(trim($pragmas['synchronous']));
                    // Validate synchronous mode
                    $validSync = ['OFF', 'NORMAL', 'FULL'];
                    if (in_array($sync, $validSync)) {
                        $result = strtoupper(trim($db->query("PRAGMA synchronous = $sync")->fetchColumn()));
                        if ($result === $sync) {
                            echo "✓ Set synchronous: $result (matches backup)\n";
                        } else {
                            echo "⚠ Set synchronous: $result (backup had: $sync)\n";
                        }
                    }
                }
            } catch (PDOException $e) {
                echo "⚠ Warning: Failed to set synchronous: " . $e->getMessage() . "\n";
            }
        }
    }
    
    // Verify import and PRAGMA settings
    echo "\n";
    echo "Verifying import and settings...\n";
    $importedTables = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")->fetchAll(PDO::FETCH_COLUMN);
    echo "✓ Database contains " . count($importedTables) . " tables\n";
    
    // Verify PRAGMA settings match backup
    if ($pragmas) {
        echo "\n";
        echo "Verifying PRAGMA settings:\n";
        $pragmasToCheck = [
            'journal_mode' => 'journal_mode',
            'synchronous' => 'synchronous',
            'foreign_keys' => 'foreign_keys',
            'page_size' => 'page_size',
            'cache_size' => 'cache_size',
            'temp_store' => 'temp_store',
            'busy_timeout' => 'busy_timeout',
            'user_version' => 'user_version'
        ];
        
        foreach ($pragmasToCheck as $key => $pragma) {
            if (isset($pragmas[$key])) {
                try {
                    $current = $db->query("PRAGMA $pragma")->fetchColumn();
                    $expected = $pragmas[$key];
                    
                    // Normalize for comparison (case-insensitive for text values)
                    $currentNormalized = is_numeric($current) ? (int)$current : strtoupper(trim($current));
                    $expectedNormalized = is_numeric($expected) ? (int)$expected : strtoupper(trim($expected));
                    
                    if ($currentNormalized == $expectedNormalized) {
                        echo "✓ $pragma: $current (matches backup)\n";
                    } else {
                        echo "⚠ $pragma: $current (backup had: $expected)\n";
                    }
                } catch (PDOException $e) {
                    echo "⚠ Warning: Could not verify $pragma\n";
                }
            }
        }
    }
    
    echo "\n";
    echo "========================================\n";
    echo "Import completed successfully!\n";
    echo "========================================\n";
    echo "Target database: $targetDbPath\n";
    echo "Total rows imported: $totalImported\n";
    echo "Total tables: " . count($importedTables) . "\n";
    echo "\n";
    
} catch (PDOException $e) {
    die("Database error: " . $e->getMessage() . "\n");
} catch (Exception $e) {
    die("Error: " . $e->getMessage() . "\n");
}
