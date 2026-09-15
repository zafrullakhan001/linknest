<?php
/**
 * Site-wide fingerprint lock: when enabled, only allowlisted browser
 * fingerprint hashes may use the app (guests and signed-in non-admins).
 * Administrators always bypass so they can recover / manage the allowlist.
 */

require_once __DIR__ . '/access_restrictions_lib.php';

/**
 * Read fingerprint hash from header, cookie, query, or JSON body.
 */
function fingerprint_hash_from_request(?array $jsonBody = null): ?string {
    $list = fingerprint_hashes_from_request($jsonBody);
    return $list[0] ?? null;
}

/**
 * @return string[] hex hashes (64 chars, no lnfp_ prefix)
 */
function fingerprint_lock_allowlist(PDO $db): array {
    $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'fingerprint_lock_hashes'");
    $stmt->execute();
    $raw = $stmt->fetchColumn();
    $list = [];
    if (is_string($raw) && trim($raw) !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $list = normalize_fingerprint_hash_list($decoded);
        } else {
            $list = normalize_fingerprint_hash_list($raw);
        }
    }
    $hex = [];
    foreach ($list as $stored) {
        $h = normalize_fingerprint_hash((string) $stored);
        if ($h !== null && !in_array($h, $hex, true)) {
            $hex[] = $h;
        }
    }
    return $hex;
}

function fingerprint_lock_enabled(PDO $db): bool {
    $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'fingerprint_lock_enabled'");
    $stmt->execute();
    $val = $stmt->fetchColumn();
    return ($val === '1' || $val === 1 || $val === true);
}

/**
 * Whether the site-wide fingerprint lock is active (enabled + at least one hash).
 */
function fingerprint_lock_is_active(PDO $db): bool {
    if (!fingerprint_lock_enabled($db)) {
        return false;
    }
    return fingerprint_lock_allowlist($db) !== [];
}

/**
 * @param string|string[]|null $incomingHashHex one hash or a list of candidate hashes
 * @return array{allowed: bool, message?: string, reason?: string, active?: bool}
 */
function fingerprint_lock_evaluate(?array $user, $incomingHashHex, PDO $db): array {
    if (!fingerprint_lock_enabled($db)) {
        return ['allowed' => true, 'active' => false];
    }
    $allowlist = fingerprint_lock_allowlist($db);
    if ($allowlist === []) {
        // Enabled but empty allowlist: fail closed for non-admins
        if ($user && !empty($user['is_admin'])) {
            return ['allowed' => true, 'active' => true, 'reason' => 'admin_bypass'];
        }
        return [
            'allowed' => false,
            'active' => true,
            'message' => 'This site is locked to allowed browser fingerprints, but no hashes are configured yet. Administrators can sign in with their credentials to add hashes.',
            'reason' => 'fingerprint_lock_empty',
        ];
    }
    if ($user && !empty($user['is_admin'])) {
        return ['allowed' => true, 'active' => true, 'reason' => 'admin_bypass'];
    }
    $incomingList = [];
    $rawList = is_array($incomingHashHex) ? $incomingHashHex : [$incomingHashHex];
    foreach ($rawList as $raw) {
        if ($raw === null || $raw === '') {
            continue;
        }
        $hex = normalize_fingerprint_hash(is_scalar($raw) ? (string) $raw : '');
        if ($hex !== null && !in_array($hex, $incomingList, true)) {
            $incomingList[] = $hex;
        }
    }
    if ($incomingList === []) {
        return [
            'allowed' => false,
            'active' => true,
            'message' => 'This site only allows registered browser fingerprints. Administrators can still sign in with their username and password. Others: open Help & About → Fingerprint on an allowed device, or ask an admin to add your hash.',
            'reason' => 'fingerprint_missing',
        ];
    }
    foreach ($incomingList as $incoming) {
        if (in_array($incoming, $allowlist, true)) {
            return ['allowed' => true, 'active' => true];
        }
    }
    return [
        'allowed' => false,
        'active' => true,
        'message' => 'This site is locked to specific browser fingerprints (hash may have changed). Guests and non-admin users without an allowed hash cannot access spaces. Administrators can always sign in with their credentials.',
        'reason' => 'fingerprint',
    ];
}

/**
 * Enforce site fingerprint lock; sends JSON 403 and exits when denied.
 */
function require_fingerprint_lock_access(?array $user = null, ?array $jsonBody = null): void {
    $db = getDB();
    if (!fingerprint_lock_enabled($db)) {
        return;
    }
    if ($user === null && function_exists('getAuthenticatedUser')) {
        $user = getAuthenticatedUser();
    }
    $incoming = fingerprint_hashes_from_request($jsonBody);
    $result = fingerprint_lock_evaluate($user, $incoming, $db);
    if (!empty($result['allowed'])) {
        return;
    }
    sendJSON([
        'error' => $result['message'] ?? 'Fingerprint lock denied',
        'reason' => $result['reason'] ?? 'fingerprint',
        'fingerprintLock' => true,
    ], 403);
}
