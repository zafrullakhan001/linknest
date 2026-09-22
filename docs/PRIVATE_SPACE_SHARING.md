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
checkboxes unchecked. To fix that, `TileDetail` loads the outstanding invitations for the
space when the edit panel opens:

- `GET /api/tile-shares/by-tile?tile_id=…` (owner or admin) →
  `getTileShares()` in `services/tileShareService.ts`;
- recipient ids are merged into the editor's allowed-user list, so checkboxes, chips and the
  “Users (n)” counter reflect *everyone the space is shared with*;
- each recipient shows a **Pending** badge until they accept (chips + list rows);
- full names are shown next to the login id (`utils/userDisplay.ts`,
  `display_name` → name from email → username).

## Unchecking a recipient (#3)

Unchecking a user in the share panel is treated as an explicit revoke:

- `TileDetail` maps recipient → invitation id from the data loaded above and calls
  `POST /api/tile-shares/{id}/revoke` (`handleRevokeBySharer`), which
  - marks the invitation `removed` (so it disappears from the receiver's pending list), and
  - removes the receiver from `tiles.allowed_users` (immediate loss of access);
- if the revoke call fails, the checkbox is restored and the user is alerted, so the panel
  never claims access was removed when it was not;
- the normal tile save then persists the reduced `allowed_users` list.

Revoking is *not* touched by unrelated saves (grid/card edits, ChatWidget, MCP …), so a
share can never be dropped accidentally by a save that does not come from the share panel.
Recipients with no invitation row (legacy data) simply lose access when the tile is saved.

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

- `components/TileDetail.tsx` – private share panel (users/groups, pending badges, revoke)
- `components/MobileTileEdit.tsx` – mobile equivalent of the same list
- `services/tileShareService.ts` – share/invite/accept/revoke API client
- `api/tiles.php` – visibility + invitation upsert on save
- `api/tile_shares.php` – list/accept/reject/remove/revoke/block endpoints
- `api/auth.php` – LDAP display-name capture + sync endpoint
- `utils/userDisplay.ts` – “login id · full name” helpers
