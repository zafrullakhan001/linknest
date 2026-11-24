# Performance Analytics Quick Start Guide

Get the Performance Analytics add-on running in 10 minutes!

## Prerequisites Checklist

- [ ] PostgreSQL 12+ running on localhost:5433
- [ ] TimescaleDB extension available
- [ ] Apache running on port 80
- [ ] Port 9333 available for analytics dashboard

## Quick Setup (10 Minutes)

### 1. Configure in Admin Panel (2 minutes)

1. Open LinkNest: `http://localhost`
2. Login as admin
3. Navigate to: **Admin Panel → Add-ons**
4. Find "Performance Analytics" card
5. Click "Configure"
6. Enter details:
   ```
   Host: localhost
   Port: 5433
   Database: linknest_analytics
   Username: postgres
   Password: [your password]
   Dashboard URL: http://localhost:9333
   ```
7. Click "Test Connection" - should show ✓ green success
8. Click "Save Configuration"
9. **Toggle switch to ON** (Enable)

### 2. Initialize Database (1 minute)

Open command prompt and run:
```bash
cd c:\xampp\htdocs\linknest
php scripts\setup-analytics-addon.php
```

Expected output:
```
✓ Connected successfully
✓ TimescaleDB extension enabled
✓ Schema created
✓ All required tables created
✓ Setup Complete!
```

### 3. Install GeoIP Database (3 minutes)

**Option A: Quick Test (Skip GeoIP)**
Workers will function without GeoIP, but won't have location data. Skip to Step 4 for testing.

**Option B: Full Setup**
1. Sign up at: https://dev.maxmind.com/geoip/geolite2-free-geolocation-data
2. Download `GeoLite2-City.mmdb`
3. Place in: `c:\xampp\htdocs\linknest\analytics\geoip\GeoLite2-City.mmdb`
4. Install library:
   ```bash
   cd c:\xampp\htdocs\linknest
   composer require geoip2/geoip2:~2.0
   ```

### 4. Configure Apache (2 minutes)

1. Open: `C:\xampp\apache\conf\httpd.conf`

2. Add this line at the end:
   ```apache
   Include C:/xampp/htdocs/linknest/analytics/apache-vhost-analytics.conf
   ```

3. Restart Apache:
   - Open XAMPP Control Panel
   - Click "Stop" next to Apache
   - Click "Start"
   - Verify both ports 80 and 9333 are active

### 5. Start Workers (1 minute)

**Terminal 1:**
```bash
cd c:\xampp\htdocs\linknest
php analytics\process-metrics-queue.php
```

**Terminal 2:**
```bash
cd c:\xampp\htdocs\linknest
php analytics\server-checker-worker.php
```

Leave these running in the background.

### 6. Test It! (1 minute)

1. Visit: `http://localhost/landing.php`
2. Look for latency badges next to links: `98ms | 122ms`
3. Open dashboard: `http://localhost:9333`
4. Should see bubble chart with data after a few seconds
5. **Test diagnostic tools**:
   - Diagnostics: `http://localhost:9333/diagnostic.html` (check configuration, scripts, API)
   - Test Beacon: `http://localhost:9333/test-beacon.html` (send test metrics, check queue)

## Verification

Run the test script:
```bash
php scripts\test-analytics-connection.php
```

Should show:
```
✓ Addon enabled: YES
✓ Connection successful
✓ TimescaleDB is installed
✓ All tables created
✓ Workers processing data
```

## Quick Test Without Full Setup

Want to test functionality without GeoIP or multiple workers?

1. Follow Steps 1-2 above (Admin config + Database init)
2. Start only the metrics processor:
   ```bash
   php analytics\process-metrics-queue.php
   ```
3. Workers will function with "Unknown" as location
4. You can still see latency measurements and test the system

## Troubleshooting

### "Connection failed"
- Check PostgreSQL is running: `psql -h localhost -p 5433 -U postgres -l`
- Verify credentials in Admin Panel
- Run: `php scripts\test-analytics-connection.php`

### "Schema not ready"
- Run: `php scripts\setup-analytics-addon.php`
- Check output for errors

### Workers not processing
- Verify workers are running (check terminal output)
- Check PostgreSQL queue: 
  ```sql
  SELECT COUNT(*) FROM metrics_queue WHERE processed = FALSE;
  ```
- Look for PHP errors in worker terminal

### No latency badges on page
- Check browser console for JavaScript errors
- Verify addon is enabled in Admin Panel
- Check that beacon JS files exist in `public/js/`

### Dashboard shows no data
- Wait 1-2 minutes for data collection
- Check worker is processing queue
- Verify port 9333 is accessible
- Check Apache logs: `C:\xampp\apache\logs\analytics-error.log`
- Use diagnostic tool: `http://localhost:9333/diagnostic.html` to verify configuration
- Use test beacon: `http://localhost:9333/test-beacon.html` to send test data

## Next Steps

Once running:

1. **Configure Thresholds**: Set performance alerting thresholds in PostgreSQL
2. **Monitor Dashboard**: Watch for regional performance patterns
3. **Optimize**: Use insights to identify CDN needs or infrastructure improvements
4. **Scale**: Add more worker processes if handling high volume

## Running as Windows Service

To run workers permanently:

1. Download NSSM: https://nssm.cc/download
2. Install metrics worker:
   ```bash
   nssm install LinkNest-Analytics-Worker "C:\xampp\php\php.exe" "C:\xampp\htdocs\linknest\analytics\worker.php"
   nssm start LinkNest-Analytics-Worker
   ```
3. Install server checker:
   ```bash
   nssm install LinkNest-Server-Checker "C:\xampp\php\php.exe" "C:\xampp\htdocs\linknest\analytics\server-checker-worker.php"
   nssm start LinkNest-Server-Checker
   ```

## Support

- Check logs: `C:\xampp\apache\logs\analytics-error.log`
- Test connection: `php scripts\test-analytics-connection.php`
- Review worker output for errors
- Verify PostgreSQL is running: `netstat -an | findstr 5433`

Happy monitoring! 📊
