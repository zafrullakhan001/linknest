"""
Shared library for LinkNest external workers (Python 3.9+).

- Uses only Python standard library
- Designed for Windows Task Scheduler / cron usage
"""

from __future__ import annotations

import base64
import contextlib
import datetime as _dt
import email.utils
import html as _html
import json
import os
import sys
import re
import socket
import sqlite3
import ssl
import subprocess
import time
import urllib.request
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


DEFAULT_DB_PATH = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "data", "linknest.db"))


def now_ts() -> int:
    return int(time.time())


def open_db(db_path: str, timeout_seconds: int = 10) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=timeout_seconds)
    conn.row_factory = sqlite3.Row
    with contextlib.suppress(Exception):
        conn.execute("PRAGMA busy_timeout = 5000")
    with contextlib.suppress(Exception):
        conn.execute("PRAGMA foreign_keys = OFF")
    return conn


def ensure_outbox_schema(conn: sqlite3.Connection) -> None:
    # In case DB was created before the PHP migration ran.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS email_outbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at INTEGER NOT NULL,
            send_after INTEGER,
            monitor_id INTEGER,
            rule_id INTEGER,
            status_trigger TEXT,
            to_emails TEXT NOT NULL,
            cc_emails TEXT,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            from_name TEXT,
            from_email TEXT,
            attempts INTEGER DEFAULT 0,
            max_attempts INTEGER DEFAULT 3,
            last_error TEXT,
            sent_at INTEGER,
            success INTEGER,
            legacy_clear_pending INTEGER DEFAULT 0,
            legacy_update_last_notified_status TEXT
        )
        """
    )
    with contextlib.suppress(Exception):
        conn.execute("CREATE INDEX IF NOT EXISTS idx_email_outbox_sent_at ON email_outbox(sent_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_email_outbox_created_at ON email_outbox(created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_email_outbox_monitor_id ON email_outbox(monitor_id)")


def ensure_monitors_schema(conn: sqlite3.Connection) -> None:
    # Make sure new monitor fields exist (safe to call multiple times).
    # Older DBs may not have these columns/tables yet.
    # Note: PHP migrations also add these columns; we mirror them here so the
    # standalone Python workers remain compatible with older databases.
    with contextlib.suppress(Exception):
        conn.execute("ALTER TABLE monitors ADD COLUMN warning_threshold INTEGER DEFAULT 1")
    with contextlib.suppress(Exception):
        conn.execute("ALTER TABLE monitors ADD COLUMN consecutive_failures INTEGER DEFAULT 0")
    with contextlib.suppress(Exception):
        conn.execute("ALTER TABLE monitors ADD COLUMN timeout INTEGER")
    with contextlib.suppress(Exception):
        conn.execute("ALTER TABLE monitors ADD COLUMN permissions_mode INTEGER DEFAULT 0")
    with contextlib.suppress(Exception):
        conn.execute("ALTER TABLE monitors ADD COLUMN legacy_email_disabled INTEGER DEFAULT 0")
    with contextlib.suppress(Exception):
        conn.execute("ALTER TABLE monitors ADD COLUMN legacy_email_to TEXT")
    with contextlib.suppress(Exception):
        conn.execute("ALTER TABLE monitors ADD COLUMN legacy_email_cc TEXT")
    with contextlib.suppress(Exception):
        conn.execute("ALTER TABLE monitors ADD COLUMN legacy_email_from_name TEXT")
    with contextlib.suppress(Exception):
        conn.execute("ALTER TABLE monitors ADD COLUMN legacy_email_from_email TEXT")
    with contextlib.suppress(Exception):
        conn.execute("ALTER TABLE monitors ADD COLUMN legacy_email_subject_template TEXT")
    with contextlib.suppress(Exception):
        conn.execute("ALTER TABLE monitors ADD COLUMN legacy_email_body_template TEXT")

    with contextlib.suppress(Exception):
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_monitor_permissions (
              user_id INTEGER NOT NULL,
              monitor_id INTEGER NOT NULL,
              can_view INTEGER DEFAULT 1,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              PRIMARY KEY (user_id, monitor_id)
            )
            """
        )

    with contextlib.suppress(Exception):
        conn.execute("CREATE INDEX IF NOT EXISTS idx_monitors_permissions_mode ON monitors(permissions_mode)")
    with contextlib.suppress(Exception):
        conn.execute("CREATE INDEX IF NOT EXISTS idx_user_monitor_permissions_monitor_id ON user_monitor_permissions(monitor_id)")
    with contextlib.suppress(Exception):
        conn.execute("CREATE INDEX IF NOT EXISTS idx_user_monitor_permissions_user_id ON user_monitor_permissions(user_id)")


