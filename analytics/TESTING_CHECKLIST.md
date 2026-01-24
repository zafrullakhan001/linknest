# Performance Analytics Testing Checklist

Use this checklist to verify the add-on is working correctly.

## Pre-Installation Tests

- [ ] PostgreSQL is running on localhost:5433
- [ ] Can connect with: `psql -h localhost -p 5433 -U postgres`
- [ ] Apache is running on ports 80 and 443
- [ ] Port 9333 is available (not in use)
- [ ] PHP CLI is accessible: `php --version`

## Installation Tests

### Database Setup
- [ ] Run `php scripts/setup-analytics-addon.php` - no errors
- [ ] Output shows "✓ Setup Complete!"
- [ ] All 5 tables created (metrics_queue, performance_metrics, link_latency_summary, user_geolocations, alert_thresholds)
- [ ] TimescaleDB extension enabled
- [ ] Continuous aggregate created

### Configuration Tests
- [ ] Can login to LinkNest as admin
- [ ] Admin Panel → Add-ons tab exists
- [ ] Performance Analytics card displayed
- [ ] Click "Configure" - form appears
- [ ] Enter PostgreSQL credentials
- [ ] Click "Test Connection" - shows success ✓
- [ ] Shows PostgreSQL version
- [ ] Shows "Schema ready" or lists existing tables
- [ ] Click "Save Configuration" - success message
- [ ] Toggle switch to ON (enabled)
- [ ] Status badge changes to "Active"

### Worker Tests
- [ ] Start metrics processor: `php analytics\process-metrics-queue.php`
- [ ] Processor connects successfully
- [ ] No errors in output
- [ ] Start server checker: `php analytics\server-checker-worker.php`
- [ ] Server checker initializes
- [ ] Both processors running in separate terminals

## Functional Tests

### Backend Tests
- [ ] Run `php scripts\test-analytics-connection.php`
- [ ] Shows "Addon enabled: YES"
- [ ] Shows "Connection successful"
- [ ] Shows "TimescaleDB is installed"
- [ ] All tables listed
- [ ] No error messages

### Client-Side Tests
- [ ] Visit `http://localhost/landing.php`
- [ ] View page source - contains `window.ANALYTICS_CONFIG`
- [ ] `performance-beacon.js` is loaded
- [ ] `link-latency-scanner.js` is loaded
- [ ] Browser console shows: "[Analytics] Scanning X links..."
- [ ] No JavaScript errors in console

### Link Scanner Tests
- [ ] Visit page with favorite links
- [ ] Wait 5-10 seconds
- [ ] Latency badges appear next to links
- [ ] Format is "XXms | YYms"
- [ ] Badges are color-coded (green/yellow/red)
- [ ] Hover shows tooltip with details
- [ ] Links without badges show "✗" for errors

### Data Collection Tests
- [ ] Check queue after page visit:
  ```sql
  SELECT COUNT(*) FROM metrics_queue WHERE processed = FALSE;
  ```
  Should show pending items
  
- [ ] Wait 1 minute for worker to process
- [ ] Check queue again - items should be processed
- [ ] Check metrics table:
  ```sql
  SELECT COUNT(*) FROM performance_metrics;
  ```
  Should show records

### Dashboard Tests
- [ ] Open `http://localhost:9333` in browser
- [ ] Dashboard loads without errors
- [ ] Shows "Performance Analytics Dashboard" header
- [ ] Filter dropdowns work
- [ ] Click "Refresh Data" button
- [ ] Bubble chart appears (if data exists)
- [ ] Chart is interactive (hover shows tooltips)
- [ ] Comparison table shows data
- [ ] Stats cards show numbers

## Integration Tests

### Login Tracking Tests
- [ ] Logout from LinkNest
- [ ] Login again
- [ ] Check user_geolocations table:
  ```sql
  SELECT * FROM user_geolocations ORDER BY login_time DESC LIMIT 1;
  ```
- [ ] Should show new login record with geo data
- [ ] Country code is not 'XX' (unless using local IP)

### Server-Side Measurement Tests
- [ ] Wait for server checker cycle (5 minutes)
- [ ] Check performance_metrics for server measurements:
  ```sql
  SELECT * FROM performance_metrics 
  WHERE measurement_type = 'server' 
  ORDER BY time DESC LIMIT 5;
  ```
- [ ] Should show recent server checks
- [ ] Country code should be 'SERVER'

### Link Latency Summary Tests
- [ ] Check summary table:
  ```sql
  SELECT * FROM link_latency_summary LIMIT 5;
  ```
- [ ] Should show both client_avg_latency and server_avg_latency
- [ ] latency_delta calculated correctly
- [ ] health_status is set appropriately

## Performance Impact Tests

