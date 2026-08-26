# Cloned Instance Scheduling (Python Workers) — Windows + Linux + Docker

This guide explains how to ensure the **Python workers** run for a **newly cloned LinkNest instance**:

- `scripts/monitor_runner.py` (updates monitor status + logs; queues emails into `email_outbox`)
- `scripts/email_sender.py` (sends queued emails from `email_outbox`)

There are **two supported approaches**:

- **Option A (Host Scheduling)**: Run the workers on the host OS (Windows Task Scheduler or Linux cron).
- **Option B (Docker Scheduling)**: Run the workers inside a dedicated Docker container/stack for the clone (recommended for Docker deployments).

> **Important**: Cloning the application folder does **not** automatically create a new Docker container, cron job, or scheduled task. You must set it up per-clone.

---

## Option A — Host Scheduling (Windows / Linux)

### Prerequisites

- A cloned LinkNest folder exists (example paths below).
- Python **3.9+** installed on the host.
- The clone has its own DB:
  - Default: `<CLONE_ROOT>/data/linknest.db`
- The clone is accessible via web server (XAMPP/Apache/Nginx), but **workers do not require web server**; they only require DB access.

### What this option does

- Your OS scheduler runs:
  - `monitor_runner.py` every minute (or your chosen cadence)
  - `email_sender.py` every minute (or your chosen cadence)
- The scripts read/write the clone’s DB file directly, so they affect **only that clone**.

---

## Windows — Task Scheduler (recommended on Windows)

### Quick install (this repo)

From the clone (or main) root:

```powershell
.\scripts\schedule-monitor-workers.ps1
# every 2 minutes:
.\scripts\schedule-monitor-workers.ps1 -IntervalMinutes 2
# point at a clone DB:
.\scripts\schedule-monitor-workers.ps1 -Root "C:\xampp\htdocs\linknest_clone" -DbPath "C:\xampp\htdocs\linknest_clone\data\linknest.db"
```

Double-click alternative: `scripts\schedule-monitor-workers.bat`

### Choose your clone path

Example clone:

- **Clone root**: `C:\xampp\htdocs\linknest_clone`
- **DB path**: `C:\xampp\htdocs\linknest_clone\data\linknest.db`

> If your clone uses a different folder name, update the paths accordingly.

### Confirm Python works

Open PowerShell:

```powershell
python --version
python -c "import sys; print(sys.executable)"
```

If `python` is not found, use the full Python path in Task Scheduler (example: `C:\Python311\python.exe`).

---

### Task 1: Monitor Runner

1. Open **Task Scheduler**
2. Click **Create Task** (not “Create Basic Task”)

**General tab**
- **Name**: `LinkNest Clone - Monitor Runner`
- **Run whether user is logged on or not**: enabled
- **Run with highest privileges**: optional (usually not needed)

**Triggers tab**
- New…
  - Begin the task: **On a schedule**
  - Settings: **Daily**
  - Advanced settings:
    - **Repeat task every**: `1 minute`
    - **for a duration of**: `Indefinitely`
    - **Enabled**: checked

**Actions tab**
- New…
  - Action: **Start a program**
  - **Program/script**: `python` (or full path to python exe)
  - **Add arguments**:

```text
scripts\monitor_runner.py --db "C:\xampp\htdocs\linknest_clone\data\linknest.db"
```

  - **Start in**:

```text
C:\xampp\htdocs\linknest_clone
```

**Settings tab**
- **If the task is already running**: `Do not start a new instance`
- Optional: **Stop the task if it runs longer than**: `5 minutes`

---

### Task 2: Email Sender

Create another task using the same structure, but:

**General tab**
- **Name**: `LinkNest Clone - Email Sender`

**Actions tab**
- **Program/script**: `python` (or full path)
- **Add arguments**:

```text
scripts\email_sender.py --db "C:\xampp\htdocs\linknest_clone\data\linknest.db" --limit 50 --smtp-timeout 20
```

- **Start in**:

```text
C:\xampp\htdocs\linknest_clone
```

**Settings tab**
- **If the task is already running**: `Do not start a new instance`

---

### Windows verification

Run these manually in PowerShell from the clone root:

```powershell
cd C:\xampp\htdocs\linknest_clone
python scripts\monitor_runner.py --db .\data\linknest.db --verbose
python scripts\email_sender.py --db .\data\linknest.db --limit 5 --smtp-timeout 20 --verbose
```

Expected:
- `monitor_runner.py` prints `[INFO] active=... due=...` and ends with `[DONE] checked=...`
- `email_sender.py` prints `[INFO] pending=...` and `[SEND] ...` lines (or `notifications paused` if you enabled email pause)

---

## Linux — cron (simple + reliable)

### Choose your clone path

Example clone:

- **Clone root**: `/var/www/linknest-clone`
- **DB path**: `/var/www/linknest-clone/data/linknest.db`

### Confirm Python works

```bash
python3 --version
which python3
```

### Add cron entries

