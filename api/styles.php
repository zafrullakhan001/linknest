<?php
require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

switch ($method) {
    case 'GET':
        if ($path === '' || $path === '/') {
            handleGetStyles();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'PUT':
        if ($path === '' || $path === '/') {
            handleUpdateStyles();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'DELETE':
        if ($path === '' || $path === '/') {
            handleResetStyles();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleGetStyles() {
    // Styles are public (for display), but only admins can update
    $db = getDB();
    
    // Ensure styles table exists
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
    
    // Ensure styles table exists
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
    
    $db->beginTransaction();
    
    try {
        // Clear existing styles
        $db->exec('DELETE FROM space_styles');
        
        // Flatten the styles array into key-value pairs
        $flattened = [];
        $flatten = function($array, $prefix = '') use (&$flatten, &$flattened) {
            foreach ($array as $key => $value) {
                $newKey = $prefix ? $prefix . '.' . $key : $key;
                if (is_array($value)) {
                    $flatten($value, $newKey);
                } else {
                    $flattened[$newKey] = $value;
                }
            }
        };
        
        $flatten($data['styles']);
        
        // Prepare statement once for better performance
        $stmt = $db->prepare('INSERT INTO space_styles (key, value, updated_at) VALUES (?, ?, ?)');
        $timestamp = time();
        
        // Insert all flattened key-value pairs
        foreach ($flattened as $key => $value) {
            $jsonValue = json_encode($value);
            $stmt->execute([$key, $jsonValue, $timestamp]);
        }
        
        $db->commit();
        sendJSON(['success' => true, 'message' => 'Styles updated successfully']);
    } catch (Exception $e) {
        $db->rollBack();
        error_log('Error updating styles: ' . $e->getMessage() . ' in ' . $e->getFile() . ' on line ' . $e->getLine());
        sendJSON(['error' => 'Failed to update styles: ' . $e->getMessage()], 500);
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

