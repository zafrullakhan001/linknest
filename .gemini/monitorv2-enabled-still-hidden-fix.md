# Monitorv2 Tab Visibility Fix - Addon Enabled But Still Hidden

## Issue
User enabled the monitorv2 addon, but the tab is still hidden. 

## Root Cause
The previous logic used OR condition:
```typescript
return disabledAppTabs.has('monitorv2') || settings?.monitorv2_enabled !== '1';
```

This meant the tab would be hidden if **either**:
1. It was in the disabled_tabs settings, OR
2. The addon was not enabled

So even with the addon enabled, if monitorv2 was in the disabled_tabs list (from Admin Panel → Tab Visibility), it would still be hidden.

## Fix Applied
Changed the logic to prioritize addon status:

```typescript
if (tab === 'monitorv2') {
  // If addon is disabled, always hide the tab
  if (settings?.monitorv2_enabled !== '1') return true;
  // If addon is enabled, check tab visibility settings
  return disabledAppTabs.has('monitorv2');
}
```

### New Behavior:
1. **Addon Disabled** → Tab always hidden (regardless of tab visibility settings)
2. **Addon Enabled** → Tab visibility follows normal tab visibility rules

## Additional Steps Needed

You may also need to ensure monitorv2 is not disabled in Tab Visibility settings:

### Option 1: Via Admin Panel UI
1. Go to **Admin Panel** → **Tab Visibility**
2. Make sure **monitorv2** is **not** in the disabled tabs list
3. If it is, enable it

### Option 2: Via Database (If Tab Visibility UI doesn't help)

Run this SQL query in your database:

```sql
-- Check current disabled_tabs setting
SELECT value FROM settings WHERE key = 'disabled_tabs';

-- If monitorv2 is in the list, remove it
-- Example: if value is 'monitoring,monitorv2', change to 'monitoring'
-- Or if value is 'monitorv2', change to empty string ''

UPDATE settings 
SET value = '' 
WHERE key = 'disabled_tabs' AND value LIKE '%monitorv2%';
```

### Option 3: Check Settings Value

Add this console log to check what's happening:
```typescript
console.log('Monitorv2 enabled?', settings?.monitorv2_enabled);
console.log('Disabled tabs:', disabledAppTabs);
console.log('Has monitorv2?', disabledAppTabs.has('monitorv2'));
```

## Testing After Fix

1. **Enable addon** in Admin Panel → Addons
2. **Verify not disabled** in Admin Panel → Tab Visibility  
3. **Refresh page** and check if tab appears
4. If still hidden, check browser console for logs
5. Check database settings table

## Files Modified
- `components/TileGrid.tsx` - Lines 1752-1757
  - Changed from single-line OR condition
  - Changed to multi-line prioritized check

## Next Build
```bash
npm run build
```
