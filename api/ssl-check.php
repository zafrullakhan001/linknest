<?php
// Simple local SSL checker using PHP stream sockets and OpenSSL
// Supports GET query params and POST JSON body (preferred via LinkNest Vite proxy).
// WAF detection: DNS CNAME chain (nslookup-style) + TLS issuer + probe
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=UTF-8');

set_exception_handler(static function (Throwable $e): void {
    if (!headers_sent()) {
        http_response_code(500);
    }
    echo json_encode([
        'ok' => false,
        'message' => 'Server error during SSL check',
        'error' => $e->getMessage(),
    ]);
    exit;
});

// LinkNest: guests allowed with per-session rate limit (same policy as URL probe).
if (session_status() === PHP_SESSION_NONE) {
    @session_start();
}

$sslCheckRateKey = 'ssl_check_probe_ts';
$sslCheckNow = time();
if (!isset($_SESSION[$sslCheckRateKey]) || !is_array($_SESSION[$sslCheckRateKey])) {
    $_SESSION[$sslCheckRateKey] = [];
}
$_SESSION[$sslCheckRateKey] = array_values(array_filter($_SESSION[$sslCheckRateKey], static function ($t) use ($sslCheckNow) {
    return ($sslCheckNow - (int)$t) < 60;
}));
if (count($_SESSION[$sslCheckRateKey]) >= 20) {
    http_response_code(429);
    echo json_encode(['ok' => false, 'message' => 'Too many SSL checks. Please wait a minute and try again.']);
    exit;
}
$_SESSION[$sslCheckRateKey][] = $sslCheckNow;

// Unlock session before slow OpenSSL/curl so other requests are not blocked.
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

// Merge POST JSON into $_GET so the rest of this file can keep using $_GET.
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $rawBody = file_get_contents('php://input');
    $postData = json_decode($rawBody !== false ? $rawBody : '', true);
    if (is_array($postData)) {
        foreach (['host', 'port', 'sni', 'path', 'dns_resolver', 'custom_dns_server', 'deep_scan', 'starttls', 'http_port'] as $key) {
            if (array_key_exists($key, $postData) && !isset($_GET[$key])) {
                $val = $postData[$key];
                if (is_bool($val)) {
                    $_GET[$key] = $val ? '1' : '0';
                } elseif (is_scalar($val)) {
                    $_GET[$key] = (string)$val;
                }
            }
        }
    }
}

$host = isset($_GET['host']) ? trim($_GET['host']) : '';
$port = isset($_GET['port']) ? (int) $_GET['port'] : 443;
$sniHost = isset($_GET['sni']) ? trim((string) $_GET['sni']) : '';
$probePath = isset($_GET['path']) ? (string) $_GET['path'] : '/';
$deepScan = isset($_GET['deep_scan']) && ($_GET['deep_scan'] === '1' || strtolower((string) $_GET['deep_scan']) === 'true');
$starttlsMode = strtolower(trim((string) ($_GET['starttls'] ?? '')));

set_time_limit($deepScan ? 120 : 90);

if ($host === '' || $port < 1 || $port > 65535) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'Invalid host or port']);
    exit;
}

$host = preg_replace('#^https?://#i', '', $host);
$host = preg_replace('#/.*$#', '', $host);
$host = preg_replace('#:.*$#', '', $host);
$host = strtolower(rtrim($host, '.'));

if ($sniHost !== '') {
    $sniHost = preg_replace('#^https?://#i', '', $sniHost);
    $sniHost = preg_replace('#/.*$#', '', $sniHost);
    $sniHost = strtolower(rtrim($sniHost, '.'));
}
$sniServerName = $sniHost !== '' ? $sniHost : $host;

if ($probePath === '' || $probePath[0] !== '/') {
    $probePath = '/' . ltrim($probePath, '/');
}
if (strlen($probePath) > 512) {
    $probePath = '/';
}

function ssl_check_dns_presets(): array {
    return [
        'system' => ['id' => 'system', 'label' => 'System DNS', 'server' => null],
        'google' => ['id' => 'google', 'label' => 'Google Public DNS (8.8.8.8)', 'server' => '8.8.8.8'],
        'cloudflare' => ['id' => 'cloudflare', 'label' => 'Cloudflare DNS (1.1.1.1)', 'server' => '1.1.1.1'],
        'quad9' => ['id' => 'quad9', 'label' => 'Quad9 DNS (9.9.9.9)', 'server' => '9.9.9.9'],
        'opendns' => ['id' => 'opendns', 'label' => 'OpenDNS (208.67.222.222)', 'server' => '208.67.222.222'],
    ];
}

function ssl_check_is_public_ip(string $ip): bool {
    return filter_var(
        $ip,
        FILTER_VALIDATE_IP,
        FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
    ) !== false;
}

function ssl_check_resolver_from_request(): array {
    $requested = strtolower(trim((string)($_GET['dns_resolver'] ?? 'system')));
    $presets = ssl_check_dns_presets();

    if ($requested === 'custom') {
        $custom = trim((string)($_GET['custom_dns_server'] ?? ''));
        if ($custom === '' || !ssl_check_is_public_ip($custom)) {
            return [
                'id' => 'system',
                'label' => 'System DNS',
                'server' => null,
                'requested' => 'custom',
                'error' => 'custom_dns_server must be a public DNS server IP address',
            ];
        }
        return [
            'id' => 'custom',
            'label' => 'Custom public DNS (' . $custom . ')',
            'server' => $custom,
            'requested' => 'custom',
        ];
    }

    if (!isset($presets[$requested])) {
        $requested = 'system';
    }

    return $presets[$requested] + ['requested' => $requested];
}

function ssl_check_dns_encode_name(string $hostname): string {
    $hostname = rtrim(strtolower($hostname), '.');
    $out = '';
    foreach (explode('.', $hostname) as $label) {
        $len = strlen($label);
        if ($len < 1 || $len > 63) {
            return '';
        }
        $out .= chr($len) . $label;
    }
    return $out . "\0";
}

function ssl_check_dns_read_name(string $packet, int &$offset, int $depth = 0): ?string {
    if ($depth > 12) {
        return null;
    }
    $labels = [];
    $len = strlen($packet);

    while ($offset < $len) {
        $octet = ord($packet[$offset]);
        if (($octet & 0xC0) === 0xC0) {
            if ($offset + 1 >= $len) {
                return null;
            }
            $ptr = (($octet & 0x3F) << 8) | ord($packet[$offset + 1]);
            $offset += 2;
            $ptrOffset = $ptr;
            $suffix = ssl_check_dns_read_name($packet, $ptrOffset, $depth + 1);
            if ($suffix === null) {
                return null;
            }
            if ($suffix !== '') {
                $labels[] = $suffix;
            }
            break;
        }
        if ($octet === 0) {
            $offset++;
            break;
        }
        $offset++;
        if ($offset + $octet > $len) {
            return null;
        }
        $labels[] = substr($packet, $offset, $octet);
        $offset += $octet;
    }

    return implode('.', $labels);
}

