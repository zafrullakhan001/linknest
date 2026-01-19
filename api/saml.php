<?php
/**
 * SAML 2.0 Endpoint Controller
 * Exposes actions: metadata, login (redirect), acs (assertion consumer), logout (SLO)
 */

// Don't set secure headers for metadata endpoint (it needs custom XML headers)
$action = $_GET['action'] ?? '';
if ($action !== 'metadata') {
    require_once __DIR__ . '/config.php';
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
} else {
    require_once __DIR__ . '/config.php';
}

require_once __DIR__ . '/../config/SamlConfig.php';

// Composer autoload (OneLogin SAML)
$vendorAutoload = __DIR__ . '/../vendor/autoload.php';
if (!file_exists($vendorAutoload)) {
    error_log('SAML: vendor/autoload.php not found. Please run: composer install or see MANUAL_SAML_INSTALL.md');
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false, 
        'message' => 'SAML library not installed. Please install dependencies.',
        'error' => 'Missing vendor/autoload.php',
        'instructions' => [
            'Option 1: Run "composer install" in the project root',
            'Option 2: See MANUAL_SAML_INSTALL.md for manual installation',
            'Required: OneLogin PHP-SAML library in vendor/onelogin/php-saml/src/'
        ]
    ]);
    exit;
}

require_once $vendorAutoload;

// Check if OneLogin classes are available
if (!class_exists('OneLogin\Saml2\Auth') || !class_exists('OneLogin\Saml2\Settings')) {
    error_log('SAML: OneLogin SAML classes not found. Please ensure composer dependencies are installed.');
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false, 
        'message' => 'SAML library classes not found. Please run: composer install',
        'error' => 'Missing OneLogin SAML classes'
    ]);
    exit;
}

use OneLogin\Saml2\Auth as OneLoginSamlAuth;
use OneLogin\Saml2\Settings as OneLoginSamlSettings;

class SamlAPI {
    private $db;
    private $conn;
    private $samlConfig;
    private $authLogFile;

    public function __construct() {
        $this->db = getDB();
        $this->conn = $this->db;
        $this->samlConfig = new SamlConfig();
        $this->authLogFile = __DIR__ . '/../logs/saml_auth.log';
        
        // Ensure logs directory exists
        $logDir = dirname($this->authLogFile);
        if (!is_dir($logDir)) {
            mkdir($logDir, 0755, true);
        }
    }
    
    private function logAuth($action, $message, $details = []) {
        try {
            $logEntry = sprintf(
                "[%s] %s | %s | %s\n",
                date('Y-m-d H:i:s.u'),
                str_pad($action, 25),
                $message,
                json_encode($details, JSON_UNESCAPED_SLASHES)
            );
            file_put_contents($this->authLogFile, $logEntry, FILE_APPEND | LOCK_EX);
            
            // Also log to error log for critical issues
            if (str_contains($message, 'ERROR') || str_contains($message, 'FAIL')) {
                error_log("SAML Auth - $action: $message");
            }
        } catch (Exception $e) {
            error_log("Failed to write SAML auth log: " . $e->getMessage());
        }
    }

    public function handleRequest() {
        $method = $_SERVER['REQUEST_METHOD'];
        $action = $_GET['action'] ?? ($_POST['action'] ?? '');

        // Metadata endpoint is public and returns XML, not JSON
        if ($action === 'metadata') {
            return $this->metadata();
        }

        if (!$this->samlConfig->isEnabled()) {
            // Redirect to login page when SAML is disabled
            $redirect = $this->getDefaultBaseUrl() . '/';
            header('Location: ' . $redirect);
            return null;
        }

        switch ($action) {
            case 'login':
                return $this->login();
            case 'acs':
                return $this->acs();
            case 'logout':
                return $this->logout();
            default:
                return $this->sendResponse(false, 'Invalid action', 400);
        }
    }

