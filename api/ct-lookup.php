<?php
/**
 * Proxy JSON from crt.sh.
 * GET ?spkisha256=64hex (preferred) — SubjectPublicKeyInfo SHA-256; crt.sh enables JSON for this query type.
 * GET ?sha256=64hex — full certificate SHA-256; JSON may be unavailable (HTML fallback).
 */
header('Content-Type: application/json');

if (session_status() === PHP_SESSION_NONE) {
    @session_start();
}
$ctRateKey = 'ssl_ct_lookup_ts';
$ctNow = time();
if (!isset($_SESSION[$ctRateKey]) || !is_array($_SESSION[$ctRateKey])) {
    $_SESSION[$ctRateKey] = [];
}
$_SESSION[$ctRateKey] = array_values(array_filter($_SESSION[$ctRateKey], static function ($t) use ($ctNow) {
    return ($ctNow - (int)$t) < 60;
}));
if (count($_SESSION[$ctRateKey]) >= 30) {
    http_response_code(429);
    echo json_encode(['ok' => false, 'message' => 'Too many CT lookups. Please wait a minute and try again.']);
    exit;
}
$_SESSION[$ctRateKey][] = $ctNow;
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

$spkiHex = isset($_GET['spkisha256']) ? preg_replace('/[^0-9a-f]/i', '', (string)$_GET['spkisha256']) : '';
$certFpHex = isset($_GET['sha256']) ? preg_replace('/[^0-9a-f]/i', '', (string)$_GET['sha256']) : '';

$crtShUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

$candidateUrls = [];
$crtShBrowserUrl = '';
$lookupKind = '';

if (strlen($spkiHex) === 64) {
    $lookupKind = 'spki';
    $crtShBrowserUrl = 'https://crt.sh/?spkisha256=' . $spkiHex;
    // Multiple JSON endpoints: primary sometimes 502; ?q= hex often works when spkisha256 JSON is overloaded.
    $candidateUrls = [
        $crtShBrowserUrl . '&output=json',
        'https://crt.sh/?q=' . rawurlencode($spkiHex) . '&output=json',
    ];
} elseif (strlen($certFpHex) === 64) {
    $lookupKind = 'cert';
    $crtShBrowserUrl = 'https://crt.sh/?sha256=' . $certFpHex;
    $candidateUrls = [
        $crtShBrowserUrl . '&output=json',
        'https://crt.sh/?q=' . rawurlencode($certFpHex) . '&output=json',
    ];
} else {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'Provide spkisha256 or sha256 (64 hex characters each).']);
    exit;
}

$body = null;
$lastHttp = 0;
$lastCurlErr = '';

/**
 * Fetch crt.sh with HTTP/1.1 (fewer edge-case 502s) and brief retries on 5xx.
 *
 * @param list<string> $urls
 */
$fetchCrtShCurl = static function (array $urls) use ($crtShUa): array {
    $bestBody = null;
    $bestHttp = 0;
    $bestErr = '';
    foreach ($urls as $url) {
        for ($attempt = 0; $attempt < 2; $attempt++) {
            if ($attempt > 0) {
                usleep(200000);
            }
            $ch = curl_init();
            curl_setopt_array($ch, [
                CURLOPT_URL => $url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 12,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_USERAGENT => $crtShUa,
                CURLOPT_ENCODING => '',
                CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            ]);
            $b = curl_exec($ch);
            $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlErr = ($b === false) ? curl_error($ch) : '';
            curl_close($ch);
            if ($b !== false && $http >= 200 && $http < 400) {
                return [$b, $http, ''];
            }
            $bestBody = $b;
            $bestHttp = $http;
            $bestErr = $curlErr;
            if ($http >= 500 || $http === 0) {
                continue;
            }
            break;
        }
    }
    return [$bestBody, $bestHttp, $bestErr];
};

if (function_exists('curl_init')) {
    [$body, $lastHttp, $lastCurlErr] = $fetchCrtShCurl($candidateUrls);
    if ($body === null || $body === false || $lastHttp < 200 || $lastHttp >= 400) {
        // Graceful response: SPA shows note (amber) instead of hard error — same idea as HTML/parse fallbacks below.
        $detail = $lastHttp > 0 ? 'HTTP ' . $lastHttp : 'connection error';
        if ($lastCurlErr !== '') {
            $detail .= ' (' . $lastCurlErr . ')';
        }
        echo json_encode([
            'ok' => true,
            'lookup_kind' => $lookupKind,
            'count_returned' => 0,
            'entries' => [],
            'crt_sh_query_url' => $crtShBrowserUrl,
            'note' => 'Could not fetch JSON from crt.sh from this server (' . $detail . '). Use “Open crt.sh” in your browser, or try again later.',
        ]);
        exit;
    }
} else {
    $body = null;
    foreach ($candidateUrls as $url) {
        $ctx = stream_context_create([
            'http' => [
                'timeout' => 25,
                'header' => "Accept-Encoding: gzip, deflate\r\nUser-Agent: {$crtShUa}\r\n",
                'protocol_version' => 1.1,
            ],
        ]);
        $body = @file_get_contents($url, false, $ctx);
        if ($body !== false && $body !== null && trim((string) $body) !== '') {
            break;
        }
        $body = null;
    }
    if ($body === false || $body === null) {
        echo json_encode([
            'ok' => true,
            'lookup_kind' => $lookupKind,
            'count_returned' => 0,
            'entries' => [],
            'crt_sh_query_url' => $crtShBrowserUrl,
            'note' => 'Could not fetch crt.sh (PHP curl extension not available or stream wrapper failed). Use “Open crt.sh” in your browser.',
        ]);
        exit;
    }
}

