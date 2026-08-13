<?php
/**
 * LinkNest Backup & Restore Management Page - Docker Version
 * 
 * Standalone page for managing database backups and restores.
 * Optimized specifically for Docker containers (Windows).
 * Uses Docker container paths (/var/www/html/data/...)
 * 
 * Authentication: admin / password123
 */

// Isolate session cookies per install folder (/ArchLinks vs /ERP3) before session_start().
require_once __DIR__ . '/api/session_bootstrap.php';
linknestConfigureSession();

// Simple authentication
session_start();

// Branding configuration file (load early so it's available everywhere)
// Docker: Use forward slashes (Linux paths in container)
$brandingFile = __DIR__ . '/data/backup_branding.json';

// Function to load branding and settings
function loadBranding($file) {
    if (file_exists($file)) {
        $content = @file_get_contents($file);
        if ($content) {
            $data = @json_decode($content, true);
            if ($data) {
                return $data;
            }
        }
    }
    return ['brand_name' => 'LinkNest', 'password_hash' => null]; // Default values
}

// Function to save branding and settings
function saveBranding($file, $brandName, $passwordHash = null) {
    // Load existing data to preserve password hash if not changing
    $existing = loadBranding($file);
    $data = [
        'brand_name' => trim($brandName),
        'password_hash' => $passwordHash !== null ? $passwordHash : ($existing['password_hash'] ?? null)
    ];
    $dir = dirname($file);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return @file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT));
}

// Function to load backup settings
function loadBackupSettings($file) {
    if (file_exists($file)) {
        $content = @file_get_contents($file);
        if ($content) {
            $data = @json_decode($content, true);
            if ($data) {
                return $data;
            }
        }
    }
    return ['backup_method' => 'vacuum_into']; // Default method
}

// Function to save backup settings
function saveBackupSettings($file, $settings) {
    $dir = dirname($file);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return @file_put_contents($file, json_encode($settings, JSON_PRETTY_PRINT));
}

// Load branding early
$brandingData = loadBranding($brandingFile);
$brandName = $brandingData['brand_name'] ?? 'LinkNest';
$storedPasswordHash = $brandingData['password_hash'] ?? null;

// Backup settings file
// Docker: Use forward slashes (Linux paths in container)
$backupSettingsFile = __DIR__ . '/data/backup_settings.json';
$backupSettings = loadBackupSettings($backupSettingsFile);
$backupMethod = $backupSettings['backup_method'] ?? 'vacuum_into';

// Authentication credentials
define('BACKUP_USERNAME', 'admin');
// Use stored password hash if available, otherwise use default password
define('BACKUP_PASSWORD', 'password123'); // Default password (only used if no hash is stored)

// Check if user is logged in
$isLoggedIn = isset($_SESSION['backup_authenticated']) && $_SESSION['backup_authenticated'] === true;

// Handle login
if (isset($_POST['login'])) {
    $username = $_POST['username'] ?? '';
    $password = $_POST['password'] ?? '';
    
    $passwordValid = false;
    
    // Check if we have a stored password hash
    if ($storedPasswordHash !== null && !empty($storedPasswordHash)) {
        // Verify against stored hash
        $passwordValid = password_verify($password, $storedPasswordHash);
    } else {
        // Fall back to default password for backward compatibility
        $passwordValid = ($password === BACKUP_PASSWORD);
    }
    
    if ($username === BACKUP_USERNAME && $passwordValid) {
        $_SESSION['backup_authenticated'] = true;
        $isLoggedIn = true;
        header('Location: ' . $_SERVER['PHP_SELF']);
        exit;
    } else {
        $loginError = 'Invalid username or password';
    }
}

// Handle logout
if (isset($_GET['logout'])) {
    session_destroy();
    header('Location: ' . $_SERVER['PHP_SELF']);
    exit;
}

// Handle direct download requests FIRST (completely bypass config.php)
if ($isLoggedIn && isset($_GET['action']) && ($_GET['action'] === 'download_export_zip' || $_GET['action'] === 'download_snapshot_zip')) {
    $action = $_GET['action'];
    
    // Handle snapshot ZIP download
    if ($action === 'download_snapshot_zip') {
        // Clear all output buffers
        while (ob_get_level()) {
            ob_end_clean();
        }
        
        // Disable error display and set custom error handler
        ini_set('display_errors', 0);
        error_reporting(E_ALL);
        
        // Set custom error handler that doesn't output
        set_error_handler(function($errno, $errstr, $errfile, $errline) {
            error_log("ZIP Download Error [$errno]: $errstr in $errfile on line $errline");
            return true; // Suppress error
        }, E_ALL);
        
        // Set custom exception handler
        set_exception_handler(function($exception) {
            while (ob_get_level()) {
                ob_end_clean();
            }
            error_log("ZIP Download Exception: " . $exception->getMessage() . " in " . $exception->getFile() . " on line " . $exception->getLine());
            if (!headers_sent()) {
                http_response_code(500);
                header('Content-Type: application/json');
                echo json_encode(['error' => 'Failed to create ZIP: ' . $exception->getMessage()]);
            }
            exit;
        });
        
        // Check if ZipArchive is available
        if (!class_exists('ZipArchive')) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'ZipArchive extension is not available. Please enable the zip extension in PHP.']);
            exit;
        }
        
        $filename = $_GET['filename'] ?? '';
        
        if (empty($filename)) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Filename required']);
            exit;
        }
        
        // Security check
        if (strpos($filename, '..') !== false || strpos($filename, '/') !== false || strpos($filename, '\\') !== false) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Invalid filename']);
            exit;
        }
        
        // Determine DB_DIR without loading config.php
        // Docker: Use forward slashes (Linux paths in container)
        $dbDir = __DIR__ . '/data';
        if (!is_dir($dbDir)) {
            $dbDir = dirname(__DIR__) . '/data';
        }
        
        // Get custom snapshot path from session
        $customSnapshotPath = $_SESSION['custom_snapshot_path'] ?? $dbDir . '/backups';
        $snapshotPath = rtrim($customSnapshotPath, '/') . '/' . $filename;
        
        if (!file_exists($snapshotPath)) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Snapshot file not found: ' . $snapshotPath]);
            exit;
        }
        
        try {
            // Create ZIP file
            $zipFileName = str_replace('.db', '', $filename) . '.zip';
            $tempDir = sys_get_temp_dir();
            if (!is_writable($tempDir)) {
                // Fallback to a writable directory
                $tempDir = ini_get('upload_tmp_dir') ?: sys_get_temp_dir();
                if (!is_writable($tempDir)) {
                    // Last resort: use snapshot directory itself
                    $tempDir = $customSnapshotPath;
                }
            }
            $zipPath = $tempDir . '/' . $zipFileName;
            
            // Clean up any existing file with the same name
            if (file_exists($zipPath)) {
                @unlink($zipPath);
            }
            
            $zip = new ZipArchive();
            $result = $zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
            
            if ($result !== TRUE) {
                $errorMsg = 'Failed to create ZIP file';
                switch ($result) {
                    case ZipArchive::ER_EXISTS:
                        $errorMsg = 'ZIP file already exists';
                        break;
                    case ZipArchive::ER_INCONS:
                        $errorMsg = 'ZIP archive inconsistent';
                        break;
                    case ZipArchive::ER_INVAL:
                        $errorMsg = 'Invalid argument';
                        break;
                    case ZipArchive::ER_MEMORY:
                        $errorMsg = 'Memory allocation failure';
                        break;
                    case ZipArchive::ER_NOZIP:
                        $errorMsg = 'Not a ZIP archive';
                        break;
                    case ZipArchive::ER_OPEN:
                        $errorMsg = 'Cannot open ZIP file';
                        break;
                    case ZipArchive::ER_READ:
                        $errorMsg = 'Read error';
                        break;
                    case ZipArchive::ER_SEEK:
                        $errorMsg = 'Seek error';
                        break;
                }
                http_response_code(500);
                header('Content-Type: application/json');
                echo json_encode(['error' => $errorMsg . ' (Code: ' . $result . ')']);
                exit;
            }
            
            // Add the snapshot .db file
            if (!$zip->addFile($snapshotPath, $filename)) {
                $zip->close();
                @unlink($zipPath);
                http_response_code(500);
                header('Content-Type: application/json');
                echo json_encode(['error' => 'Failed to add snapshot file to ZIP']);
                exit;
            }
            
            // Add metadata file if it exists
            $metaFile = $snapshotPath . '.json';
            if (file_exists($metaFile)) {
                $zip->addFile($metaFile, basename($metaFile));
            }
            
            $zip->close();
            
            if (!file_exists($zipPath) || filesize($zipPath) === 0) {
                http_response_code(500);
                header('Content-Type: application/json');
                echo json_encode(['error' => 'ZIP file was not created or is empty']);
                exit;
            }
            
            // Clear all output buffers before sending file
            while (ob_get_level()) {
                ob_end_clean();
            }
            
            // Send file to browser - NO JSON headers, just binary
            header('Content-Type: application/zip');
            header('Content-Disposition: attachment; filename="' . $zipFileName . '"');
            header('Content-Length: ' . filesize($zipPath));
            header('Cache-Control: no-cache, must-revalidate');
            header('Pragma: no-cache');
            header('Expires: 0');
            
            // Disable any compression
            if (function_exists('apache_setenv')) {
                @apache_setenv('no-gzip', 1);
            }
            @ini_set('zlib.output_compression', 0);
            
            readfile($zipPath);
            @unlink($zipPath); // Clean up
            exit;
        } catch (Exception $e) {
            if (isset($zip) && $zip) {
                @$zip->close();
            }
            if (isset($zipPath) && file_exists($zipPath)) {
                @unlink($zipPath);
            }
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Failed to create ZIP: ' . $e->getMessage()]);
            exit;
        } catch (Error $e) {
            if (isset($zip) && $zip) {
                @$zip->close();
            }
            if (isset($zipPath) && file_exists($zipPath)) {
                @unlink($zipPath);
            }
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Failed to create ZIP: ' . $e->getMessage()]);
            exit;
        }
    }
    
    // Handle export ZIP download (existing code)
    if ($action === 'download_export_zip') {
        // Clear all output buffers
        while (ob_get_level()) {
            ob_end_clean();
        }
        
        // Disable error display and set custom error handler
        ini_set('display_errors', 0);
        error_reporting(E_ALL);
        
        // Set custom error handler that doesn't output
        set_error_handler(function($errno, $errstr, $errfile, $errline) {
            error_log("ZIP Download Error [$errno]: $errstr in $errfile on line $errline");
            return true; // Suppress error
        }, E_ALL);
        
        // Set custom exception handler
        set_exception_handler(function($exception) {
            while (ob_get_level()) {
                ob_end_clean();
            }
            error_log("ZIP Download Exception: " . $exception->getMessage() . " in " . $exception->getFile() . " on line " . $exception->getLine());
            if (!headers_sent()) {
                http_response_code(500);
                header('Content-Type: application/json');
                echo json_encode(['error' => 'Failed to create ZIP: ' . $exception->getMessage()]);
            }
            exit;
        });
        
        // Check if ZipArchive is available
        if (!class_exists('ZipArchive')) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'ZipArchive extension is not available. Please enable the zip extension in PHP.']);
            exit;
        }
        
        $dirname = $_GET['dirname'] ?? '';
        
        if (empty($dirname)) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Directory name required']);
            exit;
        }
        
        // Security check
        if (strpos($dirname, '..') !== false || strpos($dirname, '/') !== false || strpos($dirname, '\\') !== false) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Invalid directory name']);
            exit;
        }
        
        // Determine DB_DIR without loading config.php
        // Docker: Use forward slashes (Linux paths in container)
        $dbDir = __DIR__ . '/data';
        if (!is_dir($dbDir)) {
            $dbDir = dirname(__DIR__) . '/data';
        }
        
        // Get custom export path from session
        $customExportPath = $_SESSION['custom_export_path'] ?? $dbDir . '/backups';
        $exportDir = rtrim($customExportPath, '/') . '/' . $dirname;
        
        if (!is_dir($exportDir)) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Export directory not found: ' . $exportDir]);
            exit;
        }
        
        try {
            // Create ZIP file
            $zipFileName = $dirname . '.zip';
            $tempDir = sys_get_temp_dir();
            if (!is_writable($tempDir)) {
                // Fallback to a writable directory
                $tempDir = ini_get('upload_tmp_dir') ?: sys_get_temp_dir();
                if (!is_writable($tempDir)) {
                    // Last resort: use export directory itself
                    $tempDir = $exportDir;
                }
            }
            $zipPath = $tempDir . '/' . $zipFileName;
            
            // Clean up any existing file with the same name
            if (file_exists($zipPath)) {
                @unlink($zipPath);
            }
            
            $zip = new ZipArchive();
            $result = $zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
            
            if ($result !== TRUE) {
                $errorMsg = 'Failed to create ZIP file';
                switch ($result) {
                    case ZipArchive::ER_EXISTS:
                        $errorMsg = 'ZIP file already exists';
                        break;
                    case ZipArchive::ER_INCONS:
                        $errorMsg = 'ZIP archive inconsistent';
                        break;
                    case ZipArchive::ER_INVAL:
                        $errorMsg = 'Invalid argument';
                        break;
                    case ZipArchive::ER_MEMORY:
                        $errorMsg = 'Memory allocation failure';
                        break;
                    case ZipArchive::ER_NOZIP:
                        $errorMsg = 'Not a ZIP archive';
                        break;
                    case ZipArchive::ER_OPEN:
                        $errorMsg = 'Cannot open ZIP file';
                        break;
                    case ZipArchive::ER_READ:
                        $errorMsg = 'Read error';
                        break;
                    case ZipArchive::ER_SEEK:
                        $errorMsg = 'Seek error';
                        break;
                }
                http_response_code(500);
                header('Content-Type: application/json');
                echo json_encode(['error' => $errorMsg . ' (Code: ' . $result . ')']);
                exit;
            }
            
            // Use numeric value 0 (LEAVES_ONLY) for compatibility
            $files = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($exportDir, RecursiveDirectoryIterator::SKIP_DOTS),
                0  // LEAVES_ONLY = 0 (only iterate over leaves, not directories)
            );
            
            $fileCount = 0;
            foreach ($files as $file) {
                if ($file->isFile()) {
                    $filePath = $file->getRealPath();
                    $relativePath = str_replace($exportDir . '/', '', $filePath);
                    $relativePath = str_replace('\\', '/', $relativePath); // Normalize path separators
                    
                    if ($zip->addFile($filePath, $relativePath)) {
                        $fileCount++;
                    }
                }
            }
            
            if ($fileCount === 0) {
                $zip->close();
                @unlink($zipPath);
                http_response_code(404);
                header('Content-Type: application/json');
                echo json_encode(['error' => 'No files found in export directory']);
                exit;
            }
            
            $zip->close();
            
            if (!file_exists($zipPath) || filesize($zipPath) === 0) {
                http_response_code(500);
                header('Content-Type: application/json');
                echo json_encode(['error' => 'ZIP file was not created or is empty']);
                exit;
            }
            
            // Clear all output buffers before sending file
            while (ob_get_level()) {
                ob_end_clean();
            }
            
            // Send file to browser - NO JSON headers, just binary
            header('Content-Type: application/zip');
            header('Content-Disposition: attachment; filename="' . $zipFileName . '"');
            header('Content-Length: ' . filesize($zipPath));
            header('Cache-Control: no-cache, must-revalidate');
            header('Pragma: no-cache');
            header('Expires: 0');
            
            // Disable any compression
            if (function_exists('apache_setenv')) {
                @apache_setenv('no-gzip', 1);
            }
            @ini_set('zlib.output_compression', 0);
            
            readfile($zipPath);
            @unlink($zipPath); // Clean up
            exit;
        } catch (Exception $e) {
            if (isset($zip) && $zip) {
                @$zip->close();
            }
            if (isset($zipPath) && file_exists($zipPath)) {
                @unlink($zipPath);
            }
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Failed to create ZIP: ' . $e->getMessage()]);
            exit;
        } catch (Error $e) {
            if (isset($zip) && $zip) {
                @$zip->close();
            }
            if (isset($zipPath) && file_exists($zipPath)) {
                @unlink($zipPath);
            }
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Failed to create ZIP: ' . $e->getMessage()]);
            exit;
        }
    }
}

