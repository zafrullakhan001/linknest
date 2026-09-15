# Vanilla Apache + PHP 8.5 (Windows) — post-install config

Also in-app: **Help & About → Help → Vanilla Apache + PHP 8.5 (Windows)**, and **Guides → Vanilla Apache + PHP 8.5 (Windows)**.

This guide starts **after** a stock Apache HTTP Server and PHP 8.5 Thread Safe x64 install. It lists every Apache and PHP file to change so LinkNest runs at `http://<host>/linknest/`.

No application code changes. The shipped [`.htaccess`](../.htaccess) already routes the SPA and `/api/*`. Vanilla Apache ignores that file until `mod_rewrite` and `AllowOverride All` are on.

**This is not the XAMPP path.** For XAMPP, use [XAMPP_PHP_UPGRADE.md](XAMPP_PHP_UPGRADE.md) and [OFFICE_WIN2022_DEPLOY.md](OFFICE_WIN2022_DEPLOY.md).

---

## Drop-in runtime ZIP (optional)

On a build PC you can download Apache Lounge + PHP 8.5, apply these settings, and emit a ZIP that extracts to `D:\Apache` + `D:\php`:

```bat
scripts\package-vanilla-apache-php85.bat
```

Output: `linknest-apache-php85-runtime-YYYYMMDD_HHMMSS.zip` in the project root (gitignored). On the target: extract to **D:\**, install the VC++ 2015–2022 x64 runtime, run `install-runtime.bat` as Administrator, then copy the LinkNest app into `D:\Apache\htdocs\linknest`.

The runtime ZIP already includes official **SQLite 3.53.4** as `D:\php\libsqlite3.dll` (and a copy under `Apache\bin`), so `health.php` SQLite checks should pass without a separate `install-sqlite-xampp` step.

**Rebuild both ZIPs and upload to GitHub** (runtime + LinkNest app) from the repo root:

```bat
publish-windows-bootstrap-bundles.bat
publish-windows-bootstrap-bundles.bat -Yes
```

That publishes Release tag `apache-php85-runtime` with stable names `linknest-apache-php85-runtime.zip` and `linknest-deploy.zip`. Full walkthrough: [WINDOWS_BOOTSTRAP_BUNDLES.md](WINDOWS_BOOTSTRAP_BUNDLES.md).

**Later PHP / Apache patches** on a live `D:\` install (keep `php.ini` and `httpd.conf`): [VANILLA_APACHE_PHP_UPGRADE.md](VANILLA_APACHE_PHP_UPGRADE.md) — `upgrade-vanilla-apache-php.bat`.

---

## Assumed layout (this machine)

| Piece | Path |
|-------|------|
| Apache (httpd) | `D:\Apache` |
| Apache config | `D:\Apache\conf\httpd.conf` |
| Document root | `D:\Apache\htdocs` |
| PHP 8.5 **Thread Safe** x64 | `D:\php` |
| PHP config | `D:\php\php.ini` (created below) |
| LinkNest app | `D:\Apache\htdocs\linknest` |
| Public URL | `http://<host>/linknest/` |

Do **not** point `DocumentRoot` at the LinkNest folder. Keep DocumentRoot as `htdocs` and serve the app as a **subfolder** so rewrite rules and session cookies stay correct.

**Thread Safe only.** Apache’s `php8apache2_4.dll` does not work with a Non-Thread Safe (NTS) zip. Confirm you have:

```text
D:\php\php8apache2_4.dll
D:\php\php8ts.dll
D:\php\ext\php_pdo_sqlite.dll
```

