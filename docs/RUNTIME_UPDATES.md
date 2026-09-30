# Runtime (PHP / Node) updates — underlying software

Also in-app: **Help → Underlying software updates (PHP / Node.js / Apache / SQLite)** and **Guides → Runtime (PHP / Node) updates**.

**Admin → Tools → System Runtime** shows what this host is running (PHP, Node.js, npm, Apache, SQLite, git), the patches published by the vendors, and the **exact commands** to apply them.

> **This panel is READ-ONLY.** It never installs, replaces, upgrades or restarts anything. You copy a
> command and run it yourself. That is deliberate: runtime swaps touch the web server, need Administrator
> rights, and must never be triggered by a web request.

Not to be confused with [APP_UPDATES.md](APP_UPDATES.md) — that updates the **LinkNest application**
(PHP/API + `dist/`). This guide is about the **platform underneath it**.

---

## 1. What the panel shows

| Row | Source |
|-----|--------|
| **PHP** | `PHP_VERSION`, ZTS/NTS, architecture, SAPI, loaded + missing extensions, `php.ini` path |
| **Node.js** | `node -v` (read-only probe), architecture, install path |
| **npm** | `node_modules/npm/package.json` next to Node (no process needed) |
| **Apache** | located by path + PE header; version via a read-only `httpd -v` |
| **SQLite** | `sqlite_version()`, journal mode, `PRAGMA user_version`, DB size, Windows `libsqlite3.dll` + bitness |
| **git** | `git --version` (used by App Updates) |

Available patches come from the official indexes, cached for 6 hours in `data/runtime-cache.json`:

| Vendor | Index | Notes |
|--------|-------|-------|
| PHP (Windows) | `downloads.php.net/~windows/releases/releases.json` | Thread-Safe x64 rows only — the same list the upgrader scripts use. Gives version, date, zip name, size **and SHA256** |
| PHP (Linux/macOS) | `www.php.net/releases/index.php?json` | Tolerant lookup for the current major |
| Node.js | `nodejs.org/dist/index.json` | Uses the vendor **`security`** flag and the `lts` codename |
| PHP security hint | `www.php.net/feed.atom` | Marks a patch as a security release and shows the vendor sentence ("This is a security release…") |

The panel only makes **GET** requests to `downloads.php.net`, `www.php.net`, `php.net` and `nodejs.org`.

### Security badges

* **Node.js** — a patch is flagged **Security** when a vendor-declared security release exists **newer than
  what you run** on that major line (not just when the newest patch itself is flagged). The panel lists the
  missed versions, e.g. `22.23.2, 22.23.0, 22.22.2, 22.22.0`.
* **PHP** — flagged **Security** when the php.net news feed calls the target patch a security release.

## 2. Downtime: what to expect

| Component | Restart needed? | Realistic outage | Why |
|-----------|-----------------|------------------|-----|
| **Node.js / npm** | No | **0 seconds** | Node is not in the request path: the browser loads the prebuilt `dist/` bundle and PHP serves the API. Upgrading Node only affects future builds and the MCP stdio adapter |
| **PHP (patch, e.g. 8.5.9 → 8.5.11)** | Yes on Windows | **5–20 seconds** | Apache keeps `php8apache2_4.dll` loaded, so the PHP folder cannot be swapped while Apache runs |
| **PHP on Linux** | No (reload) | **0 seconds** | `systemctl reload php-fpm` / `apache2` drains workers gracefully |
| **Apache** | Yes on Windows | 5–20 seconds | binaries are in use; `systemctl reload apache2` is graceful on Linux |
| **SQLite / libsqlite3.dll** | Yes on Windows | 5–20 seconds | the DLL is loaded by PHP |
| **Docker** | Image rebuild | container restart | PHP and Node come from the image |

**TIP — make the window as small as possible on Windows:** do the download, SHA256 check, extraction and
`php.ini` merge **before** you stop Apache. `upgrade-xampp-php.ps1` already works that way: it stages,
verifies and gates (LDAP + extension check) first, and only then stops Apache, swaps the folder and starts
it again. Schedule that restart for a quiet moment.

