# PostgreSQL Backup & Restore Guide

This guide covers the usage of the PowerShell script designed for robust PostgreSQL database management on Windows, specifically optimized for the LinkNest project and its TimescaleDB requirements.

## 📄 Script Location
`c:\xampp\htdocs\linknest\scripts\db\pg_backup_restore.ps1`

---

## 🚀 Key Features

*   **Interactive Mode**: Run the script without arguments to be guided through options.
*   **Dual Formats**: Supports standard **SQL (.sql)** for human readability and **Binary Custom (.dump)** for robust, professional backups (recommended for TimescaleDB).
*   **Smart Path Detection**: Automatically finds PostgreSQL tools (`pg_dump`, `psql`, etc.) in System PATH or your `pgAdmin 4` installation directory.
*   **TimescaleDB Optimized**: Automatically handles "pre-restore" and "post-restore" maintenance modes to avoid hypertable errors.
*   **Fresh Restore Mode**: Optional "Y/N" prompt to Drop and Recreate the target database before restoring for a perfectly clean slate.
*   **Auto-Timestamping**: Generates unique filenames based on the date and time to prevent accidental overwrites.

---

## 🛠️ Usage Examples

### 1. Interactive Mode (Easiest)
Simply run the script. It will ask you for all necessary information (Action, Credentials, Database, Format).
```powershell
.\scripts\db\pg_backup_restore.ps1
```

### 2. Backup One or More Databases
You can specify a single database or a comma-separated list.
```powershell
# Standard SQL backup for multiple databases
.\scripts\db\pg_backup_restore.ps1 -Action backup -Database "zmonitoring,postgres,analytics" -Username postgres -Password YOUR_PASS -Port 5433

# Custom Binary backup (Highly Recommended for TimescaleDB)
.\scripts\db\pg_backup_restore.ps1 -Action backup -Database zmonitoring -Format custom -Username postgres -Password YOUR_PASS -Port 5433
```

### 3. Backup Everything (Full Cluster)
Backs up all databases, roles, and global settings.
```powershell
.\scripts\db\pg_backup_restore.ps1 -Action backup -Username postgres -Password YOUR_PASS -Port 5433
```

### 4. Restoration
The script automatically detects if you are restoring a `.sql` or `.dump` file and uses the correct tool.

**Recommended: Fresh Restore into a specific database**
```powershell
.\scripts\db\pg_backup_restore.ps1 -Action restore -BackupFile "backup_zmonitoring_2026-01-30_065035.dump" -Database zmonitoring -Username postgres -Password YOUR_PASS -Port 5433
```
*Note: Type 'Y' when asked for "FRESH restore" to ensure all TimescaleDB hypertables are recreated correctly.*

---

## 🔍 Technical Details

### Backup Formats
1.  **SQL (Plain Text)**: Useful for version control or manual inspection. Uses `pg_dump`. 
2.  **Custom (Binary / -Fc)**: Comprehensive full dump. Satisfies the warning about "circular foreign-key constraints." Uses `pg_dump -Fc`. This is the industry-standard format for production restores.

### Security
*   The script masks password input when in interactive mode.
*   Passwords provided via arguments are temporarily stored in the current session's `PGPASSWORD` environment variable and cleared immediately after the operation finishes.

### TimescaleDB Handling
When restoring to a database other than `postgres`, the script performs the following sequence:
1.  Drops/Creates database (if Fresh Restore is selected).
2.  Executes `SELECT public.timescaledb_pre_restore();`.
3.  Sanitizes SQL files by commenting out `\restrict` and `CREATE EXTENSION` commands to prevent tool-version conflicts.
4.  Imports data using `psql` or `pg_restore`.
5.  Executes `SELECT public.timescaledb_post_restore();`.

---

## ⚠️ Troubleshooting

**1. Authentication Failed**
*   Ensure your password is correct.
*   Ensure the port is correct (LinkNest defaults to `5433`).

**2. Tool Not Found**
*   The script looks for tools in `C:\Program Files\pgAdmin 4\runtime`. If you installed pgAdmin elsewhere, you may need to add its runtime path to your system's PATH.

**3. Hypertable Restore Errors**
*   Always use the **Fresh Restore (Y)** option.
*   Use the **Custom (-Fc)** format for backups, as it handles table relationships better than raw SQL.
