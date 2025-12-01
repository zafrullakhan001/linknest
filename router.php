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

// Route uploads requests
if (strpos($path, '/uploads') === 0) {
    $file = __DIR__ . $path;
    if (file_exists($file) && is_file($file)) {
        // Set correct MIME type for image files
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        if (in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico'])) {
            $mimeTypes = [
                'jpg' => 'image/jpeg',
                'jpeg' => 'image/jpeg',
                'png' => 'image/png',
                'gif' => 'image/gif',
                'svg' => 'image/svg+xml',
                'webp' => 'image/webp',
                'ico' => 'image/x-icon'
            ];
            header('Content-Type: ' . ($mimeTypes[$ext] ?? 'application/octet-stream'));
        }
        readfile($file);
        return true;
    }
}

// Check if production build exists (dist folder)
$distIndex = __DIR__ . '/dist/index.html';
$isProduction = file_exists($distIndex);

// If production build doesn't exist, show helpful error message
if (!$isProduction && ($path === '/' || $path === '')) {
    // Only show error on root path to avoid interfering with API calls
    http_response_code(503);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html><head><title>Build Required</title></head><body>';
    echo '<h1>Production Build Not Found</h1>';
    echo '<p>The application needs to be built before it can run in production mode.</p>';
    echo '<p>Please run: <code>npm install</code> followed by <code>npm run build</code></p>';
    echo '<p>This will create the <code>dist</code> folder with the production build.</p>';
    echo '<p>Current directory: ' . htmlspecialchars(__DIR__) . '</p>';
    echo '<p>Expected file: ' . htmlspecialchars($distIndex) . '</p>';
    if (is_dir(__DIR__ . '/dist')) {
        echo '<p>Note: The <code>dist</code> directory exists but <code>index.html</code> is missing.</p>';
    }
    echo '</body></html>';
    return true;
}

if ($isProduction) {
    // Production mode: serve from dist folder
    // Handle assets requests - Vite builds assets in dist/assets/
    // Can be referenced as /assets/, ./assets/, or assets/ (relative paths)
    if (strpos($path, '/assets/') === 0 || strpos($path, '/dist/assets/') === 0) {
        // Handle /assets/ or /dist/assets/ requests
        $file = strpos($path, '/dist/assets/') === 0 
            ? __DIR__ . $path 
            : __DIR__ . '/dist' . $path;
        if (file_exists($file) && is_file($file)) {
            // Set correct MIME type based on file extension
            $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
            if ($ext === 'js' || $ext === 'mjs') {
                header('Content-Type: application/javascript; charset=utf-8');
            } elseif ($ext === 'css') {
                header('Content-Type: text/css; charset=utf-8');
            } elseif ($ext === 'json') {
                header('Content-Type: application/json; charset=utf-8');
            } elseif ($ext === 'html' || $ext === 'htm') {
                header('Content-Type: text/html; charset=utf-8');
            }
            readfile($file);
            return true;
        }
    }
    
    // Also handle relative asset paths (assets/js/... without leading slash)
    // This handles cases where base path is relative (./)
    if (preg_match('#^/([^/]+/)?assets/#', $path)) {
        // Extract the asset path (remove any subdirectory prefix)
        $assetPath = preg_replace('#^/([^/]+/)?assets/#', '/dist/assets/', $path);
        $file = __DIR__ . $assetPath;
        if (file_exists($file) && is_file($file)) {
            $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
            if ($ext === 'js' || $ext === 'mjs') {
                header('Content-Type: application/javascript; charset=utf-8');
            } elseif ($ext === 'css') {
                header('Content-Type: text/css; charset=utf-8');
            } elseif ($ext === 'json') {
                header('Content-Type: application/json; charset=utf-8');
            }
            readfile($file);
            return true;
        }
    }
    
    // Handle direct dist/ requests
    if (strpos($path, '/dist/') === 0) {
        $file = __DIR__ . $path;
        if (file_exists($file) && is_file($file)) {
            // Set correct MIME type based on file extension
            $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
            if ($ext === 'js' || $ext === 'mjs') {
                header('Content-Type: application/javascript; charset=utf-8');
            } elseif ($ext === 'css') {
                header('Content-Type: text/css; charset=utf-8');
            } elseif ($ext === 'json') {
                header('Content-Type: application/json; charset=utf-8');
            } elseif ($ext === 'html' || $ext === 'htm') {
                header('Content-Type: text/html; charset=utf-8');
            }
            readfile($file);
            return true;
        }
    }
    
    // For root path, serve dist/index.html
    if ($path === '/' || $path === '') {
        header('Content-Type: text/html; charset=utf-8');
        readfile($distIndex);
        return true;
    }
    
    // Check if requested file exists in root (for other files like router.php itself, but NOT index.html)
    // We want to serve dist/index.html for all routes, not the root index.html
    if ($path === '/index.html' || $path === '/index.tsx' || $path === '/index.ts') {
        // Explicitly serve dist/index.html even if root index.html exists
        header('Content-Type: text/html; charset=utf-8');
        readfile($distIndex);
        return true;
    }
    
    $file = __DIR__ . $path;
    if (file_exists($file) && is_file($file)) {
        // Don't serve root index.html in production mode - always use dist
        if (basename($file) === 'index.html' && strpos($file, '/dist/') === false) {
            header('Content-Type: text/html; charset=utf-8');
            readfile($distIndex);
            return true;
        }
        // Set correct MIME type for root files
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        if ($ext === 'js' || $ext === 'mjs') {
            header('Content-Type: application/javascript; charset=utf-8');
        } elseif ($ext === 'css') {
            header('Content-Type: text/css; charset=utf-8');
        } elseif ($ext === 'json') {
            header('Content-Type: application/json; charset=utf-8');
        } elseif ($ext === 'html' || $ext === 'htm') {
            header('Content-Type: text/html; charset=utf-8');
        }
        readfile($file);
        return true;
    }
    
    // For SPA routing (any path that doesn't exist), serve dist/index.html
    header('Content-Type: text/html; charset=utf-8');
    readfile($distIndex);
    return true;
} else {
    // Development mode: serve from root
    // For all other requests, check if file exists
    $file = __DIR__ . $path;
    if ($path !== '/' && file_exists($file) && is_file($file)) {
        // Set correct MIME type based on file extension
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        if ($ext === 'js' || $ext === 'mjs' || $ext === 'ts' || $ext === 'tsx') {
            header('Content-Type: application/javascript; charset=utf-8');
        } elseif ($ext === 'css') {
            header('Content-Type: text/css; charset=utf-8');
        } elseif ($ext === 'json') {
            header('Content-Type: application/json; charset=utf-8');
        } elseif ($ext === 'html' || $ext === 'htm') {
            header('Content-Type: text/html; charset=utf-8');
        }
        readfile($file);
        return true;
    }

    // For SPA routing, serve index.html
    if (file_exists(__DIR__ . '/index.html')) {
        header('Content-Type: text/html; charset=utf-8');
        readfile(__DIR__ . '/index.html');
        return true;
    }
}

// 404
http_response_code(404);
echo '404 Not Found';
return true;

