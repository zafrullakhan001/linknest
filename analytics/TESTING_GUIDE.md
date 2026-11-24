# Analytics Testing Guide

## Quick Test Steps

### 1. Test the Diagnostic Page
Open in browser: `http://localhost:9333/diagnostic.html`

This page will:
- ✅ Check if ANALYTICS_CONFIG is loaded
- ✅ Verify scripts are accessible
- ✅ Find links on the page
- ✅ Test the collection API
- ✅ Run the full scanner

### 2. Test the Beacon Tool
Open in browser: `http://localhost:9333/test-beacon.html`

This interactive tool allows you to:
- Send test metrics to the analytics system
- Test specific URLs (Google, GitHub, Example.com)
- Send bulk random metrics (10 at once)
- Check queue status and processing rates
- Verify API connectivity

### 3. Test the Link Scanner Page
Open in browser: `http://localhost:9333/test-link-scanner.html`

This page has test links and will automatically:
- Load the scanner script
- Find and test all links
- Send metrics to the API

### 4. Test Collection Flow (PHP)
Run in terminal:
```bash
php analytics/test-collection-flow.php
```

This will:
- Send test metrics to the API
- Check if they're in the queue
- Check if they're in performance_metrics table
- Show you exactly where data is stuck

## Common Issues & Solutions

### Issue: Scripts not loading
**Symptoms:** Console shows 404 errors for scripts

**Fix:** 
1. Check script paths in `landing.php` - should use `$basePath`
2. Verify files exist at `public/js/link-latency-scanner.js`
3. Check Apache is serving files from correct directory

### Issue: Metrics in queue but not processed
**Symptoms:** `test-collection-flow.php` shows metrics in queue but not in performance_metrics

**Fix:**
1. Start the processor: `php analytics/process-metrics-queue.php`
2. Or use: `analytics/start-workers-xampp.bat`
3. Check processor window for errors

### Issue: ANALYTICS_CONFIG not defined
**Symptoms:** Diagnostic page shows config is undefined

**Fix:**
1. Check if addon is enabled in Admin Panel → Add-ons
2. Verify `isPerformanceAnalyticsEnabled()` returns true
3. Check `landing.php` includes the config script block

### Issue: Links not being found
**Symptoms:** Scanner finds 0 links

**Fix:**
1. Check if links use `href="http..."` (external links)
2. Verify links don't have `class="no-scan"`
3. Check if `beaconUrls` is configured (if so, only those URLs are tested)

## Manual Testing Checklist

- [ ] Open `http://localhost:9333/diagnostic.html`
- [ ] Click "Check Config" - should show ANALYTICS_CONFIG
- [ ] Click "Check Scripts" - both scripts should be found
- [ ] Click "Find Links" - should find test links
- [ ] Click "Test Collection API" - should return success
- [ ] Click "Run Scanner" - should scan links and send metrics
- [ ] Run `php analytics/test-collection-flow.php`
- [ ] Check queue has metrics: `SELECT COUNT(*) FROM metrics_queue WHERE processed = FALSE`
- [ ] Start processor: `php analytics/process-metrics-queue.php`
- [ ] Wait 10 seconds, check metrics: `SELECT COUNT(*) FROM performance_metrics`
- [ ] Open dashboard: `http://localhost:9333` - should see URLs

## Database Queries

Check queue status:
```sql
SELECT COUNT(*) as total, 
       COUNT(*) FILTER (WHERE processed = FALSE) as pending,
       COUNT(*) FILTER (WHERE processed = TRUE) as processed
FROM metrics_queue;
```

Check recent metrics:
```sql
SELECT link_url, full_response_time, time, country_name
FROM performance_metrics
WHERE measurement_type = 'client'
ORDER BY time DESC
LIMIT 10;
```

Check if worker is processing:
```sql
SELECT MAX(processed_at) as last_processed
FROM metrics_queue
WHERE processed = TRUE;
```

## Expected Results

1. **Diagnostic page** should show all green checkmarks
2. **Test collection flow** should show metrics in queue and then in performance_metrics
3. **Dashboard** should show bubbles for each URL tested
4. **Browser console** should show `[Analytics]` log messages

If any step fails, check the error messages and fix accordingly.
