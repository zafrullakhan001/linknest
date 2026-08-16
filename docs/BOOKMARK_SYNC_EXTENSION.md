# Bookmark Sync Extension

This guide explains how **LinkNest Bookmark Sync** (v1.8) connects to **Sync** and **OutSync** in Your Bookmarks (and Fetch in Favorites Organizer), how IT mass-deploys it, and how each person can only sync **their own** browser bookmarks.

The extension lives in `extensions/bookmark-sync`. Load it unpacked for testing, or **force-install a packed CRX** in production. It is a small stand-in for **Browser Launcher Pro**: bookmarks only — no other-browser launching, native host, or license. **Browser Launcher Pro 3.1+** implements the same Sync / OutSync / backup protocol on its **Bookmark Sync** tab, so you do not need this extension if Pro is installed.

Full in-app copy: **Help → Guides → Bookmark Sync Extension**. The extension popup also has a **Help** tab.

---

## Security (v1.8)

| Control | What it does |
|---------|----------------|
| **Origin allowlist** | Only sites listed in `org-branding.json` → `allowedOrigins` (plus the App link origin when branding is enabled) receive bookmark lists, CHECK replies, or OutSync writes. Other websites get **no reply**. |
| **Opt-in sync** | **Read-only** (Sync) and **Read-write** (OutSync) start **Off**. The user (or `syncDefaultOn` in org JSON / managed policy) must turn each on. Toolbar shows **OFF** until at least one is on. |
| **Same-origin replies** | The extension and the app use `postMessage` with this page’s origin, not `*`. The app ignores messages from other origins. |
| **This profile only** | `chrome.bookmarks.getTree()` / `create` / `update` touch **this Chrome/Edge profile on this PC**. The extension cannot read another user’s PC, Windows account, or browser profile. It does not upload bookmarks. OutSync never deletes Chrome bookmarks. |

Guest Your Bookmarks stay in **this browser**. Signed-in Favorites Organizer import still only receives the tree from **the profile that clicked Sync**.

---

## This user’s bookmarks only (not someone else’s browser)

Sync is **not** a cloud share between employees.

| Situation | What Sync / OutSync can touch |
|-----------|-------------------|
| You, on your PC, your Chrome/Edge profile | **Your** bookmarks only |
| A colleague on their own PC | **Theirs** only — you cannot pull or push their tree |
| Another Windows login on the same PC | Separate Chrome profiles → **that login’s** bookmarks, not yours |
| Shared / unlocked Chrome profile | Whoever is sitting there can sync **that shared profile’s** bookmarks into (or out of) the LinkNest page they have open |

**IT requirement:** force-install the extension **per user** (Intune user assignment or GPO per user). Require unique Windows accounts. Do not deploy a shared kiosk Chrome profile for people who should not see each other’s bookmarks.

---

## Does the name have to match?

**No.** Sync does **not** look up “LinkNest”, “ERP Landing”, “AdventHealth”, or any other label.

| What you can change | Does it connect Sync? |
|---------------------|------------------------|
| Display name / logo (popup + toolbar) | No — appearance only |
| App name (“Open **ERP Landing** in this browser”) | No — instruction text only |
| App link (clickable URL on that name) | No — convenience; its **origin** is also allowlisted when branding is enabled |
| Name on `chrome://extensions` | No — packaged name; cannot change at runtime |
| **Allowlisted origin + bookmarks permission + Sync toggle On** | **Yes — this is the link** |

---

## How the Sync button is linked

1. You click **Sync** on Favorites → **Your Bookmarks** (guest) or **Fetch Bookmarks from Extension** in Favorites Organizer.
2. The app posts a `window` message to **its own origin**:

```text
{ type: "BROWSER_LAUNCHER_GET_BOOKMARKS", timestamp: <number> }
```

3. The content script ignores the message unless `event.source === window`, `event.origin` matches the page, and that origin is on the allowlist.
4. If **Read-only** is **On**, the background script reads `chrome.bookmarks.getTree()` for **this profile**, flattens http(s) URLs, and replies to the same origin:

```text
{ type: "BROWSER_LAUNCHER_BOOKMARKS_LIST", success: true, bookmarks: [...], timestamp }
```

5. LinkNest **merges** those URLs into Your Bookmarks (new URLs added; existing ones skipped). Guest data stays in **this browser only**.

If the extension is missing, sync is **Off**, the origin is not allowlisted, or the `bookmarks` permission is denied, Sync fails. Use **Import HTML** / **Merge** instead.

---

## How the OutSync button is linked

