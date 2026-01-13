<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/email_templates.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';

// Require authentication
requireAuth();

switch ($method) {
    case 'GET':
        handleGetSettings();
        break;
    case 'PUT':
        handleUpdateSettings();
        break;
    case 'POST':
        if ($path === '/test') {
            handleTestConnection();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

function handleGetSettings() {
    $db = getDB();
    $stmt = $db->prepare("SELECT key, value FROM settings WHERE key LIKE 'smtp_%'");
    $stmt->execute();
    $rows = $stmt->fetchAll();
    
    $settings = [
        'host' => '',
        'port' => 587,
        'username' => '',
        'password' => '',
        'from_email' => '',
        'from_name' => 'LinkNest Monitor',
        'encryption' => 'tls',
        'enabled' => false,
        'pause_start' => '',
        'pause_end' => ''
    ];
    
    foreach ($rows as $row) {
        $key = str_replace('smtp_', '', $row['key']);
        $value = $row['value'];
        
        if ($key === 'password' && !empty($value)) {
            // Check if it looks encrypted (starts with 'enc:') or base64
            // For now, just return an empty string or placeholder so we don't expose it
            // The frontend should handle empty/unchanged passwords gracefully
            $value = ''; // Don't send password back
        }
        
        if ($key === 'enabled') {
            $value = ($value === '1' || $value === 'true');
        } elseif ($key === 'port') {
            $value = (int)$value;
        }
        
        $settings[$key] = $value;
    }
    
    sendJSON(['settings' => $settings]);
}

function handleUpdateSettings() {
    $data = getJSONInput();
    $db = getDB();
    $now = time();
    
    try {
        $db->beginTransaction();
        
        $fields = ['host', 'port', 'username', 'password', 'from_email', 'from_name', 'encryption', 'enabled', 'pause_start', 'pause_end'];
        
        foreach ($fields as $field) {
            if (isset($data[$field])) {
                $val = $data[$field];
                
                // Password special handling
                if ($field === 'password') {
                    if (empty($val)) continue; // Don't update if empty (unchanged)
                    // Simple base64 encoding for basic obfuscation in this environment
                    // In a more secure setup, use proper encryption keys
                    $val = base64_encode($val); 
                }
                
                if ($field === 'enabled') {
                    $val = $val ? '1' : '0';
                }
                
                $stmt = $db->prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
                $stmt->execute(['smtp_' . $field, (string)$val, $now]);
            }
        }
        
        $db->commit();
        
        // Return settings (without password)
        handleGetSettings();
        
    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJSON(['error' => 'Failed to save settings: ' . $e->getMessage()], 500);
    }
}

function handleTestConnection() {
    $data = getJSONInput();
    
    try {
        // If password is not provided (edit mode), try to fetch from DB
        if (empty($data['password'])) {
            $db = getDB();
            $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'smtp_password'");
            $stmt->execute();
            $row = $stmt->fetch();
            if ($row) {
                $data['password'] = base64_decode($row['value']);
            }
        }
        
        // Get current admin email as recipient
        $db = getDB();
        $stmt = $db->prepare('SELECT email FROM users WHERE is_admin = 1 LIMIT 1');
        $stmt->execute();
        $admin = $stmt->fetch();
        
        if (!$admin || empty($admin['email'])) {
            throw new Exception("No admin email found to send test to");
        }
        
        // For Mercury mail server, convert email domain to 'localhost' if it ends with '.com' or other extensions
        // Mercury typically accepts @localhost by default
        $testEmail = $admin['email'];
        if (preg_match('/^(.+)@(.+)\.(.+)$/', $testEmail, $matches)) {
            // If email has a domain extension, try using just 'localhost' instead
            // This works better with Mercury's default configuration
            $username = $matches[1];
            $testEmail = $username . '@localhost';
        }
        
        $result = sendEmail(
            $testEmail, 
            'LinkNest SMTP Test', 
            ln_render_smtp_test_email_text($testEmail),
            $data,
            [],
            [
                'html' => ln_render_smtp_test_email_html($testEmail),
                'text' => ln_render_smtp_test_email_text($testEmail)
            ]
        );
        
        if ($result === true) {
            sendJSON(['success' => true, 'message' => 'Test email sent successfully to ' . $testEmail . ' (converted from ' . $admin['email'] . ' for Mercury compatibility)']);
        } else {
            // If localhost conversion failed, provide helpful error message
            $errorMsg = 'Failed to send email: ' . $result;
            if (strpos($result, '550') !== false) {
                $errorMsg .= ' | Tip: For Mercury mail server, use email addresses with @localhost domain (e.g., ' . $username . '@localhost) or add the user to Mercury via its web interface.';
            }
            sendJSON(['success' => false, 'message' => $errorMsg]);
        }
        
    } catch (Exception $e) {
        sendJSON(['success' => false, 'message' => 'Error: ' . $e->getMessage()]);
    }
}
