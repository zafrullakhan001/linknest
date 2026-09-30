<?php
/**
 * Two-factor authentication (TOTP / RFC 6238) for Local and LDAP sign-in.
 *
 * Design notes
 * - Users enrol an authenticator app from the profile menu (ProfileMenu →
 *   TwoFactorDialog). The shared secret is stored with the existing
 *   AES-256-GCM helper (encryptPassword/decryptPassword), never in plaintext,
 *   and recovery codes are stored as password_hash() values.
 * - handleLogin() calls twoFactorMaybeGate() after every credential + policy
 *   gate. When 2FA applies no session user is created: a pending challenge is
 *   kept in $_SESSION['two_factor_pending'] and the client must POST
 *   /auth/2fa/verify with the 6-digit code (or a recovery code) before the
 *   session, the remember-me cookie and the auth.login audit entry are written.
 * - SQLite foreign keys are disabled app-wide (api/config.php), so callers must
 *   run twoFactorDeleteForUser() when removing a user.
 */

require_once __DIR__ . '/config.php';

const TWO_FACTOR_CHALLENGE_TTL = 300;       // seconds a challenge stays valid
const TWO_FACTOR_MAX_ATTEMPTS = 5;          // wrong codes allowed per challenge
const TWO_FACTOR_LOCK_SECONDS = 900;        // lockout after too many failures
const TWO_FACTOR_DEVICE_COOKIE = 'ln2fa_device';
const TWO_FACTOR_DEVICE_TTL = 2592000;      // 30 days "trust this device"
const TWO_FACTOR_RECOVERY_CODE_COUNT = 10;
const TWO_FACTOR_SECRET_PREFIX = 'ln2fa:';
const TWO_FACTOR_CODE_PERIOD = 30;          // TOTP step (seconds)
const TWO_FACTOR_CODE_DIGITS = 6;
const TWO_FACTOR_RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Steps around "now" accepted during enrolment (device clock may be off). */
const TWO_FACTOR_ENROLL_WINDOW_STEPS = 5;
/** Worst-case drift the server silently re-centres on (2 steps = ±60 s). */
const TWO_FACTOR_RESYNC_MAX_STEPS = 2;
/** Beyond the tolerance we only report the measured offset (10 minutes). */
const TWO_FACTOR_DIAGNOSTIC_MAX_STEPS = 20;

/**
 * Create the two-factor tables (additive + idempotent).
 */
