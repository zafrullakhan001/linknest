<?php
/**
 * Performance Analytics Config (client)
 * Provides a small config payload for the SPA to collect metrics safely.
 *
 * Route: GET /api/analytics/config
 */
try {
    require_once __DIR__ . '/../config.php';

    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }

    // Only allow GET
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        sendJSON(['error' => 'Method not allowed'], 405);
    }

    // Determine if analytics is enabled (fail gracefully if DB/settings unavailable)
    $enabled = function_exists('isPerformanceAnalyticsEnabled') && isPerformanceAnalyticsEnabled();

    // Respect "track anonymous" setting if user is not authenticated
    $trackAnonymous = (function_exists('getSetting') ? getSetting('performance_analytics_track_anonymous', '1') : '1') === '1';
    $userId = $_SESSION['user_id'] ?? null;
    $username = $_SESSION['username'] ?? null;
    if (!$userId && !$trackAnonymous) {
        sendJSON([
            'enabled' => false,
            'reason' => 'anonymous_tracking_disabled'
        ]);
    }

    // Parse beacon URLs (comma-separated in settings)
    $rawBeaconUrls = function_exists('getSetting') ? (string)getSetting('performance_analytics_beacon_urls', '') : '';
    $beaconUrls = [];
    if ($rawBeaconUrls !== '') {
        $beaconUrls = array_values(array_filter(array_map('trim', explode(',', $rawBeaconUrls))));
    }

    // Session-based location (IP on login; can be upgraded via browser geolocation)
    $countryCode = $_SESSION['country_code'] ?? 'XX';
    $region = $_SESSION['region'] ?? 'Unknown';
    $city = $_SESSION['city'] ?? 'Unknown';
    $latitude = isset($_SESSION['latitude']) ? (float)$_SESSION['latitude'] : 0.0;
    $longitude = isset($_SESSION['longitude']) ? (float)$_SESSION['longitude'] : 0.0;
    $countryName = $_SESSION['country_name'] ?? 'Unknown';
    $timezone = $_SESSION['timezone'] ?? 'UTC';

    $needsLocation = ($countryCode === 'XX' || $region === 'Unknown' || $city === 'Unknown' || $latitude === 0.0 || $longitude === 0.0);

    sendJSON([
        'enabled' => $enabled,
        'sampleRate' => (float)(function_exists('getSetting') ? getSetting('performance_analytics_sample_rate', 0.1) : 0.1),
        'trackAnonymous' => $trackAnonymous,
        'trackLogins' => (function_exists('getSetting') ? getSetting('performance_analytics_track_logins', '1') : '1') === '1',
        'beaconUrls' => $beaconUrls,
        'collectUrl' => '/api/analytics/collect',
        'dashboardUrl' => (string)(function_exists('getSetting') ? getSetting('performance_analytics_dashboard_url', '') : ''),
        'userId' => $userId,
        'username' => $username,
        'sessionId' => session_id(),
        'location' => [
            'country_code' => $countryCode,
            'country_name' => $countryName,
            'region' => $region,
            'city' => $city,
            'latitude' => $latitude,
            'longitude' => $longitude,
            'timezone' => $timezone
        ],
        'needsLocation' => $needsLocation
    ]);
} catch (Throwable $e) {
    error_log('Analytics config error: ' . $e->getMessage());
    header('Content-Type: application/json');
    http_response_code(200);
    echo json_encode([
        'enabled' => false,
        'sampleRate' => 0.1,
        'trackAnonymous' => false,
        'trackLogins' => false,
        'beaconUrls' => [],
        'collectUrl' => '/api/analytics/collect',
        'dashboardUrl' => '',
        'userId' => null,
        'username' => null,
        'sessionId' => '',
        'location' => [
            'country_code' => 'XX',
            'country_name' => 'Unknown',
            'region' => 'Unknown',
            'city' => 'Unknown',
            'latitude' => 0.0,
            'longitude' => 0.0,
            'timezone' => 'UTC'
        ],
        'needsLocation' => true
    ]);
    exit;
}