def normalize_email_list(raw: Any) -> List[str]:
    if raw is None:
        return []
    if isinstance(raw, (list, tuple)):
        parts = [str(x) for x in raw]
    else:
        parts = re.split(r"[,\n]+", str(raw))
    out: List[str] = []
    seen = set()
    for p in parts:
        e = p.strip()
        if not e:
            continue
        if not is_valid_email_local(e):
            continue
        k = e.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(e)
    return out


def is_valid_email_local(email: str) -> bool:
    email = email.strip()
    if not email or "@" not in email:
        return False
    # Basic, permissive validation (matches PHP behavior allowing localhost / loopback domains)
    return bool(re.match(r"^[^\s@]+@([^\s@]+\.[^\s@]+|localhost|127\.0\.0\.1|::1)$", email, re.I))


def load_settings(conn: sqlite3.Connection, prefix: str) -> Dict[str, str]:
    rows = conn.execute("SELECT key, value FROM settings WHERE key LIKE ?", (f"{prefix}%",)).fetchall()
    out: Dict[str, str] = {}
    for r in rows:
        k = str(r["key"])
        v = "" if r["value"] is None else str(r["value"])
        out[k] = v
    return out


def get_smtp_config(conn: sqlite3.Connection) -> Dict[str, Any]:
    raw = load_settings(conn, "smtp_")
    cfg: Dict[str, Any] = {}
    for k, v in raw.items():
        cfg[k.replace("smtp_", "", 1)] = v
    if "password" in cfg and cfg["password"]:
        # PHP stores base64-encoded
        with contextlib.suppress(Exception):
            cfg["password"] = base64.b64decode(cfg["password"]).decode("utf-8", errors="replace")
    return cfg


def notifications_paused(conn: sqlite3.Connection, *, default_on_error: bool = True) -> bool:
    """
    Mirror PHP: global boolean + legacy pause window.

    IMPORTANT: This function is used by both monitor and email workers. If the settings table
    is missing/locked/unavailable, we default to "paused" (default_on_error=True) to avoid
    accidentally sending/queueing notifications, while still allowing monitoring status updates.
    """
    try:
        row = conn.execute("SELECT value FROM settings WHERE key = 'notifications_paused'").fetchone()
        if row:
            v = str(row["value"]).strip().lower()
            if v in ("1", "true", "yes", "on"):
                return True

        rows = conn.execute(
            "SELECT key, value FROM settings WHERE key IN ('smtp_pause_start', 'smtp_pause_end')"
        ).fetchall()
        kv = {str(r["key"]): (None if r["value"] is None else str(r["value"])) for r in rows}
        start = kv.get("smtp_pause_start")
        end = kv.get("smtp_pause_end")
        if not start or not end:
            return False
        try:
            start_ts = int(time.mktime(time.strptime(start, "%Y-%m-%d %H:%M:%S")))
            end_ts = int(time.mktime(time.strptime(end, "%Y-%m-%d %H:%M:%S")))
        except Exception:
            return False
        t = now_ts()
        return start_ts <= t <= end_ts
    except Exception:
        return bool(default_on_error)


def is_in_maintenance_window(monitor_row: sqlite3.Row) -> bool:
    ms = monitor_row["maintenance_start"]
    me = monitor_row["maintenance_end"]
    if not ms or not me:
        return False
    t = now_ts()
    try:
        return int(ms) <= t <= int(me)
    except Exception:
        return False


def replace_template_vars(template: str, monitor_row: sqlite3.Row, status: str, details: str, response_ms: Optional[int]) -> str:
    if template is None:
        template = ""
    rep = {
        "{monitor_name}": str(monitor_row["name"]),
        "{monitor_type}": str(monitor_row["type"]),
        "{monitor_target}": str(monitor_row["target"]),
        "{status}": status.upper(),
        "{details}": details if details is not None else "N/A",
        "{response_time}": (f"{response_ms} ms" if response_ms is not None else "N/A"),
        "{time}": _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "{date}": _dt.datetime.now().strftime("%Y-%m-%d"),
        "{timestamp}": str(now_ts()),
    }
    out = template
    for k, v in rep.items():
        out = out.replace(k, v)
    return out


