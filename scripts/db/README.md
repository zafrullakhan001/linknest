# PostgreSQL Full Backup and Restore Scripts

This directory contains scripts to perform a full backup and restore of all PostgreSQL databases, including roles, groups, and permissions.

## Scripts

1.  **`pg_backup_restore.ps1`** - PowerShell script (Recommended for Windows)
2.  **`pg_backup_restore.py`** - Python script

## Prerequisites

-   **PostgreSQL Client Tools**: The scripts use `pg_dumpall` and `psql`.
    - They automatically check your system `PATH`.
    - If not in PATH, they will automatically look in `C:\Program Files\pgAdmin 4\runtime`.
-   **Permissions**: The user provided must have superuser privileges in PostgreSQL to perform a full backup/restore of all databases.

---

## PowerShell Usage (`pg_backup_restore.ps1`)

### 1. Backup all databases
```powershell
.\pg_backup_restore.ps1 -Action backup -Username postgres -Password "your_password" -Port 5432 -BackupFile "full_backup.sql"
```

### 2. Restore all databases
```powershell
.\pg_backup_restore.ps1 -Action restore -Username postgres -Password "your_password" -Port 5432 -BackupFile "full_backup.sql"
```

---

## Python Usage (`pg_backup_restore.py`)

### 1. Backup all databases
```bash
python pg_backup_restore.py backup --user postgres --password "your_password" --port 5432 --file "full_backup.sql"
```

### 2. Restore all databases
```bash
python pg_backup_restore.py restore --user postgres --password "your_password" --port 5432 --file "full_backup.sql"
```

---

## Important Notes

-   **`pg_dumpall`**: This script uses `pg_dumpall`, which extracts a PostgreSQL database cluster into a script file. This includes all databases in the cluster.
-   **`--clean --if-exists`**: Both scripts are configured to include drop statements in the backup. This ensures that during a restore, existing tables/databases are cleaned up before being recreated.
-   **Security**: The scripts use the `PGPASSWORD` environment variable temporarily during execution to handle authentication without prompting. It is cleared immediately after the command finishes.
-   **Restore Context**: When restoring, the script connects to the `postgres` database to execute the SQL script.

## Troubleshooting

-   **"Command not found"**: Ensure the PostgreSQL `bin` folder is in your Windows environment Path.
-   **Access Denied**: Ensure the user has sufficient permissions in PostgreSQL and that the script has write access to the directory where it's saving the backup.
