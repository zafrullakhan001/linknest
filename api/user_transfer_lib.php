<?php
/**
 * Portable user export/import (JSON / CSV) for Admin → All Users.
 * Existing username or email is always skipped; never updates an existing account.
 */

require_once __DIR__ . '/user_notes_helper.php';

const LINKNEST_USER_TRANSFER_KIND = 'linknest-users';
const LINKNEST_USER_TRANSFER_VERSION = 1;
const LINKNEST_USER_TRANSFER_MAX_BYTES = 2097152; // 2 MB
const LINKNEST_USER_TRANSFER_MAX_ROWS = 5000;

/**
 * Password strength check (mirrors auth.php validatePasswordStrength;
 * auth.php cannot be required here because it runs the request router).
 */
function userTransferValidatePasswordStrength(string $password): ?string
{
    if (strlen($password) < 8) {
        return 'Password must be at least 8 characters';
    }
    if (!preg_match('/[A-Z]/', $password)) {
        return 'Password must contain at least one uppercase letter';
    }
    if (!preg_match('/[0-9]/', $password)) {
        return 'Password must contain at least one number';
    }
    if (!preg_match('/[!@#$%^&*()_+\-=[\]{};\':"\\\\|,.<>\/?`~]/', $password)) {
        return 'Password must contain at least one special character (!@#$%^&* etc.)';
    }
    return null;
}

function userTransferIsRecognizedPasswordHash(string $hash): bool
{
    if ($hash === '') {
        return false;
    }
    if (preg_match('/^\$2[ayb]\$\d{2}\$.{53}$/', $hash) === 1) {
        return true;
    }
    if (str_starts_with($hash, '$argon2i$') || str_starts_with($hash, '$argon2id$')) {
        return true;
    }
    return false;
}

function userTransferNormalizeAuthSource(?string $source): string
{
    $s = strtolower(trim((string) $source));
    if ($s === 'ldap' || $s === 'saml' || $s === 'local') {
        return $s;
    }
    return 'local';
}

function userTransferBoolFromValue($value, bool $default = false): bool
{
    if ($value === null || $value === '') {
        return $default;
    }
    if (is_bool($value)) {
        return $value;
    }
    if (is_int($value) || is_float($value)) {
        return ((int) $value) !== 0;
    }
    $s = strtolower(trim((string) $value));
    if (in_array($s, ['1', 'true', 'yes', 'y', 'on'], true)) {
        return true;
    }
    if (in_array($s, ['0', 'false', 'no', 'n', 'off'], true)) {
        return false;
    }
    return $default;
}