// If not logged in, show login form
if (!$isLoggedIn) {
    ?>
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title><?php echo htmlspecialchars($brandName); ?> Backup - Login</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .login-container {
                background: white;
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                padding: 40px;
                width: 100%;
                max-width: 400px;
            }
            .login-header {
                text-align: center;
                margin-bottom: 30px;
            }
            .login-header h1 {
                color: #374151;
                font-size: 28px;
                margin-bottom: 8px;
            }
            .login-header p {
                color: #6b7280;
                font-size: 14px;
            }
            .form-group {
                margin-bottom: 20px;
            }
            .form-group label {
                display: block;
                color: #374151;
                font-size: 14px;
                font-weight: 500;
                margin-bottom: 8px;
            }
            .form-group input {
                width: 100%;
                padding: 12px;
                border: 2px solid #e5e7eb;
                border-radius: 8px;
                font-size: 14px;
                transition: border-color 0.2s;
            }
            .form-group input:focus {
                outline: none;
                border-color: #6b7280;
            }
            .btn {
                width: 100%;
                padding: 12px;
                background: #374151;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.2s;
            }
            .btn:hover {
                background: #4b5563;
            }
            .error {
                background: #fee2e2;
                color: #991b1b;
                padding: 12px;
                border-radius: 8px;
                margin-bottom: 20px;
                font-size: 14px;
            }
        </style>
    </head>
    <body>
        <div class="login-container">
            <div class="login-header">
                <h1>🔒 <?php echo htmlspecialchars($brandName); ?> Backup</h1>
                <p>Please login to continue</p>
            </div>
            <?php if (isset($loginError)): ?>
                <div class="error"><?php echo htmlspecialchars($loginError); ?></div>
            <?php endif; ?>
            <form method="POST">
                <div class="form-group">
                    <label for="username">Username</label>
                    <input type="text" id="username" name="username" required autofocus>
                </div>
                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" name="password" required>
                </div>
                <button type="submit" name="login" class="btn">Login</button>
            </form>
        </div>
    </body>
    </html>
    <?php
    exit;
}

// Load configuration (but disable exception handler temporarily for download)
$originalExceptionHandler = set_exception_handler(null);
require_once __DIR__ . '/api/config.php';
// Restore exception handler after config loads
if ($originalExceptionHandler) {
    set_exception_handler($originalExceptionHandler);
}

// Handle branding save
if (isset($_POST['save_branding']) && $isLoggedIn) {
    $newBrandName = $_POST['brand_name'] ?? '';
    if (!empty(trim($newBrandName))) {
        if (saveBranding($brandingFile, $newBrandName)) {
            $brandName = trim($newBrandName);
            $brandingData['brand_name'] = $brandName;
            $_SESSION['brand_saved'] = true;
            header('Location: ' . $_SERVER['PHP_SELF'] . '?tab=settings');
            exit;
        }
    }
}

// Handle password change
if (isset($_POST['change_password']) && $isLoggedIn) {
    $currentPassword = $_POST['current_password'] ?? '';
    $newPassword = $_POST['new_password'] ?? '';
    $confirmPassword = $_POST['confirm_password'] ?? '';
    
    // Verify current password
    $currentPasswordValid = false;
    if ($storedPasswordHash !== null && !empty($storedPasswordHash)) {
        $currentPasswordValid = password_verify($currentPassword, $storedPasswordHash);
    } else {
        $currentPasswordValid = ($currentPassword === BACKUP_PASSWORD);
    }
    
    if (!$currentPasswordValid) {
        $_SESSION['password_error'] = 'Current password is incorrect';
    } elseif (empty($newPassword) || strlen($newPassword) < 6) {
        $_SESSION['password_error'] = 'New password must be at least 6 characters long';
    } elseif ($newPassword !== $confirmPassword) {
        $_SESSION['password_error'] = 'New password and confirmation do not match';
    } else {
        // Hash the new password
        $newPasswordHash = password_hash($newPassword, PASSWORD_DEFAULT);
        if (saveBranding($brandingFile, $brandName, $newPasswordHash)) {
            $storedPasswordHash = $newPasswordHash;
            $brandingData['password_hash'] = $newPasswordHash;
            $_SESSION['password_saved'] = true;
            header('Location: ' . $_SERVER['PHP_SELF'] . '?tab=settings');
            exit;
        } else {
            $_SESSION['password_error'] = 'Failed to save new password';
        }
    }
    header('Location: ' . $_SERVER['PHP_SELF'] . '?tab=settings');
    exit;
}

// Handle branding reset
if (isset($_GET['reset_branding']) && $isLoggedIn) {
    // Preserve password hash when resetting branding
    $passwordHash = $storedPasswordHash;
    if (file_exists($brandingFile)) {
        // Only reset brand name, keep password
        saveBranding($brandingFile, 'LinkNest', $passwordHash);
    }
    $brandName = 'LinkNest';
    $brandingData['brand_name'] = 'LinkNest';
    header('Location: ' . $_SERVER['PHP_SELF'] . '?tab=settings');
    exit;
}

// Handle backup settings save
if (isset($_POST['save_backup_settings']) && $isLoggedIn) {
    $newMethod = $_POST['backup_method'] ?? 'vacuum_into';
    $validMethods = ['vacuum_into', 'online_backup', 'file_copy', 'begin_immediate'];
    if (in_array($newMethod, $validMethods)) {
        $backupSettings['backup_method'] = $newMethod;
        if (saveBackupSettings($backupSettingsFile, $backupSettings)) {
            $backupMethod = $newMethod;
            $_SESSION['backup_settings_saved'] = true;
            header('Location: ' . $_SERVER['PHP_SELF'] . '?tab=settings');
            exit;
        }
    }
}

// Handle backup settings reset
if (isset($_GET['reset_backup_settings']) && $isLoggedIn) {
    if (file_exists($backupSettingsFile)) {
        @unlink($backupSettingsFile);
    }
    $backupMethod = 'vacuum_into';
    $backupSettings = ['backup_method' => 'vacuum_into'];
    header('Location: ' . $_SERVER['PHP_SELF'] . '?tab=settings');
    exit;
}

// Custom backup paths (stored in session, can be saved to file)
// Docker: Default to container paths using forward slashes
$defaultBackupPath = defined('DB_DIR') ? DB_DIR . '/backups' : '/var/www/html/data/backups';
$customBackupPath = $_SESSION['custom_backup_path'] ?? $defaultBackupPath;
$customSnapshotPath = $_SESSION['custom_snapshot_path'] ?? $customBackupPath;
$customExportPath = $_SESSION['custom_export_path'] ?? $customBackupPath;

// Handle custom path settings
if (isset($_POST['save_paths']) && $isLoggedIn) {
    $_SESSION['custom_backup_path'] = $_POST['backup_path'] ?? DB_DIR . '/backups';
    $_SESSION['custom_snapshot_path'] = $_POST['snapshot_path'] ?? $_SESSION['custom_backup_path'];
    $_SESSION['custom_export_path'] = $_POST['export_path'] ?? $_SESSION['custom_backup_path'];
    header('Location: ' . $_SERVER['PHP_SELF']);
    exit;
}

// Reset to default paths
if (isset($_GET['reset_paths']) && $isLoggedIn) {
    unset($_SESSION['custom_backup_path']);
    unset($_SESSION['custom_snapshot_path']);
    unset($_SESSION['custom_export_path']);
    header('Location: ' . $_SERVER['PHP_SELF']);
    exit;
}

// Helper functions
function formatBytes($bytes, $precision = 2) {
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= pow(1024, $pow);
    return round($bytes, $precision) . ' ' . $units[$pow];
}

function getSnapshots() {
    global $customSnapshotPath;
    $backupsDir = $customSnapshotPath;
    if (!file_exists($backupsDir)) {
        return [];
    }
    
    $files = glob($backupsDir . '/linknest-snapshot-*.db');
    $snapshots = [];
    
    foreach ($files as $file) {
        $filename = basename($file);
        $metaFile = $file . '.json';
        $meta = file_exists($metaFile) ? json_decode(file_get_contents($metaFile), true) : null;
        
        $snapshots[] = [
            'filename' => $filename,
            'path' => $file,
            'size' => filesize($file),
            'created_at' => filemtime($file),
            'metadata' => $meta
        ];
    }
    
    // Sort by creation time descending
    usort($snapshots, function($a, $b) {
        return $b['created_at'] - $a['created_at'];
    });
    
    return $snapshots;
}

function getExports() {
    global $customExportPath;
    $backupsDir = $customExportPath;
    if (!file_exists($backupsDir)) {
        return [];
    }
    
    $dirs = glob($backupsDir . '/export_*', GLOB_ONLYDIR);
    $exports = [];
    
    foreach ($dirs as $dir) {
        $dirname = basename($dir);
        $metadataFile = $dir . '/metadata.json';
        
        $metadata = null;
        if (file_exists($metadataFile)) {
            $metadata = json_decode(file_get_contents($metadataFile), true);
        }
        
        // Calculate total size of directory
        $size = 0;
        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS)
        );
        foreach ($files as $file) {
            $size += $file->getSize();
        }
        
        $exports[] = [
            'dirname' => $dirname,
            'path' => $dir,
            'size' => $size,
            'created_at' => filemtime($dir),
            'metadata' => $metadata
        ];
    }
    
    // Sort by creation time descending
    usort($exports, function($a, $b) {
        return $b['created_at'] - $a['created_at'];
    });
    
    return $exports;
}