    private function getOneLoginSettings(): array {
        $settings = $this->samlConfig->getSettings();
        
        // For metadata generation, provide placeholder if IdP cert is empty
        $idpCert = $settings['idp_x509cert'] ?: 'MIICajCCAdOgAwIBAgIBADANBgkqhkiG9w0BAQ0FADBSMQswCQYDVQQGEwJ1czETMBEGA1UECAwKQ2FsaWZvcm5pYTEVMBMGA1UECgwMT25lbG9naW4gSW5jMRcwFQYDVQQDDA5zcC5leGFtcGxlLmNvbTAeFw0xNDA3MTcxNDEyNTZaFw0xNTA3MTcxNDEyNTZaMFIxCzAJBgNVBAYTAnVzMRMwEQYDVQQIDApDYWxpZm9ybmlhMRUwEwYDVQQKDAxPbmVsb2dpbiBJbmMxFzAVBgNVBAMMDnNwLmV4YW1wbGUuY29tMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDZx+ON4IUoIWxgukTb1tOiX3bMYzYQiwWPUNMp+Fq82xoNogso2bykZG0yiJm5o8zv/sd6pGouayMgkx/2FSOdc36T0jGbCHuRSbtia0PEzNIRtmViMrt3AeoWBidRXmZsxCNLwgIV6PoMR2AgObTt7NU2pEtzFKvOezKCqt5OeQIDAQABo1AwTjAdBgNVHQ4EFgQUGHxYqZYyX7cTxKVODVgZwSTdCnwwHwYDVR0jBBgwFoAUGHxYqZYyX7cTxKVODVgZwSTdCnwwDAYDVR0TBAUwAwEB/zANBgkqhkiG9w0BAQ0FAAOBgQByFOl+hMFICbd3DJfnp2Rgd/dqttsZG/tyhILWvErbio/DEe98mXpowhTkC04ENprOyXi7ZbUqiicF89uAGyt1oqgTUCD1VsLahqIcmrzgumNyTwLGWo17WDAa1/usDhetWAMhgzF/Cnf5ek0nK00m0YZGyc4LzgD0CROMASTWNg==';
        
        $base = [
            'strict' => $settings['strict'] === '1',
            'debug' => $settings['debug'] === '1',
            'sp' => [
                'entityId' => $settings['sp_entity_id'] ?: $this->getDefaultSpEntityId(),
                'assertionConsumerService' => [
                    'url' => $settings['sp_assertion_consumer_service'] ?: $this->getDefaultAcsUrl(),
                ],
                'singleLogoutService' => [
                    'url' => $settings['sp_single_logout_service'] ?: $this->getDefaultSloUrl(),
                ],
                'NameIDFormat' => $settings['nameid_format']
            ],
            'idp' => [
                'entityId' => $settings['idp_entity_id'] ?: 'placeholder-idp-entity',
                'singleSignOnService' => [
                    'url' => $settings['idp_sso_url'] ?: 'http://placeholder-idp.example.com/sso'
                ],
                'singleLogoutService' => [
                    'url' => $settings['idp_slo_url'] ?: 'http://placeholder-idp.example.com/slo'
                ],
                'x509cert' => $idpCert
            ],
            // Security defaults
            'security' => [
                'nameIdEncrypted' => false,
                'authnRequestsSigned' => false,
                'logoutRequestSigned' => false,
                'logoutResponseSigned' => false,
                'wantMessagesSigned' => false,
                'wantAssertionsSigned' => true,
                'wantNameId' => true,
                'requestedAuthnContext' => true,
                'wantXMLValidation' => true,
            ]
        ];
        return $base;
    }

    private function getDefaultBaseUrl(): string {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        
        // Detect base path dynamically
        $basePath = '';
        $requestUri = $_SERVER['REQUEST_URI'] ?? '';
        if (preg_match('#^/([^/]+)/api/#', $requestUri, $matches)) {
            $basePath = '/' . $matches[1];
        }
        
        return $scheme . '://' . $host . $basePath;
    }

    private function getDefaultSpEntityId(): string {
        return $this->getDefaultBaseUrl() . '/saml/metadata';
    }
    private function getDefaultAcsUrl(): string {
        return $this->getDefaultBaseUrl() . '/api/saml?action=acs';
    }
    private function getDefaultSloUrl(): string {
        return $this->getDefaultBaseUrl() . '/api/saml?action=logout';
    }

    private function buildAuth(): OneLoginSamlAuth {
        $settings = $this->getOneLoginSettings();
        return new OneLoginSamlAuth($settings);
    }