function ensureTwoFactorSchema(PDO $db): void
{
    static $ensured = false;
    if ($ensured) {
        return;
    }
    try {
        $db->exec('CREATE TABLE IF NOT EXISTS user_two_factor (
            user_id INTEGER PRIMARY KEY,
            secret TEXT,
            pending_secret TEXT,
            enabled INTEGER NOT NULL DEFAULT 0,
            recovery_codes TEXT,
            created_at INTEGER NOT NULL,
            confirmed_at INTEGER,
            last_used_at INTEGER,
            last_counter INTEGER,
            failed_attempts INTEGER NOT NULL DEFAULT 0,
            locked_until INTEGER,
            clock_offset_steps INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )');
        // Existing installs created before the clock-offset column existed.
        $columns = $db->query('PRAGMA table_info(user_two_factor)')->fetchAll(PDO::FETCH_ASSOC);
        $names = array_column($columns, 'name');
        if (!in_array('clock_offset_steps', $names, true)) {
            $db->exec('ALTER TABLE user_two_factor ADD COLUMN clock_offset_steps INTEGER NOT NULL DEFAULT 0');
        }
        $db->exec('CREATE TABLE IF NOT EXISTS user_two_factor_devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            selector TEXT NOT NULL UNIQUE,
            validator_hash TEXT NOT NULL,
            user_agent TEXT,
            created_at INTEGER NOT NULL,
            last_used_at INTEGER,
            expires_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_user_two_factor_devices_user ON user_two_factor_devices(user_id)');
        $ensured = true;
    } catch (PDOException $e) {
        error_log('ensureTwoFactorSchema warning: ' . $e->getMessage());
    }
}

/** Feature availability (admin toggle, mirrors passkey_enabled). */
function twoFactorIsAvailable(): bool
{
    try {
        return (string)getSetting('two_factor_enabled', '0') === '1';
    } catch (Throwable $e) {
        return false;
    }
}

/** Optional policy: administrators want every Local/LDAP user to enrol. */
function twoFactorIsRequired(): bool
{
    try {
        return (string)getSetting('two_factor_required', '0') === '1';
    } catch (Throwable $e) {
        return false;
    }
}

/** @return array<string, mixed>|null */
function twoFactorRow(PDO $db, int $userId): ?array
{
    if ($userId <= 0) {
        return null;
    }
    ensureTwoFactorSchema($db);
    $stmt = $db->prepare('SELECT * FROM user_two_factor WHERE user_id = ?');
    $stmt->execute([$userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function twoFactorIsEnrolled(PDO $db, int $userId): bool
{
    $row = twoFactorRow($db, $userId);
    return $row !== null && (int)$row['enabled'] === 1 && (string)($row['secret'] ?? '') !== '';
}

/** Drop every 2FA artefact for a user (admin reset, secret unreadable, delete). */
function twoFactorResetUser(PDO $db, int $userId, string $reason = 'admin'): void
{
    if ($userId <= 0) {
        return;
    }
    try {
        ensureTwoFactorSchema($db);
        $stmt = $db->prepare('DELETE FROM user_two_factor WHERE user_id = ?');
        $stmt->execute([$userId]);
        $stmt = $db->prepare('DELETE FROM user_two_factor_devices WHERE user_id = ?');
        $stmt->execute([$userId]);
    } catch (Throwable $e) {
        error_log('twoFactorResetUser (' . $reason . ') failed: ' . $e->getMessage());
    }
}

/** Alias kept explicit for user-deletion call sites. */
function twoFactorDeleteForUser(PDO $db, int $userId): void
{
    twoFactorResetUser($db, $userId, 'user_deleted');
}

/**
 * Status payload for the profile dialog and for the login gate.
 *
 * @return array<string, mixed>
 */
function twoFactorUserStatus(PDO $db, int $userId): array
{
    $row = twoFactorRow($db, $userId);
    $enabled = $row !== null && (int)$row['enabled'] === 1 && (string)($row['secret'] ?? '') !== '';
    $codes = [];
    if ($row !== null && !empty($row['recovery_codes'])) {
        $decoded = json_decode((string)$row['recovery_codes'], true);
        $codes = is_array($decoded) ? $decoded : [];
    }

    return [
        'available' => twoFactorIsAvailable(),
        'enabled' => $enabled,
        'required' => twoFactorIsAvailable() && twoFactorIsRequired(),
        'confirmed_at' => $enabled && !empty($row['confirmed_at']) ? (int)$row['confirmed_at'] : null,
        'last_used_at' => $row !== null && !empty($row['last_used_at']) ? (int)$row['last_used_at'] : null,
        'locked_until' => $row !== null && (int)($row['locked_until'] ?? 0) > time() ? (int)$row['locked_until'] : null,
        'recovery_codes_remaining' => count($codes),
        // Signed drift the server has learned for this user's authenticator
        // (positive = the device's clock runs ahead of the server).
        'clock_offset_seconds' => $row !== null ? (int)($row['clock_offset_steps'] ?? 0) * TWO_FACTOR_CODE_PERIOD : 0,
        'trusted_devices' => $enabled ? twoFactorListTrustedDevices($db, $userId) : [],
    ];
}

/* -------------------------------------------------------------------------
 * TOTP (RFC 6238) + secret / recovery-code handling
 * ---------------------------------------------------------------------- */

/** 160-bit random secret as RFC 4648 Base32 (what authenticator apps expect). */
function twoFactorGenerateSecret(): string
{
    return twoFactorEncodeBase32(random_bytes(20));
}

function twoFactorEncodeBase32(string $binary): string
{
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $out = '';
    $bits = 0;
    $value = 0;
    $length = strlen($binary);
    for ($i = 0; $i < $length; $i++) {
        $value = ($value << 8) | ord($binary[$i]);
        $bits += 8;
        while ($bits >= 5) {
            $bits -= 5;
            $out .= $alphabet[($value >> $bits) & 0x1F];
        }
    }
    if ($bits > 0) {
        $out .= $alphabet[($value << (5 - $bits)) & 0x1F];
    }
    return $out;
}

/** Base32 → binary. Ignores spaces, dashes and padding. */
function twoFactorDecodeBase32(string $secret): string
{
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $clean = strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $secret) ?? '');
    if ($clean === '') {
        return '';
    }
    $out = '';
    $bits = 0;
    $value = 0;
    $length = strlen($clean);
    for ($i = 0; $i < $length; $i++) {
        $index = strpos($alphabet, $clean[$i]);
        if ($index === false) {
            continue;
        }
        $value = ($value << 5) | $index;
        $bits += 5;
        if ($bits >= 8) {
            $bits -= 8;
            $out .= chr(($value >> $bits) & 0xFF);
        }
    }
    return $out;
}

/** 6-digit TOTP for a given counter (time step). */
function twoFactorCodeForCounter(string $binarySecret, int $counter): string
{
    if ($binarySecret === '') {
        return '';
    }
    $hash = hash_hmac('sha1', pack('N2', 0, max(0, $counter)), $binarySecret, true);
    $offset = ord($hash[strlen($hash) - 1]) & 0x0F;
    $binary = ((ord($hash[$offset]) & 0x7F) << 24)
        | ((ord($hash[$offset + 1]) & 0xFF) << 16)
        | ((ord($hash[$offset + 2]) & 0xFF) << 8)
        | (ord($hash[$offset + 3]) & 0xFF);
    $code = $binary % (10 ** TWO_FACTOR_CODE_DIGITS);
    return str_pad((string)$code, TWO_FACTOR_CODE_DIGITS, '0', STR_PAD_LEFT);
}

/** Convenience: the code a correct authenticator app shows right now. */
function twoFactorCurrentCode(string $secret): string
{
    $binary = twoFactorDecodeBase32($secret);
    return $binary === '' ? '' : twoFactorCodeForCounter($binary, (int)floor(time() / TWO_FACTOR_CODE_PERIOD));
}

/**
 * Verify a 6-digit code against a Base32 secret, allowing ±$window steps of
 * clock skew. Returns true and fills $matchedCounter (for replay protection).
 *
 * $offsetSteps shifts the centre of the window: use the per-user recorded clock
 * offset so a device whose clock drifts still authenticates.
 */
function twoFactorVerifyCode(string $secret, string $code, int $window = 1, ?int &$matchedCounter = null, int $offsetSteps = 0): bool
{
    $matched = twoFactorMatchCode($secret, $code, $window, twoFactorCurrentCounter($offsetSteps));
    if ($matched === null) {
        return false;
    }
    $matchedCounter = $matched;
    return true;
}

/** The TOTP step for "now", optionally shifted by a recorded clock offset. */
function twoFactorCurrentCounter(int $offsetSteps = 0): int
{
    return (int)floor(time() / TWO_FACTOR_CODE_PERIOD) + $offsetSteps;
}

/**
 * Match a code against $window steps either side of $centerCounter (defaults to
 * the server's current step). Returns the matched counter, or null.
 */
function twoFactorMatchCode(string $secret, string $code, int $window, ?int $centerCounter = null): ?int
{
    $binary = twoFactorDecodeBase32($secret);
    if ($binary === '') {
        return null;
    }
    $digits = preg_replace('/\D/', '', $code) ?? '';
    if (strlen($digits) !== TWO_FACTOR_CODE_DIGITS) {
        return null;
    }
    $center = $centerCounter ?? twoFactorCurrentCounter();
    for ($i = -$window; $i <= $window; $i++) {
        $candidate = $center + $i;
        if ($candidate < 0) {
            continue;
        }
        if (hash_equals(twoFactorCodeForCounter($binary, $candidate), $digits)) {
            return $candidate;
        }
    }
    return null;
}

/**
 * Seconds of clock difference implied by a supplied code that is valid, but
 * outside the accepted window (for an actionable "your clock is off" message).
 * Returns null when the code does not match any nearby step.
 */
function twoFactorDiagnoseSkew(string $secret, string $code, int $maxSteps = TWO_FACTOR_DIAGNOSTIC_MAX_STEPS): ?int
{
    $matched = twoFactorMatchCode($secret, $code, max(1, $maxSteps));
    if ($matched === null) {
        return null;
    }
    return ($matched - twoFactorCurrentCounter()) * TWO_FACTOR_CODE_PERIOD;
}

/**
 * Verify a code against a stored enrolment, honouring the recorded device clock
 * offset and silently re-centring it when the device has drifted (NTP lag,
 * hardware swap, timezone/DST tinkering).
 *
 * @param array<string, mixed> $row Row from user_two_factor
 * @return int|null Matched step, or null when the code does not match
 */
function twoFactorVerifyStoredCode(PDO $db, int $userId, array $row, string $code, ?bool &$resynced = null, ?int &$offsetSteps = null): ?int
{
    $resynced = false;
    $offsetSteps = (int)($row['clock_offset_steps'] ?? 0);

    $secret = twoFactorDecryptSecret((string)($row['secret'] ?? ''));
    if ($secret === '') {
        return null;
    }

    $matched = twoFactorMatchCode($secret, $code, 1, twoFactorCurrentCounter($offsetSteps));
    if ($matched !== null) {
        return $matched;
    }

    // Outside the ±1 window: the authenticator's clock may have drifted. Accept a
    // code that is valid up to TWO_FACTOR_RESYNC_MAX_STEPS away and remember the
    // new offset so the next sign-in matches immediately.
    $wideMatched = twoFactorMatchCode($secret, $code, TWO_FACTOR_RESYNC_MAX_STEPS, null);
    if ($wideMatched === null) {
        return null;
    }
    $delta = $wideMatched - twoFactorCurrentCounter();
    if (abs($delta) > TWO_FACTOR_RESYNC_MAX_STEPS) {
        return null;
    }

    try {
        $stmt = $db->prepare('UPDATE user_two_factor SET clock_offset_steps = ? WHERE user_id = ?');
        $stmt->execute([$delta, $userId]);
        $offsetSteps = $delta;
        $resynced = true;
    } catch (Throwable $e) {
        error_log('twoFactorVerifyStoredCode resync failed: ' . $e->getMessage());
    }

    return $wideMatched;
}

/**
 * Measured drift (seconds, signed) for a code that is valid but outside the
 * accepted window — drives the "your device clock is off" message.
 */
function twoFactorStoredCodeSkewSeconds(array $row, string $code): ?int
{
    $secret = twoFactorDecryptSecret((string)($row['secret'] ?? ''));
    if ($secret === '') {
        return null;
    }
    return twoFactorDiagnoseSkew($secret, $code);
}

/** otpauth:// URI for QR codes and manual "add account" links. */
function twoFactorProvisioningUri(string $secret, string $accountName, ?string $issuer = null): string
{
    $issuer = trim((string)($issuer ?? ''));
    if ($issuer === '' && function_exists('getAppName')) {
        $issuer = trim((string)getAppName());
    }
    if ($issuer === '') {
        $issuer = 'LinkNest';
    }
    $label = $issuer . ':' . $accountName;
    return 'otpauth://totp/' . rawurlencode($label)
        . '?secret=' . rawurlencode(strtoupper($secret))
        . '&issuer=' . rawurlencode($issuer)
        . '&algorithm=SHA1&digits=' . TWO_FACTOR_CODE_DIGITS
        . '&period=' . TWO_FACTOR_CODE_PERIOD;
}

/* -------------------------------------------------------------------------
 * Secret at rest + recovery codes
 * ---------------------------------------------------------------------- */

/** Encrypt a Base32 secret for storage (AES-256-GCM via encryptPassword). */
function twoFactorEncryptSecret(string $secret): string
{
    $secret = trim($secret);
    if ($secret === '') {
        return '';
    }
    try {
        return TWO_FACTOR_SECRET_PREFIX . encryptPassword($secret);
    } catch (Throwable $e) {
        error_log('twoFactorEncryptSecret failed: ' . $e->getMessage());
        return '';
    }
}

/**
 * Decrypt a stored secret. Returns '' when the payload cannot be read — e.g. a
 * database restored onto a host whose data/ encryption key differs. Callers
 * must fail open (force re-enrolment) instead of locking the account out.
 */
function twoFactorDecryptSecret(string $stored): string
{
    $stored = trim((string)$stored);
    if ($stored === '') {
        return '';
    }

    $value = $stored;
    if (strpos($stored, TWO_FACTOR_SECRET_PREFIX) === 0) {
        $payload = substr($stored, strlen(TWO_FACTOR_SECRET_PREFIX));
        // Our own writes always store an AES-GCM payload (iv.tag.data).
        if (function_exists('isLikelyEncryptedPassword') && !isLikelyEncryptedPassword($payload)) {
            return '';
        }
        try {
            $value = (string)decryptPassword($payload);
        } catch (Throwable $e) {
            error_log('twoFactorDecryptSecret failed: ' . $e->getMessage());
            return '';
        }
    } elseif (function_exists('isLikelyEncryptedPassword') && isLikelyEncryptedPassword($stored)) {
        // Legacy row without the version prefix.
        try {
            $value = (string)decryptPassword($stored);
        } catch (Throwable $e) {
            error_log('twoFactorDecryptSecret failed: ' . $e->getMessage());
            return '';
        }
    }

    // Only accept a plausible Base32 secret (>= 80 bits). This rejects rotated
    // encryption keys and corrupted/manually edited rows, which then fall back
    // to the fail-open path in twoFactorMaybeGate().
    $normalized = strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $value) ?? '');
    if (strlen($normalized) < 16 || strlen($normalized) > 128) {
        return '';
    }
    if (strlen(twoFactorDecodeBase32($normalized)) < 10) {
        return '';
    }
    return $normalized;
}