**True zero-downtime PHP (optional, advanced):** run PHP as **FastCGI** (`php-cgi.exe` + `mod_proxy_fcgi`)
with two version pools — start the new pool, switch the proxy, drain the old pool. That needs a one-time
`httpd.conf` change and is out of scope for the in-app panel; it is listed here as a future option.

---

## 3. PHP — commands by layout

The panel generates these with your real paths filled in. Copy from the panel, or from here.

### 3a. Windows XAMPP (`C:\xampp`)

The upgrader swaps **only** `C:\xampp\php`, keeps your `php.ini`, verifies SHA256 and hard-gates LDAP +
Thread-Safe x64 + required extensions **before** touching the live folder.

```powershell
# Elevated PowerShell (approve the UAC prompt)
cd C:\xampp\htdocs\linknest

# Pin an exact patch (recommended)
.\scripts\upgrade-xampp-php-run-elevated.ps1 -Version 8.5 -Patch 8.5.11 -RestartApache

# Or: newest published patch for this minor
.\scripts\upgrade-xampp-php.ps1 -Version 8.5 -RestartApache

# Or: newest published Thread-Safe x64 minor
.\scripts\upgrade-xampp-php.ps1 -RestartApache

# Dry run — prints the exact URL + SHA256, changes nothing
.\scripts\upgrade-xampp-php.ps1 -Version 8.5 -Patch 8.5.11 -WhatIf

# Air-gapped host — reuse a zip you already copied
.\scripts\upgrade-xampp-php.ps1 -Version 8.5 -ZipPath D:\installers\php-8.5.11-Win32-vs17-x64.zip -RestartApache
```

Manual equivalent (no script), **after** stopping Apache:

```powershell
$url = "https://downloads.php.net/~windows/releases/php-8.5.11-Win32-vs17-x64.zip"   # the panel shows the current value
$zip = Join-Path $env:TEMP (Split-Path $url -Leaf)
Invoke-WebRequest $url -OutFile $zip
(Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()      # must equal the SHA256 the panel shows
# then: rename C:\xampp\php -> C:\xampp\php-backup-<timestamp>, expand the zip into C:\xampp\php,
# copy your saved php.ini back, and start Apache
```

Verify:

```powershell
& "C:\xampp\php\php.exe" -v
& "C:\xampp\php\php.exe" -r "foreach (['ldap','pdo_sqlite','sqlite3','curl','mbstring','openssl','zip'] as $e) { '{0}={1}' -f $e, (extension_loaded($e) ? 'YES' : 'NO') }"
```

Then open `http://<host>/linknest/health.php?format=json` and confirm `php_version`.

Rollback:

```powershell
# Elevated PowerShell
Stop-Service Apache2.4
Rename-Item "C:\xampp\php" "C:\xampp\php-failed-$(Get-Date -Format yyyyMMdd-HHmmss)"
Rename-Item "C:\xampp\php-backup-YYYYMMDD-HHMMSS" "C:\xampp\php"   # the name the upgrader printed
Start-Service Apache2.4
& "C:\xampp\php\php.exe" -v
```

Detail: [XAMPP_PHP_UPGRADE.md](XAMPP_PHP_UPGRADE.md).

### 3b. Stock Apache + PHP (`D:\Apache` + `D:\php`)

```bat
upgrade-vanilla-apache-php.bat
```

```powershell
.\scripts\upgrade-vanilla-apache-php.ps1 -Version 8.5 -Patch 8.5.11   # pin an exact patch
.\scripts\upgrade-vanilla-apache-php.ps1 -SkipApache                  # PHP only
.\scripts\upgrade-vanilla-apache-php.ps1 -LatestMinor                 # newest published minor
.\scripts\upgrade-vanilla-apache-php.ps1 -WhatIf                      # dry run
```

Keeps `php.ini`, `httpd.conf`, `htdocs` and `logs`; backs up to `php-backup-*` and `Apache-bin-backup-*`.
Detail: [VANILLA_APACHE_PHP_UPGRADE.md](VANILLA_APACHE_PHP_UPGRADE.md).

### 3c. Linux / macOS

```bash
# Debian / Ubuntu
sudo apt-get update
sudo apt-get install --only-upgrade php8.5-cli php8.5-fpm
sudo systemctl reload php8.5-fpm      # graceful — no downtime

# RHEL / Rocky / Alma
sudo dnf upgrade php && sudo systemctl reload php-fpm

# macOS
brew upgrade php
```

