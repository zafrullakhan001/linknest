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
| **Apache / web server** | Apache, nginx, Caddy and OpenLiteSpeed are all detected (path, `processRunning`, config file, version via a read-only `-v` probe) — see §1a |
| **PHP-FPM** *(when installed)* | `php-fpm -v`, unit name (`php8.5-fpm`), pool ini and the FPM socket |
| **Host / distro** | `/etc/os-release` (or macOS/Windows) → distro name, family, package manager, service manager |
| **Container** *(inside Docker)* | `/.dockerenv` + `/proc/self/cgroup` → runtime, container id, compose service/container, ports, whether host volumes are mounted, and the base images read from `docker/Dockerfile` |
| **SQLite** | `sqlite_version()`, journal mode, `PRAGMA user_version`, DB size, Windows `libsqlite3.dll` + bitness |
| **git** | `git --version` (used by App Updates) |

Available patches come from the official indexes, cached for 6 hours in `data/runtime-cache.json`:

| Vendor | Index | Notes |
|--------|-------|-------|
| PHP (Windows) | `downloads.php.net/~windows/releases/releases.json` | Thread-Safe x64 rows only — the same list the upgrader scripts use. Gives version, date, zip name, size **and SHA256** |
| PHP (Linux/macOS) | `www.php.net/releases/active.php` **+** `www.php.net/releases/index.php?json&version=<major>&max=60` | Latest patch of every supported branch (with the vendor `tags: ["security"]` flag), the patch history of the running major, the supported-line list and the `.tar.xz` name + **SHA256**. See the note below |
| Node.js | `nodejs.org/dist/index.json` | Uses the vendor **`security`** flag and the `lts` codename |
| PHP security hint | `www.php.net/feed.atom` | Fallback when the release index has no `security` tag: shows the vendor sentence ("This is a security release…") |

> **Why two php.net endpoints?** `releases/index.php?json&version=8` **without `&max`** returns a *single*
> object (`{"version":"8.5.11","tags":["security"],"source":[…]}`) and no per-patch keys at all, which is why
> a Linux host used to report *"No PHP versions parsed from php.net"*. The panel now reads `active.php`
> (supported branches + their latest release) **and** `index.php?json&version=N&max=60` (patch history), and
> normalises every shape it can receive.

The panel only makes **GET** requests to `downloads.php.net`, `www.php.net`, `php.net` and `nodejs.org`.

### 1a. Host detection (Linux / macOS / Docker)

Nothing here needs `which`, `systemctl` or `docker` to be installed — it is files and read-only probes:

| What | How |
|------|-----|
| Distribution | `/etc/os-release` (or `/usr/lib/os-release`) → `debian` \| `rhel` \| `suse` \| `alpine` \| `arch` \| `darwin` \| `windows` \| `unknown` |
| Package manager | Probes `apt-get`/`apt`, `dnf`/`yum`/`microdnf`, `zypper`, `apk`, `pacman`, `brew` **on disk**, then falls back to the distro family |
| Executables | Walks `PATH` + the usual bin dirs (`/usr/sbin`, `/usr/local/bin`, `/opt/homebrew/bin`, …). `where`/`which` is only a *fallback*, so slim containers work |
| Running processes | Reads `/proc/*/comm` (Linux only) to see whether nginx / Apache / php-fpm / Caddy are actually up |
| Web server | Reports **every** server it finds and flags `ambiguous` when more than one is installed; the *primary* is the one that matches the PHP SAPI (`apache2handler` → Apache, otherwise nginx wins as the usual FPM front end) |
| PHP-FPM | `/usr/sbin/php-fpm<X.Y>`, `/etc/php/<X.Y>/fpm/php.ini`, `/run/php/php<X.Y>-fpm.sock` → unit name + socket for the reload commands |
| Container | `/.dockerenv`, `/proc/self/cgroup` (`docker`/`containerd`/`kubepods`), `/run/.containerenv` (podman), plus `COMPOSE_PROJECT_NAME` |

Elevation wording follows the host: **Administrator shell** on Windows, **root or sudo** on Linux,
**sudo (or run as root)** on macOS, and **run it on the Docker host** inside a container.

### 1b. Status values

