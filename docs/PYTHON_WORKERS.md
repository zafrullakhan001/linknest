# Python Workers (Monitoring + Email) for LinkNest

These scripts offload scheduled monitoring and SMTP sending from PHP to Python, preventing the **PHP cron job from freezing** when endpoints or SMTP are slow.

## Files

- `scripts/monitor_runner.py`
  - Checks due monitors concurrently (hard timeouts).
  - Updates SQLite: `monitors`, `monitor_logs`.
  - Queues notifications into SQLite: `email_outbox`.

- `scripts/email_sender.py`
  - Sends queued emails from `email_outbox` using SMTP settings stored in the LinkNest DB (`settings` table).
  - Writes results into `monitor_notification_logs` (so the UI still shows email history).

## Requirements

- Python **3.9+**
- No external Python packages (stdlib only).

## Database

Default DB path (same as PHP): `data/linknest.db`

The scripts ensure the `email_outbox` table exists automatically (and PHP also creates it in `api/config.php`).

## Run manually (Windows)

From the LinkNest project root:

```powershell
python scripts\monitor_runner.py --verbose
python scripts\email_sender.py --verbose
```

If your DB is in a custom location:

```powershell
python scripts\monitor_runner.py --db C:\path\to\linknest.db --verbose
python scripts\email_sender.py --db C:\path\to\linknest.db --verbose
```

## Windows Task Scheduler (recommended)

Create **two scheduled tasks**:

### Task 1: Monitor Runner

- **Program/script**: `python`
- **Arguments**: `scripts\monitor_runner.py --verbose`
- **Start in**: `C:\xampp\htdocs\linknest`
- **Trigger**: every 1 minute (or 2 minutes)

### Task 2: Email Sender

- **Program/script**: `python`
- **Arguments**: `scripts\email_sender.py --limit 25 --smtp-timeout 20 --verbose`
- **Start in**: `C:\xampp\htdocs\linknest`
- **Trigger**: every 1 minute

## Linux cron examples

```bash
* * * * * cd /var/www/linknest && /usr/bin/python3 scripts/monitor_runner.py
* * * * * cd /var/www/linknest && /usr/bin/python3 scripts/email_sender.py --limit 50
```

## Notes / Behavior

- Monitoring checks are executed concurrently, but DB writes are serialized inside one transaction.
- Emails are queued into `email_outbox` and sent separately, so slow SMTP cannot block monitoring.
- Sent email results are stored in `monitor_notification_logs`, matching how LinkNest UI reads email history today.
- `email_sender.py` also follows the “anti-spam” safeguards:
  - obeys global notification pause windows (does not send while paused)
  - re-checks maintenance windows and enabled/active notification rules before sending
  - exponential backoff on failures (prevents rapid retry spam)
  - short-window duplicate suppression to avoid accidental duplicate sends

