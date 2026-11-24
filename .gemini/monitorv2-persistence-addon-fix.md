# Monitorv2 Tab Persistence and Addon Integration

## Issues Fixed

1. **Tab Persistence**: The monitorv2 tab was not persisting after page refresh
2. **Demo Tiles Display**: Demo tiles were showing below the Monitorv2 Dashboard
3. **Addon Integration**: Monitorv2 tab wasn't checking if the addon was enabled/disabled

## Changes Made

### 1. Tab Persistence (`TileGrid.tsx`)

Added `'monitorv2'` to all relevant tab lists to enable localStorage persistence:

#### Valid Tabs Lists (3 locations)
- **Line 1817**: Initial state - added to validTabs array
- **Line 1876**: Switch tab handler - added to validTabs array  
- **Line 1715**: TypeScript type definition - already included

```typescript
const validTabs = ['favorites', 'public', 'public-favorites', 'your-apps', 'private', 'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring', 'monitorv2'];
```

#### Restricted Tabs Lists (5 locations)
Added `'monitorv2'` to all restricted tabs arrays since it requires authentication:

- **Line 1800**: getFallbackTab function
- **Line 1822**: Initial state loader
- **Line 1841**: requestTab function
- **Line 1851**: Unauthorized tab fallback effect
- **Line 1891**: Switch tab handler

```typescript
const restrictedTabs = ['private', 'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring', 'monitorv2'];
```

#### Persistence Effect
```typescript
// Already exists - now works for monitorv2
useEffect(() => {
  try {
    localStorage.setItem('linknest_active_tab', activeTab);
  } catch (e) {
    console.error('Failed to save active tab', e);
  }
}, [activeTab]);
```

### 2. Hide Demo Tiles (`TileGrid.tsx`)

Updated 3 conditional renders to exclude monitorv2 from showing normal content:

- **Line 6097**: Tiles Grid - hide when activeTab is 'monitorv2'
- **Line 6031**: Categories View - hide when activeTab is 'monitorv2'  
- **Line 6221**: Matching Links - hide when activeTab is 'monitorv2'

```typescript
// Before:
<div className={activeTab === 'monitoring' || viewMode === 'categories' ? 'hidden' : ''}>

// After:
<div className={activeTab === 'monitoring' || activeTab === 'monitorv2' || viewMode === 'categories' ? 'hidden' : ''}>
```

### 3. Addon Enabled Check (`TileGrid.tsx`)

Added check to hide monitorv2 tab when addon is disabled in admin settings:

**Line 1752** - Added monitorv2 check in `isTabDisabledBySettings`:
```typescript
if (tab === 'monitorv2') return disabledAppTabs.has('monitorv2') || settings?.monitorv2_enabled !== '1';
```

**Line 1782** - Added `settings` to dependency array:
```typescript
}, [disabledAppTabs, isAuthenticated, user, allowedTabsByRole, settings]);
```

This checks two conditions:
1. **Tab disabled globally**: `disabledAppTabs.has('monitorv2')` - admin disabled via tab visibility settings
2. **Addon disabled**: `settings?.monitorv2_enabled !== '1'` - addon disabled in addon management

## How It Works

### Tab Persistence Flow

1. **On Mount**: 
   - Reads `localStorage.getItem('linknest_active_tab')`
   - Validates tab is in validTabs list
   - Checks authentication for restricted tabs
   - Checks if addon is enabled (for monitorv2)
   - Falls back to 'public' if invalid

2. **On Tab Change**:
   - Tab switch event triggers
   - Validates and sets new activeTab
   - `useEffect` automatically saves to localStorage

3. **On Refresh**:
   - Reads saved tab from localStorage
   - Restores user to monitorv2 tab if it was active
   - Respects all auth and addon checks

### Addon Integration

When admin **disables** monitorv2 addon:
- `settings.monitorv2_enabled` is set to '0'
- `isTabDisabledBySettings('monitorv2')` returns `true`
- monitorv2 tab is hidden from navigation
- If user was on monitorv2 tab, they're redirected to fallback tab
- Tab is not saved to localStorage as valid option

When admin **enables** monitorv2 addon:
- `settings.monitorv2_enabled` is set to '1'
- `isTabDisabledBySettings('monitorv2')` returns `false`
- monitorv2 tab appears in navigation (for authenticated users)
- Tab can be selected and persisted

## Testing Checklist

### Tab Persistence
- [ ] Navigate to monitorv2 tab
- [ ] Refresh the page
- [ ] Verify you're still on monitorv2 tab
- [ ] Switch to another tab, refresh, verify persistence

### Addon Integration
- [ ] Go to Admin Panel → Addons
- [ ] Disable monitorv2 addon
- [ ] Verify monitorv2 tab disappears from navigation
- [ ] Enable monitorv2 addon
- [ ] Verify monitorv2 tab reappears

### Content Display
- [ ] On monitorv2 tab, verify only dashboard shows
- [ ] Verify no demo tiles appear below
- [ ] Verify no categories view shows
- [ ] Switch to other tabs, verify normal content shows

### Authentication
- [ ] As guest user, verify monitorv2 tab is hidden
- [ ] Login as regular user, verify monitorv2 tab shows (if addon enabled)
- [ ] Logout, verify tab persistence respects auth

## Files Modified

- `components/TileGrid.tsx` - 13 changes total:
  - 7 changes for tab persistence (validTabs and restrictedTabs)
  - 3 changes for hiding demo content
  - 2 changes for addon integration
  - 1 change for dependency array

## Build Status

```
✓ 751 modules transformed
✓ built in 4.47s
```

## Summary

The monitorv2 tab now:
- ✅ **Persists** across page refreshes
- ✅ **Respects** addon enabled/disabled status
- ✅ **Hides** when addon is disabled
- ✅ **Shows** clean dashboard without demo tiles
- ✅ **Requires** authentication (like monitoring tab)
- ✅ **Integrates** seamlessly with existing tab system
