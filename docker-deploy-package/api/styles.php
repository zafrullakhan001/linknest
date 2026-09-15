<?php
require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

// Remove leading slash if present
$path = ltrim($path, '/');

switch ($method) {
    case 'GET':
        if ($path === '' || $path === '/') {
            handleGetStyles();
        } else if ($path === 'profiles') {
            handleGetProfiles();
        } else if (preg_match('/^profiles\/(\d+)$/', $path, $matches)) {
            handleGetProfile((int)$matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'PUT':
        if ($path === '' || $path === '/') {
            handleUpdateStyles();
        } else if (preg_match('/^profiles\/(\d+)\/activate$/', $path, $matches)) {
            handleActivateProfile((int)$matches[1]);
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'POST':
        if ($path === 'profiles') {
            handleCreateProfile();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'DELETE':
        if ($path === '' || $path === '/') {
            handleResetStyles();
        } else if (preg_match('/^profiles\/(\d+)$/', $path, $matches)) {
            handleDeleteProfile((int)$matches[1]);
        } else if ($path === 'profiles/inactive') {
            handleDeleteInactiveProfiles();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function ensureStyleProfilesTable($db) {
    try {
        // Check if table exists
        $tableExists = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='style_profiles'")->fetch();
        
        if (!$tableExists) {
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
        } else {
            // Table exists - check if it has the required columns
            $columns = $db->query("PRAGMA table_info(style_profiles)")->fetchAll(PDO::FETCH_ASSOC);
            $columnNames = array_column($columns, 'name');
            
            // Check if table has old column name 'styles' instead of 'styles_data'
            $hasOldStylesColumn = in_array('styles', $columnNames);
            $hasStylesDataColumn = in_array('styles_data', $columnNames);
            
            // Check if required columns exist - if not, add them or recreate table
            $requiredColumns = ['styles_data', 'name', 'is_active', 'created_at', 'updated_at'];
            $missingColumns = array_diff($requiredColumns, $columnNames);
            
            // If table has old 'styles' column but not 'styles_data', we need to migrate
            if ($hasOldStylesColumn && !$hasStylesDataColumn) {
                error_log('Detected old column name "styles" in style_profiles table. Migrating to "styles_data"...');
                
                // SQLite doesn't support RENAME COLUMN directly, so we need to recreate the table
                $db->beginTransaction();
                try {
                    // Get existing data if any
                    $existingData = [];
                    try {
                        $rows = $db->query('SELECT id, name, styles, is_active, created_at, updated_at FROM style_profiles')->fetchAll(PDO::FETCH_ASSOC);
                        $existingData = $rows;
                    } catch (PDOException $e) {
                        error_log('No existing data to migrate or error reading: ' . $e->getMessage());
                    }
                    
                    // Drop existing table and index
                    $db->exec('DROP INDEX IF EXISTS idx_style_profiles_active');
                    $db->exec('DROP TABLE IF EXISTS style_profiles');
                    
                    // Create new table with correct schema
                    $db->exec('CREATE TABLE style_profiles (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        styles_data TEXT NOT NULL,
                        is_active INTEGER DEFAULT 0,
                        created_at INTEGER NOT NULL,
                        updated_at INTEGER NOT NULL
                    )');
                    
                    // Restore existing data with renamed column
                    if (!empty($existingData)) {
                        $stmt = $db->prepare('INSERT INTO style_profiles (id, name, styles_data, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
                        foreach ($existingData as $row) {
                            $stylesData = isset($row['styles']) ? $row['styles'] : '{}';
                            $stmt->execute([
                                $row['id'],
                                isset($row['name']) ? $row['name'] : 'Migrated Profile',
                                $stylesData,
                                isset($row['is_active']) ? (int)$row['is_active'] : 0,
                                isset($row['created_at']) ? (int)$row['created_at'] : time(),
                                isset($row['updated_at']) ? (int)$row['updated_at'] : time()
                            ]);
                        }
                    }
                    
                    // Create index
                    $db->exec('CREATE INDEX idx_style_profiles_active ON style_profiles(is_active)');
                    
                    $db->commit();
                    error_log('style_profiles table migrated successfully from "styles" to "styles_data"');
                } catch (PDOException $e) {
                    $db->rollBack();
                    error_log('Error migrating style_profiles table: ' . $e->getMessage());
                    throw $e;
                }
            } else if (!empty($missingColumns)) {
                // Try to add missing columns first
                $columnsAdded = false;
                foreach ($missingColumns as $colName) {
                    try {
                        switch ($colName) {
                            case 'styles_data':
                                // Only add if it doesn't exist and 'styles' doesn't exist
                                if (!$hasStylesDataColumn && !$hasOldStylesColumn) {
                                    $db->exec('ALTER TABLE style_profiles ADD COLUMN styles_data TEXT');
                                }
                                break;
                            case 'name':
                                $db->exec('ALTER TABLE style_profiles ADD COLUMN name TEXT');
                                break;
                            case 'is_active':
                                $db->exec('ALTER TABLE style_profiles ADD COLUMN is_active INTEGER DEFAULT 0');
                                break;
                            case 'created_at':
                                $db->exec('ALTER TABLE style_profiles ADD COLUMN created_at INTEGER');
                                break;
                            case 'updated_at':
                                $db->exec('ALTER TABLE style_profiles ADD COLUMN updated_at INTEGER');
                                break;
                        }
                        $columnsAdded = true;
                        error_log("Added missing column {$colName} to style_profiles table");
                    } catch (PDOException $e) {
                        error_log("Could not add column {$colName}: " . $e->getMessage());
                        // If adding columns fails, we'll need to recreate the table
                    }
                }
                
                // If we couldn't add columns, recreate the table
                if (!$columnsAdded) {
                    // Check if table has data
                    $rowCount = $db->query('SELECT COUNT(*) as count FROM style_profiles')->fetch(PDO::FETCH_ASSOC);
                    $hasData = isset($rowCount['count']) && $rowCount['count'] > 0;
                    
                    if ($hasData) {
                        error_log('WARNING: style_profiles table has data but is missing required columns. Data will be lost when recreating table.');
                    }
                    
                    // Recreate table with correct schema
                    error_log('style_profiles table exists but is missing required columns. Recreating table...');
                    
                    $db->beginTransaction();
                    try {
                        // Drop existing table and index
                        $db->exec('DROP INDEX IF EXISTS idx_style_profiles_active');
                        $db->exec('DROP TABLE IF EXISTS style_profiles');
                        
                        // Create new table with correct schema
                        $db->exec('CREATE TABLE style_profiles (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            name TEXT NOT NULL,
                            styles_data TEXT NOT NULL,
                            is_active INTEGER DEFAULT 0,
                            created_at INTEGER NOT NULL,
                            updated_at INTEGER NOT NULL
                        )');
                        
                        // Create index
                        $db->exec('CREATE INDEX idx_style_profiles_active ON style_profiles(is_active)');
                        
                        $db->commit();
                        error_log('style_profiles table recreated successfully');
                    } catch (PDOException $e) {
                        $db->rollBack();
                        error_log('Error recreating style_profiles table: ' . $e->getMessage());
                        throw $e;
                    }
                }
            } else {
                // Table exists with correct structure - just ensure index exists
                $indexExists = $db->query("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_style_profiles_active'")->fetch();
                if (!$indexExists) {
                    try {
                        $db->exec('CREATE INDEX idx_style_profiles_active ON style_profiles(is_active)');
                    } catch (PDOException $e) {
                        error_log('Error creating index: ' . $e->getMessage());
                    }
                }
            }
        }
    } catch (PDOException $e) {
        error_log('Error ensuring style_profiles table: ' . $e->getMessage());
        throw $e;
    }
}

function handleGetStyles() {
    // Styles are public (for display), but only admins can update
    $db = getDB();
    
    // Ensure style_profiles table exists
    ensureStyleProfilesTable($db);
    
    // Try to get active profile first
    $stmt = $db->prepare('SELECT styles_data FROM style_profiles WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1');
    $stmt->execute();
    $activeProfile = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($activeProfile && !empty($activeProfile['styles_data'])) {
        $styles = json_decode($activeProfile['styles_data'], true);
        if ($styles !== null && json_last_error() === JSON_ERROR_NONE) {
            sendJSON(['styles' => $styles]);
            return;
        }
    }
    
    // Fallback to old space_styles table for backward compatibility
    try {
        $db->exec('CREATE TABLE IF NOT EXISTS space_styles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        )');
    } catch (PDOException $e) {
        // Table might already exist, continue
    }
    
    $stmt = $db->prepare('SELECT key, value FROM space_styles');
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($rows)) {
        // Return empty object, frontend will use defaults
        sendJSON(['styles' => null]);
        return;
    }
    
    // Reconstruct styles object from key-value pairs
    $styles = [];
    foreach ($rows as $row) {
        $key = $row['key'];
        $value = $row['value'];
        
        // Handle nested keys (e.g., gridColumns.sm)
        if (strpos($key, '.') !== false) {
            $parts = explode('.', $key);
            $current = &$styles;
            for ($i = 0; $i < count($parts) - 1; $i++) {
                if (!isset($current[$parts[$i]])) {
                    $current[$parts[$i]] = [];
                }
                $current = &$current[$parts[$i]];
            }
            $current[$parts[count($parts) - 1]] = json_decode($value, true);
        } else {
            // Try to decode JSON, fallback to string
            $decoded = json_decode($value, true);
            $styles[$key] = ($decoded !== null && json_last_error() === JSON_ERROR_NONE) ? $decoded : $value;
        }
    }
    
    sendJSON(['styles' => $styles]);
}

function handleUpdateStyles() {
    requireAdmin(); // Only admins can update styles
    
    $data = getJSONInput();
    
    if (!isset($data['styles']) || !is_array($data['styles'])) {
        sendJSON(['error' => 'Styles data is required'], 400);
    }
    
    $db = getDB();
    
    // Ensure style_profiles table exists
    ensureStyleProfilesTable($db);
    
    // Double-check table structure before inserting - force migration if needed
    $columns = $db->query("PRAGMA table_info(style_profiles)")->fetchAll(PDO::FETCH_ASSOC);
    $columnNames = array_column($columns, 'name');
    
    // Check if table has wrong column name or missing column
    $hasOldStylesColumn = in_array('styles', $columnNames);
    $hasStylesDataColumn = in_array('styles_data', $columnNames);
    
    if ($hasOldStylesColumn || !$hasStylesDataColumn) {
        // Table has wrong structure - force recreation
        error_log('Table has incorrect structure - forcing migration/recreation');
        try {
            // Force migration by dropping and recreating
            $db->beginTransaction();
            
            // Get existing data to preserve
            $existingData = [];
            if ($hasOldStylesColumn) {
                try {
                    $rows = $db->query('SELECT * FROM style_profiles')->fetchAll(PDO::FETCH_ASSOC);
                    $existingData = $rows;
                    error_log('Found ' . count($existingData) . ' existing profiles to migrate');
                } catch (PDOException $e) {
                    error_log('Could not read existing data: ' . $e->getMessage());
                }
            }
            
            // Drop table and index
            $db->exec('DROP INDEX IF EXISTS idx_style_profiles_active');
            $db->exec('DROP TABLE IF EXISTS style_profiles');
            
            // Create table with correct schema
            $db->exec('CREATE TABLE style_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                styles_data TEXT NOT NULL,
                is_active INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )');
            
            // Restore existing data if any
            if (!empty($existingData)) {
                $stmt = $db->prepare('INSERT INTO style_profiles (id, name, styles_data, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
                foreach ($existingData as $row) {
                    $stylesData = '{}';
                    if ($hasOldStylesColumn && isset($row['styles'])) {
                        $stylesData = $row['styles'];
                    } else if (isset($row['styles_data'])) {
                        $stylesData = $row['styles_data'];
                    }
                    
                    $stmt->execute([
                        $row['id'] ?? null,
                        $row['name'] ?? 'Migrated Profile',
                        $stylesData,
                        isset($row['is_active']) ? (int)$row['is_active'] : 0,
                        isset($row['created_at']) ? (int)$row['created_at'] : time(),
                        isset($row['updated_at']) ? (int)$row['updated_at'] : time()
                    ]);
                }
                error_log('Migrated ' . count($existingData) . ' profiles to new schema');
            }
            
            // Create index
            $db->exec('CREATE INDEX idx_style_profiles_active ON style_profiles(is_active)');
            
            $db->commit();
            error_log('Table successfully recreated with correct schema');
            
            // Re-fetch columns after recreation
            $columns = $db->query("PRAGMA table_info(style_profiles)")->fetchAll(PDO::FETCH_ASSOC);
            $columnNames = array_column($columns, 'name');
        } catch (PDOException $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            error_log('Error recreating table: ' . $e->getMessage());
            sendJSON(['error' => 'Database migration failed: ' . $e->getMessage()], 500);
            return;
        }
    }
    
    // Verify styles_data column exists
    if (!in_array('styles_data', $columnNames)) {
        error_log('ERROR: styles_data column still missing after migration');
        sendJSON(['error' => 'Database schema error: styles_data column is missing. Please contact administrator.'], 500);
        return;
    }
    
    $db->beginTransaction();
    
    try {
        $timestamp = time();
        $profileName = isset($data['profileName']) && !empty($data['profileName']) 
            ? $data['profileName'] 
            : 'Profile ' . date('Y-m-d H:i:s');
        
        // Deactivate all existing profiles
        $db->exec('UPDATE style_profiles SET is_active = 0');
        
        // Create new profile with the styles
        $stylesData = json_encode($data['styles']);
        $stmt = $db->prepare('INSERT INTO style_profiles (name, styles_data, is_active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)');
        $stmt->execute([$profileName, $stylesData, $timestamp, $timestamp]);
        
        $profileId = $db->lastInsertId();
        
        $db->commit();
        sendJSON([
            'success' => true, 
            'message' => 'Style profile created and activated successfully',
            'profileId' => $profileId,
            'profileName' => $profileName
        ]);
    } catch (Exception $e) {
        $db->rollBack();
        error_log('Error creating style profile: ' . $e->getMessage() . ' in ' . $e->getFile() . ' on line ' . $e->getLine());
        sendJSON(['error' => 'Failed to create style profile: ' . $e->getMessage()], 500);
    }
}

function handleGetProfiles() {
    requireAdmin(); // Only admins can view profiles
    
    $db = getDB();
    ensureStyleProfilesTable($db);
    
    try {
        $stmt = $db->prepare('SELECT id, name, is_active, created_at, updated_at FROM style_profiles ORDER BY updated_at DESC');
        $stmt->execute();
        $profiles = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Convert timestamps and is_active to proper types
        foreach ($profiles as &$profile) {
            $profile['is_active'] = (bool)$profile['is_active'];
            $profile['created_at'] = (int)$profile['created_at'];
            $profile['updated_at'] = (int)$profile['updated_at'];
        }
        
        sendJSON(['profiles' => $profiles]);
    } catch (Exception $e) {
        error_log('Error fetching profiles: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to fetch profiles: ' . $e->getMessage()], 500);
    }
}

function handleGetProfile($profileId) {
    requireAdmin(); // Only admins can view profiles
    
    $db = getDB();
    ensureStyleProfilesTable($db);
    
    try {
        $stmt = $db->prepare('SELECT id, name, styles_data, is_active, created_at, updated_at FROM style_profiles WHERE id = ?');
        $stmt->execute([$profileId]);
        $profile = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$profile) {
            sendJSON(['error' => 'Profile not found'], 404);
            return;
        }
        
        $styles = json_decode($profile['styles_data'], true);
        if ($styles === null && json_last_error() !== JSON_ERROR_NONE) {
            sendJSON(['error' => 'Invalid profile data'], 500);
            return;
        }
        
        $profile['styles'] = $styles;
        $profile['is_active'] = (bool)$profile['is_active'];
        $profile['created_at'] = (int)$profile['created_at'];
        $profile['updated_at'] = (int)$profile['updated_at'];
        unset($profile['styles_data']);
        
        sendJSON(['profile' => $profile]);
    } catch (Exception $e) {
        error_log('Error fetching profile: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to fetch profile: ' . $e->getMessage()], 500);
    }
}

function handleActivateProfile($profileId) {
    requireAdmin(); // Only admins can activate profiles
    
    $db = getDB();
    ensureStyleProfilesTable($db);
    
    $db->beginTransaction();
    
    try {
        // Check if profile exists
        $stmt = $db->prepare('SELECT id FROM style_profiles WHERE id = ?');
        $stmt->execute([$profileId]);
        $profile = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$profile) {
            $db->rollBack();
            sendJSON(['error' => 'Profile not found'], 404);
            return;
        }
        
        // Deactivate all profiles
        $db->exec('UPDATE style_profiles SET is_active = 0');
        
        // Activate the selected profile
        $stmt = $db->prepare('UPDATE style_profiles SET is_active = 1, updated_at = ? WHERE id = ?');
        $stmt->execute([time(), $profileId]);
        
        $db->commit();
        sendJSON(['success' => true, 'message' => 'Profile activated successfully']);
    } catch (Exception $e) {
        $db->rollBack();
        error_log('Error activating profile: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to activate profile: ' . $e->getMessage()], 500);
    }
}

function handleDeleteProfile($profileId) {
    requireAdmin(); // Only admins can delete profiles
    
    $db = getDB();
    ensureStyleProfilesTable($db);
    
    try {
        // Check if profile exists
        $stmt = $db->prepare('SELECT id, is_active FROM style_profiles WHERE id = ?');
        $stmt->execute([$profileId]);
        $profile = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$profile) {
            sendJSON(['error' => 'Profile not found'], 404);
            return;
        }
        
        // Don't allow deleting the active profile
        if ($profile['is_active']) {
            sendJSON(['error' => 'Cannot delete the active profile. Please activate another profile first.'], 400);
            return;
        }
        
        // Delete the profile
        $stmt = $db->prepare('DELETE FROM style_profiles WHERE id = ?');
        $stmt->execute([$profileId]);
        
        sendJSON(['success' => true, 'message' => 'Profile deleted successfully']);
    } catch (Exception $e) {
        error_log('Error deleting profile: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to delete profile: ' . $e->getMessage()], 500);
    }
}

