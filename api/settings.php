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
            handleGetSettings();
        } else if ($path === '/database-path') {
            handleGetDatabasePath();
        } else if ($path === '/user-preferences') {
            handleGetUserPreferences();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'POST':
        if ($path === '/upload-logo') {
            handleUploadLogo();
        } else if ($path === '/upload-favicon') {
            handleUploadFavicon();
        } else if ($path === '/encrypt-password') {
            handleEncryptPassword();
        } else if ($path === '/decrypt-password') {
            handleDecryptPassword();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'PUT':
        if ($path === '' || $path === '/') {
            handleUpdateSettings();
        } else if ($path === '/user-preferences') {
            handleUpdateUserPreferences();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

/**
 * Detect the base path dynamically from REQUEST_URI
 * Returns the base path (e.g., '/myapp' or '') or empty string if at root
 */
function getBasePath() {
    $requestUri = $_SERVER['REQUEST_URI'] ?? '';
    $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
    $httpHost = $_SERVER['HTTP_HOST'] ?? '';
    $httpReferer = $_SERVER['HTTP_REFERER'] ?? '';
    
    // Extract base path from REQUEST_URI
    // Look for pattern: /basepath/api/...
    if (preg_match('#^/([^/]+)/api/#', $requestUri, $matches)) {
        return '/' . $matches[1];
    }
    
    // Check SCRIPT_NAME for base path
    if (preg_match('#^/([^/]+)/api/#', $scriptName, $matches)) {
        return '/' . $matches[1];
    }
    
    // In dev mode, check HTTP_REFERER for base path (Vite proxy might strip it from REQUEST_URI)
    // Look for pattern like http://localhost:3000/basepath/...
    if (!empty($httpReferer) && preg_match('#://[^/]+/([^/]+)/#', $httpReferer, $matches)) {
        $refererBasePath = '/' . $matches[1];
        // Only use if it's not a common path like 'api', 'uploads', 'dist', 'assets'
        if (!in_array($matches[1], ['api', 'uploads', 'dist', 'assets', 'node_modules'])) {
            return $refererBasePath;
        }
    }
    
    // No base path detected (running from root)
    return '';
}

/**
 * Normalize a logo URL to work in the current environment
 * Always stores as /uploads/filename, but returns with correct prefix for current environment
 */
function normalizeLogoUrl($url) {
    if (empty($url)) {
        return $url;
    }
    
    // Remove any existing base path prefix to get the normalized path
    $normalized = preg_replace('#^/[^/]+/uploads/#', '/uploads/', $url);
    
    // Get current base path
    $basePath = getBasePath();
    
    // If we have a base path and the URL is /uploads/..., add the base path
    if ($basePath && strpos($normalized, '/uploads/') === 0) {
        $normalized = $basePath . $normalized;
    }
    
    return $normalized;
}

function handleGetSettings() {
    // Settings are public (for display), but only admins can update
    $db = getDB();
    $stmt = $db->prepare('SELECT key, value FROM settings');
    $stmt->execute();
    $rows = $stmt->fetchAll();
    
    $settings = [];
    foreach ($rows as $row) {
        $settings[$row['key']] = $row['value'];
    }
    
    // Handle LDAP bind password: decrypt if encrypted, or auto-encrypt if plain text
    if (isset($settings['ldap_bind_password']) && !empty($settings['ldap_bind_password'])) {
        $password = $settings['ldap_bind_password'];
        
        // Check if password is encrypted (contains dots in the format: base64.base64.base64)
        $isEncrypted = (strpos($password, '.') !== false && substr_count($password, '.') === 2);
        
        if ($isEncrypted) {
            // Password is encrypted, decrypt it for display
            try {
                $decrypted = decryptPassword($password);
                $settings['ldap_bind_password'] = $decrypted;
            } catch (Exception $e) {
                // If decryption fails, log the error for debugging
                error_log('Failed to decrypt LDAP bind password in settings: ' . $e->getMessage());
                error_log('DB_PATH: ' . (defined('DB_PATH') ? DB_PATH : 'not defined'));
                error_log('Password format: encrypted (length: ' . strlen($password) . ')');
                // Keep the original encrypted value - don't show it in UI, show empty instead
                // This prevents showing the long encrypted string to users
                $settings['ldap_bind_password'] = '';
            }
        } else {
            // Password is plain text - encrypt it automatically and update the database
            try {
                $encryptedPassword = encryptPassword($password);
                $updateStmt = $db->prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?');
                $updateStmt->execute([$encryptedPassword, time(), 'ldap_bind_password']);
                // Return the decrypted version for display (frontend will encrypt when saving)
                $settings['ldap_bind_password'] = $password;
            } catch (Exception $e) {
                // If encryption fails, log error but continue
                error_log('Failed to auto-encrypt LDAP bind password: ' . $e->getMessage());
            }
        }
    }
    
    // Normalize logo_image URL for current environment
    if (isset($settings['logo_image']) && !empty($settings['logo_image'])) {
        $settings['logo_image'] = normalizeLogoUrl($settings['logo_image']);
    }
    
    // Normalize favicon URL for current environment
    if (isset($settings['favicon']) && !empty($settings['favicon'])) {
        $settings['favicon'] = normalizeLogoUrl($settings['favicon']);
    }
    
    sendJSON(['settings' => $settings]);
}

function handleUploadLogo() {
    requireAdmin(); // Only admins can upload
    
    // Check if file was uploaded
    if (!isset($_FILES['logo']) || $_FILES['logo']['error'] !== UPLOAD_ERR_OK) {
        sendJSON(['error' => 'No file uploaded or upload error'], 400);
    }
    
    $file = $_FILES['logo'];
    
    // Validate file type
    $allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/svg+xml', 'image/webp'];
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    
    if (!in_array($mimeType, $allowedTypes)) {
        sendJSON(['error' => 'Invalid file type. Allowed: JPEG, PNG, GIF, SVG, WebP'], 400);
    }
    
    // Validate file size (max 2MB)
    $maxSize = 2 * 1024 * 1024; // 2MB
    if ($file['size'] > $maxSize) {
        sendJSON(['error' => 'File size too large. Maximum size: 2MB'], 400);
    }
    
    // Validate dimensions (for non-SVG images)
    if ($mimeType !== 'image/svg+xml') {
        $imageInfo = @getimagesize($file['tmp_name']);
        if ($imageInfo === false) {
            sendJSON(['error' => 'Invalid image file'], 400);
        }
        
        $maxWidth = 512;
        $maxHeight = 512;
        $minWidth = 32;
        $minHeight = 32;
        
        if ($imageInfo[0] > $maxWidth || $imageInfo[1] > $maxHeight) {
            sendJSON(['error' => "Image dimensions too large. Maximum: {$maxWidth}x{$maxHeight}px. Your image: {$imageInfo[0]}x{$imageInfo[1]}px"], 400);
        }
        
        if ($imageInfo[0] < $minWidth || $imageInfo[1] < $minHeight) {
            sendJSON(['error' => "Image dimensions too small. Minimum: {$minWidth}x{$minHeight}px. Your image: {$imageInfo[0]}x{$imageInfo[1]}px"], 400);
        }
    }
    
    // Create uploads directory if it doesn't exist
    $uploadDir = __DIR__ . '/../uploads';
    if (!file_exists($uploadDir)) {
        if (!mkdir($uploadDir, 0755, true)) {
            sendJSON(['error' => 'Failed to create uploads directory'], 500);
        }
    }
    
    // Generate unique filename
    $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = 'logo_' . time() . '_' . uniqid() . '.' . $extension;
    $filepath = $uploadDir . '/' . $filename;
    
    // Move uploaded file
    if (!move_uploaded_file($file['tmp_name'], $filepath)) {
        sendJSON(['error' => 'Failed to save uploaded file'], 500);
    }
    
    // Always store as /uploads/filename (without environment prefix)
    // The URL will be normalized when returned based on current environment
    $url = '/uploads/' . $filename;
    
    // Update settings with the new logo URL (stored without prefix)
    $db = getDB();
    $stmt = $db->prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
    $stmt->execute(['logo_image', $url, time()]);
    
    // Return normalized URL for current environment
    $normalizedUrl = normalizeLogoUrl($url);
    
    sendJSON([
        'success' => true,
        'url' => $normalizedUrl,
        'message' => 'Logo uploaded successfully'
    ]);
}

function handleUploadFavicon() {
    requireAdmin(); // Only admins can upload
    
    // Check if file was uploaded
    if (!isset($_FILES['favicon']) || $_FILES['favicon']['error'] !== UPLOAD_ERR_OK) {
        sendJSON(['error' => 'No file uploaded or upload error'], 400);
    }
    
    $file = $_FILES['favicon'];
    
    // Validate file type (favicon typically supports ICO, PNG, SVG)
    $allowedTypes = ['image/x-icon', 'image/vnd.microsoft.icon', 'image/png', 'image/svg+xml', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    
    // Also check file extension for ICO files (which might have different MIME types)
    $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $allowedExtensions = ['ico', 'png', 'svg', 'jpg', 'jpeg', 'gif', 'webp'];
    
    if (!in_array($mimeType, $allowedTypes) && !in_array($extension, $allowedExtensions)) {
        sendJSON(['error' => 'Invalid file type. Allowed: ICO, PNG, SVG, JPEG, GIF, WebP'], 400);
    }
    
    // Validate file size (max 1MB for favicon - smaller than logo)
    $maxSize = 1 * 1024 * 1024; // 1MB
    if ($file['size'] > $maxSize) {
        sendJSON(['error' => 'File size too large. Maximum size: 1MB'], 400);
    }
    
    // Validate dimensions (for non-SVG images)
    if ($mimeType !== 'image/svg+xml' && $extension !== 'svg') {
        $imageInfo = @getimagesize($file['tmp_name']);
        if ($imageInfo === false) {
            sendJSON(['error' => 'Invalid image file'], 400);
        }
        
        $maxWidth = 512;
        $maxHeight = 512;
        $minWidth = 16;
        $minHeight = 16;
        
        if ($imageInfo[0] > $maxWidth || $imageInfo[1] > $maxHeight) {
            sendJSON(['error' => "Image dimensions too large. Maximum: {$maxWidth}x{$maxHeight}px. Your image: {$imageInfo[0]}x{$imageInfo[1]}px"], 400);
        }
        
        if ($imageInfo[0] < $minWidth || $imageInfo[1] < $minHeight) {
            sendJSON(['error' => "Image dimensions too small. Minimum: {$minWidth}x{$minHeight}px. Your image: {$imageInfo[0]}x{$imageInfo[1]}px"], 400);
        }
    }
    
    // Create uploads directory if it doesn't exist
    $uploadDir = __DIR__ . '/../uploads';
    if (!file_exists($uploadDir)) {
        if (!mkdir($uploadDir, 0755, true)) {
            sendJSON(['error' => 'Failed to create uploads directory'], 500);
        }
    }
    
    // Generate unique filename
    $filename = 'favicon_' . time() . '_' . uniqid() . '.' . $extension;
    $filepath = $uploadDir . '/' . $filename;
    
    // Move uploaded file
    if (!move_uploaded_file($file['tmp_name'], $filepath)) {
        sendJSON(['error' => 'Failed to save uploaded file'], 500);
    }
    
    // Always store as /uploads/filename (without environment prefix)
    // The URL will be normalized when returned based on current environment
    $url = '/uploads/' . $filename;
    
    // Update settings with the new favicon URL (stored without prefix)
    $db = getDB();
    $stmt = $db->prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
    $stmt->execute(['favicon', $url, time()]);
    
    // Return normalized URL for current environment
    $normalizedUrl = normalizeLogoUrl($url);
    
    sendJSON([
        'success' => true,
        'url' => $normalizedUrl,
        'message' => 'Favicon uploaded successfully'
    ]);
}

function handleUpdateSettings() {
    requireAdmin(); // Only admins can update settings
    
    $data = getJSONInput();
    
    if (!isset($data['settings']) || !is_array($data['settings'])) {
        sendJSON(['error' => 'Settings data is required'], 400);
    }
    
    $db = getDB();
    $db->beginTransaction();
    
    try {
        foreach ($data['settings'] as $key => $value) {
            // Validate allowed keys
            $allowedKeys = [
                'app_name', 'page_title', 'spaces_title', 'logo_type', 'logo_icon', 'logo_image', 'favicon',
                'footer_text',
                'guest_access_enabled',
                'show_database_path_in_footer',
                'ldap_enabled', 'ldap_server', 'ldap_port', 'ldap_protocol', 'ldap_base_dn',
                'ldap_login_domain',
                'ldap_bind_dn', 'ldap_bind_password',
                'ldap_user_search_base', 'ldap_user_filter', 'ldap_user_attributes', 
                'ldap_group_search_base', 'ldap_group_filter', 'ldap_group_attributes', 
                'ldap_auto_create_users', 'ldap_auto_update_users', 'ldap_sync_interval', 
                'ldap_require_group_membership', 'ldap_required_groups', 'ldap_timeout', 'ldap_tls',
                'ldap_search_scope', 'ldap_user_dn_template', 'ldap_nested_groups', 'ldap_case_sensitive',
                'ldap_ssl_verify', 'ldap_connection_retry', 'ldap_retry_delay', 'ldap_email_attribute',
                'ldap_display_name_attribute', 'ldap_referrals',
                'access_control_enabled', 'access_control_mode', 'access_control_allow_anonymous', 'access_control_audit_logging',
                'browser_specific_links_enabled', 'browser_extension_id'
            ];
            if (!in_array($key, $allowedKeys)) {
                continue; // Skip invalid keys
            }
            
            // Normalize logo_image URL before storing (remove any base path prefix)
            if ($key === 'logo_image' && !empty($value)) {
                $value = preg_replace('#^/[^/]+/uploads/#', '/uploads/', $value);
            }
            
            // Normalize favicon URL before storing (remove any base path prefix)
            if ($key === 'favicon' && !empty($value)) {
                $value = preg_replace('#^/[^/]+/uploads/#', '/uploads/', $value);
            }
            
            // Encrypt LDAP bind password if it's plain text (not already encrypted)
            if ($key === 'ldap_bind_password' && !empty($value)) {
                // Check if password is already encrypted (encrypted passwords contain dots)
                // Plain text passwords won't have the encrypted format: base64(iv).base64(tag).base64(encrypted)
                if (strpos($value, '.') === false || substr_count($value, '.') !== 2) {
                    // Password is plain text, encrypt it
                    try {
                        $value = encryptPassword($value);
                    } catch (Exception $e) {
                        // If encryption fails, log error but continue (don't break the save)
                        error_log('Failed to encrypt LDAP bind password: ' . $e->getMessage());
                    }
                }
                // If password already contains dots in the right format, assume it's already encrypted
            }
            
            $stmt = $db->prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
            $stmt->execute([$key, $value, time()]);
        }
        
        $db->commit();
        sendJSON(['success' => true, 'message' => 'Settings updated successfully']);
    } catch (Exception $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to update settings: ' . $e->getMessage()], 500);
    }
}

function handleEncryptPassword() {
    requireAdmin(); // Only admins can encrypt passwords
    
    $data = getJSONInput();
    
    if (!isset($data['password'])) {
        sendJSON(['error' => 'Password is required'], 400);
    }
    
    try {
        $encrypted = encryptPassword($data['password']);
        sendJSON(['encrypted' => $encrypted]);
    } catch (Exception $e) {
        sendJSON(['error' => 'Encryption failed: ' . $e->getMessage()], 500);
    }
}

function handleDecryptPassword() {
    requireAdmin(); // Only admins can decrypt passwords
    
    $data = getJSONInput();
    
    if (!isset($data['encrypted_password'])) {
        sendJSON(['error' => 'Encrypted password is required'], 400);
    }
    
    try {
        $decrypted = decryptPassword($data['encrypted_password']);
        sendJSON(['password' => $decrypted]);
    } catch (Exception $e) {
        sendJSON(['error' => 'Decryption failed: ' . $e->getMessage()], 500);
    }
}

function handleGetDatabasePath() {
    // Database path is public information (for verification purposes)
    // Get the absolute path of the database file
    $dbPath = defined('DB_PATH') ? DB_PATH : __DIR__ . '/../data/linknest.db';
    $absolutePath = realpath($dbPath);
    
    // If realpath fails (file doesn't exist), use the defined path
    if ($absolutePath === false) {
        $absolutePath = $dbPath;
    }
    
    // Normalize path separators for consistent handling
    $normalizedPath = str_replace(['\\', '/'], DIRECTORY_SEPARATOR, $absolutePath);
    
    // Remove the base path (C:\xampp\htdocs\) and keep only from linknest folder onwards
    $linknestPos = stripos($normalizedPath, 'linknest');
    
    if ($linknestPos !== false) {
        // Extract path from 'linknest' onwards
        $relativePath = substr($normalizedPath, $linknestPos);
        // Convert back to forward slashes for display (works on both Windows and Unix)
        $displayPath = str_replace('\\', '/', $relativePath);
    } else {
        // If 'linknest' not found, try to get relative path from project root
        $projectRoot = realpath(__DIR__ . '/..');
        if ($projectRoot !== false && strpos($normalizedPath, $projectRoot) === 0) {
            $relativePath = substr($normalizedPath, strlen($projectRoot) + 1);
            $displayPath = str_replace('\\', '/', $relativePath);
        } else {
            // Fallback: just show the filename
            $displayPath = basename($absolutePath);
        }
    }
    
    // Return both absolute and relative paths
    // Convert absolute path to forward slashes for consistency
    $absoluteDisplayPath = str_replace('\\', '/', $absolutePath);
    
    sendJSON([
        'database_path' => $displayPath,
        'database_path_absolute' => $absoluteDisplayPath
    ]);
}

function handleGetUserPreferences() {
    $user = requireAuth(); // User must be authenticated
    
    $userId = $user['id'];
    $db = getDB();
    $stmt = $db->prepare('SELECT preference_key, preference_value FROM user_preferences WHERE user_id = ?');
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll();
    
    $preferences = [];
    foreach ($rows as $row) {
        $preferences[$row['preference_key']] = $row['preference_value'];
    }
    
    sendJSON(['preferences' => $preferences]);
}

function handleUpdateUserPreferences() {
    $user = requireAuth(); // User must be authenticated
    
    $userId = $user['id'];
    $data = getJSONInput();
    
    if (!isset($data['preferences']) || !is_array($data['preferences'])) {
        sendJSON(['error' => 'Preferences data is required'], 400);
        return;
    }
    
    $db = getDB();
    $db->beginTransaction();
    
    try {
        foreach ($data['preferences'] as $key => $value) {
            // Validate preference key (only allow alphanumeric, underscore, and hyphen)
            if (!preg_match('/^[a-zA-Z0-9_-]+$/', $key)) {
                continue; // Skip invalid keys
            }
            
            // Store preference value as JSON string if it's an array/object, otherwise as string
            $preferenceValue = is_array($value) || is_object($value) ? json_encode($value) : (string)$value;
            
            $stmt = $db->prepare('INSERT OR REPLACE INTO user_preferences (user_id, preference_key, preference_value, updated_at) VALUES (?, ?, ?, ?)');
            $stmt->execute([$userId, $key, $preferenceValue, time()]);
        }
        
        $db->commit();
        sendJSON(['success' => true, 'message' => 'Preferences updated successfully']);
    } catch (Exception $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to update preferences: ' . $e->getMessage()], 500);
    }
}

