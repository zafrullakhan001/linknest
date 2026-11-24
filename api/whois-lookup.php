<?php
/**
 * On-demand domain ownership lookup.
 * Prefers classic WHOIS (port 43) — same rich record GoDaddy displays —
 * with RDAP fallback. Always includes a GoDaddy public WHOIS deep link.
 *
 * POST JSON: { "host": "example.com" } or { "url": "https://www.example.com/path" }
 * Guests allowed with per-session rate limit.
 */
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=UTF-8');

set_exception_handler(static function (Throwable $e): void {
    if (!headers_sent()) {
        http_response_code(500);
    }
    echo json_encode([
        'ok' => false,
        'message' => 'Server error during WHOIS lookup',
        'error' => $e->getMessage(),
    ]);
    exit;
});

if (session_status() === PHP_SESSION_NONE) {
    @session_start();
}

$rateKey = 'whois_lookup_ts';
$now = time();
if (!isset($_SESSION[$rateKey]) || !is_array($_SESSION[$rateKey])) {
    $_SESSION[$rateKey] = [];
}
$_SESSION[$rateKey] = array_values(array_filter($_SESSION[$rateKey], static function ($t) use ($now) {
    return ($now - (int)$t) < 60;
}));
if (count($_SESSION[$rateKey]) >= 20) {
    http_response_code(429);
    echo json_encode(['ok' => false, 'message' => 'Too many WHOIS lookups. Please wait a minute and try again.']);
    exit;
}
$_SESSION[$rateKey][] = $now;
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

set_time_limit(60);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$hostInput = '';
if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw !== false ? $raw : '', true);
    if (is_array($data)) {
        if (!empty($data['host']) && is_scalar($data['host'])) {
            $hostInput = trim((string)$data['host']);
        } elseif (!empty($data['url']) && is_scalar($data['url'])) {
            $hostInput = trim((string)$data['url']);
        }
    }
} else {
    $hostInput = isset($_GET['host']) ? trim((string)$_GET['host']) : (isset($_GET['url']) ? trim((string)$_GET['url']) : '');
}

if ($hostInput === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'host or url is required']);
    exit;
}

require_once __DIR__ . '/ssl-check-lib.php';

$host = ssl_check_normalize_host($hostInput);
if ($host === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'Invalid host']);
    exit;
}

$blockReason = ssl_check_is_blocked_target($host);
if ($blockReason !== null) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => $blockReason]);
    exit;
}

/**
 * @return list<string>
 */
function whois_domain_candidates(string $host): array {
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        return [];
    }
    $labels = array_values(array_filter(explode('.', $host), static fn($l) => $l !== ''));
    $n = count($labels);
    if ($n < 2) {
        return [$host];
    }
    $out = [];
    for ($i = 0; $i < $n - 1; $i++) {
        $candidate = implode('.', array_slice($labels, $i));
        if (!in_array($candidate, $out, true)) {
            $out[] = $candidate;
        }
    }
    return $out;
}

function whois_godaddy_url(string $domain): string {
    return 'https://www.godaddy.com/whois/results.aspx?itc=dlp_domain_whois&domainName=' . rawurlencode($domain);
}

/**
 * Query a WHOIS server over TCP port 43.
 */
function whois_query_server(string $server, string $query, int $timeoutSec = 12): ?string {
    $server = strtolower(trim($server));
    $server = preg_replace('#^whois://#i', '', $server);
    $server = preg_replace('#[:/].*$#', '', $server);
    if ($server === '' || !preg_match('/^[a-z0-9.-]+$/i', $server)) {
        return null;
    }
    // Only allow public WHOIS hosts (no IP literals that look private — hostnames only).
    if (filter_var($server, FILTER_VALIDATE_IP) && function_exists('ssl_check_is_dangerous_ip') && ssl_check_is_dangerous_ip($server)) {
        return null;
    }

    $fp = @fsockopen($server, 43, $errno, $errstr, min(10, $timeoutSec));
    if (!$fp) {
        return null;
    }
    stream_set_timeout($fp, $timeoutSec);
    fwrite($fp, $query . "\r\n");
    $out = '';
    while (!feof($fp)) {
        $chunk = fgets($fp, 4096);
        if ($chunk === false) {
            break;
        }
        $out .= $chunk;
        if (strlen($out) > 200000) {
            break;
        }
    }
    fclose($fp);
    $out = trim($out);
    return $out !== '' ? $out : null;
}