| Status | Meaning |
|--------|---------|
| `up-to-date` | The installed version equals the newest published patch on its line/branch |
| `patch-available` | A newer patch exists on the same line |
| `security-patch-available` | A newer patch exists **and** the vendor tagged it `security` (PHP) or declared one newer security release on that major (Node) |
| `minor-available` | A newer PHP minor line is published |
| `lts-upgrade-available` | Node: a newer LTS line exists |
| `unsupported-line` | The installed PHP branch is **not** in php.net's supported list (e.g. 8.1) |
| `could-not-check` | The vendor index could not be read — the summary says so instead of "up to date" |
| `not-installed` | Node.js is not present on this host (the app does not need it) |

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
| **PHP on Linux** | No (reload) | **0 seconds** | `systemctl reload php8.5-fpm` / `reload nginx` / `reload apache2` drains workers gracefully. Alpine: `rc-service <unit> reload` |
| **Apache** | Yes on Windows | 5–20 seconds | binaries are in use; `systemctl reload apache2` (RHEL: `httpd`) is graceful on Linux |
| **nginx** | No | **0 seconds** | `nginx -t` then `systemctl reload nginx` is graceful |
| **SQLite** | Yes on Windows | 5–20 seconds | the DLL is loaded by PHP. On Linux you only reload FPM/the web server (and should back the DB up first) |
| **Docker / Podman** | Image rebuild | container restart | PHP, Node and Apache come from the image; the compose file mounts **no** volumes, so back the database up first (§5b) |

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

### 3c. Linux VPS (nginx, Apache or both) — packages from the detected distro

The panel detects the distribution, its package manager **and** which web server(s) are installed, then
generates exactly those commands. Example for Ubuntu 22.04 running PHP 8.5.4 with nginx in front of PHP-FPM:

```bash
# 1) patch PHP (package names come from the detected line, e.g. 8.5)
sudo apt-get update
sudo apt-get install --only-upgrade php8.5-fpm php8.5-cli php8.5-common php8.5-sqlite3

# 2) reload everything you changed (only the units that exist on this host)
sudo systemctl reload php8.5-fpm
sudo systemctl reload nginx          # Apache instead: sudo systemctl reload apache2 (RHEL: httpd)

# 3) verify
php -v
php -r "echo SQLite3::version()['versionString'], PHP_EOL;"
curl -s https://<host>/health.php?format=json | head -40
```

Other families:

```bash
# RHEL / Rocky / Alma / Fedora (Apache unit is httpd)
sudo dnf upgrade php-cli php-fpm php-pdo
sudo dnf module list php            # check the stream before a minor jump
sudo systemctl reload php-fpm && sudo systemctl reload httpd

# Alpine (openrc, no systemd)
sudo apk update && sudo apk upgrade php85 php85-fpm php85-pdo_sqlite php85-sqlite3
sudo rc-service php-fpm85 reload && sudo rc-service nginx reload

# openSUSE / SLES
sudo zypper update php8-fpm php8-cli && sudo systemctl reload php-fpm

# Arch
sudo pacman -Syu php php-fpm php-sqlite && sudo systemctl reload php-fpm

# macOS (Homebrew)
brew upgrade php && brew services restart php
```

**nginx + Apache on the same box** (nginx serves static files / TLS, Apache or FPM handles PHP): patch PHP,
reload **FPM first**, then the server that proxies to it — the panel emits both reload lines and says which
one fronts the app. If the site returns 502/503, `sudo systemctl status <unit> --no-pager` is the first check.

**No web server detected** (php-fpm behind a load balancer, a managed platform, or served by another
container): the panel says so instead of showing Apache, and only asks you to patch PHP and reload its unit.

Rollback on Linux: packages keep the previous version in the package cache
(`apt-get install php8.5-fpm=8.5.4-1+deb12u1`, `dnf downgrade php-cli`, `apk add php85=8.5.4-r0`), or
`cp` your saved `php.ini`/binary back from the backup you took first.

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

## 5. Apache, nginx and SQLite

The panel titles this section after the web server it actually found, and generates the matching commands.

```powershell
# Apache only (stock Apache + PHP layout, Windows)
.\scripts\upgrade-vanilla-apache-php.ps1 -SkipPhp
# Config test before and after
& "C:\xampp\apache\bin\httpd.exe" -t
```

