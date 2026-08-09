# Remote Widgets Setup (SSH Terminal & VNC Viewer)

LinkNest includes two desktop floating widgets for remote access. Browsers cannot open raw SSH (`host:22`) or VNC; gateways run on the **LinkNest server PC**.

| Widget | Client | How you connect |
|--------|--------|-----------------|
| **SSH Terminal** | xterm.js | **Easy:** host / port / username (LinkNest starts ttyd). **Advanced:** paste a ttyd WebSocket URL. |
| **VNC Viewer** | noVNC | websockify (or similar) WebSocket URL |

Open widgets from the navigation bar or **Ctrl+Shift+Y**. Assign `ssh-terminal` / `vnc-viewer` under Roles → Widgets if needed.

Also covered in **Help & About → Help → Remote Widgets**.

**Security:** Passwords are never saved. Prefer LAN / VPN; do not expose unauthenticated gateways publicly.

---

## Required dependencies (install before use)

Install these on the **machine that runs LinkNest** (and the remote Linux host where noted).

### SSH Terminal

| Dependency | Required for | Windows install | Notes |
|------------|--------------|-----------------|-------|
| **ttyd** | Easy mode + Advanced gateway | `winget install tsl0922.ttyd --source winget` | Prefer copying to `bin/ttyd.exe`, or set path under **Admin → Add-ons → SSH Gateway**. Apache often cannot see WinGet PATH. |
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

### VNC Viewer

| Dependency | Required for | Notes |
|------------|--------------|-------|
| **VNC server** on target | Desktop view | RealVNC, TightVNC, TigerVNC, x11vnc, etc. (often port 5900+) |
| **websockify** (or equivalent) | Browser bridge | Example: listen on `6080`, forward to `localhost:5900` |

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
