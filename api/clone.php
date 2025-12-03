<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/clone_service.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

// Normalize path
$path = rtrim($path, '/');
if (empty($path)) {
    $path = '/';
}

switch ($method) {
    case 'POST':
        if ($path === '' || $path === '/') {
            handleClone();
        } elseif (preg_match('#^/rerun/(\d+)$#', $path, $matches)) {
            handleRerunClone($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'PUT':
        if (preg_match('#^/(\d+)$#', $path, $matches)) {
            handleUpdateClone($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'DELETE':
        if (preg_match('#^/(\d+)$#', $path, $matches)) {
            handleDeleteClone($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'GET':
        if ($path === '/status' || $path === '/status/') {
            handleGetStatus();
        } elseif ($path === '/list' || $path === '/list/') {
            handleGetCloneList();
        } elseif ($path === '/current-path' || $path === '/current-path/') {
            handleGetCurrentPath();
        } elseif (preg_match('#^/status/(\d+)$#', $path, $matches)) {
            handleGetCloneStatus($matches[1]);
        } elseif (preg_match('#^/(\d+)$#', $path, $matches)) {
            handleGetClone($matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleClone() {
    requireAdmin();
    
    try {
        $data = getJSONInput();
        
        // Validate required fields
        if (empty($data['folderName'])) {
            sendJSON(['error' => 'Folder name is required'], 400);
        }
        
        $folderName = trim($data['folderName']);
        
        // Validate folder name
        if (preg_match('/[<>:"|?*\/\\\\]/', $folderName)) {
            sendJSON(['error' => 'Invalid folder name. Cannot contain path separators or special characters'], 400);
        }
        
        // Get paths
        $sourcePath = !empty($data['sourcePath']) ? trim($data['sourcePath']) : null;
        $targetPath = !empty($data['targetPath']) ? trim($data['targetPath']) : null;
        $copyAssets = isset($data['copyAssets']) && $data['copyAssets'] === true;
        $copyDatabase = isset($data['copyDatabase']) && $data['copyDatabase'] === true;
        
        // Default to project root if source not specified
        if (!$sourcePath) {
            $sourcePath = realpath(__DIR__ . '/..');
            if (!$sourcePath) {
                $sourcePath = dirname(__DIR__);
            }
        } else {
            $sourcePath = realpath($sourcePath);
            if (!$sourcePath || !is_dir($sourcePath)) {
                sendJSON(['error' => 'Source path does not exist or is not a directory'], 400);
            }
        }
        
        // Default target path
        if (!$targetPath) {
            $targetPath = dirname($sourcePath);
        } else {
            $targetPath = realpath($targetPath);
            if (!$targetPath || !is_dir($targetPath)) {
                sendJSON(['error' => 'Target path does not exist or is not a directory'], 400);
            }
        }
        
        $targetDir = $targetPath . DIRECTORY_SEPARATOR . $folderName;
        
        // Get current user
        $user = getAuthenticatedUser();
        $createdBy = $user ? $user['id'] : null;
        
        // Create clone record
        $db = getDB();
        $stmt = $db->prepare('INSERT INTO clones (folder_name, source_path, target_path, full_path, url, status, progress, copy_assets, copy_database, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        
        // Build URL correctly - just use localhost with folder name
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        // Remove any path components and just use the folder name
        $url = "$protocol://$host/$folderName/";
        
        $stmt->execute([
            $folderName,
            $sourcePath,
            $targetPath,
            $targetDir,
            $url,
            'pending',
            0,
            $copyAssets ? 1 : 0,
            $copyDatabase ? 1 : 0,
            time(),
            $createdBy
        ]);
        
        $cloneId = $db->lastInsertId();
        
        // Start clone in background
        // Use a simple approach: fork the process or use async execution
        // For now, we'll execute it in a way that doesn't block
        
        // Create a background process
        if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
            // Windows: Use start command
            $phpPath = PHP_BINARY;
            $scriptPath = __DIR__ . '/clone_worker.php';
            $command = 'start /B php ' . escapeshellarg($scriptPath) . ' ' . escapeshellarg($cloneId) . ' > NUL 2>&1';
            pclose(popen($command, 'r'));
        } else {
            // Linux/Unix: Use nohup
            $phpPath = PHP_BINARY;
            $scriptPath = __DIR__ . '/clone_worker.php';
            $command = 'nohup php ' . escapeshellarg($scriptPath) . ' ' . escapeshellarg($cloneId) . ' > /dev/null 2>&1 &';
            exec($command);
        }
        
        sendJSON([
            'success' => true,
            'message' => 'Clone process started',
            'cloneId' => $cloneId,
            'url' => $url
        ]);
        
    } catch (Exception $e) {
        sendJSON(['error' => 'An error occurred: ' . $e->getMessage()], 500);
    } catch (Error $e) {
        sendJSON(['error' => 'A fatal error occurred: ' . $e->getMessage()], 500);
    }
}

function handleGetStatus() {
    requireAdmin();
    
    $data = getJSONInput();
    if (empty($data['cloneId'])) {
        sendJSON(['error' => 'cloneId is required'], 400);
    }
    
    $cloneId = (int)$data['cloneId'];
    $service = new CloneService($cloneId);
    $status = $service->getStatus();
    
    if (!$status) {
        // Try to get from database
        $db = getDB();
        $stmt = $db->prepare('SELECT * FROM clones WHERE id = ?');
        $stmt->execute([$cloneId]);
        $clone = $stmt->fetch();
        
        if (!$clone) {
            sendJSON(['error' => 'Clone not found'], 404);
        }
        
        $status = [
            'step' => $clone['status'],
            'progress' => (int)$clone['progress'],
            'message' => $clone['error_message'] ?? 'Processing...',
            'logs' => [],
            'timestamp' => $clone['completed_at'] ?? $clone['created_at']
        ];
    }
    
    sendJSON($status);
}

function handleGetCloneStatus($cloneId) {
    requireAdmin();
    
    $cloneId = (int)$cloneId;
    $service = new CloneService($cloneId);
    $status = $service->getStatus();
    
    if (!$status) {
        // Try to get from database
        $db = getDB();
        $stmt = $db->prepare('SELECT * FROM clones WHERE id = ?');
        $stmt->execute([$cloneId]);
        $clone = $stmt->fetch();
        
        if (!$clone) {
            sendJSON(['error' => 'Clone not found'], 404);
        }
        
        $status = [
            'step' => $clone['status'],
            'progress' => (int)$clone['progress'],
            'message' => $clone['error_message'] ?? 'Processing...',
            'logs' => [],
            'timestamp' => $clone['completed_at'] ?? $clone['created_at']
        ];
    }
    
    sendJSON($status);
}

function handleGetCloneList() {
    requireAdmin();
    
    $clones = CloneService::getAllClones();
    
    // Format the response
    $formatted = [];
    foreach ($clones as $clone) {
        $formatted[] = [
            'id' => (int)$clone['id'],
            'folderName' => $clone['folder_name'],
            'url' => $clone['url'],
            'status' => $clone['status'],
            'progress' => (int)$clone['progress'],
            'createdAt' => (int)$clone['created_at'],
            'completedAt' => $clone['completed_at'] ? (int)$clone['completed_at'] : null,
            'errorMessage' => $clone['error_message'],
            'copyAssets' => (bool)$clone['copy_assets'],
            'copyDatabase' => (bool)$clone['copy_database'],
            'sourcePath' => $clone['source_path'],
            'targetPath' => $clone['target_path']
        ];
    }
    
    sendJSON(['clones' => $formatted]);
}

function handleGetCurrentPath() {
    requireAdmin();
    
    // Get the current application directory (parent of api directory)
    $currentPath = realpath(__DIR__ . '/..');
    if (!$currentPath) {
        $currentPath = dirname(__DIR__);
    }
    
    sendJSON([
        'currentPath' => $currentPath,
        'sourcePath' => $currentPath,
        'targetPath' => dirname($currentPath)
    ]);
}

function handleGetClone($cloneId) {
    requireAdmin();
    
    $cloneId = (int)$cloneId;
    $db = getDB();
    $stmt = $db->prepare('SELECT * FROM clones WHERE id = ?');
    $stmt->execute([$cloneId]);
    $clone = $stmt->fetch();
    
    if (!$clone) {
        sendJSON(['error' => 'Clone not found'], 404);
    }
    
    sendJSON([
        'id' => (int)$clone['id'],
        'folderName' => $clone['folder_name'],
        'sourcePath' => $clone['source_path'],
        'targetPath' => $clone['target_path'],
        'url' => $clone['url'],
        'status' => $clone['status'],
        'progress' => (int)$clone['progress'],
        'copyAssets' => (bool)$clone['copy_assets'],
        'copyDatabase' => (bool)$clone['copy_database'],
        'createdAt' => (int)$clone['created_at'],
        'completedAt' => $clone['completed_at'] ? (int)$clone['completed_at'] : null,
        'errorMessage' => $clone['error_message']
    ]);
}

function handleUpdateClone($cloneId) {
    requireAdmin();
    
    $cloneId = (int)$cloneId;
    $data = getJSONInput();
    
    $db = getDB();
    
    // Check if clone exists
    $stmt = $db->prepare('SELECT * FROM clones WHERE id = ?');
    $stmt->execute([$cloneId]);
    $clone = $stmt->fetch();
    
    if (!$clone) {
        sendJSON(['error' => 'Clone not found'], 404);
    }
    
    // Build update query
    $updates = [];
    $params = [];
    
    if (isset($data['folderName'])) {
        $updates[] = 'folder_name = ?';
        $params[] = trim($data['folderName']);
    }
    
    if (isset($data['sourcePath'])) {
        $updates[] = 'source_path = ?';
        $params[] = trim($data['sourcePath']);
    }
    
    if (isset($data['targetPath'])) {
        $updates[] = 'target_path = ?';
        $params[] = trim($data['targetPath']);
    }
    
    if (isset($data['copyAssets'])) {
        $updates[] = 'copy_assets = ?';
        $params[] = $data['copyAssets'] ? 1 : 0;
    }
    
    if (isset($data['copyDatabase'])) {
        $updates[] = 'copy_database = ?';
        $params[] = $data['copyDatabase'] ? 1 : 0;
    }
    
    if (empty($updates)) {
        sendJSON(['error' => 'No fields to update'], 400);
    }
    
    // Update URL if folder name changed
    if (isset($data['folderName'])) {
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $newUrl = "$protocol://$host/" . trim($data['folderName']) . "/";
        $updates[] = 'url = ?';
        $params[] = $newUrl;
    }
    
    $params[] = $cloneId;
    
    $sql = 'UPDATE clones SET ' . implode(', ', $updates) . ' WHERE id = ?';
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    
    sendJSON(['success' => true, 'message' => 'Clone updated successfully']);
}

function handleDeleteClone($cloneId) {
    requireAdmin();
    
    $cloneId = (int)$cloneId;
    $db = getDB();
    
    // Get clone info
    $stmt = $db->prepare('SELECT * FROM clones WHERE id = ?');
    $stmt->execute([$cloneId]);
    $clone = $stmt->fetch();
    
    if (!$clone) {
        sendJSON(['error' => 'Clone not found'], 404);
    }
    
    // Optionally delete the folder (if it exists)
    $deleteFolder = isset($_GET['deleteFolder']) && $_GET['deleteFolder'] === '1';
    
    if ($deleteFolder && !empty($clone['full_path']) && is_dir($clone['full_path'])) {
        // Delete the cloned folder
        deleteDirectory($clone['full_path']);
    }
    
    // Delete clone record
    $stmt = $db->prepare('DELETE FROM clones WHERE id = ?');
    $stmt->execute([$cloneId]);
    
    // Delete status file if exists
    $statusFile = __DIR__ . '/../clone_status_' . $cloneId . '.json';
    if (file_exists($statusFile)) {
        @unlink($statusFile);
    }
    
    sendJSON(['success' => true, 'message' => 'Clone deleted successfully']);
}

function handleRerunClone($cloneId) {
    requireAdmin();
    
    $cloneId = (int)$cloneId;
    $db = getDB();
    
    // Get clone info
    $stmt = $db->prepare('SELECT * FROM clones WHERE id = ?');
    $stmt->execute([$cloneId]);
    $clone = $stmt->fetch();
    
    if (!$clone) {
        sendJSON(['error' => 'Clone not found'], 404);
    }
    
    // Reset clone status
    $stmt = $db->prepare('UPDATE clones SET status = ?, progress = 0, error_message = NULL, completed_at = NULL WHERE id = ?');
    $stmt->execute(['pending', $cloneId]);
    
    // Delete old status file
    $statusFile = __DIR__ . '/../clone_status_' . $cloneId . '.json';
    if (file_exists($statusFile)) {
        @unlink($statusFile);
    }
    
    // Start clone in background
    if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
        $phpPath = PHP_BINARY;
        $scriptPath = __DIR__ . '/clone_worker.php';
        $command = 'start /B php ' . escapeshellarg($scriptPath) . ' ' . escapeshellarg($cloneId) . ' > NUL 2>&1';
        pclose(popen($command, 'r'));
    } else {
        $phpPath = PHP_BINARY;
        $scriptPath = __DIR__ . '/clone_worker.php';
        $command = 'nohup php ' . escapeshellarg($scriptPath) . ' ' . escapeshellarg($cloneId) . ' > /dev/null 2>&1 &';
        exec($command);
    }
    
    sendJSON([
        'success' => true,
        'message' => 'Clone process restarted',
        'cloneId' => $cloneId
    ]);
}

function deleteDirectory($dir) {
    if (!is_dir($dir)) {
        return;
    }
    
    $files = array_diff(scandir($dir), ['.', '..']);
    foreach ($files as $file) {
        $path = $dir . DIRECTORY_SEPARATOR . $file;
        if (is_dir($path)) {
            deleteDirectory($path);
        } else {
            @unlink($path);
        }
    }
    @rmdir($dir);
}