/** Generate $count human-friendly one-time recovery codes (XXXXX-XXXXX). */
function twoFactorGenerateRecoveryCodes(int $count = TWO_FACTOR_RECOVERY_CODE_COUNT): array
{
    $alphabet = TWO_FACTOR_RECOVERY_ALPHABET;
    $max = strlen($alphabet) - 1;
    $codes = [];
    for ($i = 0; $i < $count; $i++) {
        $code = '';
        for ($j = 0; $j < 10; $j++) {
            $code .= $alphabet[random_int(0, $max)];
            if ($j === 4) {
                $code .= '-';
            }
        }
        $codes[] = $code;
    }
    return $codes;
}

/** Compare-time normalization: uppercase, alphanumeric only. */
function twoFactorNormalizeRecoveryCode(string $code): string
{
    return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $code) ?? '');
}

/** @return string JSON blob of password_hash() values for storage. */
function twoFactorHashRecoveryCodes(array $codes): string
{
    $hashes = [];
    foreach ($codes as $code) {
        $normalized = twoFactorNormalizeRecoveryCode((string)$code);
        if ($normalized !== '') {
            $hashes[] = password_hash($normalized, PASSWORD_DEFAULT);
        }
    }
    return json_encode($hashes, JSON_UNESCAPED_SLASHES) ?: '[]';
}