function getDatabaseInfo() {
    $info = [
        'exists' => false,
        'path' => DB_PATH,
        'absolute_path' => null,
        'file_size' => 0,
        'modified' => null,
        'readable' => false,
        'writable' => false,
        'pragmas' => [],
        'wal_info' => [],
        'page_info' => [],
        'error' => null
    ];
    
    if (!file_exists(DB_PATH)) {
        $info['error'] = 'Database file not found';
        return $info;
    }
    
    $info['exists'] = true;
    $info['absolute_path'] = realpath(DB_PATH) ?: DB_PATH;
    $info['file_size'] = filesize(DB_PATH);
    $info['modified'] = filemtime(DB_PATH);
    $info['readable'] = is_readable(DB_PATH);
    $info['writable'] = is_writable(DB_PATH);
    
    try {
        // Try to use getDB() from config, otherwise create direct connection
        try {
            $db = getDB();
        } catch (Exception $e) {
            $db = new PDO('sqlite:' . DB_PATH);
            $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        }
        
        // Get PRAGMA settings
        $pragmas = [
            'journal_mode',
            'synchronous',
            'cache_size',
            'page_size',
            'temp_store',
            'busy_timeout',
            'foreign_keys',
            'wal_autocheckpoint',
            'user_version',
            'application_id'
        ];
        
        foreach ($pragmas as $pragma) {
            try {
                $stmt = $db->query("PRAGMA {$pragma}");
                $result = $stmt->fetch(PDO::FETCH_NUM);
                $info['pragmas'][$pragma] = $result[0] ?? 'N/A';
            } catch (PDOException $e) {
                $info['pragmas'][$pragma] = 'Error';
            }
        }
        
        // Get page information
        try {
            $info['page_info']['page_count'] = (int)$db->query('PRAGMA page_count')->fetchColumn();
            $info['page_info']['page_size'] = (int)$db->query('PRAGMA page_size')->fetchColumn();
            $info['page_info']['freelist_count'] = (int)$db->query('PRAGMA freelist_count')->fetchColumn();
            $info['page_info']['calculated_size'] = $info['page_info']['page_count'] * $info['page_info']['page_size'];
        } catch (PDOException $e) {
            $info['page_info'] = ['error' => $e->getMessage()];
        }
        
        // Get WAL file information if in WAL mode
        if (isset($info['pragmas']['journal_mode']) && strtolower($info['pragmas']['journal_mode']) === 'wal') {
            $walFile = DB_PATH . '-wal';
            $shmFile = DB_PATH . '-shm';
            
            $info['wal_info']['wal_exists'] = file_exists($walFile);
            $info['wal_info']['wal_size'] = $info['wal_info']['wal_exists'] ? filesize($walFile) : 0;
            $info['wal_info']['wal_path'] = $walFile;
            
            $info['wal_info']['shm_exists'] = file_exists($shmFile);
            $info['wal_info']['shm_size'] = $info['wal_info']['shm_exists'] ? filesize($shmFile) : 0;
            $info['wal_info']['shm_path'] = $shmFile;
            
            // Get WAL checkpoint info
            try {
                $info['wal_info']['wal_checkpoint'] = $db->query('PRAGMA wal_checkpoint')->fetchAll(PDO::FETCH_ASSOC);
            } catch (PDOException $e) {
                $info['wal_info']['wal_checkpoint'] = null;
            }
        } else {
            $info['wal_info']['wal_exists'] = false;
            $info['wal_info']['wal_size'] = 0;
            $info['wal_info']['shm_exists'] = false;
            $info['wal_info']['shm_size'] = 0;
        }
        
        // Get table count
        try {
            $tables = $db->query("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")->fetchColumn();
            $info['table_count'] = (int)$tables;
        } catch (PDOException $e) {
            $info['table_count'] = 0;
        }
        
    } catch (Exception $e) {
        $info['error'] = 'Error accessing database: ' . $e->getMessage();
    }
    
    return $info;
}


