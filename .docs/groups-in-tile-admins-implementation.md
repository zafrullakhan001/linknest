# Groups in Tile Admins - Implementation Progress

## Overview
This document tracks the implementation of showing groups alongside users in the Tile Admin Management interface.

## Completed Steps

### 1. Database Layer
✅ Created `group_tile_permissions` table via migration
   - File: `scripts/migrations/add_group_tile_permissions.php`
   - Table structure includes all granular permissions
   - Foreign keys to `user_groups` and `tiles` tables
   - Indexes for performance

### 2. Backend API
✅ Created Group Tile Permissions API
   - File: `api/group_tile_permissions.php`
   - Endpoints:
     - GET `/api/group-tile-permissions` - Get all group tile permissions
     - GET `/api/group-tile-permissions/batch` - Get batch permissions by tile
     - GET `/api/group-tile-permissions/tile/{tileId}` - Get group permissions for a tile
     - GET `/api/group-tile-permissions/group/{groupId}` - Get tile permissions for a group
     - POST `/api/group-tile-permissions` - Set group tile permission
     - PUT `/api/group-tile-permissions/{groupId}_{tileId}` - Update permission
     - DELETE `/api/group-tile-permissions/{groupId}_{tileId}` - Delete permission

✅ Registered API route in `api/index.php`

### 3. Frontend Services
✅ Created TypeScript service
   - File: `services/groupTilePermissionsService.ts`
   - Full CRUD operations for group tile permissions
   - Type definitions for GroupTilePermission interface

### 4. Admin Panel Updates
✅ Added imports
   - Imported `groupTilePermissionsService`
   - Imported `GroupTilePermission` type

✅ Added state management
   - `tileAdminGroupsMap` - Stores group permissions by tile
   - `tileAdminEntityFilter` - Filter for 'all', 'users', or 'groups'

✅ Updated tile admin loading
   - `handleManageTileAdmins` now loads both user and group permissions
   - Batch loads groups alongside users

✅ Added group handlers
   - `handleAddGroupTileAdmin` - Add group as tile admin
   - `handleRemoveGroupTileAdmin` - Remove group as tile admin

## Remaining Steps

### 5. UI Updates (In Progress)
The UI needs to be updated to show groups alongside users. Here's what needs to be changed:

#### Update Title and Description
Change "Select Users" to "Select Users & Groups" in the modal:

```tsx
<label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
  Select Users & Groups
</label>
```

Update the description text:
```tsx
<p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
  Select tiles on the left and users/groups on the right to assign tile admin privileges. Tile admins can add and edit links, sections, and tabs by default. Delete, visibility, browser, and clone actions are restricted.
</p>
```

#### Add Entity Type Filter
Add a filter dropdown to toggle between All, Users Only, and Groups Only:

```tsx
{/* Entity Type Filter */}
<div className="mb-3">
  <select
    value={tileAdminEntityFilter}
    onChange={(e) => setTileAdminEntityFilter(e.target.value as 'all' | 'users' | 'groups')}
    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
  >
    <option value="all">All Users & Groups</option>
    <option value="users">Users Only</option>
    <option value="groups">Groups Only</option>
  </select>
</div>
```

#### Create Combined Entity List
Combine users and groups into a single list with type indicators:

```tsx
// Create combined list of users and groups
const combinedEntities = [
  // Users
  ...filteredUsers.map(user => ({
    type: 'user' as const,
    id: `user-${user.id}`,
    entityId: user.id,
    name: user.username,
    email: user.email,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
      </svg>
    )
  })),
  // Groups
  ...filteredGroups.map(group => ({
    type: 'group' as const,
    id: `group-${group.id}`,
    entityId: group.id,
    name: group.name,
    description: group.description,
    memberCount: group.memberCount,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.357-.442 3 3 0 00-4.308-3.517 6.484 6.484 0 011.907 3.96 2.32 2.32 0 01-.026.654zM18 8a2 2 0 11-4 0 2 2 0 014 0zM5.304 16.19a.844.844 0 01-.277-.71 5 5 0 019.947 0 .843.843 0 01-.277.71A6.975 6.975 0 0110 18a6.974 6.974 0 01-4.696-1.81z" />
      </svg>
    )
  }))
].filter(entity => {
  if (tileAdminEntityFilter === 'users') return entity.type === 'user';
  if (tileAdminEntityFilter === 'groups') return entity.type === 'group';
  return true;
});
```