### 3d. Docker

PHP lives in the image, so it is patched at **build** time. Run this on the Docker host, never inside the
container:

```bash
cd docker
docker compose build --pull
docker compose up -d
docker compose exec web php -v
```

### 3e. Development mode (`npm run dev`)

The PHP built-in server is started by `npm run dev`. Stop it (Ctrl+C), patch PHP with your usual installer,
then start `npm run dev` again.

---

## 4. Node.js — commands (no downtime)

Node is only needed to build `dist/` and to run the MCP stdio adapter, so any of these is safe during
business hours.

**Windows (elevated):**

```powershell
winget upgrade OpenJS.NodeJS.LTS
# or pin an exact release:
winget install --id OpenJS.NodeJS.LTS --version 22.23.3 --accept-source-agreements
```

**Windows, silent MSI:**

```powershell
$v = "22.23.3"
$msi = Join-Path $env:TEMP "node-$v-x64.msi"
Invoke-WebRequest "https://nodejs.org/dist/v$v/node-v$v-x64.msi" -OutFile $msi
Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn" -Wait -Verb RunAs
```

**Windows, no admin rights (build-only toolchain, session PATH):**

```powershell
$v = "22.23.3"
$tmp = Join-Path $env:TEMP "node-$v"
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
Invoke-WebRequest "https://nodejs.org/dist/v$v/node-v$v-win-x64.zip" -OutFile "$tmp\node.zip"
Invoke-WebRequest "https://nodejs.org/dist/v$v/SHASUMS256.txt" -OutFile "$tmp\SHASUMS256.txt"
$want = (Select-String -Path "$tmp\SHASUMS256.txt" -Pattern "node-v$v-win-x64.zip").Line.Split(" ")[0]
$got  = (Get-FileHash "$tmp\node.zip" -Algorithm SHA256).Hash.ToLower()
if ($want -ne $got) { throw "SHA256 mismatch" }
Expand-Archive "$tmp\node.zip" -DestinationPath "$tmp\x" -Force
$env:Path = "$tmp\x\node-v$v-win-x64;" + $env:Path
node -v; npm -v
```

**Linux / macOS:**

```bash
nvm install 22.23.3 && nvm use 22.23.3                 # per-user, no service restart
# or machine-wide:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
```

After any Node upgrade:

```bash
node -v
npm -v
npm ci && npm run build     # optional: refresh dist/ with the new toolchain
```

## 5. Apache and SQLite

```powershell
# Apache only (stock Apache + PHP layout)
.\scripts\upgrade-vanilla-apache-php.ps1 -SkipPhp
# Config test before and after
& "C:\xampp\apache\bin\httpd.exe" -t
```

```bash
# Linux — graceful
sudo apt-get install --only-upgrade apache2 && sudo apachectl configtest && sudo systemctl reload apache2
```

```powershell
# SQLite (Windows) — stop Apache first, the DLL is locked while loaded
.\scripts\install-sqlite-xampp.ps1
php -r "echo SQLite3::version()['versionString'], PHP_EOL;"
```

XAMPP has no standalone Apache patcher: either install a newer XAMPP over the existing folder (keeping
`htdocs` and `conf`) or swap in a current Apache Lounge Win64 build while preserving `conf/htdocs/logs`.

---

## 6. Command-line report

Useful on a server without a browser session, or to attach to a ticket:

```bash
php api/runtime_check.php                # human-readable
php api/runtime_check.php --json         # full payload (same as GET /api/runtime/status)
php api/runtime_check.php --markdown > runtime-report.md
php api/runtime_check.php --force        # bypass the 6-hour vendor cache
```

Admin UI alternative: **Download report** in the panel (`GET /api/runtime/report?format=md|json`).
The endpoints are admin-only; the CLI variant must be run on the server.

### Endpoints (admin only, read-only)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/runtime/status` | current versions, available patches, commands, downtime notes |
| `POST` | `/api/runtime/check` | same payload, ignoring the vendor cache |
| `GET` | `/api/runtime/instructions?component=php\|node\|npm\|apache\|sqlite` | one component's commands |
| `GET` | `/api/runtime/report?format=md\|json` | downloadable diagnostics |

