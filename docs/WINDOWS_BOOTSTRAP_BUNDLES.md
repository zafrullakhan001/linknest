# Windows bootstrap bundles (Apache + PHP + LinkNest)

Also in-app: **Help & About → Guides → Windows Bootstrap Bundles**.

Two ZIPs for a **new Windows host** that is not yet running LinkNest:

| ZIP | What it is | GitHub asset name |
|-----|------------|-------------------|
| Apache Lounge + PHP 8.5 Thread Safe, already configured for `D:\Apache` + `D:\php` | Runtime only (no app) | `linknest-apache-php85-runtime.zip` |
| Full LinkNest application (UI, API, SQLite DLL, SSH/VNC `bin/`) | App deploy package | `linknest-deploy.zip` |

They live on a **dedicated GitHub Release** whose tag is `apache-php85-runtime`. That tag is **not** a versioned App Update (`v2.3.8`). Admin → App Updates ignores it.

**Release page:** `https://github.com/<owner>/<repo>/releases/tag/apache-php85-runtime`

Stable download URLs (repo `zafrullakhan001/linknest`):

- https://github.com/zafrullakhan001/linknest/releases/download/apache-php85-runtime/linknest-apache-php85-runtime.zip
- https://github.com/zafrullakhan001/linknest/releases/download/apache-php85-runtime/linknest-deploy.zip

The repository is **private**. Sign in to GitHub on the remote PC (or use a PAT) before downloading.

This is **not** the XAMPP-only path. For an office XAMPP host that already has Apache/PHP, use [PACKAGE_FOR_DEPLOYMENT.md](PACKAGE_FOR_DEPLOYMENT.md) and skip the runtime ZIP. For in-app updates after install, use [APP_UPDATES.md](APP_UPDATES.md) (`publish-base-release.bat`).

---

## What each ZIP contains

### 1) Apache + PHP 8.5 runtime

Built by [`scripts/package-vanilla-apache-php85.ps1`](../scripts/package-vanilla-apache-php85.ps1).

- Latest PHP **8.5 Thread Safe x64** from windows.php.net (SHA256 verified)
- Apache Lounge **httpd Win64 VS17** (matches PHP’s VS17 ABI)
- Official **SQLite 3.54.0** `libsqlite3.dll` in `D:\php` (and `Apache\bin`) so `health.php` SQLite checks pass without a manual DLL swap
- `php.ini` from `php.ini-production` with SQLite, curl, LDAP, OpenSSL, zip, mbstring, OPcache, CA bundle, sessions under `D:\Apache\tmp`
- `httpd.conf` with `AllowOverride All`, `mod_rewrite`, PHP module (`php8apache2_4.dll`), DocumentRoot `D:\Apache\htdocs`
- PHP dependency DLLs copied into `Apache\bin`
- `install-runtime.bat` (installs the Apache service as `Apache24-LinkNest` so it does not clash with XAMPP)

Extract to **D:\\** so you get `D:\Apache` and `D:\php`. Details: [VANILLA_APACHE_PHP85_WINDOWS.md](VANILLA_APACHE_PHP85_WINDOWS.md).

### 2) LinkNest full deploy package

Built by [`package-for-deployment.ps1`](../package-for-deployment.ps1).

- Production `dist/` (portable Vite base `./` — works under `/linknest`, `/ArchLinks`, `/ERP3`, …)
- PHP API, `vendor/` (SAML), docs, deploy helpers (`deploy-xampp.bat` / `update-xampp.bat`)
- SQLite 3.54.0 DLL + `install-sqlite-xampp.bat`
- `bin/` ttyd + portable OpenSSH + embeddable Python + websockify (SSH/VNC Easy)
- **Fresh database** by default (this PC’s live `data/linknest.db` is **not** shipped unless you pass `-IncludeDatabase`)
- **`uploads/` is excluded by default** (test videos and other local uploads stay on this PC). Pass `-IncludeUploads` only if you intend to ship them.

On a vanilla Apache host, copy the extracted app into `D:\Apache\htdocs\linknest`. On XAMPP, run `deploy-xampp.bat`. Details: [PACKAGE_FOR_DEPLOYMENT.md](PACKAGE_FOR_DEPLOYMENT.md).

---

## Scripts you can run (build PC)

All commands from the **repo root**. Internet is required (PHP/Apache/SQLite downloads). ZIPs are gitignored.

### One-shot: rebuild both ZIPs and upload to GitHub

Double-click [`publish-windows-bootstrap-bundles.bat`](../publish-windows-bootstrap-bundles.bat), or:

```bat
publish-windows-bootstrap-bundles.bat
publish-windows-bootstrap-bundles.bat -Yes
publish-windows-bootstrap-bundles.bat -SkipUpload
publish-windows-bootstrap-bundles.bat -IncludeDatabase
publish-windows-bootstrap-bundles.bat -IncludeUploads
publish-windows-bootstrap-bundles.bat -SkipRuntime
publish-windows-bootstrap-bundles.bat -SkipApp
```

PowerShell:

```powershell
.\scripts\publish-windows-bootstrap-bundles.ps1
.\scripts\publish-windows-bootstrap-bundles.ps1 -Yes
.\scripts\publish-windows-bootstrap-bundles.ps1 -SkipUpload
.\scripts\publish-windows-bootstrap-bundles.ps1 -IncludeDatabase -Yes
```

That script:

