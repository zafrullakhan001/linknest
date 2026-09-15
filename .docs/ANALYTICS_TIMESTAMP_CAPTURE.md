# Analytics Timestamp Capture

## Overview

The PostgreSQL analytics system now captures the **exact timestamp** when each metric is collected, ensuring accurate time-series analysis even if there are delays in queue processing.

## How It Works

### 1. Timestamp Capture (collect.php)

When a metric is collected from the user's browser, the exact time is captured immediately:

```php
$metric = [
    'time' => gmdate('Y-m-d H:i:s'),  // Capture exact collection time in UTC
    'link_url' => $url,
    'username' => $username,
    'ip_address' => $_SERVER['REMOTE_ADDR'],
    // ... other fields
];
```

**Key Points**:
- ✅ Time captured **immediately** when request is received
- ✅ Stored in **UTC timezone** for consistency
- ✅ Format: `YYYY-MM-DD HH:MM:SS` (e.g., `2026-01-24 15:30:45`)
- ✅ Accurate to the second

### 2. Queue Processing (process-metrics-queue.php)

The worker uses the captured timestamp from the payload:

```sql
INSERT INTO performance_metrics (
    time, link_url, username, ip_address, ...
) VALUES (
    COALESCE(:time::timestamptz, NOW()), :link_url, :username, :ip_address, ...
)
```

**Fallback Behavior**:
- If `time` is provided in payload → Use that exact time
- If `time` is missing/null → Fall back to `NOW()` (worker processing time)

## Benefits

### 1. **Accurate Time-Series Analysis**

```sql
-- Get metrics by actual collection time, not processing time
SELECT 
    DATE_TRUNC('minute', time) as minute,
    COUNT(*) as requests,
    AVG(full_response_time) as avg_latency
FROM performance_metrics
WHERE time >= NOW() - INTERVAL '1 hour'
GROUP BY minute
ORDER BY minute;
```

### 2. **Real-Time Correlation**

The timestamp reflects when the user actually experienced the latency:

```sql
-- Find what happened at a specific time
SELECT 
    username,
    ip_address,
    link_url,
    full_response_time,
    time
FROM performance_metrics
WHERE time BETWEEN '2026-01-24 15:30:00' AND '2026-01-24 15:35:00'
ORDER BY time;
```

### 3. **Queue Delay Detection**

You can compare collection time vs processing time:

```sql
-- Check queue processing delays
SELECT 
    q.id,
    (q.payload->>'time')::timestamptz as collection_time,
    q.created_at as queue_time,
    q.processed_at as processed_time,
    EXTRACT(EPOCH FROM (q.processed_at - (q.payload->>'time')::timestamptz)) as delay_seconds
FROM metrics_queue q
WHERE q.processed = TRUE
    AND q.processed_at >= NOW() - INTERVAL '1 hour'
ORDER BY delay_seconds DESC
LIMIT 10;
```

## Database Schema

### Time Column

```sql
CREATE TABLE performance_metrics (
    time TIMESTAMPTZ NOT NULL,  -- Exact collection timestamp (with timezone)
    -- ... other columns
);
```

**Data Type**: `TIMESTAMPTZ` (timestamp with timezone)
- Stores in UTC internally
- Automatically converts to your session timezone when queried
- Supports timezone-aware operations

## Example Queries

### 1. Hourly Performance Trends

```sql
SELECT 
    DATE_TRUNC('hour', time) as hour,
    COUNT(*) as total_requests,
    AVG(full_response_time) as avg_latency,
    MAX(full_response_time) as max_latency,
    COUNT(DISTINCT username) as unique_users
FROM performance_metrics
WHERE time >= NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

### 2. Recent Activity by User

```sql
SELECT 
    username,
    ip_address,
    link_url,
    full_response_time,
    time AT TIME ZONE 'America/New_York' as eastern_time,  -- Convert to specific timezone
    time AT TIME ZONE 'UTC' as utc_time
FROM performance_metrics
WHERE username = 'john.doe'
    AND time >= NOW() - INTERVAL '1 hour'
ORDER BY time DESC;
```

### 3. Peak Load Times

```sql
SELECT 
    DATE_TRUNC('hour', time) as hour,
    EXTRACT(DOW FROM time) as day_of_week,  -- 0=Sunday, 6=Saturday
    COUNT(*) as request_count,
    AVG(full_response_time) as avg_latency
FROM performance_metrics
WHERE time >= NOW() - INTERVAL '7 days'
GROUP BY hour, day_of_week
ORDER BY request_count DESC
LIMIT 20;
```

### 4. Find Slowdown Windows

```sql
-- Find 5-minute windows where average latency exceeded 3 seconds
SELECT 
    DATE_TRUNC('minute', time) - 
        (EXTRACT(MINUTE FROM time)::int % 5 || ' minutes')::interval as five_min_window,
    COUNT(*) as request_count,
    AVG(full_response_time) as avg_latency,
    MAX(full_response_time) as max_latency,
    ARRAY_AGG(DISTINCT username) FILTER (WHERE username IS NOT NULL) as affected_users
FROM performance_metrics
WHERE time >= NOW() - INTERVAL '24 hours'
GROUP BY five_min_window
HAVING AVG(full_response_time) > 3000
ORDER BY five_min_window DESC;
```

### 5. Timeline for Specific IP Address

```sql
SELECT 
    time,
    link_url,
    full_response_time,
    http_status_code,
    measurement_type,
    time - LAG(time) OVER (ORDER BY time) as time_between_requests
FROM performance_metrics
WHERE ip_address = '203.0.113.45'
    AND time >= NOW() - INTERVAL '24 hours'
