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
        if ($path === '/me/change-password') {
            // Support POST for change-password (same as PUT) for better compatibility with cookies/session
            handleChangeMyPassword();
        } elseif ($path === '/register') {
            handleRegister();
        } elseif ($path === '/login') {
            handleLogin();
        } elseif ($path === '/search-ldap-users') {
            handleSearchLdapUsers();
        } elseif ($path === '/ldap-user-detail') {
            handleGetLdapUserDetail();
        } elseif ($path === '/add-local-user') {
            handleAddLocalUser();
        } elseif ($path === '/add-ldap-user') {
            handleAddLdapUser();
        } elseif ($path === '/bulk-approve') {
            handleBulkApproveUsers();
        } elseif ($path === '/bulk-disable') {
            handleBulkDisableUsers();
        } elseif ($path === '/bulk-promote') {
            handleBulkPromoteUsers();
        } elseif ($path === '/bulk-toggle-approval') {
            handleBulkToggleApproval();
        } elseif ($path === '/bulk-import-local') {
            handleBulkImportLocalUsers();
        } elseif ($path === '/bulk-import-ldap') {
            handleBulkImportLdapUsers();
        } elseif ($path === '/bulk-import-saml') {
            handleBulkImportSamlUsers();
        } elseif ($path === '/auto-detect-auth-sources') {
            handleAutoDetectAuthSources();
        } elseif (preg_match('#^/impersonate/(\d+)$#', $path, $matches)) {
            handleStartImpersonation((int)$matches[1]);
        } elseif ($path === '/stop-impersonation') {
            handleStopImpersonation();
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
        } elseif (preg_match('#^/user/(\d+)$#', $path, $matches)) {
            handleGetUserInfo((int)$matches[1]);
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
        } elseif (preg_match('#^/toggle-admin/(\d+)$#', $path, $matches)) {
            handleToggleAdmin((int)$matches[1]);
        } elseif (preg_match('#^/toggle-disable/(\d+)$#', $path, $matches)) {
            handleToggleDisable((int)$matches[1]);
        } elseif (preg_match('#^/update/(\d+)$#', $path, $matches)) {
            handleUpdateUser((int)$matches[1]);
        } elseif ($path === '/change-admin-password') {
            handleChangeAdminPassword();
        } elseif ($path === '/me') {
            handleUpdateMyProfile();
        } elseif ($path === '/me/change-password') {
            handleChangeMyPassword();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

// Password rules: at least 8 chars, 1 uppercase, 1 number, 1 special character. Returns error message or null if valid.
function validatePasswordStrength($password) {
    if (strlen($password) < 8) {
        return 'Password must be at least 8 characters';
    }
    if (!preg_match('/[A-Z]/', $password)) {
        return 'Password must contain at least one uppercase letter';
    }
    if (!preg_match('/[0-9]/', $password)) {
        return 'Password must contain at least one number';
    }
    if (!preg_match('/[!@#$%^&*()_+\-=[\]{};\':"\\\\|,.<>\/?`~]/', $password)) {
        return 'Password must contain at least one special character (!@#$%^&* etc.)';
    }
    return null;
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
    
    // Allow @localhost for local users, otherwise validate normally
    $emailLower = strtolower($email);
    $isLocalhostEmail = strpos($emailLower, '@localhost') !== false;
    if (!$isLocalhostEmail && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendJSON(['error' => 'Invalid email address'], 400);
    }
    
    $err = validatePasswordStrength($password);
    if ($err !== null) {
        sendJSON(['error' => $err], 400);
    }
    if (!empty($data['confirm_password']) && $data['password'] !== $data['confirm_password']) {
        sendJSON(['error' => 'Password and confirmation do not match'], 400);
    }
    
    $db = getDB();
    
    // Check if username exists (case-insensitive)
    $stmt = $db->prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)');
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
    $rememberMe = isset($data['remember_me']) ? (bool)$data['remember_me'] : false;
    $ldapServerIndex = isset($data['ldap_server_index']) ? (int)$data['ldap_server_index'] : null; // Selected LDAP server index
    
    $db = getDB();
    
    // Check maintenance mode first
    $stmt = $db->prepare("SELECT key, value FROM settings WHERE key IN ('maintenance_enabled', 'ldap_enabled') OR key LIKE 'ldap_%'");
    $stmt->execute();
    $settings = [];
    foreach ($stmt->fetchAll() as $row) {
        $settings[$row['key']] = $row['value'];
    }
    
    $maintenanceEnabled = isset($settings['maintenance_enabled']) && $settings['maintenance_enabled'] == '1';
    
    // 1. Try LDAP Authentication if enabled
    
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
    $ldapError = null; // Store LDAP error message for better error reporting

    function debug_log($message) {
        $logFile = __DIR__ . '/../ldap_debug.log';
        // Try to write log, but don't fail if we can't
        @file_put_contents($logFile, date('[Y-m-d H:i:s] ') . $message . "\n", FILE_APPEND);
    }
    
    // Check if username/email contains @localhost - if so, skip LDAP and go straight to local
    $usernameLower = strtolower($username);
    if ($authMethod === null && strpos($usernameLower, '@localhost') !== false) {
        $ldapEnabled = false; // Skip LDAP for @localhost users
        debug_log("LDAP: Skipped - username contains @localhost, using local authentication");
    }
    
    // Note: ldap_escape_filter and ldap_escape_dn are now defined globally above
    
    if ($ldapEnabled && extension_loaded('ldap')) {
        // Get LDAP servers list
        $ldapServers = getLdapServers($settings);
        
        if (empty($ldapServers)) {
            debug_log("LDAP: No LDAP servers configured");
            throw new Exception("LDAP servers are not configured");
        }
        
        // If server index is specified, use only that server; otherwise use first server
        $selectedServerIndex = $ldapServerIndex !== null ? $ldapServerIndex : 0;
        
        if ($selectedServerIndex < 0 || $selectedServerIndex >= count($ldapServers)) {
            debug_log("LDAP: Invalid server index: $selectedServerIndex");
            throw new Exception("Invalid LDAP server selected");
        }
        
        $serverConfig = $ldapServers[$selectedServerIndex];
        debug_log("LDAP: Using server index $selectedServerIndex: " . ($serverConfig['name'] ?? $serverConfig['server']));
        
        // Handle email format username - extract username part if @domain matches server's domain
        $originalUsername = $username;
        if (strpos($username, '@') !== false) {
            $domainToMatch = null;
            
            // Try login_domain first
            if (!empty($serverConfig['login_domain'])) {
                $domainToMatch = strtolower(trim($serverConfig['login_domain']));
            }
            
            // If no login_domain, try to extract from server hostname
            if (!$domainToMatch && !empty($serverConfig['server'])) {
                $hostParts = explode('.', $serverConfig['server']);
                if (count($hostParts) >= 2) {
                    $domainToMatch = strtolower(implode('.', array_slice($hostParts, 1)));
                }
            }
            
            // If still no domain, try to extract from base DN
            if (!$domainToMatch && !empty($serverConfig['user_search_base'])) {
                if (preg_match_all('/DC=([^,]+)/i', $serverConfig['user_search_base'], $matches)) {
                    if (!empty($matches[1])) {
                        $domainToMatch = strtolower(implode('.', $matches[1]));
                    }
                }
            }
            
            // If domain matches, extract username part
            if ($domainToMatch) {
                $usernameLower = strtolower($username);
                if (strpos($usernameLower, '@' . $domainToMatch) !== false) {
                    $parts = explode('@', $username);
                    if (count($parts) === 2 && strtolower($parts[1]) === $domainToMatch) {
                        $username = $parts[0];
                        debug_log("LDAP: Extracted username from email format: '$originalUsername' -> '$username' (domain: $domainToMatch)");
                    }
                }
            }
        }
        
        $retryCount = (int)($serverConfig['connection_retry'] ?? 3);
        $retryDelay = (int)($serverConfig['retry_delay'] ?? 1);
        $ldap = null;
        $lastError = null;
        
        // Retry connection logic
        for ($attempt = 0; $attempt <= $retryCount; $attempt++) {
            try {
                $server = trim($serverConfig['server'] ?? '');
                $port = (int)($serverConfig['port'] ?? 389);
                $protocol = trim($serverConfig['protocol'] ?? 'ldap');
                $tls = !empty($serverConfig['tls']) && $serverConfig['tls'] == '1';
                $timeout = (int)($serverConfig['timeout'] ?? 30);
                
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
            $followReferrals = !empty($serverConfig['referrals']) && $serverConfig['referrals'] == '1';
            ldap_set_option($ldap, LDAP_OPT_REFERRALS, $followReferrals ? 1 : 0);
            
            ldap_set_option($ldap, LDAP_OPT_NETWORK_TIMEOUT, $timeout);
            ldap_set_option($ldap, LDAP_OPT_TIMELIMIT, $timeout);
            
            // SSL certificate verification
            if ($protocol === 'ldaps') {
                $sslVerify = !isset($serverConfig['ssl_verify']) || $serverConfig['ssl_verify'] == '1';
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
            $bindDn = trim($serverConfig['bind_dn'] ?? '');
            $bindPass = $serverConfig['bind_password'] ?? '';
            
            // Decrypt password if it's encrypted (handles both encrypted and plain text for backward compatibility)
            if (!empty($bindPass)) {
                // Check if password is encrypted (contains dots in format: base64.base64.base64)
                $isEncrypted = (strpos($bindPass, '.') !== false && substr_count($bindPass, '.') === 2);
                if ($isEncrypted) {
                    try {
                        $bindPass = decryptPassword($bindPass);
                        debug_log("LDAP: Password decrypted successfully");
                    } catch (Exception $e) {
                        debug_log("LDAP: Failed to decrypt bind password: " . $e->getMessage());
                        debug_log("LDAP: DB_PATH: " . (defined('DB_PATH') ? DB_PATH : 'not defined'));
                        debug_log("LDAP: Password length: " . strlen($bindPass));
                        // If decryption fails, clear the password to prevent using corrupted data
                        $bindPass = '';
                    }
                } else {
                    debug_log("LDAP: Password is plain text (not encrypted)");
                }
            }
            
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
                $userDnTemplate = trim($serverConfig['user_dn_template'] ?? '');
                $userDn = null;
                $userEntry = null;
                
                if (!empty($userDnTemplate)) {
                    // Use DN template for direct bind (no search needed)
                    $caseSensitive = !empty($serverConfig['case_sensitive']) && $serverConfig['case_sensitive'] == '1';
                    $bindUsername = $caseSensitive ? $username : strtolower($username);
                    $userDn = str_replace('{username}', ldap_escape_dn($bindUsername), $userDnTemplate);
                    debug_log("LDAP: Using DN template: $userDn");
                    
                    // Try direct bind with template DN
                    if (@ldap_bind($ldap, $userDn, $password)) {
                        debug_log("LDAP: Direct bind successful with DN template");
                        $ldapSuccess = true;
                        
                        // Fetch user attributes
                        $attributesStr = $serverConfig['user_attributes'] ?? 'sAMAccountName,mail,displayName';
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
                    $searchBase = trim($serverConfig['user_search_base'] ?? '');
                    $filterTemplate = trim($serverConfig['user_filter'] ?? '(sAMAccountName={username})');
                    
                    if (empty($searchBase)) {
                        debug_log("LDAP: User search base is empty");
                        @ldap_close($ldap);
                        throw new Exception("LDAP user search base is not configured");
                    }
                    
                    // Escape username and replace in filter template
                    $caseSensitive = !empty($serverConfig['case_sensitive']) && $serverConfig['case_sensitive'] == '1';
                    $searchUsername = $caseSensitive ? $username : strtolower($username);
                    $safeUsername = ldap_escape_filter($searchUsername);
                    $filter = str_replace('{username}', $safeUsername, $filterTemplate);

                debug_log("LDAP: Searching base: $searchBase with filter: $filter");

                $attributesStr = $serverConfig['user_attributes'] ?? 'sAMAccountName,mail,displayName';
                $attributes = array_map('trim', explode(',', $attributesStr));
                
                    // Determine search scope and use appropriate LDAP function
                    $searchScope = strtolower($serverConfig['search_scope'] ?? 'sub');
                    
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
                $emailAttr = !empty($serverConfig['email_attribute']) ? strtolower($serverConfig['email_attribute']) : null;
                $displayNameAttr = !empty($serverConfig['display_name_attribute']) ? strtolower($serverConfig['display_name_attribute']) : null;
                
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
                
                // Fallback email if not found - use domain from base DN or user search base
                if (empty($ldapEmail)) {
                    $domain = null;
                    // Try user search base first
                    $baseDn = $serverConfig['user_search_base'] ?? '';
                    
                    if (!empty($baseDn)) {
                        // Extract domain from base DN (e.g., "DC=oneflorida,DC=org" -> "oneflorida.org")
                        // Also handles: "CN=Users,DC=oneflorida,DC=org" -> "oneflorida.org"
                        if (preg_match_all('/DC=([^,]+)/i', $baseDn, $matches)) {
                            if (!empty($matches[1])) {
                                $domain = strtolower(implode('.', $matches[1]));
                            }
                        }
                    }
                    
                    // If domain still not found, try to extract from server hostname
                    if (empty($domain)) {
                        $server = trim($serverConfig['server'] ?? '');
                        if (!empty($server)) {
                            // Try to extract domain from FQDN (e.g., "server.example.com" -> "example.com")
                            $parts = explode('.', $server);
                            if (count($parts) >= 2) {
                                // Skip first part (hostname), use rest as domain
                                $domain = strtolower(implode('.', array_slice($parts, 1)));
                            }
                        }
                    }
                    
                    // Try login_domain from server config
                    if (empty($domain) && !empty($serverConfig['login_domain'])) {
                        $domain = strtolower(trim($serverConfig['login_domain']));
                    }
                    
                    // Final fallback - use generic domain
                    if (empty($domain)) {
                        $domain = 'ldap.local';
                    }
                    
                    $ldapEmail = $username . '@' . $domain;
                }
                
                // Check group membership requirements if enabled
                $requireGroupMembership = !empty($serverConfig['require_group_membership']) && $serverConfig['require_group_membership'] == '1';
                if ($requireGroupMembership && !empty($serverConfig['required_groups'])) {
                    $requiredGroups = array_map('trim', explode(',', $serverConfig['required_groups']));
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
                    $nestedGroups = !empty($serverConfig['nested_groups']) && $serverConfig['nested_groups'] == '1';
                    if ($nestedGroups && !empty($serverConfig['group_search_base'])) {
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
                        $ldapSuccess = false;
                        $ldapUser = null;
                        $ldapError = "Access denied: User must be a member of one of the required groups";
                        throw new Exception($ldapError);
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
            // If we have a stored error message, use it; otherwise use the exception message
            if ($ldapError === null) {
                $ldapError = $e->getMessage();
            }
            // Reset LDAP success flag if exception occurred
            $ldapSuccess = false;
            $ldapUser = null;
            // Continue to local auth (unless auth_method is 'ldap', which will be handled below)
        }
    } else {
        debug_log("LDAP: Skipped. Enabled: " . ($ldapEnabled ? 'Yes' : 'No') . ", Extension: " . (extension_loaded('ldap') ? 'Yes' : 'No'));
    }
    
    // Handle LDAP Success
    if ($ldapSuccess && $ldapUser) {
        // Check if user exists in DB (case-insensitive)
        $stmt = $db->prepare('SELECT id, username, email, password_hash, is_admin, is_approved, COALESCE(is_disabled, 0) as is_disabled, auth_source, display_name FROM users WHERE LOWER(username) = LOWER(?)');
        $stmt->execute([$username]);
        $user = $stmt->fetch();
        
        if ($user) {
            // User exists, update info if needed (e.g. email, auth_source, display_name from LDAP)
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
        
        // Normalize is_disabled for LDAP users
        $user['is_disabled'] = isset($user['is_disabled']) && $user['is_disabled'] ? 1 : 0;
        
        // Check if user is disabled
        if ($user['is_disabled'] && !$user['is_admin']) {
            sendJSON(['error' => 'Your account has been disabled. Please contact an administrator.'], 403);
        }
        
        // Check approval
        if (!$user['is_approved'] && !$user['is_admin']) {
            sendJSON(['error' => 'Your account is pending admin approval. Please wait for approval before logging in.'], 403);
        }
        
        // Check maintenance mode - only admins can login during maintenance
        if ($maintenanceEnabled && !$user['is_admin']) {
            sendJSON(['error' => 'The application is currently in maintenance mode. Only administrators can log in at this time.'], 503);
        }
        
        // Login success - set session with remember me support
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['username'] = $user['username'];
        
        // Track user login for performance analytics (if enabled)
        trackUserLogin($user['id'], $user['username']);
        
        // Set session cookie expiration based on remember me
        // Note: ini_set for session.cookie_lifetime must be set before session_start(),
        // so we update the cookie directly using setcookie()
        $cookieParams = session_get_cookie_params();
        if ($rememberMe) {
            // 30 days for remember me
            $cookieLifetime = 30 * 24 * 60 * 60; // 30 days in seconds
            setcookie(
                session_name(),
                session_id(),
                time() + $cookieLifetime,
                $cookieParams['path'],
                $cookieParams['domain'],
                $cookieParams['secure'],
                $cookieParams['httponly']
            );
        } else {
            // 24 hours for regular sessions (or 0 for session cookie)
            $cookieLifetime = 24 * 60 * 60; // 24 hours in seconds
            setcookie(
                session_name(),
                session_id(),
                time() + $cookieLifetime,
                $cookieParams['path'],
                $cookieParams['domain'],
                $cookieParams['secure'],
                $cookieParams['httponly']
            );
        }
        
        sendJSON([
            'success' => true,
            'user' => [
                'id' => $user['id'],
                'username' => $user['username'],
                'email' => $user['email'],
                'is_admin' => (bool)$user['is_admin'],
                'is_approved' => (bool)$user['is_approved'],
                'auth_source' => 'ldap',
                'display_name' => $user['display_name'] ?? null
            ]
        ]);
        return;
    }
    
    // 2. Fallback to Local Authentication
    // If auth_method was 'ldap' but LDAP failed, don't allow local fallback
    // Also, if LDAP bind succeeded but group membership failed, return error (don't fall back to local)
    if (($authMethod === 'ldap' && !$ldapSuccess) || ($ldapError && strpos($ldapError, 'required groups') !== false)) {
        // Return specific error message if available, otherwise generic message
        $errorMessage = $ldapError ?? 'LDAP authentication failed. Please check your credentials.';
        sendJSON(['error' => $errorMessage], 401);
    }
    
    $stmt = $db->prepare('SELECT id, username, email, password_hash, is_admin, is_approved, is_disabled, auth_source, display_name FROM users WHERE LOWER(username) = LOWER(?) OR email = ?');
    $stmt->execute([$username, $username]);
    $user = $stmt->fetch();
    
    if (!$user || !password_verify($password, $user['password_hash'])) {
        sendJSON(['error' => 'Invalid username or password'], 401);
    }
    
    // Update auth_source to 'local' only if it's empty/NULL (for existing users created before auth_source column)
    // Don't override if it's explicitly set to 'ldap' - respect admin's manual setting
    if (empty($user['auth_source']) || $user['auth_source'] === null) {
        $stmt = $db->prepare('UPDATE users SET auth_source = ? WHERE id = ?');
        $stmt->execute(['local', $user['id']]);
        $user['auth_source'] = 'local';
    }
    
    // Check if user is disabled
    if ($user['is_disabled'] && !$user['is_admin']) {
        sendJSON(['error' => 'Your account has been disabled. Please contact an administrator.'], 403);
    }
    
    // Check if user is approved
    if (!$user['is_approved'] && !$user['is_admin']) {
        sendJSON(['error' => 'Your account is pending admin approval. Please wait for approval before logging in.'], 403);
    }
    
    // Check maintenance mode - only admins can login during maintenance
    if ($maintenanceEnabled && !$user['is_admin']) {
        sendJSON(['error' => 'The application is currently in maintenance mode. Only administrators can log in at this time.'], 503);
    }
    
    // Login success - set session with remember me support
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['username'] = $user['username'];
    
    // Track user login for performance analytics (if enabled)
    trackUserLogin($user['id'], $user['username']);
    
    // Set session cookie expiration based on remember me
    // Note: ini_set for session.cookie_lifetime must be set before session_start(),
    // so we update the cookie directly using setcookie()
    $cookieParams = session_get_cookie_params();
    if ($rememberMe) {
        // 30 days for remember me
        $cookieLifetime = 30 * 24 * 60 * 60; // 30 days in seconds
        setcookie(
            session_name(),
            session_id(),
            time() + $cookieLifetime,
            $cookieParams['path'],
            $cookieParams['domain'],
            $cookieParams['secure'],
            $cookieParams['httponly']
        );
    } else {
        // 24 hours for regular sessions (or 0 for session cookie)
        $cookieLifetime = 24 * 60 * 60; // 24 hours in seconds
        setcookie(
            session_name(),
            session_id(),
            time() + $cookieLifetime,
            $cookieParams['path'],
            $cookieParams['domain'],
            $cookieParams['secure'],
            $cookieParams['httponly']
        );
    }
    
    sendJSON([
        'success' => true,
        'user' => [
            'id' => $user['id'],
            'username' => $user['username'],
            'email' => $user['email'],
            'is_admin' => (bool)$user['is_admin'],
            'is_approved' => (bool)$user['is_approved'],
            'auth_source' => $user['auth_source'] ?? 'local',
            'display_name' => $user['display_name'] ?? null
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

function handleBulkApproveUsers() {
    requireAdmin(); // Only admins can approve users
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['user_ids']) || !is_array($input['user_ids']) || empty($input['user_ids'])) {
        sendJSON(['error' => 'Invalid request: user_ids array is required'], 400);
    }
    
    $userIds = $input['user_ids'];
    
    // Validate all IDs are integers
    $validIds = [];
    foreach ($userIds as $id) {
        $id = (int)$id;
        if ($id > 0) {
            $validIds[] = $id;
        }
    }
    
    if (empty($validIds)) {
        sendJSON(['error' => 'No valid user IDs provided'], 400);
    }
    
    $db = getDB();
    
    // Create placeholders for IN clause
    $placeholders = str_repeat('?,', count($validIds) - 1) . '?';
    
    // Update all users in a single query
    $stmt = $db->prepare("UPDATE users SET is_approved = 1 WHERE id IN ($placeholders) AND is_admin = 0 AND is_approved = 0");
    $stmt->execute($validIds);
    
    $approvedCount = $stmt->rowCount();
    
    if ($approvedCount > 0) {
        sendJSON([
            'success' => true, 
            'message' => "Successfully approved $approvedCount user(s)",
            'approved_count' => $approvedCount
        ]);
    } else {
        sendJSON(['error' => 'No users were approved. They may have already been approved or do not exist.'], 404);
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
    $stmt = $db->prepare('SELECT id, username, email, is_admin, is_approved, is_disabled, auth_source, created_at FROM users ORDER BY created_at DESC');
    $stmt->execute();
    $users = $stmt->fetchAll();
    
    // Convert timestamps and booleans
    foreach ($users as &$user) {
        $user['created_at'] = (int)$user['created_at'];
        $user['is_admin'] = (bool)$user['is_admin'];
        $user['is_approved'] = (bool)$user['is_approved'];
        $user['is_disabled'] = isset($user['is_disabled']) ? (bool)$user['is_disabled'] : false;
        // Default to 'local' if auth_source is not set (for existing users)
        $user['auth_source'] = $user['auth_source'] ?? 'local';
    }
    
    sendJSON(['users' => $users]);
}

function handleGetUsers() {
    requireAuth(); // Any authenticated user can see the user list for selecting private link recipients
    
    $db = getDB();
    // Return only approved users (id, username, email, auth_source, and is_admin) for privacy
    $stmt = $db->prepare('SELECT id, username, email, auth_source, is_admin FROM users WHERE is_approved = 1 ORDER BY username ASC');
    $stmt->execute();
    $users = $stmt->fetchAll();
    
    // Default auth_source to 'local' if not set, and convert is_admin to boolean
    foreach ($users as &$user) {
        $user['auth_source'] = $user['auth_source'] ?? 'local';
        $user['is_admin'] = (bool)$user['is_admin'];
    }
    
    sendJSON(['users' => $users]);
}

function handleResetPassword($userId) {
    requireAdmin(); // Only admins can reset passwords
    
    $data = getJSONInput();
    
    if (!isset($data['new_password'])) {
        sendJSON(['error' => 'New password is required'], 400);
    }
    $err = validatePasswordStrength($data['new_password']);
    if ($err !== null) {
        sendJSON(['error' => $err], 400);
    }
    
    $db = getDB();
    
    // Check if user exists and is eligible for local password change
    $stmt = $db->prepare('SELECT id, is_admin, auth_source FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    
    if (!$user) {
        sendJSON(['error' => 'User not found'], 404);
    }
    
    // Prevent resetting admin password (security measure)
    if ($user['is_admin']) {
        sendJSON(['error' => 'Cannot change admin password through this interface. Use Change Admin Password instead.'], 403);
    }

    $authSource = strtolower(trim((string)($user['auth_source'] ?? 'local')));
    if ($authSource === '') {
        $authSource = 'local';
    }
    if ($authSource !== 'local') {
        sendJSON(['error' => 'Password can only be changed for local users (current auth source: ' . $authSource . ')'], 400);
    }
    
    // Update password
    $passwordHash = password_hash($data['new_password'], PASSWORD_DEFAULT);
    $stmt = $db->prepare('UPDATE users SET password_hash = ? WHERE id = ? AND is_admin = 0');
    $stmt->execute([$passwordHash, $userId]);
    
    if ($stmt->rowCount() > 0) {
        sendJSON(['success' => true, 'message' => 'Password changed successfully']);
    } else {
        sendJSON(['error' => 'Failed to change password'], 500);
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
    
    // Check if user exists
    $stmt = $db->prepare('SELECT id, auth_source FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$user) {
        sendJSON(['error' => 'User not found'], 404);
    }
    
    // Normalize auth_source: treat NULL, empty string, or 'local' as 'local'
    $currentAuthSource = $user['auth_source'] ?? null;
    $currentAuthSource = ($currentAuthSource === null || $currentAuthSource === '' || $currentAuthSource === 'local') ? 'local' : $currentAuthSource;
    
    // Toggle through all three sources: local -> ldap -> saml -> local
    if ($currentAuthSource === 'local') {
        $newAuthSource = 'ldap';
    } elseif ($currentAuthSource === 'ldap') {
        $newAuthSource = 'saml';
    } else {
        $newAuthSource = 'local';
    }
    
    // Update the auth_source
    $stmt = $db->prepare('UPDATE users SET auth_source = ? WHERE id = ?');
    $stmt->execute([$newAuthSource, $userId]);
    
    // Verify the update by re-reading the value
    $stmt = $db->prepare('SELECT auth_source FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $updatedUser = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($updatedUser && $updatedUser['auth_source'] === $newAuthSource) {
        sendJSON(['success' => true, 'message' => "Auth source updated to {$newAuthSource}", 'auth_source' => $newAuthSource]);
    } else {
        // Even if rowCount is 0, check if the value is already what we want
        if ($updatedUser && $updatedUser['auth_source'] === $newAuthSource) {
            sendJSON(['success' => true, 'message' => "Auth source is already set to {$newAuthSource}", 'auth_source' => $newAuthSource]);
        } else {
            sendJSON(['error' => 'Failed to update auth source. Please try again.'], 500);
        }
    }
}

function handleToggleAdmin($userId) {
    requireAdmin(); // Only admins can promote/demote other users
    
    $db = getDB();
    
    // Check if user exists
    $stmt = $db->prepare('SELECT id, is_admin FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    
    if (!$user) {
        sendJSON(['error' => 'User not found'], 404);
    }
    
    // Get current admin user to prevent self-demotion
    $currentUser = getAuthenticatedUser();
    if ($currentUser && (int)$currentUser['id'] === (int)$userId && $user['is_admin']) {
        sendJSON(['error' => 'You cannot demote yourself from admin'], 403);
    }
    
    // Toggle admin status
    $newAdminStatus = $user['is_admin'] ? 0 : 1;
    
    // When promoting to admin, also approve the user if not already approved
    if ($newAdminStatus) {
        $stmt = $db->prepare('UPDATE users SET is_admin = 1, is_approved = 1 WHERE id = ?');
    } else {
        $stmt = $db->prepare('UPDATE users SET is_admin = 0 WHERE id = ?');
    }
    $stmt->execute([$userId]);
    
    if ($stmt->rowCount() > 0) {
        $action = $newAdminStatus ? 'promoted to admin' : 'demoted from admin';
        sendJSON(['success' => true, 'message' => "User {$action} successfully", 'is_admin' => (bool)$newAdminStatus]);
    } else {
        sendJSON(['error' => 'Failed to update admin status'], 500);
    }
}

function handleChangeAdminPassword() {
    requireAdmin(); // Only admins can change admin password
    
    $data = getJSONInput();
    
    if (!isset($data['current_password']) || !isset($data['new_password'])) {
        sendJSON(['error' => 'Current password and new password are required'], 400);
    }
    $err = validatePasswordStrength($data['new_password']);
    if ($err !== null) {
        sendJSON(['error' => $err], 400);
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

/**
 * Authenticated user can change their own password (local accounts only).
 */
function handleChangeMyPassword() {
    $user = getAuthenticatedUser();
    if (!$user) {
        sendJSON(['error' => 'Authentication required'], 401);
        return;
    }

    $data = getJSONInput();
    if (!isset($data['current_password']) || !isset($data['new_password'])) {
        sendJSON(['error' => 'Current password and new password are required'], 400);
        return;
    }
    $err = validatePasswordStrength($data['new_password']);
    if ($err !== null) {
        sendJSON(['error' => $err], 400);
        return;
    }

    $db = getDB();
    $stmt = $db->prepare('SELECT id, password_hash, auth_source FROM users WHERE id = ?');
    $stmt->execute([$user['id']]);
    $row = $stmt->fetch();
    if (!$row) {
        sendJSON(['error' => 'User not found'], 404);
        return;
    }
    if (($row['auth_source'] ?? 'local') !== 'local') {
        sendJSON(['error' => 'Password can only be changed for local accounts'], 403);
        return;
    }
    if (!password_verify($data['current_password'], $row['password_hash'])) {
        sendJSON(['error' => 'Current password is incorrect'], 401);
        return;
    }

    $passwordHash = password_hash($data['new_password'], PASSWORD_DEFAULT);
    $stmt = $db->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    $stmt->execute([$passwordHash, $user['id']]);
    if ($stmt->rowCount() > 0) {
        sendJSON(['success' => true, 'message' => 'Password changed successfully']);
    } else {
        sendJSON(['error' => 'Failed to change password'], 500);
    }
}

/**
 * Authenticated user can update their own profile (e.g. display name).
 */
function handleUpdateMyProfile() {
    $user = getAuthenticatedUser();
    if (!$user) {
        sendJSON(['error' => 'Authentication required'], 401);
        return;
    }

    $data = getJSONInput();
    $displayName = isset($data['display_name']) ? trim((string) $data['display_name']) : null;
    // Allow empty string to clear display name
    if ($displayName !== null && strlen($displayName) > 255) {
        sendJSON(['error' => 'Display name must be 255 characters or less'], 400);
        return;
    }

    $db = getDB();
    $stmt = $db->prepare('UPDATE users SET display_name = ? WHERE id = ?');
    $stmt->execute([$displayName === '' ? null : $displayName, $user['id']]);
    if ($stmt->rowCount() >= 0) {
        $stmt = $db->prepare('SELECT id, username, email, is_admin, is_approved, auth_source, display_name FROM users WHERE id = ?');
        $stmt->execute([$user['id']]);
        $updated = $stmt->fetch();
        if ($updated) {
            $updated['is_admin'] = (bool)$updated['is_admin'];
            $updated['is_approved'] = (bool)$updated['is_approved'];
        }
        sendJSON(['success' => true, 'message' => 'Profile updated', 'user' => $updated]);
    } else {
        sendJSON(['error' => 'Failed to update profile'], 500);
    }
}

function handleToggleDisable($userId) {
    requireAdmin(); // Only admins can disable/enable users
    
    $db = getDB();
    
    // Check if user exists
    $stmt = $db->prepare('SELECT id, is_disabled, is_admin FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    
    if (!$user) {
        sendJSON(['error' => 'User not found'], 404);
    }
    
    // Prevent disabling admin accounts
    if ($user['is_admin']) {
        sendJSON(['error' => 'Cannot disable admin accounts'], 403);
    }
    
    // Toggle disabled status
    $newDisabledStatus = $user['is_disabled'] ? 0 : 1;
    
    $stmt = $db->prepare('UPDATE users SET is_disabled = ? WHERE id = ? AND is_admin = 0');
    $stmt->execute([$newDisabledStatus, $userId]);
    
    if ($stmt->rowCount() > 0) {
        $action = $newDisabledStatus ? 'disabled' : 'enabled';
        sendJSON(['success' => true, 'message' => "User {$action} successfully", 'is_disabled' => (bool)$newDisabledStatus]);
    } else {
        sendJSON(['error' => 'Failed to update disabled status'], 500);
    }
}

function handleUpdateUser($userId) {
    requireAdmin(); // Only admins can update user details
    
    $data = getJSONInput();
    
    if (!isset($data['username']) || !isset($data['email'])) {
        sendJSON(['error' => 'Username and email are required'], 400);
    }
    
    $username = trim($data['username']);
    $email = trim($data['email']);
    $authSource = isset($data['auth_source']) ? trim($data['auth_source']) : 'local';
    
    // Validate auth_source
    if (!in_array($authSource, ['local', 'ldap', 'saml'])) {
        sendJSON(['error' => 'Invalid authentication source. Must be local, ldap, or saml'], 400);
    }
    
    if (strlen($username) < 3) {
        sendJSON(['error' => 'Username must be at least 3 characters'], 400);
    }
    
    // Allow @localhost for local users, otherwise validate normally
    $emailLower = strtolower($email);
    $isLocalhostEmail = strpos($emailLower, '@localhost') !== false;
    if (!$isLocalhostEmail && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendJSON(['error' => 'Invalid email address'], 400);
    }
    
    $db = getDB();
    
    // Check if user exists
    $stmt = $db->prepare('SELECT id, username, email FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    
    if (!$user) {
        sendJSON(['error' => 'User not found'], 404);
    }
    
    // Check if username already exists (excluding current user)
    $stmt = $db->prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?');
    $stmt->execute([$username, $userId]);
    if ($stmt->fetch()) {
        sendJSON(['error' => 'Username already exists'], 409);
    }
    
    // Check if email already exists (excluding current user)
    $stmt = $db->prepare('SELECT id FROM users WHERE email = ? AND id != ?');
    $stmt->execute([$email, $userId]);
    if ($stmt->fetch()) {
        sendJSON(['error' => 'Email already exists'], 409);
    }
    
    // Update username, email, and auth_source
    $stmt = $db->prepare('UPDATE users SET username = ?, email = ?, auth_source = ? WHERE id = ?');
    $stmt->execute([$username, $email, $authSource, $userId]);
    
    if ($stmt->rowCount() > 0) {
        sendJSON([
            'success' => true,
            'message' => 'User updated successfully',
            'user' => [
                'id' => $userId,
                'username' => $username,
                'email' => $email,
                'auth_source' => $authSource
            ]
        ]);
    } else {
        sendJSON(['error' => 'Failed to update user'], 500);
    }
}

function handleBulkDisableUsers() {
    requireAdmin(); // Only admins can disable users
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['user_ids']) || !is_array($input['user_ids']) || empty($input['user_ids'])) {
        sendJSON(['error' => 'Invalid request: user_ids array is required'], 400);
    }
    
    $userIds = $input['user_ids'];
    
    // Validate all IDs are integers
    $validIds = [];
    foreach ($userIds as $id) {
        $id = (int)$id;
        if ($id > 0) {
            $validIds[] = $id;
        }
    }
    
    if (empty($validIds)) {
        sendJSON(['error' => 'No valid user IDs provided'], 400);
    }
    
    $db = getDB();
    
    // Create placeholders for IN clause
    $placeholders = str_repeat('?,', count($validIds) - 1) . '?';
    
    // Update all users in a single query (exclude admins)
    $stmt = $db->prepare("UPDATE users SET is_disabled = 1 WHERE id IN ($placeholders) AND is_admin = 0");
    $stmt->execute($validIds);
    
    $disabledCount = $stmt->rowCount();
    
    if ($disabledCount > 0) {
        sendJSON([
            'success' => true, 
            'message' => "Successfully disabled $disabledCount user(s)",
            'disabled_count' => $disabledCount
        ]);
    } else {
        sendJSON(['error' => 'No users were disabled. They may be admin accounts or do not exist.'], 404);
    }
}

function handleBulkPromoteUsers() {
    requireAdmin(); // Only admins can promote users
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['user_ids']) || !is_array($input['user_ids']) || empty($input['user_ids'])) {
        sendJSON(['error' => 'Invalid request: user_ids array is required'], 400);
    }
    
    $userIds = $input['user_ids'];
    
    // Validate all IDs are integers
    $validIds = [];
    foreach ($userIds as $id) {
        $id = (int)$id;
        if ($id > 0) {
            $validIds[] = $id;
        }
    }
    
    if (empty($validIds)) {
        sendJSON(['error' => 'No valid user IDs provided'], 400);
    }
    
    $db = getDB();
    
    // Create placeholders for IN clause
    $placeholders = str_repeat('?,', count($validIds) - 1) . '?';
    
    // Promote users to admin and approve them
    $stmt = $db->prepare("UPDATE users SET is_admin = 1, is_approved = 1 WHERE id IN ($placeholders)");
    $stmt->execute($validIds);
    
    $promotedCount = $stmt->rowCount();
    
    if ($promotedCount > 0) {
        sendJSON([
            'success' => true, 
            'message' => "Successfully promoted $promotedCount user(s) to admin",
            'promoted_count' => $promotedCount
        ]);
    } else {
        sendJSON(['error' => 'No users were promoted'], 404);
    }
}

function handleBulkToggleApproval() {
    requireAdmin(); // Only admins can toggle approval
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['user_ids']) || !is_array($input['user_ids']) || empty($input['user_ids'])) {
        sendJSON(['error' => 'Invalid request: user_ids array is required'], 400);
    }
    
    $userIds = $input['user_ids'];
    
    // Validate all IDs are integers
    $validIds = [];
    foreach ($userIds as $id) {
        $id = (int)$id;
        if ($id > 0) {
            $validIds[] = $id;
        }
    }
    
    if (empty($validIds)) {
        sendJSON(['error' => 'No valid user IDs provided'], 400);
    }
    
    $db = getDB();
    
    // Create placeholders for IN clause
    $placeholders = str_repeat('?,', count($validIds) - 1) . '?';
    
    // Toggle approval status for non-admin users
    // First get current approval status to toggle
    $stmt = $db->prepare("SELECT id, is_approved FROM users WHERE id IN ($placeholders) AND is_admin = 0");
    $stmt->execute($validIds);
    $users = $stmt->fetchAll();
    
    if (empty($users)) {
        sendJSON(['error' => 'No valid non-admin users found'], 404);
    }
    
    // Toggle approval for each user
    $approvedCount = 0;
    $unapprovedCount = 0;
    foreach ($users as $user) {
        $newStatus = $user['is_approved'] ? 0 : 1;
        $updateStmt = $db->prepare('UPDATE users SET is_approved = ? WHERE id = ?');
        $updateStmt->execute([$newStatus, $user['id']]);
        
        if ($newStatus) {
            $approvedCount++;
        } else {
            $unapprovedCount++;
        }
    }
    
    if ($approvedCount > 0 || $unapprovedCount > 0) {
        $message = '';
        if ($approvedCount > 0 && $unapprovedCount > 0) {
            $message = "Toggled approval: $approvedCount approved, $unapprovedCount unapproved";
        } elseif ($approvedCount > 0) {
            $message = "Successfully approved $approvedCount user(s)";
        } else {
            $message = "Successfully unapproved $unapprovedCount user(s)";
        }
        
        sendJSON([
            'success' => true, 
            'message' => $message,
            'approved_count' => $approvedCount,
            'unapproved_count' => $unapprovedCount
        ]);
    } else {
        sendJSON(['error' => 'Failed to toggle approval'], 500);
    }
}

function ldapEscapeFilterValue(string $value): string {
    if (function_exists('ldap_escape')) {
        return ldap_escape($value, '', LDAP_ESCAPE_FILTER);
    }
    $safe = $value;
    $safe = str_replace('\\', '\\5c', $safe);
    $safe = str_replace('*', '\\2a', $safe);
    $safe = str_replace('(', '\\28', $safe);
    $safe = str_replace(')', '\\29', $safe);
    $safe = str_replace("\x00", '\\00', $safe);
    return $safe;
}

/**
 * Collect LDAP diagnostic details for admin troubleshooting (no secrets).
 */
function ldapCollectDiagnostics($ldap, array $context = []): array {
    $errno = 0;
    $error = 'n/a';
    $diagnostic = '';
    if ($ldap) {
        $errno = @ldap_errno($ldap);
        $error = @ldap_error($ldap) ?: 'n/a';
        if (defined('LDAP_OPT_DIAGNOSTIC_MESSAGE')) {
            @ldap_get_option($ldap, LDAP_OPT_DIAGNOSTIC_MESSAGE, $diagnostic);
        }
    }
    return array_merge([
        'ldap_errno' => $errno,
        'ldap_error' => $error,
        'diagnostic' => is_string($diagnostic) ? $diagnostic : '',
    ], $context);
}

function handleSearchLdapUsers() {
    try {
        requireAdmin(); // Only admins can search LDAP
        
        $data = getJSONInput();
        if ($data === null) {
            sendJSON(['error' => 'Invalid JSON input'], 400);
            return;
        }
        
        $searchTerm = trim($data['search'] ?? '');
        
        if (empty($searchTerm)) {
            sendJSON(['error' => 'Search term is required'], 400);
            return;
        }
        
        if (strlen($searchTerm) < 2) {
            sendJSON(['error' => 'Search term must be at least 2 characters'], 400);
            return;
        }
        
        // Load LDAP settings from database (same approach as handleLogin)
        $db = getDB();
        $stmt = $db->prepare("SELECT key, value FROM settings WHERE key LIKE 'ldap_%'");
        $stmt->execute();
        $settings = [];
        foreach ($stmt->fetchAll() as $row) {
            $settings[$row['key']] = $row['value'];
        }
        
        $ldapEnabled = !empty($settings['ldap_enabled']) && $settings['ldap_enabled'] == '1';
        
        if (!$ldapEnabled) {
            sendJSON(['error' => 'LDAP is not enabled'], 400);
            return;
        }
        
        if (!extension_loaded('ldap')) {
            sendJSON(['error' => 'LDAP extension is not loaded'], 500);
            return;
        }
        
        // Connect to LDAP (reuse connection logic from handleLogin)
        $server = trim($settings['ldap_server'] ?? '');
        $port = (int)($settings['ldap_port'] ?? 389);
        $protocol = trim($settings['ldap_protocol'] ?? 'ldap');
        $tls = !empty($settings['ldap_tls']) && $settings['ldap_tls'] == '1';
        $timeout = (int)($settings['ldap_timeout'] ?? 30);
        
        if (empty($server)) {
            sendJSON(['error' => 'LDAP server is not configured'], 400);
            return;
        }
        
        $prefix = ($protocol === 'ldaps') ? 'ldaps://' : 'ldap://';
        $uri = $prefix . $server . ':' . $port;
        
        $ldap = @ldap_connect($uri);
        if (!$ldap) {
            sendJSON([
                'error' => 'Failed to connect to LDAP server at ' . $uri,
                'details' => [
                    'uri' => $uri,
                    'hint' => 'Check ldap_server, ldap_port, and ldap_protocol settings.'
                ]
            ], 500);
            return;
        }
        
        ldap_set_option($ldap, LDAP_OPT_PROTOCOL_VERSION, 3);
        // Admin picker search: referrals often cause "Operations error" on AD — keep disabled for search
        ldap_set_option($ldap, LDAP_OPT_REFERRALS, 0);
        ldap_set_option($ldap, LDAP_OPT_NETWORK_TIMEOUT, $timeout);
        ldap_set_option($ldap, LDAP_OPT_TIMELIMIT, $timeout);
        
        if ($tls && $protocol !== 'ldaps') {
            if (!@ldap_start_tls($ldap)) {
                $details = ldapCollectDiagnostics($ldap, [
                    'uri' => $uri,
                    'step' => 'start_tls',
                    'hint' => 'TLS negotiation failed. Try ldaps:// on 636 or fix certificates.'
                ]);
                $err = $details['ldap_error'] ?: 'unknown';
                @ldap_close($ldap);
                sendJSON(['error' => 'TLS start failed: ' . $err, 'details' => $details], 500);
                return;
            }
        }
        
        // Bind with service account
        $bindDn = trim($settings['ldap_bind_dn'] ?? '');
        $bindPass = $settings['ldap_bind_password'] ?? '';
        
        // Decrypt password if it's encrypted (handles both encrypted and plain text for backward compatibility)
        if (!empty($bindPass)) {
            // Check if password is encrypted (contains dots in format: base64.base64.base64)
            $isEncrypted = (strpos($bindPass, '.') !== false && substr_count($bindPass, '.') === 2);
            if ($isEncrypted) {
                try {
                    $bindPass = decryptPassword($bindPass);
                } catch (Exception $e) {
                    error_log("LDAP: Failed to decrypt bind password: " . $e->getMessage());
                    error_log("LDAP: DB_PATH: " . (defined('DB_PATH') ? DB_PATH : 'not defined'));
                    // If decryption fails, clear the password to prevent using corrupted data
                    $bindPass = '';
                }
            }
        }
        
        $bound = false;
        if (!empty($bindDn) && !empty($bindPass)) {
            $bound = @ldap_bind($ldap, $bindDn, $bindPass);
        } else {
            $bound = @ldap_bind($ldap); // Anonymous
        }
        
        if (!$bound) {
            $details = ldapCollectDiagnostics($ldap, [
                'uri' => $uri,
                'step' => 'bind',
                'bind_dn' => $bindDn !== '' ? $bindDn : '(anonymous)',
                'hint' => 'Verify bind DN and password. Service account may lack search permission.'
            ]);
            $err = $details['ldap_error'] ?: 'unknown';
            @ldap_close($ldap);
            sendJSON(['error' => 'LDAP bind failed: ' . $err, 'details' => $details], 500);
            return;
        }
        
        // Admin picker search: dedicated filters (do not reuse login exact filter)
        $searchBase = trim($settings['ldap_user_search_base'] ?? '');
        if (empty($searchBase)) {
            @ldap_close($ldap);
            sendJSON(['error' => 'LDAP user search base is not configured'], 400);
            return;
        }
        
        $safeSearch = ldapEscapeFilterValue($searchTerm);
        
        // Progressive filters: broad OR wildcards often cause AD "Operations error".
        // Try AD-friendly ANR first, then simple sAMAccountName prefix/exact.
        $filterAttempts = [
            [
                'name' => 'ad_anr_user',
                'filter' => '(&(objectCategory=person)(objectClass=user)(|(anr=' . $safeSearch . ')(sAMAccountName=' . $safeSearch . '*)(mail=' . $safeSearch . '*)(userPrincipalName=' . $safeSearch . '*)))',
            ],
            [
                'name' => 'samaccount_prefix',
                'filter' => '(sAMAccountName=' . $safeSearch . '*)',
            ],
            [
                'name' => 'samaccount_exact',
                'filter' => '(sAMAccountName=' . $safeSearch . ')',
            ],
            [
                'name' => 'mail_upn_prefix',
                'filter' => '(|(mail=' . $safeSearch . '*)(userPrincipalName=' . $safeSearch . '*)(cn=' . $safeSearch . '*)(displayName=' . $safeSearch . '*))',
            ],
        ];
        
        // Also try configured login filter with exact term (OpenLDAP / custom schemas)
        $filterTemplate = trim($settings['ldap_user_filter'] ?? '');
        if ($filterTemplate !== '' && strpos($filterTemplate, '{username}') !== false) {
            $filterAttempts[] = [
                'name' => 'configured_login_filter',
                'filter' => str_replace('{username}', $safeSearch, $filterTemplate),
            ];
        }
        
        // Get attributes
        $attributesStr = $settings['ldap_user_attributes'] ?? 'sAMAccountName,mail,displayName,userPrincipalName,cn';
        $attributes = array_map('trim', explode(',', $attributesStr));
        $essentialAttrs = ['sAMAccountName', 'mail', 'displayName', 'userPrincipalName', 'cn'];
        foreach ($essentialAttrs as $attr) {
            if (!in_array($attr, $attributes)) {
                $attributes[] = $attr;
            }
        }
        
        // Custom attribute mappings
        $emailAttr = !empty($settings['ldap_email_attribute']) ? $settings['ldap_email_attribute'] : null;
        $displayNameAttr = !empty($settings['ldap_display_name_attribute']) ? $settings['ldap_display_name_attribute'] : null;
        
        if ($emailAttr && !in_array($emailAttr, $attributes)) {
            $attributes[] = $emailAttr;
        }
        if ($displayNameAttr && !in_array($displayNameAttr, $attributes)) {
            $attributes[] = $displayNameAttr;
        }
        
        // Determine search scope - use same as configured for login
        $searchScope = strtolower($settings['ldap_search_scope'] ?? 'sub');
        
        // Set size limit to prevent aggressive scanning (max 20 results)
        ldap_set_option($ldap, LDAP_OPT_SIZELIMIT, 20);
        
        $result = false;
        $usedFilter = null;
        $usedAttempt = null;
        $attemptErrors = [];
        
        foreach ($filterAttempts as $attempt) {
            $filter = $attempt['filter'];
            if ($searchScope === 'base') {
                $result = @ldap_read($ldap, $searchBase, $filter, $attributes, 0, 20, $timeout);
            } elseif ($searchScope === 'one') {
                $result = @ldap_list($ldap, $searchBase, $filter, $attributes, 0, 20, $timeout);
            } else {
                $result = @ldap_search($ldap, $searchBase, $filter, $attributes, 0, 20, $timeout);
            }
            
            if ($result !== false) {
                $usedFilter = $filter;
                $usedAttempt = $attempt['name'];
                break;
            }
            
            $err = @ldap_error($ldap);
            $errno = @ldap_errno($ldap);
            // Size limit exceeded can still return partial results depending on server; treat as soft failure only if no result handle
            if (is_string($err) && stripos($err, 'Size limit') !== false) {
                $usedFilter = $filter;
                $usedAttempt = $attempt['name'] . '_sizelimit';
                // Some PHP builds leave $result false on sizelimit; continue to next simpler filter
                $attemptErrors[] = ldapCollectDiagnostics($ldap, [
                    'attempt' => $attempt['name'],
                    'filter' => $filter,
                    'note' => 'Size limit reported; trying next filter strategy'
                ]);
                continue;
            }
            
            $attemptErrors[] = ldapCollectDiagnostics($ldap, [
                'attempt' => $attempt['name'],
                'filter' => $filter,
            ]);
            error_log('LDAP admin search attempt failed [' . $attempt['name'] . ']: errno=' . $errno . ' error=' . $err . ' filter=' . $filter);
        }
        
        if ($result === false) {
            $details = ldapCollectDiagnostics($ldap, [
                'uri' => $uri,
                'search_base' => $searchBase,
                'search_scope' => $searchScope,
                'search_term' => $searchTerm,
                'referrals' => false,
                'step' => 'search',
                'attempts' => $attemptErrors,
                'hint' => 'AD often returns "Operations error" for broad multi-attribute wildcard searches or when referrals chase to unavailable DCs. Verify search base DN, bind permissions, and try a fuller username (exact sAMAccountName).',
            ]);
            $err = $details['ldap_error'] ?: 'unknown';
            @ldap_close($ldap);
            sendJSON([
                'error' => 'LDAP search failed: ' . $err,
                'details' => $details,
            ], 500);
            return;
        }
        
        $entries = @ldap_get_entries($ldap, $result);
        if ($entries === false) {
            $details = ldapCollectDiagnostics($ldap, [
                'uri' => $uri,
                'search_base' => $searchBase,
                'search_scope' => $searchScope,
                'filter' => $usedFilter,
                'attempt' => $usedAttempt,
                'step' => 'get_entries',
            ]);
            @ldap_close($ldap);
            sendJSON(['error' => 'Failed to get LDAP entries', 'details' => $details], 500);
            return;
        }
        @ldap_close($ldap);
        
        $users = [];
        // Limit to first 20 results
        $entryCount = min(isset($entries['count']) ? (int)$entries['count'] : 0, 20);
        $searchTermLower = strtolower($searchTerm);
        
        for ($i = 0; $i < $entryCount; $i++) {
            $entry = $entries[$i];
            
            // Extract username (sAMAccountName or userPrincipalName)
            $username = '';
            if (isset($entry['samaccountname']) && is_array($entry['samaccountname']) && isset($entry['samaccountname'][0])) {
                $username = $entry['samaccountname'][0];
            } elseif (isset($entry['userprincipalname']) && is_array($entry['userprincipalname']) && isset($entry['userprincipalname'][0])) {
                $upn = $entry['userprincipalname'][0];
                $username = explode('@', $upn)[0]; // Extract username part
            }
            
            if (empty($username)) {
                continue; // Skip entries without username
            }
            
            // Extract email
            $email = '';
            if ($emailAttr && isset($entry[strtolower($emailAttr)]) && is_array($entry[strtolower($emailAttr)]) && isset($entry[strtolower($emailAttr)][0])) {
                $email = $entry[strtolower($emailAttr)][0];
            } elseif (isset($entry['mail']) && is_array($entry['mail']) && isset($entry['mail'][0])) {
                $email = $entry['mail'][0];
            } elseif (isset($entry['userprincipalname']) && is_array($entry['userprincipalname']) && isset($entry['userprincipalname'][0])) {
                $upn = $entry['userprincipalname'][0];
                if (filter_var($upn, FILTER_VALIDATE_EMAIL)) {
                    $email = $upn;
                }
            }
            
            // Extract display name
            $displayName = '';
            if ($displayNameAttr && isset($entry[strtolower($displayNameAttr)]) && is_array($entry[strtolower($displayNameAttr)]) && isset($entry[strtolower($displayNameAttr)][0])) {
                $displayName = $entry[strtolower($displayNameAttr)][0];
            } elseif (isset($entry['displayname']) && is_array($entry['displayname']) && isset($entry['displayname'][0])) {
                $displayName = $entry['displayname'][0];
            }
            
            $users[] = [
                'username' => $username,
                'email' => $email,
                'displayName' => $displayName,
                'dn' => $entry['dn'] ?? ''
            ];
        }
        
        // Prefer exact sAMAccountName / username matches first
        usort($users, function ($a, $b) use ($searchTermLower) {
            $aExact = (strtolower($a['username']) === $searchTermLower) ? 0 : 1;
            $bExact = (strtolower($b['username']) === $searchTermLower) ? 0 : 1;
            if ($aExact !== $bExact) {
                return $aExact - $bExact;
            }
            return strcasecmp($a['username'], $b['username']);
        });
        
        sendJSON([
            'success' => true,
            'users' => $users,
            'meta' => [
                'search_term' => $searchTerm,
                'filter_attempt' => $usedAttempt,
                'result_count' => count($users),
            ],
        ]);
        
    } catch (Exception $e) {
        sendJSON(['error' => 'LDAP search error: ' . $e->getMessage(), 'details' => ['exception' => $e->getMessage()]], 500);
    } catch (Error $e) {
        // Catch PHP 7+ fatal errors
        sendJSON(['error' => 'LDAP search fatal error: ' . $e->getMessage(), 'details' => ['fatal' => $e->getMessage()]], 500);
    }
}

/** First string value from an ldap_get_entries attribute (case-insensitive key). */
function ldapEntryAttrFirst(array $entry, string $attr): string {
    $key = strtolower($attr);
    if (!isset($entry[$key]) || !is_array($entry[$key]) || !isset($entry[$key][0])) {
        return '';
    }
    $val = $entry[$key][0];
    return is_string($val) ? $val : (string)$val;
}

/** All string values from an ldap_get_entries attribute. */
function ldapEntryAttrAll(array $entry, string $attr): array {
    $key = strtolower($attr);
    if (!isset($entry[$key]) || !is_array($entry[$key])) {
        return [];
    }
    $values = [];
    $count = isset($entry[$key]['count']) ? (int)$entry[$key]['count'] : 0;
    for ($i = 0; $i < $count; $i++) {
        if (isset($entry[$key][$i])) {
            $values[] = is_string($entry[$key][$i]) ? $entry[$key][$i] : (string)$entry[$key][$i];
        }
    }
    return $values;
}

/** Extract CN=... from a DN for friendly group labels. */
function ldapCnFromDn(string $dn): string {
    if (preg_match('/^CN=([^,]+)/i', $dn, $m)) {
        return $m[1];
    }
    return $dn;
}

/**
 * Convert Windows FILETIME (100ns since 1601-01-01) to ISO-8601 UTC, or null if unset/never.
 */
function ldapFileTimeToIso($fileTime): ?string {
    if ($fileTime === null || $fileTime === '' || $fileTime === '0' || $fileTime === 0) {
        return null;
    }
    $ft = (string)$fileTime;
    // AD "never" sentinel
    if ($ft === '9223372036854775807') {
        return null;
    }
    if (!ctype_digit($ft)) {
        return null;
    }
    // Prefer BCMath for large integers
    if (function_exists('bcdiv') && function_exists('bcsub')) {
        $seconds = bcdiv($ft, '10000000', 0);
        $unix = (int)bcsub($seconds, '11644473600');
    } else {
        $unix = (int)floor(((float)$ft) / 10000000.0 - 11644473600);
    }
    if ($unix <= 0) {
        return null;
    }
    return gmdate('c', $unix);
}

/** Decode AD userAccountControl bit flags into human-readable status. */
function ldapDecodeUserAccountControl($uacRaw): array {
    $uac = (int)$uacRaw;
    $flags = [];
    $map = [
        0x0001 => 'SCRIPT',
        0x0002 => 'ACCOUNTDISABLE',
        0x0008 => 'HOMEDIR_REQUIRED',
        0x0010 => 'LOCKOUT',
        0x0020 => 'PASSWD_NOTREQD',
        0x0040 => 'PASSWD_CANT_CHANGE',
        0x0080 => 'ENCRYPTED_TEXT_PWD_ALLOWED',
        0x0100 => 'TEMP_DUPLICATE_ACCOUNT',
        0x0200 => 'NORMAL_ACCOUNT',
        0x0800 => 'INTERDOMAIN_TRUST_ACCOUNT',
        0x1000 => 'WORKSTATION_TRUST_ACCOUNT',
        0x2000 => 'SERVER_TRUST_ACCOUNT',
        0x10000 => 'DONT_EXPIRE_PASSWORD',
        0x20000 => 'MNS_LOGON_ACCOUNT',
        0x40000 => 'SMARTCARD_REQUIRED',
        0x80000 => 'TRUSTED_FOR_DELEGATION',
        0x100000 => 'NOT_DELEGATED',
        0x200000 => 'USE_DES_KEY_ONLY',
        0x400000 => 'DONT_REQ_PREAUTH',
        0x800000 => 'PASSWORD_EXPIRED',
        0x1000000 => 'TRUSTED_TO_AUTH_FOR_DELEGATION',
    ];
    foreach ($map as $bit => $name) {
        if (($uac & $bit) === $bit) {
            $flags[] = $name;
        }
    }
    return [
        'raw' => $uac,
        'flags' => $flags,
        'disabled' => ($uac & 0x0002) === 0x0002,
        'password_never_expires' => ($uac & 0x10000) === 0x10000,
        'password_expired' => ($uac & 0x800000) === 0x800000,
        'normal_account' => ($uac & 0x0200) === 0x0200,
    ];
}

/**
 * Admin: look up a single LDAP user by username and return directory details.
 */
function handleGetLdapUserDetail() {
    try {
        requireAdmin();

        $data = getJSONInput();
        if ($data === null) {
            sendJSON(['error' => 'Invalid JSON input'], 400);
            return;
        }

        $username = trim($data['username'] ?? '');
        if ($username === '') {
            sendJSON(['error' => 'Username is required'], 400);
            return;
        }

        $db = getDB();
        $stmt = $db->prepare("SELECT key, value FROM settings WHERE key LIKE 'ldap_%'");
        $stmt->execute();
        $settings = [];
        foreach ($stmt->fetchAll() as $row) {
            $settings[$row['key']] = $row['value'];
        }

        if (empty($settings['ldap_enabled']) || $settings['ldap_enabled'] != '1') {
            sendJSON(['error' => 'LDAP is not enabled'], 400);
            return;
        }
        if (!extension_loaded('ldap')) {
            sendJSON(['error' => 'LDAP extension is not loaded'], 500);
            return;
        }

        $server = trim($settings['ldap_server'] ?? '');
        $port = (int)($settings['ldap_port'] ?? 389);
        $protocol = trim($settings['ldap_protocol'] ?? 'ldap');
        $tls = !empty($settings['ldap_tls']) && $settings['ldap_tls'] == '1';
        $timeout = (int)($settings['ldap_timeout'] ?? 30);
        if ($server === '') {
            sendJSON(['error' => 'LDAP server is not configured'], 400);
            return;
        }

        $prefix = ($protocol === 'ldaps') ? 'ldaps://' : 'ldap://';
        $uri = $prefix . $server . ':' . $port;
        $ldap = @ldap_connect($uri);
        if (!$ldap) {
            sendJSON(['error' => 'Failed to connect to LDAP server at ' . $uri, 'details' => ['uri' => $uri]], 500);
            return;
        }

        ldap_set_option($ldap, LDAP_OPT_PROTOCOL_VERSION, 3);
        ldap_set_option($ldap, LDAP_OPT_REFERRALS, 0);
        ldap_set_option($ldap, LDAP_OPT_NETWORK_TIMEOUT, $timeout);
        ldap_set_option($ldap, LDAP_OPT_TIMELIMIT, $timeout);

        if ($tls && $protocol !== 'ldaps') {
            if (!@ldap_start_tls($ldap)) {
                $details = ldapCollectDiagnostics($ldap, ['uri' => $uri, 'step' => 'start_tls']);
                @ldap_close($ldap);
                sendJSON(['error' => 'TLS start failed: ' . ($details['ldap_error'] ?: 'unknown'), 'details' => $details], 500);
                return;
            }
        }

        $bindDn = trim($settings['ldap_bind_dn'] ?? '');
        $bindPass = $settings['ldap_bind_password'] ?? '';
        if (!empty($bindPass)) {
            $isEncrypted = (strpos($bindPass, '.') !== false && substr_count($bindPass, '.') === 2);
            if ($isEncrypted) {
                try {
                    $bindPass = decryptPassword($bindPass);
                } catch (Exception $e) {
                    error_log('LDAP detail: Failed to decrypt bind password: ' . $e->getMessage());
                    $bindPass = '';
                }
            }
        }

        $bound = false;
        if ($bindDn !== '' && $bindPass !== '') {
            $bound = @ldap_bind($ldap, $bindDn, $bindPass);
        } else {
            $bound = @ldap_bind($ldap);
        }
        if (!$bound) {
            $details = ldapCollectDiagnostics($ldap, [
                'uri' => $uri,
                'step' => 'bind',
                'bind_dn' => $bindDn !== '' ? $bindDn : '(anonymous)',
            ]);
            @ldap_close($ldap);
            sendJSON(['error' => 'LDAP bind failed: ' . ($details['ldap_error'] ?: 'unknown'), 'details' => $details], 500);
            return;
        }

        $searchBase = trim($settings['ldap_user_search_base'] ?? '');
        if ($searchBase === '') {
            @ldap_close($ldap);
            sendJSON(['error' => 'LDAP user search base is not configured'], 400);
            return;
        }

        $safe = ldapEscapeFilterValue($username);
        $filterAttempts = [
            ['name' => 'ad_user_exact', 'filter' => '(&(objectCategory=person)(objectClass=user)(sAMAccountName=' . $safe . '))'],
            ['name' => 'samaccount_exact', 'filter' => '(sAMAccountName=' . $safe . ')'],
            ['name' => 'anr_exact', 'filter' => '(&(objectCategory=person)(objectClass=user)(anr=' . $safe . '))'],
        ];
        $filterTemplate = trim($settings['ldap_user_filter'] ?? '');
        if ($filterTemplate !== '' && strpos($filterTemplate, '{username}') !== false) {
            array_unshift($filterAttempts, [
                'name' => 'configured_login_filter',
                'filter' => str_replace('{username}', $safe, $filterTemplate),
            ]);
        }

        $attributes = [
            'sAMAccountName', 'userPrincipalName', 'mail', 'displayName', 'cn', 'givenName', 'sn',
            'title', 'department', 'company', 'manager', 'telephoneNumber', 'mobile',
            'physicalDeliveryOfficeName', 'memberOf', 'userAccountControl', 'lockoutTime',
            'pwdLastSet', 'accountExpires', 'lastLogonTimestamp', 'whenCreated', 'whenChanged',
            'distinguishedName', 'description', 'employeeID', 'employeeNumber',
        ];

        $searchScope = strtolower($settings['ldap_search_scope'] ?? 'sub');
        $result = false;
        $usedFilter = null;
        $attemptErrors = [];

        foreach ($filterAttempts as $attempt) {
            $filter = $attempt['filter'];
            if ($searchScope === 'base') {
                $result = @ldap_read($ldap, $searchBase, $filter, $attributes, 0, 5, $timeout);
            } elseif ($searchScope === 'one') {
                $result = @ldap_list($ldap, $searchBase, $filter, $attributes, 0, 5, $timeout);
            } else {
                $result = @ldap_search($ldap, $searchBase, $filter, $attributes, 0, 5, $timeout);
            }
            if ($result !== false) {
                $entries = @ldap_get_entries($ldap, $result);
                if ($entries !== false && isset($entries['count']) && (int)$entries['count'] > 0) {
                    $usedFilter = $filter;
                    break;
                }
                $result = false;
            }
            $attemptErrors[] = ldapCollectDiagnostics($ldap, [
                'attempt' => $attempt['name'],
                'filter' => $filter,
            ]);
        }

        if ($result === false) {
            $details = ldapCollectDiagnostics($ldap, [
                'uri' => $uri,
                'search_base' => $searchBase,
                'search_scope' => $searchScope,
                'username' => $username,
                'step' => 'search',
                'attempts' => $attemptErrors,
                'hint' => 'User not found in LDAP or search failed. Confirm sAMAccountName matches LinkNest username.',
            ]);
            @ldap_close($ldap);
            sendJSON([
                'error' => 'LDAP user not found or search failed: ' . ($details['ldap_error'] ?: 'no results'),
                'details' => $details,
            ], 404);
            return;
        }

        $entries = @ldap_get_entries($ldap, $result);
        @ldap_close($ldap);

        if ($entries === false || !isset($entries['count']) || (int)$entries['count'] < 1) {
            sendJSON(['error' => 'LDAP user not found', 'details' => ['username' => $username]], 404);
            return;
        }

        // Prefer exact sAMAccountName match when ANR returns multiple
        $entry = $entries[0];
        $usernameLower = strtolower($username);
        for ($i = 0; $i < (int)$entries['count']; $i++) {
            $sam = strtolower(ldapEntryAttrFirst($entries[$i], 'sAMAccountName'));
            if ($sam === $usernameLower) {
                $entry = $entries[$i];
                break;
            }
        }

        $uac = ldapDecodeUserAccountControl(ldapEntryAttrFirst($entry, 'userAccountControl') ?: '0');
        $lockoutIso = ldapFileTimeToIso(ldapEntryAttrFirst($entry, 'lockoutTime'));
        $isLocked = $lockoutIso !== null;

        $memberDns = ldapEntryAttrAll($entry, 'memberOf');
        $groups = [];
        foreach ($memberDns as $dn) {
            $groups[] = [
                'cn' => ldapCnFromDn($dn),
                'dn' => $dn,
            ];
        }
        usort($groups, function ($a, $b) {
            return strcasecmp($a['cn'], $b['cn']);
        });

        $managerDn = ldapEntryAttrFirst($entry, 'manager');
        $accountExpiresRaw = ldapEntryAttrFirst($entry, 'accountExpires');
        $accountExpiresIso = ldapFileTimeToIso($accountExpiresRaw);
        $accountNeverExpires = ($accountExpiresRaw === '' || $accountExpiresRaw === '0' || $accountExpiresRaw === '9223372036854775807');

        $detail = [
            'found' => true,
            'dn' => $entry['dn'] ?? '',
            'cn' => ldapEntryAttrFirst($entry, 'cn'),
            'username' => ldapEntryAttrFirst($entry, 'sAMAccountName') ?: $username,
            'userPrincipalName' => ldapEntryAttrFirst($entry, 'userPrincipalName'),
            'displayName' => ldapEntryAttrFirst($entry, 'displayName'),
            'givenName' => ldapEntryAttrFirst($entry, 'givenName'),
            'sn' => ldapEntryAttrFirst($entry, 'sn'),
            'email' => ldapEntryAttrFirst($entry, 'mail'),
            'description' => ldapEntryAttrFirst($entry, 'description'),
            'title' => ldapEntryAttrFirst($entry, 'title'),
            'department' => ldapEntryAttrFirst($entry, 'department'),
            'company' => ldapEntryAttrFirst($entry, 'company'),
            'office' => ldapEntryAttrFirst($entry, 'physicalDeliveryOfficeName'),
            'telephone' => ldapEntryAttrFirst($entry, 'telephoneNumber'),
            'mobile' => ldapEntryAttrFirst($entry, 'mobile'),
            'employeeId' => ldapEntryAttrFirst($entry, 'employeeID'),
            'employeeNumber' => ldapEntryAttrFirst($entry, 'employeeNumber'),
            'manager' => $managerDn !== '' ? [
                'cn' => ldapCnFromDn($managerDn),
                'dn' => $managerDn,
            ] : null,
            'account' => [
                'disabled' => $uac['disabled'],
                'locked' => $isLocked,
                'lockoutTime' => $lockoutIso,
                'passwordNeverExpires' => $uac['password_never_expires'],
                'passwordExpired' => $uac['password_expired'],
                'pwdLastSet' => ldapFileTimeToIso(ldapEntryAttrFirst($entry, 'pwdLastSet')),
                'accountExpires' => $accountNeverExpires ? null : $accountExpiresIso,
                'accountNeverExpires' => $accountNeverExpires,
                'lastLogonTimestamp' => ldapFileTimeToIso(ldapEntryAttrFirst($entry, 'lastLogonTimestamp')),
                'whenCreated' => ldapEntryAttrFirst($entry, 'whenCreated') ?: null,
                'whenChanged' => ldapEntryAttrFirst($entry, 'whenChanged') ?: null,
                'userAccountControl' => $uac,
            ],
            'groups' => $groups,
            'groupCount' => count($groups),
            'meta' => [
                'filter' => $usedFilter,
                'uri' => $uri,
                'search_base' => $searchBase,
            ],
        ];

        sendJSON(['success' => true, 'user' => $detail]);
    } catch (Exception $e) {
        sendJSON(['error' => 'LDAP user detail error: ' . $e->getMessage(), 'details' => ['exception' => $e->getMessage()]], 500);
    } catch (Error $e) {
        sendJSON(['error' => 'LDAP user detail fatal error: ' . $e->getMessage(), 'details' => ['fatal' => $e->getMessage()]], 500);
    }
}

function handleAddLocalUser() {
    requireAdmin(); // Only admins can add users
    
    $data = getJSONInput();
    
    if (!isset($data['username']) || !isset($data['email']) || !isset($data['password'])) {
        sendJSON(['error' => 'Username, email, and password are required'], 400);
    }
    
    $username = trim($data['username'] ?? '');
    $email = trim($data['email'] ?? '');
    $password = $data['password'] ?? '';
    
    if (empty($username)) {
        sendJSON(['error' => 'Username is required'], 400);
    }
    
    if (strlen($username) < 3) {
        sendJSON(['error' => 'Username must be at least 3 characters'], 400);
    }
    
    if (empty($email)) {
        sendJSON(['error' => 'Email is required'], 400);
    }
    
    // Allow @localhost for local users, otherwise validate normally
    $emailLower = strtolower($email);
    $isLocalhostEmail = strpos($emailLower, '@localhost') !== false;
    if (!$isLocalhostEmail && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendJSON(['error' => 'Invalid email address'], 400);
    }
    
    if (empty($password)) {
        sendJSON(['error' => 'Password is required'], 400);
    }
    $err = validatePasswordStrength($password);
    if ($err !== null) {
        sendJSON(['error' => $err], 400);
    }
    
    $db = getDB();
    
    // Check if username exists (case-insensitive)
    $stmt = $db->prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)');
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
    
    // Create user (unapproved by default, as per requirement)
    $passwordHash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $db->prepare('INSERT INTO users (username, email, password_hash, is_admin, is_approved, auth_source, created_at) VALUES (?, ?, ?, 0, 0, ?, ?)');
    
    if ($stmt->execute([$username, $email, $passwordHash, 'local', time()])) {
        $userId = $db->lastInsertId();
        sendJSON([
            'success' => true,
            'message' => 'Local user created successfully. User is pending admin approval.',
            'user' => [
                'id' => $userId,
                'username' => $username,
                'email' => $email,
                'auth_source' => 'local',
                'is_approved' => false
            ]
        ]);
    } else {
        sendJSON(['error' => 'Failed to create user'], 500);
    }
}

function handleAddLdapUser() {
    requireAdmin(); // Only admins can add LDAP users
    
    $data = getJSONInput();
    
    if (!isset($data['username']) || !isset($data['dn'])) {
        sendJSON(['error' => 'Username and DN are required'], 400);
    }
    
    $username = trim($data['username']);
    $email = trim($data['email'] ?? '');
    $dn = trim($data['dn']);
    $displayName = trim($data['displayName'] ?? '');
    
    if (strlen($username) < 1) {
        sendJSON(['error' => 'Username is required'], 400);
    }
    
    // Load LDAP settings early (needed for email synthesis and verification)
    $db = getDB();
    $stmt = $db->prepare("SELECT key, value FROM settings WHERE key LIKE 'ldap_%'");
    $stmt->execute();
    $settings = [];
    foreach ($stmt->fetchAll() as $row) {
        $settings[$row['key']] = $row['value'];
    }
    
    // Synthesize email when LDAP mail is missing so short/service accounts can still be added
    if ($email === '') {
        $domain = trim($settings['ldap_login_domain'] ?? '');
        if ($domain === '') {
            $domain = 'ldap.local';
        }
        $email = $username . '@' . $domain;
    }
    
    // Allow @localhost for local users, otherwise validate normally
    $emailLower = strtolower($email);
    $isLocalhostEmail = strpos($emailLower, '@localhost') !== false;
    if (!$isLocalhostEmail && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendJSON(['error' => 'Invalid email address'], 400);
    }
    
    $ldapEnabled = !empty($settings['ldap_enabled']) && $settings['ldap_enabled'] == '1';
    
    if (!$ldapEnabled) {
        sendJSON(['error' => 'LDAP is not enabled'], 400);
    }
    
    if (!extension_loaded('ldap')) {
        sendJSON(['error' => 'LDAP extension is not loaded'], 500);
    }
    
    try {
        // Connect to LDAP and verify user exists
        $server = trim($settings['ldap_server'] ?? '');
        $port = (int)($settings['ldap_port'] ?? 389);
        $protocol = trim($settings['ldap_protocol'] ?? 'ldap');
        $tls = !empty($settings['ldap_tls']);
        $timeout = (int)($settings['ldap_timeout'] ?? 30);
        
        $prefix = ($protocol === 'ldaps') ? 'ldaps://' : 'ldap://';
        $uri = $prefix . $server . ':' . $port;
        
        $ldap = @ldap_connect($uri);
        if (!$ldap) {
            sendJSON(['error' => 'Failed to connect to LDAP server'], 500);
        }
        
        ldap_set_option($ldap, LDAP_OPT_PROTOCOL_VERSION, 3);
        $followReferrals = !empty($settings['ldap_referrals']) && $settings['ldap_referrals'] == '1';
        ldap_set_option($ldap, LDAP_OPT_REFERRALS, $followReferrals ? 1 : 0);
        ldap_set_option($ldap, LDAP_OPT_NETWORK_TIMEOUT, $timeout);
        
        if ($tls && $protocol !== 'ldaps') {
            if (!@ldap_start_tls($ldap)) {
                @ldap_close($ldap);
                sendJSON(['error' => 'TLS start failed: ' . ldap_error($ldap)], 500);
            }
        }
        
        // Bind with service account
        $bindDn = trim($settings['ldap_bind_dn'] ?? '');
        $bindPass = $settings['ldap_bind_password'] ?? '';
        
        // Decrypt password if it's encrypted (handles both encrypted and plain text for backward compatibility)
        if (!empty($bindPass)) {
            // Check if password is encrypted (contains dots in format: base64.base64.base64)
            $isEncrypted = (strpos($bindPass, '.') !== false && substr_count($bindPass, '.') === 2);
            if ($isEncrypted) {
                try {
                    $bindPass = decryptPassword($bindPass);
                } catch (Exception $e) {
                    error_log("LDAP: Failed to decrypt bind password: " . $e->getMessage());
                    error_log("LDAP: DB_PATH: " . (defined('DB_PATH') ? DB_PATH : 'not defined'));
                    // If decryption fails, clear the password to prevent using corrupted data
                    $bindPass = '';
                }
            }
        }
        
        $bound = false;
        if (!empty($bindDn) && !empty($bindPass)) {
            $bound = @ldap_bind($ldap, $bindDn, $bindPass);
        } else {
            $bound = @ldap_bind($ldap);
        }
        
        if (!$bound) {
            @ldap_close($ldap);
            sendJSON(['error' => 'LDAP bind failed: ' . ldap_error($ldap)], 500);
        }
        
        // Verify user exists by reading the DN
        $attributes = ['sAMAccountName', 'mail', 'displayName', 'userPrincipalName'];
        $result = @ldap_read($ldap, $dn, '(objectClass=*)', $attributes);
        
        if ($result === false) {
            @ldap_close($ldap);
            sendJSON(['error' => 'User not found in LDAP directory'], 404);
        }
        
        $entries = @ldap_get_entries($ldap, $result);
        @ldap_close($ldap);
        
        if ($entries === false || $entries['count'] === 0) {
            sendJSON(['error' => 'User not found in LDAP directory'], 404);
        }
        
        // User verified in LDAP, now add to database
        $db = getDB();
        
        // Check if username exists (case-insensitive)
        $stmt = $db->prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)');
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
        
        // Create user (unapproved by default, as per requirement)
        // Use a random password hash since they should login via LDAP
        $randomPass = bin2hex(random_bytes(16));
        $passwordHash = password_hash($randomPass, PASSWORD_DEFAULT);
        
        $stmt = $db->prepare('INSERT INTO users (username, email, password_hash, is_admin, is_approved, auth_source, created_at) VALUES (?, ?, ?, 0, 0, ?, ?)');
        
        if ($stmt->execute([$username, $email, $passwordHash, 'ldap', time()])) {
            $userId = $db->lastInsertId();
            sendJSON([
                'success' => true,
                'message' => 'LDAP user added successfully. User is pending admin approval.',
                'user' => [
                    'id' => $userId,
                    'username' => $username,
                    'email' => $email,
                    'auth_source' => 'ldap',
                    'is_approved' => false
                ]
            ]);
        } else {
            sendJSON(['error' => 'Failed to create user'], 500);
        }
        
    } catch (Exception $e) {
        sendJSON(['error' => 'LDAP error: ' . $e->getMessage()], 500);
    }
}

function handleBulkImportLocalUsers() {
    requireAdmin(); // Only admins can bulk import users
    
    if (!isset($_FILES['csv_file']) || $_FILES['csv_file']['error'] !== UPLOAD_ERR_OK) {
        sendJSON(['error' => 'CSV file is required'], 400);
    }
    
    $file = $_FILES['csv_file'];
    
    // Validate file type
    $allowedTypes = ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'];
    $fileExtension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    
    if (!in_array($file['type'], $allowedTypes) && $fileExtension !== 'csv') {
        sendJSON(['error' => 'Invalid file type. Please upload a CSV file.'], 400);
    }
    
    // Read CSV file
    $handle = fopen($file['tmp_name'], 'r');
    if ($handle === false) {
        sendJSON(['error' => 'Failed to read CSV file'], 500);
    }
    
    $users = [];
    $lineNumber = 0;
    $headerSkipped = false;
    
    while (($row = fgetcsv($handle)) !== false) {
        $lineNumber++;
        
        // Skip empty rows
        if (empty(array_filter($row))) {
            continue;
        }
        
        // Skip header row if it exists (check for common header values)
        if (!$headerSkipped && (strtolower(trim($row[0] ?? '')) === 'username' || 
                                strtolower(trim($row[0] ?? '')) === 'user' ||
                                strtolower(trim($row[1] ?? '')) === 'email')) {
            $headerSkipped = true;
            continue;
        }
        
        // Validate row has at least 3 columns (username, email, password)
        if (count($row) < 3) {
            continue; // Skip invalid rows
        }
        
        $username = trim($row[0] ?? '');
        $email = trim($row[1] ?? '');
        $password = trim($row[2] ?? '');
        
        // Validate required fields
        if (empty($username) || empty($email) || empty($password)) {
            continue; // Skip rows with missing data
        }
        
        // Validate username length
        if (strlen($username) < 3) {
            continue; // Skip invalid usernames
        }
        
        // Validate email format
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            continue; // Skip invalid emails
        }
        
        // Validate password strength (8+ chars, 1 upper, 1 number, 1 special)
        if (validatePasswordStrength($password) !== null) {
            continue; // Skip invalid passwords
        }
        
        $users[] = [
            'username' => $username,
            'email' => $email,
            'password' => $password,
            'line' => $lineNumber
        ];
    }
    
    fclose($handle);
    
    if (empty($users)) {
        sendJSON(['error' => 'No valid users found in CSV file'], 400);
    }
    
    $db = getDB();
    $results = [
        'success' => [],
        'errors' => [],
        'skipped' => []
    ];
    
    foreach ($users as $userData) {
        $username = $userData['username'];
        $email = $userData['email'];
        $password = $userData['password'];
        $line = $userData['line'];
        
        try {
            // Check if username exists (case-insensitive)
            $stmt = $db->prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)');
            $stmt->execute([$username]);
            if ($stmt->fetch()) {
                $results['skipped'][] = [
                    'line' => $line,
                    'username' => $username,
                    'reason' => 'Username already exists'
                ];
                continue;
            }
            
            // Check if email exists
            $stmt = $db->prepare('SELECT id FROM users WHERE email = ?');
            $stmt->execute([$email]);
            if ($stmt->fetch()) {
                $results['skipped'][] = [
                    'line' => $line,
                    'username' => $username,
                    'reason' => 'Email already exists'
                ];
                continue;
            }
            
            // Create user
            $passwordHash = password_hash($password, PASSWORD_DEFAULT);
            $stmt = $db->prepare('INSERT INTO users (username, email, password_hash, is_admin, is_approved, auth_source, created_at) VALUES (?, ?, ?, 0, 0, ?, ?)');
            
            if ($stmt->execute([$username, $email, $passwordHash, 'local', time()])) {
                $results['success'][] = [
                    'line' => $line,
                    'username' => $username,
                    'email' => $email
                ];
            } else {
                $results['errors'][] = [
                    'line' => $line,
                    'username' => $username,
                    'reason' => 'Database error'
                ];
            }
        } catch (Exception $e) {
            $results['errors'][] = [
                'line' => $line,
                'username' => $username,
                'reason' => $e->getMessage()
            ];
        }
    }
    
    $totalProcessed = count($results['success']) + count($results['errors']) + count($results['skipped']);
    
    sendJSON([
        'success' => true,
        'message' => "Processed $totalProcessed users. " . count($results['success']) . " created, " . count($results['skipped']) . " skipped, " . count($results['errors']) . " errors.",
        'results' => $results,
        'summary' => [
            'total' => $totalProcessed,
            'created' => count($results['success']),
            'skipped' => count($results['skipped']),
            'errors' => count($results['errors'])
        ]
    ]);
}

function handleBulkImportLdapUsers() {
    requireAdmin(); // Only admins can bulk import LDAP users
    
    $data = getJSONInput();
    
    if (!isset($data['users']) || !is_array($data['users']) || empty($data['users'])) {
        sendJSON(['error' => 'Users array is required'], 400);
    }
    
    $users = $data['users'];
    
    // Validate LDAP is enabled
    $db = getDB();
    $stmt = $db->prepare("SELECT key, value FROM settings WHERE key LIKE 'ldap_%'");
    $stmt->execute();
    $settings = [];
    foreach ($stmt->fetchAll() as $row) {
        $settings[$row['key']] = $row['value'];
    }
    
    $ldapEnabled = !empty($settings['ldap_enabled']) && $settings['ldap_enabled'] == '1';
    
    if (!$ldapEnabled) {
        sendJSON(['error' => 'LDAP is not enabled'], 400);
    }
    
    if (!extension_loaded('ldap')) {
        sendJSON(['error' => 'LDAP extension is not loaded'], 500);
    }
    
    $results = [
        'success' => [],
        'errors' => [],
        'skipped' => []
    ];
    
    // Connect to LDAP once for all users
    try {
        $server = trim($settings['ldap_server'] ?? '');
        $port = (int)($settings['ldap_port'] ?? 389);
        $protocol = trim($settings['ldap_protocol'] ?? 'ldap');
        $tls = !empty($settings['ldap_tls']);
        $timeout = (int)($settings['ldap_timeout'] ?? 30);
        
        $prefix = ($protocol === 'ldaps') ? 'ldaps://' : 'ldap://';
        $uri = $prefix . $server . ':' . $port;
        
        $ldap = @ldap_connect($uri);
        if (!$ldap) {
            sendJSON(['error' => 'Failed to connect to LDAP server'], 500);
        }
        
        ldap_set_option($ldap, LDAP_OPT_PROTOCOL_VERSION, 3);
        $followReferrals = !empty($settings['ldap_referrals']) && $settings['ldap_referrals'] == '1';
        ldap_set_option($ldap, LDAP_OPT_REFERRALS, $followReferrals ? 1 : 0);
        ldap_set_option($ldap, LDAP_OPT_NETWORK_TIMEOUT, $timeout);
        
        if ($tls && $protocol !== 'ldaps') {
            if (!@ldap_start_tls($ldap)) {
                @ldap_close($ldap);
                sendJSON(['error' => 'TLS start failed: ' . ldap_error($ldap)], 500);
            }
        }
        
        // Bind with service account
        $bindDn = trim($settings['ldap_bind_dn'] ?? '');
        $bindPass = $settings['ldap_bind_password'] ?? '';
        
        // Decrypt password if it's encrypted (handles both encrypted and plain text for backward compatibility)
        if (!empty($bindPass)) {
            // Check if password is encrypted (contains dots in format: base64.base64.base64)
            $isEncrypted = (strpos($bindPass, '.') !== false && substr_count($bindPass, '.') === 2);
            if ($isEncrypted) {
                try {
                    $bindPass = decryptPassword($bindPass);
                } catch (Exception $e) {
                    error_log("LDAP: Failed to decrypt bind password: " . $e->getMessage());
                    error_log("LDAP: DB_PATH: " . (defined('DB_PATH') ? DB_PATH : 'not defined'));
                    // If decryption fails, clear the password to prevent using corrupted data
                    $bindPass = '';
                }
            }
        }
        
        $bound = false;
        if (!empty($bindDn) && !empty($bindPass)) {
            $bound = @ldap_bind($ldap, $bindDn, $bindPass);
        } else {
            $bound = @ldap_bind($ldap);
        }
        
        if (!$bound) {
            @ldap_close($ldap);
            sendJSON(['error' => 'LDAP bind failed: ' . ldap_error($ldap)], 500);
        }
    } catch (Exception $e) {
        sendJSON(['error' => 'LDAP connection error: ' . $e->getMessage()], 500);
    }
    
    // Process each user
    foreach ($users as $index => $userData) {
        $username = trim($userData['username'] ?? '');
        $email = trim($userData['email'] ?? '');
        $dn = trim($userData['dn'] ?? '');
        $displayName = trim($userData['displayName'] ?? '');
        
        // Validate required fields
        if (empty($username) || empty($email) || empty($dn)) {
            $results['errors'][] = [
                'index' => $index + 1,
                'username' => $username ?: 'N/A',
                'reason' => 'Missing required fields (username, email, or DN)'
            ];
            continue;
        }
        
        // Validate email format
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $results['errors'][] = [
                'index' => $index + 1,
                'username' => $username,
                'reason' => 'Invalid email address'
            ];
            continue;
        }
        
        try {
            // Check if username exists in database (case-insensitive)
            $stmt = $db->prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)');
            $stmt->execute([$username]);
            if ($stmt->fetch()) {
                $results['skipped'][] = [
                    'index' => $index + 1,
                    'username' => $username,
                    'reason' => 'Username already exists'
                ];
                continue;
            }
            
            // Check if email exists in database
            $stmt = $db->prepare('SELECT id FROM users WHERE email = ?');
            $stmt->execute([$email]);
            if ($stmt->fetch()) {
                $results['skipped'][] = [
                    'index' => $index + 1,
                    'username' => $username,
                    'reason' => 'Email already exists'
                ];
                continue;
            }
            
            // Verify user exists in LDAP
            $attributes = ['sAMAccountName', 'mail', 'displayName', 'userPrincipalName'];
            $result = @ldap_read($ldap, $dn, '(objectClass=*)', $attributes);
            
            if ($result === false) {
                $results['errors'][] = [
                    'index' => $index + 1,
                    'username' => $username,
                    'reason' => 'User not found in LDAP directory'
                ];
                continue;
            }
            
            $entries = @ldap_get_entries($ldap, $result);
            
            if ($entries === false || $entries['count'] === 0) {
                $results['errors'][] = [
                    'index' => $index + 1,
                    'username' => $username,
                    'reason' => 'User not found in LDAP directory'
                ];
                continue;
            }
            
            // Create user in database
            $randomPass = bin2hex(random_bytes(16));
            $passwordHash = password_hash($randomPass, PASSWORD_DEFAULT);
            
            $stmt = $db->prepare('INSERT INTO users (username, email, password_hash, is_admin, is_approved, auth_source, created_at) VALUES (?, ?, ?, 0, 0, ?, ?)');
            
            if ($stmt->execute([$username, $email, $passwordHash, 'ldap', time()])) {
                $results['success'][] = [
                    'index' => $index + 1,
                    'username' => $username,
                    'email' => $email
                ];
            } else {
                $results['errors'][] = [
                    'index' => $index + 1,
                    'username' => $username,
                    'reason' => 'Database error'
                ];
            }
        } catch (Exception $e) {
            $results['errors'][] = [
                'index' => $index + 1,
                'username' => $username,
                'reason' => $e->getMessage()
            ];
        }
    }
    
    @ldap_close($ldap);
    
    $totalProcessed = count($results['success']) + count($results['errors']) + count($results['skipped']);
    
    sendJSON([
        'success' => true,
        'message' => "Processed $totalProcessed users. " . count($results['success']) . " created, " . count($results['skipped']) . " skipped, " . count($results['errors']) . " errors.",
        'results' => $results,
        'summary' => [
            'total' => $totalProcessed,
            'created' => count($results['success']),
            'skipped' => count($results['skipped']),
            'errors' => count($results['errors'])
        ]
    ]);
}

function handleBulkImportSamlUsers() {
    requireAdmin(); // Only admins can bulk import SAML users
    
    if (!isset($_FILES['csv_file']) || $_FILES['csv_file']['error'] !== UPLOAD_ERR_OK) {
        sendJSON(['error' => 'CSV file is required'], 400);
    }
    
    $file = $_FILES['csv_file'];
    
    // Validate file type
    $allowedTypes = ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'];
    $fileExtension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    
    if (!in_array($file['type'], $allowedTypes) && $fileExtension !== 'csv') {
        sendJSON(['error' => 'Invalid file type. Please upload a CSV file.'], 400);
    }
    
    // Read CSV file
    $handle = fopen($file['tmp_name'], 'r');
    if ($handle === false) {
        sendJSON(['error' => 'Failed to read CSV file'], 500);
    }
    
    $users = [];
    $lineNumber = 0;
    $headerSkipped = false;
    
    while (($row = fgetcsv($handle)) !== false) {
        $lineNumber++;
        
        // Skip empty rows
        if (empty(array_filter($row))) {
            continue;
        }
        
        // Skip header row if it exists
        if (!$headerSkipped && (strtolower(trim($row[0] ?? '')) === 'username' || 
                                strtolower(trim($row[0] ?? '')) === 'user' ||
                                strtolower(trim($row[1] ?? '')) === 'email')) {
            $headerSkipped = true;
            continue;
        }
        
        // Validate row has at least 3 columns (username, email, saml_nameid)
        if (count($row) < 3) {
            continue; // Skip invalid rows
        }
        
        $username = trim($row[0] ?? '');
        $email = trim($row[1] ?? '');
        $samlNameId = trim($row[2] ?? '');
        $displayName = trim($row[3] ?? $username); // Optional, defaults to username
        
        // Validate required fields
        if (empty($username) || empty($email) || empty($samlNameId)) {
            continue; // Skip rows with missing data
        }
        
        // Validate username length
        if (strlen($username) < 3) {
            continue; // Skip invalid usernames
        }
        
        // Validate email format (allow @localhost for local users)
        $emailLower = strtolower($email);
        $isLocalhostEmail = strpos($emailLower, '@localhost') !== false;
        if (!$isLocalhostEmail && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            continue; // Skip invalid emails
        }
        
        $users[] = [
            'username' => $username,
            'email' => $email,
            'saml_nameid' => $samlNameId,
            'displayName' => $displayName,
            'line' => $lineNumber
        ];
    }
    
    fclose($handle);
    
    if (empty($users)) {
        sendJSON(['error' => 'No valid users found in CSV file'], 400);
    }
    
    $db = getDB();
    $results = [
        'success' => [],
        'errors' => [],
        'skipped' => []
    ];
    
    foreach ($users as $userData) {
        $username = $userData['username'];
        $email = $userData['email'];
        $samlNameId = $userData['saml_nameid'];
        $displayName = $userData['displayName'];
        $line = $userData['line'];
        
        try {
            // Check if username exists (case-insensitive)
            $stmt = $db->prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)');
            $stmt->execute([$username]);
            if ($stmt->fetch()) {
                $results['skipped'][] = [
                    'line' => $line,
                    'username' => $username,
                    'reason' => 'Username already exists'
                ];
                continue;
            }
            
            // Check if email exists
            $stmt = $db->prepare('SELECT id FROM users WHERE email = ?');
            $stmt->execute([$email]);
            if ($stmt->fetch()) {
                $results['skipped'][] = [
                    'line' => $line,
                    'username' => $username,
                    'reason' => 'Email already exists'
                ];
                continue;
            }
            
            // Check if saml_nameid already exists
            try {
                $stmt = $db->prepare('SELECT id FROM users WHERE saml_nameid = ?');
                $stmt->execute([$samlNameId]);
                if ($stmt->fetch()) {
                    $results['skipped'][] = [
                        'line' => $line,
                        'username' => $username,
                        'reason' => 'SAML NameID already exists'
                    ];
                    continue;
                }
            } catch (PDOException $e) {
                // Column might not exist, continue
            }
            
            // Create user with SAML auth_source
            // Use random password hash since SAML users don't have local passwords
            $passwordHash = password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT);
            
            try {
                $stmt = $db->prepare('INSERT INTO users (username, email, password_hash, is_admin, is_approved, auth_source, saml_nameid, created_at) VALUES (?, ?, ?, 0, 0, ?, ?, ?)');
                $stmt->execute([$username, $email, $passwordHash, 'saml', $samlNameId, time()]);
            } catch (PDOException $e) {
                // If saml_nameid column doesn't exist, insert without it
                $stmt = $db->prepare('INSERT INTO users (username, email, password_hash, is_admin, is_approved, auth_source, created_at) VALUES (?, ?, ?, 0, 0, ?, ?)');
                $stmt->execute([$username, $email, $passwordHash, 'saml', time()]);
            }
            
            if ($stmt->rowCount() > 0) {
                $results['success'][] = [
                    'line' => $line,
                    'username' => $username,
                    'email' => $email
                ];
            } else {
                $results['errors'][] = [
                    'line' => $line,
                    'username' => $username,
                    'reason' => 'Database error'
                ];
            }
        } catch (Exception $e) {
            $results['errors'][] = [
                'line' => $line,
                'username' => $username,
                'reason' => $e->getMessage()
            ];
        }
    }
    
    $totalProcessed = count($results['success']) + count($results['errors']) + count($results['skipped']);
    
    sendJSON([
        'success' => true,
        'message' => "Processed $totalProcessed users. " . count($results['success']) . " created, " . count($results['skipped']) . " skipped, " . count($results['errors']) . " errors.",
        'results' => $results,
        'summary' => [
            'total' => $totalProcessed,
            'created' => count($results['success']),
            'skipped' => count($results['skipped']),
            'errors' => count($results['errors'])
        ]
    ]);
}

function handleStartImpersonation($targetUserId) {
    // Use real admin for the check: when impersonating, getAuthenticatedUser() returns the impersonated user,
    // so we must use the stored admin ID so impersonation still works (e.g. from Admin Panel in another tab).
    $db = getDB();
    $adminId = $_SESSION['impersonating_admin_id'] ?? $_SESSION['user_id'] ?? null;
    if (!$adminId) {
        sendJSON(['error' => 'Authentication required'], 401);
        exit;
    }
    $stmt = $db->prepare('SELECT id, username, email, is_admin FROM users WHERE id = ?');
    $stmt->execute([$adminId]);
    $adminUser = $stmt->fetch();
    if (!$adminUser || !$adminUser['is_admin']) {
        sendJSON(['error' => 'Admin access required'], 403);
        exit;
    }
    $adminUser['is_admin'] = (bool)$adminUser['is_admin'];

    // Store the original admin ID before starting impersonation (if not already set)
    if (!isset($_SESSION['impersonating_admin_id'])) {
        $_SESSION['impersonating_admin_id'] = (int)$adminUser['id'];
    }
    
    // Check if target user exists
    $stmt = $db->prepare('SELECT id, username, email, is_admin, is_approved FROM users WHERE id = ?');
    $stmt->execute([$targetUserId]);
    $targetUser = $stmt->fetch();
    
    if (!$targetUser) {
        sendJSON(['error' => 'User not found'], 404);
    }
    
    // Prevent impersonating yourself
    if ((int)$targetUserId === (int)$adminUser['id']) {
        sendJSON(['error' => 'You cannot impersonate yourself'], 400);
    }
    
    // Prevent impersonating other admins (security measure)
    if ($targetUser['is_admin']) {
        sendJSON(['error' => 'Cannot impersonate admin users'], 403);
    }
    
    // Set impersonation session variables
    $_SESSION['impersonating_user_id'] = $targetUserId;
    
    // Fetch the target user data
    $userData = [
        'id' => (int)$targetUser['id'],
        'username' => $targetUser['username'],
        'email' => $targetUser['email'],
        'is_admin' => false,
        'is_approved' => (bool)$targetUser['is_approved'],
        'impersonating' => true,
        'impersonating_admin_id' => (int)$_SESSION['impersonating_admin_id'],
        'impersonating_admin_username' => $adminUser['username']
    ];
    
    sendJSON([
        'success' => true,
        'message' => "Now impersonating user: {$targetUser['username']}",
        'user' => $userData
    ]);
}

function handleStopImpersonation() {
    // Check if we're actually impersonating
    if (!isset($_SESSION['impersonating_user_id']) || !isset($_SESSION['impersonating_admin_id'])) {
        sendJSON(['error' => 'Not currently impersonating any user'], 400);
    }
    
    // Get the admin user ID before clearing impersonation
    $adminUserId = $_SESSION['impersonating_admin_id'];
    
    // Restore original user session
    unset($_SESSION['impersonating_user_id']);
    unset($_SESSION['impersonating_admin_id']);
    
    // Get the admin user data
    $db = getDB();
    $stmt = $db->prepare('SELECT id, username, email, is_admin, is_approved FROM users WHERE id = ?');
    $stmt->execute([$adminUserId]);
    $adminUser = $stmt->fetch();
    
    if ($adminUser) {
        $userData = [
            'id' => (int)$adminUser['id'],
            'username' => $adminUser['username'],
            'email' => $adminUser['email'],
            'is_admin' => (bool)$adminUser['is_admin'],
            'is_approved' => (bool)$adminUser['is_approved'],
            'impersonating' => false
        ];
        
        sendJSON([
            'success' => true,
            'message' => 'Impersonation stopped',
            'user' => $userData
        ]);
    } else {
        sendJSON(['error' => 'Admin user not found'], 404);
    }
}

/**
 * Check if a user exists in LDAP directory
 * @param string $username The username to check
 * @return bool True if user exists in LDAP, false otherwise
 */
function checkUserExistsInLdap($username) {
    try {
        $db = getDB();
        $stmt = $db->prepare("SELECT key, value FROM settings WHERE key LIKE 'ldap_%'");
        $stmt->execute();
        $settings = [];
        foreach ($stmt->fetchAll() as $row) {
            $settings[$row['key']] = $row['value'];
        }
        
        // Check if LDAP is enabled
        if (empty($settings['ldap_enabled']) || $settings['ldap_enabled'] !== '1') {
            return false;
        }
        
        $ldapHost = trim($settings['ldap_host'] ?? '');
        $ldapPort = (int)($settings['ldap_port'] ?? 389);
        
        if (empty($ldapHost)) {
            return false;
        }
        
        // Connect to LDAP
        $ldap = @ldap_connect($ldapHost, $ldapPort);
        if (!$ldap) {
            return false;
        }
        
        // Set LDAP options
        ldap_set_option($ldap, LDAP_OPT_PROTOCOL_VERSION, 3);
        ldap_set_option($ldap, LDAP_OPT_REFERRALS, 0);
        ldap_set_option($ldap, LDAP_OPT_NETWORK_TIMEOUT, 5);
        
        // Bind with service account
        $bindDn = trim($settings['ldap_bind_dn'] ?? '');
        $bindPass = $settings['ldap_bind_password'] ?? '';
        
        if (!empty($bindPass)) {
            $isEncrypted = (strpos($bindPass, '.') !== false && substr_count($bindPass, '.') === 2);
            if ($isEncrypted) {
                try {
                    $bindPass = decryptPassword($bindPass);
                } catch (Exception $e) {
                    @ldap_close($ldap);
                    return false;
                }
            }
        }
        
        $bound = false;
        if (!empty($bindDn) && !empty($bindPass)) {
            $bound = @ldap_bind($ldap, $bindDn, $bindPass);
        } else {
            $bound = @ldap_bind($ldap);
        }
        
        if (!$bound) {
            @ldap_close($ldap);
            return false;
        }
        
        // Search for user
        $searchBase = trim($settings['ldap_user_search_base'] ?? '');
        $filterTemplate = trim($settings['ldap_user_filter'] ?? '(sAMAccountName={username})');
        
        if (empty($searchBase)) {
            @ldap_close($ldap);
            return false;
        }
        
        $caseSensitive = !empty($settings['ldap_case_sensitive']) && $settings['ldap_case_sensitive'] == '1';
        $searchUsername = $caseSensitive ? $username : strtolower($username);
        $safeUsername = ldap_escape_filter($searchUsername);
        $filter = str_replace('{username}', $safeUsername, $filterTemplate);
        
        $attributes = ['dn'];
        $searchScope = strtolower($settings['ldap_search_scope'] ?? 'sub');
        
        if ($searchScope === 'base') {
            $result = @ldap_read($ldap, $searchBase, $filter, $attributes, 0, 1);
        } elseif ($searchScope === 'one') {
            $result = @ldap_list($ldap, $searchBase, $filter, $attributes, 0, 1);
        } else {
            $result = @ldap_search($ldap, $searchBase, $filter, $attributes, 0, 1);
        }
        
        if ($result === false) {
            @ldap_close($ldap);
            return false;
        }
        
        $entries = @ldap_get_entries($ldap, $result);
        @ldap_close($ldap);
        
        return ($entries && $entries['count'] > 0);
    } catch (Exception $e) {
        return false;
    }
}

/**
 * Extract domain from email address
 * @param string $email Email address
 * @return string|null Domain part of email or null if invalid
 */
function extractEmailDomain($email) {
    if (empty($email)) {
        return null;
    }
    $parts = explode('@', $email);
    if (count($parts) === 2) {
        return strtolower(trim($parts[1]));
    }
    return null;
}

/**
 * Get LDAP domain from settings
 * @param array $settings LDAP settings array
 * @return string|null LDAP domain or null if not found
 */
/**
 * Get LDAP servers configuration (supports both old single-server and new multi-server format)
 * @param array $settings Settings array from database
 * @return array Array of LDAP server configurations
 */
function getLdapServers($settings) {
    // Check if new multi-server format exists
    if (!empty($settings['ldap_servers'])) {
        $serversJson = $settings['ldap_servers'];
        $servers = json_decode($serversJson, true);
        if (is_array($servers) && !empty($servers)) {
            return $servers;
        }
    }
    
    // Fallback to old single-server format (for backward compatibility)
    $server = trim($settings['ldap_server'] ?? '');
    if (empty($server)) {
        return [];
    }
    
    // Convert old format to new format
    return [[
        'name' => $settings['ldap_login_domain'] ?? $server,
        'server' => $server,
        'port' => (int)($settings['ldap_port'] ?? 389),
        'protocol' => trim($settings['ldap_protocol'] ?? 'ldap'),
        'tls' => !empty($settings['ldap_tls']) && $settings['ldap_tls'] == '1' ? '1' : '0',
        'timeout' => (int)($settings['ldap_timeout'] ?? 30),
        'bind_dn' => trim($settings['ldap_bind_dn'] ?? ''),
        'bind_password' => $settings['ldap_bind_password'] ?? '',
        'user_search_base' => trim($settings['ldap_user_search_base'] ?? ''),
        'user_filter' => trim($settings['ldap_user_filter'] ?? '(sAMAccountName={username})'),
        'user_attributes' => trim($settings['ldap_user_attributes'] ?? 'sAMAccountName,mail,displayName'),
        'group_search_base' => trim($settings['ldap_group_search_base'] ?? ''),
        'group_filter' => trim($settings['ldap_group_filter'] ?? '(objectClass=group)'),
        'group_attributes' => trim($settings['ldap_group_attributes'] ?? 'cn,distinguishedName,member'),
        'require_group_membership' => !empty($settings['ldap_require_group_membership']) && $settings['ldap_require_group_membership'] == '1' ? '1' : '0',
        'required_groups' => trim($settings['ldap_required_groups'] ?? ''),
        'search_scope' => strtolower($settings['ldap_search_scope'] ?? 'sub'),
        'user_dn_template' => trim($settings['ldap_user_dn_template'] ?? ''),
        'nested_groups' => !empty($settings['ldap_nested_groups']) && $settings['ldap_nested_groups'] == '1' ? '1' : '0',
        'case_sensitive' => !empty($settings['ldap_case_sensitive']) && $settings['ldap_case_sensitive'] == '1' ? '1' : '0',
        'ssl_verify' => !isset($settings['ldap_ssl_verify']) || $settings['ldap_ssl_verify'] == '1' ? '1' : '0',
        'connection_retry' => (int)($settings['ldap_connection_retry'] ?? 3),
        'retry_delay' => (int)($settings['ldap_retry_delay'] ?? 1),
        'email_attribute' => trim($settings['ldap_email_attribute'] ?? ''),
        'display_name_attribute' => trim($settings['ldap_display_name_attribute'] ?? ''),
        'referrals' => !empty($settings['ldap_referrals']) && $settings['ldap_referrals'] == '1' ? '1' : '0',
        'login_domain' => trim($settings['ldap_login_domain'] ?? ''),
    ]];
}

function getLdapDomainFromSettings($settings) {
    // Try to extract domain from base DN first
    $baseDn = $settings['ldap_base_dn'] ?? '';
    if (empty($baseDn)) {
        $baseDn = $settings['ldap_user_search_base'] ?? '';
    }
    
    if (!empty($baseDn)) {
        // Extract domain from base DN (e.g., "DC=oneflorida,DC=org" -> "oneflorida.org")
        if (preg_match_all('/DC=([^,]+)/i', $baseDn, $matches)) {
            if (!empty($matches[1])) {
                return strtolower(implode('.', $matches[1]));
            }
        }
    }
    
    // If domain still not found, try to extract from server hostname
    $server = trim($settings['ldap_server'] ?? $settings['ldap_host'] ?? '');
    if (!empty($server)) {
        // Try to extract domain from FQDN (e.g., "server.example.com" -> "example.com")
        $parts = explode('.', $server);
        if (count($parts) >= 2) {
            // Skip first part (hostname), use rest as domain
            return strtolower(implode('.', array_slice($parts, 1)));
        }
    }
    
    return null;
}

/**
 * Auto-detect authentication source for a single user
 * Priority: Email domain patterns (@localhost = local, @ldap_domain = LDAP) > SAML (if saml_nameid exists) > LDAP (if exists in directory) > Local
 * @param array $user User record from database
 * @param array $ldapSettings LDAP settings (optional, will be fetched if not provided)
 * @return string Detected auth source: 'saml', 'ldap', or 'local'
 */
function detectUserAuthSource($user, $ldapSettings = null) {
    $email = $user['email'] ?? '';
    $emailDomain = extractEmailDomain($email);
    
    // Priority 1: Check email domain patterns
    if (!empty($emailDomain)) {
        // @localhost = local user
        if ($emailDomain === 'localhost') {
            return 'local';
        }
        
        // Check if email domain matches LDAP domain
        if ($ldapSettings === null) {
            $db = getDB();
            $stmt = $db->prepare("SELECT key, value FROM settings WHERE key LIKE 'ldap_%'");
            $stmt->execute();
            $ldapSettings = [];
            foreach ($stmt->fetchAll() as $row) {
                $ldapSettings[$row['key']] = $row['value'];
            }
        }
        
        $ldapDomain = getLdapDomainFromSettings($ldapSettings);
        if (!empty($ldapDomain) && $emailDomain === $ldapDomain) {
            return 'ldap';
        }
    }
    
    // Priority 2: Check for SAML (if saml_nameid exists)
    if (!empty($user['saml_nameid'])) {
        return 'saml';
    }
    
    // Priority 3: Check if user exists in LDAP directory
    if (!empty($ldapSettings) && isset($ldapSettings['ldap_enabled']) && $ldapSettings['ldap_enabled'] === '1') {
        if (checkUserExistsInLdap($user['username'])) {
            return 'ldap';
        }
    }
    
    // Default to local
    return 'local';
}

/**
 * Auto-detect authentication sources for all users in the system
 */
function handleAutoDetectAuthSources() {
    try {
        // Clean any output before starting
        if (ob_get_level() > 0) {
            ob_clean();
        }
        
        requireAdmin(); // Only admins can run auto-detection
        
        $db = getDB();
        
        // Get all users with their current auth_source and saml_nameid
        // Note: saml_nameid column might not exist in older databases, so we'll handle that gracefully
        try {
            $stmt = $db->prepare('SELECT id, username, email, auth_source, saml_nameid FROM users');
            $stmt->execute();
            $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            // If saml_nameid column doesn't exist, select without it
            $stmt = $db->prepare('SELECT id, username, email, auth_source FROM users');
            $stmt->execute();
            $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
            // Add empty saml_nameid to each user
            foreach ($users as &$user) {
                $user['saml_nameid'] = null;
            }
        }
        
        // Check if LDAP is enabled to avoid unnecessary checks
        $stmt = $db->prepare("SELECT key, value FROM settings WHERE key IN ('ldap_enabled') OR key LIKE 'ldap_%'");
        $stmt->execute();
        $settings = [];
        foreach ($stmt->fetchAll() as $row) {
            $settings[$row['key']] = $row['value'];
        }
        $ldapEnabled = isset($settings['ldap_enabled']) && $settings['ldap_enabled'] === '1';
        
        $results = [
            'total' => count($users),
            'updated' => 0,
            'unchanged' => 0,
            'errors' => 0,
            'details' => []
        ];
        
        foreach ($users as $user) {
            try {
                // Use the improved detection function that checks email domains
                $detectedSource = detectUserAuthSource($user, $settings);
                
                $currentSource = $user['auth_source'] ?? null;
                
                // Normalize current source
                $currentSource = ($currentSource === null || $currentSource === '' || $currentSource === 'local') ? 'local' : $currentSource;
                
                if ($detectedSource !== $currentSource) {
                    // Update the auth_source
                    $updateStmt = $db->prepare('UPDATE users SET auth_source = ? WHERE id = ?');
                    $updateStmt->execute([$detectedSource, $user['id']]);
                    
                    $results['updated']++;
                    $results['details'][] = [
                        'user_id' => $user['id'],
                        'username' => $user['username'],
                        'old_source' => $currentSource,
                        'new_source' => $detectedSource
                    ];
                } else {
                    $results['unchanged']++;
                }
            } catch (Exception $e) {
                $results['errors']++;
                $results['details'][] = [
                    'user_id' => $user['id'],
                    'username' => $user['username'],
                    'error' => $e->getMessage()
                ];
                error_log("Auto-detect error for user {$user['id']} ({$user['username']}): " . $e->getMessage());
            }
        }
        
        sendJSON([
            'success' => true,
            'message' => "Auto-detection complete. {$results['updated']} users updated, {$results['unchanged']} unchanged, {$results['errors']} errors.",
            'results' => $results
        ]);
    } catch (Exception $e) {
        error_log('Auto-detect auth sources error: ' . $e->getMessage() . ' | Trace: ' . $e->getTraceAsString());
        sendJSON(['error' => 'Auto-detection failed: ' . $e->getMessage()], 500);
    } catch (Error $e) {
        error_log('Auto-detect auth sources fatal error: ' . $e->getMessage() . ' | Trace: ' . $e->getTraceAsString());
        sendJSON(['error' => 'Auto-detection failed: ' . $e->getMessage()], 500);
    } catch (Throwable $e) {
        error_log('Auto-detect auth sources throwable error: ' . $e->getMessage() . ' | Trace: ' . $e->getTraceAsString());
        sendJSON(['error' => 'Auto-detection failed: An unexpected error occurred'], 500);
    }
}

function handleGetUserInfo($userId) {
    $user = getAuthenticatedUser();
    $db = getDB();
    
    // Allow any authenticated user to view basic user info (for category ownership display)
    if (!$user) {
        sendJSON(['error' => 'Authentication required'], 401);
    }
    
    $stmt = $db->prepare('SELECT id, username, email, is_admin FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $userInfo = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$userInfo) {
        sendJSON(['error' => 'User not found'], 404);
    }
    
    sendJSON([
        'userId' => (int)$userInfo['id'],
        'username' => $userInfo['username'],
        'email' => $userInfo['email'],
        'isAdmin' => (bool)$userInfo['is_admin']
    ]);
}