    private function metadata() {
        try {
            // Clear any previous output
            if (ob_get_level()) {
                ob_clean();
            }
            
            $samlSettings = $this->getOneLoginSettings();
            
            // Validate required settings for metadata generation
            if (empty($samlSettings['sp']['entityId'])) {
                throw new Exception('SP Entity ID is required for metadata generation');
            }
            
            $settings = new OneLoginSamlSettings($samlSettings);
            $metadata = $settings->getSPMetadata();
            
            // Validate metadata was generated
            if (empty($metadata)) {
                throw new Exception('Failed to generate SAML metadata');
            }
            
            // Validate metadata errors
            $errors = $settings->validateMetadata($metadata);
            if (!empty($errors)) {
                error_log('SAML metadata validation warnings: ' . implode(', ', $errors));
                // Continue anyway - warnings don't prevent metadata generation
            }
            
            // Set proper headers for XML display in browser
            header('Content-Type: application/xml; charset=utf-8');
            header('Content-Disposition: inline; filename="sp-metadata.xml"');
            header('Cache-Control: no-cache, must-revalidate');
            header('Pragma: no-cache');
            
            echo $metadata;
            exit(); // Prevent any additional output
        } catch (Throwable $e) {
            error_log('SAML metadata error: ' . $e->getMessage());
            error_log('SAML metadata trace: ' . $e->getTraceAsString());
            
            // Clear any output
            if (ob_get_level()) {
                ob_clean();
            }
            
            header('Content-Type: application/json');
            http_response_code(500);
            
            $isDev = (isset($_SERVER['SERVER_NAME']) && $_SERVER['SERVER_NAME'] === 'localhost') 
                     || (isset($_GET['debug']) && $_GET['debug'] === '1');
            
            $response = [
                'success' => false, 
                'message' => $isDev ? 'Metadata generation failed: ' . $e->getMessage() : 'An internal server error occurred',
                'error' => $e->getMessage()
            ];
            
            if ($isDev) {
                $response['trace'] = $e->getTraceAsString();
                $response['file'] = $e->getFile();
                $response['line'] = $e->getLine();
            }
            
            echo json_encode($response);
            exit();
        }
    }

    private function login() {
        try {
            $auth = $this->buildAuth();
            $auth->login();
            return null; // Redirected
        } catch (Exception $e) {
            error_log('SAML login redirect error: ' . $e->getMessage());
            return $this->sendResponse(false, 'SAML redirect failed', 500);
        }
    }

