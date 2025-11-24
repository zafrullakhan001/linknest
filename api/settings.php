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
            $allowedKeys = ['app_name', 'page_title', 'spaces_title', 'logo_type', 'logo_icon', 'logo_image'];
            if (!in_array($key, $allowedKeys)) {
                continue; // Skip invalid keys
            }
            
            // Normalize logo_image URL before storing (remove environment prefix)
            if ($key === 'logo_image' && !empty($value)) {
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

