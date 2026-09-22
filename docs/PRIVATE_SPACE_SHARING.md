# Private Space Sharing (Share lists, invitations, revoke)

How “Private” spaces are shared with users, how the space editor shows that list, and what
happens when a recipient is unchecked.

## Data model

A private space keeps its audience in **two** places:

| Storage | Contents | Notes |
|---------|----------|-------|
| `tiles.allowed_users` (JSON array of user ids) | Owner **+ every recipient who accepted** a share invitation | Written by `PUT /api/tiles/{id}` (`api/tiles.php` → `updateTileInternal`) |
| `tile_share_invitations` (rows) | One row per recipient: `sharer_user_id`, `receiver_user_id`, `status` = `pending` / `accepted` / `rejected` / `removed` | Created/upserted by the same PUT; unique on `(tile_id, sharer_user_id, receiver_user_id)` |

Access rules (`api/tiles.php`, list + single-tile endpoints):

- owner → always;
- `allowed_users` contains the user;
- `allowed_groups` intersects the user's groups;
- an **`accepted`** invitation exists;
- role-based access (`role_tile_permissions`) — “Your Assigned Apps”.

A `pending` invitation grants **no** access yet; it only appears in the receiver's
*Shared with you* panel (`components/SharedTileNotifications.tsx`, `GET /api/tile-shares`).

## Sharing flow

1. Space owner → Edit → **Private** → check users (`components/TileDetail.tsx`, share panel).
2. On save the API upserts a `pending` invitation for each newly checked, non-owner user and
   keeps only owner + already-accepted users in `allowed_users`.
3. The recipient accepts (or rejects) it in *Shared with you*; accepting adds them to
   `allowed_users` (`api/tile_shares.php` → `handleAccept`).

## Showing the current share list in the editor (#2)

Because pending recipients are not in `allowed_users`, the editor would show their
checkboxes unchecked. To fix that, the editors below load the outstanding invitations for the
space when the edit panel opens:

- `GET /api/tile-shares/by-tile?tile_id=…` (owner or admin) →
  `getTileShares()` in `services/tileShareService.ts`;
- recipient ids are merged into the editor's allowed-user list, so checkboxes, chips and the
  “Users (n)” counter reflect *everyone the space is shared with*;
- each recipient shows a **Pending** badge until they accept (chips + list rows);
- full names are shown next to the login id (`utils/userDisplay.ts`,
  `display_name` → name from email → username);
- this runs in `TileDetail` (space page editor) and `MobileTileEdit`, and in the grid
  “Edit Space” dialog (`components/TileGrid.tsx` → `loadTileShares`, the picker with the
  Users/Groups tabs). The grid dialog also refreshes the list right after a save so
  invitations created by that save (newly checked users) can be revoked straight away.

## Unchecking a recipient (#3)

Unchecking a user in the share panel is treated as an explicit revoke:

- `TileDetail` maps recipient → invitation id from the data loaded above and calls
  `POST /api/tile-shares/{id}/revoke` (`handleRevokeBySharer`), which
  - marks the invitation `removed` (so it disappears from the receiver's pending list), and
  - removes the receiver from `tiles.allowed_users` (immediate loss of access);
- the grid “Edit Space” dialog does the same (`setUserShareAccess` → `revokeShareAccess` in
  `components/TileGrid.tsx`): unchecking a recipient revokes their share right away, and
  checking one back in re-invites them on the next save;
- if the revoke call fails, the checkbox is restored and the user is alerted, so the panel
  never claims access was removed when it was not;
- the normal tile save then persists the reduced `allowed_users` list.

Revoking is *not* touched by unrelated saves (grid/card edits, ChatWidget, MCP …), so a
share can never be dropped accidentally by a save that does not come from the share panel.
Recipients with no invitation row (legacy data) simply lose access when the tile is saved.

## Share badge on the space card

A shared space is recognisable straight away on the home grid: next to the link count the card
shows a small **double-person icon with the number of users** the space is shared with
(`components/TileGrid.tsx` → `SortableTile` footer; mobile icon badge in
`components/MobileTileView.tsx`).

- the number comes from the API field **`shareCount`**, so it counts **pending + accepted**
  invitations (`api/tiles.php`: one batched grouped query per list request, plus a per-tile
  count on `GET /api/tiles/{id}`). Pending recipients are *not* in `tiles.allowed_users`, so a
  client-side count would under-report;
- only the **owner / admins** receive a non-zero value — for everybody else the badge stays
  hidden (`shareCount` is `0`), and spaces shared *with* you keep their existing “by owner”
  affordance;
- clicking the badge opens the existing `ShareTileDialog`, so the recipient list can be
  reviewed/revoked without leaving the grid (`onShareTile`).

## Deleting a shared space (revoke & delete)

Deleting a space that other users can open asks what should happen to their access first
(`components/DeleteSharedSpaceDialog.tsx`, opened from the card delete action in
`components/TileGrid.tsx` and from the space header in `components/SpaceViewHeaderActions.tsx`):

- the dialog lists every recipient — invitation rows (Pending / Accepted) plus users listed
  directly in `tiles.allowed_users` that have no invitation on file — with login id and full name;
- **Revoke access & delete** first calls `revokeAllTileShares()` (`services/tileShareService.ts`
  → `POST /api/tile-shares/{id}/revoke` per recipient, ending in the usual
  `DELETE /api/tiles/{id}`). Recipients lose access immediately and the invitation leaves their
  *Shared with you* panel instead of lingering; a failed revoke keeps the dialog open with the
  names that still have access, and nothing is deleted;
- **Delete without revoking** skips the revoke (invitations survive, so restoring the space from
  the recycle bin shares it with the same people again);
- spaces that are not shared keep the simple `confirm()` prompt, and the delete itself is still
  the normal soft delete (recycle bin);
- admins may list and revoke shares they did not create, so an admin deleting somebody else's
  shared space can still clean the recipients up (`api/tile_shares.php` `handleListByTile` /
  `handleRevokeBySharer` now allow `is_admin`).


Related, unchanged by design: an admin sees every space; role, group and explicit
`user_tile_permissions` grants are separate from sharing; switching a space to
public/authenticated keeps existing invitation rows so switching back to private does not
lose the share list.

## LDAP full names (`display_name`)

`users.display_name` is the single source for full names (chat, presence, share pickers).

- LDAP login now stores `displayName` (fallback `cn`) for new and existing users
  (`api/auth.php`, `handleLogin`).
- Admin → Add LDAP user and bulk LDAP import store the display name they already receive.
- Admin → Users → **Sync LDAP Names** (`POST /api/auth/sync-ldap-display-names`) backfills
  names for LDAP users that have none, using the configured *Display Name Attribute*
  (defaults to `displayName`, then `cn`) and reusing the LDAP bind/search helpers.

## Key files

- `components/TileGrid.tsx` – grid cards (share badge, delete → shared-space dialog), share panel in “Edit Space”
- `components/DeleteSharedSpaceDialog.tsx` – revoke-&-delete / delete-without-revoking confirmation
- `components/MobileTileView.tsx` – mobile icon grid (share badge)
- `components/SpaceViewHeaderActions.tsx` – space header delete/share actions
- `components/TileDetail.tsx` – private share panel (users/groups, pending badges, revoke)
- `components/MobileTileEdit.tsx` – mobile equivalent of the same list
- `services/tileShareService.ts` – share/invite/accept/revoke API client
- `api/tiles.php` – visibility + invitation upsert on save
- `api/tile_shares.php` – list/accept/reject/remove/revoke/block endpoints
- `api/auth.php` – LDAP display-name capture + sync endpoint
- `utils/userDisplay.ts` – “login id · full name” helpers
