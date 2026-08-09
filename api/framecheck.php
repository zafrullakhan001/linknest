<?php
/**
 * Check whether a URL allows embedding in an iframe (X-Frame-Options / CSP frame-ancestors).
 * GET /api/framecheck?url=https://example.com
 */
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$rawUrl = isset($_GET['url']) ? trim((string)$_GET['url']) : '';
if ($rawUrl === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing url parameter']);
    exit;
}

if (!preg_match('#^https?://#i', $rawUrl)) {
    $rawUrl = 'https://' . $rawUrl;
}

$parts = parse_url($rawUrl);
if ($parts === false || empty($parts['host']) || !in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid URL']);
    exit;
}

$host = strtolower($parts['host']);
if ($host === 'localhost' || $host === '127.0.0.1' || str_ends_with($host, '.localhost')) {
    // Local targets are typically same-origin/self-hosted — treat as embeddable for preview.
    echo json_encode([
        'data' => [
            'url' => $rawUrl,
            'embeddable' => true,
            'reason' => null,
            'x_frame_options' => null,
            'csp_frame_ancestors' => null,
            'http_code' => 0,
        ],
    ]);
    exit;
}

/**
 * @return array{embeddable: bool, reason: ?string, x_frame_options: ?string, csp_frame_ancestors: ?string, http_code: int, final_url: string}
 */
function linknest_check_frame_embed(string $url): array
{
    $headers = [];
    $headerCallback = static function ($ch, string $headerLine) use (&$headers): int {
        $len = strlen($headerLine);
        if (strpos($headerLine, ':') !== false) {
            [$name, $value] = explode(':', $headerLine, 2);
            $key = strtolower(trim($name));
            $val = trim($value);
            if ($key !== '') {
                // Capture last occurrence (redirects overwrite)
                $headers[$key] = $val;
            }
        }
        return $len;
    };

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_NOBODY => true,
        CURLOPT_HEADER => false,
        CURLOPT_HEADERFUNCTION => $headerCallback,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_USERAGENT => 'LinkNest Frame Check/1.0',
        CURLOPT_HTTPHEADER => [
            'Accept: */*',
            'Cache-Control: no-cache',
        ],
    ]);

    curl_exec($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $finalUrl = (string)(curl_getinfo($ch, CURLINFO_EFFECTIVE_URL) ?: $url);
    $errno = curl_errno($ch);
    curl_close($ch);

    // Some hosts reject HEAD — retry a lightweight GET of headers only.
    if ($errno || $httpCode === 0 || $httpCode === 405 || $httpCode === 501) {
        $headers = [];
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_NOBODY => false,
            CURLOPT_HEADER => false,
            CURLOPT_HEADERFUNCTION => $headerCallback,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
            CURLOPT_USERAGENT => 'LinkNest Frame Check/1.0',
            CURLOPT_HTTPHEADER => [
                'Accept: text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
                'Range: bytes=0-0',
            ],
        ]);
        curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $finalUrl = (string)(curl_getinfo($ch, CURLINFO_EFFECTIVE_URL) ?: $url);
        curl_close($ch);
    }

    $xfo = $headers['x-frame-options'] ?? null;
    $csp = $headers['content-security-policy'] ?? ($headers['content-security-policy-report-only'] ?? null);
    $frameAncestors = null;

    if (is_string($csp) && $csp !== '') {
        if (preg_match('/frame-ancestors\s+([^;]+)/i', $csp, $m)) {
            $frameAncestors = trim($m[1]);
        }
    }

    $embeddable = true;
    $reason = null;

    if (is_string($xfo) && $xfo !== '') {
        $xfoNorm = strtoupper(trim($xfo));
        if ($xfoNorm === 'DENY' || str_contains($xfoNorm, 'DENY')) {
            $embeddable = false;
            $reason = 'X-Frame-Options: DENY';
        } elseif ($xfoNorm === 'SAMEORIGIN' || str_contains($xfoNorm, 'SAMEORIGIN')) {
            $embeddable = false;
            $reason = 'X-Frame-Options: SAMEORIGIN';
        }
    }

    if ($embeddable && is_string($frameAncestors) && $frameAncestors !== '') {
        $fa = strtolower($frameAncestors);
        // 'none' or missing * / our host → treat as blocked for third-party embed
        if (preg_match('/(?:^|\s)\'?none\'?(?:\s|$)/', $fa)) {
            $embeddable = false;
            $reason = "CSP frame-ancestors 'none'";
        } elseif (!str_contains($fa, '*')) {
            // Restrictive list without wildcard — almost always blocks us
            $embeddable = false;
            $reason = 'CSP frame-ancestors restricts embedding';
        }
    }

    return [
        'embeddable' => $embeddable,
        'reason' => $reason,
        'x_frame_options' => $xfo,
        'csp_frame_ancestors' => $frameAncestors,
        'http_code' => $httpCode,
        'final_url' => $finalUrl,
    ];
}

try {
    $result = linknest_check_frame_embed($rawUrl);
    echo json_encode([
        'data' => [
            'url' => $rawUrl,
            'embeddable' => $result['embeddable'],
            'reason' => $result['reason'],
            'x_frame_options' => $result['x_frame_options'],
            'csp_frame_ancestors' => $result['csp_frame_ancestors'],
            'http_code' => $result['http_code'],
            'final_url' => $result['final_url'],
        ],
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Frame check failed',
        'data' => [
            'url' => $rawUrl,
            'embeddable' => null,
            'reason' => null,
        ],
    ]);
}