    private function acs() {
        $separator = str_repeat('=', 80);
        file_put_contents($this->authLogFile, "\n$separator\n", FILE_APPEND);
        $this->logAuth("ACS_START", "SAML Assertion Consumer Service called", [
            'method' => $_SERVER['REQUEST_METHOD'],
            'remote_addr' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
        ]);
        
        try {
            $this->logAuth("ACS_BUILD_AUTH", "Building SAML Auth object", []);
            $auth = $this->buildAuth();
            
            $this->logAuth("ACS_PROCESS", "Processing SAML response", []);
            $auth->processResponse();
            
            if ($auth->getErrors()) {
                $errors = $auth->getErrors();
                $this->logAuth("ACS_ERROR", "SAML validation errors", ['errors' => $errors]);
                error_log('SAML ACS errors: ' . implode(', ', $errors));
                $redirect = $this->getDefaultBaseUrl() . '/?saml_error=invalid_response';
                header('Location: ' . $redirect);
                exit;
            }
            
            if (!$auth->isAuthenticated()) {
                $this->logAuth("ACS_NOT_AUTH", "Not authenticated after processing", []);
                $redirect = $this->getDefaultBaseUrl() . '/?saml_error=not_authenticated';
                header('Location: ' . $redirect);
                exit;
            }

            $this->logAuth("ACS_AUTHENTICATED", "SAML authentication successful", []);
            
            $attrs = $auth->getAttributes();
            $nameId = $auth->getNameId();
            $settings = $this->samlConfig->getSettings();

            $this->logAuth("ACS_ATTRIBUTES", "Extracted SAML attributes", [
                'nameId' => $nameId,
                'attribute_count' => count($attrs),
                'attribute_keys' => array_keys($attrs)
            ]);

            // Map attributes
            $mapUsername = $settings['map_name_to'] ?: 'uid';
            $mapEmail = $settings['map_email_to'] ?: 'email';
            $mapDisplay = $settings['map_display_name_to'] ?: 'cn';

            $username = $this->firstAttr($attrs, $mapUsername) ?: ($nameId ?? '');
            $email = $this->firstAttr($attrs, $mapEmail) ?: '';
            $displayName = $this->firstAttr($attrs, $mapDisplay) ?: $username;

            $this->logAuth("ACS_MAPPING", "Attribute mapping complete", [
                'username' => $username,
                'email' => $email,
                'displayName' => $displayName,
                'map_username' => $mapUsername,
                'map_email' => $mapEmail,
                'map_display' => $mapDisplay
            ]);

            if (empty($username)) {
                $this->logAuth("ACS_NO_USERNAME", "ERROR: Username mapping failed", []);
                $redirect = $this->getDefaultBaseUrl() . '/?saml_error=attribute_mapping';
                header('Location: ' . $redirect);
                exit;
            }

            // Find or provision user
            $autoProvision = (bool)($settings['auto_provision'] === '1');
            $this->logAuth("ACS_PROVISION_START", "Looking for user", [
                'username' => $username,
                'auto_provision' => $autoProvision
            ]);
            
            $userId = $this->findOrProvisionUser($username, $email, $displayName, $nameId, $autoProvision);
            
            if (!$userId) {
                $this->logAuth("ACS_NO_USER", "ERROR: User not found/created or pending approval", [
                    'username' => $username,
                    'auto_provision' => $autoProvision
                ]);
                
                // Check if user exists but is pending approval
                $checkStmt = $this->conn->prepare("SELECT is_approved FROM users WHERE username = ? OR email = ? LIMIT 1");
                $checkStmt->execute([$username, $email]);
                $pendingUser = $checkStmt->fetch(PDO::FETCH_ASSOC);
                
                if ($pendingUser && !$pendingUser['is_approved']) {
                    $redirectUrl = $this->getDefaultBaseUrl() . '/?saml_error=pending_approval&username=' . urlencode($username);
                    header('Location: ' . $redirectUrl);
                    exit;
                }

                // Check if user is disabled
                $checkStmt = $this->conn->prepare("SELECT is_disabled FROM users WHERE username = ? OR email = ? LIMIT 1");
                $checkStmt->execute([$username, $email]);
                $disabledUser = $checkStmt->fetch(PDO::FETCH_ASSOC);
                
                if ($disabledUser && $disabledUser['is_disabled']) {
                    $redirectUrl = $this->getDefaultBaseUrl() . '/?saml_error=account_disabled';
                    header('Location: ' . $redirectUrl);
                    exit;
                }

                // Auto-provisioning disabled
                if (!$autoProvision) {
                    $redirectUrl = $this->getDefaultBaseUrl() . '/?saml_error=provisioning_disabled&username=' . urlencode($username);
                    header('Location: ' . $redirectUrl);
                    exit;
                }

                // Generic not allowed
                $redirectUrl = $this->getDefaultBaseUrl() . '/?saml_error=not_allowed';
                header('Location: ' . $redirectUrl);
                exit;
            }

            $this->logAuth("ACS_USER_OK", "User found/created", ['user_id' => $userId]);

            // Create PHP session
            if (session_status() === PHP_SESSION_NONE) {
                session_start();
            }
            
            $_SESSION['user_id'] = $userId;
            $_SESSION['username'] = $username;
            
            // Record successful login time
            try {
                $updLogin = $this->conn->prepare("UPDATE users SET last_login = ? WHERE id = ?");
                $updLogin->execute([time(), $userId]);
                $this->logAuth("ACS_LAST_LOGIN_UPDATED", "Updated last_login for user", ['user_id' => $userId]);
            } catch (Exception $e) {
                $this->logAuth("ACS_LAST_LOGIN_UPDATE_FAIL", "Failed to update last_login", ['user_id' => $userId, 'error' => $e->getMessage()]);
            }

            $this->logAuth("ACS_SESSION_CREATED", "Session created", [
                'user_id' => $userId,
                'username' => $username
            ]);

            // Redirect back to app root
            $redirect = $this->getDefaultBaseUrl() . '/';
            
            $this->logAuth("ACS_COMPLETE", "✅ SAML authentication complete", [
                'user_id' => $userId,
                'username' => $username
            ]);
            
            header('Location: ' . $redirect);
            exit;
        } catch (Exception $e) {
            $this->logAuth("ACS_EXCEPTION", "ERROR: Exception occurred", [
                'exception' => $e->getMessage(),
                'trace' => substr($e->getTraceAsString(), 0, 500)
            ]);
            error_log('SAML ACS exception: ' . $e->getMessage());
            return $this->sendResponse(false, 'SAML processing failed', 500);
        }
    }

