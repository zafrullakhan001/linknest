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
        } elseif ($path === '/search-ldap-users') {
            handleSearchLdapUsers();
        } elseif ($path === '/add-local-user') {
            handleAddLocalUser();
        } elseif ($path === '/add-ldap-user') {
            handleAddLdapUser();
        } elseif ($path === '/bulk-approve') {
            handleBulkApproveUsers();
        } elseif ($path === '/bulk-import-local') {
            handleBulkImportLocalUsers();
        } elseif ($path === '/bulk-import-ldap') {
            handleBulkImportLdapUsers();
        } elseif ($path === '/auto-detect-auth-sources') {
            handleAutoDetectAuthSources();
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
        } elseif (preg_match('#^/toggle-admin/(\d+)$#', $path, $matches)) {
            handleToggleAdmin((int)$matches[1]);
        } elseif ($path === '/change-admin-password') {
            handleChangeAdminPassword();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
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
    
    if (strlen($password) < 6) {
        sendJSON(['error' => 'Password must be at least 6 characters'], 400);
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
    
    // Note: ldap_escape_filter and ldap_escape_dn are now defined globally above
    
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
                $userDnTemplate = trim($settings['ldap_user_dn_template'] ?? '');
                $userDn = null;
                $userEntry = null;
                
                if (!empty($userDnTemplate)) {
                    // Use DN template for direct bind (no search needed)
                    $caseSensitive = !empty($settings['ldap_case_sensitive']) && $settings['ldap_case_sensitive'] == '1';
                    $bindUsername = $caseSensitive ? $username : strtolower($username);
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
                    $searchUsername = $caseSensitive ? $username : strtolower($username);
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
                
                // Fallback email if not found - use domain from base DN or user search base
                if (empty($ldapEmail)) {
                    $domain = null;
                    // Try ldap_base_dn first, then fall back to ldap_user_search_base
                    $baseDn = $settings['ldap_base_dn'] ?? '';
                    if (empty($baseDn)) {
                        $baseDn = $settings['ldap_user_search_base'] ?? '';
                    }
                    
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
                        $server = trim($settings['ldap_server'] ?? '');
                        if (!empty($server)) {
                            // Try to extract domain from FQDN (e.g., "server.example.com" -> "example.com")
                            $parts = explode('.', $server);
                            if (count($parts) >= 2) {
                                // Skip first part (hostname), use rest as domain
                                $domain = strtolower(implode('.', array_slice($parts, 1)));
                            }
                        }
                    }
                    
                    // Final fallback - use generic domain
                    if (empty($domain)) {
                        $domain = 'ldap.local';
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
        $stmt = $db->prepare('SELECT id, username, email, password_hash, is_admin, is_approved, auth_source FROM users WHERE LOWER(username) = LOWER(?)');
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
        
        // Check maintenance mode - only admins can login during maintenance
        if ($maintenanceEnabled && !$user['is_admin']) {
            sendJSON(['error' => 'The application is currently in maintenance mode. Only administrators can log in at this time.'], 503);
        }
        
        // Login success - set session with remember me support
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['username'] = $user['username'];
        
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
                'source' => 'ldap'
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
    
    $stmt = $db->prepare('SELECT id, username, email, password_hash, is_admin, is_approved, auth_source FROM users WHERE LOWER(username) = LOWER(?) OR email = ?');
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
            sendJSON(['error' => 'Failed to connect to LDAP server at ' . $uri], 500);
            return;
        }
        
        ldap_set_option($ldap, LDAP_OPT_PROTOCOL_VERSION, 3);
        $followReferrals = !empty($settings['ldap_referrals']) && $settings['ldap_referrals'] == '1';
        ldap_set_option($ldap, LDAP_OPT_REFERRALS, $followReferrals ? 1 : 0);
        ldap_set_option($ldap, LDAP_OPT_NETWORK_TIMEOUT, $timeout);
        ldap_set_option($ldap, LDAP_OPT_TIMELIMIT, $timeout);
        
        if ($tls && $protocol !== 'ldaps') {
            if (!@ldap_start_tls($ldap)) {
                $err = ldap_error($ldap);
                @ldap_close($ldap);
                sendJSON(['error' => 'TLS start failed: ' . $err], 500);
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
            $err = ldap_error($ldap);
            @ldap_close($ldap);
            sendJSON(['error' => 'LDAP bind failed: ' . $err], 500);
            return;
        }
        
        // Search for users using the same filter logic as LDAP Test tab / login
        $searchBase = trim($settings['ldap_user_search_base'] ?? '');
        $filterTemplate = trim($settings['ldap_user_filter'] ?? '(sAMAccountName={username})');
        if (empty($searchBase)) {
            @ldap_close($ldap);
            sendJSON(['error' => 'LDAP user search base is not configured'], 400);
            return;
        }
        
        // Escape search term using built-in function or manual fallback
        $safeSearch = '';
        if (function_exists('ldap_escape')) {
            $safeSearch = ldap_escape($searchTerm, '', LDAP_ESCAPE_FILTER);
        } else {
            // Manual escaping for older PHP versions
            $safeSearch = $searchTerm;
            $safeSearch = str_replace('\\', '\\5c', $safeSearch);
            $safeSearch = str_replace('*', '\\2a', $safeSearch);
            $safeSearch = str_replace('(', '\\28', $safeSearch);
            $safeSearch = str_replace(')', '\\29', $safeSearch);
            $safeSearch = str_replace("\x00", '\\00', $safeSearch);
        }
        
        // Build filter - use the same filter template as login, replacing {username} with search term
        if (strpos($filterTemplate, '{username}') !== false) {
            $filter = str_replace('{username}', $safeSearch, $filterTemplate);
        } else {
            // If template does not use {username}, fall back to a simple sAMAccountName filter
            $filter = "(sAMAccountName={$safeSearch})";
        }
        
        // Get attributes
        $attributesStr = $settings['ldap_user_attributes'] ?? 'sAMAccountName,mail,displayName,userPrincipalName';
        $attributes = array_map('trim', explode(',', $attributesStr));
        $essentialAttrs = ['sAMAccountName', 'mail', 'displayName', 'userPrincipalName'];
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
        
        // Perform simple search with size limit
        if ($searchScope === 'base') {
            $result = @ldap_read($ldap, $searchBase, $filter, $attributes, 0, 20, $timeout);
        } elseif ($searchScope === 'one') {
            $result = @ldap_list($ldap, $searchBase, $filter, $attributes, 0, 20, $timeout);
        } else {
            $result = @ldap_search($ldap, $searchBase, $filter, $attributes, 0, 20, $timeout);
        }
        
        if ($result === false) {
            $err = ldap_error($ldap);
            @ldap_close($ldap);
            // Size limit exceeded is not an error for our use case
            if (strpos($err, 'Size limit') === false) {
                sendJSON(['error' => 'LDAP search failed: ' . $err], 500);
                return;
            }
        }
        
        $entries = @ldap_get_entries($ldap, $result);
        @ldap_close($ldap);
        
        if ($entries === false) {
            sendJSON(['error' => 'Failed to get LDAP entries'], 500);
            return;
        }
        
        $users = [];
        // Limit to first 20 results
        $entryCount = min(isset($entries['count']) ? (int)$entries['count'] : 0, 20);
        
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
        
        sendJSON(['success' => true, 'users' => $users]);
        
    } catch (Exception $e) {
        sendJSON(['error' => 'LDAP search error: ' . $e->getMessage()], 500);
    } catch (Error $e) {
        // Catch PHP 7+ fatal errors
        sendJSON(['error' => 'LDAP search fatal error: ' . $e->getMessage()], 500);
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
    
    if (strlen($password) < 6) {
        sendJSON(['error' => 'Password must be at least 6 characters'], 400);
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
    
    if (!isset($data['username']) || !isset($data['email']) || !isset($data['dn'])) {
        sendJSON(['error' => 'Username, email, and DN are required'], 400);
    }
    
    $username = trim($data['username']);
    $email = trim($data['email']);
    $dn = trim($data['dn']);
    $displayName = trim($data['displayName'] ?? '');
    
    if (strlen($username) < 1) {
        sendJSON(['error' => 'Username is required'], 400);
    }
    
    // Allow @localhost for local users, otherwise validate normally
    $emailLower = strtolower($email);
    $isLocalhostEmail = strpos($emailLower, '@localhost') !== false;
    if (!$isLocalhostEmail && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendJSON(['error' => 'Invalid email address'], 400);
    }
    
    // Verify user exists in LDAP - load settings from database
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
        
        // Validate password length
        if (strlen($password) < 6) {
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

