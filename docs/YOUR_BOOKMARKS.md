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
2. In Favorites → **Your Bookmarks** → **Import Chrome HTML** (or **Merge Import** to add without wiping)
3. Open a domain space to work with its links

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
