<?php
/**
 * OCSP (and best-effort CRL) check for a pasted leaf certificate PEM.
 * POST JSON: { "cert_pem": "...", "issuer_pem": "..." optional }
 * Only fetches URLs taken from the certificate (no arbitrary user URLs).
 */
header('Content-Type: application/json');

if (session_status() === PHP_SESSION_NONE) {
    @session_start();
}
$ocspRateKey = 'ssl_ocsp_crl_ts';
$ocspNow = time();
if (!isset($_SESSION[$ocspRateKey]) || !is_array($_SESSION[$ocspRateKey])) {
    $_SESSION[$ocspRateKey] = [];
}
$_SESSION[$ocspRateKey] = array_values(array_filter($_SESSION[$ocspRateKey], static function ($t) use ($ocspNow) {
    return ($ocspNow - (int)$t) < 60;
}));
if (count($_SESSION[$ocspRateKey]) >= 30) {
    http_response_code(429);
    echo json_encode(['ok' => false, 'message' => 'Too many OCSP/CRL checks. Please wait a minute and try again.']);
    exit;
}
$_SESSION[$ocspRateKey][] = $ocspNow;
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'message' => 'POST required']);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'Invalid JSON body']);
    exit;
}

$certPem = isset($data['cert_pem']) ? trim((string)$data['cert_pem']) : '';
$issuerPem = isset($data['issuer_pem']) ? trim((string)$data['issuer_pem']) : '';

if ($certPem === '' || !str_contains($certPem, '-----BEGIN CERTIFICATE-----')) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'cert_pem must be a PEM certificate']);
    exit;
}

$cert = openssl_x509_read($certPem);
if ($cert === false) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'Could not parse certificate']);
    exit;
}

$parsed = openssl_x509_parse($cert, false);
if ($parsed === false) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'Could not parse certificate metadata']);
    exit;
}

$ext = $parsed['extensions'] ?? [];
$aia = $ext['authorityInfoAccess'] ?? '';
$crlExt = $ext['crlDistributionPoints'] ?? '';

$ocspUrls = [];
if (preg_match_all('#OCSP\s*-\s*URI:([^\s,]+)#i', $aia, $m)) {
    foreach ($m[1] as $u) {
        $ocspUrls[] = trim($u);
    }
}

$crlUrls = [];
if (preg_match_all('#URI:([^\s,]+)#i', $crlExt, $m2)) {
    foreach ($m2[1] as $u) {
        $u = trim($u);
        if (stripos($u, 'http') === 0) {
            $crlUrls[] = $u;
        }
    }
}

$serial = isset($parsed['serialNumber']) ? (string)$parsed['serialNumber'] : '';
$serialHex = '';
if ($serial !== '') {
    if (ctype_xdigit(str_replace(':', '', $serial))) {
        $serialHex = strtoupper(str_replace(':', '', $serial));
    } else {
        $serialHex = strtoupper(bin2hex($serial));
    }
}

$bin = getenv('OPENSSL_BIN') ?: 'openssl';
$tmpdir = sys_get_temp_dir();
$certFile = tempnam($tmpdir, 'sf_leaf_');
$issuerFile = tempnam($tmpdir, 'sf_iss_');
$crlFile = tempnam($tmpdir, 'sf_crl_');

$ocspResult = [
    'attempted' => false,
    'status' => 'skipped',
    'detail' => '',
    'url' => null,
];

