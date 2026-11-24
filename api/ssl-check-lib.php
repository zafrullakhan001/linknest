<?php
/**
 * Shared helpers for api/ssl-check.php (chain trust, headers, DNSSEC, DANE, deep scan, SSRF).
 */

/**
 * Resolve OpenSSL CLI path (XAMPP/Windows often has openssl.exe outside PATH).
 */
function ssl_check_openssl_bin(): ?string {
    static $resolved = null;
    if ($resolved !== null) {
        return $resolved === '' ? null : $resolved;
    }

    $env = getenv('OPENSSL_BIN');
    if (is_string($env) && $env !== '' && is_file($env)) {
        $resolved = $env;
        return $resolved;
    }

    $candidates = [];
    $phpDir = dirname(PHP_BINARY);
    $candidates[] = $phpDir . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'apache' . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'openssl.exe';
    $candidates[] = $phpDir . DIRECTORY_SEPARATOR . 'extras' . DIRECTORY_SEPARATOR . 'openssl' . DIRECTORY_SEPARATOR . 'openssl.exe';
    if (PHP_OS_FAMILY === 'Windows') {
        foreach (['C:\\xampp', 'D:\\xampp'] as $root) {
            $candidates[] = $root . '\\apache\\bin\\openssl.exe';
        }
        $out = [];
        @exec('where openssl 2>nul', $out, $code);
        if ($code === 0 && !empty($out[0]) && is_file(trim($out[0]))) {
            $candidates[] = trim($out[0]);
        }
    }
    $candidates[] = 'openssl';

    foreach ($candidates as $path) {
        if ($path === 'openssl') {
            $test = [];
            @exec('openssl version 2>&1', $test, $code);
            if ($code === 0) {
                $resolved = 'openssl';
                return $resolved;
            }
            continue;
        }
        if (is_file($path)) {
            $resolved = $path;
            return $resolved;
        }
    }

    $resolved = '';
    return null;
}

function ssl_check_is_openssl_cli_error(string $output): bool {
    return stripos($output, 'not recognized as an internal or external command') !== false
        || stripos($output, "'openssl' is not recognized") !== false
        || stripos($output, 'cannot find the file') !== false;
}

function ssl_check_normalize_host(string $host): string {
    $host = preg_replace('#^https?://#i', '', trim($host));
    $host = preg_replace('#/.*$#', '', $host);
    $host = preg_replace('#:.*$#', '', $host);
    return strtolower(rtrim($host, '.'));
}

/**
 * Block only loopback / link-local / cloud-metadata style targets.
 * Intranet (RFC1918, .corp / .local / .internal / .lan) is allowed for LinkNest.
 */
function ssl_check_is_dangerous_ip(string $ip): bool {
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        $long = ip2long($ip);
        if ($long === false) {
            return true;
        }
        // 0.0.0.0/8
        if (($long & 0xFF000000) === 0x00000000) {
            return true;
        }
        // 127.0.0.0/8 loopback
        if (($long & 0xFF000000) === 0x7F000000) {
            return true;
        }
        // 169.254.0.0/16 link-local + cloud metadata
        if (($long & 0xFFFF0000) === 0xA9FE0000) {
            return true;
        }
        return false;
    }
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        $normalized = strtolower($ip);
        if ($normalized === '::1' || $normalized === '0:0:0:0:0:0:0:1') {
            return true;
        }
        // fe80::/10 link-local
        if (preg_match('/^fe[89ab]/i', $normalized)) {
            return true;
        }
        // ::ffff:127.x / ::ffff:169.254.x mapped IPv4
        if (preg_match('/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i', $normalized, $m)) {
            return ssl_check_is_dangerous_ip($m[1]);
        }
        return false;
    }
    return true;
}

