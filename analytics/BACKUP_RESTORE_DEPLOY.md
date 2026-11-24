# Analytics PostgreSQL: Backup, Restore, and Docker Deploy

## Credentials (default)

| Setting    | Value     |
|-----------|-----------|
| Host      | localhost |
| Port      | 5433      |
| User      | postgres  |
| Password  | postgres  |
| Database  | analytics |

---

## 1) Backup and restore

### Backup (creates timestamped file)

**PowerShell (Windows):**
```powershell
# Default: database=analytics, output in analytics folder
.\analytics\backup-analytics-db.ps1

# Custom output folder and/or custom format (for pg_restore)
.\analytics\backup-analytics-db.ps1 -OutputDir D:\backups
.\analytics\backup-analytics-db.ps1 -Format Custom -Database analytics
```

**Bash (Linux/macOS):**
```bash
chmod +x analytics/backup-analytics-db.sh
./analytics/backup-analytics-db.sh

# Custom DB name and output
DB_NAME=analytics OUTPUT_DIR=/var/backups ./analytics/backup-analytics-db.sh
# Custom format for pg_restore
FORMAT=custom ./analytics/backup-analytics-db.sh
```

Backup files: `analytics_backup_YYYYMMDD-HHMMSS.sql` (plain) or `.dump` (custom).

### Restore from backup

**PowerShell:**
```powershell
.\analytics\restore-analytics-backup.ps1 -BackupFile ".\analytics_backup_20260125-120000.sql"

# Drop and recreate database then restore
.\analytics\restore-analytics-backup.ps1 -BackupFile ".\analytics_backup_20260125-120000.sql" -DropDatabase
```

**Bash:**
```bash
./analytics/restore-analytics-backup.sh /path/to/analytics_backup_20260125-120000.sql
./analytics/restore-analytics-backup.sh -d /path/to/backup.sql   # drop DB first
```

Use the same `DB_NAME` / `-Database` as when backing up (default: `analytics`).

---

## 2) Docker deploy (Postgres + analytics schema, ready to roll)

Runs a TimescaleDB container with database **analytics**, user **postgres**, password **postgres**, port **5433**. On first start, init scripts run `analytics/schema.sql` and create all tables, indexes, views, and policies.

### Deploy

**PowerShell:**
```powershell
.\docker\deploy-analytics-db.ps1
# Stop container
.\docker\deploy-analytics-db.ps1 -Stop
```

**Bash:**
```bash
chmod +x docker/deploy-analytics-db.sh
./docker/deploy-analytics-db.sh
# Foreground
./docker/deploy-analytics-db.sh --no-detach
# Stop
./docker/deploy-analytics-db.sh --stop
```

**Or with Docker Compose directly (from repo root):**
```bash
docker compose -f docker/docker-compose.analytics.yml up -d
docker compose -f docker/docker-compose.analytics.yml down
```

### After deploy

- Connect: `psql -h localhost -p 5433 -U postgres -d analytics` (password: `postgres`).
- In Linknest: enable Performance Analytics and set DB to **host** `localhost`, **port** `5433`, **database** `analytics`, **user** `postgres`, **password** `postgres`.

Tables created by schema: `metrics_queue`, `performance_metrics` (hypertable), `link_latency_summary`, `user_geolocations`, `alert_thresholds`, `location_lookup`, plus views and policies.
