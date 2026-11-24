# Version Control Fix - Implementation Summary

## Issues Addressed

### 1. ✅ Version Control Creating Versions on Unedited Tiles
**Problem**: Versions were being created for tiles that weren't being edited.
**Solution**: Modified `handleGetTileVersions` to exclude temporary versions (`is_temp = 1`) from the version list, ensuring only permanent versions are shown.

### 2. ✅ ESC Key Support for Diff Dialog
**Problem**: No keyboard shortcut to close the diff viewer.
**Solution**: Added ESC key handler in `VersionDiffViewer.tsx` that listens for the Escape key and calls `onClose()`.

### 3. ✅ Temp Version Strategy Implementation
**Problem**: Version control wasn't following the clear strategy of creating a temp snapshot on edit start.
**Solution**: Implemented complete temp version workflow:

## Implementation Details

### Backend Changes (`api/tiles.php` & `api/config.php`)

1. **Database Schema Update**
   - Added `is_temp INTEGER DEFAULT 0` column to `tile_versions` table
   - Distinguishes temporary versions from permanent ones

2. **New Endpoint**
   - `POST /api/tiles/{tileId}/create-temp-version`
   - Creates a temporary version snapshot when user enters edit mode
   - Deletes any existing temp version for the tile first

3. **Modified `saveVersion()` Function**
   - Now accepts `$isTemp` parameter
   - Temp versions don't count toward version numbering
   - Temp versions are excluded from cleanup operations

4. **Updated `updateTileInternal()` Function**
   - Checks for temp version existence on save
   - If changes detected AND temp version exists:
     - Converts temp version to permanent (sets `is_temp = 0`)
     - Adds changelog summary
   - If NO changes detected:
     - Deletes the temp version
     - Skips creating new version
   - Fallback: Creates regular version if no temp exists (backward compatibility)

5. **Modified `handleGetTileVersions()`**
   - Filters out temp versions (`WHERE is_temp = 0`)
   - Users only see permanent versions in version history

### Frontend Changes (`components/TileDetail.tsx`)

1. **Temp Version Creation on Edit Start**
   - Added logic in `useEffect` that triggers when `isEditing` becomes `true`
   - Calls `/create-temp-version` endpoint
   - Creates snapshot of current tile state before any edits

2. **Removed Frontend Snapshot Logic**
   - Deleted `initialTileSnapshot` ref
   - Removed `normalizeForSnapshot` function
   - Removed frontend comparison logic
   - Backend now handles all change detection

3. **Simplified Save Flow**
   - `handleSaveChanges()` now just sends data to backend
   - Backend compares against temp version
   - Backend decides whether to create permanent version or delete temp

### Diff Viewer Changes (`components/VersionDiffViewer.tsx`)

1. **ESC Key Handler**
   - Added `useEffect` hook with keyboard event listener
   - Pressing ESC closes the diff viewer
   - Cleanup on component unmount

## Workflow

### When User Opens Tile for Editing:
1. User clicks "Edit" button
2. `isEditing` state becomes `true`
3. Frontend calls `POST /api/tiles/{id}/create-temp-version`
4. Backend:
   - Deletes any existing temp version for this tile
   - Creates new temp version with current tile state
   - Marks it with `is_temp = 1`

### When User Saves Changes:
1. User clicks "Save"
2. Frontend sends updated tile data to backend
3. Backend in `updateTileInternal()`:
   - Fetches current tile state
   - Compares with incoming data using `areTilesEqual()`
   - **If NO changes**:
     - Deletes temp version
     - Returns without creating version
   - **If changes detected**:
     - Finds temp version
     - Converts to permanent (`is_temp = 0`)
     - Adds changelog summary
     - Proceeds with tile update

### When User Cancels Edit:
- Temp version remains in database temporarily
- Will be deleted when user next edits the tile
- Or can be cleaned up with maintenance script

## Migration

A migration script was created and executed:
- `migrations/add_is_temp_column.sql` - SQL migration
- `migrations/run_migration.php` - PHP runner
- Successfully added `is_temp` column to existing database

## Benefits

1. **No Redundant Versions**: Only creates versions when actual changes occur
2. **Server-Side Truth**: Backend handles all comparison logic
3. **Clean Version History**: Temp versions never appear in user's version list
4. **Atomic Operations**: Temp version conversion happens in same transaction as tile update
5. **Better UX**: ESC key support for quick diff viewer dismissal
6. **Accurate Comparison**: Uses same data format for comparison (no frontend/backend mismatch)

## Testing Checklist

- [ ] Open tile for editing → Temp version created
- [ ] Save without changes → No new version appears
- [ ] Save with changes → New version appears with correct changelog
- [ ] Version list shows only permanent versions
- [ ] ESC key closes diff viewer
- [ ] Multiple edits on same tile work correctly
- [ ] Temp version gets replaced on subsequent edits