```bash
# Linux, Debian/Ubuntu
sudo apt-get install --only-upgrade apache2 && sudo apachectl configtest && sudo systemctl reload apache2

# Linux, RHEL/Rocky/Alma (unit + package are "httpd")
sudo dnf upgrade httpd && sudo httpd -t 2>/dev/null; sudo systemctl reload httpd

# nginx (any distro)
sudo apt-get install --only-upgrade nginx && sudo nginx -t && sudo systemctl reload nginx

# Alpine
sudo apk upgrade nginx && sudo rc-service nginx reload
```

```powershell
# SQLite (Windows) — stop Apache first, the DLL is locked while loaded
.\scripts\install-sqlite-xampp.ps1
php -r "echo SQLite3::version()['versionString'], PHP_EOL;"
```

```bash
# SQLite (Linux) — back up, upgrade the library, reload
cp data/linknest.db /tmp/linknest-backup-$(date +%F).db
sudo apt-get install --only-upgrade libsqlite3-0 sqlite3   # or: sudo dnf upgrade sqlite
sudo systemctl reload php8.5-fpm
```

> **SQLite 3.53+ is a Windows parity target, not a Linux minimum.** `health.php` compares the *runtime*
> SQLite against 3.53 because that is the DLL version LinkNest ships for XAMPP. Debian 12 ships 3.40 and
> Ubuntu 24.04 ships ~3.45 — those are perfectly usable (the app only loses the newest query-planner/mmap
> gains). Only the Windows `libsqlite3.dll` is expected to be 3.54.0.

XAMPP has no standalone Apache patcher: either install a newer XAMPP over the existing folder (keeping
`htdocs` and `conf`) or swap in a current Apache Lounge Win64 build while preserving `conf/htdocs/logs`.

### 5b. Docker / Podman runbook (backup first!)

`docker/docker-compose.yml` declares **no host volume mounts** — `data/` and `uploads/` live inside the
container, and `docker/Dockerfile` copies the build context's `data/` and `uploads/` into the image. A
rebuild therefore replaces that container, so **always copy the database out first**:

```bash
# 1) BACK UP (the database is inside the container)
docker cp linknest:/var/www/html/data/linknest.db ./linknest-db-backup.sqlite
docker cp linknest:/var/www/html/uploads ./linknest-uploads-backup
#    or, using the repo helper:
cd docker && ./docker-sync-database.sh out          # container -> host copy

# 2) REBUILD the image and recreate the container
docker compose -f docker/docker-compose.yml build --pull
docker compose -f docker/docker-compose.yml up -d
#    or one-shot: cd docker && ./docker-deploy.sh

# 3) RESTORE your data into the new container
docker cp ./linknest-db-backup.sqlite linknest:/var/www/html/data/linknest.db
docker compose -f docker/docker-compose.yml restart linknest
#    or: cd docker && ./docker-sync-database.sh in --db-only   (host -> container)

# 4) VERIFY
docker compose -f docker/docker-compose.yml exec linknest php -v
docker compose -f docker/docker-compose.yml exec linknest /usr/local/bin/verify-php.sh
curl -s http://localhost:8090/health.php?format=json
```

To change the PHP version itself, bump the base image in `docker/Dockerfile` (the panel reads the current
value for you) and repeat steps 1–4:

```dockerfile
FROM php:8.4-apache      # -> FROM php:8.5-apache for a minor upgrade (patch tags stay on the same line)
FROM node:20-bookworm-slim   # -> newer Node for the build stage (no runtime impact)
```

Ports are `8090` (HTTP) and `8443` (HTTPS); the compose service/container are both `linknest`. Inside the
container PHP is `mod_php` under Apache, so there is no PHP-FPM unit to reload.

---

## 6. Command-line report

Useful on a server without a browser session, or to attach to a ticket:

```bash
php api/runtime_check.php                # human-readable
php api/runtime_check.php --json         # full payload (same as GET /api/runtime/status)
php api/runtime_check.php --markdown > runtime-report.md
php api/runtime_check.php --force        # bypass the 6-hour vendor cache
php api/runtime_check.php --list-simulations
```

Admin UI alternative: **Download report** in the panel (`GET /api/runtime/report?format=md|json`).
The endpoints are admin-only; the CLI variant must be run on the server.

### 6a. Simulating another platform (QA / support)

On a Windows dev box you can render the **Linux / Docker / nginx** guidance without touching anything.
It is advisory-only: it changes what the panel *reports* and which commands are generated, and the payload
(and the panel) flags it as simulated.

