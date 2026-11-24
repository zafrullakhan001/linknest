## Quick Reference: Chart Types & Use Cases

### 📈 Time Series Chart
**Best for:** Tracking changes over time
**Questions it answers:**
- Is performance improving or degrading?
- When did the spike occur?
- What's the trend for the last 24 hours/7 days?

**How to use:**
- Select different time periods (1h, 24h, 7d, 30d) to see different granularities
- Blue line = average latency
- Orange dashed line = P95 latency (95th percentile)
- Hover over data points for exact values

---

### 📊 Bar Chart
**Best for:** Comparing locations side-by-side
**Questions it answers:**
- Which region has the worst performance?
- Which URL gets the most traffic?
- How do the top 15 locations compare?

**How to use:**
- Click "By Latency" to see slowest locations first
- Click "By Volume" to see highest-traffic locations first
- Hover over bars for exact values
- Colors indicate performance (green=good, red=poor)

---

### 🍩 Pie Chart
**Best for:** Understanding overall distribution
**Questions it answers:**
- What percentage of measurements are performing well?
- How much of my traffic is experiencing poor performance?
- Is the system mostly healthy?

**How to use:**
- Green segments = good performance
- Red/orange segments = poor performance
- Hover for percentages and counts
- Larger segments = more measurements in that category

---

### 📉 Histogram
**Best for:** Understanding latency distribution
**Questions it answers:**
- What's the most common latency range?
- Is latency normally distributed or skewed?
- Are there outliers?

**How to use:**
- X-axis = latency ranges (in ms)
- Y-axis = number of locations in that range
- Tall bars = many locations with that latency
- Look for clustering patterns

---

### 🔵 Scatter Plot
**Best for:** Finding correlations
**Questions it answers:**
- Do high-traffic locations perform worse?
- Is there a relationship between volume and latency?
- Which locations are outliers?

**How to use:**
- Each dot = one location
- X-axis = number of measurements
- Y-axis = latency
- Color = performance (green=fast, red=slow)
- Look for patterns: dots in top-right = high traffic + slow

---

### 🌡️ Heatmap
**Best for:** Identifying time-based patterns
**Questions it answers:**
- When is the system slowest?
- Are there peak hours?
- Which days have the best performance?

**How to use:**
- Rows = days of week (Sun-Sat)
- Columns = hours of day (0-23)
- Color intensity = latency (yellow=fast, red=slow)
- Dark red cells = problem times
- Look for patterns: weekday mornings, weekend evenings, etc.

---

## Pro Tips 💡

1. **Use filters together**: Combine URL filter + time period for focused analysis
2. **Compare views**: Look at the same data in multiple charts for deeper insights
3. **Watch for patterns**: Heatmap + time series together reveal cyclical issues
4. **Prioritize fixes**: Use bar chart + scatter plot to find high-impact problems
5. **Monitor trends**: Check time series daily to catch degradation early

## Common Analysis Workflows

### Workflow 1: Investigating a Performance Issue
1. Check **Time Series** for when it started
2. Use **Bar Chart** to identify affected regions
3. Look at **Heatmap** to see if it's time-based
4. Check **Scatter Plot** to see if it's volume-related

### Workflow 2: Capacity Planning
1. Review **Histogram** for current distribution
2. Check **Scatter Plot** for volume vs performance
3. Use **Heatmap** to identify peak times
4. Monitor **Time Series** for growth trends

### Workflow 3: Daily Health Check
1. Quick glance at **Pie Chart** for overall health
2. Check **Time Series** for any spikes
3. Review **Bar Chart** for new problem areas
4. Scan **Alerts Panel** for threshold violations

---

## Data Refresh

All charts update when you:
- Click the "Refresh Data" button
- Change any filter (URL, Period, Granularity, Measurement Type)
- Auto-refresh (every 30 seconds)

Charts are designed to handle:
- ✅ Empty data gracefully
- ✅ Missing API endpoints
- ✅ Network errors
- ✅ Large datasets (automatically limited to top 15 for bar chart)
