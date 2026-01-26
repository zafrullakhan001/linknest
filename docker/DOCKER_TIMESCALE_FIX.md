# Fix: PG-timescale "invalid value for parameter log_timezone: LOCAL"

## What’s wrong

PostgreSQL 18 does not accept `"LOCAL"` for `log_timezone` or `TimeZone`. If the database was initialized with those set to `LOCAL` (e.g. by an older image or a bad default), the server fails with:

- `invalid value for parameter "log_timezone": "LOCAL"`
- `invalid value for parameter "TimeZone": "LOCAL"`
- `FATAL: configuration file ".../postgresql.conf" contains errors`

---

## Fix without destroying container or data (recovery script)

**Use this if you have not backed up the database and must keep the same container and volume.**

1. Open PowerShell and go to the project folder:
   ```powershell
   cd c:\xampp\htdocs\linknest
   ```
2. Run the recovery script:
   ```powershell
   .\docker\fix-timescale-timezone.ps1
   ```
   The script will:
   - Find your **PG-timescale** container and its data volume
   - **Stop** the container (it does **not** remove it or the volume)
   - Start a short-lived container that mounts the same volume and edits `postgresql.conf` (replaces `LOCAL` with `UTC`)
   - **Start** your **PG-timescale** container again
3. Check that PostgreSQL is running:
   ```powershell
   docker logs -f PG-timescale
   ```

Your database and container are unchanged; only the timezone settings in the config file are fixed.

---

## Fix: use the override Compose (new setup or if recovery script is not enough)

Use the provided Compose file, which forces valid timezone settings via the server command:

```powershell
cd c:\xampp\htdocs\linknest
docker compose -f docker/docker-compose.timescale.yml up -d
```

This starts the **PG-timescale** container with:

- `-c log_timezone=UTC -c TimeZone=UTC` so the invalid values in `postgresql.conf` are overridden and the server can start.
- Same data volume is used if you already had one; no need to delete data.

Check that it’s running:

```powershell
docker compose -f docker/docker-compose.timescale.yml ps
docker compose -f docker/docker-compose.timescale.yml logs -f PG-timescale
```

## Fix: existing container not using Compose

If you run the container by hand (e.g. from Docker Desktop or `docker run`) and don’t want to switch to Compose yet:

1. Stop the existing **PG-timescale** container.
2. Start it again with the same image and volume, but override the config on the command line.

Example (adjust image tag and volume name to match yours):

```powershell
docker run -d `
  --name PG-timescale `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=linknest_analytics `
  -p 5433:5432 `
  -v timescale_data:/var/lib/postgresql/data `
  timescale/timescaledb:latest-pg18 `
  postgres -c log_timezone=UTC -c TimeZone=UTC
```

If the container already exists, you can instead **change the command** in Docker Desktop (duplicate/edit the container) so the postgres process is started with:

`postgres -c log_timezone=UTC -c TimeZone=UTC`

Then start the (new or updated) container.

## If you use Docker Desktop

1. Stop the **PG-timescale** container.
2. Either:
   - **Option A:** From the project folder run:  
     `docker compose -f docker/docker-compose.timescale.yml up -d`  
     (remove or rename the old PG-timescale container in Docker Desktop if the name conflicts), or  
   - **Option B:** Edit the existing container:
     - “Duplicate / Edit” the container.
     - Set the **Command** to:  
       `postgres -c log_timezone=UTC -c TimeZone=UTC`
     - Save and start the container.

After this, the PG-timescale container should start without the `log_timezone` / `TimeZone` error.
