# Monitorv2 Dashboard (Python)

Web dashboard for the **Monitorv2 addon** using the **zmonitoring** PostgreSQL database. It connects to your Postgres instance (default port **5433**) and shows monitor status, recent checks, and summary stats.

**Same dashboard via pg_cron (no Python):** You can get the same dashboard and scheduled maintenance using the **pg_cron** extension and the app’s PHP endpoint. See **monitorv2/README_PGCRON_DASHBOARD.md** and run **monitorv2/pgcron_dashboard.sql** in the zmonitoring database; then open **/api/monitorv2/dashboard** in the app.

## Requirements

- Python 3.9+
- PostgreSQL with the **zmonitoring** database and schema (Monitorv2 addon setup)
- Optional Python deps: `psycopg2-binary`, `flask`

## Setup

1. Ensure the Monitorv2 addon is configured in LinkNest and the **zmonitoring** database is created and schema applied (via Admin → Addons → Monitorv2 → Setup schema).

2. Install Python dependencies:

   ```bash
   pip install -r scripts/requirements-monitorv2-dashboard.txt
   ```

   Or:

   ```bash
   pip install psycopg2-binary flask
   ```

## Usage

From the project root:

```bash
python scripts/monitorv2_dashboard.py
```

- Dashboard opens at **http://127.0.0.1:5050** (browser opens automatically).
- Default DB: **localhost:5433**, database **zmonitoring**, user **postgres**, password **postgres**.

### Options

| Option           | Default    | Description              |
|------------------|------------|--------------------------|
| `--host`         | localhost  | PostgreSQL host          |
| `--port`         | 5433       | PostgreSQL port          |
| `--db`           | zmonitoring| Database name            |
| `--user`         | postgres   | Database user            |
| `--password`     | postgres   | Database password        |
| `--bind`         | 127.0.0.1  | HTTP bind address        |
| `--port-http`    | 5050       | HTTP server port         |
| `--no-browser`   | —          | Do not open a browser    |

### Environment variables

You can override defaults without passing CLI args:

- `ZMONITORING_HOST` — PostgreSQL host
- `ZMONITORING_PORT` — PostgreSQL port (e.g. 5433)
- `ZMONITORING_DB` — Database name (zmonitoring)
- `ZMONITORING_USER` — Database user (postgres)
- `ZMONITORING_PASSWORD` — Database password (use this in production instead of default)

Example (Windows PowerShell):

```powershell
$env:ZMONITORING_PASSWORD = "postgress"
python scripts/monitorv2_dashboard.py
```

Example (Linux/macOS):

```bash
export ZMONITORING_PASSWORD=postgress
python scripts/monitorv2_dashboard.py
```

## What the dashboard shows

- **Summary**: Total monitors, Up/Down/Warning counts, checks in last 24 hours.
- **Monitors table**: Name, type, target, current status, response time, uptime %, last checked.
- **Recent checks**: Latest check results with monitor name, status, response time, and time.

Data is read from `zmonitoring.monitors` and `zmonitoring.monitor_checks`; no data is modified.