function ssl_check_is_blocked_target(string $host): ?string {
    if ($host === '' || strlen($host) > 253) {
        return 'Invalid hostname';
    }
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        if (ssl_check_is_dangerous_ip($host)) {
            return 'Loopback, link-local, or metadata IP addresses are not allowed';
        }
        return null;
    }
    if (!preg_match('/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i', $host)) {
        return 'Invalid hostname characters';
    }
    $blocked = ['localhost', 'localhost.localdomain'];
    if (in_array($host, $blocked, true)) {
        return 'localhost is not allowed';
    }
    if (str_ends_with($host, '.localhost')) {
        return 'localhost is not allowed';
    }
    // Allow intranet-style TLDs (.local, .corp, .internal, .lan, etc.)
    $resolved = @gethostbyname($host);
    if ($resolved !== $host && $resolved !== '' && filter_var($resolved, FILTER_VALIDATE_IP) && ssl_check_is_dangerous_ip($resolved)) {
        return 'Hostname resolves to a loopback, link-local, or metadata IP';
    }
    return null;
}

/**
 * @param OpenSSLCertificate|resource $cert
 * @return array<string, mixed>|null
 */
function ssl_check_cert_meta($cert): ?array {
    if ($cert === null) {
        return null;
    }
    $parsed = @openssl_x509_parse($cert, false);
    if (!$parsed) {
        return null;
    }
    $pub = @openssl_pkey_get_public($cert);
    $keyType = null;
    $keyBits = null;
    if ($pub !== false) {
        $details = @openssl_pkey_get_details($pub);
        if (is_array($details)) {
            $keyType = $details['type'] ?? null;
            $keyBits = $details['bits'] ?? null;
        }
    }
    $sigAlg = $parsed['signatureTypeSN'] ?? ($parsed['signatureTypeLN'] ?? null);
    $bc = $parsed['extensions']['basicConstraints'] ?? '';
    $isCa = stripos((string)$bc, 'CA:TRUE') !== false;
    $scts = isset($parsed['extensions']['signed_certificate_timestamp']) ? true : false;
    return [
        'serial' => isset($parsed['serialNumber']) ? (string)$parsed['serialNumber'] : null,
        'signature_algorithm' => $sigAlg,
        'key_type' => $keyType === OPENSSL_KEYTYPE_RSA ? 'RSA' : ($keyType === OPENSSL_KEYTYPE_EC ? 'EC' : ($keyType === OPENSSL_KEYTYPE_DSA ? 'DSA' : null)),
        'key_bits' => $keyBits,
        'is_ca' => $isCa,
        'has_embedded_scts' => $scts,
        'ski' => $parsed['extensions']['subjectKeyIdentifier'] ?? null,
        'aki' => $parsed['extensions']['authorityKeyIdentifier'] ?? null,
    ];
}

/**
 * @param list<string> $chainPems leaf first
 */
