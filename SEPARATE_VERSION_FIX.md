# Version Control Fix - Separate Versions for Each Change

## Problem Identified

The version control system was **clubbing all changes into one version** instead of capturing changes separately from one stage to the next.

### Root Cause

The previous implementation had a flawed strategy:

1. **On Edit Start**: Create a temp version (snapshot of current state)
2. **On Save**: Convert the temp version to permanent and update it with a changelog summary

This meant that during a single editing session:
- Change A → (no version created)
- Change B → (no version created)
- Change C → (no version created)
- **Save** → One version created with ALL changes (A+B+C) combined

The temp version was being **updated** instead of keeping it as a "before" snapshot and creating a **new** "after" snapshot.

## Solution Implemented

Changed the version control strategy to create **two distinct versions** for each save:

### New Flow

1. **On Edit Start**: Create temp version (captures "before" state)
2. **On Save**:
   - Convert temp version to permanent (keeps "before" snapshot)
   - Perform tile update
   - Create NEW version (captures "after" snapshot)

This ensures:
- Each save creates a **distinct version**
- Changes are captured **separately** from one stage to the next
- Version history shows the **progression** of changes over time

### Example Scenario

**Before Fix:**
```
Edit Start → Temp Version Created
Change A (label update)
Change B (URL update)  
Change C (color update)
Save → ONE version: "Updated label, URL, and color"
```

**After Fix:**
```
Edit Start → Temp Version Created (Version 1: "Snapshot before edit")
Change A (label update)
Save → Version 2: "Updated label"

Edit Start → Temp Version Created (Version 3: "Snapshot before edit")
Change B (URL update)
Save → Version 4: "Updated URL"

Edit Start → Temp Version Created (Version 5: "Snapshot before edit")
Change C (color update)
Save → Version 6: "Updated color"
```

## Technical Changes

### File Modified: `api/tiles.php`

#### Change 1: Lines 3868-3883 (Before tile update)
**Before:**
```php
// Convert temp version to permanent and update with changelog
if ($tempVersion && !$isRestore) {
    $summary = generateChangelogSummary($currentTileData, $data);
    $stmt = $db->prepare('UPDATE tile_versions SET is_temp = 0, changelog_summary = ? WHERE id = ?');
    $stmt->execute(["Pre-update: " . $summary, $tempVersion['id']]);
}
```

**After:**
```php
// Convert temp version to permanent - this captures the "before" state
// Do NOT update it with changelog - keep it as-is
if ($tempVersion && !$isRestore) {
    $stmt = $db->prepare('UPDATE tile_versions SET is_temp = 0, changelog_summary = ? WHERE id = ?');
    $stmt->execute(["Snapshot before edit", $tempVersion['id']]);
    $hasTempVersion = true;
}
```

#### Change 2: Lines 4114-4120 (After tile update)
**Added:**
```php
$db->commit();

// After successful update, create a NEW version to capture the "after" state
// This ensures each save creates a distinct version showing the current state
if (!$isRestore) {
    $summary = generateChangelogSummary($currentTileData, $data);
    saveVersion($tileId, $db, $user['id'], $summary, false);
}
```

## Benefits

✅ **Separate Versions**: Each save creates a distinct version entry  
✅ **Clear History**: Version history shows progression of changes over time  
✅ **Accurate Tracking**: "Before" and "after" states are both captured  
✅ **Better Diffs**: Comparing versions shows incremental changes, not cumulative ones  
✅ **Granular Restore**: Can restore to any specific point in the editing timeline  

## Testing

To verify the fix:

1. Open a tile for editing
2. Make a change (e.g., update a link label)
3. Save
4. Check version history → Should see 2 new versions (before + after)
5. Make another change (e.g., update a URL)
6. Save
7. Check version history → Should see 2 more new versions (before + after)
8. Compare versions → Each version should show only the changes made in that specific save

## Version Cleanup

Note: The existing duplicate prevention logic in `saveVersion()` still applies:
- If you save without making any changes, no duplicate version is created
- The system compares the new state with the most recent version
- Identical versions are automatically prevented

## Migration Notes

No database migration required. The fix only changes the logic flow, not the schema.

Existing versions remain unchanged. The new behavior applies to all future edits.

## Frontend Integration (Added)

To ensure the "before" snapshot is created at the correct time and version control is seamless:

1.  **Edit Start (`TileDetail.tsx`)**: 
    - Added call to `createTempVersion(tile.id)` when user clicks "Edit".
    - This triggers the backend to create the `is_temp=1` version immediately.

2.  **Save Operation (`api/tiles.php`, `storageService.ts`)**:
    - Added `isFinal` flag to `saveTiles` and `updateTileInternal`.
    - When user clicks "Save", `isFinal=true` is passed.
    - Backend logic:
        - If `isFinal=true`:
            - Converts valid temp version to permanent (`is_temp=0`, "Snapshot before edit").
            - updates the tile.
            - Creates NEW permanent version (`is_temp=0`, Summary of changes) to capture the "after" state.

