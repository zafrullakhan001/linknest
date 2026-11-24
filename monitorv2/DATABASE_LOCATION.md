# Where is the Monitorv2 database and where are the tables stored?

## 1. Where the connection is configured (your “location” settings)

Monitorv2 does **not** store its data in the main LinkNest SQLite file. It uses **PostgreSQL**. The connection details are stored in LinkNest’s SQLite database so the app knows *where* that PostgreSQL server is.

| What | Where it’s stored |
|------|-------------------|
| **Connection settings** | LinkNest SQLite DB, table **`settings`**, keys starting with `monitorv2_` |
| **SQLite file path** | `api/config.php`: **`data/linknest.db`** (relative to project root), i.e. **`c:\xampp\htdocs\linknest\data\linknest.db`** |

Settings keys used for the Monitorv2 PostgreSQL connection:

- `monitorv2_pg_host` — PostgreSQL server host (default: `localhost`)
- `monitorv2_pg_port` — Port (default: `5433`)
- `monitorv2_pg_database` — Database name (default: `zmonitoring`)
- `monitorv2_pg_user` — User (default: `postgres`)
- `monitorv2_pg_password` — Password (stored encrypted when set via Addons UI)

So **“where is my Monitorv2 database?”** in terms of **server and database name** is:

- **Host:** value of `monitorv2_pg_host` (often `localhost`)
- **Port:** value of `monitorv2_pg_port` (often `5433`)
- **Database name:** value of `monitorv2_pg_database` (default **`zmonitoring`**)

---

## 2. Where the tables are stored (PostgreSQL)

All Monitorv2 data lives in **PostgreSQL**, not in SQLite.

| Level | Value |
|-------|--------|
| **Server** | Whatever you set as `monitorv2_pg_host` (e.g. `localhost`) |
| **Port** | Whatever you set as `monitorv2_pg_port` (e.g. `5433`) |
| **Database** | Whatever you set as `monitorv2_pg_database` (default **`zmonitoring`**) |
| **Schema** | **`zmonitoring`** (fixed in code) |
| **Tables** | All under schema **`zmonitoring`** |

Full table names are **`zmonitoring.<table_name>`** inside the database you configured (usually the DB named `zmonitoring`).

Main tables:

- `zmonitoring.monitors` — monitor definitions
- `zmonitoring.monitor_checks` — check results (time-series)
- `zmonitoring.monitor_hourly_stats` — hourly aggregates
- `zmonitoring.monitor_daily_stats` — daily stats
- `zmonitoring.notification_rules` — notification rules
- `zmonitoring.notification_recipients` — rule recipients
- `zmonitoring.notification_logs` — sent notifications
- `zmonitoring.user_monitor_permissions` — who can see which monitor
- `zmonitoring.incidents` — incidents/outages
- `zmonitoring.maintenance_windows` — maintenance windows

Views (if you ran `monitorv2/pgcron_dashboard.sql`):

- `zmonitoring.v_dashboard_summary`
- `zmonitoring.v_dashboard_monitors`
- `zmonitoring.v_dashboard_recent_checks`
- Plus others from `monitorv2/schema.sql` (e.g. `v_monitor_status`, `v_uptime_24h`).

So **“where are the tables stored?”** → In the **PostgreSQL database** you configured (default name **`zmonitoring`**), in the **schema `zmonitoring`**, as listed above.

---

## 3. Where the PostgreSQL data lives on disk (physical location)

This depends on how you run PostgreSQL.

### A. Docker (Timescale/Postgres stack in this repo)

- **Compose files** (e.g. `docker/docker-compose.timescale.yml`, `docker-compose.postgres-full.yml`) map a **named volume** to the container path `/var/lib/postgresql/data`.
- Volume names in the repo: `timescale_data` or `postgres_full_data`.
- **Physical location** is managed by Docker, typically under Docker’s volume directory, e.g.:
  - **Windows (Docker Desktop):** `\\wsl$\docker-desktop-data\data\docker\volumes\<project>_timescale_data\_data` or similar (or the Windows path Docker uses for WSL2).
  - **Linux:** `/var/lib/docker/volumes/<project>_timescale_data/_data` (or your compose project name).
- To see your volume path:
  ```bash
  docker volume inspect <project>_timescale_data
  ```
  or
  ```bash
  docker volume inspect postgres_full_data
  ```
  depending on which compose you use.

So with Docker, **Monitorv2 tables are stored** in that volume’s PostgreSQL data directory (the DB named `zmonitoring` is inside that same data dir).

### B. Local PostgreSQL (XAMPP or standalone install)

- The **data directory** is set when you install/configure PostgreSQL (e.g. `C:\Program Files\PostgreSQL\16\data` or similar on Windows).
- The database **`zmonitoring`** is a directory under that data directory; the **`zmonitoring`** schema and its tables are stored in that database’s files.

---

## 4. Quick reference

| Question | Answer |
|----------|--------|
| Where are connection settings for Monitorv2? | SQLite: **`data/linknest.db`**, table **`settings`**, keys **`monitorv2_pg_*`** |
| Which PostgreSQL database? | Setting **`monitorv2_pg_database`** (default **`zmonitoring`**) |
| Which schema? | **`zmonitoring`** |
| Full table names? | **`zmonitoring.monitors`**, **`zmonitoring.monitor_checks`**, etc. |
| Default host/port? | **localhost** : **5433** |
| Where on disk (Docker)? | Docker volume (e.g. `timescale_data` / `postgres_full_data`) → PostgreSQL data dir |
| Where on disk (local PG)? | PostgreSQL data directory of your install |

To see your **current** connection from the app, check the Addons → Monitorv2 configuration in the UI, or query:

```sql
-- In data/linknest.db (SQLite)
SELECT key, value FROM settings WHERE key LIKE 'monitorv2_pg_%';
```