If those files are missing, you installed the wrong PHP build. Get **VS17 x64 Thread Safe** from [windows.php.net / downloads.php.net](https://windows.php.net/download/).

---

## Prerequisites

1. [Visual C++ Redistributable 2015–2022 (x64)](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)
2. Admin rights (to edit `httpd.conf`, install the Apache service, and set ACLs)
3. **Port 80 conflict on this PC:** XAMPP Apache (`C:\xampp`) often already owns port 80. Before starting `D:\Apache`:
   - Stop XAMPP Apache (Control Panel or `Stop-Service Apache2.4`), **or**
   - Change vanilla Apache to another port (`Listen 8080`) and open the firewall

---

## What Apache must provide

```text
Browser  →  D:\Apache (httpd)
              ├─ AllowOverride All + mod_rewrite  →  htdocs\linknest\.htaccess
              │     ├─ /linknest/api/*   →  php8apache2_4.dll  →  api\index.php
              │     └─ SPA / assets      →  dist\
              └─ PHPIniDir D:\php        →  php.ini
```

| Apache piece | Why |
|--------------|-----|
| `rewrite_module` | Required. `.htaccess` routes `/api/*` and the SPA |
| `AllowOverride All` on `htdocs` | Required. Vanilla default is often `None`, so `.htaccess` never runs |
| `php8apache2_4.dll` (mod_php) | Required. Do not use php-cgi for this app |
| `headers_module` | Cache-Control in `.htaccess` |
| `deflate_module` | Gzip of JS/CSS/JSON |
| `mime_module` / `dir_module` | Correct JS/CSS types and DirectoryIndex |

Leave `ssl_module` and `proxy_*` commented until you need HTTPS / SSH-VNC WebSockets (optional section below).

---

## 1. PHP — create and edit `D:\php\php.ini`

### 1.1 Copy the production template

```bat
copy /Y D:\php\php.ini-production D:\php\php.ini
```

Edit `D:\php\php.ini` with the values below. Search for each key; uncomment the line if it starts with `;`.

### 1.2 Paths

```ini
extension_dir = "D:/php/ext"
session.save_path = "D:/Apache/tmp"
```

Create `D:\Apache\tmp` before starting Apache. A missing session directory causes `session_start()` warnings and flaky login.

**CA certificates** (needed for `curl` HTTPS checks — link health, monitors, App Updates):

```ini
curl.cainfo = "D:/php/extras/ssl/cacert.pem"
openssl.cafile = "D:/php/extras/ssl/cacert.pem"
```

If `D:\php\extras\ssl\cacert.pem` does not exist, download [cacert.pem](https://curl.se/ca/cacert.pem) into `D:\php\cacert.pem` and point both keys at `"D:/php/cacert.pem"`.

### 1.3 Extensions (uncomment `extension=...`)

`json` and `session` are built into PHP 8.5 — do not add `extension=` lines for them.

| Line in `php.ini` | Required? | Used for |
|-------------------|-----------|----------|
| `extension=pdo_sqlite` | **Yes** — API hard-fails without it | SQLite database |
| `extension=sqlite3` | **Yes** | SQLite |
| `extension=mbstring` | **Yes** | Encoding, auth, uploads |
| `extension=openssl` | **Yes** | HTTPS, encryption |
| `extension=fileinfo` | **Yes** | Uploads / MIME |
| `extension=curl` | **Yes** | Link health, monitors |
| `extension=ldap` | Enable even if unused today | LDAP login |
| `extension=zip` | Strongly recommended | App Updates / packages |
| `extension=gd` | Strongly recommended | Image helpers |
| `extension=intl` | Recommended | Localization (needs ICU DLLs, see below) |

Enable `mbstring` **before** other extensions that depend on it (keep it near the top of the extension list).

**OPcache on PHP 8.5 Windows** is often built-in (no `php_opcache.dll`). Check:

```bat
dir D:\php\ext\php_opcache.dll
```

- If the DLL **is missing**: do **not** add `zend_extension=opcache`. Still set the `opcache.*` keys below.
- If the DLL **exists**: add `zend_extension=opcache` (or `zend_extension="D:/php/ext/php_opcache.dll"`).

```ini
opcache.enable=1
opcache.enable_cli=0
opcache.memory_consumption=256
opcache.interned_strings_buffer=32
opcache.max_accelerated_files=20000
opcache.max_wasted_percentage=10
opcache.validate_timestamps=1
opcache.revalidate_freq=60
opcache.enable_file_override=1
opcache.save_comments=1
opcache.jit=1255
opcache.jit_buffer_size=128M
realpath_cache_size=4096K
realpath_cache_ttl=600
```

`opcache.enable_cli=0` is intentional: CLI `php -m` may not show OPcache while Apache (mod_php) still has it. Confirm in the browser with `http://<host>/linknest/check_opcache.php` after deploy.

After the install is stable you can set `opcache.validate_timestamps=0` and restart Apache on each deploy.

### 1.4 Limits and production flags

```ini
memory_limit=512M
max_execution_time=120
max_input_time=120
upload_max_filesize=50M
post_max_size=50M
date.timezone=America/New_York
display_errors=Off
log_errors=On
error_log="D:/Apache/logs/php_errors.log"
expose_php=Off
```

Set `date.timezone` to your real zone.

**Do not** put `exec`, `proc_open`, or `shell_exec` in `disable_functions` if you will use Clone Instance or SSH/VNC Easy mode.

### 1.5 Verify PHP CLI (before wiring Apache)

```bat
D:\php\php.exe -v
D:\php\php.exe -m
```

Expect at least: `curl`, `pdo_sqlite`, `sqlite3`, `openssl`, `mbstring`, `fileinfo`, `ldap`, `zip`.

---

## 2. Apache — edit `D:\Apache\conf\httpd.conf`

This is the only Apache file required for HTTP. Use forward slashes in Apache paths.

### 2.1 Load PHP (near the other `LoadModule` lines)

```apache
LoadFile "D:/php/php8ts.dll"
LoadModule php_module "D:/php/php8apache2_4.dll"
PHPIniDir "D:/php"
```

Use **one** `PHPIniDir`. A second one (leftover from another install) will load the wrong `php.ini`.

### 2.2 PHP handler (once, not duplicated)

```apache
<FilesMatch \.php$>
    SetHandler application/x-httpd-php
</FilesMatch>
```

### 2.3 Uncomment modules LinkNest uses

Find these `LoadModule` lines and remove the leading `#`:

```apache
LoadModule rewrite_module modules/mod_rewrite.so
LoadModule headers_module modules/mod_headers.so
LoadModule deflate_module modules/mod_deflate.so
LoadModule mime_module modules/mod_mime.so
LoadModule dir_module modules/mod_dir.so
LoadModule status_module modules/mod_status.so
```

`authz_core_module` is already on in a stock Apache 2.4 install (`Require all granted` needs it).

For the admin Apache monitoring dashboard (footer **online now**), Apache does **not** have to be XAMPP. Enable `mod_status` on this host:

```apache
LoadModule status_module modules/mod_status.so
Include conf/extra/httpd-info.conf
```

Keep `/server-status` limited to `Require local`. If `httpd-info.conf` is not present, copy [`apache/linknest-server-status.conf`](../apache/linknest-server-status.conf) to `conf/extra/` and include that instead.

Then restart Apache. PHP probes the **current** scheme and port on `127.0.0.1` (HTTPS vhosts included). It does not assume XAMPP port 80 or Docker 8090.

If a vhost forces HTTP → HTTPS, exclude the status URL:

```apache
RewriteCond %{REQUEST_URI} !^/server-status
```

Apache must accept loopback on the same listen port (`Listen 443` is fine; `Listen 10.x.x.x:443` only is not). Optional override:

```text
LINKNEST_APACHE_STATUS_URL=http://127.0.0.1/server-status?auto
```

Leave these **commented** until the optional HTTPS / WSS section:

```apache
#LoadModule ssl_module modules/mod_ssl.so
#LoadModule proxy_module modules/mod_proxy.so
#LoadModule proxy_http_module modules/mod_proxy_http.so
#LoadModule proxy_wstunnel_module modules/mod_proxy_wstunnel.so
```

### 2.4 DocumentRoot and AllowOverride (the usual miss)

Vanilla Apache often ships `AllowOverride None`. Change the `htdocs` directory block to:

```apache
DocumentRoot "D:/Apache/htdocs"
<Directory "D:/Apache/htdocs">
    Options Indexes FollowSymLinks
    AllowOverride All
    Require all granted
</Directory>
```

`AllowOverride All` lets `.htaccess` set `-Indexes -MultiViews +FollowSymLinks`. **MultiViews must stay off** — it maps `/api/tiles/...` onto `tiles.php` and 403s PATH_INFO when a category name contains spaces.

Keep `AccessFileName .htaccess` (stock default).

### 2.5 DirectoryIndex (optional)

The app `.htaccess` already prefers `dist/index.html`. You may still set:

```apache
DirectoryIndex dist/index.html index.php index.html
```

### 2.6 Listen / port

Keep `Listen 80` only if nothing else (including XAMPP) is bound to 80.

Otherwise:

```apache
Listen 8080
```

Then open the app at `http://<host>:8080/linknest/` and allow TCP 8080 in Windows Firewall.

### 2.7 Config test and service

Elevated Command Prompt:

```bat
D:\Apache\bin\httpd.exe -t
```

`Syntax OK` is required before starting the service.

Install and start (first time):

```bat
D:\Apache\bin\httpd.exe -k install -n Apache2.4
net start Apache2.4
```

If a service named `Apache2.4` already exists (XAMPP), either stop/remove that one first, or install vanilla as a different name:

```bat
D:\Apache\bin\httpd.exe -k install -n Apache24-Vanilla
net start Apache24-Vanilla
```

Restart after later config edits:

```bat
net stop Apache2.4
net start Apache2.4
```

---

## 3. Windows runtime glue (required or PHP will not load under Apache)

Apache’s `bin\` is on the DLL search path **ahead of** `D:\php`. Copy these from `D:\php` into `D:\Apache\bin` (only files that exist in your zip):

| Files | Needed for |
|-------|------------|
| `icu*.dll` | `intl` |
| `libsasl.dll` | `ldap` |
| `libsqlite3.dll` | SQLite |
| `libcrypto*.dll`, `libssl*.dll`, `libssh2.dll`, `nghttp2.dll`, `libcurl*.dll` | `curl` / `openssl` under Apache |

If Apache starts but `phpinfo()` shows curl missing, or link-health returns 500 with `Unable to load dynamic library 'curl'`, the Apache `bin` DLLs are shadowing PHP 8.5. Recopy the PHP copies into `D:\Apache\bin` and restart Apache.

Also:

1. Add `D:\php` to the **system** PATH (not only the current user).
2. Install the VC++ 2015–2022 x64 runtime if `php8apache2_4.dll` fails to load.

### Folders and ACLs

```bat
mkdir D:\Apache\tmp
mkdir D:\Apache\htdocs\linknest\data
mkdir D:\Apache\htdocs\linknest\uploads

icacls D:\Apache\tmp /grant Users:(OI)(CI)M
icacls D:\Apache\htdocs\linknest\data /grant Users:(OI)(CI)M /T
icacls D:\Apache\htdocs\linknest\uploads /grant Users:(OI)(CI)M /T
```

If Apache runs as a Windows service, also grant **Modify** to `SYSTEM` and `LOCAL SERVICE` on those three folders. The API creates `data\linknest.db` on first request; that fails if the service cannot write.

---

## 4. Application (no Apache/PHP file edits)

1. Deploy LinkNest into `D:\Apache\htdocs\linknest` (copy this tree, or extract a deploy ZIP).
2. Production UI is `dist\index.html`. If that file is missing, build (`npm run build`) or use a Release ZIP that includes `dist/`.
3. Leave the repo [`.htaccess`](../.htaccess) as-is. Do not rewrite it for vanilla Apache.
4. Open `http://<host>/linknest/` (include the folder name and trailing slash).

---

## 5. Smoke tests

```bat
D:\php\php.exe -v
D:\php\php.exe -m
D:\Apache\bin\httpd.exe -t
```

In a browser (or `curl`):

| URL | Expect |
|-----|--------|
| `http://<host>/linknest/health.php` | READY (or DEGRADED with warnings). JSON: `health.php?format=json` |
| `http://<host>/linknest/` | HTTP 200, app UI (not a directory listing, not `index.tsx` 404) |
| `http://<host>/linknest/api/tiles` | HTTP 200 JSON |
| `http://<host>/linknest/dist/index.html` | HTTP 200 (confirms the production build exists) |

Open `http://<host>/linknest/health.php` first. It checks PHP extensions (`pdo_sqlite`, `curl`, `ldap`, …), Apache modules (`mod_rewrite`), `php.ini` path, OPcache, writable `data/` / `uploads/` / session tmp, and the SQLite engine plus Windows `libsqlite3.dll` (3.53.4 ~3 MB). HTTP 503 means a critical check failed.

Do **not** leave a `phpinfo.php` file on the server. Use `/health.php` instead.

---

## 6. Optional — HTTPS

See [HTTPS_CONFIGURATION.md](HTTPS_CONFIGURATION.md). Typical vanilla files:

| File | What to change |
|------|----------------|
| `D:\Apache\conf\httpd.conf` | Uncomment `LoadModule ssl_module`, `socache_shmcb_module`, and `Include conf/extra/httpd-ssl.conf` |
| `D:\Apache\conf\extra\httpd-ssl.conf` | `SSLCertificateFile` / `SSLCertificateKeyFile`; `<VirtualHost *:443>` DocumentRoot stays `D:/Apache/htdocs` with `AllowOverride All` |

HTTP still works without this. LinkNest API calls are relative URLs, so they follow whatever protocol the page used.

---

## 7. Optional — SSH / VNC WebSocket proxy (HTTPS only)

Browsers block `ws://` from an `https://` page. To proxy gateways on port 443:

1. Uncomment in `httpd.conf`:

```apache
LoadModule proxy_module modules/mod_proxy.so
LoadModule proxy_http_module modules/mod_proxy_http.so
LoadModule proxy_wstunnel_module modules/mod_proxy_wstunnel.so
```

2. Copy [`apache/linknest-gateway-proxy.conf`](../apache/linknest-gateway-proxy.conf) to `D:\Apache\conf\extra\linknest-gateway-proxy.conf`.
3. **Include it once inside the HTTPS `<VirtualHost *:443>`** in `httpd-ssl.conf` — not twice, and not only in global `httpd.conf`:

```apache
Include conf/extra/linknest-gateway-proxy.conf
```

4. Restart Apache. Full walkthrough: [REMOTE_WIDGETS_MANUAL_DEPLOY.md](REMOTE_WIDGETS_MANUAL_DEPLOY.md) Path C.

```powershell
.\scripts\enable-gateway-wss-proxy.ps1 -XamppRoot D:\Apache -InstallDir D:\Apache\htdocs\linknest -RestartApache
```

SSH/VNC **binaries** (`bin\ttyd.exe`, Python, websockify) are separate from Apache/PHP. See [REMOTE_WIDGETS_SETUP.md](REMOTE_WIDGETS_SETUP.md).

---

## 8. Optional — Apache MPM (Windows performance)

Stock `mpm_winnt` is fine. To raise thread count, merge [`scripts/xampp/httpd-mpm-winnt.conf`](../scripts/xampp/httpd-mpm-winnt.conf) into `D:\Apache\conf\extra\httpd-mpm.conf` (or the MPM include your `httpd.conf` already loads):

```apache
<IfModule mpm_winnt_module>
    ThreadsPerChild        256
    MaxConnectionsPerChild 10000
</IfModule>
```

On Windows, `MaxRequestWorkers` is not valid for `mpm_winnt`.

---

## Checklist

- [ ] VC++ 2015–2022 x64 installed
- [ ] PHP 8.5 **TS** x64 at `D:\php` (`php8apache2_4.dll` + `php8ts.dll`)
- [ ] `D:\php\php.ini` created from `php.ini-production` with extensions and paths above
- [ ] `D:\Apache\conf\httpd.conf`: PHP `LoadFile` / `LoadModule` / `PHPIniDir`, rewrite + headers + deflate, `AllowOverride All`
- [ ] PHP DLLs copied into `D:\Apache\bin`; `D:\php` on system PATH
- [ ] `D:\Apache\tmp`, `data\`, `uploads\` exist and are writable by the Apache service
- [ ] Port 80 (or your `Listen` port) not taken by XAMPP
- [ ] `httpd.exe -t` → Syntax OK; Apache service running
- [ ] `http://<host>/linknest/` and `http://<host>/linknest/api/tiles` return 200
- [ ] `http://<host>/linknest/health.php` is READY (or DEGRADED with only warnings); php.ini path is `D:\php\php.ini`

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Home page is a directory listing, or `/api/tiles` 404 | `.htaccess` not applied | `AllowOverride All`; uncomment `rewrite_module`; restart Apache |
| `index.tsx` 404 | Serving source `index.html` instead of `dist/` | Confirm `dist\index.html` exists; hard-refresh (Ctrl+F5) |
| API JSON `PDO SQLite extension is not enabled` | `pdo_sqlite` off or wrong `php.ini` | Uncomment `extension=pdo_sqlite`; confirm `/health.php` loaded ini |
| Apache will not start: cannot load `php8apache2_4.dll` | NTS PHP, missing VC++, or `php8ts.dll` not found | Use TS x64; `LoadFile` php8ts.dll; install VC++ x64 |
| `Unable to load dynamic library 'curl'` under Apache (CLI curl OK) | Older DLLs in `D:\Apache\bin` shadow PHP 8.5 | Copy curl/OpenSSL DLLs from `D:\php` into `D:\Apache\bin` |
| `Unable to load dynamic library 'intl'` | Missing ICU | Copy `icu*.dll` from `D:\php` into `D:\Apache\bin` |
| LDAP extension fails | Missing `libsasl.dll` | Copy `D:\php\libsasl.dll` into `D:\Apache\bin`; `extension=ldap` |
| Login flaky / `session_start()` warnings | No session directory | Create `D:\Apache\tmp`; match `session.save_path`; fix ACLs |
| Port 80 in use | XAMPP or another `Apache2.4` | Stop the other service or change `Listen` |
| `httpd -t` OK but site blank | Wrong DocumentRoot / app not in `htdocs\linknest` | App must be at `D:\Apache\htdocs\linknest` |

Error log: `D:\Apache\logs\error.log`.

---

## Related docs

- [SETUP.md](SETUP.md) — development (`npm run dev` + PHP built-in server)
- [README_BACKEND.md](README_BACKEND.md) — API overview
- [PRODUCTION.md](PRODUCTION.md) — frontend production build (`dist/`)
- [HTTPS_CONFIGURATION.md](HTTPS_CONFIGURATION.md) — TLS
- [REMOTE_WIDGETS_MANUAL_DEPLOY.md](REMOTE_WIDGETS_MANUAL_DEPLOY.md) — SSH/VNC + WSS proxy
- [XAMPP_PHP_UPGRADE.md](XAMPP_PHP_UPGRADE.md) — if you are on XAMPP instead of vanilla Apache
- [VANILLA_APACHE_PHP_UPGRADE.md](VANILLA_APACHE_PHP_UPGRADE.md) — patch `D:\Apache` + `D:\php` in place
- [WINDOWS_BOOTSTRAP_BUNDLES.md](WINDOWS_BOOTSTRAP_BUNDLES.md) — runtime + app ZIPs
- [OFFICE_WIN2022_DEPLOY.md](OFFICE_WIN2022_DEPLOY.md) — verified XAMPP + PHP 8.5.9 office host
