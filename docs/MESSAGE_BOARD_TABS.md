# Message Board — Tab Scoping

Scheduled messages (space **Edit Space → 💬 Message Board**) can be limited to specific
tabs of the space, and can optionally stay on the home-grid card while restricted.

## Fields (`TileMessage`)

| Field | Type | Meaning |
|-------|------|---------|
| `tabIds` | `string[]` (optional) | Ids of the space's `Tab` entities the message is restricted to **on the space page**. Empty/omitted = every tab (unchanged legacy behaviour). |
| `showOnCard` | `boolean` (optional) | Only meaningful when `tabIds` is set: keep the message on the **home-grid card** banner even though it is tab-restricted. |

### Visibility rules

| Surface | Rule |
|---------|------|
| Space page (`TileDetail`) | `isActive` ∧ within `startDate`/`endDate` ∧ `displayLocation` ∈ {`detail`, `both`, unset} ∧ (`tabIds` empty ∨ active tab ∈ `tabIds`) |
| Home-grid card (`TileGrid`) | `isActive` ∧ within dates ∧ `displayLocation` ∈ {`tile`, `both`, unset} ∧ (`displayLocation === 'tile'` → always visible; else `tabIds` empty ∨ `showOnCard === true`) |

So a tab-restricted message **leaves the card** unless “Also show on the space card” is
ticked. Choosing *Tile Only* ignores tab scope entirely — a card has no tab context, so a
tile-only message never disappears because of a leftover tab scope.

## Editor UI

* **Show On Tabs** (in the message form, below *Display Location*) — checkbox chips for every
  tab of the space (emoji + title), plus **All tabs** / **Select all** shortcuts and a hint line
  (`Shown only on N of M tabs…`).
* The picker is hidden when *Display Location* is `Tile Only`, and shows
  “This space has no tabs yet…” when the space has none.
* **Also show on the space card** appears only once at least one tab is selected.
* Tab ids that no longer exist on the space are shown as removable `Removed tab ✕` chips
  (never silently dropped while editing).
* Each row of the message list shows `Tabs: …` (or `All tabs`) plus a `Card too` pill when
  `showOnCard` is set.
* The downloaded **AI prompt** lists this space's tab ids and documents `tabIds` / `showOnCard`;
  the JSON import validates them and resets references that do not exist on the target space to
  `All tabs` (reported in the import summary).

Home-grid cards arrive in **summary mode** with `tabs: []` (`api/tiles.php`), so the modal
lazily fetches the full space via `getTile(id)` when the Message Board tab is opened. That tab
list lives in local `editableSpaceTabs` state and is deliberately **not** merged into
`editingTile`, so saving keeps using `saveTile`'s `preserve_nested` path and can never overwrite
tabs, sections, or links.

## Storage & API

* SQLite column pair on `tile_messages`: `tab_ids TEXT` (JSON array, `NULL` = unrestricted) and
  `show_on_card INTEGER DEFAULT 0` — schema **v107**
  (`ensureTileMessageScopeColumns()` in `api/config.php`, additive + idempotent).
* `api/tiles.php` decodes/encodes them through `tileMessageTabIdsFromRow()`,
  `tileMessageShowOnCardFromRow()`, and `tileMessageTabIdsForStorage()` at every
  message read (list summary, list, single GET, version snapshots) and write (create, update,
  card/messages-only save, clone).
* Space import (`services/spaceTransferService.ts`) remaps old tab ids onto the freshly
  generated tab ids; space “create new” (`regenerateIds` in `services/spaceCompareService.ts`)
  does the same. Space comparison shows changes to `tabIds` / `showOnCard`.

## Related files

`types.ts`, `components/TileGrid.tsx`, `components/TileDetail.tsx`,
`services/spaceTransferService.ts`, `services/spaceCompareService.ts`,
`api/tiles.php`, `api/config.php`, `docs/schemas/schema-*.sql`.
