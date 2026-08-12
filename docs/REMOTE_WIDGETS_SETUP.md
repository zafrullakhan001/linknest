# Remote Widgets Setup (SSH Terminal & VNC Viewer)

LinkNest includes two desktop floating widgets for remote access. Browsers cannot open raw SSH (`host:22`) or VNC; gateways run on the **LinkNest server PC**.

| Widget | Client | How you connect |
|--------|--------|-----------------|
| **SSH / RDP** | xterm.js + iframe | **SSH Easy:** host / port / username (LinkNest starts ttyd). **SSH Advanced:** ttyd WebSocket URL. **RDP:** paste a Guacamole / web RDP **https://** page URL (embedded in a tab). |
| **VNC Viewer** | noVNC | **Easy:** VNC host + port (LinkNest starts websockify). **Advanced:** existing websockify WebSocket URL. Multi-tab (up to 8). |

Open widgets from the navigation bar or **Ctrl+Shift+Y**. Assign `ssh-terminal` / `vnc-viewer` under Roles → Widgets if needed.

Also covered in **Help & About → Help → Remote Widgets**.

**Security:** Passwords are never saved. Prefer LAN / VPN; do not expose unauthenticated gateways publicly.

**Saved connections:** When signed in, VNC hosts sync to your account (name, URL / `auto-vnc://host:port`, tags, color, notes, view-only / scale options). Guests keep saves in the browser. Session passwords are never written to the DB or localStorage.

**PAM / privileged access:** Easy mode accepts long usernames with `\`, `+`, and custom ports (not only 22). Values are passed to OpenSSH with `ssh -l <username> -p <port> <host>` so special characters are not broken by `user@host` parsing. Saved connections percent-encode the username inside `auto://…`.

Example:
```
Host: pam.example.com
Port: 4489
Username: domain\user+target.domain\account+TARGETHOST
```

