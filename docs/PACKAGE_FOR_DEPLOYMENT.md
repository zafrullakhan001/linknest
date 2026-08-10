# Package for Deployment (Windows / XAMPP)

Build a self-contained **LinkNest** ZIP on a known-good Windows machine and deploy or update another XAMPP host.

**Launcher:** [`package-for-deployment.bat`](../package-for-deployment.bat)  
**Engine:** [`package-for-deployment.ps1`](../package-for-deployment.ps1)

This is different from the smaller Docker-oriented [`scripts/bundle.bat`](../scripts/bundle.bat) flow described in [CREATE_BUNDLE.md](CREATE_BUNDLE.md). Use **package-for-deployment** for production XAMPP installs.

---

## Quick start

Double-click `package-for-deployment.bat`, or from Command Prompt / PowerShell in the project root:

```bat
package-for-deployment.bat
```

**Default behavior:**

- Wipes and rebuilds production `dist/`
- **FRESH** database mode (does **not** ship this PC’s live `data/linknest.db`)
- Includes `uploads/` (unless excluded)
- Bundles SQLite DLL runtime for target XAMPP
- Bundles `bin/` ttyd + websockify for SSH/VNC Easy
- Emits `linknest-deploy-YYYYMMDD_HHMMSS.zip` and an App Updates asset `linknest-update-vX.Y.Z.zip`
- Stamps `BUILD_INFO.json` / source specs for PWA cache busting and System Specs Check

---

## All options

Pass flags after the `.bat` name (they are forwarded to PowerShell), or call the `.ps1` directly.

| Option | Type | Default | Meaning |
|--------|------|---------|---------|
| *(none)* | — | — | Fresh package: rebuild, no live DB, include uploads, SQLite runtime, remote `bin/` |
| `-IncludeDatabase` | switch | off | Ship this PC’s `data/linknest.db` (and related DB files) to mirror production data |
| `-ExcludeUploads` | switch | off | Skip the `uploads/` directory |
| `-SkipBuild` | switch | off | Reuse existing `dist/` (not recommended when shipping code changes) |
| `-SkipSqliteRuntime` | switch | off | Do not bundle/download the SQLite DLL for XAMPP (not recommended) |
| `-SkipRemoteRuntime` | switch | off | Do not bundle `bin/` ttyd + websockify (SSH/VNC Easy need manual install on target) |
| `-BasePath "/name"` | string | `/linknest` | Vite base path baked into the frontend (subfolder deploy) |
| `-OutputDir "E:\"` | string | project root | Where to write the deploy ZIP |

### Examples

```bat
REM Recommended fresh install package for another PC
package-for-deployment.bat

REM Mirror this machine's database onto the target
package-for-deployment.bat -IncludeDatabase

REM Smaller package without uploads
package-for-deployment.bat -ExcludeUploads

REM Custom URL base path (e.g. https://server/myapp/)
package-for-deployment.bat -BasePath "/myapp"

REM Write ZIP to another drive
package-for-deployment.bat -OutputDir "E:\releases"

REM Combine options
package-for-deployment.bat -IncludeDatabase -ExcludeUploads -OutputDir "D:\zips"

REM PowerShell equivalent
powershell -NoProfile -ExecutionPolicy Bypass -File .\package-for-deployment.ps1 -IncludeDatabase -BasePath "/linknest"
```

---

## What the ZIP contains (typical)

- Production frontend (`dist/`) and PHP API
- `vendor/` (e.g. SAML) when present
- Updater APIs (`api/updater*.php`), docs, publish helper
- `runtime/sqlite/` + `install-sqlite-xampp.bat` + `scripts/install-sqlite-xampp.ps1` (unless `-SkipSqliteRuntime`) — enables `sqlite3`/`pdo_sqlite` in `php.ini` and upgrades `libsqlite3.dll`
- `bin/` ttyd + websockify (unless `-SkipRemoteRuntime`)
- `deploy-xampp.bat` / `update-xampp.bat` / `verify-install.bat` helpers
- **PHP upgrade tools:** `upgrade-xampp-php.bat`, `scripts/upgrade-xampp-php.ps1`, `scripts/upgrade-xampp-php-run-elevated.ps1`, `docs/XAMPP_PHP_UPGRADE.md`
- Optional load-test showcase under `load-tests/results/` when present
- `SOURCE_SPECS.json` / `BUILD_INFO.json` for target parity checks

**Not included by default:** live SQLite DB (use `-IncludeDatabase`), `node_modules`, `.git`

---

## On the target machine

1. Extract `linknest-deploy-*.zip`
2. **Fresh install:** run `deploy-xampp.bat`
3. **Upgrade existing:** run `update-xampp.bat` (keeps `data/`)
4. Approve UAC when asked to install the bundled SQLite DLL into XAMPP PHP
5. Optional: `verify-install.bat`
6. Open the app; Ctrl+F5 once if an old UI remains (service worker)
7. Admin → Maintenance Scripts → **System Specs Check** (compare to `SOURCE_SPECS.json`)
8. Admin → **App Updates**: configure GitHub PAT / branch as needed ([APP_UPDATES.md](APP_UPDATES.md))
9. Remote widgets: install **Python 3** + **OpenSSH Client**; see [REMOTE_WIDGETS_SETUP.md](REMOTE_WIDGETS_SETUP.md)
10. **Upgrade PHP (recommended 8.5+):** run `upgrade-xampp-php.bat` (elevated) — see [XAMPP_PHP_UPGRADE.md](XAMPP_PHP_UPGRADE.md)

**Target prerequisites:** Windows XAMPP (Apache + PHP with `php_sqlite3.dll` / `php_pdo_sqlite.dll` under `php\ext`), write access under `htdocs`. Deploy enables those extensions in `php.ini` automatically. For SSH/VNC Easy: Python 3 and OpenSSH Client.

**If deploy shows `Class SQLite3 not found`:** the target `php.ini` had SQLite disabled. Re-run `install-sqlite-xampp.bat` as Administrator from the ZIP (newer packages enable the extensions). Manual fix: uncomment `extension=sqlite3` and `extension=pdo_sqlite` in `%XAMPP%\php\php.ini`, restart Apache.

---

## Related docs

- [APP_UPDATES.md](APP_UPDATES.md) — in-app GitHub updates after install
- [XAMPP_PHP_UPGRADE.md](XAMPP_PHP_UPGRADE.md) — upgrade PHP runtime on XAMPP
- [DEPLOYMENT_INSTRUCTIONS.md](DEPLOYMENT_INSTRUCTIONS.md) — broader deployment notes
- [CREATE_BUNDLE.md](CREATE_BUNDLE.md) — alternate `scripts/bundle.bat` (Docker-oriented)
