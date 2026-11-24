# Monitorv2 pg_cron Jobs — Documentation

This document describes the **pg_cron** jobs used by Monitorv2 and how to **enable**, **disable**, and manage them in the database.

---

## Overview

pg_cron runs inside **PostgreSQL** (in the database set by `cron.database_name`, e.g. **linknest_analytics**). Monitorv2 jobs are scheduled there and execute SQL in the **zmonitoring** database via `cron.schedule_in_database(..., 'zmonitoring', ...)`.

| Job name | Schedule | What it does |
|----------|----------|--------------|
| **zmonitoring_every_minute** | `* * * * *` (every minute) | Inserts a row into `zmonitoring.cron_trigger` so the app can run monitor checks when `/api/monitorv2/run-scheduled-checks` is called. |
| **zmonitoring_aggregate_hourly** | `0 * * * *` (every hour) | Aggregates `monitor_checks` into `monitor_hourly_stats` for the previous hour. |
| **zmonitoring_cleanup_old_data** | `0 2 * * *` (daily at 02:00) | Deletes old checks (90 days), notification logs (365 days), and old hourly stats. |

**Prerequisites:** pg_cron installed in **linknest_analytics**; views and `cron_trigger` table in **zmonitoring**. See [README_PGCRON_DASHBOARD.md](README_PGCRON_DASHBOARD.md) for install steps.

---

## Connect to the cron database

All job management is done in the database where pg_cron is installed (e.g. **linknest_analytics**):

```bash
psql -h localhost -p 5433 -U postgres -d linknest_analytics
```

---

## List jobs

```sql
SELECT jobid, jobname, schedule, command, database, active
FROM cron.job
ORDER BY jobname;
```

Example:

| jobid | jobname | schedule | database   | active |
|-------|---------|----------|------------|--------|
| 1     | zmonitoring_aggregate_hourly | 0 * * * * | zmonitoring | t |
| 2     | zmonitoring_cleanup_old_data | 0 2 * * * | zmonitoring | t |
| 3     | zmonitoring_every_minute     | * * * * * | zmonitoring | t |

Use **jobid** or **jobname** in the commands below.

---

## Disable a job (stop it from running)

Disabling keeps the job definition but stops it from running until you enable it again.

**By job name:**

```sql
-- Disable the every-minute job (stops inserting into cron_trigger)
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'zmonitoring_every_minute'),
  active := false
);

-- Disable hourly aggregation
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'zmonitoring_aggregate_hourly'),
  active := false
);

-- Disable daily cleanup
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'zmonitoring_cleanup_old_data'),
  active := false
);
```

**By job id** (e.g. `3`):

```sql
SELECT cron.alter_job(3, active := false);
```

Verify:

```sql
SELECT jobid, jobname, active FROM cron.job ORDER BY jobname;
```

---

## Enable a job (start it again)

**By job name:**

```sql
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'zmonitoring_every_minute'),
  active := true
);
```

**By job id:**

```sql
SELECT cron.alter_job(3, active := true);
```

---

## Disable or enable multiple jobs at once

```sql
-- Disable all Monitorv2 jobs
SELECT cron.alter_job(jobid, active := false)
FROM cron.job
WHERE jobname LIKE 'zmonitoring_%';

-- Enable all Monitorv2 jobs
SELECT cron.alter_job(jobid, active := true)
FROM cron.job
WHERE jobname LIKE 'zmonitoring_%';
```

---

## Remove a job permanently (unschedule)

Removing a job deletes it from `cron.job`. To use it again you must re-run the schedule statement (e.g. from `monitorv2/pgcron_dashboard.sql`).

**By job name:**

```sql
SELECT cron.unschedule('zmonitoring_every_minute');
SELECT cron.unschedule('zmonitoring_aggregate_hourly');
SELECT cron.unschedule('zmonitoring_cleanup_old_data');
```

**By job id:**

```sql
SELECT cron.unschedule(3);
```

To **re-create** jobs after unscheduling, run:

```bash
psql -h localhost -p 5433 -U postgres -d linknest_analytics -f monitorv2/pgcron_dashboard.sql
```

(The script unschedules and re-schedules the Monitorv2 jobs.)

---

## View recent job runs (optional)

If `cron.log_run` is on, you can see recent executions:

```sql
SELECT jobid, jobname, database, status, return_message, start_time, end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;
```

---

## Quick reference

| Action | Command |
|--------|---------|
| List jobs | `SELECT jobid, jobname, schedule, active FROM cron.job;` |
| Disable job by name | `SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'jobname'), active := false);` |
| Enable job by name | `SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'jobname'), active := true);` |
| Disable by id | `SELECT cron.alter_job(JobId, active := false);` |
| Enable by id | `SELECT cron.alter_job(JobId, active := true);` |
| Remove job | `SELECT cron.unschedule('jobname');` or `SELECT cron.unschedule(JobId);` |

---

## See also

- [README_PGCRON_DASHBOARD.md](README_PGCRON_DASHBOARD.md) — Install, views, and **run-scheduled-checks** (calling the app every minute so monitor checks run).
- [pgcron_dashboard.sql](pgcron_dashboard.sql) — SQL that defines and schedules the jobs.
- [pgcron_dashboard_views.sql](pgcron_dashboard_views.sql) — Dashboard views and `cron_trigger` table in zmonitoring.