function ssl_check_dns_query_udp(string $server, string $hostname, int $type, int $timeoutSec = 3): array {
    $qname = ssl_check_dns_encode_name($hostname);
    if ($qname === '') {
        return ['records' => [], 'error' => 'invalid_hostname'];
    }

    $id = random_int(0, 65535);
    $packet = pack('nnnnnn', $id, 0x0100, 1, 0, 0, 0) . $qname . pack('nn', $type, 1);
    $remote = filter_var($server, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) ? 'udp://[' . $server . ']:53' : 'udp://' . $server . ':53';
    $errno = 0;
    $errstr = '';
    $socket = @stream_socket_client($remote, $errno, $errstr, $timeoutSec, STREAM_CLIENT_CONNECT);
    if (!$socket) {
        return ['records' => [], 'error' => 'dns_server_unreachable'];
    }
    stream_set_timeout($socket, $timeoutSec);
    fwrite($socket, $packet);
    $response = fread($socket, 4096);
    fclose($socket);

    if ($response === false || strlen($response) < 12) {
        return ['records' => [], 'error' => 'dns_no_response'];
    }

    $header = unpack('nid/nflags/nqd/nan/nns/nar', substr($response, 0, 12));
    if (!$header || (int)$header['id'] !== $id) {
        return ['records' => [], 'error' => 'dns_bad_response'];
    }

    $rcode = (int)$header['flags'] & 0x000F;
    if ($rcode !== 0) {
        return ['records' => [], 'error' => 'dns_rcode_' . $rcode];
    }

    $offset = 12;
    for ($i = 0; $i < (int)$header['qd']; $i++) {
        if (ssl_check_dns_read_name($response, $offset) === null) {
            return ['records' => [], 'error' => 'dns_bad_question'];
        }
        $offset += 4;
    }

    $records = [];
    $len = strlen($response);
    for ($i = 0; $i < (int)$header['an'] && $offset + 10 <= $len; $i++) {
        $name = ssl_check_dns_read_name($response, $offset);
        if ($name === null || $offset + 10 > $len) {
            break;
        }
        $rr = unpack('ntype/nclass/Nttl/nrdlength', substr($response, $offset, 10));
        $offset += 10;
        if (!$rr || $offset + (int)$rr['rdlength'] > $len) {
            break;
        }
        $rdataOffset = $offset;
        $rdata = substr($response, $offset, (int)$rr['rdlength']);
        $offset += (int)$rr['rdlength'];

        if ((int)$rr['type'] === 1 && strlen($rdata) === 4) {
            $ip = inet_ntop($rdata);
            if ($ip !== false) {
                $records[] = ['type' => 'A', 'host' => $name, 'ip' => $ip];
            }
        } elseif ((int)$rr['type'] === 28 && strlen($rdata) === 16) {
            $ip = inet_ntop($rdata);
            if ($ip !== false) {
                $records[] = ['type' => 'AAAA', 'host' => $name, 'ipv6' => $ip];
            }
        } elseif ((int)$rr['type'] === 5) {
            $targetOffset = $rdataOffset;
            $target = ssl_check_dns_read_name($response, $targetOffset);
            if ($target !== null && $target !== '') {
                $records[] = ['type' => 'CNAME', 'host' => $name, 'target' => rtrim(strtolower($target), '.')];
            }
        } elseif ((int)$rr['type'] === 257 && strlen($rdata) >= 2) {
            $flags = ord($rdata[0]);
            $tagLen = ord($rdata[1]);
            if (2 + $tagLen <= strlen($rdata)) {
                $records[] = [
                    'type' => 'CAA',
                    'flags' => $flags,
                    'tag' => substr($rdata, 2, $tagLen),
                    'value' => substr($rdata, 2 + $tagLen),
                ];
            }
        } elseif ((int)$rr['type'] === 43 && strlen($rdata) >= 5) {
            $records[] = ['type' => 'DS', 'key_tag' => unpack('n', substr($rdata, 0, 2))[1] ?? 0, 'raw' => bin2hex($rdata)];
        } elseif ((int)$rr['type'] === 48 && strlen($rdata) >= 4) {
            $records[] = ['type' => 'DNSKEY', 'flags' => ord($rdata[0]), 'raw' => bin2hex(substr($rdata, 0, min(32, strlen($rdata))))];
        } elseif ((int)$rr['type'] === 52 && strlen($rdata) >= 3) {
            $records[] = [
                'type' => 'TLSA',
                'usage' => ord($rdata[0]),
                'selector' => ord($rdata[1]),
                'matching_type' => ord($rdata[2]),
                'data' => bin2hex(substr($rdata, 3)),
            ];
        }
    }

    return ['records' => $records];
}

function ssl_check_dns_records(string $hostname, string $recordType, array $resolver): array {
    if (($resolver['id'] ?? 'system') === 'system') {
        $typeMap = ['CNAME' => DNS_CNAME, 'A' => DNS_A, 'AAAA' => DNS_AAAA];
        if ($recordType === 'CAA') {
            if (!defined('DNS_CAA')) {
                return ['records' => [], 'error' => 'caa_lookup_not_supported'];
            }
            $typeMap['CAA'] = DNS_CAA;
        }
        $records = @dns_get_record($hostname, $typeMap[$recordType] ?? DNS_A);
        if ($records === false) {
            return ['records' => [], 'error' => 'dns_lookup_failed'];
        }
        return ['records' => $records];
    }

    $typeMap = ['A' => 1, 'CNAME' => 5, 'AAAA' => 28, 'CAA' => 257];
    return ssl_check_dns_query_udp((string)$resolver['server'], $hostname, $typeMap[$recordType] ?? 1);
}

/**
 * Resolve CNAME chain (nslookup-style) to get final canonical name and aliases.
 * Returns ['chain' => [host, cname1, cname2, ...], 'canonical' => last hostname].
 */
function resolveDnsChain(string $host, array $resolver, int $maxHops = 10): array {
    $chain = [$host];
    $current = strtolower($host);
    $seen = [$current => true];
    $hops = 0;
    $error = null;
    while ($hops < $maxHops) {
        $lookup = ssl_check_dns_records($current, 'CNAME', $resolver);
        $records = $lookup['records'] ?? [];
        if (isset($lookup['error'])) {
            $error = $lookup['error'];
        }
        if ($records === []) {
            break;
        }
        $foundCname = false;
        foreach ($records as $r) {
            if (isset($r['type']) && $r['type'] === 'CNAME' && !empty($r['target'])) {
                $target = strtolower(rtrim($r['target'], '.'));
                if (!isset($seen[$target])) {
                    $chain[] = $target;
                    $seen[$target] = true;
                    $current = $target;
                    $foundCname = true;
                }
                break;
            }
        }
        if (!$foundCname) {
            break;
        }
        $hops++;
    }
    return [
        'chain' => $chain,
        'canonical' => $chain[count($chain) - 1],
        'error' => $error,
    ];
}

/**
 * Known WAF/CDN canonical hostname patterns (domain suffix or contains).
 * Order matters: first match wins for vendor name.
 */
