<?php
/**
 * LinkNest Database Snapshot Utility
 * This script can be run via CLI or HTTP to create a file-based snapshot of the database.
 * 
 * Usage CLI: php api/snapshot.php
 * Usage HTTP: GET /api/snapshot.php?token=YOUR_SYSTEM_TOKEN
 */

require_once __DIR__ . '/config.php';

// Check authentication
$isAuthenticated = false;

// 1. Check if running from CLI
if (php_sapi_name() === 'cli') {
    $isAuthenticated = true;
} else {
    // 2. Check for SYSTEM_TOKEN or Admin session
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    $token = '';
    
    if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
        $token = $matches[1];
    } elseif (isset($_GET['token'])) {
        $token = $_GET['token'];
    }

    if ($token && defined('SYSTEM_TOKEN') && $token === SYSTEM_TOKEN) {
        $isAuthenticated = true;
    } else {
        // Fallback to admin session check
        try {
            $user = getAuthenticatedUser();
            if ($user && $user['is_admin']) {
                $isAuthenticated = true;
            }
        } catch (Exception $e) {
            // Not authenticated
        }
    }
}

if (!$isAuthenticated) {
    if (php_sapi_name() === 'cli') {
        echo "Error: Authentication failed.\n";
    } else {
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Authentication required']);
    }
    exit;
}

try {
    $dbPath = DB_PATH;
    $dbDir = DB_DIR;
    $backupsDir = $dbDir . '/backups';
    
    if (!file_exists($backupsDir)) {
        if (!mkdir($backupsDir, 0755, true)) {
            throw new Exception("Failed to create backups directory: $backupsDir");
        }
    }
    
    $timestamp = date('Y-m-d-His');
    $filename = 'linknest-snapshot-' . $timestamp . '.db';
    $destPath = $backupsDir . '/' . $filename;
    
    // For SQLite, use VACUUM INTO for a consistent snapshot if supported (3.27.0+)
    $db = getDB();
    $method = 'VACUUM INTO';
    try {
        // Use absolute path for destPath to avoid issues with SQLite VACUUM INTO
        $absDestPath = realpath($backupsDir) . DIRECTORY_SEPARATOR . $filename;
        $db->exec("VACUUM INTO " . $db->quote($absDestPath));
    } catch (PDOException $e) {
        // Fallback to simple copy if VACUUM INTO is not supported
        // This is less safe if writes are happening, but okay for most cases
        if (!copy($dbPath, $destPath)) {
            throw new Exception("Failed to copy database file to $destPath");
        }
        $method = 'file copy';
    }
    
    // Create a .json metadata file for the snapshot
    $metadata = [
        'timestamp' => time(),
        'date' => date('Y-m-d H:i:s'),
        'filename' => $filename,
        'method' => $method,
        'size' => filesize($destPath)
    ];
    
    // Add custom message if provided
    $customMessage = $GLOBALS['snapshot_custom_message'] ?? null;
    if (!empty($customMessage)) {
        $metadata['message'] = $customMessage;
    }
    
    file_put_contents($destPath . '.json', json_encode($metadata, JSON_PRETTY_PRINT));
    
    // Clean up old backups (keep last 30 days)
    $files = glob($backupsDir . '/linknest-snapshot-*.db');
    $now = time();
    $deleted = 0;
    foreach ($files as $file) {
        if ($now - filemtime($file) > 30 * 24 * 60 * 60) {
            unlink($file);
            // Also delete metadata file if it exists
            if (file_exists($file . '.json')) {
                unlink($file . '.json');
            }
            $deleted++;
        }
    }
    
    $response = [
        'success' => true,
        'message' => 'Database snapshot created successfully',
        'snapshot' => [
            'filename' => $filename,
            'path' => $destPath,
            'size' => filesize($destPath),
            'method' => $method
        ],
        'backups_count' => count($files) - $deleted + 1,
        'deleted_old' => $deleted
    ];
    
    if (php_sapi_name() === 'cli') {
        echo "Snapshot created: $filename ($method)\n";
        echo "Total backups: " . (count($files) - $deleted + 1) . "\n";
        echo "Deleted old backups: $deleted\n";
    } else {
        header('Content-Type: application/json');
        echo json_encode($response);
    }
    
} catch (Exception $e) {
    if (php_sapi_name() === 'cli') {
        echo "Error: " . $e->getMessage() . "\n";
    } else {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Failed to create snapshot: ' . $e->getMessage()]);
    }
}