1. You click **OutSync** on Favorites → **Your Bookmarks** (guest). The app **previews** first (no writes).
2. The app posts a `window` message to **its own origin**:

```text
{ type: "BROWSER_LAUNCHER_PREVIEW_PUSH_BOOKMARKS", timestamp: <number>, rootFolder: "LinkNest", bookmarks: [{ title, url, folder }] }
```

3. The content script ignores the message unless `event.source === window`, `event.origin` matches the page, and that origin is on the allowlist. **Browser Launcher Pro 3.1+** implements the same preview / apply / backup messages on its Bookmark Sync tab. Older Bookmark Sync 1.8.0 packs time out on preview instead of writing.
4. If **Read-write** is **On**, the background script indexes this profile’s tree by normalized URL (dry-run), then:

| Browser has this URL? | Action |
|----------------------|--------|
| No | **Add** under Other Bookmarks → `LinkNest` → space title |
| Yes, same title | **Skip** (no duplicate) |
| Yes, different title | **Update title in place** (do not move the bookmark) |

5. The page shows the preview only when there are adds or title updates, and can **Download JSON** changelog. **Backup this browser’s bookmarks before applying** (default **on**, Bookmark Sync **1.8.2+**) posts `BROWSER_LAUNCHER_BACKUP_BOOKMARKS` (Read-only **or** Read-write). The extension replies with Netscape **HTML** plus a JSON tree, which the app saves to **this PC’s Downloads folder** (`linknest-browser-bookmarks-backup-….html` / `.json`) — not inside LinkNest. If backup fails, Apply does not write. **Apply** then posts `BROWSER_LAUNCHER_PUSH_BOOKMARKS` (same payload, writes). The result is `{ type: "BROWSER_LAUNCHER_PUSH_BOOKMARKS_RESULT", success, added, skipped, updated, changes, timestamp }`.

Chrome Bookmark manager **Import** of the HTML **merges**; it does not delete newer bookmarks. Delete **Other Bookmarks → LinkNest** to drop OutSync adds. Title restores use the changelog `previousTitle`.

OutSync never deletes Chrome bookmarks and never moves existing ones into the LinkNest folder. Reload the unpacked extension (and the LinkNest tab) after upgrading from 1.6.

---

## What you need to make it work

1. **Install** `extensions/bookmark-sync` in the **same browser profile** you use for the app (unpacked for test, force-install for production).
2. Allow the **bookmarks** permission when Chrome/Edge asks.
3. Turn **Read-only** on for Sync and **Read-write** on for OutSync in the extension popup (Sync tab). An **OFF** badge means both are disabled.
4. Open the app at an **allowlisted** `http://` or `https://` origin (see `allowedOrigins`). `file://` pages do not work. Docker uses `https://localhost:8443` or `http://localhost:8090` — both are in the shipped allowlist.
5. Reload the app after installing or reloading the extension.
6. Favorites → Your Bookmarks → **Sync** (browser → app) or **OutSync** (app → browser).

You do **not** need Browser Launcher Pro if this extension is installed. You do **not** need the branded name to match the site title. OutSync works with this extension **or** Browser Launcher Pro **3.1+** (Read-write On).

After upgrading from v1.7, **reload** the extension so the separate Read-only / Read-write toggles appear (a previous single On still enables both until you change them). After upgrading from v1.6, reload so OutSync is available. After upgrading from v1.5, turn the toggles On (they now default Off) and confirm your LinkNest URL is in `allowedOrigins`.

---

## Enable / disable sync in the extension

On the popup **Sync** tab, use the **Read-only** and **Read-write** switches. Stats for each direction are shown separately.

| Switch | Effect |
|--------|--------|
| **Read-only Off** (default) | The extension refuses `GET_BOOKMARKS` (app **Sync**) |
| **Read-only On** | The app Sync button can read **this profile’s** bookmarks, only on allowlisted sites |
| **Read-write Off** (default) | The extension refuses `PUSH_BOOKMARKS` (app **OutSync**) |
| **Read-write On** | The app OutSync button can add new bookmarks and update titles, only on allowlisted sites |
| **Both Off** | Toolbar badge: **OFF** |

Turning a switch off does **not** uninstall the extension. **Refresh count** in the popup still shows how many http(s) bookmarks exist; it does not count as a Sync.

IT can set `"syncDefaultOn": true` in `org-branding.json` (or Chrome managed policy) if every profile should start with **both** toggles On. Prefer Off for shared PCs.

---

## Mass deployment (organisation)

