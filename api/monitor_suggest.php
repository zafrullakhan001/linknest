<?php
/**
 * Smart monitor target analyzer — probes a URL/host and returns ranked suggestions.
 * Included by monitors.php; not a standalone endpoint.
 */

const MONITOR_SUGGEST_COMMON_PORTS = [22, 80, 443, 3306, 5432, 6379, 8080, 8443];

const MONITOR_SCHEME_PORTS = [
    'ssh' => 22,
    'mysql' => 3306,
    'mariadb' => 3306,
    'postgresql' => 5432,
    'postgres' => 5432,
    'redis' => 6379,
    'mongodb' => 27017,
    'mongo' => 27017,
    'smtp' => 25,
    'imap' => 143,
];

const MONITOR_HEALTH_KEYS = ['status', 'health', 'healthy', 'state', 'ready', 'alive'];
const MONITOR_HEALTH_VALUES = ['ok', 'healthy', 'success', 'up', 'running', 'true', 'pass', 'passed'];

function handleMonitorSuggest(): void {
    requireAdmin();

    if (!enforceMonitorSuggestRateLimit()) {
        sendJSON(['error' => 'Rate limit exceeded. Try again in a minute.'], 429);
        return;
    }

    $data = getJSONInput();
    $input = trim((string)($data['target'] ?? ''));
    if ($input === '') {
        sendJSON(['error' => 'Target is required'], 400);
        return;
    }
    if (strlen($input) > 2048) {
        sendJSON(['error' => 'Target is too long'], 400);
        return;
    }

    $result = analyzeMonitorTarget($input);
    if (isset($result['error'])) {
        sendJSON(['error' => $result['error']], 400);
        return;
    }

    sendJSON($result);
}

function enforceMonitorSuggestRateLimit(): bool {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    $now = time();
    $key = 'monitor_suggest_rate';
    if (!isset($_SESSION[$key]) || !is_array($_SESSION[$key])) {
        $_SESSION[$key] = ['window' => $now, 'count' => 0];
    }
    $bucket = &$_SESSION[$key];
    if ($now - (int)$bucket['window'] >= 60) {
        $bucket = ['window' => $now, 'count' => 0];
    }
    $bucket['count'] = (int)$bucket['count'] + 1;
    return $bucket['count'] <= 10;
}

function analyzeMonitorTarget(string $input): array {
    $parsed = parseMonitorTargetInput($input);
    if (isset($parsed['error'])) {
        return ['error' => $parsed['error']];
    }

    $host = $parsed['host'];
    if (!monitorSuggestHostAllowed($host)) {
        return ['error' => 'Target resolves to a private or reserved address and cannot be probed'];
    }

    $probeSummary = [
        'http_code' => null,
        'content_type' => null,
        'open_ports' => [],
        'ping' => null,
        'ssl_days_remaining' => null,
        'dns_a' => [],
        'dns_aaaa' => [],
    ];

    $suggestions = [];

    if ($parsed['pattern'] === 'scheme_service') {
        $port = (int)$parsed['port'];
        $suggestions[] = buildMonitorSuggestion('port', 95, true,
            "Service URL maps to TCP port $port",
            $parsed['host'], [
                'target' => $parsed['host'],
                'port' => $port,
                'interval' => 10,
            ], serviceGroupForPort($port)
        );
        return finalizeSuggestResponse($input, $parsed, $probeSummary, $suggestions);
    }

    if ($parsed['pattern'] === 'host_port') {
        $port = (int)$parsed['port'];
        $open = probeTcpPort($host, $port, 1);
        if ($open) {
            $probeSummary['open_ports'][] = $port;
        }
        $conf = $open ? 92 : 75;
        $reason = $open
            ? "Port $port is open on {$parsed['host']}"
            : "Input looks like host:port — verify port $port is reachable";
        $suggestions[] = buildMonitorSuggestion('port', $conf, true, $reason, $parsed['host'], [
            'target' => $parsed['host'],
            'port' => $port,
            'interval' => 10,
        ], serviceGroupForPort($port));
        return finalizeSuggestResponse($input, $parsed, $probeSummary, $suggestions);
    }

    if ($parsed['pattern'] === 'url') {
        return analyzeHttpMonitorTarget($input, $parsed, $probeSummary);
    }

    // Bare hostname or IP
    return analyzeHostMonitorTarget($input, $parsed, $probeSummary);
}

