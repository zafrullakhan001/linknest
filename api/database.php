<?php
require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

switch ($method) {
    case 'GET':
        if ($path === '/export' || $path === '/export/') {
            handleExportDatabase();
        } elseif ($path === '/info' || $path === '/info/') {
            handleGetDatabaseInfo();
        } elseif ($path === '/snapshots' || $path === '/snapshots/') {
            handleGetSnapshots();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'POST':
        if ($path === '/import' || $path === '/import/') {
            handleImportDatabase();
        } elseif ($path === '/snapshot' || $path === '/snapshot/') {
            handleCreateSnapshot();
        } elseif ($path === '/restore' || $path === '/restore/') {
            handleRestoreSnapshot();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;

    case 'DELETE':
        if (preg_match('/^\/snapshots\/(.+)$/', $path, $matches)) {
            handleDeleteSnapshot($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleGetDatabaseInfo() {
    requireAdmin(); // Only admins can view database info
    
    try {
        $dbPath = DB_PATH;
        $dbDir = DB_DIR;
        $exists = file_exists($dbPath);
        $size = $exists ? filesize($dbPath) : 0;
        $readable = $exists ? is_readable($dbPath) : false;
        $writable = $exists ? is_writable($dbPath) : false;
        $modified = $exists ? filemtime($dbPath) : null;
        
        // Get absolute path
        $absolutePath = realpath($dbPath) ?: $dbPath;
        
        // Get database stats if it exists
        $stats = null;
        if ($exists) {
            try {
                $db = getDB();
                $stats = [
                    'page_count' => $db->query('PRAGMA page_count')->fetchColumn(),
                    'page_size' => $db->query('PRAGMA page_size')->fetchColumn(),
                    'journal_mode' => $db->query('PRAGMA journal_mode')->fetchColumn(),
                    'user_version' => $db->query('PRAGMA user_version')->fetchColumn(),
                ];
                
                // Get table counts
                $tables = [
                    'users', 
                    'tiles', 
                    'tabs',
                    'sections', 
                    'links', 
                    'settings', 
                    'tile_arrangements', 
                    'category_arrangements',
                    'rich_text_content',
                    'user_tile_favorites',
                    'user_tile_permissions',
                    'roles',
                    'user_roles',
                    'role_tile_permissions',
                    'role_link_permissions',
                    'style_profiles',
                    'user_preferences',
                    'user_custom_timezones',
                    'user_alarms',
                    'clones'
                ];
                $tableCounts = [];
                foreach ($tables as $table) {
                    try {
                        $count = $db->query("SELECT COUNT(*) FROM $table")->fetchColumn();
                        $tableCounts[$table] = (int)$count;
                    } catch (PDOException $e) {
                        $tableCounts[$table] = null; // Table doesn't exist
                    }
                }
                $stats['table_counts'] = $tableCounts;
            } catch (PDOException $e) {
                $stats = ['error' => 'Could not read database: ' . $e->getMessage()];
            }
        }
        
        sendJSON([
            'database' => [
                'path' => $dbPath,
                'absolute_path' => $absolutePath,
                'directory' => $dbDir,
                'exists' => $exists,
                'size' => $size,
                'size_formatted' => $exists ? formatBytes($size) : 'N/A',
                'readable' => $readable,
                'writable' => $writable,
                'modified' => $modified,
                'modified_formatted' => $modified ? date('Y-m-d H:i:s', $modified) : null,
                'stats' => $stats
            ]
        ]);
    } catch (Exception $e) {
        sendJSON(['error' => 'Failed to get database info: ' . $e->getMessage()], 500);
    }
}

function formatBytes($bytes, $precision = 2) {
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= pow(1024, $pow);
    return round($bytes, $precision) . ' ' . $units[$pow];
}

function handleExportDatabase() {
    requireAdmin(); // Only admins can export
    
    $db = getDB();
    
    try {
        // Export all tables
        $export = [
            'version' => '3.0', // Updated to include all new tables and columns
            'exported_at' => time(),
            'tables' => []
        ];
        
        $tables = [
            'users', 'tiles', 'tabs', 'sections', 'links', 'settings', 
            'tile_arrangements', 'category_arrangements', 'rich_text_content',
            'user_tile_favorites', 'user_link_favorites', 'user_tile_permissions',
            'style_profiles', 'user_preferences', 'user_custom_timezones', 'user_alarms', 'monitors', 'monitor_logs',
            'browser_list', 'browser_list_metadata', 'roles', 'user_roles', 'role_tile_permissions', 'role_link_permissions'
        ];

        foreach ($tables as $table) {
            try {
                $stmt = $db->prepare("SELECT * FROM $table");
                $stmt->execute();
                $export['tables'][$table] = $stmt->fetchAll();
            } catch (PDOException $e) {
                // Table might not exist, skip
                $export['tables'][$table] = [];
            }
        }
        
        // Note: clones table is intentionally excluded as it contains operational/temporary data
        
        // Set headers for file download
        header('Content-Type: application/json');
        header('Content-Disposition: attachment; filename="linknest-database-export-' . date('Y-m-d-His') . '.json"');
        
        echo json_encode($export, JSON_PRETTY_PRINT);
        exit;
        
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to export database: ' . $e->getMessage()], 500);
    }
}

function handleImportDatabase() {
    requireAdmin(); // Only admins can import
    
    $data = getJSONInput();
    
    if (!isset($data['tables']) || !is_array($data['tables'])) {
        sendJSON(['error' => 'Invalid import data. Expected "tables" array.'], 400);
    }
    
    // getDB() calls initDatabase() which ensures all tables and columns exist
    $db = getDB();
    $db->beginTransaction();
    
    try {
        // Disable foreign key checks temporarily for import
        $db->exec('PRAGMA foreign_keys = OFF');
        
        // List of tables to clear and import
        $tables = [
            'monitor_logs', 'monitors', 'user_tile_permissions', 'user_link_favorites',
            'user_tile_favorites', 'user_preferences', 'rich_text_content',
            'category_arrangements', 'tile_arrangements', 'links', 'sections',
            'tabs', 'tiles', 'style_profiles', 'settings', 'users', 'user_custom_timezones', 'user_alarms',
            'browser_list', 'browser_list_metadata', 'role_link_permissions', 'role_tile_permissions', 'user_roles', 'roles'
        ];

        foreach ($tables as $table) {
            try {
                $db->exec("DELETE FROM $table");
                if ($table === 'users') {
                    $db->exec('DELETE FROM sqlite_sequence WHERE name = "users"');
                }
            } catch (PDOException $e) {
                // Table might not exist, ignore
            }
        }
        
        // Helper to import a table dynamically
        foreach ($data['tables'] as $tableName => $rows) {
            if (empty($rows) || !is_array($rows)) continue;
            
            // Get columns from the first row
            $columns = array_keys($rows[0]);
            $placeholders = array_fill(0, count($columns), '?');
            
            $sql = "INSERT INTO $tableName (" . implode(', ', array_map(function($c) { return '"' . $c . '"'; }, $columns)) . ") VALUES (" . implode(', ', $placeholders) . ")";
            
            $stmt = $db->prepare($sql);
            foreach ($rows as $row) {
                $values = [];
                foreach ($columns as $col) {
                    $values[] = $row[$col] ?? null;
                }
                $stmt->execute($values);
            }
        }
        
        // Recreate indexes after import for optimal performance
        createDatabaseIndexes($db);
        
        // Re-enable foreign keys
        $db->exec('PRAGMA foreign_keys = ON');
        
        $db->commit();
        
        $importedCounts = [];
        foreach ($data['tables'] as $table => $rows) {
            $importedCounts[$table] = count($rows);
        }

        sendJSON([
            'success' => true,
            'message' => 'Database imported successfully',
            'imported' => $importedCounts
        ]);
        
    } catch (Exception $e) {
        $db->rollBack();
        $db->exec('PRAGMA foreign_keys = ON'); // Re-enable even on error
        sendJSON(['error' => 'Failed to import database: ' . $e->getMessage()], 500);
    }
}

function handleGetSnapshots() {
    requireAdmin();
    $backupsDir = DB_DIR . '/backups';
    if (!file_exists($backupsDir)) {
        sendJSON(['snapshots' => []]);
        return;
    }

    $files = glob($backupsDir . '/linknest-snapshot-*.db');
    $snapshots = [];
    foreach ($files as $file) {
        $filename = basename($file);
        $metaFile = $file . '.json';
        $meta = file_exists($metaFile) ? json_decode(file_get_contents($metaFile), true) : null;
        
        // Use metadata timestamp if available (more accurate), otherwise fall back to filemtime
        // Always format the timestamp using current timezone for consistent display
        if ($meta && isset($meta['timestamp'])) {
            $createdAt = (int)$meta['timestamp'];
            // Format using current timezone setting (always accurate, timezone-independent Unix timestamp)
            $createdAtFormatted = date('Y-m-d H:i:s', $createdAt);
        } else {
            $createdAt = filemtime($file);
            $createdAtFormatted = date('Y-m-d H:i:s', $createdAt);
        }
        
        $snapshots[] = [
            'filename' => $filename,
            'size' => filesize($file),
            'size_formatted' => formatBytes(filesize($file)),
            'created_at' => $createdAt,
            'created_at_formatted' => $createdAtFormatted,
            'metadata' => $meta
        ];
    }

    // Sort by modification time descending
    usort($snapshots, function($a, $b) {
        return $b['created_at'] - $a['created_at'];
    });

    sendJSON(['snapshots' => $snapshots]);
}

function handleCreateSnapshot() {
    requireAdmin();
    // Include snapshot.php but capture output to ensure no extra whitespace
    ob_start();
    include __DIR__ . '/snapshot.php';
    $output = ob_get_clean();
    echo $output;
    exit;
}

function handleDeleteSnapshot($filename) {
    requireAdmin();
    // Security check: only allow filename in backups directory
    if (strpos($filename, '..') !== false || strpos($filename, '/') !== false || strpos($filename, '\\') !== false) {
        sendJSON(['error' => 'Invalid filename'], 400);
    }

    $filePath = DB_DIR . '/backups/' . $filename;
    if (file_exists($filePath)) {
        unlink($filePath);
        if (file_exists($filePath . '.json')) {
            unlink($filePath . '.json');
        }
        sendJSON(['success' => true, 'message' => 'Snapshot deleted']);
    } else {
        sendJSON(['error' => 'Snapshot not found'], 404);
    }
}

function handleRestoreSnapshot() {
    requireAdmin();
    $data = getJSONInput();
    $filename = $data['filename'] ?? null;

    if (!$filename) {
        sendJSON(['error' => 'Filename required'], 400);
    }

    if (strpos($filename, '..') !== false || strpos($filename, '/') !== false || strpos($filename, '\\') !== false) {
        sendJSON(['error' => 'Invalid filename'], 400);
    }

    $snapshotPath = DB_DIR . '/backups/' . $filename;
    if (!file_exists($snapshotPath)) {
        sendJSON(['error' => 'Snapshot not found'], 404);
    }

    $dbPath = DB_PATH;

    try {
        // 1. Force a checkpoint and close the database connection
        $db = getDB();
        try {
            $db->exec('PRAGMA wal_checkpoint(TRUNCATE)');
        } catch (Exception $e) {
            // WAL might not be enabled or busy, continue anyway
        }
        
        // 2. Explicitly clear the singleton instance to close the file handle
        getDB(true);
        unset($db); // Remove local reference

        // 3. Clear WAL and SHM files to prevent state conflicts
        $walFile = $dbPath . '-wal';
        $shmFile = $dbPath . '-shm';
        if (file_exists($walFile)) @unlink($walFile);
        if (file_exists($shmFile)) @unlink($shmFile);

        // 4. Overwrite the database file
        if (!@copy($snapshotPath, $dbPath)) {
            // If copy fails, try a more aggressive approach (rename/delete)
            if (file_exists($dbPath)) {
                if (!@unlink($dbPath)) {
                    throw new Exception("Failed to restore database. The original database file is locked. Please ensure no other processes (like terminal sessions) are using it.");
                }
            }
            if (!copy($snapshotPath, $dbPath)) {
                throw new Exception("Failed to copy snapshot to database file.");
            }
        }

        sendJSON(['success' => true, 'message' => 'Database restored successfully. The application will now reload.']);
    } catch (Exception $e) {
        sendJSON(['error' => 'Restore failed: ' . $e->getMessage()], 500);
    }
}