function ssl_check_verify_chain(array $chainPems): array {
    $result = [
        'status' => 'unknown',
        'trusted' => null,
        'chain_complete' => null,
        'missing_intermediate' => false,
        'extra_certs' => count($chainPems) > 3,
        'leaf_is_ca' => false,
        'weak_signature' => false,
        'weak_key' => false,
        'messages' => [],
        'remediation' => [],
    ];
    if ($chainPems === []) {
        $result['status'] = 'no_chain';
        $result['messages'][] = 'No certificate chain was returned.';
        return $result;
    }

    $certs = [];
    foreach ($chainPems as $pem) {
        $c = @openssl_x509_read($pem);
        if ($c !== false) {
            $certs[] = $c;
        }
    }
    if ($certs === []) {
        $result['status'] = 'unreadable';
        $result['messages'][] = 'Could not parse presented certificates.';
        return $result;
    }

    $leafMeta = ssl_check_cert_meta($certs[0]);
    if ($leafMeta) {
        $result['leaf_is_ca'] = !empty($leafMeta['is_ca']);
        if ($result['leaf_is_ca']) {
            $result['messages'][] = 'Leaf certificate has CA:TRUE (should be end-entity).';
        }
        $sig = strtolower((string)($leafMeta['signature_algorithm'] ?? ''));
        if (str_contains($sig, 'sha1') || str_contains($sig, 'md5')) {
            $result['weak_signature'] = true;
            $result['messages'][] = 'Leaf uses a weak signature algorithm.';
        }
        $bits = (int)($leafMeta['key_bits'] ?? 0);
        $type = $leafMeta['key_type'] ?? '';
        if ($type === 'RSA' && $bits > 0 && $bits < 2048) {
            $result['weak_key'] = true;
            $result['messages'][] = 'RSA key is shorter than 2048 bits.';
        }
    }

    $linksOk = true;
    for ($i = 0; $i < count($certs) - 1; $i++) {
        $issuerKey = @openssl_pkey_get_public($certs[$i + 1]);
        if ($issuerKey === false) {
            $linksOk = false;
            break;
        }
        $v = @openssl_x509_verify($certs[$i], $issuerKey);
        if ($v !== 1) {
            $linksOk = false;
            $result['messages'][] = 'Certificate at position ' . ($i + 1) . ' is not signed by the next certificate in the chain.';
            break;
        }
    }

    $result['chain_complete'] = $linksOk && count($certs) >= 1;
    if (!$linksOk) {
        $result['missing_intermediate'] = true;
        $result['status'] = 'incomplete';
        $result['remediation'][] = 'Install the missing intermediate certificate on the server.';
        $result['remediation'][] = 'Use the Chain validator tool with the served PEM chain.';
    } elseif (count($certs) === 1) {
        $result['missing_intermediate'] = true;
        $result['status'] = 'incomplete';
        $result['messages'][] = 'Only the leaf certificate was served; intermediates may be missing for some clients.';
        $result['remediation'][] = 'Configure the server to send the full certificate chain.';
    } else {
        $result['status'] = 'presented_ok';
    }

    $bin = ssl_check_openssl_bin();
    if ($bin === null) {
        $result['messages'][] = 'System trust store check skipped (OpenSSL CLI not found on this server). Link verification above still applies.';
        $result['remediation'][] = 'Install OpenSSL or set OPENSSL_BIN (e.g. C:\\xampp\\apache\\bin\\openssl.exe) for full trust-store verification.';
        return $result;
    }

    $tmpdir = sys_get_temp_dir();
    $leafFile = tempnam($tmpdir, 'sslleaf_');
    $chainFile = tempnam($tmpdir, 'sslchain_');
    if (!$leafFile || !$chainFile) {
        return $result;
    }

    file_put_contents($leafFile, $chainPems[0]);
    $extra = array_slice($chainPems, 1);
    $caFile = ini_get('openssl.cafile');
    $caArg = (is_string($caFile) && $caFile !== '' && is_readable($caFile))
        ? ' -CAfile ' . escapeshellarg($caFile)
        : '';

    if ($extra !== []) {
        file_put_contents($chainFile, implode("\n", $extra));
        $cmd = escapeshellarg($bin) . ' verify' . $caArg . ' -untrusted ' . escapeshellarg($chainFile) . ' ' . escapeshellarg($leafFile) . ' 2>&1';
    } else {
        $cmd = escapeshellarg($bin) . ' verify' . $caArg . ' ' . escapeshellarg($leafFile) . ' 2>&1';
    }

    $out = [];
    @exec($cmd, $out, $code);
    @unlink($leafFile);
    @unlink($chainFile);

    if ($code === 0) {
        $result['trusted'] = true;
        if ($result['status'] === 'presented_ok' || $result['status'] === 'incomplete') {
            $result['status'] = 'trusted';
            if ($result['missing_intermediate'] && count($certs) === 1) {
                $result['status'] = 'presented_ok';
                $result['trusted'] = true;
            }
        }
        $result['messages'][] = 'Chain verifies against the PHP CA bundle (openssl verify).';
        return $result;
    }

    if ($out === []) {
        return $result;
    }

    $line = implode(' ', $out);
    if (ssl_check_is_openssl_cli_error($line)) {
        $result['messages'][] = 'System trust store check skipped (OpenSSL CLI could not run).';
        return $result;
    }

    $result['trusted'] = false;
    if ($result['status'] !== 'incomplete') {
        $result['status'] = 'untrusted';
    }
    if (stripos($line, 'unable to get local issuer') !== false) {
        $result['missing_intermediate'] = true;
        $result['messages'][] = 'Unable to build chain to a trusted root (missing intermediate or unknown issuer).';
    } elseif (stripos($line, 'self signed certificate') !== false) {
        $result['messages'][] = 'Certificate chain ends in a self-signed certificate not in the trust store.';
    } else {
        $result['messages'][] = 'Trust verification failed: ' . $line;
    }

    return $result;
}