/** Single-use recovery code: verifies and removes it from the stored set. */
function twoFactorConsumeRecoveryCode(PDO $db, int $userId, string $code): bool
{
    $normalized = twoFactorNormalizeRecoveryCode($code);
    if ($normalized === '' || strlen($normalized) < 8) {
        return false;
    }
    $row = twoFactorRow($db, $userId);
    if ($row === null || empty($row['recovery_codes'])) {
        return false;
    }
    $hashes = json_decode((string)$row['recovery_codes'], true);
    if (!is_array($hashes) || $hashes === []) {
        return false;
    }

    $matched = false;
    $remaining = [];
    foreach ($hashes as $hash) {
        if (!$matched && is_string($hash) && $hash !== '' && password_verify($normalized, $hash)) {
            $matched = true;
            continue;
        }
        $remaining[] = $hash;
    }
    if (!$matched) {
        return false;
    }

    $stmt = $db->prepare('UPDATE user_two_factor SET recovery_codes = ?, last_used_at = ? WHERE user_id = ?');
    $stmt->execute([json_encode($remaining, JSON_UNESCAPED_SLASHES) ?: '[]', time(), $userId]);
    return true;
}

/* -------------------------------------------------------------------------
 * Trusted devices ("don't ask again on this browser for 30 days")
 * ---------------------------------------------------------------------- */