### Zero-Impact When Disabled
- [ ] Disable addon in Admin Panel (toggle OFF)
- [ ] Visit landing page
- [ ] View source - no ANALYTICS_CONFIG
- [ ] No beacon JS loaded
- [ ] No latency badges appear
- [ ] Page loads at normal speed
- [ ] No analytics-related network requests

### Minimal Impact When Enabled
- [ ] Enable addon
- [ ] Visit landing page
- [ ] Check Network tab in browser DevTools
- [ ] Beacon request is non-blocking
- [ ] Page loads don't wait for beacon
- [ ] Total overhead < 50ms

### Graceful Degradation Tests
- [ ] Stop PostgreSQL
- [ ] Visit landing page
- [ ] Page loads normally (no errors)
- [ ] Check PHP error log - analytics errors logged but not displayed
- [ ] Main app functions normally
- [ ] Restart PostgreSQL
- [ ] Analytics resumes working

## API Endpoint Tests

Test each API endpoint:

### Metrics Collection
```bash
curl -X POST http://localhost:9333/api/metrics/collect \
  -H "Content-Type: application/json" \
  -d '{"type":"page_performance","url":"test","full_load":100,"timestamp":1234567890}'
```
Expected: 204 No Content

### Bubble Chart Data
```bash
curl "http://localhost:9333/api/performance/bubble-chart?period=24h&granularity=region&type=client"
```
Expected: JSON with regional data

### Link Latency
```bash
curl "http://localhost:9333/api/performance/link-latency?url=https://example.com"
```
Expected: JSON with client/server latency summary

### Alerts
```bash
curl "http://localhost:9333/api/performance/alerts"
```
Expected: JSON with current alerts (may be empty)

## Edge Case Tests

### Empty Data
- [ ] Fresh installation with no metrics
- [ ] Dashboard shows "No data available" message
- [ ] No JavaScript errors
- [ ] Stats show 0 or "-"

### Invalid URLs
- [ ] Scanner encounters 404 error
- [ ] Badge shows "✗" error indicator
- [ ] Error is logged but doesn't break page
- [ ] Other links continue to work

### Slow/Timeout URLs
- [ ] Scanner encounters timeout (>5s)
- [ ] Request is aborted gracefully
- [ ] Badge shows appropriate latency or error
- [ ] Page remains responsive

### High Volume
- [ ] Simulate high traffic (multiple tabs, refresh rapidly)
- [ ] Queue doesn't grow infinitely
- [ ] Workers process backlog
- [ ] No memory leaks in workers
- [ ] Database performance remains stable

## Security Tests

### Authentication
- [ ] Analytics API endpoints don't expose sensitive data
- [ ] Admin-only endpoints require authentication (addons.php)
- [ ] Regular users cannot access addon configuration
- [ ] PostgreSQL credentials are not exposed in client-side code

### CORS
- [ ] Cross-origin requests from localhost:80 → localhost:9333 work
- [ ] CORS headers present in responses
- [ ] OPTIONS preflight requests handled correctly

### SQL Injection
- [ ] Test malformed URLs in API requests
- [ ] Test SQL injection attempts in parameters
- [ ] All inputs are parameterized/escaped

## Final Verification

- [ ] Main LinkNest app works normally
- [ ] Can enable/disable addon from Admin Panel
- [ ] Workers process metrics without errors
- [ ] Dashboard displays data correctly
- [ ] Latency badges appear on links
- [ ] Geographic data is accurate
- [ ] No performance degradation in main app
- [ ] Logs show no errors (Apache + PHP)
- [ ] Can restart Apache/PostgreSQL without issues

## Acceptance Criteria

The addon is fully operational when:

1. ✓ Admin can enable/disable from GUI without code changes
2. ✓ When disabled, zero performance impact (verified with profiling)
3. ✓ When enabled, link scanner automatically tests favorite links
4. ✓ Latency badges show "98ms | 122ms" format correctly
5. ✓ Color-coding indicates health (green/yellow/red)
6. ✓ Bubble chart displays regional performance aggregation
7. ✓ Dashboard shows client vs server comparison
8. ✓ User logins tracked with geographic data (lat/lon)
9. ✓ Workers run continuously without errors or memory leaks
10. ✓ System gracefully handles PostgreSQL unavailability

## Rollback Procedure

If issues occur:

1. Disable addon in Admin Panel (toggle OFF)
2. Stop workers (Ctrl+C in terminals)
3. Verify main app works normally
4. Review logs for root cause
5. Fix issue and re-enable when ready

The main LinkNest application will be unaffected.

## Sign-Off

After completing all tests above:

- [ ] All critical tests passed
- [ ] No blocking issues found
- [ ] Documentation reviewed and accurate
- [ ] Addon ready for production use

Tested by: _______________
Date: _______________
Signature: _______________