    private function logout() {
        try {
            $auth = $this->buildAuth();
            $auth->logout();
            return null;
        } catch (Exception $e) {
            error_log('SAML logout error: ' . $e->getMessage());
            return $this->sendResponse(false, 'SAML logout failed', 500);
        }
    }

    private function firstAttr(array $attrs, string $key): ?string {
        foreach ($attrs as $attrName => $values) {
            if (strcasecmp($attrName, $key) === 0 && is_array($values) && count($values) > 0) {
                return (string)$values[0];
            }
        }
        return null;
    }

    private function findOrProvisionUser(string $username, string $email, string $displayName, ?string $nameId, bool $autoProvision): ?int {
        // Try to find by saml_nameid, username, or email
        $stmt = $this->conn->prepare("SELECT id, is_approved, is_disabled FROM users WHERE saml_nameid = ? OR username = ? OR email = ? LIMIT 1");
        $stmt->execute([$nameId, $username, $email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($user) {
            $userId = (int)$user['id'];
            
            // Check if user is disabled
            if ($user['is_disabled']) {
                $this->logAuth("ACS_USER_DISABLED", "User account is disabled", ['user_id' => $userId]);
                return null;
            }
            
            // Check if user is pending approval
            if (!$user['is_approved']) {
                $this->logAuth("ACS_PENDING_APPROVAL", "User exists but pending approval", ['user_id' => $userId]);
                return null;
            }
            
            // User is active and approved - update and allow access
            try {
                $upd = $this->conn->prepare("UPDATE users SET saml_nameid = COALESCE(saml_nameid, ?) WHERE id = ?");
                $upd->execute([$nameId, $userId]);
            } catch (Exception $e) {
                // Column might not exist yet, ignore
            }
            return $userId;
        }

        if (!$autoProvision) {
            return null;
        }

        // Create user with pending approval status - requires admin approval before access
        try {
            $this->conn->beginTransaction();
            $ins = $this->conn->prepare("INSERT INTO users (username, email, password_hash, is_admin, is_approved, auth_source, saml_nameid, created_at) VALUES (?, ?, '', 0, 0, 'saml', ?, ?)");
            $ins->execute([$username, $email, $nameId, time()]);
            $userId = (int)$this->conn->lastInsertId();
            $this->conn->commit();
            
            $this->logAuth("ACS_USER_CREATED_PENDING", "New user created - pending approval", ['user_id' => $userId]);
            
            return null; // Don't grant access until approved
        } catch (Exception $e) {
            $this->conn->rollBack();
            $this->logAuth("ACS_USER_CREATE_FAIL", "ERROR: Failed to create user", ['error' => $e->getMessage()]);
            return null;
        }
    }

    private function sendResponse($success, $message, $statusCode = 200, $data = null) {
        http_response_code($statusCode);
        header('Content-Type: application/json');
        $response = ['success' => $success, 'message' => $message];
        if ($data !== null) $response['data'] = $data;
        echo json_encode($response);
        return $response;
    }
}

try {
    $api = new SamlAPI();
    $api->handleRequest();
} catch (Throwable $e) {
    $errorMsg = $e->getMessage();
    $errorTrace = $e->getTraceAsString();
    error_log('SAML API fatal: ' . $errorMsg);
    error_log('SAML API trace: ' . $errorTrace);
    
    http_response_code(500);
    header('Content-Type: application/json');
    
    // In development, show detailed error; in production, show generic message
    $isDev = (isset($_SERVER['SERVER_NAME']) && $_SERVER['SERVER_NAME'] === 'localhost') 
             || (isset($_GET['debug']) && $_GET['debug'] === '1');
    
    $response = [
        'success' => false, 
        'message' => $isDev ? 'SAML error: ' . $errorMsg : 'An internal server error occurred',
        'error' => $errorMsg
    ];
    
    if ($isDev) {
        $response['trace'] = $errorTrace;
        $response['file'] = $e->getFile();
        $response['line'] = $e->getLine();
    }
    
    echo json_encode($response);
    exit;
}

?>