def parse_hhmm(s: str) -> Optional[int]:
    if not s:
        return None
    m = re.match(r"^([01]?\d|2[0-3]):([0-5]\d)$", s.strip())
    if not m:
        return None
    return int(m.group(1)) * 60 + int(m.group(2))


def time_window_active(start_hhmm: Optional[str], end_hhmm: Optional[str], now_local: Optional[_dt.datetime] = None) -> bool:
    if not start_hhmm or not end_hhmm:
        return True
    start_m = parse_hhmm(start_hhmm)
    end_m = parse_hhmm(end_hhmm)
    if start_m is None or end_m is None:
        return True
    if now_local is None:
        now_local = _dt.datetime.now()
    cur_m = now_local.hour * 60 + now_local.minute
    if end_m < start_m:
        return cur_m >= start_m or cur_m <= end_m
    return start_m <= cur_m <= end_m


def day_of_week_active(days_csv: Optional[str], now_local: Optional[_dt.datetime] = None) -> bool:
    if not days_csv:
        return True
    if now_local is None:
        now_local = _dt.datetime.now()
    # Python: Monday=0, Sunday=6; PHP uses 0=Sunday ... 6=Saturday
    php_dow = (now_local.weekday() + 1) % 7
    active = set()
    for p in str(days_csv).split(","):
        p = p.strip()
        if not p:
            continue
        with contextlib.suppress(Exception):
            active.add(int(p))
    return php_dow in active


@dataclass
class CheckResult:
    status: str
    details: str
    response_ms: int


def _ssl_context(verify_ssl: bool) -> ssl.SSLContext:
    if verify_ssl:
        return ssl.create_default_context()
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def check_url_head(url: str, timeout: float, verify_ssl: bool) -> Tuple[str, str]:
    if not re.match(r"^https?://", url, re.I):
        return "down", "Invalid URL"
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "LinkNest Monitor/1.0", "Connection": "close"})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_ssl_context(verify_ssl)) as resp:
            code = getattr(resp, "status", None) or resp.getcode()
            if 200 <= int(code) < 400:
                return "up", f"HTTP {code}"
            return "down", f"HTTP {code}"
    except Exception as e:
        msg = str(e) or e.__class__.__name__
        if "timed out" in msg.lower():
            return "down", "Connection timeout"
        return "down", f"Connection failed: {msg}"


def check_keyword(url: str, keyword: str, timeout: float, verify_ssl: bool, max_bytes: int = 1024 * 1024) -> Tuple[str, str]:
    if not re.match(r"^https?://", url, re.I):
        return "down", "Invalid URL"
    if not keyword:
        return "down", "No keyword specified"
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "LinkNest Monitor/1.0", "Connection": "close"})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_ssl_context(verify_ssl)) as resp:
            code = getattr(resp, "status", None) or resp.getcode()
            if not (200 <= int(code) < 400):
                return "down", f"HTTP {code}"
            data = resp.read(max_bytes)
            try:
                text = data.decode("utf-8", errors="ignore")
            except Exception:
                text = str(data)
            if keyword.lower() in text.lower():
                return "up", f"Keyword found (HTTP {code})"
            return "down", f"Keyword '{keyword}' not found"
    except Exception as e:
        msg = str(e) or e.__class__.__name__
        if "timed out" in msg.lower():
            return "down", "Connection timeout"
        return "down", f"Connection failed: {msg}"


def check_port(target: str, port: int, timeout: float) -> Tuple[str, str]:
    if not target or not port:
        return "down", "Target and port are required"
    try:
        port_i = int(port)
    except Exception:
        return "down", "Invalid port number"
    if port_i < 1 or port_i > 65535:
        return "down", "Invalid port number"

    host = target.strip()
    # Extract host from URL if needed
    m = re.match(r"^https?://([^/]+)", host, re.I)
    if m:
        host = m.group(1)
        host = host.split("@")[-1]
        host = host.split(":")[0]

    try:
        with socket.create_connection((host, port_i), timeout=timeout):
            return "up", f"Port {port_i} open"
    except Exception as e:
        msg = str(e) or e.__class__.__name__
        if "timed out" in msg.lower():
            return "down", "Connection timeout"
        return "down", f"Connection refused: {msg}"


