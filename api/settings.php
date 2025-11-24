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
    
    // Generate URL (relative to the application root)
    // Check if we're in Docker (no /linknest/ in path) or XAMPP (with /linknest/)
    $basePath = (strpos($_SERVER['REQUEST_URI'] ?? '', '/linknest/') !== false) ? '/linknest/uploads/' : '/uploads/';
    $url = $basePath . $filename;
    
    // Update settings with the new logo URL
    $db = getDB();
    $stmt = $db->prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
    $stmt->execute(['logo_image', $url, time()]);
    
    sendJSON([
        'success' => true,
        'url' => $url,
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

