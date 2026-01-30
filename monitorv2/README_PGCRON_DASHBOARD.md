# Monitorv2 Dashboard with pg_cron

This setup replicates what the **Python monitorv2 dashboard** does, using the **zmonitoring** PostgreSQL database and the **pg_cron** extension: same dashboard data (summary, monitors list, recent checks) plus scheduled maintenance jobs.

## What it does

1. **Dashboard views** (same data as the Python script):
   - `zmonitoring.v_dashboard_summary` — one row: total monitors, up/down/warning counts, checks in last 24h
   - `zmonitoring.v_dashboard_monitors` — monitor list for the dashboard
   - `zmonitoring.v_dashboard_recent_checks` — recent check results with monitor name

2. **pg_cron jobs** (scheduled inside Postgres):
   - **zmonitoring_every_minute** — every minute: inserts a row into `zmonitoring.cron_trigger` to request monitor checks. A **scheduler** (see below) must call the app endpoint every minute so the app runs the checks and the dashboard updates.
   - **zmonitoring_aggregate_hourly** — every hour: aggregates `monitor_checks` into `monitor_hourly_stats` (previous hour)
   - **zmonitoring_cleanup_old_data** — daily at 02:00: deletes old checks (90 days), notification logs (365 days), and old hourly stats

3. **Web dashboard** — same UI as the Python dashboard, served by the app:
   - **URL**: `GET /api/monitorv2/dashboard` (requires login)
   - Uses the views above when present; otherwise runs the same queries directly.

## Prerequisites

- PostgreSQL with the **zmonitoring** database and schema applied (`monitorv2/schema.sql`)
- **pg_cron** extension in the database set by `cron.database_name` (e.g. **linknest_analytics**). Jobs are scheduled there and run in zmonitoring via `cron.schedule_in_database(..., 'zmonitoring', ...)`.

**Enable/disable jobs:** See [PGCRON_JOBS.md](PGCRON_JOBS.md) for how to enable, disable, or remove pg_cron jobs in the database.

## Install

Your server has **pg_cron** in **linknest_analytics** (`cron.database_name = linknest_analytics`). Jobs must be scheduled from that database, but they can run SQL in **zmonitoring** via `cron.schedule_in_database(..., 'zmonitoring', ...)`.

**Step 1 – Create views in zmonitoring**

```powershell
psql -h localhost -p 5433 -U postgres -d zmonitoring -f monitorv2/pgcron_dashboard_views.sql
```

**Step 2 – Schedule jobs from linknest_analytics** (jobs will run in zmonitoring)

```powershell
psql -h localhost -p 5433 -U postgres -d linknest_analytics -f monitorv2/pgcron_dashboard.sql
```

Or from inside a Docker Postgres container:

```bash
docker exec -i PG-timescale psql -U postgres -d zmonitoring -f - < monitorv2/pgcron_dashboard_views.sql
docker exec -i PG-timescale psql -U postgres -d linknest_analytics -f - < monitorv2/pgcron_dashboard.sql
```

## Verify

- List cron jobs (in **linknest_analytics**):
  ```sql
  SELECT jobid, jobname, schedule, command, database FROM cron.job ORDER BY jobname;
  ```
- Query dashboard summary (in **zmonitoring**):
  ```sql
  SELECT * FROM zmonitoring.v_dashboard_summary;
  ```
- Open the dashboard in the app (logged in):  
  **/api/monitorv2/dashboard** (or your base path + `api/monitorv2/dashboard`).

## Comparison with Python dashboard

| Feature | Python script | pg_cron + PHP dashboard |
|--------|----------------|--------------------------|
| View dashboard | Run `python scripts/monitorv2_dashboard.py`, open http://127.0.0.1:5050 | Open `/api/monitorv2/dashboard` in browser (no Python) |
| Data source | Direct queries to zmonitoring | Same queries; optional views from `pgcron_dashboard.sql` |
| Hourly aggregation | — | pg_cron runs `zmonitoring.aggregate_hourly_stats()` every hour |
| Cleanup old data | — | pg_cron runs `zmonitoring.cleanup_old_data(90, 365)` daily at 02:00 |
| Auth | None (local only) | Uses LinkNest login |

The PHP dashboard uses the same layout and data as the Python one; pg_cron adds the scheduled maintenance that the Python script does not perform.

---

## How to run pg_cron jobs

pg_cron runs **inside PostgreSQL**: you schedule SQL (or calls to functions) and the server runs them on a cron schedule. Jobs run in the database where pg_cron is installed (e.g. **zmonitoring** or **linknest_analytics**).