Edit the user crontab:

```bash
crontab -e
```

Add these lines:

```cron
* * * * * cd /var/www/linknest-clone && /usr/bin/python3 scripts/monitor_runner.py --db /var/www/linknest-clone/data/linknest.db >/dev/null 2>&1
* * * * * cd /var/www/linknest-clone && /usr/bin/python3 scripts/email_sender.py --db /var/www/linknest-clone/data/linknest.db --limit 50 --smtp-timeout 20 >/dev/null 2>&1
```

> Adjust `/usr/bin/python3` to the output of `which python3` if needed.

### Linux verification

Run manually:

```bash
cd /var/www/linknest-clone
python3 scripts/monitor_runner.py --db ./data/linknest.db --verbose
python3 scripts/email_sender.py --db ./data/linknest.db --limit 5 --smtp-timeout 20 --verbose
```

---

## Option B — Docker Scheduling (recommended for Docker deployments)

### Why this is different

In Docker, the workers run because the container entrypoint (`docker/linknest-entrypoint.sh`) starts a background loop that executes:

- `python3 /var/www/html/scripts/monitor_runner.py ...`
- `python3 /var/www/html/scripts/email_sender.py ...`

**Cloning the app folder does not create a new Docker stack**, so:

- If you want the clone to be a separate Docker “instance”, you must run a **separate compose project/container** for it.

---

## Docker approach (recommended): separate compose project per clone

### Goal

Run a separate container for the clone that:

- mounts the clone folder into `/var/www/html`
- has its own DB volume or uses the clone DB file in that folder
- uses a different host port (so both instances can run at once)

### Quick checklist

- Copy `docker/docker-compose.yml` to a new file for the clone (example: `docker/docker-compose.clone.yml`)
- Change:
  - host ports (e.g., `8081:80` instead of `8080:80`)
  - container names (optional but recommended)
  - volume mount source to your clone folder
  - `LINKNEST_DB_PATH` if needed

### Example: create a clone compose file

1. Copy the compose file

```bash
cp docker/docker-compose.yml docker/docker-compose.clone.yml
```

2. Edit `docker/docker-compose.clone.yml`

Typical changes:

- **Ports**: make sure clone uses a different host port
  - Example: `8081:80`
- **Volumes**: mount the clone folder (host) to `/var/www/html`
  - Example: `/path/to/linknest-clone:/var/www/html`
- **Environment**:
  - `LINKNEST_WORKERS_ENABLED=1`
  - `LINKNEST_DB_PATH=/var/www/html/data/linknest.db` (default)

### Start the clone stack

From the clone folder (or project root):

```bash
docker compose -f docker/docker-compose.clone.yml up -d --build
```

### Verify workers are running inside the clone container

1. Check container logs:

```bash
docker compose -f docker/docker-compose.clone.yml logs --tail=200
```

2. You should see lines like:
- `[WORKER] LinkNest workers enabled=...`

3. Optional: exec into the container and run once:

```bash
docker compose -f docker/docker-compose.clone.yml exec -T linknest python3 /var/www/html/scripts/monitor_runner.py --db /var/www/html/data/linknest.db --verbose
docker compose -f docker/docker-compose.clone.yml exec -T linknest python3 /var/www/html/scripts/email_sender.py --db /var/www/html/data/linknest.db --limit 5 --verbose
```

> Note: The service name might not be `linknest` if you rename it in the clone compose file.

---

## Troubleshooting

### 1) “Emails paused” but monitors should still update

- If you enabled **Email Notifications Paused**, the UI should still show monitor status updates.
- When paused:
  - `monitor_runner.py` continues updating `monitors` + `monitor_logs`
  - Email queueing/sending is suppressed

### 2) DB path mistakes (most common)

Symptoms:
- Clone UI loads but monitoring never updates
- `monitor_runner.py` reports “DB not found” or always shows `due=0`

Fix:
- Confirm the scheduled task/cron uses the clone DB path:
  - Windows: `--db "C:\...\linknest_clone\data\linknest.db"`
  - Linux: `--db /var/www/.../linknest-clone/data/linknest.db`

### 3) Permissions

- The user running the scheduled job must have read/write permissions to:
  - the clone DB file
  - the clone folder (for relative paths and logs)

### 4) Too many concurrent tasks / overlap

- Windows Task Scheduler: set **“Do not start a new instance”**
- If checks take longer than your interval, reduce load:
  - set `--max-workers` lower (e.g., `--max-workers 5`)
  - schedule every 2 minutes

### 5) SMTP failures / retries

- Email sender uses retry + backoff; check `monitor_notification_logs` and `email_outbox.last_error`

---

## Recommended defaults (per clone)

- `monitor_runner.py`: every **1 minute**, `--max-workers 10`
- `email_sender.py`: every **1 minute**, `--limit 25–50`, `--smtp-timeout 20`

If you run multiple clones on one host, reduce concurrency per clone to avoid CPU/network saturation.

