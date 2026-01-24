# Performance Analytics Add-on - Complete Guide

## Overview

The Performance Analytics add-on provides comprehensive URL performance monitoring with geographic insights for LinkNest. It tracks latency from both client browsers and your server, visualizes performance differences across regions, and helps identify network bottlenecks.

## Key Features

### 1. Dual-Perspective Latency Measurement

**Client-Side (Real User Monitoring)**:
- Measures actual user experience from their geographic location
- Captures network conditions, ISP performance, and distance effects
- Uses browser's Resource Timing API for accurate measurements

**Server-Side (Synthetic Monitoring)**:
- Measures latency from your data center's perspective
- Provides consistent baseline for comparison
- Helps identify if issues are user-side or application-side

### 2. Automatic Link Scanner

When users visit pages with links (favorites, landing pages):
- Automatically tests all visible links
- Measures DNS, TCP, TLS, TTFB, and total response time
- Displays latency badges: `98ms | 122ms` (client | server)
- Color-coded health indicators:
  - 🟢 Green: Client ≤ 1.5x server (good)
  - 🟡 Yellow: Client 1.5-3x server (degraded)
  - 🔴 Red: Client > 3x server (poor connectivity)

### 3. Geographic Performance Visualization

**Bubble Chart**:
- Each bubble = One geographic region (country/state/city)
- Position: Latitude & Longitude coordinates
- Size: Number of measurements (larger = more data)
- Color: Average latency (green=fast, yellow=medium, red=slow)
- Interactive tooltips with detailed stats

**Benefits**:
- Instantly identify regions with poor performance
- See where most users are located
- Compare performance across geographic areas
- Make data-driven decisions about CDN placement

### 4. Zero-Impact Architecture

When disabled:
- No database queries
- No JavaScript loaded
- No performance overhead
- Main app runs exactly as before

When enabled:
- Non-blocking async processing
- Queued metric collection
- Background workers handle heavy lifting
- ~5-10ms overhead (imperceptible)

## Technical Architecture

### Data Flow

```
User Browser
    ↓ (performance beacon)
Beacon JS collects metrics
    ↓ (navigator.sendBeacon)
Analytics API (port 8080)
    ↓ (INSERT INTO queue)
PostgreSQL metrics_queue
    ↓ (NOTIFY new_metrics)
Background Worker
    ↓ (GeoIP lookup + batch process)
TimescaleDB hypertable
    ↓ (auto-aggregate)
Continuous Aggregate (hourly)
    ↓ (query)
Dashboard Visualization
```

### Database Design

**TimescaleDB Hypertable**: Automatic time-based partitioning
- Data automatically partitioned by time
- Old data compressed (7 days)
- Old data deleted (90 days)
- Efficient queries across billions of records

**Continuous Aggregates**: Pre-computed statistics
- Auto-refreshed every 30 minutes
- Groups by: time, URL, region, measurement type
- Calculates: avg, p50, p95, p99, min, max
- Dashboard queries run instantly

**Trigger-Based Summary**: Real-time updates
- `link_latency_summary` updated on every insert
- Fast lookups for UI display
- No need to scan full metrics table

### Background Processing

**Metrics Queue Processor** (`analytics/process-metrics-queue.php`):
- Listens for PostgreSQL NOTIFY events
- Processes queue in batches of 1000
- Uses SKIP LOCKED for concurrent processing
- Looks up geolocation (MaxMind offline)
- Bulk inserts into hypertable

**Server Checker Worker** (`analytics/server-checker-worker.php`):
- Periodically checks links from server perspective
- Uses cURL for detailed timing
- Runs every 5 minutes
- Independent of client measurements

## Installation Details

### File Structure

