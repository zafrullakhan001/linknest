<?php
/**
 * HTTP-checkable access restrictions for tiles, tabs, and links.
 * Ported from RemoteAccess evaluate_block_connection_restrictions (time/host, VPN,
 * device type, browser, OS, country, date range, referrer).
 */

if (!defined('LINKNEST_RESTRICTION_BROWSERS')) {
    define('LINKNEST_RESTRICTION_BROWSERS', ['chrome', 'edge', 'firefox', 'safari', 'opera', 'brave', 'vivaldi', 'duckduckgo']);
}
if (!defined('LINKNEST_RESTRICTION_OS')) {
    define('LINKNEST_RESTRICTION_OS', ['windows', 'macos', 'linux', 'android', 'ios']);
}

const LINKNEST_RESTRICTION_DAY_MAP = [
    'mon' => 1, 'monday' => 1,
    'tue' => 2, 'tues' => 2, 'tuesday' => 2,
    'wed' => 3, 'weds' => 3, 'wednesday' => 3,
    'thu' => 4, 'thurs' => 4, 'thursday' => 4,
    'fri' => 5, 'friday' => 5,
    'sat' => 6, 'saturday' => 6,
    'sun' => 7, 'sunday' => 7,
];

/**
 * @param mixed $input
 * @return array<string, mixed>|null
 */
function normalize_access_restrictions($input): ?array {
    if (!is_array($input) || $input === []) {
        return null;
    }

    $out = [];

    $timeRules = [];
    if (!empty($input['timeRules']) && is_array($input['timeRules'])) {
        foreach ($input['timeRules'] as $rule) {
            if (!is_array($rule)) {
                continue;
            }
            $mode = (($rule['mode'] ?? '') === 'deny') ? 'deny' : 'allow';
            $start = normalize_restriction_time((string) ($rule['startTime'] ?? ''));
            $end = normalize_restriction_time((string) ($rule['endTime'] ?? ''));
            if ($start === null || $end === null) {
                continue;
            }
            $day = $rule['dayOfWeek'] ?? null;
            $day = ($day === '' || $day === null) ? null : (int) $day;
            if ($day !== null && ($day < 1 || $day > 7)) {
                $day = null;
            }
            $timeRules[] = [
                'mode' => $mode,
                'dayOfWeek' => $day,
                'startTime' => $start,
                'endTime' => $end,
            ];
        }
    }
    if ($timeRules !== []) {
        $out['timeRules'] = $timeRules;
    }

    $hostRules = [];
    if (!empty($input['hostRules']) && is_array($input['hostRules'])) {
        foreach ($input['hostRules'] as $rule) {
            if (!is_array($rule)) {
                continue;
            }
            $pattern = trim((string) ($rule['pattern'] ?? ''));
            if ($pattern === '') {
                continue;
            }
            $hostRules[] = [
                'mode' => (($rule['mode'] ?? '') === 'deny') ? 'deny' : 'allow',
                'pattern' => $pattern,
            ];
        }
    }
    if ($hostRules !== []) {
        $out['hostRules'] = $hostRules;
    }

    $vpnIn = (isset($input['vpn']) && is_array($input['vpn'])) ? $input['vpn'] : [];
    $vpnRequired = !empty($vpnIn['required']);
    $vpnRanges = trim((string) ($vpnIn['allowedIpRanges'] ?? ''));
    $vpnHeader = trim((string) ($vpnIn['trustedHeaderName'] ?? ''));
    $vpnHeaderVal = trim((string) ($vpnIn['trustedHeaderValue'] ?? ''));
    if ($vpnRequired || $vpnRanges !== '' || $vpnHeader !== '') {
        $out['vpn'] = [
            'required' => $vpnRequired,
            'allowedIpRanges' => $vpnRanges !== '' ? $vpnRanges : null,
            'trustedHeaderName' => $vpnHeader !== '' ? $vpnHeader : null,
            'trustedHeaderValue' => $vpnHeaderVal !== '' ? $vpnHeaderVal : null,
        ];
    }

    $device = strtolower(trim((string) ($input['allowedDeviceType'] ?? 'any')));
    if (in_array($device, ['desktop', 'mobile'], true)) {
        $out['allowedDeviceType'] = $device;
    }

    $browsers = [];
    if (!empty($input['browsers']) && is_array($input['browsers'])) {
        $allowedNames = LINKNEST_RESTRICTION_BROWSERS;
        foreach ($input['browsers'] as $rule) {
            if (!is_array($rule)) {
                continue;
            }
            $name = strtolower(trim((string) ($rule['name'] ?? '')));
            if (!in_array($name, $allowedNames, true)) {
                continue;
            }
            $min = isset($rule['minVersion']) ? max(0, (int) $rule['minVersion']) : 0;
            $browsers[] = ['name' => $name, 'minVersion' => $min];
        }
    }
    if ($browsers !== []) {
        $out['browsers'] = $browsers;
    }

    $osAllow = [];
    if (!empty($input['osAllow']) && is_array($input['osAllow'])) {
        $allowedOs = LINKNEST_RESTRICTION_OS;
        foreach ($input['osAllow'] as $os) {
            $os = strtolower(trim((string) $os));
            if (in_array($os, $allowedOs, true) && !in_array($os, $osAllow, true)) {
                $osAllow[] = $os;
            }
        }
    }
    if ($osAllow !== []) {
        $out['osAllow'] = $osAllow;
    }

    $countryAllow = normalize_country_code_list($input['countryAllow'] ?? []);
    $countryDeny = normalize_country_code_list($input['countryDeny'] ?? []);
    if ($countryAllow !== []) {
        $out['countryAllow'] = $countryAllow;
    }
    if ($countryDeny !== []) {
        $out['countryDeny'] = $countryDeny;
    }

    $validFrom = normalize_restriction_date($input['validFrom'] ?? null);
    $validUntil = normalize_restriction_date($input['validUntil'] ?? null);
    if ($validFrom !== null) {
        $out['validFrom'] = $validFrom;
    }
    if ($validUntil !== null) {
        $out['validUntil'] = $validUntil;
    }

    $referrers = [];
    if (!empty($input['referrerPatterns']) && is_array($input['referrerPatterns'])) {
        foreach ($input['referrerPatterns'] as $pattern) {
            $pattern = trim((string) $pattern);
            if ($pattern !== '' && !in_array($pattern, $referrers, true)) {
                $referrers[] = $pattern;
            }
        }
    }
    if ($referrers !== []) {
        $out['referrerPatterns'] = $referrers;
    }

    $fpHashes = normalize_fingerprint_hash_list($input['fingerprintHashes'] ?? []);
    if ($fpHashes !== []) {
        $out['fingerprintHashes'] = $fpHashes;
    }

    return $out === [] ? null : $out;
}

