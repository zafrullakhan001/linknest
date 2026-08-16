<?php
require_once __DIR__ . '/config.php';

// Check if clone_service.php exists and can be loaded
$cloneServicePath = __DIR__ . '/clone_service.php';
if (!file_exists($cloneServicePath)) {
    error_log("ERROR: clone_service.php not found at $cloneServicePath");
    error_log("ERROR: Current __DIR__ = " . __DIR__);
    error_log("ERROR: File exists check: " . (file_exists($cloneServicePath) ? 'YES' : 'NO'));
    
    // Try to send error response
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Clone service file not found', 'path' => $cloneServicePath]);
    }
    exit;
}

// Try to require the file and catch any errors
try {
    require_once $cloneServicePath;
} catch (Throwable $e) {
    error_log("ERROR: Failed to require clone_service.php: " . $e->getMessage());
    error_log("ERROR: File: " . $e->getFile() . " Line: " . $e->getLine());
    
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Failed to load clone service: ' . $e->getMessage()]);
    }
    exit;
}

// Verify CloneService class is available
if (!class_exists('CloneService')) {
    error_log("ERROR: CloneService class not found after requiring clone_service.php");
    error_log("ERROR: Available classes: " . implode(', ', get_declared_classes()));
    
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'CloneService class not available after loading file']);
    }
    exit;
}

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
        } elseif ($path === '/prechecks' || $path === '/prechecks/') {
            handlePrechecks();
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

/**
 * Normalize host for clone URL (fix common typos like locahost -> localhost).
 * @param string $host HTTP_HOST value (e.g. "localhost", "locahost", "localhost:8000")
 * @return string Normalized host
 */
function normalizeCloneHost($host) {
    $host = trim($host);
    if (strpos($host, ':') !== false) {
        $parts = explode(':', $host, 2);
        $parts[0] = normalizeCloneHost($parts[0]);
        return $parts[0] . ':' . $parts[1];
    }
    $typos = ['locahost' => 'localhost', 'localhos' => 'localhost', 'localhot' => 'localhost', '127.0.0.1' => 'localhost'];
    $lower = strtolower($host);
    return $typos[$lower] ?? $host;
}

/**
 * Abort with 403 when folder clone is not allowed on this runtime (WSL, or Docker without Node).
 */
function refuseCloneIfNotHost() {
    $env = linknestGetCloneRuntimeEnvironment();
    if (!$env['cloneAllowed']) {
        sendJSON([
            'error' => $env['message'],
            'runtime' => $env['runtime'],
            'cloneAllowed' => false,
        ], 403);
    }
}

function linknestCloneUnixWorkerCommand(string $scriptPath, $cloneId): string
{
    $cmd = 'nohup php ' . escapeshellarg($scriptPath) . ' ' . escapeshellarg((string) $cloneId) . ' > /dev/null 2>&1 &';
    if (function_exists('linknestCloneIsDocker') && linknestCloneIsDocker()) {
        $cmd = 'HOME=/var/www npm_config_strict_ssl=false NODE_TLS_REJECT_UNAUTHORIZED=0 LINKNEST_DOCKER=1 ' . $cmd;
    }
    return $cmd;
}

function handleClone() {
    requireAdmin();
    refuseCloneIfNotHost();
    
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
        if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]*$/', $folderName)) {
            sendJSON(['error' => 'Folder name must start with a letter or number and use only letters, numbers, hyphen, or underscore'], 400);
        }
        if (in_array(strtolower($folderName), linknestCloneReservedFolderNames(), true)) {
            sendJSON(['error' => 'That folder name is reserved by the application'], 400);
        }
        
        // Get paths
        $sourcePath = !empty($data['sourcePath']) ? trim($data['sourcePath']) : null;
        $targetPath = !empty($data['targetPath']) ? trim($data['targetPath']) : null;
        $copyAssets = isset($data['copyAssets']) && $data['copyAssets'] === true;
        $copyDatabase = isset($data['copyDatabase']) && $data['copyDatabase'] === true;
        $preset = linknestNormalizeClonePreset($data['preset'] ?? null, $copyAssets, $copyDatabase);
        $presetOpts = linknestClonePresetOptions($preset);
        $copyAssets = $presetOpts['copyAssets'];
        $copyDatabase = $presetOpts['copyDatabase'];
        $customUrl = !empty($data['url']) ? trim($data['url']) : null;
        
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
        if (linknestCloneIsDocker()) {
            $targetPath = linknestCloneDockerInstancesRoot();
            if (!is_dir($targetPath)) {
                @mkdir($targetPath, 0775, true);
            }
            if (!is_dir($targetPath) || !is_writable($targetPath)) {
                sendJSON(['error' => 'Docker clone directory is not writable: ' . $targetPath], 500);
            }
        } elseif (!$targetPath) {
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
        
        // Validate and set URL
        if ($customUrl) {
            // Validate URL format
            if (!filter_var($customUrl, FILTER_VALIDATE_URL)) {
                sendJSON(['error' => 'Invalid URL format'], 400);
            }
            // Normalize host in URL (fix typos like locahost -> localhost)
            $parsed = parse_url($customUrl);
            if (!empty($parsed['host'])) {
                $fixedHost = normalizeCloneHost($parsed['host']);
                $scheme = $parsed['scheme'] ?? 'http';
                $port = isset($parsed['port']) ? ':' . $parsed['port'] : '';
                $path = isset($parsed['path']) ? $parsed['path'] : '/';
                $path = rtrim($path, '/') . '/';
                $url = $scheme . '://' . $fixedHost . $port . $path;
            } else {
                $url = rtrim($customUrl, '/') . '/';
            }
        } else {
            // Default to localhost with folder name if not provided
            $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            $host = normalizeCloneHost($_SERVER['HTTP_HOST'] ?? 'localhost');
            $url = "$protocol://$host/$folderName/";
        }
        
        // Create clone record
        $db = getDB();
        $stmt = $db->prepare('INSERT INTO clones (folder_name, source_path, target_path, full_path, url, status, progress, copy_assets, copy_database, clone_preset, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        
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
            $preset,
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
            $scriptPath = __DIR__ . '/clone_worker.php';
            $command = linknestCloneUnixWorkerCommand($scriptPath, $cloneId);
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
    $cloneId = (int)$cloneId;
    $status = null;

    try {
        requireAdmin();
    } catch (Throwable $e) {
        // Auth failure: let it propagate (401/403)
        throw $e;
    }

    // Try to get status from file first (avoids DB locks during cloning)
    try {
        if (class_exists('CloneService')) {
            $service = new CloneService($cloneId, false);
            $fileStatus = $service->getStatus();
            if ($fileStatus && isset($fileStatus['step'])) {
                $status = $fileStatus;
                $status['id'] = $cloneId;
            }
        }
    } catch (Throwable $e) {
        // Ignore file read errors, fall back to DB (no 500)
    }

    if ($status) {
        sendJSON($status);
        return;
    }

    // Fallback to database; never return 500 so polling does not spam console
    try {
        $db = getDB();
        $stmt = $db->prepare('SELECT * FROM clones WHERE id = ?');
        $stmt->execute([$cloneId]);
        $clone = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$clone) {
            // Clone not in DB (e.g. deleted): return complete so client stops polling
            sendJSON([
                'id' => $cloneId,
                'step' => 'complete',
                'progress' => 100,
                'message' => 'Clone no longer available.',
                'logs' => [],
                'timestamp' => time()
            ]);
            return;
        }

        $status = [
            'id' => (int)$clone['id'],
            'step' => $clone['status'],
            'progress' => (int)$clone['progress'],
            'message' => $clone['error_message'] ?? ($clone['status'] === 'completed' ? 'Clone completed successfully!' : 'Processing...'),
            'logs' => [],
            'timestamp' => $clone['completed_at'] ?? $clone['created_at']
        ];
        sendJSON($status);
    } catch (PDOException $dbError) {
        if (strpos($dbError->getMessage(), 'locked') !== false || $dbError->getCode() === 'HY000') {
            sendJSON([
                'id' => $cloneId,
                'step' => 'processing',
                'progress' => 0,
                'message' => 'Database is busy, retrying...',
                'logs' => [['time' => date('H:i:s'), 'message' => 'Waiting for database lock...']]
            ]);
        } else {
            error_log('Clone status DB error: ' . $dbError->getMessage());
            sendJSON([
                'id' => $cloneId,
                'step' => 'processing',
                'progress' => 0,
                'message' => 'Checking status...',
                'logs' => [['time' => date('H:i:s'), 'message' => 'Database busy, retrying...']],
                'timestamp' => time()
            ]);
        }
    } catch (Throwable $e) {
        error_log('Clone status error: ' . $e->getMessage());
        sendJSON([
            'id' => $cloneId,
            'step' => 'processing',
            'progress' => 0,
            'message' => 'Checking status...',
            'logs' => [],
            'timestamp' => time()
        ]);
    }
}

