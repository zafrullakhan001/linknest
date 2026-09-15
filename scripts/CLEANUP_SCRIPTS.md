# Database Cleanup Scripts

This directory contains scripts to clean up orphaned records in the LinkNest database.

## Overview

When tiles are deleted, sometimes related records (permissions, links, sections, tabs) can become "orphaned" - they reference a tile that no longer exists. These scripts help identify and remove such orphaned data.

## Available Scripts

### 1. `cleanup_orphaned_tile_permissions.php`

**Purpose:** Removes orphaned tile permission records where the referenced tile has been deleted.

**Usage:**
```bash
php scripts/cleanup_orphaned_tile_permissions.php
```

**What it cleans:**
- User tile permissions for non-existent tiles

**Example Output:**
```
✓ SUCCESS
Successfully cleaned up 4 orphaned permission record(s) for 4 deleted tile(s).

Details:
- Orphaned tiles found: 4
- Permission records deleted: 4
```

---

### 2. `cleanup_all_orphaned_records.php` ⭐ **Recommended**

**Purpose:** Comprehensive cleanup of ALL types of orphaned records in the database.

**Usage:**
```bash
# Run actual cleanup
php scripts/cleanup_all_orphaned_records.php

# Dry-run mode (preview what would be cleaned without making changes)
php scripts/cleanup_all_orphaned_records.php --dry-run
```

**What it cleans:**
1. **Orphaned Tile Permissions** - Permissions for deleted tiles
2. **Orphaned Sections** - Sections referencing deleted tiles
3. **Orphaned Links** - Links referencing deleted sections
4. **Orphaned Tabs** - Tabs referencing deleted tiles
5. **Duplicate Permissions** - Multiple permission records for same user-tile pair

**Example Output:**
```
==============================================
  COMPREHENSIVE DATABASE CLEANUP
==============================================
  MODE: LIVE (changes will be committed)
==============================================

Checking user_tile_permissions...
  ✓ No orphaned permissions found

Checking sections...
  Found 4744 orphaned section(s)
  ✓ Deleted 4744 orphaned section(s)

Checking links...
  Found 9511 orphaned link(s)
  ✓ Deleted 9511 orphaned link(s)

Checking tabs...
  Found 4628 orphaned tab(s)
  ✓ Deleted 4628 orphaned tab(s)

Checking for duplicate tile permissions...
  ✓ No duplicate permissions found

==============================================
✓ CLEANUP COMPLETE
==============================================

Successfully cleaned 18883 orphaned record(s)

Summary:
  • Sections: 4744
  • Links: 9511
  • Tabs: 4628
```

---

## When to Run These Scripts

### Run cleanup scripts when:

1. **Duplicate tiles appear in Tile Admins page** - Even though tiles were deleted, they still show up in the admin interface
2. **Database import/restore operations** - After restoring from backup or importing data
3. **Bulk tile deletions** - After deleting multiple tiles at once
4. **Database migration** - After schema changes or version upgrades
5. **Regular maintenance** - As part of routine database maintenance (monthly/quarterly)

### Signs you need cleanup:

- Tile Admins page shows tiles that don't exist
- Permission errors for non-existent tiles
- Slow queries on tile-related operations
- Database size larger than expected

---

## Safety Features

### Transaction-Based
All cleanup operations use database transactions, so if an error occurs, **no changes** are committed - your data stays safe.

### Dry-Run Mode
The comprehensive cleanup script supports `--dry-run` mode to preview what would be cleaned without making any changes:

```bash
php scripts/cleanup_all_orphaned_records.php --dry-run
```

### Detailed Reporting
Both scripts provide:
- Count of orphaned records found
- Detailed breakdown by type
- Tile IDs or record IDs being cleaned
- JSON output for automation/logging

---

## Database Schema Hierarchy

Understanding the data relationships helps explain why orphaned records occur:

```
Tiles (top level)
  ├─ user_tile_permissions (tile_id)
  ├─ Sections (tile_id)
  │   └─ Links (section_id)
  └─ Tabs (tile_id)
```

When a **Tile** is deleted:
- Its **permissions** become orphaned (if not properly cascade deleted)
- Its **sections** become orphaned
- All **links** in those sections become orphaned
- Its **tabs** become orphaned

---

## Technical Details

### How Orphans Are Detected

The scripts use SQL `LEFT JOIN` queries to find records referencing non-existent parent records:

```sql
-- Find orphaned permissions
SELECT utp.*
FROM user_tile_permissions utp
LEFT JOIN tiles t ON utp.tile_id = t.id
WHERE t.id IS NULL
```

### Deletion Order

The comprehensive cleanup script deletes in the correct order to respect foreign key constraints:

1. Tile permissions (no dependencies)
2. Sections (depend on tiles)
3. Links (depend on sections)
4. Tabs (depend on tiles)
5. Duplicate cleanup (optimization)

---

## Automation

You can automate cleanup as part of maintenance:

### Windows Task Scheduler
```bash
# Run weekly on Sunday at 2 AM
php "C:\xampp\htdocs\linknest\scripts\cleanup_all_orphaned_records.php" > "C:\xampp\htdocs\linknest\logs\cleanup.log" 2>&1
```

### Linux Cron
```bash
# Run weekly on Sunday at 2 AM
0 2 * * 0 /usr/bin/php /var/www/linknest/scripts/cleanup_all_orphaned_records.php >> /var/www/linknest/logs/cleanup.log 2>&1
```

---

## Troubleshooting

### "No such table" error
- Your database schema might be outdated
- Run database migrations first: `php api/config.php`

### "Call to undefined function getDB()"
- Make sure the script can find `api/config.php`
- Run from the workspace root: `php scripts/cleanup_all_orphaned_records.php`

### Very large number of orphans
- This is normal after bulk operations or imports
- Run the comprehensive cleanup script
- Consider adding CASCADE DELETE constraints to prevent future orphans

### Script times out
- Increase PHP timeout: `php -d max_execution_time=300 scripts/cleanup_all_orphaned_records.php`
- Or edit the script and add: `set_time_limit(300);` at the top

---

## Best Practices

1. **Run dry-run first** - Always preview changes before committing
2. **Backup before cleanup** - Create database backup before major cleanups
3. **Run after imports** - Always cleanup after restoring or importing data
4. **Schedule regular runs** - Add to monthly maintenance routine
5. **Monitor output** - Review cleanup logs to identify patterns

---

## Related Files

- `api/config.php` - Database connection and schema
- `api/tiles.php` - Tile management (should include proper cascading deletes)
- `api/access.php` - Permission management

---

## Future Improvements

Consider adding:
- **CASCADE DELETE constraints** in schema to prevent orphans automatically
- **Soft deletes** to allow recovery of accidentally deleted tiles
- **Audit logging** to track what gets cleaned up
- **Web UI** for running cleanup from admin panel
- **Email notifications** for scheduled cleanup results