def check_ping(target: str, timeout_ms: int = 1000) -> Tuple[str, str]:
    host = (target or "").strip()
    if not host:
        return "down", "Target is required"

    # Extract host from URL if needed
    m = re.match(r"^https?://([^/]+)", host, re.I)
    if m:
        host = m.group(1)
        host = host.split("@")[-1]
        host = host.split(":")[0] if host.count(":") == 0 else host

    host = host.strip()
    if not host or len(host) > 255:
        return "down", "Invalid host"
    if not re.match(r"^[a-zA-Z0-9\.\-:]+$", host):
        return "down", "Invalid host format"

    try:
        tms = int(timeout_ms)
    except Exception:
        tms = 1000
    tms = max(250, min(60000, tms))

    is_windows = (os.name == "nt")
    is_darwin = (sys.platform == "darwin")

    if is_windows:
        cmd = ["ping", "-n", "1", "-w", str(tms), host]
        timeout_seconds = max(2, int((tms / 1000.0) + 2))
    elif is_darwin:
        # macOS: -W is milliseconds
        cmd = ["ping", "-c", "1", "-W", str(tms), host]
        timeout_seconds = max(2, int((tms / 1000.0) + 2))
    else:
        # Linux: -W is seconds
        sec = max(1, int((tms + 999) / 1000))
        cmd = ["ping", "-c", "1", "-W", str(sec), host]
        timeout_seconds = max(2, sec + 2)

    try:
        cp = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_seconds)
    except FileNotFoundError:
        return "down", "Ping command not available"
    except subprocess.TimeoutExpired:
        return "down", "Connection timeout"
    except Exception as e:
        return "down", f"Ping failed: {e}"

    if cp.returncode == 0:
        return "up", "Ping OK"

    err = (cp.stderr or "").strip() or (cp.stdout or "").strip() or "No response"
    if len(err) > 180:
        err = err[:180] + "..."
    return "down", f"Ping failed: {err}"


def send_smtp_email(
    *,
    smtp_cfg: Dict[str, Any],
    to_list: Sequence[str],
    cc_list: Sequence[str],
    subject: str,
    body: str,
    html_body: Optional[str] = None,
    from_name: Optional[str],
    from_email: Optional[str],
    timeout_seconds: int = 20,
) -> Tuple[bool, Optional[str]]:
    enabled = str(smtp_cfg.get("enabled", "")).strip().lower()
    if enabled not in ("1", "true"):
        return False, "SMTP disabled"

    host = str(smtp_cfg.get("host", "")).strip()
    if not host:
        return False, "Missing SMTP host"
    port = int(smtp_cfg.get("port") or 587)
    encryption = str(smtp_cfg.get("encryption") or "tls").strip().lower()
    username = str(smtp_cfg.get("username", "") or "")
    password = str(smtp_cfg.get("password", "") or "")

    fe = (from_email or smtp_cfg.get("from_email") or "").strip()
    fn = (from_name or smtp_cfg.get("from_name") or "LinkNest Monitor").strip()
    if not fe:
        return False, "Missing from_email"

    all_rcpt = list(dict.fromkeys([*(to_list or []), *(cc_list or [])]))
    if not all_rcpt:
        return False, "No valid recipients (To/CC)"

    msg = EmailMessage()
    msg["Date"] = email.utils.formatdate(localtime=True)
    msg["From"] = email.utils.formataddr((fn, fe))
    msg["To"] = ", ".join(to_list)
    if cc_list:
        msg["Cc"] = ", ".join(cc_list)
    msg["Subject"] = subject
    msg.set_content(body or "")
    if html_body:
        # Provide an HTML alternative (many clients prefer this), while keeping the plain-text fallback.
        msg.add_alternative(str(html_body), subtype="html")

    try:
        import smtplib

        if encryption == "ssl":
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, timeout=timeout_seconds, context=ctx) as s:
                s.ehlo()
                if username and password:
                    s.login(username, password)
                s.send_message(msg, from_addr=fe, to_addrs=all_rcpt)
        else:
            with smtplib.SMTP(host, port, timeout=timeout_seconds) as s:
                s.ehlo()
                if encryption == "tls":
                    ctx = ssl.create_default_context()
                    s.starttls(context=ctx)
                    s.ehlo()
                if username and password:
                    s.login(username, password)
                s.send_message(msg, from_addr=fe, to_addrs=all_rcpt)
        return True, None
    except Exception as e:
        return False, str(e) or e.__class__.__name__


def _ln_accent_for_status(status: str) -> str:
    s = (status or "").strip().lower()
    if s == "up":
        return "#10b981"
    if s == "down":
        return "#ef4444"
    if s == "warning":
        return "#f59e0b"
    return "#0ea5e9"


