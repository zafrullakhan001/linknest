<?php
/**
 * GeoIP Lookup Service
 * Uses MaxMind GeoLite2 database for offline IP geolocation
 * 
 * Requires: composer require geoip2/geoip2:~2.0
 * Database: GeoLite2-City.mmdb (download from MaxMind)
 */

/**
 * Get geographic location from IP address
 * Returns array with country, region, city, latitude, longitude, etc.
 * Falls back gracefully for unknown IPs
 * 
 * @param string $ip
 * @return array
 */
function getGeoFromIP(string $ip): array {
    // Default response for unknown IPs
    $defaultGeo = [
        'ip' => $ip,
        'continent_code' => null,
        'country_code' => 'XX',
        'country_name' => 'Unknown',
        'region_name' => 'Unknown',
        'city_name' => 'Unknown',
        'latitude' => 0.0,
        'longitude' => 0.0,
        'timezone' => 'UTC',
        'isp' => null,
        'accuracy_radius' => null
    ];
    
    // Skip private/local IPs
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
        $defaultGeo['country_name'] = 'Local/Private';
        $defaultGeo['region_name'] = 'Local Network';
        return $defaultGeo;
    }
    
    // Use online API fallback if GeoIP2 library not available
    if (!class_exists('GeoIp2\Database\Reader')) {
        return getGeoFromIPApi($ip);
    }
    
    try {
        // Check if GeoLite2 database exists
        $dbPath = __DIR__ . '/GeoLite2-City.mmdb';
        
        if (!file_exists($dbPath)) {
            error_log("GeoLite2 database not found at: $dbPath, using online API");
            return getGeoFromIPApi($ip);
        }
        
        // Create reader (fully qualified class name)
        $reader = new \GeoIp2\Database\Reader($dbPath);
        
        // Lookup IP
        $record = $reader->city($ip);
        
        return [
            'ip' => $ip,
            'continent_code' => $record->continent->code,
            'country_code' => $record->country->isoCode ?? 'XX',
            'country_name' => $record->country->name ?? 'Unknown',
            'region_name' => $record->mostSpecificSubdivision->name ?? 'Unknown',
            'city_name' => $record->city->name ?? 'Unknown',
            'latitude' => $record->location->latitude ?? 0.0,
            'longitude' => $record->location->longitude ?? 0.0,
            'timezone' => $record->location->timeZone ?? 'UTC',
            'postal_code' => $record->postal->code ?? null,
            'accuracy_radius' => $record->location->accuracyRadius ?? null
        ];
        
    } catch (Exception $e) {
        error_log("GeoIP lookup failed for $ip: " . $e->getMessage());
        return $defaultGeo;
    }
}

/**
 * Alternative: Use ip-api.com API (online service)
 * Free tier: 45 requests per minute
 * Uses cURL when available to avoid PHP stream errors when the API is unreachable.
 *
 * @param string $ip
 * @return array
 */
function getGeoFromIPApi(string $ip): array {
    $defaultGeo = [
        'ip' => $ip,
        'country_code' => 'XX',
        'country_name' => 'Unknown',
        'region_name' => 'Unknown',
        'city_name' => 'Unknown',
        'latitude' => 0.0,
        'longitude' => 0.0,
        'timezone' => 'UTC',
        'isp' => null
    ];
    
    // Skip private/local IPs
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
        return $defaultGeo;
    }
    
    $url = "http://ip-api.com/json/" . rawurlencode($ip) . "?fields=status,message,continent,continentCode,country,countryCode,region,regionName,city,lat,lon,timezone,isp";
    $response = fetchUrlSilent($url, 4);
    if ($response === null || $response === '') {
        return $defaultGeo;
    }
    
    $data = json_decode($response, true);
    if (empty($data) || ($data['status'] ?? '') !== 'success') {
        return $defaultGeo;
    }
    
    return [
        'ip' => $ip,
        'continent_code' => $data['continentCode'] ?? null,
        'country_code' => $data['countryCode'] ?? 'XX',
        'country_name' => $data['country'] ?? 'Unknown',
        'region_name' => $data['regionName'] ?? 'Unknown',
        'city_name' => $data['city'] ?? 'Unknown',
        'latitude' => (float)($data['lat'] ?? 0.0),
        'longitude' => (float)($data['lon'] ?? 0.0),
        'timezone' => $data['timezone'] ?? 'UTC',
        'isp' => $data['isp'] ?? null
    ];
}

/**
 * Fetch URL with a short timeout; no PHP warnings or logs on failure.
 * Tries cURL first, then file_get_contents. Returns null on any failure.
 *
 * @param string $url
 * @param int $timeoutSeconds
 * @return string|null
 */
function fetchUrlSilent(string $url, int $timeoutSeconds = 4): ?string {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        if ($ch === false) {
            return null;
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeoutSeconds,
            CURLOPT_CONNECTTIMEOUT => min(2, $timeoutSeconds),
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 2,
            CURLOPT_USERAGENT => 'LinkNest-Analytics/1.0',
        ]);
        $response = curl_exec($ch);
        curl_close($ch);
        return is_string($response) ? $response : null;
    }
    $ctx = stream_context_create([
        'http' => [
            'timeout' => $timeoutSeconds,
            'ignore_errors' => true,
        ],
    ]);
    $response = @file_get_contents($url, false, $ctx);
    return ($response !== false && is_string($response)) ? $response : null;
}