### Prerequisites

- pg_cron extension installed: `CREATE EXTENSION IF NOT EXISTS pg_cron;` (in the database that is set as `cron.database_name` in postgresql.conf, or in the default cron DB).
- Connect to that database, e.g. `psql -h localhost -p 5433 -U postgres -d zmonitoring`.

### Schedule a job

**1. Simple schedule (returns job id):**

```sql
-- Run every day at 02:00 (minute hour day-of-month month day-of-week)
SELECT cron.schedule(
  '0 2 * * *',                                    -- schedule
  $$DELETE FROM my_table WHERE created_at < now() - interval '30 days'$$  -- command
);
```

**2. Named job (recommended; easy to unschedule):**

```sql
SELECT cron.schedule(
  'my-daily-cleanup',    -- job name
  '0 2 * * *',          -- schedule: 02:00 every day
  $$VACUUM ANALYZE my_table$$
);
```

**3. Run in a different database:**

```sql
SELECT cron.schedule_in_database(
  'job-name',
  '0 3 * * *',           -- 03:00 daily
  $$SELECT some_function()$$,
  'other_database',      -- database to run in
  'postgres',            -- username (optional)
  true                   -- active (optional)
);
```

### Cron schedule syntax

```
 ┌───────────── minute (0–59)
 │ ┌───────────── hour (0–23)
 │ │ ┌───────────── day of month (1–31), or $ for last day
 │ │ │ ┌───────────── month (1–12)
 │ │ │ │ ┌───────────── day of week (0–6, 0=Sunday)
 │ │ │ │ │
 * * * * *
```

Examples:

| Schedule       | Meaning              |
|----------------|----------------------|
| `* * * * *`    | Every minute         |
| `*/5 * * * *`  | Every 5 minutes      |
| `0 * * * *`    | Every hour (on the hour) |
| `0 2 * * *`    | Daily at 02:00       |
| `0 2 * * 0`    | Sundays at 02:00     |
| `0 12 $ * *`   | Last day of month at 12:00 |

You can also use **interval** for “every N seconds” (no other time units in the same job):

```sql
SELECT cron.schedule('every-30-sec', '30 seconds', $$SELECT 1$$);
```

### View and manage jobs

```sql
-- List all jobs
SELECT jobid, jobname, schedule, command, active FROM cron.job ORDER BY jobname;

-- Recent runs (if cron.log_run = on)
SELECT jobid, job_pid, database, command, status, return_message, start_time, end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;

-- Remove a job by name
SELECT cron.unschedule('my-daily-cleanup');

-- Remove by job id
SELECT cron.unschedule(42);

-- Disable a job (keep it, stop running)
SELECT cron.alter_job(42, active := false);
```

### Monitorv2 jobs (from pgcron_dashboard.sql)

After running `monitorv2/pgcron_dashboard.sql` in **linknest_analytics**, these jobs are scheduled:

- **zmonitoring_every_minute** — every minute: inserts into `zmonitoring.cron_trigger`. To run monitor checks and update the dashboard, call the app every minute (see **Run monitor checks every minute** below).
- **zmonitoring_aggregate_hourly** — every hour: `SELECT zmonitoring.aggregate_hourly_stats(...)`
- **zmonitoring_cleanup_old_data** — daily at 02:00: `SELECT * FROM zmonitoring.cleanup_old_data(90, 365)`

---

### Run monitor checks every minute

pg_cron cannot call HTTP from PostgreSQL. The every-minute job inserts a row into `zmonitoring.cron_trigger`; the **app** must be called every minute to process those rows and run the checks.

1. **Token**: Default is `linknest_monitorv2_cron`. Optionally set `monitorv2_cron_token` in LinkNest settings (SQLite `settings` table).

2. **Call the endpoint every minute** (Windows Task Scheduler or cron):

   **PowerShell:**
   ```powershell
   Invoke-WebRequest -Uri "http://localhost/linknest/api/monitorv2/run-scheduled-checks?token=linknest_monitorv2_cron" -Method POST -UseBasicParsing
   ```

   **curl (cron):**
   ```bash
   * * * * * curl -s -X POST "http://localhost/linknest/api/monitorv2/run-scheduled-checks?token=linknest_monitorv2_cron"
   ```

   Replace the URL with your app base URL if different.

3. The endpoint processes pending `cron_trigger` rows, runs monitor checks, updates status, and marks rows processed. The dashboard then shows the latest state.

To reinstall or change jobs, run the SQL script again (it unschedules and reschedules those jobs).
