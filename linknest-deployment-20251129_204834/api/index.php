<?php
// Simple router for API endpoints
// Include config first to set up error handling
require_once __DIR__ . '/config.php';

// Ensure we always return JSON, not HTML
if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
}

$requestUri = $_SERVER['REQUEST_URI'];
$requestMethod = $_SERVER['REQUEST_METHOD'];

// Get path from query parameter (for Vite proxy or .htaccess rewrite) or from REQUEST_URI
$path = $_GET['path'] ?? '';

// If path comes from query parameter (via .htaccess rewrite or Vite proxy)
if (!empty($path)) {
    // Path from query parameter - ensure it starts with /
    $path = '/' . ltrim($path, '/');
} else {
    // Parse from REQUEST_URI (direct access or other routing)
    $parsedPath = parse_url($requestUri, PHP_URL_PATH);
    
    // Remove base path if needed (handle both /api and /linknest/api)
    $basePath = '/api';
    if (strpos($parsedPath, '/linknest/api') === 0) {
        $path = substr($parsedPath, strlen('/linknest/api'));
    } elseif (strpos($parsedPath, $basePath) === 0) {
        $path = substr($parsedPath, strlen($basePath));
    } else {
        // If path doesn't start with /api, it might be a direct request
        // Check if it's just the endpoint name (e.g., /styles, /settings)
        $path = $parsedPath;
    }
    
    // Ensure path starts with / for routing
    if (!empty($path) && $path[0] !== '/') {
        $path = '/' . $path;
    }
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
} elseif (strpos($path, '/settings') === 0) {
    $_SERVER['PATH_INFO'] = substr($path, 9); // Remove '/settings'
    require __DIR__ . '/settings.php';
} elseif (strpos($path, '/database') === 0) {
    $_SERVER['PATH_INFO'] = substr($path, 9); // Remove '/database'
    require __DIR__ . '/database.php';
} elseif (strpos($path, '/arrangements') === 0) {
    $_SERVER['PATH_INFO'] = substr($path, 13); // Remove '/arrangements'
    require __DIR__ . '/arrangements.php';
} elseif (strpos($path, '/linkhealth') === 0) {
    // Remove the '/linkhealth' prefix (11 characters) and keep any sub-path (e.g. '/check', '/check-tile')
    $remainingPath = substr($path, 11);
    // Set PATH_INFO - use '/' for root endpoint, or ensure sub-paths start with /
    if (empty($remainingPath) || $remainingPath === '/') {
        $_SERVER['PATH_INFO'] = '/';
    } else {
        $_SERVER['PATH_INFO'] = ($remainingPath[0] === '/') ? $remainingPath : '/' . $remainingPath;
    }
    require __DIR__ . '/linkhealth.php';
} elseif (strpos($path, '/styles') === 0) {
    $_SERVER['PATH_INFO'] = substr($path, 7); // Remove '/styles'
    require __DIR__ . '/styles.php';
} elseif (strpos($path, '/access') === 0) {
    $_SERVER['PATH_INFO'] = substr($path, 7); // Remove '/access'
    require __DIR__ . '/access.php';
} elseif (strpos($path, '/ldap_test.php') === 0) {
    require __DIR__ . '/ldap_test.php';
} else {
    http_response_code(404);
    header('Content-Type: application/json');
    // Include debug info to help diagnose routing issues (safe for dev)
    echo json_encode([
        'error' => 'Not found',
        'debug' => [
            'path' => $path,
            'request_uri' => $requestUri,
            'get_path' => $_GET['path'] ?? null
        ]
    ]);
}