```
linknest/
├── api/
│   ├── addons.php              [NEW] Admin configuration API
│   ├── auth.php                [MODIFIED] Added trackUserLogin() call
│   └── config.php              [MODIFIED] Added helper functions
├── components/
│   ├── AdminPanel.tsx          [MODIFIED] Added Add-ons tab
│   └── AddonsManagement.tsx    [NEW] Add-on configuration UI
├── public/js/
│   ├── performance-beacon.js   [NEW] Page performance collector
│   └── link-latency-scanner.js [NEW] Link testing & display
└── analytics/                  [NEW] Separate analytics application
    ├── schema.sql              Database schema with TimescaleDB
    ├── process-metrics-queue.php Metrics processing daemon
    ├── server-link-checker.php Server-side URL checker
    ├── server-checker-worker.php Server checker daemon
    ├── .htaccess               URL rewriting for API routes
    ├── apache-vhost-analytics.conf Virtual host config
    ├── api/
    │   ├── config_analytics.php PostgreSQL connection helper
    │   ├── metrics/
    │   │   └── collect.php     Metrics collection endpoint
    │   └── performance/
    │       ├── bubble-chart.php Regional visualization data
    │       ├── regions.php      Performance by region
    │       ├── timeseries.php   Time-series data
    │       ├── link-latency.php Single URL summary
    │       ├── alerts.php       Performance violations
    │       ├── comparison.php   Client vs server comparison
    │       └── users.php        User geolocation data
    ├── geoip/
    │   ├── geoip.php           GeoIP lookup functions
    │   ├── GeoLite2-City.mmdb  [DOWNLOAD] MaxMind database
    │   └── README.md           GeoIP setup instructions
    └── dashboard/
        ├── index.html          Dashboard UI
        ├── app.js              Dashboard logic & visualizations
        └── styles.css          Dashboard styling
```

### Database Tables

**SQLite (main app)**:
- `addon_status`: Track addon availability and health
- `settings`: Store PostgreSQL connection details and configuration

**PostgreSQL (analytics)**:
- `metrics_queue`: Fast insert queue (JSONB payload)
- `performance_metrics`: TimescaleDB hypertable (partitioned)
- `link_latency_summary`: Real-time summary (updated by trigger)
- `user_geolocations`: Login location tracking
- `alert_thresholds`: Alerting configuration
- `performance_by_region_hourly`: Continuous aggregate (materialized view)

## Use Cases

### 1. Identify Regional Performance Issues

**Scenario**: Users in Southeast Asia report slow loading.

**Solution**:
1. Open analytics dashboard
2. Filter by last 7 days
3. Look at bubble chart - SEA region shows red (500ms avg)
4. Compare to server latency - server shows 50ms
5. **Insight**: 10x degradation = network issue, not application
6. **Action**: Deploy CDN edge node in Singapore

### 2. Measure CDN Effectiveness

**Scenario**: Just deployed Cloudflare CDN, want to measure impact.

**Solution**:
1. View time-series chart before deployment
2. Enable CDN
3. Monitor dashboard for 24 hours
4. Compare latency delta: before vs after
5. **Result**: Client latency reduced from 450ms → 120ms in Europe

### 3. Troubleshoot User-Specific Issues

**Scenario**: User reports "application is slow".

**Solution**:
1. Navigate to: Admin Panel → Add-ons → Performance Analytics
2. Click "Open Analytics Dashboard"
3. Filter by: Performance → Users
4. Search for username
5. View their login location and performance metrics
6. **Insight**: User is in rural area with poor ISP connectivity
7. **Action**: Recommend VPN or different network

### 4. Capacity Planning

**Scenario**: Planning infrastructure expansion.

**Solution**:
1. View bubble chart with granularity = city
2. Identify high-traffic regions (large bubbles)
3. Check latency in those regions
4. **Decision**: Prioritize edge nodes where traffic AND latency are high

## Advanced Configuration

### Custom Thresholds

Set performance alerting thresholds directly in PostgreSQL:

```sql
INSERT INTO alert_thresholds (
    link_url,
    country_code,
    threshold_type,
    max_avg_latency,
    max_p95_latency,
    is_enabled,
    alert_email
) VALUES (
    'https://myapp.example.com',
    'US',
    'client',
    300,  -- Alert if avg > 300ms
    500,  -- Alert if p95 > 500ms
    TRUE,
    ARRAY['admin@example.com']
);
```

### Sampling Rate Optimization

Adjust based on traffic volume:

| Daily Users | Recommended Sample Rate | Metrics/Day |
|-------------|-------------------------|-------------|
| < 1,000 | 1.0 (100%) | < 1,000 |
| 1,000 - 10,000 | 0.1 (10%) | 1,000 - 10,000 |
| 10,000 - 100,000 | 0.01 (1%) | 1,000 - 10,000 |
| > 100,000 | 0.001 (0.1%) | 1,000 - 10,000 |

Lower sample rate = less storage, still statistically valid.

### Multiple Workers

For high-volume scenarios, run multiple worker instances:

