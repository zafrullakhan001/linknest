<?php
/**
 * LinkNest Local Windows System Landing Page
 * 
 * Provides quick access to all application services and tools for local XAMPP installation
 */

// Load config to access database and getAppName() function
// Use output buffering to prevent any errors from breaking the page
ob_start();
try {
    require_once __DIR__ . '/api/config.php';
    // Get application branding from database
    $appName = getAppName() ?: 'LinkNest';
    
    // Try to get logo icon from settings
    try {
        $db = getDB();
        $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'logo_icon' LIMIT 1");
        $stmt->execute();
        $logoRow = $stmt->fetch();
        $logoIcon = ($logoRow && !empty($logoRow['value'])) ? $logoRow['value'] : '🔗';
    } catch (Exception $e) {
        $logoIcon = '🔗'; // Default icon
    }
} catch (Exception $e) {
    // If config fails to load, use defaults
    $appName = 'LinkNest';
    $logoIcon = '🔗';
}
ob_end_clean();

// Detect current protocol and host
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';

// Get the base path (folder) where this file is located relative to document root
$documentRoot = $_SERVER['DOCUMENT_ROOT'] ?? __DIR__;
$scriptPath = dirname($_SERVER['SCRIPT_NAME'] ?? '');
$basePath = rtrim($scriptPath, '/');
$baseUrl = $protocol . '://' . $host . $basePath;

// Extract port from host if present
$port = '80';
if (strpos($host, ':') !== false) {
    $parts = explode(':', $host);
    $port = $parts[1] ?? '80';
}

// For local XAMPP, HTTPS might not be enabled
$httpsUrl = 'https://' . ($port === '80' ? $host : str_replace(':' . $port, ':443', $host)) . $basePath;

// Get system info
$phpVersion = PHP_VERSION;
$serverSoftware = $_SERVER['SERVER_SOFTWARE'] ?? 'Unknown';

// Check if backup_restore.php exists
$backupRestoreExists = file_exists(__DIR__ . '/backup_restore.php');

