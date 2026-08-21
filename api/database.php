<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/database_transfer_lib.php';

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
        } elseif (preg_match('/^\/snapshots\/(.+)\/download$/', $path, $matches)) {
            handleDownloadSnapshot($matches[1]);
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
        } elseif ($path === '/snapshots/upload' || $path === '/snapshots/upload/') {
            handleUploadSnapshot();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;

    case 'DELETE':
        if (preg_match('/^\/snapshots\/(.+)$/', $path, $matches)) {
            $filename = $matches[1];
            if ($filename === 'delete-by-age') {
                handleDeleteSnapshotsByAge();
            } elseif ($filename === 'delete-all') {
                handleDeleteAllSnapshots();
            } else {
                handleDeleteSnapshot($filename);
            }
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
                    'role_tab_permissions',
                    'style_profiles',
                    'user_preferences',
                    'user_custom_timezones',
                    'user_alarms',
                    'category_visibility_presets',
                    'clones',
                    'user_audit_log',
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
    return linknestFormatBytes((int)$bytes, (int)$precision);
}

function handleExportDatabase() {
    requireAdmin(); // Only admins can export

    try {
        // Note: clones table is intentionally excluded as it contains operational/temporary data
        $export = linknestBuildDatabaseExport(getDB());
        header('Content-Type: application/json');
        header('Content-Disposition: attachment; filename="linknest-database-export-' . date('Y-m-d-His') . '.json"');
        echo json_encode($export, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to export database: ' . $e->getMessage()], 500);
    }
}

function handleImportDatabase() {
    requireAdmin(); // Only admins can import

    $data = getJSONInput();

    try {
        $result = linknestImportDatabaseData(getDB(), is_array($data) ? $data : []);
        sendJSON([
            'success' => true,
            'message' => $result['message'],
            'imported' => $result['imported'],
        ]);
    } catch (InvalidArgumentException $e) {
        sendJSON(['error' => $e->getMessage()], 400);
    } catch (Exception $e) {
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
    // Get custom message from POST data if provided
    $customMessage = null;
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = getJSONInput();
        $customMessage = isset($data['message']) ? trim($data['message']) : null;
    }
    
    // Include snapshot.php but capture output to ensure no extra whitespace
    ob_start();
    // Pass custom message to snapshot.php via global variable
    $GLOBALS['snapshot_custom_message'] = $customMessage;
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

function handleDownloadSnapshot($filename) {
    requireAdmin();
    // Security check: only allow filename in backups directory
    if (strpos($filename, '..') !== false || strpos($filename, '/') !== false || strpos($filename, '\\') !== false) {
        sendJSON(['error' => 'Invalid filename'], 400);
        return;
    }

    $filePath = DB_DIR . '/backups/' . $filename;
    if (!file_exists($filePath)) {
        sendJSON(['error' => 'Snapshot not found'], 404);
        return;
    }

    // Set headers for file download
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="' . basename($filename) . '"');
    header('Content-Length: ' . filesize($filePath));
    header('Cache-Control: no-cache, must-revalidate');
    header('Pragma: no-cache');
    
    // Clear any output buffering
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    
    // Stream the file
    readfile($filePath);
    exit;
}

function handleUploadSnapshot() {
    requireAdmin();
    
    if (!isset($_FILES['snapshot']) || $_FILES['snapshot']['error'] !== UPLOAD_ERR_OK) {
        sendJSON(['error' => 'No file uploaded or upload error occurred'], 400);
        return;
    }

    $uploadedFile = $_FILES['snapshot'];
    $backupsDir = DB_DIR . '/backups';
    
    if (!file_exists($backupsDir)) {
        if (!mkdir($backupsDir, 0755, true)) {
            sendJSON(['error' => 'Failed to create backups directory'], 500);
            return;
        }
    }

    // Validate file extension
    $filename = $uploadedFile['name'];
    $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    if ($ext !== 'db') {
        sendJSON(['error' => 'Invalid file type. Only .db files are allowed'], 400);
        return;
    }

    // Validate file size (max 500MB)
    $maxSize = 500 * 1024 * 1024; // 500MB
    if ($uploadedFile['size'] > $maxSize) {
        sendJSON(['error' => 'File too large. Maximum size is 500MB'], 400);
        return;
    }

    // Generate safe filename with timestamp if needed
    $safeFilename = preg_replace('/[^a-zA-Z0-9._-]/', '_', $filename);
    $destPath = $backupsDir . '/' . $safeFilename;

    // Check if file already exists
    if (file_exists($destPath)) {
        // Add timestamp to make it unique
        $pathInfo = pathinfo($safeFilename);
        $timestamp = date('Y-m-d-His');
        $safeFilename = $pathInfo['filename'] . '-' . $timestamp . '.' . $pathInfo['extension'];
        $destPath = $backupsDir . '/' . $safeFilename;
    }

    // Move uploaded file
    if (!move_uploaded_file($uploadedFile['tmp_name'], $destPath)) {
        sendJSON(['error' => 'Failed to save uploaded file'], 500);
        return;
    }

    // Create metadata file
    $metadata = [
        'timestamp' => time(),
        'date' => date('Y-m-d H:i:s'),
        'filename' => $safeFilename,
        'method' => 'uploaded',
        'size' => filesize($destPath),
        'original_filename' => $filename
    ];
    
    // Get custom message if provided
    $customMessage = $_POST['message'] ?? null;
    if (!empty($customMessage)) {
        $metadata['message'] = trim($customMessage);
    }
    
    file_put_contents($destPath . '.json', json_encode($metadata, JSON_PRETTY_PRINT));

    sendJSON([
        'success' => true,
        'message' => 'Snapshot uploaded successfully',
        'filename' => $safeFilename
    ]);
}

function handleDeleteSnapshotsByAge() {
    requireAdmin();
    $data = getJSONInput();
    $days = isset($data['days']) ? (int)$data['days'] : null;

    if ($days === null || $days < 0) {
        sendJSON(['error' => 'Invalid days parameter'], 400);
        return;
    }

    $backupsDir = DB_DIR . '/backups';
    if (!file_exists($backupsDir)) {
        sendJSON(['success' => true, 'deleted' => 0, 'message' => 'No backups directory found']);
        return;
    }

    $files = glob($backupsDir . '/linknest-snapshot-*.db');
    $now = time();
    $cutoffTime = $now - ($days * 24 * 60 * 60);
    $deleted = 0;
    $deletedFiles = [];

    foreach ($files as $file) {
        $fileTime = filemtime($file);
        if ($fileTime < $cutoffTime) {
            if (unlink($file)) {
                $deletedFiles[] = basename($file);
                $deleted++;
                // Also delete metadata file if it exists
                if (file_exists($file . '.json')) {
                    unlink($file . '.json');
                }
            }
        }
    }

    sendJSON([
        'success' => true,
        'deleted' => $deleted,
        'files' => $deletedFiles,
        'message' => "Deleted $deleted snapshot(s) older than $days days"
    ]);
}

function handleDeleteAllSnapshots() {
    requireAdmin();
    $backupsDir = DB_DIR . '/backups';
    
    if (!file_exists($backupsDir)) {
        sendJSON(['success' => true, 'deleted' => 0, 'message' => 'No backups directory found']);
        return;
    }

    $files = glob($backupsDir . '/linknest-snapshot-*.db');
    $deleted = 0;
    $deletedFiles = [];

    foreach ($files as $file) {
        if (unlink($file)) {
            $deletedFiles[] = basename($file);
            $deleted++;
            // Also delete metadata file if it exists
            if (file_exists($file . '.json')) {
                unlink($file . '.json');
            }
        }
    }

    sendJSON([
        'success' => true,
        'deleted' => $deleted,
        'files' => $deletedFiles,
        'message' => "Deleted all $deleted snapshot(s)"
    ]);
}










