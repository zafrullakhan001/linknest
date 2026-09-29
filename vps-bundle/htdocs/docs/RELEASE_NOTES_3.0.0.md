# LinkNest 3.0.0 — Release Notes (major)

**Release:** `v3.0.0` · **Branch:** `linknest-spacefix` · **Date:** 2026-09-22
**Database:** `LINKNEST_SCHEMA_VERSION` **105 → 106** (automatic, additive, idempotent)
**Frontend build:** portable Vite base `./` (works under `/linknest`, `/ArchLinks`, `/ERP3`, any folder)

This is the first **major** release since the 2.x line. No breaking changes: existing installs keep their
database, uploads, settings, and users.

---

## 1. What ships in 3.0.0

Consolidates everything landed on the 2.3.x branch line:

| Area | Highlights |
|------|------------|
| **Authentication** | Passkeys / WebAuthn sign-in (`api/webauthn.php`, `vendor/lbuchs/webauthn`), in-app Passkey manager, browser-session validation, admin lockout recovery scripts |
| **Admin monitoring** | Apache monitoring dashboard (footer “online now”): `mod_status` workers/uptime, access-log top paths, OPcache, PHP memory, SQLite size, disk; purge Apache/PHP logs, enable OPcache in `php.ini`, restart Apache |
| **Sharing & people** | Private space sharing (invite → accept → revoke) with shared-user list in the space editor; LDAP display-name sync (`displayName` / `cn`) so full names appear next to login ids |
| **Space editor** | Tab and section background customization; emoji/header images; boxed rich text |
| **Links** | URL Safety Intelligence (WAF/grading + blocklists), video support in link info, link health status colors/shapes, open-target modes (tab, same window, popup, full window, InPrivate/Incognito), mobile preview emulation |
| **Remote access** | SSH / VNC Easy widgets over `ttyd` + bundled OpenSSH/Python, SharedWorker session continuity across refresh |
| **AI / automation** | MCP tools for spaces, links, notes, users, roles, LDAP/SAML, Device Presets, database export/import |
| **Diagnostics** | Load tests, system specs check, Python monitor/email workers, in-app App Updates with DB backup + rollback |

See **Help & About → About → What’s New in 3.0.0** for the in-app summary.

---

## 2. Database change (schema 106)

New additive migration in `api/config.php`:

* `ensureSchemaReleaseRegistry(PDO $db)` creates

  ```sql
  CREATE TABLE IF NOT EXISTS schema_releases (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      schema_version INTEGER NOT NULL,
      app_version    TEXT,
      applied_at     INTEGER NOT NULL,
      source         TEXT              -- 'web' | 'cli'
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_releases_version
      ON schema_releases(schema_version);
  ```

  and records one row per schema version (here `106` / `3.0.0`) the first time it is applied.

* Wired into all three bootstrap paths (both `getDB()` fast paths via the
  `schemaPatchesAlreadyApplied()` gate, and the full `initDatabase()` path), so it runs once per
  install per schema version.
* `LINKNEST_APP_VERSION` (`3.0.0`) is defined next to `LINKNEST_SCHEMA_VERSION` and stored in the
  registry row.
* Admins can read the trail from `GET /api/database/info` → `stats.schema_releases` (admin session
  required; the Database panel itself uses `/api/database/snapshots` and `/api/database/maintain`).

**Existing installs:** the cache flag changes from `data/cache/schema_patches_v105.ok` to
`data/cache/schema_patches_v106.ok`, so the **first request after the update re-runs the idempotent
patch pass once** (slightly slower first load, then back to the fast path).

**Rollback:** the migration only adds a table. Restoring the pre-update snapshot (below) reverses it
completely.

---

## 3. Before you apply (build host)

A pre-release database snapshot was taken before this migration:

```powershell
cd C:\xampp\htdocs\linknest
php api/snapshot.php
# -> data/backups/linknest-snapshot-<YYYY-MM-DD-HHMMSS>.db (+ .json metadata, VACUUM INTO)
```

Verify the install is healthy after migrating:

```powershell
php scripts/check_database.php          # path, journal mode, table counts
php -r "require 'api/config.php'; $db=getDB(); echo 'user_version=' . $db->query('PRAGMA user_version')->fetchColumn() . PHP_EOL; print_r($db->query('SELECT schema_version, app_version, applied_at, source FROM schema_releases ORDER BY schema_version DESC LIMIT 5')->fetchAll(PDO::FETCH_ASSOC));"
```

Expected: `user_version=106` and one row per schema version.

Restore if needed (last-resort rollback):

```powershell
php scripts/import_database.php data/backups         # restores the newest export/snapshot
```

or Admin → App Updates → history → **restore DB** (the updater snapshots automatically before every apply).

## 4. Apply on office instances (ArchLinks, ERP3, …)

1. Admin → **App Updates** → Settings: repo `zafrullakhan001/linknest`, GitHub PAT if private,
   **Track branch** `linknest-spacefix` (or keep `updater` — Releases are listed regardless of branch).
2. **Check for updates**.
3. Select Release **`v3.0.0`** (not only a commit) → leave **Back up database** checked → **Update**.
4. **Ctrl+F5** once the update finishes (service worker cache).
5. Repeat on each folder with the same Release.

Portable base means one ZIP updates every folder — see [APP_UPDATES.md](APP_UPDATES.md).

---

## 5. Publishing (build PC)

```bat
publish-base-release.bat -Bump major -Yes
```

Bumps `package.json` / `package-lock.json` to `3.0.0`, commits `chore: Release v3.0.0…`, pushes the
branch, builds `dist/` with Vite base `./`, packages `linknest-update-v3.0.0.zip`, tags **v3.0.0**, and
publishes the GitHub Release. Admins then apply it from Admin → App Updates.

Optional full deploy ZIP **including this PC's live database** (new hosts only):

```bat
package-for-deployment.bat -IncludeDatabase
```

That ZIP embeds `data/linknest.db` and `data/.encryption_key` — treat it as confidential and never
commit it (`*.zip`, `data/`, `*.db` are gitignored).

---

## 6. Upgrade / compatibility notes

* **No breaking changes.** Public and authenticated APIs keep their shapes; the new table is additive.
* `/api/database/info` gains a `stats.schema_releases` array (safe for existing clients).
* `BUILD_INFO.json` in the repo is now stamped `3.0.0` / `v3.0.0` / `trackBranch: linknest-spacefix`;
  targets get a freshly stamped file when the packager or updater runs.
* One-time slower first request per install after the schema bump (patch pass), as with every prior bump.
* Docker installs: rebuild with `redeploy-docker.bat` (in-app commit apply does not apply inside Docker).

---

## 7. Related

* [APP_UPDATES.md](APP_UPDATES.md) — in-app updates, portable Releases, rollback history
* [PACKAGE_FOR_DEPLOYMENT.md](PACKAGE_FOR_DEPLOYMENT.md) — Windows XAMPP deploy ZIP options
* [README_BACKEND.md](README_BACKEND.md) — API reference
* [PRIVATE_SPACE_SHARING.md](PRIVATE_SPACE_SHARING.md) — private space sharing + LDAP display names
* [VANILLA_APACHE_PHP85_WINDOWS.md](VANILLA_APACHE_PHP85_WINDOWS.md) — Apache monitoring dashboard setup
