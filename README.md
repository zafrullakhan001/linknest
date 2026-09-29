# 🔗 LinkNest

**The self-hosted application portal and link-governance platform for enterprises that run a lot of URLs.**

![version](https://img.shields.io/badge/version-3.0.0-2563eb)
![schema](https://img.shields.io/badge/database%20schema-109-0d9488)
![PHP](https://img.shields.io/badge/PHP-8.2%2B-777bb4)
![React](https://img.shields.io/badge/React-19-61dafb)
![SQLite](https://img.shields.io/badge/SQLite-3-003b57)
![Docker](https://img.shields.io/badge/Docker-ready-2496ed)

LinkNest turns a sprawl of internal application URLs — ERP, CRM, HR, ticketing, dashboards, monitoring,
warehouse tools, vendor portals, legacy systems — into one curated, searchable, permissioned, health-checked
launch portal that every employee can actually use.

It is a single PHP + SQLite application with a React UI, self-hosted on your own server, with no SaaS
dependency, no per-user licensing and no data leaving your network.

---

## Table of contents

- [Why LinkNest](#why-linknest)
- [Why LinkNest is unique for enterprises managing many application URLs](#why-linknest-is-unique-for-enterprises-managing-many-application-urls)
- [Typical enterprise use cases](#typical-enterprise-use-cases)
- [Feature catalog](#feature-catalog)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Quick start (development)](#quick-start-development)
- [Deployment](#deployment)
- [Configuration & environment variables](#configuration--environment-variables)
- [Roles, permissions and sharing model](#roles-permissions-and-sharing-model)
- [API and MCP overview](#api-and-mcp-overview)
- [Project structure](#project-structure)
- [Documentation index](#documentation-index)
- [Security](#security)
- [Versioning, schema and upgrades](#versioning-schema-and-upgrades)

---

## Why LinkNest

An enterprise with 200–5,000 internal URLs has three problems that a browser bookmark bar cannot solve:

| Problem | What it looks like today | What LinkNest does |
|---------|--------------------------|--------------------|
| **Findability** | Links live in personal bookmarks, e-mail, Excel sheets, sticky notes and chat threads. Nobody knows the *official* URL. | Every URL lives in a shared **Space** with tabs, sections, tags, search and categories — one canonical place per application. |
| **Trust** | Nobody knows if the app is up, if the certificate expires next week, if the URL is a phishing clone, or which of five “HR portal” links is real. | Built-in **uptime monitors, SSL/WHOIS/CT checks, redirect-chain and iframe probes, URL safety grading and reputation blocklists** answer that before someone clicks. |
| **Governance** | Anyone can edit a link; there is no history, no ownership, no audit trail and no access control below “it is on the intranet”. | **Version history with restore/compare/lock, recycle bin, expiry scheduling, role + group permissions, private sharing with accept/revoke, and time/IP/Geo restrictions** on every space and link. |

**In one line:** LinkNest is the *intranet front door* plus the *URL operations console* that IT, DevOps and
department owners need to keep hundreds of application links accurate, reachable, safe and correctly scoped.

## Why LinkNest is unique for enterprises managing many application URLs

1. **It manages *applications*, not just bookmarks.** A link entry can carry health status, latency, certificate
   expiry, WHOIS/CT data, redirect chain, notes, tags, a short URL, a preferred browser, an access time window
   and a GeoIP restriction. Typical “start page” tools stop at title + URL.
2. **Health-aware launching.** Link health checks paint status colours and shapes on links, uptime monitors track
   real availability with incidents and e-mail alerts, and recovery mails confirm when a service is back. Users
   see whether the target system is up *before* they raise a ticket.
3. **Governance is built in, not bolted on.** Per-space version history (compare, tag, comment, lock, restore),
   duplicate-URL detection, “Scan & Fix URLs”, recycle bin, archive and schedule-based publish/expiry turn URL
   maintenance into a controlled process instead of ad-hoc edits.
4. **Access scoping far beyond “public” or “private”.** Spaces and individual links support public /
   authenticated / private visibility, user and group allow-lists, invite → accept → revoke private sharing, and
   rule-based restrictions (day of week, time window, IP/CIDR/network pattern, reverse DNS, GeoIP country).
   Vendor-only and plant-only links can safely share one portal.
5. **Enterprise identity out of the box.** Local accounts, **LDAP** (with `displayName`/`cn` sync so real names
   appear next to login ids), **SAML 2.0 SSO**, optional **Passkeys / WebAuthn**, plus login allow-lists,
   browser fingerprint locking, a self-registration approval queue and admin lockout-recovery scripts.
6. **One install, many branded instances.** Clone the app into sibling folders (`ArchLinks`, `ERP3`, …) with
   `empty` / `structure` / `full` / `demo` presets. Each clone gets its own database, branding and install
   identity so logins and cookies never collide — while a single **portable Release** updates all of them,
   because the built UI uses a relative base and works from any sub-folder.
7. **Operational self-sufficiency.** In-app **App Updates** from GitHub commits or Releases (with an automatic
   SQLite snapshot and one-click DB restore), database snapshot/export/import/maintain/vacuum, index
   optimisation, an **Apache monitoring dashboard** (mod_status, access-log top paths, OPcache, PHP memory, disk,
   log purge, Apache restart), load-test tooling and a system-specs check.
8. **AI/LLM automation over your URL estate.** The bundled **MCP server** lets Cursor, Claude Desktop or Claude
   Code list, search, create and bulk-edit spaces and links with the token user's permissions — so onboarding a
   department's 300 URLs becomes a prompt instead of a data-entry project. Admin-scoped tokens can also manage
   users, roles, LDAP/SAML, Device Presets and database export/import.
9. **Device-aware by design.** Device Preview emulates phones, tablets, watches and **Zebra handheld scanners**
   (TC73, TC58, MC3300/MC9300, ET60/ET51 …) so you can verify how a warehouse or line-side app renders on the
   exact hardware — no device lab required. The preset catalog is manageable from the admin UI, JSON import and
   MCP.
10. **Deployable anywhere you already run PHP.** Windows XAMPP, vanilla Apache + PHP 8.5, or a single Docker
    container with SQLite. Air-gapped and offline bundles are supported (pre-built Apache/PHP runtime ZIPs and
    app ZIPs are published as GitHub Releases).

## Typical enterprise use cases

| Scenario | How LinkNest is used |
|----------|----------------------|
| **Intranet app portal / “single front door”** | One space per department (HR, Finance, IT, Plant 1). Employees bookmark a single URL and reach every app from there. |
| **IT service desk & operations** | A “Runbooks & Tools” space with monitoring dashboards, jump hosts, VPN, ticketing, vendor support portals and on-call links — restricted to the support group. |
| **Warehouse / shop-floor** | Tablet and Zebra-handheld device previews, large-touch layouts, LAN-only links restricted by IP subnet, and screens that stay useful on a 5-inch scanner. |
| **Multi-plant / multi-site manufacturing** | Plant-specific spaces restricted by IP range or GeoIP so a line operator never sees another site's MES or SCADA links. |
| **Vendor & contractor onboarding** | Private spaces shared by invitation with an end date; access is revoked when the contract ends (invite → accept → revoke, with an audit trail). |
| **Multi-brand / multi-tenant on one server** | Clone LinkNest to `ArchLinks`, `ERP3`, etc. with separate databases, branding and identities; one Release updates every folder. |
| **URL migrations and cutovers** | Publish short URLs and rotation for old links, keep both entries with notes, use version history to document the change and roll back. |
| **Compliance & audit** | Space version history with tags/comments, user audit log, monitor audit logs, short-URL rotation logs, e-mail logs and visitor statistics. |
| **Certificate & availability hygiene** | Bulk SSL imports, expiry tracking, WHOIS/CT lookups, uptime calendars and e-mail alerts before anyone notices a broken link. |
| **Air-gapped / restricted networks** | Offline deploy bundles, no external dependency at runtime, optional AI features, everything in local SQLite. |

---

## Feature catalog

### 🗂️ Spaces, tabs, sections and links

- **Spaces (tiles)** with emoji, header images, optional title/description, 17 predefined theme colours plus
  custom backgrounds, gradients (linear/radial, multi-stop), border radius and text colour.
- **Tabs → sections → links** hierarchy with drag-and-drop reordering/transfer (@dnd-kit), tab cloning, section
  cloning, and dedicated hierarchy/compact/grid/list views.
- **Whole-space hyperlink mode** — make the card itself open a URL.
- **Bulk operations**: bulk add links, CSV/bulk import templates for users and links, section/tab export &
  import, staging/AI import template, duplicate-URL detection and deletion.
- **Rich text content blocks** (TinyMCE) inside spaces, including optional *boxed* rich text cards with their own
  title/footer and visibility.
- **Media in spaces**: header images, inline media from the Media Library, YouTube embeds, and a video player
  dialog for video links (`VideoSpacePlayerDialog`), with video trim strip and uploads.
- **Per-link fields**: label, URL, notes, tags, tooltip style (rich/classic), short URL, custom status
  label/notes, preferred browser, and **open target** (same window, new tab, compact popup, full browser window,
  InPrivate/Incognito).
- **Link maintenance windows** with an optional maintenance video/message shown to users during downtime.
- **Device Preview** (desktop and mobile): responsive, phone, tablet, watch and **Zebra handheld** mockup
  frames; admin-managed device catalog with quick presets, JSON import/export, reset to defaults (and MCP tools).
- **Mobile experience**: dedicated mobile grid/view/edit components with compact layouts and touch-friendly
  editing.

### 🛡️ Link intelligence, health and URL safety

- **Link health checks** with status colours/shapes, latency badges and a dedicated *Link Check / Status Colors*
  admin workspace, plus per-link check exceptions.
- **SSL intelligence**: certificate chain and expiry checks, OCSP/CRL lookups, bulk SSL import, plus CT
  (Certificate Transparency) and **WHOIS** lookups for any domain.
- **URL probes**: redirect-chain dialog, iframe/frame check with an **Iframe Block Domains** admin list, and URL
  probe badges on links.
- **URL Safety Intelligence**: reputation blocklist feeds (phishing.army, HaGeZi DNS blocklists), local
  heuristics, WAF/CDN detection, URL grading, manual allow/block domains and a **Scan & Fix URLs** workspace.
- **Internet speed test** widget with scheduled runs, host-path vs browser-path diagnostics, result export and
  notifications.
- **Duplicate and stale URL handling**: duplicate link/tile cleanup, orphan-record cleanup and URL rewriting
  tools for migrations.

### 🔎 Search, favourites and bookmarks

- **Global search** across spaces, tabs, sections, links, notes and tags, with a search-result filter
  (spaces / links / both) and tag input.
- **Categories & presets**: free-text categories plus an admin **Category Presets** catalog to keep grouping
  consistent across hundreds of links.
- **Favourites**: favourite spaces and favourite **links** (server-backed when signed in, browser-scoped for
  guests) with manual/A→Z/Z→A sorting, compact vs card view, notes and health badges.
- **Guest “Your Bookmarks”**: import a Chrome/Edge bookmark HTML export (or *Merge Import*), auto-group into
  domain spaces, and copy favourites into a named folder tree.
- **Browser bookmark Sync / OutSync** via the bundled **LinkNest Bookmark Sync** extension — origin allow-list,
  opt-in read-only/read-write toggles, per-browser-profile isolation, JSON change log and an automatic HTML/JSON
  backup before writing.
- **Favorites Organizer** widget for triage and importing browser bookmarks into new spaces.
- **QR codes** (branded) for the app URL and for individual spaces, and **short URLs** with click tracking and
  scheduled **rotation** (useful for printed QR posters and migration cutovers).

### 🔐 Access, identity and security

- **Authentication methods**: Local accounts, **LDAP** (bind/search, group mapping, `displayName`/`cn` sync),
  **SAML 2.0** SSO (SP metadata, IdP config modal, connection test) and optional **Passkeys / WebAuthn** with an
  in-app Passkey manager. Admins can toggle methods independently — at least one always stays enabled.
- **Guest mode** with its own visibility rules, so a subset of the portal can serve kiosks or unauthenticated
  displays (e.g. shop-floor dashboards).
- **Registration workflow**: self-registration lands in a *Pending Users* queue for approval; **Blocked Users**
  and login allow-lists give admins a hard stop for specific accounts/IPs.
- **Fingerprint lock**: lock a browser/client with a fingerprint page unlock, plus recovery scripts when someone
  is locked out (`scripts/unlock_fingerprint_lock.php`, `scripts/unlock_login_allowlist.php`,
  `scripts/reset_admin_password.php`).
- **Roles, teams and groups**: roles with widget/space permissions, bulk role assignment, team wizards
  (members, roles, formation), user groups and group-to-space permissions, plus per-user granular space-admin
  permissions (add/edit/delete links, sections, tabs; change visibility; change browser; clone).
- **Role-based “Your Assigned Apps”** tab: each user sees the applications assigned to their roles as a personal
  launch page.
- **Private space sharing**: check users in the space editor → invitation → recipient accepts/rejects in
  *Shared with you* → owner can revoke at any time (unchecking a recipient immediately removes access and marks
  the invitation revoked). The editor always shows everyone the space is shared with, including pending badges.
- **Access restrictions**: per-space and per-link rules by **day of week, time window, IP/CIDR/network pattern,
  reverse DNS and GeoIP country**, with a friendly *access denied* dialog and an editor wizard.
- **Auditability**: user audit log, blocked/pending user views, admin action history and per-entity
  timestamps/comments.

### 🧾 Governance, audit and lifecycle

- **Space version history**: every save creates a version you can **compare (side-by-side diff), tag, comment,
  lock** against further changes, and **restore**. Cleanup tools remove empty/duplicate versions.
- **Recycle bin**: soft-deleted spaces are recoverable; dedicated *Recycle Bin*, *Archive*, *Scheduled* and
  *Expired* tabs keep the active portal clean.
- **Scheduled publishing and expiry**: set `visibleFrom` / `expiresAt` on a space so campaign or seasonal apps
  appear and disappear automatically.
- **Message Board per space**: rich messages with type/severity, start & end dates, priority, text colour and
  font, marquee speed, tab scoping, and placement above or below the tab strip — plus “also show on the space
  card”.
- **Application-wide broadcast**: admin broadcast banner with history, useful for incidents and maintenance
  windows.
- **Maintenance mode** with a maintenance page, plus per-link maintenance dialogs.
- **Visitor statistics per space**: total hits, unique visitors, who opened it (admin-only, can be hidden from
  guests) and “Currently here” presence for people viewing/editing the same space.
- **Page-visit analytics**: page visits, visit stats and an analytics collector with GeoIP location enrichment
  and reverse geocoding.
- **Database session identity per install** so cloned instances in sibling folders never share sessions/cookies.

### 📈 Monitoring, alerting and observability

- **Built-in uptime monitors**: HTTP(S), keyword, header, port, ping, DNS, SSL and JSON checks with intervals,
  timeouts, warning thresholds, maintenance windows, groups/tabs, status board, uptime calendar, incident
  history and status toasts.
- **Bulk monitor and SSL import** dialogs, monitor target labels, monitor audit log and a global history purge.
- **Notification engine**: per-monitor notification rules, e-mail templates, **multiple SMTP servers** with one
  active server, an outbox processed by a Python sender, recovery e-mails with downtime details, and e-mail logs.
- **Python workers**: `monitor_runner.py` + `email_sender.py` run outside Apache/PHP (Windows Task Scheduler,
  Linux cron or the Docker entrypoint loop), managed from an in-app scheduler panel.
- **Monitorv2 add-on**: optional PostgreSQL + **TimescaleDB** backend (`zmonitoring` schema, hypertables,
  continuous aggregates for hourly/daily stats, retention policies, percentiles, incident tracking, pg_cron
  dashboard views and a Python dashboard).
- **Performance Analytics add-on**: dual-perspective latency (real-user browser timings vs server-side synthetic),
  automatic link scanning with client|server latency badges and green/yellow/red health thresholds, backed by
  PostgreSQL + TimescaleDB.
- **Apache monitoring dashboard**: click *online now* in the footer for realtime `mod_status` workers/uptime,
  top access-log paths, OPcache, PHP memory, SQLite size and disk usage — with log purge, OPcache enablement and
  Apache restart actions (works with XAMPP, vanilla Apache, WAMP, Laragon or Docker).
- **System health tools**: system-specs check, SQLite memory check, OPcache status, maintenance health checks
  and load-test scripts (k6) with an in-app report view.

### 🤖 AI, MCP and automation

- **MCP server** (`/api/mcp`, JSON-RPC over HTTP + a stdio adapter in `mcp/server.mjs` for Claude Desktop):
  LLM clients get tools to list/search spaces, open one space, create a space seeded with many links, add/rename/
  delete links, update space metadata, soft-delete spaces and read/write Notes — all with the token user's
  permissions.
- **Admin-scoped MCP tools** (bound user is an administrator + write/admin scope): `admin_query` / `admin_manage`
  for users, roles, LDAP/SAML and database export/import, plus full **Device Presets** management.
- **Token hygiene**: tokens are SHA-256 hashed, secrets are shown once, scopes are explicit and revocation is
  immediate.
- **Optional Google Gemini integration** (`GEMINI_API_KEY`) for AI content generation, plus an in-app **Space AI
  Analysis** dialog that reviews a space's links and structure.
- **AI import templates** for staging bulk content (prompt guide + CSV template shipped in the repo).

### 🛠️ Admin console and operations

- **Admin navigation** (searchable, grouped): Users (Pending, All, audit log) · Configuration (Settings, Device
  Presets, Category Presets, Database, Spaces, Visit Counter, Enable/Disable Tabs, Link Check / Status Colors,
  URL Safety, Scan & Fix URLs, Sync Tooltips, Iframe Block Domains, Access Manager) · Authentication (LDAP, SAML)
  · Integrations (Browser Extension, MCP/AI, Broadcast, Clone) · Tools (Maintenance Scripts, Maintenance, Custom
  Widgets, Media Library, Add-ons, App Updates, Load Test).
- **In-app App Updates**: point at a GitHub repo/branch, check for commits or versioned Releases, apply with an
  automatic database snapshot, watch live progress and **restore the pre-update database** from history. The
  portable build base means one Release updates every sub-folder install.
- **Database workspace**: snapshots (`VACUUM INTO`) with metadata, JSON export/import, maintain/optimise/vacuum,
  index optimisation, in-memory tuning, schema-release registry (`GET /api/database/info` →
  `stats.schema_releases`), duplicate-tile cleanup and orphan cleanup.
- **Cloning**: copy the whole instance into a sibling folder from the admin UI (`empty`, `structure`, `full`,
  `demo` presets, background worker with status/trace) — each clone keeps its own database and identity.
- **Maintenance scripts**: one-click maintenance/repair scripts, database index optimisation, stats, duplicate
  URL maintenance, cleanup of inactive style profiles and demo-data generators.
- **Media Library**: shared repository for images, PDFs, audio and video with a virtual folder tree, tags,
  archive, trash-based soft delete, image editor, compression dialog, rename/delete folders and an
  editor-facing picker (with YouTube embeds) — plus a floating Media widget for admins.
- **Add-ons & Custom Widgets**: install/enable add-ons (Monitorv2, Performance Analytics) and register custom
  widget components with role-based visibility.
- **Load testing**: k6 scripts for common flows with an in-app report view.
- **Windows/ops tooling**: `package-for-deployment.bat` (XAMPP deploy ZIP), `publish-base-release.bat`
  (portable GitHub Release), bootstrap runtime bundles for Apache + PHP 8.5, XAMPP PHP upgrade scripts,
  `schedule-monitor-workers.bat` and Docker database sync scripts.

### 🎨 Personalisation, theming and user experience

- **Theme system**: 17 predefined theme colours, full **Theme Editor** (colours, gradients, radii, shadows,
  fonts), **Style Manager** with multiple style profiles, dark mode and per-user theme preferences.
- **Branding**: dynamic branding (app name, logo, hero area, custom CSS) with a compatibility fallback, so each
  cloned instance can look like its own product.
- **Page backgrounds**: solid, gradient, pattern, image, animated "center canvas" and celebration effects — plus
  per-tab and per-section background customisation inside spaces.
- **47 tile entrance animations** plus particle/celebration effects (confetti, fireworks, balloons, snowfall,
  leaves, petals, fireflies, bubbles, shooting stars and more).
- **Floating widget dock** with quick access (Ctrl+Shift+Y): clock, world timezones, weather, calculator, notes
  (with presets), media library, password generator, phonetic alphabet, theme switcher, favourites organizer,
  chat, page-zoom control, read-aloud (TTS), SSH/RDP terminal, VNC viewer and a mini game — each assignable by
  role.
- **Read aloud** using browser speech synthesis or the server TTS endpoint.
- **In-app help system**: Help & About dialog with searchable **Guides** rendered from `docs/*.md`
  (`GET /api/docs`), architecture diagrams, fingerprint comparison help and per-feature walkthroughs.
- **Mobile-first details**: responsive layouts, dedicated mobile edit/view screens, mobile preview dialog,
  tooltips, toasts and share-notification banners.

### 🖥️ Remote access widgets (SSH / RDP / VNC)

- **SSH / RDP widget** — "SSH Easy" (host/port/username; LinkNest starts `ttyd` for you), "SSH Advanced" (any
  ttyd WebSocket URL), and RDP by embedding a Guacamole/web-RDP HTTPS page.
- **VNC Viewer** — noVNC-based, "Easy" (host + port; LinkNest starts `websockify`) or "Advanced" (existing
  WebSocket URL), multi-tab.
- **Bundled runtimes**: portable `ttyd`, OpenSSH and embeddable CPython + `websockify` in `bin/`, with install/
  package scripts for offline hosts.
- **Session continuity**: live SSH sessions survive a browser refresh through a browser-memory SharedWorker
  (`ssh-session-shared-worker.js`).
- **Private saved connections**: saved SSH/RDP/VNC entries are per account (never shared between users or
  admins); guests get browser-only storage. Passwords are never stored.
- **Space links** can carry `ssh://`, `vnc://` or `auto://` URLs so a space becomes a jump host directory.

### 🔌 Integrations and extensions

| Integration | Purpose |
|-------------|---------|
| **LinkNest Bookmark Sync** (`extensions/bookmark-sync`) | Sync / OutSync browser bookmarks with Your Bookmarks; origin allow-list, opt-in scopes, per-profile isolation, backup before write. Also supported by Browser Launcher Pro 3.1+. |
| **Browser Launcher integration** (`land/`) | Launch links in a preferred browser, full browser window, compact popup or InPrivate/Incognito window, plus the landing/launcher page. |
| **MCP clients** | Cursor (HTTP), Claude Desktop / Claude Code (stdio), any MCP-compatible agent. |
| **LDAP / SAML IdP** | Directory-based sign-in, group mapping and display-name sync. |
| **SMTP (single or multiple servers)** | Monitor alerts, broadcast e-mails, recovery notices, e-mail templates and logs. |
| **Google Gemini** (optional) | AI content generation for spaces and links. |
| **PostgreSQL + TimescaleDB** (optional) | Monitorv2 and Performance Analytics add-ons. |
| **Docker / XAMPP / vanilla Apache+PHP 8.5** | Deployment targets, including offline bundles. |
| **k6 load tests** | `load-tests/*.js` scenarios plus the in-app report. |

---

## Tech stack

| Layer | Technology | Used for |
|-------|-----------|----------|
| Frontend | **React 19** + **TypeScript 5.8** + **Vite 6** | SPA UI, hash routing (`#/`, `#/admin`, `#/style-manager`) |
| Styling | **Tailwind CSS 3.4** | All styling, dark mode via `dark:` variants |
| Drag & drop | **@dnd-kit** (`core`, `sortable`, `utilities`) | Reordering spaces, tabs, sections and links |
| Rich text | **TinyMCE 8** (`@tinymce/tinymce-react`) | Space content, boxed rich text, media inserts |
| Widgets | **@xterm/xterm**, **@novnc/novnc**, **qrcode.react**, **recharts**, **react-icons**, **lucide-react**, **node-forge**, **uuid** | SSH/VNC terminals, QR codes, charts, icons, cert utilities |
| Backend | **PHP 8.2+** (8.4/8.5 supported), **PDO/SQLite 3** | JSON API, session auth, background-safe scripts |
| Web server | **Apache 2.4** (XAMPP, vanilla, Docker) | Serves `dist/` + `/api` rewrite; optional `mod_status` dashboard |
| Workers | **Python 3.9+** (`monitor_runner.py`, `email_sender.py`, `speedtest_runner.py`) | Uptime checks, e-mail outbox, scheduled speed tests |
| Optional add-ons | **PostgreSQL + TimescaleDB** | Monitorv2 hypertables, Performance Analytics |
| Optional AI | **@google/genai** (Gemini), **MCP** JSON-RPC | Content generation, LLM tooling |
| Deployment | **Docker Compose**, XAMPP ZIP packager, GitHub Releases updater | One-command servers, offline/air-gapped installs, in-app updates |

## Architecture

```
Browser SPA (React/Vite, dist/)
   │  fetch /api/*  (same origin, session cookie)
   ▼
Apache + PHP API  ── api/index.php (central router)
   │                 ├─ tiles, tile-shares, access, roles, user-groups, users/audit
   │                 ├─ monitors, monitorv2, linkhealth, ssl-check, whois, ct-lookup
   │                 ├─ url-safety, short-urls, media, notes, broadcast, chat, speedtest
   │                 ├─ ldap/saml/webauthn/fingerprint, apache-monitor, updater, database
   │                 └─ mcp, mcp-tokens, docs, widgets, addons, clone, uploads
   ▼
SQLite  data/linknest.db        uploads/ (logos, media)      data/backups (snapshots)
   ▲
   └── Python workers (monitor + e-mail + speed tests) run outside Apache:
       Windows Task Scheduler │ Linux cron │ Docker entrypoint loop
```

- **One router, many endpoints** — `api/index.php` maps `PATH_INFO` to endpoint modules; JSON in, JSON out.
- **Additive, idempotent migrations** in `api/config.php`, tracked by `PRAGMA user_version` plus the
  `schema_releases` audit table (snapshots available before every upgrade).
- **Optional scaling paths** — alternate starter schemas for PostgreSQL, MariaDB/MySQL and SQL Server ship in
  `docs/schemas/`, and heavy monitoring/analytics can move to TimescaleDB add-ons while the portal stays on SQLite.
- Full diagrams (system overview, request path, login sequence, monitoring loop, update pipeline) are documented
  in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and rendered in the in-app **Help → Guides → Architecture**.

## Quick start (development)

**Prerequisites:** Node.js 20+, PHP 8.2+ with the SQLite extension, npm.

```bash
npm install
npm run dev
```

`npm run dev` starts Vite on **port 3000** and PHP's built-in server on **port 8000** (API + uploads) — Apache is
not required. Open <http://localhost:3000>.

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server (:3000) + PHP API (:8000) |
| `npm run build` | Production build into `dist/` |
| `npm run build:prod` | Production build with production mode |
| `npm run preview` | Preview the production build locally |
| `npm run mcp` | Run the MCP stdio adapter (`LINKNEST_URL` + `LINKNEST_TOKEN`) |

First run creates `data/linknest.db` automatically. Register the first account, promote it to administrator, then
open **Admin → Spaces** to create your first space (for example *Company Apps*) and start adding links. Everything
else — LDAP/SAML, monitors, branding, roles — is configured from the same admin console.

## Deployment

| Target | How | Notes |
|--------|-----|-------|
| **Windows XAMPP** (most common) | `package-for-deployment.bat` → deploy ZIP with SQLite runtime and remote-widget binaries (`-AppOnly`, `-IncludeDatabase`, `-ExcludeUploads`, `-SkipBuild`, `-BasePath` flags) — see [docs/PACKAGE_FOR_DEPLOYMENT.md](docs/PACKAGE_FOR_DEPLOYMENT.md) | Copy to `htdocs/<folder>`; the UI works from any sub-folder. |
| **Vanilla Apache + PHP 8.5 (Windows)** | Follow [docs/VANILLA_APACHE_PHP85_WINDOWS.md](docs/VANILLA_APACHE_PHP85_WINDOWS.md); rebuild runtime + app ZIPs with `publish-windows-bootstrap-bundles.bat`; patch in place with `upgrade-vanilla-apache-php.bat` | For hosts without XAMPP (`D:\Apache`, `D:\php`). |
| **Docker (single container)** | `cd docker && ./docker-deploy.sh` (or `docker compose -f docker/docker-compose.yml up -d --build`) | HTTP <http://localhost:8090>, HTTPS <https://localhost:8443>, default `admin` / `admin123` (change immediately). Includes Node for in-container updates, Mailpit for dev mail and built-in worker loop. |
| **Existing installs** | Admin → **App Updates** → check for the latest Release → apply (database backup on by default) | Portable releases update every sub-folder install from a single ZIP. |
| **Air-gapped / offline** | Ship the pre-configured Apache+PHP runtime bundle and the app deploy ZIP (GitHub Release tag `apache-php85-runtime`) | No internet needed at runtime; AI features are optional. |

Production notes: serve over HTTPS, set secure session cookies, keep `data/` and `uploads/` writable but
non-executable, and disable CORS for cross-origin setups (relative `/api` URLs are used everywhere by default).

## Configuration & environment variables

Put local values in `.env.local` (development) or `.env` (deployment):

```env
# Optional — enables AI content generation
GEMINI_API_KEY=your_gemini_api_key

# Production build options (ignored by `npm run dev`)
VITE_BASE_PATH=/linknest      # sub-folder the app is served from (portable builds use ./)
VITE_API_BASE=/api

# Optional — Apache monitoring dashboard (auto-discovered on most hosts)
LINKNEST_APACHE_HTTPD=D:\Apache\bin\httpd.exe
LINKNEST_APACHE_SERVICE=Apache2.4

# Python worker tuning (Docker)
LINKNEST_WORKERS_ENABLED=1
LINKNEST_WORKER_INTERVAL_SECONDS=60
LINKNEST_WORKER_MAX_WORKERS=10
LINKNEST_EMAIL_LIMIT=50

# Diagnostics only — verbose API request logging
LINKNEST_API_DEBUG=1
```

Most settings are **not** environment variables: branding, authentication methods, monitors, SMTP servers,
widgets, tabs, Device Presets, URL safety and access rules are all stored in SQLite and managed from
**Admin** (plus `GET/POST /api/settings`).

## Roles, permissions and sharing model

| Level | Controls |
|-------|----------|
| **Guest** | Public spaces and public links only; favourites/bookmarks stored in the browser. |
| **Authenticated user** | Public + authenticated spaces, server-side favourites, personal notes, widget access per role, “Shared with you” invitations, personal SSH/VNC connection lists. |
| **Space owner** | Full control of the space: tabs, sections, links, visibility, sharing, versions, messages, styling. |
| **Space editor (delegated admin)** | Granular per-space rights: add/edit links, add sections, add tabs, delete links/sections/tabs, change visibility, change browser target, clone. |
| **Role** | Assigns spaces/apps (“Your Assigned Apps”), widgets and delegated rights to many users at once. |
| **Group** | Group-to-space permissions and group membership for LDAP/SSO-driven access. |
| **Administrator** | Whole-app configuration: users and approvals, roles/teams/groups, LDAP/SAML/Passkeys, access manager, monitors, media, MCP tokens, database, cloning, App Updates. |

Private spaces additionally use an explicit **invitation lifecycle**: `pending → accepted / rejected / removed`.
Only accepted recipients get access; unchecking a user in the editor revokes access immediately.

## API and MCP overview

The API is a single JSON surface behind `api/index.php` (`/api/*`), with session-cookie auth and
`{ data: … }` / `{ error: … }` response shapes. Key families:

| Family | Endpoints |
|--------|-----------|
| Auth & users | `/api/auth/*` (login, register, logout, me, LDAP/SAML), `/api/webauthn/*`, `/api/fingerprint/*`, `/api/user-audit` |
| Spaces & content | `/api/tiles`, `/api/tiles/{id}`, `/api/tiles/{id}/versions/*` (compare, lock, restore, tags, comments), `/api/tiles/{id}/presence`, `/api/tile-shares`, `/api/arrangements`, `/api/styles`, `/api/tile-messages` |
| Access control | `/api/access`, `/api/roles`, `/api/user-groups`, `/api/group-tile-permissions`, `/api/access-restrictions` |
| Link intelligence | `/api/linkhealth`, `/api/ssl-check`, `/api/whois-lookup`, `/api/ct-lookup`, `/api/ocsp-crl`, `/api/framecheck`, `/api/url-safety`, `/api/short-urls` |
| Monitoring | `/api/monitors`, `/api/monitorv2`, `/api/monitor-notifications`, `/api/speedtest`, `/api/apache-monitor`, `/api/load-test-report` |
| Content & media | `/api/media`, `/api/uploads`, `/api/notes`, `/api/widgets`, `/api/chat`, `/api/broadcast`, `/api/email-templates`, `/api/smtp-settings` |
| Analytics | `/api/page-visits`, `/api/visit-stats`, `/api/app-presence`, `/api/analytics/*` |
| Operations | `/api/database`, `/api/snapshot`, `/api/updater`, `/api/clone`, `/api/addons`, `/api/docs`, `/api/settings` |
| AI / MCP | `/api/mcp`, `/api/mcp-tokens` |

**MCP quick start** (see [docs/MCP.md](docs/MCP.md)): create a token in **Admin → MCP / AI**, then add to
`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "linknest": {
      "url": "http://localhost/linknest/api/mcp",
      "headers": { "Authorization": "Bearer lnmcp_YOUR_TOKEN" }
    }
  }
}
```

Claude Desktop uses the stdio adapter instead: `node mcp/server.mjs` with `LINKNEST_URL` + `LINKNEST_TOKEN`.

Full endpoint reference: [docs/README_BACKEND.md](docs/README_BACKEND.md).

## Project structure

```
linknest/
├── App.tsx, index.tsx, types.ts      # SPA entry, routes, shared types
├── components/                       # React components (spaces, admin, widgets, dialogs)
├── contexts/                         # Auth, Settings, Style providers
├── services/                         # Typed API clients for every feature
├── utils/                            # Display, URL, formatting helpers
├── api/                              # PHP endpoints (index.php router + 80+ modules)
│   └── analytics/                    # Analytics collector endpoints
├── mcp/server.mjs                    # MCP stdio adapter for Claude Desktop
├── extensions/bookmark-sync/         # Browser bookmark Sync/OutSync extension
├── land/                             # Browser launcher integration + landing page
├── bin/                              # Portable ttyd, OpenSSH, Python + websockify
├── scripts/                          # Workers, packagers, schedulers, DB tools
├── docker/                           # Dockerfile, compose files, deploy scripts
├── monitorv2/ · analytics/           # Optional TimescaleDB add-ons
├── load-tests/                       # k6 load-test scenarios
├── docs/                             # Product, deployment and operations guides
├── data/                             # SQLite database + snapshots (gitignored)
└── uploads/                          # Logos and media library files (gitignored)
```

## Documentation index

| Guide | What it covers |
|-------|----------------|
| [docs/SETUP.md](docs/SETUP.md) · [docs/PRODUCTION.md](docs/PRODUCTION.md) | Local setup and production deployment |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System, request, login, monitoring and updater diagrams |
| [docs/README_BACKEND.md](docs/README_BACKEND.md) | API reference and backend notes |
| [docs/MCP.md](docs/MCP.md) | MCP / AI setup for Cursor, Claude Desktop and Claude Code |
| [docs/YOUR_BOOKMARKS.md](docs/YOUR_BOOKMARKS.md) · [docs/BOOKMARK_SYNC_EXTENSION.md](docs/BOOKMARK_SYNC_EXTENSION.md) | Favourites, guest bookmarks, Sync/OutSync and extension mass-deploy |
| [docs/PRIVATE_SPACE_SHARING.md](docs/PRIVATE_SPACE_SHARING.md) | Share invitations, accept/revoke, LDAP display names |
| [docs/TILE_ADMIN_GRANULAR_PERMISSIONS.md](docs/TILE_ADMIN_GRANULAR_PERMISSIONS.md) | Delegated space-editor rights |
| [docs/MESSAGE_BOARD_TABS.md](docs/MESSAGE_BOARD_TABS.md) | Message board scoping, placement, fonts, marquee |
| [docs/TILE_ANIMATIONS.md](docs/TILE_ANIMATIONS.md) | Tile animation catalogue |
| [docs/DEVICE_PRESETS.md](docs/DEVICE_PRESETS.md) | Device Preview catalog format (incl. Zebra handhelds) |
| [docs/MEDIA_LIBRARY.md](docs/MEDIA_LIBRARY.md) | Media library, folders, trash, editor inserts |
| [docs/MULTIPLE_SMTP_SERVERS.md](docs/MULTIPLE_SMTP_SERVERS.md) | Alerting / e-mail server configuration |
| [docs/PYTHON_WORKERS.md](docs/PYTHON_WORKERS.md) · [docs/CLONED_INSTANCE_SCHEDULING.md](docs/CLONED_INSTANCE_SCHEDULING.md) | Monitor/e-mail workers and scheduling per instance |
| [docs/REMOTE_WIDGETS_SETUP.md](docs/REMOTE_WIDGETS_SETUP.md) · [docs/SSH_SESSION_SHARED_WORKER.md](docs/SSH_SESSION_SHARED_WORKER.md) | SSH/RDP/VNC widgets, runtime and session continuity |
| [docs/APP_UPDATES.md](docs/APP_UPDATES.md) · [docs/RELEASE_NOTES_3.0.0.md](docs/RELEASE_NOTES_3.0.0.md) | In-app updates, portable releases, current release notes |
| [docs/ADMIN_LOCKOUT_RECOVERY.md](docs/ADMIN_LOCKOUT_RECOVERY.md) | Recover admin access, reset passwords, unlock allow-lists |
| [docs/PACKAGE_FOR_DEPLOYMENT.md](docs/PACKAGE_FOR_DEPLOYMENT.md) · [docs/WINDOWS_BOOTSTRAP_BUNDLES.md](docs/WINDOWS_BOOTSTRAP_BUNDLES.md) | Windows deploy ZIPs and runtime bundles |
| [docs/VANILLA_APACHE_PHP85_WINDOWS.md](docs/VANILLA_APACHE_PHP85_WINDOWS.md) · [docs/XAMPP_PHP_UPGRADE.md](docs/XAMPP_PHP_UPGRADE.md) | Apache/PHP host configuration and upgrades |
| [docs/OFFICE_WIN2022_DEPLOY.md](docs/OFFICE_WIN2022_DEPLOY.md) · [docs/DOCKER_DEPLOYMENT.md](docs/DOCKER_DEPLOYMENT.md) | Verified office and Docker deployments |
| [docs/CUSTOM_WIDGETS_DEVELOPMENT.md](docs/CUSTOM_WIDGETS_DEVELOPMENT.md) | Building and registering custom widgets |
| [docs/DATABASE_OPTIMIZATION.md](docs/DATABASE_OPTIMIZATION.md) · [docs/DATABASE_IN_MEMORY_OPTIMIZATION.md](docs/DATABASE_IN_MEMORY_OPTIMIZATION.md) | SQLite tuning and maintenance |

Every guide is also readable inside the app: **Help & About → Guides** (served from `docs/` via `GET /api/docs`).

## Security

- Password hashing with PHP `password_hash()`; session-cookie auth with HttpOnly / SameSite cookies.
- CSRF-resistant same-origin design (relative `/api` URLs, no cross-origin CORS in production).
- All SQL through PDO prepared statements; SQLite foreign keys enabled.
- SSO with LDAP / SAML 2.0 and optional passkeys; browser fingerprint locking and login allow-lists.
- Uploads are restricted to images/media and served from a directory that cannot execute PHP.
- MCP tokens are SHA-256 hashed, scope-limited and immediately revocable; secrets are shown only once.
- Guests can be restricted per space/link, by IP/CIDR, reverse DNS, day/time window or GeoIP country.
- Auditability by default: user audit log, space version history, monitor audit logs, rotation logs and e-mail logs.
- Deployment hardening: HTTPS, secure cookies, least-privilege filesystem permissions on `data/` and `uploads/`.

## Versioning, schema and upgrades

- Current app version: **3.0.0** (`package.json`, `BUILD_INFO.json`, `LINKNEST_APP_VERSION`).
- Current database schema: **109** (`LINKNEST_SCHEMA_VERSION` in `api/config.php`). Migrations are additive and
  idempotent; `PRAGMA user_version` plus the `schema_releases` registry record what was applied.
- Upgrades never touch existing data, uploads, settings or users. A snapshot is taken automatically before
  in-app updates, and you can restore it from **Admin → App Updates → history → restore DB**.
- Manual snapshot / verify / restore:

```powershell
php api/snapshot.php                            # data/backups/linknest-snapshot-<timestamp>.db (+ metadata)
php scripts/check_database.php                  # database path, journal mode, table counts
php scripts/import_database.php data\backups    # restore the newest export/snapshot
```

- Publishing a release for every install on a server: `publish-base-release.bat` (builds a portable `./`-based UI
  ZIP, tags and publishes the GitHub Release), then apply it from **Admin → App Updates** on each instance.

---

<div align="center">

**LinkNest** — one front door for every application URL you run.

Self-hosted · SQLite · no per-user licensing · built for IT teams that manage hundreds of app URLs.

[Repository](https://github.com/zafrullakhan001/linknest) · [Documentation](docs/) · [Release notes](docs/RELEASE_NOTES_3.0.0.md) · in-app **Help → Guides**

</div>