```bash
# presets
php api/runtime_check.php --simulate=linux-nginx
php api/runtime_check.php --simulate=linux-debian          # nginx + Apache together
php api/runtime_check.php --simulate=linux-rhel
php api/runtime_check.php --simulate=linux-alpine
php api/runtime_check.php --simulate=linux-suse
php api/runtime_check.php --simulate=linux-none            # no web server detected
php api/runtime_check.php --simulate=macos
php api/runtime_check.php --simulate=docker
php api/runtime_check.php --simulate=windows-xampp
php api/runtime_check.php --simulate=linux-debian --web-server=none
# or a raw profile
php api/runtime_check.php --simulate='{"platform":"linux-debian","webServer":"nginx","phpVersion":"8.5.4"}'
```

The same profile can be set for the web panel through the environment, then removed again:

```bash
# Apache / php-fpm service environment (example: systemd drop-in)
sudo systemctl edit php8.5-fpm     # Environment=LINKNEST_RUNTIME_SIMULATE=linux-nginx
```

`platform.simulation.active` in the JSON payload (and the purple banner in the panel) tells you a
simulation is on. Unset the variable to see the real host again.

### Endpoints (admin only, read-only)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/runtime/status` | current versions, available patches, commands, downtime notes, `platform` block |
| `POST` | `/api/runtime/check` | same payload, ignoring the vendor cache |
| `GET` | `/api/runtime/instructions?component=php\|node\|npm\|apache\|sqlite` | one component's commands (includes the platform block) |
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
| 2026-09-30 | **Linux VPS + Docker parity.** Fixed the Linux PHP catalogue (php.net returns a *single* object without `&max`, which is why Linux reported "No PHP versions parsed"; the panel now reads `releases/active.php` + `index.php?json&version=N&max=60` and normalises all three shapes, including vendor `tags:["security"]`, `.tar.xz` SHA256 and the supported-branch list). Added `platform` detection: `/etc/os-release` distro + real package manager (`apt-get`/`dnf`/`zypper`/`apk`/`pacman`/`brew`), web-server detection (Apache **and** nginx/Caddy/OpenLiteSpeed, reporting *all* of them and flagging ambiguity), PHP-FPM unit/socket targets, container metadata (runtime, compose service/container, ports, no-volume warning, base images read from `docker/Dockerfile`), platform-aware elevation wording (Administrator / root|sudo / Docker host) and PATH-based executable lookup so slim containers without `which` still work. New statuses `security-patch-available`, `unsupported-line` and `could-not-check`; the summary is now per-component and never reports "up to date" for a component that could not be checked. Docker runbook is backup-first (compose mounts no volumes) and includes the base-image bump. New simulation profiles (`--simulate=linux-nginx`, `--simulate=docker`, …) for QA from Windows. |

## 8. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Check for patches` reports an index error | The host cannot reach the vendor HTTPS endpoint. Commands are still generated from the local install; check `curl` and the outbound firewall/proxy |
| Linux showed *"No PHP versions parsed from php.net"* | Fixed: the panel now reads `releases/active.php` + `index.php?json&version=N&max=60`. If you still see it, the host cannot reach `www.php.net` — press **Check for patches** again and read the index warning |
| "Could not check" instead of "Up to date" | Honest state: the vendor index could not be read for that component. Fix the outbound connection, then re-check — the panel deliberately never claims a version is current when it could not verify it |
| **Web server** row says "none detected" but the site works | PHP is served by something else (`php-fpm` behind a proxy, a managed platform, or another container). The panel says so rather than pretending Apache exists; patch PHP and reload its unit |
| The box runs **nginx**, not Apache | Expected on many VPS images: the panel lists nginx (and Apache too if installed), marks which one fronts the app, and titles the section *"Web server patch (nginx)"*. Reload nginx after the PHP patch |
| Web server row says two servers are installed | Both command sets are generated; check `sudo ss -ltnp \| grep -E ":80\|:443"` to see which is actually listening. Only the enabled one needs reloading |
| Docker guidance says "back up first" | `docker/docker-compose.yml` mounts no host volumes, so `data/` lives inside the container and a rebuild recreates it. Always `docker cp linknest:/var/www/html/data/linknest.db ./linknest-db-backup.sqlite` before `build`/`up -d`, then copy it back (or `docker-sync-database.sh in --db-only`) |
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




