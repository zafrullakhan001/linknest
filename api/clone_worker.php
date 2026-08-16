<?php
/**
 * Clone Worker - Background process that executes the clone
 * This script is called by the API to run the clone in the background
 */

// Set PHP configuration for long-running process
// These settings are critical for clone operations
@ini_set('max_execution_time', 0);  // Unlimited execution time for CLI
@ini_set('memory_limit', '512M');   // Increase memory limit
@ini_set('max_input_time', 300);    // 5 minutes for input
@set_time_limit(0);                  // Remove time limit

// Enable error reporting for debugging
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// Setup trace logging
$traceLogFile = __DIR__ . '/../clone_worker_trace_' . date('Ymd_His') . '.log';
$startTime = microtime(true);

function writeWorkerTraceLog($message, $level = 'INFO') {
    global $traceLogFile, $startTime;
    $timestamp = date('Y-m-d H:i:s.v');
    $elapsed = number_format(microtime(true) - $startTime, 3);
    $memory = formatBytes(memory_get_usage(true));
    $logMessage = "[$timestamp] [$elapsed s] [$memory] [$level] $message";
    
    @file_put_contents($traceLogFile, $logMessage . "\n", FILE_APPEND | LOCK_EX);
    error_log("CloneWorker: $message");
}

function formatBytes($bytes, $precision = 2) {
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= pow(1024, $pow);
    return round($bytes, $precision) . ' ' . $units[$pow];
}

writeWorkerTraceLog("=== CLONE WORKER STARTED ===");
writeWorkerTraceLog("Start Time: " . date('Y-m-d H:i:s'));
writeWorkerTraceLog("PHP Version: " . PHP_VERSION);
writeWorkerTraceLog("PHP SAPI: " . php_sapi_name());
writeWorkerTraceLog("Memory Limit: " . ini_get('memory_limit'));
writeWorkerTraceLog("Max Execution Time: " . ini_get('max_execution_time'));
writeWorkerTraceLog("Current Memory Usage: " . formatBytes(memory_get_usage(true)));
writeWorkerTraceLog("Peak Memory Usage: " . formatBytes(memory_get_peak_usage(true)));
writeWorkerTraceLog("Working Directory: " . getcwd());
writeWorkerTraceLog("Script Path: " . __FILE__);

// Log start of process
error_log("Clone worker: Starting at " . date('Y-m-d H:i:s'));

// Verify required functions are available
writeWorkerTraceLog("Verifying required PHP functions", 'DEBUG');
$requiredFunctions = ['exec', 'popen', 'pclose', 'copy', 'mkdir', 'scandir'];
$missingFunctions = [];
foreach ($requiredFunctions as $func) {
    if (!function_exists($func)) {
        $missingFunctions[] = $func;
        writeWorkerTraceLog("Missing function: $func", 'ERROR');
    } else {
        writeWorkerTraceLog("Function available: $func", 'DEBUG');
    }
}

if (!empty($missingFunctions)) {
    writeWorkerTraceLog("CRITICAL - Missing required functions: " . implode(', ', $missingFunctions), 'ERROR');
    writeWorkerTraceLog("Check php.ini disable_functions directive", 'ERROR');
    error_log("Clone worker: CRITICAL - Missing required functions: " . implode(', ', $missingFunctions));
    error_log("Clone worker: Check php.ini disable_functions directive");
    exit(1);
}
writeWorkerTraceLog("All required functions are available", 'INFO');

writeWorkerTraceLog("Loading required files", 'DEBUG');
writeWorkerTraceLog("Loading: " . __DIR__ . '/config.php', 'DEBUG');
require_once __DIR__ . '/config.php';
writeWorkerTraceLog("Loading: " . __DIR__ . '/clone_service.php', 'DEBUG');
require_once __DIR__ . '/clone_service.php';
writeWorkerTraceLog("Required files loaded successfully", 'INFO');

if (function_exists('linknestCloneIsDocker') && linknestCloneIsDocker()) {
    putenv('HOME=/var/www');
    putenv('npm_config_strict_ssl=false');
    putenv('NODE_TLS_REJECT_UNAUTHORIZED=0');
    $path = getenv('PATH') ?: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
    if (strpos($path, '/usr/local/bin') === false) {
        $path = '/usr/local/bin:' . $path;
    }
    putenv('PATH=' . $path);
    writeWorkerTraceLog("Docker npm environment prepared (HOME=/var/www, strict-ssl=false)", 'INFO');
}

// Get clone ID from command line argument
if ($argc < 2) {
    writeWorkerTraceLog("ERROR: No clone ID provided in command line arguments", 'ERROR');
    writeWorkerTraceLog("Arguments received: " . ($argc - 1) . " (expected: 1)", 'ERROR');
    error_log("Clone worker: No clone ID provided");
    exit(1);
}

