# Database Optimization Guide

This guide explains how to optimize your LinkNest database for better performance.

## Automatic Optimization

The database is automatically optimized when it's initialized. Indexes are created automatically when the application starts for the first time or when new tables are created.

## Manual Optimization

If you want to manually optimize your database (useful for existing installations), you can run the optimization script.

### Option 1: Via Web Browser

1. Navigate to: `http://your-domain/api/optimize_database.php`
2. The script will create all necessary indexes and optimize database settings
3. You'll see a JSON response with the results

### Option 2: Via Command Line

```bash
cd /path/to/linknest/api
php optimize_database.php
```

## What Gets Optimized

### Indexes Created

The optimization script creates the following indexes to speed up common queries:

#### Users Table
- `idx_users_is_approved` - Speeds up queries filtering by approval status
- `idx_users_is_admin` - Speeds up admin user queries
- `idx_users_approved_admin` - Composite index for combined filters
- `idx_users_created_at` - Speeds up sorting by creation date

#### Tiles Table
- `idx_tiles_user_id` - Speeds up queries filtering by user
- `idx_tiles_position` - Speeds up sorting by position (most common query)

#### Sections Table
- `idx_sections_tile_id` - Speeds up queries finding sections for a tile

#### Links Table
- `idx_links_section_id` - Speeds up queries finding links for a section
- `idx_links_health_checked_at` - Speeds up health check queries
- `idx_links_health_status` - Speeds up health statistics queries
- `idx_links_health_composite` - Composite index for health-related queries

#### Arrangements Tables
- Indexes on `user_id` and `position` for faster arrangement queries

### SQLite Performance Settings

The optimization also configures SQLite for better performance:

- **WAL Mode**: Enables Write-Ahead Logging for better concurrent access
- **Cache Size**: Set to 10MB for faster queries
- **Synchronous Mode**: Set to NORMAL (safe with WAL mode)
- **Temp Store**: Set to MEMORY for faster temporary operations

## Performance Impact

After optimization, you should see:

- **Faster tile loading**: The most common query (loading all tiles) will be significantly faster
- **Faster user queries**: Admin panel and user management will be faster
- **Faster health checks**: Link health checking will be more efficient
- **Better concurrent access**: WAL mode allows multiple readers simultaneously

## Verification

After running the optimization, you can verify the indexes were created by checking the JSON response. The response includes:

- Number of indexes created
- List of all indexes
- Database statistics
- Any errors that occurred

## Troubleshooting

If you encounter errors:

1. **Permission Issues**: Make sure the web server has write access to the database file
2. **Database Locked**: Wait a few seconds and try again
3. **Index Already Exists**: This is normal - the script uses `IF NOT EXISTS` so it's safe to run multiple times

## Running Multiple Times

The optimization script is safe to run multiple times. It uses `CREATE INDEX IF NOT EXISTS`, so it won't create duplicate indexes or cause errors if run again.

## Notes

- Indexes take up a small amount of disk space but significantly improve query performance
- The optimization is automatic for new installations
- Existing installations should run the optimization script once to get the performance benefits






















