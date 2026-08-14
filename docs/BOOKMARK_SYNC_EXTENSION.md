# Bookmark Sync Extension

This guide explains how **LinkNest Bookmark Sync** connects to the **Sync** button in Your Bookmarks (and Fetch in Favorites Organizer), what you must install, and what does **not** matter (including the display name).

The extension lives in `extensions/bookmark-sync`. Load it unpacked in Chrome or Edge. It is a small stand-in for **Browser Launcher Pro**: bookmarks only — no other-browser launching, native host, or license.

Full in-app copy: **Help → Guides → Bookmark Sync Extension**. The extension popup also has a **Help** tab with a short version of this.

---

## Does the name have to match?

**No.** Sync does **not** look up “LinkNest”, “ERP Landing”, “AdventHealth”, or any other label.

| What you can change | Does it connect Sync? |
|---------------------|------------------------|
| Display name / logo (popup + toolbar) | No — appearance only |
| App name (“Open **ERP Landing** in this browser”) | No — instruction text only |
| App link (clickable URL on that name) | No — convenience only |
| Name on `chrome://extensions` | No — packaged name; cannot change at runtime |
| **Bookmarks permission + content script + Sync toggle On** | **Yes — this is the link** |

The page and the extension talk with a fixed **message type**, not a product name.

---

## How the Sync button is linked

1. You click **Sync** on Favorites → **Your Bookmarks** (guest) or **Fetch Bookmarks from Extension** in Favorites Organizer.
2. The app posts a `window` message:

```text
{ type: "BROWSER_LAUNCHER_GET_BOOKMARKS", timestamp: <number> }
```

3. This extension injects a **content script** on `http://` and `https://` pages. That script hears the message (same protocol as Browser Launcher Pro).
4. If **Bookmark sync** is **On** in the extension popup, the background script reads `chrome.bookmarks.getTree()`, flattens http(s) URLs, and replies:

```text
{ type: "BROWSER_LAUNCHER_BOOKMARKS_LIST", success: true, bookmarks: [...], timestamp }
```

5. LinkNest **merges** those URLs into Your Bookmarks (new URLs added; existing ones skipped). Guest data stays in **this browser only**.

If the extension is missing, sync is **Off**, or the `bookmarks` permission is denied, Sync fails. Use **Import HTML** / **Merge** instead.

---

## What you need to make it work

1. **Install** `extensions/bookmark-sync` (Developer mode → Load unpacked) in the **same browser** you use for the app.
2. Allow the **bookmarks** permission when Chrome/Edge asks.
3. Leave **Bookmark sync** **On** in the extension popup (Sync tab). An **OFF** badge on the toolbar means the page cannot read bookmarks.
4. Open the app at an **http://** or **https://** address (localhost or intranet). `file://` pages do not get the content script.
5. Reload the app after installing or reloading the extension.
6. Favorites → Your Bookmarks → **Sync**.

You do **not** need Browser Launcher Pro if this extension is installed. You do **not** need the branded name to match the site title.

---

## Enable / disable sync in the extension

On the popup **Sync** tab, use the **Bookmark sync** switch.

| Switch | Effect |
|--------|--------|
| **On** (default) | The app Sync button can read this browser’s bookmarks |
| **Off** | The extension refuses `GET_BOOKMARKS`. The app shows an error. Toolbar badge: **OFF** |

Turning sync off does **not** uninstall the extension. **Refresh count** in the popup still shows how many http(s) bookmarks exist; it does not count as a Sync.

Use this when you do not want the app to pull bookmarks (shared PC, kiosk, or you prefer HTML import only).

---

## Branding and the optional app link

**Branding** tab (or `org-branding.json` for mass deploy):

- **Display name / logo** — toolbar icon and popup header.
- **App name** — words in “Open … in this browser”.
- **App link** — `http://` or `https://` URL. Makes that name a **clickable link** so people do not guess the site (for example `https://intranet.example.com/linknest`).

IT can ship `org-branding.json` with `"enabled": true`, `"name"`, `"appName"`, `"appUrl"`, `"logo"`, and `"locked": true`. See `extensions/bookmark-sync/README.md`.

---

## Troubleshooting

| Symptom | What to try |
|---------|-------------|
| Sync times out / “install extension” | Load unpacked `extensions/bookmark-sync`, reload it, refresh the app |
| “Sync is turned off…” | Popup → Sync tab → turn **Bookmark sync** on |
| Bookmarks permission / getTree error | Reload the extension and grant **bookmarks** |
| Extension detected but no bookmarks | Confirm http(s) bookmarks exist; folders are flattened |
| Extension context invalidated / Sync after reloading the add-on | Refresh the LinkNest tab. Reloading the extension kills the old content script; the page must be reloaded too. |
| Still stuck | Favorites → Your Bookmarks → **Import HTML** or **Merge** |

---

## Permissions (extension)

- **bookmarks** — read the bookmark tree so Sync can merge it. Nothing is uploaded to a server for guest Your Bookmarks.
- **storage** — branding, sync on/off, and sync timing stats on this browser.

---

## Related

- Help → Guides → **Your Bookmarks & Favorite Links** (import, rewrite tools, compact view)
- Extension popup → **Help** tab (short version of this page)
- `extensions/bookmark-sync/README.md` (install and org JSON)
