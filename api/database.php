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
        } elseif ($path === '/info' || $path === '/info/') {
            handleGetDatabaseInfo();
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

function handleGetDatabaseInfo() {
    requireAdmin(); // Only admins can view database info
    
    try {
        $dbPath = DB_PATH;
        $dbDir = DB_DIR;
        $exists = file_exists($dbPath);
        $size = $exists ? filesize($dbPath) : 0;
        $readable = $exists ? is_readable($dbPath) : false;
        $writable = $exists ? is_writable($dbPath) : false;
        $modified = $exists ? filemtime($dbPath) : null;
        
        // Get absolute path
        $absolutePath = realpath($dbPath) ?: $dbPath;
        
        // Get database stats if it exists
        $stats = null;
        if ($exists) {
            try {
                $db = getDB();
                $stats = [
                    'page_count' => $db->query('PRAGMA page_count')->fetchColumn(),
                    'page_size' => $db->query('PRAGMA page_size')->fetchColumn(),
                    'journal_mode' => $db->query('PRAGMA journal_mode')->fetchColumn(),
                    'user_version' => $db->query('PRAGMA user_version')->fetchColumn(),
                ];
                
                // Get table counts
                $tables = [
                    'users', 
                    'tiles', 
                    'tabs',
                    'sections', 
                    'links', 
                    'settings', 
                    'tile_arrangements', 
                    'category_arrangements',
                    'rich_text_content',
                    'user_tile_favorites',
                    'user_tile_permissions',
                    'style_profiles',
                    'user_preferences',
                    'clones'
                ];
                $tableCounts = [];
                foreach ($tables as $table) {
                    try {
                        $count = $db->query("SELECT COUNT(*) FROM $table")->fetchColumn();
                        $tableCounts[$table] = (int)$count;
                    } catch (PDOException $e) {
                        $tableCounts[$table] = null; // Table doesn't exist
                    }
                }
                $stats['table_counts'] = $tableCounts;
            } catch (PDOException $e) {
                $stats = ['error' => 'Could not read database: ' . $e->getMessage()];
            }
        }
        
        sendJSON([
            'database' => [
                'path' => $dbPath,
                'absolute_path' => $absolutePath,
                'directory' => $dbDir,
                'exists' => $exists,
                'size' => $size,
                'size_formatted' => $exists ? formatBytes($size) : 'N/A',
                'readable' => $readable,
                'writable' => $writable,
                'modified' => $modified,
                'modified_formatted' => $modified ? date('Y-m-d H:i:s', $modified) : null,
                'stats' => $stats
            ]
        ]);
    } catch (Exception $e) {
        sendJSON(['error' => 'Failed to get database info: ' . $e->getMessage()], 500);
    }
}

function formatBytes($bytes, $precision = 2) {
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= pow(1024, $pow);
    return round($bytes, $precision) . ' ' . $units[$pow];
}

function handleExportDatabase() {
    requireAdmin(); // Only admins can export
    
    $db = getDB();
    
    try {
        // Export all tables
        $export = [
            'version' => '2.1', // Updated to include all new tables: rich_text_content, user_tile_favorites, user_tile_permissions, style_profiles, user_preferences
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
        
        // Export tabs table (if exists)
        try {
            $stmt = $db->prepare('SELECT * FROM tabs');
            $stmt->execute();
            $export['tables']['tabs'] = $stmt->fetchAll();
        } catch (PDOException $e) {
            // Table might not exist in older databases, skip
            $export['tables']['tabs'] = [];
        }
        
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
        
        // Export rich_text_content table (if exists)
        try {
            $stmt = $db->prepare('SELECT * FROM rich_text_content');
            $stmt->execute();
            $export['tables']['rich_text_content'] = $stmt->fetchAll();
        } catch (PDOException $e) {
            // Table might not exist in older databases, skip
            $export['tables']['rich_text_content'] = [];
        }
        
        // Export user_tile_favorites table (if exists)
        try {
            $stmt = $db->prepare('SELECT * FROM user_tile_favorites');
            $stmt->execute();
            $export['tables']['user_tile_favorites'] = $stmt->fetchAll();
        } catch (PDOException $e) {
            // Table might not exist in older databases, skip
            $export['tables']['user_tile_favorites'] = [];
        }
        
        // Export user_tile_permissions table (if exists)
        try {
            $stmt = $db->prepare('SELECT * FROM user_tile_permissions');
            $stmt->execute();
            $export['tables']['user_tile_permissions'] = $stmt->fetchAll();
        } catch (PDOException $e) {
            // Table might not exist in older databases, skip
            $export['tables']['user_tile_permissions'] = [];
        }
        
        // Export style_profiles table (if exists)
        try {
            $stmt = $db->prepare('SELECT * FROM style_profiles');
            $stmt->execute();
            $export['tables']['style_profiles'] = $stmt->fetchAll();
        } catch (PDOException $e) {
            // Table might not exist in older databases, skip
            $export['tables']['style_profiles'] = [];
        }
        
        // Export user_preferences table (if exists)
        try {
            $stmt = $db->prepare('SELECT * FROM user_preferences');
            $stmt->execute();
            $export['tables']['user_preferences'] = $stmt->fetchAll();
        } catch (PDOException $e) {
            // Table might not exist in older databases, skip
            $export['tables']['user_preferences'] = [];
        }
        
        // Note: clones table is intentionally excluded as it contains operational/temporary data
        
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
        // Clear tables that reference other tables first
        try {
            $db->exec('DELETE FROM user_tile_permissions');
        } catch (PDOException $e) {
            // Table might not exist, ignore
        }
        try {
            $db->exec('DELETE FROM user_tile_favorites');
        } catch (PDOException $e) {
            // Table might not exist, ignore
        }
        try {
            $db->exec('DELETE FROM user_preferences');
        } catch (PDOException $e) {
            // Table might not exist, ignore
        }
        try {
            $db->exec('DELETE FROM rich_text_content');
        } catch (PDOException $e) {
            // Table might not exist, ignore
        }
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
        try {
            $db->exec('DELETE FROM tabs');
        } catch (PDOException $e) {
            // Table might not exist, ignore
        }
        $db->exec('DELETE FROM tiles');
        try {
            $db->exec('DELETE FROM style_profiles');
        } catch (PDOException $e) {
            // Table might not exist, ignore
        }
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
        
        // Import tiles (with position, visibility, and hyperlink columns)
        if (isset($data['tables']['tiles']) && is_array($data['tables']['tiles'])) {
            $stmt = $db->prepare('INSERT INTO tiles (id, user_id, title, description, html_content, emoji, theme_color, "group", position, visibility, allowed_users, is_hyperlink, hyperlink_url, open_in_new_tab, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            foreach ($data['tables']['tiles'] as $tile) {
                $visibility = $tile['visibility'] ?? 'public';
                $allowedUsers = null;
                if ($visibility === 'private' && isset($tile['allowed_users']) && $tile['allowed_users']) {
                    $allowedUsers = is_string($tile['allowed_users']) ? $tile['allowed_users'] : json_encode($tile['allowed_users']);
                }
                $isHyperlink = isset($tile['is_hyperlink']) ? (int)$tile['is_hyperlink'] : 0;
                $hyperlinkUrl = $tile['hyperlink_url'] ?? null;
                $openInNewTab = isset($tile['open_in_new_tab']) ? (int)$tile['open_in_new_tab'] : 0;
                
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
                    $visibility,
                    $allowedUsers,
                    $isHyperlink,
                    $hyperlinkUrl,
                    $openInNewTab,
                    $tile['created_at'] ?? time()
                ]);
            }
        }
        
        // Import tabs (if exists in export)
        if (isset($data['tables']['tabs']) && is_array($data['tables']['tabs'])) {
            try {
                $stmt = $db->prepare('INSERT INTO tabs (id, tile_id, title, position, visible_from, expires_at) VALUES (?, ?, ?, ?, ?, ?)');
                foreach ($data['tables']['tabs'] as $tab) {
                    $stmt->execute([
                        $tab['id'] ?? '',
                        $tab['tile_id'] ?? '',
                        $tab['title'] ?? 'New Tab',
                        isset($tab['position']) ? (int)$tab['position'] : 0,
                        $tab['visible_from'] ?? null,
                        $tab['expires_at'] ?? null
                    ]);
                }
            } catch (PDOException $e) {
                // Table might not exist, but that's okay - it will be created on next init
                error_log('Warning: Could not import tabs: ' . $e->getMessage());
            }
        }
        
        // Import sections
        if (isset($data['tables']['sections']) && is_array($data['tables']['sections'])) {
            $stmt = $db->prepare('INSERT INTO sections (id, tile_id, tab_id, title, visible_from, expires_at) VALUES (?, ?, ?, ?, ?, ?)');
            foreach ($data['tables']['sections'] as $section) {
                $stmt->execute([
                    $section['id'] ?? '',
                    $section['tile_id'] ?? '',
                    $section['tab_id'] ?? null,
                    $section['title'] ?? null,
                    $section['visible_from'] ?? null,
                    $section['expires_at'] ?? null
                ]);
            }
        }
        
        // Import links (with all new columns: health, visibility, notes, tooltip)
        if (isset($data['tables']['links']) && is_array($data['tables']['links'])) {
            $stmt = $db->prepare('INSERT INTO links (id, section_id, label, url, health_status, health_checked_at, health_http_code, health_error, visibility, allowed_users, notes, tooltip, visible_from, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
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
                    $link['tooltip'] ?? null,
                    $link['visible_from'] ?? null,
                    $link['expires_at'] ?? null
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
                $stmt = $db->prepare('INSERT INTO category_arrangements (user_id, category_name, position, visible_from, expires_at) VALUES (?, ?, ?, ?, ?)');
                foreach ($data['tables']['category_arrangements'] as $arrangement) {
                    $stmt->execute([
                        isset($arrangement['user_id']) ? (int)$arrangement['user_id'] : 0,
                        $arrangement['category_name'] ?? '',
                        isset($arrangement['position']) ? (int)$arrangement['position'] : 0,
                        $arrangement['visible_from'] ?? null,
                        $arrangement['expires_at'] ?? null
                    ]);
                }
            } catch (PDOException $e) {
                // Table might not exist, but that's okay - it will be created on next init
                error_log('Warning: Could not import category_arrangements: ' . $e->getMessage());
            }
        }
        
        // Import rich_text_content (if exists in export)
        if (isset($data['tables']['rich_text_content']) && is_array($data['tables']['rich_text_content'])) {
            try {
                $stmt = $db->prepare('INSERT INTO rich_text_content (id, section_id, content, position) VALUES (?, ?, ?, ?)');
                foreach ($data['tables']['rich_text_content'] as $richText) {
                    $stmt->execute([
                        $richText['id'] ?? '',
                        $richText['section_id'] ?? '',
                        $richText['content'] ?? '',
                        isset($richText['position']) ? (int)$richText['position'] : 0
                    ]);
                }
            } catch (PDOException $e) {
                // Table might not exist, but that's okay - it will be created on next init
                error_log('Warning: Could not import rich_text_content: ' . $e->getMessage());
            }
        }
        
        // Import user_tile_favorites (if exists in export)
        if (isset($data['tables']['user_tile_favorites']) && is_array($data['tables']['user_tile_favorites'])) {
            try {
                $stmt = $db->prepare('INSERT INTO user_tile_favorites (user_id, tile_id, created_at) VALUES (?, ?, ?)');
                foreach ($data['tables']['user_tile_favorites'] as $favorite) {
                    $stmt->execute([
                        isset($favorite['user_id']) ? (int)$favorite['user_id'] : 0,
                        $favorite['tile_id'] ?? '',
                        isset($favorite['created_at']) ? (int)$favorite['created_at'] : time()
                    ]);
                }
            } catch (PDOException $e) {
                // Table might not exist, but that's okay - it will be created on next init
                error_log('Warning: Could not import user_tile_favorites: ' . $e->getMessage());
            }
        }
        
        // Import user_tile_permissions (if exists in export)
        if (isset($data['tables']['user_tile_permissions']) && is_array($data['tables']['user_tile_permissions'])) {
            try {
                $stmt = $db->prepare('INSERT INTO user_tile_permissions (user_id, tile_id, can_view, can_edit, can_delete, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
                foreach ($data['tables']['user_tile_permissions'] as $permission) {
                    $stmt->execute([
                        isset($permission['user_id']) ? (int)$permission['user_id'] : 0,
                        $permission['tile_id'] ?? '',
                        isset($permission['can_view']) ? (int)$permission['can_view'] : 1,
                        isset($permission['can_edit']) ? (int)$permission['can_edit'] : 0,
                        isset($permission['can_delete']) ? (int)$permission['can_delete'] : 0,
                        isset($permission['created_at']) ? (int)$permission['created_at'] : time(),
                        isset($permission['updated_at']) ? (int)$permission['updated_at'] : time()
                    ]);
                }
            } catch (PDOException $e) {
                // Table might not exist, but that's okay - it will be created on next init
                error_log('Warning: Could not import user_tile_permissions: ' . $e->getMessage());
            }
        }
        
        // Import style_profiles (if exists in export)
        if (isset($data['tables']['style_profiles']) && is_array($data['tables']['style_profiles'])) {
            try {
                $stmt = $db->prepare('INSERT INTO style_profiles (id, name, styles_data, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
                foreach ($data['tables']['style_profiles'] as $profile) {
                    // Handle both old 'styles' column name and new 'styles_data' column name for backward compatibility
                    $stylesData = $profile['styles_data'] ?? $profile['styles'] ?? '{}';
                    $stmt->execute([
                        isset($profile['id']) ? (int)$profile['id'] : null,
                        $profile['name'] ?? '',
                        $stylesData,
                        isset($profile['is_active']) ? (int)$profile['is_active'] : 0,
                        isset($profile['created_at']) ? (int)$profile['created_at'] : time(),
                        isset($profile['updated_at']) ? (int)$profile['updated_at'] : time()
                    ]);
                }
            } catch (PDOException $e) {
                // Table might not exist, but that's okay - it will be created on next init
                error_log('Warning: Could not import style_profiles: ' . $e->getMessage());
            }
        }
        
        // Import user_preferences (if exists in export)
        if (isset($data['tables']['user_preferences']) && is_array($data['tables']['user_preferences'])) {
            try {
                $stmt = $db->prepare('INSERT INTO user_preferences (user_id, preference_key, preference_value, updated_at) VALUES (?, ?, ?, ?)');
                foreach ($data['tables']['user_preferences'] as $preference) {
                    $stmt->execute([
                        isset($preference['user_id']) ? (int)$preference['user_id'] : 0,
                        $preference['preference_key'] ?? '',
                        $preference['preference_value'] ?? null,
                        isset($preference['updated_at']) ? (int)$preference['updated_at'] : time()
                    ]);
                }
            } catch (PDOException $e) {
                // Table might not exist, but that's okay - it will be created on next init
                error_log('Warning: Could not import user_preferences: ' . $e->getMessage());
            }
        }
        
        // Note: clones table is intentionally excluded from import as it contains operational/temporary data
        
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
                'tabs' => count($data['tables']['tabs'] ?? []),
                'sections' => count($data['tables']['sections'] ?? []),
                'links' => count($data['tables']['links'] ?? []),
                'settings' => count($data['tables']['settings'] ?? []),
                'tile_arrangements' => count($data['tables']['tile_arrangements'] ?? []),
                'category_arrangements' => count($data['tables']['category_arrangements'] ?? []),
                'rich_text_content' => count($data['tables']['rich_text_content'] ?? []),
                'user_tile_favorites' => count($data['tables']['user_tile_favorites'] ?? []),
                'user_tile_permissions' => count($data['tables']['user_tile_permissions'] ?? []),
                'style_profiles' => count($data['tables']['style_profiles'] ?? []),
                'user_preferences' => count($data['tables']['user_preferences'] ?? [])
            ]
        ]);
        
    } catch (Exception $e) {
        $db->rollBack();
        $db->exec('PRAGMA foreign_keys = ON'); // Re-enable even on error
        sendJSON(['error' => 'Failed to import database: ' . $e->getMessage()], 500);
    }
}










