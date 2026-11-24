# Duplicate Tiles Cleanup Feature

## Overview

The Duplicate Tiles Cleanup feature helps identify and remove duplicate tiles with the same name and category. Unlike the orphaned records cleanup (which removes database references to deleted tiles), this feature removes the actual duplicate tiles themselves.

## Problem Solved

When you see multiple tiles with identical names and categories (e.g., "Company Dashboard [Tab: Imported]") appearing in the Tile Admins page, these are **actual duplicate tiles** in the database, not orphaned records. This commonly happens after:

- Bulk imports of tiles
- Multiple imports from the same source
- Copy/paste operations
- System migrations

## How to Access

1. **Login as Administrator**
2. Navigate to **Admin Panel** → **Maintenance** tab
3. Find the **"Duplicate Tiles Cleanup"** section (purple icon, second cleanup section)

## Features

### 🔍 Find Duplicate Tiles

**Purpose:** Scans the database for tiles with identical names and categories.

**What it shows:**
- Total number of duplicate tiles found
- Grouped by title and category
- For each duplicate set:
  - All tile copies with their IDs
  - Owner of each tile
  - Number of links in each tile
  - Whether each tile will be kept or removed

**Example Output:**
```
Found 6 duplicate tile(s)

📊 Company Dashboard [Tab: Imported] - 4 copies
  • abc12345 - Owner: admin - 15 links (will be kept)
  • def67890 - Owner: john - 0 links (empty - will be removed)
  • ghi11111 - Owner: sarah - 0 links (empty - will be removed)
  • jkl22222 - Owner: mike - 0 links (empty - will be removed)
```

### ⚡ Smart Cleanup Duplicates (Conservative)

**Purpose:** Automatically removes empty duplicate tiles while keeping the ones with content.

**How it works:**

1. **Finds all duplicate sets** (same title + category)
2. **For each set, determines which to keep:**
   - Tiles with links are prioritized
   - Among tiles with content, keeps the one with most links
   - If all are empty or all have same content, keeps the oldest
3. **Removes empty duplicates only**
4. **Skips tiles with content** (preserves your data)
5. **Reports what was kept and removed**

**Safety Features:**
- Only removes tiles with 0 links
- Uses transactions (all-or-nothing)
- Confirmation required before proceeding
- Detailed report of actions taken

**Example Result:**
```
Cleanup Complete - 3 duplicate tile(s) removed

Tiles cleaned:
✓ Company Dashboard [Tab: Imported]
  • Kept: admin's copy (15 links)
  • Removed: 3 empty duplicates

⚠ Some duplicates were NOT removed
  Company Dashboard [Tab: Main]
    ✓ Kept: zafar2's copy (6 links)
    ⚠ Skipped: john's copy (6 links) - has content
```

### 🔥 Force Remove All Duplicates (Aggressive)

**Purpose:** Removes ALL duplicate tiles, even if they have content. **Use with extreme caution!**

**When to use:**
- When you have multiple identical tiles with the same content
- When you're sure one copy has the "correct" data
- When duplicates were created by mistake (e.g., import errors)

**How it works:**

1. **Finds all duplicate sets** (same title + category)
2. **Keeps only ONE tile** (the one with most links)
3. **Deletes ALL others** (even if they have content)
4. **Permanently removes the duplicate tiles and their data**

**⚠️ WARNING:**
- Deletes tiles WITH content
- Content in deleted tiles is LOST FOREVER
- Cannot be undone
- Requires double confirmation

**Safety Features:**
- Double confirmation dialog with warning
- Uses transactions (all-or-nothing)
- Keeps the tile with most content
- Detailed report of what was deleted

**Example Result:**
```
Cleanup Complete - 5 duplicate tile(s) removed

Tiles cleaned:
✓ Company Dashboard [Tab: Imported]
  • Kept: zafar2's copy (6 links)
  • Removed: 5 duplicates (including tiles with content)
```

