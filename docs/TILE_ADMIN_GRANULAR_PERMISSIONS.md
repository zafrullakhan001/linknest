# Tile Admin Granular Permissions

## Overview

This document describes the granular permission system for tile administrators, allowing fine-grained control over what actions tile admins can perform on delegated tiles.

## Features

### Allowed Actions (Default)
- ✅ **Add Links** - Tile admins can add new links to sections
- ✅ **Add Sections** - Tile admins can add new sections to tabs
- ✅ **Add Tabs** - Tile admins can add new tabs to tiles
- ✅ **Edit Links** - Tile admins can edit existing links

### Restricted Actions (Default)
- ❌ **Delete Links** - Tile admins cannot delete links by default
- ❌ **Delete Sections** - Tile admins cannot delete sections by default
- ❌ **Delete Tabs** - Tile admins cannot delete tabs by default
- ❌ **Change Visibility** - Tile admins cannot change tile/link visibility settings
- ❌ **Change Browser** - Tile admins cannot change browser settings
- ❌ **Clone Tile** - Tile admins cannot clone tiles

## Database Schema

The `user_tile_permissions` table has been extended with the following columns:

- `can_add_links` (INTEGER DEFAULT 1)
- `can_add_sections` (INTEGER DEFAULT 1)
- `can_add_tabs` (INTEGER DEFAULT 1)
- `can_edit_links` (INTEGER DEFAULT 1)
- `can_delete_links` (INTEGER DEFAULT 0)
- `can_delete_sections` (INTEGER DEFAULT 0)
- `can_delete_tabs` (INTEGER DEFAULT 0)
- `can_change_visibility` (INTEGER DEFAULT 0)
- `can_change_browser` (INTEGER DEFAULT 0)
- `can_clone_tile` (INTEGER DEFAULT 0)

## API Changes

### Access API (`/api/access`)

The `setPermission` and `updatePermission` endpoints now accept granular permission fields:

```json
{
  "userId": 123,
  "tileId": "tile_abc",
  "canView": true,
  "canEdit": true,
  "canDelete": false,
  "canAddLinks": true,
  "canAddSections": true,
  "canAddTabs": true,
  "canEditLinks": true,
  "canDeleteLinks": false,
  "canDeleteSections": false,
  "canDeleteTabs": false,
  "canChangeVisibility": false,
  "canChangeBrowser": false,
  "canCloneTile": false
}
```

### Tiles API (`/api/tiles`)

The tile update endpoint (`PUT /api/tiles/{tileId}`) now checks granular permissions before allowing:
- Adding tabs/sections/links
- Deleting tabs/sections/links
- Changing visibility settings
- Changing browser settings

The clone endpoint (`POST /api/tiles/{tileId}/clone`) checks `canCloneTile` permission.

## Helper Functions

### `getTileAdminPermissions($userId, $tileId, $db)`

Returns granular permissions for a tile admin, or `null` if the user is not a tile admin.

### `canTileAdminPerformAction($userId, $tileId, $action, $db)`

Checks if a tile admin can perform a specific action. Returns:
- `true` - Action is allowed
- `false` - Action is explicitly denied
- `null` - User is not a tile admin (check other permissions)

Actions:
- `add_link`
- `add_section`
- `add_tab`
- `edit_link`
- `delete_link`
- `delete_section`
- `delete_tab`
- `change_visibility`
- `change_browser`
- `clone_tile`

## Permission Precedence

1. **System Admins** - Always have full access (bypass all restrictions)
2. **Tile Creators** - Always have full access to their own tiles
3. **Tile Admin Permissions** - Granular restrictions apply
4. **Role-Based Permissions** - Applied if user is not a tile admin

**Important**: Tile admin restrictions take precedence over role-based permissions. If a user is a tile admin with restricted permissions, those restrictions apply even if their role would normally allow the action.

## UI Updates Needed

The following UI components should be updated to respect granular permissions:

### TileDetail.tsx
- Hide/disable delete buttons for links if `canDeleteLinks` is false
- Hide/disable delete buttons for sections if `canDeleteSections` is false
- Hide/disable delete buttons for tabs if `canDeleteTabs` is false
- Hide/disable visibility controls if `canChangeVisibility` is false
- Hide/disable browser settings if `canChangeBrowser` is false
- Hide/disable clone button if `canCloneTile` is false

### AdminPanel.tsx
- Add UI for configuring granular permissions when assigning tile admins
- Show current granular permissions for existing tile admins
- Allow editing granular permissions for existing tile admins

## Migration

The database migration is automatic. When the application starts, it will:
1. Check if granular permission columns exist
2. Add missing columns with appropriate defaults
3. Set default values for existing tile admins (allowing add/edit, restricting delete/visibility/browser/clone)

## Backward Compatibility

- Existing tile admins will have default permissions applied (add/edit allowed, delete/visibility/browser/clone restricted)
- If granular permission columns don't exist, the system falls back to the basic `can_edit` check
- The API accepts requests without granular permissions and applies sensible defaults

## Security Notes

- All permission checks are enforced on the backend
- Frontend UI hiding is for UX only - backend will reject unauthorized actions
- Tile admin restrictions override role-based permissions to prevent privilege escalation
- Admins and tile creators always bypass restrictions

## Example Usage

### Assigning a Tile Admin with Default Permissions

```typescript
await accessService.setPermission({
  userId: 123,
  tileId: "tile_abc",
  canView: true,
  canEdit: true,
  canDelete: false,
  // Granular permissions use defaults (add/edit allowed, delete/visibility/browser/clone restricted)
});
```

### Assigning a Tile Admin with Custom Permissions

```typescript
await accessService.setPermission({
  userId: 123,
  tileId: "tile_abc",
  canView: true,
  canEdit: true,
  canDelete: false,
  canAddLinks: true,
  canAddSections: true,
  canAddTabs: true,
  canEditLinks: true,
  canDeleteLinks: true,  // Allow deleting links
  canDeleteSections: false,
  canDeleteTabs: false,
  canChangeVisibility: false,
  canChangeBrowser: false,
  canCloneTile: false
});
```

## Future Enhancements

- UI for configuring granular permissions in AdminPanel
- Permission templates/presets for common scenarios
- Audit logging for permission changes
- Bulk permission updates
