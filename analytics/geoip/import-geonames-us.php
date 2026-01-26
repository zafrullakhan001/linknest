<?php
/**
 * Import GeoNames US.txt (or other country TSV) into location_lookup.
 * Uses sampling and filtering so the import is fast and the table stays manageable.
 *
 * Usage:
 *   php import-geonames-us.php <path-to-US.txt> [options]
 *
 * Options:
 *   --truncate     Clear location_lookup before import (default: append)
 *   --limit=N      Max rows to insert (default: 40000)
 *   --sample=N     Take every Nth row that passes filters (default: 1 = no sampling)
 *   --populated    Only import feature class P (populated places) - recommended
 *   --all          Import complete file (no row limit)
 *
 * Example (complete file - all rows):
 *   php import-geonames-us.php "C:\Users\zafru\Downloads\US\US.txt" --truncate --all
 *
 * Example (recommended - 40k US populated places):
 *   php import-geonames-us.php "C:\Users\zafru\Downloads\US\US.txt" --populated --limit=40000
 *
 * Example (lighter - ~19k by sampling every 10th populated place):
 *   php import-geonames-us.php "C:\Users\zafru\Downloads\US\US.txt" --populated --sample=10
 */

require_once __DIR__ . '/../api/config_analytics.php';

$args = array_slice($argv, 1);
$file = null;
$truncate = false;
$limit = 40000;
$sample = 1;
$populatedOnly = false;
$importAll = false;

foreach ($args as $a) {
    if (strpos($a, '--') === 0) {
        if ($a === '--truncate') {
            $truncate = true;
        } elseif ($a === '--all') {
            $importAll = true;
            $limit = 999999999;
        } elseif ($a === '--populated') {
            $populatedOnly = true;
        } elseif (strpos($a, '--limit=') === 0) {
            $limit = (int) substr($a, 8);
            if ($limit < 1) {
                $limit = 40000;
            }
        } elseif (strpos($a, '--sample=') === 0) {
            $sample = (int) substr($a, 9);
            if ($sample < 1) {
                $sample = 1;
            }
        }
    } else {
        $file = $a;
    }
}

if (!$file || !file_exists($file)) {
    echo "Usage: php import-geonames-us.php <path-to-US.txt> [--truncate] [--populated] [--limit=N] [--sample=N]\n\n";
    echo "  --truncate   Clear table before import (default: append)\n";
    echo "  --all        Import complete file (no row limit)\n";
    echo "  --populated  Only import populated places (feature class P) - recommended\n";
    echo "  --limit=N    Max rows to insert (default: 40000)\n";
    echo "  --sample=N   Take every Nth row (default: 1)\n\n";
    echo "Example:\n  php import-geonames-us.php \"C:\\Users\\zafru\\Downloads\\US\\US.txt\" --populated --limit=40000\n";
    exit(1);
}

// GeoNames TSV columns (no header)
const GEONAME_ID = 0;
const NAME = 1;
const ASCII_NAME = 2;
const LAT = 4;
const LON = 5;
const FEATURE_CLASS = 6;
const COUNTRY_CODE = 8;
const ADMIN1 = 10;   // state code
const POPULATION = 14;

echo "=== Import GeoNames US.txt (with sampling) ===\n\n";
echo "File: $file\n";
echo "Options: limit=" . ($importAll ? 'none (full file)' : $limit) . ", sample=$sample, populatedOnly=" . ($populatedOnly ? 'yes' : 'no') . ", truncate=" . ($truncate ? 'yes' : 'no') . "\n\n";

try {
    $db = getAnalyticsPDO();
    echo "✓ Connected to PostgreSQL\n";

    $db->exec("
        CREATE TABLE IF NOT EXISTS location_lookup (
            id SERIAL PRIMARY KEY,
            country_code VARCHAR(2) NOT NULL,
            country_name VARCHAR(100) NOT NULL,
            region_name VARCHAR(100),
            city_name VARCHAR(100),
            latitude NUMERIC(10, 7) NOT NULL,
            longitude NUMERIC(10, 7) NOT NULL,
            population INTEGER,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    ");

    if ($truncate) {
        echo "Truncating location_lookup...\n";
        $db->exec("TRUNCATE TABLE location_lookup");
    }

    $insertStmt = $db->prepare("
        INSERT INTO location_lookup 
        (country_code, country_name, region_name, city_name, latitude, longitude, population)
        VALUES (:country_code, :country_name, :region_name, :city_name, :latitude, :longitude, :population)
    ");

    $handle = fopen($file, 'r');
    if (!$handle) {
        die("ERROR: Could not open file\n");
    }

    $countryName = 'United States';
    $seen = [];
    $inserted = 0;
    $skipped = 0;
    $lineNum = 0;
    $sampled = 0;

    $db->beginTransaction();
    $batchSize = 1000;

    while (($line = fgets($handle)) !== false && $inserted < $limit) {
        $lineNum++;
        $row = str_getcsv($line, "\t");
        if (count($row) < 15) {
            continue;
        }

        $fclass = $row[FEATURE_CLASS] ?? '';
        if ($populatedOnly && $fclass !== 'P') {
            $skipped++;
            continue;
        }

        $name = trim($row[NAME] ?? '');
        $lat = (float)($row[LAT] ?? 0);
        $lon = (float)($row[LON] ?? 0);
        $cc = strtoupper(trim($row[COUNTRY_CODE] ?? ''));
        $admin1 = trim($row[ADMIN1] ?? '');
        $pop = isset($row[POPULATION]) && $row[POPULATION] !== '' ? (int)$row[POPULATION] : null;

        if ($name === '' || ($lat === 0.0 && $lon === 0.0) || $cc === '') {
            continue;
        }
        if ($lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
            continue;
        }

        // Optional: dedupe by (round(lat,4), round(lon,4)) to avoid nearby duplicates
        $key = round($lat, 4) . '|' . round($lon, 4);
        if (isset($seen[$key])) {
            $skipped++;
            continue;
        }

        // Sampling: take every Nth row that passed filters
        $sampled++;
        if (($sampled % $sample) !== 0) {
            continue;
        }

        $seen[$key] = true;

        $countryNameForRow = $cc === 'US' ? 'United States' : $cc;

        try {
            $insertStmt->execute([
                ':country_code' => $cc,
                ':country_name' => $countryNameForRow,
                ':region_name' => $admin1 !== '' ? $admin1 : null,
                ':city_name' => $name,
                ':latitude' => $lat,
                ':longitude' => $lon,
                ':population' => $pop
            ]);
            $inserted++;

            if ($inserted % $batchSize === 0) {
                $db->commit();
                $db->beginTransaction();
                echo "  Inserted $inserted / $limit ...\r";
            }
        } catch (Exception $e) {
            // Skip duplicates
            continue;
        }
    }

    $db->commit();
    fclose($handle);

    echo "\n✓ Import complete.\n";
    echo "  Inserted: $inserted\n";
    echo "  Lines read: $lineNum\n\n";

    echo "Creating indexes if not present...\n";
    $db->exec("CREATE INDEX IF NOT EXISTS idx_location_lookup_coords ON location_lookup(latitude, longitude)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_location_lookup_country ON location_lookup(country_code)");
    $db->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_location_lookup_unique_city ON location_lookup(country_code, region_name, city_name, latitude, longitude)");
    echo "✓ Done.\n";

} catch (Exception $e) {
    if (isset($db) && $db->inTransaction()) {
        $db->rollBack();
    }
    die("ERROR: " . $e->getMessage() . "\n");
}
