<?php
/**
 * WebAuthn / passkey endpoints.
 *
 * POST /register/options   (auth) — begin registration
 * POST /register/verify    (auth) — finish registration
 * GET  /credentials        (auth) — list own passkeys
 * PATCH /credentials/{id}  (auth) — rename
 * DELETE /credentials/{id} (auth) — revoke
 * POST /login/options      (public) — usernameless login challenge
 * POST /login/verify       (public) — verify assertion + session
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/webauthn_lib.php';
require_once __DIR__ . '/user_audit_helper.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '/';
$path = '/' . trim((string)$path, '/');
if ($path === '//') {
    $path = '/';
}

try {
    if ($method === 'POST' && ($path === '/register/options' || $path === 'register/options')) {
        handleWebauthnRegisterOptions();
    } elseif ($method === 'POST' && ($path === '/register/verify' || $path === 'register/verify')) {
        handleWebauthnRegisterVerify();
    } elseif ($method === 'GET' && ($path === '/credentials' || $path === 'credentials')) {
        handleWebauthnListCredentials();
    } elseif ($method === 'PATCH' && preg_match('#^/credentials/(\d+)$#', $path, $m)) {
        handleWebauthnRenameCredential((int)$m[1]);
    } elseif ($method === 'DELETE' && preg_match('#^/credentials/(\d+)$#', $path, $m)) {
        handleWebauthnDeleteCredential((int)$m[1]);
    } elseif ($method === 'POST' && ($path === '/login/options' || $path === 'login/options')) {
        handleWebauthnLoginOptions();
    } elseif ($method === 'POST' && ($path === '/login/verify' || $path === 'login/verify')) {
        handleWebauthnLoginVerify();
    } else {
        sendJSON(['error' => 'Invalid endpoint'], 404);
    }
} catch (Throwable $e) {
    error_log('WebAuthn error: ' . $e->getMessage() . ' | ' . $e->getTraceAsString());
    $msg = $e->getMessage();
    if (stripos($msg, 'library') !== false || stripos($msg, 'not installed') !== false) {
        sendJSON(['error' => $msg], 503);
    }
    sendJSON(['error' => 'Passkey operation failed: ' . $msg], 400);
}

function handleWebauthnRegisterOptions(): void
{
    webauthnRequirePasskeyEnabled();
    $user = requireAuth();
    if (!empty($user['is_system'])) {
        sendJSON(['error' => 'System token cannot register passkeys'], 403);
    }
    if (!webauthnLibraryAvailable()) {
        sendJSON(['error' => 'WebAuthn library is not installed on this server'], 503);
    }

    $db = getDB();
    ensureWebauthnCredentialsTable($db);
    $userId = (int)$user['id'];

    $stmt = $db->prepare('SELECT credential_id FROM webauthn_credentials WHERE user_id = ?');
    $stmt->execute([$userId]);
    $exclude = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $bin = webauthnDecodeBinary((string)$row['credential_id']);
        if ($bin !== '') {
            $exclude[] = $bin;
        }
    }

    $display = trim((string)($user['display_name'] ?? ''));
    if ($display === '') {
        $display = (string)$user['username'];
    }

    $server = webauthnCreateServer();
    $createArgs = $server->getCreateArgs(
        webauthnUserHandleFromId($userId),
        (string)$user['username'],
        $display,
        60,
        true,  // residentKey required (discoverable)
        true,  // userVerification required
        null,  // platform + cross-platform
        $exclude
    );

    $challenge = $server->getChallenge()->getBinaryString();
    webauthnRememberChallengeBinary($challenge);
    webauthnStoreChallenge('register', $userId);

    sendJSON([
        'publicKey' => $createArgs->publicKey,
    ]);
}

function handleWebauthnRegisterVerify(): void
{
    webauthnRequirePasskeyEnabled();
    $user = requireAuth();
    if (!empty($user['is_system'])) {
        sendJSON(['error' => 'System token cannot register passkeys'], 403);
    }
    if (!webauthnLibraryAvailable()) {
        sendJSON(['error' => 'WebAuthn library is not installed on this server'], 503);
    }

    $data = getJSONInput();
    if (!is_array($data)) {
        sendJSON(['error' => 'Invalid request body'], 400);
    }

    $clientDataJSON = webauthnDecodeBinary($data['clientDataJSON'] ?? null);
    $attestationObject = webauthnDecodeBinary($data['attestationObject'] ?? null);
    if ($clientDataJSON === '' || $attestationObject === '') {
        sendJSON(['error' => 'Missing attestation data'], 400);
    }

    $taken = webauthnTakeChallenge('register');
    if ($taken['user_id'] !== (int)$user['id']) {
        sendJSON(['error' => 'Passkey challenge does not match the signed-in user'], 400);
    }

    $server = webauthnCreateServer();
    $cred = $server->processCreate(
        $clientDataJSON,
        $attestationObject,
        $taken['challenge'],
        true,
        true,
        false
    );

    $credentialId = webauthnEncodeBase64Url((string)$cred->credentialId);
    $publicKey = (string)$cred->credentialPublicKey;
    $signCount = isset($cred->signatureCounter) && is_int($cred->signatureCounter) ? $cred->signatureCounter : 0;
    $aaguid = null;
    if (isset($cred->AAGUID) && is_string($cred->AAGUID) && $cred->AAGUID !== '') {
        $aaguid = bin2hex($cred->AAGUID);
    }

    $transports = null;
    if (isset($data['transports']) && is_array($data['transports'])) {
        $clean = [];
        foreach ($data['transports'] as $t) {
            if (is_string($t) && $t !== '') {
                $clean[] = $t;
            }
        }
        $transports = $clean ? json_encode(array_values(array_unique($clean))) : null;
    }

    $nickname = isset($data['nickname']) && is_string($data['nickname']) ? trim($data['nickname']) : '';
    if ($nickname === '') {
        $nickname = 'Passkey';
    }
    if (mb_strlen($nickname) > 64) {
        $nickname = mb_substr($nickname, 0, 64);
    }

    $db = getDB();
    ensureWebauthnCredentialsTable($db);
    $now = time();

    try {
        $stmt = $db->prepare(
            'INSERT INTO webauthn_credentials
             (user_id, credential_id, public_key, sign_count, transports, aaguid, nickname, created_at, last_used_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)'
        );
        $stmt->execute([
            (int)$user['id'],
            $credentialId,
            $publicKey,
            $signCount,
            $transports,
            $aaguid,
            $nickname,
            $now,
        ]);
    } catch (PDOException $e) {
        if (stripos($e->getMessage(), 'UNIQUE') !== false) {
            sendJSON(['error' => 'This passkey is already registered'], 409);
        }
        throw $e;
    }

    $newId = (int)$db->lastInsertId();
    logUserAudit('auth.passkey_register', [
        'actor_id' => (int)$user['id'],
        'actor_username' => (string)$user['username'],
        'target_user_id' => (int)$user['id'],
        'target_username' => (string)$user['username'],
        'details' => ['credential_db_id' => $newId, 'nickname' => $nickname],
    ]);

    sendJSON([
        'success' => true,
        'credential' => [
            'id' => $newId,
            'nickname' => $nickname,
            'transports' => $transports ? json_decode($transports, true) : null,
            'aaguid' => $aaguid,
            'created_at' => $now,
            'last_used_at' => null,
        ],
    ]);
}

function handleWebauthnListCredentials(): void
{
    $user = requireAuth();
    if (!empty($user['is_system'])) {
        sendJSON(['error' => 'System token cannot list passkeys'], 403);
    }
    $db = getDB();
    sendJSON(['credentials' => webauthnListCredentialsForUser($db, (int)$user['id'])]);
}

function handleWebauthnRenameCredential(int $credentialDbId): void
{
    $user = requireAuth();
    if (!empty($user['is_system'])) {
        sendJSON(['error' => 'System token cannot rename passkeys'], 403);
    }
    $data = getJSONInput();
    $nickname = isset($data['nickname']) && is_string($data['nickname']) ? trim($data['nickname']) : '';
    if ($nickname === '') {
        sendJSON(['error' => 'Nickname is required'], 400);
    }
    if (mb_strlen($nickname) > 64) {
        $nickname = mb_substr($nickname, 0, 64);
    }

    $db = getDB();
    ensureWebauthnCredentialsTable($db);
    $stmt = $db->prepare('UPDATE webauthn_credentials SET nickname = ? WHERE id = ? AND user_id = ?');
    $stmt->execute([$nickname, $credentialDbId, (int)$user['id']]);
    if ($stmt->rowCount() < 1) {
        sendJSON(['error' => 'Passkey not found'], 404);
    }
    sendJSON(['success' => true, 'nickname' => $nickname]);
}

function handleWebauthnDeleteCredential(int $credentialDbId): void
{
    $user = requireAuth();
    if (!empty($user['is_system'])) {
        sendJSON(['error' => 'System token cannot delete passkeys'], 403);
    }
    $db = getDB();
    ensureWebauthnCredentialsTable($db);
    $stmt = $db->prepare('DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?');
    $stmt->execute([$credentialDbId, (int)$user['id']]);
    if ($stmt->rowCount() < 1) {
        sendJSON(['error' => 'Passkey not found'], 404);
    }
    logUserAudit('auth.passkey_revoke', [
        'actor_id' => (int)$user['id'],
        'actor_username' => (string)$user['username'],
        'target_user_id' => (int)$user['id'],
        'target_username' => (string)$user['username'],
        'details' => ['credential_db_id' => $credentialDbId],
    ]);
    sendJSON(['success' => true]);
}

function handleWebauthnLoginOptions(): void
{
    webauthnRequirePasskeyEnabled();
    if (!webauthnLibraryAvailable()) {
        sendJSON(['error' => 'WebAuthn library is not installed on this server'], 503);
    }

    $server = webauthnCreateServer();
    // Empty allowCredentials → discoverable / usernameless passkey login
    $getArgs = $server->getGetArgs(
        [],
        60,
        true,
        true,
        true,
        true,
        true,
        true
    );

    $challenge = $server->getChallenge()->getBinaryString();
    webauthnRememberChallengeBinary($challenge);
    webauthnStoreChallenge('authenticate', null);

    sendJSON([
        'publicKey' => $getArgs->publicKey,
    ]);
}

function handleWebauthnLoginVerify(): void
{
    webauthnRequirePasskeyEnabled();
    if (!webauthnLibraryAvailable()) {
        sendJSON(['error' => 'WebAuthn library is not installed on this server'], 503);
    }

    $data = getJSONInput();
    if (!is_array($data)) {
        sendJSON(['error' => 'Invalid request body'], 400);
    }

    $credentialIdBin = webauthnDecodeBinary($data['id'] ?? ($data['rawId'] ?? null));
    $clientDataJSON = webauthnDecodeBinary($data['clientDataJSON'] ?? null);
    $authenticatorData = webauthnDecodeBinary($data['authenticatorData'] ?? null);
    $signature = webauthnDecodeBinary($data['signature'] ?? null);
    $userHandleBin = webauthnDecodeBinary($data['userHandle'] ?? null);

    if ($credentialIdBin === '' || $clientDataJSON === '' || $authenticatorData === '' || $signature === '') {
        sendJSON(['error' => 'Missing assertion data'], 400);
    }

    $taken = webauthnTakeChallenge('authenticate');
    $credentialIdB64 = webauthnEncodeBase64Url($credentialIdBin);

    $db = getDB();
    ensureWebauthnCredentialsTable($db);
    $stmt = $db->prepare(
        'SELECT c.*, u.id AS uid, u.username, u.email, u.is_admin, u.is_approved, u.is_disabled,
                u.auth_source, u.display_name, u.notes
         FROM webauthn_credentials c
         INNER JOIN users u ON u.id = c.user_id
         WHERE c.credential_id = ?'
    );
    $stmt->execute([$credentialIdB64]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        logUserAudit('auth.login_failed', [
            'actor_id' => null,
            'actor_username' => null,
            'details' => ['method' => 'passkey', 'reason' => 'unknown_credential'],
        ]);
        sendJSON(['error' => 'Passkey not recognized'], 401);
    }

    if ($userHandleBin !== '') {
        $handleUserId = webauthnUserIdFromHandle($userHandleBin);
        if ($handleUserId !== null && $handleUserId !== (int)$row['user_id']) {
            sendJSON(['error' => 'Passkey user mismatch'], 401);
        }
    }

    $server = webauthnCreateServer();
    try {
        $server->processGet(
            $clientDataJSON,
            $authenticatorData,
            $signature,
            (string)$row['public_key'],
            $taken['challenge'],
            (int)$row['sign_count'],
            true,
            true
        );
    } catch (Throwable $e) {
        logUserAudit('auth.login_failed', [
            'actor_id' => (int)$row['user_id'],
            'actor_username' => (string)$row['username'],
            'target_user_id' => (int)$row['user_id'],
            'target_username' => (string)$row['username'],
            'details' => ['method' => 'passkey', 'reason' => 'verify_failed', 'message' => $e->getMessage()],
        ]);
        sendJSON(['error' => 'Passkey verification failed'], 401);
    }

    $newCounter = $server->getSignatureCounter();
    $now = time();
    if ($newCounter !== null) {
        $upd = $db->prepare('UPDATE webauthn_credentials SET sign_count = ?, last_used_at = ? WHERE id = ?');
        $upd->execute([(int)$newCounter, $now, (int)$row['id']]);
    } else {
        $upd = $db->prepare('UPDATE webauthn_credentials SET last_used_at = ? WHERE id = ?');
        $upd->execute([$now, (int)$row['id']]);
    }

    $rememberMe = !empty($data['remember_me']);
    $userPayload = [
        'id' => (int)$row['uid'],
        'username' => (string)$row['username'],
        'email' => (string)$row['email'],
        'is_admin' => !empty($row['is_admin']),
        'is_approved' => !empty($row['is_approved']),
        'is_disabled' => !empty($row['is_disabled']),
        'auth_source' => $row['auth_source'] ?? 'local',
        'display_name' => $row['display_name'] ?? null,
        'notes' => $row['notes'] ?? null,
    ];

    $sessionUser = webauthnEstablishSession($userPayload, $rememberMe);
    sendJSON([
        'success' => true,
        'user' => $sessionUser,
    ]);
}