// Handle AJAX requests
if (isset($_SERVER['HTTP_X_REQUESTED_WITH']) && $_SERVER['HTTP_X_REQUESTED_WITH'] === 'XMLHttpRequest') {
    header('Content-Type: application/json');
    
    // Check authentication for AJAX requests
    if (!$isLoggedIn) {
        http_response_code(401);
        echo json_encode(['error' => 'Authentication required. Please log in.']);
        exit;
    }
    
    $action = $_POST['action'] ?? $_GET['action'] ?? '';
    
    try {
        switch ($action) {
            case 'create_snapshot':
                // Create snapshot backup directly (bypass snapshot.php authentication)
                try {
                    global $customSnapshotPath;
                    $backupsDir = $customSnapshotPath;
                    
                    if (!file_exists($backupsDir)) {
                        if (!mkdir($backupsDir, 0755, true)) {
                            throw new Exception("Failed to create backups directory: $backupsDir");
                        }
                    }
                    
                    $timestamp = date('Y-m-d-His');
                    $filename = 'linknest-snapshot-' . $timestamp . '.db';
                    $destPath = rtrim($backupsDir, '/') . '/' . $filename;
                    
                    // Get database connection
                    try {
                        $db = getDB();
                    } catch (Exception $e) {
                        $db = new PDO('sqlite:' . DB_PATH);
                        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                    }
                    
                    // Use selected backup method
                    global $backupMethod, $backupSettings;
                    $selectedMethod = $backupMethod ?? 'vacuum_into';
                    $method = 'VACUUM INTO'; // Default
                    $absDestPath = realpath($backupsDir) . '/' . $filename;
                    
                    switch ($selectedMethod) {
                        case 'vacuum_into':
                            // VACUUM INTO - Best for consistency, requires SQLite 3.27.0+
                            // Creates a clean, compacted snapshot
                            try {
                                $db->exec("VACUUM INTO " . $db->quote($absDestPath));
                                $method = 'VACUUM INTO';
                            } catch (PDOException $e) {
                                // Fallback to file copy if VACUUM INTO not supported
                                if (!copy(DB_PATH, $destPath)) {
                                    throw new Exception("Failed to copy database file to $destPath");
                                }
                                $method = 'file copy (VACUUM INTO fallback)';
                            }
                            break;
                            
                        case 'online_backup':
                            // Online Backup API - Best for live databases with minimal blocking
                            // Uses SQLite's backup API for incremental copying
                            try {
                                // SQLite backup using SQLite3 extension if available
                                if (class_exists('SQLite3')) {
                                    $source = new SQLite3(DB_PATH, SQLITE3_OPEN_READONLY);
                                    $dest = new SQLite3($absDestPath);
                                    $source->backup($dest);
                                    $source->close();
                                    $dest->close();
                                    $method = 'Online Backup API';
                                } else {
                                    // Fallback: Use BEGIN IMMEDIATE for consistency (similar to online backup behavior)
                                    $db->exec('BEGIN IMMEDIATE');
                                    if (!copy(DB_PATH, $destPath)) {
                                        $db->exec('ROLLBACK');
                                        throw new Exception("Failed to copy database file");
                                    }
                                    $db->exec('COMMIT');
                                    $method = 'Online Backup (BEGIN IMMEDIATE fallback)';
                                }
                            } catch (Exception $e) {
                                // Fallback to file copy
                                if (!copy(DB_PATH, $destPath)) {
                                    throw new Exception("Failed to create backup: " . $e->getMessage());
                                }
                                $method = 'file copy (Online Backup fallback)';
                            }
                            break;
                            
                        case 'begin_immediate':
                            // BEGIN IMMEDIATE + Copy - Locks database then copies
                            // Good balance between consistency and speed
                            try {
                                $db->exec('BEGIN IMMEDIATE');
                                if (!copy(DB_PATH, $destPath)) {
                                    $db->exec('ROLLBACK');
                                    throw new Exception("Failed to copy database file");
                                }
                                $db->exec('COMMIT');
                                $method = 'BEGIN IMMEDIATE + Copy';
                            } catch (Exception $e) {
                                $db->exec('ROLLBACK');
                                throw new Exception("Failed to create backup: " . $e->getMessage());
                            }
                            break;
                            
                        case 'file_copy':
                        default:
                            // Simple file copy - Fastest but less safe during writes
                            if (!copy(DB_PATH, $destPath)) {
                                throw new Exception("Failed to copy database file to $destPath");
                            }
                            $method = 'File Copy';
                            break;
                    }
                    
                    // Create a .json metadata file for the snapshot
                    $metadata = [
                        'timestamp' => time(),
                        'date' => date('Y-m-d H:i:s'),
                        'filename' => $filename,
                        'method' => $method,
                        'size' => filesize($destPath)
                    ];
                    file_put_contents($destPath . '.json', json_encode($metadata, JSON_PRETTY_PRINT));
                    
                    // Clean up old backups (keep last 30 days)
                    $files = glob(rtrim($backupsDir, '/') . '/linknest-snapshot-*.db');
                    $now = time();
                    $deleted = 0;
                    foreach ($files as $file) {
                        if ($now - filemtime($file) > 30 * 24 * 60 * 60) {
                            @unlink($file);
                            // Also delete metadata file if it exists
                            if (file_exists($file . '.json')) {
                                @unlink($file . '.json');
                            }
                            $deleted++;
                        }
                    }
                    
                    echo json_encode([
                        'success' => true,
                        'message' => 'Database snapshot created successfully',
                        'data' => [
                            'filename' => $filename,
                            'path' => $destPath,
                            'size' => filesize($destPath),
                            'method' => $method,
                            'backups_count' => count($files) - $deleted + 1,
                            'deleted_old' => $deleted
                        ]
                    ]);
                } catch (Exception $e) {
                    echo json_encode(['success' => false, 'error' => 'Failed to create snapshot: ' . $e->getMessage()]);
                }
                exit;
                
            case 'create_export':
                // Create export backup
                $dbPath = DB_PATH;
                $exportScript = __DIR__ . '/scripts/export_database.php';
                
                if (!file_exists($exportScript)) {
                    echo json_encode(['success' => false, 'error' => 'Export script not found']);
                    exit;
                }
                
                if (!file_exists($dbPath)) {
                    echo json_encode(['success' => false, 'error' => 'Database file not found']);
                    exit;
                }
                
                global $customExportPath;
                $outputDir = $customExportPath . '/export_' . date('Y-m-d_His');
                
                // Ensure backups directory exists
                $backupsDir = DB_DIR . '/backups';
                if (!file_exists($backupsDir)) {
                    if (!mkdir($backupsDir, 0755, true)) {
                        echo json_encode(['success' => false, 'error' => 'Failed to create backups directory']);
                        exit;
                    }
                }
                
                // Execute export script
                $command = sprintf(
                    'php %s %s %s 2>&1',
                    escapeshellarg($exportScript),
                    escapeshellarg($dbPath),
                    escapeshellarg($outputDir)
                );
                
                $output = [];
                $returnCode = 0;
                exec($command, $output, $returnCode);
                
                if ($returnCode === 0 && is_dir($outputDir)) {
                    echo json_encode(['success' => true, 'message' => 'Export created successfully']);
                } else {
                    $errorMsg = !empty($output) ? implode("\n", $output) : 'Export failed with unknown error';
                    echo json_encode(['success' => false, 'error' => $errorMsg]);
                }
                exit;
                
            case 'restore_snapshot':
                $filename = $_POST['filename'] ?? '';
                
                if (empty($filename)) {
                    echo json_encode(['success' => false, 'error' => 'Filename required']);
                    exit;
                }
                
                // Security check
                if (strpos($filename, '..') !== false || strpos($filename, '/') !== false || strpos($filename, '\\') !== false) {
                    echo json_encode(['success' => false, 'error' => 'Invalid filename']);
                    exit;
                }
                
                global $customSnapshotPath;
                $snapshotPath = $customSnapshotPath . '/' . $filename;
                if (!file_exists($snapshotPath)) {
                    echo json_encode(['success' => false, 'error' => 'Snapshot not found']);
                    exit;
                }
                
                $dbPath = DB_PATH;
                
                // Close database connection
                try {
                    $db = getDB();
                    $db->exec('PRAGMA wal_checkpoint(TRUNCATE)');
                    getDB(true); // Clear singleton
                    unset($db);
                } catch (Exception $e) {
                    // Continue anyway
                }
                
                // Clear WAL and SHM files
                $walFile = $dbPath . '-wal';
                $shmFile = $dbPath . '-shm';
                if (file_exists($walFile)) @unlink($walFile);
                if (file_exists($shmFile)) @unlink($shmFile);
                
                // Copy snapshot to database
                if (!@copy($snapshotPath, $dbPath)) {
                    if (file_exists($dbPath)) {
                        if (!@unlink($dbPath)) {
                            throw new Exception("Failed to restore database. The original database file is locked.");
                        }
                    }
                    if (!copy($snapshotPath, $dbPath)) {
                        throw new Exception("Failed to copy snapshot to database file.");
                    }
                }
                
                echo json_encode(['success' => true, 'message' => 'Database restored successfully']);
                exit;
                
            case 'restore_export':
                $dirname = $_POST['dirname'] ?? '';
                
                if (empty($dirname)) {
                    echo json_encode(['success' => false, 'error' => 'Directory name required']);
                    exit;
                }
                
                // Security check
                if (strpos($dirname, '..') !== false || strpos($dirname, '/') !== false || strpos($dirname, '\\') !== false) {
                    echo json_encode(['success' => false, 'error' => 'Invalid directory name']);
                    exit;
                }
                
                global $customExportPath;
                $exportDir = $customExportPath . '/' . $dirname;
                if (!is_dir($exportDir)) {
                    echo json_encode(['success' => false, 'error' => 'Export directory not found']);
                    exit;
                }
                
                // Check for required files
                $requiredFiles = ['schema.json', 'data.json', 'metadata.json'];
                foreach ($requiredFiles as $file) {
                    if (!file_exists($exportDir . '/' . $file)) {
                        echo json_encode(['success' => false, 'error' => "Required file not found: $file"]);
                        exit;
                    }
                }
                
                // Load export files
                $metadata = json_decode(file_get_contents($exportDir . '/metadata.json'), true);
                $schema = json_decode(file_get_contents($exportDir . '/schema.json'), true);
                $data = json_decode(file_get_contents($exportDir . '/data.json'), true);
                $pragmas = file_exists($exportDir . '/pragmas.json') 
                    ? json_decode(file_get_contents($exportDir . '/pragmas.json'), true) 
                    : null;
                
                if (json_last_error() !== JSON_ERROR_NONE) {
                    echo json_encode(['success' => false, 'error' => 'Failed to parse JSON files: ' . json_last_error_msg()]);
                    exit;
                }
                
                $dbPath = DB_PATH;
                
                // Close database connection
                try {
                    $db = getDB();
                    $db->exec('PRAGMA wal_checkpoint(TRUNCATE)');
                    getDB(true); // Clear singleton
                    unset($db);
                } catch (Exception $e) {
                    // Continue anyway
                }
                
                // Clear WAL and SHM files
                $walFile = $dbPath . '-wal';
                $shmFile = $dbPath . '-shm';
                if (file_exists($walFile)) @unlink($walFile);
                if (file_exists($shmFile)) @unlink($shmFile);
                
                // Remove existing database
                if (file_exists($dbPath)) {
                    if (!@unlink($dbPath)) {
                        echo json_encode(['success' => false, 'error' => 'Failed to delete existing database file. Make sure no other process is using it.']);
                        exit;
                    }
                }
                
                // Create new database
                try {
                    $db = new PDO('sqlite:' . $dbPath);
                    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
                    
                    // Apply PRAGMA settings
                    if ($pragmas) {
                        if (isset($pragmas['page_size'])) {
                            try { $db->exec('PRAGMA page_size = ' . (int)$pragmas['page_size']); } catch (Exception $e) {}
                        }
                        if (isset($pragmas['cache_size'])) {
                            try { $db->exec('PRAGMA cache_size = ' . (int)$pragmas['cache_size']); } catch (Exception $e) {}
                        }
                    }
                    
                    $db->exec('PRAGMA foreign_keys = OFF');
                    
                    // Create tables
                    if (isset($schema['tables']) && is_array($schema['tables'])) {
                        foreach ($schema['tables'] as $tableName => $tableInfo) {
                            if (isset($tableInfo['create_statement']) && !empty($tableInfo['create_statement'])) {
                                $db->exec($tableInfo['create_statement']);
                            }
                        }
                    }
                    
                    // Import data
                    if (isset($data['tables']) && is_array($data['tables'])) {
                        foreach ($data['tables'] as $tableName => $rows) {
                            if (empty($rows) || !is_array($rows)) continue;
                            
                            $columns = array_keys($rows[0]);
                            $placeholders = array_fill(0, count($columns), '?');
                            $columnList = implode(', ', array_map(function($col) {
                                return '"' . str_replace('"', '""', $col) . '"';
                            }, $columns));
                            
                            $sql = "INSERT INTO \"$tableName\" ($columnList) VALUES (" . implode(', ', $placeholders) . ")";
                            $stmt = $db->prepare($sql);
                            
                            $db->beginTransaction();
                            foreach ($rows as $row) {
                                $values = [];
                                foreach ($columns as $col) {
                                    $values[] = $row[$col] ?? null;
                                }
                                $stmt->execute($values);
                            }
                            $db->commit();
                        }
                    }
                    
                    // Create indexes
                    if (isset($schema['indexes']) && is_array($schema['indexes'])) {
                        foreach ($schema['indexes'] as $index) {
                            if (isset($index['create_statement']) && !empty($index['create_statement'])) {
                                try {
                                    $db->exec($index['create_statement']);
                                } catch (Exception $e) {}
                            }
                        }
                    }
                    
                    // Create triggers
                    if (isset($schema['triggers']) && is_array($schema['triggers'])) {
                        foreach ($schema['triggers'] as $trigger) {
                            if (isset($trigger['create_statement']) && !empty($trigger['create_statement'])) {
                                try {
                                    $db->exec($trigger['create_statement']);
                                } catch (Exception $e) {}
                            }
                        }
                    }
                    
                    $db->exec('PRAGMA foreign_keys = ON');
                    
                    // Apply journal mode if available
                    if ($pragmas && isset($pragmas['journal_mode'])) {
                        try {
                            $mode = strtoupper(trim($pragmas['journal_mode']));
                            $validModes = ['DELETE', 'TRUNCATE', 'PERSIST', 'MEMORY', 'WAL', 'OFF'];
                            if (in_array($mode, $validModes)) {
                                $db->exec("PRAGMA journal_mode = $mode");
                            }
                        } catch (Exception $e) {}
                    }
                    
                    echo json_encode(['success' => true, 'message' => 'Database restored successfully']);
                } catch (Exception $e) {
                    echo json_encode(['success' => false, 'error' => 'Restore failed: ' . $e->getMessage()]);
                }
                exit;
                
            case 'delete_export':
                $dirname = $_POST['dirname'] ?? '';
                
                if (empty($dirname)) {
                    echo json_encode(['success' => false, 'error' => 'Directory name required']);
                    exit;
                }
                
                // Security check
                if (strpos($dirname, '..') !== false || strpos($dirname, '/') !== false || strpos($dirname, '\\') !== false) {
                    echo json_encode(['success' => false, 'error' => 'Invalid directory name']);
                    exit;
                }
                
                global $customExportPath;
                $exportDir = $customExportPath . '/' . $dirname;
                if (!is_dir($exportDir)) {
                    echo json_encode(['success' => false, 'error' => 'Export directory not found']);
                    exit;
                }
                
                // Recursively delete the directory and all its contents
                try {
                    $files = new RecursiveIteratorIterator(
                        new RecursiveDirectoryIterator($exportDir, RecursiveDirectoryIterator::SKIP_DOTS),
                        RecursiveIteratorIterator::CHILD_FIRST
                    );
                    
                    foreach ($files as $file) {
                        if ($file->isDir()) {
                            rmdir($file->getRealPath());
                        } else {
                            unlink($file->getRealPath());
                        }
                    }
                    
                    // Remove the directory itself
                    if (rmdir($exportDir)) {
                        echo json_encode(['success' => true, 'message' => 'Export backup deleted successfully']);
                    } else {
                        echo json_encode(['success' => false, 'error' => 'Failed to delete export directory']);
                    }
                } catch (Exception $e) {
                    echo json_encode(['success' => false, 'error' => 'Delete failed: ' . $e->getMessage()]);
                }
                exit;
                
            case 'delete_snapshot':
                $filename = $_POST['filename'] ?? '';
                
                if (empty($filename)) {
                    echo json_encode(['success' => false, 'error' => 'Filename required']);
                    exit;
                }
                
                // Security check
                if (strpos($filename, '..') !== false || strpos($filename, '/') !== false || strpos($filename, '\\') !== false) {
                    echo json_encode(['success' => false, 'error' => 'Invalid filename']);
                    exit;
                }
                
                global $customSnapshotPath;
                $snapshotPath = $customSnapshotPath . '/' . $filename;
                if (!file_exists($snapshotPath)) {
                    echo json_encode(['success' => false, 'error' => 'Snapshot not found']);
                    exit;
                }
                
                try {
                    // Delete the snapshot file
                    if (unlink($snapshotPath)) {
                        // Also delete metadata file if it exists
                        $metaFile = $snapshotPath . '.json';
                        if (file_exists($metaFile)) {
                            @unlink($metaFile);
                        }
                        echo json_encode(['success' => true, 'message' => 'Snapshot backup deleted successfully']);
                    } else {
                        echo json_encode(['success' => false, 'error' => 'Failed to delete snapshot file']);
                    }
                } catch (Exception $e) {
                    echo json_encode(['success' => false, 'error' => 'Delete failed: ' . $e->getMessage()]);
                }
                exit;
                
            case 'delete_all_snapshots':
                global $customSnapshotPath;
                $backupsDir = $customSnapshotPath;
                
                if (!is_dir($backupsDir)) {
                    echo json_encode(['success' => false, 'error' => 'Backups directory not found']);
                    exit;
                }
                
                $files = glob($backupsDir . '/linknest-snapshot-*.db');
                $deleted = 0;
                $errors = [];
                
                foreach ($files as $file) {
                    try {
                        if (unlink($file)) {
                            $deleted++;
                            // Also delete metadata file if it exists
                            $metaFile = $file . '.json';
                            if (file_exists($metaFile)) {
                                @unlink($metaFile);
                            }
                        } else {
                            $errors[] = basename($file);
                        }
                    } catch (Exception $e) {
                        $errors[] = basename($file) . ': ' . $e->getMessage();
                    }
                }
                
                if (count($errors) > 0) {
                    echo json_encode(['success' => false, 'error' => 'Deleted ' . $deleted . ' snapshots, but ' . count($errors) . ' failed: ' . implode(', ', $errors)]);
                } else {
                    echo json_encode(['success' => true, 'message' => 'Deleted ' . $deleted . ' snapshot backup(s)']);
                }
                exit;
                
            case 'delete_all_exports':
                global $customExportPath;
                $backupsDir = $customExportPath;
                
                if (!is_dir($backupsDir)) {
                    echo json_encode(['success' => false, 'error' => 'Backups directory not found']);
                    exit;
                }
                
                $dirs = glob($backupsDir . '/export_*', GLOB_ONLYDIR);
                $deleted = 0;
                $errors = [];
                
                foreach ($dirs as $dir) {
                    try {
                        $files = new RecursiveIteratorIterator(
                            new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
                            RecursiveIteratorIterator::CHILD_FIRST
                        );
                        
                        foreach ($files as $file) {
                            if ($file->isDir()) {
                                @rmdir($file->getRealPath());
                            } else {
                                @unlink($file->getRealPath());
                            }
                        }
                        
                        if (@rmdir($dir)) {
                            $deleted++;
                        } else {
                            $errors[] = basename($dir);
                        }
                    } catch (Exception $e) {
                        $errors[] = basename($dir) . ': ' . $e->getMessage();
                    }
                }
                
                if (count($errors) > 0) {
                    echo json_encode(['success' => false, 'error' => 'Deleted ' . $deleted . ' exports, but ' . count($errors) . ' failed: ' . implode(', ', $errors)]);
                } else {
                    echo json_encode(['success' => true, 'message' => 'Deleted ' . $deleted . ' export backup(s)']);
                }
                exit;
                
            case 'delete_old_snapshots':
                $days = (int)($_POST['days'] ?? 30);
                
                if ($days < 1 || $days > 30) {
                    echo json_encode(['success' => false, 'error' => 'Days must be between 1 and 30']);
                    exit;
                }
                
                global $customSnapshotPath;
                $backupsDir = $customSnapshotPath;
                
                if (!is_dir($backupsDir)) {
                    echo json_encode(['success' => false, 'error' => 'Backups directory not found']);
                    exit;
                }
                
                $files = glob($backupsDir . '/linknest-snapshot-*.db');
                $cutoffTime = time() - ($days * 24 * 60 * 60);
                $deleted = 0;
                $errors = [];
                
                foreach ($files as $file) {
                    if (filemtime($file) < $cutoffTime) {
                        try {
                            if (unlink($file)) {
                                $deleted++;
                                // Also delete metadata file if it exists
                                $metaFile = $file . '.json';
                                if (file_exists($metaFile)) {
                                    @unlink($metaFile);
                                }
                            } else {
                                $errors[] = basename($file);
                            }
                        } catch (Exception $e) {
                            $errors[] = basename($file) . ': ' . $e->getMessage();
                        }
                    }
                }
                
                if (count($errors) > 0) {
                    echo json_encode(['success' => false, 'error' => 'Deleted ' . $deleted . ' snapshots, but ' . count($errors) . ' failed: ' . implode(', ', $errors)]);
                } else {
                    echo json_encode(['success' => true, 'message' => 'Deleted ' . $deleted . ' snapshot backup(s) older than ' . $days . ' day(s)']);
                }
                exit;
                
            case 'delete_old_exports':
                $days = (int)($_POST['days'] ?? 30);
                
                if ($days < 1 || $days > 30) {
                    echo json_encode(['success' => false, 'error' => 'Days must be between 1 and 30']);
                    exit;
                }
                
                global $customExportPath;
                $backupsDir = $customExportPath;
                
                if (!is_dir($backupsDir)) {
                    echo json_encode(['success' => false, 'error' => 'Backups directory not found']);
                    exit;
                }
                
                $dirs = glob($backupsDir . '/export_*', GLOB_ONLYDIR);
                $cutoffTime = time() - ($days * 24 * 60 * 60);
                $deleted = 0;
                $errors = [];
                
                foreach ($dirs as $dir) {
                    if (filemtime($dir) < $cutoffTime) {
                        try {
                            $files = new RecursiveIteratorIterator(
                                new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
                                RecursiveIteratorIterator::CHILD_FIRST
                            );
                            
                            foreach ($files as $file) {
                                if ($file->isDir()) {
                                    @rmdir($file->getRealPath());
                                } else {
                                    @unlink($file->getRealPath());
                                }
                            }
                            
                            if (@rmdir($dir)) {
                                $deleted++;
                            } else {
                                $errors[] = basename($dir);
                            }
                        } catch (Exception $e) {
                            $errors[] = basename($dir) . ': ' . $e->getMessage();
                        }
                    }
                }
                
                if (count($errors) > 0) {
                    echo json_encode(['success' => false, 'error' => 'Deleted ' . $deleted . ' exports, but ' . count($errors) . ' failed: ' . implode(', ', $errors)]);
                } else {
                    echo json_encode(['success' => true, 'message' => 'Deleted ' . $deleted . ' export backup(s) older than ' . $days . ' day(s)']);
                }
                exit;
                
            case 'list_snapshots':
                echo json_encode(['success' => true, 'data' => getSnapshots()]);
                exit;
                
            case 'list_exports':
                echo json_encode(['success' => true, 'data' => getExports()]);
                exit;
                
            case 'upload_backup':
                // Handle file upload
                if (!isset($_FILES['backup_file']) || $_FILES['backup_file']['error'] !== UPLOAD_ERR_OK) {
                    echo json_encode(['success' => false, 'error' => 'File upload failed']);
                    exit;
                }
                
                $file = $_FILES['backup_file'];
                $backupType = $_POST['backup_type'] ?? 'snapshot'; // 'snapshot' or 'export'
                global $customSnapshotPath, $customExportPath;
                $targetDir = $backupType === 'snapshot' ? $customSnapshotPath : $customExportPath;
                
                // Ensure target directory exists
                if (!file_exists($targetDir)) {
                    if (!mkdir($targetDir, 0755, true)) {
                        echo json_encode(['success' => false, 'error' => 'Failed to create target directory']);
                        exit;
                    }
                }
                
                // Docker: Use forward slashes (Linux paths in container)
                $targetPath = rtrim($targetDir, '/') . '/' . basename($file['name']);
                
                // Normalize the path and check for path traversal
                $realTargetDir = realpath($targetDir);
                $realTargetPath = realpath(dirname($targetPath));
                
                // Security check: ensure the target path is within the target directory
                if ($realTargetDir === false || $realTargetPath === false) {
                    echo json_encode(['success' => false, 'error' => 'Invalid target directory']);
                    exit;
                }
                
                // Check if the resolved path is within the target directory
                if (strpos($realTargetPath, $realTargetDir) !== 0) {
                    echo json_encode(['success' => false, 'error' => 'Invalid file path']);
                    exit;
                }
                
                // Additional check for path traversal in filename
                if (strpos(basename($file['name']), '..') !== false || strpos(basename($file['name']), '/') !== false || strpos(basename($file['name']), '\\') !== false) {
                    echo json_encode(['success' => false, 'error' => 'Invalid file name']);
                    exit;
                }
                
                // Check file type
                $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
                if ($backupType === 'snapshot' && $ext !== 'db') {
                    echo json_encode(['success' => false, 'error' => 'Snapshot files must be .db files']);
                    exit;
                }
                
                if ($backupType === 'export' && $ext !== 'zip') {
                    echo json_encode(['success' => false, 'error' => 'Export files must be .zip files']);
                    exit;
                }
                
                // Handle ZIP extraction for exports
                if ($backupType === 'export' && $ext === 'zip') {
                    $zip = new ZipArchive();
                    if ($zip->open($file['tmp_name']) === TRUE) {
                        // Extract to a new directory
                        $exportDirName = 'export_' . date('Y-m-d_His');
                        $extractPath = rtrim($targetDir, '/') . '/' . $exportDirName;
                        
                        if (!mkdir($extractPath, 0755, true)) {
                            $zip->close();
                            echo json_encode(['success' => false, 'error' => 'Failed to create extraction directory']);
                            exit;
                        }
                        
                        $zip->extractTo($extractPath);
                        $zip->close();
                        
                        echo json_encode(['success' => true, 'message' => 'Export extracted successfully', 'dirname' => $exportDirName]);
                    } else {
                        echo json_encode(['success' => false, 'error' => 'Failed to extract ZIP file']);
                    }
                    exit;
                }
                
                // Move uploaded file
                if (move_uploaded_file($file['tmp_name'], $targetPath)) {
                    echo json_encode(['success' => true, 'message' => 'File uploaded successfully', 'filename' => basename($targetPath)]);
                } else {
                    echo json_encode(['success' => false, 'error' => 'Failed to move uploaded file']);
                }
                exit;
                
            default:
                echo json_encode(['success' => false, 'error' => 'Invalid action']);
                exit;
        }
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        exit;
    }
}

