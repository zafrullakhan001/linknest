<?php
/**
 * WebAuthn / passkey helpers (lbuchs/webauthn).
 */

require_once __DIR__ . '/config.php';

const WEBAUTHN_CHALLENGE_TTL = 300;

/**
 * Whether the WebAuthn PHP library is available.
 */
function webauthnLibraryAvailable(): bool
{
    if (class_exists('lbuchs\\WebAuthn\\WebAuthn')) {
        return true;
    }
    $autoload = __DIR__ . '/../vendor/autoload.php';
    if (is_file($autoload)) {
        require_once $autoload;
    }
    return class_exists('lbuchs\\WebAuthn\\WebAuthn');
}

/**
 * Resolve relying-party ID from the browser Origin (hostname only).
 */
function webauthnResolveRpId(): string
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (is_string($origin) && $origin !== '') {
        $host = parse_url($origin, PHP_URL_HOST);
        if (is_string($host) && $host !== '') {
            return strtolower($host);
        }
    }
    $host = (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
    if (strpos($host, ':') !== false) {
        $host = explode(':', $host, 2)[0];
    }
    $host = strtolower(trim($host));
    return $host !== '' ? $host : 'localhost';
}

function webauthnAppName(): string
{
    $name = trim((string)getSetting('app_name', 'LinkNest'));
    return $name !== '' ? $name : 'LinkNest';
}

/**
 * Binary user handle for discoverable credentials (4-byte big-endian user id).
 */
function webauthnUserHandleFromId(int $userId): string
{
    return pack('N', $userId);
}

function webauthnUserIdFromHandle(string $handle): ?int
{
    if (strlen($handle) !== 4) {
        return null;
    }
    $unpacked = unpack('Nid', $handle);
    if (!$unpacked || !isset($unpacked['id'])) {
        return null;
    }
    $id = (int)$unpacked['id'];
    return $id > 0 ? $id : null;
}

/**
 * Decode base64 or base64url into binary.
 */
function webauthnDecodeBinary(?string $value): string
{
    if ($value === null || $value === '') {
        return '';
    }
    $value = strtr($value, '-_', '+/');
    $pad = strlen($value) % 4;
    if ($pad > 0) {
        $value .= str_repeat('=', 4 - $pad);
    }
    $decoded = base64_decode($value, true);
    return $decoded === false ? '' : $decoded;
}

function webauthnEncodeBase64Url(string $binary): string
{
    return rtrim(strtr(base64_encode($binary), '+/', '-_'), '=');
}

/**
 * @return \lbuchs\WebAuthn\WebAuthn
 */
function webauthnCreateServer()
{
    if (!webauthnLibraryAvailable()) {
        throw new RuntimeException('WebAuthn library is not installed. Ensure vendor/lbuchs/webauthn is present.');
    }
    $formats = ['none', 'packed', 'apple', 'tpm', 'android-key', 'android-safetynet', 'fido-u2f'];
    return new \lbuchs\WebAuthn\WebAuthn(webauthnAppName(), webauthnResolveRpId(), $formats, true);
}

function webauthnRequirePasskeyEnabled(): void
{
    if ((string)getSetting('passkey_enabled', '0') !== '1') {
        sendJSON(['error' => 'Passkey sign-in is disabled'], 403);
    }
}

/**
 * Credential management must only use a real, non-impersonated browser session.
 *
 * requireAuth() also accepts system and MCP bearer tokens. Those credentials
 * must never be exchangeable for a durable interactive passkey.
 *
 * @return array<string, mixed>
 */
function webauthnRequireBrowserSessionUser(): array
{
    $user = requireAuth();

    if (!empty($user['is_system']) || isset($user['_mcp_token_id'])) {
        sendJSON([
            'error' => 'Passkey management requires an interactive browser session',
        ], 403);
    }

    if (!empty($user['impersonating'])) {
        sendJSON([
            'error' => 'Passkeys cannot be managed while impersonating another user',
        ], 403);
    }

    return $user;
}

function webauthnStoreChallenge(string $purpose, ?int $userId = null): void
{
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    $_SESSION['webauthn_challenge'] = $GLOBALS['__webauthn_pending_challenge'] ?? '';
    $_SESSION['webauthn_challenge_purpose'] = $purpose;
    $_SESSION['webauthn_challenge_user_id'] = $userId;
    $_SESSION['webauthn_challenge_expires'] = time() + WEBAUTHN_CHALLENGE_TTL;
    $_SESSION['webauthn_rp_id'] = webauthnResolveRpId();
}

function webauthnRememberChallengeBinary(string $binary): void
{
    $GLOBALS['__webauthn_pending_challenge'] = $binary;
}

/**
 * @return array{challenge: string, purpose: string, user_id: ?int}
 */
