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

**Default behavior (FULL package):**

- Wipes and rebuilds production `dist/`
- **FRESH** database mode (does **not** ship this PC’s live `data/linknest.db`)
- Includes `uploads/` (unless excluded)
- Bundles SQLite DLL runtime for target XAMPP
- Bundles `bin/` ttyd + websockify for SSH/VNC Easy
- Emits `linknest-deploy-YYYYMMDD_HHMMSS.zip` and an App Updates asset `linknest-update-vX.Y.Z.zip`
- Stamps `BUILD_INFO.json` / source specs for PWA cache busting and System Specs Check

**App-only lean package (`-AppOnly`):**

- Same app (`dist/`, `api/`, `vendor/`, `land/`) + `deploy-xampp.bat` / `update-xampp.bat` / `verify-install.bat`
- **Skips** SQLite DLL runtime, `bin/` ttyd/websockify, PHP-upgrade tools, remote-push helpers, load-test showcase, `SOURCE_SPECS` snapshot, and **does not** rewrite `php.ini` or restart Apache on the target
- ZIP name: `linknest-app-YYYYMMDD_HHMMSS.zip`
- Use when the target already has working XAMPP/PHP/SQLite and you only need to ship/update the application

---

## All options

Pass flags after the `.bat` name (they are forwarded to PowerShell), or call the `.ps1` directly.

| Option | Type | Default | Meaning |
|--------|------|---------|---------|
| *(none)* | — | — | Fresh **full** package: rebuild, no live DB, include uploads, SQLite runtime, remote `bin/` |
| `-AppOnly` | switch | off | Lean **application-only** ZIP (implies `-SkipSqliteRuntime` + `-SkipRemoteRuntime`; no PHP-upgrade / remote-push extras) |
| `-IncludeDatabase` | switch | off | Ship this PC’s `data/linknest.db` (and related DB files) to mirror production data |
| `-ExcludeUploads` | switch | off | Skip the `uploads/` directory |
| `-SkipBuild` | switch | off | Reuse existing `dist/` (not recommended when shipping code changes) |
| `-SkipSqliteRuntime` | switch | off | Do not bundle/download the SQLite DLL for XAMPP (not recommended for full packages) |
| `-SkipRemoteRuntime` | switch | off | Do not bundle `bin/` ttyd + websockify (SSH/VNC Easy need manual install on target) |
| `-BasePath "/name"` | string | `/linknest` | Vite base path baked into the frontend (subfolder deploy) |
| `-OutputDir "E:\"` | string | project root | Where to write the deploy ZIP |
| `-RemoteHost HOST` | string | *(empty)* | After ZIP, push to this Windows host via SMB + elevated schtasks |
| `-RemoteUser name` | string | `Administrator` | Remote Windows admin user |
| `-RemotePassword ***` | string | *(prompt)* | Optional; omit to be prompted securely |
| `-RemoteMode Fresh\|Update` | string | `Fresh` | Remote install mode when `-RemoteHost` is set |
| `-IncludeXamppRuntime` | switch | off | With `-RemoteHost`: also mirror local Apache+PHP to the remote |
| `-RemoteShare C$` | string | `C$` | Admin share used for the remote copy |
| `-SkipRemoteDeploy` | switch | off | Package only even if `-RemoteHost` is set |

