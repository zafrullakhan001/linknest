<?php
/**
 * Speed-test Server-proxy helpers (admin-gated, SSRF-safe relay).
 *
 * The "Custom server" target can be measured two ways:
 *  - Browser-direct: the user's browser calls `<endpoint>/api/speedtest/*` itself. The endpoint
 *    must expose the public probe (see `speedtest_public_probe_enabled`) — e.g. another LinkNest.
 *  - Server-proxy: this LinkNest host relays to the endpoint. Works for ANY web server by IP,
 *    but the endpoint must be listed in `speedtest_proxy_allow_hosts`; private/loopback/reserved
 *    ranges are blocked by default so the relay cannot be used to probe the LAN or cloud metadata.
 */

function speedtestProxySettingString(string $key, string $default): string
{
    try {
        $db = getDB();
        $stmt = $db->prepare('SELECT value FROM settings WHERE key = ? LIMIT 1');
        $stmt->execute([$key]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row && $row['value'] !== null && $row['value'] !== '') {
            return (string)$row['value'];
        }
    } catch (Throwable $e) {
        // ignore — fall back to the default
    }
    return $default;
}

/** Allow self-signed / privately-signed TLS certificates on the proxied endpoint. */
function speedtestProxyAllowSelfSigned(): bool
{
    return speedtestProxySettingString('speedtest_proxy_allow_self_signed', '1') !== '0';
}

/** Max redirect hops followed when relaying to the endpoint (0 = do not follow). */
function speedtestProxyMaxRedirects(): int
{
    $n = (int)speedtestProxySettingString('speedtest_proxy_max_redirects', '0');
    return max(0, min(3, $n));
}

/** The public (unauthenticated) probe on THIS host — lets another LinkNest measure it browser-direct. */
function speedtestPublicProbeEnabled(): bool
{
    return speedtestProxySettingString('speedtest_public_probe_enabled', '0') === '1';
}

/**
 * Admin allow-list of hosts the proxy may reach.
 * CSV of hostnames, IPv4/IPv6 literals, or IPv4 CIDR blocks (e.g. `10.20.0.0/16`).
 * Empty list = the proxy refuses every target.
 */
function speedtestProxyAllowHosts(): array
{
    $raw = speedtestProxySettingString('speedtest_proxy_allow_hosts', '');
    if (trim($raw) === '') {
        return [];
    }
    $parts = preg_split('/[\s,;]+/', $raw) ?: [];
    $out = [];
    foreach ($parts as $p) {
        $p = strtolower(trim($p));
        if ($p !== '') {
            $out[] = $p;
        }
    }
    return array_values(array_unique($out));
}


/** True when a resolved IP is in a range that must never be proxied without an explicit allow entry. */
function speedtestProxyIpIsBlocked(string $ip): bool
{
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        $long = ip2long($ip);
        if ($long === false) {
            return true;
        }
        $l = sprintf('%u', $long);
        $blocks = [
            ['10.0.0.0', '10.255.255.255'],
            ['100.64.0.0', '100.127.255.255'],
            ['127.0.0.0', '127.255.255.255'],
            ['169.254.0.0', '169.254.255.255'],
            ['172.16.0.0', '172.31.255.255'],
            ['192.0.0.0', '192.0.0.255'],
            ['192.0.2.0', '192.0.2.255'],
            ['192.168.0.0', '192.168.255.255'],
            ['198.18.0.0', '198.19.255.255'],
            ['224.0.0.0', '239.255.255.255'],
            ['240.0.0.0', '255.255.255.255'],
        ];
        foreach ($blocks as $range) {
            $start = sprintf('%u', ip2long($range[0]));
            $end = sprintf('%u', ip2long($range[1]));
            if ($l >= $start && $l <= $end) {
                return true;
            }
        }
        return false;
    }

    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        $lower = strtolower($ip);
        if ($lower === '::' || $lower === '::1') {
            return true;
        }
        if (strpos($lower, 'fe80:') === 0) {
            return true; // link-local
        }
        if (preg_match('/^f[cd][0-9a-f]{2}:/', $lower) === 1) {
            return true; // unique local (fc00::/7)
        }
        return false;
    }

    return true;
}

/** CIDR membership test (IPv4 only, the only form the allow-list documents). */
function speedtestProxyCidrMatch(string $ip, string $cidr): bool
{
    if (strpos($cidr, '/') === false) {
        return false;
    }
    [$net, $bitsRaw] = explode('/', $cidr, 2);
    $bits = (int)$bitsRaw;
    if ($bits < 0 || $bits > 32) {
        return false;
    }
    $ipLong = ip2long($ip);
    $netLong = ip2long($net);
    if ($ipLong === false || $netLong === false) {
        return false;
    }
    if ($bits === 0) {
        return true;
    }
    $mask = -1 << (32 - $bits);
    return (sprintf('%u', $ipLong & $mask) === sprintf('%u', $netLong & $mask));
}


