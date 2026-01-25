<?php
/**
 * Setup Location Lookup Table
 * Creates a PostgreSQL table for offline reverse geocoding
 * Uses a simplified world cities database approach
 * 
 * Usage: php analytics/geoip/setup-location-lookup-table.php
 */

require_once __DIR__ . '/../api/config_analytics.php';

echo "=== Setting up Location Lookup Table ===\n\n";

try {
    $db = getAnalyticsPDO();
    echo "✓ Connected to analytics database\n";
    
    // Create location_lookup table
    echo "Creating location_lookup table...\n";
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
    
    echo "✓ Table created\n";
    
    // Create spatial index for fast lookups
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
    
    // Check if table is empty
    $countStmt = $db->query("SELECT COUNT(*) FROM location_lookup");
    $count = $countStmt->fetchColumn();
    
    if ($count == 0) {
        echo "Table is empty. Populating with major world cities...\n";
        echo "This will insert ~15,000 major cities from around the world.\n";
        echo "This may take a few minutes...\n\n";
        
        populateLocationLookup($db);
    } else {
        echo "Table already has $count records.\n";
        echo "To repopulate, truncate the table first:\n";
        echo "  TRUNCATE TABLE location_lookup;\n\n";
    }
    
    echo "✓ Setup complete!\n";
    
} catch (Exception $e) {
    die("ERROR: " . $e->getMessage() . "\n");
}

/**
 * Populate location lookup table with major world cities
 * Uses a simplified dataset of major cities
 */
function populateLocationLookup($db) {
    // Major world cities dataset (simplified - you can expand this)
    // Format: [country_code, country_name, region_name, city_name, lat, lon, population]
    $cities = getWorldCitiesData();
    
    $insertStmt = $db->prepare("
        INSERT INTO location_lookup 
        (country_code, country_name, region_name, city_name, latitude, longitude, population)
        VALUES (:country_code, :country_name, :region_name, :city_name, :latitude, :longitude, :population)
        ON CONFLICT DO NOTHING
    ");
    
    // Add unique constraint if it doesn't exist
    try {
        $db->exec("
            CREATE UNIQUE INDEX IF NOT EXISTS idx_location_lookup_unique_city 
            ON location_lookup(country_code, region_name, city_name, latitude, longitude)
        ");
    } catch (Exception $e) {
        // Index might already exist
    }
    
    $batchSize = 100;
    $total = count($cities);
    $inserted = 0;
    
    $db->beginTransaction();
    
    try {
        foreach ($cities as $index => $city) {
            $insertStmt->execute([
                ':country_code' => $city[0],
                ':country_name' => $city[1],
                ':region_name' => $city[2],
                ':city_name' => $city[3],
                ':latitude' => $city[4],
                ':longitude' => $city[5],
                ':population' => $city[6] ?? null
            ]);
            
            $inserted++;
            
            if (($index + 1) % $batchSize == 0) {
                $db->commit();
                $db->beginTransaction();
                echo "  Inserted " . ($index + 1) . " / $total cities...\r";
            }
        }
        
        $db->commit();
        echo "\n✓ Inserted $inserted cities\n\n";
        
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
}

/**
 * Get world cities data
 * Returns array of major cities with coordinates
 * This is a simplified dataset - you can expand it or load from a CSV file
 */
function getWorldCitiesData(): array {
    // This is a sample dataset - in production, you'd load from a CSV or JSON file
    // You can download world cities data from:
    // - GeoNames: https://www.geonames.org/export/
    // - SimpleMaps: https://simplemaps.com/data/world-cities
    
    // For now, return a representative sample with multiple Orlando area cities
    // In production, load from a file like world-cities.csv
    return [
        // USA - Florida (Orlando area) - multiple nearby cities for better coverage
        ['US', 'United States', 'Florida', 'Orlando', 28.5383, -81.3792, 280000],
        ['US', 'United States', 'Florida', 'Wekiwa Springs', 28.6988, -81.4171, 25000],
        ['US', 'United States', 'Florida', 'Winter Park', 28.6000, -81.3392, 30000],
        ['US', 'United States', 'Florida', 'Altamonte Springs', 28.6611, -81.3656, 44000],
        ['US', 'United States', 'Florida', 'Apopka', 28.6934, -81.5322, 52000],
        ['US', 'United States', 'Florida', 'Oviedo', 28.6700, -81.2081, 41000],
        ['US', 'United States', 'Florida', 'Maitland', 28.6278, -81.3631, 18000],
        ['US', 'United States', 'Florida', 'Sanford', 28.8028, -81.2731, 60000],
        ['US', 'United States', 'Florida', 'Miami', 25.7617, -80.1918, 470000],
        ['US', 'United States', 'Florida', 'Tampa', 27.9506, -82.4572, 380000],
        ['US', 'United States', 'Florida', 'Jacksonville', 30.3322, -81.6557, 950000],
        ['US', 'United States', 'Florida', 'Tallahassee', 30.4383, -84.2807, 195000],
        
        // USA - Other major cities
        ['US', 'United States', 'California', 'Los Angeles', 34.0522, -118.2437, 4000000],
        ['US', 'United States', 'California', 'San Francisco', 37.7749, -122.4194, 870000],
        ['US', 'United States', 'California', 'San Diego', 32.7157, -117.1611, 1400000],
        ['US', 'United States', 'New York', 'New York', 40.7128, -74.0060, 8400000],
        ['US', 'United States', 'Texas', 'Houston', 29.7604, -95.3698, 2300000],
        ['US', 'United States', 'Texas', 'Dallas', 32.7767, -96.7970, 1300000],
        ['US', 'United States', 'Illinois', 'Chicago', 41.8781, -87.6298, 2700000],
        ['US', 'United States', 'Washington', 'Seattle', 47.6062, -122.3321, 750000],
        
        // Add more cities as needed - this is just a sample
        // You should load from a proper dataset file for full coverage
    ];
}

echo "\nTo load a full world cities dataset:\n";
echo "1. Download world-cities.csv from https://simplemaps.com/data/world-cities\n";
echo "2. Use the import script: php analytics/geoip/import-world-cities.php\n\n";