function twoFactorPruneTrustedDevices(PDO $db, ?int $userId = null): void
{
    try {
        ensureTwoFactorSchema($db);
        if ($userId !== null && $userId > 0) {
            $stmt = $db->prepare('DELETE FROM user_two_factor_devices WHERE expires_at < ? AND user_id = ?');
            $stmt->execute([time(), $userId]);
            return;
        }
        $db->exec('DELETE FROM user_two_factor_devices WHERE expires_at < ' . time());
    } catch (Throwable $e) {
        error_log('twoFactorPruneTrustedDevices failed: ' . $e->getMessage());
    }
}

function twoFactorWriteDeviceCookie(string $value, int $expires): void
{
    if (headers_sent()) {
        return;
    }
    $options = function_exists('linknestSessionCookieOptions')
        ? linknestSessionCookieOptions($expires)
        : [
            'expires' => $expires,
            'path' => '/',
            'secure' => !empty($_SERVER['HTTPS']),
            'httponly' => true,
            'samesite' => 'Lax',
        ];
    setcookie(TWO_FACTOR_DEVICE_COOKIE, $value, $options);
}

function twoFactorClearTrustedDeviceCookie(): void
{
    twoFactorWriteDeviceCookie('', time() - 3600);
}

/** Create a trusted-device token for the current browser and set the cookie. */
function twoFactorIssueTrustedDevice(PDO $db, int $userId): void
{
    if ($userId <= 0) {
        return;
    }
    ensureTwoFactorSchema($db);
    twoFactorPruneTrustedDevices($db, $userId);

    $selector = bin2hex(random_bytes(8));
    $validator = bin2hex(random_bytes(32));
    $now = time();
    $expires = $now + TWO_FACTOR_DEVICE_TTL;
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    if (strlen($ua) > 512) {
        $ua = substr($ua, 0, 512);
    }

    $stmt = $db->prepare('INSERT INTO user_two_factor_devices
        (user_id, selector, validator_hash, user_agent, created_at, last_used_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        $userId,
        $selector,
        password_hash($validator, PASSWORD_DEFAULT),
        $ua !== '' ? $ua : null,
        $now,
        $now,
        $expires,
    ]);

    twoFactorWriteDeviceCookie($selector . '.' . $validator, $expires);
}

/**
 * Whether this browser already holds a valid trusted-device token for the user.
 * Rotates the validator on every successful use.
 */