/**
 * Validate a `target` (endpoint base URL) coming from the widget and resolve it.
 * Returns an array with baseUrl/origin/scheme/host/port/label/ip, or throws RuntimeException.
 */
function speedtestProxyResolveTarget(string $target): array
{
    $target = trim($target);
    if ($target === '') {
        throw new RuntimeException('Missing target endpoint (pass ?target=<http(s)://host[:port][/path]>)');
    }
    $parts = @parse_url($target);
    if (!is_array($parts) || empty($parts['host'])) {
        throw new RuntimeException('Could not parse the target endpoint URL');
    }
    $scheme = strtolower((string)($parts['scheme'] ?? 'http'));
    if ($scheme !== 'http' && $scheme !== 'https') {
        throw new RuntimeException('Only http:// and https:// targets can be proxied');
    }
    if (isset($parts['user']) || isset($parts['pass'])) {
        throw new RuntimeException('Credentials in the target URL are not allowed');
    }

    $host = (string)$parts['host'];
    $defaultPort = ($scheme === 'https') ? 443 : 80;
    $port = isset($parts['port']) ? (int)$parts['port'] : $defaultPort;
    $path = rtrim((string)($parts['path'] ?? ''), '/');
    if ($path === '' || $path === '/') {
        $path = '/api';
    }
    if ($port < 1 || $port > 65535) {
        throw new RuntimeException('Target port out of range');
    }

    // Resolve to IPv4 for the block-list check (hostnames are resolved once, here).
    $ip = $host;
    if (!filter_var($host, FILTER_VALIDATE_IP)) {
        $resolved = gethostbyname($host);
        if ($resolved === $host || !filter_var($resolved, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            throw new RuntimeException('Could not resolve target host "' . $host . '" to an IPv4 address');
        }
        $ip = $resolved;
    }

    $allowed = false;
    foreach (speedtestProxyAllowHosts() as $entry) {
        if (strpos($entry, '/') !== false) {
            if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) && speedtestProxyCidrMatch($ip, $entry)) {
                $allowed = true;
                break;
            }
            continue;
        }
        if ($entry === strtolower($host) || $entry === strtolower($ip)) {
            $allowed = true;
            break;
        }
    }

    if (!$allowed) {
        $reason = speedtestProxyIpIsBlocked($ip)
            ? 'the resolved address ' . $ip . ' is a private/loopback/reserved range'
            : $ip . ' is not on the proxy allow-list';
        throw new RuntimeException(
            'Proxy refused: ' . $reason . '. An administrator can add it to speedtest_proxy_allow_hosts.'
        );
    }

    $hostForUrl = (strpos($host, ':') !== false) ? '[' . $host . ']' : $host;
    $origin = $scheme . '://' . $hostForUrl . ($port === $defaultPort ? '' : ':' . $port);

    return [
        'baseUrl' => $origin . $path,
        'origin' => $origin,
        'scheme' => $scheme,
        'host' => $host,
        'port' => $port,
        'path' => $path,
        'label' => $host . ($port === $defaultPort ? '' : ':' . $port),
        'ip' => $ip,
    ];
}

/** Build a `<baseUrl>/speedtest/<action>` URL, optionally with extra query params. */
function speedtestProxyBuildUrl(string $baseUrl, string $action, array $query = []): string
{
    $url = rtrim($baseUrl, '/') . '/speedtest/' . ltrim($action, '/');
    if ($query) {
        $url .= (strpos($url, '?') === false ? '?' : '&') . http_build_query($query);
    }
    return $url;
}

/** Base cURL handle for a proxied request; the caller adds streaming options. */
function speedtestProxyCurlInit(string $url, int $timeoutSeconds = 30)
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_HEADER => false,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => $timeoutSeconds,
        CURLOPT_FOLLOWLOCATION => speedtestProxyMaxRedirects() > 0,
        CURLOPT_MAXREDIRS => speedtestProxyMaxRedirects(),
        CURLOPT_SSL_VERIFYPEER => !speedtestProxyAllowSelfSigned(),
        CURLOPT_SSL_VERIFYHOST => speedtestProxyAllowSelfSigned() ? 0 : 2,
        CURLOPT_ENCODING => '',
        CURLOPT_USERAGENT => 'LinkNest-SpeedTest-Proxy/1.0',
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
    ]);
    return $ch;
}