$wafDnsPatterns = [
    'Akamai'       => ['akamaiedge.net', 'edgekey.net', 'akamai.net', 'akamaistream.net', 'akamaihd.net', 'akamaized.net'],
    'Cloudflare'   => ['cloudflare.com', 'cloudflare.net', 'cloudflaressl.com'],
    'AWS CloudFront' => ['cloudfront.net'],
    'AWS WAF'      => ['awsglobalaccelerator.com', 'amazonaws.com'],
    'Fastly'       => ['fastly.net', 'fastlylb.net', 'fastlyedge.net'],
    'Imperva'      => ['incapsula.com', 'imperva.com', 'incapdns.net'],
    'Azure CDN'    => ['azureedge.net', 'azure-api.net', 'trafficmanager.net', 'azurewebsites.net'],
    'Sucuri'       => ['sucuri.net', 'cloudproxy.net'],
    'Edgecast'     => ['edgecastcdn.net', 'ecdns.net', 'edgecast.com'],
    'StackPath'    => ['stackpathcdn.com', 'stackpath.com', 'stackpathdns.com'],
    'KeyCDN'       => ['kxcdn.com', 'keycdn.com'],
    'CDNetworks'   => ['cdnetworks.com', 'cdngc.net', 'cdnhwc.net'],
    'Limelight'    => ['llnwd.net', 'llnwi.net', 'limelight.com'],
    'Beluga'       => ['belugacdn.com'],
    'CacheFly'     => ['cachefly.net'],
    'Google Cloud' => ['googleedge.com', 'googlevideo.com', 'googleusercontent.com'],
    'BunnyCDN'     => ['b-cdn.net', 'bunnycdn.com'],
    'Netlify'      => ['netlify.app', 'netlify.com', 'netlifyglobalcdn.com'],
];

function matchWafFromDnsChain(array $chain, array $patterns): ?array {
    foreach ($chain as $hostname) {
        $h = strtolower($hostname);
        foreach ($patterns as $vendor => $suffixes) {
            foreach ($suffixes as $suffix) {
                if (str_ends_with($h, $suffix) || str_contains($h, '.' . $suffix)) {
                    return [
                        'detected' => true,
                        'vendor' => $vendor,
                        'reason' => 'DNS CNAME chain → ' . $hostname . ' (' . $vendor . ')',
                        'source' => 'dns',
                        'canonical' => $chain[count($chain) - 1],
                    ];
                }
            }
        }
    }
    return null;
}

function ssl_check_match_waf_from_headers(array $headers): ?array {
    $h = array_change_key_case($headers, CASE_LOWER);
    $server = strtolower((string)($h['server'] ?? ''));
    $via = strtolower((string)($h['via'] ?? ''));
    $xCache = strtolower((string)($h['x-cache'] ?? ''));
    $xServedBy = strtolower((string)($h['x-served-by'] ?? ''));
    $cookies = strtolower((string)($h['set-cookie'] ?? ''));
    $reportTo = strtolower((string)($h['report-to'] ?? ''));

    if (isset($h['cf-ray']) || isset($h['cf-cache-status']) || str_contains($server, 'cloudflare') || str_contains($cookies, '__cf_bm')) {
        return [
            'detected' => true,
            'vendor' => 'Cloudflare',
            'reason' => 'HTTP response headers include Cloudflare fingerprints',
            'source' => 'headers',
        ];
    }
    if (
        isset($h['akamai-grn']) ||
        isset($h['x-akamai-transformed']) ||
        str_contains($server, 'akamai') ||
        str_contains($server, 'ghost') ||
        str_contains($via, 'akamai') ||
        str_contains($xCache, 'akamai')
    ) {
        return [
            'detected' => true,
            'vendor' => 'Akamai',
            'reason' => 'HTTP response headers include Akamai fingerprints',
            'source' => 'headers',
        ];
    }
    if (str_contains($via, 'fastly') || str_contains($xServedBy, 'fastly') || str_contains($server, 'fastly')) {
        return [
            'detected' => true,
            'vendor' => 'Fastly',
            'reason' => 'HTTP response headers include Fastly fingerprints',
            'source' => 'headers',
        ];
    }
    if (isset($h['x-amz-cf-id']) || isset($h['x-amz-cf-pop']) || str_contains($via, 'cloudfront')) {
        return [
            'detected' => true,
            'vendor' => 'AWS CloudFront',
            'reason' => 'HTTP response headers include CloudFront fingerprints',
            'source' => 'headers',
        ];
    }
    if (isset($h['x-azure-ref']) || isset($h['x-msedge-ref'])) {
        return [
            'detected' => true,
            'vendor' => 'Azure WAF',
            'reason' => 'HTTP response headers include Azure edge fingerprints',
            'source' => 'headers',
        ];
    }
    if (isset($h['x-sucuri-id']) || str_contains($server, 'sucuri')) {
        return [
            'detected' => true,
            'vendor' => 'Sucuri',
            'reason' => 'HTTP response headers include Sucuri fingerprints',
            'source' => 'headers',
        ];
    }
    if (str_contains($cookies, 'incap_ses') || str_contains($cookies, '_incap_') || str_contains($server, 'imperva')) {
        return [
            'detected' => true,
            'vendor' => 'Imperva',
            'reason' => 'HTTP response headers include Imperva fingerprints',
            'source' => 'headers',
        ];
    }
    if (preg_match('/ts[a-z0-9]{3,}=/i', $cookies) || str_contains($server, 'big-ip')) {
        return [
            'detected' => true,
            'vendor' => 'F5 BIG-IP',
            'reason' => 'HTTP response headers include F5 BIG-IP fingerprints',
            'source' => 'headers',
        ];
    }
    if (str_contains($server, 'fortiweb')) {
        return [
            'detected' => true,
            'vendor' => 'Fortinet',
            'reason' => 'HTTP response headers include FortiWeb fingerprints',
            'source' => 'headers',
        ];
    }
    if (isset($h['x-nx']) || str_contains($server, 'netscaler')) {
        return [
            'detected' => true,
            'vendor' => 'Citrix',
            'reason' => 'HTTP response headers include Citrix NetScaler fingerprints',
            'source' => 'headers',
        ];
    }
    if (str_contains($cookies, 'barra_counter_session') || str_contains($server, 'barracudawaf')) {
        return [
            'detected' => true,
            'vendor' => 'Barracuda',
            'reason' => 'HTTP response headers include Barracuda WAF fingerprints',
            'source' => 'headers',
        ];
    }
    if (str_contains($reportTo, 'cloudflare')) {
        return [
            'detected' => true,
            'vendor' => 'Cloudflare',
            'reason' => 'HTTP report-to headers reference Cloudflare',
            'source' => 'headers',
        ];
    }

    return null;
}

/**
 * @return array{records: list<array{flags:int,tag:string,value:string}>, error?: string}
 */