ORDER BY time;
```

### 6. Simultaneous User Activity

```sql
-- Find how many users were active at the same time
SELECT 
    DATE_TRUNC('minute', time) as minute,
    COUNT(DISTINCT username) FILTER (WHERE is_authenticated) as unique_users,
    COUNT(DISTINCT ip_address) FILTER (WHERE NOT is_authenticated) as unique_anonymous_ips,
    COUNT(*) as total_requests
FROM performance_metrics
WHERE time >= NOW() - INTERVAL '1 hour'
GROUP BY minute
ORDER BY minute DESC;
```

## Timezone Handling

### UTC Storage

All timestamps are stored in UTC for consistency:

```php
// In collect.php
'time' => gmdate('Y-m-d H:i:s'),  // Always UTC
```

### Query in Different Timezones

```sql
-- View in specific timezone
SELECT 
    time AT TIME ZONE 'UTC' as utc_time,
    time AT TIME ZONE 'America/New_York' as eastern_time,
    time AT TIME ZONE 'Europe/London' as london_time,
    time AT TIME ZONE 'Asia/Tokyo' as tokyo_time,
    username,
    full_response_time
FROM performance_metrics
WHERE time >= NOW() - INTERVAL '1 hour'
ORDER BY time DESC;
```

### Set Session Timezone

```sql
-- Set your session timezone
SET timezone = 'America/New_York';

-- Now all timestamps display in Eastern Time
SELECT time, username, link_url
FROM performance_metrics
LIMIT 10;
```

## Performance Considerations

### Index on Time Column

The schema includes an index on time for efficient queries:

```sql
-- Part of hypertable partitioning
SELECT create_hypertable('performance_metrics', 'time');

-- Additional indexes include time
CREATE INDEX idx_perf_url_time ON performance_metrics (link_url, time DESC);
CREATE INDEX idx_perf_user_time ON performance_metrics (user_id, time DESC);
CREATE INDEX idx_perf_username_time ON performance_metrics (username, time DESC);
```

### Time Range Queries

Always use time ranges for better performance:

```sql
-- Good: Uses index efficiently
SELECT * FROM performance_metrics
WHERE time >= NOW() - INTERVAL '24 hours'
    AND username = 'john.doe'
ORDER BY time DESC;

-- Avoid: Without time filter, scans entire table
SELECT * FROM performance_metrics
WHERE username = 'john.doe'
ORDER BY time DESC;
```

## Data Accuracy

### Collection vs Processing Time

| Event | Timestamp | Description |
|-------|-----------|-------------|
| User requests data | `time` field | **Exact moment** user made request |
| Metric queued | `metrics_queue.created_at` | When inserted into queue |
| Metric processed | `metrics_queue.processed_at` | When worker processed it |
| Record created | `performance_metrics.created_at` | When inserted into final table |

### Example Timeline

```
14:30:00 - User clicks link (time = 14:30:00)
14:30:00 - collect.php receives request
14:30:00 - Metric queued (queue.created_at = 14:30:00)
14:30:05 - Worker processes queue (queue.processed_at = 14:30:05)
14:30:05 - Record inserted (performance_metrics.time = 14:30:00) ✓
```

**Key Point**: The `time` field always reflects when the user actually made the request, regardless of processing delays.

## Troubleshooting

### Timestamps Show Future Time

**Cause**: Server clock is wrong

**Solution**:
```bash
# Check server time
date

# Sync with NTP
sudo ntpdate -s time.nist.gov
```

### Timestamps Show Wrong Timezone

**Cause**: PostgreSQL timezone setting

**Solution**:
```sql
-- Check current timezone
SHOW timezone;

-- Set to UTC (recommended)
ALTER DATABASE linknest_analytics SET timezone = 'UTC';
```

### Large Gap Between Collection and Processing

**Cause**: Queue worker not running or slow

**Check**:
```sql
-- Find delayed processing
SELECT 
    id,
    (payload->>'time')::timestamptz as collection_time,
    processed_at,
    EXTRACT(EPOCH FROM (processed_at - (payload->>'time')::timestamptz)) as delay_seconds
FROM metrics_queue
WHERE processed = TRUE
    AND processed_at - (payload->>'time')::timestamptz > INTERVAL '1 minute'
ORDER BY delay_seconds DESC
LIMIT 20;
```

**Solution**: Ensure worker is running:
```bash
php analytics/process-metrics-queue.php
```

## Migration Notes

### For Existing Data

Existing records use `NOW()` at processing time. After this update:
- **New records**: Use exact collection time
- **Old records**: Still have worker processing time

This is fine for most use cases. If you need to distinguish:

```sql
-- Check if time matches old pattern (processing time ≈ created_at)
SELECT 
    time,
    created_at,
    EXTRACT(EPOCH FROM (created_at - time)) as seconds_diff,
    CASE 
        WHEN ABS(EXTRACT(EPOCH FROM (created_at - time))) < 1 THEN 'old_data'
        ELSE 'new_data'
    END as data_source
FROM performance_metrics
WHERE time >= NOW() - INTERVAL '7 days';
```

### No Schema Changes Needed

The `time` column already exists and accepts timestamps - no migration required!

## Summary

✅ **Exact collection timestamp** - Captured immediately when request received  
✅ **UTC storage** - Consistent timezone handling  
✅ **Queue-independent** - Accurate time regardless of processing delays  
✅ **Timezone conversion** - Query in any timezone  
✅ **High precision** - Second-level accuracy  
✅ **No migration needed** - Works with existing schema  

The timestamp now reflects **when users actually experienced the performance**, not when the system finished processing the metrics.

---

**Implementation Date**: January 24, 2026  
**Status**: ✅ Complete  
**Backward Compatible**: Yes  
**Migration Required**: No
