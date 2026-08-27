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
require_once __DIR__ . '/saml_dependency_response.php';
require_once __DIR__ . '/user_audit_helper.php';

// Composer autoload (OneLogin SAML)
$vendorAutoload = __DIR__ . '/../vendor/autoload.php';
if (!file_exists($vendorAutoload)) {
    error_log('SAML: vendor/autoload.php not found. Please run: composer install or see MANUAL_SAML_INSTALL.md');
    saml_send_dependency_error(
        'The SAML PHP library is not installed. LinkNest needs Composer dependencies (OneLogin PHP-SAML) before SAML login or metadata can work.',
        'Missing vendor/autoload.php',
        [
            'Run composer install in the project root (see the page above for commands).',
            'Or follow MANUAL_SAML_INSTALL.md for a manual copy of onelogin/php-saml.',
            'Required: vendor/onelogin/php-saml/src/ with Auth.php and Settings.php present.',
        ]
    );
}

require_once $vendorAutoload;

// Check if OneLogin classes are available
if (!class_exists('OneLogin\Saml2\Auth') || !class_exists('OneLogin\Saml2\Settings')) {
    error_log('SAML: OneLogin SAML classes not found. Please ensure composer dependencies are installed.');
    saml_send_dependency_error(
        'vendor/autoload.php exists, but the OneLogin SAML classes could not be loaded. The package may be incomplete or the autoloader is out of date.',
        'Missing OneLogin SAML classes',
        [
            'Run composer install again from the project root.',
            'If you installed manually, verify vendor/onelogin/php-saml/src/OneLogin/Saml2/ contains Auth.php and Settings.php.',
            'Run composer dump-autoload if files exist but classes are not found.',
        ]
    );
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

    /**
     * Resolve the configured app favicon to an absolute URL (for browser tab icons).
     */
    private function getAppFaviconAbsoluteUrl(): string {
        try {
            $stmt = $this->db->prepare('SELECT value FROM settings WHERE key = ? LIMIT 1');
            $stmt->execute(['favicon']);
            $row = $stmt->fetch();
            $favicon = is_array($row) ? trim((string)($row['value'] ?? '')) : '';
            if ($favicon === '') {
                return '';
            }

            // Already absolute
            if (preg_match('#^https?://#i', $favicon)) {
                return $favicon;
            }

            $baseUrl = rtrim($this->getDefaultBaseUrl(), '/');
            if (strpos($favicon, '/') !== 0) {
                $favicon = '/' . $favicon;
            }
            return $baseUrl . $favicon;
        } catch (Throwable $e) {
            error_log('SAML getAppFaviconAbsoluteUrl: ' . $e->getMessage());
            return '';
        }
    }

    /**
     * True when a human opened the metadata URL in a browser tab (not an IdP HTTP client).
     */
    private function isBrowserMetadataView(): bool {
        if (isset($_GET['format']) && strtolower((string)$_GET['format']) === 'xml') {
            return false;
        }
        if (isset($_GET['download']) || isset($_GET['raw'])) {
            return false;
        }

        $secFetchDest = strtolower((string)($_SERVER['HTTP_SEC_FETCH_DEST'] ?? ''));
        if ($secFetchDest === 'document') {
            return true;
        }

        $accept = (string)($_SERVER['HTTP_ACCEPT'] ?? '');
        if ($accept === '' || $accept === '*/*') {
            return false;
        }
        // Prefer HTML document requests; keep raw XML for SAML metadata Accept types
        if (stripos($accept, 'application/samlmetadata+xml') !== false
            || stripos($accept, 'application/saml+xml') !== false) {
            return false;
        }

        $htmlPos = stripos($accept, 'text/html');
        $xmlPos = stripos($accept, 'application/xml');
        if ($htmlPos !== false && ($xmlPos === false || $htmlPos < $xmlPos)) {
            return true;
        }

        return false;
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

            $faviconUrl = $this->getAppFaviconAbsoluteUrl();
            if ($faviconUrl !== '') {
                header('Link: <' . $faviconUrl . '>; rel="icon"');
            }
            
            // Browser tab view: HTML shell so the configured favicon appears in the tab.
            // IdPs / curl still receive raw XML (use ?format=xml to force raw XML).
            if ($this->isBrowserMetadataView()) {
                $rawXmlUrl = htmlspecialchars(
                    $this->getDefaultBaseUrl() . '/api/saml?action=metadata&format=xml',
                    ENT_QUOTES,
                    'UTF-8'
                );
                $escapedXml = htmlspecialchars($metadata, ENT_QUOTES, 'UTF-8');
                $faviconLink = $faviconUrl !== ''
                    ? '<link rel="icon" href="' . htmlspecialchars($faviconUrl, ENT_QUOTES, 'UTF-8') . '">'
                    : '';
                $appName = 'SAML SP Metadata';
                try {
                    $stmt = $this->db->prepare('SELECT value FROM settings WHERE key = ? LIMIT 1');
                    $stmt->execute(['app_name']);
                    $nameRow = $stmt->fetch();
                    if (is_array($nameRow) && !empty($nameRow['value'])) {
                        $appName = (string)$nameRow['value'] . ' — SAML Metadata';
                    }
                } catch (Throwable $ignore) {
                }
                $title = htmlspecialchars($appName, ENT_QUOTES, 'UTF-8');

                header('Content-Type: text/html; charset=utf-8');
                header('Cache-Control: no-cache, must-revalidate');
                header('Pragma: no-cache');
                echo '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
                    . '<meta name="viewport" content="width=device-width, initial-scale=1">'
                    . $faviconLink
                    . '<title>' . $title . '</title>'
                    . '<style>body{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#0f172a;color:#e2e8f0}'
                    . 'header{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.75rem 1rem;background:#1e293b;border-bottom:1px solid #334155}'
                    . 'h1{font-size:.95rem;font-weight:600;margin:0}a{color:#93c5fd;text-decoration:none}a:hover{text-decoration:underline}'
                    . 'pre{margin:0;padding:1rem;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.45}</style>'
                    . '</head><body><header><h1>' . $title . '</h1>'
                    . '<a href="' . $rawXmlUrl . '">Download raw XML</a></header>'
                    . '<pre>' . $escapedXml . '</pre></body></html>';
                exit();
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
                logUserAudit('auth.login_failed', [
                    'actor_id' => null,
                    'actor_username' => null,
                    'details' => ['method' => 'saml', 'reason' => 'saml_invalid'],
                ]);
                $redirect = $this->getDefaultBaseUrl() . '/?saml_error=invalid_response';
                header('Location: ' . $redirect);
                exit;
            }
            
            if (!$auth->isAuthenticated()) {
                $this->logAuth("ACS_NOT_AUTH", "Not authenticated after processing", []);
                logUserAudit('auth.login_failed', [
                    'actor_id' => null,
                    'actor_username' => null,
                    'details' => ['method' => 'saml', 'reason' => 'saml_not_authenticated'],
                ]);
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
                logUserAudit('auth.login_failed', [
                    'actor_id' => null,
                    'actor_username' => null,
                    'details' => ['method' => 'saml', 'reason' => 'saml_attribute_mapping'],
                ]);
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
                $checkStmt = $this->conn->prepare("SELECT id, is_approved FROM users WHERE username = ? OR email = ? LIMIT 1");
                $checkStmt->execute([$username, $email]);
                $pendingUser = $checkStmt->fetch(PDO::FETCH_ASSOC);
                
                if ($pendingUser && !$pendingUser['is_approved']) {
                    logUserAudit('auth.login_failed', [
                        'actor_id' => isset($pendingUser['id']) ? (int)$pendingUser['id'] : null,
                        'actor_username' => $username,
                        'target_user_id' => isset($pendingUser['id']) ? (int)$pendingUser['id'] : null,
                        'target_username' => $username,
                        'details' => ['method' => 'saml', 'reason' => 'pending', 'username' => $username],
                    ]);
                    $redirectUrl = $this->getDefaultBaseUrl() . '/?saml_error=pending_approval&username=' . urlencode($username);
                    header('Location: ' . $redirectUrl);
                    exit;
                }

                // Check if user is disabled
                $checkStmt = $this->conn->prepare("SELECT id, is_disabled FROM users WHERE username = ? OR email = ? LIMIT 1");
                $checkStmt->execute([$username, $email]);
                $disabledUser = $checkStmt->fetch(PDO::FETCH_ASSOC);
                
                if ($disabledUser && $disabledUser['is_disabled']) {
                    logUserAudit('auth.login_failed', [
                        'actor_id' => isset($disabledUser['id']) ? (int)$disabledUser['id'] : null,
                        'actor_username' => $username,
                        'target_user_id' => isset($disabledUser['id']) ? (int)$disabledUser['id'] : null,
                        'target_username' => $username,
                        'details' => ['method' => 'saml', 'reason' => 'disabled', 'username' => $username],
                    ]);
                    $redirectUrl = $this->getDefaultBaseUrl() . '/?saml_error=account_disabled';
                    header('Location: ' . $redirectUrl);
                    exit;
                }

                // Auto-provisioning disabled
                if (!$autoProvision) {
                    logUserAudit('auth.login_failed', [
                        'actor_id' => null,
                        'actor_username' => $username,
                        'details' => ['method' => 'saml', 'reason' => 'provisioning_disabled', 'username' => $username],
                    ]);
                    $redirectUrl = $this->getDefaultBaseUrl() . '/?saml_error=provisioning_disabled&username=' . urlencode($username);
                    header('Location: ' . $redirectUrl);
                    exit;
                }

                // Generic not allowed
                logUserAudit('auth.login_failed', [
                    'actor_id' => null,
                    'actor_username' => $username,
                    'details' => ['method' => 'saml', 'reason' => 'not_allowed', 'username' => $username],
                ]);
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

            logUserAudit('auth.login', [
                'actor_id' => (int)$userId,
                'actor_username' => $username,
                'target_user_id' => (int)$userId,
                'target_username' => $username,
                'details' => ['method' => 'saml'],
            ]);
            
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
            if (session_status() === PHP_SESSION_NONE) {
                session_start();
            }
            $actorId = $_SESSION['user_id'] ?? null;
            $actorUsername = isset($_SESSION['username']) ? (string)$_SESSION['username'] : null;
            if ($actorId !== null || ($actorUsername !== null && $actorUsername !== '')) {
                logUserAudit('auth.logout', [
                    'actor_id' => $actorId !== null && $actorId !== '' ? (int)$actorId : null,
                    'actor_username' => $actorUsername,
                    'target_user_id' => $actorId !== null && $actorId !== '' ? (int)$actorId : null,
                    'target_username' => $actorUsername,
                    'details' => ['method' => 'saml'],
                ]);
            }
            // Clear local session before IdP SLO redirect
            $_SESSION = [];
            if (session_status() === PHP_SESSION_ACTIVE) {
                session_destroy();
            }
            if (function_exists('linknestClearSessionCookie')) {
                linknestClearSessionCookie();
            }
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
            $ins = $this->conn->prepare("INSERT INTO users (username, email, password_hash, is_admin, is_approved, auth_source, saml_nameid, uuid, created_at) VALUES (?, ?, '', 0, 0, 'saml', ?, ?, ?)");
            $ins->execute([$username, $email, $nameId, generateUuid(), time()]);
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
