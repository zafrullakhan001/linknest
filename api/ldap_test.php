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

/**
 * Resolve bind password from the admin test form.
 * UI normally sends plaintext (already decrypted by settings GET).
 * Encrypted blobs are decrypted when recognized; fake-encrypted plaintext is kept as-is.
 */
function ldapTestResolveBindPassword($pass): string {
    if ($pass === null) {
        return '';
    }
    $pass = trim((string)$pass);
    if ($pass === '') {
        return '';
    }
    if (function_exists('isMaskedPasswordPlaceholder') && isMaskedPasswordPlaceholder($pass)) {
        throw new Exception(
            'Bind password looks like a masked placeholder (asterisks). ' .
            'Click the eye icon to verify the password, re-type it if needed, Save Settings, then test again.'
        );
    }
    if (!isLikelyEncryptedPassword($pass)) {
        return $pass;
    }
    try {
        return (string)decryptPassword($pass);
    } catch (Exception $e) {
        // Unusual plaintext that only *looked* encrypted — bind with the raw value
        return $pass;
    }
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
    $serviceBindDn = trim((string)($data['ldap_bind_dn'] ?? ''));
    $serviceBindPass = ldapTestResolveBindPassword($data['ldap_bind_password'] ?? '');
    $passLen = strlen($serviceBindPass);
    
    $bound = false;
    
    if ($serviceBindDn !== '' && $serviceBindPass === '') {
        throw new Exception(
            "Bind DN is set but bind password is empty.\n" .
            "Re-enter the service account password (use the eye icon to verify), click Save Settings, then test again.\n" .
            "If the password field was blank after deploy, the old encryption key may not have transferred — retyping and saving fixes it."
        );
    }
    
    if ($serviceBindDn !== '' && $serviceBindPass !== '') {
        $bound = @ldap_bind($ldap, $serviceBindDn, $serviceBindPass);
        if (!$bound) {
            $ldapErr = ldap_error($ldap);
            $errno = function_exists('ldap_errno') ? ldap_errno($ldap) : null;
            $diag = '';
            if (defined('LDAP_OPT_DIAGNOSTIC_MESSAGE')) {
                @ldap_get_option($ldap, LDAP_OPT_DIAGNOSTIC_MESSAGE, $diag);
            }
            $msg = "Service account bind failed: {$ldapErr}";
            if ($errno !== null) {
                $msg .= " (LDAP errno {$errno})";
            }
            if (is_string($diag) && $diag !== '') {
                $msg .= "\nServer diagnostic: {$diag}";
            }
            $msg .= "\nBind DN used: {$serviceBindDn}";
            $msg .= "\nPassword length: {$passLen} characters (value not shown)";
            $msg .= "\nURI: {$uri}";
            $msg .= "\n\nTips for Active Directory:";
            $msg .= "\n• Prefer BIND DN as user@domain.com or DOMAIN\\username (not only CN=... unless that DN is exact).";
            $msg .= "\n• Use the eye icon to confirm the saved password has no extra spaces.";
            $msg .= "\n• Account must be enabled and allowed to bind (not locked / expired).";
            $msg .= "\n• After changing the password here, click Save Settings before Test Connection.";
            throw new Exception($msg);
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
            // Handle case sensitivity (same as login flow)
            $caseSensitive = !empty($data['ldap_case_sensitive']) && $data['ldap_case_sensitive'] == '1';
            $bindUsername = $caseSensitive ? $testUsername : strtolower($testUsername);
            $userDn = str_replace('{username}', ldap_escape_dn($bindUsername), $userDnTemplate);
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
            // Handle case sensitivity (same as login flow)
            $caseSensitive = !empty($data['ldap_case_sensitive']) && $data['ldap_case_sensitive'] == '1';
            $searchUsername = $caseSensitive ? $testUsername : strtolower($testUsername);
            $safeUsername = ldap_escape_filter($searchUsername);
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
                $errorMsg = "User '$testUsername' not found in LDAP directory";
                $errorMsg .= "\nSearch base: $searchBase";
                $errorMsg .= "\nFilter used: $filter";
                $errorMsg .= "\nSearch scope: $searchScope";
                if (isset($caseSensitive)) {
                    $errorMsg .= "\nCase sensitive: " . ($caseSensitive ? 'Yes' : 'No');
                    $errorMsg .= "\nSearched username: " . ($caseSensitive ? $testUsername : strtolower($testUsername));
                }
                $errorMsg .= "\n\nTip: If you entered the username with @domain (e.g., user@domain.com), try using just the username part (e.g., user) if your LDAP filter expects only the username.";
                throw new Exception($errorMsg);
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
            'message' => 'Successfully connected to LDAP server' . ($serviceBindDn !== '' ? " (service account bind successful)" : " (anonymous bind successful)")
        ]);
    }
    
    @ldap_close($ldap);
    
} catch (Exception $e) {
    sendJSON([
        'success' => false,
        'message' => $e->getMessage()
    ]);
}