function parseMonitorTargetInput(string $input): array {
    $input = trim($input);

    // scheme://host service URLs (ssh://, mysql://, etc.)
    if (preg_match('#^([a-z][a-z0-9+.-]*)://#i', $input, $m)) {
        $scheme = strtolower($m[1]);
        if (isset(MONITOR_SCHEME_PORTS[$scheme])) {
            $rest = preg_replace('#^[a-z][a-z0-9+.-]*://#i', '', $input);
            $host = explode('/', $rest)[0];
            $host = explode('@', $host)[0];
            $host = preg_replace('/:\d+$/', '', $host);
            if ($host === '') {
                return ['error' => 'Could not parse host from service URL'];
            }
            return [
                'pattern' => 'scheme_service',
                'host' => $host,
                'port' => MONITOR_SCHEME_PORTS[$scheme],
                'scheme' => $scheme,
            ];
        }
    }

    // HTTP(S) URL
    if (preg_match('#^https?://#i', $input)) {
        $parts = parse_url($input);
        if (empty($parts['host'])) {
            return ['error' => 'Invalid URL'];
        }
        $scheme = strtolower($parts['scheme'] ?? 'http');
        $port = isset($parts['port']) ? (int)$parts['port'] : ($scheme === 'https' ? 443 : 80);
        return [
            'pattern' => 'url',
            'host' => $parts['host'],
            'scheme' => $scheme,
            'port' => $port,
            'path' => $parts['path'] ?? '/',
            'url' => $input,
        ];
    }

    // host:port (IPv4 or hostname)
    if (preg_match('/^(.+):(\d{1,5})$/', $input, $m)) {
        $hostPart = trim($m[1]);
        $port = (int)$m[2];
        if ($port < 1 || $port > 65535) {
            return ['error' => 'Invalid port number'];
        }
        // Strip brackets for IPv6 [::1]:8080
        $hostPart = trim($hostPart, '[]');
        if (!monitorSuggestValidHost($hostPart)) {
            return ['error' => 'Invalid host'];
        }
        return [
            'pattern' => 'host_port',
            'host' => $hostPart,
            'port' => $port,
        ];
    }

    // Bare hostname or IP
    $host = trim($input, '[]');
    if (!monitorSuggestValidHost($host)) {
        return ['error' => 'Invalid hostname or IP address'];
    }
    return [
        'pattern' => 'host',
        'host' => $host,
    ];
}

function monitorSuggestValidHost(string $host): bool {
    if ($host === '' || strlen($host) > 255) {
        return false;
    }
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        return true;
    }
    return (bool)preg_match('/^[a-zA-Z0-9]([a-zA-Z0-9\.\-]*[a-zA-Z0-9])?$/', $host);
}

function monitorSuggestHostAllowed(string $host): bool {
    if (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 | FILTER_FLAG_IPV6)) {
        return !monitorSuggestIsPrivateIp($host);
    }
    $records = @dns_get_record($host, DNS_A + DNS_AAAA);
    if (!is_array($records) || count($records) === 0) {
        // Allow probe if DNS fails — may still work for ping/port on hostname
        return true;
    }
    foreach ($records as $rec) {
        $ip = $rec['ip'] ?? $rec['ipv6'] ?? null;
        if ($ip && monitorSuggestIsPrivateIp($ip)) {
            return false;
        }
    }
    return true;
}

function monitorSuggestIsPrivateIp(string $ip): bool {
    if (!filter_var($ip, FILTER_VALIDATE_IP)) {
        return true;
    }
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        $long = ip2long($ip);
        if ($long === false) {
            return true;
        }
        $ranges = [
            ['0.0.0.0', '0.255.255.255'],
            ['10.0.0.0', '10.255.255.255'],
            ['127.0.0.0', '127.255.255.255'],
            ['169.254.0.0', '169.254.255.255'],
            ['172.16.0.0', '172.31.255.255'],
            ['192.168.0.0', '192.168.255.255'],
            ['224.0.0.0', '239.255.255.255'],
        ];
        foreach ($ranges as [$start, $end]) {
            if ($long >= ip2long($start) && $long <= ip2long($end)) {
                return true;
            }
        }
        return false;
    }
    $lower = strtolower($ip);
    if ($lower === '::1' || str_starts_with($lower, 'fe80:') || str_starts_with($lower, 'fc') || str_starts_with($lower, 'fd')) {
        return true;
    }
    if (str_starts_with($lower, '::ffff:')) {
        $v4 = substr($lower, 7);
        if (filter_var($v4, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            return monitorSuggestIsPrivateIp($v4);
        }
    }
    return false;
}

