# LinkNest Bookmark Sync

A **minimal** Chrome / Edge extension that does what LinkNest **Sync** and **OutSync** need: read **this browser profile’s** bookmarks into Your Bookmarks, and push app links back into Chrome (new URLs only; matching URLs skipped).

It is a stripped-down stand-in for **Browser Launcher Pro**. It does **not** launch other browsers, talk to a native host, or require a license.

Version **1.8.2** can export a Netscape HTML + JSON backup of this profile’s bookmarks before OutSync Apply. Version **1.8.0** splits **Read-only** (Sync) and **Read-write** (OutSync) into separate toggles and stats. OutSync (app → browser) remains from 1.7. Security from 1.6 remains: origin allowlist, both modes **Off** by default, same-origin `postMessage`, and per-profile bookmark isolation.

## What it does

| Feature | This extension | Browser Launcher Pro |
|---------|----------------|----------------------|
| `BROWSER_LAUNCHER_GET_BOOKMARKS` (Your Bookmarks / Fav Organizer **Sync**) | Yes, if the site is allowlisted and Read-only is On | Yes (if `bookmarks` permission is granted) |
| `BROWSER_LAUNCHER_PUSH_BOOKMARKS` (Your Bookmarks **OutSync**) | Yes (v1.8+, Read-write On) | No |
| `BROWSER_LAUNCHER_BACKUP_BOOKMARKS` (browser tree backup) | Yes (v1.8.2+, Read-only or Read-write On) | No |
| Open links in another installed browser | No | Yes |
| Native messaging / WSL / license | No | Yes |
| Read another user’s PC or Chrome profile | No | No |

Protocol (same types as Pro for inbound, plus LinkNest OutSync):

**Sync (browser → app)**

1. LinkNest posts `{ type: 'BROWSER_LAUNCHER_GET_BOOKMARKS', timestamp }` to **its own origin**
2. The content script ignores other sites; on an allowlisted origin with **Read-only** On it asks the service worker for `chrome.bookmarks.getTree()` (**this profile only**)
3. The page receives `{ type: 'BROWSER_LAUNCHER_BOOKMARKS_LIST', success, bookmarks, timestamp }` via `postMessage(..., pageOrigin)` — not `*`

Only `http://` and `https://` bookmarks are returned. Folders are flattened.

**OutSync (app → browser)**

1. LinkNest posts `{ type: 'BROWSER_LAUNCHER_PREVIEW_PUSH_BOOKMARKS', ... }` for a dry-run (no writes)
2. The page shows adds and title updates; **Download JSON** saves the changelog
3. Optional **backup** (default on) posts `{ type: 'BROWSER_LAUNCHER_BACKUP_BOOKMARKS', timestamp }` and downloads Netscape HTML + JSON. Apply is blocked if backup fails.
4. **Apply** posts `{ type: 'BROWSER_LAUNCHER_PUSH_BOOKMARKS', ... }`
5. Matching URLs are skipped (titles updated in place if they differ); new URLs go under Other Bookmarks → `LinkNest` → space folder
6. The page receives `{ type: 'BROWSER_LAUNCHER_PUSH_BOOKMARKS_RESULT', success, added, skipped, updated, changes, timestamp }`

OutSync never deletes Chrome bookmarks and never moves existing ones.

## Per-user isolation

Each Windows user + Chrome/Edge **profile** has its own bookmark database. This extension can only read and write the profile it is running in. It does not upload bookmarks and cannot sync from someone else’s browser.

IT must force-install **per user** and forbid shared Chrome profiles if employees must not see each other’s bookmarks.

## Install (unpacked, testing only)

1. Open `chrome://extensions` or `edge://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Choose this folder: `extensions/bookmark-sync`
5. Edit `org-branding.json` `allowedOrigins` if your app origin is missing. Docker needs `https://localhost:8443` and/or `http://localhost:8090` (scheme + port must match the address bar). Then **Reload** the extension.
6. Turn **Read-only** and/or **Read-write** **On** in the popup
7. Reload LinkNest, then Favorites → **Your Bookmarks** → **Sync** or **OutSync**

Chrome and Edge will prompt for the **bookmarks** permission. Allow it or Sync / OutSync cannot read or write the tree.

**Production:** pack a signed CRX / Edge add-on and force-install. Do not leave Developer mode enabled on organisation PCs.

If you already run Browser Launcher Pro with bookmarks access, you do **not** need this extension for inbound Sync (Pro does not use this allowlist). You **do** need this extension for OutSync.

After loading (or reloading) the unpacked folder, open the toolbar popup:

- **Sync** — turn **Read-only** (Sync) and **Read-write** (OutSync) on/off separately (both start **Off**; OFF badge when both are disabled). Stats are shown per direction.
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
| `allowedOrigins` | Exact origins allowed to request or push bookmarks. Empty (and no branded appUrl) = no site can sync. |
| `syncDefaultOn` | `true` = new profiles start with Read-only and Read-write On. Default `false` (opt-in). |

Reload the extension after editing the JSON.

## Permissions

- **bookmarks** — read and write **this profile’s** bookmark tree. Nothing is uploaded; guest bookmarks stay in this browser. OutSync never deletes bookmarks.
- **storage** — branding, sync on/off, stats, optional managed policy.

## Files

```
bookmark-sync/
  manifest.json            MV3 manifest
  managed_schema.json      Optional enterprise managed policy
  background.js            Service worker — getTree + flatten + OutSync create/update + origin gate
  content.js               postMessage bridge (allowlist + same-origin)
  popup.html/.js           Sync (toggle + stats), Branding, Help
  branding.js              Name / logo / app URL / sync / origin policy
  org-branding.json        Organisation defaults + allowlist
  org-branding.example.json
  branding/                Drop org logo.png here
  icons/                   Default toolbar icons
```
