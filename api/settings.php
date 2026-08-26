<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/image_helpers.php';
require_once __DIR__ . '/device_presets_lib.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '';
$path = $path === '' ? '/' : ('/' . ltrim($path, '/'));

switch ($method) {
    case 'GET':
        if ($path === '' || $path === '/') {
            handleGetSettings();
        } else if ($path === '/database-path') {
            handleGetDatabasePath();
        } else if ($path === '/user-preferences') {
            handleGetUserPreferences();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'POST':
        if ($path === '/upload-logo') {
            handleUploadLogo();
        } else if ($path === '/upload-favicon') {
            handleUploadFavicon();
        } else if ($path === '/encrypt-password') {
            handleEncryptPassword();
        } else if ($path === '/decrypt-password') {
            handleDecryptPassword();
        } else if ($path === '/purge-ldap') {
            handlePurgeLdapSettings();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    case 'PUT':
        if ($path === '' || $path === '/') {
            handleUpdateSettings();
        } else if ($path === '/user-preferences') {
            handleUpdateUserPreferences();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
    
    case 'PATCH':
        if ($path === '/toggle-notifications') {
            handleToggleNotifications();
        } else {
            sendJSON(['error' => 'Invalid endpoint'], 404);
        }
        break;
        
    default:
        sendJSON(['error' => 'Method not allowed'], 405);
}

/**
 * Detect the base path dynamically from REQUEST_URI
 * Returns the base path (e.g., '/myapp' or '') or empty string if at root
 */
function getBasePath() {
    return getAppBasePath();
}

/**
 * Normalize a logo URL to work in the current environment
 * Always stores as /uploads/filename, but returns with correct prefix for current environment
 */
function normalizeLogoUrl($url) {
    if (empty($url)) {
        return $url;
    }

    $raw = trim((string) $url);
    if ($raw === '' || preg_match('#^https?://#i', $raw) || str_starts_with($raw, 'data:')) {
        return $raw;
    }

    // Remove any existing base path prefix to get the normalized path
    $normalized = preg_replace('#^/[^/]+/uploads/#', '/uploads/', $raw);

    if (is_string($normalized) && strpos($normalized, '/uploads/') === 0) {
        $filename = basename($normalized);
        if (!preg_match('/^[a-zA-Z0-9._-]+$/', $filename)) {
            return '';
        }
        $disk = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . $filename;
        if (!is_file($disk)) {
            return '';
        }
    }

    $basePath = getBasePath();
    if ($basePath && is_string($normalized) && strpos($normalized, '/uploads/') === 0) {
        $normalized = $basePath . $normalized;
    }

    return $normalized;
}

/**
 * Normalize / validate link-check exception patterns (URLs / hosts skipped by health checks).
 * @return string JSON array string (never empty object — uses "[]")
 */
function normalizeLinkCheckExceptionsSetting($value) {
    $maxItems = 2000;
    $maxLen = 2048;

    $decoded = null;
    if (is_array($value)) {
        $decoded = $value;
    } elseif (is_string($value)) {
        $trimmed = trim($value);
        if ($trimmed === '') {
            return '[]';
        }
        if ($trimmed[0] === '[') {
            $decoded = json_decode($trimmed, true);
            if (!is_array($decoded)) {
                sendJSON(['error' => 'link_check_exceptions must be a JSON array'], 400);
            }
        } else {
            // Allow newline / comma separated bulk paste via API too
            $decoded = preg_split('/[\n\r,;]+/', $trimmed) ?: [];
        }
    } else {
        return '[]';
    }

    if (count($decoded) > $maxItems) {
        sendJSON(['error' => "link_check_exceptions supports at most {$maxItems} entries"], 400);
    }

    $out = [];
    $seen = [];
    foreach ($decoded as $item) {
        $raw = '';
        if (is_string($item)) {
            $raw = $item;
        } elseif (is_array($item) && isset($item['pattern'])) {
            $raw = (string)$item['pattern'];
        } else {
            continue;
        }
        $pattern = normalizeLinkCheckExceptionPattern($raw, $maxLen);
        if ($pattern === null || isset($seen[$pattern])) {
            continue;
        }
        $seen[$pattern] = true;
        $out[] = $pattern;
    }

    return json_encode(array_values($out), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

/**
 * Normalize host patterns that skip in-app mobile preview (iframe block list).
 * @return string JSON array string
 */
function normalizeIframeBlockDomainsSetting($value) {
    $maxItems = 500;
    $maxLen = 253;

    $decoded = null;
    if (is_array($value)) {
        $decoded = $value;
    } elseif (is_string($value)) {
        $trimmed = trim($value);
        if ($trimmed === '') {
            return '[]';
        }
        if ($trimmed[0] === '[') {
            $decoded = json_decode($trimmed, true);
            if (!is_array($decoded)) {
                sendJSON(['error' => 'iframe_block_domains must be a JSON array'], 400);
            }
        } else {
            $decoded = preg_split('/[\n\r,;]+/', $trimmed) ?: [];
        }
    } else {
        return '[]';
    }

    if (count($decoded) > $maxItems) {
        sendJSON(['error' => "iframe_block_domains supports at most {$maxItems} entries"], 400);
    }

    $out = [];
    $seen = [];
    foreach ($decoded as $item) {
        $raw = '';
        if (is_string($item)) {
            $raw = $item;
        } elseif (is_array($item) && isset($item['pattern'])) {
            $raw = (string)$item['pattern'];
        } elseif (is_array($item) && isset($item['domain'])) {
            $raw = (string)$item['domain'];
        } else {
            continue;
        }
        $pattern = normalizeIframeBlockDomainPattern($raw, $maxLen);
        if ($pattern === null || isset($seen[$pattern])) {
            continue;
        }
        $seen[$pattern] = true;
        $out[] = $pattern;
    }

    return json_encode(array_values($out), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

/**
 * @return string|null
 */
function normalizeIframeBlockDomainPattern($raw, $maxLen = 253) {
    $value = trim((string)$raw);
    if ($value === '') {
        return null;
    }
    if (
        (str_starts_with($value, '"') && str_ends_with($value, '"')) ||
        (str_starts_with($value, "'") && str_ends_with($value, "'"))
    ) {
        $value = trim(substr($value, 1, -1));
    }
    if ($value === '') {
        return null;
    }
    $hashPos = strpos($value, '#');
    if ($hashPos !== false) {
        $value = trim(substr($value, 0, $hashPos));
    }
    if ($value === '') {
        return null;
    }

    // Extract hostname from pasted URLs
    $hadScheme = (bool)preg_match('#^[a-z][a-z0-9+.-]*:#i', $value);
    if ($hadScheme || strpos($value, '/') !== false || strpos($value, ':') !== false) {
        $withScheme = $hadScheme ? $value : ('https://' . $value);
        $parts = @parse_url($withScheme);
        if (is_array($parts) && !empty($parts['host'])) {
            $value = (string)$parts['host'];
        }
    }

    $value = strtolower(rtrim(ltrim($value, '.'), '.'));
    if ($value === '') {
        return null;
    }
    if (strlen($value) > $maxLen) {
        $value = substr($value, 0, $maxLen);
    }

    if (strpos($value, '*') !== false) {
        if (!preg_match('/^(\*\.)?[a-z0-9.*-]+$/i', $value)) {
            return null;
        }
        return $value;
    }

    if (!preg_match('/^[a-z0-9.-]+$/i', $value) || strpos($value, '..') !== false) {
        return null;
    }
    return $value;
}

/**
 * @return string|null
 */
function normalizeLinkCheckExceptionPattern($raw, $maxLen = 2048) {
    $value = trim((string)$raw);
    if ($value === '') {
        return null;
    }
    if (
        (str_starts_with($value, '"') && str_ends_with($value, '"')) ||
        (str_starts_with($value, "'") && str_ends_with($value, "'"))
    ) {
        $value = trim(substr($value, 1, -1));
    }
    if ($value === '') {
        return null;
    }
    $hashPos = strpos($value, '#');
    if ($hashPos !== false) {
        $value = trim(substr($value, 0, $hashPos));
    }
    if ($value === '') {
        return null;
    }
    if (strlen($value) > $maxLen) {
        $value = substr($value, 0, $maxLen);
    }

    // Host-only / wildcard host
    if (!preg_match('#^[a-z][a-z0-9+.-]*:#i', $value) && strpos($value, '/') === false && strpos($value, ' ') === false) {
        return rtrim(strtolower($value), '.');
    }

    $hadScheme = (bool)preg_match('#^[a-z][a-z0-9+.-]*:#i', $value);
    $withScheme = $hadScheme ? $value : ('https://' . $value);
    $parts = @parse_url($withScheme);
    if (!is_array($parts) || empty($parts['host'])) {
        return rtrim(strtolower($value), '/');
    }

    $host = strtolower((string)$parts['host']);
    $path = isset($parts['path']) ? (string)$parts['path'] : '';
    if ($path === '/') {
        $path = '';
    } elseif ($path !== '' && str_ends_with($path, '/')) {
        $path = rtrim($path, '/');
    }
    $query = isset($parts['query']) && $parts['query'] !== '' ? ('?' . $parts['query']) : '';

    if (!$hadScheme) {
        return $host . $path . $query;
    }
    $scheme = strtolower((string)($parts['scheme'] ?? 'https'));
    return $scheme . '://' . $host . $path . $query;
}

/**
 * Normalize / validate device preview presets JSON for settings storage.
 * Empty input stores "" so the app falls back to built-in defaults.
 * @return string JSON array string or empty string
 */
function normalizeDevicePresetsSetting($value) {
    $result = devicePresetsEncodeSetting($value);
    if (empty($result['ok'])) {
        sendJSON(['error' => $result['error'] ?? 'Invalid device_presets'], 400);
    }
    return (string)($result['json'] ?? '');
}

/**
 * Normalize quick-select preset id list. Empty stores "".
 * @return string JSON array string or empty string
 */
function normalizeDeviceQuickPresetsSetting($value) {
    $result = devicePresetsEncodeQuickSetting($value);
    if (empty($result['ok'])) {
        sendJSON(['error' => $result['error'] ?? 'Invalid device_quick_presets'], 400);
    }
    return (string)($result['json'] ?? '');
}

function handleGetSettings() {
    // Settings are public (for display), but only admins can update
    if (session_status() === PHP_SESSION_NONE) {
        @session_start();
    }
    $hasSessionUser = !empty($_SESSION['user_id']);

    // Guest/home load: serve cached public settings without decrypt work
    if (!$hasSessionUser) {
        $cached = responseCacheGet('settings_public');
        if (is_array($cached)) {
            foreach (['favicon', 'logo_image', 'header_logo_image'] as $assetKey) {
                if (!empty($cached[$assetKey])) {
                    $cached[$assetKey] = normalizeLogoUrl($cached[$assetKey]);
                }
            }
            responseCacheHitHeader(true);
            sendJSON(['settings' => $cached]);
            return;
        }
    }

    $user = getAuthenticatedUser();
    $isAdmin = $user && !empty($user['is_admin']);

    // Logged-in non-admins get the same public payload as guests
    if ($hasSessionUser && !$isAdmin) {
        $cached = responseCacheGet('settings_public');
        if (is_array($cached)) {
            foreach (['favicon', 'logo_image', 'header_logo_image'] as $assetKey) {
                if (!empty($cached[$assetKey])) {
                    $cached[$assetKey] = normalizeLogoUrl($cached[$assetKey]);
                }
            }
            responseCacheHitHeader(true);
            sendJSON(['settings' => $cached]);
            return;
        }
    }

    $db = getDB();
    $stmt = $db->prepare('SELECT key, value FROM settings');
    $stmt->execute();
    $rows = $stmt->fetchAll();
    
    $settings = [];
    foreach ($rows as $row) {
        $settings[$row['key']] = $row['value'];
    }

    // Only admins need plaintext LDAP secrets (AdminPanel). Public/home callers
    // must not pay for openssl decrypt on every GET /settings — and must not receive secrets.
    if (!$isAdmin) {
        if (isset($settings['ldap_bind_password'])) {
            $settings['ldap_bind_password'] = '';
        }
        if (isset($settings['updater_github_token'])) {
            $settings['updater_github_token'] = '';
        }
        if (isset($settings['ldap_servers']) && is_string($settings['ldap_servers']) && trim($settings['ldap_servers']) !== '') {
            $servers = json_decode($settings['ldap_servers'], true);
            if (is_array($servers)) {
                foreach ($servers as &$server) {
                    if (is_array($server) && array_key_exists('bind_password', $server)) {
                        $server['bind_password'] = '';
                    }
                }
                unset($server);
                $settings['ldap_servers'] = json_encode($servers);
            }
        }
    } else {
    // Handle LDAP bind password: decrypt if encrypted, or auto-encrypt if plain text
    if (isset($settings['ldap_bind_password']) && !empty($settings['ldap_bind_password'])) {
        $password = $settings['ldap_bind_password'];
        
        if (isLikelyEncryptedPassword($password)) {
            try {
                $settings['ldap_bind_password'] = decryptPassword($password);
            } catch (Exception $e) {
                error_log('Failed to decrypt LDAP bind password in settings: ' . $e->getMessage());
                error_log('DB_PATH: ' . (defined('DB_PATH') ? DB_PATH : 'not defined'));
                // Never expose ciphertext in the UI
                $settings['ldap_bind_password'] = '';
            }
        } else {
            // Password is plain text - encrypt it automatically and update the database
            try {
                $encryptedPassword = encryptPassword($password);
                $updateStmt = $db->prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?');
                $updateStmt->execute([$encryptedPassword, time(), 'ldap_bind_password']);
                $settings['ldap_bind_password'] = $password;
            } catch (Exception $e) {
                error_log('Failed to auto-encrypt LDAP bind password: ' . $e->getMessage());
            }
        }
    }

    // Decrypt bind passwords inside ldap_servers JSON for the admin UI
    if (isset($settings['ldap_servers']) && is_string($settings['ldap_servers']) && trim($settings['ldap_servers']) !== '') {
        $servers = json_decode($settings['ldap_servers'], true);
        if (is_array($servers)) {
            $persistEncrypted = null;
            foreach ($servers as $idx => &$server) {
                if (!is_array($server) || empty($server['bind_password']) || !is_string($server['bind_password'])) {
                    continue;
                }
                $pw = $server['bind_password'];
                if (isLikelyEncryptedPassword($pw)) {
                    try {
                        $server['bind_password'] = decryptPassword($pw);
                    } catch (Exception $e) {
                        error_log('Failed to decrypt ldap_servers bind password: ' . $e->getMessage());
                        $server['bind_password'] = '';
                    }
                } else {
                    // Auto-encrypt plaintext passwords stored in ldap_servers (persist encrypted, return plaintext)
                    try {
                        if ($persistEncrypted === null) {
                            $persistEncrypted = json_decode($settings['ldap_servers'], true);
                        }
                        if (is_array($persistEncrypted) && isset($persistEncrypted[$idx])) {
                            $persistEncrypted[$idx]['bind_password'] = encryptPassword($pw);
                        }
                    } catch (Exception $e) {
                        error_log('Failed to auto-encrypt ldap_servers bind password: ' . $e->getMessage());
                    }
                }
            }
            unset($server);
            if (is_array($persistEncrypted)) {
                $updateStmt = $db->prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?');
                $updateStmt->execute([json_encode($persistEncrypted), time(), 'ldap_servers']);
            }
            $settings['ldap_servers'] = json_encode($servers);
        }
    }

    // Decrypt updater GitHub token for admin UI (never returned to non-admins)
    if (isset($settings['updater_github_token']) && $settings['updater_github_token'] !== '') {
        $token = $settings['updater_github_token'];
        if (isLikelyEncryptedPassword($token)) {
            try {
                $settings['updater_github_token'] = decryptPassword($token);
            } catch (Exception $e) {
                error_log('Failed to decrypt updater_github_token: ' . $e->getMessage());
                $settings['updater_github_token'] = '';
            }
        }
    }
    } // end admin-only LDAP decrypt
   
    // Normalize logo_image URL for current environment
    if (isset($settings['logo_image']) && !empty($settings['logo_image'])) {
        $settings['logo_image'] = normalizeLogoUrl($settings['logo_image']);
    }

    // Normalize header_logo_image URL for current environment
    if (isset($settings['header_logo_image']) && !empty($settings['header_logo_image'])) {
        $settings['header_logo_image'] = normalizeLogoUrl($settings['header_logo_image']);
    }
    
    // Normalize favicon URL for current environment
    if (isset($settings['favicon']) && !empty($settings['favicon'])) {
        $settings['favicon'] = normalizeLogoUrl($settings['favicon']);
    }

    if (!$isAdmin) {
        responseCacheSet('settings_public', $settings);
        responseCacheHitHeader(false);
    }
    
    sendJSON(['settings' => $settings]);
}

function handleUploadLogo() {
    requireAdmin(); // Only admins can upload

    // Optional target setting key (brand logo vs header/company logo)
    $settingKey = $_POST['setting_key'] ?? 'logo_image';
    if (!in_array($settingKey, ['logo_image', 'header_logo_image'], true)) {
        $settingKey = 'logo_image';
    }

    // Background removal uses PHP GD (ext-gd) via processUploadedBrandImage / image_helpers.php.
    // No Composer package required. If this fails, enable extension=gd in php.ini.
    $removeBackground = !empty($_POST['remove_background']) && (
        $_POST['remove_background'] === '1' ||
        $_POST['remove_background'] === 'true' ||
        $_POST['remove_background'] === true
    );
    $bgColor = isset($_POST['bg_color']) ? trim((string)$_POST['bg_color']) : '';
    if ($bgColor === '') {
        $bgColor = null;
    }

    // Reprocess an existing uploaded logo (no new file) — e.g. strip background
    $sourceUrl = isset($_POST['source_url']) ? trim((string)$_POST['source_url']) : '';
    if ($sourceUrl !== '' && (!isset($_FILES['logo']) || $_FILES['logo']['error'] === UPLOAD_ERR_NO_FILE)) {
        $filename = basename(parse_url($sourceUrl, PHP_URL_PATH) ?: $sourceUrl);
        if (!preg_match('/^[a-zA-Z0-9._-]+$/', $filename) || strpos($filename, 'logo_') !== 0) {
            sendJSON(['error' => 'Invalid source logo'], 400);
        }
        $filepath = __DIR__ . '/../uploads/' . $filename;
        if (!is_file($filepath)) {
            sendJSON(['error' => 'Source logo not found'], 404);
        }
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mimeType = finfo_file($finfo, $filepath);
        finfo_close($finfo);
        $result = processUploadedBrandImage(
            $filepath,
            $filename,
            $mimeType ?: 'image/png',
            'logo',
            $removeBackground,
            $bgColor
        );
        $url = '/uploads/' . $result['filename'];
        $db = getDB();
        $stmt = $db->prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
        $stmt->execute([$settingKey, $url, time()]);
        $normalizedUrl = normalizeLogoUrl($url);
        sendJSON([
            'success' => true,
            'url' => $normalizedUrl,
            'converted' => !empty($result['converted']),
            'width' => $result['width'] ?? null,
            'height' => $result['height'] ?? null,
            'message' => $removeBackground
                ? 'Logo background removed and converted to PNG (max 512×512)'
                : 'Logo reprocessed to PNG (max 512×512)'
        ]);
    }
    
    // Check if file was uploaded
    if (!isset($_FILES['logo']) || $_FILES['logo']['error'] !== UPLOAD_ERR_OK) {
        sendJSON(['error' => 'No file uploaded or upload error'], 400);
    }
    
    $file = $_FILES['logo'];
    
    // Validate file type
    $allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/svg+xml', 'image/webp', 'image/bmp', 'image/x-ms-bmp'];
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    
    if (!in_array($mimeType, $allowedTypes)) {
        sendJSON(['error' => 'Invalid file type. Allowed: JPEG, PNG, GIF, SVG, WebP'], 400);
    }
    
    // Allow larger source files — we auto-convert/resize server-side
    $maxSize = 10 * 1024 * 1024; // 10MB
    if ($file['size'] > $maxSize) {
        sendJSON(['error' => 'File size too large. Maximum size: 10MB'], 400);
    }
    
    $result = processUploadedBrandImage(
        $file['tmp_name'],
        $file['name'],
        $mimeType,
        'logo',
        $removeBackground,
        $bgColor
    );
    $url = '/uploads/' . $result['filename'];
    
    // Update settings with the new logo URL (stored without prefix)
    $db = getDB();
    $stmt = $db->prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
    $stmt->execute([$settingKey, $url, time()]);
    
    // Return normalized URL for current environment
    $normalizedUrl = normalizeLogoUrl($url);

    $message = 'Logo uploaded successfully';
    if (!empty($result['converted'])) {
        $message = $removeBackground
            ? 'Logo uploaded, background removed, and converted to PNG (max 512×512)'
            : 'Logo uploaded and auto-converted to PNG (max 512×512)';
    }
    
    sendJSON([
        'success' => true,
        'url' => $normalizedUrl,
        'converted' => $result['converted'],
        'width' => $result['width'] ?? null,
        'height' => $result['height'] ?? null,
        'message' => $message
    ]);
}

function handleUploadFavicon() {
    requireAdmin(); // Only admins can upload

    $removeBackground = !empty($_POST['remove_background']) && (
        $_POST['remove_background'] === '1' ||
        $_POST['remove_background'] === 'true' ||
        $_POST['remove_background'] === true
    );
    $bgColor = isset($_POST['bg_color']) ? trim((string)$_POST['bg_color']) : '';
    if ($bgColor === '') {
        $bgColor = null;
    }

    // Reprocess an existing uploaded favicon (no new file) — e.g. strip background
    $sourceUrl = isset($_POST['source_url']) ? trim((string)$_POST['source_url']) : '';
    if ($sourceUrl !== '' && (!isset($_FILES['favicon']) || $_FILES['favicon']['error'] === UPLOAD_ERR_NO_FILE)) {
        $filename = basename(parse_url($sourceUrl, PHP_URL_PATH) ?: $sourceUrl);
        if (!preg_match('/^[a-zA-Z0-9._-]+$/', $filename) || strpos($filename, 'favicon_') !== 0) {
            sendJSON(['error' => 'Invalid source favicon'], 400);
        }
        $filepath = __DIR__ . '/../uploads/' . $filename;
        if (!is_file($filepath)) {
            sendJSON(['error' => 'Source favicon not found'], 404);
        }
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mimeType = finfo_file($finfo, $filepath);
        finfo_close($finfo);
        $result = processUploadedBrandImage(
            $filepath,
            $filename,
            $mimeType ?: 'image/png',
            'favicon',
            $removeBackground,
            $bgColor
        );
        $url = '/uploads/' . $result['filename'];
        $db = getDB();
        $stmt = $db->prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
        $stmt->execute(['favicon', $url, time()]);
        $normalizedUrl = normalizeLogoUrl($url);
        sendJSON([
            'success' => true,
            'url' => $normalizedUrl,
            'converted' => !empty($result['converted']),
            'width' => $result['width'] ?? null,
            'height' => $result['height'] ?? null,
            'message' => $removeBackground
                ? 'Favicon background removed and converted to 32×32 PNG'
                : 'Favicon reprocessed to 32×32 PNG'
        ]);
    }
    
    // Check if file was uploaded
    if (!isset($_FILES['favicon']) || $_FILES['favicon']['error'] !== UPLOAD_ERR_OK) {
        sendJSON(['error' => 'No file uploaded or upload error'], 400);
    }
    
    $file = $_FILES['favicon'];
    
    // Validate file type (favicon typically supports ICO, PNG, SVG)
    $allowedTypes = ['image/x-icon', 'image/vnd.microsoft.icon', 'image/png', 'image/svg+xml', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/bmp', 'image/x-ms-bmp'];
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    
    // Also check file extension for ICO files (which might have different MIME types)
    $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $allowedExtensions = ['ico', 'png', 'svg', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
    
    if (!in_array($mimeType, $allowedTypes) && !in_array($extension, $allowedExtensions)) {
        sendJSON(['error' => 'Invalid file type. Allowed: ICO, PNG, SVG, JPEG, GIF, WebP'], 400);
    }
    
    // Allow larger source files — we auto-convert to 32×32 PNG
    $maxSize = 10 * 1024 * 1024; // 10MB
    if ($file['size'] > $maxSize) {
        sendJSON(['error' => 'File size too large. Maximum size: 10MB'], 400);
    }
    
    $result = processUploadedBrandImage(
        $file['tmp_name'],
        $file['name'],
        $mimeType,
        'favicon',
        $removeBackground,
        $bgColor
    );
    $url = '/uploads/' . $result['filename'];
    
    // Update settings with the new favicon URL (stored without prefix)
    $db = getDB();
    $stmt = $db->prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
    $stmt->execute(['favicon', $url, time()]);
    
    // Return normalized URL for current environment
    $normalizedUrl = normalizeLogoUrl($url);

    $message = 'Favicon uploaded successfully';
    if (!empty($result['converted'])) {
        $message = $removeBackground
            ? 'Favicon uploaded, background removed, and converted to 32×32 PNG'
            : 'Favicon uploaded and auto-converted to 32×32 PNG';
    }
    
    sendJSON([
        'success' => true,
        'url' => $normalizedUrl,
        'converted' => $result['converted'],
        'width' => $result['width'] ?? null,
        'height' => $result['height'] ?? null,
        'message' => $message
    ]);
}

function handleUpdateSettings() {
    requireAdmin(); // Only admins can update settings
    
    $data = getJSONInput();
    
    if (!isset($data['settings']) || !is_array($data['settings'])) {
        sendJSON(['error' => 'Settings data is required'], 400);
    }

    // Never allow Local + LDAP + SAML to all be disabled (would lock admins out)
    $authKeys = ['local_auth_enabled', 'ldap_enabled', 'saml_enabled'];
    $touchesAuth = false;
    foreach ($authKeys as $authKey) {
        if (array_key_exists($authKey, $data['settings'])) {
            $touchesAuth = true;
            break;
        }
    }
    if ($touchesAuth) {
        $local = array_key_exists('local_auth_enabled', $data['settings'])
            ? (string)$data['settings']['local_auth_enabled']
            : (string)getSetting('local_auth_enabled', '1');
        $ldap = array_key_exists('ldap_enabled', $data['settings'])
            ? (string)$data['settings']['ldap_enabled']
            : (string)getSetting('ldap_enabled', '0');
        $saml = array_key_exists('saml_enabled', $data['settings'])
            ? (string)$data['settings']['saml_enabled']
            : (string)getSetting('saml_enabled', '0');
        $localOn = $local !== '0';
        $ldapOn = $ldap === '1';
        $samlOn = $saml === '1';
        if (!$localOn && !$ldapOn && !$samlOn) {
            sendJSON([
                'error' => 'Keep at least one sign-in method enabled (Local, LDAP, or SAML) so you can still access the system.'
            ], 400);
        }
    }
    
    $db = getDB();
    $db->beginTransaction();
    $ldapPurged = false;
    
    try {
        foreach ($data['settings'] as $key => $value) {
            // Validate allowed keys
            $allowedKeys = [
                'app_name', 'page_title', 'page_title_pattern', 'spaces_title', 'logo_type', 'logo_icon', 'logo_image',
                'logo_size', 'header_logo_image', 'header_logo_size', 'app_subheading',
                'app_name_font_size', 'app_name_font_family', 'app_name_font_weight', 'app_name_font_style',
                'app_name_font_color', 'app_name_font_color_dark', 'app_name_letter_spacing', 'app_name_line_height',
                'app_subheading_font_size', 'app_subheading_font_family', 'app_subheading_font_weight', 'app_subheading_font_style',
                'app_subheading_font_color', 'app_subheading_font_color_dark', 'app_subheading_letter_spacing', 'app_subheading_line_height',
                'nav_bg_light', 'nav_bg_to_light', 'nav_bg_dark', 'nav_bg_to_dark', 'nav_gradient_angle',
                'nav_border_light', 'nav_border_dark', 'nav_icon_color_light', 'nav_icon_color_dark',
                'hero_icon', 'spaces_subtitle',
                'hero_title_font_size', 'hero_title_font_family', 'hero_title_font_weight', 'hero_title_font_style',
                'hero_title_color', 'hero_title_color_dark', 'hero_title_letter_spacing', 'hero_title_line_height',
                'hero_subtitle_font_size', 'hero_subtitle_font_family', 'hero_subtitle_font_weight', 'hero_subtitle_font_style',
                'hero_subtitle_color', 'hero_subtitle_color_dark', 'hero_subtitle_letter_spacing', 'hero_subtitle_line_height',
                'hero_bg_from', 'hero_bg_to', 'hero_bg_from_dark', 'hero_bg_to_dark', 'hero_bg_angle',
                'hero_overlay_color', 'hero_overlay_to', 'hero_overlay_opacity', 'hero_icon_bg_from', 'hero_icon_bg_to',
                'auth_wash_from', 'auth_wash_to',
                'favicon',
                'qr_branding_mode',
                'qr_branding_emoji',
                'footer_text',
                'footer_font_size',
                'footer_font_family',
                'footer_font_weight',
                'footer_font_style',
                'footer_font_color',
                'footer_font_color_dark',
                'guest_access_enabled',
                'local_registration_enabled',
                'signin_button_enabled',
                'public_tile_animation',
                'show_database_path_in_footer',
                'disabled_tabs',
                'device_presets', 'device_quick_presets',
                'link_check_exceptions',
                'iframe_block_domains',
                'maintenance_enabled', 'maintenance_message', 'semi_pwa_enabled', 'semi_pwa_include_paths', 'semi_pwa_exclude_paths',
                'ldap_enabled', 'ldap_server', 'ldap_port', 'ldap_protocol', 'ldap_base_dn',
                'ldap_login_domain', 'ldap_servers',
                'ldap_bind_dn', 'ldap_bind_password',
                'ldap_user_search_base', 'ldap_user_filter', 'ldap_user_attributes', 
                'ldap_group_search_base', 'ldap_group_filter', 'ldap_group_attributes', 
                'ldap_auto_create_users', 'ldap_auto_update_users', 'ldap_sync_interval', 
                'ldap_require_group_membership', 'ldap_required_groups', 'ldap_denied_groups', 'ldap_timeout', 'ldap_tls',
                'ldap_search_scope', 'ldap_user_dn_template', 'ldap_nested_groups', 'ldap_case_sensitive',
                'ldap_ssl_verify', 'ldap_connection_retry', 'ldap_retry_delay', 'ldap_email_attribute',
                'ldap_display_name_attribute', 'ldap_referrals', 'ldap_dropdown_show_host',
                'ldap_mail_domains',
                'access_control_enabled', 'access_control_mode', 'access_control_allow_anonymous', 'access_control_audit_logging',
                'browser_specific_links_enabled', 'browser_extension_id',
                'saml_enabled', 'local_auth_enabled', 'sp_entity_id', 'sp_assertion_consumer_service',
                'sp_single_logout_service', 'sp_site_url', 'idp_entity_id', 'idp_sso_url', 'idp_slo_url',
                'idp_x509cert', 'nameid_format', 'strict', 'debug', 'map_name_to', 'map_email_to',
                'map_display_name_to', 'auto_provision',
                'updater_repo', 'updater_github_token', 'updater_check_interval_minutes', 'updater_track_branch'
            ];

            // After a full LDAP purge in this request, ignore residual flat ldap_* fields from the client
            if ($ldapPurged && is_string($key) && strpos($key, 'ldap_') === 0) {
                continue;
            }
            // Handle ldap_servers - ensure it's valid JSON; encrypt per-server bind passwords;
            // mirror first server into legacy flat ldap_* keys so older code paths stay consistent.
            // Empty list clears servers AND legacy flat connection keys so deleted servers stay gone.
            if ($key === 'ldap_servers') {
                $decoded = null;
                if (is_array($value)) {
                    $decoded = $value;
                } elseif (is_string($value)) {
                    if (trim($value) === '') {
                        $decoded = [];
                        $value = '[]';
                    } else {
                        $decoded = json_decode($value, true);
                        if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
                            continue; // Skip invalid JSON
                        }
                    }
                } else {
                    continue; // Skip invalid types
                }

                $legacyMirrorKeys = [
                    'ldap_server', 'ldap_port', 'ldap_protocol', 'ldap_tls', 'ldap_timeout',
                    'ldap_bind_dn', 'ldap_bind_password',
                    'ldap_user_search_base', 'ldap_user_filter', 'ldap_user_attributes',
                    'ldap_group_search_base', 'ldap_group_filter', 'ldap_group_attributes',
                    'ldap_search_scope', 'ldap_user_dn_template', 'ldap_nested_groups', 'ldap_case_sensitive',
                    'ldap_ssl_verify', 'ldap_connection_retry', 'ldap_retry_delay',
                    'ldap_email_attribute', 'ldap_display_name_attribute', 'ldap_referrals',
                    'ldap_login_domain', 'ldap_require_group_membership', 'ldap_required_groups', 'ldap_denied_groups',
                ];

                // Empty server list: delete ALL ldap_* settings so export/UI cannot resurrect leftovers
                if (count($decoded) === 0) {
                    $value = '[]';
                    try {
                        $db->exec("DELETE FROM settings WHERE key LIKE 'ldap_%'");
                    } catch (Exception $e) {
                        error_log('Failed to purge ldap_* settings: ' . $e->getMessage());
                        $clearStmt = $db->prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
                        foreach ($legacyMirrorKeys as $clearKey) {
                            $clearStmt->execute([$clearKey, '', time()]);
                        }
                    }
                    // Keep ldap_servers as [] and ldap_enabled off so the admin UI stays consistent
                    $db->prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
                        ->execute(['ldap_servers', '[]', time()]);
                    $db->prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
                        ->execute(['ldap_enabled', '0', time()]);
                    $ldapPurged = true;
                    // Already persisted special keys — skip the generic INSERT below for this key
                    continue;
                } else {
                    // Load previously stored servers so blank passwords keep existing secrets
                    $existingServers = [];
                    try {
                        $existingStmt = $db->prepare("SELECT value FROM settings WHERE key = 'ldap_servers' LIMIT 1");
                        $existingStmt->execute();
                        $existingRow = $existingStmt->fetch();
                        if ($existingRow && !empty($existingRow['value'])) {
                            $parsedExisting = json_decode($existingRow['value'], true);
                            if (is_array($parsedExisting)) {
                                $existingServers = $parsedExisting;
                            }
                        }
                    } catch (Exception $e) {
                        $existingServers = [];
                    }

                    foreach ($decoded as $idx => &$server) {
                        if (!is_array($server)) {
                            continue;
                        }
                        $pw = isset($server['bind_password']) && is_string($server['bind_password'])
                            ? trim($server['bind_password'])
                            : '';
                        if (isset($server['bind_dn']) && is_string($server['bind_dn'])) {
                            $server['bind_dn'] = trim($server['bind_dn']);
                        }
                        // Leave blank = keep previously saved password for this server index
                        if ($pw === '') {
                            $existingPw = '';
                            if (isset($existingServers[$idx]['bind_password']) && is_string($existingServers[$idx]['bind_password'])) {
                                $existingPw = $existingServers[$idx]['bind_password'];
                            }
                            $server['bind_password'] = $existingPw;
                            continue;
                        }
                        if (isMaskedPasswordPlaceholder($pw)) {
                            sendJSON(['error' => 'LDAP bind password looks masked (asterisks). Re-enter the real password and save again.'], 400);
                        }
                        // Encrypt plaintext only; leave already-encrypted values alone
                        if (!isLikelyEncryptedPassword($pw)) {
                            try {
                                $server['bind_password'] = encryptPassword($pw);
                            } catch (Exception $e) {
                                error_log('Failed to encrypt LDAP server bind password: ' . $e->getMessage());
                            }
                        } else {
                            $server['bind_password'] = $pw;
                        }
                    }
                    unset($server);
                    $value = json_encode($decoded);

                    // Mirror first server into legacy flat keys (used by older admin endpoints)
                    if (!empty($decoded[0]) && is_array($decoded[0])) {
                        $first = $decoded[0];
                        $mirrorKeys = [
                            'ldap_server' => $first['server'] ?? '',
                            'ldap_port' => (string)($first['port'] ?? '389'),
                            'ldap_protocol' => $first['protocol'] ?? 'ldap',
                            'ldap_tls' => (string)($first['tls'] ?? '0'),
                            'ldap_timeout' => (string)($first['timeout'] ?? '30'),
                            'ldap_bind_dn' => $first['bind_dn'] ?? '',
                            'ldap_bind_password' => $first['bind_password'] ?? '',
                            'ldap_user_search_base' => $first['user_search_base'] ?? '',
                            'ldap_user_filter' => $first['user_filter'] ?? '(sAMAccountName={username})',
                            'ldap_user_attributes' => $first['user_attributes'] ?? 'sAMAccountName,mail,displayName',
                            'ldap_group_search_base' => $first['group_search_base'] ?? '',
                            'ldap_group_filter' => $first['group_filter'] ?? '(objectClass=group)',
                            'ldap_group_attributes' => $first['group_attributes'] ?? 'cn,distinguishedName,member',
                            'ldap_search_scope' => $first['search_scope'] ?? 'sub',
                            'ldap_user_dn_template' => $first['user_dn_template'] ?? '',
                            'ldap_nested_groups' => (string)($first['nested_groups'] ?? '0'),
                            'ldap_case_sensitive' => (string)($first['case_sensitive'] ?? '0'),
                            'ldap_ssl_verify' => (string)($first['ssl_verify'] ?? '1'),
                            'ldap_connection_retry' => (string)($first['connection_retry'] ?? '3'),
                            'ldap_retry_delay' => (string)($first['retry_delay'] ?? '1'),
                            'ldap_email_attribute' => $first['email_attribute'] ?? '',
                            'ldap_display_name_attribute' => $first['display_name_attribute'] ?? '',
                            'ldap_referrals' => (string)($first['referrals'] ?? '0'),
                            'ldap_login_domain' => $first['login_domain'] ?? '',
                            'ldap_require_group_membership' => (string)($first['require_group_membership'] ?? '0'),
                            'ldap_required_groups' => $first['required_groups'] ?? '',
                            'ldap_denied_groups' => $first['denied_groups'] ?? '',
                        ];
                        foreach ($mirrorKeys as $mirrorKey => $mirrorValue) {
                            if ($mirrorKey === 'ldap_bind_password' && is_string($mirrorValue) && $mirrorValue !== '') {
                                if (!isLikelyEncryptedPassword($mirrorValue)) {
                                    try {
                                        $mirrorValue = encryptPassword($mirrorValue);
                                    } catch (Exception $e) {
                                        error_log('Failed to encrypt mirrored LDAP bind password: ' . $e->getMessage());
                                    }
                                }
                            }
                            $mirrorStmt = $db->prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
                            $mirrorStmt->execute([$mirrorKey, $mirrorValue, time()]);
                        }
                    }
                }
            }
            if (!in_array($key, $allowedKeys)) {
                continue; // Skip invalid keys
            }
            
            // Normalize logo_image URL before storing (remove any base path prefix)
            if ($key === 'logo_image' && !empty($value)) {
                $value = preg_replace('#^/[^/]+/uploads/#', '/uploads/', $value);
            }

            // Normalize header_logo_image URL before storing (remove any base path prefix)
            if ($key === 'header_logo_image' && !empty($value)) {
                $value = preg_replace('#^/[^/]+/uploads/#', '/uploads/', $value);
            }
            
            // Normalize favicon URL before storing (remove any base path prefix)
            if ($key === 'favicon' && !empty($value)) {
                $value = preg_replace('#^/[^/]+/uploads/#', '/uploads/', $value);
            }

            // Public first-visit tile animation (guests persist their own choice in the browser)
            if ($key === 'public_tile_animation') {
                $trimmedAnim = is_string($value) ? strtolower(trim($value)) : '';
                if ($trimmedAnim === '' || !preg_match('/^[a-z0-9][a-z0-9-]{0,62}$/', $trimmedAnim)) {
                    $value = 'fade-in';
                } else {
                    $value = $trimmedAnim;
                }
            }

            // QR branding: mode whitelist + bounded emoji
            if ($key === 'qr_branding_mode') {
                $value = ($value === 'emoji') ? 'emoji' : 'favicon';
            }
            if ($key === 'qr_branding_emoji') {
                $trimmedEmoji = is_string($value) ? trim($value) : '';
                if (function_exists('mb_substr')) {
                    $trimmedEmoji = mb_substr($trimmedEmoji, 0, 16);
                } else {
                    $trimmedEmoji = substr($trimmedEmoji, 0, 16);
                }
                $value = $trimmedEmoji !== '' ? $trimmedEmoji : '❤️';
            }
            
            // Handle LDAP bind password - encrypt if provided; blank = keep existing (UI: "leave blank to keep")
            if ($key === 'ldap_bind_password') {
                $trimmedValue = is_string($value) ? trim($value) : '';
                if ($value === null || $trimmedValue === '') {
                    // Do not overwrite a password mirrored from ldap_servers (or a previously saved one)
                    continue;
                } elseif (isMaskedPasswordPlaceholder($trimmedValue)) {
                    sendJSON(['error' => 'LDAP bind password looks masked (asterisks). Re-enter the real password and save again.'], 400);
                } elseif (!isLikelyEncryptedPassword($trimmedValue)) {
                    try {
                        $value = encryptPassword($trimmedValue);
                    } catch (Exception $e) {
                        error_log('Failed to encrypt LDAP bind password: ' . $e->getMessage());
                    }
                } else {
                    $value = $trimmedValue;
                }
            }

            // GitHub token for in-app updater (private repos / rate limits)
            if ($key === 'updater_github_token') {
                $trimmedValue = is_string($value) ? trim($value) : '';
                if ($value === null || $trimmedValue === '') {
                    $value = '';
                } elseif (isMaskedPasswordPlaceholder($trimmedValue)) {
                    sendJSON(['error' => 'GitHub token looks masked (asterisks). Re-enter the real token and save again.'], 400);
                } elseif (!isLikelyEncryptedPassword($trimmedValue)) {
                    try {
                        $value = encryptPassword($trimmedValue);
                    } catch (Exception $e) {
                        error_log('Failed to encrypt updater GitHub token: ' . $e->getMessage());
                    }
                } else {
                    $value = $trimmedValue;
                }
            }

            if ($key === 'updater_repo') {
                $repo = is_string($value) ? trim($value) : '';
                // Empty = auto-detect from git remote
                if ($repo !== '' && !preg_match('#^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$#', $repo)) {
                    sendJSON(['error' => 'updater_repo must be owner/repo (e.g. zafrullakhan001/linknest) or empty to auto-detect'], 400);
                }
                $value = $repo;
            }

            if ($key === 'updater_check_interval_minutes') {
                $n = (int)$value;
                if ($n < 5) {
                    $n = 5;
                }
                if ($n > 10080) {
                    $n = 10080;
                }
                $value = (string)$n;
            }

            if ($key === 'updater_track_branch') {
                $branch = is_string($value) ? trim($value) : '';
                if ($branch === '' || !preg_match('/^[A-Za-z0-9._\/-]+$/', $branch)) {
                    sendJSON(['error' => 'updater_track_branch must be a branch name (e.g. main)'], 400);
                }
                $value = $branch;
            }

            // Normalize disabled_tabs - store as a JSON array string of allowed tab ids
            if ($key === 'disabled_tabs') {
                $allowedTabIds = [
                    'public', 'favorites', 'private', 'scheduled', 'expired', 'archive', 'recycle-bin',
                    'monitoring', 'admin', 'style'
                ];
                $normalized = [];

                if (is_string($value)) {
                    $trimmed = trim($value);
                    if ($trimmed === '') {
                        $normalized = [];
                    } else {
                        // Try JSON array first
                        $decoded = json_decode($trimmed, true);
                        if (is_array($decoded)) {
                            foreach ($decoded as $item) {
                                $id = strtolower(trim((string)$item));
                                if (in_array($id, $allowedTabIds, true)) {
                                    $normalized[$id] = true;
                                }
                            }
                        } else {
                            // Fallback: comma-separated
                            $parts = preg_split('/\s*,\s*/', $trimmed);
                            foreach ($parts as $p) {
                                $id = strtolower(trim((string)$p));
                                if ($id !== '' && in_array($id, $allowedTabIds, true)) {
                                    $normalized[$id] = true;
                                }
                            }
                        }
                    }
                } else if (is_array($value)) {
                    foreach ($value as $item) {
                        $id = strtolower(trim((string)$item));
                        if (in_array($id, $allowedTabIds, true)) {
                            $normalized[$id] = true;
                        }
                    }
                }

                $value = json_encode(array_values(array_keys($normalized)));
            }

            if ($key === 'device_presets') {
                $value = normalizeDevicePresetsSetting($value);
            }

            if ($key === 'device_quick_presets') {
                $value = normalizeDeviceQuickPresetsSetting($value);
            }

            if ($key === 'link_check_exceptions') {
                $value = normalizeLinkCheckExceptionsSetting($value);
            }

            if ($key === 'iframe_block_domains') {
                $value = normalizeIframeBlockDomainsSetting($value);
            }
            
            // Store setting in database
            $stmt = $db->prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
            $stmt->execute([$key, $value, time()]);
            
            // Log SAML setting changes for debugging
            if ($key === 'saml_enabled') {
                error_log("SAML setting updated: saml_enabled = {$value}");
            }
        }
        
        $db->commit();
        responseCacheInvalidate('settings_public');
        responseCacheInvalidate('setting_guest_access_enabled');
        sendJSON(['success' => true, 'message' => 'Settings updated successfully']);
    } catch (Exception $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to update settings: ' . $e->getMessage()], 500);
    }
}

function handleEncryptPassword() {
    requireAdmin(); // Only admins can encrypt passwords
    
    $data = getJSONInput();
    
    if (!isset($data['password'])) {
        sendJSON(['error' => 'Password is required'], 400);
    }
    
    try {
        $encrypted = encryptPassword($data['password']);
        sendJSON(['encrypted' => $encrypted]);
    } catch (Exception $e) {
        sendJSON(['error' => 'Encryption failed: ' . $e->getMessage()], 500);
    }
}

function handleDecryptPassword() {
    requireAdmin(); // Only admins can decrypt passwords
    
    $data = getJSONInput();
    
    if (!isset($data['encrypted_password'])) {
        sendJSON(['error' => 'Encrypted password is required'], 400);
    }
    
    try {
        $decrypted = decryptPassword($data['encrypted_password']);
        sendJSON(['password' => $decrypted]);
    } catch (Exception $e) {
        sendJSON(['error' => 'Decryption failed: ' . $e->getMessage()], 500);
    }
}

/**
 * Delete every ldap_* settings row so leftover bind accounts cannot appear in export/UI.
 * Leaves ldap_servers=[] and ldap_enabled=0.
 */
function handlePurgeLdapSettings() {
    requireAdmin();
    $db = getDB();
    $db->beginTransaction();
    try {
        $countStmt = $db->query("SELECT COUNT(*) AS c FROM settings WHERE key LIKE 'ldap_%'");
        $before = (int)(($countStmt->fetch()['c'] ?? 0));
        $db->exec("DELETE FROM settings WHERE key LIKE 'ldap_%'");
        $db->prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
            ->execute(['ldap_servers', '[]', time()]);
        $db->prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
            ->execute(['ldap_enabled', '0', time()]);
        $db->commit();
        sendJSON([
            'success' => true,
            'deleted' => $before,
            'message' => "Purged {$before} LDAP setting row(s). LDAP is disabled with no servers configured."
        ]);
    } catch (Exception $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to purge LDAP settings: ' . $e->getMessage()], 500);
    }
}

function handleGetDatabasePath() {
    // Database path is public information (for verification purposes)
    // Get the absolute path of the database file
    $dbPath = defined('DB_PATH') ? DB_PATH : __DIR__ . '/../data/linknest.db';
    $absolutePath = realpath($dbPath);
    
    // If realpath fails (file doesn't exist), use the defined path
    if ($absolutePath === false) {
        $absolutePath = $dbPath;
    }
    
    // Normalize path separators for consistent handling
    $normalizedPath = str_replace(['\\', '/'], DIRECTORY_SEPARATOR, $absolutePath);
    
    // Remove the base path (C:\xampp\htdocs\) and keep only from linknest folder onwards
    $linknestPos = stripos($normalizedPath, 'linknest');
    
    if ($linknestPos !== false) {
        // Extract path from 'linknest' onwards
        $relativePath = substr($normalizedPath, $linknestPos);
        // Convert back to forward slashes for display (works on both Windows and Unix)
        $displayPath = str_replace('\\', '/', $relativePath);
    } else {
        // If 'linknest' not found, try to get relative path from project root
        $projectRoot = realpath(__DIR__ . '/..');
        if ($projectRoot !== false && strpos($normalizedPath, $projectRoot) === 0) {
            $relativePath = substr($normalizedPath, strlen($projectRoot) + 1);
            $displayPath = str_replace('\\', '/', $relativePath);
        } else {
            // Fallback: just show the filename
            $displayPath = basename($absolutePath);
        }
    }
    
    // Return both absolute and relative paths
    // Convert absolute path to forward slashes for consistency
    $absoluteDisplayPath = str_replace('\\', '/', $absolutePath);
    
    sendJSON([
        'database_path' => $displayPath,
        'database_path_absolute' => $absoluteDisplayPath
    ]);
}

function handleGetUserPreferences() {
    try {
        $user = getAuthenticatedUser();
        if (!$user) {
            sendJSON(['preferences' => []]);
            return;
        }
        $userId = $user['id'];
        $db = getDB();
        
        // Ensure table exists
        try {
            $db->exec('CREATE TABLE IF NOT EXISTS user_preferences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                preference_key TEXT NOT NULL,
                preference_value TEXT,
                updated_at INTEGER NOT NULL,
                UNIQUE(user_id, preference_key),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )');
        } catch (Exception $e) {
            // Table might already exist, continue
            error_log("User preferences table creation: " . $e->getMessage());
        }
        
        $stmt = $db->prepare('SELECT preference_key, preference_value FROM user_preferences WHERE user_id = ?');
        $stmt->execute([$userId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $preferences = [];
        foreach ($rows as $row) {
            $preferences[$row['preference_key']] = $row['preference_value'];
        }
        
        sendJSON(['preferences' => $preferences]);
        
    } catch (PDOException $e) {
        error_log('User preferences API PDO error: ' . $e->getMessage());
        sendJSON([
            'error' => 'Database error',
            'details' => $e->getMessage()
        ], 500);
    } catch (Exception $e) {
        error_log('User preferences API error: ' . $e->getMessage() . ' | File: ' . $e->getFile() . ' | Line: ' . $e->getLine());
        sendJSON([
            'error' => 'Failed to get user preferences',
            'details' => $e->getMessage()
        ], 500);
    } catch (Throwable $e) {
        error_log('User preferences API Throwable: ' . $e->getMessage() . ' | File: ' . $e->getFile() . ' | Line: ' . $e->getLine() . "\n" . $e->getTraceAsString());
        sendJSON([
            'error' => 'Failed to get user preferences',
            'details' => $e->getMessage()
        ], 500);
    }
}

function handleUpdateUserPreferences() {
    try {
        $user = requireAuth(); // User must be authenticated
        
        $userId = $user['id'];
        $data = getJSONInput();
        
        if (!isset($data['preferences']) || !is_array($data['preferences'])) {
            sendJSON(['error' => 'Preferences data is required'], 400);
            return;
        }
        
        $db = getDB();
        
        // Ensure table exists
        try {
            $db->exec('CREATE TABLE IF NOT EXISTS user_preferences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                preference_key TEXT NOT NULL,
                preference_value TEXT,
                updated_at INTEGER NOT NULL,
                UNIQUE(user_id, preference_key),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )');
        } catch (Exception $e) {
            // Table might already exist, continue
        }
        
        $db->beginTransaction();
        
        try {
            foreach ($data['preferences'] as $key => $value) {
                // Validate preference key (only allow alphanumeric, underscore, and hyphen)
                if (!preg_match('/^[a-zA-Z0-9_-]+$/', $key)) {
                    continue; // Skip invalid keys
                }
                
                // Store preference value - handle different types correctly
                if (is_array($value) || is_object($value)) {
                    $preferenceValue = json_encode($value);
                } elseif (is_bool($value)) {
                    // Convert boolean to string "true" or "false" (not "1" or "")
                    $preferenceValue = $value ? 'true' : 'false';
                } else {
                    $preferenceValue = (string)$value;
                }
                
                $stmt = $db->prepare('INSERT OR REPLACE INTO user_preferences (user_id, preference_key, preference_value, updated_at) VALUES (?, ?, ?, ?)');
                $stmt->execute([$userId, $key, $preferenceValue, time()]);
            }
            
            $db->commit();
            sendJSON(['success' => true, 'message' => 'Preferences updated successfully']);
            
        } catch (PDOException $e) {
            $db->rollBack();
            error_log('User preferences update PDO error: ' . $e->getMessage());
            sendJSON([
                'error' => 'Database error',
                'details' => $e->getMessage()
            ], 500);
        } catch (Exception $e) {
            $db->rollBack();
            error_log('User preferences update error: ' . $e->getMessage());
            sendJSON([
                'error' => 'Failed to update preferences',
                'details' => $e->getMessage()
            ], 500);
        }
        
    } catch (Exception $e) {
        error_log('User preferences update error: ' . $e->getMessage() . ' | File: ' . $e->getFile() . ' | Line: ' . $e->getLine());
        sendJSON([
            'error' => 'Failed to update user preferences',
            'details' => $e->getMessage()
        ], 500);
    } catch (Throwable $e) {
        error_log('User preferences update Throwable: ' . $e->getMessage() . ' | File: ' . $e->getFile() . ' | Line: ' . $e->getLine() . "\n" . $e->getTraceAsString());
        sendJSON([
            'error' => 'Failed to update user preferences',
            'details' => $e->getMessage()
        ], 500);
    }
}

function handleToggleNotifications() {
    requireAuth();
    $db = getDB();
    try {
        $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'notifications_paused'");
        $stmt->execute();
        $current = $stmt->fetchColumn();
        $newState = ($current === '1' || $current === 'true') ? '0' : '1';
        $stmt = $db->prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('notifications_paused', ?, ?)");
        $stmt->execute([$newState, time()]);
        $isPaused = $newState === '1';
        sendJSON(['success' => true, 'notifications_paused' => $isPaused, 'message' => $isPaused ? 'Email notifications paused' : 'Email notifications resumed']);
    } catch (Exception $e) {
        sendJSON(['error' => 'Failed to toggle notifications: ' . $e->getMessage()], 500);
    }
}
