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
    
    // Helper function to escape LDAP filter values
    function ldap_escape_filter($value) {
        if (function_exists('ldap_escape')) {
            return ldap_escape($value, '', LDAP_ESCAPE_FILTER);
        }
        $value = str_replace('\\', '\\5c', $value);
        $value = str_replace('*', '\\2a', $value);
        $value = str_replace('(', '\\28', $value);
        $value = str_replace(')', '\\29', $value);
        $value = str_replace("\x00", '\\00', $value);
        return $value;
    }
    
    // Helper function to escape LDAP DN values
    function ldap_escape_dn($value) {
        if (function_exists('ldap_escape')) {
            return ldap_escape($value, '', LDAP_ESCAPE_DN);
        }
        $value = str_replace('\\', '\\\\', $value);
        $value = str_replace(',', '\\,', $value);
        $value = str_replace('=', '\\=', $value);
        $value = str_replace('+', '\\+', $value);
        $value = str_replace('<', '\\<', $value);
        $value = str_replace('>', '\\>', $value);
        $value = str_replace(';', '\\;', $value);
        $value = str_replace('"', '\\"', $value);
        $value = str_replace('#', '\\#', $value);
        $value = str_replace("\x00", '', $value);
        return $value;
    }
    
    // First, bind with service account (if configured) or anonymously
    $serviceBindDn = $data['ldap_bind_dn'] ?? '';
    $serviceBindPass = $data['ldap_bind_password'] ?? '';
    $bound = false;
    
    if (!empty($serviceBindDn) && !empty($serviceBindPass)) {
        $bound = @ldap_bind($ldap, $serviceBindDn, $serviceBindPass);
        if (!$bound) {
            throw new Exception("Service account bind failed: " . ldap_error($ldap));
        }
    } else {
        $bound = @ldap_bind($ldap); // Anonymous bind
        if (!$bound) {
            throw new Exception("Anonymous bind failed: " . ldap_error($ldap));
        }
    }
    
    // If test username/password provided, test user authentication
    $testUsername = $data['test_username'] ?? null;
    $testPassword = $data['test_password'] ?? null;
    
    if ($testUsername && $testPassword) {
        // Check if User DN Template is configured
        $userDnTemplate = trim($data['ldap_user_dn_template'] ?? '');
        $userDn = null;
        
        if (!empty($userDnTemplate)) {
            // Use DN template for direct bind
            $userDn = str_replace('{username}', ldap_escape_dn($testUsername), $userDnTemplate);
            $userBind = @ldap_bind($ldap, $userDn, $testPassword);
            if ($userBind) {
                sendJSON([
                    'success' => true,
                    'message' => "Successfully authenticated user '$testUsername' using DN template: $userDn"
                ]);
                @ldap_close($ldap);
                exit;
            } else {
                throw new Exception("User authentication failed with DN template: " . ldap_error($ldap));
            }
        } else {
            // Use search-based authentication (same as actual login)
            $searchBase = trim($data['ldap_user_search_base'] ?? '');
            $filterTemplate = trim($data['ldap_user_filter'] ?? '(sAMAccountName={username})');
            
            if (empty($searchBase)) {
                throw new Exception("User search base is not configured. Please set 'Base DN' in LDAP settings.");
            }
            
            // Escape username and replace in filter template
            $safeUsername = ldap_escape_filter($testUsername);
            $filter = str_replace('{username}', $safeUsername, $filterTemplate);
            
            // Determine search scope
            $searchScope = strtolower($data['ldap_search_scope'] ?? 'sub');
            
            // Get attributes from configuration or use defaults
            $attributesStr = $data['ldap_user_attributes'] ?? 'sAMAccountName,mail,displayName,userPrincipalName';
            $attributes = array_map('trim', explode(',', $attributesStr));
            // Ensure we have at least the essential attributes
            $essentialAttrs = ['sAMAccountName', 'mail', 'displayName', 'userPrincipalName'];
            foreach ($essentialAttrs as $attr) {
                if (!in_array($attr, $attributes)) {
                    $attributes[] = $attr;
                }
            }
            
            // Use appropriate LDAP function based on scope
            if ($searchScope === 'base') {
                $result = @ldap_read($ldap, $searchBase, $filter, $attributes);
            } elseif ($searchScope === 'one') {
                $result = @ldap_list($ldap, $searchBase, $filter, $attributes);
            } else {
                $result = @ldap_search($ldap, $searchBase, $filter, $attributes);
            }
            
            if ($result === false) {
                throw new Exception("User search failed: " . ldap_error($ldap));
            }
            
            $entries = @ldap_get_entries($ldap, $result);
            if ($entries === false || $entries['count'] == 0) {
                throw new Exception("User '$testUsername' not found in LDAP directory");
            }
            
            $userEntry = $entries[0];
            $userDn = $userEntry['dn'];
            
            // Try to bind as user to verify password
            $userBind = @ldap_bind($ldap, $userDn, $testPassword);
            if ($userBind) {
                // Extract user info
                $email = '';
                if (isset($userEntry['mail']) && is_array($userEntry['mail']) && isset($userEntry['mail'][0])) {
                    $email = $userEntry['mail'][0];
                } elseif (isset($userEntry['userprincipalname']) && is_array($userEntry['userprincipalname']) && isset($userEntry['userprincipalname'][0])) {
                    $email = $userEntry['userprincipalname'][0];
                }
                
                $displayName = '';
                if (isset($userEntry['displayname']) && is_array($userEntry['displayname']) && isset($userEntry['displayname'][0])) {
                    $displayName = $userEntry['displayname'][0];
                } elseif (isset($userEntry['cn']) && is_array($userEntry['cn']) && isset($userEntry['cn'][0])) {
                    $displayName = $userEntry['cn'][0];
                }
                
                $message = "Successfully authenticated user '$testUsername'";
                if ($displayName) {
                    $message .= " ($displayName)";
                }
                if ($email) {
                    $message .= " - Email: $email";
                }
                $message .= " - DN: $userDn";
                
                sendJSON([
                    'success' => true,
                    'message' => $message
                ]);
            } else {
                throw new Exception("User authentication failed: " . ldap_error($ldap));
            }
        }
    } else {
        // No test credentials provided, just test connection and service account bind
        sendJSON([
            'success' => true,
            'message' => 'Successfully connected to LDAP server' . (!empty($serviceBindDn) ? " (service account bind successful)" : " (anonymous bind successful)")
        ]);
    }
    
    @ldap_close($ldap);
    
} catch (Exception $e) {
    sendJSON([
        'success' => false,
        'message' => $e->getMessage()
    ]);
}
