<?php
/**
 * LinkNest Docker Container Landing Page
 * 
 * Provides quick access to all application services and tools
 */

// Detect current protocol and host
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'localhost:8090';
$baseUrl = $protocol . '://' . $host;

// Extract port from host if present
$port = '8090';
if (strpos($host, ':') !== false) {
    $parts = explode(':', $host);
    $port = $parts[1] ?? '8090';
}

// Determine HTTPS port (usually 8443)
$httpsPort = ($port === '8090') ? '8443' : (string)((int)$port + 343);
$httpsUrl = 'https://localhost:' . $httpsPort;

// Get container info if available
$containerName = 'linknest';
$phpVersion = PHP_VERSION;
$serverSoftware = $_SERVER['SERVER_SOFTWARE'] ?? 'Unknown';

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LinkNest Docker - Landing Page</title>
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
        
        .link-item .link-badge.external {
            background: #f59e0b;
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
                <span>🐳</span>
                <span>LinkNest Docker</span>
            </h1>
            <p>Container Landing Page - Quick Access to All Services</p>
            <div style="margin-top: 20px;">
                <span class="info-badge">PHP <?php echo htmlspecialchars($phpVersion); ?></span>
                <span class="info-badge"><?php echo htmlspecialchars($serverSoftware); ?></span>
                <span class="info-badge">Container: <?php echo htmlspecialchars($containerName); ?></span>
            </div>
        </div>

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
                                <span class="link-label">LinkNest Application</span>
                                <span class="link-url"><?php echo htmlspecialchars($baseUrl); ?></span>
                            </div>
                            <span class="link-badge">HTTP</span>
                        </a>
                    </li>
                    <li>
                        <a href="<?php echo $httpsUrl; ?>" class="link-item" target="_blank">
                            <span class="link-icon">🔒</span>
                            <div class="link-content">
                                <span class="link-label">LinkNest Application (Secure)</span>
                                <span class="link-url"><?php echo htmlspecialchars($httpsUrl); ?></span>
                            </div>
                            <span class="link-badge https">HTTPS</span>
                        </a>
                    </li>
                    <li>
                        <a href="http://localhost:8025" class="link-item" target="_blank">
                            <span class="link-icon">📬</span>
                            <div class="link-content">
                                <span class="link-label">Mailpit Email Testing (Web UI)</span>
                                <span class="link-url">http://localhost:8025</span>
                            </div>
                            <span class="link-badge external">Port 8025</span>
                        </a>
                    </li>
                </ul>
                <div class="warning-box" style="margin-top: 15px;">
                    <strong>⚠️ HTTPS Certificate Warning</strong>
                    The HTTPS certificate is self-signed. Your browser will show a security warning. Click "Advanced" → "Proceed to localhost (unsafe)" to continue.
                </div>
            </div>

            <!-- System Tools -->
            <div class="card">
                <div class="card-header">
                    <span class="icon">🛠️</span>
                    <h2>System Tools</h2>
                </div>
                <ul class="link-list">
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
                    <li>
                        <a href="<?php echo $httpsUrl; ?>/check_opcache.php" class="link-item" target="_blank">
                            <span class="link-icon">⚡</span>
                            <div class="link-content">
                                <span class="link-label">OPcache Status (Secure)</span>
                                <span class="link-url">/check_opcache.php</span>
                            </div>
                            <span class="link-badge https">HTTPS</span>
                        </a>
                    </li>
                    <li>
                        <a href="<?php echo $baseUrl; ?>/backup_restore_docker.php" class="link-item" target="_blank">
                            <span class="link-icon">💾</span>
                            <div class="link-content">
                                <span class="link-label">Backup & Restore Manager</span>
                                <span class="link-url">/backup_restore_docker.php</span>
                            </div>
                            <span class="link-badge">HTTP</span>
                        </a>
                    </li>
                    <li>
                        <a href="<?php echo $httpsUrl; ?>/backup_restore_docker.php" class="link-item" target="_blank">
                            <span class="link-icon">💾</span>
                            <div class="link-content">
                                <span class="link-label">Backup & Restore (Secure)</span>
                                <span class="link-url">/backup_restore_docker.php</span>
                            </div>
                            <span class="link-badge https">HTTPS</span>
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
                    <strong style="color: #374151; display: block; margin-bottom: 8px;">🔧 SMTP Configuration for LinkNest:</strong>
                    <div style="font-family: 'Courier New', monospace; line-height: 1.8; background: white; padding: 12px; border-radius: 6px; margin-top: 8px;">
                        <div style="color: #059669;"><strong>From Host (Windows):</strong></div>
                        Host: <strong>localhost</strong><br>
                        Port: <strong>1025</strong><br><br>
                        <div style="color: #059669;"><strong>From Container:</strong></div>
                        Host: <strong>mailpit</strong><br>
                        Port: <strong>1025</strong><br>
                        Auth: <strong>None required</strong><br>
                        TLS/SSL: <strong>Disabled</strong>
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
                    <li>
                        <a href="<?php echo $baseUrl; ?>/backup_restore_docker.php" class="link-item" target="_blank">
                            <span class="link-icon">🔄</span>
                            <div class="link-content">
                                <span class="link-label">Backup & Restore</span>
                                <span class="link-url">/backup_restore_docker.php</span>
                            </div>
                            <span class="link-badge">Full UI</span>
                        </a>
                    </li>
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
        </div>

        <div class="footer">
            <h3>🐳 Docker Container Information</h3>
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">Container Name</div>
                    <div class="info-value"><?php echo htmlspecialchars($containerName); ?></div>
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
                    <div class="info-label">HTTP Port</div>
                    <div class="info-value"><?php echo htmlspecialchars($port); ?></div>
                </div>
                <div class="info-item">
                    <div class="info-label">HTTPS Port</div>
                    <div class="info-value"><?php echo htmlspecialchars($httpsPort); ?></div>
                </div>
                <div class="info-item">
                    <div class="info-label">Mailpit Port</div>
                    <div class="info-value">8025</div>
                </div>
            </div>
            <div style="margin-top: 25px; padding-top: 20px; border-top: 2px solid #f3f4f6;">
                <p style="font-size: 14px; color: #9ca3af;">
                    <strong>Default Credentials:</strong> admin / admin (⚠️ Change immediately after first login!)
                </p>
                <p style="font-size: 12px; color: #9ca3af; margin-top: 10px;">
                    Daily database backups run automatically at 3:00 AM | Backups older than 30 days are auto-removed
                </p>
            </div>
        </div>
    </div>
</body>
</html>
