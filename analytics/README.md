# Performance Analytics Add-on

Real-time URL performance monitoring with geographic insights for LinkNest.

## Features

- **Dual-Perspective Measurement**: Track latency from both client browsers and server data center
- **Geographic Insights**: Visualize performance differences across regions with latitude/longitude mapping
- **Bubble Chart Visualization**: See at a glance which regions have the best/worst performance
- **Link Scanner**: Automatically test all links on favorite pages and display latency badges
- **Time-Series Analysis**: Track performance trends over time
- **Zero-Impact Design**: When disabled, absolutely no performance overhead on main application
- **Admin-Configurable**: All setup through GUI, no manual file editing

## Architecture

```
Main LinkNest App (SQLite, Port 80)
        ↓ (if enabled)
Client Browser → JavaScript Beacon → Analytics API (Port 9333)
                                            ↓
                                     PostgreSQL Queue
                                            ↓
                              Background Worker + GeoIP
                                            ↓
                                  TimescaleDB (metrics storage)
                                            ↓
                                  Dashboard (bubble charts)
```

## Requirements

### Software
- PostgreSQL 12+ with TimescaleDB extension
- PHP 8.0+ with PDO PostgreSQL extension
- Apache or Nginx web server
- Composer (for GeoIP2 library)

### Resources
- ~100MB storage per million metrics (compressed)
- Separate port for analytics dashboard (default: 9333)
- MaxMind GeoLite2 database (free download)

## Installation

### Step 1: Database Setup

1. Create PostgreSQL database:
```bash
createdb -h localhost -p 5433 -U postgres linknest_analytics
```

2. Run the setup script:
```bash
php scripts/setup-analytics-addon.php
```

This will:
- Connect to PostgreSQL using settings from Admin Panel
- Enable TimescaleDB extension
- Create all required tables
- Set up compression and retention policies

### Step 2: GeoIP Database

1. Sign up for MaxMind GeoLite2 (free):
   - https://dev.maxmind.com/geoip/geolite2-free-geolocation-data

2. Download `GeoLite2-City.mmdb`

3. Place in: `analytics/geoip/GeoLite2-City.mmdb`

4. Install PHP library:
```bash
cd c:\xampp\htdocs\linknest
composer require geoip2/geoip2:~2.0
```

### Step 3: Apache Configuration

1. Edit `C:\xampp\apache\conf\httpd.conf` and add:
```apache
Include conf/extra/httpd-vhost-analytics.conf
```

2. Copy the configuration:
```bash
copy analytics\apache-vhost-analytics.conf C:\xampp\apache\conf\extra\httpd-vhost-analytics.conf
```

3. Restart Apache:
```bash
C:\xampp\apache\bin\httpd.exe -k restart
```

### Step 4: Start Background Workers

Open two command prompts and run:

**Terminal 1 - Metrics Processor:**
```bash
cd c:\xampp\htdocs\linknest
php analytics\process-metrics-queue.php
```

**Terminal 2 - Server Link Checker:**
```bash
cd c:\xampp\htdocs\linknest
php analytics\server-checker-worker.php
```

**Tip**: Use Windows Task Scheduler or NSSM to run these as services.

### Step 5: Configure in Admin Panel

1. Login to LinkNest as admin
2. Go to **Admin Panel → Add-ons**
3. Find "Performance Analytics" card
4. Click "Configure"
5. Enter PostgreSQL connection details:
   - Host: `localhost`
   - Port: `5433`
   - Database: `linknest_analytics`
   - Username: `postgres`
   - Password: `your_password`
6. Click "Test Connection"
7. Configure tracking options:
   - Sample Rate: `0.1` (10% of traffic)
   - Track Anonymous: ✓
   - Track Logins: ✓
   - Dashboard URL: `http://localhost:9333`
8. Click "Save Configuration"
9. Toggle switch to **Enable**

### Step 6: Verify Installation

Run the test script:
```bash
php scripts/test-analytics-connection.php
```

Expected output:
```
✓ Addon enabled: YES
✓ Connection successful
✓ TimescaleDB is installed
✓ All tables created
✓ Workers processing data
```

## Usage

### For End Users

When the addon is enabled, users will see:

1. **Latency badges** next to favorite links showing "98ms | 122ms" format:
   - First value = Client-side latency (from their browser)
   - Second value = Server-side latency (from data center)
   - Color-coded: Green (good), Yellow (degraded), Red (poor)

2. **Automatic testing** when visiting pages with links

### For Administrators

1. **View Analytics Dashboard**: http://localhost:9333
   
2. **Bubble Chart**: Shows regional performance
   - X-axis: Longitude
   - Y-axis: Latitude
   - Bubble size: Number of measurements
   - Bubble color: Average latency (green=fast, red=slow)

3. **Comparison Table**: Client vs Server latency by region

4. **Performance Alerts**: Regions exceeding thresholds

5. **Time-Series Charts**: Performance trends over time

### Diagnostic & Testing Tools

The add-on includes built-in diagnostic and testing tools accessible directly from the dashboard:

1. **Diagnostics Tool**: http://localhost:9333/diagnostic.html
   - Check if ANALYTICS_CONFIG is loaded
   - Verify scripts are accessible
   - Find links on the page
   - Test the collection API
   - Run the full scanner
   - Live logging for troubleshooting