/**
 * @return array{tld:?string, server:?string}
 */
function whois_iana_referral(string $domain): array {
    $labels = explode('.', $domain);
    $tld = end($labels) ?: null;
    $text = whois_query_server('whois.iana.org', $domain, 10);
    $server = null;
    if (is_string($text)) {
        if (preg_match('/^whois:\s*(\S+)/mi', $text, $m)) {
            $server = strtolower(trim($m[1]));
        }
    }
    // Common TLD fallbacks when IANA is slow/unavailable
    if ($server === null && $tld !== null) {
        $map = [
            'com' => 'whois.verisign-grs.com',
            'net' => 'whois.verisign-grs.com',
            'org' => 'whois.pir.org',
            'info' => 'whois.afilias.net',
            'biz' => 'whois.nic.biz',
            'io' => 'whois.nic.io',
            'co' => 'whois.nic.co',
            'us' => 'whois.nic.us',
            'uk' => 'whois.nic.uk',
            'edu' => 'whois.educause.edu',
            'gov' => 'whois.dotgov.gov',
        ];
        $server = $map[strtolower($tld)] ?? null;
    }
    return ['tld' => $tld ? strtolower($tld) : null, 'server' => $server];
}

/**
 * Parse WHOIS key/value lines into a multimap.
 *
 * @return array<string, list<string>>
 */
function whois_parse_kv(string $text): array {
    $map = [];
    foreach (preg_split("/\r\n|\n|\r/", $text) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '%') || str_starts_with($line, '#')) {
            continue;
        }
        if (str_starts_with($line, '>>>')) {
            continue;
        }
        if (!preg_match('/^([^:]+):\s*(.+)$/', $line, $m)) {
            continue;
        }
        $key = strtolower(trim($m[1]));
        $val = trim($m[2]);
        if ($val === '') {
            continue;
        }
        if (!isset($map[$key])) {
            $map[$key] = [];
        }
        if (!in_array($val, $map[$key], true)) {
            $map[$key][] = $val;
        }
    }
    return $map;
}

/**
 * @param array<string, list<string>> $kv
 */
function whois_first(array $kv, array $keys): ?string {
    foreach ($keys as $k) {
        if (!empty($kv[$k][0])) {
            return $kv[$k][0];
        }
    }
    return null;
}

/**
 * @param array<string, list<string>> $kv
 * @return list<string>
 */
function whois_all(array $kv, array $keys): array {
    $out = [];
    foreach ($keys as $k) {
        if (empty($kv[$k])) {
            continue;
        }
        foreach ($kv[$k] as $v) {
            // Strip trailing status URLs
            $v = preg_replace('#\s+https?://\S+#i', '', $v);
            $v = trim((string)$v);
            if ($v !== '' && !in_array($v, $out, true)) {
                $out[] = $v;
            }
        }
    }
    return $out;
}

/**
 * @param array<string, list<string>> $kv
 * @return array<string, mixed>
 */