function userTransferValidateEmail(string $email): bool
{
    $emailLower = strtolower($email);
    if (strpos($emailLower, '@localhost') !== false) {
        return $email !== '';
    }
    return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

/**
 * @return list<string>
 */
function userTransferParseRoleNames(?string $roles): array
{
    if ($roles === null || trim($roles) === '') {
        return [];
    }
    $parts = preg_split('/[;|]/', $roles) ?: [];
    $out = [];
    $seen = [];
    foreach ($parts as $part) {
        $name = trim((string) $part);
        if ($name === '') {
            continue;
        }
        $key = strtolower($name);
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $out[] = $name;
    }
    return $out;
}

/**
 * @param list<int|string> $userIds
 * @return list<array<string, mixed>>
 */
function userTransferBuildExportRows(PDO $db, array $userIds, bool $includePasswordHashes): array
{
    $ids = [];
    foreach ($userIds as $id) {
        $n = (int) $id;
        if ($n > 0) {
            $ids[$n] = $n;
        }
    }
    $ids = array_values($ids);
    if (empty($ids)) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $sql = 'SELECT id, username, email, display_name, auth_source, is_approved, is_admin, is_disabled, notes, saml_nameid, password_hash
            FROM users WHERE id IN (' . $placeholders . ')';
    $stmt = $db->prepare($sql);
    $stmt->execute($ids);
    $byId = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $byId[(int) $row['id']] = $row;
    }

    $roleStmt = $db->prepare(
        'SELECT r.name FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = ?
         ORDER BY r.name COLLATE NOCASE'
    );

    $rows = [];
    foreach ($ids as $id) {
        if (!isset($byId[$id])) {
            continue;
        }
        $u = $byId[$id];
        $authSource = userTransferNormalizeAuthSource($u['auth_source'] ?? 'local');

        $roleStmt->execute([$id]);
        $roleNames = [];
        while ($r = $roleStmt->fetch(PDO::FETCH_ASSOC)) {
            $roleNames[] = (string) $r['name'];
        }

        $export = [
            'username' => (string) $u['username'],
            'email' => (string) $u['email'],
            'display_name' => isset($u['display_name']) && $u['display_name'] !== '' ? (string) $u['display_name'] : '',
            'auth_source' => $authSource,
            'is_approved' => !empty($u['is_approved']),
            'is_admin' => !empty($u['is_admin']),
            'is_disabled' => !empty($u['is_disabled']),
            'notes' => isset($u['notes']) && $u['notes'] !== '' ? (string) $u['notes'] : '',
            'roles' => implode(';', $roleNames),
        ];

        if ($authSource === 'saml') {
            $export['saml_nameid'] = isset($u['saml_nameid']) && $u['saml_nameid'] !== ''
                ? (string) $u['saml_nameid']
                : '';
        }

        if ($includePasswordHashes && $authSource === 'local') {
            $hash = (string) ($u['password_hash'] ?? '');
            if (userTransferIsRecognizedPasswordHash($hash)) {
                $export['password_hash'] = $hash;
            }
        }

        $rows[] = $export;
    }

    return $rows;
}

/**
 * @param list<array<string, mixed>> $rows
 */
function userTransferBuildJsonDocument(array $rows, bool $includePasswordHashes): string
{
    $doc = [
        'kind' => LINKNEST_USER_TRANSFER_KIND,
        'version' => LINKNEST_USER_TRANSFER_VERSION,
        'exportedAt' => gmdate('c'),
        'includesPasswordHashes' => $includePasswordHashes,
        'users' => $rows,
    ];
    $json = json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false) {
        throw new RuntimeException('Failed to encode user export JSON');
    }
    return $json . "\n";
}

/**
 * @param list<array<string, mixed>> $rows
 */
function userTransferBuildCsvDocument(array $rows, bool $includePasswordHashes): string
{
    $headers = [
        'username',
        'email',
        'display_name',
        'auth_source',
        'is_approved',
        'is_admin',
        'is_disabled',
        'notes',
        'roles',
        'saml_nameid',
    ];
    if ($includePasswordHashes) {
        $headers[] = 'password_hash';
    }

    $fh = fopen('php://temp', 'r+');
    if ($fh === false) {
        throw new RuntimeException('Failed to open CSV buffer');
    }
    fputcsv($fh, $headers);
    foreach ($rows as $row) {
        $line = [];
        foreach ($headers as $h) {
            if ($h === 'is_approved' || $h === 'is_admin' || $h === 'is_disabled') {
                $line[] = !empty($row[$h]) ? '1' : '0';
            } else {
                $line[] = isset($row[$h]) ? (string) $row[$h] : '';
            }
        }
        fputcsv($fh, $line);
    }
    rewind($fh);
    $csv = stream_get_contents($fh);
    fclose($fh);
    if ($csv === false) {
        throw new RuntimeException('Failed to build CSV');
    }
    // UTF-8 BOM for Excel on Windows
    return "\xEF\xBB\xBF" . $csv;
}

/**
 * @return list<array<string, mixed>>
 */
function userTransferParseJsonUsers(string $text): array
{
    $data = json_decode($text, true);
    if (!is_array($data)) {
        throw new InvalidArgumentException('Invalid JSON file');
    }
    if (isset($data['users']) && is_array($data['users'])) {
        if (isset($data['kind']) && $data['kind'] !== LINKNEST_USER_TRANSFER_KIND) {
            throw new InvalidArgumentException('Unrecognized user export kind');
        }
        return array_values($data['users']);
    }
    // Bare array of user objects
    if (array_is_list($data) && !empty($data) && is_array($data[0] ?? null)) {
        return $data;
    }
    throw new InvalidArgumentException('JSON must contain a "users" array');
}