function normalize_restriction_time(string $value): ?string {
    $value = trim($value);
    if (preg_match('/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/', $value, $m)) {
        $h = (int) $m[1];
        $i = (int) $m[2];
        $s = isset($m[3]) ? (int) $m[3] : 0;
        if ($h > 23 || $i > 59 || $s > 59) {
            return null;
        }
        return sprintf('%02d:%02d:%02d', $h, $i, $s);
    }
    return null;
}

function normalize_restriction_date($value): ?string {
    if (!is_string($value)) {
        return null;
    }
    $value = trim($value);
    if ($value === '') {
        return null;
    }
    if (preg_match('/^(\d{4}-\d{2}-\d{2})/', $value, $m)) {
        return $m[1];
    }
    return null;
}

/**
 * Normalize a copied fingerprint hash (lnfp_ prefix, common typos, or raw SHA-256 hex).
 */
function normalize_fingerprint_hash($value): ?string {
    if (!is_string($value) && !is_numeric($value)) {
        return null;
    }
    $v = strtolower(trim((string) $value));
    if ($v === '') {
        return null;
    }
    if (preg_match('/^(?:lnfp_|lmfp_|lfp_)([a-f0-9]{64})$/', $v, $m)) {
        return $m[1];
    }
    if (preg_match('/^[a-z]{1,8}_([a-f0-9]{64})$/', $v, $m)) {
        return $m[1];
    }
    $hex = preg_replace('/[^a-f0-9]/', '', $v) ?? '';
    if (strlen($hex) === 64) {
        return $hex;
    }
    // Prefix letters that are also hex (e.g. lmfp_ → lf + 64) leave extra digits; use the hash suffix.
    if (strlen($hex) > 64 && strlen($hex) <= 72) {
        return substr($hex, -64);
    }
    return null;
}

/**
 * Collect candidate fingerprint hashes from header, cookie, query, and optional JSON body.
 *
 * @return string[] hex hashes (64 chars, no prefix)
 */
function fingerprint_hashes_from_request(?array $jsonBody = null): array {
    $rawParts = [];
    $header = (string) ($_SERVER['HTTP_X_LINKNEST_FINGERPRINT'] ?? '');
    if ($header !== '') {
        $rawParts[] = $header;
    }
    if (isset($_GET['fingerprintHash'])) {
        $rawParts[] = (string) $_GET['fingerprintHash'];
    }
    if (isset($_GET['fingerprint_hash'])) {
        $rawParts[] = (string) $_GET['fingerprint_hash'];
    }
    if (isset($_GET['fp'])) {
        $rawParts[] = (string) $_GET['fp'];
    }
    if (!empty($_COOKIE['ln_fp'])) {
        $rawParts[] = (string) $_COOKIE['ln_fp'];
    }
    if (is_array($jsonBody)) {
        foreach (['fingerprintHash', 'fingerprint_hash', 'fingerprintHashes', 'fingerprint_hashes'] as $key) {
            if (!array_key_exists($key, $jsonBody)) {
                continue;
            }
            $val = $jsonBody[$key];
            if (is_array($val)) {
                foreach ($val as $item) {
                    if (is_scalar($item)) {
                        $rawParts[] = (string) $item;
                    }
                }
            } elseif (is_scalar($val)) {
                $rawParts[] = (string) $val;
            }
        }
    }
    $out = [];
    foreach ($rawParts as $raw) {
        $pieces = preg_split('/[\s,;]+/', (string) $raw) ?: [];
        foreach ($pieces as $piece) {
            $hex = normalize_fingerprint_hash($piece);
            if ($hex !== null && !in_array($hex, $out, true)) {
                $out[] = $hex;
            }
        }
    }
    return $out;
}

/**
 * @param mixed $list
 * @return string[]
 */
function normalize_fingerprint_hash_list($list): array {
    if (is_string($list)) {
        $list = preg_split('/[\s,]+/', $list) ?: [];
    }
    if (!is_array($list)) {
        return [];
    }
    $out = [];
    foreach ($list as $item) {
        $hash = normalize_fingerprint_hash(is_scalar($item) ? (string) $item : '');
        if ($hash === null) {
            continue;
        }
        $stored = 'lnfp_' . $hash;
        if (!in_array($stored, $out, true)) {
            $out[] = $stored;
        }
    }
    return $out;
}

/**
 * @param mixed $list
 * @return string[]
 */
function normalize_country_code_list($list): array {
    if (is_string($list)) {
        $list = preg_split('/[\s,]+/', $list) ?: [];
    }
    if (!is_array($list)) {
        return [];
    }
    $out = [];
    foreach ($list as $code) {
        $code = strtoupper(trim((string) $code));
        if (preg_match('/^[A-Z]{2}$/', $code) && !in_array($code, $out, true)) {
            $out[] = $code;
        }
    }
    return $out;
}

