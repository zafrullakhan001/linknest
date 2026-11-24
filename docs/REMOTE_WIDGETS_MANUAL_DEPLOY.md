# SSH / VNC Manual Deployment Guide

Step-by-step guide to install and configure **SSH Terminal** and **VNC Viewer** gateways on a Windows XAMPP / Apache host (including air-gapped office servers and HTTPS/`wss://` on port 443).

Also available in-app: **Help & About → Guides → SSH / VNC Manual Deployment**, and a shorter overview under **Help → Remote Widgets**.

Related: [`REMOTE_WIDGETS_SETUP.md`](REMOTE_WIDGETS_SETUP.md) (feature overview), [`PACKAGE_FOR_DEPLOYMENT.md`](PACKAGE_FOR_DEPLOYMENT.md) (app ZIP).

---

## What you are installing

Browsers cannot open raw SSH (`host:22`) or VNC. LinkNest starts local gateways on the **server PC**:

| Widget | Easy mode gateway | Advanced mode |
|--------|-------------------|---------------|
| **SSH / RDP** | **ttyd** + **OpenSSH Client** | Paste an existing ttyd WebSocket URL; RDP embeds a Guacamole / web RDP **https://** page |
| **VNC Viewer** | **Python 3** + **websockify** | Paste an existing websockify WebSocket URL |

Passwords are never saved. Prefer LAN / VPN; do not expose unauthenticated gateways to the public internet.

**Connection isolation:** Each signed-in user has a private SSH/VNC connection list (`user_id`). Admins do not share lists with each other. Guests use browser-only saves, separate from any account.

