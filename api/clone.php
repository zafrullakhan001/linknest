<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

switch ($method) {
    case 'POST':
        if ($path === '' || $path === '/') {
            handleClone();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

/**
 * Log clone operation messages to a dedicated log file
 */
function clone_log($message, $level = 'INFO') {
    $logFile = __DIR__ . '/../clone_debug.log';
    $timestamp = date('[Y-m-d H:i:s]');
    $logMessage = "$timestamp [$level] $message\n";
    @file_put_contents($logFile, $logMessage, FILE_APPEND);
}

function handleClone() {
    requireAdmin();
    
    clone_log("Clone request received");
    
    try {
        $data = getJSONInput();
        clone_log("Request data: " . json_encode($data));
        
        // Validate required fields
        if (empty($data['folderName'])) {
            clone_log("Validation failed: Folder name is required", 'ERROR');
            sendJSON(['error' => 'Folder name is required'], 400);
        }
        
        $folderName = trim($data['folderName']);
        clone_log("Folder name: $folderName");
        
        // Validate folder name (no path separators or invalid characters)
        if (preg_match('/[<>:"|?*\/\\\\]/', $folderName)) {
            clone_log("Validation failed: Invalid folder name characters", 'ERROR');
            sendJSON(['error' => 'Invalid folder name. Cannot contain path separators or special characters'], 400);
        }
        
        // Get paths
        $sourcePath = !empty($data['sourcePath']) ? trim($data['sourcePath']) : null;
        $targetPath = !empty($data['targetPath']) ? trim($data['targetPath']) : null;
        $copyAssets = isset($data['copyAssets']) && $data['copyAssets'] === true;
        $copyDatabase = isset($data['copyDatabase']) && $data['copyDatabase'] === true;
        
        clone_log("Source path: " . ($sourcePath ?: 'not specified'));
        clone_log("Target path: " . ($targetPath ?: 'not specified'));
        clone_log("Copy assets: " . ($copyAssets ? 'yes' : 'no'));
        clone_log("Copy database: " . ($copyDatabase ? 'yes' : 'no'));
        
        // Get script directory
        $scriptPath = __DIR__ . '/../scripts/clone-linknest.bat';
        $scriptPath = realpath($scriptPath);
        
        clone_log("Script path: $scriptPath");
        
        if (!$scriptPath || !file_exists($scriptPath)) {
            clone_log("Error: Clone script not found at: " . __DIR__ . '/../scripts/clone-linknest.bat', 'ERROR');
            sendJSON(['error' => 'Clone script not found at: ' . __DIR__ . '/../scripts/clone-linknest.bat'], 500);
        }
        
        // Build command arguments
        // For Windows batch files, we need to properly escape paths
        $args = [];
        $args[] = $folderName; // First argument is folder name
        
        // Always provide source path explicitly to avoid confusion
        // If not provided by user, use project root (parent of api directory)
        if ($sourcePath) {
            // Validate source path exists
            $realSourcePath = realpath($sourcePath);
            if (!$realSourcePath || !is_dir($realSourcePath)) {
                clone_log("Error: Source path does not exist: $sourcePath", 'ERROR');
                sendJSON(['error' => 'Source path does not exist or is not a directory'], 400);
            }
        } else {
            // Default to project root (parent of api directory)
            $realSourcePath = realpath(__DIR__ . '/..');
            if (!$realSourcePath) {
                $realSourcePath = dirname(__DIR__);
            }
            clone_log("Using default source path (project root): $realSourcePath");
        }
        
        // Always include --source parameter explicitly
        $args[] = '--source';
        $args[] = $realSourcePath;
        clone_log("Using source path: $realSourcePath");
        
        if ($targetPath) {
            // Validate target path exists
            $realTargetPath = realpath($targetPath);
            if (!$realTargetPath || !is_dir($realTargetPath)) {
                clone_log("Error: Target path does not exist: $targetPath", 'ERROR');
                sendJSON(['error' => 'Target path does not exist or is not a directory'], 400);
            }
            $args[] = '--target';
            $args[] = $realTargetPath;
            clone_log("Using target path: $realTargetPath");
        }
        
        if ($copyAssets) {
            $args[] = '--assets';
        }
        
        if ($copyDatabase) {
            $args[] = '--database';
        }
        
        clone_log("Command arguments: " . json_encode($args));
        
        // Execute in background
        // On Windows, use start /B to run in background without opening a window
        // On Linux/Unix, use nohup and redirect output
        if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
            // Windows: Use start /B to run in background
            // Create a log file for the clone process output - use Windows path format
            $projectRoot = realpath(__DIR__ . '/..');
            if (!$projectRoot) {
                $projectRoot = dirname(__DIR__);
            }
            $logFile = str_replace('/', '\\', $projectRoot . '\\clone_output.log');
            
            // Build command properly for Windows
            // Escape each argument individually, then join
            $escapedArgs = [];
            foreach ($args as $arg) {
                // Escape argument - wrap in quotes and escape internal quotes
                $escaped = '"' . str_replace('"', '""', $arg) . '"';
                $escapedArgs[] = $escaped;
            }
            
            // Build the full command
            // Use the script path and arguments
            $scriptPathEscaped = '"' . str_replace('"', '""', $scriptPath) . '"';
            $command = $scriptPathEscaped . ' ' . implode(' ', $escapedArgs);
            
            // For Windows, use a simpler approach:
            // Create a temporary batch file that runs the command and redirects output
            // This avoids quote escaping issues with redirection
            $tempBatchFile = str_replace('/', '\\', $projectRoot . '\\clone_temp_' . time() . '.bat');
            
            // Build the command with proper path handling
            // Don't change directory - run from project root so paths resolve correctly
            $batchContent = '@echo off' . "\r\n";
            $batchContent .= 'REM Clone command with all parameters' . "\r\n";
            $batchContent .= 'cd /d "' . str_replace('"', '""', $projectRoot) . '"' . "\r\n";
            
            // Build command string for the batch file
            // Quote the script path
            $batchCommand = '"' . str_replace('"', '""', $scriptPath) . '"';
            
            // Add each argument, properly quoted
            foreach ($args as $arg) {
                // Always quote arguments to handle spaces and special characters
                $batchCommand .= ' "' . str_replace('"', '""', $arg) . '"';
            }
            
            clone_log("Batch command arguments: " . json_encode($args));
            
            // Automatically answer "y" to any prompts
            // Use (echo y & echo.) | to pipe "y" and newline to the command
            // This works with set /p prompts in batch files
            $batchContent .= '(echo y & echo.) | ' . $batchCommand . ' > "' . str_replace('"', '""', $logFile) . '" 2>&1' . "\r\n";
            $batchContent .= 'set CLONE_EXIT_CODE=%ERRORLEVEL%' . "\r\n";
            $batchContent .= 'if errorlevel 1 (' . "\r\n";
            $batchContent .= '    echo. >> "' . str_replace('"', '""', $logFile) . '"' . "\r\n";
            $batchContent .= '    echo ======================================== >> "' . str_replace('"', '""', $logFile) . '"' . "\r\n";
            $batchContent .= '    echo Clone process failed with error code: %CLONE_EXIT_CODE% >> "' . str_replace('"', '""', $logFile) . '"' . "\r\n";
            $batchContent .= '    echo ======================================== >> "' . str_replace('"', '""', $logFile) . '"' . "\r\n";
            $batchContent .= ') else (' . "\r\n";
            $batchContent .= '    echo. >> "' . str_replace('"', '""', $logFile) . '"' . "\r\n";
            $batchContent .= '    echo ======================================== >> "' . str_replace('"', '""', $logFile) . '"' . "\r\n";
            $batchContent .= '    echo Clone process completed successfully! >> "' . str_replace('"', '""', $logFile) . '"' . "\r\n";
            $batchContent .= '    echo ======================================== >> "' . str_replace('"', '""', $logFile) . '"' . "\r\n";
            $batchContent .= ')' . "\r\n";
            $batchContent .= 'del "%~f0"' . "\r\n"; // Delete the temp batch file after execution
            
            clone_log("Temp batch file command: $batchCommand");
            
            if (@file_put_contents($tempBatchFile, $batchContent) === false) {
                clone_log("Error: Failed to create temporary batch file: $tempBatchFile", 'ERROR');
                sendJSON([
                    'error' => 'Failed to create temporary batch file. Check file permissions.',
                    'logFile' => 'clone_debug.log'
                ], 500);
            }
            
            clone_log("Created temporary batch file: $tempBatchFile");
            clone_log("Batch file content:\n$batchContent");
            
            // Now run the temporary batch file automatically
            // Use cmd /c start /B to execute the batch file in background
            // The /B flag runs without creating a new window
            $tempBatchEscaped = '"' . str_replace('"', '""', $tempBatchFile) . '"';
            // Use cmd /c start /B for more reliable execution
            $fullCommand = 'cmd /c start /B ' . $tempBatchEscaped;
            
            clone_log("Windows command: $fullCommand");
            clone_log("Log file: $logFile");
            clone_log("Script path: $scriptPath");
            clone_log("Temp batch file: $tempBatchFile");
            
            // Try multiple methods to execute in background
            $processStarted = false;
            
            // Method 1: Use proc_open
            $descriptorspec = [
                0 => ['pipe', 'r'],  // stdin
                1 => ['pipe', 'w'],  // stdout
                2 => ['pipe', 'w']   // stderr
            ];
            
            // Set working directory to project root where temp batch file is located
            $workingDir = $projectRoot;
            clone_log("Setting working directory to: $workingDir");
            
            $process = @proc_open($fullCommand, $descriptorspec, $pipes, $workingDir, null, ['bypass_shell' => false]);
            if (is_resource($process)) {
                clone_log("Process resource created using proc_open");
                $processStarted = true;
                
                // Close pipes immediately to allow background execution
                if (isset($pipes[0])) {
                    @fclose($pipes[0]);
                    clone_log("Stdin pipe closed");
                }
                if (isset($pipes[1])) {
                    @fclose($pipes[1]);
                    clone_log("Stdout pipe closed");
                }
                if (isset($pipes[2])) {
                    @fclose($pipes[2]);
                    clone_log("Stderr pipe closed");
                }
                
                // Get process status before closing
                $status = @proc_get_status($process);
                if ($status) {
                    clone_log("Process status - running: " . ($status['running'] ? 'yes' : 'no'));
                    clone_log("Process status - pid: " . ($status['pid'] ?? 'unknown'));
                }
                
                // Don't wait for process - close immediately to detach
                // On Windows, this should allow the process to continue in background
                @proc_close($process);
                clone_log("Process handle closed, should be running in background");
                
                // Give it a moment to start
                usleep(100000); // 0.1 second
                
                // Verify the batch file still exists (it should until execution completes)
                if (file_exists($tempBatchFile)) {
                    clone_log("Temp batch file exists - process should be running");
                } else {
                    clone_log("WARNING: Temp batch file was deleted immediately - process may have completed or failed", 'WARNING');
                }
            } else {
                // Method 2: Try using popen (simpler, might work better)
                clone_log("proc_open failed, trying popen method");
                $error = error_get_last();
                if ($error) {
                    clone_log("Last error: " . $error['message'], 'WARNING');
                }
                
                $handle = @popen($fullCommand, 'r');
                if (is_resource($handle)) {
                    clone_log("Process started using popen");
                    $processStarted = true;
                    // Close immediately to allow background execution
                    @pclose($handle);
                    clone_log("Popen handle closed, running in background");
                } else {
                    // Method 3: Try using exec
                    clone_log("popen failed, trying exec method");
                    $execCommand = $fullCommand;
                    $output = [];
                    $returnVar = 0;
                    @exec($execCommand, $output, $returnVar);
                    
                    if ($returnVar === 0) {
                        clone_log("Process started using exec method");
                        $processStarted = true;
                    } else {
                        clone_log("Exec also failed with return code: $returnVar", 'WARNING');
                        if (!empty($output)) {
                            clone_log("Exec output: " . implode("\n", $output), 'WARNING');
                        }
                    }
                }
            }
            
            if (!$processStarted) {
                $error = error_get_last();
                clone_log("Error: Failed to start clone process. Last error: " . ($error ? $error['message'] : 'Unknown'), 'ERROR');
                sendJSON([
                    'error' => 'Failed to start clone process. Check clone_debug.log for details.',
                    'logFile' => 'clone_debug.log',
                    'details' => $error ? $error['message'] : 'Unknown error - check PHP error logs'
                ], 500);
            }
        } else {
            // Linux/Unix: Use nohup and redirect output
            $logFile = __DIR__ . '/../clone_output.log';
            $command = 'nohup ' . $command . ' > ' . escapeshellarg($logFile) . ' 2>&1 &';
            
            clone_log("Linux/Unix command: $command");
            
            // Execute command
            $output = [];
            $returnVar = 0;
            exec($command, $output, $returnVar);
            
            clone_log("Command executed with return code: $returnVar");
            if (!empty($output)) {
                clone_log("Command output: " . implode("\n", $output));
            }
            
            if ($returnVar !== 0) {
                clone_log("Error: Command failed with return code $returnVar", 'ERROR');
                sendJSON([
                    'error' => 'Failed to start clone process',
                    'logFile' => 'clone_debug.log',
                    'details' => implode("\n", $output)
                ], 500);
            }
        }
        
        clone_log("Clone process initiated successfully for folder: $folderName");
        
        sendJSON([
            'success' => true,
            'message' => 'Clone process started in background',
            'folderName' => $folderName,
            'logFile' => 'clone_debug.log',
            'outputLog' => 'clone_output.log'
        ]);
        
    } catch (Exception $e) {
        clone_log("Exception: " . $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine(), 'ERROR');
        clone_log("Stack trace: " . $e->getTraceAsString(), 'ERROR');
        sendJSON([
            'error' => 'An error occurred: ' . $e->getMessage(),
            'logFile' => 'clone_debug.log'
        ], 500);
    } catch (Error $e) {
        clone_log("Fatal error: " . $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine(), 'ERROR');
        clone_log("Stack trace: " . $e->getTraceAsString(), 'ERROR');
        sendJSON([
            'error' => 'A fatal error occurred: ' . $e->getMessage(),
            'logFile' => 'clone_debug.log'
        ], 500);
    }
}