#### Render Combined List
Map through the combined entities and render with appropriate handlers:

```tsx
{combinedEntities.map((entity) => {
  const selectedTileIds: string[] = Array.from(selectedTileIdsForAdmins);
  
  return (
    <div
      key={entity.id}
      className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          entity.type === 'user' 
            ? 'bg-slate-200 dark:bg-slate-700' 
            : 'bg-blue-100 dark:bg-blue-900/30'
        }`}>
          {entity.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
              {entity.name}
            </div>
            {entity.type === 'group' && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                GROUP
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {entity.type === 'user' ? entity.email : `${entity.memberCount} members`}
          </div>
        </div>
      </div>
      
      {/* Checkboxes for each selected tile */}
      {selectedTileIds.length > 0 && (
        <div className="ml-11 space-y-1">
          {selectedTileIds.map((tileId: string) => {
            const tile = allTiles.find(t => t.id === tileId);
            const isAdmin = entity.type === 'user'
              ? tileAdminsMap[tileId]?.some(admin => admin.userId === entity.entityId) || false
              : tileAdminGroupsMap[tileId]?.some(admin => admin.groupId === entity.entityId) || false;
            
            return (
              <label key={tileId} className="flex items-center gap-2 cursor-pointer py-0.5">
                <input
                  type="checkbox"
                  checked={isAdmin}
                  onChange={async (e) => {
                    if (entity.type === 'user') {
                      if (e.target.checked) {
                        await handleAddTileAdmin(entity.entityId, tileId);
                      } else {
                        await handleRemoveTileAdmin(entity.entityId, tileId);
                      }
                    } else {
                      if (e.target.checked) {
                        await handleAddGroupTileAdmin(entity.entityId, tileId);
                      } else {
                        await handleRemoveGroupTileAdmin(entity.entityId, tileId);
                      }
                    }
                  }}
                  className="w-3.5 h-3.5 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500 focus:ring-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-700 dark:text-slate-300">
                      {tile?.emoji || '📄'} {tile?.title || tileId}
                    </span>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
})}
```

#### Update Search Placeholder
Change search placeholder to include groups:
```tsx
placeholder="Search users & groups..."
```

#### Update Admin Count Display
Update tile admin count to show both users and groups:

```tsx
const admins = tileAdminsMap[tile.id] || [];
const groupAdmins = tileAdminGroupsMap[tile.id] || [];
const totalAdmins = admins.length + groupAdmins.length;

<span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-brand-100 text-brand-800 dark:bg-brand-900/30 dark:text-brand-300">
  {totalAdmins} admin{totalAdmins !== 1 ? 's' : ''} 
  ({admins.length} user{admins.length !== 1 ? 's' : ''}, {groupAdmins.length} group{groupAdmins.length !== 1 ? 's' : ''})
</span>
```

## Testing Checklist

Once UI updates are complete, test the following:

- [ ] Open Tile Admin Management modal
- [ ] Verify groups appear alongside users
- [ ] Test filter dropdown (All, Users Only, Groups Only)
- [ ] Search for both users and groups
- [ ] Assign a user as tile admin
- [ ] Assign a group as tile admin
- [ ] Remove a user from tile admin
- [ ] Remove a group from tile admin
- [ ] Verify admin count shows both users and groups
- [ ] Test with multiple tiles selected
- [ ] Verify granular permissions work for both users and groups

## Notes

- Groups are visually distinguished with a blue background and "GROUP" badge
- Group icon shows multiple people vs single person for users
- Member count is shown for groups instead of email
- Both users and groups have the same permission structure
- Backend supports full CRUD operations for group tile permissions