/**
 * @return array{name: string|null, version: int}|null
 */
function parse_user_agent_browser(string $user_agent): ?array {
    $ua = $user_agent;
    if (preg_match('/Edg\/(\d+)/i', $ua, $m)) {
        return ['name' => 'edge', 'version' => (int) $m[1]];
    }
    if (preg_match('/OPR\/(\d+)/i', $ua, $m)) {
        return ['name' => 'opera', 'version' => (int) $m[1]];
    }
    if (preg_match('/Vivaldi\/(\d+)/i', $ua, $m)) {
        return ['name' => 'vivaldi', 'version' => (int) $m[1]];
    }
    if (preg_match('/Firefox\/(\d+)/i', $ua, $m)) {
        return ['name' => 'firefox', 'version' => (int) $m[1]];
    }
    if (preg_match('/DuckDuckGo\/(\d+)/i', $ua, $m)) {
        return ['name' => 'duckduckgo', 'version' => (int) $m[1]];
    }
    if (preg_match('/Version\/(\d+)/i', $ua, $m) && preg_match('/Safari\//i', $ua) && !preg_match('/Chrome|Chromium|Edg|OPR|Vivaldi/i', $ua)) {
        return ['name' => 'safari', 'version' => (int) $m[1]];
    }
    if (preg_match('/Brave\/(\d+)/i', $ua, $m)) {
        return ['name' => 'brave', 'version' => (int) $m[1]];
    }
    if (preg_match('/Chrome\/(\d+)/i', $ua, $m) && !preg_match('/Edg|OPR|Vivaldi|Brave|Chromium\//i', $ua)) {
        return ['name' => 'chrome', 'version' => (int) $m[1]];
    }
    return null;
}

function parse_user_agent_os(string $user_agent): ?string {
    $ua = $user_agent;
    if (preg_match('/iPhone|iPad|iPod/i', $ua)) {
        return 'ios';
    }
    if (preg_match('/Android/i', $ua)) {
        return 'android';
    }
    if (preg_match('/Windows NT|Windows /i', $ua)) {
        return 'windows';
    }
    if (preg_match('/Mac OS X|Macintosh/i', $ua)) {
        return 'macos';
    }
    if (preg_match('/Linux/i', $ua)) {
        return 'linux';
    }
    return null;
}

function parse_user_agent_device_type(?string $user_agent): string {
    $ua = strtolower(trim((string) $user_agent));
    if ($ua === '') {
        return 'desktop';
    }
    if (preg_match('/mobile|android|iphone|ipad|ipod|tablet|silk|kindle|blackberry|opera mini|windows phone/i', $ua)) {
        return 'mobile';
    }
    return 'desktop';
}

/**
 * @return array<string, string>
 */
function normalize_request_headers(?array $request_headers = null): array {
    $headers = [];
    if ($request_headers !== null) {
        foreach ($request_headers as $k => $v) {
            $name = strtoupper(trim((string) $k));
            $name = str_replace('-', '_', $name);
            if ($name !== '') {
                $headers[$name] = trim((string) $v);
            }
        }
        return $headers;
    }
    foreach ($_SERVER as $key => $value) {
        if (!is_string($key) || !str_starts_with($key, 'HTTP_')) {
            continue;
        }
        $name = strtoupper(substr($key, 5));
        $headers[$name] = trim((string) $value);
    }
    if (isset($_SERVER['REMOTE_USER']) && !isset($headers['REMOTE_USER'])) {
        $headers['REMOTE_USER'] = trim((string) $_SERVER['REMOTE_USER']);
    }
    return $headers;
}

