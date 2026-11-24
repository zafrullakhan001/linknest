<?php
/**
 * Analytics Data Integrity Test
 * Tests to verify username, IP address, and geolocation are being captured correctly
 */

require_once __DIR__ . '/api/config_analytics.php';
require_once __DIR__ . '/geoip/geoip.php';

echo "=== Analytics Data Integrity Test ===\n\n";

try {
    $db = getAnalyticsPDO();
    echo "✓ Connected to analytics database\n\n";
    
    // Test 1: Check recent metrics for username and IP
    echo "Test 1: Recent Metrics (Last 10)\n";
    echo str_repeat("-", 80) . "\n";
    
    $stmt = $db->query("
        SELECT 
            id,
            time,
            link_url,
            measurement_type,
            user_id,
            username,
            ip_address,
            country_code,
            country_name,
            region_name,
            city_name,
            latitude,
            longitude,
            full_response_time
        FROM performance_metrics
        ORDER BY time DESC
        LIMIT 10
    ");
    
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($results)) {
        echo "⚠ No metrics found in database\n";
    } else {
        foreach ($results as $row) {
            echo sprintf(
                "ID: %d | Time: %s | Type: %s\n" .
                "  URL: %s\n" .
                "  User ID: %s | Username: %s\n" .
                "  IP: %s | Location: %s, %s, %s (%s)\n" .
                "  Coords: %s, %s | Latency: %dms\n\n",
                $row['id'],
                $row['time'],
                $row['measurement_type'],
                substr($row['link_url'], 0, 60),
                $row['user_id'] ?? 'NULL',
                $row['username'] ?? 'NULL',
                $row['ip_address'] ?? 'NULL',
                $row['city_name'] ?? 'NULL',
                $row['region_name'] ?? 'NULL',
                $row['country_name'] ?? 'NULL',
                $row['country_code'] ?? 'NULL',
                $row['latitude'] ?? 'NULL',
                $row['longitude'] ?? 'NULL',
                $row['full_response_time']
            );
        }
    }
    
    // Test 2: Check username distribution
    echo "\nTest 2: Username Distribution\n";
    echo str_repeat("-", 80) . "\n";
    
    $stmt = $db->query("
        SELECT 
            username,
            COUNT(*) as count,
            COUNT(DISTINCT link_url) as unique_urls,
            AVG(full_response_time) as avg_latency
        FROM performance_metrics
        WHERE time >= NOW() - INTERVAL '7 days'
        GROUP BY username
        ORDER BY count DESC
        LIMIT 10
    ");
    
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($results)) {
        echo "⚠ No username data found\n";
    } else {
        foreach ($results as $row) {
            echo sprintf(
                "Username: %s | Measurements: %d | Unique URLs: %d | Avg Latency: %.0fms\n",
                $row['username'] ?? '(NULL/Anonymous)',
                $row['count'],
                $row['unique_urls'],
                $row['avg_latency']
            );
        }
    }
    
    // Test 3: Check IP address distribution
    echo "\n\nTest 3: IP Address Distribution\n";
    echo str_repeat("-", 80) . "\n";
    
    $stmt = $db->query("
        SELECT 
            ip_address,
            username,
            COUNT(*) as count,
            country_code,
            country_name,
            region_name,
            city_name
        FROM performance_metrics
        WHERE time >= NOW() - INTERVAL '7 days'
        GROUP BY ip_address, username, country_code, country_name, region_name, city_name
        ORDER BY count DESC
        LIMIT 10
    ");
    
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($results)) {
        echo "⚠ No IP data found\n";
    } else {
        foreach ($results as $row) {
            echo sprintf(
                "IP: %s | User: %s | Count: %d | Location: %s, %s (%s)\n",
                $row['ip_address'] ?? '(NULL)',
                $row['username'] ?? '(NULL)',
                $row['count'],
                $row['city_name'] ?? 'Unknown',
                $row['region_name'] ?? 'Unknown',
                $row['country_code'] ?? 'XX'
            );
        }
    }
    
    // Test 4: Check geolocation accuracy
    echo "\n\nTest 4: Geolocation Accuracy\n";
    echo str_repeat("-", 80) . "\n";
    
    $stmt = $db->query("
        SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE country_code = 'XX') as unknown_country,
            COUNT(*) FILTER (WHERE country_code = 'XX' OR country_name = 'Unknown') as unknown_or_default,
            COUNT(*) FILTER (WHERE latitude = 0 AND longitude = 0) as zero_coords,
            COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) as null_coords,
            COUNT(*) FILTER (WHERE country_code != 'XX' AND latitude != 0 AND longitude != 0) as valid_geo
        FROM performance_metrics
        WHERE time >= NOW() - INTERVAL '7 days'
    ");
    
    $results = $stmt->fetch(PDO::FETCH_ASSOC);
    
    echo sprintf(
        "Total Metrics: %d\n" .
        "Unknown Country (XX): %d (%.1f%%)\n" .
        "Unknown/Default: %d (%.1f%%)\n" .
        "Zero Coordinates: %d (%.1f%%)\n" .
        "NULL Coordinates: %d (%.1f%%)\n" .
        "Valid Geolocation: %d (%.1f%%)\n",
        $results['total'],
        $results['unknown_country'],
        ($results['total'] > 0 ? ($results['unknown_country'] / $results['total']) * 100 : 0),
        $results['unknown_or_default'],
        ($results['total'] > 0 ? ($results['unknown_or_default'] / $results['total']) * 100 : 0),
        $results['zero_coords'],
        ($results['total'] > 0 ? ($results['zero_coords'] / $results['total']) * 100 : 0),
        $results['null_coords'],
        ($results['total'] > 0 ? ($results['null_coords'] / $results['total']) * 100 : 0),
        $results['valid_geo'],
        ($results['total'] > 0 ? ($results['valid_geo'] / $results['total']) * 100 : 0)
    );
    
    // Test 5: Check queue status
    echo "\n\nTest 5: Metrics Queue Status\n";
    echo str_repeat("-", 80) . "\n";
    
    $stmt = $db->query("
        SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE processed = FALSE) as pending,
            COUNT(*) FILTER (WHERE processed = TRUE) as processed,
            MAX(created_at) as last_queued,
            MAX(processed_at) as last_processed
        FROM metrics_queue
    ");
    
    $results = $stmt->fetch(PDO::FETCH_ASSOC);
    
    echo sprintf(
        "Total Queued: %d\n" .
        "Pending: %d\n" .
        "Processed: %d\n" .
        "Last Queued: %s\n" .
        "Last Processed: %s\n",
        $results['total'],
        $results['pending'],
        $results['processed'],
        $results['last_queued'] ?? '(none)',
        $results['last_processed'] ?? '(none)'
    );
    
    // Test 6: Test GeoIP function
    echo "\n\nTest 6: GeoIP Function Test\n";
    echo str_repeat("-", 80) . "\n";
    
    $testIPs = [
        '127.0.0.1' => 'Localhost',
        '8.8.8.8' => 'Google DNS',
        '1.1.1.1' => 'Cloudflare DNS'
    ];
    
    foreach ($testIPs as $ip => $label) {
        echo "\nTesting $label ($ip):\n";
        $geo = getGeoFromIP($ip);
        echo sprintf(
            "  Country: %s (%s)\n" .
            "  Region: %s\n" .
            "  City: %s\n" .
            "  Coordinates: %s, %s\n" .
            "  Timezone: %s\n",
            $geo['country_name'] ?? 'NULL',
            $geo['country_code'] ?? 'NULL',
            $geo['region_name'] ?? 'NULL',
            $geo['city_name'] ?? 'NULL',
            $geo['latitude'] ?? 'NULL',
            $geo['longitude'] ?? 'NULL',
            $geo['timezone'] ?? 'NULL'
        );
    }
    
    echo "\n\n=== Test Complete ===\n";
    
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
