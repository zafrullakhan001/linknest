<?php
/**
 * Performance Analytics Config (client)
 * Provides a small config payload for the SPA to collect metrics safely.
 *
 * Route: GET /api/analytics/config
 */
require_once __DIR__ . '/../config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Only allow GET
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJSON(['error' => 'Method not allowed'], 405);
}

// Determine if analytics is enabled
$enabled = function_exists('isPerformanceAnalyticsEnabled') && isPerformanceAnalyticsEnabled();

// Respect "track anonymous" setting if user is not authenticated
$trackAnonymous = (getSetting('performance_analytics_track_anonymous', '1') === '1');
$userId = $_SESSION['user_id'] ?? null;
if (!$userId && !$trackAnonymous) {
    // Return disabled config to avoid client-side collection for anonymous users
    sendJSON([
        'enabled' => false,
        'reason' => 'anonymous_tracking_disabled'
    ]);
}

// Parse beacon URLs (comma-separated in settings)
$rawBeaconUrls = (string)getSetting('performance_analytics_beacon_urls', '');
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
    'sampleRate' => (float)getSetting('performance_analytics_sample_rate', 0.1),
    'trackAnonymous' => $trackAnonymous,
    'trackLogins' => (getSetting('performance_analytics_track_logins', '1') === '1'),
    'beaconUrls' => $beaconUrls,
    // Same-origin collector (avoids mixed-content / CORS issues)
    'collectUrl' => '/api/analytics/collect',
    // Dashboard is still useful for admins
    'dashboardUrl' => (string)getSetting('performance_analytics_dashboard_url', ''),
    // User/session context
    'userId' => $userId,
    'sessionId' => session_id(),
    // Best-known location (session, can be updated by /api/analytics/update-location)
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

