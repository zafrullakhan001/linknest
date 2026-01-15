<?php
/**
 * Delete Inactive Style Profiles Script
 * 
 * This script deletes all StyleManager profiles except the active one.
 * The active profile is identified by is_active = 1 in the style_profiles table.
 * 
 * Usage:
 *   Command line: php delete_inactive_style_profiles.php [--confirm]
 *   Web browser: Access via browser and follow prompts
 * 
 * Security Note: This script should be secured in production environments.
 */

// Set error reporting for debugging
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Database path (relative to this script)
$dbPath = __DIR__ . '/../data/linknest.db';

// Check if running from command line
$isCli = php_sapi_name() === 'cli';

// Function to display output
function output($message, $type = 'info') {
    global $isCli;
    if ($isCli) {
        $colors = [
            'info' => '',
            'success' => "\033[32m", // Green
            'error' => "\033[31m",   // Red
            'warning' => "\033[33m", // Yellow
            'reset' => "\033[0m"     // Reset
        ];
        echo $colors[$type] . $message . $colors['reset'] . PHP_EOL;
    } else {
        $styles = [
            'info' => 'color: #333;',
            'success' => 'color: #28a745; font-weight: bold;',
            'error' => 'color: #dc3545; font-weight: bold;',
            'warning' => 'color: #ffc107; font-weight: bold;'
        ];
        echo '<p style="' . ($styles[$type] ?? $styles['info']) . '">' . htmlspecialchars($message) . '</p>';
    }
}

// Function to get input
function getInput($prompt) {
    global $isCli;
    if ($isCli) {
        echo $prompt;
        return trim(fgets(STDIN));
    } else {
        // For web interface, we'll use GET/POST parameters
        return isset($_GET['confirm']) ? $_GET['confirm'] : null;
    }
}

// Function to connect to database
function getDB() {
    global $dbPath;
    
    if (!file_exists($dbPath)) {
        output("Error: Database file not found at: $dbPath", 'error');
        exit(1);
    }
    
    try {
        $db = new PDO('sqlite:' . $dbPath);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        return $db;
    } catch (PDOException $e) {
        output("Error connecting to database: " . $e->getMessage(), 'error');
        exit(1);
    }
}

// Function to ensure style_profiles table exists
function ensureStyleProfilesTable($db) {
    try {
        // Check if table exists
        $tableExists = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='style_profiles'")->fetch();
        
        if (!$tableExists) {
            output("Warning: style_profiles table does not exist. Creating it...", 'warning');
            // Create new table with all columns
            $db->exec('CREATE TABLE style_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                styles_data TEXT NOT NULL,
                is_active INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )');
            
            // Create index for faster lookups
            $db->exec('CREATE INDEX idx_style_profiles_active ON style_profiles(is_active)');
            output("style_profiles table created successfully.", 'success');
        }
    } catch (PDOException $e) {
        output("Error checking/creating style_profiles table: " . $e->getMessage(), 'error');
        exit(1);
    }
}

// Main execution
if (!$isCli) {
    echo '<!DOCTYPE html>
<html>
<head>
    <title>Delete Inactive Style Profiles</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        h1 { color: #333; }
        .container { background: #f5f5f5; padding: 20px; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Delete Inactive Style Profiles</h1>';
}

try {
    $db = getDB();
    ensureStyleProfilesTable($db);
    
    // Get all profiles
    $stmt = $db->query('SELECT id, name, is_active, created_at FROM style_profiles ORDER BY is_active DESC, created_at DESC');
    $profiles = $stmt->fetchAll();
    
    if (empty($profiles)) {
        output("No style profiles found in the database.", 'info');
        exit(0);
    }
    
    // Find active profile
    $activeProfile = null;
    $inactiveProfiles = [];
    
    foreach ($profiles as $profile) {
        if ($profile['is_active'] == 1) {
            $activeProfile = $profile;
        } else {
            $inactiveProfiles[] = $profile;
        }
    }
    
    // Display current state
    output("Current Style Profiles:", 'info');
    output("", 'info');
    
    if ($activeProfile) {
        output("  ACTIVE: ID {$activeProfile['id']} - '{$activeProfile['name']}' (created: " . date('Y-m-d H:i:s', $activeProfile['created_at']) . ")", 'success');
    } else {
        output("  WARNING: No active profile found!", 'warning');
    }
    
    if (!empty($inactiveProfiles)) {
        output("", 'info');
        output("  Inactive profiles (" . count($inactiveProfiles) . "):", 'info');
        foreach ($inactiveProfiles as $profile) {
            output("    - ID {$profile['id']} - '{$profile['name']}' (created: " . date('Y-m-d H:i:s', $profile['created_at']) . ")", 'info');
        }
    } else {
        output("", 'info');
        output("  No inactive profiles found. Nothing to delete.", 'info');
        exit(0);
    }
    
    // Confirm deletion
    output("", 'info');
    if ($isCli) {
        // Command line mode
        $confirm = false;
        if (isset($argv[1]) && $argv[1] === '--confirm') {
            $confirm = true;
        } else {
            output("", 'info');
            output("This will delete " . count($inactiveProfiles) . " inactive profile(s).", 'warning');
            $response = getInput("Are you sure you want to proceed? (yes/no): ");
            $confirm = (strtolower(trim($response)) === 'yes');
        }
    } else {
        // Web mode
        if (!isset($_GET['confirm']) || $_GET['confirm'] !== 'yes') {
            output("", 'info');
            output("This will delete " . count($inactiveProfiles) . " inactive profile(s).", 'warning');
            output("", 'info');
            echo '<a href="?confirm=yes" style="background: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px;">Confirm Delete</a>';
            echo '<a href="?" style="background: #6c757d; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Cancel</a>';
            exit(0);
        }
        $confirm = true;
    }
    
    if (!$confirm) {
        output("Operation cancelled.", 'info');
        exit(0);
    }
    
    // Perform deletion
    output("", 'info');
    output("Deleting inactive profiles...", 'info');
    
    $db->beginTransaction();
    
    try {
        $deletedCount = 0;
        $deletedNames = [];
        
        foreach ($inactiveProfiles as $profile) {
            $stmt = $db->prepare('DELETE FROM style_profiles WHERE id = ?');
            $stmt->execute([$profile['id']]);
            $deletedCount++;
            $deletedNames[] = $profile['name'];
            output("  Deleted: ID {$profile['id']} - '{$profile['name']}'", 'success');
        }
        
        $db->commit();
        
        output("", 'info');
        output("Successfully deleted $deletedCount inactive profile(s).", 'success');
        
        if ($activeProfile) {
            output("Active profile '{$activeProfile['name']}' (ID: {$activeProfile['id']}) has been preserved.", 'success');
        }
        
    } catch (PDOException $e) {
        $db->rollBack();
        output("Error deleting profiles: " . $e->getMessage(), 'error');
        exit(1);
    }
    
} catch (Exception $e) {
    output("Unexpected error: " . $e->getMessage(), 'error');
    exit(1);
}

if (!$isCli) {
    echo '</div></body></html>';
}







