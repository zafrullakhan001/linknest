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

After loading (or reloading) the unpacked folder, open the toolbar popup → **Branding** to set any display name and logo. That updates the popup and toolbar icon. The name on `chrome://extensions` stays the packaged name (`LinkNest Bookmark Sync`).

## Permissions

- **bookmarks** — read the browser bookmark tree so LinkNest can merge it. Nothing is uploaded; the page stores guest bookmarks in this browser only.
- **storage** — save the custom name and logo on this browser.

## Files

```
bookmark-sync/
  manifest.json    MV3 manifest
  background.js    Service worker — getTree + flatten
  content.js       postMessage bridge
  popup.html/.js   Sync tab + Branding tab
  branding.js      Custom name / logo (toolbar + popup)
  icons/           Default toolbar icons
```