```bash
# Terminal 1
php analytics\worker.php

# Terminal 2
php analytics\worker.php

# Both will process queue concurrently using SKIP LOCKED
```

## Data Privacy

### IP Address Handling

- IPs are looked up for geolocation
- Only geographic data (country, region, city, lat/lon) is stored
- Original IPs can be optionally stored or discarded
- Complies with GDPR requirements

### User Tracking

- User IDs are stored for authenticated users
- Session IDs track anonymous users
- No personally identifiable information beyond username
- Data retention policy (90 days default)

### Opt-Out

Users cannot currently opt-out individually. To respect privacy:
- Only sample a percentage of traffic
- Don't track specific sensitive pages
- Use short retention periods
- Consider adding user-level opt-out preference

## Performance Optimization Tips

### 1. Increase Sample Rate for Popular Pages

```php
// In admin panel, set beacon URLs:
https://yourapp.com/important-page
```

### 2. Adjust Worker Batch Size

Edit `analytics/worker.php`:
```php
$batchSize = 2000; // Process more items per batch
```

### 3. Reduce Aggregate Refresh Frequency

For lower-traffic sites, refresh less often:
```sql
-- Change from 30 minutes to 1 hour
SELECT add_continuous_aggregate_policy('performance_by_region_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);
```

### 4. Increase Data Compression

Compress data more aggressively:
```sql
-- Compress after 3 days instead of 7
SELECT add_compression_policy('performance_metrics', INTERVAL '3 days');
```

## Maintenance

### Weekly Tasks
- Check worker status (should be running continuously)
- Review dashboard for anomalies
- Check queue backlog (should be near zero)

### Monthly Tasks
- Update GeoLite2 database (download new version)
- Review storage usage
- Adjust retention policy if needed
- Clean up old alert thresholds

### As Needed
- Scale workers if queue backlog grows
- Adjust sample rate based on traffic changes
- Add new monitored URLs in admin panel

## FAQ

**Q: Does this slow down my main application?**
A: No. When disabled, there's zero impact. When enabled, the overhead is ~5-10ms which is imperceptible.

**Q: How much storage does it use?**
A: ~100MB per million metrics after compression. With 10% sampling and 1000 users/day, expect ~10MB/month.

**Q: Can I use this with Nginx instead of Apache?**
A: Yes! The PHP files work with any web server. Configure Nginx similarly with proxy_pass or fastcgi_pass.

**Q: What if PostgreSQL goes down?**
A: Main app continues normally. Analytics functions return early with zero impact.

**Q: Can I track specific URLs only?**
A: Yes! In Admin Panel → Add-ons, enter URLs in "Monitored URLs" field (one per line).

**Q: How accurate is the geolocation?**
A: MaxMind GeoLite2 provides city-level accuracy (~95% country-level, ~80% city-level). Latitude/longitude is approximate center of region.

## Diagnostic & Testing Tools

The add-on includes built-in diagnostic and testing tools:

### 1. Diagnostics Tool
**URL**: `http://localhost:9333/diagnostic.html`

Comprehensive diagnostic page that checks:
- ✅ ANALYTICS_CONFIG availability and configuration
- ✅ Script loading (performance-beacon.js, link-latency-scanner.js)
- ✅ Link detection on the page
- ✅ Collection API connectivity
- ✅ Full scanner functionality
- ✅ Live logging for troubleshooting

Access from dashboard header or directly via URL.

### 2. Test Beacon Tool
**URL**: `http://localhost:9333/test-beacon.html`

Interactive testing interface for:
- 🧪 Sending test metrics to the analytics system
- 🧪 Testing specific URLs (Google, GitHub, Example.com)
- 🧪 Sending bulk random metrics (10 at once)
- 🧪 Checking queue status and processing rates
- 🧪 Verifying API connectivity

Perfect for verifying the add-on is working correctly after installation.

## Success!

If you've completed the Quick Start and can see:
- ✓ Latency badges on favorite links
- ✓ Bubble chart with data on dashboard
- ✓ Workers processing metrics
- ✓ No errors in logs
- ✓ Diagnostic tools accessible at http://localhost:9333/diagnostic.html
- ✓ Test beacon working at http://localhost:9333/test-beacon.html

**Congratulations!** Your Performance Analytics add-on is fully operational! 🎉

Now you can:
- Identify regional performance issues
- Compare client vs server latency
- Track performance trends over time
- Make data-driven infrastructure decisions
- Use diagnostic tools for troubleshooting