2. **Test Beacon Tool**: http://localhost:9333/test-beacon.html
   - Send test metrics to the analytics system
   - Test specific URLs (Google, GitHub, Example.com)
   - Send bulk random metrics
   - Check queue status
   - Verify API connectivity

These tools are also accessible via the "Diagnostics" and "Test Beacon" buttons in the dashboard header.

## Database Schema

### Main Tables

- **metrics_queue**: Fast insert queue for incoming metrics
- **performance_metrics**: TimescaleDB hypertable (partitioned by time)
- **link_latency_summary**: Real-time summary for quick lookups
- **user_geolocations**: Track user login locations
- **alert_thresholds**: Configure performance alerting

### Views & Aggregates

- **performance_by_region_hourly**: Continuous aggregate (auto-refreshed every 30 min)
- **performance_alerts**: Current violations view
- **user_current_location**: Latest user location view

## API Endpoints

### Collection API (receives data from browsers)
- `POST /api/metrics/collect` - Receive performance metrics

### Query APIs (for dashboard)
- `GET /api/performance/bubble-chart` - Regional aggregation for visualization
- `GET /api/performance/regions` - Performance by region
- `GET /api/performance/timeseries` - Time-series data
- `GET /api/performance/link-latency` - Single URL latency summary
- `GET /api/performance/alerts` - Current alerts
- `GET /api/performance/comparison` - Client vs server comparison
- `GET /api/performance/users` - User geolocation data

## Configuration Options

All settings are in the Admin Panel → Add-ons:

| Setting | Default | Description |
|---------|---------|-------------|
| Sample Rate | 0.1 | Percentage of traffic to track (10%) |
| Track Anonymous | true | Collect data from non-logged-in users |
| Track Logins | true | Capture geo location on user login |
| Retention Days | 90 | How long to keep metrics data |
| Beacon URLs | empty | Specific URLs to monitor (empty = all) |
| Dashboard URL | http://localhost:9333 | Where dashboard is hosted |

## Data Retention & Compression

- **Compression**: Data older than 7 days is automatically compressed
- **Retention**: Data older than 90 days is automatically deleted (configurable)
- **Storage**: ~100MB per million metrics (compressed)

## Performance Impact

### When Disabled
- Database queries: 0
- Memory overhead: 0
- CPU overhead: ~0.01ms per page load (cached boolean check)
- Network requests: 0

### When Enabled
- Client beacon: ~2KB JavaScript, non-blocking
- Collection API: ~5ms per request (async, queued)
- Worker processing: Independent background process
- Main app impact: Negligible (<1% overhead)

## Troubleshooting

### Workers Not Processing

Check if workers are running:
```bash
# Windows
tasklist | findstr php

# Look for: php.exe (worker.php and server-checker-worker.php)
```

View worker output for errors by running in foreground.

### No Geolocation Data

1. Verify `GeoLite2-City.mmdb` exists in `analytics/geoip/`
2. Check worker logs for GeoIP errors
3. Ensure `composer require geoip2/geoip2:~2.0` was run

### Dashboard Not Accessible

1. Verify Apache is listening on port 9333:
```bash
netstat -an | findstr 9333
```

2. Check Apache error log: `C:\xampp\apache\logs\analytics-error.log`

3. Verify virtual host configuration is included in httpd.conf

### Beacon Not Loading

1. Check browser console for errors
2. Verify `isPerformanceAnalyticsEnabled()` returns true
3. Check that JavaScript files exist in `public/js/`
4. Look for CORS errors (ensure port 9333 has CORS headers)

### Connection Failed

1. Run test script: `php scripts/test-analytics-connection.php`
2. Verify PostgreSQL is running on specified port
3. Check username/password are correct
4. Ensure database exists: `psql -h localhost -p 5433 -U postgres -l`

## Monitoring the Addon

### Check Queue Health
```sql
-- Connect to PostgreSQL
psql -h localhost -p 5433 -U postgres -d linknest_analytics

-- Check queue status
SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE processed = FALSE) as pending,
    COUNT(*) FILTER (WHERE processed = TRUE) as processed
FROM metrics_queue;

-- Check recent metrics
SELECT COUNT(*), measurement_type 
FROM performance_metrics 
WHERE time >= NOW() - INTERVAL '1 hour'
GROUP BY measurement_type;
```

### Check Worker Status
If workers are running but not processing, check:
- PostgreSQL LISTEN/NOTIFY is working
- No errors in worker output
- Queue table has items
- Workers have database permissions

## Uninstallation

To remove the addon:

1. Disable in Admin Panel → Add-ons (toggle OFF)
2. Stop background workers (Ctrl+C or kill process)
3. (Optional) Drop PostgreSQL database:
```sql
DROP DATABASE linknest_analytics;
```
4. (Optional) Remove Apache virtual host configuration and restart

The main LinkNest application will continue working normally.

## Support

For issues or questions:
1. Check worker logs for errors
2. Run `php scripts/test-analytics-connection.php` for diagnostics
3. Verify all setup steps were completed
4. Check Apache error logs for CORS or routing issues

## License

Part of LinkNest application.