/**
 * @return list<array<string, mixed>>
 */
function userTransferParseCsvUsers(string $text): array
{
    // Strip UTF-8 BOM
    if (str_starts_with($text, "\xEF\xBB\xBF")) {
        $text = substr($text, 3);
    }
    $fh = fopen('php://temp', 'r+');
    if ($fh === false) {
        throw new RuntimeException('Failed to open CSV buffer');
    }
    fwrite($fh, $text);
    rewind($fh);

    $header = fgetcsv($fh);
    if ($header === false || empty(array_filter($header, static fn($c) => trim((string) $c) !== ''))) {
        fclose($fh);
        throw new InvalidArgumentException('CSV is missing a header row');
    }

    $map = [];
    foreach ($header as $i => $col) {
        $key = strtolower(trim((string) $col));
        $key = str_replace([' ', '-'], '_', $key);
        if ($key === 'displayname') {
            $key = 'display_name';
        }
        if ($key === 'authsource') {
            $key = 'auth_source';
        }
        if ($key === 'samlnameid' || $key === 'nameid') {
            $key = 'saml_nameid';
        }
        if ($key === 'passwordhash') {
            $key = 'password_hash';
        }
        if ($key !== '') {
            $map[$i] = $key;
        }
    }
    if (!in_array('username', $map, true) || !in_array('email', $map, true)) {
        fclose($fh);
        throw new InvalidArgumentException('CSV header must include username and email');
    }

    $users = [];
    while (($row = fgetcsv($fh)) !== false) {
        if (!is_array($row) || empty(array_filter($row, static fn($c) => trim((string) $c) !== ''))) {
            continue;
        }
        $user = [];
        foreach ($map as $i => $key) {
            $user[$key] = isset($row[$i]) ? trim((string) $row[$i]) : '';
        }
        $users[] = $user;
    }
    fclose($fh);
    return $users;
}

/**
 * @param list<array<string, mixed>> $rawUsers
 * @return array{success: list<array>, skipped: list<array>, errors: list<array>, summary: array}
 */
