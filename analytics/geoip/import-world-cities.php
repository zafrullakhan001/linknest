<?php
/**
 * Import World Cities CSV into PostgreSQL
 * 
 * Downloads and imports world cities data from SimpleMaps or GeoNames
 * 
 * Usage: php analytics/geoip/import-world-cities.php [csv-file]
 */

require_once __DIR__ . '/../api/config_analytics.php';

$csvFile = $argv[1] ?? null;

if (!$csvFile || !file_exists($csvFile)) {
    echo "Usage: php import-world-cities.php <path-to-world-cities.csv>\n\n";
    echo "Download world cities CSV from:\n";
    echo "  - SimpleMaps: https://simplemaps.com/data/world-cities (free basic version)\n";
    echo "  - GeoNames: https://www.geonames.org/export/\n\n";
    echo "Expected CSV format:\n";
    echo "  city, city_ascii, lat, lng, country, iso2, iso3, admin_name, capital, population\n";
    exit(1);
}

echo "=== Importing World Cities ===\n\n";

try {
    $db = getAnalyticsPDO();
    echo "✓ Connected to PostgreSQL\n";
    
    // Ensure table exists
    $db->exec("
        CREATE TABLE IF NOT EXISTS location_lookup (
            id SERIAL PRIMARY KEY,
            country_code VARCHAR(2) NOT NULL,
            country_name VARCHAR(100) NOT NULL,
            region_name VARCHAR(100),
            city_name VARCHAR(100),
            latitude DECIMAL(10, 7) NOT NULL,
            longitude DECIMAL(10, 7) NOT NULL,
            population INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ");
    
    // Truncate existing data (optional - comment out to append)
    echo "Truncating existing data...\n";
    $db->exec("TRUNCATE TABLE location_lookup");
    
    $insertStmt = $db->prepare("
        INSERT INTO location_lookup 
        (country_code, country_name, region_name, city_name, latitude, longitude, population)
        VALUES (:country_code, :country_name, :region_name, :city_name, :latitude, :longitude, :population)
    ");
    
    $handle = fopen($csvFile, 'r');
    if (!$handle) {
        die("ERROR: Could not open CSV file\n");
    }
    
    // Read header
    $header = fgetcsv($handle);
    echo "CSV Header: " . implode(', ', $header) . "\n\n";
    
    // Map column indices (adjust based on your CSV format)
    $cityIdx = array_search('city', $header) !== false ? array_search('city', $header) : 
               (array_search('city_ascii', $header) !== false ? array_search('city_ascii', $header) : 0);
    $latIdx = array_search('lat', $header) !== false ? array_search('lat', $header) : 
              (array_search('latitude', $header) !== false ? array_search('latitude', $header) : 2);
    $lonIdx = array_search('lng', $header) !== false ? array_search('lng', $header) : 
              (array_search('lon', $header) !== false ? array_search('lon', $header) : 
               (array_search('longitude', $header) !== false ? array_search('longitude', $header) : 3));
    $countryIdx = array_search('country', $header) !== false ? array_search('country', $header) : 
                  (array_search('country_name', $header) !== false ? array_search('country_name', $header) : 4);
    $iso2Idx = array_search('iso2', $header) !== false ? array_search('iso2', $header) : 
               (array_search('country_code', $header) !== false ? array_search('country_code', $header) : 5);
    $adminIdx = array_search('admin_name', $header) !== false ? array_search('admin_name', $header) : 
                (array_search('region', $header) !== false ? array_search('region', $header) : 
                 (array_search('state', $header) !== false ? array_search('state', $header) : null));
    $popIdx = array_search('population', $header) !== false ? array_search('population', $header) : null;
    
    $db->beginTransaction();
    $batchSize = 1000;
    $count = 0;
    $inserted = 0;
    
    echo "Importing cities...\n";
    
    while (($row = fgetcsv($handle)) !== false) {
        if (count($row) < 4) continue;
        
        $city = trim($row[$cityIdx] ?? '');
        $lat = (float)($row[$latIdx] ?? 0);
        $lon = (float)($row[$lonIdx] ?? 0);
        $country = trim($row[$countryIdx] ?? '');
        $iso2 = strtoupper(trim($row[$iso2Idx] ?? ''));
        $region = $adminIdx !== null ? trim($row[$adminIdx] ?? '') : '';
        $population = $popIdx !== null ? (int)($row[$popIdx] ?? 0) : null;
        
        // Skip invalid rows
        if (empty($city) || $lat == 0 || $lon == 0 || empty($country)) {
            continue;
        }
        
        // Skip if coordinates are invalid
        if ($lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
            continue;
        }
        
        try {
            $insertStmt->execute([
                ':country_code' => $iso2 ?: 'XX',
                ':country_name' => $country,
                ':region_name' => $region ?: null,
                ':city_name' => $city,
                ':latitude' => $lat,
                ':longitude' => $lon,
                ':population' => $population
            ]);
            
            $inserted++;
            $count++;
            
            if ($count % $batchSize == 0) {
                $db->commit();
                $db->beginTransaction();
                echo "  Imported $count cities (inserted: $inserted)...\r";
            }
        } catch (Exception $e) {
            // Skip duplicates or errors
            continue;
        }
    }
    
    $db->commit();
    fclose($handle);
    
    echo "\n✓ Import complete!\n";
    echo "  Total processed: $count\n";
    echo "  Successfully inserted: $inserted\n\n";
    
    // Create indexes if they don't exist
    echo "Creating indexes...\n";
    $db->exec("
        CREATE INDEX IF NOT EXISTS idx_location_lookup_coords 
        ON location_lookup(latitude, longitude)
    ");
    $db->exec("
        CREATE INDEX IF NOT EXISTS idx_location_lookup_country 
        ON location_lookup(country_code)
    ");
    echo "✓ Indexes created\n\n";
    
} catch (Exception $e) {
    if (isset($db) && $db->inTransaction()) {
        $db->rollBack();
    }
    die("ERROR: " . $e->getMessage() . "\n");
}
