# LinkNest Bookmark Sync

A **minimal** Chrome / Edge extension that only does what LinkNest **Sync** needs: read **this browser profile’s** bookmarks and hand them to your organisation’s LinkNest page.

It is a stripped-down stand-in for **Browser Launcher Pro**. It does **not** launch other browsers, talk to a native host, or require a license.

Version **1.6.0** is built for enterprise rollout: origin allowlist, Bookmark sync **Off** by default, same-origin `postMessage`, and per-profile bookmark isolation.

## What it does

| Feature | This extension | Browser Launcher Pro |
|---------|----------------|----------------------|
| `BROWSER_LAUNCHER_GET_BOOKMARKS` (Your Bookmarks / Fav Organizer **Sync**) | Yes, if the site is allowlisted and Bookmark sync is On | Yes (if `bookmarks` permission is granted) |
| Open links in another installed browser | No | Yes |
| Native messaging / WSL / license | No | Yes |
| Read another user’s PC or Chrome profile | No | No |

Protocol (same types as Pro, locked down):

1. LinkNest posts `{ type: 'BROWSER_LAUNCHER_GET_BOOKMARKS', timestamp }` to **its own origin**
2. The content script ignores other sites; on an allowlisted origin it asks the service worker for `chrome.bookmarks.getTree()` (**this profile only**)
3. The page receives `{ type: 'BROWSER_LAUNCHER_BOOKMARKS_LIST', success, bookmarks, timestamp }` via `postMessage(..., pageOrigin)` — not `*`

Only `http://` and `https://` bookmarks are returned. Folders are flattened.

## Per-user isolation

Each Windows user + Chrome/Edge **profile** has its own bookmark database. This extension can only read the profile it is running in. It does not upload bookmarks and cannot sync from someone else’s browser.

IT must force-install **per user** and forbid shared Chrome profiles if employees must not see each other’s bookmarks.

## Install (unpacked, testing only)

1. Open `chrome://extensions` or `edge://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Choose this folder: `extensions/bookmark-sync`
5. Edit `org-branding.json` `allowedOrigins` if your app is not `http://localhost`
6. Turn **Bookmark sync** **On** in the popup
7. Reload LinkNest, then Favorites → **Your Bookmarks** → **Sync**

Chrome and Edge will prompt for the **bookmarks** permission. Allow it or Sync cannot read the tree.

**Production:** pack a signed CRX / Edge add-on and force-install. Do not leave Developer mode enabled on organisation PCs.

If you already run Browser Launcher Pro with bookmarks access, you do **not** need this extension (Pro does not use this allowlist).

After loading (or reloading) the unpacked folder, open the toolbar popup:

- **Sync** — turn **Bookmark sync** on/off (starts **Off**; OFF badge when disabled). Stats show how many times the app pulled bookmarks.
- **Branding** — display name, app name, optional app link, logo.
- **Help** — security, per-user isolation, handshake, mass deploy.

The **display name does not connect Sync**. Full guide: Help → Guides → Bookmark Sync Extension.

## Mass deployment (organisation)

IT stamps branding **and** the security allowlist into `org-branding.json`, then force-installs the same pack on every employee profile.

1. Edit `org-branding.json` (see `org-branding.example.json`):

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

2. Put your logo at `branding/logo.png` (PNG, JPG, or WebP).
3. **Before force-install:** `allowedOrigins` must be **only** your LinkNest origin(s). Remove `http://localhost` / `http://127.0.0.1` from production packs. Paths are ignored (`https://host/linknest` → origin `https://host`).
4. Pack a signed CRX (stable ID). Deploy with Intune or GPO `ExtensionInstallForcelist`, assigned **per user**. Disable developer mode.
5. Each employee uses their own Windows account and Chrome/Edge profile so they can only sync **their** bookmarks.

Optional: Chrome managed policy (`managed_schema.json`) can set `allowedOrigins` and `syncDefaultOn` without rebuilding. Baking values into `org-branding.json` is enough for most rollouts.

| Field | Meaning |
|-------|---------|
| `enabled` | Must be `true` for org name/logo/appUrl. Origin allowlist is still applied when this is `false`. |
| `name` | Popup title and toolbar tooltip. |
| `appName` | Product name in the Sync instructions (“Open **Contoso** in this browser”). |
| `appUrl` | Optional `http://` or `https://` URL. Turns that name into a clickable link. When branding is enabled, this origin is also allowlisted. |
| `logo` | Path inside the extension folder, or a `data:image/...` URL. |
| `locked` | `true` = apply on every launch and disable the Branding tab. |
| `allowedOrigins` | Exact origins allowed to request bookmarks. Empty (and no branded appUrl) = no site can sync. |
| `syncDefaultOn` | `true` = new profiles start with Bookmark sync On. Default `false` (opt-in). |

Reload the extension after editing the JSON.

## Permissions

- **bookmarks** — read **this profile’s** bookmark tree. Nothing is uploaded; guest bookmarks stay in this browser.
- **storage** — branding, sync on/off, stats, optional managed policy.

## Files

```
bookmark-sync/
  manifest.json            MV3 manifest
  managed_schema.json      Optional enterprise managed policy
  background.js            Service worker — getTree + flatten + origin gate
  content.js               postMessage bridge (allowlist + same-origin)
  popup.html/.js           Sync (toggle + stats), Branding, Help
  branding.js              Name / logo / app URL / sync / origin policy
  org-branding.json        Organisation defaults + allowlist
  org-branding.example.json
  branding/                Drop org logo.png here
  icons/                   Default toolbar icons
```
