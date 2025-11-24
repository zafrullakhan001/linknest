<?php
// Serve uploaded files (logos, etc.)
require_once __DIR__ . '/config.php';

// Get the requested filename from the path
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';
$filename = ltrim($path, '/');

// Security: Only allow alphanumeric, dots, underscores, and hyphens in filename
if (!preg_match('/^[a-zA-Z0-9._-]+$/', $filename)) {
    http_response_code(400);
    header('Content-Type: text/plain');
    echo 'Invalid filename';
    exit;
}

// Path to uploads directory
$uploadDir = __DIR__ . '/../uploads';
$filepath = $uploadDir . '/' . $filename;

// Check if file exists
if (!file_exists($filepath) || !is_file($filepath)) {
    http_response_code(404);
    header('Content-Type: text/plain');
    echo 'File not found';
    exit;
}

// Get file extension to determine MIME type
$extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
$mimeTypes = [
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'png' => 'image/png',
    'gif' => 'image/gif',
    'svg' => 'image/svg+xml',
    'webp' => 'image/webp'
];

$mimeType = $mimeTypes[$extension] ?? 'application/octet-stream';

// Set headers
header('Content-Type: ' . $mimeType);
header('Content-Length: ' . filesize($filepath));
header('Cache-Control: public, max-age=31536000'); // Cache for 1 year

// Output file
readfile($filepath);
exit;