function whois_ownership_from_kv(array $kv, string $queried, string $rawText): array {
    $domain = whois_first($kv, ['domain name', 'domain']);
    $registrarName = whois_first($kv, ['registrar', 'sponsoring registrar']);
    $registrarUrl = whois_first($kv, ['registrar url', 'registrar url:', 'referral url']);
    $abuseEmail = whois_first($kv, ['registrar abuse contact email', 'abuse contact email', 'abuse email']);
    $abusePhone = whois_first($kv, ['registrar abuse contact phone', 'abuse contact phone', 'abuse phone']);

    $registrantOrg = whois_first($kv, ['registrant organization', 'registrant organisation', 'org', 'organization']);
    $registrantName = whois_first($kv, ['registrant name', 'registrant']);
    $registrantEmail = whois_first($kv, ['registrant email', 'registrant e-mail']);
    $registrantState = whois_first($kv, ['registrant state/province', 'registrant state', 'registrant province']);
    $registrantCountry = whois_first($kv, ['registrant country', 'country']);
    $registrantPhone = whois_first($kv, ['registrant phone', 'registrant telephone']);
    $registrantCity = whois_first($kv, ['registrant city']);
    $registrantStreet = whois_first($kv, ['registrant street', 'registrant address']);

    $adminEmail = whois_first($kv, ['admin email', 'administrative contact email']);
    $techEmail = whois_first($kv, ['tech email', 'technical contact email']);

    $created = whois_first($kv, ['creation date', 'created', 'registered on', 'domain registration date']);
    $updated = whois_first($kv, ['updated date', 'last updated', 'last modified', 'modified']);
    $expires = whois_first($kv, [
        'registry expiry date',
        'registrar registration expiration date',
        'expiration date',
        'expiry date',
        'registry expiration date',
        'paid-till',
    ]);

    $statuses = whois_all($kv, ['domain status', 'status']);
    $nameservers = array_map('strtolower', whois_all($kv, ['name server', 'nameserver', 'nserver']));
    $dnssec = whois_first($kv, ['dnssec']);
    $registryId = whois_first($kv, ['registry domain id', 'domain id']);
    $registrarIana = whois_first($kv, ['registrar iana id']);
    $whoisServer = whois_first($kv, ['registrar whois server', 'whois server']);

    $fields = [];
    foreach ($kv as $k => $vals) {
        // Skip terms-of-use walls of text keys; keep useful fields
        if (str_contains($k, 'terms of use') || str_contains($k, 'notice')) {
            continue;
        }
        $fields[$k] = count($vals) === 1 ? $vals[0] : $vals;
    }

    return [
        'queried' => $queried,
        'object_class' => 'domain',
        'domain' => $domain ? strtolower($domain) : strtolower($queried),
        'network_name' => null,
        'start_address' => null,
        'end_address' => null,
        'country' => $registrantCountry,
        'state' => $registrantState,
        'city' => $registrantCity,
        'street' => $registrantStreet,
        'phone' => $registrantPhone,
        'dnssec' => $dnssec,
        'registry_domain_id' => $registryId,
        'registrar_iana_id' => $registrarIana,
        'registrar_url' => $registrarUrl,
        'whois_server' => $whoisServer,
        'registrar' => $registrarName || $abuseEmail ? [
            'name' => $registrarName,
            'organization' => $registrarName,
            'email' => $abuseEmail,
            'phone' => $abusePhone,
            'handle' => $registrarIana,
            'url' => $registrarUrl,
        ] : null,
        'registrant' => ($registrantOrg || $registrantName || $registrantEmail) ? [
            'name' => $registrantName,
            'organization' => $registrantOrg,
            'email' => $registrantEmail,
            'phone' => $registrantPhone,
            'state' => $registrantState,
            'country' => $registrantCountry,
            'city' => $registrantCity,
            'street' => $registrantStreet,
            'handle' => null,
        ] : null,
        'admin' => $adminEmail ? [
            'name' => null,
            'organization' => null,
            'email' => $adminEmail,
            'handle' => null,
        ] : null,
        'tech' => $techEmail ? [
            'name' => null,
            'organization' => null,
            'email' => $techEmail,
            'handle' => null,
        ] : null,
        'abuse' => $abuseEmail ? [
            'name' => null,
            'organization' => null,
            'email' => $abuseEmail,
            'phone' => $abusePhone,
            'handle' => null,
        ] : null,
        'registered' => $created,
        'updated' => $updated,
        'expires' => $expires,
        'statuses' => $statuses,
        'nameservers' => $nameservers,
        'entities' => [],
        'fields' => $fields,
        'raw_text' => $rawText,
    ];
}