function ssl_check_fetch_caa(string $hostname, array $resolver): array {
    // Windows/XAMPP builds often omit DNS_CAA; PHP 8+ rejects a raw int for $type
    $lookup = ssl_check_dns_records($hostname, 'CAA', $resolver);
    $records = $lookup['records'] ?? [];
    $out = [];
    foreach ($records as $r) {
        if (($r['type'] ?? '') !== 'CAA') {
            continue;
        }
        $out[] = [
            'flags' => (int)($r['flags'] ?? 0),
            'tag' => (string)($r['tag'] ?? ''),
            'value' => (string)($r['value'] ?? ''),
        ];
    }
    $result = ['records' => $out];
    if (isset($lookup['error'])) {
        $result['error'] = $lookup['error'];
    }
    return $result;
}

function ssl_check_parse_hsts(?string $value): ?array {
    if ($value === null || $value === '') {
        return null;
    }
    $lower = strtolower($value);
    $maxAge = null;
    if (preg_match('/max-age=(\d+)/i', $value, $m)) {
        $maxAge = (int)$m[1];
    }
    return [
        'raw' => $value,
        'max_age' => $maxAge,
        'include_subdomains' => str_contains($lower, 'includesubdomains'),
        'preload' => str_contains($lower, 'preload'),
    ];
}

function ssl_check_curl_resolve_entry(string $host, int $port, ?string $ip): ?string {
    if ($ip === null || !filter_var($ip, FILTER_VALIDATE_IP)) {
        return null;
    }
    $address = filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) ? '[' . $ip . ']' : $ip;
    return $host . ':' . $port . ':' . $address;
}

function ssl_check_apply_curl_resolve($ch, string $host, int $port, ?string $ip): void {
    $entry = ssl_check_curl_resolve_entry($host, $port, $ip);
    if ($entry !== null) {
        curl_setopt($ch, CURLOPT_RESOLVE, [$entry]);
    }
}

function ssl_check_stream_endpoint_host(string $host): string {
    return filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) ? '[' . $host . ']' : $host;
}

function ssl_check_probe_http_upgrade(string $host, int $httpPort = 80, ?string $resolvedIp = null, string $path = '/'): array {
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'message' => 'curl not available'];
    }
    $portPart = $httpPort !== 80 ? ':' . $httpPort : '';
    $url = 'http://' . $host . $portPart . $path;
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_NOBODY => true,
        CURLOPT_HEADER => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 12,
        CURLOPT_TIMEOUT => 8,
    ]);
    ssl_check_apply_curl_resolve($ch, $host, $httpPort, $resolvedIp);
    curl_exec($ch);
    $effective = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL) ?: '';
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    $finalHttps = str_starts_with(strtolower($effective), 'https://');
    return [
        'ok' => true,
        'start_url' => $url,
        'effective_url' => $effective,
        'http_code' => $code,
        'ends_on_https' => $finalHttps,
        'curl_error' => $err !== '' ? $err : null,
    ];
}

function ssl_check_mixed_content_hint(string $host, int $port, ?string $resolvedIp = null, string $path = '/'): array {
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'message' => 'curl not available'];
    }
    $url = "https://{$host}:{$port}{$path}";
    $body = '';
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_HEADER => false,
        CURLOPT_WRITEFUNCTION => static function ($ch, $data) use (&$body) {
            if (strlen($body) > 262144) {
                return -1;
            }
            $body .= $data;
            return strlen($data);
        },
    ]);
    ssl_check_apply_curl_resolve($ch, $host, $port, $resolvedIp);
    curl_exec($ch);
    curl_close($ch);
    $count = preg_match_all('#["\'\(]\s*http://#i', $body) ?: 0;
    return [
        'ok' => true,
        'sample_url' => $url,
        'truncated_html_bytes' => strlen($body),
        'http_url_like_hits' => $count,
        'hint' => $count > 0
            ? 'HTML may reference http:// resources (best-effort; verify in browser DevTools).'
            : 'No obvious http:// asset references in the first portion of HTML.',
    ];
}

/**
 * Run HTTP→HTTPS upgrade probe and mixed-content HTML sample concurrently (same outcomes as sequential calls).
 *
 * @return array{http_upgrade: array, mixed: array}
 */
function ssl_check_http_upgrade_and_mixed_parallel(string $host, int $port, int $httpPort, ?string $resolvedIp = null, string $path = '/'): array {
    if (!function_exists('curl_init')) {
        return [
            'http_upgrade' => ssl_check_probe_http_upgrade($host, $httpPort, $resolvedIp, $path),
            'mixed' => ssl_check_mixed_content_hint($host, $port, $resolvedIp, $path),
        ];
    }
    if (!function_exists('curl_multi_init')) {
        return [
            'http_upgrade' => ssl_check_probe_http_upgrade($host, $httpPort, $resolvedIp, $path),
            'mixed' => ssl_check_mixed_content_hint($host, $port, $resolvedIp, $path),
        ];
    }

    $portPart = $httpPort !== 80 ? ':' . $httpPort : '';
    $urlHttp = 'http://' . $host . $portPart . $path;
    $urlHttps = "https://{$host}:{$port}{$path}";

    $bodyMixed = '';
    $chHttp = curl_init();
    curl_setopt_array($chHttp, [
        CURLOPT_URL => $urlHttp,
        CURLOPT_NOBODY => true,
        CURLOPT_HEADER => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 12,
        CURLOPT_TIMEOUT => 8,
    ]);
    ssl_check_apply_curl_resolve($chHttp, $host, $httpPort, $resolvedIp);

    $chHttps = curl_init();
    curl_setopt_array($chHttps, [
        CURLOPT_URL => $urlHttps,
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_HEADER => false,
        CURLOPT_WRITEFUNCTION => static function ($ch, $data) use (&$bodyMixed) {
            if (strlen($bodyMixed) > 262144) {
                return -1;
            }
            $bodyMixed .= $data;
            return strlen($data);
        },
    ]);
    ssl_check_apply_curl_resolve($chHttps, $host, $port, $resolvedIp);

    $mh = curl_multi_init();
    curl_multi_add_handle($mh, $chHttp);
    curl_multi_add_handle($mh, $chHttps);
    $running = null;
    do {
        $mrc = curl_multi_exec($mh, $running);
    } while ($mrc === CURLM_CALL_MULTI_PERFORM);

    while ($running > 0 && $mrc === CURLM_OK) {
        if (curl_multi_select($mh, 1.0) === -1) {
            break;
        }
        do {
            $mrc = curl_multi_exec($mh, $running);
        } while ($mrc === CURLM_CALL_MULTI_PERFORM);
    }

    $effective = curl_getinfo($chHttp, CURLINFO_EFFECTIVE_URL) ?: '';
    $code = (int)curl_getinfo($chHttp, CURLINFO_HTTP_CODE);
    $errHttp = curl_error($chHttp);
    curl_multi_remove_handle($mh, $chHttp);
    curl_close($chHttp);

    curl_multi_remove_handle($mh, $chHttps);
    curl_close($chHttps);
    curl_multi_close($mh);

    $finalHttps = str_starts_with(strtolower($effective), 'https://');
    $httpUpgrade = [
        'ok' => true,
        'start_url' => $urlHttp,
        'effective_url' => $effective,
        'http_code' => $code,
        'ends_on_https' => $finalHttps,
        'curl_error' => $errHttp !== '' ? $errHttp : null,
    ];

    $count = preg_match_all('#["\'\(]\s*http://#i', $bodyMixed) ?: 0;
    $mixed = [
        'ok' => true,
        'sample_url' => $urlHttps,
        'truncated_html_bytes' => strlen($bodyMixed),
        'http_url_like_hits' => $count,
        'hint' => $count > 0
            ? 'HTML may reference http:// resources (best-effort; verify in browser DevTools).'
            : 'No obvious http:// asset references in the first portion of HTML.',
    ];

    return ['http_upgrade' => $httpUpgrade, 'mixed' => $mixed];
}