function webauthnTakeChallenge(string $expectedPurpose): array
{
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    $challenge = $_SESSION['webauthn_challenge'] ?? '';
    $purpose = (string)($_SESSION['webauthn_challenge_purpose'] ?? '');
    $userId = isset($_SESSION['webauthn_challenge_user_id']) ? (int)$_SESSION['webauthn_challenge_user_id'] : null;
    $expires = (int)($_SESSION['webauthn_challenge_expires'] ?? 0);

    unset(
        $_SESSION['webauthn_challenge'],
        $_SESSION['webauthn_challenge_purpose'],
        $_SESSION['webauthn_challenge_user_id'],
        $_SESSION['webauthn_challenge_expires'],
        $_SESSION['webauthn_rp_id']
    );

    if (!is_string($challenge) || $challenge === '' || $purpose !== $expectedPurpose) {
        sendJSON(['error' => 'Passkey challenge expired or missing. Try again.'], 400);
    }
    if ($expires < time()) {
        sendJSON(['error' => 'Passkey challenge expired. Try again.'], 400);
    }

    return [
        'challenge' => $challenge,
        'purpose' => $purpose,
        'user_id' => $userId && $userId > 0 ? $userId : null,
    ];
}

/**
 * @return list<array<string, mixed>>
 */
function webauthnListCredentialsForUser(PDO $db, int $userId): array
{
    ensureWebauthnCredentialsTable($db);
    $stmt = $db->prepare(
        'SELECT id, nickname, transports, aaguid, created_at, last_used_at
         FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at DESC'
    );
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $out = [];
    foreach ($rows as $row) {
        $transports = null;
        if (!empty($row['transports'])) {
            $decoded = json_decode((string)$row['transports'], true);
            $transports = is_array($decoded) ? $decoded : null;
        }
        $out[] = [
            'id' => (int)$row['id'],
            'nickname' => $row['nickname'] !== null && $row['nickname'] !== '' ? (string)$row['nickname'] : 'Passkey',
            'transports' => $transports,
            'aaguid' => $row['aaguid'] !== null ? (string)$row['aaguid'] : null,
            'created_at' => (int)$row['created_at'],
            'last_used_at' => $row['last_used_at'] !== null ? (int)$row['last_used_at'] : null,
        ];
    }
    return $out;
}

/**
 * Apply the same post-auth gates as Local login, then establish the PHP session.
 *
 * @param array<string, mixed> $user
 * @return array<string, mixed>
 */
function webauthnEstablishSession(array $user, bool $rememberMe = false): array
{
    require_once __DIR__ . '/login_allowlist_lib.php';
    require_once __DIR__ . '/user_audit_helper.php';

    $maintenanceEnabled = (string)getSetting('maintenance_enabled', '0') === '1';

    if (!empty($user['is_disabled']) && empty($user['is_admin'])) {
        logUserAudit('auth.login_failed', [
            'actor_id' => (int)$user['id'],
            'actor_username' => (string)$user['username'],
            'target_user_id' => (int)$user['id'],
            'target_username' => (string)$user['username'],
            'details' => ['method' => 'passkey', 'reason' => 'disabled'],
        ]);
        sendJSON(['error' => 'Your account has been disabled. Please contact your administrator.'], 403);
    }

    if (empty($user['is_approved']) && empty($user['is_admin'])) {
        logUserAudit('auth.login_failed', [
            'actor_id' => (int)$user['id'],
            'actor_username' => (string)$user['username'],
            'target_user_id' => (int)$user['id'],
            'target_username' => (string)$user['username'],
            'details' => ['method' => 'passkey', 'reason' => 'pending'],
        ]);
        sendJSON(['error' => 'Your account is pending admin approval. Please wait for approval before logging in.'], 403);
    }

    if ($maintenanceEnabled && empty($user['is_admin'])) {
        logUserAudit('auth.login_failed', [
            'actor_id' => (int)$user['id'],
            'actor_username' => (string)$user['username'],
            'target_user_id' => (int)$user['id'],
            'target_username' => (string)$user['username'],
            'details' => ['method' => 'passkey', 'reason' => 'maintenance'],
        ]);
        sendJSON(['error' => 'The application is currently in maintenance mode. Only administrators can log in at this time.'], 503);
    }

    require_login_allowlist_access($user, [], 'passkey');

    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['username'] = $user['username'];

    $cookieLifetime = $rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60;
    linknestWriteSessionCookie($cookieLifetime);
    linknestReleaseSessionLock();

    try {
        $db = getDB();
        $stmt = $db->prepare('UPDATE users SET last_login = ? WHERE id = ?');
        $stmt->execute([time(), (int)$user['id']]);
    } catch (Throwable $e) {
        error_log('passkey last_login update failed: ' . $e->getMessage());
    }

    trackUserLogin((int)$user['id'], (string)$user['username']);
    logUserAudit('auth.login', [
        'actor_id' => (int)$user['id'],
        'actor_username' => (string)$user['username'],
        'target_user_id' => (int)$user['id'],
        'target_username' => (string)$user['username'],
        'details' => ['method' => 'passkey', 'remember_me' => (bool)$rememberMe],
    ]);

    return [
        'id' => (int)$user['id'],
        'username' => (string)$user['username'],
        'email' => (string)$user['email'],
        'is_admin' => !empty($user['is_admin']),
        'is_approved' => !empty($user['is_approved']),
        'auth_source' => $user['auth_source'] ?? 'local',
        'display_name' => $user['display_name'] ?? null,
        'notes' => isset($user['notes']) && $user['notes'] !== '' ? (string)$user['notes'] : null,
    ];
}