function ip_matches_network_pattern(string $ip, string $pattern): bool {
    $ip = trim($ip);
    $pattern = trim($pattern);
    if ($ip === '' || $pattern === '') {
        return false;
    }
    if (strpos($pattern, '-') !== false) {
        [$start, $end] = array_map('trim', explode('-', $pattern, 2));
        if (filter_var($start, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) && filter_var($end, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $ipLong = ip2long($ip);
            $startLong = ip2long($start);
            $endLong = ip2long($end);
            if ($ipLong !== false && $startLong !== false && $endLong !== false) {
                return $ipLong >= min($startLong, $endLong) && $ipLong <= max($startLong, $endLong);
            }
        }
        if (filter_var($start, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) && filter_var($end, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            $ipBin = @inet_pton($ip);
            $startBin = @inet_pton($start);
            $endBin = @inet_pton($end);
            if ($ipBin !== false && $startBin !== false && $endBin !== false) {
                return strcmp($ipBin, min($startBin, $endBin)) >= 0 && strcmp($ipBin, max($startBin, $endBin)) <= 0;
            }
        }
    }
    if (strpos($pattern, '/') !== false) {
        [$net, $mask] = array_map('trim', explode('/', $pattern, 2));
        if (filter_var($net, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) && ctype_digit($mask)) {
            $prefix = (int) $mask;
            if ($prefix >= 0 && $prefix <= 32) {
                $ipLong = ip2long($ip);
                $netLong = ip2long($net);
                if ($ipLong !== false && $netLong !== false) {
                    $bitmask = $prefix === 0 ? 0 : (-1 << (32 - $prefix));
                    return (($ipLong & $bitmask) === ($netLong & $bitmask));
                }
            }
        }
        if (filter_var($net, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) && ctype_digit($mask)) {
            $prefix = (int) $mask;
            if ($prefix >= 0 && $prefix <= 128) {
                $ipBin = @inet_pton($ip);
                $netBin = @inet_pton($net);
                if ($ipBin === false || $netBin === false) {
                    return false;
                }
                $fullBytes = intdiv($prefix, 8);
                $remainingBits = $prefix % 8;
                if ($fullBytes > 0 && substr($ipBin, 0, $fullBytes) !== substr($netBin, 0, $fullBytes)) {
                    return false;
                }
                if ($remainingBits > 0) {
                    $maskByte = (0xFF << (8 - $remainingBits)) & 0xFF;
                    return ((ord($ipBin[$fullBytes]) & $maskByte) === (ord($netBin[$fullBytes]) & $maskByte));
                }
                return true;
            }
        }
    }
    if (str_contains($pattern, '*')) {
        $regex = '#^' . str_replace('\*', '.*', preg_quote($pattern, '#')) . '$#i';
        return preg_match($regex, $ip) === 1;
    }
    return strcasecmp($ip, $pattern) === 0;
}

function restriction_ip_is_loopback(?string $ip): bool {
    $ip = strtolower(trim((string) $ip));
    if ($ip === '' || $ip === 'localhost') {
        return $ip === 'localhost';
    }
    if ($ip === '127.0.0.1' || $ip === '::1') {
        return true;
    }
    return str_starts_with($ip, '127.');
}

function restriction_ip_is_non_public(?string $ip): bool {
    $ip = trim((string) $ip);
    if ($ip === '' || restriction_ip_is_loopback($ip)) {
        return true;
    }
    if (filter_var($ip, FILTER_VALIDATE_IP) === false) {
        return true;
    }
    return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
}

function restriction_host_pattern_needs_rdns(string $pattern): bool {
    $pattern = trim($pattern);
    if ($pattern === '' || str_contains($pattern, '/')) {
        return false;
    }
    if (str_contains($pattern, ':') && !str_contains($pattern, '.')) {
        return false;
    }
    $asIp = str_replace('*', '0', $pattern);
    return filter_var($asIp, FILTER_VALIDATE_IP) === false;
}

function access_restrictions_need_host(?array $rules): bool {
    if (!is_array($rules) || $rules === []) {
        return false;
    }
    foreach (($rules['hostRules'] ?? []) as $rule) {
        if (!is_array($rule)) {
            continue;
        }
        $pattern = trim((string) ($rule['pattern'] ?? ''));
        if ($pattern !== '' && restriction_host_pattern_needs_rdns($pattern)) {
            return true;
        }
    }
    return false;
}

function resolve_client_host(?string $ip, bool $allowReverseDns = true): string {
    static $cache = [];
    $ip = trim((string) $ip);
    $key = $ip . '|' . ($allowReverseDns ? '1' : '0');
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }

    if ($ip === '') {
        return $cache[$key] = '';
    }

    if (restriction_ip_is_loopback($ip)) {
        $node = '';
        if (function_exists('gethostname')) {
            $node = (string) @gethostname();
        }
        if ($node === '' && function_exists('php_uname')) {
            $node = (string) @php_uname('n');
        }
        $node = strtolower(trim($node, '.'));
        if ($node !== '' && filter_var($node, FILTER_VALIDATE_IP) === false) {
            return $cache[$key] = $node;
        }
        return $cache[$key] = '';
    }

    $remoteHost = strtolower(trim((string) ($_SERVER['REMOTE_HOST'] ?? '')));
    if ($remoteHost !== '' && $remoteHost !== 'unknown' && filter_var($remoteHost, FILTER_VALIDATE_IP) === false) {
        return $cache[$key] = $remoteHost;
    }

    if (!$allowReverseDns || restriction_ip_is_non_public($ip)) {
        return $cache[$key] = '';
    }

    $host = @gethostbyaddr($ip);
    if (!is_string($host) || $host === '' || strcasecmp($host, $ip) === 0) {
        return $cache[$key] = '';
    }
    return $cache[$key] = strtolower($host);
}

function restriction_country_code_for_ip(?string $ip): ?string {
    $ip = trim((string) $ip);
    if ($ip === '') {
        return null;
    }
    $geoipPath = __DIR__ . '/../analytics/geoip/geoip.php';
    if (!is_file($geoipPath)) {
        return null;
    }
    require_once $geoipPath;
    if (!function_exists('getGeoFromIP')) {
        return null;
    }
    try {
        $geo = getGeoFromIP($ip);
        $code = strtoupper(trim((string) ($geo['country_code'] ?? '')));
        if ($code === '' || $code === 'XX') {
            return null;
        }
        return $code;
    } catch (Throwable $e) {
        return null;
    }
}

/**
 * @param array<string, mixed> $rules
 * @param array<string, mixed> $ctx
 * @return array{allowed: bool, message?: string, reason?: string}
 */
function evaluate_access_restrictions(array $rules, array $ctx): array {
    if ($rules === []) {
        return ['allowed' => true];
    }

    $clientIp = trim((string) ($ctx['client_ip'] ?? ''));
    $clientHost = trim((string) ($ctx['client_host'] ?? ''));
    $userAgent = $ctx['user_agent'] ?? null;
    $referrer = $ctx['referrer'] ?? null;
    $countryCode = $ctx['country_code'] ?? null;
    $requestHeaders = $ctx['request_headers'] ?? null;
    $now = $ctx['now'] instanceof DateTimeImmutable
        ? $ctx['now']
        : new DateTimeImmutable('now');

    $currentDay = (int) $now->format('N');
    $currentTime = $now->format('H:i:s');

    $allowTimeRules = [];
    $denyTimeRules = [];
    foreach (($rules['timeRules'] ?? []) as $rule) {
        if (!is_array($rule)) {
            continue;
        }
        if (($rule['mode'] ?? '') === 'deny') {
            $denyTimeRules[] = $rule;
        } else {
            $allowTimeRules[] = $rule;
        }
    }

    $timeDenied = false;
    foreach ($denyTimeRules as $rule) {
        $day = isset($rule['dayOfWeek']) && $rule['dayOfWeek'] !== null && $rule['dayOfWeek'] !== ''
            ? (int) $rule['dayOfWeek'] : null;
        if ($day !== null && $day !== $currentDay) {
            continue;
        }
        $start = (string) ($rule['startTime'] ?? '00:00:00');
        $end = (string) ($rule['endTime'] ?? '23:59:59');
        if ($currentTime >= $start && $currentTime <= $end) {
            $timeDenied = true;
            break;
        }
    }
    if (!$timeDenied && $allowTimeRules !== []) {
        $timeAllowedByAllowRules = false;
        foreach ($allowTimeRules as $rule) {
            $day = isset($rule['dayOfWeek']) && $rule['dayOfWeek'] !== null && $rule['dayOfWeek'] !== ''
                ? (int) $rule['dayOfWeek'] : null;
            if ($day !== null && $day !== $currentDay) {
                continue;
            }
            $start = (string) ($rule['startTime'] ?? '00:00:00');
            $end = (string) ($rule['endTime'] ?? '23:59:59');
            if ($currentTime >= $start && $currentTime <= $end) {
                $timeAllowedByAllowRules = true;
                break;
            }
        }
        if (!$timeAllowedByAllowRules) {
            $timeDenied = true;
        }
    }

    $allowHosts = [];
    $denyHosts = [];
    foreach (($rules['hostRules'] ?? []) as $rule) {
        if (!is_array($rule)) {
            continue;
        }
        $pattern = trim((string) ($rule['pattern'] ?? ''));
        if ($pattern === '') {
            continue;
        }
        if (($rule['mode'] ?? '') === 'deny') {
            $denyHosts[] = $pattern;
        } else {
            $allowHosts[] = $pattern;
        }
    }

    $matchHost = static function (string $pattern, string $ip, string $host): bool {
        $pattern = trim($pattern);
        if ($pattern === '') {
            return false;
        }
        if ($ip !== '' && ip_matches_network_pattern($ip, $pattern)) {
            return true;
        }
        if ($host === '') {
            return false;
        }
        $patternLower = strtolower($pattern);
        $hostLower = strtolower($host);
        if (strpos($patternLower, '*') !== false) {
            $regex = '#^' . str_replace('\*', '.*', preg_quote($patternLower, '#')) . '$#i';
            return preg_match($regex, $hostLower) === 1;
        }
        return $hostLower === $patternLower;
    };

    $hostDenied = false;
    foreach ($denyHosts as $pattern) {
        if ($matchHost($pattern, $clientIp, $clientHost)) {
            $hostDenied = true;
            break;
        }
    }
    if (!$hostDenied && $allowHosts !== []) {
        $hostAllowedByAllowRules = false;
        foreach ($allowHosts as $pattern) {
            if ($matchHost($pattern, $clientIp, $clientHost)) {
                $hostAllowedByAllowRules = true;
                break;
            }
        }
        if (!$hostAllowedByAllowRules) {
            $hostDenied = true;
        }
    }

    if ($timeDenied || $hostDenied) {
        $messageParts = [];
        if ($timeDenied) {
            $messageParts[] = 'This item is not allowed at the current time.';
        }
        if ($hostDenied) {
            $messageParts[] = 'This item is not allowed from your current IP or host.';
        }
        $reason = ($timeDenied && $hostDenied) ? 'time_and_host' : ($timeDenied ? 'time_window' : 'host_ip');
        return ['allowed' => false, 'message' => implode(' ', $messageParts), 'reason' => $reason];
    }

    $vpn = (isset($rules['vpn']) && is_array($rules['vpn'])) ? $rules['vpn'] : [];
    if (!empty($vpn['required'])) {
        $rangesRaw = (string) ($vpn['allowedIpRanges'] ?? '');
        $ranges = array_values(array_filter(array_map('trim', preg_split('/\r\n|\r|\n|,/', $rangesRaw) ?: [])));
        $headerName = strtoupper(str_replace('-', '_', trim((string) ($vpn['trustedHeaderName'] ?? ''))));
        $headerExpectedValue = trim((string) ($vpn['trustedHeaderValue'] ?? ''));
        $hasRules = ($ranges !== []) || ($headerName !== '');
        if (!$hasRules) {
            return [
                'allowed' => false,
                'message' => 'This item requires VPN, but VPN rules are not configured.',
                'reason' => 'vpn_misconfigured',
            ];
        }
        $vpnMatched = false;
        if ($ranges !== [] && $clientIp !== '') {
            foreach ($ranges as $pattern) {
                if (ip_matches_network_pattern($clientIp, $pattern)) {
                    $vpnMatched = true;
                    break;
                }
            }
        }
        if (!$vpnMatched && $headerName !== '') {
            $headers = normalize_request_headers(is_array($requestHeaders) ? $requestHeaders : null);
            if (array_key_exists($headerName, $headers)) {
                $actual = (string) $headers[$headerName];
                if ($headerExpectedValue === '' || hash_equals($headerExpectedValue, $actual)) {
                    $vpnMatched = true;
                }
            }
        }
        if (!$vpnMatched) {
            return [
                'allowed' => false,
                'message' => 'This item requires corporate VPN/network access. Please connect to VPN and try again.',
                'reason' => 'vpn_required',
            ];
        }
    }

    $allowedDeviceType = (string) ($rules['allowedDeviceType'] ?? 'any');
    if ($allowedDeviceType !== 'any' && $allowedDeviceType !== '') {
        $detectedDeviceType = parse_user_agent_device_type(is_string($userAgent) ? $userAgent : null);
        if ($detectedDeviceType !== $allowedDeviceType) {
            return [
                'allowed' => false,
                'message' => $allowedDeviceType === 'desktop'
                    ? 'This item is restricted to desktop devices.'
                    : 'This item is restricted to mobile/tablet devices.',
                'reason' => $allowedDeviceType === 'desktop' ? 'device_desktop_only' : 'device_mobile_only',
            ];
        }
    }

    $browserRules = is_array($rules['browsers'] ?? null) ? $rules['browsers'] : [];
    if ($browserRules !== []) {
        $ua = is_string($userAgent) ? $userAgent : '';
        if ($ua === '') {
            return [
                'allowed' => false,
                'message' => 'This item is restricted to specific browsers. Your browser could not be verified.',
                'reason' => 'browser',
            ];
        }
        $parsed = parse_user_agent_browser($ua);
        $allowed = false;
        $minByName = [];
        foreach ($browserRules as $rule) {
            if (!is_array($rule)) {
                continue;
            }
            $name = strtolower((string) ($rule['name'] ?? ''));
            $minByName[$name] = max(0, (int) ($rule['minVersion'] ?? 0));
        }
        if ($parsed !== null && $parsed['name'] !== null && isset($minByName[$parsed['name']])) {
            if ($parsed['version'] >= $minByName[$parsed['name']]) {
                $allowed = true;
            }
        }
        if (!$allowed) {
            $labels = [
                'chrome' => 'Chrome', 'edge' => 'Edge', 'firefox' => 'Firefox', 'safari' => 'Safari',
                'opera' => 'Opera', 'brave' => 'Brave', 'vivaldi' => 'Vivaldi', 'duckduckgo' => 'DuckDuckGo Browser',
            ];
            $requirements = [];
            foreach ($minByName as $browserName => $minVer) {
                $requirements[] = ($labels[$browserName] ?? ucfirst($browserName)) . ' ' . $minVer . '+';
            }
            $current = $parsed !== null ? ($parsed['name'] . ' ' . $parsed['version']) : 'unknown';
            return [
                'allowed' => false,
                'message' => 'This item is restricted to: ' . implode(' or ', $requirements) . '. You are using: ' . $current . '.',
                'reason' => 'browser',
            ];
        }
    }

    $allowedOsList = is_array($rules['osAllow'] ?? null) ? $rules['osAllow'] : [];
    $allowedOsList = array_values(array_filter(array_map('strval', $allowedOsList)));
    if ($allowedOsList !== []) {
        $ua = is_string($userAgent) ? $userAgent : '';
        if ($ua === '') {
            return [
                'allowed' => false,
                'message' => 'This item is restricted to specific operating systems. Your device could not be detected.',
                'reason' => 'os',
            ];
        }
        $detectedOs = parse_user_agent_os($ua);
        if ($detectedOs === null || !in_array($detectedOs, $allowedOsList, true)) {
            $labels = ['windows' => 'Windows', 'macos' => 'macOS', 'linux' => 'Linux', 'android' => 'Android', 'ios' => 'iOS'];
            $allowedLabels = array_map(static function ($o) use ($labels) {
                return $labels[$o] ?? $o;
            }, $allowedOsList);
            $currentLabel = $detectedOs !== null ? ($labels[$detectedOs] ?? $detectedOs) : 'unknown';
            return [
                'allowed' => false,
                'message' => 'This item is restricted to: ' . implode(', ', $allowedLabels) . '. You are using: ' . $currentLabel . '.',
                'reason' => 'os',
            ];
        }
    }

    $allowCountries = array_map('strtoupper', is_array($rules['countryAllow'] ?? null) ? $rules['countryAllow'] : []);
    $denyCountries = array_map('strtoupper', is_array($rules['countryDeny'] ?? null) ? $rules['countryDeny'] : []);
    $codeUpper = is_string($countryCode) && $countryCode !== '' ? strtoupper($countryCode) : null;
    if ($denyCountries !== [] && $codeUpper !== null && in_array($codeUpper, $denyCountries, true)) {
        return [
            'allowed' => false,
            'message' => 'This item is not available from your country.',
            'reason' => 'country',
        ];
    }
    if ($allowCountries !== []) {
        if ($codeUpper === null) {
            return [
                'allowed' => false,
                'message' => 'This item is restricted by country. Your location could not be determined.',
                'reason' => 'country_unknown',
            ];
        }
        if (!in_array($codeUpper, $allowCountries, true)) {
            return [
                'allowed' => false,
                'message' => 'This item is not available from your country. Allowed: ' . implode(', ', $allowCountries) . '.',
                'reason' => 'country',
            ];
        }
    }

    $validFrom = normalize_restriction_date($rules['validFrom'] ?? null);
    $validUntil = normalize_restriction_date($rules['validUntil'] ?? null);
    if ($validFrom !== null || $validUntil !== null) {
        $today = $now->format('Y-m-d');
        if ($validFrom !== null && $today < $validFrom) {
            return [
                'allowed' => false,
                'message' => 'This item is not available yet. It becomes available from ' . $validFrom . '.',
                'reason' => 'date_not_yet',
            ];
        }
        if ($validUntil !== null && $today > $validUntil) {
            return [
                'allowed' => false,
                'message' => 'This item is no longer available (valid until ' . $validUntil . ').',
                'reason' => 'date_expired',
            ];
        }
    }

    $allowedReferrers = is_array($rules['referrerPatterns'] ?? null) ? $rules['referrerPatterns'] : [];
    $allowedReferrers = array_values(array_filter(array_map('trim', array_map('strval', $allowedReferrers))));
    if ($allowedReferrers !== []) {
        $ref = is_string($referrer) ? trim($referrer) : '';
        $matched = false;
        foreach ($allowedReferrers as $pattern) {
            if ($pattern === '') {
                continue;
            }
            if (str_starts_with($ref, $pattern) || $ref === $pattern) {
                $matched = true;
                break;
            }
        }
        if (!$matched) {
            return [
                'allowed' => false,
                'message' => 'This item must be opened from the dashboard. Do not use direct links.',
                'reason' => 'referrer',
            ];
        }
    }

    $allowedFingerprints = [];
    foreach (normalize_fingerprint_hash_list($rules['fingerprintHashes'] ?? []) as $stored) {
        $hex = normalize_fingerprint_hash((string) $stored);
        if ($hex !== null && !in_array($hex, $allowedFingerprints, true)) {
            $allowedFingerprints[] = $hex;
        }
    }
    if ($allowedFingerprints !== []) {
        $incomingList = [];
        if (!empty($ctx['fingerprint_hashes']) && is_array($ctx['fingerprint_hashes'])) {
            foreach ($ctx['fingerprint_hashes'] as $item) {
                $hex = normalize_fingerprint_hash(is_scalar($item) ? (string) $item : '');
                if ($hex !== null && !in_array($hex, $incomingList, true)) {
                    $incomingList[] = $hex;
                }
            }
        }
        $single = normalize_fingerprint_hash((string) ($ctx['fingerprint_hash'] ?? ''));
        if ($single !== null && !in_array($single, $incomingList, true)) {
            $incomingList[] = $single;
        }
        if ($incomingList === []) {
            return [
                'allowed' => false,
                'message' => 'This item is limited to a registered browser fingerprint. Open Help & About → Fingerprint on this device, then try again.',
                'reason' => 'fingerprint_missing',
            ];
        }
        $matched = false;
        foreach ($incomingList as $incoming) {
            if (in_array($incoming, $allowedFingerprints, true)) {
                $matched = true;
                break;
            }
        }
        if (!$matched) {
            return [
                'allowed' => false,
                'message' => 'This item is limited to a specific browser fingerprint. Copy your hash from Help & About → Fingerprint if this device should be allowed.',
                'reason' => 'fingerprint',
            ];
        }
    }

    return ['allowed' => true];
}

function access_restrictions_need_country(?array $rules): bool {
    if (!is_array($rules) || $rules === []) {
        return false;
    }
    return (!empty($rules['countryAllow']) && is_array($rules['countryAllow']))
        || (!empty($rules['countryDeny']) && is_array($rules['countryDeny']));
}

function user_bypasses_access_restrictions(?array $user, string $tileId, PDO $db): bool {
    if (!$user) {
        return false;
    }
    if (!empty($user['is_admin'])) {
        return true;
    }
    $userId = (int) ($user['id'] ?? 0);
    if ($userId <= 0) {
        return false;
    }
    try {
        $stmt = $db->prepare('SELECT user_id FROM tiles WHERE id = ?');
        $stmt->execute([$tileId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row && isset($row['user_id']) && (int) $row['user_id'] === $userId) {
            return true;
        }
        $perm = $db->prepare('SELECT can_edit FROM user_tile_permissions WHERE user_id = ? AND tile_id = ?');
        $perm->execute([$userId, $tileId]);
        $permission = $perm->fetch(PDO::FETCH_ASSOC);
        if ($permission !== false && !empty($permission['can_edit'])) {
            return true;
        }
    } catch (PDOException $e) {
        return false;
    }
    return false;
}

/**
 * Load restriction JSON plus ancestor chain for a tile, tab, or link.
 *
 * @return array{ok: bool, error?: string, status?: int, tile_id?: string, tile_row?: array, chain?: list<array{at: string, rules: ?array}>}
 */
function load_access_restriction_chain(PDO $db, string $entityType, string $id): array {
    $entityType = strtolower(trim($entityType));
    $id = trim($id);
    if ($id === '' || !in_array($entityType, ['tile', 'tab', 'link'], true)) {
        return ['ok' => false, 'error' => 'Invalid entity', 'status' => 400];
    }

    if ($entityType === 'tile') {
        $stmt = $db->prepare('SELECT * FROM tiles WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL');
        $stmt->execute([$id]);
        $tile = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$tile) {
            return ['ok' => false, 'error' => 'Not found', 'status' => 404];
        }
        return [
            'ok' => true,
            'tile_id' => (string) $tile['id'],
            'tile_row' => $tile,
            'chain' => [
                ['at' => 'tile', 'rules' => decodeAccessRestrictionsJson($tile['access_restrictions'] ?? null)],
            ],
        ];
    }

    if ($entityType === 'tab') {
        $stmt = $db->prepare(
            'SELECT tabs.*, tiles.id AS _tile_id
             FROM tabs
             JOIN tiles ON tiles.id = tabs.tile_id
             WHERE tabs.id = ? AND tiles.deleted_at IS NULL AND tiles.archived_at IS NULL'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return ['ok' => false, 'error' => 'Not found', 'status' => 404];
        }
        $tileStmt = $db->prepare('SELECT * FROM tiles WHERE id = ?');
        $tileStmt->execute([$row['_tile_id']]);
        $tile = $tileStmt->fetch(PDO::FETCH_ASSOC);
        if (!$tile) {
            return ['ok' => false, 'error' => 'Not found', 'status' => 404];
        }
        return [
            'ok' => true,
            'tile_id' => (string) $tile['id'],
            'tile_row' => $tile,
            'tab_row' => $row,
            'chain' => [
                ['at' => 'tile', 'rules' => decodeAccessRestrictionsJson($tile['access_restrictions'] ?? null)],
                ['at' => 'tab', 'rules' => decodeAccessRestrictionsJson($row['access_restrictions'] ?? null)],
            ],
        ];
    }

    $stmt = $db->prepare(
        'SELECT links.*, tabs.id AS _tab_id, tiles.id AS _tile_id
         FROM links
         JOIN sections ON sections.id = links.section_id
         JOIN tabs ON tabs.id = sections.tab_id
         JOIN tiles ON tiles.id = tabs.tile_id
         WHERE links.id = ? AND tiles.deleted_at IS NULL AND tiles.archived_at IS NULL'
    );
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return ['ok' => false, 'error' => 'Not found', 'status' => 404];
    }
    $tileStmt = $db->prepare('SELECT * FROM tiles WHERE id = ?');
    $tileStmt->execute([$row['_tile_id']]);
    $tile = $tileStmt->fetch(PDO::FETCH_ASSOC);
    $tabStmt = $db->prepare('SELECT * FROM tabs WHERE id = ?');
    $tabStmt->execute([$row['_tab_id']]);
    $tab = $tabStmt->fetch(PDO::FETCH_ASSOC);
    if (!$tile || !$tab) {
        return ['ok' => false, 'error' => 'Not found', 'status' => 404];
    }
    return [
        'ok' => true,
        'tile_id' => (string) $tile['id'],
        'tile_row' => $tile,
        'tab_row' => $tab,
        'link_row' => $row,
        'chain' => [
            ['at' => 'tile', 'rules' => decodeAccessRestrictionsJson($tile['access_restrictions'] ?? null)],
            ['at' => 'tab', 'rules' => decodeAccessRestrictionsJson($tab['access_restrictions'] ?? null)],
            ['at' => 'link', 'rules' => decodeAccessRestrictionsJson($row['access_restrictions'] ?? null)],
        ],
    ];
}