function analyzeHttpMonitorTarget(string $input, array $parsed, array &$probeSummary): array {
    $url = $parsed['url'];
    $host = $parsed['host'];
    $suggestions = [];

    $head = probeHttpHead($url);
    $firstHop = probeHttpHeadersFirstHop($url);
    $probeSummary['http_code'] = $head['http_code'];
    $probeSummary['content_type'] = $head['content_type'];
    if (!empty($firstHop['http_code'])) {
        $probeSummary['first_hop_code'] = $firstHop['http_code'];
    }
    if (!empty($firstHop['location'])) {
        $probeSummary['location'] = $firstHop['location'];
    }

    $getBody = null;
    $needGet = ($head['http_code'] === 405)
        || (stripos((string)$head['content_type'], 'json') !== false)
        || preg_match('#/(health|status|ready|alive|ping|api)#i', $parsed['path'] ?? '');

    if ($needGet || ($head['http_code'] ?? 0) === 0) {
        $getBody = probeHttpGetSnippet($url);
        if ($getBody['http_code']) {
            $probeSummary['http_code'] = $getBody['http_code'];
        }
        if ($getBody['content_type']) {
            $probeSummary['content_type'] = $getBody['content_type'];
        }
    }

    if (($parsed['scheme'] ?? '') === 'https') {
        $sslInfo = probeSslCertificate($host, (int)($parsed['port'] ?? 443));
        if ($sslInfo['days_remaining'] !== null) {
            $probeSummary['ssl_days_remaining'] = $sslInfo['days_remaining'];
            $suggestions[] = buildMonitorSuggestion('ssl', 78, false,
                $sslInfo['days_remaining'] > 0
                    ? "HTTPS certificate expires in {$sslInfo['days_remaining']} days"
                    : 'HTTPS certificate may be expired or invalid',
                $host, [
                    'target' => $url,
                    'keyword' => '30',
                    'interval' => 1440,
                ], 'Web Servers'
            );
        }
    }

    $httpOk = ($probeSummary['http_code'] >= 200 && $probeSummary['http_code'] < 400);
    $firstHopCode = (int)($firstHop['http_code'] ?? 0);
    $isRedirectHop = ($firstHopCode >= 300 && $firstHopCode < 400);
    if ($isRedirectHop) {
        $loc = trim((string)($firstHop['location'] ?? ''));
        $reason = "First hop HTTP {$firstHopCode} (redirect). HTTP Headers check verifies this URL without following or downloading the page";
        if ($loc !== '') {
            $reason .= " (Location: {$loc})";
        }
        $suggestions[] = buildMonitorSuggestion('headers', 94, true,
            $reason,
            $host, [
                'target' => $url,
                'timeout' => 5,
                'interval' => 5,
            ], urlGroupForPath($parsed['path'] ?? '')
        );
    }
    if ($httpOk) {
        $suggestions[] = buildMonitorSuggestion('url', $isRedirectHop ? 80 : 90, false,
            "Endpoint responded HTTP {$probeSummary['http_code']} to probe",
            $host, [
                'target' => $url,
                'timeout' => 5,
                'interval' => 5,
            ], urlGroupForPath($parsed['path'] ?? '')
        );
    } elseif ($firstHopCode >= 200 && $firstHopCode < 400) {
        $suggestions[] = buildMonitorSuggestion('headers', 88, true,
            "Server returned HTTP {$firstHopCode} headers without a page body",
            $host, [
                'target' => $url,
                'timeout' => 5,
                'interval' => 5,
            ], urlGroupForPath($parsed['path'] ?? '')
        );
    }

    $body = $getBody['body'] ?? '';
    $jsonHint = detectJsonHealthFromBody($body);
    if ($jsonHint !== null) {
        $suggestions[] = buildMonitorSuggestion('json', 92, true,
            'Response is JSON with a health indicator (' . $jsonHint['label'] . ')',
            $host, [
                'target' => $url,
                'keyword' => $jsonHint['keyword'],
                'timeout' => 8,
                'interval' => 5,
            ], 'APIs'
        );
    } elseif ($body !== '') {
        $kw = detectKeywordFromHtml($body);
        if ($kw !== null) {
            $suggestions[] = buildMonitorSuggestion('keyword', 72, false,
                "Page content contains identifiable text \"{$kw}\"",
                $host, [
                    'target' => $url,
                    'keyword' => $kw,
                    'timeout' => 8,
                    'interval' => 5,
                ], 'Web Servers'
            );
        }
    }

    if (empty($suggestions)) {
        $suggestions[] = buildMonitorSuggestion('headers', 72, true,
            'HTTP URL — HTTP Headers check verifies up/down from response headers (curl -I)',
            $host, [
                'target' => $url,
                'timeout' => 5,
                'interval' => 5,
            ], 'Web Servers'
        );
        $suggestions[] = buildMonitorSuggestion('url', 70, false,
            'HTTP URL — use URL check to verify availability',
            $host, [
                'target' => $url,
                'timeout' => 5,
                'interval' => 5,
            ], 'Web Servers'
        );
    }

    usort($suggestions, fn($a, $b) => ($b['confidence'] <=> $a['confidence']));
    if (!empty($suggestions)) {
        $suggestions[0]['recommended'] = true;
        for ($i = 1; $i < count($suggestions); $i++) {
            $suggestions[$i]['recommended'] = false;
        }
    }

    return finalizeSuggestResponse($input, $parsed, $probeSummary, $suggestions);
}

