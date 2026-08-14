# LinkNest Bookmark Sync

A **minimal** Chrome / Edge extension that only does what LinkNest **Sync** needs: read this browser’s bookmarks and hand them to the page.

It is a stripped-down stand-in for **Browser Launcher Pro**. It does **not** launch other browsers, talk to a native host, or require a license.

## What it does

| Feature | This extension | Browser Launcher Pro |
|---------|----------------|----------------------|
| `BROWSER_LAUNCHER_GET_BOOKMARKS` (Your Bookmarks / Fav Organizer **Sync**) | Yes | Yes (if `bookmarks` permission is granted) |
| Open links in another installed browser | No | Yes |
| Native messaging / WSL / license | No | Yes |

Protocol (same as Pro):

1. LinkNest posts `{ type: 'BROWSER_LAUNCHER_GET_BOOKMARKS', timestamp }`
2. The content script asks the service worker for `chrome.bookmarks.getTree()`
3. The page receives `{ type: 'BROWSER_LAUNCHER_BOOKMARKS_LIST', success, bookmarks, timestamp }`

Only `http://` and `https://` bookmarks are returned. Folders are flattened.

## Install (unpacked)

1. Open `chrome://extensions` or `edge://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Choose this folder: `extensions/bookmark-sync`
5. Reload LinkNest, then Favorites → **Your Bookmarks** → **Sync**

Chrome and Edge will prompt for the **bookmarks** permission. Allow it or Sync cannot read the tree.

If you already run Browser Launcher Pro with bookmarks access, you do **not** need this extension.

After loading (or reloading) the unpacked folder, open the toolbar popup:

- **Sync** — turn **Bookmark sync** on/off (OFF badge when disabled). Stats show how many times the app pulled bookmarks.
- **Branding** — display name, app name, optional app link, logo.
- **Help** — how Sync is wired (message protocol, not the product name).

The **display name does not connect Sync**. Full guide: Help → Guides → Bookmark Sync Extension.

## Mass deployment (organisation branding)

IT can stamp a name and logo into a static JSON file, then copy the folder to every PC. Users do not need to open the Branding tab.

1. Edit `org-branding.json` (see `org-branding.example.json` for a filled-in copy):

```json
{
  "enabled": true,
  "name": "Contoso Bookmark Sync",
  "appName": "Contoso",
  "appUrl": "https://intranet.contoso.com/linknest",
  "logo": "branding/logo.png",
  "locked": true
}
```

2. Put your logo at `branding/logo.png` (PNG, JPG, or WebP). You can also set `"logo"` to a `data:image/png;base64,...` value if you prefer a single file.
3. Copy the whole `bookmark-sync` folder to each machine (GPO file copy, Intune win32, SCCM, shared drive, etc.).
4. Load unpacked once per profile, or force-install the packed `.crx` / Edge add-on.

| Field | Meaning |
|-------|---------|
| `enabled` | Must be `true` or the file is ignored (stock LinkNest look). |
| `name` | Popup title and toolbar tooltip. |
| `appName` | Product name in the Sync instructions (“Open **Contoso** in this browser”). |
| `appUrl` | Optional `http://` or `https://` URL. Turns that name into a clickable link. |
| `logo` | Path inside the extension folder, or a `data:image/...` URL. |
| `locked` | `true` = apply on every launch and disable the Branding tab. `false` = org values are the default; a user may still override on that browser. |

Reload the extension after editing the JSON. Chrome’s **extensions** page still shows the packaged name; only the toolbar and popup use org branding.

## Permissions

- **bookmarks** — read the browser bookmark tree so LinkNest can merge it. Nothing is uploaded; the page stores guest bookmarks in this browser only.
- **storage** — save a per-browser name/logo override when org branding is not locked.

## Files

```
bookmark-sync/
  manifest.json    MV3 manifest
  background.js    Service worker — getTree + flatten
  content.js       postMessage bridge
  popup.html/.js   Sync (toggle + stats), Branding, Help
  branding.js      Name / logo / app URL / sync on-off
  org-branding.json  Organisation defaults for mass deploy (`enabled: false` until edited)
  org-branding.example.json
  branding/        Drop org `logo.png` here
  icons/           Default toolbar icons
```
