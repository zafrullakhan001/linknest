# LinkNest — Windows Server 2022 / Office XAMPP Deploy Guide

Verified reference host: **WIN-VHSGIGCAEUI** at `http://192.168.0.197/linknest/`  
Stack after deploy: **Apache 2.4.58 + PHP 8.5.9 (ZTS x64) + SQLite** (existing MariaDB on the box left alone).

Use this document to replicate the same setup on an office Windows PC/Server.

---

## What was fixed for PHP 8.5.9

The tile link-health **HTTP 500** after upgrading 8.2 → **8.5.9** was caused by PHP 8.5 deprecating `curl_close()` / `curl_multi_close()`. LinkNest’s API set `error_reporting(E_ALL)`, so those deprecations fired during `/api/linkhealth/check-tile` and broke the request path under Apache.

**Code fixes (already in this tree):**

- Removed obsolete `curl_close()` / `curl_multi_close()` calls from API/analytics PHP that probe URLs.
- Softened `api/config.php` so `E_DEPRECATED` is not treated as a hard failure.

**Verified on the Win2022 box:**

```text
POST http://192.168.0.197/linknest/api/linkhealth/check-tile
→ 200 {"success":true,"checked":8,...}
```

---

## Target prerequisites

1. Windows 10/11 or **Windows Server 2022**
2. [Visual C++ Redistributable 2015–2022 (x64)](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) (required by PHP 8.5 VS17 builds)
3. Admin rights
4. Outbound HTTPS (for optional PHP upgrade downloads / App Updates)
5. SMB or console access to the target (for file copy)

---

## Recommended path A — Package ZIP (office machines)

On a known-good build machine (this LinkNest repo):

```bat
cd C:\xampp\htdocs\linknest
package-for-deployment.bat
```

Optional: mirror this PC’s database:

```bat
package-for-deployment.bat -IncludeDatabase
```

**Package and push in one step** (SMB admin share + elevated scheduled task):

```bat
package-for-deployment.bat -RemoteHost 192.168.0.197 -RemoteUser administrator -RemoteMode Fresh
```

Empty remote with no Apache/PHP yet:

```bat
package-for-deployment.bat -RemoteHost 192.168.0.197 -RemoteUser administrator -IncludeXamppRuntime
```

Or package first, then:

```bat
deploy-remote-xampp.bat -ComputerName 192.168.0.197 -ZipPath .\linknest-deploy-YYYYMMDD_HHMMSS.zip -Mode Fresh
```

On the **office / target** host (manual path):

1. Install a base **XAMPP** under `C:\xampp` (Apache + PHP) if missing (or use `-IncludeXamppRuntime`).
2. Extract `linknest-deploy-*.zip`.
3. Run `deploy-xampp.bat` (fresh) or `update-xampp.bat` (keep `data/`) — these now call `harden-xampp-target.ps1`.
4. Approve UAC for SQLite runtime install if prompted.
5. Run elevated:

```powershell
cd C:\xampp\htdocs\linknest
.\scripts\upgrade-xampp-php-run-elevated.ps1 -Version 8.5 -Patch 8.5.9 -RestartApache
```

6. Open `http://SERVER/linknest/` and hard-refresh once (Ctrl+F5).

Details: [PACKAGE_FOR_DEPLOYMENT.md](PACKAGE_FOR_DEPLOYMENT.md), [XAMPP_PHP_UPGRADE.md](XAMPP_PHP_UPGRADE.md).

---

## Path B — Mirror a working XAMPP (what we did on 192.168.0.197)

When the target only had an empty `C:\xampp\htdocs` (no Apache/PHP), we copied a working runtime from a good host.

### 1. Copy Apache + PHP 8.5.9

From a working XAMPP host (example: this PC):

```bat
robocopy C:\xampp\apache \\TARGET\C$\xampp\apache /MIR /R:2 /W:2 /MT:8 /XD logs
robocopy C:\xampp\php    \\TARGET\C$\xampp\php    /MIR /R:2 /W:2 /MT:8
robocopy C:\xampp \\TARGET\C$\xampp setup_xampp.bat apache_start.bat apache_stop.bat xampp-control.exe xampp_start.exe xampp_stop.exe properties.ini
```

Also copy **ICU 77** DLLs into both PHP and Apache bin (needed for `intl` under PHP 8.5):

```bat
robocopy C:\xampp\php \\TARGET\C$\xampp\php icu*.dll
robocopy C:\xampp\php \\TARGET\C$\xampp\apache\bin icu*.dll
```

### 2. Clean Apache config for the new host

Do **not** blindly keep another machine’s vhosts.

On the target `C:\xampp\apache\conf\httpd.conf`:

- `DocumentRoot "C:/xampp/htdocs"`
- `Listen 80`
- Keep a **single** `PHPIniDir` (usually via `conf/extra/httpd-xampp.conf`)
- Comment out host-specific SSL/vhost includes until LinkNest works:

```apache
#Include conf/extra/httpd-ssl.conf
#Include conf/extra/httpd-vhosts.conf
```

Remove any `DocumentRoot` pointing at missing paths (e.g. old `.../linknest/analytics` vhosts).

Config test:

```bat
C:\xampp\apache\bin\httpd.exe -t
```

### 3. Install / start Apache service

Elevated:

```bat
C:\xampp\apache\bin\httpd.exe -k install -n Apache2.4
net start Apache2.4
```

### 4. Required folders & ACLs