function ssl_check_tls_report(?string $protocol, ?string $cipher): array {
    $rows = [];
    $p = $protocol ?? '';
    $c = strtolower($cipher ?? '');
    $weak = false;
    $weakReasons = [];
    if ($c !== '') {
        foreach (['rc4', 'des ', 'des-', '3des', 'md5', 'null', 'anon', 'export'] as $w) {
            if (str_contains($c, $w)) {
                $weak = true;
                $weakReasons[] = 'Cipher name suggests a legacy or weak algorithm.';
                break;
            }
        }
    }
    if ($p !== '' && !str_contains($p, '1.2') && !str_contains($p, '1.3')) {
        $weak = true;
        $weakReasons[] = 'Prefer TLS 1.2+; TLS 1.3 is recommended for new deployments.';
    }
    $remediation = [];
    if ($weak) {
        $remediation[] = 'Disable TLS 1.0/1.1 and weak cipher suites on the server.';
        $remediation[] = 'Prefer ECDHE key exchange with AES-GCM or ChaCha20-Poly1305.';
    } else {
        $remediation[] = 'Keep TLS configuration aligned with your web server or load balancer vendor guidance.';
    }
    $protoSev = 'info';
    if ($p !== '' && str_contains($p, '1.3')) {
        $protoSev = 'good';
    } elseif ($p !== '' && str_contains($p, '1.2')) {
        $protoSev = 'ok';
    } elseif ($p !== '') {
        $protoSev = 'warn';
    }
    $rows[] = [
        'aspect' => 'Negotiated protocol',
        'value' => $p !== '' ? $p : 'unknown',
        'severity' => $protoSev,
    ];
    $rows[] = [
        'aspect' => 'Negotiated cipher',
        'value' => $cipher !== null && $cipher !== '' ? $cipher : 'unknown',
        'severity' => $weak ? 'bad' : 'good',
    ];
    return [
        'rows' => $rows,
        'weak' => $weak,
        'weak_reasons' => $weakReasons,
        'remediation' => $remediation,
    ];
}

/**
 * Single openssl s_client run: OCSP stapling + truncated output for debugging.
 *
 * @return array{stapled: bool|null, status: string, detail: string, excerpt: string|null}
 */
function ssl_check_openssl_s_client(string $host, int $port, int $timeoutSec = 8, ?string $connectIp = null): array {
    $bin = function_exists('ssl_check_openssl_bin') ? ssl_check_openssl_bin() : null;
    if ($bin === null) {
        $bin = getenv('OPENSSL_BIN') ?: 'openssl';
        if (!function_exists('ssl_check_openssl_bin')) {
            $test = [];
            @exec(escapeshellarg($bin) . ' version 2>&1', $test, $code);
            if ($code !== 0) {
                return [
                    'stapled' => null,
                    'status' => 'unknown',
                    'detail' => 'OpenSSL CLI not found (set OPENSSL_BIN or install XAMPP apache/bin/openssl.exe)',
                    'excerpt' => null,
                ];
            }
        }
    }
    $descriptorspec = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $connectHost = $connectIp !== null ? ssl_check_stream_endpoint_host($connectIp) : $host;
    $connect = escapeshellarg("{$connectHost}:{$port}");
    $sni = escapeshellarg($host);
    $cmd = escapeshellarg($bin) . ' s_client -connect ' . $connect . ' -servername ' . $sni . ' -status';
    $proc = @proc_open($cmd, $descriptorspec, $pipes, null, null);
    if (!is_resource($proc)) {
        return [
            'stapled' => null,
            'status' => 'unknown',
            'detail' => 'Could not start OpenSSL CLI (proc_open or executable)',
            'excerpt' => null,
        ];
    }
    stream_set_blocking($pipes[0], true);
    stream_set_blocking($pipes[1], true);
    stream_set_blocking($pipes[2], true);
    fwrite($pipes[0], "Q\n");
    fclose($pipes[0]);
    $start = microtime(true);
    $out = '';
    while (microtime(true) - $start < $timeoutSec) {
        $chunk = stream_get_contents($pipes[1]);
        $out .= $chunk;
        if ($out !== '' && (str_contains($out, 'CONNECTED') || str_contains($out, 'Server certificate'))) {
            break;
        }
        usleep(100000);
    }
    usleep(250000);
    $out .= stream_get_contents($pipes[1]);
    $err = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($proc);
    $full = $out . $err;
    $maxExcerpt = 4096;
    $excerpt = strlen($full) > $maxExcerpt ? substr($full, -$maxExcerpt) : $full;
    $excerpt = $excerpt !== '' ? $excerpt : null;

    if (stripos($full, '\'openssl\' is not recognized') !== false || preg_match('/not recognized as an internal or external command/i', $full)) {
        return [
            'stapled' => null,
            'status' => 'unknown',
            'detail' => 'openssl not found in PATH (set OPENSSL_BIN if needed)',
            'excerpt' => $excerpt,
        ];
    }
    if (stripos($full, 'OCSP response: no response sent') !== false) {
        return [
            'stapled' => false,
            'status' => 'ok',
            'detail' => 'No OCSP staple offered by server',
            'excerpt' => $excerpt,
        ];
    }
    if (preg_match('/OCSP Response Status:\s*successful/i', $full)) {
        return [
            'stapled' => true,
            'status' => 'ok',
            'detail' => 'OCSP staple present',
            'excerpt' => $excerpt,
        ];
    }
    return [
        'stapled' => null,
        'status' => 'unknown',
        'detail' => 'Could not determine OCSP stapling from openssl s_client',
        'excerpt' => $excerpt,
    ];
}

/**
 * @return array{ipv4: string|null, ipv6: string|null, errors: list<string>}
 */
function ssl_check_resolve_ips(string $hostname, array $resolver): array {
    $ipv4 = null;
    $ipv6 = null;
    $errors = [];
    $lookups = [
        ssl_check_dns_records($hostname, 'A', $resolver),
        ssl_check_dns_records($hostname, 'AAAA', $resolver),
    ];
    foreach ($lookups as $lookup) {
        if (isset($lookup['error'])) {
            $errors[] = $lookup['error'];
        }
        foreach (($lookup['records'] ?? []) as $r) {
            if (($r['type'] ?? '') === 'A' && !empty($r['ip']) && $ipv4 === null) {
                $ipv4 = $r['ip'];
            }
            if (($r['type'] ?? '') === 'AAAA' && !empty($r['ipv6']) && $ipv6 === null) {
                $ipv6 = $r['ipv6'];
            }
        }
    }
    return ['ipv4' => $ipv4, 'ipv6' => $ipv6, 'errors' => array_values(array_unique($errors))];
}

