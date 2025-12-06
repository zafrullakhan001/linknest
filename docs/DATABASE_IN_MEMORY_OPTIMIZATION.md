# Database In-Memory Optimization

## Overview

This document describes the in-memory optimizations applied to the SQLite database for improved performance with small databases (< 1 MB).

## Database Size

The current database (`linknest.db`) is approximately **392 KB**, making it an ideal candidate for in-memory optimizations.

## Optimizations Applied

### 1. Memory-Mapped I/O (`PRAGMA mmap_size`)

**What it does:**
- Maps the entire database file directly into the operating system's virtual memory
- Allows SQLite to access database pages directly from RAM without disk I/O
- The OS handles caching and page swapping automatically

**Configuration:**
```sql
PRAGMA mmap_size = 104857600; -- 100 MB
```

**Benefits:**
- Eliminates most disk I/O operations
- Faster read operations (data accessed from memory)
- Reduced latency for database queries

### 2. Increased Cache Size (`PRAGMA cache_size`)

**What it does:**
- Increases the page cache to hold more database pages in memory
- Ensures the entire small database can fit in the cache

**Configuration:**
```sql
PRAGMA cache_size = -4096; -- 4 MB (negative value = KB)
```

**Benefits:**
- Entire database can be cached in memory
- Frequently accessed pages stay in RAM
- Reduces disk reads significantly

### 3. Optimized Synchronous Mode (`PRAGMA synchronous = NORMAL`)

**What it does:**
- Changed from `FULL` to `NORMAL` for better write performance
- With WAL (Write-Ahead Logging) mode enabled, `NORMAL` is safe and provides:
  - Better write performance
  - Data integrity maintained through WAL
  - Faster transaction commits

**Configuration:**
```sql
PRAGMA synchronous = NORMAL; -- Changed from FULL
```

**Benefits:**
- Faster write operations
- Reduced I/O wait times
- Maintains data integrity with WAL mode

### 4. Memory-Based Temporary Storage (`PRAGMA temp_store = MEMORY`)

**What it does:**
- Stores temporary tables, indexes, and sort operations in memory instead of disk
- Eliminates temporary file I/O operations

**Configuration:**
```sql
PRAGMA temp_store = MEMORY;
```

**Benefits:**
- Faster sorting operations
- Faster temporary table operations
- No disk I/O for temporary data

### 5. Query Planner Optimization (`PRAGMA optimize`)

**What it does:**
- Analyzes database statistics and optimizes query plans
- Updates internal statistics for better query performance

**Configuration:**
```sql
PRAGMA optimize;
```

**Benefits:**
- Better query execution plans
- Improved index usage
- More efficient joins and searches

## Performance Impact

### Expected Improvements

1. **Read Operations:** 5-10x faster (data accessed from memory)
2. **Write Operations:** 2-3x faster (NORMAL synchronous mode + WAL)
3. **Query Latency:** Significantly reduced (no disk I/O for cached data)
4. **Concurrent Access:** Improved (WAL mode + memory-mapped I/O)

### Memory Usage

- **Database File:** ~392 KB
- **Memory-Mapped Size:** Up to 100 MB (allocated as needed)
- **Cache Size:** 4 MB (fixed allocation)
- **Total Estimated Memory:** ~4-5 MB for database operations

## Configuration Files

The optimizations are applied in:

1. **`api/config.php`** - Applied automatically on every database connection
2. **`api/optimize_database.php`** - Applied when running manual optimization

## Compatibility

### SQLite Version Requirements

- **Memory-Mapped I/O:** SQLite 3.7.17+ (2013)
- **PRAGMA optimize:** SQLite 3.18.0+ (2015)
- **WAL Mode:** SQLite 3.7.0+ (2010)

All modern PHP installations (PHP 7.4+) include SQLite 3.8+ which supports all these features.

### Fallback Behavior

If any PRAGMA command fails (e.g., older SQLite version), the error is logged but the application continues to function normally. The database will use default settings for unsupported features.

## Monitoring

To check if optimizations are active, you can query:

```sql
PRAGMA mmap_size;      -- Should return 104857600
PRAGMA cache_size;     -- Should return -4096 (4 MB)
PRAGMA synchronous;   -- Should return 1 (NORMAL)
PRAGMA temp_store;     -- Should return 2 (MEMORY)
PRAGMA journal_mode;   -- Should return 'wal'
```

## Best Practices

1. **Regular Optimization:** Run `optimize_database.php` periodically to update statistics
2. **Monitor Memory:** Ensure server has sufficient RAM (recommended: 512 MB+ free)
3. **Backup Strategy:** Continue regular backups as data is still persisted to disk
4. **Database Growth:** If database grows beyond 10 MB, consider reviewing these settings

## Notes

- **Data Persistence:** Despite in-memory optimizations, all data is still persisted to disk
- **Durability:** WAL mode + NORMAL synchronous provides good durability for most use cases
- **Crash Recovery:** WAL mode provides automatic crash recovery
- **Concurrent Access:** WAL mode handles concurrent reads/writes efficiently

## Troubleshooting

### High Memory Usage

If memory usage is a concern:
- Reduce `mmap_size` to a smaller value (e.g., 10 MB)
- Reduce `cache_size` to 2 MB (`-2048`)

### Performance Not Improved

1. Check SQLite version: `SELECT sqlite_version();`
2. Verify PRAGMA settings are applied
3. Check if database file is on a slow disk (consider moving to SSD)
4. Run `ANALYZE` to update query planner statistics

### Compatibility Issues

If you encounter issues with older SQLite versions:
- Remove `PRAGMA mmap_size` (if not supported)
- Remove `PRAGMA optimize` (if not supported)
- Use `PRAGMA synchronous = FULL` (more compatible, but slower)




























