function analyzeHostMonitorTarget(string $input, array $parsed, array &$probeSummary): array {
    $host = $parsed['host'];
    $suggestions = [];

    $dnsA = @dns_get_record($host, DNS_A);
    $dnsAAAA = @dns_get_record($host, DNS_AAAA);
    if (is_array($dnsA)) {
        foreach ($dnsA as $r) {
            if (!empty($r['ip'])) {
                $probeSummary['dns_a'][] = $r['ip'];
            }
        }
    }
    if (is_array($dnsAAAA)) {
        foreach ($dnsAAAA as $r) {
            if (!empty($r['ipv6'])) {
                $probeSummary['dns_aaaa'][] = $r['ipv6'];
            }
        }
    }

    if (!empty($probeSummary['dns_a']) || !empty($probeSummary['dns_aaaa'])) {
        $suggestions[] = buildMonitorSuggestion('dns', 85, false,
            'Hostname resolves via DNS (' . count(array_merge($probeSummary['dns_a'], $probeSummary['dns_aaaa'])) . ' record(s))',
            $host, [
                'target' => $host,
                'interval' => 15,
            ], 'Servers'
        );
    }

    $pingRes = checkPing($host, ['ping_timeout_ms' => 1500]);
    $probeSummary['ping'] = ($pingRes['status'] ?? '') === 'up' ? 'up' : 'down';
    if ($probeSummary['ping'] === 'up') {
        $suggestions[] = buildMonitorSuggestion('ping', 88, false,
            'Host responds to ICMP ping',
            $host, [
                'target' => $host,
                'interval' => 5,
            ], 'Servers'
        );
    }

    foreach (MONITOR_SUGGEST_COMMON_PORTS as $port) {
        if (probeTcpPort($host, $port, 1)) {
            $probeSummary['open_ports'][] = $port;
            $suggestions[] = buildMonitorSuggestion('port', 80, false,
                "TCP port $port is open on $host",
                $host, [
                    'target' => $host,
                    'port' => $port,
                    'interval' => 10,
                ], serviceGroupForPort($port)
            );
        }
    }

    if (empty($suggestions)) {
        $suggestions[] = buildMonitorSuggestion('ping', 65, true,
            'Host or IP — ping check verifies basic reachability',
            $host, [
                'target' => $host,
                'interval' => 5,
            ], 'Servers'
        );
    }

    usort($suggestions, fn($a, $b) => ($b['confidence'] <=> $a['confidence']));
    $suggestions[0]['recommended'] = true;
    for ($i = 1; $i < count($suggestions); $i++) {
        $suggestions[$i]['recommended'] = false;
    }

    return finalizeSuggestResponse($input, $parsed, $probeSummary, $suggestions);
}

function finalizeSuggestResponse(string $input, array $parsed, array $probeSummary, array $suggestions): array {
    usort($suggestions, fn($a, $b) => ($b['confidence'] <=> $a['confidence']));
    if (!empty($suggestions) && !array_filter($suggestions, fn($s) => !empty($s['recommended']))) {
        $suggestions[0]['recommended'] = true;
    }
    return [
        'input' => $input,
        'parsed' => [
            'host' => $parsed['host'] ?? null,
            'scheme' => $parsed['scheme'] ?? null,
            'port' => $parsed['port'] ?? null,
            'pattern' => $parsed['pattern'] ?? null,
        ],
        'probe_summary' => $probeSummary,
        'suggestions' => array_slice($suggestions, 0, 8),
    ];
}