function twoFactorCheckTrustedDevice(PDO $db, int $userId): bool
{
    if ($userId <= 0) {
        return false;
    }
    $raw = (string)($_COOKIE[TWO_FACTOR_DEVICE_COOKIE] ?? '');
    if ($raw === '' || strpos($raw, '.') === false) {
        return false;
    }
    $parts = explode('.', $raw, 2);
    $selector = $parts[0];
    $validator = $parts[1] ?? '';
    if ($selector === '' || $validator === '') {
        return false;
    }

    try {
        ensureTwoFactorSchema($db);
        twoFactorPruneTrustedDevices($db, $userId);
        $stmt = $db->prepare('SELECT id, validator_hash, expires_at FROM user_two_factor_devices WHERE selector = ? AND user_id = ? LIMIT 1');
        $stmt->execute([$selector, $userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return false;
        }
        if ((int)$row['expires_at'] < time() || !password_verify($validator, (string)$row['validator_hash'])) {
            $del = $db->prepare('DELETE FROM user_two_factor_devices WHERE id = ?');
            $del->execute([(int)$row['id']]);
            twoFactorClearTrustedDeviceCookie();
            return false;
        }

        $newValidator = bin2hex(random_bytes(32));
        $upd = $db->prepare('UPDATE user_two_factor_devices SET validator_hash = ?, last_used_at = ? WHERE id = ?');
        $upd->execute([password_hash($newValidator, PASSWORD_DEFAULT), time(), (int)$row['id']]);
        twoFactorWriteDeviceCookie($selector . '.' . $newValidator, (int)$row['expires_at']);
        return true;
    } catch (Throwable $e) {
        error_log('twoFactorCheckTrustedDevice failed: ' . $e->getMessage());
        return false;
    }
}

/** @return list<array<string, mixed>> */
function twoFactorListTrustedDevices(PDO $db, int $userId): array
{
    if ($userId <= 0) {
        return [];
    }
    try {
        ensureTwoFactorSchema($db);
        twoFactorPruneTrustedDevices($db, $userId);
        $stmt = $db->prepare('SELECT id, user_agent, created_at, last_used_at, expires_at
            FROM user_two_factor_devices WHERE user_id = ? ORDER BY created_at DESC');
        $stmt->execute([$userId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $out = [];
        foreach ($rows as $row) {
            $out[] = [
                'id' => (int)$row['id'],
                'user_agent' => $row['user_agent'] !== null && $row['user_agent'] !== '' ? (string)$row['user_agent'] : null,
                'created_at' => (int)$row['created_at'],
                'last_used_at' => $row['last_used_at'] !== null ? (int)$row['last_used_at'] : null,
                'expires_at' => (int)$row['expires_at'],
            ];
        }
        return $out;
    } catch (Throwable $e) {
        error_log('twoFactorListTrustedDevices failed: ' . $e->getMessage());
        return [];
    }
}

function twoFactorRevokeTrustedDevice(PDO $db, int $userId, int $deviceId): bool
{
    if ($userId <= 0 || $deviceId <= 0) {
        return false;
    }
    try {
        ensureTwoFactorSchema($db);
        $stmt = $db->prepare('DELETE FROM user_two_factor_devices WHERE id = ? AND user_id = ?');
        $stmt->execute([$deviceId, $userId]);
        return $stmt->rowCount() > 0;
    } catch (Throwable $e) {
        error_log('twoFactorRevokeTrustedDevice failed: ' . $e->getMessage());
        return false;
    }
}

function twoFactorRevokeAllTrustedDevices(PDO $db, int $userId): void
{
    if ($userId <= 0) {
        return;
    }
    try {
        ensureTwoFactorSchema($db);
        $stmt = $db->prepare('DELETE FROM user_two_factor_devices WHERE user_id = ?');
        $stmt->execute([$userId]);
        twoFactorClearTrustedDeviceCookie();
    } catch (Throwable $e) {
        error_log('twoFactorRevokeAllTrustedDevices failed: ' . $e->getMessage());
    }
}

/* -------------------------------------------------------------------------
 * Login challenge lifecycle
 * ---------------------------------------------------------------------- */

/**
 * Store a pending (unauthenticated) challenge in the session. Deliberately does
 * NOT write $_SESSION['user_id'] and does NOT extend the session cookie.
 *
 * @param array<string, mixed> $user
 * @return array<string, mixed>
 */
function twoFactorBeginChallenge(array $user, bool $rememberMe, string $method): array
{
    if (session_status() === PHP_SESSION_NONE) {
        @session_start();
    }
    $now = time();
    $challenge = [
        'challenge_id' => bin2hex(random_bytes(16)),
        'user_id' => (int)$user['id'],
        'username' => (string)($user['username'] ?? ''),
        'email' => (string)($user['email'] ?? ''),
        'method' => $method,
        'remember_me' => $rememberMe,
        'created_at' => $now,
        'expires_at' => $now + TWO_FACTOR_CHALLENGE_TTL,
        'attempts' => 0,
    ];
    $_SESSION['two_factor_pending'] = $challenge;
    return $challenge;
}

/** @return array<string, mixed>|null */
function twoFactorPendingChallenge(): ?array
{
    if (session_status() === PHP_SESSION_NONE) {
        @session_start();
    }
    $pending = $_SESSION['two_factor_pending'] ?? null;
    if (!is_array($pending)) {
        return null;
    }
    if ((int)($pending['expires_at'] ?? 0) < time()) {
        unset($_SESSION['two_factor_pending']);
        return null;
    }
    return $pending;
}

function twoFactorClearPending(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        @session_start();
    }
    unset($_SESSION['two_factor_pending']);
}

/**
 * Count a failed code entry; locks the user out once the challenge budget is
 * spent and ends the challenge.
 *
 * @param array<string, mixed> $pending
 * @return array{attempts:int,attempts_remaining:int,locked_until:int,challenge_ended:bool}
 */
function twoFactorRegisterFailure(PDO $db, int $userId, array $pending, string $reason): array
{
    $attempts = (int)($pending['attempts'] ?? 0) + 1;
    $attemptsRemaining = max(0, TWO_FACTOR_MAX_ATTEMPTS - $attempts);
    $lockedUntil = 0;

    try {
        $stmt = $db->prepare('UPDATE user_two_factor SET failed_attempts = COALESCE(failed_attempts, 0) + 1 WHERE user_id = ?');
        $stmt->execute([$userId]);
        if ($attempts >= TWO_FACTOR_MAX_ATTEMPTS) {
            $lockedUntil = time() + TWO_FACTOR_LOCK_SECONDS;
            $lock = $db->prepare('UPDATE user_two_factor SET locked_until = ?, failed_attempts = 0 WHERE user_id = ?');
            $lock->execute([$lockedUntil, $userId]);
        }
    } catch (Throwable $e) {
        error_log('twoFactorRegisterFailure (' . $reason . ') failed: ' . $e->getMessage());
    }

    if ($attempts >= TWO_FACTOR_MAX_ATTEMPTS) {
        twoFactorClearPending();
    } else {
        if (session_status() === PHP_SESSION_NONE) {
            @session_start();
        }
        $pending['attempts'] = $attempts;
        $_SESSION['two_factor_pending'] = $pending;
    }

    return [
        'attempts' => $attempts,
        'attempts_remaining' => $attemptsRemaining,
        'locked_until' => $lockedUntil,
        'challenge_ended' => $attempts >= TWO_FACTOR_MAX_ATTEMPTS,
    ];
}

/** Clear per-user counters after a successful verification. */
function twoFactorClearFailureLock(PDO $db, int $userId): void
{
    try {
        $stmt = $db->prepare('UPDATE user_two_factor SET failed_attempts = 0, locked_until = NULL WHERE user_id = ?');
        $stmt->execute([$userId]);
    } catch (Throwable $e) {
        error_log('twoFactorClearFailureLock failed: ' . $e->getMessage());
    }
}

/**
 * Begin a challenge for an enrolled user, if 2FA applies to this sign-in.
 * Sends the JSON challenge response and exits when the second factor is needed.
 *
 * @param array<string, mixed> $user
 */
function twoFactorMaybeGate(array $user, bool $rememberMe, string $method): void
{
    $userId = (int)($user['id'] ?? 0);
    if ($userId <= 0 || !twoFactorIsAvailable()) {
        return;
    }

    $db = getDB();
    ensureTwoFactorSchema($db);

    if (twoFactorCheckTrustedDevice($db, $userId)) {
        if (function_exists('logUserAudit')) {
            logUserAudit('auth.two_factor_device_trusted', [
                'actor_id' => $userId,
                'actor_username' => (string)($user['username'] ?? ''),
                'target_user_id' => $userId,
                'target_username' => (string)($user['username'] ?? ''),
                'details' => ['method' => $method],
            ]);
        }
        return;
    }

    $row = twoFactorRow($db, $userId);
    if ($row === null || (int)$row['enabled'] !== 1) {
        return;
    }

    if (twoFactorDecryptSecret((string)($row['secret'] ?? '')) === '') {
        // Wrong/rotated encryption key (e.g. DB restored onto another host):
        // fail open so the user is never locked out, and force re-enrolment.
        twoFactorResetUser($db, $userId, 'secret_unreadable');
        if (function_exists('logUserAudit')) {
            logUserAudit('auth.two_factor_failed', [
                'actor_id' => $userId,
                'actor_username' => (string)($user['username'] ?? ''),
                'target_user_id' => $userId,
                'target_username' => (string)($user['username'] ?? ''),
                'details' => ['method' => $method, 'reason' => 'secret_unreadable'],
            ]);
        }
        return;
    }

    $challenge = twoFactorBeginChallenge($user, $rememberMe, $method);
    $lockedUntil = (int)($row['locked_until'] ?? 0);
    if ($lockedUntil <= time()) {
        $lockedUntil = 0;
    }

    if (function_exists('logUserAudit')) {
        logUserAudit('auth.two_factor_challenged', [
            'actor_id' => $userId,
            'actor_username' => (string)($user['username'] ?? ''),
            'target_user_id' => $userId,
            'target_username' => (string)($user['username'] ?? ''),
            'details' => ['method' => $method, 'locked' => $lockedUntil > 0],
        ]);
    }

    linknestReleaseSessionLock();

    sendJSON([
        'success' => false,
        'two_factor_required' => true,
        'challenge_id' => $challenge['challenge_id'],
        'methods' => ['totp', 'recovery'],
        'expires_in' => TWO_FACTOR_CHALLENGE_TTL,
        'attempts_remaining' => TWO_FACTOR_MAX_ATTEMPTS,
        'locked_until' => $lockedUntil,
    ]);
}

/**
 * Verify a submitted code against the pending challenge.
 *
 * @return array{ok:bool,reason:string,user_id:int,used_recovery:bool,pending:array<string,mixed>|null,attempts_remaining?:int,locked_until?:int}
 */
function twoFactorVerifyChallenge(PDO $db, string $challengeId, string $code): array
{
    $pending = twoFactorPendingChallenge();
    if ($pending === null) {
        return ['ok' => false, 'reason' => 'no_challenge', 'user_id' => 0, 'used_recovery' => false, 'pending' => null];
    }

    $userId = (int)($pending['user_id'] ?? 0);
    if ($challengeId === '' || !hash_equals((string)$pending['challenge_id'], $challengeId)) {
        return ['ok' => false, 'reason' => 'challenge_mismatch', 'user_id' => $userId, 'used_recovery' => false, 'pending' => $pending];
    }

    $row = twoFactorRow($db, $userId);
    if ($row === null || (int)$row['enabled'] !== 1) {
        twoFactorClearPending();
        return ['ok' => false, 'reason' => 'not_enrolled', 'user_id' => $userId, 'used_recovery' => false, 'pending' => null];
    }

    $lockedUntil = (int)($row['locked_until'] ?? 0);
    if ($lockedUntil > time()) {
        return [
            'ok' => false,
            'reason' => 'locked',
            'user_id' => $userId,
            'used_recovery' => false,
            'pending' => $pending,
            'locked_until' => $lockedUntil,
            'attempts_remaining' => 0,
        ];
    }

    $secret = twoFactorDecryptSecret((string)($row['secret'] ?? ''));
    if ($secret === '') {
        twoFactorResetUser($db, $userId, 'secret_unreadable');
        twoFactorClearPending();
        return ['ok' => false, 'reason' => 'secret_unreadable', 'user_id' => $userId, 'used_recovery' => false, 'pending' => null];
    }

    // Recovery codes contain letters; TOTP codes are 6 digits only.
    if (preg_match('/[A-Za-z]/', $code) === 1) {
        if (twoFactorConsumeRecoveryCode($db, $userId, $code)) {
            twoFactorClearFailureLock($db, $userId);
            twoFactorClearPending();
            return ['ok' => true, 'reason' => 'recovery_code', 'user_id' => $userId, 'used_recovery' => true, 'pending' => $pending];
        }
        return twoFactorChallengeFailure($db, $userId, $pending, 'invalid_recovery_code', true);
    }

    $clockResynced = false;
    $clockOffsetSteps = 0;
    $matchedCounter = twoFactorVerifyStoredCode($db, $userId, $row, $code, $clockResynced, $clockOffsetSteps);

    if ($matchedCounter === null) {
        // A valid code that sits outside the accepted window means the device
        // clock has drifted too far: report the measured offset instead of
        // burning an attempt on a code the user actually got right.
        $skewSeconds = twoFactorStoredCodeSkewSeconds($row, $code);
        if ($skewSeconds !== null) {
            return [
                'ok' => false,
                'reason' => 'clock_skew',
                'user_id' => $userId,
                'used_recovery' => false,
                'pending' => $pending,
                'clock_skew_seconds' => $skewSeconds,
                'attempts_remaining' => max(0, TWO_FACTOR_MAX_ATTEMPTS - (int)($pending['attempts'] ?? 0)),
            ];
        }
        return twoFactorChallengeFailure($db, $userId, $pending, 'invalid_code', false);
    }

    if ($matchedCounter !== null && (int)($row['last_counter'] ?? 0) >= $matchedCounter) {
        return twoFactorChallengeFailure($db, $userId, $pending, 'replay', false);
    }

    try {
        $stmt = $db->prepare('UPDATE user_two_factor
            SET last_counter = ?, last_used_at = ?, failed_attempts = 0, locked_until = NULL
            WHERE user_id = ?');
        $stmt->execute([$matchedCounter, time(), $userId]);
    } catch (Throwable $e) {
        error_log('twoFactorVerifyChallenge update failed: ' . $e->getMessage());
    }

    twoFactorClearPending();
    return [
        'ok' => true,
        'reason' => 'ok',
        'user_id' => $userId,
        'used_recovery' => false,
        'pending' => $pending,
        'clock_resynced' => $clockResynced,
        'clock_offset_seconds' => $clockOffsetSteps * TWO_FACTOR_CODE_PERIOD,
    ];
}

/**
 * Shared failure bookkeeping for twoFactorVerifyChallenge().
 *
 * @param array<string, mixed> $pending
 * @return array<string, mixed>
 */
function twoFactorChallengeFailure(PDO $db, int $userId, array $pending, string $reason, bool $usedRecovery): array
{
    $failure = twoFactorRegisterFailure($db, $userId, $pending, $reason);
    return array_merge([
        'ok' => false,
        'reason' => $reason,
        'user_id' => $userId,
        'used_recovery' => $usedRecovery,
        'pending' => $failure['challenge_ended'] ? null : $pending,
    ], $failure);
}

/**
 * Two-factor management is bound to a real, non-impersonated browser session
 * (no MCP / system bearer tokens) — same rules as passkey management.
 *
 * @return array<string, mixed>
 */
function twoFactorRequireBrowserSessionUser(): array
{
    $user = requireAuth();

    if (!empty($user['is_system']) || isset($user['_mcp_token_id'])) {
        sendJSON(['error' => 'Two-factor settings require an interactive browser session'], 403);
    }
    if (!empty($user['impersonating'])) {
        sendJSON(['error' => 'Two-factor settings cannot be changed while impersonating another user'], 403);
    }
    return $user;
}








