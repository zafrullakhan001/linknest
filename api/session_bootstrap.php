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
 * Install folder from this request, e.g. '/ArchLinks' or '/ERP3'.
 * Empty string for a domain-root deploy.
 */
function linknestDetectUrlInstallPath(): string
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
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
 * Bind session name + cookie path to this install. Call before session_start().
 */
function linknestConfigureSession(): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;

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
