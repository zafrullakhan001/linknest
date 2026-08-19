# Your Bookmarks & Favorite Links

Guest and signed-in **Favorites** help you keep everyday links close at hand. This guide covers **Favorite Links**, guest **Your Bookmarks**, compact views, link health, and the **Rewrite tools** suite (branding migrations, cleanup, pipelines, and recipes).

---

## Where to find them

| Mode | Tab / area | What you get |
|------|------------|--------------|
| **Guest** (not signed in) | **Favorites** tab | Favorite spaces + Favorite Links (browser storage) |
| **Guest** | Favorites → **Your Bookmarks** sub-tab | Import Chrome HTML; domain-grouped bookmark spaces |
| **Signed in** | **Favorites** | Server-backed favorite tiles and favorite links |

Data for guest bookmarks/favorites is stored **in this browser only** (scoped per app instance path). Export regularly if the data matters.

Full in-app copy: **Help → Guides → Your Bookmarks & Favorite Links**.

---

## Favorite Links

Star links from spaces so they appear in a dedicated **Favorite Links** strip (above or below the tile grid).

### Everyday actions
- **Open** — click the card
- **Unfavorite** — star on hover
- **Drag reorder** — grip handle when sort is Manual/default
- **Left / right arrows** — card view only (hidden in compact)
- **Notes** — if the link has notes
- **Health** — corner color + latency when checks run
- **Copy to Your Bookmarks** (guest) — bookmark icon next to Export/Import on the Favorites tab. Copies **Favorite Links** into a **named folder** (default **Favorites**) and each favorite space as a **subfolder inside that folder**, with that space’s http(s) links. Open the named folder in Your Bookmarks to see the links and space tiles. Then **OutSync** to push **Other Bookmarks → LinkNest → folder → space subfolders**.

### Compact view
Use **View: Compact / Cards** on the Favorite Links toolbar.

| View | Shows | Controls |
|------|--------|----------|
| **Cards** | Title, URL, parent space, health, latency | Star, arrows, drag |
| **Compact** | **Title only** (sleek rows) | Star, drag, notes — **no** left/right arrows |

Preference is remembered in the browser.

### Sort & position
- **Sort** — manual, A→Z, Z→A
- **Position** — show Favorite Links above or below spaces

---

## Your Bookmarks (guest)

Import a Chrome/Edge bookmark HTML export. Links are grouped into **spaces by website domain** (e.g. `Youtube.com`).

### Getting started
1. Chrome → Bookmarks → Bookmark manager → ⋮ → **Export bookmarks**
2. In Favorites → **Your Bookmarks** → **Import Chrome HTML**, **Merge Import**, **Sync** (browser → app), or **OutSync** (app → browser; Bookmark Sync 1.8+, Read-write On)
3. Or from Favorites: **Copy favorites to Your Bookmarks** to snapshot starred links into a named folder and favorite spaces as subfolders inside it, then OutSync when ready
4. Open a domain space to work with its links

### Sync from browser (extension)
Install **LinkNest Bookmark Sync** (`extensions/bookmark-sync` — load unpacked in Chrome/Edge) **or** **Browser Launcher Pro** with the Chrome `bookmarks` permission. **Sync** and **OutSync** appear only when an extension answers on this origin. Each button is greyed out when its popup toggle is Off (Read-only for Sync, Read-write for OutSync). Hover a greyed button for the hint. Click **Sync** (when enabled) to merge browser bookmarks into Your Bookmarks without an HTML file. New URLs are added; existing ones are skipped.

Bookmark Sync is a minified Pro-compatible extension: it answers `BROWSER_LAUNCHER_GET_BOOKMARKS` / `BROWSER_LAUNCHER_CHECK` from **allowlisted** LinkNest origins, and only when **Read-only** is On in the popup (it starts **Off**). **Browser Launcher Pro 3.1+** has the same Sync / OutSync protocol on its **Bookmark Sync** tab (Read-only starts **On** for existing Pro users; Read-write starts **Off**; an empty origin list allows all sites). Both extensions read **this browser profile only** — not another user’s PC or Chrome profile — and do not upload bookmarks. The **display name does not connect Sync**.