// Strip BOM / leading noise; crt.sh occasionally returns UTF-8 with bad bytes.
$body = preg_replace('/^\xEF\xBB\xBF/', '', (string) $body);
$body = trim($body);

if ($body === '') {
    echo json_encode([
        'ok' => true,
        'lookup_kind' => $lookupKind,
        'count_returned' => 0,
        'entries' => [],
        'crt_sh_query_url' => $crtShBrowserUrl,
        'note' => 'Empty response from crt.sh. Use “Open crt.sh” or try again later.',
    ]);
    exit;
}

// certwatch_db can embed pseudo-headers in the body before JSON (see BEGIN_HEADERS / END_HEADERS in crt.sh source).
if (strpos($body, '[END_HEADERS]') !== false) {
    $after = preg_split('/\[END_HEADERS\]\s*/', $body, 2);
    if (is_array($after) && isset($after[1])) {
        $body = trim($after[1]);
    }
}

// Looks like HTML (full page or fragment) — crt.sh may return HTML for some fingerprint + output=json combinations.
$trimForHtmlCheck = ltrim($body);
if ($trimForHtmlCheck !== '' && ($trimForHtmlCheck[0] === '<' || preg_match('/^\s*<\?xml/i', $trimForHtmlCheck))) {
    echo json_encode([
        'ok' => true,
        'lookup_kind' => $lookupKind,
        'count_returned' => 0,
        'entries' => [],
        'crt_sh_query_url' => $crtShBrowserUrl,
        'note' => 'crt.sh responded with a web page instead of JSON for this lookup. Use “Open crt.sh” for full results.',
    ]);
    exit;
}

$jsonFlags = 0;
if (defined('JSON_INVALID_UTF8_IGNORE')) {
    $jsonFlags |= JSON_INVALID_UTF8_IGNORE;
}
if (defined('JSON_BIGINT_AS_STRING')) {
    $jsonFlags |= JSON_BIGINT_AS_STRING;
}

/**
 * Drop text before the first JSON array or object (noise before `[` / `{`).
 */
$trimLeadingJunk = static function (string $raw): string {
    $raw = trim($raw);
    if ($raw === '' || $raw[0] === '[' || $raw[0] === '{') {
        return $raw;
    }
    $p = strpos($raw, '[');
    $po = strpos($raw, '{');
    if ($p === false && $po === false) {
        return $raw;
    }
    if ($p !== false && ($po === false || $p < $po)) {
        return substr($raw, $p);
    }
    return substr($raw, $po);
};

$body = $trimLeadingJunk($body);

/**
 * crt.sh sometimes returns multiple JSON objects glued together without an array: {...}{...}
 * Or adjacent arrays: [...][...]
 * See https://github.com/PaulSec/crt.sh — fix by inserting commas and wrapping in [].
 *
 * @return list<array<string, mixed>>|null
 */
$decodeCrtSh = static function (string $raw, int $flags): ?array {
    $try = static function (string $s) use ($flags): ?array {
        $decoded = json_decode($s, true, 8192, $flags);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return null;
        }
        if ($decoded === null) {
            return [];
        }
        if (!is_array($decoded)) {
            return null;
        }
        $isList = $decoded === [] || (array_key_exists(0, $decoded) && array_keys($decoded) === range(0, count($decoded) - 1));
        if (!$isList) {
            return [$decoded];
        }
        return $decoded;
    };

    $first = $try($raw);
    if ($first !== null) {
        return $first;
    }

    // Adjacent JSON arrays: [{...}][{...}] -> [{...},{...}]
    if (preg_match('/\]\s*\[/', $raw)) {
        $merged = preg_replace('/\]\s*\[/', ',', $raw);
        $second = $try($merged);
        if ($second !== null) {
            return $second;
        }
    }

    if (preg_match('/\}\s*\{/', $raw)) {
        $joined = preg_replace('/\}\s*\{/', '},{', $raw);
        $wrapped = '[' . $joined . ']';
        $third = $try($wrapped);
        if ($third !== null) {
            return $third;
        }
    }

    // One JSON object per line (rare)
    $lines = array_filter(array_map('trim', explode("\n", $raw)));
    if (count($lines) > 1) {
        $rows = [];
        foreach ($lines as $line) {
            if ($line === '' || $line[0] !== '{') {
                continue;
            }
            $one = json_decode($line, true, 8192, $flags);
            if (json_last_error() === JSON_ERROR_NONE && is_array($one)) {
                $rows[] = $one;
            }
        }
        if ($rows !== []) {
            return $rows;
        }
    }

    return null;
};

$decoded = $decodeCrtSh($body, $jsonFlags);
if ($decoded === null) {
    // Do not fail the request: crt.sh formats change; user can still open the HTML UI.
    echo json_encode([
        'ok' => true,
        'lookup_kind' => $lookupKind,
        'count_returned' => 0,
        'entries' => [],
        'crt_sh_query_url' => $crtShBrowserUrl,
        'note' => 'Could not parse crt.sh data as JSON (response format may have changed). Use “Open crt.sh” for CT log details.',
    ]);
    exit;
}

$max = 30;
$trimmed = array_slice($decoded, 0, $max);
$summaries = [];
foreach ($trimmed as $row) {
    if (!is_array($row)) {
        continue;
    }
    $summaries[] = [
        'id' => $row['id'] ?? null,
        'issuer_name' => $row['issuer_name'] ?? null,
        'name_value' => $row['name_value'] ?? null,
        'not_before' => $row['not_before'] ?? null,
        'not_after' => $row['not_after'] ?? null,
    ];
}

echo json_encode([
    'ok' => true,
    'lookup_kind' => $lookupKind,
    'count_returned' => count($summaries),
    'entries' => $summaries,
    'crt_sh_query_url' => $crtShBrowserUrl,
]);
exit;
