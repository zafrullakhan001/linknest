<?php
/**
 * Browser fingerprint probe + registry.
 *
 * GET  /api/fingerprint/probe
 * GET  /api/fingerprint/lookup?hash=
 * POST /api/fingerprint/register  { hash, tag }
 */

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REDIRECT_PATH_INFO'] ?? '/';
$path = '/' . trim((string) $path, '/');
if ($path === '/') {
    $path = '/probe';
}

if ($method === 'GET' && ($path === '/probe' || $path === 'probe')) {
    handleFingerprintProbe();
} elseif ($method === 'GET' && ($path === '/lookup' || $path === 'lookup')) {
    handleFingerprintLookup();
} elseif ($method === 'POST' && ($path === '/register' || $path === 'register')) {
    handleFingerprintRegister();
} else {
    sendJSON(['error' => 'Invalid endpoint'], 404);
}

function fingerprint_normalize_stored_hash($value): ?string {
    if (!is_string($value) && !is_numeric($value)) {
        return null;
    }
    $v = strtolower(trim((string) $value));
    if (str_starts_with($v, 'lnfp_')) {
        $v = substr($v, 5);
    }
    $v = preg_replace('/[^a-f0-9]/', '', $v) ?? '';
    return strlen($v) === 64 ? $v : null;
}

function fingerprint_registry_lookup(PDO $db, string $hash): array {
    $stmt = $db->prepare(
        'SELECT tag, username, created_at, updated_at
         FROM fingerprint_registry
         WHERE hash = ?
         ORDER BY updated_at DESC, id DESC'
    );
    $stmt->execute([$hash]);
    $matches = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $tag = trim((string) ($row['tag'] ?? ''));
        if ($tag === '') {
            continue;
        }
        $matches[] = [
            'tag' => $tag,
            'username' => isset($row['username']) && $row['username'] !== '' ? (string) $row['username'] : null,
            'createdAt' => $row['created_at'] ?? null,
            'updatedAt' => $row['updated_at'] ?? null,
        ];
    }
    $count = count($matches);
    $totalRows = (int) $db->query('SELECT COUNT(*) FROM fingerprint_registry')->fetchColumn();
    $inDataset = $count > 0;
    $total = $inDataset ? $totalRows : ($totalRows + 1);
    if ($total < 1) {
        $total = 1;
    }
    $percent = $total > 0 ? round(($count > 0 ? $count : 1) / $total * 100, 2) : 0;
    return [
        'hash' => $hash,
        'unique' => $count <= 1,
        'count' => $count,
        'total' => $total,
        'percent' => $percent,
        'matches' => $matches,
    ];
}

function handleFingerprintLookup(): void {
    $hash = fingerprint_normalize_stored_hash((string) ($_GET['hash'] ?? ''));
    if ($hash === null) {
        sendJSON(['error' => 'A valid fingerprint hash is required'], 400);
    }
    $db = getDB();
    if (function_exists('ensureFingerprintRegistryTable')) {
        ensureFingerprintRegistryTable($db);
    }
    sendJSON(fingerprint_registry_lookup($db, $hash));
}

