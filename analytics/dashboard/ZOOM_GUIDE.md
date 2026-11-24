# Zoom Functionality - User Guide

## Overview
The analytics dashboard now includes **zoom controls** for all chart types, allowing you to zoom in for detailed inspection or zoom out for a broader overview.

## Features

### 🔍 Zoom Controls
Located in the top-right corner of the chart viewer:

1. **Zoom Out (-)** - Decrease zoom level by 20%
2. **Zoom Level Display** - Shows current zoom percentage (50% - 300%)
3. **Zoom In (+)** - Increase zoom level by 20%
4. **Reset** - Return to 100% zoom

### 📊 Zoom Range
- **Minimum**: 50% (half size)
- **Default**: 100% (original size)
- **Maximum**: 300% (triple size)
- **Step**: 20% increments

## How to Use

### Method 1: Click Buttons
- Click **[+]** to zoom in
- Click **[-]** to zoom out
- Click **[↻]** to reset to 100%

### Method 2: Keyboard Shortcut
- **Ctrl + Mouse Wheel** (or **Cmd + Mouse Wheel** on Mac)
  - Scroll up = Zoom in
  - Scroll down = Zoom out

### Method 3: Pan at Any Zoom Level
**Always available - works at 50%, 100%, 200%, or any zoom level:**
- **Click and drag** anywhere on the chart to pan
- Cursor shows a **grab hand** icon at all times
- Changes to **grabbing hand** while dragging
- Smooth scrolling for easy navigation
- Works on desktop and mobile (touch drag)

**Why pan at 100% zoom?**
- Navigate large charts that don't fit on screen
- Explore different areas without scrolling
- More intuitive than using scrollbars
- Consistent interaction across all zoom levels

## Supported Charts

✅ **All chart types support zoom:**
- Bubble Map
- Time Series
- Bar Chart
- Pie Chart
- Histogram
- Scatter Plot
- Heatmap
- Data Table

## Use Cases

### 🔬 Detailed Inspection
**Zoom In (150% - 300%)**
- Examine overlapping bubbles in bubble chart
- Read small labels on bar charts
- Inspect individual data points on scatter plots
- View precise values in heatmap cells
- Read small text in data tables

### 🌍 Overview
**Zoom Out (50% - 80%)**
- See the entire dataset at once
- Identify overall patterns
- Compare multiple regions simultaneously
- Get a bird's-eye view of distributions

### 📱 Responsive Behavior
- Zoom works on all screen sizes
- Touch devices: Use pinch-to-zoom gestures
- Mobile: Zoom controls remain accessible

## Visual Indicators

### Cursor Changes
- **Default**: Grab hand (ready to pan)
- **Panning**: Grabbing hand (actively dragging)
- **Interactive elements**: Normal cursor (buttons, links, etc.)

### Button States
- **Disabled**: Grayed out when at min/max zoom
- **Active**: Full color when available
- **Hover**: Indigo highlight

### Zoom Level Display
- **Monospace font** for easy reading
- **Real-time updates** as you zoom
- **Percentage format** (e.g., "150%")

## Technical Details

### Transform Method
- Uses CSS `transform: scale()` for smooth zooming
- Hardware-accelerated for performance
- No re-rendering required (instant zoom)

### Pan Implementation
- Mouse drag with momentum
- Smooth scrolling
- Prevents accidental clicks when panning

### Keyboard Support
- Ctrl/Cmd + Wheel for zoom
- Works in all modern browsers
- Prevents page zoom (only zooms chart)

## Tips & Tricks

### 💡 Best Practices

1. **Start at 100%** - Get familiar with the chart first
2. **Zoom in gradually** - Use 20% steps for smooth transitions
3. **Pan to explore** - When zoomed, drag to see different areas
4. **Reset often** - Use reset button to return to default view
5. **Combine with filters** - Filter data first, then zoom for details

### 🎯 Specific Chart Tips

**Bubble Chart:**
- Zoom in to see overlapping bubbles
- Pan to explore different regions
- Great for identifying small bubbles

**Time Series:**
- Zoom in to see individual data points
- Pan horizontally to move through time
- Examine specific time periods closely

**Heatmap:**
- Zoom in to read hour labels
- See exact color gradations
- Identify specific time patterns

**Scatter Plot:**
- Zoom in to see clustered points
- Identify outliers more easily
- Examine correlation patterns

**Bar Chart:**
- Zoom in to read long labels
- Compare bar heights precisely
- See exact values on hover

**Table:**
- Zoom in to read small text
- Scroll through large datasets
- Focus on specific columns

## Accessibility

- **Keyboard accessible**: All controls work with keyboard
- **Screen reader friendly**: Buttons have descriptive titles
- **Visual feedback**: Clear indication of zoom level
- **No motion sickness**: Smooth, controlled zoom

## Browser Compatibility

✅ **Fully supported:**
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Opera (latest)

✅ **Mobile browsers:**
- iOS Safari
- Chrome Mobile
- Samsung Internet

## Troubleshooting

### Issue: Zoom not working
**Solution:** Refresh the page and try again

### Issue: Can't pan when zoomed
**Solution:** Make sure zoom is above 100%

### Issue: Ctrl+Wheel zooms entire page
**Solution:** Click inside the chart area first

### Issue: Zoom too sensitive
**Solution:** Use button controls instead of mouse wheel

### Issue: Chart looks blurry when zoomed
**Solution:** This is normal for SVG scaling; reset and use filters instead

## Future Enhancements

Planned improvements:
- [ ] Pinch-to-zoom on touch devices
- [ ] Zoom to specific area (box select)
- [ ] Keyboard shortcuts (+ / - keys)
- [ ] Remember zoom level per chart
- [ ] Zoom animation smoothing
- [ ] Mini-map for navigation when zoomed

## Summary

The zoom feature provides:
- **3 zoom methods**: Buttons, mouse wheel, touch
- **Pan capability**: Drag to explore when zoomed
- **All charts**: Works with every visualization
- **Smooth performance**: Hardware-accelerated
- **Easy reset**: One click back to 100%

Explore your data in detail or get the big picture - the choice is yours! 🔍✨
