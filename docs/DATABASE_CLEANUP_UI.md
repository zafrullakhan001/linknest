# Database Cleanup UI - Admin Panel Feature

## Overview

The Database Cleanup feature provides administrators with an easy-to-use interface for identifying and removing orphaned records from the LinkNest database directly from the Admin Panel.

## Accessing the Feature

1. **Login as Administrator**
2. **Navigate to Admin Panel** (user menu → Admin)
3. **Select the "Maintenance" Tab**
4. **Scroll to "Database Cleanup" section** (first section in the maintenance tab)

## Features

### 🔍 Check for Orphans

The "Check for Orphans" button scans the database and provides a detailed report of orphaned records without making any changes.

**What it checks:**
- Tile Permissions for deleted tiles
- Sections referencing deleted tiles
- Links referencing deleted sections
- Tabs referencing deleted tiles
- Duplicate permission entries

**Results Display:**
- Total count of orphaned records
- Breakdown by type with descriptions
- Color-coded results (green for clean, orange/red for issues)

### 🗑️ Clean Up Orphans

The "Clean Up Orphans" button removes all identified orphaned records from the database.

**Safety Features:**
- Requires confirmation before proceeding
- Uses database transactions (all-or-nothing approach)
- Provides detailed report of cleaned records
- Disabled when no orphans are found

**What it cleans:**
1. Orphaned tile permissions
2. Orphaned sections
3. Orphaned links
4. Orphaned tabs
5. Duplicate permission records

### 📊 Results Display

After running either operation, the UI displays:

**For Check Operations:**
```
✓ Found X orphaned record(s)

Orphaned records found:
• Tile Permissions: 4 — Permission records for deleted tiles
• Sections: 100 — Sections referencing deleted tiles
• Links: 250 — Links referencing deleted sections
• Tabs: 50 — Tabs referencing deleted tiles
```

**For Cleanup Operations:**
```
✓ Cleanup Complete - X record(s) removed

Records cleaned:
• Tile permissions: 4
• Sections: 100
• Links: 250
• Tabs: 50
```

**For Clean Database:**
```
✓ Database is Clean!
```

## Usage Workflow

### Recommended Process

1. **First, Check for Orphans**
   - Click "Check for Orphans"
   - Review the detailed report
   - Understand what will be cleaned

2. **Then, Clean Up (if needed)**
   - Click "Clean Up Orphans"
   - Confirm the action
   - Wait for completion message
   - Review the cleanup report

3. **Clear Results** (optional)
   - Click "Clear Results" to reset the display

### When to Use

Run the cleanup tool when you notice:

- ✅ Duplicate tiles appearing in Tile Admins page
- ✅ After bulk tile deletions
- ✅ After importing/restoring database backups
- ✅ Permission errors for non-existent tiles
- ✅ Slow tile-related queries
- ✅ Database size larger than expected
- ✅ As part of regular monthly maintenance

## Technical Details

### Backend API

**Endpoint:** `api/cleanup.php`

**Actions:**
- `?action=check` - Check for orphaned records
- `?action=cleanup` - Clean up orphaned records

**Authentication:**
- Requires active user session
- Requires administrator privileges
- Returns 401 if not authenticated
- Returns 403 if not admin

**Response Format:**
```json
{
  "success": true,
  "orphaned_found": 404,
  "details": [
    {
      "type": "tile_permissions",
      "label": "Tile Permissions",
      "count": 4,
      "description": "Permission records for deleted tiles"
    }
  ],
  "total_cleaned": 404,
  "cleaned": {
    "tile_permissions": 4,
    "sections": 100,
    "links": 250,
    "tabs": 50
  },
  "errors": []
}
```

### Frontend Integration

**Component:** `components/AdminPanel.tsx`

**State Management:**
```typescript
const [cleanupChecking, setCleanupChecking] = useState(false);
const [cleanupCleaning, setCleanupCleaning] = useState(false);
const [cleanupResults, setCleanupResults] = useState<CleanupResults | null>(null);
```

**Features:**
- Loading states with spinner animations
- Disabled buttons during operations
- Confirmation dialogs for destructive actions
- Success/error message display
- Color-coded visual feedback

## User Interface Design

