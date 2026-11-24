#!/usr/bin/env bash
# Restore Linknest Analytics PostgreSQL schema
# Uses: postgres/postgres on localhost:5433
# Creates database linknest_analytics and all tables (including geo location_lookup)
#
# Prerequisites: PostgreSQL with TimescaleDB, psql/createdb in PATH
# Run: ./analytics/restore-analytics-db.sh
# Or with custom args: PGPORT=5433 PGHOST=localhost ./analytics/restore-analytics-db.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_PATH="$SCRIPT_DIR/schema.sql"
DB_NAME="${DB_NAME:-linknest_analytics}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5433}"
PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"

echo "=== Linknest Analytics – Restore PostgreSQL schema ==="
echo "Host: $PGHOST:$PGPORT  User: $PGUSER  Database: $DB_NAME"
echo ""

if [ ! -f "$SCHEMA_PATH" ]; then
    echo "ERROR: Schema file not found: $SCHEMA_PATH"
    exit 1
fi

# Create database if it doesn't exist
EXISTS=$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>/dev/null || true)
if [ -z "$EXISTS" ]; then
    echo "Creating database: $DB_NAME ..."
    createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$DB_NAME"
    echo "Database created."
else
    echo "Database '$DB_NAME' already exists. Applying schema..."
fi
echo ""

# Run schema
echo "Running schema.sql ..."
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB_NAME" -f "$SCHEMA_PATH"

echo ""
echo "Schema restored successfully."
echo "Tables: metrics_queue, performance_metrics (hypertable), link_latency_summary, user_geolocations, alert_thresholds, location_lookup"
echo "Views: user_current_location, performance_alerts"
echo "Continuous aggregate: performance_by_region_hourly"
echo ""
echo "Optional – populate location_lookup with cities:"
echo "  php $SCRIPT_DIR/geoip/setup-location-lookup-table.php"
echo "  php $SCRIPT_DIR/geoip/import-world-cities.php <path-to-world-cities.csv>"
echo ""

unset PGPASSWORD
