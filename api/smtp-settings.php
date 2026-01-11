<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/mailer.php';

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
        'enabled' => false
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
        
        $fields = ['host', 'port', 'username', 'password', 'from_email', 'from_name', 'encryption', 'enabled'];
        
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
        
        $result = sendEmail(
            $admin['email'], 
            'LinkNest SMTP Test', 
            'This is a test email from your LinkNest Monitoring Dashboard.', 
            $data
        );
        
        if ($result === true) {
            sendJSON(['success' => true, 'message' => 'Test email sent successfully to ' . $admin['email']]);
        } else {
            sendJSON(['success' => false, 'message' => 'Failed to send email: ' . $result]);
        }
        
    } catch (Exception $e) {
        sendJSON(['success' => false, 'message' => 'Error: ' . $e->getMessage()]);
    }
}
