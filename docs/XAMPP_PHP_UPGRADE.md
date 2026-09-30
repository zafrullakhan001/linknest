# Upgrade PHP in XAMPP (Windows)

Official XAMPP packages often lag behind current PHP releases. LinkNest ships a PowerShell upgrader that replaces only the PHP folder inside an existing XAMPP install with the latest **Thread Safe x64** build from the PHP project.

**Minimum for LinkNest:** PHP 8.2+  
**Recommended (verified):** PHP **8.5.x** (LDAP included and load-tested)

> **Check first:** **Admin → Tools → System Runtime** shows the installed PHP version, the newest published
> patch (with its SHA256) and whether that patch is a security release — see
> [RUNTIME_UPDATES.md](RUNTIME_UPDATES.md). The panel is read-only: it prints the commands below for you to run.

---

## Scripts

| Script | Purpose |
|--------|---------|
| [`scripts/upgrade-xampp-php.ps1`](../scripts/upgrade-xampp-php.ps1) | Download, verify SHA256, LDAP hard gate, backup, swap, verify |
| [`scripts/upgrade-xampp-php-run-elevated.ps1`](../scripts/upgrade-xampp-php-run-elevated.ps1) | UAC launcher when Apache runs as the Windows service `Apache2.4` |

Release discovery uses the official index (future minors such as 8.6 work when published):

- [https://downloads.php.net/~windows/releases/releases.json](https://downloads.php.net/~windows/releases/releases.json)

Builds: **Thread Safe (TS) x64** only — required for Apache’s `php8apache2_4.dll` module. Do not use Non-Thread Safe (NTS) zips with XAMPP Apache.

---

## Prerequisites

1. **Windows XAMPP** (typical root `C:\xampp`)
2. **PowerShell 5.1+**
3. Outbound HTTPS to `downloads.php.net`
4. [Visual C++ Redistributable 2015–2022 (x64)](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) (VS17 PHP builds)
5. If Apache is installed as service **Apache2.4**, run the script **elevated** (Run as administrator) or use the elevated launcher

---

## Upgrade steps (this machine or a remote XAMPP host)

### 1. Copy the scripts

On the target host, ensure these files exist under your LinkNest tree (or copy them alone):

- `scripts/upgrade-xampp-php.ps1`
- `scripts/upgrade-xampp-php-run-elevated.ps1` (recommended when Apache is a service)

### 2. Open elevated PowerShell

Right-click PowerShell → **Run as administrator**, then:

```powershell
cd C:\xampp\htdocs\linknest
```

### 3. Run the upgrader

**Pin PHP 8.5 (recommended):**

```powershell
.\scripts\upgrade-xampp-php-run-elevated.ps1 -Version 8.5 -RestartApache
```

Or call the main script directly when already elevated:

```powershell
.\scripts\upgrade-xampp-php.ps1 -Version 8.5 -RestartApache
```

**Pin an exact patch** (must match the current published build in `releases.json`):

```powershell
.\scripts\upgrade-xampp-php.ps1 -Version 8.5 -Patch 8.5.9 -RestartApache
```

**Newest published TS x64 minor** (picks 8.5 today; later 8.6+ when available):

```powershell
.\scripts\upgrade-xampp-php.ps1 -RestartApache
```

**Dry run** (no changes):

```powershell
.\scripts\upgrade-xampp-php.ps1 -Version 8.5 -WhatIf
```

### 4. What the script does

1. Resolves the Thread Safe x64 zip from `releases.json`
2. Downloads (or reuses a cached zip) and verifies **SHA256**
3. Stops Apache (`Apache2.4` service and/or `httpd`)
4. Extracts to a staging folder
5. Merges your existing XAMPP `php.ini` settings (extensions, timezone, memory/upload limits, `cacert.pem` paths)
6. **LDAP hard gate** (fails before touching live PHP if any check fails):
   - `ext\php_ldap.dll` present
   - `libsasl.dll` next to `php.exe`
   - `extension_loaded('ldap')` succeeds
   - Also requires `php8apache2_4.dll` + `php8ts.dll` (TS build)
7. Backs up `C:\xampp\php` → `C:\xampp\php-backup-yyyyMMdd-HHmmss`
8. Swaps staging into `C:\xampp\php`
9. Re-verifies LDAP and LinkNest-critical extensions
10. Optionally restarts Apache

### 5. Verify

```powershell
php -v
php -r "echo extension_loaded('ldap') ? 'ldap=YES' : 'ldap=NO';"
```

Or open LinkNest and confirm PHP version via Admin / system checks. A quick web probe:

```text
http://localhost/linknest/
```

---

## LDAP note (previous upgrade blocker)

Windows PHP **8.5** Thread Safe builds **do** include LDAP (`ext/php_ldap.dll` + `libsasl.dll`). Earlier failures were usually incomplete extracts, missing `libsasl.dll`, or `extension=ldap` left commented — not missing upstream support. The upgrader aborts before swapping if LDAP cannot load.

On PHP 8.5+ Windows builds, **Zend OPcache** is often built-in (no separate `php_opcache.dll`). That is expected.

---

## Rollback

1. Stop Apache (XAMPP Control Panel or `Stop-Service Apache2.4` elevated)
2. Remove or rename the current `C:\xampp\php` folder
3. Rename `C:\xampp\php-backup-yyyyMMdd-HHmmss` back to `php`
4. Start Apache

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Cannot stop Apache2.4 / Access denied | Run elevated PowerShell or the `upgrade-xampp-php-run-elevated.ps1` launcher (approve UAC) |
| LDAP hard gate failed | Confirm TS x64 zip (not NTS); ensure `libsasl.dll` is in the PHP folder; do not strip DLLs from the official zip |
| Wrong PHP after upgrade | Restart Apache; check `C:\xampp\php\php.exe -v` and PATH order |
| Link health / `curl_multi_init()` 500 under Apache (CLI curl OK) | Apache’s older OpenSSL/nghttp2/libssh2 in `apache\bin` shadow PHP 8.5+ deps. Re-run the upgrader (it syncs these DLLs), or run elevated `scripts\fix-apache-php-curl-run-elevated.ps1`. Apache log shows: `Unable to load dynamic library 'curl' … specified procedure could not be found`. |
| VC++ runtime errors | Install [VC++ 2015–2022 x64](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) |
| Exact `-Patch` rejected | Index only lists the **current** patch per minor; omit `-Patch` or use that published version |

---

## Out of scope

- Replacing Apache, MariaDB, or the full XAMPP installer
- Docker image PHP upgrades (`docker/Dockerfile` is separate; may still pin another PHP minor)
- Linux / non-XAMPP PHP installs
- Vanilla `D:\Apache` + `D:\php` (use [VANILLA_APACHE_PHP_UPGRADE.md](VANILLA_APACHE_PHP_UPGRADE.md) instead)

See also: [SETUP.md](SETUP.md), [APP_UPDATES.md](APP_UPDATES.md) (application updates, not PHP runtime).
