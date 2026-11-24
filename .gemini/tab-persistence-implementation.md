# Tab Persistence Across Login/Logout Sessions

## Overview
Implemented a feature to remember the user's active tab when they logout and restore it when they log back in.

## Changes Made

### Modified: `TileGrid.tsx`

#### 1. **Reset Preferences on Auth Change** (Line ~1529-1533)
Added a new `useEffect` hook that resets the `preferencesLoaded` flag whenever the authentication state changes. This ensures that preferences are properly reloaded when a user logs in or out.

```typescript
// Reset preferencesLoaded when authentication state changes
// This ensures preferences are reloaded when user logs in or out
useEffect(() => {
  setPreferencesLoaded(false);
}, [isAuthenticated]);
```

#### 2. **Enhanced Tab Loading Logic** (Line ~1536-1565)
Updated the preference loading logic to use localStorage as a fallback when loading the active tab:

- When a user logs in, the system first checks localStorage for `linknest_user_active_tab`
- It then loads from user preferences (server-side)
- Prefers server-side preferences over localStorage, but uses localStorage as an immediate fallback
- This provides instant tab restoration while waiting for server preferences to load

```typescript
// Try to load from localStorage first (for immediate restoration after login)
const localStorageTab = localStorage.getItem('linknest_user_active_tab');

userPreferencesService.getPreference('activeTab')
  .then(savedTab => {
    // Prefer user preferences over localStorage, but use localStorage as fallback
    const tabToRestore = savedTab || localStorageTab;
    // ... restore logic
  })
```

#### 3. **Dual Persistence on Save** (Line ~1593-1601)
Modified the save logic to persist the active tab in both locations:

- Saves to user preferences (server-side) for cross-device synchronization
- Also saves to localStorage for immediate restoration after login
- Both saves are debounced (300ms) to avoid excessive API calls

```typescript
// Save to user preferences (server-side)
userPreferencesService.updatePreference('activeTab', activeTab)
  .catch(error => {
    console.error('Failed to save active tab preference:', error);
  });

// Also save to localStorage for immediate restoration after login
localStorage.setItem('linknest_user_active_tab', activeTab);
```

## How It Works

### Logout Flow
1. User is on a specific tab (e.g., "Monitoring")
2. User clicks logout
3. The active tab is already saved in:
   - User preferences (server-side)
   - localStorage (`linknest_user_active_tab`)

### Login Flow
1. User logs back in
2. Authentication state changes, triggering `preferencesLoaded` reset
3. The preference loading effect runs:
   - Immediately checks localStorage for the last active tab
   - Simultaneously fetches server-side preferences
   - Restores the tab from whichever source is available first
4. User sees the same tab they were on before logout

## Benefits

1. **Seamless User Experience**: Users return to exactly where they left off
2. **Instant Restoration**: localStorage provides immediate tab restoration
3. **Cross-Device Sync**: Server-side preferences sync across devices
4. **Fault Tolerance**: Falls back to localStorage if server preferences fail
5. **No Breaking Changes**: Existing functionality remains intact

## Testing Recommendations

1. **Basic Flow**:
   - Navigate to a specific tab (e.g., "Private")
   - Logout
   - Login again
   - Verify you're on the "Private" tab

2. **Cross-Tab Testing**:
   - Test with all available tabs: Public, Favorites, Private, Scheduled, Expired, Archive, Recycle Bin, Monitoring

3. **Edge Cases**:
   - Test with disabled tabs (should fall back to an enabled tab)
   - Test with restricted tabs when not authenticated (should fall back to public tabs)
   - Test when server preferences are unavailable (should use localStorage)

## Notes

- The feature respects tab visibility settings and disabled tabs
- Restricted tabs (Private, Scheduled, etc.) are only restored for authenticated users
- Public users continue to use the existing localStorage-based tab persistence
