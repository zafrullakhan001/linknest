<?php
// Start output buffering immediately - MUST be first thing
if (!ob_get_level()) {
    ob_start();
}

// Suppress all error output
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Clean any output that might have been generated
if (ob_get_level() > 0) {
    ob_clean();
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

switch ($method) {
    case 'POST':
        if ($path === '/register') {
            handleRegister();
        } elseif ($path === '/login') {
            handleLogin();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'GET':
        if ($path === '/me') {
            handleGetMe();
        } elseif ($path === '/logout') {
            handleLogout();
        } elseif ($path === '/pending') {
            handleGetPendingUsers();
        } elseif ($path === '/all') {
            handleGetAllUsers();
        } elseif ($path === '/users') {
            handleGetUsers();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'PUT':
        if (preg_match('#^/approve/(\d+)$#', $path, $matches)) {
            handleApproveUser((int)$matches[1]);
        } elseif (preg_match('#^/reject/(\d+)$#', $path, $matches)) {
            handleRejectUser((int)$matches[1]);
        } elseif (preg_match('#^/reset-password/(\d+)$#', $path, $matches)) {
            handleResetPassword((int)$matches[1]);
        } elseif (preg_match('#^/delete/(\d+)$#', $path, $matches)) {
            handleDeleteUser((int)$matches[1]);
        } elseif (preg_match('#^/toggle-auth-source/(\d+)$#', $path, $matches)) {
            handleToggleAuthSource((int)$matches[1]);
        } elseif ($path === '/change-admin-password') {
            handleChangeAdminPassword();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleRegister() {
    $data = getJSONInput();
    
    if (!isset($data['username']) || !isset($data['email']) || !isset($data['password'])) {
        sendJSON(['error' => 'Username, email, and password are required'], 400);
    }
    
    $username = trim($data['username']);
    $email = trim($data['email']);
    $password = $data['password'];
    
    if (strlen($username) < 3) {
        sendJSON(['error' => 'Username must be at least 3 characters'], 400);
    }
    
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendJSON(['error' => 'Invalid email address'], 400);
    }
    
    if (strlen($password) < 6) {
        sendJSON(['error' => 'Password must be at least 6 characters'], 400);
    }
    
    $db = getDB();
    
    // Check if username exists
    $stmt = $db->prepare('SELECT id FROM users WHERE username = ?');
    $stmt->execute([$username]);
    if ($stmt->fetch()) {
        sendJSON(['error' => 'Username already exists'], 409);
    }
    
    // Check if email exists
    $stmt = $db->prepare('SELECT id FROM users WHERE email = ?');
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        sendJSON(['error' => 'Email already exists'], 409);
    }
    
    // Create user (unapproved by default)
    $passwordHash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $db->prepare('INSERT INTO users (username, email, password_hash, is_admin, is_approved, auth_source, created_at) VALUES (?, ?, ?, 0, 0, ?, ?)');
    
    if ($stmt->execute([$username, $email, $passwordHash, 'local', time()])) {
        $userId = $db->lastInsertId();
        
        // Don't auto-login, user needs approval
        sendJSON([
            'success' => true,
            'message' => 'Registration successful. Your account is pending admin approval.',
            'pending' => true
        ]);
    } else {
        sendJSON(['error' => 'Failed to create user'], 500);
    }
}

function handleLogin() {
    try {
        // Clean any output before starting
        if (ob_get_level() > 0) {
            ob_clean();
        }
        
        $data = getJSONInput();
        
        if (!isset($data['username']) || !isset($data['password'])) {
            sendJSON(['error' => 'Username and password are required'], 400);
        }
        
        $username = trim($data['username']);
        $password = $data['password'];
    $authMethod = isset($data['auth_method']) ? $data['auth_method'] : null; // 'local' or 'ldap' or null for auto
    
    $db = getDB();
    
    // 1. Try LDAP Authentication if enabled
    $stmt = $db->prepare("SELECT key, value FROM settings WHERE key LIKE 'ldap_%'");
    $stmt->execute();
    $settings = [];
    foreach ($stmt->fetchAll() as $row) {
        $settings[$row['key']] = $row['value']; // keys are like 'ldap_enabled'
    }
    
    // Check if LDAP is enabled
    // Note: settings keys in DB are 'ldap_enabled', etc.
    $ldapEnabled = isset($settings['ldap_enabled']) && $settings['ldap_enabled'] == '1';
    
    // If auth_method is specified, enforce it
    if ($authMethod === 'local') {
        $ldapEnabled = false; // Skip LDAP, go straight to local
    } elseif ($authMethod === 'ldap') {
        if (!$ldapEnabled) {
            sendJSON(['error' => 'LDAP authentication is not enabled'], 400);
        }
        // Force LDAP only
    }
    // If authMethod is null, use auto-detection (try LDAP first, then local)
    
    $ldapSuccess = false;
    $ldapUser = null;

    function debug_log($message) {
        $logFile = __DIR__ . '/../ldap_debug.log';
        // Try to write log, but don't fail if we can't
        @file_put_contents($logFile, date('[Y-m-d H:i:s] ') . $message . "\n", FILE_APPEND);
    }
    
    // Helper function to escape LDAP filter values (for PHP < 5.6 compatibility)
    function ldap_escape_filter($value) {
        if (function_exists('ldap_escape')) {
            return ldap_escape($value, '', LDAP_ESCAPE_FILTER);
        }
        // Manual escaping for older PHP versions
        $value = str_replace('\\', '\\5c', $value);
        $value = str_replace('*', '\\2a', $value);
        $value = str_replace('(', '\\28', $value);
        $value = str_replace(')', '\\29', $value);
        $value = str_replace("\x00", '\\00', $value);
        return $value;
    }
    
    // Helper function to escape LDAP DN values (for PHP < 5.6 compatibility)
    function ldap_escape_dn($value) {
        if (function_exists('ldap_escape')) {
            return ldap_escape($value, '', LDAP_ESCAPE_DN);
        }
        // Manual escaping for DN (simpler than filter escaping)
        $value = str_replace('\\', '\\\\', $value);
        $value = str_replace(',', '\\,', $value);
        $value = str_replace('=', '\\=', $value);
        $value = str_replace('+', '\\+', $value);
        $value = str_replace('<', '\\<', $value);
        $value = str_replace('>', '\\>', $value);
        $value = str_replace(';', '\\;', $value);
        $value = str_replace('"', '\\"', $value);
        $value = str_replace('#', '\\#', $value);
        $value = str_replace("\x00", '', $value); // Remove null bytes
        return $value;
    }

    if ($ldapEnabled && extension_loaded('ldap')) {
        $retryCount = (int)($settings['ldap_connection_retry'] ?? 3);
        $retryDelay = (int)($settings['ldap_retry_delay'] ?? 1);
        $ldap = null;
        $lastError = null;
        
        // Retry connection logic
        for ($attempt = 0; $attempt <= $retryCount; $attempt++) {
            try {
                $server = trim($settings['ldap_server'] ?? '');
                $port = (int)($settings['ldap_port'] ?? 389);
                $protocol = trim($settings['ldap_protocol'] ?? 'ldap');
                $tls = !empty($settings['ldap_tls']); // 0 or 1
                $timeout = (int)($settings['ldap_timeout'] ?? 30);
                
                if (empty($server)) {
                    debug_log("LDAP: Server address is empty");
                    throw new Exception("LDAP server address is not configured");
                }
                
                $prefix = ($protocol === 'ldaps') ? 'ldaps://' : 'ldap://';
                $uri = $prefix . $server . ':' . $port;
                
                if ($attempt > 0) {
                    debug_log("LDAP: Retry attempt $attempt/$retryCount after $retryDelay seconds");
                    sleep($retryDelay);
                } else {
                    debug_log("LDAP: Enabled and extension loaded. Connecting to $uri");
                }
                
                $ldap = @ldap_connect($uri);
                if ($ldap) {
                    break; // Connection successful
                } else {
                    $lastError = "Failed to connect to LDAP server at $uri";
                    debug_log("LDAP: $lastError");
                }
            } catch (Exception $e) {
                $lastError = $e->getMessage();
                if ($attempt < $retryCount) {
                    debug_log("LDAP: Connection attempt failed, will retry: " . $lastError);
                } else {
                    throw $e; // Re-throw on final attempt
                }
            }
        }
        
        if (!$ldap) {
            throw new Exception($lastError ?? "Failed to connect to LDAP server after $retryCount retries");
        }
        
        try {
            
            // Set LDAP options
            ldap_set_option($ldap, LDAP_OPT_PROTOCOL_VERSION, 3);
            
            // Referral handling
            $followReferrals = !empty($settings['ldap_referrals']) && $settings['ldap_referrals'] == '1';
            ldap_set_option($ldap, LDAP_OPT_REFERRALS, $followReferrals ? 1 : 0);
            
            ldap_set_option($ldap, LDAP_OPT_NETWORK_TIMEOUT, $timeout);
            ldap_set_option($ldap, LDAP_OPT_TIMELIMIT, $timeout);
            
            // SSL certificate verification
            if ($protocol === 'ldaps') {
                $sslVerify = !isset($settings['ldap_ssl_verify']) || $settings['ldap_ssl_verify'] == '1';
                if (!$sslVerify) {
                    // Disable certificate verification (not recommended for production)
                    // Define constants if not available (PHP < 7.0)
                    if (!defined('LDAP_OPT_X_TLS_REQUIRE_CERT')) {
                        define('LDAP_OPT_X_TLS_REQUIRE_CERT', 0x002e);
                        define('LDAP_OPT_X_TLS_NEVER', 0);
                    }
                    if (defined('LDAP_OPT_X_TLS_REQUIRE_CERT') && defined('LDAP_OPT_X_TLS_NEVER')) {
                        @ldap_set_option($ldap, LDAP_OPT_X_TLS_REQUIRE_CERT, LDAP_OPT_X_TLS_NEVER);
                    }
                }
            }
            
            if ($tls && $protocol !== 'ldaps') {
                debug_log("LDAP: Starting TLS...");
                if (!@ldap_start_tls($ldap)) {
                    $error = "TLS start failed: " . ldap_error($ldap);
                    debug_log("LDAP: $error");
                    @ldap_close($ldap);
                    throw new Exception($error);
                }
                debug_log("LDAP: TLS started successfully");
            }
            
            // Bind with service account to search for user
            $bindDn = trim($settings['ldap_bind_dn'] ?? '');
            $bindPass = $settings['ldap_bind_password'] ?? '';
            
            $bound = false;
            if (!empty($bindDn) && !empty($bindPass)) {
                debug_log("LDAP: Binding with DN: $bindDn");
                $bound = @ldap_bind($ldap, $bindDn, $bindPass);
                if (!$bound) {
                    debug_log("LDAP: Service bind failed: " . ldap_error($ldap));
                }
            } else {
                debug_log("LDAP: Binding anonymously");
                $bound = @ldap_bind($ldap); // Anonymous
                if (!$bound) {
                    debug_log("LDAP: Anonymous bind failed: " . ldap_error($ldap));
                }
            }
            
            if ($bound) {
                // Check if User DN Template is configured (direct bind method)
                $userDnTemplate = trim($settings['ldap_user_dn_template'] ?? '');
                $userDn = null;
                $userEntry = null;
                
                if (!empty($userDnTemplate)) {
                    // Use DN template for direct bind (no search needed)
                    $caseSensitive = !empty($settings['ldap_case_sensitive']) && $settings['ldap_case_sensitive'] == '1';
                    $bindUsername = $caseSensitive ? $username : $username;
                    $userDn = str_replace('{username}', ldap_escape_dn($bindUsername), $userDnTemplate);
                    debug_log("LDAP: Using DN template: $userDn");
                    
                    // Try direct bind with template DN
                    if (@ldap_bind($ldap, $userDn, $password)) {
                        debug_log("LDAP: Direct bind successful with DN template");
                        $ldapSuccess = true;
                        
                        // Fetch user attributes
                        $attributesStr = $settings['ldap_user_attributes'] ?? 'sAMAccountName,mail,displayName';
                        $attributes = array_map('trim', explode(',', $attributesStr));
                        $result = @ldap_read($ldap, $userDn, '(objectClass=*)', $attributes);
                        if ($result) {
                            $entries = @ldap_get_entries($ldap, $result);
                            if ($entries && $entries['count'] > 0) {
                                $userEntry = $entries[0];
                            }
                        }
                    } else {
                        debug_log("LDAP: Direct bind failed: " . ldap_error($ldap));
                    }
                } else {
                    // Use search-based authentication
                    $searchBase = trim($settings['ldap_user_search_base'] ?? '');
                    $filterTemplate = trim($settings['ldap_user_filter'] ?? '(sAMAccountName={username})');
                    
                    if (empty($searchBase)) {
                        debug_log("LDAP: User search base is empty");
                        @ldap_close($ldap);
                        throw new Exception("LDAP user search base is not configured");
                    }
                    
                    // Escape username and replace in filter template
                    $caseSensitive = !empty($settings['ldap_case_sensitive']) && $settings['ldap_case_sensitive'] == '1';
                    $searchUsername = $caseSensitive ? $username : $username;
                    $safeUsername = ldap_escape_filter($searchUsername);
                    $filter = str_replace('{username}', $safeUsername, $filterTemplate);

                debug_log("LDAP: Searching base: $searchBase with filter: $filter");

                $attributesStr = $settings['ldap_user_attributes'] ?? 'sAMAccountName,mail,displayName';
                $attributes = array_map('trim', explode(',', $attributesStr));
                
                    // Determine search scope and use appropriate LDAP function
                    $searchScope = strtolower($settings['ldap_search_scope'] ?? 'sub');
                    
                    // Use different LDAP functions based on scope
                    if ($searchScope === 'base') {
                        // Base scope: search only the base DN itself
                        $result = @ldap_read($ldap, $searchBase, $filter, $attributes);
                    } elseif ($searchScope === 'one') {
                        // One-level scope: search immediate children only
                        $result = @ldap_list($ldap, $searchBase, $filter, $attributes);
                    } else {
                        // Subtree scope (default): search recursively
                        $result = @ldap_search($ldap, $searchBase, $filter, $attributes);
                    }
                if ($result === false) {
                    $error = "Search failed: " . ldap_error($ldap);
                    debug_log("LDAP: $error");
                    @ldap_close($ldap);
                    throw new Exception($error);
                }
                
                $entries = @ldap_get_entries($ldap, $result);
                if ($entries === false) {
                    $error = "Failed to get entries: " . ldap_error($ldap);
                    debug_log("LDAP: $error");
                    @ldap_close($ldap);
                    throw new Exception($error);
                }
                
                $entryCount = isset($entries['count']) ? (int)$entries['count'] : 0;
                debug_log("LDAP: Found $entryCount entries");
                
                if ($entryCount > 0) {
                    $userEntry = $entries[0];
                    $userDn = $userEntry['dn'];
                    debug_log("LDAP: User found, DN: $userDn. Attempting bind...");
                    
                    // Try to bind as user to verify password
                    if (@ldap_bind($ldap, $userDn, $password)) {
                        debug_log("LDAP: User bind successful");
                        $ldapSuccess = true;
                    } else {
                        $error = "User bind failed: " . ldap_error($ldap);
                        debug_log("LDAP: $error");
                        // Don't throw here - let it fall through to local auth
                    }
                } else {
                    debug_log("LDAP: User not found in directory");
                }
            }
            
            // Process successful LDAP authentication
            if ($ldapSuccess && isset($userEntry) && isset($userDn)) {
                // Extract user info (LDAP returns lowercase keys)
                $ldapEmail = '';
                $ldapDisplayName = '';
                
                // Custom attribute mappings
                $emailAttr = !empty($settings['ldap_email_attribute']) ? strtolower($settings['ldap_email_attribute']) : null;
                $displayNameAttr = !empty($settings['ldap_display_name_attribute']) ? strtolower($settings['ldap_display_name_attribute']) : null;
                
                // Try custom email attribute first, then defaults
                if ($emailAttr && isset($userEntry[$emailAttr]) && is_array($userEntry[$emailAttr]) && isset($userEntry[$emailAttr][0])) {
                    $ldapEmail = $userEntry[$emailAttr][0];
                } else {
                    // Try mail attribute first
                    if (isset($userEntry['mail']) && is_array($userEntry['mail']) && isset($userEntry['mail'][0])) {
                        $ldapEmail = $userEntry['mail'][0];
                    }
                    // Try userPrincipalName (case-insensitive check)
                    if (empty($ldapEmail)) {
                        foreach (['userprincipalname', 'mail'] as $attr) {
                            if (isset($userEntry[$attr]) && is_array($userEntry[$attr]) && isset($userEntry[$attr][0])) {
                                $val = $userEntry[$attr][0];
                                // If it looks like an email, use it
                                if (filter_var($val, FILTER_VALIDATE_EMAIL)) {
                                    $ldapEmail = $val;
                                    break;
                                }
                            }
                        }
                    }
                }
                
                // Extract display name
                if ($displayNameAttr && isset($userEntry[$displayNameAttr]) && is_array($userEntry[$displayNameAttr]) && isset($userEntry[$displayNameAttr][0])) {
                    $ldapDisplayName = $userEntry[$displayNameAttr][0];
                } elseif (isset($userEntry['displayname']) && is_array($userEntry['displayname']) && isset($userEntry['displayname'][0])) {
                    $ldapDisplayName = $userEntry['displayname'][0];
                } elseif (isset($userEntry['cn']) && is_array($userEntry['cn']) && isset($userEntry['cn'][0])) {
                    $ldapDisplayName = $userEntry['cn'][0];
                }
                
                // Fallback email if not found - use domain from base DN
                if (empty($ldapEmail)) {
                    $domain = 'ldap.local'; // Default fallback
                    $baseDn = $settings['ldap_base_dn'] ?? '';
                    if (!empty($baseDn)) {
                        // Extract domain from base DN (e.g., "DC=oneflorida,DC=org" -> "oneflorida.org")
                        if (preg_match_all('/DC=([^,]+)/i', $baseDn, $matches)) {
                            if (!empty($matches[1])) {
                                $domain = strtolower(implode('.', $matches[1]));
                            }
                        }
                    }
                    $ldapEmail = $username . '@' . $domain;
                }
                
                // Check group membership requirements if enabled
                $requireGroupMembership = !empty($settings['ldap_require_group_membership']) && $settings['ldap_require_group_membership'] == '1';
                if ($requireGroupMembership && !empty($settings['ldap_required_groups'])) {
                    $requiredGroups = array_map('trim', explode(',', $settings['ldap_required_groups']));
                    $userGroups = [];
                    
                    // Get user's groups
                    if (isset($userEntry['memberof']) && is_array($userEntry['memberof'])) {
                        foreach ($userEntry['memberof'] as $group) {
                            if (is_string($group) && $group !== 'count') {
                                $userGroups[] = $group;
                            }
                        }
                    }
                    
                    // Check nested groups if enabled
                    $nestedGroups = !empty($settings['ldap_nested_groups']) && $settings['ldap_nested_groups'] == '1';
                    if ($nestedGroups && !empty($settings['ldap_group_search_base'])) {
                        // TODO: Implement nested group checking recursively
                        // This would require additional LDAP queries to check group membership
                    }
                    
                    // Verify user is in at least one required group
                    $hasRequiredGroup = false;
                    foreach ($requiredGroups as $requiredGroup) {
                        foreach ($userGroups as $userGroup) {
                            if (stripos($userGroup, $requiredGroup) !== false || $userGroup === $requiredGroup) {
                                $hasRequiredGroup = true;
                                break 2;
                            }
                        }
                    }
                    
                    if (!$hasRequiredGroup) {
                        debug_log("LDAP: User not in required groups");
                        @ldap_close($ldap);
                        throw new Exception("Access denied: User must be a member of one of the required groups");
                    }
                }
                
                $ldapUser = [
                    'username' => $username,
                    'email' => $ldapEmail,
                    'dn' => $userDn,
                    'display_name' => $ldapDisplayName
                ];
            }
        } else {
                debug_log("LDAP: Cannot search - bind failed");
            }
            
            @ldap_close($ldap);
        } catch (Exception $e) {
            debug_log("LDAP Error: " . $e->getMessage());
            // Continue to local auth
        }
    } else {
        debug_log("LDAP: Skipped. Enabled: " . ($ldapEnabled ? 'Yes' : 'No') . ", Extension: " . (extension_loaded('ldap') ? 'Yes' : 'No'));
    }
    
    // Handle LDAP Success
    if ($ldapSuccess && $ldapUser) {
        // Check if user exists in DB
        $stmt = $db->prepare('SELECT id, username, email, password_hash, is_admin, is_approved, auth_source FROM users WHERE username = ?');
        $stmt->execute([$username]);
        $user = $stmt->fetch();
        
        if ($user) {
            // User exists, update info if needed (e.g. email, auth_source)
            // We don't update password hash because we don't have the plain password to hash (we verified it via LDAP)
            // But we could potentially store a dummy hash or keep the old one.
            // Actually, if we want to allow local fallback for this user later, we'd need to know the password, but we don't want to store it if we can avoid it.
            // For now, just update email and auth_source.
            $updateFields = [];
            $updateValues = [];
            
            if ($user['email'] !== $ldapUser['email']) {
                $updateFields[] = 'email = ?';
                $updateValues[] = $ldapUser['email'];
            }
            
            // Always update auth_source to 'ldap' for LDAP-authenticated users
            $updateFields[] = 'auth_source = ?';
            $updateValues[] = 'ldap';
            
            if (!empty($updateFields)) {
                $updateValues[] = $user['id'];
                $stmt = $db->prepare('UPDATE users SET ' . implode(', ', $updateFields) . ' WHERE id = ?');
                $stmt->execute($updateValues);
            }
        } else {
            // User doesn't exist, create new pending user
            // Use a random password hash since they should login via LDAP
            $randomPass = bin2hex(random_bytes(16));
            $passwordHash = password_hash($randomPass, PASSWORD_DEFAULT);
            
            // Check if email exists (might be used by another username)
            $stmt = $db->prepare('SELECT id FROM users WHERE email = ?');
            $stmt->execute([$ldapUser['email']]);
            if ($stmt->fetch()) {
                // Email conflict... handle gracefully? 
                // Maybe append timestamp to email
                $ldapUser['email'] = 'duplicate_' . time() . '_' . $ldapUser['email'];
            }
            
            $stmt = $db->prepare('INSERT INTO users (username, email, password_hash, is_admin, is_approved, auth_source, created_at) VALUES (?, ?, ?, 0, 0, ?, ?)');
            if ($stmt->execute([$username, $ldapUser['email'], $passwordHash, 'ldap', time()])) {
                $user = [
                    'id' => $db->lastInsertId(),
                    'username' => $username,
                    'email' => $ldapUser['email'],
                    'is_admin' => false,
                    'is_approved' => false
                ];
            } else {
                sendJSON(['error' => 'Failed to create local user record for LDAP user'], 500);
            }
        }
        
        // Check approval
        if (!$user['is_approved'] && !$user['is_admin']) {
            sendJSON(['error' => 'Your account is pending admin approval. Please wait for approval before logging in.'], 403);
        }
        
        // Login success
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['username'] = $user['username'];
        
        sendJSON([
            'success' => true,
            'user' => [
                'id' => $user['id'],
                'username' => $user['username'],
                'email' => $user['email'],
                'is_admin' => (bool)$user['is_admin'],
                'is_approved' => (bool)$user['is_approved'],
                'source' => 'ldap'
            ]
        ]);
        return;
    }
    
    // 2. Fallback to Local Authentication
    // If auth_method was 'ldap' but LDAP failed, don't allow local fallback
    if ($authMethod === 'ldap' && !$ldapSuccess) {
        sendJSON(['error' => 'LDAP authentication failed. Please check your credentials.'], 401);
    }
    
    $stmt = $db->prepare('SELECT id, username, email, password_hash, is_admin, is_approved, auth_source FROM users WHERE username = ? OR email = ?');
    $stmt->execute([$username, $username]);
    $user = $stmt->fetch();
    
    if (!$user || !password_verify($password, $user['password_hash'])) {
        sendJSON(['error' => 'Invalid username or password'], 401);
    }
    
    // Update auth_source to 'local' if it's not already set (for existing users)
    if (empty($user['auth_source']) || $user['auth_source'] !== 'local') {
        $stmt = $db->prepare('UPDATE users SET auth_source = ? WHERE id = ?');
        $stmt->execute(['local', $user['id']]);
        $user['auth_source'] = 'local';
    }
    
    // Check if user is approved
    if (!$user['is_approved'] && !$user['is_admin']) {
        sendJSON(['error' => 'Your account is pending admin approval. Please wait for approval before logging in.'], 403);
    }
    
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['username'] = $user['username'];
    
    sendJSON([
        'success' => true,
        'user' => [
            'id' => $user['id'],
            'username' => $user['username'],
            'email' => $user['email'],
            'is_admin' => (bool)$user['is_admin'],
            'is_approved' => (bool)$user['is_approved'],
            'source' => 'local'
        ]
    ]);
    } catch (Exception $e) {
        // Ensure we clean any output and send proper JSON error
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        error_log('Login error: ' . $e->getMessage() . ' | Trace: ' . $e->getTraceAsString());
        sendJSON(['error' => 'Login failed: ' . $e->getMessage()], 500);
    } catch (Error $e) {
        // Catch fatal errors (PHP 7+)
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        error_log('Login fatal error: ' . $e->getMessage() . ' | Trace: ' . $e->getTraceAsString());
        sendJSON(['error' => 'Login failed: ' . $e->getMessage()], 500);
    } catch (Throwable $e) {
        // Catch any other throwable
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        error_log('Login throwable error: ' . $e->getMessage() . ' | Trace: ' . $e->getTraceAsString());
        sendJSON(['error' => 'Login failed: An unexpected error occurred'], 500);
    }
}

function handleGetMe() {
    $user = getAuthenticatedUser();
    if ($user) {
        sendJSON(['user' => $user]);
    } else {
        sendJSON(['user' => null]);
    }
}

function handleLogout() {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    session_destroy();
    sendJSON(['success' => true]);
}

function handleGetPendingUsers() {
    requireAdmin(); // Only admins can see pending users
    
    $db = getDB();
    $stmt = $db->prepare('SELECT id, username, email, created_at FROM users WHERE is_approved = 0 AND is_admin = 0 ORDER BY created_at DESC');
    $stmt->execute();
    $users = $stmt->fetchAll();
    
    // Convert timestamps to readable dates
    foreach ($users as &$user) {
        $user['created_at'] = (int)$user['created_at'];
    }
    
    sendJSON(['users' => $users]);
}

function handleApproveUser($userId) {
    requireAdmin(); // Only admins can approve users
    
    $db = getDB();
    $stmt = $db->prepare('UPDATE users SET is_approved = 1 WHERE id = ? AND is_admin = 0');
    $stmt->execute([$userId]);
    
    if ($stmt->rowCount() > 0) {
        sendJSON(['success' => true, 'message' => 'User approved successfully']);
    } else {
        sendJSON(['error' => 'User not found or already approved'], 404);
    }
}

function handleRejectUser($userId) {
    requireAdmin(); // Only admins can reject users
    
    $db = getDB();
    
    // Check if user exists and is pending
    $checkStmt = $db->prepare('SELECT id FROM users WHERE id = ? AND is_admin = 0 AND is_approved = 0');
    $checkStmt->execute([$userId]);
    $user = $checkStmt->fetch();
    
    if (!$user) {
        sendJSON(['error' => 'User not found or cannot be rejected'], 404);
    }
    
    // Clean up links that reference this user in allowed_users
    // This ensures links remain visible and don't become orphaned
    try {
        $db->beginTransaction();
        
        // Get all links that have this user in their allowed_users array
        $linksStmt = $db->prepare('SELECT id, allowed_users, visibility FROM links WHERE allowed_users IS NOT NULL AND allowed_users != ""');
        $linksStmt->execute();
        $links = $linksStmt->fetchAll();
        
        $updateStmt = $db->prepare('UPDATE links SET allowed_users = ?, visibility = ? WHERE id = ?');
        
        foreach ($links as $link) {
            $allowedUsers = json_decode($link['allowed_users'], true);
            
            // Check if this user is in the allowed_users array
            if (is_array($allowedUsers) && in_array($userId, $allowedUsers)) {
                // Remove the deleted user from the array
                $allowedUsers = array_values(array_filter($allowedUsers, function($id) use ($userId) {
                    return $id != $userId;
                }));
                
                // If it was a private link and now has no allowed users,
                // change visibility to 'authenticated' so it remains visible to logged-in users
                $newVisibility = $link['visibility'];
                if ($link['visibility'] === 'private' && empty($allowedUsers)) {
                    $newVisibility = 'authenticated';
                    $allowedUsers = null; // Clear allowed_users since it's no longer private
                }
                
                // Update the link
                $updateStmt->execute([
                    $allowedUsers ? json_encode($allowedUsers) : null,
                    $newVisibility,
                    $link['id']
                ]);
            }
        }
        
        $db->commit();
    } catch (PDOException $e) {
        $db->rollBack();
        error_log('Error cleaning up links for rejected user: ' . $e->getMessage());
        // Continue with user deletion even if link cleanup fails
    }
    
    // Delete the user account (only pending users)
    $stmt = $db->prepare('DELETE FROM users WHERE id = ? AND is_admin = 0 AND is_approved = 0');
    $stmt->execute([$userId]);
    
    if ($stmt->rowCount() > 0) {
        sendJSON(['success' => true, 'message' => 'User rejected and removed']);
    } else {
        sendJSON(['error' => 'Failed to reject user'], 500);
    }
}

function handleGetAllUsers() {
    requireAdmin(); // Only admins can see all users
    
    $db = getDB();
    $stmt = $db->prepare('SELECT id, username, email, is_admin, is_approved, auth_source, created_at FROM users ORDER BY created_at DESC');
    $stmt->execute();
    $users = $stmt->fetchAll();
    
    // Convert timestamps and booleans
    foreach ($users as &$user) {
        $user['created_at'] = (int)$user['created_at'];
        $user['is_admin'] = (bool)$user['is_admin'];
        $user['is_approved'] = (bool)$user['is_approved'];
        // Default to 'local' if auth_source is not set (for existing users)
        $user['auth_source'] = $user['auth_source'] ?? 'local';
    }
    
    sendJSON(['users' => $users]);
}

function handleGetUsers() {
    requireAuth(); // Any authenticated user can see the user list for selecting private link recipients
    
    $db = getDB();
    // Return only approved users (id, username, and auth_source) for privacy
    $stmt = $db->prepare('SELECT id, username, auth_source FROM users WHERE is_approved = 1 ORDER BY username ASC');
    $stmt->execute();
    $users = $stmt->fetchAll();
    
    // Default auth_source to 'local' if not set
    foreach ($users as &$user) {
        $user['auth_source'] = $user['auth_source'] ?? 'local';
    }
    
    sendJSON(['users' => $users]);
}

function handleResetPassword($userId) {
    requireAdmin(); // Only admins can reset passwords
    
    $data = getJSONInput();
    
    if (!isset($data['new_password']) || strlen($data['new_password']) < 6) {
        sendJSON(['error' => 'New password is required and must be at least 6 characters'], 400);
    }
    
    $db = getDB();
    
    // Check if user exists and is not admin (can't reset admin password this way)
    $stmt = $db->prepare('SELECT id, is_admin FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    
    if (!$user) {
        sendJSON(['error' => 'User not found'], 404);
    }
    
    // Prevent resetting admin password (security measure)
    if ($user['is_admin']) {
        sendJSON(['error' => 'Cannot reset admin password through this interface'], 403);
    }
    
    // Update password
    $passwordHash = password_hash($data['new_password'], PASSWORD_DEFAULT);
    $stmt = $db->prepare('UPDATE users SET password_hash = ? WHERE id = ? AND is_admin = 0');
    $stmt->execute([$passwordHash, $userId]);
    
    if ($stmt->rowCount() > 0) {
        sendJSON(['success' => true, 'message' => 'Password reset successfully']);
    } else {
        sendJSON(['error' => 'Failed to reset password'], 500);
    }
}

function handleDeleteUser($userId) {
    requireAdmin(); // Only admins can delete users
    
    $db = getDB();
    
    // Check if user exists
    $stmt = $db->prepare('SELECT id, is_admin FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    
    if (!$user) {
        sendJSON(['error' => 'User not found'], 404);
    }
    
    // Prevent deleting admin accounts
    if ($user['is_admin']) {
        sendJSON(['error' => 'Cannot delete admin accounts'], 403);
    }
    
    // Clean up links that reference this user in allowed_users
    // This ensures links remain visible and don't become orphaned
    try {
        $db->beginTransaction();
        
        // Get all links that have this user in their allowed_users array
        $linksStmt = $db->prepare('SELECT id, allowed_users, visibility FROM links WHERE allowed_users IS NOT NULL AND allowed_users != ""');
        $linksStmt->execute();
        $links = $linksStmt->fetchAll();
        
        $updateStmt = $db->prepare('UPDATE links SET allowed_users = ?, visibility = ? WHERE id = ?');
        
        foreach ($links as $link) {
            $allowedUsers = json_decode($link['allowed_users'], true);
            
            // Check if this user is in the allowed_users array
            if (is_array($allowedUsers) && in_array($userId, $allowedUsers)) {
                // Remove the deleted user from the array
                $allowedUsers = array_values(array_filter($allowedUsers, function($id) use ($userId) {
                    return $id != $userId;
                }));
                
                // If it was a private link and now has no allowed users,
                // change visibility to 'authenticated' so it remains visible to logged-in users
                $newVisibility = $link['visibility'];
                if ($link['visibility'] === 'private' && empty($allowedUsers)) {
                    $newVisibility = 'authenticated';
                    $allowedUsers = null; // Clear allowed_users since it's no longer private
                }
                
                // Update the link
                $updateStmt->execute([
                    $allowedUsers ? json_encode($allowedUsers) : null,
                    $newVisibility,
                    $link['id']
                ]);
            }
        }
        
        $db->commit();
    } catch (PDOException $e) {
        $db->rollBack();
        error_log('Error cleaning up links for deleted user: ' . $e->getMessage());
        // Continue with user deletion even if link cleanup fails
    }
    
    // Delete the user account (cascade will delete their tiles)
    $stmt = $db->prepare('DELETE FROM users WHERE id = ? AND is_admin = 0');
    $stmt->execute([$userId]);
    
    if ($stmt->rowCount() > 0) {
        sendJSON(['success' => true, 'message' => 'User deleted successfully']);
    } else {
        sendJSON(['error' => 'Failed to delete user'], 500);
    }
}

function handleToggleAuthSource($userId) {
    requireAdmin(); // Only admins can toggle auth source
    
    $db = getDB();
    
    // Check if user exists and is not admin
    $stmt = $db->prepare('SELECT id, auth_source FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    
    if (!$user) {
        sendJSON(['error' => 'User not found'], 404);
    }
    
    // Toggle between 'ldap' and 'local'
    $newAuthSource = ($user['auth_source'] === 'ldap') ? 'local' : 'ldap';
    
    $stmt = $db->prepare('UPDATE users SET auth_source = ? WHERE id = ?');
    $stmt->execute([$newAuthSource, $userId]);
    
    if ($stmt->rowCount() > 0) {
        sendJSON(['success' => true, 'message' => "Auth source updated to {$newAuthSource}", 'auth_source' => $newAuthSource]);
    } else {
        sendJSON(['error' => 'Failed to update auth source'], 500);
    }
}

function handleChangeAdminPassword() {
    requireAdmin(); // Only admins can change admin password
    
    $data = getJSONInput();
    
    if (!isset($data['current_password']) || !isset($data['new_password'])) {
        sendJSON(['error' => 'Current password and new password are required'], 400);
    }
    
    if (strlen($data['new_password']) < 6) {
        sendJSON(['error' => 'New password must be at least 6 characters'], 400);
    }
    
    $db = getDB();
    $user = getAuthenticatedUser();
    
    // Verify current password
    $stmt = $db->prepare('SELECT password_hash FROM users WHERE id = ? AND is_admin = 1');
    $stmt->execute([$user['id']]);
    $admin = $stmt->fetch();
    
    if (!$admin || !password_verify($data['current_password'], $admin['password_hash'])) {
        sendJSON(['error' => 'Current password is incorrect'], 401);
    }
    
    // Update password
    $passwordHash = password_hash($data['new_password'], PASSWORD_DEFAULT);
    $stmt = $db->prepare('UPDATE users SET password_hash = ? WHERE id = ? AND is_admin = 1');
    $stmt->execute([$passwordHash, $user['id']]);
    
    if ($stmt->rowCount() > 0) {
        sendJSON(['success' => true, 'message' => 'Admin password changed successfully']);
    } else {
        sendJSON(['error' => 'Failed to change password'], 500);
    }
}

