<?php
/**
 * Update User Location API
 * Gets user's location from IP and updates session
 * Called by client-side when location is missing
 */

require_once __DIR__ . '/../config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

// Get user ID if authenticated (optional - also works for anonymous users)
$userId = $_SESSION['user_id'] ?? null;

try {
    // Check if coordinates are provided in POST body (from browser geolocation)
    $input = file_get_contents('php://input');
    $postData = null;
    if (!empty($input)) {
        $postData = json_decode($input, true);
    }
    
    $lat = null;
    $lng = null;
    $countryCode = null;
    $countryName = null;
    $region = null;
    $city = null;
    $timezone = 'UTC';
    
    // If coordinates provided, use same DB lookup as performance_metrics (location_lookup), then fallback to online
    if ($postData && isset($postData['latitude']) && isset($postData['longitude'])) {
        $lat = (float)$postData['latitude'];
        $lng = (float)$postData['longitude'];
        
        // Validate coordinates
        if ($lat >= -90 && $lat <= 90 && $lng >= -180 && $lng <= 180) {
            // 1. Try PostgreSQL location_lookup first (same as process-metrics-queue)
            $reverseOfflinePath = __DIR__ . '/../../analytics/geoip/reverse-geocode-offline.php';
            if (file_exists($reverseOfflinePath) && function_exists('isPerformanceAnalyticsEnabled') && isPerformanceAnalyticsEnabled()) {
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
            // 2. Fallback to Nominatim if DB didn't return a city
            if (!isset($city) || $city === 'Unknown') {
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
                        $countryCode = strtoupper($address['country_code'] ?? 'XX');
                        $countryName = $address['country'] ?? 'Unknown';
                        $region = $address['state'] ?? $address['region'] ?? $address['county'] ?? 'Unknown';
                        $city = $address['city'] ?? $address['town'] ?? $address['village'] ?? $address['municipality'] ?? 'Unknown';
                    }
                }
            }
            // 3. If still unknown, use client-provided location
            if ((!isset($countryCode) || $countryCode === 'XX') && isset($postData['country_code'])) {
                $countryCode = $postData['country_code'];
                $region = $postData['region'] ?? $region ?? 'Unknown';
                $city = $postData['city'] ?? $city ?? 'Unknown';
            }
        }
    }
    
    // Fallback to IP-based geolocation if coordinates not provided or reverse geocode failed
    if (!$lat || !$lng) {
        $ip = function_exists('getClientIpAddress') ? getClientIpAddress() : ($_SERVER['REMOTE_ADDR'] ?? null);
        
        if (!$ip) {
            sendJSON(['error' => 'IP address not available'], 400);
        }
        
        // Get geolocation from IP
        $geo = null;
        $geoipPath = __DIR__ . '/../../analytics/geoip/geoip.php';
        if (file_exists($geoipPath)) {
            require_once $geoipPath;
            if (function_exists('getGeoFromIP')) {
                $geo = getGeoFromIP($ip);
            }
        }
        
        if (!$geo) {
            sendJSON(['error' => 'Failed to get location'], 500);
        }
        
        $lat = $geo['latitude'] ?? 0.0;
        $lng = $geo['longitude'] ?? 0.0;
        $countryCode = $geo['country_code'] ?? 'XX';
        $countryName = $geo['country_name'] ?? 'Unknown';
        $region = $geo['region_name'] ?? 'Unknown';
        $city = $geo['city_name'] ?? 'Unknown';
        $timezone = $geo['timezone'] ?? 'UTC';
    } else {
        // Use values from reverse geocode or defaults
        if (!$countryName) {
            $countryName = $postData['country_name'] ?? 'Unknown';
        }
        if ($timezone === 'UTC') {
            $timezone = date_default_timezone_get();
        }
    }
    
    // Store location in session
    $_SESSION['country_code'] = $countryCode ?? 'XX';
    $_SESSION['country_name'] = $countryName ?? 'Unknown';
    $_SESSION['region'] = $region ?? 'Unknown';
    $_SESSION['city'] = $city ?? 'Unknown';
    $_SESSION['latitude'] = $lat ?? 0.0;
    $_SESSION['longitude'] = $lng ?? 0.0;
    $_SESSION['timezone'] = $timezone ?? 'UTC';
    
    // Also update analytics database if enabled (require non-null IP – schema has ip_address INET NOT NULL)
    $clientIp = function_exists('getClientIpAddress') ? getClientIpAddress() : ($_SERVER['REMOTE_ADDR'] ?? null);
    if ($userId && $clientIp !== null && $clientIp !== '' && isPerformanceAnalyticsEnabled()) {
        try {
            $analyticsDB = getAnalyticsDB();
            if ($analyticsDB) {
                $username = $_SESSION['username'] ?? null;
                $stmt = $analyticsDB->prepare("
                    INSERT INTO user_geolocations (user_id, username, ip_address, country_code, country_name, region_name, city_name, latitude, longitude, timezone, last_seen)
                    VALUES (:user_id, :username, :ip_address, :country_code, :country_name, :region_name, :city_name, :latitude, :longitude, :timezone, NOW())
                    ON CONFLICT (user_id) 
                    DO UPDATE SET 
                        username = EXCLUDED.username,
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
                    'user_id' => $userId,
                    'username' => $username,
                    'ip_address' => $clientIp,
                    'country_code' => $countryCode ?? 'XX',
                    'country_name' => $countryName ?? 'Unknown',
                    'region_name' => $region ?? 'Unknown',
                    'city_name' => $city ?? 'Unknown',
                    'latitude' => $lat ?? 0.0,
                    'longitude' => $lng ?? 0.0,
                    'timezone' => $timezone ?? 'UTC'
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
            'country_code' => $countryCode ?? 'XX',
            'country_name' => $countryName ?? 'Unknown',
            'region' => $region ?? 'Unknown',
            'city' => $city ?? 'Unknown',
            'latitude' => $lat ?? 0.0,
            'longitude' => $lng ?? 0.0,
            'timezone' => $timezone ?? 'UTC'
        ]
    ]);
    
} catch (Exception $e) {
    error_log("Location update error: " . $e->getMessage());
    sendJSON([
        'error' => 'Failed to update location',
        'details' => $e->getMessage()
    ], 500);
}