/**
 * Full classic WHOIS: IANA → registry → registrar referral.
 *
 * @return array{ok:bool, domain:?string, ownership:?array, raw:?string, servers:list<string>, error:?string}
 */
function whois_classic_lookup(string $domain): array {
    $serversTried = [];
    $iana = whois_iana_referral($domain);
    $registryServer = $iana['server'];
    if ($registryServer === null) {
        return ['ok' => false, 'domain' => $domain, 'ownership' => null, 'raw' => null, 'servers' => $serversTried, 'error' => 'No WHOIS server found for TLD'];
    }

    // Verisign wants "domain example.com" for thin whois
    $query = $domain;
    if (in_array($registryServer, ['whois.verisign-grs.com', 'whois.crsnic.net'], true)) {
        $query = 'domain ' . $domain;
    }

    $registryText = whois_query_server($registryServer, $query);
    $serversTried[] = $registryServer;
    if ($registryText === null) {
        return ['ok' => false, 'domain' => $domain, 'ownership' => null, 'raw' => null, 'servers' => $serversTried, 'error' => 'Registry WHOIS query failed'];
    }

    $kv = whois_parse_kv($registryText);
    $referral = whois_first($kv, ['registrar whois server', 'whois server', 'referralserver']);
    if ($referral) {
        $referral = preg_replace('#^whois://#i', '', $referral);
        $referral = preg_replace('#[:/].*$#', '', strtolower(trim($referral)));
    }

    $finalText = $registryText;
    if ($referral && $referral !== $registryServer && preg_match('/^[a-z0-9.-]+$/i', $referral)) {
        $thick = whois_query_server($referral, $domain);
        $serversTried[] = $referral;
        if ($thick !== null && strlen($thick) > 80) {
            // Prefer thick registrar record; append registry header if useful
            $finalText = $thick;
            $kv = whois_parse_kv($thick);
            // If thick is sparse, merge registry keys that are missing
            $regKv = whois_parse_kv($registryText);
            foreach ($regKv as $k => $vals) {
                if (empty($kv[$k])) {
                    $kv[$k] = $vals;
                }
            }
            // Rebuild ownership from merged kv but keep thick raw as primary display
            $ownership = whois_ownership_from_kv($kv, $domain, $finalText);
            return ['ok' => true, 'domain' => $domain, 'ownership' => $ownership, 'raw' => $finalText, 'servers' => $serversTried, 'error' => null];
        }
    }

    $ownership = whois_ownership_from_kv($kv, $domain, $finalText);
    // Thin records without useful domain status still count if we have registrar/dates
    $useful = !empty($ownership['registrar']) || !empty($ownership['registered']) || !empty($ownership['nameservers']) || !empty($ownership['registrant']);
    if (!$useful) {
        return ['ok' => false, 'domain' => $domain, 'ownership' => null, 'raw' => $finalText, 'servers' => $serversTried, 'error' => 'WHOIS response had no ownership fields'];
    }
    return ['ok' => true, 'domain' => $domain, 'ownership' => $ownership, 'raw' => $finalText, 'servers' => $serversTried, 'error' => null];
}

/**
 * @return array{ok:bool, http_code:int, body:?string, final_url:?string, error:?string}
 */
function whois_http_get(string $url, int $timeoutSec = 20): array {
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'http_code' => 0, 'body' => null, 'final_url' => null, 'error' => 'curl extension required'];
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 8,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => $timeoutSec,
        CURLOPT_HTTPHEADER => [
            'Accept: application/rdap+json, application/json',
            'User-Agent: LinkNest-WHOIS/1.0',
        ],
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);
    $body = curl_exec($ch);
    $err = curl_error($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $final = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    curl_close($ch);
    if ($body === false) {
        return ['ok' => false, 'http_code' => $code, 'body' => null, 'final_url' => is_string($final) ? $final : null, 'error' => $err ?: 'request failed'];
    }
    return [
        'ok' => $code >= 200 && $code < 300,
        'http_code' => $code,
        'body' => (string)$body,
        'final_url' => is_string($final) ? $final : null,
        'error' => $code >= 200 && $code < 300 ? null : ('HTTP ' . $code),
    ];
}