/**
 * @param OpenSSLCertificate|resource|null $cert
 */
function ssl_check_export_pem($cert): ?string {
    if ($cert === null) {
        return null;
    }
    $pem = '';
    if (!@openssl_x509_export($cert, $pem)) {
        return null;
    }
    return $pem !== '' ? $pem : null;
}

/**
 * Leaf first, then intermediates (PHP peer_certificate_chain order).
 *
 * @param list<OpenSSLCertificate|resource> $chainCerts
 * @return list<string>
 */
function ssl_check_export_chain_pems(array $chainCerts): array {
    $out = [];
    foreach ($chainCerts as $c) {
        $p = ssl_check_export_pem($c);
        if ($p !== null) {
            $out[] = $p;
        }
    }
    return $out;
}

require_once __DIR__ . '/ssl-check-lib.php';

$blockReason = ssl_check_is_blocked_target($host);
if ($blockReason !== null) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => $blockReason]);
    exit;
}
if ($sniHost !== '' && ssl_check_is_blocked_target($sniHost) !== null) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'SNI hostname is not allowed']);
    exit;
}

// Run DNS resolution for WAF detection (nslookup-style)
$dnsResolver = ssl_check_resolver_from_request();
$dnsChain = resolveDnsChain($host, $dnsResolver);
$wafFromDns = matchWafFromDnsChain($dnsChain['chain'], $wafDnsPatterns);
$resolvedIps = ssl_check_resolve_ips($host, $dnsResolver);
if (($resolvedIps['ipv4'] === null && $resolvedIps['ipv6'] === null) && ($dnsChain['canonical'] ?? $host) !== $host) {
    $resolvedIps = ssl_check_resolve_ips($dnsChain['canonical'], $dnsResolver);
}
$candidateConnectIp = ($dnsResolver['id'] ?? 'system') !== 'system' ? ($resolvedIps['ipv4'] ?? $resolvedIps['ipv6'] ?? null) : null;
// Allow intranet/private connect IPs; still refuse loopback / link-local / metadata.
$connectIp = ($candidateConnectIp !== null && !ssl_check_is_dangerous_ip($candidateConnectIp)) ? $candidateConnectIp : null;
$tlsConnectHost = $connectIp !== null ? ssl_check_stream_endpoint_host($connectIp) : $host;

$ctx = stream_context_create([
    'ssl' => [
        'capture_peer_cert' => true,
        'capture_peer_cert_chain' => true,
        'verify_peer' => false,
        'verify_peer_name' => false,
        'allow_self_signed' => true,
        'SNI_enabled' => true,
        'SNI_server_name' => $sniServerName,
        'peer_name' => $sniServerName,
    ],
]);

$errNo = 0;
$errStr = '';
$timeout = 15;
$client = @stream_socket_client(
    "ssl://{$tlsConnectHost}:{$port}",
    $errNo,
    $errStr,
    $timeout,
    STREAM_CLIENT_CONNECT,
    $ctx
);

if (!$client) {
    http_response_code(502);
    echo json_encode([
        'ok' => false,
        'message' => "Connection failed: {$errStr}",
        'dns_resolver' => $dnsResolver,
        'resolved_ipv4' => $resolvedIps['ipv4'],
        'resolved_ipv6' => $resolvedIps['ipv6'],
    ]);
    exit;
}

stream_set_timeout($client, $timeout);
$params = stream_context_get_params($client);
$crypto = stream_get_meta_data($client);

$cert = $params['options']['ssl']['peer_certificate'] ?? null;
$chainResources = $params['options']['ssl']['peer_certificate_chain'] ?? null;
if (!is_array($chainResources)) {
    $chainResources = [];
}
$peerCertificatePem = ssl_check_export_pem($cert);
$chainPems = ssl_check_export_chain_pems($chainResources);
if ($peerCertificatePem !== null && $chainPems === []) {
    $chainPems = [$peerCertificatePem];
}

$parsed = $cert ? openssl_x509_parse($cert, false) : null;

$subject = $parsed['subject'] ?? [];
$issuer = $parsed['issuer'] ?? [];
$validFrom = isset($parsed['validFrom_time_t']) ? gmdate('c', $parsed['validFrom_time_t']) : null;
$validTo = isset($parsed['validTo_time_t']) ? gmdate('c', $parsed['validTo_time_t']) : null;

$sans = [];
if (isset($parsed['extensions']['subjectAltName'])) {
    $parts = explode(',', $parsed['extensions']['subjectAltName']);
    foreach ($parts as $part) {
        $part = trim($part);
        if (stripos($part, 'DNS:') === 0) {
            $sans[] = substr($part, 4);
        }
    }
}

$protocol = $crypto['crypto']['protocol'] ?? null;
$cipher = $crypto['crypto']['cipher_name'] ?? null;

fclose($client);

// Basic HTTPS header probe (best-effort)
$headers = [];
$headerFindings = [];
$waf = null;
$targetUrl = "https://{$host}:{$port}{$probePath}";
$httpsEffectiveUrl = null;
$httpsEffectiveHost = null;

if (function_exists('curl_init')) {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $targetUrl,
        CURLOPT_NOBODY => true,
        CURLOPT_HEADER => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
    ]);
    ssl_check_apply_curl_resolve($ch, $host, $port, $connectIp);
    $rawHeaders = curl_exec($ch);
    $httpsEffectiveUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL) ?: null;
    if (is_string($httpsEffectiveUrl) && $httpsEffectiveUrl !== '') {
        $parsedEffectiveHost = parse_url($httpsEffectiveUrl, PHP_URL_HOST);
        if (is_string($parsedEffectiveHost) && $parsedEffectiveHost !== '') {
            $httpsEffectiveHost = strtolower($parsedEffectiveHost);
        }
    }
    if ($rawHeaders !== false) {
        foreach (explode("\n", $rawHeaders) as $line) {
            $parts = explode(':', $line, 2);
            if (count($parts) === 2) {
                $name = trim($parts[0]);
                $value = trim($parts[1]);
                if ($name !== '' && $value !== '') {
                    $headers[strtolower($name)] = $value;
                }
            }
        }
    }
    curl_close($ch);
}

$headerFindings = ssl_check_analyze_headers($headers);

// Simple WAF fingerprint: prefer DNS CNAME chain (nslookup-style), then TLS issuer, then probe
$headerLookup = array_change_key_case($headers, CASE_LOWER);
$wafStatus = [
    'detected' => false,
    'vendor' => null,
    'inconclusive' => false,
    'reason' => 'No known fingerprints matched',
    'source' => null,
];

