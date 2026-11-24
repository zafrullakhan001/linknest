<?php
/**
 * Metrics Queue Processor
 * Processes queued performance metrics from the database
 * 
 * Usage: php analytics/process-metrics-queue.php
 */

// Ensure we're running from CLI
if (php_sapi_name() !== 'cli') {
    die("This script must be run from the command line\n");
}

// Set unlimited execution time
set_time_limit(0);

// Load dependencies
require_once __DIR__ . '/api/config_analytics.php';
require_once __DIR__ . '/geoip/geoip.php';
require_once __DIR__ . '/geoip/reverse-geocode-offline.php';

/**
 * Normalize link URL for grouping (drop query/fragment).
 */
function normalizeLinkUrlForAnalytics(?string $url): ?string {
    if (!is_string($url)) return null;
    $raw = trim($url);
    if ($raw === '') return null;
    $parts = @parse_url($raw);
    if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
        return $raw;
    }
    $scheme = strtolower($parts['scheme']);
    $host = strtolower($parts['host']);
    $port = isset($parts['port']) ? (int)$parts['port'] : null;
    $path = $parts['path'] ?? '/';
    if ($path !== '/' && is_string($path)) {
        $path = rtrim($path, '/');
        if ($path === '') $path = '/';
    }
    $base = $scheme . '://' . $host;
    if ($port && !(($scheme === 'http' && $port === 80) || ($scheme === 'https' && $port === 443))) {
        $base .= ':' . $port;
    }
    return $base . $path;
}

echo "=== Performance Analytics Queue Processor ===\n";
echo "Started at: " . date('Y-m-d H:i:s') . "\n\n";

try {
    $db = getAnalyticsPDO();
    echo "✓ Connected to analytics database\n";
    
    // Test connection
    $db->query("SELECT 1");
    echo "✓ Database connection verified\n\n";
    
} catch (Exception $e) {
    die("ERROR: Failed to connect to database: " . $e->getMessage() . "\n");
}

// Configuration
$batchSize = 1000; // Process this many items per batch
$sleepInterval = 5; // Seconds to sleep when no items found

echo "Configuration:\n";
echo "  Batch size: $batchSize\n";
echo "  Sleep interval: {$sleepInterval}s\n\n";

