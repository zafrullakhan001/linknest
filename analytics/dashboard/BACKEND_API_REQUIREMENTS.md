# Backend API Requirements for New Charts

## Overview
Most of the new charts work with existing data from the bubble chart endpoint. However, two charts require new API endpoints to provide time-series and heatmap data.

## ✅ Charts Working with Existing Data

These charts use data from `/api/performance/bubble-chart`:
- **Bar Chart** ✅
- **Pie Chart** ✅
- **Histogram** ✅
- **Scatter Plot** ✅

No backend changes needed for these!

## 🔧 New API Endpoints Needed

### 1. Time Series Endpoint

**Endpoint:** `/api/performance/timeseries`

**Method:** GET

**Parameters:**
- `period` (required): `1h`, `24h`, `7d`, or `30d`
- `type` (required): `client` or `server`
- `url` (optional): Filter by specific URL

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "time_bucket": "2024-01-23T10:00:00Z",
      "avg_latency": 145.5,
      "p95": 280.3,
      "measurement_count": 1250,
      "timestamp": "2024-01-23T10:00:00Z"
    },
    {
      "time_bucket": "2024-01-23T11:00:00Z",
      "avg_latency": 152.8,
      "p95": 295.1,
      "measurement_count": 1380
    }
    // ... more time buckets
  ]
}
```

**SQL Query Example (PostgreSQL):**
```sql
SELECT 
    date_trunc('hour', created_at) as time_bucket,
    AVG(latency_ms) as avg_latency,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95,
    COUNT(*) as measurement_count
FROM performance_metrics
WHERE 
    measurement_type = $1  -- 'client' or 'server'
    AND created_at >= NOW() - INTERVAL $2  -- period
    AND ($3 IS NULL OR link_url = $3)  -- optional URL filter
GROUP BY time_bucket
ORDER BY time_bucket ASC;
```

**Time Bucket Granularity:**
- `1h` period → 5-minute buckets
- `24h` period → 1-hour buckets
- `7d` period → 6-hour buckets
- `30d` period → 1-day buckets

---

### 2. Heatmap Endpoint

**Endpoint:** `/api/performance/heatmap`

**Method:** GET

**Parameters:**
- `period` (required): `1h`, `24h`, `7d`, or `30d`
- `type` (required): `client` or `server`
- `url` (optional): Filter by specific URL

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "hour": 0,
      "day_of_week": 0,
      "avg_latency": 125.3,
      "measurement_count": 450
    },
    {
      "hour": 1,
      "day_of_week": 0,
      "avg_latency": 118.7,
      "measurement_count": 320
    },
    {
      "hour": 0,
      "day_of_week": 1,
      "avg_latency": 142.1,
      "measurement_count": 580
    }
    // ... one entry for each hour (0-23) × day (0-6) combination
  ]
}
```

**Field Definitions:**
- `hour`: 0-23 (hour of day in 24-hour format)
- `day_of_week`: 0-6 (0=Sunday, 1=Monday, ..., 6=Saturday)
- `avg_latency`: Average latency in milliseconds
- `measurement_count`: Number of measurements in that time slot

**SQL Query Example (PostgreSQL):**
```sql
SELECT 
    EXTRACT(HOUR FROM created_at) as hour,
    EXTRACT(DOW FROM created_at) as day_of_week,
    AVG(latency_ms) as avg_latency,
    COUNT(*) as measurement_count
FROM performance_metrics
WHERE 
    measurement_type = $1  -- 'client' or 'server'
    AND created_at >= NOW() - INTERVAL $2  -- period
    AND ($3 IS NULL OR link_url = $3)  -- optional URL filter
GROUP BY hour, day_of_week
ORDER BY day_of_week, hour;
```

---

## Implementation Priority

### High Priority (Required for full functionality)
1. **Time Series Endpoint** - Provides critical trend analysis
2. **Heatmap Endpoint** - Reveals time-based patterns

### Low Priority (Nice to have)
- Add caching for these endpoints (they can be expensive queries)
- Add data aggregation for older data to improve performance
- Consider pre-computing these views in a materialized view

---

## Testing the Endpoints

### Test Time Series:
```bash
curl "http://localhost:9333/api/performance/timeseries?period=24h&type=client"
```

### Test Heatmap:
```bash
curl "http://localhost:9333/api/performance/heatmap?period=7d&type=client"
```

### Test with URL Filter:
```bash
curl "http://localhost:9333/api/performance/timeseries?period=24h&type=client&url=https://example.com"
```

---

## Fallback Behavior

If these endpoints are not implemented yet:
- Charts will display "No data available" message
- No errors will be thrown
- Other charts will continue to work normally
- Dashboard remains functional

---

## Performance Considerations

### For Time Series:
- Limit to 100 data points max
- Use appropriate time bucket sizes based on period
- Consider caching results for 1-5 minutes

### For Heatmap:
- Maximum 168 cells (24 hours × 7 days)
- Can be cached for 5-10 minutes
- Consider using a materialized view for large datasets

### Database Indexes:
```sql
-- Recommended indexes for performance
CREATE INDEX idx_metrics_created_at ON performance_metrics(created_at);
CREATE INDEX idx_metrics_type_created ON performance_metrics(measurement_type, created_at);
CREATE INDEX idx_metrics_url_created ON performance_metrics(link_url, created_at);
```

---

## Example PHP Implementation Stubs

### timeseries.php
```php
<?php
// In your api/performance.php or similar

function handleTimeSeriesRequest() {
    $period = $_GET['period'] ?? '24h';
    $type = $_GET['type'] ?? 'client';
    $url = $_GET['url'] ?? null;
    
    // Convert period to SQL interval
    $intervals = [
        '1h' => '1 hour',
        '24h' => '24 hours',
        '7d' => '7 days',
        '30d' => '30 days'
    ];
    
    $interval = $intervals[$period] ?? '24 hours';
    
    // TODO: Implement query
    // For now, return empty data
    header('Content-Type: application/json');
    echo json_encode([
        'success' => true,
        'data' => []
    ]);
}
```

### heatmap.php
```php
<?php
function handleHeatmapRequest() {
    $period = $_GET['period'] ?? '7d';
    $type = $_GET['type'] ?? 'client';
    $url = $_GET['url'] ?? null;
    
    // TODO: Implement query
    // For now, return empty data
    header('Content-Type: application/json');
    echo json_encode([
        'success' => true,
        'data' => []
    ]);
}
```

---

## Next Steps

1. ✅ Frontend charts are ready and waiting
2. ⏳ Implement `/api/performance/timeseries` endpoint
3. ⏳ Implement `/api/performance/heatmap` endpoint
4. ✅ Test with real data
5. ✅ Optimize queries if needed
6. ✅ Add caching layer

The dashboard will work immediately with the existing bubble chart data. The time series and heatmap will activate once you implement their endpoints!