if ($issuerPem === '') {
    $ocspResult = [
        'attempted' => false,
        'status' => 'needs_issuer',
        'detail' => 'Provide issuer_pem (issuing CA certificate in PEM) to query OCSP.',
        'url' => $ocspUrls[0] ?? null,
    ];
} elseif ($ocspUrls === []) {
    $ocspResult = [
        'attempted' => false,
        'status' => 'no_ocsp_url',
        'detail' => 'No OCSP URI in Authority Information Access extension.',
        'url' => null,
    ];
} else {
    file_put_contents($certFile, $certPem);
    file_put_contents($issuerFile, $issuerPem);
    foreach ($ocspUrls as $ocspUrl) {
        if (!preg_match('#^https?://#i', $ocspUrl)) {
            continue;
        }
        $ocspResult['attempted'] = true;
        $ocspResult['url'] = $ocspUrl;
        $urlArg = escapeshellarg($ocspUrl);
        $cf = escapeshellarg($certFile);
        $if = escapeshellarg($issuerFile);
        $cmd = "{$bin} ocsp -issuer {$if} -cert {$cf} -url {$urlArg} -noverify -resp_text 2>&1";
        $out = [];
        $code = 0;
        @exec($cmd, $out, $code);
        $text = implode("\n", $out);
        $ocspResult['openssl_exit'] = $code;
        $ocspResult['raw_excerpt'] = strlen($text) > 2000 ? substr($text, 0, 2000) . '…' : $text;

        if (stripos($text, 'Cert Status: good') !== false) {
            $ocspResult['status'] = 'good';
            $ocspResult['detail'] = 'OCSP reports certificate as good.';
            break;
        }
        if (stripos($text, 'Cert Status: revoked') !== false) {
            $ocspResult['status'] = 'revoked';
            $ocspResult['detail'] = 'OCSP reports certificate as revoked.';
            break;
        }
        if (stripos($text, 'Cert Status: unknown') !== false) {
            $ocspResult['status'] = 'unknown';
            $ocspResult['detail'] = 'OCSP responder returned unknown.';
            break;
        }
        $ocspResult['status'] = 'error';
        $ocspResult['detail'] = 'Could not interpret OCSP output (check openssl/network).';
        continue;
    }
}

$crlResult = [
    'attempted' => false,
    'status' => 'skipped',
    'detail' => '',
    'url' => null,
];

if ($issuerPem !== '' && $crlUrls !== [] && $serialHex !== '') {
    foreach ($crlUrls as $crlUrl) {
        if (!preg_match('#^https?://#i', $crlUrl)) {
            continue;
        }
        $ctx = stream_context_create([
            'http' => ['timeout' => 12],
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
        ]);
        $der = @file_get_contents($crlUrl, false, $ctx);
        if ($der === false || $der === '') {
            $crlResult = [
                'attempted' => true,
                'status' => 'error',
                'detail' => 'Failed to download CRL.',
                'url' => $crlUrl,
            ];
            continue;
        }
        file_put_contents($crlFile, $der);
        $crlArg = escapeshellarg($crlFile);
        $if = escapeshellarg($issuerFile);
        $cmd = "{$bin} crl -inform DER -in {$crlArg} -CAfile {$if} -noout -text 2>&1";
        $out = [];
        $code = 0;
        @exec($cmd, $out, $code);
        $text = implode("\n", $out);
        $crlResult['attempted'] = true;
        $crlResult['url'] = $crlUrl;
        $crlResult['openssl_exit'] = $code;

        $serialPatterns = [$serialHex];
        if (strlen($serialHex) % 2 === 0 && strlen($serialHex) > 2) {
            $serialPatterns[] = implode(':', str_split($serialHex, 2));
        }
        $revoked = false;
        foreach ($serialPatterns as $pat) {
            if ($pat !== '' && stripos($text, $pat) !== false && stripos($text, 'Revoked Certificates') !== false) {
                $revoked = true;
                break;
            }
        }
        if ($code !== 0) {
            $crlResult['status'] = 'error';
            $crlResult['detail'] = 'OpenSSL could not parse CRL with given issuer.';
            break;
        }
        if ($revoked) {
            $crlResult['status'] = 'revoked';
            $crlResult['detail'] = 'Serial may appear in CRL revoked list (verify manually).';
            break;
        }
        $crlResult['status'] = 'not_revoked';
        $crlResult['detail'] = 'Serial not matched in CRL output (or not listed as revoked).';
        break;
    }
} elseif ($crlUrls !== [] && $issuerPem === '') {
    $crlResult = [
        'attempted' => false,
        'status' => 'needs_issuer',
        'detail' => 'Issuer PEM required to verify CRL signature.',
        'url' => $crlUrls[0] ?? null,
    ];
}

@unlink($certFile);
@unlink($issuerFile);
@unlink($crlFile);

echo json_encode([
    'ok' => true,
    'serial_hex' => $serialHex,
    'ocsp_urls' => $ocspUrls,
    'crl_urls' => $crlUrls,
    'ocsp' => $ocspResult,
    'crl' => $crlResult,
]);
exit;
