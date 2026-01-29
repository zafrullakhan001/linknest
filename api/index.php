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

// Log for debugging
error_log("api/index.php: REQUEST_URI = " . $requestUri);
error_log("api/index.php: REQUEST_METHOD = " . $requestMethod);
error_log("api/index.php: _GET['path'] = " . ($_GET['path'] ?? 'not set'));

// If path comes from query parameter (via .htaccess rewrite or Vite proxy)
if (!empty($path)) {
    // Remove query string from path if present (query params are in $_GET)
    if (($queryPos = strpos($path, '?')) !== false) {
        $path = substr($path, 0, $queryPos);
    }
    // Path from query parameter - ensure it starts with /
    $path = '/' . ltrim($path, '/');
    error_log("api/index.php: Path from query parameter: $path");
} else {
    // Parse from REQUEST_URI (direct access or other routing)
    $parsedPath = parse_url($requestUri, PHP_URL_PATH);
    error_log("api/index.php: Parsed path from REQUEST_URI: $parsedPath");
    
    // Dynamically detect base path instead of hardcoding /linknest/api
    // Find /api in the path and extract everything after it
    $apiPos = strpos($parsedPath, '/api');
    if ($apiPos !== false) {
        $path = substr($parsedPath, $apiPos + 4); // +4 for '/api'
        error_log("api/index.php: Extracted path after /api: $path");
    } else {
        // If path doesn't contain /api, it might be a direct request
        // Check if it's just the endpoint name (e.g., /styles, /settings)
        $path = $parsedPath;
        error_log("api/index.php: No /api found, using parsed path: $path");
    }
    
    // Ensure path starts with / for routing
    if (!empty($path) && $path[0] !== '/') {
        $path = '/' . $path;
    }
}

// Normalize empty path to avoid issues
if (empty($path)) {
    $path = '/';
}

error_log("api/index.php: Final normalized path: $path");