// Prepare insert statement (reused for performance)
// Columns must match analytics schema: performance_metrics (no tile_id, link_url_normalized, ok, etc.)
$insertStmt = $db->prepare("
    INSERT INTO performance_metrics (
        time, link_url, link_id, page_url, measurement_type, user_id, username, session_id,
        ip_address, continent_code, country_code, country_name, region_name, city_name,
        latitude, longitude, timezone, isp,
        full_response_time, dns_lookup_time, tcp_connection_time,
        tls_handshake_time, time_to_first_byte,
        dom_content_loaded_time, page_size_bytes,
        http_status_code, device_type, browser_name,
        browser_version, os_name, screen_resolution, connection_type,
        is_authenticated, error_message
    ) VALUES (
        COALESCE(:time::timestamptz, NOW()), :link_url, :link_id, :page_url, :measurement_type, :user_id, :username, :session_id,
        :ip_address, :continent_code, :country_code, :country_name, :region_name, :city_name,
        :latitude, :longitude, :timezone, :isp,
        :full_response_time, :dns_lookup_time, :tcp_connection_time,
        :tls_handshake_time, :time_to_first_byte,
        :dom_content_loaded_time, :page_size_bytes,
        :http_status_code, :device_type, :browser_name,
        :browser_version, :os_name, :screen_resolution, :connection_type,
        :is_authenticated, :error_message
    )
");

// Prepare update statement for marking as processed
$updateStmt = $db->prepare("
    UPDATE metrics_queue 
    SET processed = TRUE, processed_at = NOW() 
    WHERE id = :id
");

// Statistics
$stats = [
    'total_processed' => 0,
    'total_errors' => 0,
    'batches_processed' => 0,
    'start_time' => time()
];

/**
 * Process a batch of metrics
 */
function processBatch($db, $insertStmt, $updateStmt, $batchSize, &$stats) {
    try {
        // Fetch unprocessed items using SKIP LOCKED for concurrent processing
        $fetchStmt = $db->prepare("
            SELECT id, payload 
            FROM metrics_queue 
            WHERE processed = FALSE 
            ORDER BY id ASC
            LIMIT :limit
            FOR UPDATE SKIP LOCKED
        ");
        $fetchStmt->bindValue(':limit', $batchSize, PDO::PARAM_INT);
        $fetchStmt->execute();
        $items = $fetchStmt->fetchAll(PDO::FETCH_ASSOC);
        
        if (empty($items)) {
            return 0;
        }
        
        $processed = 0;
        $errors = 0;
        
        // Start transaction for batch insert
        $db->beginTransaction();
        
        try {
            foreach ($items as $item) {
                $payload = json_decode($item['payload'], true);
                
                if (!$payload || empty($payload['link_url'])) {
                    // Invalid payload - mark as processed to avoid retrying
                    $updateStmt->execute(['id' => $item['id']]);
                    $errors++;
                    continue;
                }

                // Store both client and server measurements (schema allows measurement_type IN ('client', 'server'))
                $measurementTypeNorm = strtolower(trim((string)($payload['measurement_type'] ?? 'client')));
                if (!in_array($measurementTypeNorm, ['client', 'server'], true)) {
                    $updateStmt->execute(['id' => $item['id']]);
                    continue;
                }
                $isServer = ($measurementTypeNorm === 'server');

                // Extract location data - PRIORITIZE CLIENT DATA FIRST (server has no geo; client geolocation is more accurate)
                $ipAddress = $payload['ip_address'] ?? null;
                $countryCode = 'XX';
                $countryName = 'Unknown';
                $region = 'Unknown';
                $city = 'Unknown';
                $latitude = 0.0;
                $longitude = 0.0;
                $timezone = 'UTC';
                $isp = null;
                
                // Get coordinates from payload (browser geolocation is most accurate)
                $clientLatitude = (float)($payload['latitude'] ?? 0);
                $clientLongitude = (float)($payload['longitude'] ?? 0);
                $clientCountryCode = $payload['country_code'] ?? null;
                $clientCountryName = $payload['country_name'] ?? null;
                $clientRegion = $payload['region'] ?? null;
                $clientCity = $payload['city'] ?? null;
                
                // STEP 1: Prefer client-provided coordinates when present.
                // Even if country/region/city are Unknown, we can offline reverse-geocode from lat/lon.
                $hasClientCoordinates = ($clientLatitude !== 0.0 && $clientLongitude !== 0.0 &&
                                        abs($clientLatitude) > 0.0001 && abs($clientLongitude) > 0.0001);
                $hasClientCountry = ($clientCountryCode && $clientCountryCode !== 'XX'); // optional

                if ($hasClientCoordinates) {
                    // Use client coordinates (browser geolocation is more accurate than IP).
                    // Don't require country to be present; we'll fill Unknowns via offline reverse geocoding.
                    $latitude = $clientLatitude;
                    $longitude = $clientLongitude;

                    if ($hasClientCountry) {
                        $countryCode = $clientCountryCode;
                    }
                    if (!empty($clientCountryName) && $clientCountryName !== 'Unknown') {
                        $countryName = $clientCountryName;
                    }
                    if (!empty($clientRegion) && $clientRegion !== 'Unknown') {
                        $region = $clientRegion;
                    }
                    if (!empty($clientCity) && $clientCity !== 'Unknown') {
                        $city = $clientCity;
                    }
                    // Don't override timezone/ISP from client, we'll get from IP if needed
                }
                
                // STEP 2: If client data is missing, try IP-based lookup
                if (
                    !$hasClientCoordinates &&
                    $ipAddress &&
                    filter_var($ipAddress, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)
                ) {
                    $geo = getGeoFromIP($ipAddress);
                    if ($geo['country_code'] !== 'XX') {
                        $countryCode = $geo['country_code'];
                        $countryName = $geo['country_name'] ?? 'Unknown';
                        $region = $geo['region_name'] ?? 'Unknown';
                        $city = $geo['city_name'] ?? 'Unknown';
                        $latitude = (float)($geo['latitude'] ?? 0.0);
                        $longitude = (float)($geo['longitude'] ?? 0.0);
                        $timezone = $geo['timezone'] ?? 'UTC';
                        $isp = $geo['isp'] ?? null;
                    }
                }
                
                // Get timezone and ISP from IP if we don't have them yet
                if ((!$timezone || $timezone === 'UTC' || !$isp) && $ipAddress && filter_var($ipAddress, FILTER_VALIDATE_IP)) {
                    $geo = getGeoFromIP($ipAddress);
                    if (!$timezone || $timezone === 'UTC') {
                        if (isset($geo['timezone']) && $geo['timezone'] !== 'UTC') {
                            $timezone = $geo['timezone'];
                        }
                    }
                    if (!$isp && isset($geo['isp'])) {
                        $isp = $geo['isp'];
                    }
                }
                
                // STEP 3: ALWAYS use reverse geocoding if city is "Unknown" and we have coordinates
                // This ensures consistent city population for all metrics
                $hasMissingCity = ($city === 'Unknown' || empty($city) || !$city);
                $hasValidCoordinates = ($latitude !== 0.0 && $longitude !== 0.0 &&
                                       abs($latitude) > 0.0001 && abs($longitude) > 0.0001);
                
                if ($hasMissingCity && $hasValidCoordinates) {
                    // ALWAYS reverse geocode when city is Unknown to ensure consistency
                    $reverseGeo = getLocationFromCoordinates($latitude, $longitude);
                    
                    // Update fields from reverse geocoding
                    if ($reverseGeo && $reverseGeo['country_code'] !== 'XX') {
                        // Update country only if still Unknown
                        if ($countryCode === 'XX' || $countryName === 'Unknown') {
                            $countryCode = $reverseGeo['country_code'];
                            $countryName = $reverseGeo['country_name'];
                        }
                        // Update region only if still Unknown
                        $reverseRegion = $reverseGeo['region_name'] ?? '';
                        if (!empty($reverseRegion) && $reverseRegion !== 'Unknown') {
                            if ($region === 'Unknown' || empty($region)) {
                                $region = $reverseRegion;
                            }
                        }
                        // ALWAYS update city from reverse geocoding when it's Unknown
                        $reverseCity = $reverseGeo['city_name'] ?? '';
                        if (!empty($reverseCity) && $reverseCity !== 'Unknown') {
                            $city = $reverseCity; // Unconditionally update
                        }
                    }
                }
                
                // Also check for other missing location fields even if city is populated
                $needsMoreLocation = ($countryCode === 'XX' || $countryName === 'Unknown' || 
                                     $region === 'Unknown' || empty($region));
                if ($needsMoreLocation && $hasValidCoordinates && !$hasMissingCity) {
                    // Fill in other missing fields
                    $reverseGeo = getLocationFromCoordinates($latitude, $longitude);
                    if ($reverseGeo && $reverseGeo['country_code'] !== 'XX') {
                        if ($countryCode === 'XX' || $countryName === 'Unknown') {
                            $countryCode = $reverseGeo['country_code'];
                            $countryName = $reverseGeo['country_name'];
                        }
                        if (($region === 'Unknown' || empty($region)) && !empty($reverseGeo['region_name']) && $reverseGeo['region_name'] !== 'Unknown') {
                            $region = $reverseGeo['region_name'];
                        }
                    }
                }
                
                // Insert into performance_metrics (columns must match schema – no tile_id, link_url_normalized, ok, etc.)
                // Note: PDO (pgsql) can serialize PHP booleans as empty string, which Postgres rejects.
                $isAuthenticatedText = !empty($payload['user_id']) ? 't' : 'f';

                $linkUrl = $payload['link_url'];
                if (isset($payload['link_url_normalized']) && $payload['link_url_normalized'] !== '') {
                    $linkUrl = $payload['link_url_normalized'];
                } elseif (function_exists('normalizeLinkUrlForAnalytics')) {
                    $linkUrl = normalizeLinkUrlForAnalytics($payload['link_url'] ?? null) ?? $linkUrl;
                }

                // Normalize for PostgreSQL: INET wants valid IP or null; CHAR(2) better with null than ''
                $rawIp = $payload['ip_address'] ?? null;
                $ipAddressBind = (is_string($rawIp) && trim($rawIp) !== '' && filter_var(trim($rawIp), FILTER_VALIDATE_IP)) ? trim($rawIp) : null;
                $rawContinent = $payload['continent_code'] ?? null;
                $continentBind = (is_string($rawContinent) && trim($rawContinent) !== '') ? trim($rawContinent) : null;

                $insertParams = [
                    'time' => $payload['time'] ?? null,
                    'link_url' => $linkUrl,
                    'link_id' => $payload['link_id'] ?? null,
                    'page_url' => $payload['page_url'] ?? null,
                    'measurement_type' => $payload['measurement_type'] ?? 'client',
                    'user_id' => $payload['user_id'] ?? null,
                    'username' => $payload['username'] ?? null,
                    'session_id' => (string)($payload['session_id'] ?? ''),
                    'ip_address' => $ipAddressBind,
                    'continent_code' => $continentBind,
                    'country_code' => $countryCode,
                    'country_name' => $countryName,
                    'region_name' => $region,
                    'city_name' => $city,
                    'latitude' => $latitude,
                    'longitude' => $longitude,
                    'timezone' => $timezone,
                    'isp' => $isp,
                    'full_response_time' => (int)($payload['full_response_time'] ?? 0),
                    'dns_lookup_time' => isset($payload['dns_lookup_time']) ? (int)$payload['dns_lookup_time'] : null,
                    'tcp_connection_time' => isset($payload['tcp_connection_time']) ? (int)$payload['tcp_connection_time'] : null,
                    'tls_handshake_time' => isset($payload['tls_handshake_time']) ? (int)$payload['tls_handshake_time'] : null,
                    'time_to_first_byte' => isset($payload['time_to_first_byte']) ? (int)$payload['time_to_first_byte'] : null,
                    'dom_content_loaded_time' => isset($payload['dom_content_loaded_time']) ? (int)$payload['dom_content_loaded_time'] : null,
                    'page_size_bytes' => isset($payload['page_size_bytes']) ? (int)$payload['page_size_bytes'] : null,
                    'http_status_code' => (int)($payload['http_status_code'] ?? 200),
                    'device_type' => $payload['device_type'] ?? 'unknown',
                    'browser_name' => $payload['browser_name'] ?? '',
                    'browser_version' => $payload['browser_version'] ?? '',
                    'os_name' => $payload['os_name'] ?? '',
                    'screen_resolution' => $payload['screen_resolution'] ?? '',
                    'connection_type' => $payload['connection_type'] ?? '',
                    'is_authenticated' => $isAuthenticatedText,
                    'error_message' => isset($payload['error_message']) && $payload['error_message'] !== '' ? (string)$payload['error_message'] : null,
                ];

                try {
                    $insertStmt->execute($insertParams);
                } catch (Exception $insertEx) {
                    error_log(sprintf(
                        "Queue processor: insert failed (measurement_type=%s link_url=%s): %s",
                        $insertParams['measurement_type'],
                        substr($insertParams['link_url'], 0, 80),
                        $insertEx->getMessage()
                    ));
                    $stats['total_errors']++;
                    $updateStmt->execute(['id' => $item['id']]);
                    continue;
                }
                
                // Mark as processed
                $updateStmt->execute(['id' => $item['id']]);
                $processed++;
            }
            
            $db->commit();
            
        } catch (Exception $e) {
            $db->rollBack();
            throw $e;
        }
        
        return $processed;
        
    } catch (PDOException $e) {
        // Let connection errors propagate so the main loop can reconnect
        throw $e;
    } catch (Exception $e) {
        error_log("Queue processor batch error: " . $e->getMessage());
        return 0;
    }
}

/**
 * Listen for PostgreSQL NOTIFY events
 */
function setupNotifyListener($db) {
    try {
        // Listen for notifications
        $db->exec("LISTEN metrics_inserted");
        echo "✓ Listening for PostgreSQL NOTIFY events\n\n";
        return true;
    } catch (Exception $e) {
        echo "⚠ Warning: Could not set up NOTIFY listener: " . $e->getMessage() . "\n";
        echo "  Processor will still work, but will poll instead of using events\n\n";
        return false;
    }
}

/**
 * Return fresh PDO and re-prepared statements (used after reconnect).
 */
function reconnectAnalyticsAndStatements($batchSize) {
    // Force new connection (clears cached dead PDO in getAnalyticsPDO)
    $db = getAnalyticsPDO(true);
    $db->query("SELECT 1");
    $insertStmt = $db->prepare("
        INSERT INTO performance_metrics (
            time, link_url, link_id, page_url, measurement_type, user_id, username, session_id,
            ip_address, continent_code, country_code, country_name, region_name, city_name,
            latitude, longitude, timezone, isp,
            full_response_time, dns_lookup_time, tcp_connection_time,
            tls_handshake_time, time_to_first_byte,
            dom_content_loaded_time, page_size_bytes,
            http_status_code, device_type, browser_name,
            browser_version, os_name, screen_resolution, connection_type,
            is_authenticated, error_message
        ) VALUES (
            COALESCE(:time::timestamptz, NOW()), :link_url, :link_id, :page_url, :measurement_type, :user_id, :username, :session_id,
            :ip_address, :continent_code, :country_code, :country_name, :region_name, :city_name,
            :latitude, :longitude, :timezone, :isp,
            :full_response_time, :dns_lookup_time, :tcp_connection_time,
            :tls_handshake_time, :time_to_first_byte,
            :dom_content_loaded_time, :page_size_bytes,
            :http_status_code, :device_type, :browser_name,
            :browser_version, :os_name, :screen_resolution, :connection_type,
            :is_authenticated, :error_message
        )
    ");
    $updateStmt = $db->prepare("
        UPDATE metrics_queue 
        SET processed = TRUE, processed_at = NOW() 
        WHERE id = :id
    ");
    return [$db, $insertStmt, $updateStmt];
}

// Set up NOTIFY listener if possible
$hasNotify = setupNotifyListener($db);

// Reconnect backoff: seconds to wait after DB error (capped, incremented on consecutive failures)
$reconnectDelay = 10;
$reconnectDelayMax = 60;

// Main processing loop
echo "Starting main processing loop...\n";
echo "Press Ctrl+C to stop\n\n";

$lastStatsTime = time();

while (true) {
    try {
        // Check for NOTIFY events (non-blocking)
        if ($hasNotify) {
            try {
                $result = $db->pgsqlGetNotify(PDO::FETCH_ASSOC, 0);
                if ($result) {
                    echo "[" . date('H:i:s') . "] NOTIFY received: {$result['message']}\n";
                }
            } catch (PDOException $e) {
                // NOTIFY check can fail when connection is dead
                throw $e;
            }
        }
        
        // Process batch
        $processed = processBatch($db, $insertStmt, $updateStmt, $batchSize, $stats);
        
        // Connection is healthy – reset backoff for next time
        $reconnectDelay = 10;
        
        if ($processed > 0) {
            $stats['total_processed'] += $processed;
            $stats['batches_processed']++;
            
            echo "[" . date('H:i:s') . "] Processed batch: $processed items (Total: {$stats['total_processed']})\n";
            
            // Continue immediately if we processed items
            continue;
        }
        
        // No items to process - sleep briefly
        // If using NOTIFY, we can sleep longer since we'll be woken up
        $sleepTime = $hasNotify ? 2 : $sleepInterval;
        usleep($sleepTime * 1000000); // Convert to microseconds
        
        // Print stats every 60 seconds
        $now = time();
        if ($now - $lastStatsTime >= 60) {
            $elapsed = $now - $stats['start_time'];
            $rate = $elapsed > 0 ? round($stats['total_processed'] / $elapsed, 2) : 0;
            
            echo "[" . date('H:i:s') . "] Stats: {$stats['total_processed']} processed, {$stats['batches_processed']} batches, {$rate}/sec avg\n";
            
            $lastStatsTime = $now;
        }
        
    } catch (PDOException $e) {
        // Database connection error – get a fresh connection and re-prepare statements
        error_log("Queue processor PDO error: " . $e->getMessage());
        echo "[" . date('H:i:s') . "] Database error (" . $e->getMessage() . "), retrying in {$reconnectDelay}s...\n";
        sleep($reconnectDelay);
        
        try {
            list($db, $insertStmt, $updateStmt) = reconnectAnalyticsAndStatements($batchSize);
            $hasNotify = setupNotifyListener($db);
            echo "[" . date('H:i:s') . "] Reconnected to database. NOTIFY " . ($hasNotify ? "enabled" : "disabled (polling only)") . "\n";
            $reconnectDelay = 10;
        } catch (Exception $reconnectError) {
            error_log("Queue processor reconnect failed: " . $reconnectError->getMessage());
            echo "[" . date('H:i:s') . "] Reconnect failed, will retry in " . min($reconnectDelay, $reconnectDelayMax) . "s\n";
            $reconnectDelay = min($reconnectDelay + 10, $reconnectDelayMax);
        }
        
    } catch (Exception $e) {
        error_log("Queue processor error: " . $e->getMessage());
        echo "[" . date('H:i:s') . "] Error: " . $e->getMessage() . "\n";
        sleep(5);
    }
}
