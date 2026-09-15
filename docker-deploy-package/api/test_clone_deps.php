<?php
/**
 * Clone Process Dependencies Test Script
 * Use this to verify all required dependencies are configured correctly
 */

header('Content-Type: text/plain; charset=utf-8');

echo "========================================\n";
echo "CLONE PROCESS DEPENDENCIES TEST\n";
echo "========================================\n\n";

$allGood = true;

// PHP Configuration
echo "=== PHP Configuration ===\n";
$maxExecTime = ini_get('max_execution_time');
$memoryLimit = ini_get('memory_limit');
$maxInputTime = ini_get('max_input_time');

echo "max_execution_time: $maxExecTime " . ($maxExecTime == 0 || $maxExecTime >= 1800 ? "✓" : "✗ (should be 0 or >= 1800)") . "\n";
echo "memory_limit: $memoryLimit " . (intval($memoryLimit) >= 256 ? "✓" : "✗ (should be >= 256M)") . "\n";
echo "max_input_time: $maxInputTime " . (intval($maxInputTime) >= 300 ? "✓" : "✗ (should be >= 300)") . "\n";

if ($maxExecTime != 0 && $maxExecTime < 1800) {
    $allGood = false;
    echo "  WARNING: max_execution_time may be too low for clone process\n";
}
if (intval($memoryLimit) < 256) {
    $allGood = false;
    echo "  WARNING: memory_limit may be too low for clone process\n";
}

echo "\n";

// Required Functions
echo "=== Required PHP Functions ===\n";
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

foreach ($functions as $func => $desc) {
    $exists = function_exists($func);
    echo "$func: " . ($exists ? "✓ ENABLED" : "✗ DISABLED") . " - $desc\n";
    if (!$exists) {
        $allGood = false;
    }
}

echo "\n";

// Check disable_functions
echo "=== Security Restrictions ===\n";
$disableFunctions = ini_get('disable_functions');
if (!empty($disableFunctions)) {
    $disabled = explode(',', $disableFunctions);
    $disabled = array_map('trim', $disabled);
    $critical = ['exec', 'popen', 'pclose', 'shell_exec', 'system'];
    $found = array_intersect($critical, $disabled);
    if (!empty($found)) {
        echo "✗ CRITICAL: These functions are disabled: " . implode(', ', $found) . "\n";
        echo "  Remove them from disable_functions in php.ini\n";
        $allGood = false;
    } else {
        echo "✓ No critical functions disabled\n";
    }
} else {
    echo "✓ No functions disabled\n";
}

echo "\n";

// Extensions
echo "=== PHP Extensions ===\n";
$extensions = [
    'pdo_sqlite' => 'PDO SQLite support (database operations)',
    'sqlite3' => 'SQLite3 support',
    'json' => 'JSON encoding/decoding (status files)'
];

foreach ($extensions as $ext => $desc) {
    $loaded = extension_loaded($ext);
    echo "$ext: " . ($loaded ? "✓ LOADED" : "✗ NOT LOADED") . " - $desc\n";
    if (!$loaded) {
        $allGood = false;
    }
}

echo "\n";

// System Commands
echo "=== System Commands ===\n";
exec('node --version 2>&1', $nodeOutput, $nodeReturn);
if ($nodeReturn === 0) {
    echo "Node.js: ✓ " . implode(' ', $nodeOutput) . "\n";
} else {
    echo "Node.js: ✗ NOT FOUND\n";
    echo "  Install Node.js and add to PATH\n";
    $allGood = false;
}

exec('npm --version 2>&1', $npmOutput, $npmReturn);
if ($npmReturn === 0) {
    echo "npm: ✓ " . implode(' ', $npmOutput) . "\n";
} else {
    echo "npm: ✗ NOT FOUND\n";
    echo "  npm should come with Node.js installation\n";
    $allGood = false;
}

echo "\n";

// File Permissions
echo "=== File Permissions ===\n";
$testDir = __DIR__ . '/../test_write_' . time();
if (@mkdir($testDir, 0755, true)) {
    echo "Write permission: ✓ OK\n";
    @rmdir($testDir);
} else {
    echo "Write permission: ✗ FAILED\n";
    echo "  Check Apache user has write permissions to project directory\n";
    $allGood = false;
}

// Check if clone_worker.php exists and is readable
$workerPath = __DIR__ . '/clone_worker.php';
if (file_exists($workerPath)) {
    echo "clone_worker.php: ✓ EXISTS\n";
    if (is_readable($workerPath)) {
        echo "clone_worker.php readable: ✓ OK\n";
    } else {
        echo "clone_worker.php readable: ✗ FAILED\n";
        $allGood = false;
    }
} else {
    echo "clone_worker.php: ✗ NOT FOUND\n";
    $allGood = false;
}

echo "\n";

// PHP CLI Check
echo "=== PHP CLI Configuration ===\n";
$cliIni = shell_exec('php --ini 2>&1');
echo "CLI php.ini location:\n";
echo $cliIni . "\n";

// Check if running via CLI or web
if (php_sapi_name() === 'cli') {
    echo "Running via: CLI ✓\n";
} else {
    echo "Running via: " . php_sapi_name() . " (web server)\n";
    echo "  Note: Clone worker runs via CLI, check CLI php.ini separately\n";
}

echo "\n";

// Summary
echo "========================================\n";
if ($allGood) {
    echo "✓ ALL CHECKS PASSED\n";
    echo "Your system appears to be configured correctly for clone operations.\n";
} else {
    echo "✗ SOME CHECKS FAILED\n";
    echo "Please fix the issues above before running clone operations.\n";
    echo "\nSee CLONE_DEPENDENCIES.md for detailed configuration instructions.\n";
}
echo "========================================\n";