function userTransferImportUsers(PDO $db, array $rawUsers): array
{
    if (count($rawUsers) > LINKNEST_USER_TRANSFER_MAX_ROWS) {
        throw new InvalidArgumentException('Too many rows (max ' . LINKNEST_USER_TRANSFER_MAX_ROWS . ')');
    }

    $results = [
        'success' => [],
        'skipped' => [],
        'errors' => [],
    ];

    // role name (lowercase) => id
    $roleByName = [];
    try {
        $roleStmt = $db->query('SELECT id, name FROM roles');
        if ($roleStmt) {
            while ($r = $roleStmt->fetch(PDO::FETCH_ASSOC)) {
                $roleByName[strtolower((string) $r['name'])] = (int) $r['id'];
            }
        }
    } catch (Throwable $e) {
        // roles table may be missing on very old DBs; continue without role assign
    }

    $seenUsernames = [];
    $seenEmails = [];
    $seenSaml = [];

    $insertLocal = $db->prepare(
        'INSERT INTO users (username, email, password_hash, is_admin, is_approved, is_disabled, auth_source, uuid, display_name, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $insertLdap = $db->prepare(
        'INSERT INTO users (username, email, password_hash, is_admin, is_approved, is_disabled, auth_source, uuid, display_name, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $insertSaml = $db->prepare(
        'INSERT INTO users (username, email, password_hash, is_admin, is_approved, is_disabled, auth_source, saml_nameid, uuid, display_name, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $roleInsert = $db->prepare('INSERT INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, ?)');

    $checkUsername = $db->prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)');
    $checkEmail = $db->prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)');
    $checkSaml = $db->prepare('SELECT id FROM users WHERE saml_nameid = ?');

    foreach ($rawUsers as $index => $raw) {
        if (!is_array($raw)) {
            $results['errors'][] = [
                'index' => $index + 1,
                'username' => 'N/A',
                'reason' => 'Invalid row',
            ];
            continue;
        }

        $username = trim((string) ($raw['username'] ?? ''));
        $email = trim((string) ($raw['email'] ?? ''));
        $displayName = trim((string) ($raw['display_name'] ?? $raw['displayName'] ?? ''));
        $authSource = userTransferNormalizeAuthSource($raw['auth_source'] ?? $raw['authSource'] ?? 'local');
        $isApproved = userTransferBoolFromValue($raw['is_approved'] ?? $raw['isApproved'] ?? null, false);
        $isAdmin = userTransferBoolFromValue($raw['is_admin'] ?? $raw['isAdmin'] ?? null, false);
        $isDisabled = userTransferBoolFromValue($raw['is_disabled'] ?? $raw['isDisabled'] ?? null, false);
        $notes = sanitizeUserNotes($raw['notes'] ?? null);
        $samlNameId = trim((string) ($raw['saml_nameid'] ?? $raw['samlNameId'] ?? ''));
        $password = (string) ($raw['password'] ?? '');
        $passwordHash = trim((string) ($raw['password_hash'] ?? $raw['passwordHash'] ?? ''));
        $roleNames = [];
        if (isset($raw['roles'])) {
            if (is_array($raw['roles'])) {
                foreach ($raw['roles'] as $rn) {
                    $n = trim((string) $rn);
                    if ($n !== '') {
                        $roleNames[] = $n;
                    }
                }
            } else {
                $roleNames = userTransferParseRoleNames((string) $raw['roles']);
            }
        }

        $lineLabel = $index + 1;

        if ($username === '' || $email === '') {
            $results['errors'][] = [
                'index' => $lineLabel,
                'username' => $username !== '' ? $username : 'N/A',
                'reason' => 'Username and email are required',
            ];
            continue;
        }
        if (strlen($username) < 3) {
            $results['errors'][] = [
                'index' => $lineLabel,
                'username' => $username,
                'reason' => 'Username must be at least 3 characters',
            ];
            continue;
        }
        if (!userTransferValidateEmail($email)) {
            $results['errors'][] = [
                'index' => $lineLabel,
                'username' => $username,
                'reason' => 'Invalid email address',
            ];
            continue;
        }

        $unameKey = strtolower($username);
        $emailKey = strtolower($email);

        if (isset($seenUsernames[$unameKey])) {
            $results['skipped'][] = [
                'index' => $lineLabel,
                'username' => $username,
                'reason' => 'Username already exists in this file',
            ];
            continue;
        }
        if (isset($seenEmails[$emailKey])) {
            $results['skipped'][] = [
                'index' => $lineLabel,
                'username' => $username,
                'reason' => 'Email already exists in this file',
            ];
            continue;
        }

        $checkUsername->execute([$username]);
        if ($checkUsername->fetch()) {
            $results['skipped'][] = [
                'index' => $lineLabel,
                'username' => $username,
                'reason' => 'Username already exists',
            ];
            continue;
        }
        $checkEmail->execute([$email]);
        if ($checkEmail->fetch()) {
            $results['skipped'][] = [
                'index' => $lineLabel,
                'username' => $username,
                'reason' => 'Email already exists',
            ];
            continue;
        }

        if ($authSource === 'saml') {
            if ($samlNameId === '') {
                $results['errors'][] = [
                    'index' => $lineLabel,
                    'username' => $username,
                    'reason' => 'SAML NameID is required for saml users',
                ];
                continue;
            }
            if (isset($seenSaml[$samlNameId])) {
                $results['skipped'][] = [
                    'index' => $lineLabel,
                    'username' => $username,
                    'reason' => 'SAML NameID already exists in this file',
                ];
                continue;
            }
            $checkSaml->execute([$samlNameId]);
            if ($checkSaml->fetch()) {
                $results['skipped'][] = [
                    'index' => $lineLabel,
                    'username' => $username,
                    'reason' => 'SAML NameID already exists',
                ];
                continue;
            }
        }

        $finalHash = null;
        if ($authSource === 'local') {
            if ($password !== '') {
                $err = userTransferValidatePasswordStrength($password);
                if ($err !== null) {
                    $results['errors'][] = [
                        'index' => $lineLabel,
                        'username' => $username,
                        'reason' => $err,
                    ];
                    continue;
                }
                $finalHash = password_hash($password, PASSWORD_DEFAULT);
            } elseif (userTransferIsRecognizedPasswordHash($passwordHash)) {
                $finalHash = $passwordHash;
            } else {
                $results['errors'][] = [
                    'index' => $lineLabel,
                    'username' => $username,
                    'reason' => 'Local users need a password or a recognized password_hash',
                ];
                continue;
            }
        } else {
            // LDAP / SAML: store a random unusable local hash
            $finalHash = password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT);
        }

        $uuid = function_exists('generateUuid') ? generateUuid() : bin2hex(random_bytes(16));
        $now = time();
        $displayValue = $displayName !== '' ? $displayName : null;

        try {
            $db->beginTransaction();

            if ($authSource === 'saml') {
                $ok = $insertSaml->execute([
                    $username,
                    $email,
                    $finalHash,
                    $isAdmin ? 1 : 0,
                    $isApproved ? 1 : 0,
                    $isDisabled ? 1 : 0,
                    'saml',
                    $samlNameId,
                    $uuid,
                    $displayValue,
                    $notes,
                    $now,
                ]);
            } elseif ($authSource === 'ldap') {
                $ok = $insertLdap->execute([
                    $username,
                    $email,
                    $finalHash,
                    $isAdmin ? 1 : 0,
                    $isApproved ? 1 : 0,
                    $isDisabled ? 1 : 0,
                    'ldap',
                    $uuid,
                    $displayValue,
                    $notes,
                    $now,
                ]);
            } else {
                $ok = $insertLocal->execute([
                    $username,
                    $email,
                    $finalHash,
                    $isAdmin ? 1 : 0,
                    $isApproved ? 1 : 0,
                    $isDisabled ? 1 : 0,
                    'local',
                    $uuid,
                    $displayValue,
                    $notes,
                    $now,
                ]);
            }

            if (!$ok) {
                $db->rollBack();
                $results['errors'][] = [
                    'index' => $lineLabel,
                    'username' => $username,
                    'reason' => 'Database error',
                ];
                continue;
            }

            $userId = (int) $db->lastInsertId();
            $unknownRoles = [];
            foreach ($roleNames as $roleName) {
                $rk = strtolower($roleName);
                if (!isset($roleByName[$rk])) {
                    $unknownRoles[] = $roleName;
                    continue;
                }
                $roleInsert->execute([$userId, $roleByName[$rk], $now]);
            }

            $db->commit();

            $seenUsernames[$unameKey] = true;
            $seenEmails[$emailKey] = true;
            if ($authSource === 'saml') {
                $seenSaml[$samlNameId] = true;
            }

            $entry = [
                'index' => $lineLabel,
                'id' => $userId,
                'username' => $username,
                'email' => $email,
                'auth_source' => $authSource,
            ];
            if (!empty($unknownRoles)) {
                $entry['unknown_roles'] = $unknownRoles;
            }
            $results['success'][] = $entry;
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            $results['errors'][] = [
                'index' => $lineLabel,
                'username' => $username,
                'reason' => 'Database error',
            ];
        }
    }

    $total = count($results['success']) + count($results['skipped']) + count($results['errors']);
    return [
        'success' => $results['success'],
        'skipped' => $results['skipped'],
        'errors' => $results['errors'],
        'summary' => [
            'total' => $total,
            'created' => count($results['success']),
            'skipped' => count($results['skipped']),
            'errors' => count($results['errors']),
        ],
    ];
}
