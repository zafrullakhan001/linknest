<?php
/**
 * Test Reverse Geocoding
 * Tests the reverse geocoding function with Orlando coordinates
 * 
 * Usage: php analytics/geoip/test-reverse-geocode.php
 */

require_once __DIR__ . '/reverse-geocode-offline.php';

echo "=== Testing Reverse Geocoding ===\n\n";

// Test with Orlando coordinates (from user's payload)
$testLat = 28.70373854320581;
$testLon = -81.41529064905755;

echo "Testing coordinates: $testLat, $testLon (Orlando, Florida)\n\n";

// Test PostgreSQL lookup
echo "1. Testing PostgreSQL location_lookup table...\n";
$pgResult = getLocationFromPostgreSQL($testLat, $testLon, 0.2);
if ($pgResult) {
    echo "   ✓ Found in PostgreSQL:\n";
    echo "     Country: {$pgResult['country_code']} - {$pgResult['country_name']}\n";
    echo "     Region: {$pgResult['region_name']}\n";
    echo "     City: {$pgResult['city_name']}\n";
    echo "     Distance: " . round($pgResult['distance_km'] ?? 0, 2) . " km\n";
    echo "     Source: {$pgResult['source']}\n";
} else {
    echo "   ✗ Not found in PostgreSQL location_lookup table\n";
    echo "   → Run: php analytics/geoip/setup-location-lookup-table.php\n";
    echo "   → Then import world cities data\n";
}
echo "\n";

// Test full reverse geocoding function
echo "2. Testing full reverse geocoding (PostgreSQL → Cache → Online)...\n";
$fullResult = getLocationFromCoordinates($testLat, $testLon, 0.2);
if ($fullResult && $fullResult['country_code'] !== 'XX') {
    echo "   ✓ Reverse geocoding successful:\n";
    echo "     Country: {$fullResult['country_code']} - {$fullResult['country_name']}\n";
    echo "     Region: {$fullResult['region_name']}\n";
    echo "     City: {$fullResult['city_name']}\n";
    if (isset($fullResult['source'])) {
        echo "     Source: {$fullResult['source']}\n";
    }
    if (isset($fullResult['distance_km'])) {
        echo "     Distance: " . round($fullResult['distance_km'], 2) . " km\n";
    }
} else {
    echo "   ✗ Reverse geocoding failed or returned Unknown\n";
    echo "   → Check if location_lookup table exists and has data\n";
    echo "   → Check if online API is accessible (if table is empty)\n";
}
echo "\n";

// Check if table exists and has data
echo "3. Checking location_lookup table status...\n";
try {
    $db = getAnalyticsPDO();
    
    // Check if table exists
    $tableCheck = $db->query("
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'location_lookup'
        )
    ");
    $tableExists = $tableCheck->fetchColumn();
    
    if ($tableExists) {
        echo "   ✓ Table exists\n";
        
        // Count records
        $countStmt = $db->query("SELECT COUNT(*) FROM location_lookup");
        $count = $countStmt->fetchColumn();
        echo "   → Total records: $count\n";
        
        // Check for Orlando
        $orlandoStmt = $db->prepare("
            SELECT city_name, latitude, longitude, country_name, region_name
            FROM location_lookup
            WHERE city_name ILIKE '%orlando%'
            LIMIT 5
        ");
        $orlandoStmt->execute();
        $orlandoResults = $orlandoStmt->fetchAll();
        
        if (count($orlandoResults) > 0) {
            echo "   ✓ Found Orlando records:\n";
            foreach ($orlandoResults as $row) {
                echo "     - {$row['city_name']}, {$row['region_name']}, {$row['country_name']} ({$row['latitude']}, {$row['longitude']})\n";
            }
        } else {
            echo "   ✗ No Orlando records found\n";
            echo "   → Import world cities data to populate the table\n";
        }
        
        // Check for nearby cities
        $nearbyStmt = $db->prepare("
            SELECT city_name, latitude, longitude, country_name, region_name,
                   (111.32 * sqrt(POWER((latitude - :lat), 2) + POWER((longitude - :lon) * cos(radians(:lat)), 2))) AS distance_km
            FROM location_lookup
            WHERE ABS(latitude - :lat) < 0.2 AND ABS(longitude - :lon) < 0.2
            AND city_name IS NOT NULL AND city_name != 'Unknown'
            ORDER BY distance_km
            LIMIT 5
        ");
        $nearbyStmt->execute([':lat' => $testLat, ':lon' => $testLon]);
        $nearbyResults = $nearbyStmt->fetchAll();
        
        if (count($nearbyResults) > 0) {
            echo "\n   Nearby cities (within 0.2 degrees):\n";
            foreach ($nearbyResults as $row) {
                echo "     - {$row['city_name']}, {$row['region_name']} (" . round($row['distance_km'], 1) . " km)\n";
            }
        } else {
            echo "\n   ✗ No nearby cities found within 0.2 degrees\n";
        }
        
    } else {
        echo "   ✗ Table does not exist\n";
        echo "   → Run: php analytics/geoip/setup-location-lookup-table.php\n";
    }
    
} catch (Exception $e) {
    echo "   ✗ Error checking table: " . $e->getMessage() . "\n";
}

echo "\n=== Test Complete ===\n";
