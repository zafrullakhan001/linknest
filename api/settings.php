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
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

/**
 * Detect if we're running in XAMPP (with /linknest/ prefix) or Docker/production (without prefix)
 * Returns true if we need the /linknest/ prefix, false otherwise
 */
function needsLinknestPrefix() {
    // Check REQUEST_URI for /linknest/ path
    $requestUri = $_SERVER['REQUEST_URI'] ?? '';
    if (strpos($requestUri, '/linknest/') !== false) {
        return true;
    }
    
    // Check SCRIPT_NAME
    $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
    if (strpos($scriptName, '/linknest/') !== false) {
        return true;
    }
    
    // Check if we're in a subdirectory (XAMPP typically uses /linknest/)
    // Docker typically serves from root
    return false;
}

/**
 * Normalize a logo URL to work in the current environment
 * Always stores as /uploads/filename, but returns with correct prefix for current environment
 */
function normalizeLogoUrl($url) {
    if (empty($url)) {
        return $url;
    }
    
    // Remove any existing /linknest/ prefix to get the base path
    $normalized = preg_replace('#^/linknest/uploads/#', '/uploads/', $url);
    
    // If we need the /linknest/ prefix for this environment, add it
    if (needsLinknestPrefix() && strpos($normalized, '/uploads/') === 0) {
        $normalized = '/linknest' . $normalized;
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
                'guest_access_enabled',
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
                'access_control_enabled', 'access_control_mode', 'access_control_allow_anonymous', 'access_control_audit_logging'
            ];
            if (!in_array($key, $allowedKeys)) {
                continue; // Skip invalid keys
            }
            
            // Normalize logo_image URL before storing (remove environment prefix)
            if ($key === 'logo_image' && !empty($value)) {
                $value = preg_replace('#^/linknest/uploads/#', '/uploads/', $value);
            }
            
            // Normalize favicon URL before storing (remove environment prefix)
            if ($key === 'favicon' && !empty($value)) {
                $value = preg_replace('#^/linknest/uploads/#', '/uploads/', $value);
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