function buildMonitorSuggestion(
    string $type,
    int $confidence,
    bool $recommended,
    string $reason,
    string $host,
    array $config,
    string $group
): array {
    $config = monitorSuggestEnrichConfig($type, $config);
    $name = monitorSuggestFriendlyName($host, $type, $config);
    return [
        'type' => $type,
        'confidence' => min(100, max(1, $confidence)),
        'recommended' => $recommended,
        'reason' => $reason,
        'suggested_name' => $name,
        'suggested_group' => $group,
        'config' => $config,
    ];
}

/** Default timeout (seconds), warning threshold, and interval per monitor type. */
function monitorSuggestTimingDefaults(string $type): array {
    return match ($type) {
        'url' => ['timeout' => 5, 'warning_threshold' => 2, 'interval' => 5],
        'headers' => ['timeout' => 5, 'warning_threshold' => 2, 'interval' => 5],
        'keyword' => ['timeout' => 8, 'warning_threshold' => 2, 'interval' => 5],
        'json' => ['timeout' => 8, 'warning_threshold' => 2, 'interval' => 5],
        'port' => ['timeout' => 5, 'warning_threshold' => 2, 'interval' => 10],
        'ping' => ['timeout' => 3, 'warning_threshold' => 3, 'interval' => 5],
        'ssl' => ['timeout' => 10, 'warning_threshold' => 1, 'interval' => 1440],
        'dns' => ['timeout' => 5, 'warning_threshold' => 2, 'interval' => 15],
        default => ['timeout' => 5, 'warning_threshold' => 1, 'interval' => 5],
    };
}

function monitorSuggestEnrichConfig(string $type, array $config): array {
    $defaults = monitorSuggestTimingDefaults($type);
    if (!array_key_exists('timeout', $config) && $defaults['timeout'] !== null) {
        $config['timeout'] = $defaults['timeout'];
    }
    if (!array_key_exists('warning_threshold', $config)) {
        $config['warning_threshold'] = $defaults['warning_threshold'];
    }
    if (!array_key_exists('interval', $config)) {
        $config['interval'] = $defaults['interval'];
    }
    return $config;
}

function monitorSuggestFriendlyName(string $host, string $type, array $config): string {
    $labels = [
        'url' => 'URL',
        'headers' => 'HTTP Headers',
        'keyword' => 'Keyword',
        'port' => 'Port ' . ($config['port'] ?? ''),
        'ping' => 'Ping',
        'ssl' => 'SSL',
        'dns' => 'DNS',
        'json' => 'API Health',
    ];
    $suffix = $labels[$type] ?? ucfirst($type);
    $short = preg_replace('/^www\./', '', $host);
    return "$short $suffix";
}

function serviceGroupForPort(int $port): string {
    return match ($port) {
        22 => 'Servers',
        80, 443, 8080, 8443 => 'Web Servers',
        3306, 5432, 6379, 27017 => 'Databases',
        25, 143 => 'Email Servers',
        default => 'Servers',
    };
}

function urlGroupForPath(string $path): string {
    if (preg_match('#/(health|status|ready|api)#i', $path)) {
        return 'APIs';
    }
    return 'Web Servers';
}

function probeTcpPort(string $host, int $port, int $timeoutSec = 1): bool {
    $conn = @fsockopen($host, $port, $errno, $errstr, $timeoutSec);
    if (is_resource($conn)) {
        fclose($conn);
        return true;
    }
    return false;
}

function probeHttpHeadersFirstHop(string $url): array {
    $rawHeaders = '';
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_TIMEOUT => 5,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_NOBODY => true,
        CURLOPT_HEADER => false,
        CURLOPT_USERAGENT => (getAppName() ?: 'LinkNest') . ' MonitorSuggest/1.0',
        CURLOPT_HTTPHEADER => ['Accept: */*', 'Connection: close'],
        CURLOPT_HEADERFUNCTION => function ($ch, $header) use (&$rawHeaders) {
            $rawHeaders .= $header;
            return strlen($header);
        },
    ]);
    curl_exec($ch);
    $info = curl_getinfo($ch);
    $code = (int)($info['http_code'] ?? 0);
    curl_close($ch);

    $location = null;
    foreach (preg_split("/\r\n|\n|\r/", $rawHeaders) ?: [] as $line) {
        if (stripos($line, 'Location:') === 0) {
            $location = trim(substr($line, 9));
            break;
        }
    }

    return [
        'http_code' => $code,
        'location' => $location,
        'headers' => $rawHeaders,
    ];
}

