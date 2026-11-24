# SQLite Database Backup and Restore

This directory contains scripts for exporting and importing SQLite database backups in JSON format.

## Files

- `export_database.php` - Exports all database objects to JSON files
- `import_database.php` - Imports JSON files into an empty SQLite database

## Export Script

### Usage

```bash
# Export default database to default location (data/backups/export_YYYY-MM-DD_HHMMSS/)
php scripts/export_database.php

# Export default database to custom directory
php scripts/export_database.php /path/to/backup/directory

# Export custom database file to default location
php scripts/export_database.php /path/to/database.db

# Export custom database file to custom directory
php scripts/export_database.php /path/to/database.db /path/to/backup/directory
```

### Arguments

1. **database_path** (optional) - Path to the SQLite database file to export
   - If not provided, uses default: `data/linknest.db`
   - If the first argument is a file (`.db`, `.sqlite`, `.sqlite3`), it's treated as the database path
   - If the first argument is a directory, it's treated as the output directory

2. **output_directory** (optional) - Directory where export files will be saved
   - If not provided, creates: `data/backups/export_YYYY-MM-DD_HHMMSS/`
   - If only one argument is provided and it's a directory, uses it as output directory
   - If database path is specified, this becomes the second argument

### What it exports

The export script creates the following JSON files:

1. **metadata.json** - Export information (timestamp, database path, versions, etc.)
2. **schema.json** - Complete database schema:
   - Table structures (CREATE TABLE statements)
   - Column definitions
   - Indexes (CREATE INDEX statements)
   - Triggers (CREATE TRIGGER statements)
3. **data.json** - All table data in JSON format
4. **pragmas.json** - SQLite PRAGMA settings (journal mode, cache size, etc.)
5. **summary.json** - Export summary with statistics

### Example Output

```
Connected to database: C:\xampp\htdocs\linknest\data\linknest.db
Exporting to: C:\xampp\htdocs\linknest\data\backups\export_2025-01-15_143022

✓ Exported metadata
✓ Exported schema (tables, indexes, triggers)
✓ Exported table 'users': 5 rows
✓ Exported table 'tiles': 12 rows
✓ Exported table 'links': 45 rows
...
✓ Exported data: 62 total rows across 15 tables
✓ Exported PRAGMA settings

========================================
Export completed successfully!
========================================
```

## Import Script

### Usage

```bash
# Import from latest export (auto-detects latest in data/backups/)
php scripts/import_database.php

# Import from specific directory
php scripts/import_database.php /path/to/backup/directory

# Import to custom database file
php scripts/import_database.php /path/to/backup/directory /path/to/target.db
```

### Important Warnings

⚠️ **WARNING**: The import script will **DELETE** all existing data in the target database!

- The target database file will be completely removed and recreated
- Make sure you have a backup before importing
- The script will prompt for confirmation before proceeding

### What it imports

1. **Database Schema** - All tables, indexes, and triggers
2. **Table Data** - All rows from all tables
3. **PRAGMA Settings** - SQLite configuration settings
4. **Preserves Structure** - Maintains table relationships and constraints

### Example Output

```
Loading export files from: C:\xampp\htdocs\linknest\data\backups\export_2025-01-15_143022
✓ Loaded export files
  Export date: 2025-01-15 14:30:22
  Database version: 1.0

WARNING: This will DELETE all existing data in the target database!
Target database: C:\xampp\htdocs\linknest\data\linknest.db

Press Enter to continue, or Ctrl+C to cancel...

✓ Removed existing database file
✓ Created new database: C:\xampp\htdocs\linknest\data\linknest.db

Applying PRAGMA settings...
✓ Applied PRAGMA settings

Creating tables...
✓ Created table: users
✓ Created table: tiles
...

Importing data...
✓ Imported table 'users': 5 rows
✓ Imported table 'tiles': 12 rows
...

Creating indexes...
✓ Created index: idx_users_is_admin
...

========================================
Import completed successfully!
========================================
```

## Backup Workflow

### Creating a Backup

1. Run the export script:
   ```bash
   php scripts/export_database.php
   ```

2. The backup will be saved to `data/backups/export_YYYY-MM-DD_HHMMSS/`

3. You can copy this directory to a safe location (external drive, cloud storage, etc.)

### Restoring from Backup

1. Ensure you have a current backup (just in case)

2. Run the import script:
   ```bash
   php scripts/import_database.php /path/to/backup/directory
   ```

3. Verify the database is working correctly

## File Structure

After export, your backup directory will look like:

```
backup_directory/
├── metadata.json      # Export metadata and info
├── schema.json        # Database schema (tables, indexes, triggers)
├── data.json          # All table data
├── pragmas.json       # SQLite PRAGMA settings
└── summary.json       # Export summary and statistics
```

## Requirements

- PHP 8.0 or higher
- PDO SQLite extension enabled
- Write permissions to the backup directory
- Write permissions to the database directory (for import)

## Troubleshooting

### Export fails with "Database file not found"

- Check that the database file exists at `data/linknest.db`
- Verify the path in the script matches your setup

### Import fails with "Failed to delete existing database file"

- Make sure no other process is using the database
- Close any applications that might have the database open
- On Windows, check Task Manager for processes using the database file

### Import fails with foreign key errors

- The script disables foreign keys during import, but if you see errors:
  - Check that tables are created in the correct order
  - Verify the schema.json file is not corrupted

### JSON parsing errors

- Ensure all JSON files are complete and not corrupted
- Re-export the database if files are damaged

## Security Notes

- Backup files contain all database data, including sensitive information
- Store backups in a secure location
- Consider encrypting backup directories for sensitive data
- The import script requires manual confirmation to prevent accidental data loss

## Compatibility

- Compatible with PHP 8.0+
- Works with SQLite 3.x databases
- Cross-platform (Windows, Linux, macOS)
- Preserves all database objects (tables, indexes, triggers, data)