Or as a space link: `ssh://domain%5Cuser%2Btarget@pam.example.com:4489` (percent-encode `\` and `+` in the username).

**VNC space links:** Add a tile link like `vnc://192.168.1.50:5900` (default port `5900` if omitted). Clicking it opens the VNC Viewer widget and starts Easy mode (websockify) the same way `ssh://` opens the SSH Terminal.

**RDP (same widget):** In Settings choose protocol **RDP**, paste your gateway page URL (for example Apache Guacamole `https://guac.example.com/`), Save, then Connect. The page is embedded in a session tab. Log in with credentials in the gateway UI — LinkNest does not store RDP passwords. If the gateway sends `X-Frame-Options: DENY`, use “Open gateway in new tab” from the error state, or allow framing for your LinkNest origin.

---

## Required dependencies (install before use)

Install these on the **machine that runs LinkNest** (and the remote Linux host where noted).

### SSH Terminal

| Dependency | Required for | Windows install | Notes |
|------------|--------------|-----------------|-------|
| **ttyd** | Easy mode + Advanced gateway | Bundled as `bin/ttyd.exe` by `package-for-deployment.bat` (auto-downloads from GitHub via `scripts/ensure-ttyd-runtime.ps1`). Fallback: `winget install tsl0922.ttyd --source winget` | Prefer `bin/ttyd.exe`, or set path under **Admin → Add-ons → SSH Gateway**. Apache often cannot see WinGet PATH. |
| **OpenSSH Client** | All SSH sessions | Optional Features → *OpenSSH Client* | Default `C:\Windows\System32\OpenSSH\ssh.exe` — override in Admin if your install differs |
| **LinkNest login** | Easy mode (auto-start ttyd) | — | Guests can only use Advanced WebSocket URL mode |
| **VcXsrv** (or X410) | **Terminal + GUI (X11)** | `winget install marha.VcXsrv` or [VcXsrv](https://sourceforge.net/projects/vcxsrv/) | Start XLaunch → Multiple windows → Start no client before connecting |
| **Remote sshd X11** | GUI apps from Linux | On remote: `X11Forwarding yes` in `sshd_config`, restart sshd | Optional: `sudo apt install x11-apps` for `xclock` |

### Configurable paths (different servers / layouts)

If `ttyd` or `ssh` live somewhere non-standard, set full executable paths in **Admin → Add-ons → SSH Gateway**:

| Setting | Example (this host) | Purpose |
|---------|---------------------|---------|
| ttyd path | `C:\xampp\htdocs\linknest\bin\ttyd.exe` | Easy-mode gateway binary |
| OpenSSH path | `C:\Windows\System32\OpenSSH\ssh.exe` | Client invoked by ttyd |
| X11 display | `127.0.0.1:0.0` | Default `DISPLAY` for GUI mode |

Leave a path blank to auto-detect common locations (`bin/ttyd.exe`, WinGet packages, system OpenSSH). Clear invalid configured paths if Connect fails with “Configured … path was not found”.

API (admin session): `GET/PUT /api/ssh-gateway/config` with `{ ttydPath, sshPath, x11Display }`.

### Offline / air-gapped install (no internet on target)

On a PC that **can** download (this build machine), create a self-contained binary pack:

```powershell
.\scripts\package-remote-widgets-runtime.ps1
# or: .\scripts\package-remote-widgets-runtime.bat
```

That produces `linknest-remote-widgets-runtime-YYYYMMDD-HHMMSS.zip` containing:

| Component | Path in package |
|-----------|-----------------|
| ttyd | `bin/ttyd.exe` (+ Linux `ttyd.x86_64`) |
| OpenSSH client | `bin/OpenSSH/ssh.exe` |
| websockify | `bin/python-packages/` (use with system Python 3 on the target) |
| VcXsrv | `VcXsrv/` (copied from this PC if installed) |

Python is **not** included by default (install on the target). Pass `-IncludePython` only if you need the embeddable runtime in the ZIP.

Copy the ZIP to the restricted server, unzip, then run **as Administrator**:

```bat
install-remote-widgets-runtime.bat
REM or: powershell -File .\install-remote-widgets-runtime.ps1 -InstallDir C:\xampp\htdocs\linknest
```

Refresh **Admin → Add-ons → SSH Gateway / VNC Gateway** — statuses should show Ready/found. Start VcXsrv before using SSH Terminal + GUI.

### HTTPS Mixed Content (office / WSS on port 443)

Browsers block `ws://host:17681` when the UI is served over **https://** (Mixed Content). LinkNest fixes this by proxying WebSockets through Apache on **443**:

`wss://your-host/_ln_sshgw/<port>/ws` → local ttyd on `127.0.0.1:<port>`

On the **LinkNest XAMPP server** (run as Administrator once):

```bat
scripts\enable-gateway-wss-proxy.bat
```

Or (point `-InstallDir` at whatever folder you use — ArchLinks, ERP3, linknest, …):

```powershell
.\scripts\enable-gateway-wss-proxy.ps1 -XamppRoot C:\xampp -InstallDir C:\xampp\htdocs\ArchLinks -RestartApache
```

Then hard-refresh the browser and Connect again. Expected URL shape (base path is auto-detected):

- App at domain root: `wss://host/_ln_sshgw/17681/ws`
- App under `/ArchLinks`: `wss://host/ArchLinks/_ln_sshgw/17681/ws`
- App under `/ERP3`: `wss://host/ERP3/_ln_sshgw/17681/ws`

If WSS still fails, on the server verify:

1. `httpd -t` is OK and Apache was restarted after enabling the proxy  
2. ttyd is listening: `netstat -ano | findstr 17681` (should show `127.0.0.1:17681`)  
3. Local proxy works: `http://127.0.0.1/<YourFolder>/_ln_sshgw/17681/` on the server  
4. Any front load balancer must forward `/<YourFolder>/_ln_sshgw/` with WebSocket Upgrade headers  

Optional override if auto-detect misses the folder: setting `gateway_http_proxy_base` = `ArchLinks` (or `ERP3`, etc., no leading slash), or env `LINKNEST_GATEWAY_PROXY_BASE` / `VITE_BASE_PATH`.

Requires Apache modules: `rewrite`, `proxy`, `proxy_http`, `proxy_wstunnel` (the script enables them).

### VNC Viewer

| Dependency | Required for | Notes |
|------------|--------------|-------|
| **VNC server** on target | Desktop view | RealVNC, TightVNC, TigerVNC, x11vnc, etc. (often port 5900+) |
| **Python 3** + **websockify** | Easy mode | Install Python 3 on the server; websockify is vendored in the offline runtime pack (`bin/python-packages`) or via `scripts/install-websockify.ps1`. Or set paths under **Admin → Add-ons → VNC Gateway**. |
| **websockify** (manual) | Advanced mode only | Example: listen on `6080`, forward to `localhost:5900` |

#### VNC Easy mode (recommended)

Signed-in users can skip running websockify by hand:

1. Install **Python 3** and run `scripts/install-websockify.ps1` (or `python -m pip install --target=bin/python-packages websockify`)
2. Open **VNC Viewer** → Settings → **Easy (host / port)**
3. Enter the remote **host** and **VNC port** (default `5900`), optional password (session only), Connect
4. LinkNest starts websockify on a localhost port in **17881–17980** and opens noVNC against it
5. Closing the tab stops that websockify process

Saved Easy connections use `auto-vnc://host:port` (not the ephemeral `ws://` listen port).

#### VNC Advanced mode

1. Run websockify yourself (e.g. `:6080` → `:5900`)
2. In Settings → Advanced, paste `ws://localhost:6080/websockify` (or `wss://…`)
3. Connect

Admin API: `GET/PUT /api/vnc-gateway/config` with `{ pythonPath, websockifyPath }`.

### Quick verify (PowerShell on LinkNest host)

```powershell
ttyd --version
ssh -V
# For GUI mode, start VcXsrv first, then Easy mode → Terminal + GUI
```

---

## SSH Terminal — Easy mode (recommended)

Signed-in users can skip running ttyd by hand:

1. Install **ttyd** + **OpenSSH Client** (see table above)
2. Open **SSH Terminal** → **Easy (host / port)**
3. Enter **Host**, **Port** (default 22), **Username**
4. Click **Connect** — LinkNest starts ttyd, then opens the terminal WebSocket for you
5. Type the SSH password in the terminal when prompted

### GUI apps (X11 via the same Easy helper)

In Easy mode pick **Terminal + GUI (X11)**. LinkNest starts ttyd with `ssh -Y` and sets `DISPLAY` for you.

1. Install and start **VcXsrv** on the Windows PC (XLaunch → Multiple windows → Start no client)
2. On Linux: `X11Forwarding yes` in `sshd_config`, restart sshd  
3. Connect with GUI mode enabled  
4. Run e.g. `xclock` — the window opens on Windows via VcXsrv (not inside the SSH panel)

The widget status checks whether an X server is reachable on this PC and shows a ready/warning hint.

Disconnect stops the temporary ttyd process. You can still Save connections (stored as `auto://user@host:port`).

### Requirements checklist

- [ ] ttyd installed (`bin/ttyd.exe` or path set in Admin → Add-ons → SSH Gateway)
- [ ] OpenSSH Client installed (or custom ssh path configured)
- [ ] Signed in to LinkNest (for Easy mode)  
- [ ] Browser can reach the server’s ttyd listen port (usually `17681–17780`)  
- [ ] For GUI: VcXsrv running + remote `X11Forwarding yes`

### Manual ttyd (Advanced / guests)

```powershell
ttyd -W -p 7681 -w $env:USERPROFILE C:\Windows\System32\OpenSSH\ssh.exe -tt user@host
```

Then use **Advanced (WebSocket URL)** → `ws://localhost:7681/ws`.

For GUI manually:

```powershell
$env:DISPLAY = "127.0.0.1:0.0"
ttyd -W -p 7681 -w $env:USERPROFILE C:\Windows\System32\OpenSSH\ssh.exe -Y -tt user@host
```

---

## SSH Terminal (manual gateway details)

### Recommended Windows command (validated)

```powershell
ttyd -W -p 7681 -w $env:USERPROFILE C:\Windows\System32\OpenSSH\ssh.exe -tt zafar@192.168.127.134
```

| Flag / piece | Meaning |
|--------------|---------|
| `-W` | Writable session |
| `-p 7681` | Listen port |
| `-w $env:USERPROFILE` | Avoids CreateProcess error 267 |
| Full path to `ssh.exe` | Reliable under ConPTY |
| `-tt` | Force TTY for password prompts |

### Troubleshooting (SSH)

| Symptom | Fix |
|---------|-----|
| Easy mode: ttyd not found | Install ttyd; copy to `bin/ttyd.exe` or set path in **Admin → Add-ons → SSH Gateway**; retry Connect |
| Easy mode: configured path missing | Fix or clear ttyd/ssh paths in Admin → Add-ons → SSH Gateway |
| Easy mode: failed to start | OpenSSH Client installed; PHP allowed to spawn processes; use full `ssh.exe` path |
| `CreateProcessW` 267 (manual) | Use `-w $env:USERPROFILE` + full `ssh.exe` path |
| `Can't open display:` | Start VcXsrv; use **Terminal + GUI**; remote `X11Forwarding yes` |
| Want GUI in the browser | Use **VNC Viewer** instead |

---

## VNC Viewer (websockify + noVNC)

1. Run a VNC server on the target  
2. Bridge with websockify (example port `6080`)  
3. In the widget: `ws://localhost:6080/websockify`  

Passwords are session-only. Tags, filter, and export/import work like SSH.

---

## Role access

Enable **SSH Terminal** (`ssh-terminal`) and **VNC Viewer** (`vnc-viewer`) under **Admin → Roles → Widgets**.

---

## Quick reference

```text
Deps (SSH):  ttyd + OpenSSH Client [+ VcXsrv for GUI]
Deps (VNC):  VNC server + websockify
Easy:        Host + Port + Username → Connect
GUI:         Easy → Terminal + GUI (X11) + VcXsrv running
Advanced:    ws://localhost:7681/ws after manual ttyd
VNC:         ws://localhost:6080/websockify
```