function probeHttpHead(string $url): array {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_TIMEOUT => 5,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_NOBODY => true,
        CURLOPT_USERAGENT => (getAppName() ?: 'LinkNest') . ' MonitorSuggest/1.0',
        CURLOPT_HTTPHEADER => ['Accept: */*', 'Connection: close'],
    ]);
    curl_exec($ch);
    $info = curl_getinfo($ch);
    curl_close($ch);
    return [
        'http_code' => (int)($info['http_code'] ?? 0),
        'content_type' => $info['content_type'] ?? null,
    ];
}

function probeHttpGetSnippet(string $url, int $maxBytes = 65536): array {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_USERAGENT => (getAppName() ?: 'LinkNest') . ' MonitorSuggest/1.0',
        CURLOPT_HTTPHEADER => ['Accept: */*', 'Connection: close'],
    ]);
    $body = curl_exec($ch);
    $info = curl_getinfo($ch);
    curl_close($ch);
    if ($body === false) {
        $body = '';
    } elseif (strlen($body) > $maxBytes) {
        $body = substr($body, 0, $maxBytes);
    }
    return [
        'http_code' => (int)($info['http_code'] ?? 0),
        'content_type' => $info['content_type'] ?? null,
        'body' => $body,
    ];
}

function probeSslCertificate(string $host, int $port = 443): array {
    $ctx = stream_context_create([
        'ssl' => [
            'capture_peer_cert' => true,
            'verify_peer' => false,
            'verify_peer_name' => false,
        ],
    ]);
    $target = "ssl://{$host}:{$port}";
    $fp = @stream_socket_client($target, $errno, $errstr, 5, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) {
        return ['days_remaining' => null, 'error' => $errstr];
    }
    $params = stream_context_get_params($fp);
    fclose($fp);
    if (empty($params['options']['ssl']['peer_certificate'])) {
        return ['days_remaining' => null];
    }
    $cert = openssl_x509_parse($params['options']['ssl']['peer_certificate']);
    if (!$cert || empty($cert['validTo_time_t'])) {
        return ['days_remaining' => null];
    }
    $days = (int)floor(($cert['validTo_time_t'] - time()) / 86400);
    return ['days_remaining' => $days];
}

function detectJsonHealthFromBody(string $body): ?array {
    $body = trim($body);
    if ($body === '' || ($body[0] !== '{' && $body[0] !== '[')) {
        return null;
    }
    $data = json_decode($body, true);
    if (!is_array($data)) {
        return null;
    }
    foreach (MONITOR_HEALTH_KEYS as $key) {
        if (!array_key_exists($key, $data)) {
            continue;
        }
        $val = $data[$key];
        if (is_bool($val)) {
            $strVal = $val ? 'true' : 'false';
            if ($val === true) {
                return ['keyword' => "$key:$strVal", 'label' => "$key=$strVal"];
            }
        } elseif (is_scalar($val)) {
            $strVal = strtolower((string)$val);
            if (in_array($strVal, MONITOR_HEALTH_VALUES, true)) {
                return ['keyword' => "$key:$val", 'label' => "$key=$val"];
            }
        }
    }
    // Search nested one level
    foreach ($data as $k => $v) {
        if (is_array($v)) {
            foreach (MONITOR_HEALTH_KEYS as $key) {
                if (isset($v[$key]) && is_scalar($v[$key])) {
                    $strVal = strtolower((string)$v[$key]);
                    if (in_array($strVal, MONITOR_HEALTH_VALUES, true)) {
                        return ['keyword' => "$key:{$v[$key]}", 'label' => "$k.$key={$v[$key]}"];
                    }
                }
            }
        }
    }
    return ['keyword' => 'ok', 'label' => 'JSON response'];
}