function handleDeleteInactiveProfiles() {
    requireAdmin(); // Only admins can delete profiles
    
    $db = getDB();
    ensureStyleProfilesTable($db);
    
    $db->beginTransaction();
    
    try {
        // Get count of inactive profiles before deletion
        $stmt = $db->query('SELECT COUNT(*) as count FROM style_profiles WHERE is_active = 0');
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $inactiveCount = (int)$result['count'];
        
        if ($inactiveCount === 0) {
            $db->rollBack();
            sendJSON(['success' => true, 'message' => 'No inactive profiles to delete', 'deletedCount' => 0]);
            return;
        }
        
        // Delete all inactive profiles
        $stmt = $db->prepare('DELETE FROM style_profiles WHERE is_active = 0');
        $stmt->execute();
        
        $db->commit();
        
        sendJSON([
            'success' => true,
            'message' => "Successfully deleted {$inactiveCount} inactive profile(s)",
            'deletedCount' => $inactiveCount
        ]);
    } catch (Exception $e) {
        $db->rollBack();
        error_log('Error deleting inactive profiles: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to delete inactive profiles: ' . $e->getMessage()], 500);
    }
}

function handleCreateProfile() {
    requireAdmin(); // Only admins can create profiles
    
    $data = getJSONInput();
    
    if (!isset($data['styles']) || !is_array($data['styles'])) {
        sendJSON(['error' => 'Styles data is required'], 400);
    }
    
    if (!isset($data['name']) || empty($data['name'])) {
        sendJSON(['error' => 'Profile name is required'], 400);
    }
    
    $db = getDB();
    ensureStyleProfilesTable($db);
    
    try {
        $timestamp = time();
        $stylesData = json_encode($data['styles']);
        $activate = isset($data['activate']) ? (bool)$data['activate'] : false;
        
        if ($activate) {
            // Deactivate all existing profiles
            $db->exec('UPDATE style_profiles SET is_active = 0');
        }
        
        $stmt = $db->prepare('INSERT INTO style_profiles (name, styles_data, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([$data['name'], $stylesData, $activate ? 1 : 0, $timestamp, $timestamp]);
        
        $profileId = $db->lastInsertId();
        
        sendJSON([
            'success' => true,
            'message' => 'Profile created successfully',
            'profileId' => $profileId
        ]);
    } catch (Exception $e) {
        error_log('Error creating profile: ' . $e->getMessage());
        sendJSON(['error' => 'Failed to create profile: ' . $e->getMessage()], 500);
    }
}

function handleResetStyles() {
    requireAdmin(); // Only admins can reset styles
    
    $db = getDB();
    
    try {
        // Ensure styles table exists
        $db->exec('CREATE TABLE IF NOT EXISTS space_styles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        )');
        
        // Clear all styles
        $db->exec('DELETE FROM space_styles');
        
        sendJSON(['success' => true, 'message' => 'Styles reset to default']);
    } catch (Exception $e) {
        sendJSON(['error' => 'Failed to reset styles: ' . $e->getMessage()], 500);
    }
}