// Start session for auth and roles routes so cookies are available
if ((strpos($path, '/auth') === 0 || strpos($path, '/roles') === 0) && session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Route to appropriate handler
if ($path === '/') {
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
} elseif (strpos($path, '/chat') === 0) {
    $remainingPath = substr($path, 5); // Remove '/chat'
    // Set PATH_INFO - use '/' for root endpoint, or ensure sub-paths start with /
    if (empty($remainingPath) || $remainingPath === '/') {
        $_SERVER['PATH_INFO'] = '/';
    } else {
        $_SERVER['PATH_INFO'] = ($remainingPath[0] === '/') ? $remainingPath : '/' . $remainingPath;
    }
    require __DIR__ . '/chat.php';
} elseif (strpos($path, '/access') === 0) {
    $_SERVER['PATH_INFO'] = substr($path, 7); // Remove '/access'
    require __DIR__ . '/access.php';
} elseif (strpos($path, '/roles') === 0) {
    $_SERVER['PATH_INFO'] = substr($path, 6); // Remove '/roles'
    require __DIR__ . '/roles.php';
} elseif (strpos($path, '/user-groups') === 0) {
    $_SERVER['PATH_INFO'] = substr($path, 12); // Remove '/user-groups'
    require __DIR__ . '/user_groups.php';
} elseif (strpos($path, '/group-tile-permissions') === 0) {
    $_SERVER['PATH_INFO'] = substr($path, 23); // Remove '/group-tile-permissions'
    require __DIR__ . '/group_tile_permissions.php';
} elseif (strpos($path, '/widgets') === 0) {
    $_SERVER['PATH_INFO'] = substr($path, 8); // Remove '/widgets'
    require __DIR__ . '/widgets.php';
} elseif (strpos($path, '/clone') === 0) {
    error_log("api/index.php: Matched /clone route");
    $remainingPath = substr($path, 6); // Remove '/clone'
    if (empty($remainingPath) || $remainingPath === '/') {
        $_SERVER['PATH_INFO'] = '/';
    } else {
        $_SERVER['PATH_INFO'] = $remainingPath;
    }
    error_log("api/index.php: Setting PATH_INFO to: " . $_SERVER['PATH_INFO']);
    error_log("api/index.php: Requiring clone.php");
    require __DIR__ . '/clone.php';
} elseif (strpos($path, '/browsers') === 0) {
    $_SERVER['PATH_INFO'] = substr($path, 9); // Remove '/browsers'
    require __DIR__ . '/browsers.php';
} elseif (strpos($path, '/uploads') === 0) {
    $_SERVER['PATH_INFO'] = substr($path, 8); // Remove '/uploads'
    require __DIR__ . '/uploads.php';
} elseif (strpos($path, '/monitors') === 0) {
    $_SERVER['PATH_INFO'] = substr($path, 9); // Remove '/monitors'
    require __DIR__ . '/monitors.php';
} elseif (strpos($path, '/monitorv2') === 0) {
    $remainingPath = substr($path, 10); // Remove '/monitorv2'
    if (empty($remainingPath) || $remainingPath === '/') {
        $_SERVER['PATH_INFO'] = '/';
    } else {
        $_SERVER['PATH_INFO'] = ($remainingPath[0] === '/') ? $remainingPath : '/' . $remainingPath;
    }
    require __DIR__ . '/monitorv2.php';
    exit;
} elseif (strpos($path, '/timezones') === 0) {
    $_SERVER['PATH_INFO'] = substr($path, 10); // Remove '/timezones'
    require __DIR__ . '/timezones.php';
} elseif (strpos($path, '/alarms') === 0) {
    $_SERVER['PATH_INFO'] = substr($path, 7); // Remove '/alarms'
    require __DIR__ . '/alarms.php';
} elseif (strpos($path, '/notes') === 0) {
    error_log("api/index.php: Matched /notes route, path: $path");
    $remainingPath = substr($path, 6); // Remove '/notes'
    // Set PATH_INFO - use '/' for root endpoint, or ensure sub-paths start with /
    if (empty($remainingPath) || $remainingPath === '/') {
        $_SERVER['PATH_INFO'] = '/';
    } else {
        $_SERVER['PATH_INFO'] = ($remainingPath[0] === '/') ? $remainingPath : '/' . $remainingPath;
    }
    error_log("api/index.php: Setting PATH_INFO to: " . $_SERVER['PATH_INFO']);
    error_log("api/index.php: Requiring notes.php");
    require __DIR__ . '/notes.php';
    exit; // Prevent any further execution
} elseif (strpos($path, '/broadcast') === 0) {
    $remainingPath = substr($path, 10); // Remove '/broadcast'
    if (empty($remainingPath) || $remainingPath === '/') {
        $_SERVER['PATH_INFO'] = '/';
    } else {
        $_SERVER['PATH_INFO'] = ($remainingPath[0] === '/') ? $remainingPath : '/' . $remainingPath;
    }
    require __DIR__ . '/broadcast.php';
    exit;
} elseif (strpos($path, '/analytics/config') === 0) {
    require __DIR__ . '/analytics/config.php';
    exit;
} elseif (strpos($path, '/analytics/collect') === 0) {
    require __DIR__ . '/analytics/collect.php';
    exit;
} elseif (strpos($path, '/analytics/update-location') === 0) {
    require __DIR__ . '/analytics/update-location.php';
    exit;
} elseif (strpos($path, '/analytics/reverse-geocode') === 0) {
    require __DIR__ . '/analytics/reverse-geocode.php';
    exit;
} elseif (strpos($path, '/addons') === 0) {
    $remainingPath = substr($path, 7); // Remove '/addons'
    if (empty($remainingPath) || $remainingPath === '/') {
        $_SERVER['PATH_INFO'] = '/';
    } else {
        $_SERVER['PATH_INFO'] = ($remainingPath[0] === '/') ? $remainingPath : '/' . $remainingPath;
    }
    require __DIR__ . '/addons.php';
    exit;
} elseif (strpos($path, '/monitor-notifications') === 0) {
    // Remove '/monitor-notifications' prefix (22 characters)
    $prefixLength = strlen('/monitor-notifications');
    $remainingPath = substr($path, $prefixLength);
    if (empty($remainingPath) || $remainingPath === '/') {
        $_SERVER['PATH_INFO'] = '/';
    } else {
        // Ensure remaining path starts with /
        $_SERVER['PATH_INFO'] = ($remainingPath[0] === '/') ? $remainingPath : '/' . $remainingPath;
    }
    // Ensure JSON header is set before requiring the file
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
    }
    require __DIR__ . '/monitor_notifications.php';
    exit; // Prevent any further execution
} elseif (strpos($path, '/ldap_test.php') === 0) {
    require __DIR__ . '/ldap_test.php';
} elseif (strpos($path, '/saml') === 0) {
    // SAML endpoints - handle both /saml and /saml.php
    // Remove /saml or /saml.php prefix
    $remainingPath = preg_replace('#^/saml(\.php)?#', '', $path);
    // If no remaining path, set to empty (saml.php handles root with query params)
    if (empty($remainingPath) || $remainingPath === '/') {
        $_SERVER['PATH_INFO'] = '';
    } else {
        $_SERVER['PATH_INFO'] = $remainingPath;
    }
    require __DIR__ . '/saml.php';
    exit; // Prevent further execution
} elseif (strpos($path, '/saml-test') === 0 || strpos($path, '/saml-test.php') === 0) {
    // SAML test endpoints
    require __DIR__ . '/saml-test.php';
    exit; // Prevent further execution
} else {
    error_log("api/index.php: No route matched for path: $path");
    error_log("api/index.php: REQUEST_URI: $requestUri");
    error_log("api/index.php: REQUEST_METHOD: $requestMethod");
    error_log("api/index.php: _GET: " . json_encode($_GET));
    
    http_response_code(404);
    header('Content-Type: application/json');
    // Include debug info to help diagnose routing issues (safe for dev)
    echo json_encode([
        'error' => 'Not found',
        'debug' => [
            'path' => $path,
            'request_uri' => $requestUri,
            'get_path' => $_GET['path'] ?? null,
            'request_method' => $requestMethod
        ]
    ]);
}