**This button only appears when:**
- Smart Cleanup found tiles with content that it skipped
- You need to force remove duplicates despite content

## User Workflow

### Recommended Process

1. **Find Duplicates First** (Safe, Read-Only)
   ```
   Click "Find Duplicate Tiles"
   → Wait for scan to complete
   → Review which tiles will be kept/removed
   ```

2. **Review the Results Carefully**
   - Check which tiles have content (links)
   - Verify the correct tile will be kept
   - Note which empty tiles will be removed
   - Check if all duplicates have content (all marked "will be kept")

3. **Run Smart Cleanup** (Makes Changes - Conservative)
   ```
   Click "Smart Cleanup Duplicates"
   → Confirm when prompted
   → Wait for completion
   → Review cleanup report
   ```

4. **Check for Skipped Tiles** (Optional)
   - If you see a yellow warning box about "Some duplicates were NOT removed"
   - Review the skipped tiles (tiles with content that weren't deleted)
   - Decide if you need to remove these as well

5. **Force Remove If Needed** (Aggressive - Use with Caution)
   ```
   If duplicates remain and you want to remove them ALL:
   → Click "Force Remove All Duplicates" (red button)
   → Read the warning carefully
   → Confirm TWICE
   → Wait for completion
   → Review what was deleted
   ```

6. **Verify Results**
   - Check the Tile Admins page
   - Duplicates should be gone
   - Content should be preserved (or removed if you used Force Remove)

## Smart Cleanup Logic

### Decision Tree

```
For each group of duplicate tiles:
  
  1. Sort tiles by:
     a) Number of links (descending)
     b) Number of sections (descending)
     c) Creation date (oldest first)
  
  2. Keep the first tile (highest priority)
  
  3. For remaining tiles:
     - If tile has 0 links → DELETE
     - If tile has links → KEEP (preserve content)
```

### Why This is Safe

✅ **Never deletes tiles with content** - Only removes empty tiles  
✅ **Preserves user data** - Links and sections are never lost  
✅ **Transaction-based** - Rollback on any error  
✅ **Preview available** - Check before cleaning  
✅ **Detailed reporting** - Know exactly what happened  

## When to Use

Run this tool when you see:

- ✅ Multiple tiles with identical names in Tile Admins page
- ✅ Tiles marked with "[Tab: Imported]" appearing multiple times
- ✅ "No tile admins assigned" on duplicate tiles
- ✅ After bulk import operations
- ✅ After system migrations or data transfers

## Difference from Orphaned Records Cleanup

| Feature | Orphaned Records | Duplicate Tiles |
|---------|-----------------|-----------------|
| **What it cleans** | Database references to deleted tiles | Actual duplicate tiles |
| **Problem signs** | Ghost tiles in admin panel | Multiple identical tiles |
| **Safety** | Very safe (just cleanup) | Safe (only empty tiles) |
| **Impact** | Cleanup only | Deletes actual tiles |
| **Use when** | After tile deletions | After imports/migrations |

**Rule of Thumb:**
- If you deleted tiles but still see them → Use **Orphaned Records Cleanup**
- If you have multiple actual tiles with same name → Use **Duplicate Tiles Cleanup**

## API Endpoint

### Backend

**File:** `api/cleanup_duplicate_tiles.php`

**Authentication:** Admin only

**Actions:**

#### 1. Find Duplicates
```
GET /api/cleanup_duplicate_tiles.php?action=find
```

**Response:**
```json
{
  "success": true,
  "duplicates_found": 6,
  "duplicate_groups": [
    {
      "title": "Company Dashboard",
      "group": "Imported",
      "count": 4,
      "tiles": [
        {
          "id": "abc123",
          "title": "Company Dashboard",
          "emoji": "📊",
          "group": "Imported",
          "user_id": 1,
          "owner_username": "admin",
          "section_count": 3,
          "link_count": 15,
          "permission_count": 2,
          "has_content": true,
          "created_at": "2025-01-20 10:00:00"
        }
      ]
    }
  ]
}
```

#### 2. Smart Cleanup
```
GET /api/cleanup_duplicate_tiles.php?action=smart_cleanup
```

**Response:**
```json
{
  "success": true,
  "deleted": 3,
  "kept": 1,
  "details": [
    {
      "title": "Company Dashboard",
      "group": "Imported",
      "kept_id": "abc123",
      "kept_owner": "admin",
      "kept_links": 15,
      "deleted_ids": ["def456", "ghi789", "jkl012"],
      "deleted_count": 3
    }
  ]
}
```

## Visual Interface

### Layout

```
┌─────────────────────────────────────────────────────────┐
│ 📄 Duplicate Tiles Cleanup                              │
│ Find and remove duplicate tiles...                      │
├─────────────────────────────────────────────────────────┤
│ [Results Display - Expandable]                          │
│   ✓ Found 6 duplicate tile(s)                           │
│                                                          │
│   📊 Company Dashboard [Tab: Imported] - 4 copies       │
│     • abc12345 - Owner: admin - 15 links (will be kept) │
│     • def67890 - Owner: john - 0 links (will be removed)│
│     • ...                                                │
├─────────────────────────────────────────────────────────┤
│ [🔍 Find Duplicate Tiles] [⚡ Smart Cleanup Duplicates] │
│ [❌ Clear Results]                                       │
├─────────────────────────────────────────────────────────┤
│ 💡 How does Smart Cleanup work?                         │
│ Explanation...                                           │
└─────────────────────────────────────────────────────────┘
```

### Color Coding

- **Purple Theme** (#A855F7) - Duplicate cleanup branding
- **Blue Badge** - Category/group labels
- **Green Text** - Tiles with content (will be kept)
- **Orange Text** - Empty tiles (will be removed)
- **Green Results** - Success messages
- **Red Results** - Error messages

## Troubleshooting

### Issue: "No duplicate tiles found" but I still see duplicates

**Possible Causes:**
1. Tiles have slightly different names
2. Tiles are in different categories
3. Previous orphaned records (use Orphaned Records Cleanup)

**Solution:**
1. Check exact tile names and categories
2. Run Orphaned Records Cleanup first
3. Manually verify tile details

### Issue: Smart Cleanup doesn't remove a duplicate

**Cause:** The tile has content (links)

**Why:** The tool only removes **empty** duplicates to preserve data

**Solution:**
1. Review which tiles have links
2. Manually merge content if needed
3. Then delete unwanted tiles via normal UI

### Issue: Cleanup removed the wrong tile

**This should never happen** if:
- The tool kept the tile with most links
- Empty tiles were removed first

**If it did:**
1. Check database backup
2. Review cleanup report details
3. Contact support with report

### Issue: Error during cleanup

**Cause:** Database transaction failed

**Impact:** **No changes were made** (rollback occurred)

**Solution:**
1. Check error message
2. Verify database connection
3. Try again
4. Contact support if persists

## Best Practices

### For Administrators

1. ✅ **Always Find First**
   - Run "Find Duplicate Tiles" before cleanup
   - Review what will be kept/removed
   - Verify the logic makes sense

2. ✅ **Understand the Impact**
   - Smart Cleanup **deletes tiles**
   - Only empty tiles are removed
   - Tiles with content are preserved

3. ✅ **Run After Imports**
   - Always check for duplicates after bulk imports
   - Clean up immediately to avoid confusion

4. ✅ **Coordinate with Users**
   - If multiple users import tiles, coordinate cleanup
   - Communicate which tiles will be kept

5. ✅ **Backup First** (optional but recommended)
   - Export database before major cleanups
   - Keep backup of imported data

### For Developers

1. ✅ **Prevent Duplicates**
   - Add unique constraints where appropriate
   - Check for existing tiles before import
   - Implement merge logic

2. ✅ **Test Cleanup Logic**
   - Create test duplicates
   - Verify correct tile is kept
   - Test edge cases

3. ✅ **Monitor Duplicate Creation**
   - Track when duplicates are created
   - Log import operations
   - Alert on large duplicate counts

## Edge Cases

### Multiple Tiles with Same Content

**Scenario:** Two "Company Dashboard" tiles both have 10 links

**Behavior:** Keeps the **oldest** tile (created first)

**Reasoning:** Original tile is assumed to be the primary one

### All Duplicates are Empty

**Scenario:** Four "Company Dashboard" tiles all have 0 links

**Behavior:** Keeps the **oldest** tile, removes the rest

**Reasoning:** Preserve at least one tile for the name/category

### Different Owners, Same Tile

**Scenario:** 
- admin's "Dashboard" with 20 links
- john's "Dashboard" with 0 links

**Behavior:** Keeps admin's tile (has content), removes john's empty tile

**Reasoning:** Content preservation is priority #1

### Tiles in Different Categories

**Scenario:**
- "Dashboard" in "Main" category
- "Dashboard" in "Imported" category

**Behavior:** Both are **kept** (not considered duplicates)

**Reasoning:** Different categories = different tiles

## Performance Notes

### Scan Performance

- **Small databases** (< 100 tiles): Instant
- **Medium databases** (100-1000 tiles): 1-2 seconds
- **Large databases** (1000+ tiles): 3-5 seconds

### Cleanup Performance

- **Per tile deletion**: ~10-50ms (including related data)
- **Typical cleanup** (3-10 duplicates): 1-2 seconds
- **Large cleanup** (50+ duplicates): 5-10 seconds

### Database Impact

**During Scan:**
- Read-only queries
- No locks
- Minimal impact

**During Cleanup:**
- Transaction lock on affected tables
- Brief write lock
- Auto-rollback on error

## Related Features

1. **Orphaned Records Cleanup** - Remove database references to deleted tiles
2. **Tile Management** - Edit, delete, merge tiles manually
3. **Bulk Import** - Import tiles with duplicate detection
4. **Access Manager** - Manage tile admins and permissions

## Future Enhancements

### Planned Features

- [ ] Manual selection of which tile to keep
- [ ] Merge content from multiple duplicates
- [ ] Preview merge before cleanup
- [ ] Undo last cleanup operation
- [ ] Schedule automatic duplicate cleanup
- [ ] Email notifications of duplicates found
- [ ] Duplicate detection during import

### Integration Opportunities

- Add duplicate warning during tile creation
- Integrate with import wizard
- Add to system health dashboard
- Include in maintenance reports

---

## Quick Reference Card

### When to Use

| Symptom | Solution |
|---------|----------|
| Multiple identical tiles in Tile Admins | Use Duplicate Tiles Cleanup |
| Ghost tiles (deleted but still show) | Use Orphaned Records Cleanup |
| "[Tab: Imported]" tiles multiplied | Use Duplicate Tiles Cleanup |
| "No tile admins assigned" on copies | Use Duplicate Tiles Cleanup |

### Quick Start

1. Admin Panel → Maintenance
2. Find "Duplicate Tiles Cleanup" (purple section)
3. Click "Find Duplicate Tiles"
4. Review results
5. Click "Smart Cleanup Duplicates"
6. Confirm
7. Done! ✨

### Safety Checklist

- ✅ Preview with "Find" first
- ✅ Only empty tiles removed
- ✅ Transaction-based cleanup
- ✅ Confirmation required
- ✅ Detailed report provided
- ✅ Backup available (optional)

---

**For more information, see:**
- `docs/DATABASE_CLEANUP_UI.md` - Orphaned records cleanup
- `.docs/DATABASE_CLEANUP_FEATURE.md` - Overall cleanup system
- `scripts/CLEANUP_SCRIPTS.md` - CLI cleanup tools
