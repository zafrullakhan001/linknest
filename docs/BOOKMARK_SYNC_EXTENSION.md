# Bookmark Sync Extension

This guide explains how **LinkNest Bookmark Sync** (v1.6) connects to **Sync** in Your Bookmarks (and Fetch in Favorites Organizer), how IT mass-deploys it, and how each person can only sync **their own** browser bookmarks.

The extension lives in `extensions/bookmark-sync`. Load it unpacked for testing, or **force-install a packed CRX** in production. It is a small stand-in for **Browser Launcher Pro**: bookmarks only — no other-browser launching, native host, or license.

Full in-app copy: **Help → Guides → Bookmark Sync Extension**. The extension popup also has a **Help** tab.

---

## Security (v1.6)

| Control | What it does |
|---------|----------------|
| **Origin allowlist** | Only sites listed in `org-branding.json` → `allowedOrigins` (plus the App link origin when branding is enabled) receive bookmark lists or CHECK replies. Other websites get **no reply**. |
| **Opt-in sync** | **Bookmark sync starts Off.** The user (or `syncDefaultOn` in org JSON / managed policy) must turn it on. Toolbar shows **OFF** until then. |
| **Same-origin replies** | The extension and the app use `postMessage` with this page’s origin, not `*`. The app ignores messages from other origins. |
| **This profile only** | `chrome.bookmarks.getTree()` reads **this Chrome/Edge profile on this PC**. The extension cannot read another user’s PC, Windows account, or browser profile. It does not upload bookmarks. |

Guest Your Bookmarks stay in **this browser**. Signed-in Favorites Organizer import still only receives the tree from **the profile that clicked Sync**.

---

## This user’s bookmarks only (not someone else’s browser)

Sync is **not** a cloud share between employees.

| Situation | What Sync can read |
|-----------|-------------------|
| You, on your PC, your Chrome/Edge profile | **Your** bookmarks only |
| A colleague on their own PC | **Theirs** only — you cannot pull their tree |
| Another Windows login on the same PC | Separate Chrome profiles → **that login’s** bookmarks, not yours |
| Shared / unlocked Chrome profile | Whoever is sitting there can sync **that shared profile’s** bookmarks into the LinkNest page they have open |

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
4. If **Bookmark sync** is **On**, the background script reads `chrome.bookmarks.getTree()` for **this profile**, flattens http(s) URLs, and replies to the same origin:

```text
{ type: "BROWSER_LAUNCHER_BOOKMARKS_LIST", success: true, bookmarks: [...], timestamp }
```

5. LinkNest **merges** those URLs into Your Bookmarks (new URLs added; existing ones skipped). Guest data stays in **this browser only**.

If the extension is missing, sync is **Off**, the origin is not allowlisted, or the `bookmarks` permission is denied, Sync fails. Use **Import HTML** / **Merge** instead.

---

## What you need to make it work

1. **Install** `extensions/bookmark-sync` in the **same browser profile** you use for the app (unpacked for test, force-install for production).
2. Allow the **bookmarks** permission when Chrome/Edge asks.
3. Turn **Bookmark sync** **On** in the extension popup (Sync tab). An **OFF** badge means the page cannot read bookmarks.
4. Open the app at an **allowlisted** `http://` or `https://` origin (see `allowedOrigins`). `file://` pages do not work.
5. Reload the app after installing or reloading the extension.
6. Favorites → Your Bookmarks → **Sync**.

You do **not** need Browser Launcher Pro if this extension is installed. You do **not** need the branded name to match the site title.

After upgrading from v1.5, turn **Bookmark sync** On again (it now defaults Off) and confirm your LinkNest URL is in `allowedOrigins`.

---

## Enable / disable sync in the extension

On the popup **Sync** tab, use the **Bookmark sync** switch.

| Switch | Effect |
|--------|--------|
| **Off** (default) | The extension refuses `GET_BOOKMARKS`. Toolbar badge: **OFF** |
| **On** | The app Sync button can read **this profile’s** bookmarks, only on allowlisted sites |

Turning sync off does **not** uninstall the extension. **Refresh count** in the popup still shows how many http(s) bookmarks exist; it does not count as a Sync.

IT can set `"syncDefaultOn": true` in `org-branding.json` (or Chrome managed policy) if every profile should start On. Prefer Off for shared PCs.

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
| `syncDefaultOn` | `true` = new profiles start with Bookmark sync On. Default `false`. |

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
| Sync times out / “install extension” | Load/reload the extension, **refresh the app**, turn Bookmark sync **On**, confirm this origin is in `allowedOrigins` (scheme + host + port, e.g. `http://localhost` not a path) |
| “Sync is turned off…” | Popup → Sync tab → turn **Bookmark sync** on |
| “not on the organisation allowlist” | IT must add this origin to `allowedOrigins` and reload the extension |
| Bookmarks permission / getTree error | Reload the extension and grant **bookmarks** |
| Colleague’s bookmarks appeared | You used **their** Chrome/Edge profile (shared PC). Sign into your Windows account and your own browser profile |
| Extension context invalidated | Refresh the LinkNest tab after every extension reload |
| Still stuck | Favorites → Your Bookmarks → **Import HTML** or **Merge** |

---

## Permissions (extension)

- **bookmarks** — read **this profile’s** bookmark tree so Sync can merge it. Nothing is uploaded to a server for guest Your Bookmarks.
- **storage** — branding, sync on/off, timing stats, and optional enterprise managed policy.

---

## Related

- Help → Guides → **Your Bookmarks & Favorite Links** (import, rewrite tools, compact view)
- Extension popup → **Help** tab
- `extensions/bookmark-sync/README.md` (install and org JSON)