// Get database statistics if config is loaded
$dbStats = null;
try {
    if (function_exists('getDB')) {
        $db = getDB();
        $dbStats = [
            'tiles' => $db->query("SELECT COUNT(*) FROM tiles")->fetchColumn() ?? 0,
            'users' => $db->query("SELECT COUNT(*) FROM users")->fetchColumn() ?? 0,
            'links' => $db->query("SELECT COUNT(*) FROM links")->fetchColumn() ?? 0,
            'tabs' => $db->query("SELECT COUNT(*) FROM tabs")->fetchColumn() ?? 0,
            'sections' => $db->query("SELECT COUNT(*) FROM sections")->fetchColumn() ?? 0,
        ];
        // Try to get monitors count (might not exist)
        try {
            $dbStats['monitors'] = $db->query("SELECT COUNT(*) FROM monitors")->fetchColumn() ?? 0;
        } catch (PDOException $e) {
            $dbStats['monitors'] = 0;
        }
    }
} catch (Exception $e) {
    // Database stats unavailable
    $dbStats = null;
}

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($appName); ?> - Landing Page</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
            color: #333;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .header {
            background: white;
            border-radius: 16px;
            padding: 40px;
            margin-bottom: 30px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            text-align: center;
        }
        
        .header h1 {
            font-size: 42px;
            color: #1f2937;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
        }
        
        .header p {
            font-size: 18px;
            color: #6b7280;
            margin-top: 10px;
        }
        
        .info-badge {
            display: inline-block;
            background: #f3f4f6;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            color: #374151;
            margin: 5px;
        }
        
        .info-badge.local {
            background: #dbeafe;
            color: #1e40af;
        }
        
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 25px;
            margin-bottom: 30px;
        }
        
        .card {
            background: white;
            border-radius: 16px;
            padding: 30px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        
        .card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 50px rgba(0,0,0,0.15);
        }
        
        .card-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #f3f4f6;
        }
        
        .card-header h2 {
            font-size: 24px;
            color: #1f2937;
            margin: 0;
        }
        
        .card-header .icon {
            font-size: 28px;
        }
        
        .link-list {
            list-style: none;
        }
        
        .link-list li {
            margin-bottom: 12px;
        }
        
        .link-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            background: #f9fafb;
            border-radius: 8px;
            text-decoration: none;
            color: #374151;
            transition: all 0.2s ease;
            border: 2px solid transparent;
        }
        
        .link-item:hover {
            background: #f3f4f6;
            border-color: #667eea;
            transform: translateX(5px);
        }
        
        .link-item .link-icon {
            font-size: 20px;
            width: 24px;
            text-align: center;
        }
        
        .link-item .link-content {
            flex: 1;
        }
        
        .link-item .link-label {
            font-weight: 600;
            font-size: 15px;
            color: #1f2937;
            display: block;
            margin-bottom: 2px;
        }
        
        .link-item .link-url {
            font-size: 13px;
            color: #6b7280;
            font-family: 'Courier New', monospace;
        }
        
        .link-item .link-badge {
            background: #667eea;
            color: white;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .link-item .link-badge.https {
            background: #10b981;
        }
        
        .link-item .link-badge.local {
            background: #3b82f6;
        }
        
        .link-item .link-badge.disabled {
            background: #9ca3af;
            opacity: 0.6;
        }
        
        .footer {
            background: white;
            border-radius: 16px;
            padding: 30px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            text-align: center;
            color: #6b7280;
        }
        
        .footer h3 {
            color: #1f2937;
            margin-bottom: 15px;
        }
        
        .footer .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }
        
        .footer .info-item {
            padding: 15px;
            background: #f9fafb;
            border-radius: 8px;
        }
        
        .footer .info-label {
            font-size: 12px;
            color: #9ca3af;
            margin-bottom: 5px;
        }
        
        .footer .info-value {
            font-size: 16px;
            font-weight: 600;
            color: #1f2937;
            font-family: 'Courier New', monospace;
            word-break: break-all;
        }
        
        .warning-box {
            background: #fef3c7;
            border: 2px solid #f59e0b;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
            color: #92400e;
        }
        
        .warning-box strong {
            display: block;
            margin-bottom: 8px;
            font-size: 16px;
        }
        
        .info-box {
            background: #e0f2fe;
            border-left: 4px solid #0ea5e9;
            border-radius: 8px;
            padding: 15px;
            margin-top: 15px;
            font-size: 13px;
            color: #075985;
        }
        
        .info-box strong {
            display: block;
            margin-bottom: 8px;
            color: #0c4a6e;
            font-size: 14px;
        }
        
        @media (max-width: 768px) {
            .grid {
                grid-template-columns: 1fr;
            }
            
            .header h1 {
                font-size: 32px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>
                <span><?php echo htmlspecialchars($logoIcon); ?></span>
                <span><?php echo htmlspecialchars($appName); ?></span>
            </h1>
            <p>Local Windows System - Quick Access to All Services</p>
            <div style="margin-top: 20px;">
                <span class="info-badge local">Windows Local</span>
                <span class="info-badge">PHP <?php echo htmlspecialchars($phpVersion); ?></span>
                <span class="info-badge"><?php echo htmlspecialchars($serverSoftware); ?></span>
            </div>
        </div>

        <?php if ($dbStats): ?>
        <!-- Quick Statistics -->
        <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px;">
            <div style="text-align: center; padding: 10px;">
                <div style="font-size: 28px; font-weight: bold; color: #667eea;"><?php echo number_format($dbStats['tiles']); ?></div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 5px;">Tiles</div>
            </div>
            <div style="text-align: center; padding: 10px;">
                <div style="font-size: 28px; font-weight: bold; color: #667eea;"><?php echo number_format($dbStats['users']); ?></div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 5px;">Users</div>
            </div>
            <div style="text-align: center; padding: 10px;">
                <div style="font-size: 28px; font-weight: bold; color: #667eea;"><?php echo number_format($dbStats['links']); ?></div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 5px;">Links</div>
            </div>
            <div style="text-align: center; padding: 10px;">
                <div style="font-size: 28px; font-weight: bold; color: #667eea;"><?php echo number_format($dbStats['tabs']); ?></div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 5px;">Tabs</div>
            </div>
            <div style="text-align: center; padding: 10px;">
                <div style="font-size: 28px; font-weight: bold; color: #667eea;"><?php echo number_format($dbStats['sections']); ?></div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 5px;">Sections</div>
            </div>
            <?php if (isset($dbStats['monitors'])): ?>
            <div style="text-align: center; padding: 10px;">
                <div style="font-size: 28px; font-weight: bold; color: #667eea;"><?php echo number_format($dbStats['monitors']); ?></div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 5px;">Monitors</div>
            </div>
            <?php endif; ?>
        </div>
        <?php endif; ?>

        <div class="grid">
            <!-- Main Application -->
            <div class="card">
                <div class="card-header">
                    <span class="icon">🌐</span>
                    <h2>Main Application</h2>
                </div>
                <ul class="link-list">
                    <li>
                        <a href="<?php echo $baseUrl; ?>" class="link-item" target="_blank">
                            <span class="link-icon">🔗</span>
                            <div class="link-content">
                                <span class="link-label"><?php echo htmlspecialchars($appName); ?> Application</span>
                                <span class="link-url"><?php echo htmlspecialchars($baseUrl); ?></span>
                            </div>
                            <span class="link-badge">HTTP</span>
                        </a>
                    </li>
                    <?php if ($protocol === 'https' || file_exists($_SERVER['DOCUMENT_ROOT'] . '/ssl')): ?>
                    <li>
                        <a href="<?php echo $httpsUrl; ?>" class="link-item" target="_blank">
                            <span class="link-icon">🔒</span>
                            <div class="link-content">
                                <span class="link-label"><?php echo htmlspecialchars($appName); ?> Application (Secure)</span>
                                <span class="link-url"><?php echo htmlspecialchars($httpsUrl); ?></span>
                            </div>
                            <span class="link-badge https">HTTPS</span>
                        </a>
                    </li>
                    <?php else: ?>
                    <li>
                        <div class="link-item" style="cursor: default; opacity: 0.6;">
                            <span class="link-icon">🔒</span>
                            <div class="link-content">
                                <span class="link-label">HTTPS (Not Configured)</span>
                                <span class="link-url">Enable SSL in XAMPP to use HTTPS</span>
                            </div>
                            <span class="link-badge disabled">Disabled</span>
                        </div>
                    </li>
                    <?php endif; ?>
                </ul>
            </div>

            <!-- System Tools -->
            <div class="card">
                <div class="card-header">
                    <span class="icon">🛠️</span>
                    <h2>System Tools</h2>
                </div>
                <ul class="link-list">
                    <?php if (file_exists(__DIR__ . '/check_opcache.php')): ?>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/check_opcache.php" class="link-item" target="_blank">
                            <span class="link-icon">⚡</span>
                            <div class="link-content">
                                <span class="link-label">OPcache Status Dashboard</span>
                                <span class="link-url">/check_opcache.php</span>
                            </div>
                            <span class="link-badge">HTTP</span>
                        </a>
                    </li>
                    <?php endif; ?>
                    <?php if ($backupRestoreExists): ?>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/backup_restore.php" class="link-item" target="_blank">
                            <span class="link-icon">💾</span>
                            <div class="link-content">
                                <span class="link-label">Backup & Restore Manager</span>
                                <span class="link-url">/backup_restore.php</span>
                            </div>
                            <span class="link-badge">HTTP</span>
                        </a>
                    </li>
                    <?php endif; ?>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/landing.php" class="link-item" target="_blank">
                            <span class="link-icon">🏠</span>
                            <div class="link-content">
                                <span class="link-label">This Landing Page</span>
                                <span class="link-url">/landing.php</span>
                            </div>
                            <span class="link-badge local">Local</span>
                        </a>
                    </li>
                </ul>
            </div>

            <!-- API Endpoints -->
            <div class="card">
                <div class="card-header">
                    <span class="icon">🔌</span>
                    <h2>API Endpoints</h2>
                </div>
                <ul class="link-list">
                    <li>
                        <a href="<?php echo $baseUrl; ?>/api/" class="link-item" target="_blank">
                            <span class="link-icon">📡</span>
                            <div class="link-content">
                                <span class="link-label">API Base</span>
                                <span class="link-url">/api/</span>
                            </div>
                            <span class="link-badge">HTTP</span>
                        </a>
                    </li>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/api/settings" class="link-item" target="_blank">
                            <span class="link-icon">⚙️</span>
                            <div class="link-content">
                                <span class="link-label">Settings API</span>
                                <span class="link-url">/api/settings</span>
                            </div>
                        </a>
                    </li>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/api/auth.php" class="link-item" target="_blank">
                            <span class="link-icon">🔐</span>
                            <div class="link-content">
                                <span class="link-label">Authentication API</span>
                                <span class="link-url">/api/auth.php</span>
                            </div>
                        </a>
                    </li>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/api/tiles.php" class="link-item" target="_blank">
                            <span class="link-icon">🎯</span>
                            <div class="link-content">
                                <span class="link-label">Tiles API</span>
                                <span class="link-url">/api/tiles.php</span>
                            </div>
                        </a>
                    </li>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/api/database.php/info" class="link-item" target="_blank">
                            <span class="link-icon">🗄️</span>
                            <div class="link-content">
                                <span class="link-label">Database Info</span>
                                <span class="link-url">/api/database.php/info</span>
                            </div>
                        </a>
                    </li>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/api/monitors.php" class="link-item" target="_blank">
                            <span class="link-icon">📊</span>
                            <div class="link-content">
                                <span class="link-label">Monitors API</span>
                                <span class="link-url">/api/monitors.php</span>
                            </div>
                        </a>
                    </li>
                </ul>
            </div>

            <!-- Email Testing (Mailpit) -->
            <div class="card">
                <div class="card-header">
                    <span class="icon">📧</span>
                    <h2>Email Testing (Mailpit)</h2>
                </div>
                <ul class="link-list">
                    <li>
                        <a href="http://localhost:8025" class="link-item" target="_blank">
                            <span class="link-icon">📬</span>
                            <div class="link-content">
                                <span class="link-label">Mailpit Web UI (Email Inbox)</span>
                                <span class="link-url">http://localhost:8025</span>
                            </div>
                            <span class="link-badge external">Port 8025</span>
                        </a>
                    </li>
                </ul>
                <div style="margin-top: 15px; padding: 15px; background: #e0f2fe; border-radius: 8px; border-left: 4px solid #0ea5e9;">
                    <strong style="color: #0c4a6e; display: block; margin-bottom: 10px; font-size: 14px;">📬 Mailpit Features:</strong>
                    <ul style="font-size: 13px; color: #075985; line-height: 1.8; margin-left: 20px;">
                        <li>View all emails sent by the application</li>
                        <li>Test email functionality</li>
                        <li>Preview HTML emails</li>
                        <li>Download email attachments</li>
                        <li>Search and filter emails</li>
                    </ul>
                </div>
                <div style="margin-top: 15px; padding: 15px; background: #f9fafb; border-radius: 8px; font-size: 13px; color: #6b7280;">
                    <strong style="color: #374151; display: block; margin-bottom: 8px;">🔧 SMTP Configuration for <?php echo htmlspecialchars($appName); ?>:</strong>
                    <div style="font-family: 'Courier New', monospace; line-height: 1.8; background: white; padding: 12px; border-radius: 6px; margin-top: 8px;">
                        <div style="color: #059669;"><strong>Local Windows (Mailpit):</strong></div>
                        Host: <strong>localhost</strong><br>
                        Port: <strong>1025</strong><br>
                        Auth: <strong>None required</strong><br>
                        TLS/SSL: <strong>Disabled</strong>
                    </div>
                </div>
                <div class="info-box" style="margin-top: 10px; background: #fef3c7; border-color: #f59e0b; color: #92400e;">
                    <strong>ℹ️ Note:</strong>
                    <div style="margin-top: 5px;">
                        Mailpit must be installed and running separately on Windows. If Mailpit is not installed, you can use Mercury Mail Server (included with XAMPP) or configure your own SMTP server.
                    </div>
                </div>
            </div>

            <!-- Database Management -->
            <div class="card">
                <div class="card-header">
                    <span class="icon">💾</span>
                    <h2>Database Management</h2>
                </div>
                <ul class="link-list">
                    <li>
                        <a href="<?php echo $baseUrl; ?>/api/database.php/export" class="link-item" target="_blank">
                            <span class="link-icon">📤</span>
                            <div class="link-content">
                                <span class="link-label">Export Database</span>
                                <span class="link-url">/api/database.php/export</span>
                            </div>
                        </a>
                    </li>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/api/database.php/snapshots" class="link-item" target="_blank">
                            <span class="link-icon">📸</span>
                            <div class="link-content">
                                <span class="link-label">List Snapshots</span>
                                <span class="link-url">/api/database.php/snapshots</span>
                            </div>
                        </a>
                    </li>
                    <?php if ($backupRestoreExists): ?>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/backup_restore.php" class="link-item" target="_blank">
                            <span class="link-icon">🔄</span>
                            <div class="link-content">
                                <span class="link-label">Backup & Restore</span>
                                <span class="link-url">/backup_restore.php</span>
                            </div>
                            <span class="link-badge">Full UI</span>
                        </a>
                    </li>
                    <?php endif; ?>
                </ul>
            </div>

            <!-- Quick Actions -->
            <div class="card">
                <div class="card-header">
                    <span class="icon">⚡</span>
                    <h2>Quick Actions</h2>
                </div>
                <ul class="link-list">
                    <li>
                        <a href="<?php echo $baseUrl; ?>/api/optimize_database.php" class="link-item" target="_blank">
                            <span class="link-icon">🔧</span>
                            <div class="link-content">
                                <span class="link-label">Optimize Database</span>
                                <span class="link-url">/api/optimize_database.php</span>
                            </div>
                        </a>
                    </li>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/api/uploads.php" class="link-item" target="_blank">
                            <span class="link-icon">📁</span>
                            <div class="link-content">
                                <span class="link-label">Uploads Manager</span>
                                <span class="link-url">/api/uploads.php</span>
                            </div>
                        </a>
                    </li>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/api/linkhealth.php" class="link-item" target="_blank">
                            <span class="link-icon">🏥</span>
                            <div class="link-content">
                                <span class="link-label">Link Health Check</span>
                                <span class="link-url">/api/linkhealth.php</span>
                            </div>
                        </a>
                    </li>
                </ul>
            </div>

            <!-- Development & Debug Tools -->
            <div class="card">
                <div class="card-header">
                    <span class="icon">🛠️</span>
                    <h2>Development & Debug Tools</h2>
                </div>
                <ul class="link-list">
                    <?php if (file_exists(__DIR__ . '/scripts/check_database.php')): ?>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/scripts/check_database.php" class="link-item" target="_blank">
                            <span class="link-icon">🔍</span>
                            <div class="link-content">
                                <span class="link-label">Database Checker</span>
                                <span class="link-url">/scripts/check_database.php</span>
                            </div>
                        </a>
                    </li>
                    <?php endif; ?>
                    <?php if (file_exists(__DIR__ . '/scripts/ldap_debug.php')): ?>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/scripts/ldap_debug.php" class="link-item" target="_blank">
                            <span class="link-icon">🔐</span>
                            <div class="link-content">
                                <span class="link-label">LDAP Debug Tool</span>
                                <span class="link-url">/scripts/ldap_debug.php</span>
                            </div>
                        </a>
                    </li>
                    <?php endif; ?>
                    <?php if (file_exists(__DIR__ . '/api/clone.php')): ?>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/api/clone.php" class="link-item" target="_blank">
                            <span class="link-icon">📋</span>
                            <div class="link-content">
                                <span class="link-label">Clone Service</span>
                                <span class="link-url">/api/clone.php</span>
                            </div>
                        </a>
                    </li>
                    <?php endif; ?>
                    <?php if (file_exists(__DIR__ . '/api/configure_enterprise_sqlite.php')): ?>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/api/configure_enterprise_sqlite.php" class="link-item" target="_blank">
                            <span class="link-icon">⚙️</span>
                            <div class="link-content">
                                <span class="link-label">Configure Enterprise SQLite</span>
                                <span class="link-url">/api/configure_enterprise_sqlite.php</span>
                            </div>
                        </a>
                    </li>
                    <?php endif; ?>
                </ul>
            </div>

            <!-- Additional API Endpoints -->
            <div class="card">
                <div class="card-header">
                    <span class="icon">🔌</span>
                    <h2>Additional API Endpoints</h2>
                </div>
                <ul class="link-list">
                    <?php if (file_exists(__DIR__ . '/api/arrangements.php')): ?>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/api/arrangements.php" class="link-item" target="_blank">
                            <span class="link-icon">📐</span>
                            <div class="link-content">
                                <span class="link-label">Arrangements API</span>
                                <span class="link-url">/api/arrangements.php</span>
                            </div>
                        </a>
                    </li>
                    <?php endif; ?>
                    <?php if (file_exists(__DIR__ . '/api/styles.php')): ?>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/api/styles.php" class="link-item" target="_blank">
                            <span class="link-icon">🎨</span>
                            <div class="link-content">
                                <span class="link-label">Styles API</span>
                                <span class="link-url">/api/styles.php</span>
                            </div>
                        </a>
                    </li>
                    <?php endif; ?>
                    <?php if (file_exists(__DIR__ . '/api/access.php')): ?>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/api/access.php" class="link-item" target="_blank">
                            <span class="link-icon">👥</span>
                            <div class="link-content">
                                <span class="link-label">Access Control API</span>
                                <span class="link-url">/api/access.php</span>
                            </div>
                        </a>
                    </li>
                    <?php endif; ?>
                    <?php if (file_exists(__DIR__ . '/api/alarms.php')): ?>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/api/alarms.php" class="link-item" target="_blank">
                            <span class="link-icon">⏰</span>
                            <div class="link-content">
                                <span class="link-label">Alarms API</span>
                                <span class="link-url">/api/alarms.php</span>
                            </div>
                        </a>
                    </li>
                    <?php endif; ?>
                    <?php if (file_exists(__DIR__ . '/api/browsers.php')): ?>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/api/browsers.php" class="link-item" target="_blank">
                            <span class="link-icon">🌐</span>
                            <div class="link-content">
                                <span class="link-label">Browsers API</span>
                                <span class="link-url">/api/browsers.php</span>
                            </div>
                        </a>
                    </li>
                    <?php endif; ?>
                    <?php if (file_exists(__DIR__ . '/api/broadcast.php')): ?>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/api/broadcast.php" class="link-item" target="_blank">
                            <span class="link-icon">📢</span>
                            <div class="link-content">
                                <span class="link-label">Broadcast API</span>
                                <span class="link-url">/api/broadcast.php</span>
                            </div>
                        </a>
                    </li>
                    <?php endif; ?>
                    <?php if (file_exists(__DIR__ . '/api/notes.php')): ?>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/api/notes.php" class="link-item" target="_blank">
                            <span class="link-icon">📝</span>
                            <div class="link-content">
                                <span class="link-label">Notes API</span>
                                <span class="link-url">/api/notes.php</span>
                            </div>
                        </a>
                    </li>
                    <?php endif; ?>
                    <?php if (file_exists(__DIR__ . '/api/timezones.php')): ?>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/api/timezones.php" class="link-item" target="_blank">
                            <span class="link-icon">🌍</span>
                            <div class="link-content">
                                <span class="link-label">Timezones API</span>
                                <span class="link-url">/api/timezones.php</span>
                            </div>
                        </a>
                    </li>
                    <?php endif; ?>
                </ul>
            </div>

            <!-- Local System Information -->
            <div class="card">
                <div class="card-header">
                    <span class="icon">ℹ️</span>
                    <h2>Local System Info</h2>
                </div>
                <div class="info-box">
                    <strong>📂 Document Root:</strong>
                    <div style="font-family: 'Courier New', monospace; margin-top: 5px;">
                        <?php echo htmlspecialchars($documentRoot); ?>
                    </div>
                </div>
                <div class="info-box" style="margin-top: 10px;">
                    <strong>💾 Database Location:</strong>
                    <div style="font-family: 'Courier New', monospace; margin-top: 5px;">
                        <?php 
                        $dbPath = $documentRoot . '/data/linknest.db';
                        echo htmlspecialchars($dbPath);
                        if (file_exists($dbPath)) {
                            $dbSize = filesize($dbPath);
                            echo ' (' . number_format($dbSize / 1024, 2) . ' KB)';
                        }
                        ?>
                    </div>
                </div>
                <div class="info-box" style="margin-top: 10px; background: #fef3c7; border-color: #f59e0b; color: #92400e;">
                    <strong>⚠️ Local Development:</strong>
                    <div style="margin-top: 5px;">
                        This is a local Windows installation. For production deployment, consider using the Docker container version for better isolation and security.
                    </div>
                </div>
            </div>
        </div>

        <div class="footer">
            <h3>🪟 Local Windows System Information</h3>
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">System Type</div>
                    <div class="info-value">Windows Local</div>
                </div>
                <div class="info-item">
                    <div class="info-label">PHP Version</div>
                    <div class="info-value"><?php echo htmlspecialchars($phpVersion); ?></div>
                </div>
                <div class="info-item">
                    <div class="info-label">Server Software</div>
                    <div class="info-value"><?php echo htmlspecialchars($serverSoftware); ?></div>
                </div>
                <div class="info-item">
                    <div class="info-label">Current URL</div>
                    <div class="info-value"><?php echo htmlspecialchars($baseUrl); ?></div>
                </div>
                <div class="info-item">
                    <div class="info-label">Document Root</div>
                    <div class="info-value" style="font-size: 12px;"><?php echo htmlspecialchars($documentRoot); ?></div>
                </div>
                <div class="info-item">
                    <div class="info-label">Backup Restore</div>
                    <div class="info-value"><?php echo $backupRestoreExists ? 'Available' : 'Not Found'; ?></div>
                </div>
                <div class="info-item">
                    <div class="info-label">Mailpit Port</div>
                    <div class="info-value">8025 (Optional)</div>
                </div>
            </div>
            <div style="margin-top: 25px; padding-top: 20px; border-top: 2px solid #f3f4f6;">
                <p style="font-size: 14px; color: #9ca3af;">
                    <strong>Default Credentials:</strong> admin / admin (⚠️ Change immediately after first login!)
                </p>
                <p style="font-size: 12px; color: #9ca3af; margin-top: 10px;">
                    <strong><?php echo htmlspecialchars($appName); ?></strong> - Local Windows Installation | For Docker deployment, see: <code>docker-landing.php</code>
                </p>
            </div>
        </div>
    </div>
</body>
</html>
