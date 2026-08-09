# Remote Widgets Setup (SSH Terminal & VNC Viewer)

LinkNest includes two desktop floating widgets for remote access. Browsers cannot open raw SSH (`host:22`) or VNC (`host:5900`) directly, so each widget connects to a **local or network gateway** over WebSocket.

| Widget | Client | Gateway | Typical WebSocket URL |
|--------|--------|---------|------------------------|
| **SSH Terminal** | xterm.js (ttyd protocol) | [ttyd](https://github.com/tsl0922/ttyd) | `ws://localhost:7681/ws` |
| **VNC Viewer** | noVNC | [websockify](https://github.com/novnc/websockify) (or any RFB-over-WS proxy) | `ws://localhost:6080/websockify` |

Open the widgets from the navigation bar or **Ctrl+Shift+Y** (Widget Quick Access). Assign `ssh-terminal` / `vnc-viewer` on Roles → Widgets if you use role-based access.

**Security:** Passwords are never saved. Saved connections store name, URL, tags, and notes only. Prefer LAN / VPN; do not expose unauthenticated gateways to the public internet.

---

## SSH Terminal (ttyd)

### What you need

1. **OpenSSH Client** on the machine running ttyd (Windows Optional Feature, or Linux `openssh-client`)
2. **ttyd** gateway on that same machine
3. LinkNest SSH Terminal widget pointed at the ttyd WebSocket URL

### Install ttyd (Windows)

```powershell
winget install tsl0922.ttyd --source winget
```

Close and reopen the terminal so `PATH` updates. Confirm with `ttyd --version`.

### Recommended Windows command (validated)

Direct `ssh` without `-w` can fail on Windows with `CreateProcessW failed with error 267: The directory name is invalid.` Use an explicit working directory and full path to `ssh.exe`:

```powershell
ttyd -W -p 7681 -w $env:USERPROFILE C:\Windows\System32\OpenSSH\ssh.exe -tt zafar@192.168.127.134
```

| Flag / piece | Meaning |
|--------------|---------|
| `-W` | Allow clients to write (type into the session) |
| `-p 7681` | Listen port |
| `-w $env:USERPROFILE` | Valid working directory (avoids error 267) |
| Full path to `ssh.exe` | Avoids PATH / spawn issues under ConPTY |
| `-tt` | Force TTY so password prompts appear correctly |

If that still fails, wrap with `cmd`:

```powershell
ttyd -W -p 7681 -w $env:USERPROFILE cmd /c "C:\Windows\System32\OpenSSH\ssh.exe -tt user@host"
```

Smoke-test ttyd alone:

```powershell
ttyd -W -p 7681 -w $env:USERPROFILE cmd
```

### Linux / macOS

```bash
# Install (examples)
# Debian/Ubuntu: apt install ttyd
# macOS: brew install ttyd

ttyd -W -p 7681 ssh -tt user@192.168.127.134
```

### Connect in LinkNest

1. Open **SSH Terminal** from the nav (terminal icon)
2. Settings → WebSocket URL: `ws://localhost:7681/ws` (or `ws://host:7681/ws` from another machine)
3. **Connect** — type the SSH password when prompted
4. Optionally set **Name** / **Tags**, then **Save connection**

Saved connections:

- **Guests:** stored in this browser (`localStorage`)
- **Signed-in users:** synced to your account (SQLite)
- **Export / Import** JSON from the Saved panel (no secrets included)

### X11 forwarding (run Linux GUI apps on Windows)

The SSH Terminal widget is a **text terminal** (xterm.js). It cannot draw `xclock`, browsers, or other GUI windows inside the widget. To run Linux graphical apps and see them on **Windows**, use **X11 forwarding** so windows open on your desktop via a local X server.

```text
Linux GUI app  →  ssh -Y  →  Windows OpenSSH  →  VcXsrv / X410 / etc.
```

#### 1. Install and start an X server on Windows

Examples: [VcXsrv](https://sourceforge.net/projects/vcxsrv/), X410, or MobaXterm’s X server.

- Start VcXsrv (XLaunch). Typical choices: **Multiple windows**, **Start no client**, disable access control if on a trusted LAN (`-ac`), or allow your user.
- Default display is usually `127.0.0.1:0.0`.

#### 2. Enable X11 on the Linux SSH server

On the remote host (once, as root/admin):

```bash
# /etc/ssh/sshd_config
X11Forwarding yes
# optionally:
# X11DisplayOffset 10
# X11UseLocalhost yes

sudo systemctl restart sshd   # or: sudo service ssh restart
```

Install X clients as needed, e.g. `sudo apt install x11-apps` (provides `xclock`).

#### 3. Start ttyd with display + trusted X11 forward

In **PowerShell on Windows** (same machine as LinkNest / ttyd):

```powershell
$env:DISPLAY = "127.0.0.1:0.0"
ttyd -W -p 7681 -w $env:USERPROFILE C:\Windows\System32\OpenSSH\ssh.exe -Y -tt user@host
```

| Piece | Why |
|-------|-----|
| `$env:DISPLAY` | Tells Windows OpenSSH which local X server receives forwarded windows |
| `-Y` | Trusted X11 forwarding (use `-X` for untrusted if preferred) |
| `-tt` | Force TTY for password prompts |
| `-w` + full `ssh.exe` path | Avoids Windows CreateProcess error 267 |

Then connect LinkNest to `ws://localhost:7681/ws` as usual. After login, on the remote shell:

```bash
echo $DISPLAY    # should be something like localhost:10.0
xclock           # window should appear on Windows via VcXsrv
```

#### 4. If `Can't open display:` still appears

| Check | Action |
|-------|--------|
| VcXsrv not running | Start XLaunch; confirm tray icon |
| `DISPLAY` unset when starting ttyd | Set `$env:DISPLAY = "127.0.0.1:0.0"` **before** `ttyd` in the same PowerShell session |
| Used `-tt` only, no `-Y`/`-X` | Restart ttyd with `-Y` (or `-X`) |
| Remote `X11Forwarding no` | Fix `sshd_config` and restart sshd |
| Firewall / “Disable access control” | Allow local connections to VcXsrv |
| Want GUI **inside the browser** | Use the **VNC Viewer** widget instead (full remote desktop) |

**Note:** X11 apps appear as separate Windows on your PC — not inside the black SSH panel. That is expected.

### Troubleshooting (SSH)

| Symptom | Fix |
|---------|-----|
| `ttyd` not recognized | Install via winget; reopen terminal |
| Connected but blank terminal | Ensure LinkNest build includes the ttyd AuthToken handshake; Disconnect/Reconnect after updating the app |
| `CreateProcessW` error 267 | Use `-w $env:USERPROFILE` and full path to `ssh.exe` (see command above) |
| No password prompt | Add `ssh -tt`; ensure ttyd was started with `-W` |
| `Can't open display:` | Start VcXsrv; set `$env:DISPLAY`; use `ssh -Y`; enable `X11Forwarding yes` on Linux (see X11 section) |
| Cannot connect from another PC | Use the gateway host IP and allow port 7681 on the firewall; prefer `wss://` behind HTTPS |

---

## VNC Viewer (websockify + noVNC)

### What you need

1. A VNC server on the target (RealVNC, TightVNC, TigerVNC, x11vnc, etc.) — usually TCP **5900+**
2. **websockify** (or equivalent) bridging WebSocket ↔ VNC
3. LinkNest **VNC Viewer** widget with the websockify URL

### Example: websockify

```bash
# Python package (typical)
websockify --web /path/to/novnc 6080 localhost:5900
```

Or Docker (example):

```bash
docker run --rm -p 6080:6080 -e VNC_SERVER=192.168.1.50:5900 your-websockify-image
```

Exact flags depend on your websockify / noVNC packaging. The important part for LinkNest is a reachable WebSocket endpoint that speaks the RFB proxy protocol (often path `/websockify`).

### Connect in LinkNest

1. Open **VNC Viewer** from the nav
2. Settings → WebSocket URL: `ws://localhost:6080/websockify`
3. Enter VNC password if required (**session only — not saved**)
4. Optional: View only / Scale to fit
5. **Connect**, then **Save connection** with name and tags as needed

Same saved-connection pattern as SSH: filter, tags, export/import. Passwords are never written to storage.

### Troubleshooting (VNC)

| Symptom | Fix |
|---------|-----|
| Connection refused | Confirm VNC server and websockify are running; check host/port |
| Security / auth failure | Enter the VNC password and reconnect; check server auth mode |
| Black screen | Try Scale to fit off/on; confirm the remote display is not asleep |
| Works on gateway host only | Open firewall for the websockify port; use the correct LAN IP |

---

## Role access

Admins: all widgets. Others: enable **SSH Terminal** (`ssh-terminal`) and **VNC Viewer** (`vnc-viewer`) under **Admin → Roles → Widgets**. Guests can use both when allowed (connections stay local to the browser for SSH; VNC uses localStorage).

---

## Quick reference

```powershell
# Windows — SSH gateway (shell only)
winget install tsl0922.ttyd --source winget
ttyd -W -p 7681 -w $env:USERPROFILE C:\Windows\System32\OpenSSH\ssh.exe -tt user@host
# Widget URL: ws://localhost:7681/ws

# Windows — SSH + X11 (GUI apps appear on Windows desktop via VcXsrv)
# Start VcXsrv first, then:
$env:DISPLAY = "127.0.0.1:0.0"
ttyd -W -p 7681 -w $env:USERPROFILE C:\Windows\System32\OpenSSH\ssh.exe -Y -tt user@host
```

```text
VNC (typical) — GUI inside the browser widget
websockify … 6080 localhost:5900
# Widget URL: ws://localhost:6080/websockify
```
