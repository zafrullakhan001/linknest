<?php
/**
 * Lightweight URL security letter grade (A+–F), same bands as SSL Labs-style SSL grades.
 * Based on HTTPS + common security headers from the probe response — not a full TLS scan.
 */

/**
 * @param array<string, string> $headers
 * @param array{detected?:bool,vendor?:string}|null $waf
 * @return array{letter:string,numeric:int,summary:string,checks:list<array{id:string,ok:bool,label:string}>}|null
 */
function url_grade_from_probe(string $url, int $httpCode, array $headers, ?array $waf): ?array
{
    if ($httpCode <= 0) {
        return null;
    }

    $h = array_change_key_case($headers, CASE_LOWER);
    $scheme = 'http';
    $parts = parse_url($url);
    if (is_array($parts) && strtolower((string) ($parts['scheme'] ?? '')) === 'https') {
        $scheme = 'https';
    }

    $csp = trim((string) ($h['content-security-policy'] ?? ''));
    $xfo = strtolower(trim((string) ($h['x-frame-options'] ?? '')));
    $xcto = strtolower(trim((string) ($h['x-content-type-options'] ?? '')));
    $referrer = trim((string) ($h['referrer-policy'] ?? ''));
    $permissions = trim((string) ($h['permissions-policy'] ?? $h['feature-policy'] ?? ''));
    $hsts = isset($h['strict-transport-security']) && trim((string) $h['strict-transport-security']) !== '';
    $hasHttps = $scheme === 'https';
    $hasCsp = $csp !== '';
    $hasNosniff = $xcto === 'nosniff' || str_contains($xcto, 'nosniff');
    $hasClickjack = $xfo !== '' || stripos($csp, 'frame-ancestors') !== false;
    $hasReferrer = $referrer !== '';
    $hasPermissions = $permissions !== '';
    $hasWaf = !empty($waf['detected']) && (($waf['vendor'] ?? '') !== '') && ($waf['vendor'] ?? '') !== 'Potential';

    $checks = [
        ['id' => 'https', 'ok' => $hasHttps, 'label' => $hasHttps ? 'HTTPS' : 'Not HTTPS'],
        ['id' => 'hsts', 'ok' => $hasHttps && $hsts, 'label' => $hsts ? 'HSTS' : 'No HSTS'],
        ['id' => 'csp', 'ok' => $hasCsp, 'label' => $hasCsp ? 'Content-Security-Policy' : 'No CSP'],
        ['id' => 'nosniff', 'ok' => $hasNosniff, 'label' => $hasNosniff ? 'X-Content-Type-Options' : 'No nosniff'],
        ['id' => 'clickjack', 'ok' => $hasClickjack, 'label' => $hasClickjack ? 'Clickjacking protection' : 'No X-Frame-Options'],
        ['id' => 'referrer', 'ok' => $hasReferrer, 'label' => $hasReferrer ? 'Referrer-Policy' : 'No Referrer-Policy'],
        ['id' => 'permissions', 'ok' => $hasPermissions, 'label' => $hasPermissions ? 'Permissions-Policy' : 'No Permissions-Policy'],
        ['id' => 'waf', 'ok' => $hasWaf, 'label' => $hasWaf ? ('WAF: ' . (string) $waf['vendor']) : 'No WAF fingerprint'],
    ];

    $score = 40;
    if ($hasHttps) {
        $score += 20;
    }
    if ($hasHttps && $hsts) {
        $score += 12;
    }
    if ($hasCsp) {
        $score += 12;
    }
    if ($hasNosniff) {
        $score += 8;
    }
    if ($hasClickjack) {
        $score += 8;
    }
    if ($hasReferrer) {
        $score += 5;
    }
    if ($hasPermissions) {
        $score += 3;
    }
    if ($hasWaf) {
        $score += 2;
    }

    $score = max(0, min(100, $score));
    $letter = url_grade_letter_from_score($score);

    // Plain HTTP cannot earn A/B even with strong headers.
    if (!$hasHttps) {
        $letter = url_grade_min_letter($letter, 'C');
    }

    $passed = 0;
    foreach ($checks as $check) {
        if ($check['ok']) {
            $passed++;
        }
    }
    $summary = $passed . '/' . count($checks) . ' URL security checks · ' . $score . '/100';

    return [
        'letter' => $letter,
        'numeric' => $score,
        'summary' => $summary,
        'checks' => $checks,
    ];
}

function url_grade_letter_from_score(int $score): string
{
    $s = max(0, min(100, $score));
    if ($s >= 98) {
        return 'A+';
    }
    if ($s >= 93) {
        return 'A';
    }
    if ($s >= 90) {
        return 'A-';
    }
    if ($s >= 87) {
        return 'B+';
    }
    if ($s >= 83) {
        return 'B';
    }
    if ($s >= 80) {
        return 'B-';
    }
    if ($s >= 77) {
        return 'C+';
    }
    if ($s >= 73) {
        return 'C';
    }
    if ($s >= 70) {
        return 'C-';
    }
    if ($s >= 60) {
        return 'D';
    }
    return 'F';
}

function url_grade_min_letter(string $a, string $b): string
{
    $order = ['F', 'D', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+'];
    $ia = array_search($a, $order, true);
    $ib = array_search($b, $order, true);
    if ($ia === false) {
        return $b;
    }
    if ($ib === false) {
        return $a;
    }
    return $order[min((int) $ia, (int) $ib)];
}