### Visual Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│ 🗑️ Database Cleanup                                     │
│ Check for and remove orphaned records...                │
├─────────────────────────────────────────────────────────┤
│ [Results Display Area - Collapsible]                    │
│   ✓ Success/Error Messages                              │
│   📊 Detailed Breakdown                                 │
├─────────────────────────────────────────────────────────┤
│ [🔍 Check for Orphans] [🗑️ Clean Up] [❌ Clear Results] │
├─────────────────────────────────────────────────────────┤
│ 💡 What are orphaned records?                           │
│ Explanation and best practices...                       │
└─────────────────────────────────────────────────────────┘
```

### Color Scheme

- **Orange Icon** (#F97316) - Warning/cleanup theme
- **Blue Button** (#2563EB) - Check action (safe, read-only)
- **Orange Button** (#EA580C) - Cleanup action (requires confirmation)
- **Green Results** (#16A34A) - Success messages
- **Red Results** (#DC2626) - Error messages

### Responsive Design

- ✅ Desktop: Full-width layout with side-by-side buttons
- ✅ Mobile: Stacked buttons, wrapped text
- ✅ Dark mode support throughout
- ✅ Touch-friendly button sizing

## Error Handling

### Common Errors

**Not Authenticated:**
```json
{
  "error": "Not authenticated"
}
```
*Solution:* Refresh the page and log in again

**Not Admin:**
```json
{
  "error": "Admin access required"
}
```
*Solution:* Contact a system administrator

**Database Error:**
```json
{
  "success": false,
  "errors": ["SQLSTATE[HY000]: General error..."]
}
```
*Solution:* Check database connection and integrity

### Transaction Safety

All cleanup operations use database transactions:

```php
$db->beginTransaction();
try {
    // Cleanup operations
    $db->commit();
} catch (Exception $e) {
    $db->rollBack();
    // Report error
}
```

**This ensures:**
- Either all records are cleaned OR none are
- No partial cleanups that could corrupt data
- Automatic rollback on any error

## Best Practices

### For Administrators

1. **Check First, Clean Second**
   - Always review what will be cleaned before proceeding
   - Understand the counts and types

2. **Schedule Regular Checks**
   - Weekly: If actively deleting tiles
   - Monthly: For normal usage
   - Immediately: After bulk operations

3. **Monitor Database Size**
   - Compare size before/after cleanup
   - Track orphan trends over time

4. **Backup Before Major Cleanups**
   - Export database before cleaning if concerned
   - Keep recent backups for safety

### For Developers

1. **Use Cascade Deletes**
   - Add `ON DELETE CASCADE` to foreign keys
   - Prevents orphans at the source

2. **Test Cleanup in Development**
   - Create test orphans
   - Verify cleanup works correctly

3. **Monitor Cleanup Results**
   - Log cleanup operations
   - Alert if large numbers of orphans detected

## Comparison: UI vs CLI Scripts

| Feature | Admin UI | CLI Scripts |
|---------|----------|-------------|
| **Ease of Use** | ✅ Click buttons | ⚠️ Command line |
| **Visual Feedback** | ✅ Rich UI | ⚠️ Text output |
| **Accessibility** | ✅ Browser-based | ⚠️ Server access required |
| **Automation** | ❌ Manual only | ✅ Can schedule (cron) |
| **Detail Level** | ⚠️ Summary | ✅ Detailed logs |
| **Dry-Run Mode** | ❌ Not available | ✅ `--dry-run` flag |

**Recommendation:**
- Use **Admin UI** for regular maintenance and troubleshooting
- Use **CLI scripts** for automated maintenance and detailed reports

## Related Documentation

- **CLI Scripts:** `scripts/CLEANUP_SCRIPTS.md`
- **Backup/Restore:** `docs/DATABASE_BACKUP_RESTORE.md`
- **Maintenance Mode:** See Admin Panel > Maintenance tab

## Troubleshooting

### Issue: "Clean Up Orphans" button is disabled

**Causes:**
1. No orphans found (run check first)
2. Operation already in progress
3. Previous check returned 0 orphans

**Solution:**
- Click "Check for Orphans" first
- Wait for current operation to complete
- Refresh page if stuck

### Issue: Results not showing after clicking button

**Causes:**
1. API endpoint not accessible
2. Session expired
3. Network error

**Solution:**
1. Check browser console for errors
2. Verify API endpoint exists: `/api/cleanup.php`
3. Refresh page and try again
4. Check server logs

### Issue: Large number of orphans detected

**This is normal after:**
- Bulk tile deletions
- Database imports
- System migrations

**Action:**
- Review the breakdown
- Proceed with cleanup
- Consider adding cascade deletes

### Issue: Cleanup fails partway through

**Don't worry!**
- Transaction is rolled back automatically
- No partial cleanup occurs
- Database remains in consistent state
- Check error message for details

## Security Considerations

### Access Control

- ✅ Admin-only feature
- ✅ Session-based authentication
- ✅ Server-side privilege checking
- ✅ No privilege escalation possible

### Data Safety

- ✅ Confirmation required for destructive actions
- ✅ Transaction-based operations
- ✅ Automatic rollback on errors
- ✅ Only removes truly orphaned records

### Audit Trail

**Consider adding:**
- Logging of cleanup operations
- Record of who performed cleanup
- Timestamp of operations
- Count of records removed

## Future Enhancements

### Planned Features

- [ ] Dry-run mode in UI
- [ ] Scheduled automatic cleanup
- [ ] Email notifications of cleanup results
- [ ] Detailed audit logs
- [ ] Export cleanup reports to CSV
- [ ] Restore from backup integration
- [ ] One-click "Check and Clean" button

### Integration Opportunities

- Integrate with backup system
- Add to system health dashboard
- Include in maintenance schedule
- Link from error messages

---

## Quick Reference

**Location:** Admin Panel → Maintenance Tab → Database Cleanup

**Actions:**
- 🔍 **Check for Orphans** - Safe, read-only scan
- 🗑️ **Clean Up Orphans** - Removes orphaned records (requires confirmation)
- ❌ **Clear Results** - Reset display

**When to Use:** After bulk deletions, imports, or when seeing duplicate tiles

**Safety:** Transaction-based, requires confirmation, admin-only

**Support:** See `scripts/CLEANUP_SCRIPTS.md` for CLI alternatives
