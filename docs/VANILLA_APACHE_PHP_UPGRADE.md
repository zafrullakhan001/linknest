# Upgrade vanilla Apache + PHP (Windows)

Also in-app: **Help & About → Guides → Upgrade Vanilla Apache + PHP**.

Use this when LinkNest already runs on **stock Apache** at `D:\Apache` and **PHP Thread Safe** at `D:\php` (the drop-in runtime ZIP or a manual install). It applies **new PHP patch/minor builds** and **new Apache Lounge httpd** releases **in place**, without wiping `httpd.conf`, `php.ini`, or `htdocs\linknest`.

**This is not the XAMPP path.** For `C:\xampp`, use [XAMPP_PHP_UPGRADE.md](XAMPP_PHP_UPGRADE.md).

> **Check first:** **Admin → Tools → System Runtime** shows this host's PHP and Apache versions, the newest
> published patch (with SHA256) and whether it is a security release — see
> [RUNTIME_UPDATES.md](RUNTIME_UPDATES.md). It is read-only and prints the commands used below.

---

## What the script does

| Piece | Action |
|-------|--------|
| PHP | Downloads the current **Thread Safe x64** zip from [windows.php.net releases.json](https://downloads.php.net/~windows/releases/releases.json), SHA256-checks it, swaps `D:\php`, **keeps your `php.ini`** |
| Apache | Downloads the current **httpd Win64 VS17** zip from [Apache Lounge VS17](https://www.apachelounge.com/download/VS17/), replaces `D:\Apache\bin` and `modules` only. **`conf`, `htdocs`, `logs`, and `tmp` stay** |
| Glue | Re-copies PHP DLLs (`libsasl`, OpenSSL, ICU, …) into `D:\Apache\bin` so curl/LDAP still load under Apache |
| Service | Stops/starts **`Apache24-LinkNest`** (does not touch XAMPP `Apache2.4`) |
| Backup | `D:\php-backup-yyyyMMdd-HHmmss` and `D:\Apache-bin-backup-yyyyMMdd-HHmmss` |

It does **not** replace LinkNest application files. Update the app with [WINDOWS_BOOTSTRAP_BUNDLES.md](WINDOWS_BOOTSTRAP_BUNDLES.md) / [APP_UPDATES.md](APP_UPDATES.md).

Default PHP line is **8.5.x** (8.5.9 → 8.5.10 when published). Use `-LatestMinor` later if you want 8.6+ when PHP publishes a TS x64 build.

---

## Scripts

| File | Where to run it |
|------|-----------------|
| [`upgrade-vanilla-apache-php.bat`](../upgrade-vanilla-apache-php.bat) | Build PC / git checkout (UAC). From repo root. |
| [`scripts/upgrade-vanilla-apache-php.ps1`](../scripts/upgrade-vanilla-apache-php.ps1) | Same, from an elevated PowerShell |
| [`scripts/upgrade-vanilla-apache-php-run-elevated.ps1`](../scripts/upgrade-vanilla-apache-php-run-elevated.ps1) | Optional UAC helper with a log file |
| `D:\upgrade-vanilla-apache-php.bat` | **Target PC** after extracting the runtime ZIP (script is shipped next to `install-runtime.bat`) |

---

## On the remote / office host

1. [Visual C++ 2015–2022 x64](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) already installed.
2. Outbound HTTPS to `downloads.php.net`, `apachelounge.com` (or Fossies fallback), optionally `curl.se`.
3. Run as **Administrator**.

If the host was installed from `linknest-apache-php85-runtime.zip`, double-click:

```bat
D:\upgrade-vanilla-apache-php.bat
```

From a git checkout of LinkNest:

```bat
upgrade-vanilla-apache-php.bat
```

PowerShell (already elevated):

```powershell
cd C:\xampp\htdocs\linknest
.\scripts\upgrade-vanilla-apache-php.ps1
.\scripts\upgrade-vanilla-apache-php.ps1 -SkipApache
.\scripts\upgrade-vanilla-apache-php.ps1 -SkipPhp
.\scripts\upgrade-vanilla-apache-php.ps1 -Version 8.5 -Patch 8.5.9
.\scripts\upgrade-vanilla-apache-php.ps1 -LatestMinor
.\scripts\upgrade-vanilla-apache-php.ps1 -WhatIf
.\scripts\upgrade-vanilla-apache-php.ps1 -RefreshCacert
```

Air-gapped (copy official zips to the host first):

```powershell
.\scripts\upgrade-vanilla-apache-php.ps1 -PhpZipPath D:\installers\php-8.5.x-Win32-vs17-x64.zip -ApacheZipUrl file:///D:/installers/httpd-2.4.xx-win64-VS17.zip
```

(`-ApacheZipUrl` can also be an `https://` Apache Lounge or Fossies URL.)

---

## Flags

| Flag | Meaning |
|------|---------|
| *(none)* | Newest PHP **8.5.x** TS + newest Apache Lounge VS17 httpd; restart service |
| `-SkipApache` | PHP only |
| `-SkipPhp` | Apache bin/modules only |
| `-Version 8.5` | Stay on this minor (default) |
| `-Patch 8.5.9` | Require that exact published patch (must match `releases.json`) |
| `-LatestMinor` | Newest TS x64 minor in the index (may become 8.6+) |
| `-RefreshCacert` | Re-download `cacert.pem` |
| `-NoRestart` | Leave Apache stopped |
| `-WhatIf` | Print target URLs; change nothing |
| `-PhpDir` / `-ApacheDir` / `-ServiceName` | Non-default layout |

---

## After it finishes

1. `http://localhost/linknest/health.php?format=json` — confirm PHP version, `pdo_sqlite`, `curl`, `ldap`.
2. Open the app and Ctrl+F5 once if the UI looks cached.
3. Keep the `php-backup-*` / `Apache-bin-backup-*` folders until you are sure the host is healthy.

### Rollback

```bat
net stop Apache24-LinkNest
REM PHP: delete D:\php, rename D:\php-backup-YYYYMMDD-HHMMSS to D:\php
REM Apache: copy Apache-bin-backup-*\bin and modules back over D:\Apache\bin and D:\Apache\modules
net start Apache24-LinkNest
```

---

## Rebuild a full runtime ZIP instead

If you prefer a clean `D:\Apache` + `D:\php` tree (new `php.ini` / `httpd.conf` from the packager defaults):

```bat
scripts\package-vanilla-apache-php85.bat
```

or both bundles:

```bat
publish-windows-bootstrap-bundles.bat
```

Then extract the new runtime ZIP over `D:\` **only if you intend to replace configs**. The in-place script is safer for a host that is already tuned. See [WINDOWS_BOOTSTRAP_BUNDLES.md](WINDOWS_BOOTSTRAP_BUNDLES.md).

---

## Related docs

- [VANILLA_APACHE_PHP85_WINDOWS.md](VANILLA_APACHE_PHP85_WINDOWS.md) — first-time `httpd.conf` / `php.ini`
- [WINDOWS_BOOTSTRAP_BUNDLES.md](WINDOWS_BOOTSTRAP_BUNDLES.md) — runtime + app ZIPs on GitHub
- [XAMPP_PHP_UPGRADE.md](XAMPP_PHP_UPGRADE.md) — XAMPP `C:\xampp\php` instead of `D:\php`
- [PACKAGE_FOR_DEPLOYMENT.md](PACKAGE_FOR_DEPLOYMENT.md) — application ZIP
