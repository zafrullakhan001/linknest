<?php
// Router script for PHP built-in server
$requestUri = $_SERVER['REQUEST_URI'];
$path = parse_url($requestUri, PHP_URL_PATH);

// Route API requests to api/index.php
if (strpos($path, '/api') === 0) {
    // Preserve the original REQUEST_URI for the API router
    chdir(__DIR__ . '/api');
    $_SERVER['SCRIPT_NAME'] = '/api/index.php';
    require __DIR__ . '/api/index.php';
    return true;
}

// For all other requests, check if file exists
$file = __DIR__ . $path;
if ($path !== '/' && file_exists($file) && is_file($file)) {
    return false; // Let PHP serve the file
}

// For SPA routing, serve index.html
if (file_exists(__DIR__ . '/index.html')) {
    readfile(__DIR__ . '/index.html');
    return true;
}

// 404
http_response_code(404);
echo '404 Not Found';
return true;