function handleGetCloneList() {
    try {
        error_log("handleGetCloneList: Starting");
        
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
        
        // Check if CloneService class exists
        if (!class_exists('CloneService')) {
            error_log("handleGetCloneList: CloneService class not found!");
            sendJSON(['error' => 'CloneService class not available. Check if clone_service.php is loaded.'], 500);
            return;
        }
        
        $clones = CloneService::getAllClones();
        error_log("handleGetCloneList: Got " . (is_array($clones) ? count($clones) : 'non-array') . " clones");
        
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
                    'preset' => linknestNormalizeClonePreset($clone['clone_preset'] ?? null, (bool)$clone['copy_assets'], (bool)$clone['copy_database']),
                    'sourcePath' => $clone['source_path'],
                    'targetPath' => $clone['target_path']
                ];
            }
        }
        
        error_log("handleGetCloneList: Sending response with " . count($formatted) . " formatted clones");
        sendJSON(['clones' => $formatted]);
    } catch (Exception $e) {
        $errorMsg = 'Failed to load clones: ' . $e->getMessage();
        error_log("Exception in handleGetCloneList: " . $errorMsg);
        error_log("Stack trace: " . $e->getTraceAsString());
        error_log("File: " . $e->getFile() . " Line: " . $e->getLine());
        
        // Ensure we can send JSON even if sendJSON fails
        try {
            sendJSON(['error' => $errorMsg], 500);
        } catch (Exception $sendError) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => $errorMsg]);
            exit;
        }
    } catch (Error $e) {
        $errorMsg = 'Fatal error loading clones: ' . $e->getMessage();
        error_log("Fatal error in handleGetCloneList: " . $errorMsg);
        error_log("Stack trace: " . $e->getTraceAsString());
        error_log("File: " . $e->getFile() . " Line: " . $e->getLine());
        
        // Ensure we can send JSON even if sendJSON fails
        try {
            sendJSON(['error' => $errorMsg], 500);
        } catch (Exception $sendError) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => $errorMsg]);
            exit;
        }
    }
}

