<?php
/**
 * Server-Side Link Checker Worker
 * Background daemon that periodically checks links from server's perspective
 * 
 * Usage: php analytics/server-checker-worker.php
 */

// Ensure we're running from CLI
if (php_sapi_name() !== 'cli') {
    die("This script must be run from the command line\n");
}

// Set unlimited execution time
set_time_limit(0);

// Load dependencies
require_once __DIR__ . '/server-link-checker.php';

echo "=== Server-Side Link Checker Worker ===\n";
echo "Started at: " . date('Y-m-d H:i:s') . "\n\n";

try {
    $checker = new ServerLinkChecker();
    echo "Server link checker initialized\n";
    echo "Note: Server results are written to the metrics queue. Run the Metrics Queue Processor\n";
    echo "      (start-workers-xampp.bat 1 or option 3) so they are inserted into performance_metrics.\n\n";
} catch (Exception $e) {
    die("ERROR: Failed to initialize checker: " . $e->getMessage() . "\n");
}

// Configuration
$checkInterval = 300; // 5 minutes between full rounds
$lastCheck = 0;

echo "Check interval: " . ($checkInterval / 60) . " minutes\n\n";

// Main loop
while (true) {
    try {
        $now = time();
        
        if ($now - $lastCheck < $checkInterval) {
            sleep(30); // Sleep 30 seconds before checking again
            continue;
        }
        
        echo "[" . date('Y-m-d H:i:s') . "] Starting server-side link checks...\n";
        
        $startTime = microtime(true);
        $results = $checker->checkAllLinks();
        $elapsed = round(microtime(true) - $startTime, 2);
        
        $successCount = count(array_filter($results, function($r) {
            return $r['success'];
        }));
        
        echo "  ✓ Checked " . count($results) . " links in {$elapsed}s\n";
        echo "  ✓ Success: $successCount, Failed: " . (count($results) - $successCount) . "\n\n";
        
        $lastCheck = $now;
        
    } catch (Exception $e) {
        error_log("Server checker error: " . $e->getMessage());
        echo "ERROR: " . $e->getMessage() . "\n\n";
        sleep(60); // Wait 1 minute before retrying
    }
}