function ssl_check_hsts_preload_readiness(?array $hstsParsed): array {
    $minAge = 31536000;
    $checks = [
        'hsts_header_present' => $hstsParsed !== null,
        'max_age_sufficient' => false,
        'include_subdomains' => false,
        'preload_token' => false,
        'preload_ready' => false,
        'warnings' => [],
        'notes' => [],
    ];
    if ($hstsParsed === null) {
        $checks['notes'][] = 'No Strict-Transport-Security header on the HTTPS response.';
        return $checks;
    }
    $age = (int)($hstsParsed['max_age'] ?? 0);
    $checks['max_age_sufficient'] = $age >= $minAge;
    $checks['include_subdomains'] = !empty($hstsParsed['include_subdomains']);
    $checks['preload_token'] = !empty($hstsParsed['preload']);
    $checks['preload_ready'] = $checks['max_age_sufficient'] && $checks['include_subdomains'] && $checks['preload_token'];

    if ($checks['preload_token'] && !$checks['max_age_sufficient']) {
        $checks['warnings'][] = 'preload token is set but max-age is below 31536000 (1 year).';
    }
    if ($checks['preload_ready']) {
        $checks['notes'][] = 'Meets hstspreload.org header requirements; confirm HTTP redirects and subdomain coverage before submitting.';
    }
    return $checks;
}

/**
 * @param array<string, string> $headers lowercase keys
 */
function ssl_check_analyze_headers(array $headers): array {
    $expected = [
        'strict-transport-security',
        'content-security-policy',
        'x-content-type-options',
        'x-frame-options',
        'referrer-policy',
        'permissions-policy',
        'cross-origin-opener-policy',
        'cross-origin-embedder-policy',
        'cross-origin-resource-policy',
        'clear-site-data',
    ];
    $informational = ['report-to', 'nel', 'expect-ct'];
    $findings = [];

    foreach ($expected as $h) {
        if (!array_key_exists($h, $headers)) {
            $findings[] = ['header' => $h, 'status' => 'missing', 'detail' => 'Header not present', 'quality' => null];
        } else {
            $findings[] = ['header' => $h, 'status' => 'present', 'detail' => $headers[$h], 'quality' => ssl_check_header_quality($h, $headers[$h])];
        }
    }
    foreach ($informational as $h) {
        if (array_key_exists($h, $headers)) {
            $findings[] = ['header' => $h, 'status' => 'present', 'detail' => $headers[$h], 'quality' => 'informational'];
        }
    }
    return $findings;
}

function ssl_check_header_quality(string $header, string $value): ?string {
    $v = strtolower($value);
    if ($header === 'content-security-policy') {
        if (str_contains($v, 'unsafe-inline') || str_contains($v, 'unsafe-eval')) {
            return 'weak';
        }
        return 'ok';
    }
    if ($header === 'x-frame-options') {
        if (str_contains($v, 'allow-from')) {
            return 'deprecated';
        }
        return 'ok';
    }
    if ($header === 'expect-ct') {
        return 'deprecated';
    }
    if ($header === 'cross-origin-embedder-policy' && $v !== 'require-corp' && $v !== 'credentialless') {
        return 'note';
    }
    return null;
}

