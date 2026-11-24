# Analytics Dashboard Updates - Username & IP Address Support

## Overview

The Analytics Dashboard has been updated to support **username** and **IP address** filtering and display, allowing you to track performance by individual users and anonymous visitors.

## ✅ What's New

### 1. New Filter Options

#### Username Filter
- **Type**: Text input field
- **Location**: Top filter bar
- **Usage**: Type any part of a username to filter results
- **Example**: Type "john" to see all users with "john" in their username
- **Supports**: Partial matching (case-insensitive)

#### IP Address Filter
- **Type**: Text input field
- **Location**: Top filter bar
- **Usage**: Type any part of an IP address to filter results
- **Example**: Type "192.168" to see all users from that subnet
- **Supports**: Partial matching

#### User Type Filter
- **Type**: Dropdown select
- **Options**:
  - **All Users** - Show both authenticated and anonymous
  - **Authenticated** - Only logged-in users (has username)
  - **Anonymous** - Only public/anonymous users (no username)

### 2. New Grouping Options

Added to the "Group By" dropdown:
- **Username** - Group metrics by username (see performance per user)
- **IP Address** - Group metrics by IP (see performance per IP)

### 3. Enhanced Data Table

Two new columns added to the table view:
- **Username** - Shows the username for authenticated users
- **IP Address** - Shows the IP address for all users

---

## 🎯 Use Cases

### Use Case 1: Find Slow Performance for Specific User

1. Go to **http://localhost:9333/**
2. In the **Username** filter, type the username (e.g., "john.doe")
3. View all performance metrics for that user
4. Check which URLs are slow for them

### Use Case 2: Track Anonymous Users by IP

1. Select **Anonymous** from the **User Type** filter
2. Optionally enter an IP address in the **IP Filter**
3. See all performance data for anonymous/public users
4. Identify which IPs have performance issues

### Use Case 3: Group by Username

1. Change **Group By** dropdown to **Username**
2. See average performance metrics per user
3. Identify which users consistently have high latency
4. Sort by measurements to see most active users

### Use Case 4: Group by IP Address

1. Change **Group By** dropdown to **IP Address**
2. See performance metrics grouped by IP
3. Identify problematic IP ranges or subnets
4. Useful for identifying network issues

### Use Case 5: Find Users Having Issues with Specific URL

1. Select a URL from the **URL** dropdown
2. Change **Group By** to **Username** or **IP Address**
3. See which users/IPs are experiencing slow performance for that URL

---

## 📊 Examples

### Example 1: View Performance for User "admin"

**Filters**:
- Username: `admin`
- Time: `24h`
- Type: `Client`

**Result**: All client-side performance metrics for user "admin" in the last 24 hours

### Example 2: Anonymous Users with High Latency

**Filters**:
- User Type: `Anonymous`
- Time: `7d`
- Latency Threshold: Slide to `1000ms`

**Result**: All anonymous users experiencing >1000ms latency in the last 7 days

### Example 3: Performance by Username

**Filters**:
- Group By: `Username`
- Time: `24h`
- Type: `Client`

**Result**: Average performance grouped by username, showing which users have the worst experience

### Example 4: Trace Specific IP Address

**Filters**:
- IP Address: `203.0.113.45`
- Time: `1h`

**Result**: All requests from that specific IP in the last hour

---

## 🔍 API Changes

### Updated Endpoint: `/api/performance/bubble-chart`

#### New Query Parameters:

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `username` | string | `john` | Filter by username (partial match, case-insensitive) |
| `ip` | string | `192.168` | Filter by IP address (partial match) |
| `authenticated` | string | `true` / `false` | Filter by authentication status |
| `granularity` | string | `username` / `ip` | New grouping options added |

#### Example API Calls:

```javascript
// Get performance for specific user
/api/performance/bubble-chart?username=john&period=24h&type=client

// Get anonymous users only
/api/performance/bubble-chart?authenticated=false&period=24h

// Group by username
/api/performance/bubble-chart?granularity=username&period=24h

// Group by IP address
/api/performance/bubble-chart?granularity=ip&period=24h

// Filter by IP subnet
/api/performance/bubble-chart?ip=192.168&period=24h
```

