# PostgreSQL Full Stack (PG-full) — All Extensions

Single Docker container with **PostgreSQL 18** and these extensions:

| Extension | Docs | Notes |
|-----------|------|--------|
| **pg_cron** | [pg_cron](https://github.com/citusdata/pg_cron) | Scheduled SQL jobs; must be in `shared_preload_libraries`. |
| **pg_stat_statements** | [PostgreSQL pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html) | Tracks SQL planning/execution statistics. |
| **PostGIS** | [PostGIS](https://postgis.net/documentation/) | Spatial and geographic objects. |
| **postgres_fdw** | [postgres_fdw](https://www.postgresql.org/docs/current/postgres-fdw.html) | Foreign data wrapper to other PostgreSQL servers. |
| **intarray** | [intarray](https://www.postgresql.org/docs/current/intarray.html) | Integer array operators and functions. |
| **TimescaleDB** | [TimescaleDB](https://docs.timescale.com/) | Time-series data (from base image). |

**ZomboDB** is **not** included in this image:

- [ZomboDB](https://github.com/zombodb/zombodb/wiki) is **archived** (Sept 2025) and only supports PostgreSQL **10–13**.
- It also requires **Elasticsearch** as a separate service.
- For full-text search with PG 18, use built-in `tsvector`/`tsquery` or consider a separate PG 13 + ZomboDB + Elasticsearch stack if you specifically need ZomboDB.

---

## Documentation index

| Section | Description |
|--------|-------------|
| [Default connection details](#default-connection-details) | Host, port, user, password, database |
| [Docker: Start and stop](#docker-start-and-stop) | Start, stop, down, down with data removal |
| [Docker: Recreate container](#docker-recreate-container) | Recreate, rebuild, fresh data |
| [Docker: Use a different port](#docker-use-a-different-port) | Env variable, edit compose, override file |
| [Docker: Other useful commands](#docker-other-useful-commands) | Logs, status, exec, restart |
| [Quick start](#quick-start-first-time) | First-time build and run |
| [Verify extensions](#verify-extensions) | List and test extensions |

---

## Default connection details

| Setting | Default |
|--------|--------|
| **Host** | `localhost` |
| **Port** | `5434` (host) → `5432` (container) |
| **User** | `postgres` |
| **Password** | `postgres` |
| **Database** | `linknest_analytics` |

**Important:** All extensions (including **pg_cron**) are created in **`linknest_analytics`**. If you connect without `-d`, you get the default database **`postgres`**, which has all extensions *except* pg_cron (pg_cron can only live in the database set in `cron.database_name`). Always use **`-d linknest_analytics`** for the full set, or use database `postgres` if you don’t need pg_cron.

---

**pg_cron in another database (e.g. zmonitoring):** Only one database can be the cron database. To use pg_cron in **zmonitoring**, set `PG_CRON_DATABASE=zmonitoring` (in `.env` or in your shell), then recreate the container: `docker compose -f docker/docker-compose.postgres-full.yml up -d --force-recreate`. After that, run the onboard-extensions script for zmonitoring so `CREATE EXTENSION pg_cron` runs there.

---

## Docker: Start and stop

All commands below are run from the **project root** (`linknest/`). Use the compose file path that matches your setup.

### Start the container

**PowerShell (Windows):**
```powershell
cd c:\xampp\htdocs\linknest
docker compose -f docker/docker-compose.postgres-full.yml up -d
```

**Bash (Linux/macOS):**
```bash
cd /path/to/linknest
docker compose -f docker/docker-compose.postgres-full.yml up -d
```

- `-d` runs the container in the background (detached).
- Omit `-d` to see logs in the foreground (Ctrl+C stops the container).

### Stop the container

**PowerShell:**
```powershell
docker compose -f docker/docker-compose.postgres-full.yml stop
```

**Bash:**
```bash
docker compose -f docker/docker-compose.postgres-full.yml stop
```

- This stops the container but **keeps** the container and its data volume. Use **Start** again to bring it back.

### Stop and remove the container (keep data)

**PowerShell:**
```powershell
docker compose -f docker/docker-compose.postgres-full.yml down
```

**Bash:**
```bash
docker compose -f docker/docker-compose.postgres-full.yml down
```

- Removes the container and network. The **volume** `postgres_full_data` is kept, so your database data remains. Next `up -d` will reuse it.

### Stop and remove the container and data

**PowerShell:**
```powershell
docker compose -f docker/docker-compose.postgres-full.yml down -v
```

**Bash:**
```bash
docker compose -f docker/docker-compose.postgres-full.yml down -v
```

- `-v` also removes the named volume(s). **All data in the database is deleted.** Use only when you want a clean slate.

---

## Docker: Recreate container

### Recreate with same image (e.g. after config change)

Useful if you changed the compose file (e.g. port, env) and want a new container with the same image and **same data**:

**PowerShell:**
```powershell
docker compose -f docker/docker-compose.postgres-full.yml up -d --force-recreate
```

**Bash:**
```bash
docker compose -f docker/docker-compose.postgres-full.yml up -d --force-recreate
```

- Stops and removes the existing container, then creates a new one using the same volume (data preserved).

### Rebuild image and recreate container

Use after changing `Dockerfile.postgres-full` or to pull in base image updates:

**PowerShell:**
```powershell
docker compose -f docker/docker-compose.postgres-full.yml build --no-cache
docker compose -f docker/docker-compose.postgres-full.yml up -d --force-recreate
```

**Bash:**
```bash
docker compose -f docker/docker-compose.postgres-full.yml build --no-cache
docker compose -f docker/docker-compose.postgres-full.yml up -d --force-recreate
```

- Data in the volume is kept unless you also run `down -v`.

### Recreate with fresh data (new volume)

To start over with an empty database (init scripts will run again):

**PowerShell:**
```powershell
docker compose -f docker/docker-compose.postgres-full.yml down -v
docker compose -f docker/docker-compose.postgres-full.yml up -d
```

**Bash:**
```bash
docker compose -f docker/docker-compose.postgres-full.yml down -v
docker compose -f docker/docker-compose.postgres-full.yml up -d
```

---

## Docker: Use a different port

The default host port is **5434**. To use another port (e.g. **5440**), use one of these approaches.

### Option A: Environment variable (recommended)

The compose file uses `PG_FULL_HOST_PORT` (default `5434`). Set it before starting:

**PowerShell (one-off, port 5440):**
```powershell
$env:PG_FULL_HOST_PORT = "5440"
docker compose -f docker/docker-compose.postgres-full.yml up -d
```

**Bash (one-off, port 5440):**
```bash
PG_FULL_HOST_PORT=5440 docker compose -f docker/docker-compose.postgres-full.yml up -d
```

**Persist:** Create a `.env` file in the **project root** (where you run `docker compose`):

```
PG_FULL_HOST_PORT=5440
```

Compose loads `.env` automatically. Then run `up -d` as usual; for stop/down/recreate use the same compose command and the same port will apply.

Connect using the new port:
```powershell
psql -h localhost -p 5440 -U postgres -d linknest_analytics
```

### Option B: Edit the compose file

1. Open `docker/docker-compose.postgres-full.yml`.
2. Under `services.PG-full.ports`, change the host port:

   **Before:**
   ```yaml
   ports:
     - "5434:5432"
   ```

   **After (e.g. port 5440):**
   ```yaml
   ports:
     - "5440:5432"
   ```

3. Recreate the container so the new port is applied:

   ```powershell
   docker compose -f docker/docker-compose.postgres-full.yml up -d --force-recreate
   ```

4. Connect using the new port:

   ```powershell
   psql -h localhost -p 5440 -U postgres -d linknest_analytics
   ```

### Option C: Override file (different port without editing main compose)

1. Create `docker/docker-compose.postgres-full.override.yml`:

   **File `docker/docker-compose.postgres-full.override.yml`:**
   ```yaml
   services:
     PG-full:
       ports:
         - "5440:5432"
   ```

2. From the project root, run:

   ```powershell
   docker compose -f docker/docker-compose.postgres-full.yml -f docker/docker-compose.postgres-full.override.yml up -d
   ```

   Compose merges the override with the main file. For stop/down/recreate, use the same two `-f` arguments:

   ```powershell
   docker compose -f docker/docker-compose.postgres-full.yml -f docker/docker-compose.postgres-full.override.yml down
   docker compose -f docker/docker-compose.postgres-full.yml -f docker/docker-compose.postgres-full.override.yml up -d
   ```

3. Connect:

   ```powershell
   psql -h localhost -p 5440 -U postgres -d linknest_analytics
   ```

To make the override file work with a **single** `-f` that points to the main file, you can rely on Compose’s automatic loading of `docker-compose.override.yml` only if that file lives next to the main one and you run compose from the `docker/` directory. Since the main file is `docker-compose.postgres-full.yml`, the override is named `docker-compose.postgres-full.override.yml` in the same directory; you must pass both `-f` paths explicitly when running from the project root.

---

## Docker: Other useful commands

| Action | Command (from project root) |
|--------|-----------------------------|
| **View logs** | `docker compose -f docker/docker-compose.postgres-full.yml logs -f PG-full` |
| **Check status** | `docker compose -f docker/docker-compose.postgres-full.yml ps` |
| **Shell in container** | `docker exec -it PG-full sh` |
| **psql in container** | `docker exec -it PG-full psql -U postgres -d linknest_analytics` |
| **Restart container** | `docker compose -f docker/docker-compose.postgres-full.yml restart PG-full` |

---

## Quick start (first time)

From the **project root**:

**PowerShell:**
```powershell
docker compose -f docker/docker-compose.postgres-full.yml build
docker compose -f docker/docker-compose.postgres-full.yml up -d
```

**Bash:**
```bash
docker compose -f docker/docker-compose.postgres-full.yml build
docker compose -f docker/docker-compose.postgres-full.yml up -d
```

Connect (default port 5434):

```powershell
psql -h localhost -p 5434 -U postgres -d linknest_analytics
```

```bash
psql -h localhost -p 5434 -U postgres -d linknest_analytics
```

On first run, the init script creates all extensions. To verify:

```sql
SELECT extname FROM pg_extension ORDER BY extname;
```

---

## Verify extensions

```bash
psql -h localhost -p 5434 -U postgres -d linknest_analytics -c "
  SELECT extname, extversion FROM pg_extension ORDER BY extname;
"
```

- **pg_cron:** `SELECT * FROM cron.job;`
- **pg_stat_statements:** `SELECT * FROM pg_stat_statements LIMIT 5;` (after some queries)
- **PostGIS:** `SELECT PostGIS_Version();`
- **TimescaleDB:** `SELECT default_version FROM pg_available_extensions WHERE name = 'timescaledb';`

---

## Optional: ZomboDB (PG 13 + Elasticsearch)

To use ZomboDB you need:

1. PostgreSQL **13** (ZomboDB does not support PG 18).
2. A separate **Elasticsearch** service.
3. A custom image or a pre-built image such as [postgresql_zombodb_docker](https://github.com/seandavi/postgresql_zombodb_docker).

This repo does not provide a ZomboDB image; use one of the community images or build from ZomboDB’s docs and run it as a separate container (e.g. on another port).