function ssl_check_dns_query_type(string $server, string $hostname, int $type, int $timeoutSec = 3): array {
    return ssl_check_dns_query_udp($server, $hostname, $type, $timeoutSec);
}

/**
 * Read-only DNSSEC hints (presence of DNSKEY/DS, not full validation).
 */
function ssl_check_dnssec_hints(string $host, array $resolver): array {
    $out = [
        'status' => 'unsigned_or_unknown',
        'dnskey_present' => false,
        'ds_present' => false,
        'note' => 'Read-only hint: this does not perform full DNSSEC validation.',
    ];
    $server = ($resolver['server'] ?? null);
    $records = [];
    if ($server === null || $server === '') {
        if (defined('DNS_DNSKEY') && defined('DNS_DS')) {
            $raw = @dns_get_record($host, DNS_DNSKEY | DNS_DS);
            if (is_array($raw)) {
                $records = $raw;
            }
        } else {
            // PHP build lacks DNS_DNSKEY/DNS_DS constants (common on Windows) — UDP fallback
            $fallbackDns = '1.1.1.1';
            $key = ssl_check_dns_query_udp($fallbackDns, $host, 48);
            $ds = ssl_check_dns_query_udp($fallbackDns, $host, 43);
            $records = array_merge($key['records'] ?? [], $ds['records'] ?? []);
            $out['note'] .= ' System resolver lacks DNSSEC types; used Cloudflare DNS (1.1.1.1) for hints only.';
        }
    } else {
        $key = ssl_check_dns_query_udp((string)$server, $host, 48);
        $ds = ssl_check_dns_query_udp((string)$server, $host, 43);
        $records = array_merge($key['records'] ?? [], $ds['records'] ?? []);
    }
    if ($records === []) {
        return $out;
    }
    foreach ($records as $r) {
        if (($r['type'] ?? '') === 'DNSKEY' || (isset($r['type']) && (int)$r['type'] === 48)) {
            $out['dnskey_present'] = true;
        }
        if (($r['type'] ?? '') === 'DS' || (isset($r['type']) && (int)$r['type'] === 43)) {
            $out['ds_present'] = true;
        }
    }
    if ($out['dnskey_present'] || $out['ds_present']) {
        $out['status'] = 'dnssec_data_present';
    }
    return $out;
}

/**
 * TLSA (DANE) read-only lookup on _port._tcp.host
 */
function ssl_check_dane_tlsa(string $host, int $port, array $resolver, ?string $spkiSha256Hex = null): array {
    $tlsaName = '_' . $port . '._tcp.' . rtrim($host, '.');
    $records = [];
    if (($resolver['server'] ?? null) === null || $resolver['server'] === '') {
        if (defined('DNS_TLSA')) {
            $raw = @dns_get_record($tlsaName, DNS_TLSA);
            if (is_array($raw)) {
                foreach ($raw as $r) {
                    if (isset($r['certusage'], $r['selector'], $r['matchingtype'], $r['certificate'])) {
                        $records[] = [
                            'usage' => (int)$r['certusage'],
                            'selector' => (int)$r['selector'],
                            'matching_type' => (int)$r['matchingtype'],
                            'data' => bin2hex($r['certificate']),
                        ];
                    }
                }
            }
        } else {
            $q = ssl_check_dns_query_udp('1.1.1.1', $tlsaName, 52);
            foreach (($q['records'] ?? []) as $r) {
                if (($r['type'] ?? '') === 'TLSA' || isset($r['usage'])) {
                    $records[] = $r;
                }
            }
        }
    } else {
        $q = ssl_check_dns_query_udp((string)$resolver['server'], $tlsaName, 52);
        foreach (($q['records'] ?? []) as $r) {
            if (($r['type'] ?? '') === 'TLSA' || (isset($r['usage']))) {
                $records[] = $r;
            }
        }
    }
    $match = null;
    if ($spkiSha256Hex !== null && $records !== []) {
        $norm = strtolower(preg_replace('/[^0-9a-f]/', '', $spkiSha256Hex));
        foreach ($records as $rec) {
            $data = strtolower((string)($rec['data'] ?? ''));
            if ($data !== '' && str_contains($data, $norm)) {
                $match = true;
                break;
            }
        }
        if ($match === null) {
            $match = false;
        }
    }
    return [
        'tlsa_name' => $tlsaName,
        'records' => $records,
        'spki_match' => $match,
        'note' => 'Read-only TLSA lookup; does not replace PKIX validation.',
    ];
}