1. Runs the Apache + PHP packager
2. Runs the full LinkNest packager
3. Copies stable names (`linknest-apache-php85-runtime.zip`, `linknest-deploy.zip`) next to the timestamped ZIPs
4. Creates or refreshes GitHub Release tag `apache-php85-runtime` (`make_latest=false` so it does not steal Latest from `vX.Y.Z`)
5. Uploads / replaces the three assets (runtime, deploy, and `linknest-update-vX.Y.Z.zip`)

Auth (first match wins): `GITHUB_TOKEN` / `GH_TOKEN`, `gh auth login`, or Git Credential Manager (same login as `git push`). Needs **repo** scope because the repo is private.

### Runtime ZIP only (no GitHub upload)

```bat
scripts\package-vanilla-apache-php85.bat
```

Output: `linknest-apache-php85-runtime-YYYYMMDD_HHMMSS.zip` in the project root.

### LinkNest app ZIP only (no GitHub upload)

```bat
package-for-deployment.bat
package-for-deployment.bat -IncludeDatabase
package-for-deployment.bat -ExcludeUploads
```

Bootstrap publishing already passes `-ExcludeUploads` unless you add `-IncludeUploads`.

Output: `linknest-deploy-YYYYMMDD_HHMMSS.zip` and `linknest-update-vX.Y.Z.zip`.

### Combined packager flags

| Flag | Meaning |
|------|---------|
| `-Yes` | Skip the “Continue?” prompt |
| `-SkipUpload` | Build local ZIPs only |
| `-SkipRuntime` | Do not rebuild the Apache/PHP ZIP (reuse the newest timestamped one) |
| `-SkipApp` | Do not rebuild the LinkNest ZIP |
| `-SkipBuild` | Pass through to the app packager (reuse existing `dist/`) |
| `-IncludeDatabase` | Ship this PC’s live SQLite DB inside the app ZIP |
| `-IncludeUploads` | Include `uploads/` (off by default — test videos are not bundled) |
| `-DryRun` | Package, copy stable names, do not upload |
| `-Token` / `-Repo` | Override GitHub PAT / `owner/repo` |
| `-Tag` | Release tag (default `apache-php85-runtime`) |

---

## On the remote PC

1. Install [VC++ 2015–2022 x64](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) if it is not already there.
2. Sign in to GitHub and download both ZIPs from the release page (or the stable URLs above).
3. Extract **`linknest-apache-php85-runtime.zip`** to **D:\\**.
4. Run `D:\install-runtime.bat` as Administrator.
5. Extract **`linknest-deploy.zip`** and copy its contents into `D:\Apache\htdocs\linknest` (keep `data\` and `uploads\` if you are updating an existing folder).
6. Open `http://localhost/linknest/health.php?format=json`, then `http://localhost/linknest/`.

If port 80 is already used (XAMPP Apache), stop that service or change `Listen` in `D:\Apache\conf\httpd.conf`.

**XAMPP instead of vanilla Apache:** skip the runtime ZIP. Extract `linknest-deploy.zip` and run `deploy-xampp.bat`.

---

## Later: patch Apache and PHP on the target (new releases)

Do **not** re-extract the whole runtime ZIP over a live host if you only need security/patch updates. That would replace a tuned `php.ini` / `httpd.conf`.

On the target (Administrator), after the runtime ZIP is installed:

```bat
D:\upgrade-vanilla-apache-php.bat
```

From a git checkout:

```bat
upgrade-vanilla-apache-php.bat
upgrade-vanilla-apache-php.bat -SkipApache
upgrade-vanilla-apache-php.bat -WhatIf
```

That downloads the current PHP 8.5.x Thread Safe build and the current Apache Lounge VS17 httpd, keeps configs and `htdocs`, and restarts `Apache24-LinkNest`. Full flags and rollback: [VANILLA_APACHE_PHP_UPGRADE.md](VANILLA_APACHE_PHP_UPGRADE.md).

To ship a brand-new runtime ZIP (new default configs) instead of patching in place, re-run `publish-windows-bootstrap-bundles.bat` / `scripts\package-vanilla-apache-php85.bat`.

---

## What this is not

| Goal | Use this instead |
|------|------------------|
| Update widgets/UI on an existing install | [APP_UPDATES.md](APP_UPDATES.md) — `publish-base-release.bat` → Admin → App Updates |
| Patch Apache/PHP on a live vanilla host | [VANILLA_APACHE_PHP_UPGRADE.md](VANILLA_APACHE_PHP_UPGRADE.md) — `upgrade-vanilla-apache-php.bat` |
| Lean app ZIP (target already has PHP/SQLite) | `package-for-deployment.bat -AppOnly` |
| Docker image | [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md) |
| Manual `httpd.conf` / `php.ini` edits | [VANILLA_APACHE_PHP85_WINDOWS.md](VANILLA_APACHE_PHP85_WINDOWS.md) |

---

## Related docs

- [VANILLA_APACHE_PHP85_WINDOWS.md](VANILLA_APACHE_PHP85_WINDOWS.md) — runtime layout and post-install checklist
- [VANILLA_APACHE_PHP_UPGRADE.md](VANILLA_APACHE_PHP_UPGRADE.md) — in-place PHP/Apache patches on `D:\`
- [PACKAGE_FOR_DEPLOYMENT.md](PACKAGE_FOR_DEPLOYMENT.md) — app ZIP flags and target `deploy-xampp.bat`
- [APP_UPDATES.md](APP_UPDATES.md) — versioned `vX.Y.Z` Releases for in-app updates
- [XAMPP_PHP_UPGRADE.md](XAMPP_PHP_UPGRADE.md) — upgrade PHP inside an existing XAMPP
- [OFFICE_WIN2022_DEPLOY.md](OFFICE_WIN2022_DEPLOY.md) — office host playbook
