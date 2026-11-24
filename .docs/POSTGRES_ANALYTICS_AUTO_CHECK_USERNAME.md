# PostgreSQL Analytics: Auto-Check & Username Tracking

## Overview

This document describes the improvements made to the PostgreSQL Performance Analytics feature to enable automatic link checking and username tracking.

## Changes Implemented

### 1. Automatic Link Checking on Tile Open

**File Modified**: `components/TileDetail.tsx`

**What Changed**:
- Added a `useEffect` hook that automatically triggers link health checking when a user opens a tile
- Previously, users had to manually click the "Check Links" button to initiate link checking and send data to PostgreSQL analytics
- Now, when a tile is opened, all links are automatically checked after a 500ms delay (to allow UI to render)
- This ensures analytics data is captured immediately without user intervention

**Implementation Details**:
```typescript
// Auto-check links when tile is opened
useEffect(() => {
    // Automatically check tile links when component mounts
    const autoCheckLinks = async () => {
        try {
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const sections = tile.tabs && tile.tabs.length > 0
                ? tile.tabs.flatMap(tab => tab.sections)
                : tile.sections || [];
            
            const hasLinks = sections.some(section => 
                section.links && section.links.length > 0
            );
            
            if (hasLinks && !checkingHealth) {
                handleCheckTileHealth();
            }
        } catch (error) {
            console.debug('Auto link check skipped:', error);
        }
    };

    autoCheckLinks();
}, []);
```

**Benefits**:
- Passive analytics collection - no user action required
- More comprehensive data collection across all tile views
- Better visibility into actual user experience with links
- Administrators get real-time performance data as users navigate

---

### 2. Username Tracking in PostgreSQL Analytics

**Files Modified**:
1. `api/analytics/collect.php` - Backend metrics collector
2. `analytics/schema.sql` - PostgreSQL database schema
3. `analytics/migrations/add_username_column.sql` - Migration for existing databases

**What Changed**:

#### Backend Changes (`collect.php`):
- Added username extraction from session: `$username = $_SESSION['username'] ?? null;`
- Included username in the metrics payload sent to PostgreSQL
- Username is captured alongside user_id for better user identification

```php
// Extract username from session
$username = $_SESSION['username'] ?? null;

// Include in metrics payload
$metric = [
    'link_url' => $url,
    'measurement_type' => $measurementType,
    'user_id' => $userId,
    'username' => $username,  // NEW FIELD
    'session_id' => session_id(),
    // ... other fields
];
```

#### Database Schema Changes:
- Added `username VARCHAR(255)` column to `performance_metrics` table
- Created index `idx_perf_username_time` for efficient username-based queries
- Username is stored alongside each performance metric

**Benefits**:
- Easy drill-down to identify which users are experiencing performance issues
- Filter analytics dashboards by username
- Correlate latency spikes with specific user accounts
- Better troubleshooting and support capabilities

---

## Database Migration

### For Existing Installations

If you already have a PostgreSQL analytics database, you need to run the migration:

```bash
# Navigate to analytics migrations directory
cd analytics/migrations

# Run the migration
psql -h localhost -p 5433 -U postgres -d linknest_analytics -f add_username_column.sql
```

**What the migration does**:
1. Adds `username` column to `performance_metrics` table
2. Creates an index for efficient username queries
3. Safe to run multiple times (idempotent)

### For New Installations

The updated `analytics/schema.sql` already includes the username column. Simply run:

```bash
psql -h localhost -p 5433 -U postgres -d linknest_analytics -f analytics/schema.sql
```

---

## Usage Examples

### Query Performance by Username

Find all performance metrics for a specific user:

```sql
SELECT 
    time,
    link_url,
    full_response_time,
    http_status_code,
    country_name,
    city_name
FROM performance_metrics
WHERE username = 'john.doe'
ORDER BY time DESC
LIMIT 100;
```

### Identify Users with High Latency

Find users experiencing slow performance:

```sql
SELECT 
    username,
    link_url,
    AVG(full_response_time) as avg_latency,
    COUNT(*) as measurement_count
FROM performance_metrics
WHERE username IS NOT NULL
    AND time >= NOW() - INTERVAL '24 hours'
GROUP BY username, link_url
HAVING AVG(full_response_time) > 3000
ORDER BY avg_latency DESC;
```

### User-Specific Performance Summary

Get a performance summary for a specific user:

```sql
SELECT 
    username,
    COUNT(DISTINCT link_url) as unique_urls_accessed,
    AVG(full_response_time) as avg_latency,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY full_response_time) as p95_latency,
    MAX(full_response_time) as max_latency,
    COUNT(*) as total_measurements
FROM performance_metrics
WHERE username = 'john.doe'
    AND time >= NOW() - INTERVAL '7 days'
GROUP BY username;
```

---

## Testing the Implementation

### Test Automatic Link Checking

1. Open LinkNest application
2. Navigate to any tile that contains links
3. Open browser developer tools (F12)
4. Go to Network tab and filter for "linkhealth" or "analytics"
5. Observe automatic API calls being made without clicking "Check Links"

Expected behavior:
- After opening a tile, you should see automatic requests to `/api/linkhealth/check-tile`
- Followed by requests to `/api/analytics/collect` with performance data
- No manual button click required

### Test Username Tracking

1. Log in to LinkNest with a known username
2. Open a tile with links (auto-check will trigger)
3. Query PostgreSQL to verify username is captured:

```sql
SELECT username, link_url, full_response_time, time
FROM performance_metrics
WHERE username = 'your_username'
ORDER BY time DESC
LIMIT 10;
```

Expected result:
- Records should show your username
- Each link checked should have an associated username
- Can filter and drill down by username

---

## Performance Considerations

### Auto-Check Impact

**Potential Concerns**:
- Auto-checking all links on tile open could increase server load
- May slow down initial tile rendering

**Mitigations**:
1. **500ms Delay**: Allows UI to render before starting checks
2. **Parallel Processing**: Links are checked 4-5 at a time (already implemented in `handleCheckTileHealth`)
3. **Fire-and-Forget**: Analytics collection runs asynchronously and never blocks UI
4. **Sampling Support**: Performance analytics service already supports sampling to reduce load

**Recommendations**:
- Monitor server load after deployment
- If needed, add configuration option to disable auto-check
- Consider implementing per-user or per-tile sampling

### Database Performance

**Username Index**:
- Created index on `(username, time DESC)` for efficient queries
- Index is partial (only on non-NULL usernames) to save space
- Complements existing `user_id` index

**Storage Impact**:
- Username adds ~10-50 bytes per metric (depending on username length)
- Recommended: Monitor disk usage and adjust retention policy if needed
- Current retention: 90 days (configurable in schema)

---

## Configuration Options

### Disable Auto-Check (If Needed)

If you want to add a feature flag to disable auto-checking:

```typescript
// In TileDetail.tsx, modify the useEffect:
useEffect(() => {
    const autoCheckEnabled = settings.autoCheckLinks ?? true; // Default enabled
    
    if (!autoCheckEnabled) {
        return;
    }
    
    // ... rest of auto-check logic
}, []);
```

### Adjust Check Delay

Modify the delay before auto-checking starts:

```typescript
// Change from 500ms to desired delay
await new Promise(resolve => setTimeout(resolve, 500)); // Increase if needed
```

---

## Troubleshooting

### Auto-Check Not Working

**Symptoms**: Links not checked automatically when opening tile

**Checks**:
1. Verify JavaScript console for errors
2. Check if tile actually has links
3. Ensure `handleCheckTileHealth` function exists and is working
4. Verify Performance Analytics is enabled in settings

**Debug**:
```javascript
console.log('Auto-check triggered:', { hasLinks, checkingHealth, tileId: tile.id });
```

### Username Not Captured

**Symptoms**: Username column in PostgreSQL shows NULL

**Checks**:
1. Verify user is logged in (`$_SESSION['username']` is set)
2. Check if session is properly started in `collect.php`
3. Verify migration has been run (column exists)
4. Check PHP session configuration

**Debug**:
```php
// In collect.php, add temporary logging:
error_log("Analytics username: " . var_export($username, true));
```

### High Server Load

**Symptoms**: Server becomes slow after enabling auto-check

**Solutions**:
1. Increase the initial delay (500ms → 1000ms+)
2. Implement per-user sampling:
   ```typescript
   const shouldAutoCheck = Math.random() < 0.5; // 50% sampling
   ```
3. Only auto-check tiles with < N links
4. Disable auto-check for certain tile types or users

---

## Rollback Instructions

If you need to revert these changes:

### 1. Disable Auto-Check

Remove the auto-check useEffect from `TileDetail.tsx`:
```typescript
// Comment out or remove the useEffect hook starting at line ~470
```

### 2. Remove Username from Analytics

Revert `api/analytics/collect.php`:
```php
// Remove username extraction and from metrics payload
```

### 3. Drop Username Column (Optional)

If you want to remove the username column:
```sql
DROP INDEX IF EXISTS idx_perf_username_time;
ALTER TABLE performance_metrics DROP COLUMN IF EXISTS username;
```

---

## Future Enhancements

Potential improvements to consider:

1. **Smart Auto-Check**:
   - Only auto-check links that haven't been checked recently
   - Skip auto-check if user has manually checked within last X minutes
   - Prioritize checking "important" links first

2. **User Dashboard**:
   - Create a user-facing dashboard showing their own performance metrics
   - Allow users to see which links are slow for them specifically
   - Compare their experience to global averages

3. **Advanced Analytics**:
   - Correlate username with location, device type, browser
   - Identify patterns: "Users in Region X experience slow performance with Link Y"
   - Create heat maps of performance by user demographics

4. **Real-Time Alerts**:
   - Notify administrators when specific users experience issues
   - Send alerts to users if their links are consistently slow
   - Integrate with notification systems

---

## Summary

These changes provide two major improvements:

1. **Automatic Link Checking**: Users no longer need to manually click "Check Links" - analytics data is automatically collected when tiles are opened

2. **Username Tracking**: Every performance metric now includes the username, enabling drill-down analysis to identify users experiencing issues

Both features work together to provide comprehensive, passive performance monitoring that helps administrators quickly identify and resolve user-specific performance problems.

---

## Support

For questions or issues with this implementation:
1. Check the troubleshooting section above
2. Review the migration README in `analytics/migrations/README.md`
3. Examine PostgreSQL logs for any database errors
4. Check browser console and PHP error logs for runtime issues

## Version History

- **January 2026**: Initial implementation
  - Auto-check on tile open
  - Username tracking in performance_metrics
  - Database migration for existing installations