There is **no apply/install/restart endpoint** — by design.

---

## 7. How the notes stay current

* This file ships with the application and is served through `GET /api/docs/file?name=RUNTIME_UPDATES.md`,
  so **Help → Guides** always shows the notes that match the installed build.
* Procedure changes go in the **Procedure changelog** below — update it in the same commit as any change to
  the scripts, the panel or the endpoints (`api/runtime.php`, `api/runtime_lib.php`, `api/runtime_check.php`).
* App Updates (Admin → App Updates) refreshes `docs/`, `api/` and the panel together, so a workflow change
  reaches every instance with the next app update — no separate runtime-notes distribution.

### Procedure changelog

| Date | Change |
|------|--------|
| 2026-09-30 | First release of the read-only System Runtime panel (`/api/runtime/status|check|instructions|report`, `php api/runtime_check.php`), per-layout command generator (XAMPP / stock Apache + PHP / Docker / Linux / dev server), PHP security hint from the php.net news feed, Node security detection across a major line, downtime reference table. Read-only by design — no in-app upgrade path. |

## 8. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Check for patches` reports an index error | The host cannot reach the vendor HTTPS endpoint. Commands are still generated from the local install; check `curl` and the outbound firewall/proxy |
| Versions show as unknown | `proc_open` is disabled in `php.ini` (`disable_functions`). File-based detection still works (PHP, npm, Apache path); enable `proc_open` for full probing |
| Node version missing | Node is not on `PATH` and not in a standard location. Install Node or add it to `PATH` — the app itself does not need Node to run |
| PHP reported as NTS | You are running a Non-Thread-Safe build with Apache. Install the **Thread Safe x64** zip from `downloads.php.net` — NTS cannot load `php8apache2_4.dll` |
| LDAP gate failed during a PHP upgrade | You took an NTS zip, or `libsasl.dll` is missing next to `php.exe`. Re-run with the official TS x64 zip |
| `curl` fails under Apache but works in CLI | Apache's older DLLs shadow PHP 8.5+ dependencies. Re-run the upgrader (it syncs the DLLs) or `scripts\fix-apache-php-curl-run-elevated.ps1` |
| Cannot stop Apache2.4 / access denied | Run elevated, or use the `*-run-elevated.ps1` launcher and approve UAC |
| Upgrade looked fine but the app errors | Open `health.php?format=json` first, then roll back with the `php-backup-*` folder (§3a) |
| Security badge on Node but the patch "looks old" | The badge reflects any missed security release on your major line, not only the newest patch — upgrade to the version the panel shows |
| Panel says up to date but a vendor page shows newer | The index is cached for 6 h — press **Check for patches** (or run `php api/runtime_check.php --force`) |

---

## 9. Deliberately out of scope (today)

The panel is **advisory only**. Not implemented, by design:

* in-app execution of any runtime upgrade (no `POST /apply`, no background worker);
* automatic maintenance mode / automatic restart around a PHP swap;
* Apache and SQLite in-app execution (commands only);
* no DB schema change and no new settings keys are required by this feature.

If an opt-in in-app path is added later it should be **additive**: the panel already knows the asset URL,
SHA256, downtime window and rollback command, so `POST /api/runtime/apply` plus a detached worker can be
layered on without changing anything documented here.

---

## Related

* [APP_UPDATES.md](APP_UPDATES.md) — updating the LinkNest application itself (commits/Releases, DB backup, rollback)
* [XAMPP_PHP_UPGRADE.md](XAMPP_PHP_UPGRADE.md) — XAMPP PHP upgrader in depth
* [VANILLA_APACHE_PHP_UPGRADE.md](VANILLA_APACHE_PHP_UPGRADE.md) — stock Apache + PHP in-place patch
* [WINDOWS_BOOTSTRAP_BUNDLES.md](WINDOWS_BOOTSTRAP_BUNDLES.md) — rebuild the Apache + PHP runtime ZIP
* [SETUP.md](SETUP.md) · [PRODUCTION.md](PRODUCTION.md) — environment prerequisites
* `health.php` — extensions, OPcache, SQLite, writable folders (`?format=json`)