After v1.8, turn **Read-only** on for Sync and **Read-write** on for OutSync (both start Off). After v1.6, add your app origin to `org-branding.json` `allowedOrigins`. The shipped file allows local XAMPP/Vite (`http://localhost`, `http://localhost:3000`) **and Docker** (`http://localhost:8090`, `https://localhost:8443`). Origins are exact: `http://localhost` does **not** match `https://localhost:8443`. Reload the extension after editing the JSON.

Full extension guide (including mass deploy): **Help → Guides → Bookmark Sync Extension** (also the extension popup **Help** tab).

If Sync fails (extension missing, Read-only off, no `bookmarks` permission, or `getTree` errors), use **Import Chrome HTML** / **Merge Import** instead.

### OutSync to browser (extension)
Click **OutSync** on Your Bookmarks (when the button is enabled and you have links saved) to **preview** what would change in **this Chrome/Edge profile**, then **Apply**. The button is hidden until an extension that supports OutSync answers on this origin, and greyed until **Read-write** is On. Requires Bookmark Sync **1.8.3+** (nested named folders) or **1.8.2+** (flat spaces) or **Browser Launcher Pro 3.1+** (turn Read-write On in the Bookmark Sync tab).

- A URL is **skipped** only if it already exists under **Other Bookmarks → LinkNest → that folder**. Titles there are **updated in place** if they differ
- New URLs (including ones that already exist in another Chrome folder) are added under **Other Bookmarks → LinkNest → named folder → space subfolder** (copied Favorites) or **LinkNest → space name** (domain spaces)
- Nothing is deleted or moved out of existing Chrome folders
- **Download JSON** saves the preview changelog (adds, title updates, and unchanged URLs)
- **Backup this browser’s bookmarks before applying** is **on by default**. Apply downloads this Chrome/Edge profile’s tree to **this PC’s Downloads folder** as **HTML** (Chrome Bookmark manager Import) plus **JSON** (`linknest-browser-bookmarks-backup-….html` / `.json`). The backup is not stored in LinkNest. If the backup fails, Apply is blocked until you retry or uncheck backup. **Download backup now** saves the same files without applying.

**Restore:** Chrome → Bookmarks → Bookmark manager → **Import bookmarks** (the HTML). Import **merges**; it does not delete newer bookmarks. OutSync adds live under **Other Bookmarks → LinkNest** — delete that folder to drop new links. Title updates can be restored from the changelog JSON (`previousTitle`).

If OutSync times out, reload Bookmark Sync 1.8.3+, refresh the app, and turn **Read-write** **On**. Backup also works with **Read-only** On.

### Space toolbar (common)
| Action | Purpose |
|--------|---------|
| **Open all** | Opens up to 10 links (browser may block more popups) |
| **Rewrite tools** | Branding / migration / cleanup suite (see below) |
| **Check links** | Server health probe; stores status + final redirect URL |
| **Update redirects** | Appears when checks found redirects — adopt final URLs |
| **Remove broken** | Deletes links marked broken/timeout after a check |
| **Export Space JSON** | LinkNest space JSON for Admin → Import Spaces |
| **Export HTML** | Chrome-compatible HTML for this space |
| **Pin / Color / emoji** | Space styling |
| **Delete** | Remove the whole space |

### Links inside a space
- **Search** — filter titles/URLs in the open space
- **Sort** — Manual, Recently opened, A–Z / Z–A, Broken first
- **Compact / Cards** — dense title rows vs large cards (preference saved)
- **Quick add URL** — paste a URL into the current space
- **Pin** links, move between spaces, reorder (manual sort)

### Home (all spaces) extras
- **OutSync** — preview adds/title updates, optional browser bookmark backup (HTML + JSON), download JSON changelog, then Apply to this browser
- **Export Spaces JSON** / **Export HTML** — full library
- **Rewrite tools** — same suite across all spaces
- **Cleanup** — remove duplicate URLs and never-opened links
- **Regenerate by domain** — rebuild spaces from hosts (resets custom order/names)

---

## Rewrite tools (education)

Open **Rewrite tools** from a space or from the bookmarks home. Always **Preview** before **Apply**. Use **Undo** to restore the last apply snapshot.

Shared options on every tool:
- **Skip pinned links** — leave pinned bookmarks alone
- **All bookmark spaces** — or only the open space
- **Limit to links** — optional checklist when a space is open

