# Message Board — Tab Scoping, Banner Placement, Fonts & Marquee Speed

Scheduled messages (space **Edit Space → 💬 Message Board**) can be limited to specific
tabs of the space, can optionally stay on the home-grid card while restricted, and can be
rendered above the tab strip (default) or directly below it on the space page.

## Fields (`TileMessage`)

| Field | Type | Meaning |
|-------|------|---------|
| `tabIds` | `string[]` (optional) | Ids of the space's `Tab` entities the message is restricted to **on the space page**. Empty/omitted = every tab (unchanged legacy behaviour). |
| `showOnCard` | `boolean` (optional) | Only meaningful when `tabIds` is set: keep the message on the **home-grid card** banner even though it is tab-restricted. |
| `placement` | `'above' / 'below'` (optional) | Space-page banner position: `'above'` (default) keeps the banner above the tab strip; `'below'` moves it to the top of the content area, directly under the tabs. |
| `fontFamily` | `string` (optional) | Key from `MESSAGE_FONT_FAMILIES` (`types.ts`) — bundled/system stacks only. Omitted = inherit the space font. |
| `fontSize` | `number` (optional) | px, clamped 8-72. Omitted = the surface default (card `10-12px`, space page `14px`). |
| `marqueeSeconds` | `number` (optional) | Seconds for one full marquee pass, clamped 5-180. Rollover/marquee messages only. |

### Visibility rules

| Surface | Rule |
|---------|------|
| Space page (`TileDetail`) | `isActive` ∧ within `startDate`/`endDate` ∧ `displayLocation` ∈ {`detail`, `both`, unset} ∧ (`tabIds` empty ∨ active tab ∈ `tabIds`) |
| Home-grid card (`TileGrid`) | `isActive` ∧ within dates ∧ `displayLocation` ∈ {`tile`, `both`, unset} ∧ (`displayLocation === 'tile'` → always visible; else `tabIds` empty ∨ `showOnCard === true`) |

So a tab-restricted message **leaves the card** unless “Also show on the space card” is
ticked. Choosing *Tile Only* ignores tab scope entirely — a card has no tab context, so a
tile-only message never disappears because of a leftover tab scope.

## Banner placement (space page)

`placement` only affects the space page and is ignored for `displayLocation: 'tile'`.

| Value | Position |
|-------|----------|
| `above` (default) | Banner stays under the search bar, above the tab strip. |
| `below` | Top of the content area, directly under the tab row and above the section cards. |

The same position is used for every tab layout (horizontal strip, mobile hamburger, floating
vertical menu, docked vertical column). Each slot rotates its own messages independently, and
the tab/date/`displayLocation` filtering applies to both slots.

## Fonts & marquee speed

| Field | Effect |
|-------|--------|
| `fontFamily` | Rendered as an inline CSS font stack (see `utils/messageStyle.ts`), so nothing is fetched at runtime and no layout shift is possible. |
| `fontSize` | Applied as an inline `font-size` on both the card marquee and the space-page banner; the space-page banner track uses `min-h-6` so taller text is never clipped. |
| `marqueeSeconds` | Drives the `--marquee-duration` CSS variable consumed by `.animate-rolling-tile` / `.animate-rolling-detail` in `index.css`. Unset falls back to the original 25s (card) / 35s (space page). |

**When several rollover messages share one marquee the slowest value wins**, so a faster value set
on one message cannot speed up the marquee the others scroll in. The slider is only shown for
messages with the *Rollover (Marquee)* animation type, and hovering a marquee still pauses it
(`animation-play-state: paused`).
## Editor UI

* **Show On Tabs** (in the message form, below *Display Location*) — checkbox chips for every
  tab of the space (emoji + title), plus **All tabs** / **Select all** shortcuts and a hint line
  (`Shown only on N of M tabs…`).
* The picker is hidden when *Display Location* is `Tile Only`, and shows
  “This space has no tabs yet…” when the space has none.
* **Also show on the space card** appears only once at least one tab is selected.
* **Display below the tabs** switches the banner between above the tab strip (default) and the top of the content area; hidden for *Tile Only* messages.
* **Font** / **Font Size** / **Marquee Scroll Duration** control the message typography and the marquee speed; the header preview renders with the chosen font live, and a faster value never overrides a slower message in the same marquee.
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

* SQLite columns on `tile_messages`: `tab_ids TEXT` (JSON array, `NULL` = unrestricted),
  `show_on_card INTEGER DEFAULT 0` (**v107**), `placement TEXT DEFAULT 'above'` (**v108**) and
  `font_family TEXT` / `font_size INTEGER` / `marquee_seconds INTEGER` (**v109**)
  (`ensureTileMessageColumns()` in `api/config.php`, additive + idempotent).
* `api/tiles.php` decodes/encodes them through `tileMessageTabIdsFromRow()`,
  `tileMessageShowOnCardFromRow()`, `tileMessagePlacementFromRow()` /
  `tileMessagePlacementForStorage()`, `tileMessageFontFamily*()`, `tileMessageFontSize*()`,
  `tileMessageMarqueeSeconds*()`, and `tileMessageTabIdsForStorage()` at every
  message read (list summary, list, single GET, version snapshots) and write (create, update,
  card/messages-only save, clone).
* Space import (`services/spaceTransferService.ts`) remaps old tab ids onto the freshly
  generated tab ids; space “create new” (`regenerateIds` in `services/spaceCompareService.ts`)
  does the same. Space comparison shows changes to `tabIds` / `showOnCard`.

## Related files

`types.ts`, `utils/messageStyle.ts`, `components/TileGrid.tsx`, `components/TileDetail.tsx`,
`components/TileMessageBanner.tsx`, `index.css`, `services/spaceTransferService.ts`,
`services/spaceCompareService.ts`, `api/tiles.php`, `api/tile_messages_lib.php`,
`api/config.php`, `docs/schemas/schema-*.sql`.
