<?php
/**
 * Offline Reverse Geocoding Service
 * Uses coordinates (lat/lon) to get location information
 * 
 * Strategy:
 * 1. Check PostgreSQL location_lookup table (offline, fast)
 * 2. If not found, check local cache (SQLite database)
 * 3. If not cached, use OpenStreetMap Nominatim API (with rate limiting)
 * 4. Cache results for future use
 */

require_once __DIR__ . '/../api/config_analytics.php';

// Cache database path
$CACHE_DB_PATH = __DIR__ . '/reverse-geocode-cache.db';

/**
 * Initialize cache database
 */
function initReverseGeocodeCache() {
    global $CACHE_DB_PATH;
    
    if (!file_exists($CACHE_DB_PATH)) {
        $db = new PDO('sqlite:' . $CACHE_DB_PATH);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        // Create cache table
        $db->exec("
            CREATE TABLE IF NOT EXISTS geocode_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                country_code TEXT,
                country_name TEXT,
                region_name TEXT,
                city_name TEXT,
                cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(latitude, longitude)
            )
        ");
        
        // Create index for faster lookups
        $db->exec("CREATE INDEX IF NOT EXISTS idx_coords ON geocode_cache(latitude, longitude)");
        
        return $db;
    }
    
    return new PDO('sqlite:' . $CACHE_DB_PATH);
}

/**
 * Get location from coordinates (offline-first with PostgreSQL lookup)
 * 
 * @param float $lat Latitude
 * @param float $lon Longitude
 * @param float $tolerance Tolerance in degrees for coordinate matching (default 0.1 ≈ 11km)
 * @return array Location data
 */