// 0. DNS-based detection first (precise, like nslookup → akamaiedge.net / edgekey.net)
if ($wafFromDns !== null) {
    $wafStatus = [
        'detected' => true,
        'vendor' => $wafFromDns['vendor'],
        'inconclusive' => false,
        'reason' => $wafFromDns['reason'],
        'source' => 'dns',
    ];
}

// 0b. If HTTPS redirects to another hostname, inspect that public DNS chain too.
// This catches common apex → www flows where only the final hostname exposes the CDN/WAF CNAME.
$redirectDnsChain = null;
if (!$wafStatus['detected'] && $httpsEffectiveHost !== null && $httpsEffectiveHost !== strtolower($host)) {
    $redirectDnsChain = resolveDnsChain($httpsEffectiveHost, $dnsResolver);
    $wafFromRedirectDns = matchWafFromDnsChain($redirectDnsChain['chain'], $wafDnsPatterns);
    if ($wafFromRedirectDns !== null) {
        $wafStatus = [
            'detected' => true,
            'vendor' => $wafFromRedirectDns['vendor'],
            'inconclusive' => false,
            'reason' => 'Redirected host DNS CNAME chain (' . $httpsEffectiveHost . ') → ' . $wafFromRedirectDns['canonical'] . ' (' . $wafFromRedirectDns['vendor'] . ')',
            'source' => 'redirect_dns',
        ];
    }
}

// 0c. Header-based detection catches CDN/WAFs that do not expose a useful CNAME.
$wafFromHeaders = ssl_check_match_waf_from_headers($headers);
if (!$wafStatus['detected'] && $wafFromHeaders !== null) {
    $wafStatus = [
        'detected' => true,
        'vendor' => $wafFromHeaders['vendor'],
        'inconclusive' => false,
        'reason' => $wafFromHeaders['reason'],
        'source' => 'headers',
    ];
}

$tlsIssuerArr = $issuer ? array_change_key_case($issuer, CASE_LOWER) : [];
$tlsIssuer = "";
if (isset($tlsIssuerArr['o'])) $tlsIssuer = $tlsIssuerArr['o'];
else if (isset($tlsIssuerArr['organizationname'])) $tlsIssuer = $tlsIssuerArr['organizationname'];

// 1. TLS issuer fallback when DNS did not identify a WAF
if (!$wafStatus['detected']) {
    if (strpos($tlsIssuer, 'akamai') !== false) {
        $wafStatus = ['detected' => true, 'vendor' => 'Akamai', 'inconclusive' => false, 'reason' => "TLS cert issued by Akamai → $tlsIssuer", 'source' => 'tls'];
    } else if (strpos($tlsIssuer, 'microsoft') !== false) {
        $wafStatus = ['detected' => true, 'vendor' => 'Azure WAF', 'inconclusive' => false, 'reason' => "TLS cert issued by Microsoft → $tlsIssuer", 'source' => 'tls'];
    } else if (strpos($tlsIssuer, "let's encrypt") !== false) {
        $wafStatus = ['detected' => true, 'vendor' => 'Potential', 'inconclusive' => false, 'reason' => "TLS cert issued by Let's Encrypt (common for WAF infrastructure)", 'source' => 'tls'];
    }
}

// 2. Probe-based WAF check only when DNS and TLS did not identify a WAF
if (!$wafStatus['detected'] && function_exists('curl_init')) {
    $probeUrl = "https://{$host}:{$port}/?waf_test=<script>alert(1)</script>";
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $probeUrl,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HEADER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    ]);
    ssl_check_apply_curl_resolve($ch, $host, $port, $connectIp);
    
    $fullProbe = curl_exec($ch);
    $probeHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $hSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);

    if ($fullProbe !== false) {
        $pHeadersRaw = substr($fullProbe, 0, $hSize);
        $pBody = strtolower(substr($fullProbe, $hSize));
        
        $pHeaders = [];
        foreach (explode("\r\n", $pHeadersRaw) as $line) {
            $parts = explode(':', $line, 2);
            if (count($parts) === 2) {
                $pHeaders[strtolower(trim($parts[0]))] = strtolower(trim($parts[1]));
            }
        }
        $pCookies = $pHeaders['set-cookie'] ?? '';

        // Akamai
        if (strpos($pBody, 'reference #') !== false || strpos($pBody, 'akamai') !== false || strpos($pHeaders['server'] ?? '', 'akamai') !== false || strpos($pHeaders['server'] ?? '', 'ghost') !== false) {
            $wafStatus = ['detected' => true, 'vendor' => 'Akamai', 'inconclusive' => false, 'reason' => 'Blocked with Akamai-style response or server signature', 'source' => 'probe'];
        }
        // Cloudflare
        else if (isset($pHeaders['cf-ray']) || strpos($pBody, 'cloudflare') !== false || strpos($pBody, 'attention required') !== false || strpos($pHeaders['server'] ?? '', 'cloudflare') !== false) {
             $wafStatus = ['detected' => true, 'vendor' => 'Cloudflare', 'inconclusive' => false, 'reason' => 'Cloudflare challenge or server signature detected', 'source' => 'probe'];
        }
        // AWS WAF
        else if (isset($pHeaders['x-amzn-requestid']) || strpos($pBody, 'aws waf') !== false || strpos($pBody, 'the request was blocked') !== false || strpos($pHeaders['server'] ?? '', 'awselb') !== false) {
            $wafStatus = ['detected' => true, 'vendor' => 'AWS WAF', 'inconclusive' => false, 'reason' => 'AWS WAF block page or ELB signature detected', 'source' => 'probe'];
        }
        // F5 BIG-IP ASM
        else if (preg_match('/ts[a-z0-9]{3,}=/i', $pCookies) || strpos($pBody, 'big-ip') !== false || strpos($pBody, 'the requested url was rejected') !== false || strpos($pHeaders['server'] ?? '', 'big-ip') !== false) {
            $wafStatus = ['detected' => true, 'vendor' => 'F5 BIG-IP', 'inconclusive' => false, 'reason' => 'F5 ASM fingerprint detected', 'source' => 'probe'];
        }
        // Imperva
        else if (strpos($pCookies, 'incap_ses') !== false || strpos($pCookies, '_incap_') !== false || strpos($pBody, 'imperva') !== false || strpos($pHeaders['server'] ?? '', 'imperva') !== false) {
            $wafStatus = ['detected' => true, 'vendor' => 'Imperva', 'inconclusive' => false, 'reason' => 'Imperva protection detected', 'source' => 'probe'];
        }
        // Fastly
        else if (strpos($pHeaders['via'] ?? '', 'fastly') !== false || strpos($pHeaders['x-served-by'] ?? '', 'fastly') !== false || strpos($pHeaders['server'] ?? '', 'fastly') !== false) {
            $wafStatus = ['detected' => true, 'vendor' => 'Fastly', 'inconclusive' => false, 'reason' => 'Fastly edge detected', 'source' => 'probe'];
        }
        // Azure WAF
        else if (isset($pHeaders['x-azure-ref']) || (strpos($pHeaders['server'] ?? '', 'microsoft-iis') !== false && isset($pHeaders['x-azure-ref']))) {
            $wafStatus = ['detected' => true, 'vendor' => 'Azure WAF', 'inconclusive' => false, 'reason' => 'Azure WAF detected', 'source' => 'probe'];
        }
        // Sucuri
        else if (isset($pHeaders['x-sucuri-id']) || strpos($pBody, 'access denied - sucuri website firewall') !== false || strpos($pHeaders['server'] ?? '', 'sucuri') !== false) {
            $wafStatus = ['detected' => true, 'vendor' => 'Sucuri', 'inconclusive' => false, 'reason' => 'Sucuri block page detected', 'source' => 'probe'];
        }
        // Fortinet
        else if (strpos($pHeaders['server'] ?? '', 'fortiweb') !== false) {
            $wafStatus = ['detected' => true, 'vendor' => 'Fortinet', 'inconclusive' => false, 'reason' => 'FortiWeb signature detected', 'source' => 'probe'];
        }
        // Citrix
        else if (isset($pHeaders['x-nx']) || strpos($pHeaders['server'] ?? '', 'netscaler') !== false) {
             $wafStatus = ['detected' => true, 'vendor' => 'Citrix', 'inconclusive' => false, 'reason' => 'NetScaler signature detected', 'source' => 'probe'];
        }
        // Barracuda
        else if (strpos($pCookies, 'barra_counter_session') !== false || strpos($pHeaders['server'] ?? '', 'barracudawaf') !== false) {
            $wafStatus = ['detected' => true, 'vendor' => 'Barracuda', 'inconclusive' => false, 'reason' => 'Barracuda WAF signature detected', 'source' => 'probe'];
        }
        // HTTP 403/406 alone — inconclusive (not a specific WAF fingerprint)
        else if (in_array($probeHttpCode, [403, 406], true)) {
            $wafStatus = [
                'detected' => true,
                'vendor' => null,
                'inconclusive' => true,
                'reason' => 'HTTP ' . $probeHttpCode . ' on the probe URL alone does not prove a WAF; it may be URL policy, authentication, or blocking of suspicious query strings.',
                'source' => 'probe',
            ];
        }
    }
}