def _ln_html_escape(v: object) -> str:
    return _html.escape("" if v is None else str(v), quote=True)


def _ln_nl2br_escaped(text: str) -> str:
    # Escape first, then convert line breaks
    return _ln_html_escape(text).replace("\r\n", "\n").replace("\r", "\n").replace("\n", "<br/>")


def ln_email_base_layout(title: str, subtitle: str, accent_hex: str, inner_html: str, preheader: str = "") -> str:
    accent = accent_hex if re.match(r"^#[0-9a-fA-F]{6}$", accent_hex or "") else "#4f46e5"
    safe_title = _ln_html_escape(title)
    safe_subtitle = _ln_html_escape(subtitle)
    safe_preheader = _ln_html_escape(preheader)
    # Table-based layout for wide email client support (mirrors PHP template styling)
    return f"""<!doctype html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{safe_title}</title>
</head>
<body style="margin:0;padding:0;background:#f6f7fb;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{safe_preheader}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f6f7fb;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:600px;max-width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 25px rgba(15,23,42,0.06);">
          <tr>
            <td style="background:{accent};padding:28px 28px 22px 28px;">
              <div style="font-family:Segoe UI,Arial,sans-serif;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:0.2px;line-height:1.2;">{safe_title}</div>
              <div style="font-family:Segoe UI,Arial,sans-serif;color:rgba(255,255,255,0.9);font-size:13px;font-weight:600;margin-top:6px;line-height:1.4;">{safe_subtitle}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 10px 28px;">
              {inner_html}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 24px 28px;border-top:1px solid #eef2ff;">
              <div style="font-family:Segoe UI,Arial,sans-serif;color:#64748b;font-size:12px;line-height:1.4;">
                Sent by LinkNest Monitoring • {_ln_html_escape(_dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))}
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def ln_render_monitor_notification_html(
    *,
    monitor_name: str,
    target: str,
    status: str,
    subject: str,
    message_text: str,
    response_time_ms: Optional[object] = None,
) -> str:
    """
    Render a styled HTML email similar to the PHP legacy template.
    Works for both legacy and rule-based notifications by placing the template-rendered message
    into a "Message" section.
    """
    status_label = (status or "").strip().upper() or "UNKNOWN"
    accent = _ln_accent_for_status(status)
    pill_bg = accent

    safe_message = _ln_nl2br_escaped(message_text or "")
    safe_subject = _ln_html_escape(subject)

    # Basic "details card" with monitor metadata + message block
    inner = f"""
      <div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div style="font-size:18px;font-weight:900;margin:0;">{_ln_html_escape(monitor_name or "Monitor")}</div>
          <div>
            <span style="display:inline-block;background:{pill_bg};color:#fff;padding:6px 12px;border-radius:999px;font-weight:900;font-size:12px;letter-spacing:0.6px;">{_ln_html_escape(status_label)}</span>
          </div>
        </div>

        <div style="margin-top:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:14px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="font-size:13px;color:#334155;padding:4px 0;"><strong>Target</strong></td>
              <td style="font-size:13px;color:#334155;padding:4px 0;" align="right">{_ln_html_escape(target or "N/A")}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#334155;padding:4px 0;"><strong>Response time</strong></td>
              <td style="font-size:13px;color:#334155;padding:4px 0;" align="right">{_ln_html_escape(str(response_time_ms) if response_time_ms not in (None, "") else "N/A")}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#334155;padding:4px 0;"><strong>Time</strong></td>
              <td style="font-size:13px;color:#334155;padding:4px 0;" align="right">{_ln_html_escape(_dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))}</td>
            </tr>
          </table>
        </div>

        <div style="margin-top:16px;">
          <div style="font-size:13px;font-weight:900;color:#0f172a;margin-bottom:8px;">Subject</div>
          <div style="background:#ffffff;border:1px solid #e2e8f0;border-left:5px solid {accent};border-radius:14px;padding:12px 14px;font-size:13px;line-height:1.6;color:#334155;">{safe_subject}</div>
        </div>

        <div style="margin-top:16px;">
          <div style="font-size:13px;font-weight:900;color:#0f172a;margin-bottom:8px;">Message</div>
          <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:12px 14px;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;font-size:12px;line-height:1.6;color:#0f172a;">{safe_message}</div>
        </div>
      </div>
    """
    pre = f"{status_label} - {monitor_name}"
    return ln_email_base_layout("Monitor Status Update", "Rule-based notification email", accent, inner, preheader=pre)

