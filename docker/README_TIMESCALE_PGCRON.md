# TimescaleDB with pg_cron (port 5433)

This setup runs PostgreSQL 18 + TimescaleDB with the **pg_cron** extension so you can schedule periodic SQL jobs inside the database.

- **Image**: Built from `Dockerfile.timescale-pgcron` (extends `timescale/timescaledb:latest-pg18`).
- **Port**: 5433 (host) → 5432 (container).
- **Credentials**: `postgres` / `postgres`.
- **Default DB**: `linknest_analytics`.

## First-time setup

1. **Build and start** (from repo root or from `docker/`):

   ```bash
   cd docker
   docker compose -f docker-compose.timescale.yml build
   docker compose -f docker-compose.timescale.yml up -d
   ```

   Or from repo root:

   ```bash
   docker compose -f docker/docker-compose.timescale.yml build
   docker compose -f docker/docker-compose.timescale.yml up -d
   ```

2. **New data directory**: The init script runs automatically and creates the `pg_cron` extension in `linknest_analytics`.

3. **Existing container / existing data**: If you already have PG-timescale running with data, rebuild and recreate the container (the volume is kept), then create the extension once:

   ```bash
   cd docker
   docker compose -f docker-compose.timescale.yml build
   docker compose -f docker-compose.timescale.yml down
   docker compose -f docker-compose.timescale.yml up -d
   psql -h localhost -p 5433 -U postgres -d linknest_analytics -c "CREATE EXTENSION IF NOT EXISTS pg_cron;"
   ```

## Verify pg_cron

```bash
psql -h localhost -p 5433 -U postgres -d linknest_analytics -c "SELECT * FROM cron.job;"
```

## Example: schedule a job

```sql
-- Run every day at 02:00 UTC
SELECT cron.schedule('daily-cleanup', '0 2 * * *', $$DELETE FROM some_table WHERE created_at < now() - interval '30 days'$$);
```

See [pg_cron](https://github.com/citusdata/pg_cron) for more options.
