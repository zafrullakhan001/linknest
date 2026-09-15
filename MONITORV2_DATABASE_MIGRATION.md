# Monitorv2 Database Migration Guide

## Summary of Changes

This document outlines the changes made to the Monitorv2 addon to move from using a schema in the main postgres database to a dedicated `zmonitoring` database.

## What Changed

### 1. **Dedicated Database: `zmonitoring`** ✅
- **Before**: Monitorv2 used `monitorv2_pg_database` (defaulted to `postgres`) with `zmonitoring` schema
- **After**: Monitorv2 now uses a dedicated database named `zmonitoring` by default
- **Why**: Better isolation, easier backup/restore, and cleaner architecture

### 2. **Fixed JSON Export/Import** ✅
- The export and import functionality now properly uses the bundle endpoints
- Both single monitor and full bundle imports are supported
- Import/export properly handles all monitors, notification rules, and recipients

### 3. **Backup & Restore with New Database** ✅
- Backup/restore functions updated to work with the dedicated `zmonitoring` database
- Exports all data from the `zmonitoring` schema as SQL
- Restore functionality supports both SQL and ZIP files
- Works with the new database structure

### 4. **Automatic Database Creation** ✅
- New endpoint: `POST /api/monitorv2.php/create-database`
- Automatically creates the `zmonitoring` database if it doesn't exist
- Validates database name and checks for existence before creation
- Can be called from the addon configuration UI

### 5. **pg_cron Extension Support** ✅
- New endpoint: `POST /api/monitorv2.php/install-extensions`
- Installs both `timescaledb` and `pg_cron` extensions
- `pg_cron` allows scheduling cron jobs directly in PostgreSQL
- Checks extension availability before attempting installation

## New API Endpoints

### Create Database
```http
POST /api/monitorv2.php/create-database
Content-Type: application/json

{
  "pgHost": "localhost",
  "pgPort": 5433,
  "pgDatabase": "zmonitoring",
  "pgUser": "postgres",
  "pgPassword": "your_password"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Database 'zmonitoring' created successfully",
  "database_name": "zmonitoring"
}
```

### Install Extensions
```http
POST /api/monitorv2.php/install-extensions
Content-Type: application/json

{
  "pgHost": "localhost",
  "pgPort": 5433,
  "pgDatabase": "zmonitoring",
  "pgUser": "postgres",
  "pgPassword": "your_password",
  "extensions": ["timescaledb", "pg_cron"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Extensions processed",
  "installed": ["timescaledb", "pg_cron"],
  "errors": []
}
```

### Enhanced Test Connection
The test connection endpoint now provides detailed information about:
- Database existence
- Extension availability (TimescaleDB and pg_cron)
- Extension installation status  
- Schema and table status

## Migration Steps

If you have existing monitors in the old setup, follow these steps:

### Step 1: Export Current Data (Optional)
Before migration, export your current monitoring configuration:
1. Go to Monitorv2 Dashboard
2. Click the export button to download all monitors as JSON

### Step 2: Configure New Database
1. Go to **Add-ons** → **Monitorv2** → **Configuration**
2. Update PostgreSQL settings:
   - **Host**: `localhost`
   - **Port**: `5433`
   - **Database**: `zmonitoring` (new default)
   - **Username**: `postgres`
   - **Password**: Your postgres password

### Step 3: Test Connection
Click "Test Connection" to verify:
- ✅ PostgreSQL server is accessible
- ✅ Credentials are correct
- ⚠️ Database may not exist yet (this is okay)

### Step 4: Create Database
If the database doesn't exist, the system will show an option to **Create Database**
Click this button to automatically create the `zmonitoring` database.

### Step 5: Install Extensions
After creating the database, install required extensions:
- Click **Install Extensions**
- This will install:
  - `timescaledb`: For time-series data storage
  - `pg_cron`: For scheduling cron jobs in PostgreSQL

### Step 6: Setup Schema
Click **Setup Schema** to create all required tables and functions in the`zmonitoring` database.

### Step 7: Import Data (If Migrating)
If you exported data in Step 1:
1. Go to Monitorv2 Dashboard
2. Click the import button
3. Select your exported JSON file
4. Confirm the import

## Using pg_cron

The `pg_cron` extension allows you to schedule jobs directly in PostgreSQL. Examples:

### Schedule Hourly Stats Aggregation
```sql
SELECT cron.schedule(
    'aggregate-hourly-stats',  -- job name
    '5 * * * *',               -- run at 5 minutes past every hour
    $$SELECT zmonitoring.aggregate_hourly_stats()$$
);
```

### Schedule Daily Cleanup
```sql
SELECT cron.schedule(
    'cleanup-old-data',
    '0 2 * * *',  -- run at 2 AM daily
    $$SELECT * FROM zmonitoring.cleanup_old_data(90, 365)$$
);
```

### View Scheduled Jobs
```sql
SELECT * FROM cron.job;
```

### Remove a Job
```sql
SELECT cron.unschedule('job-name');
```

## File Changes Summary

### Modified Files:
1. **`api/monitorv2.php`**
   - Changed default database from `postgres` to `zmonitoring`
   - Enhanced `handleTestConnection()` to check database existence and extensions
   - Added `handleCreateDatabase()` function
   - Added `handleInstallExtensions()` function
   - Added routing for new endpoints

2. **`api/addons.php`**
   - Updated default database to `zmonitoring` in 3 locations
   - Backup/restore already compatible with separate database

3. **`services/monitorv2Service.ts`**
   - Added `exportMonitorsBundle()` method
   - Added `importMonitorsBundle()` method
   - Added `createDatabase()` method
   - Added `installExtensions()` method
   - Added `importMonitorsFromCSV()` method

### No Changes Needed:
- `components/Monitorv2Dashboard.tsx` - Already using correct methods
- `monitorv2/schema.sql` - Schema remains the same

## Benefits of This Change

1. **Better Isolation**: Dedicated database prevents conflicts with other applications
2. **Easier Backup**: Can backup just the monitoring database without affecting others
3. **Cleaner Architecture**: Clear separation of monitoring data
4. **Simpler Migration**: Can move monitoring to different server easily
5. **Extension Support**: pg_cron enables powerful scheduling capabilities
6. **Auto-Setup**: Database and extensions can be created automatically

## Troubleshooting

### Database Creation Fails
**Error**: "Permission denied to create database"
**Solution**: Ensure the PostgreSQL user has `CREATEDB` privilege:
```sql
ALTER USER postgres CREATEDB;
```

### Extension Installation Fails
**Error**: "Extension pg_cron is not available"
**Solution**: Install pg_cron on your PostgreSQL server:
- **Docker**: Use `timescale/timescaledb-ha` image which includes pg_cron
- **Ubuntu/Debian**: `sudo apt-get install postgresql-<version>-cron`
- **macOS**: `brew install pg_cron`

### Cannot Connect to Database
**Error**: "Connection failed"
**Solution**: 
1. Verify PostgreSQL is running: `sudo systemctl status postgresql`
2. Check if port 5433 is correct (default is 5432)
3. Verify authentication in `pg_hba.conf`
4. Check firewall settings

## Support

For issues or questions:
1. Check the error logs in browser console and PHP error logs
2. Verify PostgreSQL logs for connection issues
3. Ensure all extensions are properly installed
4. Test connection manually using `psql -h localhost -p 5433 -U postgres -d zmonitoring`

---

**Last Updated**: January 30, 2026
**Version**: 2.0
