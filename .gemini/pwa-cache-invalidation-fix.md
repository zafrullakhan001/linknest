# PWA Cache Invalidation Fix

## Problem Description

The Semi-PWA feature was experiencing a cache invalidation glitch where:

1. **Hard refresh (Ctrl+F5) didn't fully update the cache** - Only the HTML page was refreshed, but API responses remained cached
2. **Tiles would disappear after normal refresh** - When users did a regular refresh, they would get stale API data from cache
3. **Hard refresh required twice** - Users had to hard refresh once to see new data, then a normal refresh would revert to old cached data

### Root Cause

The service worker was using a simple cache-first strategy that:
- Only detected hard refresh for navigation (HTML page) requests
- Kept API responses cached indefinitely, even after hard refresh
- Had no mechanism to invalidate or update cached API data

## Solution Implemented

### 1. Complete Cache Clearing on Hard Refresh

When a hard refresh (Ctrl+F5 / Cmd+Shift+R) is detected:
- **All caches are cleared** (`clearAllCaches()` function)
- All tabs are notified via `postMessage` that cache was cleared
- Fresh data is fetched from the database/server

### 2. Post-Refresh Window

After a hard refresh, there's a 2-second window where:
- All subsequent requests bypass cache
- This ensures that API calls following the HTML page load also get fresh data
- Prevents race conditions where cached API data loads before cache clear completes

### 3. Stale-While-Revalidate for API Calls

API endpoints now use a dual-fetch strategy:
- **Immediate response**: Serve cached data immediately for fast load times
- **Background update**: Fetch fresh data and update cache in the background
- Next load will have the updated data

### 4. Cache Version Bump

- Incremented cache from `linknest-pwa-v1` to `linknest-pwa-v2`
- Forces all existing caches to be invalidated when service worker updates
- Ensures all users get the fix automatically

### 5. Manual Cache Clear Utility

Added `clearCache()` function to SettingsContext:
- Can be called programmatically to clear all caches
- Automatically reloads the page after clearing
- Available for admin UI integration

## Files Modified

1. **`public/sw-cache-first.js`** - Main service worker implementation
2. **`dist/sw-cache-first.js`** - Distribution version (mirrors public)
3. **`contexts/SettingsContext.tsx`** - Added clearCache utility function

## Testing Instructions

### Test 1: Hard Refresh Clears Cache
1. Load the admin panel with Semi-PWA enabled
2. Make a change to tiles (add/remove/edit)
3. Press Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)
4. ✅ **Expected**: Tiles show immediately with new changes
5. Do a normal refresh (F5)
6. ✅ **Expected**: Tiles still show correctly (no reversion to old cache)

### Test 2: Stale-While-Revalidate
1. Load the app (cache is populated)
2. In a different tab, change some tile data in the database
3. Do a normal refresh (F5) in the app tab
4. ✅ **Expected**: Old data shows initially, but within a few seconds updates to new data
5. Refresh again
6. ✅ **Expected**: New data shows immediately

### Test 3: Manual Cache Clear
1. Open browser console
2. Call: `await window.caches.keys()` - note the cache names
3. Call the manual clear function (when integrated): `clearCache()`
4. ✅ **Expected**: Page reloads with fresh data, console shows cache cleared message

## Console Messages

You'll see these helpful console messages:

```
[LinkNest PWA] All caches cleared due to hard refresh
[LinkNest PWA] Database/network fetch (hard refresh): /
[LinkNest PWA] Database/network fetch (post-hard-refresh window): /api/tiles
[LinkNest PWA] Cache (stale-while-revalidate): /api/tiles
[LinkNest PWA] Background update (API): /api/tiles
```

## Future Enhancements

Consider adding:
1. **Clear Cache button in Admin Panel** - UI for manual cache clearing
2. **Cache expiration times** - Automatic cache invalidation after X hours
3. **Version-based cache keys** - Append app version to cache name for automatic invalidation on updates
4. **Selective cache clearing** - Clear only specific endpoints (e.g., just /api/tiles)

## Developer Notes

- The service worker now properly handles hard refresh detection
- A 2-second window ensures all initial API calls get fresh data
- Background updates keep cache fresh without sacrificing performance
- Cache version must be bumped when making breaking changes to cached data structure