function handleGetCurrentPath() {
    try {
        error_log("handleGetCurrentPath: Starting");
        
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
        error_log("handleGetCurrentPath: __DIR__ = " . __DIR__);
        
        // Get the current application directory (parent of api directory)
        $currentPath = realpath(__DIR__ . '/..');
        if (!$currentPath) {
            $currentPath = dirname(__DIR__);
            error_log("handleGetCurrentPath: realpath failed, using dirname: $currentPath");
        }
        
        $targetPath = dirname($currentPath);
        if (function_exists('linknestCloneIsDocker') && linknestCloneIsDocker()) {
            $targetPath = linknestCloneDockerInstancesRoot();
        } elseif (!$targetPath || $targetPath === $currentPath) {
            // Fallback to common XAMPP structure
            $targetPath = 'C:\\xampp\\htdocs';
            error_log("handleGetCurrentPath: Using fallback target path: $targetPath");
        }
        
        error_log("handleGetCurrentPath: currentPath=$currentPath, targetPath=$targetPath");
        
        $runtimeEnv = linknestGetCloneRuntimeEnvironment();
        sendJSON([
            'currentPath' => $currentPath,
            'sourcePath' => $currentPath,
            'targetPath' => $targetPath,
            'runtime' => $runtimeEnv['runtime'],
            'cloneAllowed' => $runtimeEnv['cloneAllowed'],
            'message' => $runtimeEnv['message'],
        ]);
    } catch (Exception $e) {
        $errorMsg = 'Failed to get current path: ' . $e->getMessage();
        error_log("Error in handleGetCurrentPath: " . $errorMsg);
        error_log("Stack trace: " . $e->getTraceAsString());
        error_log("File: " . $e->getFile() . " Line: " . $e->getLine());
        
        // Ensure we can send JSON even if sendJSON fails
        try {
            sendJSON(['error' => $errorMsg], 500);
        } catch (Exception $sendError) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => $errorMsg]);
            exit;
        }
    } catch (Error $e) {
        $errorMsg = 'Fatal error getting current path: ' . $e->getMessage();
        error_log("Fatal error in handleGetCurrentPath: " . $errorMsg);
        error_log("Stack trace: " . $e->getTraceAsString());
        error_log("File: " . $e->getFile() . " Line: " . $e->getLine());
        
        // Ensure we can send JSON even if sendJSON fails
        try {
            sendJSON(['error' => $errorMsg], 500);
        } catch (Exception $sendError) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => $errorMsg]);
            exit;
        }
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
        'preset' => linknestNormalizeClonePreset($clone['clone_preset'] ?? null, (bool)$clone['copy_assets'], (bool)$clone['copy_database']),
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
    
    if (isset($data['preset']) || isset($data['copyAssets']) || isset($data['copyDatabase'])) {
        $preset = linknestNormalizeClonePreset(
            $data['preset'] ?? ($clone['clone_preset'] ?? null),
            isset($data['copyAssets']) ? (bool)$data['copyAssets'] : (bool)$clone['copy_assets'],
            isset($data['copyDatabase']) ? (bool)$data['copyDatabase'] : (bool)$clone['copy_database']
        );
        $presetOpts = linknestClonePresetOptions($preset);
        $updates[] = 'clone_preset = ?';
        $params[] = $preset;
        $updates[] = 'copy_assets = ?';
        $params[] = $presetOpts['copyAssets'] ? 1 : 0;
        $updates[] = 'copy_database = ?';
        $params[] = $presetOpts['copyDatabase'] ? 1 : 0;
    }
    
    if (isset($data['url'])) {
        $customUrl = trim($data['url']);
        // Validate URL format
        if (!filter_var($customUrl, FILTER_VALIDATE_URL)) {
            sendJSON(['error' => 'Invalid URL format'], 400);
        }
        // Ensure URL ends with /
        $customUrl = rtrim($customUrl, '/') . '/';
        $updates[] = 'url = ?';
        $params[] = $customUrl;
    }
    
    if (empty($updates)) {
        sendJSON(['error' => 'No fields to update'], 400);
    }
    
    // Update URL if folder name changed (only if URL not explicitly provided)
    if (isset($data['folderName']) && !isset($data['url'])) {
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = normalizeCloneHost($_SERVER['HTTP_HOST'] ?? 'localhost');
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
        // Check $_GET first, then parse from REQUEST_URI and path parameter
        $deleteFolder = false;
        
        // Method 1: Check direct GET parameter
        if (isset($_GET['deleteFolder'])) {
            $deleteFolder = ($_GET['deleteFolder'] === '1' || $_GET['deleteFolder'] === 'true');
            cloneLog("deleteFolder from GET: " . ($deleteFolder ? 'true' : 'false'));
        }
        
        // Method 2: Parse from the 'path' parameter (from .htaccess rewrite)
        if (!$deleteFolder && isset($_GET['path'])) {
            $pathParam = $_GET['path'];
            // The path might be like: /clone/4?deleteFolder=1
            if (preg_match('/[?&]deleteFolder=([01]|true|false)/i', $pathParam, $matches)) {
                $deleteFolder = ($matches[1] === '1' || strtolower($matches[1]) === 'true');
                cloneLog("deleteFolder from path parameter: " . ($deleteFolder ? 'true' : 'false'));
            }
        }
        
        // Method 3: Parse from REQUEST_URI as fallback
        if (!$deleteFolder) {
            $requestUri = $_SERVER['REQUEST_URI'] ?? '';
            // Decode URL encoding first
            $decodedUri = urldecode($requestUri);
            if (preg_match('/[?&]deleteFolder=([01]|true|false)/i', $decodedUri, $matches)) {
                $deleteFolder = ($matches[1] === '1' || strtolower($matches[1]) === 'true');
                cloneLog("deleteFolder from REQUEST_URI: " . ($deleteFolder ? 'true' : 'false'));
            }
        }
        
        cloneLog("Final deleteFolder value: " . ($deleteFolder ? 'true' : 'false'));
        
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
            cloneLog("Attempting to delete folder: $fullPath");
            
            // Use Windows rmdir command for fast deletion on Windows
            if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
                // Method 1: Try cmd rmdir command with proper escaping
                $command = 'cmd /c rmdir /s /q ' . escapeshellarg($fullPath);
                cloneLog("Executing command: $command");
                exec($command . ' 2>&1', $output, $returnVar);
                cloneLog("Command exit code: $returnVar, output: " . implode("\n", $output));
                
                // Wait a moment for the command to complete
                usleep(500000); // 0.5 seconds
                
                // Clear stat cache to get accurate file system status
                clearstatcache(true, $fullPath);
                
                // Check if folder was deleted
                $folderDeleted = (!file_exists($fullPath) && !is_dir($fullPath));
                cloneLog("Folder deleted after rmdir: " . ($folderDeleted ? 'yes' : 'no'));
                
                // Method 2: If rmdir failed, try PowerShell
                if (!$folderDeleted && file_exists($fullPath)) {
                    cloneLog("Trying PowerShell method...");
                    $psCommand = 'powershell -Command "Remove-Item -Path ' . escapeshellarg($fullPath) . ' -Recurse -Force -ErrorAction SilentlyContinue"';
                    cloneLog("Executing PowerShell: $psCommand");
                    exec($psCommand . ' 2>&1', $psOutput, $psReturnVar);
                    cloneLog("PowerShell exit code: $psReturnVar");
                    
                    // Wait a moment
                    usleep(500000);
                    
                    // Clear stat cache again
                    clearstatcache(true, $fullPath);
                    
                    $folderDeleted = (!file_exists($fullPath) && !is_dir($fullPath));
                    cloneLog("Folder deleted after PowerShell: " . ($folderDeleted ? 'yes' : 'no'));
                }
                
                // Method 3: If PowerShell failed, try PHP recursive delete
                if (!$folderDeleted && file_exists($fullPath)) {
                    cloneLog("Trying PHP recursive delete...");
                    try {
                        $folderDeleted = deleteDirectory($fullPath);
                        cloneLog("PHP delete result: " . ($folderDeleted ? 'success' : 'failed'));
                    } catch (Exception $e) {
                        cloneLog("PHP delete error: " . $e->getMessage());
                    }
                }
            } else {
                // Linux/Unix - use rm -rf
                $command = 'rm -rf ' . escapeshellarg($fullPath);
                cloneLog("Executing Linux command: $command");
                exec($command . ' 2>&1', $output, $returnVar);
                
                // Clear stat cache
                clearstatcache(true, $fullPath);
                
                $folderDeleted = ($returnVar === 0 && !file_exists($fullPath) && !is_dir($fullPath));
                cloneLog("Linux delete result: " . ($folderDeleted ? 'success' : 'failed'));
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
    refuseCloneIfNotHost();
    
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
        $scriptPath = __DIR__ . '/clone_worker.php';
        $command = linknestCloneUnixWorkerCommand($scriptPath, $cloneId);
        exec($command);
    }
    
    sendJSON([
        'success' => true,
        'message' => 'Clone process restarted',
        'cloneId' => $cloneId
    ]);
}

