<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/clone_service.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

// Log the incoming request
error_log("clone.php: Received $method request, PATH_INFO: " . var_export($path, true));
error_log("clone.php: REQUEST_URI: " . ($_SERVER['REQUEST_URI'] ?? 'not set'));

// Remove query string if present in path
if (($pos = strpos($path, '?')) !== false) {
    $path = substr($path, 0, $pos);
}

// Normalize path
$path = rtrim($path, '/');
if (empty($path)) {
    $path = '/';
}

error_log("clone.php: Normalized path: $path");

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
    try {
        // Check authentication first (this may exit)
        $user = getAuthenticatedUser();
        if (!$user) {
            error_log("handleGetCloneList: No authenticated user");
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Authentication required']);
            exit;
        }
        if (!$user['is_admin']) {
            error_log("handleGetCloneList: User is not admin");
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Admin access required']);
            exit;
        }
        
        error_log("handleGetCloneList: Getting clones list");
        $clones = CloneService::getAllClones();
        error_log("handleGetCloneList: Got " . count($clones) . " clones");
        
        // Format the response
        $formatted = [];
        if (is_array($clones)) {
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
        }
        
        error_log("handleGetCloneList: Sending response");
        sendJSON(['clones' => $formatted]);
    } catch (Exception $e) {
        error_log("Exception in handleGetCloneList: " . $e->getMessage());
        error_log("Stack trace: " . $e->getTraceAsString());
        sendJSON(['error' => 'Failed to load clones: ' . $e->getMessage()], 500);
    } catch (Error $e) {
        error_log("Fatal error in handleGetCloneList: " . $e->getMessage());
        error_log("Stack trace: " . $e->getTraceAsString());
        sendJSON(['error' => 'Fatal error loading clones: ' . $e->getMessage()], 500);
    }
}

