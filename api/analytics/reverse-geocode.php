<?php
/**
 * Reverse Geocode API
 * Converts latitude/longitude coordinates to address/location details
 * Uses OpenStreetMap Nominatim API (free, no key required)
 */

require_once __DIR__ . '/../config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Only allow GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

// Require authentication
if (!isset($_SESSION['user_id'])) {
    sendJSON(['error' => 'Authentication required'], 401);
}

try {
    // Get coordinates from query string
    $lat = $_GET['lat'] ?? null;
    $lng = $_GET['lng'] ?? null;
    
    if (!$lat || !$lng) {
        sendJSON(['error' => 'Latitude and longitude are required'], 400);
    }
    
    $lat = (float)$lat;
    $lng = (float)$lng;
    
    // Validate coordinates
    if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
        sendJSON(['error' => 'Invalid coordinates'], 400);
    }
    
    $countryCode = 'XX';
    $countryName = 'Unknown';
    $region = 'Unknown';
    $city = 'Unknown';
    
    // 1. Try PostgreSQL location_lookup first (same as process-metrics-queue and other tables)
    if (function_exists('isPerformanceAnalyticsEnabled') && isPerformanceAnalyticsEnabled()) {
        $reverseOfflinePath = __DIR__ . '/../../analytics/geoip/reverse-geocode-offline.php';
        if (file_exists($reverseOfflinePath)) {
            require_once $reverseOfflinePath;
            if (function_exists('getLocationFromCoordinates')) {
                $dbLocation = getLocationFromCoordinates($lat, $lng);
                if (!empty($dbLocation['city_name']) && $dbLocation['city_name'] !== 'Unknown') {
                    $countryCode = $dbLocation['country_code'] ?? 'XX';
                    $countryName = $dbLocation['country_name'] ?? 'Unknown';
                    $region = $dbLocation['region_name'] ?? 'Unknown';
                    $city = $dbLocation['city_name'];
                }
            }
        }
    }
    
    // 2. Fallback to OpenStreetMap Nominatim if DB didn't return a city
    if ($city === 'Unknown') {
        $url = sprintf(
            'https://nominatim.openstreetmap.org/reverse?format=json&lat=%s&lon=%s&zoom=10&addressdetails=1',
            urlencode($lat),
            urlencode($lng)
        );
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => [
                    'User-Agent: LinkNest Analytics/1.0',
                    'Accept: application/json'
                ],
                'timeout' => 5,
                'ignore_errors' => true
            ]
        ]);
        $response = @file_get_contents($url, false, $context);
        if ($response !== false) {
            $data = json_decode($response, true);
            if (!empty($data['address'])) {
                $address = $data['address'];
                $countryCode = isset($address['country_code']) ? strtoupper($address['country_code']) : (isset($data['address']['iso3166-1:alpha2']) ? strtoupper($data['address']['iso3166-1:alpha2']) : 'XX');
                $countryName = $address['country'] ?? 'Unknown';
                $region = $address['state'] ?? $address['region'] ?? $address['county'] ?? 'Unknown';
                $city = $address['city'] ?? $address['town'] ?? $address['village'] ?? $address['municipality'] ?? 'Unknown';
            }
        }
    }
    
    // Store location in session
    $_SESSION['country_code'] = $countryCode;
    $_SESSION['country_name'] = $countryName;
    $_SESSION['region'] = $region;
    $_SESSION['city'] = $city;
    $_SESSION['latitude'] = $lat;
    $_SESSION['longitude'] = $lng;
    
    // Also update analytics database if enabled
    if (function_exists('isPerformanceAnalyticsEnabled') && isPerformanceAnalyticsEnabled()) {
        try {
            $analyticsDB = getAnalyticsDB();
            if ($analyticsDB) {
                $stmt = $analyticsDB->prepare("
                    INSERT INTO user_geolocations (user_id, ip_address, country_code, country_name, region_name, city_name, latitude, longitude, timezone, last_seen)
                    VALUES (:user_id, :ip_address, :country_code, :country_name, :region_name, :city_name, :latitude, :longitude, :timezone, NOW())
                    ON CONFLICT (user_id) 
                    DO UPDATE SET 
                        ip_address = EXCLUDED.ip_address,
                        country_code = EXCLUDED.country_code,
                        country_name = EXCLUDED.country_name,
                        region_name = EXCLUDED.region_name,
                        city_name = EXCLUDED.city_name,
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude,
                        timezone = EXCLUDED.timezone,
                        last_seen = NOW()
                ");
                
                $stmt->execute([
                    'user_id' => $_SESSION['user_id'],
                    'ip_address' => $_SERVER['REMOTE_ADDR'] ?? null,
                    'country_code' => $countryCode,
                    'country_name' => $countryName,
                    'region_name' => $region,
                    'city_name' => $city,
                    'latitude' => $lat,
                    'longitude' => $lng,
                    'timezone' => date_default_timezone_get()
                ]);
            }
        } catch (Exception $e) {
            // Log but don't fail the request
            error_log("Failed to update user geolocation in analytics DB: " . $e->getMessage());
        }
    }
    
    // Return location data
    sendJSON([
        'success' => true,
        'location' => [
            'latitude' => $lat,
            'longitude' => $lng,
            'country_code' => $countryCode,
            'country_name' => $countryName,
            'region' => $region,
            'city' => $city
        ]
    ]);
    
} catch (Exception $e) {
    error_log("Reverse geocode error: " . $e->getMessage());
    sendJSON([
        'error' => 'Failed to reverse geocode',
        'details' => $e->getMessage()
    ], 500);
}