function getLocationFromCoordinates(float $lat, float $lon, float $tolerance = 0.1): array {
    // Default response
    $default = [
        'country_code' => 'XX',
        'country_name' => 'Unknown',
        'region_name' => 'Unknown',
        'city_name' => 'Unknown',
        'latitude' => $lat,
        'longitude' => $lon
    ];
    
    // Validate coordinates
    if ($lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
        return $default;
    }
    
    // Skip 0,0 (null island)
    if (abs($lat) < 0.0001 && abs($lon) < 0.0001) {
        return $default;
    }
    
    try {
        // First, try PostgreSQL location_lookup table (offline, fast, MOST RELIABLE)
        $pgLocation = getLocationFromPostgreSQL($lat, $lon, $tolerance);
        if ($pgLocation && $pgLocation['country_code'] !== 'XX' && 
            !empty($pgLocation['city_name']) && $pgLocation['city_name'] !== 'Unknown') {
            // Found valid city in PostgreSQL - return immediately
            // Also cache it for even faster future lookups
            try {
                $cacheDb = initReverseGeocodeCache();
                $latRounded = round($lat / $tolerance) * $tolerance;
                $lonRounded = round($lon / $tolerance) * $tolerance;
                $insertStmt = $cacheDb->prepare("
                    INSERT OR REPLACE INTO geocode_cache 
                    (latitude, longitude, country_code, country_name, region_name, city_name, cached_at)
                    VALUES (:lat, :lon, :country_code, :country_name, :region_name, :city_name, CURRENT_TIMESTAMP)
                ");
                $insertStmt->execute([
                    ':lat' => $latRounded,
                    ':lon' => $lonRounded,
                    ':country_code' => $pgLocation['country_code'],
                    ':country_name' => $pgLocation['country_name'],
                    ':region_name' => $pgLocation['region_name'],
                    ':city_name' => $pgLocation['city_name']
                ]);
            } catch (Exception $e) {
                // Cache failed but we have data - continue
            }
            return $pgLocation;
        }
        
        // Fallback to SQLite cache
        $cacheDb = initReverseGeocodeCache();
        
        // Round coordinates for cache lookup (within tolerance)
        $latRounded = round($lat / $tolerance) * $tolerance;
        $lonRounded = round($lon / $tolerance) * $tolerance;
        
        // Check cache - use broader tolerance for cache lookup
        $stmt = $cacheDb->prepare("
            SELECT country_code, country_name, region_name, city_name, cached_at
            FROM geocode_cache
            WHERE ABS(latitude - :lat) < :tol AND ABS(longitude - :lon) < :tol
            AND city_name IS NOT NULL AND city_name != '' AND city_name != 'Unknown'
            ORDER BY ABS(latitude - :lat) + ABS(longitude - :lon)
            LIMIT 1
        ");
        $stmt->execute([
            ':lat' => $latRounded,
            ':lon' => $lonRounded,
            ':tol' => $tolerance * 2 // Broader cache tolerance
        ]);
        
        $cached = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($cached && !empty($cached['country_code']) && $cached['country_code'] !== 'XX' &&
            !empty($cached['city_name']) && $cached['city_name'] !== 'Unknown') {
            // Return cached result with valid city
            return [
                'country_code' => $cached['country_code'],
                'country_name' => $cached['country_name'] ?? 'Unknown',
                'region_name' => $cached['region_name'] ?? 'Unknown',
                'city_name' => $cached['city_name'],
                'latitude' => $lat,
                'longitude' => $lon,
                'cached' => true
            ];
        }
        
        // Not in cache - try online reverse geocoding (with rate limiting)
        $location = reverseGeocodeOnline($lat, $lon);
        
        // Cache the result ONLY if we got a valid city (don't cache "Unknown")
        if ($location && !empty($location['city_name']) && $location['city_name'] !== 'Unknown') {
            $insertStmt = $cacheDb->prepare("
                INSERT OR REPLACE INTO geocode_cache 
                (latitude, longitude, country_code, country_name, region_name, city_name, cached_at)
                VALUES (:lat, :lon, :country_code, :country_name, :region_name, :city_name, CURRENT_TIMESTAMP)
            ");
            $insertStmt->execute([
                ':lat' => $latRounded,
                ':lon' => $lonRounded,
                ':country_code' => $location['country_code'] ?? 'XX',
                ':country_name' => $location['country_name'] ?? 'Unknown',
                ':region_name' => $location['region_name'] ?? 'Unknown',
                ':city_name' => $location['city_name']
            ]);
            
            return $location;
        }
        
        // If we have a PostgreSQL result (even without valid city), use it
        if ($pgLocation) {
            return $pgLocation;
        }
        
        return $default;
        
    } catch (Exception $e) {
        error_log("Reverse geocode error: " . $e->getMessage());
        return $default;
    }
}

/**
 * Reverse geocode using OpenStreetMap Nominatim API
 * (Online, but with rate limiting and caching)
 * 
 * @param float $lat
 * @param float $lon
 * @return array|null
 */
function reverseGeocodeOnline(float $lat, float $lon): ?array {
    // Rate limiting: Only make API call if last call was > 1 second ago
    $rateLimitFile = __DIR__ . '/.nominatim_rate_limit';
    $lastCall = 0;
    
    if (file_exists($rateLimitFile)) {
        $lastCall = (float)file_get_contents($rateLimitFile);
    }
    
    $now = microtime(true);
    $timeSinceLastCall = $now - $lastCall;
    
    // OpenStreetMap Nominatim allows 1 request per second
    if ($timeSinceLastCall < 1.0) {
        // Too soon - skip API call
        return null;
    }
    
    // Update rate limit timestamp
    file_put_contents($rateLimitFile, (string)$now);
    
    try {
        $url = sprintf(
            'https://nominatim.openstreetmap.org/reverse?format=json&lat=%s&lon=%s&zoom=10&addressdetails=1',
            urlencode((string)$lat),
            urlencode((string)$lon)
        );
        
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => [
                    'User-Agent: LinkNest Analytics/1.0',
                    'Accept: application/json'
                ],
                'timeout' => 3,
                'ignore_errors' => true
            ]
        ]);
        
        $response = @file_get_contents($url, false, $context);
        
        if ($response === false) {
            return null;
        }
        
        $data = json_decode($response, true);
        
        if (empty($data) || !isset($data['address'])) {
            return null;
        }
        
        $address = $data['address'];
        
        // Extract location details
        $countryCode = 'XX';
        if (isset($address['country_code'])) {
            $countryCode = strtoupper($address['country_code']);
        } elseif (isset($data['address']['iso3166-1:alpha2'])) {
            $countryCode = strtoupper($data['address']['iso3166-1:alpha2']);
        }
        
        $countryName = $address['country'] ?? 'Unknown';
        $region = $address['state'] ?? $address['region'] ?? $address['county'] ?? 'Unknown';
        $city = $address['city'] ?? $address['town'] ?? $address['village'] ?? $address['municipality'] ?? 'Unknown';
        
        return [
            'country_code' => $countryCode,
            'country_name' => $countryName,
            'region_name' => $region,
            'city_name' => $city,
            'latitude' => $lat,
            'longitude' => $lon
        ];
        
    } catch (Exception $e) {
        error_log("Online reverse geocode failed: " . $e->getMessage());
        return null;
    }
}