$httpPort = isset($_GET['http_port']) ? max(1, min(65535, (int)$_GET['http_port'])) : 80;
$caa = ssl_check_fetch_caa($host, $dnsResolver);
$hstsParsed = ssl_check_parse_hsts($headers['strict-transport-security'] ?? null);
$parallelProbes = ssl_check_http_upgrade_and_mixed_parallel($host, $port, $httpPort, $connectIp, $probePath);
$httpUpgrade = $parallelProbes['http_upgrade'];
$mixed = $parallelProbes['mixed'];
$tlsReport = ssl_check_tls_report($protocol, $cipher);
$opensslClient = ssl_check_openssl_s_client($sniServerName, $port, 8, $connectIp);
$ocspStapling = [
    'stapled' => $opensslClient['stapled'],
    'status' => $opensslClient['status'],
    'detail' => $opensslClient['detail'],
];
$opensslExcerpt = $opensslClient['excerpt'];

$probeTargets = [
    'sni' => $sniServerName,
    'tls_endpoint' => "ssl://{$tlsConnectHost}:{$port}",
    'https_probe_url' => $targetUrl,
    'https_effective_url' => $httpsEffectiveUrl,
    'http_probe_url' => 'http://' . $host . ($httpPort !== 80 ? ':' . $httpPort : '') . $probePath,
    'waf_probe_url' => "https://{$host}:{$port}/?waf_test=" . rawurlencode('<script>alert(1)</script>'),
];
if ($connectIp !== null) {
    $probeTargets['forced_dns_ip'] = $connectIp;
}

$caaSummary = 'no_caa_records';
if (!empty($caa['records'])) {
    $tags = array_unique(array_column($caa['records'], 'tag'));
    $caaSummary = 'records_present: ' . implode(', ', $tags);
}

$chainTrust = ssl_check_verify_chain($chainPems);
$certMeta = $peerCertificatePem !== null ? ssl_check_cert_meta($cert ?? null) : null;
$hstsPreload = ssl_check_hsts_preload_readiness($hstsParsed);
$dnssec = ssl_check_dnssec_hints($host, $dnsResolver);
$spkiHex = $peerCertificatePem !== null ? ssl_check_spki_sha256_hex_from_pem($peerCertificatePem) : null;
$dane = ssl_check_dane_tlsa($host, $port, $dnsResolver, $spkiHex);
// Protocol matrix: always run when OpenSSL CLI is available (SSL Labs–style); deep_scan flag kept for future extras.
$deepTls = ssl_check_deep_tls_matrix($sniServerName, $port, $connectIp, $deepScan ? 8 : 5);
if (!$deepScan && ($deepTls['rows'] ?? []) === []) {
    $deepTls = null;
}

$posture = [
    'hsts_present' => array_key_exists('strict-transport-security', $headers),
    'hsts_parsed' => $hstsParsed,
    'hsts_preload' => $hstsPreload,
];

echo json_encode([
    'ok' => true,
    'message' => 'Check completed',
    'host' => $host,
    'port' => $port,
    'protocol' => $protocol,
    'cipher' => $cipher,
    'headers' => $headers,
    'headerFindings' => $headerFindings,
    'dns_resolver' => $dnsResolver,
    'dns_chain' => $dnsChain['chain'],
    'dns_canonical' => $dnsChain['canonical'],
    'redirect_dns_chain' => $redirectDnsChain['chain'] ?? null,
    'redirect_dns_canonical' => $redirectDnsChain['canonical'] ?? null,
    'waf' => ($wafStatus['detected'] && ($wafStatus['vendor'] ?? '') !== '') ? $wafStatus['vendor'] : null,
    'waf_info' => $wafStatus,
    'probe_targets' => $probeTargets,
    'resolved_ipv4' => $resolvedIps['ipv4'],
    'resolved_ipv6' => $resolvedIps['ipv6'],
    'peer_certificate_pem' => $peerCertificatePem,
    'chain_pems' => $chainPems,
    'openssl_excerpt' => $opensslExcerpt,
    'certificate' => [
        'subject' => $subject ? implode(', ', array_map(fn($k, $v) => "{$k}={$v}", array_keys($subject), $subject)) : null,
        'issuer' => $issuer ? implode(', ', array_map(fn($k, $v) => "{$k}={$v}", array_keys($issuer), $issuer)) : null,
        'validFrom' => $validFrom,
        'validTo' => $validTo,
        'san' => $sans,
    ],
    'caa' => $caa,
    'caa_summary' => $caaSummary,
    'http_upgrade' => $httpUpgrade,
    'mixed_content_hint' => $mixed,
    'tls_report' => $tlsReport,
    'ocsp_stapling' => $ocspStapling,
    'posture' => $posture,
    'chain_trust' => $chainTrust,
    'cert_meta' => $certMeta,
    'dnssec' => $dnssec,
    'dane' => $dane,
    'deep_tls' => $deepTls,
    'sni_used' => $sniServerName,
    'probe_path' => $probePath,
]);
exit;