```bat
mkdir C:\xampp\tmp
mkdir C:\xampp\htdocs\linknest\data
mkdir C:\xampp\htdocs\linknest\uploads
icacls C:\xampp\tmp /grant Users:(OI)(CI)M
icacls C:\xampp\htdocs\linknest\data /grant Users:(OI)(CI)M /T
icacls C:\xampp\htdocs\linknest\uploads /grant Users:(OI)(CI)M /T
```

Missing `C:\xampp\tmp` causes `session_start()` warnings and flaky auth/API behavior.

### 5. Deploy application files

```bat
robocopy C:\xampp\htdocs\linknest \\TARGET\C$\xampp\htdocs\linknest /E /XD node_modules .git /R:2 /W:2 /MT:8
```

Or use the ZIP from Path A.

### 6. Smoke tests

```text
http://SERVER/linknest/                          → 200
http://SERVER/linknest/api/tiles                 → 200 JSON
POST http://SERVER/linknest/api/linkhealth/check-tile
  body: {"tileId":"<real-tile-id>"}              → 200 {"success":true,"checked":N,...}
```

CLI checks on target:

```bat
C:\xampp\php\php.exe -v
C:\xampp\php\php.exe -m
```

Expect: `curl`, `sqlite3`, `pdo_sqlite`, `openssl`, `mbstring`, `ldap` (if used), `intl`, `Zend OPcache`.

---

## PHP 8.5.9 performance tweaks (applied on Win2022)

In `C:\xampp\php\php.ini` (restart Apache after changes):

| Setting | Suggested | Why |
|--------|-----------|-----|
| `opcache.enable=1` | on | Cache compiled PHP |
| `opcache.memory_consumption=256` | 128–256 | More scripts in shared memory |
| `opcache.interned_strings_buffer=32` | 16–32 | Deduplicate strings |
| `opcache.max_accelerated_files=20000` | 10000–20000 | Large apps |
| `opcache.validate_timestamps=1` | 1 in ops | Auto-pick up file changes |
| `opcache.revalidate_freq=60` | 60 | Check mtime every 60s |
| `opcache.jit=1255` | 1255 | Tracing JIT (8.x) |
| `opcache.jit_buffer_size=128M` | 64–128M | JIT code buffer |
| `realpath_cache_size=4096K` | 4096K | Faster path lookups |
| `realpath_cache_ttl=600` | 600 | Cache TTL |
| `memory_limit=512M` | 256–512M | Link health / monitors |
| `max_execution_time=120` | 120 | Multi-link curl checks |

Also ensure:

```ini
extension=curl
extension=openssl
extension=mbstring
extension=sqlite3
extension=pdo_sqlite
extension=ldap
extension=intl
curl.cainfo="C:/xampp/php/cacert.pem"
```

Production tip: after a stable deploy you can set `opcache.validate_timestamps=0` and restart Apache on each release for maximum speed.

---

## Win2022 reference state (192.168.0.197)

| Item | Value |
|------|--------|
| Hostname | WIN-VHSGIGCAEUI |
| URL | http://192.168.0.197/linknest/ |
| PHP | 8.5.9 ZTS VS17 x64 |
| Apache service | `Apache2.4` (Automatic, Running) |
| App path | `C:\xampp\htdocs\linknest` |
| Other services | Existing `MariaDB11` on port **3309** (untouched; LinkNest uses SQLite) |
| Preserved site | `C:\xampp\htdocs\mermaid` backup/restore kept during setup |

Remote automation used SMB (`\\192.168.0.197\C$`) + scheduled tasks as Administrator when WinRM TrustedHosts was not available on the operator PC.

---

## Office checklist (print / ticket)

- [ ] VC++ 2015–2022 x64 installed  
- [ ] XAMPP under `C:\xampp` with Apache listening on 80  
- [ ] PHP **8.5.9** (`php -v`) with `curl` + `sqlite3` + OPcache  
- [ ] ICU 77 DLLs present under `php\` and `apache\bin\`  
- [ ] `C:\xampp\tmp` exists and is writable  
- [ ] LinkNest deployed under `htdocs\linknest`  
- [ ] `data\` and `uploads\` writable  
- [ ] Home + tiles API + `check-tile` return HTTP 200  
- [ ] Ctrl+F5 once after deploy  
- [ ] Change default app admin password; rotate any shared Windows admin password used for remote deploy  

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `check-tile` 500 after PHP 8.5 | Deprecated `curl_close` + `E_ALL` | Deploy fixed API files from this repo; restart Apache |
| Apache won’t start: DocumentRoot missing | Copied another host’s vhosts | Simplify `httpd-vhosts.conf`; comment SSL/vhosts |
| `Unable to load dynamic library 'intl'` | Missing/wrong ICU DLLs | Copy `icu*.dll` (77.x for PHP 8.5) into `php\` and `apache\bin\` |
| `session_start(): ... C:/xampp/tmp` | Folder missing | `mkdir C:\xampp\tmp` + ACLs; restart Apache |
| JSON responses start with garbage/`?` | UTF-8 BOM in PHP sources | Save PHP as UTF-8 **without BOM** |
| Port 80 closed | Firewall / service stopped | `net start Apache2.4`; allow TCP 80 |

---

## Security notes

- Do not leave shared Administrator passwords in tickets or docs long-term; rotate after deploy.
- Prefer HTTPS + proper vhosts before exposing beyond the LAN.
- The Win2022 deploy mirrored application `data/` from the build host — treat that DB as sensitive.