function detectKeywordFromHtml(string $body): ?string {
    if (preg_match('/<title[^>]*>([^<]+)<\/title>/i', $body, $m)) {
        $title = trim(html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        if ($title !== '' && strlen($title) <= 80) {
            return $title;
        }
    }
    foreach (['Welcome', 'Success', 'Online', 'Healthy'] as $word) {
        if (stripos($body, $word) !== false) {
            return $word;
        }
    }
    return null;
}

function parseBulkMonitorTargetLines(string $text): array {
    $text = str_replace(["\r\n", "\r"], "\n", $text);
    $parts = preg_split('/[\n,;]+/', $text) ?: [];
    $seen = [];
    $lines = [];
    foreach ($parts as $part) {
        $line = trim($part);
        if ($line === '' || isset($seen[strtolower($line)])) {
            continue;
        }
        if (strlen($line) > 2048) {
            continue;
        }
        $seen[strtolower($line)] = true;
        $lines[] = $line;
    }
    return $lines;
}

function pickBestMonitorSuggestion(array $suggestions): ?array {
    if (empty($suggestions)) {
        return null;
    }
    foreach ($suggestions as $s) {
        if (!empty($s['recommended'])) {
            return $s;
        }
    }
    return $suggestions[0];
}

function monitorDraftPayloadFromSuggestion(
    array $suggestion,
    string $input,
    string $defaultTab,
    ?string $defaultGroup = null
): array {
    $config = is_array($suggestion['config'] ?? null) ? $suggestion['config'] : [];
    $group = $defaultGroup ?? ($suggestion['suggested_group'] ?? 'Other');
    return [
        'name' => $suggestion['suggested_name'] ?? monitorSuggestFriendlyName($input, $suggestion['type'], $config),
        'type' => $suggestion['type'],
        'target' => $config['target'] ?? $input,
        'port' => isset($config['port']) ? (int)$config['port'] : null,
        'keyword' => $config['keyword'] ?? null,
        'interval' => isset($config['interval']) ? (int)$config['interval'] : 5,
        'timeout' => isset($config['timeout']) ? (int)$config['timeout'] : null,
        'warning_threshold' => isset($config['warning_threshold']) ? (int)$config['warning_threshold'] : 1,
        'tab_name' => $defaultTab,
        'group_name' => $group,
        'is_active' => 1,
        'email_notification' => 0,
    ];
}

function buildHeuristicMonitorDraft(string $input, string $defaultTab): array {
    $parsed = parseMonitorTargetInput($input);
    if (isset($parsed['error'])) {
        return [
            'input' => $input,
            'selected' => false,
            'error' => $parsed['error'],
            'confidence' => null,
            'reason' => null,
            'monitor' => null,
            'alternatives' => [],
        ];
    }

    $host = $parsed['host'];
    $suggestions = [];

    switch ($parsed['pattern']) {
        case 'scheme_service':
        case 'host_port':
            $port = (int)$parsed['port'];
            $suggestions[] = buildMonitorSuggestion('port', 75, true,
                "Input maps to TCP port $port",
                $host,
                ['target' => $host, 'port' => $port, 'interval' => 10],
                serviceGroupForPort($port)
            );
            break;
        case 'url':
            $suggestions[] = buildMonitorSuggestion('url', 75, true,
                'HTTP(S) URL — URL check recommended',
                $parsed['host'],
                ['target' => $input, 'interval' => 5],
                urlGroupForPath($parsed['path'] ?? '/')
            );
            $suggestions[] = buildMonitorSuggestion('headers', 70, false,
                'Optional HTTP Headers check (curl -I, no page download)',
                $parsed['host'],
                ['target' => $input, 'interval' => 5],
                urlGroupForPath($parsed['path'] ?? '/')
            );
            if (!empty($parsed['scheme']) && strtolower($parsed['scheme']) === 'https') {
                $suggestions[] = buildMonitorSuggestion('ssl', 70, false,
                    'HTTPS URL — optional SSL certificate monitor',
                    $parsed['host'],
                    ['target' => $parsed['host'], 'keyword' => '30', 'interval' => 720],
                    'Web Servers'
                );
            }
            break;
        case 'host':
        default:
            $suggestions[] = buildMonitorSuggestion('ping', 70, true,
                'Host/IP — ICMP ping recommended',
                $host,
                ['target' => $host, 'interval' => 5],
                'Servers'
            );
            $suggestions[] = buildMonitorSuggestion('dns', 65, false,
                'Optional DNS resolution check',
                $host,
                ['target' => $host, 'keyword' => 'A', 'interval' => 15],
                'Servers'
            );
            break;
    }

    $best = pickBestMonitorSuggestion($suggestions);
    if (!$best) {
        return [
            'input' => $input,
            'selected' => false,
            'error' => 'Could not determine monitor type',
            'confidence' => null,
            'reason' => null,
            'monitor' => null,
            'alternatives' => [],
        ];
    }

    return [
        'input' => $input,
        'selected' => true,
        'error' => null,
        'confidence' => $best['confidence'],
        'reason' => $best['reason'],
        'monitor' => monitorDraftPayloadFromSuggestion($best, $input, $defaultTab),
        'alternatives' => array_values(array_filter($suggestions, fn($s) => ($s['type'] ?? '') !== ($best['type'] ?? ''))),
    ];
}

function buildMonitorDraftFromAnalysis(string $input, array $analysis, string $defaultTab): array {
    $suggestions = $analysis['suggestions'] ?? [];
    $best = pickBestMonitorSuggestion($suggestions);
    if (!$best) {
        return buildHeuristicMonitorDraft($input, $defaultTab);
    }

    return [
        'input' => $input,
        'selected' => true,
        'error' => null,
        'confidence' => $best['confidence'],
        'reason' => $best['reason'],
        'monitor' => monitorDraftPayloadFromSuggestion($best, $input, $defaultTab),
        'alternatives' => array_values(array_filter($suggestions, fn($s) => ($s['type'] ?? '') !== ($best['type'] ?? ''))),
        'probe_summary' => $analysis['probe_summary'] ?? null,
    ];
}

function stripSslFromMonitorDraft(array $draft, string $input, string $defaultTab): array {
    $alts = array_values(array_filter(
        $draft['alternatives'] ?? [],
        fn($s) => ($s['type'] ?? '') !== 'ssl'
    ));
    $draft['alternatives'] = $alts;
    if (($draft['monitor']['type'] ?? '') !== 'ssl') {
        return $draft;
    }
    if (!empty($alts)) {
        $best = $alts[0];
        $draft['monitor'] = monitorDraftPayloadFromSuggestion($best, $input, $defaultTab);
        $draft['confidence'] = $best['confidence'] ?? $draft['confidence'];
        $draft['reason'] = $best['reason'] ?? $draft['reason'];
        $draft['alternatives'] = array_slice($alts, 1);
        return $draft;
    }
    if (!empty($draft['monitor']) && is_array($draft['monitor'])) {
        $draft['monitor']['type'] = 'url';
        $draft['monitor']['interval'] = 5;
        $draft['monitor']['warning_threshold'] = 2;
        $draft['monitor']['keyword'] = null;
        $draft['monitor']['tab_name'] = $defaultTab;
        $draft['reason'] = 'URL check — SSL expiry uses the SSL Certificates bulk loader';
    }
    return $draft;
}

function handleMonitorSuggestBulk(): void {
    requireAdmin();

    $data = getJSONInput();
    $defaultTab = trim((string)($data['tab_name'] ?? 'General'));
    if ($defaultTab === '') {
        $defaultTab = 'General';
    }
    $fastMode = !empty($data['fast']);
    $excludeSsl = !isset($data['exclude_ssl']) || !empty($data['exclude_ssl']);

    $lines = [];
    if (isset($data['targets']) && is_array($data['targets'])) {
        foreach ($data['targets'] as $t) {
            $t = trim((string)$t);
            if ($t !== '') {
                $lines[] = $t;
            }
        }
        $lines = parseBulkMonitorTargetLines(implode("\n", $lines));
    } else {
        $lines = parseBulkMonitorTargetLines(trim((string)($data['text'] ?? '')));
    }

    if (empty($lines)) {
        sendJSON(['error' => 'Paste at least one URL, IP address, or host:port'], 400);
        return;
    }
    if (count($lines) > 100) {
        sendJSON(['error' => 'Maximum 100 targets per batch'], 400);
        return;
    }

    set_time_limit(max(60, min(300, count($lines) * 8)));

    $drafts = [];
    foreach ($lines as $line) {
        if ($fastMode) {
            $draft = buildHeuristicMonitorDraft($line, $defaultTab);
        } else {
            $analysis = analyzeMonitorTarget($line);
            if (isset($analysis['error'])) {
                $draft = buildHeuristicMonitorDraft($line, $defaultTab);
                if ($draft['monitor'] !== null) {
                    $draft['reason'] = trim(($draft['reason'] ?? '') . ' (live probe skipped: ' . $analysis['error'] . ')');
                } else {
                    $draft['error'] = $analysis['error'];
                    $draft['selected'] = false;
                }
            } else {
                $draft = buildMonitorDraftFromAnalysis($line, $analysis, $defaultTab);
            }
        }
        if ($excludeSsl) {
            $draft = stripSslFromMonitorDraft($draft, $line, $defaultTab);
        }
        $drafts[] = $draft;
    }

    $ready = count(array_filter($drafts, fn($d) => !empty($d['monitor'])));

    sendJSON([
        'success' => true,
        'drafts' => $drafts,
        'summary' => [
            'total' => count($drafts),
            'ready' => $ready,
            'failed' => count($drafts) - $ready,
            'fast_mode' => $fastMode,
            'default_tab' => $defaultTab,
        ],
    ]);
}