1. Copy `extensions/bookmark-sync` and edit `org-branding.json` (see `org-branding.example.json`):

```json
{
  "enabled": true,
  "name": "Contoso Bookmark Sync",
  "appName": "Contoso",
  "appUrl": "https://intranet.contoso.com/linknest",
  "logo": "branding/logo.png",
  "locked": true,
  "allowedOrigins": ["https://intranet.contoso.com"],
  "syncDefaultOn": false
}
```

2. Put the logo at `branding/logo.png`.
3. **Production allowlist:** list **only** your LinkNest origin(s) (`https://host` or `https://host:port`). Remove `http://localhost` and `http://127.0.0.1` from the pack you force-install.
4. Pack a **signed CRX** (Chrome) or Edge add-on with a **stable extension ID**. Force-install:
   - **Microsoft Intune** — Microsoft Edge → Extension settings, or Chrome ADMX `ExtensionInstallForcelist`
   - **Group Policy** — `ExtensionInstallForcelist` + disable developer mode (`ExtensionDeveloperModeWarning` / CIS: do not allow unpacked extensions in production)
5. Assign the policy **to users** (not a single shared machine profile) so each employee’s Chrome/Edge profile only has **their** bookmarks.
6. Optional: Chrome **managed storage** (`managed_schema.json`) can add `allowedOrigins` / `syncDefaultOn` via `3rdparty/extensions/<id>/policy` without rebuilding the CRX. Baking origins into `org-branding.json` is simpler when the ID is not yet stable.

| Field | Meaning |
|-------|---------|
| `enabled` | `true` to apply org name/logo/appUrl. Origin policy is still read when this is `false`. |
| `name` / `logo` | Toolbar and popup. |
| `appName` / `appUrl` | Instruction label and optional clickable link. When branding is enabled, `appUrl`’s origin is also allowlisted. |
| `locked` | `true` = disable the Branding tab on every machine. |
| `allowedOrigins` | Exact origins that may request bookmarks. Paths are ignored. Empty (and no branded `appUrl`) = **no site** can sync (fail-closed). |
| `syncDefaultOn` | `true` = new profiles start with Read-only and Read-write On. Default `false`. |

Reload the extension after editing the JSON. Chrome’s **extensions** page still shows the packaged name; only the toolbar and popup use org branding.

---

## Branding and the optional app link

**Branding** tab (or `org-branding.json`):

- **Display name / logo** — toolbar icon and popup header.
- **App name** — words in “Open … in this browser”.
- **App link** — `http://` or `https://` URL. Makes that name a **clickable link**.

---

## Troubleshooting

| Symptom | What to try |
|---------|-------------|
| Sync times out / “install extension” | Load/reload the extension, **refresh the app**, turn **Read-only** **On**, confirm this origin is in `allowedOrigins` (scheme + host + port). Docker: `https://localhost:8443` and `http://localhost:8090` — `http://localhost` alone is not enough |
| OutSync times out / “reload Bookmark Sync 1.8+” | You still have an older pack. Reload the unpacked folder (or install 1.8.2+), turn **Read-write** On, then **refresh the app** |
| Backup times out / empty | Reload Bookmark Sync **1.8.2+**, refresh the app, turn **Read-only or Read-write** On. Uncheck backup on the preview to Apply without a backup |
| “Read-only Sync is turned off…” | Popup → Sync tab → turn **Read-only** on |
| “Read-write OutSync is turned off…” | Popup → Sync tab → turn **Read-write** on |
| “not on the organisation allowlist” | IT must add this origin to `allowedOrigins` and reload the extension |
| Bookmarks permission / getTree error | Reload the extension and grant **bookmarks** |
| Colleague’s bookmarks appeared | You used **their** Chrome/Edge profile (shared PC). Sign into your Windows account and your own browser profile |
| Extension context invalidated | Refresh the LinkNest tab after every extension reload |
| Still stuck | Favorites → Your Bookmarks → **Import HTML**, **Merge**, or **Export HTML** |

---

## Permissions (extension)

- **bookmarks** — read and write **this profile’s** bookmark tree so Sync can merge in and OutSync can add/update. Nothing is uploaded to a server for guest Your Bookmarks. OutSync never deletes bookmarks.
- **storage** — branding, sync on/off, timing stats, and optional enterprise managed policy.

---

## Related

- Help → Guides → **Your Bookmarks & Favorite Links** (import, rewrite tools, compact view)
- Extension popup → **Help** tab
- `extensions/bookmark-sync/README.md` (install and org JSON)
