# Space lifecycle banners (Recycle Bin preview + Archived space)

Two banners appear at the top of a space page:

| Situation | Banner | Actions |
| --- | --- | --- |
| Space opened from the **Recycle Bin** (soft-deleted) | 🗑️ “In Recycle Bin — read-only preview” (amber) | Restore · Delete forever · Back to Recycle Bin |
| Space **archived** (`archived_at` set), opened from the Archive tab or a direct link | 📦 “This space is archived” (sky) | Unarchive · Back to Archive |

Both show the timestamp plus tab/section/link counts, and share `utils/spaceLifecycle.ts`
(`toEpochMs`, `formatLifecycleDate`, `countSpaceContents`) — archived/deleted timestamps are Unix
**seconds** while most other tile dates are milliseconds.

---

## 1. Recycle Bin preview (read-only)

Deleted spaces open like any other space — read-only. Admins may open **any** recycled space; a
regular user may open **their own** (the Recycle Bin list is already owner-scoped for non-admins).

Before this change, clicking a Recycle Bin card did nothing useful: the client asked
`POST /api/access-restrictions/check`, the server answered `404 Not found` (the restriction chain
only looked at rows with `deleted_at IS NULL AND archived_at IS NULL`), and the UI showed the
generic *“Access restricted / Not found”* dialog without navigating. Even if it had navigated,
`GET /api/tiles/{id}` also filtered `deleted_at IS NULL`, so the space page could never load.

### `GET /api/tiles/{id}?include_deleted=1` (`api/tiles.php` → `handleGetTile()`)

* The normal path is unchanged: `SELECT * FROM tiles WHERE id = ? AND deleted_at IS NULL`.
  Live spaces behave exactly as before, including when the flag is sent (it is ignored).
* Only when the strict lookup misses **and** the opt-in flag (`include_deleted=1`, alias
  `recycled=1`) is present, a second, targeted lookup runs:
  * admin → `… WHERE id = ? AND deleted_at IS NOT NULL`
  * any other authenticated user → `… WHERE id = ? AND deleted_at IS NOT NULL AND user_id = ?`
    (i.e. only the space owner)
* Anyone else (guests, other users) still receives `404 {"error":"Tile not found"}`.
* For a recycled row the staging / published / visibility gates are skipped (the row was already
  authorised) and the payload is forced read-only: `canView: true`, `canEdit: false`,
  `canDelete: true`, plus `deletedAt` (Unix seconds).

`tabs`, `sections`, `links` and `messages` are returned in full, so the space renders with its real
content (including Message Board banners).

### Flow

* `TileGrid.handleTileClick()` resolves recycled cards from `recycleBinTiles`, never launches a
  hyperlink/video target for a deleted space and navigates to `#/tile/{id}?from=recycle-bin`.
* `App.tsx` reads the source tab from the route and fetches with `includeDeleted`, passes
  `isRecycleBin` to `TileDetail`, and skips the visit counter (the API rejects visits for deleted rows).
* `TileDetail` forces view mode (ignores `?edit=1`), skips presence and renders
  `components/RecycleBinPreviewBanner.tsx`.
* `SpaceViewHeaderActions` receives `recycleBinMode`: Edit, Clone, Share, Archive, Delete,
  Move to Staging/Public, Favourite and the link-health check are hidden; **Info** and **Export** stay.

---

## 2. Archived space banner

Opening an archived space (Archive tab card, or a direct `#/tile/{id}` link) shows the
📦 **“This space is archived”** banner with:

* `Archived <date/time>` and `by <name>` (when known)
* tab / section / link counts
* **Unarchive** — calls `POST /api/tiles/{id}/unarchive` (service `unarchiveTile()`), then returns to
  the dashboard where the Archive tab reloads
* **Back to Archive**

Archived spaces stay **editable** for admins/owners (unchanged behaviour) — the header **Archive**
button is replaced by **Unarchive** (`SpaceViewHeaderActions` → `archiveMode` / `onUnarchive`) so the
space cannot be archived again. Tile Info (`GET /tiles/{id}/info`) also lists “Archived by”.