function handleGetCurrentPath() {
    try {
        // Check authentication first (this may exit)
        $user = getAuthenticatedUser();
        if (!$user) {
            error_log("handleGetCurrentPath: No authenticated user");
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Authentication required']);
            exit;
        }
        if (!$user['is_admin']) {
            error_log("handleGetCurrentPath: User is not admin");
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Admin access required']);
            exit;
        }
        
        error_log("handleGetCurrentPath: Getting current path");
        
        // Get the current application directory (parent of api directory)
        $currentPath = realpath(__DIR__ . '/..');
        if (!$currentPath) {
            $currentPath = dirname(__DIR__);
        }
        
        $targetPath = dirname($currentPath);
        if (!$targetPath || $targetPath === $currentPath) {
            // Fallback to common XAMPP structure
            $targetPath = 'C:\\xampp\\htdocs';
        }
        
        error_log("handleGetCurrentPath: currentPath=$currentPath, targetPath=$targetPath");
        
        sendJSON([
            'currentPath' => $currentPath,
            'sourcePath' => $currentPath,
            'targetPath' => $targetPath
        ]);
    } catch (Exception $e) {
        error_log("Error in handleGetCurrentPath: " . $e->getMessage());
        error_log("Stack trace: " . $e->getTraceAsString());
        sendJSON(['error' => 'Failed to get current path: ' . $e->getMessage()], 500);
    } catch (Error $e) {
        error_log("Fatal error in handleGetCurrentPath: " . $e->getMessage());
        error_log("Stack trace: " . $e->getTraceAsString());
        sendJSON(['error' => 'Fatal error getting current path: ' . $e->getMessage()], 500);
    }
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

function cloneLog($message) {
    try {
        $logFile = __DIR__ . '/../clone_delete.log';
        $timestamp = date('Y-m-d H:i:s');
        @file_put_contents($logFile, "[$timestamp] $message\n", FILE_APPEND);
        error_log($message); // Also log to PHP error log
    } catch (Exception $e) {
        // Silently fail if logging fails
    }
}

function handleDeleteClone($cloneId) {
    requireAdmin();
    
    try {
        $cloneId = (int)$cloneId;
        $db = getDB();
        
        // Get clone info
        $stmt = $db->prepare('SELECT * FROM clones WHERE id = ?');
        $stmt->execute([$cloneId]);
        $clone = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$clone) {
            sendJSON(['error' => 'Clone not found'], 404);
            return;
        }
        
        // Optionally delete the folder (if it exists)
        // Check $_GET first, then parse from REQUEST_URI if needed
        $deleteFolder = false;
        if (isset($_GET['deleteFolder'])) {
            $deleteFolder = ($_GET['deleteFolder'] === '1' || $_GET['deleteFolder'] === 'true');
        } else {
            // Try parsing from REQUEST_URI if not in $_GET
            $requestUri = $_SERVER['REQUEST_URI'] ?? '';
            if (preg_match('/[?&]deleteFolder=([01]|true|false)/i', $requestUri, $matches)) {
                $deleteFolder = ($matches[1] === '1' || strtolower($matches[1]) === 'true');
            }
        }
        
        // Get the folder path directly from the database
        $fullPath = $clone['full_path'] ?? null;
        
        // If full_path is not stored, construct it from target_path and folder_name
        if (!$fullPath) {
            $targetPath = $clone['target_path'] ?? '';
            $folderName = $clone['folder_name'] ?? '';
            if ($targetPath && $folderName) {
                $fullPath = rtrim($targetPath, '/\\') . DIRECTORY_SEPARATOR . $folderName;
            }
        }
        
        $folderDeleted = false;
        
        // Delete the folder if requested and path exists
        if ($deleteFolder && $fullPath && is_dir($fullPath)) {
            // Use Windows rmdir command for fast deletion on Windows
            if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
                // Use cmd /c to ensure proper command execution
                $escapedPath = str_replace('"', '""', $fullPath);
                $command = 'cmd /c "rmdir /s /q "' . $escapedPath . '""';
                exec($command . ' 2>&1', $output, $returnVar);
                
                // Wait a moment for the command to complete
                usleep(1000000); // 1 second
                
                // Check if folder was deleted
                $folderDeleted = (!is_dir($fullPath));
                
                // If rmdir failed, try PowerShell
                if (!$folderDeleted) {
                    $escapedPsPath = str_replace("'", "''", $fullPath);
                    $psCommand = 'powershell -Command "Remove-Item -Path \'' . $escapedPsPath . '\' -Recurse -Force -ErrorAction SilentlyContinue"';
                    exec($psCommand . ' 2>&1', $psOutput, $psReturnVar);
                    
                    // Wait a moment
                    usleep(1000000);
                    
                    $folderDeleted = (!is_dir($fullPath));
                }
            } else {
                // Linux/Unix - use rm -rf
                $command = 'rm -rf ' . escapeshellarg($fullPath);
                exec($command . ' 2>&1', $output, $returnVar);
                $folderDeleted = ($returnVar === 0 && !is_dir($fullPath));
            }
        }
        
        // Delete clone record
        $stmt = $db->prepare('DELETE FROM clones WHERE id = ?');
        $result = $stmt->execute([$cloneId]);
        
        if (!$result) {
            $errorInfo = $stmt->errorInfo();
            sendJSON(['error' => 'Failed to delete clone: ' . ($errorInfo[2] ?? 'Unknown error')], 500);
            return;
        }
        
        // Delete status file if exists
        $statusFile = __DIR__ . '/../clone_status_' . $cloneId . '.json';
        if (file_exists($statusFile)) {
            @unlink($statusFile);
        }
        
        // Build response message
        $message = 'Clone deleted successfully';
        if ($deleteFolder) {
            if (!$fullPath) {
                $message .= '. However, the folder path could not be determined.';
            } elseif ($folderDeleted) {
                $message .= '. Folder has been deleted.';
            } else {
                $message .= '. However, the folder could not be deleted.';
            }
        }
        
        sendJSON([
            'success' => true, 
            'message' => $message,
            'folderDeleted' => $folderDeleted,
            'folderPath' => $fullPath ?: null
        ]);
    } catch (Exception $e) {
        sendJSON(['error' => 'An error occurred: ' . $e->getMessage()], 500);
    } catch (Error $e) {
        sendJSON(['error' => 'A fatal error occurred: ' . $e->getMessage()], 500);
    }
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
        cloneLog("deleteDirectory: Not a directory: $dir");
        return false;
    }
    
    cloneLog("deleteDirectory: Starting deletion of: $dir");
    
    try {
        // Use RecursiveIteratorIterator for better directory deletion
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );
        
        $deletedCount = 0;
        $failedCount = 0;
        
        foreach ($iterator as $file) {
            $path = $file->getPathname();
            try {
                if ($file->isDir()) {
                    if (@rmdir($path)) {
                        $deletedCount++;
                    } else {
                        $failedCount++;
                        $error = error_get_last();
                        cloneLog("Failed to delete directory: $path - " . ($error['message'] ?? 'Unknown error'));
                    }
                } else {
                    if (@unlink($path)) {
                        $deletedCount++;
                    } else {
                        $failedCount++;
                        $error = error_get_last();
                        cloneLog("Failed to delete file: $path - " . ($error['message'] ?? 'Unknown error'));
                    }
                }
            } catch (Exception $e) {
                $failedCount++;
                cloneLog("Exception deleting $path: " . $e->getMessage());
            }
        }
        
        cloneLog("deleteDirectory: Deleted $deletedCount items, failed $failedCount items");
        
        // Finally remove the main directory
        if (@rmdir($dir)) {
            cloneLog("deleteDirectory: Successfully removed main directory: $dir");
            return true;
        } else {
            $error = error_get_last();
            cloneLog("deleteDirectory: Failed to remove main directory: $dir - " . ($error['message'] ?? 'Unknown error'));
            // Fallback to simple method
            return deleteDirectorySimple($dir);
        }
    } catch (Exception $e) {
        cloneLog("deleteDirectory: Exception in RecursiveIteratorIterator: " . $e->getMessage());
        cloneLog("deleteDirectory: Stack trace: " . $e->getTraceAsString());
        // Fallback to simple method
        return deleteDirectorySimple($dir);
    }
}

function deleteDirectorySimple($dir) {
    cloneLog("deleteDirectorySimple: Using fallback method for: $dir");
    
    try {
        $files = array_diff(scandir($dir), ['.', '..']);
        foreach ($files as $file) {
            $path = $dir . DIRECTORY_SEPARATOR . $file;
            if (is_dir($path)) {
                deleteDirectorySimple($path);
            } else {
                if (!@unlink($path)) {
                    $error = error_get_last();
                    cloneLog("deleteDirectorySimple: Failed to delete file: $path - " . ($error['message'] ?? 'Unknown error'));
                }
            }
        }
        if (@rmdir($dir)) {
            cloneLog("deleteDirectorySimple: Successfully removed directory: $dir");
            return true;
        } else {
            $error = error_get_last();
            cloneLog("deleteDirectorySimple: Failed to remove directory: $dir - " . ($error['message'] ?? 'Unknown error'));
            return false;
        }
    } catch (Exception $e) {
        cloneLog("deleteDirectorySimple: Exception: " . $e->getMessage());
        return false;
    }
}
