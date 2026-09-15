# Analytics PostgreSQL + TimescaleDB (Docker)

PostgreSQL with TimescaleDB for the Linknest Performance Analytics add-on. Runs on **port 5433** with password **password**.

## Quick start

From the **repo root** (e.g. `c:\xampp\htdocs\linknest`):

```powershell
.\docker\start-analytics-db.ps1
```

Or with Docker Compose directly:

```powershell
docker compose -f docker/docker-compose.analytics-db.yml up -d
```

## Connection

| Setting  | Value              |
|----------|--------------------|
| Host     | `localhost`        |
| Port     | `5433`             |
| Database | `linknest_analytics` |
| User     | `postgres`         |
| Password | `password`         |

Configure these in **Admin → Addons → Performance Analytics** (PostgreSQL settings).

## What gets created on first run

Init scripts in `docker/init-analytics-db/` run only when the container is created for the first time:

1. **01-schema.sql** – Runs `analytics/schema.sql`:
   - TimescaleDB extension
   - `metrics_queue`, `performance_metrics` (hypertable), `link_latency_summary`, `user_geolocations`, `alert_thresholds`
   - Views: `user_current_location`, `performance_alerts`
   - Continuous aggregate: `performance_by_region_hourly`
   - Compression (7 days) and retention (90 days) policies
   - Trigger to update `link_latency_summary`

2. **02-location-lookup.sql** – Geo lookup table:
   - `location_lookup` (country, region, city, latitude, longitude, population)
   - Indexes for coordinate and country lookups

To **re-run init** (e.g. after schema changes), remove the volume and start again:

```powershell
docker compose -f docker/docker-compose.analytics-db.yml down -v
docker compose -f docker/docker-compose.analytics-db.yml up -d
```

(Warning: `-v` deletes all analytics data.)

## Useful commands

- **Logs:** `docker compose -f docker/docker-compose.analytics-db.yml logs -f analytics-db`
- **Stop:** `docker compose -f docker/docker-compose.analytics-db.yml down`
- **Connect with psql:**  
  `docker exec -it linknest-analytics-db psql -U postgres -d linknest_analytics`  
  Or from host: `psql -h localhost -p 5433 -U postgres -d linknest_analytics` (if `psql` is installed).

## Populating `location_lookup`

The table is created empty. To add cities for reverse geocoding:

- Run the PHP setup (adds a small sample):  
  `php analytics/geoip/setup-location-lookup-table.php`
- Or import a full CSV:  
  `php analytics/geoip/import-world-cities.php path/to/world-cities.csv`

Ensure the app’s analytics DB settings point to this instance (localhost, port 5433, user postgres, password password) before running those scripts.
