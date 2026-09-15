# Monitorv2 Dashboard Complete Alignment Plan

Based on the screenshots and code comparison, here are the key differences that need to be fixed:

## Header/Toolbar Differences

### MonitoringDashboard (v1) - Correct Layout
- Header with icon and title
- Data management icons grouped in a rounded container (Export JSON, Import JSON, Export CSV, Import CSV, SMTP, Notifications Pause/Resume)
- Settings icons (Tile Style, Fullscreen, Cron, Delete All)
- Divider between groups
- View mode toggles (tiles, compact, capsule, status-bar)
- Auto-refresh controls
- Add Monitor button (blue)
- Refresh button
- **No filter bar below the header**
- **Tabs are shown as pills below when monitors exist**

### Monitorv2Dashboard (Current) - Incorrect Layout
- Header with icon and title ✅ (correct)
- View mode toggles (limited to 4 modes)
- Add Monitor button (purple - should be blue)
- Refresh button
- **Filter bar with dropdown, search, checkboxes, export/import** ❌ (wrong - should not exist)
- **No data management icons** ❌ (missing)
- **No settings icons** ❌ (missing)
- **No auto-refresh controls in toolbar** ❌ (wrong location)

## Content Area Differences

### MonitoringDashboard (v1) - Correct
- Shows tabs as pills INSIDE content area when monitors exist
- Shows groups with uppercase labels and dividers
- Renders tiles/capsules/bars based on view mode
- Rich tile design with hover effects and controls

### Monitorv2Dashboard (Current) - Incorrect
- Uses tab dropdown filter instead of tab pills
- Different rendering logic for groups
- Simpler tile cards
- Missing many features

## Action Plan

1. **Replace entire header** toolbar to match MonitoringDashboard exactly
2. **Remove filter bar** completely
3. **Replace content rendering** logic to match the tab pills and group structure
4. **Add all missing state variables** and handlers
5. **Fix color scheme** (blue instead of purple)
6. **Add missing helper functions** (formatLastChecked, getTileStyle, etc.)
7. **Match the tile rendering** exactly with all hover controls