---

## 📋 Database Queries

The API now queries these additional fields from PostgreSQL:

```sql
SELECT 
    username,
    ip_address,
    is_authenticated,
    -- ... other fields
FROM performance_metrics
WHERE username ILIKE '%john%'
    AND is_authenticated = TRUE
```

### Performance Considerations:

- ✅ Indexes exist on `username` and `ip_address` for fast queries
- ✅ Partial matching uses `ILIKE` for case-insensitive search
- ✅ IP address filtering uses `CAST(ip_address AS TEXT)` for pattern matching

---

## 🎨 UI Updates

### Filter Bar Layout:

```
[URL ▼] [Username     ] [IP Address  ] [User Type ▼] [Time: 1h|24h|7d|Custom] [Group ▼] [Type ▼]
```

### Table Layout:

```
| Location | Username | IP Address | Avg | P95 | Success% | Measurements | Users | ... |
```

---

## 🚀 Deployment

The dashboard is automatically updated - just refresh **http://localhost:9333/**

### Files Modified:

1. ✅ `analytics/dashboard/index.html` - Added filter inputs and table columns
2. ✅ `analytics/dashboard/app.js` - Added filter handling and data display
3. ✅ `analytics/api/performance/bubble-chart.php` - Added username/IP support

### No Database Migration Required

The username and IP fields already exist in the database from previous migrations!

---

## 💡 Tips & Tricks

### Tip 1: Combine Filters

You can combine multiple filters for precise analysis:
```
Username: john + URL: https://example.com + Time: 7d
```
Shows all performance data for user "john" accessing "example.com" in the last 7 days.

### Tip 2: Use Partial Matching

The username and IP filters support partial matching:
- Username: `admin` will match `admin`, `administrator`, `admin123`
- IP: `192.168` will match `192.168.1.1`, `192.168.1.100`, `192.168.2.50`

### Tip 3: Export Filtered Data

After applying filters:
1. Switch to **Table** view
2. Click the **Export CSV** button
3. Get filtered data in CSV format with username and IP columns

### Tip 4: Debounced Search

The username and IP filters have a 500ms debounce - type and wait half a second for results to update automatically.

---

## 🔄 Workflow Examples

### Workflow 1: Investigate User Complaint

1. User "john.doe" reports slow performance
2. Open dashboard: **http://localhost:9333/**
3. Type `john.doe` in **Username** filter
4. Check average latency and identify slow URLs
5. Switch to **Time Series** chart to see trends over time
6. Export data for further analysis

### Workflow 2: Monitor Anonymous Users

1. Select **Anonymous** from **User Type** filter
2. Change **Group By** to **IP Address**
3. Identify IPs with high latency
4. Filter by specific IP to drill down
5. Check if issue is widespread or isolated

### Workflow 3: Performance Report by User

1. Set **Group By** to **Username**
2. Set **Time** to **7d** (weekly report)
3. Switch to **Bar Chart** view
4. Export to CSV
5. Share report with team

---

## 📸 Screenshots

### Before:
- Only geographic grouping (URL, Country, Region, City)
- No user-level visibility

### After:
- ✅ Username and IP filtering
- ✅ Group by username or IP
- ✅ User type filter (authenticated/anonymous)
- ✅ Username and IP columns in table
- ✅ Full drill-down capability

---

## 🎯 Summary

You can now:
- ✅ **Filter** by username or IP address
- ✅ **Group** performance data by username or IP
- ✅ **Distinguish** between authenticated and anonymous users
- ✅ **Track** individual user performance over time
- ✅ **Identify** which users are experiencing issues
- ✅ **Export** user-specific performance data

**Dashboard URL**: http://localhost:9333/

---

**Last Updated**: January 24, 2026  
**Status**: ✅ Live and Ready to Use