**Updating office installs (ArchLinks / ERP3):** Widget UI lives in `dist/`. Use a portable App Updates **Release** (not only a commit) so both folders get the same build — see [`APP_UPDATES.md`](APP_UPDATES.md#office-playbook-archlinks--erp3--any-folder--recommended) and Help & About → In-app App Updates.

---

## Path A — Online host (internet available)

### 1. Prerequisites on the LinkNest server

| Component | Required for | Install |
|-----------|--------------|---------|
| **ttyd** | SSH Easy + Advanced | Bundled as `bin\ttyd.exe` in deploy / App Update packages (`scripts/ensure-ttyd-runtime.ps1`). Fallback: `winget install tsl0922.ttyd --source winget` then copy to `bin\ttyd.exe` |
| **OpenSSH Client** | All SSH | Bundled as `bin\OpenSSH\ssh.exe` in deploy / App Update packages (`scripts/ensure-openssh-runtime.ps1`). Fallback: Windows Optional Features → *OpenSSH Client* |
| **Python 3** | VNC Easy | Bundled as `bin\python\python.exe` in deploy / App Update packages. Leave Admin path blank to auto-detect. |
| **websockify** | VNC Easy | `scripts\install-websockify.ps1` or `python -m pip install --target=bin\python-packages websockify` |
| **VcXsrv** (optional) | SSH Terminal + GUI (X11) | [VcXsrv](https://sourceforge.net/projects/vcxsrv/) or `winget install marha.VcXsrv` |
| **LinkNest login** | Easy mode | Guests can only use Advanced WebSocket URLs |

### 2. Point Admin at the binaries

1. Sign in as admin → **Admin → Add-ons → SSH Gateway**
2. Confirm ttyd / ssh status **Ready** (or set full paths, e.g. `D:\Apache\htdocs\ArchLinks\bin\ttyd.exe`)
3. **Admin → Add-ons → VNC Gateway** — confirm Python + websockify found
4. Leave paths blank to auto-detect `bin\ttyd.exe`, `bin\OpenSSH\ssh.exe`, `bin\python\python.exe`

### 3. Role access

**Admin → Roles → Widgets** — enable `ssh-terminal` and `vnc-viewer` for the roles that need them.

### 4. Quick verify (PowerShell on the server)

```powershell
& "C:\path\to\app\bin\ttyd.exe" --version
ssh -V
python --version
```

---

## Path B — Offline / air-gapped host (no internet)

### 1. On a PC that *can* download

From the LinkNest repo / build machine:

```powershell
.\scripts\package-remote-widgets-runtime.ps1
# or: .\scripts\package-remote-widgets-runtime.bat
```

Produces `linknest-remote-widgets-runtime-YYYYMMDD-HHMMSS.zip` with:

| Component | Path in package |
|-----------|-----------------|
| ttyd | `bin/ttyd.exe` (+ Linux `ttyd.x86_64` if included) |
| OpenSSH client | `bin/OpenSSH/ssh.exe` |
| Python | `bin/python/python.exe` (embeddable CPython) |
| websockify | `bin/python-packages/` (used by bundled Python) |
| VcXsrv | `VcXsrv/` (if present on the build PC) |

Embeddable Python is in the ZIP by default. Pass `-SkipPython` only if the target already has Python 3.

If the ZIP must travel in small pieces, use the packager’s split/parts folder and `MERGE-ZIP.bat` on the target before install.

### 2. On the restricted server (Administrator)

1. Copy the ZIP next to your app folder (or unzip anywhere temporary).
2. Run:

```bat
install-remote-widgets-runtime.bat
REM or:
powershell -File .\install-remote-widgets-runtime.ps1 -InstallDir D:\Apache\htdocs\ArchLinks
```

3. Refresh **Admin → Add-ons → SSH Gateway / VNC Gateway** — statuses should show Ready/found.
4. Start **VcXsrv** before using SSH Terminal + GUI.

---

## Path C — HTTPS office deploy (WSS on port 443)

Browsers block `ws://host:17681` when the UI is **https://** (Mixed Content). LinkNest proxies WebSockets through Apache on **443**:

```text
wss://your-host/<base>/_ln_sshgw/<port>/ws  →  ws://127.0.0.1:<port>/ws
wss://your-host/<base>/_ln_vncgw/<port>/…   →  local websockify
```

### 1. Enable the gateway proxy (Administrator, once)

```bat
scripts\enable-gateway-wss-proxy.bat
```

Or:

```powershell
.\scripts\enable-gateway-wss-proxy.ps1 -XamppRoot D:\Apache -InstallDir D:\Apache\htdocs\ArchLinks -RestartApache
```

Adjust `-XamppRoot` / `-InstallDir` for your layout (`C:\xampp`, `ArchLinks`, `ERP3`, `linknest`, …).

### 2. Critical Apache rules (avoid double-proxy / broken MFA)

1. Include `apache/linknest-gateway-proxy.conf` **once**, inside the HTTPS `<VirtualHost *:443>` (e.g. in `httpd-ssl.conf`) — **not** only in global `httpd.conf`, and **not** twice.
2. Force **HTTP/1.1** on gateway `LocationMatch` / `ProxyPassMatch` (HTTP/2 breaks many WebSocket clients).
3. Prefer `ProxyPassMatch` → `ws://127.0.0.1:…` with `mod_proxy_wstunnel`.
4. Do **not** `[P]`-proxy gateways again from the app `.htaccess` (exclude `/_ln_sshgw/` and `/_ln_vncgw/` from the SPA catch-all only).
5. Required modules: `rewrite`, `proxy`, `proxy_http`, `proxy_wstunnel`.

### 3. Expected URL shapes after enable

| App URL base | Example WSS |
|--------------|-------------|
| Domain root | `wss://host/_ln_sshgw/17681/ws` |
| `/ArchLinks` | `wss://host/ArchLinks/_ln_sshgw/17681/ws` |
| `/ERP3` | `wss://host/ERP3/_ln_sshgw/17681/ws` |

Hard-refresh the browser, then Connect. Base path is auto-detected via `getAppBasePath()`; optional override: setting `gateway_http_proxy_base` or env `LINKNEST_GATEWAY_PROXY_BASE` / `VITE_BASE_PATH`.

### 4. Verify on the server

```text
1. httpd -t is OK; Apache restarted after enabling the proxy
2. ttyd listening: netstat -ano | findstr 17681  →  127.0.0.1:17681
3. Local proxy: http://127.0.0.1/<YourFolder>/_ln_sshgw/17681/
4. Any front load balancer must forward /<YourFolder>/_ln_sshgw/ with WebSocket Upgrade
5. Diagnose: scripts\diagnose-gateway-wss.ps1
```

### 5. MFA / PAM sessions

If the terminal shows password + SecureAuth prompts and then `Connection closed by … port …`, the **WSS path worked** — the remote PAM/SSH host closed the session. Fix credentials / MFA / PAM policy on the remote side; do not re-break the Apache proxy.

---

## Using SSH Terminal (after install)

### Easy mode (recommended)

1. Open the widget (nav terminal icon or **Ctrl+Shift+Y**).
2. Settings → protocol **SSH** → **Easy (ssh://)**.
3. Enter **Host**, **Port**, **Username**, or paste an **SSH URL** and Apply.
4. **Connect** — LinkNest starts ttyd; type password / MFA in the terminal.
5. **Save** — stored as `auto://user@host:port` (username percent-encoded). Passwords are never stored.

### ssh:// for space / tile links

1. On a saved Easy connection, use **Copy ssh://** (card or Settings header).
2. Paste that URL as a tile link.
3. Clicking it opens the SSH widget and connects.

Examples:

```text
ssh://user@host:22
ssh://domain%5Cuser%2Btarget@pam.example.com:4489
```

Encode PAM characters in the username: `\` → `%5C`, `+` → `%2B`, `@` → `%40`. Unencoded usernames with multiple `@` are OK when pasted — the **last** `@` separates username from host.

### Terminal + GUI (X11)

1. Start VcXsrv (XLaunch → Multiple windows → Start no client → **Disable access control**).
2. Easy mode → **Terminal + GUI (X11)** → Connect.
3. On Linux: `X11Forwarding yes` in `sshd_config`, restart sshd.
4. Run e.g. `xclock` — windows open on the Windows desktop via VcXsrv (not inside the SSH panel).

### Advanced (manual ttyd / guests)

```powershell
ttyd -W -p 7681 -w $env:USERPROFILE C:\Windows\System32\OpenSSH\ssh.exe -tt user@host
```

Then Advanced → WebSocket URL: `ws://localhost:7681/ws` (or the HTTPS proxy `wss://…/_ln_sshgw/…` form when applicable).

### RDP (same widget)

Settings → **RDP** → paste Guacamole / web RDP `https://…` URL → Save → Connect. Credentials stay in the gateway UI.

---

## Using VNC Viewer (after install)

### Easy mode

1. Confirm **Admin → Add-ons → VNC Gateway** shows Python found (bundled `bin\python`) and websockify ready.
2. Open **VNC Viewer** → Easy → host + port (default `5900`).
3. Optional session password → Connect.
4. LinkNest starts websockify on a localhost port in **17881–17980**.
5. Space links: `vnc://192.168.1.50:5900`.
6. Saved Easy targets use `auto-vnc://host:port`.

### Advanced

1. Run websockify yourself (e.g. `:6080` → `:5900`).
2. Paste `ws://localhost:6080/websockify` (or `wss://…`).
3. Connect.

---

## Checklists

### Fresh Windows XAMPP / Apache install

- [ ] App deployed under `htdocs` (e.g. `ArchLinks`, `linknest`)
- [ ] ttyd at `bin\ttyd.exe` (or Admin path set)
- [ ] OpenSSH at `bin\OpenSSH\ssh.exe` (or Admin path / Windows Optional Features)
- [ ] Python 3 + websockify for VNC Easy (`bin\python\python.exe` from the package)
- [ ] Admin → Add-ons statuses Ready
- [ ] Roles → Widgets: `ssh-terminal`, `vnc-viewer`
- [ ] If site is **HTTPS**: gateway WSS proxy enabled once inside SSL vhost; HTTP/1.1; no double proxy
- [ ] Signed in for Easy mode test Connect

### Offline pack transfer

- [ ] Built `package-remote-widgets-runtime` ZIP on an online PC
- [ ] Merged split parts if used
- [ ] Ran `install-remote-widgets-runtime` as Administrator against `-InstallDir`
- [ ] Python bundled (`bin\python`) or system Python 3 on target
- [ ] VcXsrv installed/started for GUI SSH

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Easy: ttyd / ssh not found | Copy to `bin\`, or set path under **Admin → Add-ons → SSH Gateway** |
| Easy: configured path missing | Fix or clear invalid Admin paths |
| Easy: failed to start | Bundled `bin\OpenSSH\ssh.exe` present; PHP allowed to spawn processes; full `ssh.exe` path |
| Mixed Content / `ws://` blocked on HTTPS | Run `enable-gateway-wss-proxy`; include proxy conf **once** in SSL vhost |
| Broken close frame / no MFA after proxy | Remove duplicate Include; force HTTP/1.1; use `mod_proxy_wstunnel` |
| MFA works then `Connection closed by …` | Remote PAM/SSH closed session — credentials/MFA/policy, not Apache |
| `CreateProcessW` 267 (manual ttyd) | Use `-w $env:USERPROFILE` + full `ssh.exe` path |
| `Can't open display:` | Start VcXsrv; Easy → Terminal + GUI; remote `X11Forwarding yes` |
| Want GUI in the browser | Use **VNC Viewer**, not X11 |
| VNC Easy fails | Confirm `bin\python\python.exe` + `bin\python-packages` websockify; check **Admin → Add-ons → VNC Gateway** |

---

## Quick reference

```text
Offline pack:  package-remote-widgets-runtime → install-remote-widgets-runtime -InstallDir …
HTTPS WSS:     enable-gateway-wss-proxy (once in SSL vhost, HTTP/1.1, no double proxy)
SSH Easy:      Host + Port + Username  OR  paste/copy ssh://
SSH save:      auto://… (internal)  |  tile link: ssh://…
VNC Easy:      Host + Port (5900)   |  tile link: vnc://…
Deps SSH:      bundled bin\ttyd.exe + bin\OpenSSH [+ VcXsrv for GUI]
Deps VNC:      bundled bin\python + websockify + VNC server on target
Admin:         Add-ons → SSH Gateway / VNC Gateway; Roles → Widgets
```
