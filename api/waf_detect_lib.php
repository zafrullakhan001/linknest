<?php
/**
 * Heuristic WAF/CDN detection from HTTP response headers.
 * Shared by SSL URL checker and the edit-form URL probe badges.
 */

/**
 * @param array<string, string> $headers Header name => value (any case)
 * @return array{detected:bool,vendor:string,reason:string,source:string}|null
 */
function waf_match_from_headers(array $headers): ?array
{
    $h = array_change_key_case($headers, CASE_LOWER);
    $server = strtolower((string) ($h['server'] ?? ''));
    $via = strtolower((string) ($h['via'] ?? ''));
    $xCache = strtolower((string) ($h['x-cache'] ?? ''));
    $xServedBy = strtolower((string) ($h['x-served-by'] ?? ''));
    $cookies = strtolower((string) ($h['set-cookie'] ?? ''));
    $reportTo = strtolower((string) ($h['report-to'] ?? ''));

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
    if (isset($h['x-bunny-cache']) || str_contains($server, 'bunnycdn')) {
        return [
            'detected' => true,
            'vendor' => 'BunnyCDN',
            'reason' => 'HTTP response headers include BunnyCDN fingerprints',
            'source' => 'headers',
        ];
    }
    if (isset($h['x-nf-request-id']) || str_contains($server, 'netlify')) {
        return [
            'detected' => true,
            'vendor' => 'Netlify',
            'reason' => 'HTTP response headers include Netlify fingerprints',
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
