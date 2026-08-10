<?php
/**
 * SAML Test Endpoint
 * Tests SAML configuration and connectivity
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/../config/SamlConfig.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (file_exists(__DIR__ . '/../vendor/autoload.php')) {
    require_once __DIR__ . '/../vendor/autoload.php';
}

use OneLogin\Saml2\Settings as OneLoginSamlSettings;
use OneLogin\Saml2\Auth as OneLoginSamlAuth;

header('Content-Type: application/json');

class SamlTestAPI {
    private $conn;
    private $samlConfig;
    private $logFile;

    public function __construct() {
        $db = getDB();
        $this->conn = $db;
        $this->samlConfig = new SamlConfig();
        $this->logFile = __DIR__ . '/../logs/saml_test.log';
        
        // Ensure logs directory exists
        $logDir = dirname($this->logFile);
        if (!is_dir($logDir)) {
            mkdir($logDir, 0755, true);
        }
    }

    /**
     * Log SAML test activity with detailed information
     */
    private function logTest($action, $status, $details = []) {
        try {
            $logData = [
                'timestamp' => date('Y-m-d H:i:s.u'),
                'action' => $action,
                'status' => $status,
                'ip_address' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
                'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown',
                'details' => $details
            ];

            // Format log entry
            $logEntry = sprintf(
                "[%s] %s | Status: %s | IP: %s | Details: %s\n",
                $logData['timestamp'],
                str_pad($logData['action'], 30),
                str_pad($logData['status'], 10),
                str_pad($logData['ip_address'], 15),
                json_encode($logData['details'], JSON_UNESCAPED_SLASHES)
            );

            // Write to log file
            file_put_contents($this->logFile, $logEntry, FILE_APPEND | LOCK_EX);

            // Also log to PHP error log for critical events
            if (in_array($status, ['FAIL', 'ERROR', 'WARNING'])) {
                error_log("SAML Test - {$action}: {$status} - " . json_encode($details));
            }

        } catch (Exception $e) {
            error_log('Failed to write SAML test log: ' . $e->getMessage());
        }
    }

    /**
     * Log test section start
     */
    private function logTestStart($testName) {
        $separator = str_repeat('=', 100);
        $logEntry = "\n{$separator}\n[" . date('Y-m-d H:i:s.u') . "] STARTING TEST: {$testName}\n{$separator}\n";
        file_put_contents($this->logFile, $logEntry, FILE_APPEND | LOCK_EX);
    }

    /**
     * Log test section end
     */
    private function logTestEnd($testName, $result) {
        $separator = str_repeat('-', 100);
        $logEntry = "[" . date('Y-m-d H:i:s.u') . "] COMPLETED TEST: {$testName} | Result: {$result}\n{$separator}\n\n";
        file_put_contents($this->logFile, $logEntry, FILE_APPEND | LOCK_EX);
    }

    public function handleRequest() {
        // Verify admin auth
        $authResult = $this->verifyAdminAuth();
        if (!$authResult['success']) {
            $this->logTest('AUTH_CHECK', 'FAIL', ['reason' => $authResult['message']]);
            return $this->sendResponse(false, $authResult['message'], 401);
        }

        $method = $_SERVER['REQUEST_METHOD'];
        $input = json_decode(file_get_contents('php://input'), true);
        $action = $input['action'] ?? ($_GET['action'] ?? '');

        $this->logTest('REQUEST_RECEIVED', 'INFO', [
            'action' => $action,
            'method' => $method,
            'user' => $authResult['user']['username'] ?? 'unknown'
        ]);

        switch ($action) {
            case 'test_configuration':
                return $this->testConfiguration();
            case 'test_metadata':
                return $this->testMetadata();
            case 'test_idp_connectivity':
                return $this->testIdpConnectivity();
            case 'validate_certificate':
                return $this->validateCertificate();
            default:
                $this->logTest('INVALID_ACTION', 'ERROR', ['action' => $action]);
                return $this->sendResponse(false, 'Invalid action', 400);
        }
    }

    private function verifyAdminAuth() {
        try {
            $user = getAuthenticatedUser();
            if (!$user) {
                return ['success' => false, 'message' => 'Authentication required'];
            }

            if (!$user['is_admin']) {
                return ['success' => false, 'message' => 'Admin access required'];
            }

            return ['success' => true, 'user' => $user];
        } catch (Exception $e) {
            error_log('Admin auth verification error: ' . $e->getMessage());
            return ['success' => false, 'message' => 'Authentication error'];
        }
    }

    private function testConfiguration() {
        $this->logTestStart('FULL CONFIGURATION TEST');
        $results = [];
        $allPassed = true;

        // Test 1: SAML enabled
        $this->logTest('TEST_1_SAML_ENABLED', 'START', ['step' => 'Checking if SAML is enabled']);
        try {
            $enabled = $this->samlConfig->isEnabled();
            $this->logTest('TEST_1_SAML_ENABLED', $enabled ? 'PASS' : 'WARNING', [
                'enabled' => $enabled,
                'message' => $enabled ? 'SAML is enabled' : 'SAML is disabled'
            ]);
            $results[] = [
                'test' => 'SAML Enabled',
                'status' => $enabled ? 'pass' : 'warning',
                'message' => $enabled ? 'SAML is enabled' : 'SAML is disabled',
                'icon' => $enabled ? 'âœ“' : 'âš '
            ];
            if (!$enabled) $allPassed = false;
        } catch (Exception $e) {
            $this->logTest('TEST_1_SAML_ENABLED', 'FAIL', ['error' => $e->getMessage()]);
            $results[] = [
                'test' => 'SAML Enabled',
                'status' => 'fail',
                'message' => 'Error checking SAML status: ' . $e->getMessage(),
                'icon' => 'âœ—'
            ];
            $allPassed = false;
        }

        // Test 2: Required settings
        $this->logTest('TEST_2_REQUIRED_SETTINGS', 'START', ['step' => 'Checking required IdP settings']);
        try {
            $settings = $this->samlConfig->getSettings();
            $required = ['idp_entity_id', 'idp_sso_url', 'idp_x509cert'];
            $missing = [];
            
            $this->logTest('TEST_2_REQUIRED_SETTINGS', 'INFO', [
                'checking' => $required,
                'idp_entity_id' => !empty($settings['idp_entity_id']) ? substr($settings['idp_entity_id'], 0, 50) . '...' : 'MISSING',
                'idp_sso_url' => !empty($settings['idp_sso_url']) ? $settings['idp_sso_url'] : 'MISSING',
                'idp_x509cert' => !empty($settings['idp_x509cert']) ? 'Present (' . strlen($settings['idp_x509cert']) . ' chars)' : 'MISSING'
            ]);
            
            foreach ($required as $key) {
                if (empty($settings[$key])) {
                    $missing[] = $key;
                }
            }
            
            if (empty($missing)) {
                $this->logTest('TEST_2_REQUIRED_SETTINGS', 'PASS', ['message' => 'All required settings present']);
                $results[] = [
                    'test' => 'Required Settings',
                    'status' => 'pass',
                    'message' => 'All required IdP settings configured',
                    'icon' => 'âœ“'
                ];
            } else {
                $this->logTest('TEST_2_REQUIRED_SETTINGS', 'WARNING', ['missing' => $missing]);
                $results[] = [
                    'test' => 'Required Settings',
                    'status' => 'warning',
                    'message' => 'Missing: ' . implode(', ', $missing),
                    'icon' => 'âš '
                ];
                $allPassed = false;
            }
        } catch (Exception $e) {
            $this->logTest('TEST_2_REQUIRED_SETTINGS', 'FAIL', ['error' => $e->getMessage()]);
            $results[] = [
                'test' => 'Required Settings',
                'status' => 'fail',
                'message' => 'Error checking settings: ' . $e->getMessage(),
                'icon' => 'âœ—'
            ];
            $allPassed = false;
        }

        // Test 3: Database columns
        $this->logTest('TEST_3_DATABASE_SCHEMA', 'START', ['step' => 'Checking database columns']);
        try {
            $stmt = $this->conn->query("PRAGMA table_info(users)");
            $columns = $stmt->fetchAll(PDO::FETCH_COLUMN, 1);
            
            $hasSamlNameId = in_array('saml_nameid', $columns);
            
            $this->logTest('TEST_3_DATABASE_SCHEMA', 'INFO', [
                'saml_nameid_column' => $hasSamlNameId ? 'EXISTS' : 'MISSING'
            ]);
            
            if ($hasSamlNameId) {
                $this->logTest('TEST_3_DATABASE_SCHEMA', 'PASS', ['message' => 'All required columns exist']);
                $results[] = [
                    'test' => 'Database Schema',
                    'status' => 'pass',
                    'message' => 'SAML columns exist in users table',
                    'icon' => 'âœ“'
                ];
            } else {
                $this->logTest('TEST_3_DATABASE_SCHEMA', 'FAIL', [
                    'missing_columns' => ['saml_nameid']
                ]);
                $results[] = [
                    'test' => 'Database Schema',
                    'status' => 'fail',
                    'message' => 'Missing SAML columns - run migration',
                    'icon' => 'âœ—'
                ];
                $allPassed = false;
            }
        } catch (Exception $e) {
            $this->logTest('TEST_3_DATABASE_SCHEMA', 'FAIL', ['error' => $e->getMessage()]);
            $results[] = [
                'test' => 'Database Schema',
                'status' => 'fail',
                'message' => 'Database error: ' . $e->getMessage(),
                'icon' => 'âœ—'
            ];
            $allPassed = false;
        }

        // Test 4: OneLogin library
        $this->logTest('TEST_4_SAML_LIBRARY', 'START', ['step' => 'Checking OneLogin PHP-SAML library']);
        try {
            $libraryExists = class_exists('OneLogin\Saml2\Auth');
            $this->logTest('TEST_4_SAML_LIBRARY', 'INFO', [
                'class_exists' => $libraryExists,
                'vendor_path' => __DIR__ . '/../vendor/autoload.php',
                'vendor_exists' => file_exists(__DIR__ . '/../vendor/autoload.php')
            ]);
            
            if (!$libraryExists) {
                $this->logTest('TEST_4_SAML_LIBRARY', 'FAIL', ['message' => 'Library not found']);
                $results[] = [
                    'test' => 'SAML Library',
                    'status' => 'fail',
                    'message' => 'OneLogin PHP-SAML library not found - run composer install',
                    'icon' => 'âœ—'
                ];
                $allPassed = false;
            } else {
                $this->logTest('TEST_4_SAML_LIBRARY', 'PASS', ['message' => 'Library loaded successfully']);
                $results[] = [
                    'test' => 'SAML Library',
                    'status' => 'pass',
                    'message' => 'OneLogin PHP-SAML library loaded',
                    'icon' => 'âœ“'
                ];
            }
        } catch (Exception $e) {
            $this->logTest('TEST_4_SAML_LIBRARY', 'FAIL', ['error' => $e->getMessage()]);
            $results[] = [
                'test' => 'SAML Library',
                'status' => 'fail',
                'message' => 'Error loading library: ' . $e->getMessage(),
                'icon' => 'âœ—'
            ];
            $allPassed = false;
        }

        $finalResult = $allPassed ? 'ALL_PASSED' : 'SOME_FAILED';
        $this->logTestEnd('FULL CONFIGURATION TEST', $finalResult);
        
        return $this->sendResponse(true, $allPassed ? 'All tests passed' : 'Some tests failed', 200, [
            'results' => $results,
            'allPassed' => $allPassed
        ]);
    }

    private function testMetadata() {
        $this->logTestStart('METADATA GENERATION TEST');
        
        try {
            $this->logTest('METADATA_TEST', 'START', ['step' => 'Checking OneLogin library']);
            
            if (!class_exists('OneLogin\Saml2\Settings')) {
                $this->logTest('METADATA_TEST', 'FAIL', ['error' => 'OneLogin library not loaded']);
                $this->logTestEnd('METADATA GENERATION TEST', 'FAILED');
                return $this->sendResponse(false, 'OneLogin library not loaded', 500);
            }

            $this->logTest('METADATA_TEST', 'INFO', ['step' => 'Loading SAML settings']);
            $settings = $this->samlConfig->getSettings();
            $oneLoginSettings = $this->buildOneLoginSettings($settings);
            
            $this->logTest('METADATA_TEST', 'INFO', [
                'sp_entity_id' => $oneLoginSettings['sp']['entityId'] ?? 'N/A',
                'sp_acs_url' => $oneLoginSettings['sp']['assertionConsumerService']['url'] ?? 'N/A',
                'sp_slo_url' => $oneLoginSettings['sp']['singleLogoutService']['url'] ?? 'N/A'
            ]);
            
            $this->logTest('METADATA_TEST', 'INFO', ['step' => 'Generating metadata XML']);
            $settingsObj = new OneLoginSamlSettings($oneLoginSettings);
            $metadata = $settingsObj->getSPMetadata();
            
            $this->logTest('METADATA_TEST', 'INFO', [
                'metadata_length' => strlen($metadata),
                'metadata_preview' => substr($metadata, 0, 200) . '...'
            ]);
            
            if (strpos($metadata, 'EntityDescriptor') !== false) {
                $hasAcs = strpos($metadata, 'AssertionConsumerService') !== false;
                $hasSlo = strpos($metadata, 'SingleLogoutService') !== false;
                
                $this->logTest('METADATA_TEST', 'PASS', [
                    'has_entity_descriptor' => true,
                    'has_acs' => $hasAcs,
                    'has_slo' => $hasSlo
                ]);
                $this->logTestEnd('METADATA GENERATION TEST', 'SUCCESS');
                
                return $this->sendResponse(true, 'Metadata generated successfully', 200, [
                    'metadata_length' => strlen($metadata),
                    'has_acs' => $hasAcs,
                    'has_slo' => $hasSlo,
                    'metadata_preview' => substr($metadata, 0, 500) . '...'
                ]);
            } else {
                $this->logTest('METADATA_TEST', 'FAIL', ['error' => 'Invalid metadata - missing EntityDescriptor']);
                $this->logTestEnd('METADATA GENERATION TEST', 'FAILED');
                return $this->sendResponse(false, 'Invalid metadata generated', 500);
            }
        } catch (Exception $e) {
            $this->logTest('METADATA_TEST', 'ERROR', [
                'exception' => $e->getMessage(),
                'trace' => substr($e->getTraceAsString(), 0, 500)
            ]);
            $this->logTestEnd('METADATA GENERATION TEST', 'ERROR');
            return $this->sendResponse(false, 'Metadata generation failed: ' . $e->getMessage(), 500);
        }
    }

    private function testIdpConnectivity() {
        $this->logTestStart('IDP CONNECTIVITY TEST');
        
        try {
            $this->logTest('IDP_CONNECTIVITY', 'START', ['step' => 'Loading IdP settings']);
            $settings = $this->samlConfig->getSettings();
            
            // Test IdP SSO URL connectivity
            $ssoUrl = $settings['idp_sso_url'];
            $idpEntityId = $settings['idp_entity_id'] ?? 'Unknown IdP';
            
            $this->logTest('IDP_CONNECTIVITY', 'INFO', [
                'idp_entity_id' => $idpEntityId,
                'idp_sso_url' => $ssoUrl,
                'idp_slo_url' => $settings['idp_slo_url'] ?? 'N/A'
            ]);
            
            if (empty($ssoUrl)) {
                $this->logTest('IDP_CONNECTIVITY', 'FAIL', ['error' => 'SSO URL not configured']);
                $this->logTestEnd('IDP CONNECTIVITY TEST', 'FAILED');
                return $this->sendResponse(false, 'IdP SSO URL not configured', 400);
            }

            // Try to reach the IdP endpoint
            $this->logTest('IDP_CONNECTIVITY', 'INFO', ['step' => 'Initiating cURL request to IdP', 'url' => $ssoUrl]);
            $startTime = microtime(true);
            
            $ch = curl_init($ssoUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // For testing
            curl_setopt($ch, CURLOPT_VERBOSE, true);
            
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
            $totalTime = curl_getinfo($ch, CURLINFO_TOTAL_TIME);
            $error = curl_error($ch);
            $endTime = microtime(true);
            $requestDuration = round(($endTime - $startTime) * 1000, 2);

            $this->logTest('IDP_CONNECTIVITY', 'INFO', [
                'http_code' => $httpCode,
                'content_type' => $contentType,
                'response_time_ms' => $requestDuration,
                'curl_total_time' => $totalTime,
                'response_size' => strlen($response),
                'curl_error' => $error ?: 'none'
            ]);

            if ($error) {
                $this->logTest('IDP_CONNECTIVITY', 'FAIL', [
                    'error' => $error,
                    'url' => $ssoUrl,
                    'idp_name' => $idpEntityId
                ]);
                $this->logTestEnd('IDP CONNECTIVITY TEST', 'FAILED');
                
                return $this->sendResponse(false, 'IdP connectivity failed', 200, [
                    'url' => $ssoUrl,
                    'idp_name' => $idpEntityId,
                    'error' => $error,
                    'reachable' => false
                ]);
            }

            $this->logTest('IDP_CONNECTIVITY', 'PASS', [
                'idp_name' => $idpEntityId,
                'http_code' => $httpCode,
                'response_time_ms' => $requestDuration,
                'reachable' => true
            ]);
            $this->logTestEnd('IDP CONNECTIVITY TEST', 'SUCCESS');
            
            return $this->sendResponse(true, 'IdP is reachable', 200, [
                'url' => $ssoUrl,
                'idp_name' => $idpEntityId,
                'http_code' => $httpCode,
                'reachable' => true,
                'message' => "HTTP $httpCode response from IdP: $idpEntityId"
            ]);

        } catch (Exception $e) {
            $this->logTest('IDP_CONNECTIVITY', 'ERROR', [
                'exception' => $e->getMessage(),
                'trace' => substr($e->getTraceAsString(), 0, 500)
            ]);
            $this->logTestEnd('IDP CONNECTIVITY TEST', 'ERROR');
            return $this->sendResponse(false, 'IdP connectivity test failed: ' . $e->getMessage(), 500);
        }
    }

    private function validateCertificate() {
        $this->logTestStart('CERTIFICATE VALIDATION TEST');
        
        try {
            $this->logTest('CERT_VALIDATION', 'START', ['step' => 'Loading certificate']);
            $settings = $this->samlConfig->getSettings();
            $cert = trim($settings['idp_x509cert']);
            
            if (empty($cert)) {
                $this->logTest('CERT_VALIDATION', 'FAIL', ['error' => 'No certificate configured']);
                $this->logTestEnd('CERTIFICATE VALIDATION TEST', 'FAILED');
                return $this->sendResponse(false, 'No certificate configured', 400);
            }

            $this->logTest('CERT_VALIDATION', 'INFO', [
                'cert_length' => strlen($cert),
                'cert_preview' => substr($cert, 0, 100) . '...'
            ]);

            // Check certificate format
            $hasCertHeader = strpos($cert, '-----BEGIN CERTIFICATE-----') !== false;
            $hasCertFooter = strpos($cert, '-----END CERTIFICATE-----') !== false;
            
            $this->logTest('CERT_VALIDATION', 'INFO', [
                'has_begin_header' => $hasCertHeader,
                'has_end_footer' => $hasCertFooter
            ]);
            
            // Remove headers/footers and whitespace for validation
            $certData = str_replace(['-----BEGIN CERTIFICATE-----', '-----END CERTIFICATE-----', "\n", "\r", ' '], '', $cert);
            
            // Check if it's valid base64
            $isBase64 = base64_decode($certData, true) !== false;
            
            $this->logTest('CERT_VALIDATION', 'INFO', [
                'cert_data_length' => strlen($certData),
                'is_valid_base64' => $isBase64
            ]);
            
            $warnings = [];
            if ($hasCertHeader && $hasCertFooter) {
                $format = 'PEM format (with headers)';
            } elseif (!$hasCertHeader && !$hasCertFooter && $isBase64) {
                $format = 'Base64 format (no headers)';
            } else {
                $format = 'Unknown format';
                $warnings[] = 'Certificate format may be incorrect';
            }

            if (!$isBase64) {
                $warnings[] = 'Certificate does not appear to be valid base64';
            }

            $passed = $isBase64 && (strlen($certData) > 100);

            $this->logTest('CERT_VALIDATION', $passed ? 'PASS' : 'FAIL', [
                'format' => $format,
                'is_base64' => $isBase64,
                'warnings' => $warnings,
                'validation_passed' => $passed
            ]);
            $this->logTestEnd('CERTIFICATE VALIDATION TEST', $passed ? 'SUCCESS' : 'FAILED');

            return $this->sendResponse($passed, $passed ? 'Certificate appears valid' : 'Certificate validation failed', 200, [
                'format' => $format,
                'length' => strlen($cert),
                'has_headers' => $hasCertHeader && $hasCertFooter,
                'is_base64' => $isBase64,
                'warnings' => $warnings,
                'passed' => $passed
            ]);

        } catch (Exception $e) {
            $this->logTest('CERT_VALIDATION', 'ERROR', [
                'exception' => $e->getMessage(),
                'trace' => substr($e->getTraceAsString(), 0, 500)
            ]);
            $this->logTestEnd('CERTIFICATE VALIDATION TEST', 'ERROR');
            return $this->sendResponse(false, 'Certificate validation error: ' . $e->getMessage(), 500);
        }
    }

    private function buildOneLoginSettings($settings) {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $basePath = '';
        $requestUri = $_SERVER['REQUEST_URI'] ?? '';
        if (preg_match('#^/([^/]+)/api/#', $requestUri, $matches)) {
            $basePath = '/' . $matches[1];
        }
        $baseUrl = $scheme . '://' . $host . $basePath;
        
        $idpCert = $settings['idp_x509cert'] ?: 'MIICajCCAdOgAwIBAgIBADANBgkqhkiG9w0BAQ0FADBSMQswCQYDVQQGEwJ1czETMBEGA1UECAwKQ2FsaWZvcm5pYTEVMBMGA1UECgwMT25lbG9naW4gSW5jMRcwFQYDVQQDDA5zcC5leGFtcGxlLmNvbTAeFw0xNDA3MTcxNDEyNTZaFw0xNTA3MTcxNDEyNTZaMFIxCzAJBgNVBAYTAnVzMRMwEQYDVQQIDApDYWxpZm9ybmlhMRUwEwYDVQQKDAxPbmVsb2dpbiBJbmMxFzAVBgNVBAMMDnNwLmV4YW1wbGUuY29tMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDZx+ON4IUoIWxgukTb1tOiX3bMYzYQiwWPUNMp+Fq82xoNogso2bykZG0yiJm5o8zv/sd6pGouayMgkx/2FSOdc36T0jGbCHuRSbtia0PEzNIRtmViMrt3AeoWBidRXmZsxCNLwgIV6PoMR2AgObTt7NU2pEtzFKvOezKCqt5OeQIDAQABo1AwTjAdBgNVHQ4EFgQUGHxYqZYyX7cTxKVODVgZwSTdCnwwHwYDVR0jBBgwFoAUGHxYqZYyX7cTxKVODVgZwSTdCnwwDAYDVR0TBAUwAwEB/zANBgkqhkiG9w0BAQ0FAAOBgQByFOl+hMFICbd3DJfnp2Rgd/dqttsZG/tyhILWvErbio/DEe98mXpowhTkC04ENprOyXi7ZbUqiicF89uAGyt1oqgTUCD1VsLahqIcmrzgumNyTwLGWo17WDAa1/usDhetWAMhgzF/Cnf5ek0nK00m0YZGyc4LzgD0CROMASTWNg==';
        
        return [
            'strict' => $settings['strict'] === '1',
            'debug' => $settings['debug'] === '1',
            'sp' => [
                'entityId' => $settings['sp_entity_id'] ?: $baseUrl . '/saml/metadata',
                'assertionConsumerService' => [
                    'url' => $settings['sp_assertion_consumer_service'] ?: $baseUrl . '/api/saml.php?action=acs',
                ],
                'singleLogoutService' => [
                    'url' => $settings['sp_single_logout_service'] ?: $baseUrl . '/api/saml.php?action=logout',
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
    }

    private function sendResponse($success, $message, $statusCode = 200, $data = null) {
        http_response_code($statusCode);
        
        $response = [
            'success' => $success,
            'message' => $message
        ];

        if ($data !== null) {
            $response['data'] = $data;
        }

        echo json_encode($response);
        return $response;
    }
}

try {
    $api = new SamlTestAPI();
    $api->handleRequest();
} catch (Exception $e) {
    error_log('SAML Test API error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error: ' . $e->getMessage()]);
}

?>