/**
 * Get location from PostgreSQL location_lookup table
 * Uses spatial distance calculation to find nearest city
 * 
 * @param float $lat
 * @param float $lon
 * @param float $tolerance Maximum distance in degrees (default 0.1 ≈ 11km)
 * @return array|null
 */
function getLocationFromPostgreSQL(float $lat, float $lon, float $tolerance = 0.1): ?array {
    try {
        $db = getAnalyticsPDO();
        
        // First check if table exists
        $tableCheck = $db->query("
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'location_lookup'
            )
        ");
        $tableExists = $tableCheck->fetchColumn();
        
        if (!$tableExists) {
            // Table doesn't exist - that's okay, just return null
            return null;
        }
        
        // Use simpler distance calculation for better performance
        // Increased tolerance to 0.2 degrees (~22km) for better matching
        $searchTolerance = max($tolerance, 0.2);
        
        $sql = "
            SELECT 
                country_code,
                country_name,
                region_name,
                city_name,
                latitude,
                longitude,
                -- Calculate approximate distance in km using simplified formula
                (
                    111.32 * sqrt(
                        POWER((latitude - :lat), 2) + 
                        POWER((longitude - :lon) * cos(radians(:lat)), 2)
                    )
                ) AS distance_km
            FROM location_lookup
            WHERE 
                ABS(latitude - :lat) < :tolerance
                AND ABS(longitude - :lon) < :tolerance
                AND city_name IS NOT NULL
                AND city_name != ''
                AND city_name != 'Unknown'
                AND country_code IS NOT NULL
                AND country_code != 'XX'
            ORDER BY 
                (
                    POWER(latitude - :lat, 2) + 
                    POWER(longitude - :lon, 2)
                )
            LIMIT 1
        ";
        
        $stmt = $db->prepare($sql);
        $stmt->execute([
            ':lat' => $lat,
            ':lon' => $lon,
            ':tolerance' => $searchTolerance
        ]);
        
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($result && !empty($result['country_code']) && $result['country_code'] !== 'XX') {
            // Only return if distance is reasonable (within ~50km, but be more lenient)
            $distanceKm = (float)($result['distance_km'] ?? 999);
            // Increased distance threshold to 100km for better matching
            if ($distanceKm <= 100) {
                return [
                    'country_code' => $result['country_code'],
                    'country_name' => $result['country_name'] ?? 'Unknown',
                    'region_name' => $result['region_name'] ?? 'Unknown',
                    'city_name' => $result['city_name'] ?? 'Unknown',
                    'latitude' => $lat,
                    'longitude' => $lon,
                    'distance_km' => $distanceKm,
                    'source' => 'postgresql'
                ];
            }
        }
        
        return null;
        
    } catch (Exception $e) {
        // Table might not exist yet or query failed - that's okay
        error_log("PostgreSQL location lookup failed: " . $e->getMessage());
        return null;
    }
}

/**
 * Batch reverse geocode multiple coordinates
 * Useful for processing queue items
 * 
 * @param array $coordinates Array of ['lat' => float, 'lon' => float]
 * @return array Array of location data indexed by coordinate key
 */
function batchReverseGeocode(array $coordinates): array {
    $results = [];
    
    foreach ($coordinates as $key => $coord) {
        $lat = (float)($coord['lat'] ?? $coord['latitude'] ?? 0);
        $lon = (float)($coord['lon'] ?? $coord['longitude'] ?? 0);
        
        if ($lat && $lon) {
            $results[$key] = getLocationFromCoordinates($lat, $lon);
        } else {
            $results[$key] = [
                'country_code' => 'XX',
                'country_name' => 'Unknown',
                'region_name' => 'Unknown',
                'city_name' => 'Unknown'
            ];
        }
    }
    
    return $results;
}