**Air-gapped SSH/VNC binaries only** (ttyd, OpenSSH, websockify, VcXsrv; Python installed separately on target): run `scripts\package-remote-widgets-runtime.bat` on a networked PC, then on the target run `install-remote-widgets-runtime.bat` from the unzipped folder. See [REMOTE_WIDGETS_SETUP.md](REMOTE_WIDGETS_SETUP.md#offline--air-gapped-install-no-internet-on-target).

**HTTPS Mixed Content (ws:// blocked):** on the office XAMPP host run `scripts\enable-gateway-wss-proxy.bat` so SSH/VNC use `wss://host/_ln_sshgw/…` on port 443. See [REMOTE_WIDGETS_SETUP.md](REMOTE_WIDGETS_SETUP.md#https-mixed-content-office--wss-on-port-443).

### Examples

```bat
REM Recommended fresh install package for another PC
package-for-deployment.bat

REM Application-only ZIP (target XAMPP/PHP/SQLite already ready)
package-for-deployment.bat -AppOnly

REM App-only with live DB into a custom subfolder
package-for-deployment.bat -AppOnly -IncludeDatabase -BasePath "/link2"

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

REM Package AND push to a remote Windows Server / office PC
package-for-deployment.bat -RemoteHost 192.168.0.197 -RemoteUser administrator -RemoteMode Fresh

REM Mirror DB + Apache/PHP runtime onto an empty XAMPP host
package-for-deployment.bat -IncludeDatabase -RemoteHost 192.168.0.197 -IncludeXamppRuntime

REM Package only, then deploy later
package-for-deployment.bat
deploy-remote-xampp.bat -ComputerName 192.168.0.197 -ZipPath .\linknest-deploy-YYYYMMDD_HHMMSS.zip

REM PowerShell equivalent
powershell -NoProfile -ExecutionPolicy Bypass -File .\package-for-deployment.ps1 -IncludeDatabase -BasePath "/linknest"
```

---

## What the ZIP contains (typical)

### Full package (`linknest-deploy-*.zip`)

- Production frontend (`dist/`) and PHP API
- `vendor/` (e.g. SAML) when present
- Updater APIs (`api/updater*.php`), docs, publish helper
- `runtime/sqlite/` + `install-sqlite-xampp.bat` + `scripts/install-sqlite-xampp.ps1` (unless `-SkipSqliteRuntime`) — enables `sqlite3`/`pdo_sqlite` in `php.ini` and upgrades `libsqlite3.dll`
- `bin/` ttyd + websockify (unless `-SkipRemoteRuntime`)
- `deploy-xampp.bat` / `update-xampp.bat` / `verify-install.bat` helpers
- **PHP upgrade tools:** `upgrade-xampp-php.bat`, `scripts/upgrade-xampp-php.ps1`, `scripts/upgrade-xampp-php-run-elevated.ps1`, `docs/XAMPP_PHP_UPGRADE.md`
- **Remote Windows push:** `deploy-remote-xampp.bat`, `scripts/deploy-remote-xampp.ps1`, `scripts/harden-xampp-target.ps1`, `docs/OFFICE_WIN2022_DEPLOY.md`
- Optional load-test showcase under `load-tests/results/` when present
- `SOURCE_SPECS.json` / `BUILD_INFO.json` for target parity checks

### App-only package (`linknest-app-*.zip`, `-AppOnly`)

- Production frontend (`dist/`) and PHP API + `vendor/`
- `deploy-xampp.bat` / `update-xampp.bat` / `verify-install.bat` + `scripts/harden-xampp-target.ps1`
- Updater APIs and `docs/APP_UPDATES.md`
- **Not included:** SQLite DLL runtime, `bin/` ttyd/websockify, PHP-upgrade scripts, remote-push helpers, load-test showcase, `SOURCE_SPECS.json`

**Not included by default (either mode):** live SQLite DB (use `-IncludeDatabase`), `node_modules`, `.git`

---

## On the target machine

1. Extract `linknest-deploy-*.zip` (or `linknest-app-*.zip` for `-AppOnly`)
2. **Fresh install:** run `deploy-xampp.bat`
3. **Upgrade existing:** run `update-xampp.bat` (keeps `data/`)
4. **Full packages only:** approve UAC when asked to install the bundled SQLite DLL into XAMPP PHP
5. Deploy/update auto-runs `scripts/harden-xampp-target.ps1` (tmp sessions dir, ACLs, curl/sqlite, PHP 8.5 OPcache)
6. Optional: `verify-install.bat`
7. Open the app; Ctrl+F5 once if an old UI remains (service worker)
8. **Full packages:** Admin → Maintenance Scripts → **System Specs Check** (compare to `SOURCE_SPECS.json`)
9. Admin → **App Updates**: configure GitHub PAT / branch as needed ([APP_UPDATES.md](APP_UPDATES.md))
10. **Full packages:** remote widgets — install **Python 3** + **OpenSSH Client**; see [REMOTE_WIDGETS_SETUP.md](REMOTE_WIDGETS_SETUP.md)
11. **Full packages:** **Upgrade PHP (recommended 8.5+):** run `upgrade-xampp-php.bat` (elevated) — see [XAMPP_PHP_UPGRADE.md](XAMPP_PHP_UPGRADE.md)

### Push from the packager PC (no manual copy)

```bat
package-for-deployment.bat -RemoteHost 192.168.0.197 -RemoteUser administrator
```

Or after packaging:

```bat
deploy-remote-xampp.bat -ComputerName 192.168.0.197 -ZipPath .\linknest-deploy-YYYYMMDD_HHMMSS.zip -Mode Fresh
```

Requires SMB admin share access (`C$`) and permission to create scheduled tasks on the remote. Full notes: [OFFICE_WIN2022_DEPLOY.md](OFFICE_WIN2022_DEPLOY.md).

**Target prerequisites:** Windows XAMPP (Apache + PHP with `php_sqlite3.dll` / `php_pdo_sqlite.dll` under `php\ext`), write access under `htdocs`. Full packages enable those extensions in `php.ini` automatically. App-only packages expect SQLite already enabled on the target. For SSH/VNC Easy: Python 3 and OpenSSH Client (and a full package, or manually installed gateways).

**If deploy shows `Class SQLite3 not found`:** the target `php.ini` had SQLite disabled. Re-run `install-sqlite-xampp.bat` as Administrator from a **full** ZIP (newer packages enable the extensions). Manual fix: uncomment `extension=sqlite3` and `extension=pdo_sqlite` in `%XAMPP%\php\php.ini`, restart Apache.

---

## Related docs

- [APP_UPDATES.md](APP_UPDATES.md) — in-app GitHub updates after install
- [XAMPP_PHP_UPGRADE.md](XAMPP_PHP_UPGRADE.md) — upgrade PHP runtime on XAMPP
- [OFFICE_WIN2022_DEPLOY.md](OFFICE_WIN2022_DEPLOY.md) — Win2022 / office remote deploy playbook
- [DEPLOYMENT_INSTRUCTIONS.md](DEPLOYMENT_INSTRUCTIONS.md) — broader deployment notes
- [CREATE_BUNDLE.md](CREATE_BUNDLE.md) — alternate `scripts/bundle.bat` (Docker-oriented)