writeWorkerTraceLog("Command line arguments: " . ($argc - 1) . " argument(s)", 'DEBUG');
for ($i = 0; $i < $argc; $i++) {
    writeWorkerTraceLog("  argv[$i]: " . ($argv[$i] ?? 'null'), 'DEBUG');
}

$cloneId = (int)$argv[1];
writeWorkerTraceLog("Processing clone ID: $cloneId", 'INFO');
error_log("Clone worker: Processing clone ID $cloneId");

try {
    // Verify database connection
    writeWorkerTraceLog("Connecting to database", 'DEBUG');
    $db = getDB();
    if (!$db) {
        writeWorkerTraceLog("ERROR: Failed to connect to database", 'ERROR');
        error_log("Clone worker: Failed to connect to database");
        exit(1);
    }
    writeWorkerTraceLog("Database connection established", 'INFO');
    
    // Get clone information from database
    writeWorkerTraceLog("Querying database for clone ID: $cloneId", 'DEBUG');
    $stmt = $db->prepare('SELECT * FROM clones WHERE id = ?');
    if (!$stmt) {
        $error = $db->errorInfo();
        writeWorkerTraceLog("ERROR: Failed to prepare database statement: " . ($error[2] ?? 'Unknown error'), 'ERROR');
        error_log("Clone worker: Failed to prepare database statement");
        exit(1);
    }
    
    $stmt->execute([$cloneId]);
    $clone = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$clone) {
        writeWorkerTraceLog("ERROR: Clone ID $cloneId not found in database", 'ERROR');
        error_log("Clone worker: Clone ID $cloneId not found in database");
        exit(1);
    }
    
    writeWorkerTraceLog("Clone record found: folder_name={$clone['folder_name']}, status={$clone['status']}", 'INFO');
    writeWorkerTraceLog("Clone details: source_path={$clone['source_path']}, target_path={$clone['target_path']}", 'DEBUG');
    writeWorkerTraceLog("Clone options: preset=" . ($clone['clone_preset'] ?? 'legacy') . ", copy_assets=" . ($clone['copy_assets'] ? '1' : '0') . ", copy_database=" . ($clone['copy_database'] ? '1' : '0'), 'DEBUG');
    error_log("Clone worker: Found clone - {$clone['folder_name']}, status: {$clone['status']}");
    
    // Verify source and target paths exist
    if (!empty($clone['source_path'])) {
        writeWorkerTraceLog("Verifying source path: {$clone['source_path']}", 'DEBUG');
        if (!is_dir($clone['source_path'])) {
            writeWorkerTraceLog("ERROR: Source path does not exist: {$clone['source_path']}", 'ERROR');
            error_log("Clone worker: Source path does not exist: {$clone['source_path']}");
            exit(1);
        }
        writeWorkerTraceLog("Source path verified", 'INFO');
    }
    
    if (!empty($clone['target_path'])) {
        writeWorkerTraceLog("Verifying target path: {$clone['target_path']}", 'DEBUG');
        if (!is_dir($clone['target_path'])) {
            writeWorkerTraceLog("ERROR: Target path does not exist: {$clone['target_path']}", 'ERROR');
            error_log("Clone worker: Target path does not exist: {$clone['target_path']}");
            exit(1);
        }
        writeWorkerTraceLog("Target path verified", 'INFO');
    }
    
    // Check if Node.js/npm is available (will be needed later)
    writeWorkerTraceLog("Checking for Node.js and npm", 'DEBUG');
    exec('node --version 2>&1', $nodeOutput, $nodeReturn);
    if ($nodeReturn === 0) {
        writeWorkerTraceLog("Node.js found: " . implode(' ', $nodeOutput), 'INFO');
    } else {
        writeWorkerTraceLog("WARNING: Node.js not found in PATH", 'WARNING');
    }
    
    exec('npm --version 2>&1', $npmOutput, $npmReturn);
    if ($npmReturn !== 0) {
        writeWorkerTraceLog("WARNING: npm not found in PATH. Clone may fail at npm install step.", 'WARNING');
        writeWorkerTraceLog("npm check output: " . implode("\n", $npmOutput), 'WARNING');
        error_log("Clone worker: WARNING - npm not found in PATH. Clone may fail at npm install step.");
        error_log("Clone worker: npm output: " . implode("\n", $npmOutput));
    } else {
        writeWorkerTraceLog("npm found: " . implode(' ', $npmOutput), 'INFO');
        error_log("Clone worker: npm version: " . implode(' ', $npmOutput));
    }
    
    // Create service instance
    writeWorkerTraceLog("Creating CloneService instance", 'DEBUG');
    $service = new CloneService($cloneId);
    writeWorkerTraceLog("CloneService instance created", 'INFO');
    
    // Execute clone
    writeWorkerTraceLog("=== STARTING CLONE EXECUTION ===", 'INFO');
    error_log("Clone worker: Starting clone execution...");
    $executionStart = microtime(true);
    
    $result = $service->executeClone(
        $clone['folder_name'],
        $clone['source_path'],
        $clone['target_path'],
        (bool)$clone['copy_assets'],
        (bool)$clone['copy_database'],
        $clone['created_by'],
        $clone['clone_preset'] ?? null
    );
    
    $executionTime = number_format(microtime(true) - $executionStart, 2);
    $totalTime = number_format(microtime(true) - $startTime, 2);
    
    writeWorkerTraceLog("=== CLONE EXECUTION COMPLETED ===", 'INFO');
    writeWorkerTraceLog("Execution time: {$executionTime}s", 'INFO');
    writeWorkerTraceLog("Total worker time: {$totalTime}s", 'INFO');
    writeWorkerTraceLog("Final memory usage: " . formatBytes(memory_get_usage(true)), 'INFO');
    writeWorkerTraceLog("Peak memory usage: " . formatBytes(memory_get_peak_usage(true)), 'INFO');
    writeWorkerTraceLog("Result: " . json_encode($result, JSON_PRETTY_PRINT), 'INFO');
    
    error_log("Clone worker: Clone $cloneId completed successfully at " . date('Y-m-d H:i:s'));
    error_log("Clone worker: Result: " . json_encode($result));
    exit(0);
    
} catch (PDOException $e) {
    $totalTime = number_format(microtime(true) - $startTime, 2);
    writeWorkerTraceLog("=== CLONE WORKER FAILED (PDOException) ===", 'ERROR');
    writeWorkerTraceLog("Error: " . $e->getMessage(), 'ERROR');
    writeWorkerTraceLog("SQL State: " . $e->getCode(), 'ERROR');
    writeWorkerTraceLog("File: " . $e->getFile(), 'ERROR');
    writeWorkerTraceLog("Line: " . $e->getLine(), 'ERROR');
    writeWorkerTraceLog("Stack trace:", 'ERROR');
    writeWorkerTraceLog($e->getTraceAsString(), 'ERROR');
    writeWorkerTraceLog("Total time before failure: {$totalTime}s", 'ERROR');
    writeWorkerTraceLog("Memory usage at failure: " . formatBytes(memory_get_usage(true)), 'ERROR');
    
    error_log("Clone worker: Database error cloning $cloneId: " . $e->getMessage());
    error_log("Clone worker: SQL State: " . $e->getCode());
    exit(1);
} catch (Exception $e) {
    $totalTime = number_format(microtime(true) - $startTime, 2);
    writeWorkerTraceLog("=== CLONE WORKER FAILED (Exception) ===", 'ERROR');
    writeWorkerTraceLog("Error: " . $e->getMessage(), 'ERROR');
    writeWorkerTraceLog("File: " . $e->getFile(), 'ERROR');
    writeWorkerTraceLog("Line: " . $e->getLine(), 'ERROR');
    writeWorkerTraceLog("Stack trace:", 'ERROR');
    writeWorkerTraceLog($e->getTraceAsString(), 'ERROR');
    writeWorkerTraceLog("Total time before failure: {$totalTime}s", 'ERROR');
    writeWorkerTraceLog("Memory usage at failure: " . formatBytes(memory_get_usage(true)), 'ERROR');
    
    error_log("Clone worker: Error cloning $cloneId: " . $e->getMessage());
    error_log("Clone worker: File: " . $e->getFile() . " Line: " . $e->getLine());
    error_log("Clone worker: Stack trace: " . $e->getTraceAsString());
    exit(1);
} catch (Error $e) {
    $totalTime = number_format(microtime(true) - $startTime, 2);
    writeWorkerTraceLog("=== CLONE WORKER FAILED (Fatal Error) ===", 'ERROR');
    writeWorkerTraceLog("Error: " . $e->getMessage(), 'ERROR');
    writeWorkerTraceLog("File: " . $e->getFile(), 'ERROR');
    writeWorkerTraceLog("Line: " . $e->getLine(), 'ERROR');
    writeWorkerTraceLog("Stack trace:", 'ERROR');
    writeWorkerTraceLog($e->getTraceAsString(), 'ERROR');
    writeWorkerTraceLog("Total time before failure: {$totalTime}s", 'ERROR');
    writeWorkerTraceLog("Memory usage at failure: " . formatBytes(memory_get_usage(true)), 'ERROR');
    
    error_log("Clone worker: Fatal error cloning $cloneId: " . $e->getMessage());
    error_log("Clone worker: File: " . $e->getFile() . " Line: " . $e->getLine());
    exit(1);
}

