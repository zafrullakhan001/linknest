<?php
/**
 * Isolate PHP sessions per install folder (e.g. /ArchLinks vs /ERP3 on the same host).
 * Must run before session_start(). No database dependency.
 */

function linknestReservedUrlSegments(): array
{
    return [
        'api', 'uploads', 'dist', 'assets', 'node_modules', 'vendor',
        'public', 'data', 'bin', 'scripts', 'docs', 'apache',
        '_ln_sshgw', '_ln_vncgw',
    ];
}

/**
 * Load data/install_identity.php when present (written by Clone Instance).
 */
function linknestLoadInstallIdentity(): void
{
    static $loaded = false;
    if ($loaded) {
        return;
    }
    $loaded = true;
    $file = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'install_identity.php';
    if (is_file($file)) {
        require_once $file;
    }
}

/**
 * Install folder from this request, e.g. '/ArchLinks' or '/ERP3'.
 * Empty string for a domain-root deploy.
 */
function linknestDetectUrlInstallPath(): string
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }

    linknestLoadInstallIdentity();
    if (defined('LINKNEST_COOKIE_PATH')) {
        $baked = rtrim((string)LINKNEST_COOKIE_PATH, '/');
        if ($baked !== '' && $baked !== '/') {
            return $cached = $baked;
        }
        if ($baked === '' || $baked === '/') {
            // Dedicated host / root cookie path; still prefer baked folder for session name.
            return $cached = '';
        }
    }

    $reserved = linknestReservedUrlSegments();

    $normalize = static function (string $raw) use ($reserved): string {
        $raw = trim(str_replace('\\', '/', $raw));
        if ($raw === '' || $raw === '/') {
            return '';
        }
        if (!preg_match('#^/([^/]+)#', $raw, $m)) {
            return '';
        }
        $seg = $m[1];
        if ($seg === '' || in_array(strtolower($seg), $reserved, true)) {
            return '';
        }
        return '/' . $seg;
    };

    $candidates = [
        (string)($_SERVER['SCRIPT_NAME'] ?? ''),
        explode('?', (string)($_SERVER['REQUEST_URI'] ?? ''), 2)[0],
        (string)($_SERVER['CONTEXT_PREFIX'] ?? ''),
        (string)($_SERVER['PHP_SELF'] ?? ''),
    ];

    foreach ($candidates as $raw) {
        $base = $normalize($raw);
        if ($base !== '') {
            return $cached = $base;
        }
    }

    return $cached = '';
}

function linknestRequestIsHttps(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string)$_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https')
        || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443);
}

/**
 * Alphanumeric session cookie name unique to this folder.
 * Root deploys keep PHPSESSID.
 */
function linknestSessionName(): string
{
    linknestLoadInstallIdentity();
    if (defined('LINKNEST_SESSION_NAME')) {
        $baked = preg_replace('/[^A-Za-z0-9]/', '', (string)LINKNEST_SESSION_NAME);
        if (is_string($baked) && $baked !== '') {
            return $baked;
        }
    }
    $path = linknestDetectUrlInstallPath();
    if ($path === '') {
        return 'PHPSESSID';
    }
    $seg = preg_replace('/[^A-Za-z0-9]/', '', ltrim($path, '/'));
    if ($seg === '') {
        return 'PHPSESSID';
    }
    return 'LNSESS' . $seg;
}

function linknestSessionCookiePath(): string
{
    linknestLoadInstallIdentity();
    if (defined('LINKNEST_COOKIE_PATH')) {
        $baked = (string)LINKNEST_COOKIE_PATH;
        if ($baked === '') {
            return '/';
        }
        return $baked[0] === '/' ? $baked : '/' . $baked;
    }
    $path = linknestDetectUrlInstallPath();
    return $path !== '' ? $path : '/';
}

