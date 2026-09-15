# Restore Analytics PostgreSQL Database

Use these steps if the analytics Postgres database was lost and you need to recreate the schema and tables (including the geo location lookup table).

## Connection (default)

| Setting  | Value           |
|----------|-----------------|
| Host     | localhost       |
| Port     | 5433            |
| User     | postgres        |
| Password | postgres        |
| Database | linknest_analytics |

## Option 1: PowerShell (Windows)

From the project root:

```powershell
.\analytics\restore-analytics-db.ps1
```

Or from the `analytics` folder:

```powershell
.\restore-analytics-db.ps1
```

Custom connection (optional):

```powershell
.\restore-analytics-db.ps1 -Host localhost -Port 5433 -User postgres -Password postgres -Database linknest_analytics
```

## Option 2: Bash (Linux / Mac)

```bash
chmod +x analytics/restore-analytics-db.sh
./analytics/restore-analytics-db.sh
```

Override with environment variables:

```bash
PGHOST=localhost PGPORT=5433 PGUSER=postgres PGPASSWORD=postgres ./analytics/restore-analytics-db.sh
```

## Option 3: Manual (psql)

1. Create the database (once):

   ```bash
   set PGPASSWORD=postgres
   psql -h localhost -p 5433 -U postgres -d postgres -c "CREATE DATABASE linknest_analytics;"
   ```

2. Apply the schema (includes geo `location_lookup` table):

   ```bash
   psql -h localhost -p 5433 -U postgres -d linknest_analytics -f analytics/schema.sql
   ```

## What gets created

- **Tables**
  - `metrics_queue` – raw metrics for the worker
  - `performance_metrics` – TimescaleDB hypertable (client/server timings, geo, etc.)
  - `link_latency_summary` – per-link latency summary
  - `user_geolocations` – user login/location tracking
  - `alert_thresholds` – alert configuration
  - `location_lookup` – geo lookup for reverse geocoding (lat/lon → country/region/city)
- **Views**
  - `user_current_location`
  - `performance_alerts`
- **Continuous aggregate**
  - `performance_by_region_hourly`
- **Policies**
  - Compression after 7 days, retention 90 days (on `performance_metrics`)

## After restore

1. **Configure the app**  
   In Linknest settings, set the analytics PostgreSQL connection to `localhost`, port `5433`, database `linknest_analytics`, user `postgres`, password `postgres` (or your actual credentials).

2. **Populate `location_lookup` (optional but recommended)**  
   - Seed with built-in cities:
     ```bash
     php analytics/geoip/setup-location-lookup-table.php
     ```
   - Or import a full world cities CSV (e.g. SimpleMaps/GeoNames):
     ```bash
     php analytics/geoip/import-world-cities.php path/to/world-cities.csv
     ```

3. **Start workers** (if you use the queue)  
   See `TASK_SCHEDULER_SETUP.md` and `start-workers-xampp.bat` (or `start-workers.bat`).

## Requirements

- PostgreSQL with **TimescaleDB** extension (used for hypertable, compression, retention, continuous aggregate).
- `psql` and `createdb` in PATH for the scripts; or run the manual `psql` commands above.