### Who/when is recorded (schema v111)

`api/tiles.php` writes the actor on archive and clears it on unarchive:

```sql
-- handleArchiveTile / handleArchiveCategory
UPDATE tiles SET archived_at = ?, archived_by = ?, archived_by_username = ? WHERE id = ?
-- handleUnarchiveTile / handleUnarchiveCategory
UPDATE tiles SET archived_at = NULL, archived_by = NULL, archived_by_username = NULL WHERE id = ?
```

* Schema: `LINKNEST_SCHEMA_VERSION` **111** — `tiles.archived_by` (user id) and
  `tiles.archived_by_username` (username snapshot), added by `ensureTileArchiveActorColumns()`
  (idempotent `PRAGMA table_info` + `ALTER TABLE`, called from both fast paths and the full
  `initDatabase()` path).
* Archive/unarchive also write the audit trail:
  `logUserAudit('space.archived' | 'space.unarchived', …)` into `user_audit_log` (actor id + username,
  tile id and title).
* `GET /api/tiles/{id}` returns `archivedAt`, `archivedBy`, `archivedByName`; `GET /api/tiles/{id}/info`
  returns the same. `archivedByName` resolves the live account (`display_name`, else `username`) and
  falls back to the stored snapshot if the account is gone. Actor fields are only populated for
  **authenticated** viewers — a guest opening a public archived space sees the date but not who
  archived it.
* Spaces archived before v111 have `archived_by = NULL`, so the banner shows just the date (no actor
  history to recover).

---

## Access-restriction chain

`api/access_restrictions_lib.php`:

* `load_access_restriction_chain($db, $entityType, $id, $includeSoftRemoved = false)` — the
  `deleted_at IS NULL AND archived_at IS NULL` filter is skipped when `$includeSoftRemoved` is true.
* `evaluate_entity_access_chain()` retries with that flag **only** when the strict lookup misses, the
  caller is authenticated, and the row is soft-removed and the caller is an admin or the row’s owner
  (`soft_removed_tile_is_viewable_by()`). Everyone else still gets `not_found`.
* Result: the “Access restricted / Not found” dead-end is gone for admins/owners for recycled spaces
  **and** for Archive-tab cards; live-space behaviour is untouched and tab/link launches keep
  evaluating their own rules.

---

## Verification

`GET /api/tiles/{id}` against a soft-deleted space (private, unpublished, expired access rule):

| Caller | `?include_deleted=1` | Result |
| --- | --- | --- |
| admin | no | `404 Tile not found` (live path untouched) |
| admin | yes | full read-only payload (`canEdit:false`, `deletedAt`, tabs/sections/links) |
| owner (non-admin) | yes | full read-only payload |
| other user / guest | yes | `404 Tile not found` |
| admin, **live** tile | with & without | identical responses (flag ignored) |

Archived flow, driven through the real router against a throwaway DB copy:

| Step | Result |
| --- | --- |
| `POST /tiles/{id}/archive` (admin) | `{"success":true}`; row gets `archived_at`, `archived_by=2`, `archived_by_username='admin'`; `space.archived` audit row written |
| `GET /tiles/{id}` (admin) | `archivedAt`, `archivedBy`, `archivedByName:"Admin"` (display name) |
| `GET /tiles/{id}` (guest, public archived space) | `archivedAt` present, `archivedBy`/`archivedByName` null |
| `GET /tiles/{id}/info` (admin) | `archivedBy` + `archivedByName` present |
| `POST /tiles/{id}/unarchive` (admin) | `{"success":true}`; `archived_*` cleared; `space.unarchived` audit row written |
| Migration on a v110 database | `user_version` → 111, `schema_releases` row for 111, both columns present |

Restriction chain on the same soft-removed space: `allowed` for admin and owner, `not_found` for any
other user and for guests; the same holds for archived (not deleted) spaces.