/**
 * @param array<string, mixed> $entity
 * @return array<string, string>
 */
function whois_vcard_map(array $entity): array {
    $map = [];
    $vcard = $entity['vcardArray'] ?? null;
    if (!is_array($vcard) || !isset($vcard[1]) || !is_array($vcard[1])) {
        return $map;
    }
    foreach ($vcard[1] as $row) {
        if (!is_array($row) || count($row) < 4) {
            continue;
        }
        $key = strtolower((string)$row[0]);
        $val = $row[3];
        if (is_array($val)) {
            $val = implode(', ', array_map(static fn($x) => is_scalar($x) ? (string)$x : '', $val));
        }
        if (is_scalar($val) && trim((string)$val) !== '') {
            $map[$key] = trim((string)$val);
        }
    }
    return $map;
}

/**
 * @param array<string, mixed> $rdap
 * @return array<string, mixed>
 */
function whois_parse_rdap(array $rdap, string $queried): array {
    $events = [];
    if (!empty($rdap['events']) && is_array($rdap['events'])) {
        foreach ($rdap['events'] as $ev) {
            if (!is_array($ev)) {
                continue;
            }
            $action = (string)($ev['eventAction'] ?? '');
            $date = (string)($ev['eventDate'] ?? '');
            if ($action !== '' && $date !== '') {
                $events[$action] = $date;
            }
        }
    }

    $statuses = [];
    if (!empty($rdap['status']) && is_array($rdap['status'])) {
        foreach ($rdap['status'] as $s) {
            if (is_scalar($s) && (string)$s !== '') {
                $statuses[] = (string)$s;
            }
        }
    }

    $nameservers = [];
    if (!empty($rdap['nameservers']) && is_array($rdap['nameservers'])) {
        foreach ($rdap['nameservers'] as $ns) {
            if (is_array($ns) && !empty($ns['ldhName'])) {
                $nameservers[] = strtolower((string)$ns['ldhName']);
            }
        }
    }

    $registrar = null;
    $registrant = null;
    $abuse = null;

    if (!empty($rdap['entities']) && is_array($rdap['entities'])) {
        foreach ($rdap['entities'] as $ent) {
            if (!is_array($ent)) {
                continue;
            }
            $roles = [];
            if (!empty($ent['roles']) && is_array($ent['roles'])) {
                foreach ($ent['roles'] as $r) {
                    if (is_scalar($r)) {
                        $roles[] = strtolower((string)$r);
                    }
                }
            }
            $vcard = whois_vcard_map($ent);
            $handle = isset($ent['handle']) ? (string)$ent['handle'] : null;
            $name = $vcard['fn'] ?? $handle;
            $org = $vcard['org'] ?? null;
            $email = $vcard['email'] ?? null;
            $row = [
                'name' => $name,
                'organization' => $org,
                'email' => $email,
                'handle' => $handle,
            ];
            if (in_array('registrar', $roles, true) && $registrar === null) {
                $registrar = $row;
            }
            if (in_array('registrant', $roles, true) && $registrant === null) {
                $registrant = $row;
            }
            if ((in_array('abuse', $roles, true) || in_array('abuse contact', $roles, true)) && $abuse === null) {
                $abuse = $row;
            }
        }
    }

    return [
        'queried' => $queried,
        'object_class' => isset($rdap['objectClassName']) ? (string)$rdap['objectClassName'] : null,
        'domain' => isset($rdap['ldhName']) ? strtolower((string)$rdap['ldhName']) : null,
        'network_name' => isset($rdap['name']) ? (string)$rdap['name'] : null,
        'start_address' => isset($rdap['startAddress']) ? (string)$rdap['startAddress'] : null,
        'end_address' => isset($rdap['endAddress']) ? (string)$rdap['endAddress'] : null,
        'country' => isset($rdap['country']) ? (string)$rdap['country'] : null,
        'registrar' => $registrar,
        'registrant' => $registrant,
        'abuse' => $abuse,
        'registered' => $events['registration'] ?? ($events['registered'] ?? null),
        'updated' => $events['last changed'] ?? ($events['last update of RDAP database'] ?? null),
        'expires' => $events['expiration'] ?? null,
        'statuses' => $statuses,
        'nameservers' => $nameservers,
        'entities' => [],
        'raw_text' => null,
        'fields' => [],
    ];
}

