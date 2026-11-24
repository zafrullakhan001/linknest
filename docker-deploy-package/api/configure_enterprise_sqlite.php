<?php
/**
 * Enterprise SQLite Configuration Script
 * 
 * This script applies enterprise-optimized SQLite settings:
 * - Journal Mode: WAL
 * - Synchronous Mode: FULL (2)
 * - Cache Size: 1.95 MB
 * - Page Size: 4 KB
 * - Temp Store: DEFAULT (0)
 * - Busy Timeout: 5000 ms
 * - Foreign Keys: DISABLED
 * - WAL Auto Checkpoint: 1000 pages
 * 
 * Usage: php configure_enterprise_sqlite.php
 * Or access via web: http://your-domain/api/configure_enterprise_sqlite.php
 */

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

try {
    $db = getDB();
    
    $results = [];
    $errors = [];
    
    // Enterprise SQLite Configuration
    $settings = [
        'journal_mode' => ['WAL', 'PRAGMA journal_mode = WAL'],
        'synchronous' => ['FULL', 'PRAGMA synchronous = FULL'],
        'cache_size' => ['-1997', 'PRAGMA cache_size = -1997'], // 1.95 MB (1997 KB = 1.95 MB)
        'page_size' => ['4096', 'PRAGMA page_size = 4096'], // 4 KB
        'temp_store' => ['DEFAULT', 'PRAGMA temp_store = DEFAULT'], // 0
        'busy_timeout' => ['5000', 'PRAGMA busy_timeout = 5000'], // 5000 ms
        'foreign_keys' => ['OFF', 'PRAGMA foreign_keys = OFF'],
        'wal_autocheckpoint' => ['1000', 'PRAGMA wal_autocheckpoint = 1000']
    ];
    
    foreach ($settings as $setting => $config) {
        list($expected, $sql) = $config;
        try {
            $db->exec($sql);
            
            // Verify the setting was applied
            $verifyStmt = $db->query("PRAGMA {$setting}");
            $actual = $verifyStmt->fetchColumn();
            
            // Convert numeric values for comparison
            if (is_numeric($expected) && is_numeric($actual)) {
                $match = (int)$expected === (int)$actual;
            } else {
                $match = strtoupper(trim($expected)) === strtoupper(trim($actual));
            }
            
            $results[$setting] = [
                'expected' => $expected,
                'actual' => $actual,
                'status' => $match ? 'applied' : 'mismatch',
                'note' => $match ? 'Setting applied successfully' : 'Setting may not have taken effect (some PRAGMAs require database recreation)'
            ];
        } catch (PDOException $e) {
            $errors[] = "Failed to set {$setting}: " . $e->getMessage();
            $results[$setting] = [
                'expected' => $expected,
                'actual' => 'error',
                'status' => 'error',
                'error' => $e->getMessage()
            ];
        }
    }
    
    // Get current database file info
    $dbFile = DB_PATH;
    $fileSize = file_exists($dbFile) ? filesize($dbFile) : 0;
    
    // Get all current PRAGMA values for verification
    $currentSettings = [];
    foreach (array_keys($settings) as $setting) {
        try {
            $stmt = $db->query("PRAGMA {$setting}");
            $currentSettings[$setting] = $stmt->fetchColumn();
        } catch (PDOException $e) {
            $currentSettings[$setting] = 'N/A';
        }
    }
    
    sendJSON([
        'success' => true,
        'message' => 'Enterprise SQLite configuration applied',
        'settings' => $results,
        'current_settings' => $currentSettings,
        'database' => [
            'file' => $dbFile,
            'size' => $fileSize,
            'size_formatted' => formatBytes($fileSize)
        ],
        'errors' => $errors,
        'notes' => [
            'Some PRAGMA settings (like page_size) can only be set on an empty database',
            'If page_size shows a mismatch, the database was created with a different page size',
            'WAL mode provides better concurrent access for enterprise applications',
            'FULL synchronous mode ensures maximum data integrity',
            'Cache size of 1.95 MB is optimized for enterprise workloads'
        ]
    ]);
    
} catch (Exception $e) {
    sendJSON([
        'success' => false,
        'error' => 'Failed to configure SQLite: ' . $e->getMessage()
    ], 500);
}

// Helper function to format bytes
function formatBytes($bytes, $precision = 2) {
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= pow(1024, $pow);
    return round($bytes, $precision) . ' ' . $units[$pow];
}

