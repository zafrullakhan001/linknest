<?php
require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Only admins can test LDAP settings
requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

$data = getJSONInput();

// Required fields for testing
$requiredFields = ['ldap_server', 'ldap_port'];
foreach ($requiredFields as $field) {
    if (empty($data[$field])) {
        sendJSON(['error' => "Missing required field: $field"], 400);
    }
}

$server = $data['ldap_server'];
$port = (int)$data['ldap_port'];
$protocol = $data['ldap_protocol'] ?? 'ldap'; // ldap or ldaps
$tls = !empty($data['ldap_tls']);
$timeout = (int)($data['ldap_timeout'] ?? 30);

// Construct URI
$prefix = $protocol === 'ldaps' ? 'ldaps://' : 'ldap://';
$uri = $prefix . $server . ':' . $port;

// Check if LDAP extension is loaded
if (!extension_loaded('ldap')) {
    sendJSON([
        'success' => false,
        'message' => 'PHP LDAP extension is not loaded. Please enable it in php.ini.'
    ]);
}

try {
    // Connect
    $ldap = @ldap_connect($uri);
    
    if (!$ldap) {
        throw new Exception("Could not connect to LDAP server at $uri");
    }
    
    // Set options
    ldap_set_option($ldap, LDAP_OPT_PROTOCOL_VERSION, 3);
    ldap_set_option($ldap, LDAP_OPT_REFERRALS, 0);
    ldap_set_option($ldap, LDAP_OPT_NETWORK_TIMEOUT, $timeout);
    
    if ($tls && $protocol !== 'ldaps') {
        if (!@ldap_start_tls($ldap)) {
            throw new Exception("Could not start TLS: " . ldap_error($ldap));
        }
    }
    
    // If username/password provided, try to bind
    // Note: This is for testing the service account (if used) or just anonymous bind if empty
    // But usually for testing we want to test a specific user bind if provided, 
    // or just connection if no credentials.
    // However, the UI might send a test username/password to verify credentials too.
    
    $bindDn = $data['test_username'] ?? null;
    $bindPass = $data['test_password'] ?? null;
    
    if ($bindDn && $bindPass) {
        // If it's just a username (not DN), we might need to construct DN or use UPN
        // But for this generic test, let's assume the user provides what's needed or we try to bind directly
        // If the user provided a test username that looks like a simple username, we might need to use the user filter to find the DN first
        // But that requires an anonymous bind or a service account bind first.
        
        // For simplicity in this test endpoint, we'll try to bind with what's given.
        // If the user provides a full DN in 'test_username', it works.
        // If they provide 'user@domain', it might work depending on AD.
        
        $bind = @ldap_bind($ldap, $bindDn, $bindPass);
        if ($bind) {
            sendJSON([
                'success' => true,
                'message' => "Successfully connected and bound to LDAP server as $bindDn"
            ]);
        } else {
            throw new Exception("Connection successful, but bind failed: " . ldap_error($ldap));
        }
    } else {
        // Anonymous bind or just connection check
        $bind = @ldap_bind($ldap);
        if ($bind) {
            sendJSON([
                'success' => true,
                'message' => 'Successfully connected to LDAP server (anonymous bind)'
            ]);
        } else {
            // Even if anonymous bind fails, the connection might be okay if the server requires auth.
            // But usually ldap_bind returns false if it fails.
            throw new Exception("Connection successful, but anonymous bind failed: " . ldap_error($ldap));
        }
    }
    
    @ldap_close($ldap);
    
} catch (Exception $e) {
    sendJSON([
        'success' => false,
        'message' => $e->getMessage()
    ]);
}
