# Analytics: Operations Guide

This guide covers **location lookup (geo) import**, **backup & restore**, and **Docker** for the Linknest Performance Analytics add-on (PostgreSQL + TimescaleDB).

---

## Table of contents

1. [Default credentials](#default-credentials)
2. [Location lookup (geo)](#location-lookup-geo)
3. [Backup](#backup)
4. [Restore](#restore)
5. [Docker](#docker)
6. [Schema-only restore (empty DB)](#schema-only-restore-empty-db)

---

## Default credentials

| Setting  | Typical value      | Notes |
|----------|--------------------|--------|
| Host     | `localhost`        | |
| Port     | `5433`             | |
| User     | `postgres`         | |
| Password | `postgres` or `password` | Depends on Docker vs local setup |
| Database | `analytics` or `linknest_analytics` | Set in **Admin → Addons → Performance Analytics** |

Configure these in the main app so the analytics API and import scripts can connect.

---

## Location lookup (geo)

The `location_lookup` table is used for **offline reverse geocoding** (latitude/longitude → country, region, city). The metrics worker fills in city/region when only coordinates are available.

### Table

- **Schema:** `analytics/schema.sql` creates `location_lookup` (country_code, country_name, region_name, city_name, latitude, longitude, population).
- **Creation only (no data):** Schema apply or `analytics/geoip/setup-location-lookup-table.php` (adds a small built-in sample).

### Populate from external data

Two import paths:

- **CSV (SimpleMaps / generic):** `import-world-cities.php`
- **GeoNames TSV (e.g. US.txt):** `import-geonames-us.php` (with sampling and `--all`)

Ensure **Analytics PostgreSQL** is configured in the app before running any import (scripts use the same config).

---

### Option A: SimpleMaps / world cities CSV

**Download:**

- **SimpleMaps World Cities (free, ~40k+ cities):** https://simplemaps.com/data/world-cities  
- **GeoNames:** https://www.geonames.org/export/

**Import (from repo root):**

```powershell
php analytics/geoip/import-world-cities.php "C:\path\to\worldcities.csv"
```

CSV should have columns such as: `city`, `lat`, `lng`, `country`, `iso2`, `admin_name`, `population`. The script maps common header names.

---

### Option B: GeoNames US.txt (and sampling)

For **GeoNames** country dumps (e.g. US.txt): tab-separated, no header.

**Download:**

- US: https://download.geonames.org/export/dump/US.zip → extract `US.txt`
- Other countries: https://download.geonames.org/export/dump/

**Script:** `analytics/geoip/import-geonames-us.php`

**Options:**

| Option       | Description |
|-------------|-------------|
| `--truncate` | Clear `location_lookup` before import (default: append). |
| `--all`      | Import full file (no row limit). |
| `--populated`| Only feature class **P** (populated places: cities, towns). Recommended for geocoding. |
| `--limit=N`  | Stop after inserting N rows (default: 40000). |
| `--sample=N` | Use every Nth row that passes filters (default: 1). |

**Examples:**

```powershell
# Full file, all rows (~2.2M for US) – replace existing lookup data
php analytics/geoip/import-geonames-us.php "C:\Users\zafru\Downloads\US\US.txt" --truncate --all

# Full file, only populated places (~194k), no limit
php analytics/geoip/import-geonames-us.php "C:\Users\zafru\Downloads\US\US.txt" --truncate --populated --all

# Sampled: 40k populated places (fast, good coverage)
php analytics/geoip/import-geonames-us.php "C:\Users\zafru\Downloads\US\US.txt" --populated --limit=40000

# Append 40k populated (no truncate)
php analytics/geoip/import-geonames-us.php "C:\Users\zafru\Downloads\US\US.txt" --populated --limit=40000

# Lighter: every 10th populated place (~19k)
php analytics/geoip/import-geonames-us.php "C:\Users\zafru\Downloads\US\US.txt" --populated --sample=10 --limit=20000
```

**After import:** Indexes are created/updated (coords, country, unique city). No extra steps required.

---

## Backup

Creates a timestamped dump of the analytics PostgreSQL database (all tables, including `location_lookup`, metrics, queue, etc.).

### PowerShell (Windows)

```powershell
# Default: database=analytics, output in analytics folder
.\analytics\backup-analytics-db.ps1

# Custom output directory
.\analytics\backup-analytics-db.ps1 -OutputDir D:\backups

# Custom format for pg_restore (binary .dump)
.\analytics\backup-analytics-db.ps1 -Format Custom -OutputDir D:\backups

# When DB runs in Docker (pg_dump runs inside container)
.\analytics\backup-analytics-db.ps1 -ContainerName linknest-analytics-db
.\analytics\backup-analytics-db.ps1 -OutputDir D:\backups -ContainerName linknest-analytics-db
```

**Parameters:** `-DbHost`, `-Port`, `-User`, `-Password`, `-Database` (default `analytics`).

**Output:** `analytics_backup_YYYYMMDD-HHMMSS.sql` (plain) or `.dump` (custom).

### Bash (Linux / macOS)

```bash
chmod +x analytics/backup-analytics-db.sh
./analytics/backup-analytics-db.sh

# Custom DB name and output
DB_NAME=analytics OUTPUT_DIR=/var/backups ./analytics/backup-analytics-db.sh
FORMAT=custom ./analytics/backup-analytics-db.sh
```

---

## Restore

Restore from a backup file produced by the backup scripts above.

### Restore from backup file (PowerShell)

```powershell
# Restore into existing database (data replaced/merged by restore)
.\analytics\restore-analytics-backup.ps1 -BackupFile ".\analytics\analytics_backup_20260125-120000.sql"

# Drop and recreate database, then restore (clean restore)
.\analytics\restore-analytics-backup.ps1 -BackupFile ".\analytics\analytics_backup_20260125-120000.sql" -DropDatabase

# Docker: run restore inside container
.\analytics\restore-analytics-backup.ps1 -BackupFile ".\analytics_backup_20260125-120000.sql" -ContainerName linknest-analytics-db

# Custom format (.dump)
.\analytics\restore-analytics-backup.ps1 -BackupFile ".\backup.dump" -DropDatabase
```

Use the same `-Database` as when you backed up (default: `analytics`).

### Restore from backup file (Bash)

```bash
./analytics/restore-analytics-backup.sh /path/to/analytics_backup_20260125-120000.sql
./analytics/restore-analytics-backup.sh -d /path/to/backup.sql   # drop DB first
```

---

## Docker

Run the analytics database in a container (PostgreSQL + TimescaleDB). Good for development or when you don’t want a local PostgreSQL install.

### Deploy analytics DB (PowerShell)

From **repo root** (e.g. `c:\xampp\htdocs\linknest`):

```powershell
.\docker\deploy-analytics-db.ps1
# Run in foreground
.\docker\deploy-analytics-db.ps1 -Detach:$false
# Stop
.\docker\deploy-analytics-db.ps1 -Stop
```

### Docker Compose (any OS)

From repo root:

```powershell
docker compose -f docker/docker-compose.analytics.yml up -d
# Or analytics-db only (no app)
docker compose -f docker/docker-compose.analytics-db.yml up -d

# Stop
docker compose -f docker/docker-compose.analytics.yml down
docker compose -f docker/docker-compose.analytics-db.yml down
```

### What runs on first start

- Database created (e.g. `analytics` or as defined in the compose/init).
- `analytics/schema.sql` applied (Tables: `metrics_queue`, `performance_metrics`, `link_latency_summary`, `user_geolocations`, `alert_thresholds`, `location_lookup`; views; continuous aggregate; compression/retention).

### Connection

- Host: `localhost`  
- Port: `5433`  
- User: `postgres`  
- Password: see compose file (often `postgres` or `password`)  
- Database: `analytics` or `linknest_analytics` (match what init/create uses)

Set these in **Admin → Addons → Performance Analytics**.

### Backup/restore when DB is in Docker

- **Backup:** Use `-ContainerName linknest-analytics-db` (or your container name) so the script runs `pg_dump` inside the container and copies the file out.
- **Restore:** Use the same `-ContainerName` so the script copies the backup into the container and runs `psql` or `pg_restore` inside it.

---

## Schema-only restore (empty DB)

Use this when you need a **fresh database with structure but no data** (e.g. after losing the DB or for a new environment). This does **not** use a backup file; it runs `schema.sql` only.

### PowerShell

```powershell
.\analytics\restore-analytics-db.ps1
```

Defaults: host `localhost`, port `5433`, user `postgres`, password `postgres`, database `linknest_analytics`. Override with parameters if needed.

### What it does

1. Creates the database if it doesn’t exist.
2. Runs `analytics/schema.sql` (tables, hypertable, views, continuous aggregate, trigger, `location_lookup`).

**After running:** Populate `location_lookup` if desired (see [Location lookup (geo)](#location-lookup-geo)).

---

## Quick reference

| Task | Command (PowerShell) |
|------|----------------------|
| Backup DB | `.\analytics\backup-analytics-db.ps1` |
| Backup to folder | `.\analytics\backup-analytics-db.ps1 -OutputDir D:\backups` |
| Backup (Docker) | `.\analytics\backup-analytics-db.ps1 -ContainerName linknest-analytics-db` |
| Restore from file | `.\analytics\restore-analytics-backup.ps1 -BackupFile ".\analytics_backup_*.sql"` |
| Restore + drop DB | `.\analytics\restore-analytics-backup.ps1 -BackupFile ".\*.sql" -DropDatabase` |
| Fresh schema only | `.\analytics\restore-analytics-db.ps1` |
| Start analytics Docker | `.\docker\deploy-analytics-db.ps1` |
| Stop analytics Docker | `.\docker\deploy-analytics-db.ps1 -Stop` |
| Import 40k US cities | `php analytics/geoip/import-geonames-us.php "C:\...\US.txt" --populated --limit=40000` |
| Import full US.txt | `php analytics/geoip/import-geonames-us.php "C:\...\US.txt" --truncate --all` |

---

## Related docs

- `analytics/BACKUP_RESTORE_DEPLOY.md` – Backup, restore, and Docker deploy (short form).
- `analytics/RESTORE_ANALYTICS_DB.md` – Restore steps when the analytics DB was lost.
- `analytics/geoip/README.md` – GeoIP/GeoLite2 setup for IP geolocation.
- `docker/README_ANALYTICS_DB.md` – Analytics DB Docker details and connection.