/**
 * Probe TLS protocol support via openssl s_client (optional deep scan).
 */
function ssl_check_deep_tls_matrix(string $host, int $port, ?string $connectIp = null, int $timeoutSec = 5): array {
    $bin = ssl_check_openssl_bin();
    if ($bin === null) {
        return [
            'rows' => [],
            'client_notes' => [],
            'note' => 'Deep scan requires the OpenSSL CLI (not found on this server).',
        ];
    }
    $connectHost = $connectIp !== null ? ssl_check_stream_endpoint_host($connectIp) : $host;
    $connect = escapeshellarg("{$connectHost}:{$port}");
    $sni = escapeshellarg($host);
    $probes = [
        ['id' => 'TLSv1.3', 'flag' => '-tls1_3'],
        ['id' => 'TLSv1.2', 'flag' => '-tls1_2'],
        ['id' => 'TLSv1.1', 'flag' => '-tls1_1'],
        ['id' => 'TLSv1', 'flag' => '-tls1'],
    ];
    $rows = [];
    foreach ($probes as $probe) {
        $cmd = escapeshellarg($bin) . ' s_client ' . $probe['flag'] . ' -connect ' . $connect . ' -servername ' . $sni . ' 2>&1';
        $out = [];
        @exec($cmd, $out, $code);
        $text = implode("\n", $out);
        $supported = str_contains($text, 'CONNECTED') || str_contains($text, 'Cipher');
        $protocol = null;
        $cipher = null;
        if (preg_match('/Protocol\s*:\s*(\S+)/', $text, $m)) {
            $protocol = $m[1];
        }
        if (preg_match('/Cipher\s*:\s*(\S+)/', $text, $m)) {
            $cipher = $m[1];
        }
        $rows[] = [
            'version' => $probe['id'],
            'supported' => $supported,
            'protocol' => $protocol,
            'cipher' => $cipher,
            'severity' => ($probe['id'] === 'TLSv1' || $probe['id'] === 'TLSv1.1') && $supported ? 'warn' : ($supported ? 'ok' : 'info'),
        ];
    }
    $clientNotes = [];
    if (!($rows[2]['supported'] ?? false) && !($rows[3]['supported'] ?? false)) {
        $clientNotes[] = 'TLS 1.0/1.1 appear disabled; legacy clients (old Android, IE on Windows 7) may fail.';
    }
    if ($rows[0]['supported'] ?? false) {
        $clientNotes[] = 'TLS 1.3 is supported.';
    }
    return [
        'rows' => $rows,
        'client_notes' => $clientNotes,
        'note' => 'Deep scan uses multiple openssl s_client probes; rate-limit applies.',
    ];
}

function ssl_check_spki_sha256_hex_from_pem(string $pem): ?string {
    $cert = @openssl_x509_read($pem);
    if ($cert === false) {
        return null;
    }
    $pub = @openssl_pkey_get_public($cert);
    if ($pub === false) {
        return null;
    }
    $details = @openssl_pkey_get_details($pub);
    if (!is_array($details) || empty($details['key'])) {
        return null;
    }
    $der = null;
    $keyPem = $details['key'];
    if (preg_match('/-----BEGIN PUBLIC KEY-----\s*(.+?)\s*-----END PUBLIC KEY-----/s', $keyPem, $m)) {
        $der = base64_decode(preg_replace('/\s+/', '', $m[1]));
    }
    if ($der === null || $der === false) {
        return null;
    }
    return strtolower(hash('sha256', $der));
}