function handlePrechecks() {
    requireAdmin();
    
    $runtimeEnv = linknestGetCloneRuntimeEnvironment();
    $results = [
        'allGood' => $runtimeEnv['cloneAllowed'],
        'runtime' => $runtimeEnv['runtime'],
        'cloneAllowed' => $runtimeEnv['cloneAllowed'],
        'message' => $runtimeEnv['message'],
        'checks' => []
    ];

    $runtimeLabel = $runtimeEnv['runtime'] === 'host'
        ? 'Host'
        : ($runtimeEnv['runtime'] === 'docker' ? 'Docker' : 'WSL');
    $results['checks'][] = [
        'category' => 'Runtime Environment',
        'items' => [[
            'name' => 'Clone availability',
            'value' => $runtimeLabel,
            'status' => $runtimeEnv['cloneAllowed'] ? 'pass' : 'fail',
            'message' => $runtimeEnv['cloneAllowed']
                ? ($runtimeEnv['runtime'] === 'docker'
                    ? 'Docker — clones are served at /{folder}/ from /var/www/clones'
                    : 'Host instance — folder clone is available')
                : ($runtimeEnv['message'] ?? linknestCloneUnavailableMessage()),
            'description' => $runtimeEnv['runtime'] === 'docker'
                ? 'Folder clone writes to /var/www/clones and is served on the same HTTP port'
                : 'Folder clone is supported on host installs and Docker (with Node.js); not WSL',
        ]],
    ];
    
    // PHP Configuration
    $phpConfig = [
        'max_execution_time' => ini_get('max_execution_time'),
        'memory_limit' => ini_get('memory_limit'),
        'max_input_time' => ini_get('max_input_time')
    ];
    
    $phpChecks = [];
    $maxExecTime = $phpConfig['max_execution_time'];
    $memoryLimit = $phpConfig['memory_limit'];
    $maxInputTime = $phpConfig['max_input_time'];
    
    $phpChecks[] = [
        'name' => 'max_execution_time',
        'value' => $maxExecTime,
        'status' => ($maxExecTime == 0 || $maxExecTime >= 1800) ? 'pass' : 'fail',
        'message' => ($maxExecTime == 0 || $maxExecTime >= 1800) ? 'OK' : 'Should be 0 or >= 1800',
        'description' => 'Maximum execution time for scripts'
    ];
    
    if ($maxExecTime != 0 && $maxExecTime < 1800) {
        $results['allGood'] = false;
    }
    
    $phpChecks[] = [
        'name' => 'memory_limit',
        'value' => $memoryLimit,
        'status' => (intval($memoryLimit) >= 256) ? 'pass' : 'fail',
        'message' => (intval($memoryLimit) >= 256) ? 'OK' : 'Should be >= 256M',
        'description' => 'Memory limit for PHP scripts'
    ];
    
    if (intval($memoryLimit) < 256) {
        $results['allGood'] = false;
    }
    
    $phpChecks[] = [
        'name' => 'max_input_time',
        'value' => $maxInputTime,
        'status' => (intval($maxInputTime) >= 300) ? 'pass' : 'fail',
        'message' => (intval($maxInputTime) >= 300) ? 'OK' : 'Should be >= 300',
        'description' => 'Maximum input time'
    ];
    
    if (intval($maxInputTime) < 300) {
        $results['allGood'] = false;
    }
    
    $results['checks'][] = [
        'category' => 'PHP Configuration',
        'items' => $phpChecks
    ];
    
    // Required Functions
    $functions = [
        'exec' => 'Execute system commands (npm install, npm build)',
        'popen' => 'Start background processes (Windows)',
        'pclose' => 'Close background processes',
        'copy' => 'Copy files during clone',
        'mkdir' => 'Create directories',
        'scandir' => 'List directory contents',
        'unlink' => 'Delete files',
        'rmdir' => 'Delete directories',
        'realpath' => 'Resolve file paths',
        'file_exists' => 'Check file existence',
        'is_dir' => 'Check if path is directory'
    ];
    
    $functionChecks = [];
    foreach ($functions as $func => $desc) {
        $exists = function_exists($func);
        $functionChecks[] = [
            'name' => $func,
            'value' => $exists ? 'enabled' : 'disabled',
            'status' => $exists ? 'pass' : 'fail',
            'message' => $exists ? 'ENABLED' : 'DISABLED',
            'description' => $desc
        ];
        if (!$exists) {
            $results['allGood'] = false;
        }
    }
    
    $results['checks'][] = [
        'category' => 'Required PHP Functions',
        'items' => $functionChecks
    ];
    
    // Security Restrictions
    $disableFunctions = ini_get('disable_functions');
    $securityChecks = [];
    if (!empty($disableFunctions)) {
        $disabled = explode(',', $disableFunctions);
        $disabled = array_map('trim', $disabled);
        $critical = ['exec', 'popen', 'pclose', 'shell_exec', 'system'];
        $found = array_intersect($critical, $disabled);
        if (!empty($found)) {
            $securityChecks[] = [
                'name' => 'Critical Functions',
                'value' => implode(', ', $found),
                'status' => 'fail',
                'message' => 'These functions are disabled: ' . implode(', ', $found),
                'description' => 'Remove them from disable_functions in php.ini'
            ];
            $results['allGood'] = false;
        } else {
            $securityChecks[] = [
                'name' => 'Critical Functions',
                'value' => 'none',
                'status' => 'pass',
                'message' => 'No critical functions disabled',
                'description' => 'All required functions are available'
            ];
        }
    } else {
        $securityChecks[] = [
            'name' => 'Critical Functions',
            'value' => 'none',
            'status' => 'pass',
            'message' => 'No functions disabled',
            'description' => 'All required functions are available'
        ];
    }
    
    $results['checks'][] = [
        'category' => 'Security Restrictions',
        'items' => $securityChecks
    ];
    
    // PHP Extensions
    $extensions = [
        'pdo_sqlite' => 'PDO SQLite support (database operations)',
        'sqlite3' => 'SQLite3 support',
        'json' => 'JSON encoding/decoding (status files)'
    ];
    
    $extensionChecks = [];
    foreach ($extensions as $ext => $desc) {
        $loaded = extension_loaded($ext);
        $extensionChecks[] = [
            'name' => $ext,
            'value' => $loaded ? 'loaded' : 'not loaded',
            'status' => $loaded ? 'pass' : 'fail',
            'message' => $loaded ? 'LOADED' : 'NOT LOADED',
            'description' => $desc
        ];
        if (!$loaded) {
            $results['allGood'] = false;
        }
    }
    
    $results['checks'][] = [
        'category' => 'PHP Extensions',
        'items' => $extensionChecks
    ];
    
    // System Commands
    $systemChecks = [];
    exec('node --version 2>&1', $nodeOutput, $nodeReturn);
    $nodeOk = ($nodeReturn === 0);
    $systemChecks[] = [
        'name' => 'Node.js',
        'value' => $nodeOk ? implode(' ', $nodeOutput) : 'not found',
        'status' => $nodeOk ? 'pass' : 'fail',
        'message' => $nodeOk ? 'FOUND' : 'NOT FOUND',
        'description' => 'Install Node.js and add to PATH'
    ];
    if (!$nodeOk) {
        $results['allGood'] = false;
    }
    
    exec('npm --version 2>&1', $npmOutput, $npmReturn);
    $npmOk = ($npmReturn === 0);
    $systemChecks[] = [
        'name' => 'npm',
        'value' => $npmOk ? implode(' ', $npmOutput) : 'not found',
        'status' => $npmOk ? 'pass' : 'fail',
        'message' => $npmOk ? 'FOUND' : 'NOT FOUND',
        'description' => 'npm should come with Node.js installation'
    ];
    if (!$npmOk) {
        $results['allGood'] = false;
    }
    
    $results['checks'][] = [
        'category' => 'System Commands',
        'items' => $systemChecks
    ];

    // Python (for external worker scripts)
    $pythonChecks = [];
    $pythonVersion = null;
    $pythonOk = false;
    $pythonCmdUsed = null;
    
    // Try `python` first (common on Windows/Linux), then `py -V` (Windows launcher)
    exec('python --version 2>&1', $pyOut, $pyRc);
    if ($pyRc === 0 && !empty($pyOut)) {
        $pythonOk = true;
        $pythonCmdUsed = 'python';
        $pythonVersion = trim(implode(' ', $pyOut));
    } else {
        exec('py -V 2>&1', $py2Out, $py2Rc);
        if ($py2Rc === 0 && !empty($py2Out)) {
            $pythonOk = true;
            $pythonCmdUsed = 'py';
            $pythonVersion = trim(implode(' ', $py2Out));
        }
    }
    
    // Require Python 3.9+ for workers
    $pyStatus = 'fail';
    $pyMessage = 'NOT FOUND';
    if ($pythonOk) {
        $pyStatus = 'pass';
        $pyMessage = 'FOUND';
        if (preg_match('/Python\s+(\d+)\.(\d+)/i', (string)$pythonVersion, $m)) {
            $maj = (int)$m[1];
            $min = (int)$m[2];
            if ($maj < 3 || ($maj === 3 && $min < 9)) {
                $pyStatus = 'fail';
                $pyMessage = 'FOUND but too old (need 3.9+)';
                $results['allGood'] = false;
            }
        }
    } else {
        $results['allGood'] = false;
    }
    
    $pythonChecks[] = [
        'name' => 'Python',
        'value' => $pythonOk ? (($pythonCmdUsed ? $pythonCmdUsed . ' - ' : '') . ($pythonVersion ?: 'found')) : 'not found',
        'status' => $pyStatus,
        'message' => $pyMessage,
        'description' => 'Required for LinkNest external workers (scripts/monitor_runner.py, scripts/email_sender.py)'
    ];
    
    $results['checks'][] = [
        'category' => 'Python Workers',
        'items' => $pythonChecks
    ];
    
    // File Permissions
    $permissionChecks = [];
    $testDir = __DIR__ . '/../test_write_' . time();
    $writeOk = @mkdir($testDir, 0755, true);
    if ($writeOk) {
        @rmdir($testDir);
        $permissionChecks[] = [
            'name' => 'Write Permission',
            'value' => 'ok',
            'status' => 'pass',
            'message' => 'OK',
            'description' => 'Can create directories in project folder'
        ];
    } else {
        $permissionChecks[] = [
            'name' => 'Write Permission',
            'value' => 'failed',
            'status' => 'fail',
            'message' => 'FAILED',
            'description' => 'Check Apache user has write permissions to project directory'
        ];
        $results['allGood'] = false;
    }
    
    // Check clone_worker.php
    $workerPath = __DIR__ . '/clone_worker.php';
    if (file_exists($workerPath)) {
        $permissionChecks[] = [
            'name' => 'clone_worker.php',
            'value' => 'exists',
            'status' => 'pass',
            'message' => 'EXISTS',
            'description' => 'Clone worker script found'
        ];
        if (is_readable($workerPath)) {
            $permissionChecks[] = [
                'name' => 'clone_worker.php readable',
                'value' => 'yes',
                'status' => 'pass',
                'message' => 'OK',
                'description' => 'Clone worker script is readable'
            ];
        } else {
            $permissionChecks[] = [
                'name' => 'clone_worker.php readable',
                'value' => 'no',
                'status' => 'fail',
                'message' => 'FAILED',
                'description' => 'Clone worker script is not readable'
            ];
            $results['allGood'] = false;
        }
    } else {
        $permissionChecks[] = [
            'name' => 'clone_worker.php',
            'value' => 'not found',
            'status' => 'fail',
            'message' => 'NOT FOUND',
            'description' => 'Clone worker script is missing'
        ];
        $results['allGood'] = false;
    }
    
    $results['checks'][] = [
        'category' => 'File Permissions',
        'items' => $permissionChecks
    ];
    
    // PHP CLI Check
    $cliChecks = [];
    $cliIni = shell_exec('php --ini 2>&1');
    $cliChecks[] = [
        'name' => 'PHP CLI',
        'value' => php_sapi_name() === 'cli' ? 'CLI' : php_sapi_name(),
        'status' => 'info',
        'message' => php_sapi_name() === 'cli' ? 'Running via CLI' : 'Running via ' . php_sapi_name(),
        'description' => php_sapi_name() === 'cli' ? 'OK' : 'Note: Clone worker runs via CLI, check CLI php.ini separately'
    ];
    $cliChecks[] = [
        'name' => 'CLI php.ini',
        'value' => 'info',
        'status' => 'info',
        'message' => 'See details below',
        'description' => $cliIni ?: 'Could not determine CLI php.ini location'
    ];
    
    $results['checks'][] = [
        'category' => 'PHP CLI Configuration',
        'items' => $cliChecks
    ];
    
    sendJSON($results);
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