function handleFingerprintRegister(): void {
    $data = getJSONInput();
    $hash = fingerprint_normalize_stored_hash((string) ($data['hash'] ?? ''));
    $tag = trim((string) ($data['tag'] ?? $data['tabName'] ?? $data['tagName'] ?? ''));
    $tag = preg_replace('/\s+/', ' ', $tag) ?? '';
    if (function_exists('mb_substr')) {
        $tag = mb_substr($tag, 0, 80);
    } else {
        $tag = substr($tag, 0, 80);
    }
    if ($hash === null) {
        sendJSON(['error' => 'A valid fingerprint hash is required'], 400);
    }
    if ($tag === '') {
        sendJSON(['error' => 'Enter a tag name for this fingerprint (for example Office PC).'], 400);
    }

    $user = function_exists('getAuthenticatedUser') ? getAuthenticatedUser() : null;
    $userId = $user && isset($user['id']) ? (int) $user['id'] : null;
    $username = $user && !empty($user['username']) ? (string) $user['username'] : null;
    $now = gmdate('c');

    $db = getDB();
    if (function_exists('ensureFingerprintRegistryTable')) {
        ensureFingerprintRegistryTable($db);
    }

    $existing = $db->prepare('SELECT id FROM fingerprint_registry WHERE hash = ? AND tag = ? COLLATE NOCASE');
    $existing->execute([$hash, $tag]);
    $row = $existing->fetch(PDO::FETCH_ASSOC);
    if ($row) {
        $upd = $db->prepare('UPDATE fingerprint_registry SET updated_at = ?, user_id = COALESCE(?, user_id), username = COALESCE(?, username) WHERE id = ?');
        $upd->execute([$now, $userId, $username, (int) $row['id']]);
    } else {
        $ins = $db->prepare('INSERT INTO fingerprint_registry (hash, tag, user_id, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
        $ins->execute([$hash, $tag, $userId, $username, $now, $now]);
    }

    $lookup = fingerprint_registry_lookup($db, $hash);
    $lookup['saved'] = true;
    $lookup['savedTag'] = $tag;
    sendJSON($lookup);
}

function fingerprint_client_hostname(string $ip): string {
    $candidates = [];
    $remoteHost = strtolower(trim((string) ($_SERVER['REMOTE_HOST'] ?? '')));
    if ($remoteHost !== '' && $remoteHost !== 'unknown') {
        $candidates[] = $remoteHost;
    }
    $ip = trim($ip);
    if ($ip !== '') {
        $rdns = @gethostbyaddr($ip);
        if (is_string($rdns) && $rdns !== '' && strcasecmp($rdns, $ip) !== 0) {
            $candidates[] = strtolower($rdns);
        }
    }
    $isLoopback = $ip === '127.0.0.1' || $ip === '::1' || strcasecmp($ip, 'localhost') === 0;
    if ($isLoopback) {
        $node = '';
        if (function_exists('gethostname')) {
            $node = (string) @gethostname();
        }
        if ($node === '' && function_exists('php_uname')) {
            $node = (string) @php_uname('n');
        }
        $node = strtolower(trim($node));
        if ($node !== '') {
            $candidates[] = $node;
        }
    }
    $seen = [];
    foreach ($candidates as $name) {
        $name = trim($name, '.');
        if ($name === '' || isset($seen[$name])) {
            continue;
        }
        if (filter_var($name, FILTER_VALIDATE_IP)) {
            continue;
        }
        $seen[$name] = true;
        return $name;
    }
    return '';
}

function handleFingerprintProbe(): void {
    $headers = [
        'userAgent' => (string) ($_SERVER['HTTP_USER_AGENT'] ?? ''),
        'accept' => (string) ($_SERVER['HTTP_ACCEPT'] ?? ''),
        'contentEncoding' => (string) ($_SERVER['HTTP_ACCEPT_ENCODING'] ?? ''),
        'contentLanguage' => (string) ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? ''),
        'upgradeInsecureRequests' => (string) ($_SERVER['HTTP_UPGRADE_INSECURE_REQUESTS'] ?? ''),
        'referer' => (string) ($_SERVER['HTTP_REFERER'] ?? ''),
    ];

    $ip = function_exists('getClientIpAddress') ? (string) (getClientIpAddress() ?? '') : (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    $geo = [
        'ip' => $ip,
        'hostname' => fingerprint_client_hostname($ip),
        'country_code' => null,
        'country_name' => null,
        'region_name' => null,
        'city_name' => null,
        'timezone' => null,
        'latitude' => null,
        'longitude' => null,
    ];

    $geoipPath = __DIR__ . '/../analytics/geoip/geoip.php';
    if ($ip !== '' && is_file($geoipPath)) {
        require_once $geoipPath;
        if (function_exists('getGeoFromIP')) {
            try {
                $looked = getGeoFromIP($ip);
                if (is_array($looked)) {
                    $geo['country_code'] = isset($looked['country_code']) ? (string) $looked['country_code'] : null;
                    $geo['country_name'] = isset($looked['country_name']) ? (string) $looked['country_name'] : null;
                    $geo['region_name'] = isset($looked['region_name']) ? (string) $looked['region_name'] : null;
                    $geo['city_name'] = isset($looked['city_name']) ? (string) $looked['city_name'] : null;
                    $geo['timezone'] = isset($looked['timezone']) ? (string) $looked['timezone'] : null;
                    if (isset($looked['latitude']) && is_numeric($looked['latitude'])) {
                        $geo['latitude'] = (float) $looked['latitude'];
                    }
                    if (isset($looked['longitude']) && is_numeric($looked['longitude'])) {
                        $geo['longitude'] = (float) $looked['longitude'];
                    }
                }
            } catch (Throwable $e) {
                // Keep defaults
            }
        }
    }

    sendJSON([
        'headers' => $headers,
        'geo' => $geo,
    ]);
}