$result = null;
$tried = [];
$source = null;
$sourceUrl = null;
$lookupKind = 'domain';
$matchedDomain = $host;
$rawText = null;
$whoisServers = [];

if (filter_var($host, FILTER_VALIDATE_IP)) {
    $lookupKind = 'ip';
    $url = 'https://rdap.org/ip/' . rawurlencode($host);
    $resp = whois_http_get($url);
    $tried[] = ['url' => $url, 'http_code' => $resp['http_code'], 'error' => $resp['error']];
    if ($resp['ok'] && $resp['body']) {
        $json = json_decode($resp['body'], true);
        if (is_array($json)) {
            $result = whois_parse_rdap($json, $host);
            $source = 'rdap';
            $sourceUrl = $resp['final_url'] ?: $url;
        }
    }
} else {
    $candidates = whois_domain_candidates($host);
    // Prefer classic WHOIS (rich GoDaddy-style registrar data)
    foreach ($candidates as $domain) {
        $classic = whois_classic_lookup($domain);
        $tried[] = [
            'domain' => $domain,
            'method' => 'whois43',
            'servers' => $classic['servers'],
            'error' => $classic['error'],
        ];
        if ($classic['ok'] && is_array($classic['ownership'])) {
            $result = $classic['ownership'];
            $matchedDomain = $domain;
            $rawText = $classic['raw'];
            $whoisServers = $classic['servers'];
            $source = 'whois';
            $sourceUrl = whois_godaddy_url($domain);
            break;
        }
    }

    // RDAP fallback if port 43 unavailable
    if ($result === null) {
        foreach ($candidates as $domain) {
            $url = 'https://rdap.org/domain/' . rawurlencode($domain);
            $resp = whois_http_get($url);
            $tried[] = ['domain' => $domain, 'method' => 'rdap', 'url' => $url, 'http_code' => $resp['http_code'], 'error' => $resp['error']];
            if (!$resp['ok'] || !$resp['body']) {
                continue;
            }
            $json = json_decode($resp['body'], true);
            if (!is_array($json)) {
                continue;
            }
            if (isset($json['errorCode']) || (isset($json['title']) && empty($json['ldhName']) && empty($json['entities']))) {
                continue;
            }
            $result = whois_parse_rdap($json, $domain);
            $matchedDomain = $domain;
            $source = 'rdap';
            $sourceUrl = $resp['final_url'] ?: $url;
            break;
        }
    }
}

$godaddyUrl = $lookupKind === 'ip'
    ? null
    : whois_godaddy_url($matchedDomain);

if ($result === null) {
    http_response_code(404);
    echo json_encode([
        'ok' => false,
        'message' => $lookupKind === 'ip'
            ? 'No WHOIS/RDAP ownership data found for that IP'
            : 'No WHOIS ownership data found for that domain (may be private/intranet or unsupported TLD)',
        'host' => $host,
        'lookup_kind' => $lookupKind,
        'godaddy_url' => $godaddyUrl,
        'tried' => $tried,
    ]);
    exit;
}

echo json_encode([
    'ok' => true,
    'message' => 'Lookup completed',
    'host' => $host,
    'lookup_kind' => $lookupKind,
    'source' => $source,
    'source_url' => $sourceUrl,
    'godaddy_url' => $godaddyUrl,
    'whois_servers' => $whoisServers,
    'ownership' => $result,
    'raw_text' => $rawText ?? ($result['raw_text'] ?? null),
]);
