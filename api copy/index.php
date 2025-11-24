<?php
// Simple router for API endpoints
$requestUri = $_SERVER['REQUEST_URI'];
$requestMethod = $_SERVER['REQUEST_METHOD'];

// Get path from query parameter (for Vite proxy) or from REQUEST_URI
$path = $_GET['path'] ?? '';

// If no query parameter, parse from REQUEST_URI
if (empty($path)) {
    $parsedPath = parse_url($requestUri, PHP_URL_PATH);
    
    // Remove base path if needed (handle both /api and /linknest/api)
    $basePath = '/api';
    if (strpos($parsedPath, '/linknest/api') === 0) {
        $path = substr($parsedPath, strlen('/linknest/api'));
    } elseif (strpos($parsedPath, $basePath) === 0) {
        $path = substr($parsedPath, strlen($basePath));
    }
    
    // Remove leading slash if present
    $path = ltrim($path, '/');
}

// Ensure path starts with /
if (!empty($path) && $path[0] !== '/') {
    $path = '/' . $path;
}

// Route to appropriate handler
if (empty($path) || $path === '/') {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Not found']);
} elseif (strpos($path, '/auth') === 0) {
    $_SERVER['PATH_INFO'] = substr($path, 5); // Remove '/auth'
    require __DIR__ . '/auth.php';
} elseif (strpos($path, '/tiles') === 0) {
    $_SERVER['PATH_INFO'] = substr($path, 6); // Remove '/tiles'
    require __DIR__ . '/tiles.php';
} else {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Not found']);
}