function linknestSessionCookieOptions(int $expires = 0): array
{
    $params = session_status() === PHP_SESSION_ACTIVE
        ? session_get_cookie_params()
        : [];

    $samesite = $params['samesite'] ?? 'Lax';
    if ($samesite === '') {
        $samesite = 'Lax';
    }

    return [
        'expires' => $expires,
        'path' => $params['path'] ?? linknestSessionCookiePath(),
        'domain' => $params['domain'] ?? '',
        'secure' => array_key_exists('secure', $params) ? (bool)$params['secure'] : linknestRequestIsHttps(),
        'httponly' => true,
        'samesite' => $samesite,
    ];
}

/**
 * Expire the old host-wide PHPSESSID so sibling installs cannot reuse it.
 */
function linknestExpireSharedSessionCookies(): void
{
    if (headers_sent()) {
        return;
    }

    // Root deploys and pages that already started a PHPSESSID session must keep it.
    if (linknestSessionName() === 'PHPSESSID') {
        return;
    }
    if (session_status() === PHP_SESSION_ACTIVE && session_name() === 'PHPSESSID') {
        return;
    }

    $secure = linknestRequestIsHttps();
    $clear = static function (string $name, string $path) use ($secure): void {
        setcookie($name, '', [
            'expires' => time() - 3600,
            'path' => $path,
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    };

    $installPath = linknestSessionCookiePath();
    $clear('PHPSESSID', '/');
    if ($installPath !== '/') {
        $clear('PHPSESSID', $installPath);
    }
}

function linknestWriteSessionCookie(int $lifetimeSeconds): void
{
    if (session_status() !== PHP_SESSION_ACTIVE || headers_sent()) {
        return;
    }

    $expires = $lifetimeSeconds > 0 ? time() + $lifetimeSeconds : 0;
    setcookie(session_name(), session_id(), linknestSessionCookieOptions($expires));
    linknestExpireSharedSessionCookies();
}

function linknestClearSessionCookie(): void
{
    if (headers_sent()) {
        return;
    }

    $name = session_name();
    setcookie($name, '', linknestSessionCookieOptions(time() - 3600));
    linknestExpireSharedSessionCookies();
}

/**
 * Release the PHP session file lock so parallel requests from the same browser
 * (SPA home batch: /auth/me + /settings + /tiles + …) can run concurrently.
 * Call after auth/session reads (and any session writes) on read-heavy endpoints.
 * $_SESSION remains readable in-process after close; further writes will not persist.
 */
function linknestReleaseSessionLock(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
}

/**
 * Bind session name + cookie path to this install. Call before session_start().
 */
function linknestConfigureSession(): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;

    linknestLoadInstallIdentity();

    if (defined('LINKNEST_SESSION_SAVE_PATH')) {
        $savePath = (string)LINKNEST_SESSION_SAVE_PATH;
        if ($savePath !== '' && !is_dir($savePath)) {
            @mkdir($savePath, 0700, true);
        }
        if ($savePath !== '' && is_dir($savePath) && is_writable($savePath)) {
            @ini_set('session.save_path', $savePath);
        }
    }

    if (session_status() === PHP_SESSION_ACTIVE) {
        linknestExpireSharedSessionCookies();
        return;
    }

    $name = linknestSessionName();
    if ($name !== '') {
        @session_name($name);
    }

    session_set_cookie_params([
        'lifetime' => 0,
        'path' => linknestSessionCookiePath(),
        'domain' => '',
        'secure' => linknestRequestIsHttps(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    linknestExpireSharedSessionCookies();
}

/**
 * Write data/install_identity.php so this install has its own session cookie, session files, and system token.
 * Keeps an existing LINKNEST_SYSTEM_TOKEN on rebuild/redeploy.
 *
 * @return array{sessionName: string, cookiePath: string, token: string, identityPath: string}
 */
function linknestWriteInstallIdentity(string $appRoot, string $folderName, ?string $url = null): array
{
    $appRoot = rtrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $appRoot), DIRECTORY_SEPARATOR);
    $dataDir = $appRoot . DIRECTORY_SEPARATOR . 'data';
    if (!is_dir($dataDir)) {
        @mkdir($dataDir, 0755, true);
    }

    $seg = preg_replace('/[^A-Za-z0-9]/', '', (string) $folderName);
    if (!is_string($seg) || $seg === '') {
        $seg = bin2hex(random_bytes(4));
    }
    $sessionName = 'LNSESS' . $seg;

    $cookiePath = '/' . ltrim((string) $folderName, '/');
    $parsed = is_string($url) ? parse_url($url) : false;
    if (is_array($parsed) && isset($parsed['path']) && $parsed['path'] !== '' && $parsed['path'] !== '/') {
        $cookiePath = rtrim((string) $parsed['path'], '/');
        if ($cookiePath === '') {
            $cookiePath = '/';
        }
    }
    if ($folderName === 'docker') {
        $cookiePath = '/';
    }

    $identityPath = $dataDir . DIRECTORY_SEPARATOR . 'install_identity.php';
    $token = 'ln_' . bin2hex(random_bytes(24));
    if (is_file($identityPath)) {
        $existing = (string) @file_get_contents($identityPath);
        $existingFolder = '';
        if (preg_match("/define\\('LINKNEST_INSTALL_FOLDER',\\s*'([^']*)'\\)/", $existing, $fm)) {
            $existingFolder = $fm[1];
        }
        // Keep the token across container restarts; mint a new one if this file
        // belonged to a different install (e.g. host XAMPP data copied into Docker).
        if ($existingFolder === (string) $folderName
            && preg_match("/define\\('LINKNEST_SYSTEM_TOKEN',\\s*'([^']+)'\\)/", $existing, $m)
            && $m[1] !== ''
        ) {
            $token = $m[1];
        }
    }

    $sessionsDir = $dataDir . DIRECTORY_SEPARATOR . 'sessions';
    if (!is_dir($sessionsDir)) {
        @mkdir($sessionsDir, 0700, true);
    }

    $identity = "<?php\n";
    $identity .= "// Generated for this install — do not copy between host clones or Docker.\n";
    $identity .= "if (!defined('LINKNEST_INSTALL_FOLDER')) {\n";
    $identity .= "    define('LINKNEST_INSTALL_FOLDER', " . var_export((string) $folderName, true) . ");\n";
    $identity .= "}\n";
    $identity .= "if (!defined('LINKNEST_SESSION_NAME')) {\n";
    $identity .= "    define('LINKNEST_SESSION_NAME', " . var_export($sessionName, true) . ");\n";
    $identity .= "}\n";
    $identity .= "if (!defined('LINKNEST_COOKIE_PATH')) {\n";
    $identity .= "    define('LINKNEST_COOKIE_PATH', " . var_export($cookiePath, true) . ");\n";
    $identity .= "}\n";
    $identity .= "if (!defined('LINKNEST_SYSTEM_TOKEN')) {\n";
    $identity .= "    define('LINKNEST_SYSTEM_TOKEN', " . var_export($token, true) . ");\n";
    $identity .= "}\n";
    $identity .= "if (!defined('LINKNEST_SESSION_SAVE_PATH')) {\n";
    $identity .= "    define('LINKNEST_SESSION_SAVE_PATH', __DIR__ . DIRECTORY_SEPARATOR . 'sessions');\n";
    $identity .= "}\n";

    if (@file_put_contents($identityPath, $identity) === false) {
        throw new RuntimeException('Failed to write ' . $identityPath);
    }
    @chmod($identityPath, 0640);

    $denyAll = "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n    Deny from all\n</IfModule>\n";
    @file_put_contents($dataDir . DIRECTORY_SEPARATOR . '.htaccess', $denyAll);
    @file_put_contents($sessionsDir . DIRECTORY_SEPARATOR . '.htaccess', $denyAll);
    @file_put_contents($sessionsDir . DIRECTORY_SEPARATOR . 'index.html', '');

    return [
        'sessionName' => $sessionName,
        'cookiePath' => $cookiePath,
        'token' => $token,
        'identityPath' => $identityPath,
    ];
}