/**
 * @return array{allowed: bool, message?: string, reason?: string, failedAt?: string}
 */
function evaluate_entity_access_chain(string $entityType, string $id, array $extraCtx = []): array {
    $db = getDB();
    $loaded = load_access_restriction_chain($db, $entityType, $id);
    if (!$loaded['ok']) {
        return ['allowed' => false, 'message' => $loaded['error'] ?? 'Not found', 'reason' => 'not_found'];
    }

    $user = getAuthenticatedUser();
    $tileRow = $loaded['tile_row'];
    $userGroupIds = [];
    if ($user) {
        try {
            $groupStmt = $db->prepare('SELECT group_id FROM user_group_members WHERE user_id = ?');
            $groupStmt->execute([$user['id']]);
            while ($group = $groupStmt->fetch(PDO::FETCH_ASSOC)) {
                $userGroupIds[] = (int) $group['group_id'];
            }
        } catch (PDOException $e) {
            $userGroupIds = [];
        }
    }

    if (!canUserSeePublishedContent($user, $tileRow) || !canUserSeeByVisibility($user, $tileRow, $userGroupIds)) {
        $isOwner = $user && isset($tileRow['user_id']) && (int) $tileRow['user_id'] === (int) $user['id'];
        $shareOk = $user && function_exists('userHasAcceptedTileShare') && userHasAcceptedTileShare($db, $tileRow['id'], $user);
        $roleOk = $user && function_exists('canUserViewTileByRole') && canUserViewTileByRole($user['id'], $tileRow['id'], $db);
        if (!$isOwner && !$shareOk && !$roleOk && empty($user['is_admin'])) {
            return ['allowed' => false, 'message' => 'Not found', 'reason' => 'not_found'];
        }
    }

    if (!empty($loaded['tab_row']) && !canUserSeePublishedContent($user, $loaded['tab_row']) && empty($user['is_admin'])) {
        return ['allowed' => false, 'message' => 'Not found', 'reason' => 'not_found'];
    }
    if (!empty($loaded['link_row']) && !canUserSeePublishedContent($user, $loaded['link_row']) && empty($user['is_admin'])) {
        return ['allowed' => false, 'message' => 'Not found', 'reason' => 'not_found'];
    }

    // Editors must still be able to open the space to change settings.
    // Tab/link launches stay enforced so restrictions can be tested.
    if ($entityType === 'tile' && user_bypasses_access_restrictions($user, (string) $loaded['tile_id'], $db)) {
        return ['allowed' => true];
    }

    $clientIp = function_exists('getClientIpAddress') ? (string) (getClientIpAddress() ?? '') : (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    $needCountry = false;
    $needHost = false;
    foreach ($loaded['chain'] as $step) {
        if (access_restrictions_need_country($step['rules'] ?? null)) {
            $needCountry = true;
        }
        if (access_restrictions_need_host($step['rules'] ?? null)) {
            $needHost = true;
        }
    }
    $fingerprintHashes = fingerprint_hashes_from_request(is_array($extraCtx) ? $extraCtx : null);
    if (!empty($extraCtx['fingerprint_hash'])) {
        $extraHex = normalize_fingerprint_hash((string) $extraCtx['fingerprint_hash']);
        if ($extraHex !== null && !in_array($extraHex, $fingerprintHashes, true)) {
            array_unshift($fingerprintHashes, $extraHex);
        }
    }
    if (!empty($extraCtx['fingerprint_hashes']) && is_array($extraCtx['fingerprint_hashes'])) {
        foreach ($extraCtx['fingerprint_hashes'] as $item) {
            $hex = normalize_fingerprint_hash(is_scalar($item) ? (string) $item : '');
            if ($hex !== null && !in_array($hex, $fingerprintHashes, true)) {
                $fingerprintHashes[] = $hex;
            }
        }
    }

    $ctx = [
        'client_ip' => $clientIp,
        'client_host' => resolve_client_host($clientIp, $needHost),
        'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? '',
        'referrer' => $_SERVER['HTTP_REFERER'] ?? '',
        'country_code' => $needCountry ? restriction_country_code_for_ip($clientIp) : null,
        'request_headers' => null,
        'now' => new DateTimeImmutable('now'),
        'fingerprint_hash' => $fingerprintHashes[0] ?? '',
        'fingerprint_hashes' => $fingerprintHashes,
    ];

    foreach ($loaded['chain'] as $step) {
        $rules = $step['rules'] ?? null;
        if (!is_array($rules) || $rules === []) {
            continue;
        }
        $result = evaluate_access_restrictions($rules, $ctx);
        if (empty($result['allowed'])) {
            $result['failedAt'] = $step['at'];
            return $result;
        }
    }

    return ['allowed' => true];
}
