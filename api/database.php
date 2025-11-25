<?php
require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

switch ($method) {
    case 'GET':
        if ($path === '/export' || $path === '/export/') {
            handleExportDatabase();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'POST':
        if ($path === '/import' || $path === '/import/') {
            handleImportDatabase();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleExportDatabase() {
    requireAdmin(); // Only admins can export
    
    $db = getDB();
    
    try {
        // Export all tables
        $export = [
            'version' => '2.0', // Updated to include all new columns and tables
            'exported_at' => time(),
            'tables' => []
        ];
        
        // Export users table
        $stmt = $db->prepare('SELECT * FROM users');
        $stmt->execute();
        $export['tables']['users'] = $stmt->fetchAll();
        
        // Export tiles table
        $stmt = $db->prepare('SELECT * FROM tiles');
        $stmt->execute();
        $export['tables']['tiles'] = $stmt->fetchAll();
        
        // Export sections table
        $stmt = $db->prepare('SELECT * FROM sections');
        $stmt->execute();
        $export['tables']['sections'] = $stmt->fetchAll();
        
        // Export links table
        $stmt = $db->prepare('SELECT * FROM links');
        $stmt->execute();
        $export['tables']['links'] = $stmt->fetchAll();
        
        // Export settings table
        $stmt = $db->prepare('SELECT * FROM settings');
        $stmt->execute();
        $export['tables']['settings'] = $stmt->fetchAll();
        
        // Export tile_arrangements table (if exists)
        try {
            $stmt = $db->prepare('SELECT * FROM tile_arrangements');
            $stmt->execute();
            $export['tables']['tile_arrangements'] = $stmt->fetchAll();
        } catch (PDOException $e) {
            // Table might not exist in older exports, skip
            $export['tables']['tile_arrangements'] = [];
        }
        
        // Export category_arrangements table (if exists)
        try {
            $stmt = $db->prepare('SELECT * FROM category_arrangements');
            $stmt->execute();
            $export['tables']['category_arrangements'] = $stmt->fetchAll();
        } catch (PDOException $e) {
            // Table might not exist in older exports, skip
            $export['tables']['category_arrangements'] = [];
        }
        
        // Set headers for file download
        header('Content-Type: application/json');
        header('Content-Disposition: attachment; filename="linknest-database-export-' . date('Y-m-d-His') . '.json"');
        
        echo json_encode($export, JSON_PRETTY_PRINT);
        exit;
        
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to export database: ' . $e->getMessage()], 500);
    }
}

function handleImportDatabase() {
    requireAdmin(); // Only admins can import
    
    $data = getJSONInput();
    
    if (!isset($data['tables']) || !is_array($data['tables'])) {
        sendJSON(['error' => 'Invalid import data. Expected "tables" array.'], 400);
    }
    
    // getDB() calls initDatabase() which ensures all tables and columns exist
    // including migrations for new columns (auth_source, position, health fields, etc.)
    $db = getDB();
    $db->beginTransaction();
    
    try {
        // Disable foreign key checks temporarily for import
        $db->exec('PRAGMA foreign_keys = OFF');
        
        // Import in order: users, tiles, sections, links, settings
        // This ensures foreign key constraints are satisfied
        
        // Clear existing data (in reverse order of dependencies)
        // Clear arrangement tables first (they reference tiles)
        try {
            $db->exec('DELETE FROM category_arrangements');
        } catch (PDOException $e) {
            // Table might not exist, ignore
        }
        try {
            $db->exec('DELETE FROM tile_arrangements');
        } catch (PDOException $e) {
            // Table might not exist, ignore
        }
        $db->exec('DELETE FROM links');
        $db->exec('DELETE FROM sections');
        $db->exec('DELETE FROM tiles');
        $db->exec('DELETE FROM settings');
        $db->exec('DELETE FROM users');
        
        // Reset auto-increment counters
        $db->exec('DELETE FROM sqlite_sequence WHERE name IN ("users")');
        
        // Import users (with all columns including auth_source)
        if (isset($data['tables']['users']) && is_array($data['tables']['users'])) {
            $stmt = $db->prepare('INSERT INTO users (id, username, email, password_hash, is_admin, is_approved, auth_source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            foreach ($data['tables']['users'] as $user) {
                $stmt->execute([
                    $user['id'] ?? null,
                    $user['username'] ?? '',
                    $user['email'] ?? '',
                    $user['password_hash'] ?? '',
                    isset($user['is_admin']) ? (int)$user['is_admin'] : 0,
                    isset($user['is_approved']) ? (int)$user['is_approved'] : 0,
                    $user['auth_source'] ?? 'local', // Default to 'local' for backward compatibility
                    $user['created_at'] ?? time()
                ]);
            }
        }
        
        // Import tiles (with position column)
        if (isset($data['tables']['tiles']) && is_array($data['tables']['tiles'])) {
            $stmt = $db->prepare('INSERT INTO tiles (id, user_id, title, description, html_content, emoji, theme_color, "group", position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            foreach ($data['tables']['tiles'] as $tile) {
                $stmt->execute([
                    $tile['id'] ?? '',
                    $tile['user_id'] ?? null,
                    $tile['title'] ?? '',
                    $tile['description'] ?? null,
                    $tile['html_content'] ?? null,
                    $tile['emoji'] ?? null,
                    $tile['theme_color'] ?? null,
                    $tile['group'] ?? null,
                    isset($tile['position']) ? (int)$tile['position'] : 0, // Default to 0 for backward compatibility
                    $tile['created_at'] ?? time()
                ]);
            }
        }
        
        // Import sections
        if (isset($data['tables']['sections']) && is_array($data['tables']['sections'])) {
            $stmt = $db->prepare('INSERT INTO sections (id, tile_id, title) VALUES (?, ?, ?)');
            foreach ($data['tables']['sections'] as $section) {
                $stmt->execute([
                    $section['id'] ?? '',
                    $section['tile_id'] ?? '',
                    $section['title'] ?? null
                ]);
            }
        }
        
        // Import links (with all new columns: health, visibility, notes, tooltip)
        if (isset($data['tables']['links']) && is_array($data['tables']['links'])) {
            $stmt = $db->prepare('INSERT INTO links (id, section_id, label, url, health_status, health_checked_at, health_http_code, health_error, visibility, allowed_users, notes, tooltip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            foreach ($data['tables']['links'] as $link) {
                $stmt->execute([
                    $link['id'] ?? '',
                    $link['section_id'] ?? '',
                    $link['label'] ?? '',
                    $link['url'] ?? '',
                    $link['health_status'] ?? 'unknown', // Default for backward compatibility
                    isset($link['health_checked_at']) ? (int)$link['health_checked_at'] : null,
                    isset($link['health_http_code']) ? (int)$link['health_http_code'] : null,
                    $link['health_error'] ?? null,
                    $link['visibility'] ?? 'public', // Default for backward compatibility
                    $link['allowed_users'] ?? null,
                    $link['notes'] ?? null,
                    $link['tooltip'] ?? null
                ]);
            }
        }
        
        // Import settings
        if (isset($data['tables']['settings']) && is_array($data['tables']['settings'])) {
            $stmt = $db->prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
            foreach ($data['tables']['settings'] as $setting) {
                $stmt->execute([
                    $setting['key'] ?? '',
                    $setting['value'] ?? '',
                    $setting['updated_at'] ?? time()
                ]);
            }
        }
        
        // Import tile_arrangements (if exists in export)
        if (isset($data['tables']['tile_arrangements']) && is_array($data['tables']['tile_arrangements'])) {
            try {
                $stmt = $db->prepare('INSERT INTO tile_arrangements (user_id, tile_id, position, group_name) VALUES (?, ?, ?, ?)');
                foreach ($data['tables']['tile_arrangements'] as $arrangement) {
                    $stmt->execute([
                        isset($arrangement['user_id']) ? (int)$arrangement['user_id'] : 0,
                        $arrangement['tile_id'] ?? '',
                        isset($arrangement['position']) ? (int)$arrangement['position'] : 0,
                        $arrangement['group_name'] ?? null
                    ]);
                }
            } catch (PDOException $e) {
                // Table might not exist, but that's okay - it will be created on next init
                error_log('Warning: Could not import tile_arrangements: ' . $e->getMessage());
            }
        }
        
        // Import category_arrangements (if exists in export)
        if (isset($data['tables']['category_arrangements']) && is_array($data['tables']['category_arrangements'])) {
            try {
                $stmt = $db->prepare('INSERT INTO category_arrangements (user_id, category_name, position) VALUES (?, ?, ?)');
                foreach ($data['tables']['category_arrangements'] as $arrangement) {
                    $stmt->execute([
                        isset($arrangement['user_id']) ? (int)$arrangement['user_id'] : 0,
                        $arrangement['category_name'] ?? '',
                        isset($arrangement['position']) ? (int)$arrangement['position'] : 0
                    ]);
                }
            } catch (PDOException $e) {
                // Table might not exist, but that's okay - it will be created on next init
                error_log('Warning: Could not import category_arrangements: ' . $e->getMessage());
            }
        }
        
        // Recreate indexes after import for optimal performance
        createDatabaseIndexes($db);
        
        // Re-enable foreign keys
        $db->exec('PRAGMA foreign_keys = ON');
        
        $db->commit();
        
        sendJSON([
            'success' => true,
            'message' => 'Database imported successfully',
            'imported' => [
                'users' => count($data['tables']['users'] ?? []),
                'tiles' => count($data['tables']['tiles'] ?? []),
                'sections' => count($data['tables']['sections'] ?? []),
                'links' => count($data['tables']['links'] ?? []),
                'settings' => count($data['tables']['settings'] ?? []),
                'tile_arrangements' => count($data['tables']['tile_arrangements'] ?? []),
                'category_arrangements' => count($data['tables']['category_arrangements'] ?? [])
            ]
        ]);
        
    } catch (Exception $e) {
        $db->rollBack();
        $db->exec('PRAGMA foreign_keys = ON'); // Re-enable even on error
        sendJSON(['error' => 'Failed to import database: ' . $e->getMessage()], 500);
    }
}










