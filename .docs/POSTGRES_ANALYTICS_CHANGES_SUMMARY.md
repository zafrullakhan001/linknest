# PostgreSQL Analytics: Auto-Check & Username - Implementation Summary

## ✅ Completed Changes

### 1. Automatic Link Checking (`components/TileDetail.tsx`)
- **Line ~470**: Added `useEffect` hook that automatically triggers link health checks when a tile is opened
- **Behavior**: After 500ms delay, all links in the tile are checked automatically
- **No user action required**: Analytics data is captured passively
- **Smart detection**: Only runs if tile contains links and not already checking

### 2. Username Tracking in Analytics (`api/analytics/collect.php`)
- **Line ~24**: Extract username from session: `$username = $_SESSION['username'] ?? null;`
- **Line ~109**: Include username in metrics payload sent to PostgreSQL
- **Benefit**: Can now drill down to see which users are experiencing latency issues

### 3. Exact Timestamp Capture (`api/analytics/collect.php` & `analytics/process-metrics-queue.php`)
- **Line ~115**: Capture exact collection time: `'time' => gmdate('Y-m-d H:i:s')`
- **Worker updated**: Uses captured timestamp from payload instead of processing time
- **Benefit**: Accurate time-series analysis, even with queue delays

### 4. Database Schema Updates

#### New Installations (`analytics/schema.sql`)
- Added `username VARCHAR(255)` column to `performance_metrics` table (line 36)
- Added index `idx_perf_username_time` for efficient username queries (line 94)

#### Existing Installations (`analytics/migrations/add_username_column.sql`)
- Migration script to add username column to existing databases
- Includes index creation and documentation
- Safe to run multiple times (idempotent)

---

## 📋 Files Modified

1. ✅ `components/TileDetail.tsx` - Auto-check on tile open
2. ✅ `api/analytics/collect.php` - Capture username from session
3. ✅ `analytics/schema.sql` - Updated schema with username column
4. ✅ `analytics/migrations/add_username_column.sql` - Migration for existing DBs
5. ✅ `analytics/migrations/README.md` - Migration documentation
6. ✅ `.docs/POSTGRES_ANALYTICS_AUTO_CHECK_USERNAME.md` - Comprehensive documentation

---

## 🚀 Deployment Steps

### 1. For Existing PostgreSQL Installations

Run the migration to add username column:

```bash
psql -h localhost -p 5433 -U postgres -d linknest_analytics -f analytics/migrations/add_username_column.sql
```

### 2. Deploy Application Changes

No special deployment steps needed. The changes are:
- Backward compatible (username can be NULL)
- Auto-check runs automatically on tile open
- Session username is captured if available

### 3. Verify It Works

**Test Auto-Check**:
1. Open LinkNest and navigate to a tile with links
2. Watch browser Network tab (F12) for automatic API calls to `/api/linkhealth/check-tile`
3. Verify analytics data is sent without clicking "Check Links" button

**Test Username Tracking**:
```sql
-- Query PostgreSQL to verify username is captured
SELECT username, link_url, full_response_time, time
FROM performance_metrics
WHERE username IS NOT NULL
ORDER BY time DESC
LIMIT 10;
```

---

## 🎯 Benefits

### Automatic Link Checking
✅ No user action required - passive data collection  
✅ More comprehensive analytics coverage  
✅ Real-time performance monitoring as users navigate  
✅ Better understanding of actual user experience  

### Username Tracking
✅ Identify which users have performance issues  
✅ Drill down to specific user+URL combinations  
✅ Better troubleshooting and support  
✅ Correlate latency with user accounts  

---

## 📊 Example Queries

### Find users with high latency:
```sql
SELECT 
    username,
    link_url,
    AVG(full_response_time) as avg_latency,
    COUNT(*) as measurements
FROM performance_metrics
WHERE username IS NOT NULL
    AND time >= NOW() - INTERVAL '24 hours'
GROUP BY username, link_url
HAVING AVG(full_response_time) > 3000
ORDER BY avg_latency DESC;
```

### Performance summary by user:
```sql
SELECT 
    username,
    COUNT(DISTINCT link_url) as urls_accessed,
    AVG(full_response_time) as avg_latency,
    MAX(full_response_time) as max_latency
FROM performance_metrics
WHERE username = 'john.doe'
    AND time >= NOW() - INTERVAL '7 days'
GROUP BY username;
```

---

## ⚠️ Considerations

### Performance Impact
- Auto-check adds a 500ms delay before checking (UI renders first)
- Links checked in parallel (4-5 at a time, already implemented)
- Analytics runs asynchronously (fire-and-forget, never blocks UI)
- Monitor server load after deployment

### Configuration Options
- If needed, can add feature flag to disable auto-check
- Can adjust the 500ms delay
- Can implement sampling to reduce load
- Performance Analytics already supports sampling

---

## 🔄 Rollback Plan

If issues occur, you can:

1. **Disable Auto-Check**: Comment out the useEffect in TileDetail.tsx
2. **Remove Username Tracking**: Revert changes to collect.php
3. **Drop Column** (optional): Run `ALTER TABLE performance_metrics DROP COLUMN username;`

---

## 📝 Notes

- All changes are backward compatible
- Username column can be NULL (for anonymous users or old data)
- Auto-check only runs once per tile open
- Migration is idempotent (safe to run multiple times)
- No breaking changes to existing functionality

---

## ✅ Testing Checklist

- [x] Auto-check triggers when opening tile with links
- [x] Auto-check does NOT trigger when opening tile without links
- [x] Username captured in session and sent to PostgreSQL
- [x] Database schema includes username column
- [x] Index created for efficient username queries
- [x] Migration script tested and documented
- [x] No errors in browser console
- [x] No errors in PHP logs
- [x] Analytics data includes username
- [x] Can query by username in PostgreSQL

---

## 📚 Documentation

Comprehensive documentation available at:
- `.docs/POSTGRES_ANALYTICS_AUTO_CHECK_USERNAME.md` - Full implementation guide
- `analytics/migrations/README.md` - Migration instructions
- `analytics/migrations/add_username_column.sql` - Migration script with comments

---

**Implementation Date**: January 24, 2026  
**Status**: ✅ Complete and Ready for Deployment
