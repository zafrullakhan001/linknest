<?php
/**
 * Clone Worker - Background process that executes the clone
 * This script is called by the API to run the clone in the background
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/clone_service.php';

// Get clone ID from command line argument
if ($argc < 2) {
    error_log("Clone worker: No clone ID provided");
    exit(1);
}

$cloneId = (int)$argv[1];

try {
    // Get clone information from database
    $db = getDB();
    $stmt = $db->prepare('SELECT * FROM clones WHERE id = ?');
    $stmt->execute([$cloneId]);
    $clone = $stmt->fetch();
    
    if (!$clone) {
        error_log("Clone worker: Clone ID $cloneId not found");
        exit(1);
    }
    
    // Create service instance
    $service = new CloneService($cloneId);
    
    // Execute clone
    $result = $service->executeClone(
        $clone['folder_name'],
        $clone['source_path'],
        $clone['target_path'],
        (bool)$clone['copy_assets'],
        (bool)$clone['copy_database'],
        $clone['created_by']
    );
    
    error_log("Clone worker: Clone $cloneId completed successfully");
    exit(0);
    
} catch (Exception $e) {
    error_log("Clone worker: Error cloning $cloneId: " . $e->getMessage());
    exit(1);
}