// Get backup lists
$snapshots = getSnapshots();
$exports = getExports();

// Get database information
$dbInfo = getDatabaseInfo();

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($brandName); ?> Backup & Restore for SQLite DB</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: #f5f7fa;
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        .header {
            background: white;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .header h1 {
            color: #1f2937;
            font-size: 28px;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .header-actions {
            display: flex;
            gap: 12px;
        }
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        .btn-primary {
            background: #374151;
            color: white;
        }
        .btn-primary:hover {
            background: #4338ca;
        }
        .btn-secondary {
            background: #6b7280;
            color: white;
        }
        .btn-secondary:hover {
            background: #4b5563;
        }
        .btn-success {
            background: #10b981;
            color: white;
        }
        .btn-success:hover {
            background: #059669;
        }
        .btn-danger {
            background: #ef4444;
            color: white;
        }
        .btn-danger:hover {
            background: #dc2626;
        }
        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .card {
            background: white;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 16px;
            border-bottom: 2px solid #e5e7eb;
        }
        .card-header h2 {
            color: #1f2937;
            font-size: 20px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .table {
            width: 100%;
            border-collapse: collapse;
        }
        .table th {
            text-align: left;
            padding: 12px;
            background: #f9fafb;
            color: #374151;
            font-weight: 600;
            font-size: 14px;
            border-bottom: 2px solid #e5e7eb;
        }
        .table td {
            padding: 12px;
            border-bottom: 1px solid #e5e7eb;
            color: #6b7280;
            font-size: 14px;
        }
        .table tr:hover {
            background: #f9fafb;
        }
        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
        }
        .badge-success {
            background: #d1fae5;
            color: #065f46;
        }
        .badge-info {
            background: #dbeafe;
            color: #1e40af;
        }
        .alert {
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .alert-success {
            background: #d1fae5;
            color: #065f46;
            border: 1px solid #10b981;
        }
        .alert-error {
            background: #fee2e2;
            color: #991b1b;
            border: 1px solid #ef4444;
        }
        .alert-info {
            background: #dbeafe;
            color: #1e40af;
            border: 1px solid #3b82f6;
        }
        .empty-state {
            text-align: center;
            padding: 40px;
            color: #9ca3af;
        }
        .empty-state svg {
            width: 64px;
            height: 64px;
            margin: 0 auto 16px;
            opacity: 0.5;
        }
        .loading {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid #ffffff;
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 0.6s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .actions-cell {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 24px;
        }
        .tabs {
            display: flex;
            gap: 8px;
            border-bottom: 2px solid #e5e7eb;
            margin-bottom: 24px;
            padding: 0 4px;
        }
        .tab {
            padding: 12px 24px;
            background: none;
            border: none;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            color: #6b7280;
            border-bottom: 3px solid transparent;
            margin-bottom: -2px;
            transition: all 0.3s ease;
            position: relative;
        }
        .tab:hover {
            color: #374151;
            background: rgba(107, 114, 128, 0.05);
        }
        .tab.active {
            color: #374151;
            border-bottom-color: #6b7280;
            background: rgba(107, 114, 128, 0.05);
        }
        .tab-content {
            display: none;
            animation: fadeIn 0.3s ease;
        }
        .tab-content.active {
            display: block;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }
        .stat-card {
            background: white;
            color: #1f2937;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.08);
            border: 1px solid #e5e7eb;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .stat-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.12);
            border-color: #d1d5db;
        }
        .stat-card h4 {
            color: #6b7280;
        }
        .stat-card .stat-value {
            color: #1f2937;
        }
        .stat-card h4 {
            margin: 0 0 8px 0;
            font-size: 12px;
            opacity: 0.9;
            font-weight: 500;
        }
        .stat-card .stat-value {
            font-size: 24px;
            font-weight: 700;
            margin: 0;
        }
        .card-modern {
            background: white;
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            transition: box-shadow 0.3s ease;
        }
        .card-modern:hover {
            box-shadow: 0 4px 16px rgba(0,0,0,0.12);
        }
        .card-header-modern {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 16px;
            border-bottom: 2px solid #f3f4f6;
        }
        .card-header-modern h2 {
            color: #1f2937;
            font-size: 20px;
            margin: 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .btn-modern {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .btn-modern:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }
        .btn-modern-primary {
            background: #374151;
            color: white;
        }
        .btn-modern-primary:hover {
            background: #4b5563;
        }
        .btn-modern-secondary {
            background: #f3f4f6;
            color: #374151;
        }
        .btn-modern-success {
            background: #10b981;
            color: white;
        }
        .btn-modern-danger {
            background: #ef4444;
            color: white;
        }
        .table-modern {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
        }
        .table-modern th {
            text-align: left;
            padding: 14px;
            background: #f9fafb;
            color: #374151;
            font-weight: 600;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 2px solid #e5e7eb;
        }
        .table-modern th:first-child {
            border-top-left-radius: 8px;
        }
        .table-modern th:last-child {
            border-top-right-radius: 8px;
        }
        .table-modern td {
            padding: 14px;
            border-bottom: 1px solid #f3f4f6;
            color: #6b7280;
            font-size: 14px;
        }
        .table-modern tr:hover {
            background: #f9fafb;
        }
        .table-modern tr:last-child td:first-child {
            border-bottom-left-radius: 8px;
        }
        .table-modern tr:last-child td:last-child {
            border-bottom-right-radius: 8px;
        }
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
            overflow: auto;
        }
        .modal-content {
            background-color: white;
            margin: 5% auto;
            padding: 0;
            border-radius: 12px;
            width: 90%;
            max-width: 700px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-height: 80vh;
            overflow-y: auto;
        }
        .modal-header {
            background: #374151;
            color: white;
            padding: 20px;
            border-radius: 12px 12px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .modal-header h3 {
            margin: 0;
            font-size: 20px;
        }
        .modal-close {
            color: white;
            font-size: 28px;
            font-weight: bold;
            cursor: pointer;
            background: none;
            border: none;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: background 0.2s;
        }
        .modal-close:hover {
            background: rgba(255,255,255,0.2);
        }
        .modal-body {
            padding: 24px;
        }
        .info-row {
            display: flex;
            padding: 12px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        .info-row:last-child {
            border-bottom: none;
        }
        .info-label {
            font-weight: 600;
            color: #374151;
            width: 35%;
            min-width: 120px;
        }
        .info-value {
            color: #6b7280;
            flex: 1;
            word-break: break-all;
        }
        .info-value code {
            background: #f3f4f6;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🐳 <?php echo htmlspecialchars($brandName); ?> Backup & Restore for SQLite DB (Docker)</h1>
            <div class="header-actions">
                <a href="?logout=1" class="btn btn-secondary">Logout</a>
            </div>
        </div>

        <div id="alert-container"></div>

        <!-- Tab Navigation -->
        <div class="tabs">
            <button class="tab active" onclick="switchTab('overview', event)">
                📊 Overview
            </button>
            <button class="tab" onclick="switchTab('snapshots', event)">
                📸 Snapshots
            </button>
            <button class="tab" onclick="switchTab('exports', event)">
                📦 Exports
            </button>
            <button class="tab" onclick="switchTab('settings', event)">
                ⚙️ Settings
            </button>
        </div>

        <!-- Overview Tab -->
        <div id="tab-overview" class="tab-content active">
            <!-- Statistics Cards -->
            <div class="stats-grid">
                <div class="stat-card">
                    <h4>Total Snapshots</h4>
                    <p class="stat-value"><?php echo count($snapshots); ?></p>
                </div>
                <div class="stat-card">
                    <h4>Total Exports</h4>
                    <p class="stat-value"><?php echo count($exports); ?></p>
                </div>
                <div class="stat-card">
                    <h4>Database Status</h4>
                    <p class="stat-value"><?php echo $dbInfo['exists'] ? '✓ Active' : '⚠ Missing'; ?></p>
                </div>
                <?php if ($dbInfo['exists']): ?>
                <div class="stat-card">
                    <h4>Database Size</h4>
                    <p class="stat-value"><?php echo formatBytes($dbInfo['file_size']); ?></p>
                </div>
                <?php endif; ?>
            </div>

            <!-- Database Information Card -->
            <div class="card-modern">
                <div class="card-header-modern">
                    <h2>🗄️ SQLite DB Info</h2>
                    <button id="db-info-toggle" class="btn-modern btn-modern-secondary" style="padding: 6px 12px; font-size: 12px;" onclick="toggleDatabaseInfo()">
                        <span id="db-info-toggle-icon">▼</span> <span id="db-info-toggle-text">Show</span>
                    </button>
                </div>
            <div id="database-info-content" style="display: none;">
            <?php if ($dbInfo['error']): ?>
                <div class="alert alert-error">
                    <?php echo htmlspecialchars($dbInfo['error']); ?>
                </div>
            <?php elseif (!$dbInfo['exists']): ?>
                <div class="alert alert-info" style="margin-bottom: 20px;">
                    <div style="display: flex; align-items: start; gap: 12px;">
                        <div style="font-size: 24px;">ℹ️</div>
                        <div style="flex: 1;">
                            <strong>Database file not found</strong>
                            <p style="margin: 8px 0 0 0; font-size: 14px;">
                                The database file does not exist at: <code style="background: rgba(0,0,0,0.05); padding: 2px 6px; border-radius: 4px;"><?php echo htmlspecialchars($dbInfo['path']); ?></code>
                            </p>
                            <p style="margin: 12px 0 0 0; font-size: 14px; color: #059669; font-weight: 600;">
                                ✓ A new database will be automatically created when you restore from a backup (snapshot or export).
                            </p>
                        </div>
                    </div>
                </div>
            <?php endif; ?>
            
            <!-- Backup Directory Information -->
            <div style="margin-top: 20px; padding: 16px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                <h3 style="color: #374151; font-size: 16px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                    📁 Backup Directories
                </h3>
                <table class="table" style="font-size: 13px; margin: 0;">
                    <tr>
                        <td style="font-weight: 600; color: #374151; width: 30%; padding: 8px 12px;">Backups Folder:</td>
                        <td style="font-family: monospace; word-break: break-all; padding: 8px 12px;">
                            <?php 
                            $backupsDir = $customBackupPath;
                            $backupsDirAbs = realpath($backupsDir) ?: $backupsDir;
                            echo htmlspecialchars($backupsDirAbs); 
                            ?>
                        </td>
                    </tr>
                    <tr>
                        <td style="font-weight: 600; color: #374151; padding: 8px 12px;">Snapshots Location:</td>
                        <td style="font-family: monospace; word-break: break-all; padding: 8px 12px;">
                            <?php 
                            $snapshotDirAbs = realpath($customSnapshotPath) ?: $customSnapshotPath;
                            echo htmlspecialchars($snapshotDirAbs); ?>/linknest-snapshot-*.db
                        </td>
                    </tr>
                    <tr>
                        <td style="font-weight: 600; color: #374151; padding: 8px 12px;">Exports Location:</td>
                        <td style="font-family: monospace; word-break: break-all; padding: 8px 12px;">
                            <?php 
                            $exportDirAbs = realpath($customExportPath) ?: $customExportPath;
                            echo htmlspecialchars($exportDirAbs); ?>/export_*/
                        </td>
                    </tr>
                </table>
            </div>
            
            <?php if ($dbInfo['exists']): ?>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px;">
                    <!-- File Information -->
                    <div>
                        <h3 style="color: #4f46e5; font-size: 16px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb;">File Properties</h3>
                        <table class="table" style="font-size: 13px;">
                            <tr>
                                <td style="font-weight: 600; color: #374151; width: 40%;">Path:</td>
                                <td style="font-family: monospace; word-break: break-all;"><?php echo htmlspecialchars($dbInfo['absolute_path']); ?></td>
                            </tr>
                            <tr>
                                <td style="font-weight: 600; color: #374151;">Size:</td>
                                <td><?php echo formatBytes($dbInfo['file_size']); ?></td>
                            </tr>
                            <tr>
                                <td style="font-weight: 600; color: #374151;">Modified:</td>
                                <td><?php echo date('Y-m-d H:i:s', $dbInfo['modified']); ?></td>
                            </tr>
                            <tr>
                                <td style="font-weight: 600; color: #374151;">Readable:</td>
                                <td>
                                    <span class="badge <?php echo $dbInfo['readable'] ? 'badge-success' : 'badge-info'; ?>">
                                        <?php echo $dbInfo['readable'] ? 'Yes' : 'No'; ?>
                                    </span>
                                </td>
                            </tr>
                            <tr>
                                <td style="font-weight: 600; color: #374151;">Writable:</td>
                                <td>
                                    <span class="badge <?php echo $dbInfo['writable'] ? 'badge-success' : 'badge-info'; ?>">
                                        <?php echo $dbInfo['writable'] ? 'Yes' : 'No'; ?>
                                    </span>
                                </td>
                            </tr>
                            <tr>
                                <td style="font-weight: 600; color: #374151;">Tables:</td>
                                <td><?php echo $dbInfo['table_count'] ?? 'N/A'; ?></td>
                            </tr>
                        </table>
                    </div>

                    <!-- PRAGMA Settings -->
                    <div>
                        <h3 style="color: #4f46e5; font-size: 16px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb;">Performance Parameters</h3>
                        <table class="table" style="font-size: 13px;">
                            <?php if (!empty($dbInfo['pragmas'])): ?>
                                <?php foreach ($dbInfo['pragmas'] as $key => $value): ?>
                                    <tr>
                                        <td style="font-weight: 600; color: #374151; width: 40%;"><?php echo htmlspecialchars($key); ?>:</td>
                                        <td>
                                            <?php 
                                            if (is_numeric($value)) {
                                                echo number_format($value);
                                            } else {
                                                echo htmlspecialchars($value);
                                            }
                                            ?>
                                        </td>
                                    </tr>
                                <?php endforeach; ?>
                            <?php endif; ?>
                            <?php if (!empty($dbInfo['page_info']) && !isset($dbInfo['page_info']['error'])): ?>
                                <tr>
                                    <td style="font-weight: 600; color: #374151;">Page Count:</td>
                                    <td><?php echo number_format($dbInfo['page_info']['page_count']); ?></td>
                                </tr>
                                <tr>
                                    <td style="font-weight: 600; color: #374151;">Page Size:</td>
                                    <td><?php echo formatBytes($dbInfo['page_info']['page_size']); ?></td>
                                </tr>
                                <tr>
                                    <td style="font-weight: 600; color: #374151;">Calculated Size:</td>
                                    <td><?php echo formatBytes($dbInfo['page_info']['calculated_size']); ?></td>
                                </tr>
                                <?php if (isset($dbInfo['page_info']['freelist_count'])): ?>
                                    <tr>
                                        <td style="font-weight: 600; color: #374151;">Free Pages:</td>
                                        <td><?php echo number_format($dbInfo['page_info']['freelist_count']); ?></td>
                                    </tr>
                                <?php endif; ?>
                            <?php endif; ?>
                        </table>
                    </div>

                    <!-- WAL Information -->
                    <?php if (isset($dbInfo['pragmas']['journal_mode']) && strtolower($dbInfo['pragmas']['journal_mode']) === 'wal'): ?>
                        <div>
                            <h3 style="color: #4f46e5; font-size: 16px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb;">WAL (Write-Ahead Logging)</h3>
                            <table class="table" style="font-size: 13px;">
                                <tr>
                                    <td style="font-weight: 600; color: #374151; width: 40%;">WAL File:</td>
                                    <td>
                                        <span class="badge <?php echo $dbInfo['wal_info']['wal_exists'] ? 'badge-success' : 'badge-info'; ?>">
                                            <?php echo $dbInfo['wal_info']['wal_exists'] ? 'Exists' : 'Not Found'; ?>
                                        </span>
                                    </td>
                                </tr>
                                <?php if ($dbInfo['wal_info']['wal_exists']): ?>
                                    <tr>
                                        <td style="font-weight: 600; color: #374151;">WAL Size:</td>
                                        <td><?php echo formatBytes($dbInfo['wal_info']['wal_size']); ?></td>
                                    </tr>
                                    <tr>
                                        <td style="font-weight: 600; color: #374151;">WAL Path:</td>
                                        <td style="font-family: monospace; word-break: break-all; font-size: 11px;"><?php echo htmlspecialchars($dbInfo['wal_info']['wal_path']); ?></td>
                                    </tr>
                                <?php endif; ?>
                                <tr>
                                    <td style="font-weight: 600; color: #374151;">SHM File:</td>
                                    <td>
                                        <span class="badge <?php echo $dbInfo['wal_info']['shm_exists'] ? 'badge-success' : 'badge-info'; ?>">
                                            <?php echo $dbInfo['wal_info']['shm_exists'] ? 'Exists' : 'Not Found'; ?>
                                        </span>
                                    </td>
                                </tr>
                                <?php if ($dbInfo['wal_info']['shm_exists']): ?>
                                    <tr>
                                        <td style="font-weight: 600; color: #374151;">SHM Size:</td>
                                        <td><?php echo formatBytes($dbInfo['wal_info']['shm_size']); ?></td>
                                    </tr>
                                    <tr>
                                        <td style="font-weight: 600; color: #374151;">SHM Path:</td>
                                        <td style="font-family: monospace; word-break: break-all; font-size: 11px;"><?php echo htmlspecialchars($dbInfo['wal_info']['shm_path']); ?></td>
                                    </tr>
                                <?php endif; ?>
                                <?php if (isset($dbInfo['pragmas']['wal_autocheckpoint'])): ?>
                                    <tr>
                                        <td style="font-weight: 600; color: #374151;">Auto Checkpoint:</td>
                                        <td><?php echo htmlspecialchars($dbInfo['pragmas']['wal_autocheckpoint']); ?></td>
                                    </tr>
                                <?php endif; ?>
                            </table>
                        </div>
                    <?php else: ?>
                        <div>
                            <h3 style="color: #4f46e5; font-size: 16px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb;">WAL (Write-Ahead Logging)</h3>
                            <div style="padding: 20px; text-align: center; color: #9ca3af;">
                                <p>WAL mode is not enabled</p>
                                <p style="font-size: 12px; margin-top: 8px;">Current journal mode: <strong><?php echo htmlspecialchars($dbInfo['pragmas']['journal_mode'] ?? 'N/A'); ?></strong></p>
                            </div>
                        </div>
                    <?php endif; ?>
                </div>
            <?php endif; ?>
            </div>
        </div>
        </div>

        <!-- Backup Details Modal -->
        <div id="backup-modal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="modal-title">Backup Details</h3>
                    <button class="modal-close" onclick="closeBackupModal()">&times;</button>
                </div>
                <div class="modal-body" id="modal-body">
                    <!-- Content will be inserted here -->
                </div>
            </div>
        </div>

        <!-- Snapshots Tab -->
        <div id="tab-snapshots" class="tab-content">
            <div class="card-modern">
                <div class="card-header-modern">
                    <h2>📸 Snapshot Backups</h2>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <label class="btn-modern btn-modern-secondary" style="cursor: pointer; margin: 0;">
                            <input type="file" id="snapshot-upload" accept=".db" style="display: none;" onchange="uploadBackup('snapshot', this.files[0])">
                            📤 Upload
                        </label>
                        <button onclick="createSnapshot()" class="btn-modern btn-modern-primary">
                            <span id="snapshot-loading" style="display:none;" class="loading"></span>
                            Create Snapshot
                        </button>
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <select id="snapshot-days" style="padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; background: white;">
                                <?php for ($i = 1; $i <= 30; $i++): ?>
                                    <option value="<?php echo $i; ?>" <?php echo $i === 30 ? 'selected' : ''; ?>><?php echo $i; ?> day<?php echo $i > 1 ? 's' : ''; ?></option>
                                <?php endfor; ?>
                            </select>
                            <button onclick="deleteOldSnapshots()" class="btn-modern btn-modern-warning" style="padding: 8px 12px; font-size: 13px;">
                                🗑️ Delete Old
                            </button>
                        </div>
                        <button onclick="deleteAllSnapshots()" class="btn-modern btn-modern-danger" style="padding: 8px 12px; font-size: 13px;">
                            🗑️ Delete All
                        </button>
                    </div>
                </div>
                <div id="snapshots-container">
                    <?php if (empty($snapshots)): ?>
                        <div class="empty-state">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path>
                            </svg>
                            <p>No snapshot backups found</p>
                        </div>
                    <?php else: ?>
                        <table class="table-modern">
                            <thead>
                                <tr>
                                    <th>Filename</th>
                                    <th>Size</th>
                                    <th>Created</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($snapshots as $snapshot): ?>
                                    <tr>
                                        <td>
                                            <strong style="color: #1f2937;"><?php echo htmlspecialchars($snapshot['filename']); ?></strong>
                                        </td>
                                        <td><?php echo formatBytes($snapshot['size']); ?></td>
                                        <td><?php echo date('Y-m-d H:i:s', $snapshot['created_at']); ?></td>
                                        <td class="actions-cell">
                                            <button 
                                                onclick="showSnapshotDetails('<?php echo htmlspecialchars($snapshot['filename']); ?>', <?php echo htmlspecialchars(json_encode($snapshot)); ?>)" 
                                                class="btn-modern btn-modern-secondary"
                                                style="padding: 6px 12px; font-size: 12px;"
                                                title="View Details"
                                            >
                                                ℹ️
                                            </button>
                                            <button 
                                                onclick="downloadSnapshotZip('<?php echo htmlspecialchars($snapshot['filename']); ?>')" 
                                                class="btn-modern btn-modern-secondary"
                                                style="padding: 6px 12px; font-size: 12px;"
                                                title="Download as ZIP"
                                            >
                                                📥 Download
                                            </button>
                                            <button 
                                                onclick="restoreSnapshot('<?php echo htmlspecialchars($snapshot['filename']); ?>')" 
                                                class="btn-modern btn-modern-success"
                                                style="padding: 6px 12px; font-size: 12px;"
                                            >
                                                Restore
                                            </button>
                                            <button 
                                                onclick="deleteSnapshot('<?php echo htmlspecialchars($snapshot['filename']); ?>')" 
                                                class="btn-modern btn-modern-danger"
                                                style="padding: 6px 12px; font-size: 12px;"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    <?php endif; ?>
                </div>
            </div>
        </div>

        <!-- Exports Tab -->
        <div id="tab-exports" class="tab-content">
            <div class="card-modern">
                <div class="card-header-modern">
                    <h2>📦 Export Backups</h2>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <label class="btn-modern btn-modern-secondary" style="cursor: pointer; margin: 0;">
                            <input type="file" id="export-upload" accept=".zip" style="display: none;" onchange="uploadBackup('export', this.files[0])">
                            📤 Upload ZIP
                        </label>
                        <button onclick="createExport()" class="btn-modern btn-modern-primary">
                            <span id="export-loading" style="display:none;" class="loading"></span>
                            Create Export
                        </button>
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <select id="export-days" style="padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; background: white;">
                                <?php for ($i = 1; $i <= 30; $i++): ?>
                                    <option value="<?php echo $i; ?>" <?php echo $i === 30 ? 'selected' : ''; ?>><?php echo $i; ?> day<?php echo $i > 1 ? 's' : ''; ?></option>
                                <?php endfor; ?>
                            </select>
                            <button onclick="deleteOldExports()" class="btn-modern btn-modern-warning" style="padding: 8px 12px; font-size: 13px;">
                                🗑️ Delete Old
                            </button>
                        </div>
                        <button onclick="deleteAllExports()" class="btn-modern btn-modern-danger" style="padding: 8px 12px; font-size: 13px;">
                            🗑️ Delete All
                        </button>
                    </div>
                </div>
                <div id="exports-container">
                    <?php if (empty($exports)): ?>
                        <div class="empty-state">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                            </svg>
                            <p>No export backups found</p>
                        </div>
                    <?php else: ?>
                        <table class="table-modern">
                            <thead>
                                <tr>
                                    <th>Directory</th>
                                    <th>Size</th>
                                    <th>Created</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($exports as $export): ?>
                                    <tr>
                                        <td>
                                            <strong style="color: #1f2937;"><?php echo htmlspecialchars($export['dirname']); ?></strong>
                                        </td>
                                        <td><?php echo formatBytes($export['size']); ?></td>
                                        <td><?php echo date('Y-m-d H:i:s', $export['created_at']); ?></td>
                                        <td class="actions-cell">
                                            <button 
                                                onclick="showExportDetails('<?php echo htmlspecialchars($export['dirname']); ?>', <?php echo htmlspecialchars(json_encode($export)); ?>)" 
                                                class="btn-modern btn-modern-secondary"
                                                style="padding: 6px 12px; font-size: 12px;"
                                                title="View Details"
                                            >
                                                ℹ️
                                            </button>
                                            <button 
                                                onclick="restoreExport('<?php echo htmlspecialchars($export['dirname']); ?>')" 
                                                class="btn-modern btn-modern-success"
                                                style="padding: 6px 12px; font-size: 12px;"
                                            >
                                                Restore
                                            </button>
                                            <button 
                                                onclick="downloadExportZip('<?php echo htmlspecialchars($export['dirname']); ?>')" 
                                                class="btn-modern btn-modern-secondary"
                                                style="padding: 6px 12px; font-size: 12px;"
                                            >
                                                📥 ZIP
                                            </button>
                                            <button 
                                                onclick="deleteExport('<?php echo htmlspecialchars($export['dirname']); ?>')" 
                                                class="btn-modern btn-modern-danger"
                                                style="padding: 6px 12px; font-size: 12px;"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    <?php endif; ?>
                </div>
            </div>
        </div>

        <!-- Settings Tab -->
        <div id="tab-settings" class="tab-content">
            <div class="card-modern">
                <div class="card-header-modern">
                    <h2>⚙️ Backup Settings</h2>
                </div>
                <div style="padding: 24px;">
                    <h3 style="color: #4f46e5; font-size: 18px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #e5e7eb;">Branding</h3>
                    <form method="POST" style="display: grid; gap: 20px; max-width: 600px; margin-bottom: 32px;">
                        <div>
                            <label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 8px;">Application Name:</label>
                            <input type="text" name="brand_name" value="<?php echo htmlspecialchars($brandName); ?>" 
                                   style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: border-color 0.2s;"
                                   onfocus="this.style.borderColor='#6b7280'" onblur="this.style.borderColor='#e5e7eb'"
                                   placeholder="LinkNest">
                            <p style="font-size: 12px; color: #6b7280; margin-top: 4px;">Customize the application name displayed throughout the interface</p>
                        </div>
                        <div style="display: flex; gap: 12px;">
                            <button type="submit" name="save_branding" class="btn-modern btn-modern-primary">💾 Save Branding</button>
                            <a href="?reset_branding=1" class="btn-modern btn-modern-secondary" style="text-decoration: none;">🔄 Reset to Default</a>
                        </div>
                    </form>
                    
                    <?php if (isset($_SESSION['brand_saved'])): ?>
                        <div style="padding: 12px; background: #d1fae5; border: 1px solid #10b981; border-radius: 8px; color: #065f46; margin-bottom: 20px;">
                            ✓ Branding saved successfully! The page will refresh to apply changes.
                        </div>
                        <?php unset($_SESSION['brand_saved']); ?>
                    <?php endif; ?>
                    
                    <h3 style="color: #4f46e5; font-size: 18px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #e5e7eb; margin-top: 32px;">Change Password</h3>
                    <form method="POST" style="display: grid; gap: 20px; max-width: 600px; margin-bottom: 32px;">
                        <div>
                            <label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 8px;">Current Password:</label>
                            <input type="password" name="current_password" required
                                   style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: border-color 0.2s;"
                                   onfocus="this.style.borderColor='#6b7280'" onblur="this.style.borderColor='#e5e7eb'"
                                   placeholder="Enter current password">
                        </div>
                        <div>
                            <label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 8px;">New Password:</label>
                            <input type="password" name="new_password" required minlength="6"
                                   style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: border-color 0.2s;"
                                   onfocus="this.style.borderColor='#6b7280'" onblur="this.style.borderColor='#e5e7eb'"
                                   placeholder="Enter new password (min 6 characters)">
                            <p style="font-size: 12px; color: #6b7280; margin-top: 4px;">Password must be at least 6 characters long</p>
                        </div>
                        <div>
                            <label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 8px;">Confirm New Password:</label>
                            <input type="password" name="confirm_password" required minlength="6"
                                   style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: border-color 0.2s;"
                                   onfocus="this.style.borderColor='#6b7280'" onblur="this.style.borderColor='#e5e7eb'"
                                   placeholder="Confirm new password">
                        </div>
                        <div style="display: flex; gap: 12px;">
                            <button type="submit" name="change_password" class="btn-modern btn-modern-primary">🔒 Change Password</button>
                        </div>
                    </form>
                    
                    <?php if (isset($_SESSION['password_error'])): ?>
                        <div style="padding: 12px; background: #fee2e2; border: 1px solid #ef4444; border-radius: 8px; color: #991b1b; margin-bottom: 20px;">
                            ✗ <?php echo htmlspecialchars($_SESSION['password_error']); ?>
                        </div>
                        <?php unset($_SESSION['password_error']); ?>
                    <?php endif; ?>
                    
                    <?php if (isset($_SESSION['password_saved'])): ?>
                        <div style="padding: 12px; background: #d1fae5; border: 1px solid #10b981; border-radius: 8px; color: #065f46; margin-bottom: 20px;">
                            ✓ Password changed successfully!
                        </div>
                        <?php unset($_SESSION['password_saved']); ?>
                    <?php endif; ?>
                    
                    <h3 style="color: #4f46e5; font-size: 18px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #e5e7eb; margin-top: 32px;">Backup Method</h3>
                    <form method="POST" style="display: grid; gap: 20px; max-width: 600px; margin-bottom: 32px;">
                        <div>
                            <label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 8px;">Snapshot Backup Method:</label>
                            <select name="backup_method" style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: border-color 0.2s;"
                                    onfocus="this.style.borderColor='#6b7280'" onblur="this.style.borderColor='#e5e7eb'">
                                <option value="vacuum_into" <?php echo $backupMethod === 'vacuum_into' ? 'selected' : ''; ?>>VACUUM INTO (Recommended)</option>
                                <option value="online_backup" <?php echo $backupMethod === 'online_backup' ? 'selected' : ''; ?>>Online Backup API</option>
                                <option value="begin_immediate" <?php echo $backupMethod === 'begin_immediate' ? 'selected' : ''; ?>>BEGIN IMMEDIATE + Copy</option>
                                <option value="file_copy" <?php echo $backupMethod === 'file_copy' ? 'selected' : ''; ?>>File Copy (Fastest)</option>
                            </select>
                            <div style="margin-top: 12px; padding: 12px; background: #f3f4f6; border-radius: 8px; font-size: 12px; color: #374151;">
                                <strong>Method Descriptions:</strong>
                                <ul style="margin: 8px 0 0 20px; padding: 0;">
                                    <li style="margin-bottom: 6px;"><strong>VACUUM INTO:</strong> Creates a clean, compacted snapshot. Best consistency, requires SQLite 3.27.0+. Blocks writes during backup.</li>
                                    <li style="margin-bottom: 6px;"><strong>Online Backup API:</strong> Incremental backup with minimal blocking. Best for live databases with active connections.</li>
                                    <li style="margin-bottom: 6px;"><strong>BEGIN IMMEDIATE + Copy:</strong> Locks database then copies. Good balance between consistency and speed.</li>
                                    <li><strong>File Copy:</strong> Simple file copy. Fastest but less safe if writes occur during backup.</li>
                                </ul>
                            </div>
                        </div>
                        <div style="display: flex; gap: 12px;">
                            <button type="submit" name="save_backup_settings" class="btn-modern btn-modern-primary">💾 Save Method</button>
                            <a href="?reset_backup_settings=1" class="btn-modern btn-modern-secondary" style="text-decoration: none;">🔄 Reset to Default</a>
                        </div>
                    </form>
                    
                    <?php if (isset($_SESSION['backup_settings_saved'])): ?>
                        <div style="padding: 12px; background: #d1fae5; border: 1px solid #10b981; border-radius: 8px; color: #065f46; margin-bottom: 20px;">
                            ✓ Backup method saved successfully!
                        </div>
                        <?php unset($_SESSION['backup_settings_saved']); ?>
                    <?php endif; ?>
                    
                    <h3 style="color: #4f46e5; font-size: 18px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #e5e7eb; margin-top: 32px;">Custom Backup Paths</h3>
                    <div style="padding: 12px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; color: #92400e; margin-bottom: 20px; font-size: 12px;">
                        <strong>ℹ️ Note:</strong> These are <strong>server-side paths</strong>, not client/browser paths. The paths must exist on the server where PHP is running.
                    </div>
                    <form method="POST" style="display: grid; gap: 20px; max-width: 600px;">
                        <div>
                            <label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 8px;">Snapshot Path (Server Path):</label>
                            <input type="text" name="snapshot_path" value="<?php echo htmlspecialchars($customSnapshotPath); ?>" 
                                   style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-family: monospace; font-size: 13px; transition: border-color 0.2s;"
                                   onfocus="this.style.borderColor='#6b7280'" onblur="this.style.borderColor='#e5e7eb'">
                            <p style="font-size: 12px; color: #6b7280; margin-top: 4px;">
                                <strong>Complete Server Path:</strong> <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px;"><?php echo htmlspecialchars(realpath($customSnapshotPath) ?: $customSnapshotPath); ?></code>
                            </p>
                            <p style="font-size: 12px; color: #6b7280; margin-top: 4px;">Where snapshot .db files are stored on the server</p>
                        </div>
                        <div>
                            <label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 8px;">Export Path (Server Path):</label>
                            <input type="text" name="export_path" value="<?php echo htmlspecialchars($customExportPath); ?>" 
                                   style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-family: monospace; font-size: 13px; transition: border-color 0.2s;"
                                   onfocus="this.style.borderColor='#6b7280'" onblur="this.style.borderColor='#e5e7eb'">
                            <p style="font-size: 12px; color: #6b7280; margin-top: 4px;">
                                <strong>Complete Server Path:</strong> <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px;"><?php echo htmlspecialchars(realpath($customExportPath) ?: $customExportPath); ?></code>
                            </p>
                            <p style="font-size: 12px; color: #6b7280; margin-top: 4px;">Where export directories are stored on the server</p>
                        </div>
                        <div style="display: flex; gap: 12px; margin-top: 8px;">
                            <button type="submit" name="save_paths" class="btn-modern btn-modern-primary">💾 Save Paths</button>
                            <a href="?reset_paths=1" class="btn-modern btn-modern-secondary" style="text-decoration: none;">🔄 Reset to Default</a>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>

    <!-- Backup Details Modal -->
    <div id="backup-modal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="modal-title">Backup Details</h3>
                <button class="modal-close" onclick="closeBackupModal()">&times;</button>
            </div>
            <div class="modal-body" id="modal-body">
                <!-- Content will be inserted here -->
            </div>
        </div>
    </div>

    <script>
        function switchTab(tabName, evt) {
            // Hide all tabs
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelectorAll('.tab').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Show selected tab
            const selectedTab = document.getElementById('tab-' + tabName);
            if (selectedTab) {
                selectedTab.classList.add('active');
            }
            
            // Activate the clicked tab button
            if (evt && evt.target) {
                evt.target.classList.add('active');
            } else {
                // Fallback: find button by onclick attribute
                document.querySelectorAll('.tab').forEach(btn => {
                    const onclick = btn.getAttribute('onclick') || '';
                    if (onclick.includes("'" + tabName + "'") || onclick.includes('"' + tabName + '"')) {
                        btn.classList.add('active');
                    }
                });
            }
            
            // Save active tab to localStorage
            localStorage.setItem('backup_restore_active_tab', tabName);
        }
        
        // Restore active tab from localStorage on page load
        (function() {
            const savedTab = localStorage.getItem('backup_restore_active_tab');
            if (savedTab) {
                // Wait for DOM to be ready
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', function() {
                        restoreTab(savedTab);
                    });
                } else {
                    restoreTab(savedTab);
                }
            }
            
            function restoreTab(tabName) {
                // Hide all tabs first
                document.querySelectorAll('.tab-content').forEach(tab => {
                    tab.classList.remove('active');
                });
                document.querySelectorAll('.tab').forEach(btn => {
                    btn.classList.remove('active');
                });
                
                // Show the saved tab
                const selectedTab = document.getElementById('tab-' + tabName);
                if (selectedTab) {
                    selectedTab.classList.add('active');
                }
                
                // Activate the corresponding tab button
                document.querySelectorAll('.tab').forEach(btn => {
                    const onclick = btn.getAttribute('onclick') || '';
                    if (onclick.includes("'" + tabName + "'") || onclick.includes('"' + tabName + '"')) {
                        btn.classList.add('active');
                    }
                });
            }
        })();

        function toggleDatabaseInfo() {
            const content = document.getElementById('database-info-content');
            const toggleIcon = document.getElementById('db-info-toggle-icon');
            const toggleText = document.getElementById('db-info-toggle-text');
            
            if (content.style.display === 'none') {
                content.style.display = 'block';
                toggleIcon.textContent = '▲';
                if (toggleText) toggleText.textContent = 'Hide';
            } else {
                content.style.display = 'none';
                toggleIcon.textContent = '▼';
                if (toggleText) toggleText.textContent = 'Show';
            }
        }

        function showAlert(message, type = 'info') {
            const container = document.getElementById('alert-container');
            const alert = document.createElement('div');
            alert.className = `alert alert-${type}`;
            alert.innerHTML = `
                <span>${message}</span>
                <button onclick="this.parentElement.remove()" style="margin-left: auto; background: none; border: none; cursor: pointer; font-size: 18px;">×</button>
            `;
            container.appendChild(alert);
            setTimeout(() => alert.remove(), 5000);
        }

        async function createSnapshot() {
            const btn = event.target.closest('button');
            const loading = document.getElementById('snapshot-loading');
            
            if (btn.disabled) return;
            
            if (!confirm('Create a new snapshot backup? This may take a few moments.')) return;
            
            btn.disabled = true;
            loading.style.display = 'inline-block';
            
            try {
                const formData = new FormData();
                formData.append('action', 'create_snapshot');
                
                const response = await fetch('', {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showAlert('Snapshot backup created successfully!', 'success');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    showAlert(result.error || 'Failed to create snapshot', 'error');
                }
            } catch (error) {
                showAlert('Error: ' + error.message, 'error');
            } finally {
                btn.disabled = false;
                loading.style.display = 'none';
            }
        }

        async function createExport() {
            const btn = event.target.closest('button');
            const loading = document.getElementById('export-loading');
            
            if (btn.disabled) return;
            
            if (!confirm('Create a new export backup? This may take a few moments.')) return;
            
            btn.disabled = true;
            loading.style.display = 'inline-block';
            
            try {
                const formData = new FormData();
                formData.append('action', 'create_export');
                
                const response = await fetch('', {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showAlert('Export backup created successfully!', 'success');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    showAlert(result.error || 'Failed to create export', 'error');
                }
            } catch (error) {
                showAlert('Error: ' + error.message, 'error');
            } finally {
                btn.disabled = false;
                loading.style.display = 'none';
            }
        }

        async function restoreSnapshot(filename) {
            if (!confirm(`WARNING: This will OVERWRITE your current database with the snapshot "${filename}".\n\nThis action cannot be undone. Are you sure?`)) {
                return;
            }
            
            if (!confirm('Are you absolutely sure? This will replace all current data!')) {
                return;
            }
            
            try {
                const formData = new FormData();
                formData.append('action', 'restore_snapshot');
                formData.append('filename', filename);
                
                const response = await fetch('', {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showAlert('Database restored successfully! The page will reload.', 'success');
                    setTimeout(() => location.reload(), 2000);
                } else {
                    showAlert(result.error || 'Failed to restore snapshot', 'error');
                }
            } catch (error) {
                showAlert('Error: ' + error.message, 'error');
            }
        }

        async function deleteSnapshot(filename) {
            if (!confirm(`Are you sure you want to delete the snapshot backup "${filename}"?\n\nThis action cannot be undone.`)) {
                return;
            }
            
            try {
                const formData = new FormData();
                formData.append('action', 'delete_snapshot');
                formData.append('filename', filename);
                
                const response = await fetch('', {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showAlert('Snapshot backup deleted successfully!', 'success');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    showAlert(result.error || 'Failed to delete snapshot', 'error');
                }
            } catch (error) {
                showAlert('Error: ' + error.message, 'error');
            }
        }

        async function restoreExport(dirname) {
            if (!confirm(`WARNING: This will OVERWRITE your current database with the export "${dirname}".\n\nThis action cannot be undone. Are you sure?`)) {
                return;
            }
            
            if (!confirm('Are you absolutely sure? This will replace all current data!')) {
                return;
            }
            
            try {
                const formData = new FormData();
                formData.append('action', 'restore_export');
                formData.append('dirname', dirname);
                
                const response = await fetch('', {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showAlert('Database restored successfully! The page will reload.', 'success');
                    setTimeout(() => location.reload(), 2000);
                } else {
                    showAlert(result.error || 'Failed to restore export', 'error');
                }
            } catch (error) {
                showAlert('Error: ' + error.message, 'error');
            }
        }

        async function deleteExport(dirname) {
            if (!confirm(`Are you sure you want to delete the export backup "${dirname}"?\n\nThis action cannot be undone.`)) {
                return;
            }
            
            try {
                const formData = new FormData();
                formData.append('action', 'delete_export');
                formData.append('dirname', dirname);
                
                const response = await fetch('', {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showAlert('Export backup deleted successfully!', 'success');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    showAlert(result.error || 'Failed to delete export', 'error');
                }
            } catch (error) {
                showAlert('Error: ' + error.message, 'error');
            }
        }

        async function deleteAllSnapshots() {
            if (!confirm('⚠️ WARNING: Are you sure you want to delete ALL snapshot backups?\n\nThis action cannot be undone and will delete all snapshot files.')) {
                return;
            }
            
            if (!confirm('This is your last chance. Are you absolutely sure?')) {
                return;
            }
            
            try {
                const formData = new FormData();
                formData.append('action', 'delete_all_snapshots');
                
                showAlert('Deleting all snapshots...', 'info');
                
                const response = await fetch('', {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showAlert(result.message || 'All snapshots deleted successfully!', 'success');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    showAlert(result.error || 'Failed to delete snapshots', 'error');
                }
            } catch (error) {
                showAlert('Error: ' + error.message, 'error');
            }
        }

        async function deleteAllExports() {
            if (!confirm('⚠️ WARNING: Are you sure you want to delete ALL export backups?\n\nThis action cannot be undone and will delete all export directories.')) {
                return;
            }
            
            if (!confirm('This is your last chance. Are you absolutely sure?')) {
                return;
            }
            
            try {
                const formData = new FormData();
                formData.append('action', 'delete_all_exports');
                
                showAlert('Deleting all exports...', 'info');
                
                const response = await fetch('', {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showAlert(result.message || 'All exports deleted successfully!', 'success');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    showAlert(result.error || 'Failed to delete exports', 'error');
                }
            } catch (error) {
                showAlert('Error: ' + error.message, 'error');
            }
        }

        async function deleteOldSnapshots() {
            const days = parseInt(document.getElementById('snapshot-days').value);
            
            if (!confirm(`Are you sure you want to delete snapshot backups older than ${days} day${days > 1 ? 's' : ''}?\n\nThis action cannot be undone.`)) {
                return;
            }
            
            try {
                const formData = new FormData();
                formData.append('action', 'delete_old_snapshots');
                formData.append('days', days);
                
                showAlert(`Deleting snapshots older than ${days} day${days > 1 ? 's' : ''}...`, 'info');
                
                const response = await fetch('', {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showAlert(result.message || 'Old snapshots deleted successfully!', 'success');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    showAlert(result.error || 'Failed to delete old snapshots', 'error');
                }
            } catch (error) {
                showAlert('Error: ' + error.message, 'error');
            }
        }

        async function deleteOldExports() {
            const days = parseInt(document.getElementById('export-days').value);
            
            if (!confirm(`Are you sure you want to delete export backups older than ${days} day${days > 1 ? 's' : ''}?\n\nThis action cannot be undone.`)) {
                return;
            }
            
            try {
                const formData = new FormData();
                formData.append('action', 'delete_old_exports');
                formData.append('days', days);
                
                showAlert(`Deleting exports older than ${days} day${days > 1 ? 's' : ''}...`, 'info');
                
                const response = await fetch('', {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showAlert(result.message || 'Old exports deleted successfully!', 'success');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    showAlert(result.error || 'Failed to delete old exports', 'error');
                }
            } catch (error) {
                showAlert('Error: ' + error.message, 'error');
            }
        }

        async function uploadBackup(type, file) {
            if (!file) return;
            
            if (type === 'snapshot' && !file.name.endsWith('.db')) {
                showAlert('Snapshot files must be .db files', 'error');
                return;
            }
            
            if (type === 'export' && !file.name.endsWith('.zip')) {
                showAlert('Export files must be .zip files', 'error');
                return;
            }
            
            try {
                const formData = new FormData();
                formData.append('action', 'upload_backup');
                formData.append('backup_type', type);
                formData.append('backup_file', file);
                
                showAlert(`Uploading ${file.name}...`, 'info');
                
                const response = await fetch('', {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showAlert(result.message || 'File uploaded successfully!', 'success');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    showAlert(result.error || 'Upload failed', 'error');
                }
            } catch (error) {
                showAlert('Error: ' + error.message, 'error');
            }
        }

        function downloadExportZip(dirname) {
            window.location.href = '?action=download_export_zip&dirname=' + encodeURIComponent(dirname);
        }

        function downloadSnapshotZip(filename) {
            window.location.href = '?action=download_snapshot_zip&filename=' + encodeURIComponent(filename);
        }

        function showSnapshotDetails(filename, snapshot) {
            const modal = document.getElementById('backup-modal');
            const modalTitle = document.getElementById('modal-title');
            const modalBody = document.getElementById('modal-body');
            
            modalTitle.textContent = '📸 Snapshot Backup Details';
            
            const createdDate = new Date(snapshot.created_at * 1000).toLocaleString();
            const fileSize = formatBytesJS(snapshot.size);
            const metadata = snapshot.metadata || {};
            
            let html = `
                <div class="info-row">
                    <div class="info-label">Filename:</div>
                    <div class="info-value"><code>${escapeHtml(filename)}</code></div>
                </div>
                <div class="info-row">
                    <div class="info-label">File Size:</div>
                    <div class="info-value">${fileSize}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">Created:</div>
                    <div class="info-value">${createdDate}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">File Path:</div>
                    <div class="info-value"><code>${escapeHtml(snapshot.path)}</code></div>
                </div>
            `;
            
            if (metadata.timestamp) {
                html += `
                    <div class="info-row">
                        <div class="info-label">Backup Method:</div>
                        <div class="info-value">${escapeHtml(metadata.method || 'N/A')}</div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Backup Date:</div>
                        <div class="info-value">${escapeHtml(metadata.date || 'N/A')}</div>
                    </div>
                `;
            }
            
            modalBody.innerHTML = html;
            modal.style.display = 'block';
        }

        function showExportDetails(dirname, exportData) {
            const modal = document.getElementById('backup-modal');
            const modalTitle = document.getElementById('modal-title');
            const modalBody = document.getElementById('modal-body');
            
            modalTitle.textContent = '📦 Export Backup Details';
            
            const createdDate = new Date(exportData.created_at * 1000).toLocaleString();
            const totalSize = formatBytesJS(exportData.size);
            const metadata = exportData.metadata || {};
            
            let html = `
                <div class="info-row">
                    <div class="info-label">Directory Name:</div>
                    <div class="info-value"><code>${escapeHtml(dirname)}</code></div>
                </div>
                <div class="info-row">
                    <div class="info-label">Total Size:</div>
                    <div class="info-value">${totalSize}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">Created:</div>
                    <div class="info-value">${createdDate}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">Directory Path:</div>
                    <div class="info-value"><code>${escapeHtml(exportData.path)}</code></div>
                </div>
            `;
            
            if (metadata.exported_at) {
                const exportDate = metadata.exported_at_formatted || new Date(metadata.exported_at * 1000).toLocaleString();
                html += `
                    <div class="info-row">
                        <div class="info-label">Export Date:</div>
                        <div class="info-value">${escapeHtml(exportDate)}</div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Database Path:</div>
                        <div class="info-value"><code>${escapeHtml(metadata.database_path || 'N/A')}</code></div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Database Size:</div>
                        <div class="info-value">${metadata.database_size ? formatBytesJS(metadata.database_size) : 'N/A'}</div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">PHP Version:</div>
                        <div class="info-value">${escapeHtml(metadata.php_version || 'N/A')}</div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">SQLite Version:</div>
                        <div class="info-value">${escapeHtml(metadata.sqlite_version || 'N/A')}</div>
                    </div>
                `;
            }
            
            modalBody.innerHTML = html;
            modal.style.display = 'block';
        }

        function closeBackupModal() {
            document.getElementById('backup-modal').style.display = 'none';
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function formatBytesJS(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
        }

        // Close modal when clicking outside
        window.onclick = function(event) {
            const modal = document.getElementById('backup-modal');
            if (event.target === modal) {
                closeBackupModal();
            }
        }
        
        // Close modal with ESC key
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape' || event.keyCode === 27) {
                const modal = document.getElementById('backup-modal');
                if (modal && modal.style.display === 'block') {
                    closeBackupModal();
                }
            }
        });
    </script>
</body>
</html>