Each tab shows a help card with an example and tip. Summary:

### 1. Domain
**What:** Change the host after a rebrand. Paths stay; `www.` / `portal.` subdomains are preserved.

**Example:**  
`https://portal.ahss.org/apps/hr` → `https://portal.adventhealth.com/apps/hr`

**Tip:** Then use **Regroup** so spaces match the new domains.

### 2. Path
**What:** Replace a path prefix only; host unchanged.

**Example:**  
`…/oldportal/forms` → `…/new/forms`

**Tip:** App folder moves, SharePoint path changes, etc.

### 3. Cleanup
**What:** Strip tracking query params (`utm_*`, `fbclid`, `gclid`, …) and/or force HTTPS.

**Example:**  
`https://site.com/a?utm_source=email&fbclid=1&ok=1` → `https://site.com/a?ok=1`

**Tip:** Great first pass after a Chrome HTML import.

### 4. Find & replace
**What:** Replace text in titles, URLs, and/or space names. Optional **regex**.

**Example:**  
`AHSS` → `AdventHealth`  
Regex: `/index\.php$` → (empty)

**Tip:** Brand renames without touching domains; regex for endings like `.aspx`.

### 5. Normalize
**What:** Standardize shape — www on/off, trailing slash, strip `:80`/`:443`, force HTTPS.

**Example:**  
`http://www.Example.com:80/path/` → `https://example.com/path` (per options)

**Tip:** Collapse near-duplicate bookmarks that differ only by www or slash.

### 6. Encoding
**What:** Lowercase host, decode `%20`-style paths, collapse `//` in paths.

**Example:**  
`https://WWW.Example.COM/docs%20room//a` → cleaner host + path

### 7. Redirects
**What:** After **Check links**, update bookmarks to the **final URL** when the server redirected.

**Example:**  
Saved `ahss.org/hr` → final `adventhealth.com/hr`

**Tip:** Run Check links first. Space toolbar may show **Update redirects (N)**.

### 8. Regroup
**What:** Move links into the space that matches their current domain (creates spaces if needed).

**Example:** YouTube URLs sitting in “Misc” → space **Youtube.com**

**Tip:** Run after Domain rewrite.

### 9. Suggest
**What:** Propose common fixes for broken/http links (https upgrade, www flip).

**Example:**  
`http://intranet.local/app` → `https://intranet.local/app`

**Tip:** Preview carefully — suggestions are heuristics.

### 10. Pipeline
**What:** Stack several steps and Preview/Apply once.

**Example stack:**  
1) Domain `ahss.org` → `adventhealth.com`  
2) Cleanup tracking  
3) Regroup  

**Tip:** Use **+Domain / +Path / …** to add the current form as a step.

### 11. Recipes
**What:** Save a named pipeline (e.g. “AHSS → AdventHealth”) and re-run later.

**Tip:** Build in Pipeline → save here → **Run** loads Preview → **Apply** when ready.

### Undo & CSV
- **Undo** — one-shot restore of the dataset before the last Apply
- **Export CSV** — download the Preview before/after list to share or review offline

---

## Suggested workflows

### Branding domain change
1. **Backup** — Export Spaces JSON or HTML  
2. **Domain** — old → new → Preview → Apply  
3. **Regroup** — move links into matching spaces  
4. Optional **Normalize** / **Cleanup**  
5. **Check links** → **Update redirects** if needed  

### Clean an imported Chrome dump
1. **Cleanup** (tracking + HTTPS)  
2. **Encoding**  
3. **Normalize** (www / slash policy)  
4. **Cleanup** (duplicates / never-opened) on the home toolbar  

### Repeatable office migration
1. Build a **Pipeline**  
2. Save as a **Recipe**  
3. On the next import: Run recipe → Preview → Apply → Undo if wrong  

---

## Privacy & limits

- Guest bookmarks/favorites live in **localStorage** for this browser and instance path  
- Clearing site data removes them — export first  
- **Open all** caps at 10 tabs (popup blockers)  
- Health checks use the server API with rate limits; guests are allowed for bookmark probes  

---

## Related Help

- **Help** tab → section **Favorites, Your Bookmarks & Rewrite tools**
- **Guides** tab → this document under **Features**
- Link health behavior also appears under Key Features → Link Health Monitoring
