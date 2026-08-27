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
    """
    Mirror PHP getSMTPConfig():
    Prioritize the active server in 'smtp_servers' table, fallback to legacy 'settings' table.
    """
    try:
        # Check if table exists first (in case migration didn't run yet)
        table_check = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='smtp_servers'").fetchone()
        if table_check:
            row = conn.execute("SELECT * FROM smtp_servers WHERE is_active = 1 LIMIT 1").fetchone()
            if row:
                cfg = {
                    "host": row["host"],
                    "port": row["port"],
                    "username": row["username"],
                    "password": row["password"],
                    "from_email": row["from_email"],
                    "from_name": row["from_name"],
                    "encryption": row["encryption"],
                    "enabled": "1" if int(row["is_enabled"] or 0) == 1 else "0",
                    "pause_start": row["pause_start"],
                    "pause_end": row["pause_end"]
                }
                if cfg.get("password"):
                    with contextlib.suppress(Exception):
                        cfg["password"] = base64.b64decode(cfg["password"]).decode("utf-8", errors="replace")
                return cfg
    except Exception:
        pass

    # Fallback to legacy settings table
    raw = load_settings(conn, "smtp_")
    cfg = {}
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
        # Check global pause flag first (simple boolean toggle)
        row = conn.execute("SELECT value FROM settings WHERE key = 'notifications_paused'").fetchone()
        if row:
            v = str(row["value"]).strip().lower()
            if v in ("1", "true", "yes", "on"):
                return True

        # Check time-based pause window from active SMTP server
        # Mirroring PHP logic: getSMTPConfig() -> check pause_start/pause_end
        cfg = get_smtp_config(conn)
        start = cfg.get("pause_start")
        end = cfg.get("pause_end")
        
        if not start or not end:
            return False
            
        try:
            # Format: 'YYYY-MM-DD HH:MM:SS' or just 'HH:MM'
            # If it's a date-time string:
            if len(start) > 5:
                start_ts = int(time.mktime(time.strptime(start, "%Y-%m-%d %H:%M:%S")))
                end_ts = int(time.mktime(time.strptime(end, "%Y-%m-%d %H:%M:%S")))
                t = now_ts()
                return start_ts <= t <= end_ts
            else:
                # If it's just HH:MM (unlikely but possible based on some UI iterations)
                return time_window_active(start, end)
        except Exception:
            return False
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


def replace_template_vars(template: str, monitor_row: sqlite3.Row, status: str, details: str, response_ms: Optional[int], app_name: str = "LinkNest") -> str:
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
        "{app_name}": app_name,
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


def get_monitor_notification_dst_enabled(conn: Optional[sqlite3.Connection] = None) -> bool:
    if conn is None:
        return True
    with contextlib.suppress(Exception):
        row = conn.execute(
            "SELECT value FROM settings WHERE key = 'monitor_notification_dst_correction' LIMIT 1"
        ).fetchone()
        if row and str(row[0]).strip() == "0":
            return False
    return True


def _standard_offset_seconds(tz_name: str, year: int) -> int:
    from zoneinfo import ZoneInfo

    zi = ZoneInfo(tz_name)
    offsets: List[int] = []
    for month in (1, 4, 7, 10):
        dt = _dt.datetime(year, month, 15, 12, 0, tzinfo=zi)
        off = dt.utcoffset()
        offsets.append(int(off.total_seconds()) if off is not None else 0)
    return min(offsets)


def get_monitor_notification_timezone(conn: Optional[sqlite3.Connection] = None) -> str:
    tz = ""
    if conn is not None:
        with contextlib.suppress(Exception):
            row = conn.execute(
                "SELECT value FROM settings WHERE key = 'monitor_notification_timezone' LIMIT 1"
            ).fetchone()
            if row and row[0]:
                tz = str(row[0]).strip()
    if tz:
        try:
            from zoneinfo import ZoneInfo
            ZoneInfo(tz)
            return tz
        except Exception:
            pass
    local = _dt.datetime.now().astimezone()
    key = getattr(local.tzinfo, "key", None)
    if key:
        return str(key)
    return "UTC"


def monitor_notification_now(conn: Optional[sqlite3.Connection] = None) -> _dt.datetime:
    tz_name = get_monitor_notification_timezone(conn)
    try:
        from zoneinfo import ZoneInfo

        zi = ZoneInfo(tz_name)
        utc = _dt.datetime.now(_dt.timezone.utc)
        if conn is not None and not get_monitor_notification_dst_enabled(conn):
            std = _standard_offset_seconds(tz_name, utc.year)
            local_naive = utc + _dt.timedelta(seconds=std)
            return local_naive.replace(tzinfo=None)
        return utc.astimezone(zi)
    except Exception:
        return _dt.datetime.now()


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


def check_url_head(url: str, timeout: float, verify_ssl: bool, app_name: str = "LinkNest") -> Tuple[str, str]:
    if not re.match(r"^https?://", url, re.I):
        return "down", "Invalid URL"
    ua = f"{app_name} Monitor/1.0"
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": ua, "Connection": "close"})
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


def check_keyword(url: str, keyword: str, timeout: float, verify_ssl: bool, max_bytes: int = 1024 * 1024, app_name: str = "LinkNest") -> Tuple[str, str]:
    if not re.match(r"^https?://", url, re.I):
        return "down", "Invalid URL"
    if not keyword:
        return "down", "No keyword specified"
    ua = f"{app_name} Monitor/1.0"
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": ua, "Connection": "close"})
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


def check_ssl(target: str, warn_days_raw: Optional[str], timeout: float = 8.0) -> Tuple[str, str]:
    host = (target or "").strip()
    port = 443

    m = re.match(r"^https?://([^/]+)", host, re.I)
    if m:
        host_part = m.group(1)
        host_part = host_part.split("@")[-1]
        if ":" in host_part:
            h, p = host_part.rsplit(":", 1)
            if p.isdigit():
                host, port = h, int(p)
            else:
                host = host_part
        else:
            host = host_part
    else:
        host = re.sub(r"^https?://", "", host, flags=re.I)
        host = host.split("/")[0]
        if ":" in host:
            h, p = host.rsplit(":", 1)
            if p.isdigit():
                host, port = h, int(p)

    if not host or not re.match(r"^[a-zA-Z0-9\.\-:]+$", host):
        return "down", "Invalid host for SSL check"

    warn_days = 30
    if warn_days_raw is not None and str(warn_days_raw).strip() != "":
        try:
            warn_days = max(1, min(365, int(warn_days_raw)))
        except Exception:
            warn_days = 30

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    try:
        with socket.create_connection((host, port), timeout=timeout) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as ssock:
                cert_bin = ssock.getpeercert(binary_form=True)
        if not cert_bin:
            return "down", "Could not read SSL certificate"
        # Parse expiry from DER via ssl module getpeercert after wrap - use dict form
        with socket.create_connection((host, port), timeout=timeout) as sock2:
            with ctx.wrap_socket(sock2, server_hostname=host) as ssock2:
                cert = ssock2.getpeercert()
        if not cert or "notAfter" not in cert:
            return "down", "Invalid certificate data"
        from datetime import datetime
        expiry = datetime.strptime(cert["notAfter"], "%b %d %H:%M:%S %Y %Z")
        days_remaining = (expiry - datetime.utcnow()).days
        if days_remaining < 0:
            return "down", f"Certificate expired {abs(days_remaining)} days ago"
        if days_remaining <= warn_days:
            return "down", f"Certificate expires in {days_remaining} days (threshold: {warn_days})"
        return "up", f"Certificate valid ({days_remaining} days remaining)"
    except Exception as e:
        msg = str(e) or e.__class__.__name__
        return "down", f"SSL connection failed: {msg}"


def check_dns(target: str, expected: Optional[str] = None) -> Tuple[str, str]:
    host = (target or "").strip()
    host = re.sub(r"^https?://", "", host, flags=re.I)
    host = host.split("/")[0].split(":")[0]

    if not host or not re.match(r"^[a-zA-Z0-9]([a-zA-Z0-9\.\-]*[a-zA-Z0-9])?$", host):
        return "down", "Invalid hostname for DNS check"

    try:
        import ipaddress
        ipaddress.ip_address(host)
        return "up", "Target is an IP address (DNS lookup skipped)"
    except Exception:
        pass

    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as e:
        return "down", f"No DNS records found: {e}"

    ips = list(dict.fromkeys([x[4][0] for x in infos if x and x[4]]))
    if not ips:
        return "down", "No DNS records found"

    exp = (expected or "").strip()
    if exp:
        found = any(ip == exp or exp.lower() in ip.lower() for ip in ips)
        if not found:
            return "down", f"Expected '{exp}' not in DNS ({', '.join(ips[:4])})"
        return "up", f"DNS matches expected ({exp})"

    return "up", "DNS resolved: " + ", ".join(ips[:4])


def check_json(url: str, keyword: str, timeout: float, verify_ssl: bool, app_name: str = "LinkNest") -> Tuple[str, str]:
    if not re.match(r"^https?://", url, re.I):
        return "down", "Invalid URL"
    expr = (keyword or "").strip()
    if not expr:
        return "down", "No JSON check expression specified"

    ua = f"{app_name} Monitor/1.0"
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": ua, "Accept": "application/json, */*", "Connection": "close"})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_ssl_context(verify_ssl)) as resp:
            code = getattr(resp, "status", None) or resp.getcode()
            if not (200 <= int(code) < 400):
                return "down", f"HTTP {code}"
            body = resp.read(1024 * 1024)
    except Exception as e:
        msg = str(e) or e.__class__.__name__
        if "timed out" in msg.lower():
            return "down", "Connection timeout"
        return "down", f"Connection failed: {msg}"

    try:
        text = body.decode("utf-8", errors="ignore")
        data = json.loads(text)
    except Exception:
        return "down", "Response is not valid JSON"

    if isinstance(data, dict) and ":" in expr:
        key, expected = expr.split(":", 1)
        key, expected = key.strip(), expected.strip()
        actual = data.get(key)
        if actual is None:
            return "down", f"JSON key '{key}' not found"
        actual_str = str(actual).lower() if not isinstance(actual, bool) else ("true" if actual else "false")
        if actual_str == expected.lower() or str(actual) == expected:
            return "up", f"JSON {key}={actual} (HTTP {code})"
        return "down", f"JSON {key}={actual}, expected {expected}"

    haystack = json.dumps(data).lower()
    if expr.lower() in haystack:
        return "up", f"JSON contains '{expr}' (HTTP {code})"
    return "down", f"JSON value '{expr}' not found"


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
    db_conn: Optional[sqlite3.Connection] = None,
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
    fn = (from_name or smtp_cfg.get("from_name") or "Monitor").strip()
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
        # Inline brand logo for Outlook (cid:ln-brand-logo)
        if "cid:ln-brand-logo" in str(html_body):
            logo_path = resolve_brand_logo_filesystem_path(db_conn)
            if logo_path and os.path.isfile(logo_path):
                try:
                    with open(logo_path, "rb") as fh:
                        img_bytes = fh.read()
                    ext = os.path.splitext(logo_path)[1].lower().lstrip(".")
                    subtype = {"jpg": "jpeg", "jpeg": "jpeg", "gif": "gif", "webp": "webp"}.get(ext, "png")
                    html_part = msg.get_payload()[-1]
                    html_part.add_related(
                        img_bytes,
                        maintype="image",
                        subtype=subtype,
                        cid="ln-brand-logo",
                        filename=os.path.basename(logo_path),
                    )
                except Exception:
                    pass

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


def _setting_value(conn: Optional[sqlite3.Connection], key: str) -> str:
    if conn is None:
        try:
            with open_db(DEFAULT_DB_PATH) as c:
                row = c.execute("SELECT value FROM settings WHERE key = ? LIMIT 1", (key,)).fetchone()
                return str(row["value"]) if row and row["value"] is not None else ""
        except Exception:
            return ""
    try:
        row = conn.execute("SELECT value FROM settings WHERE key = ? LIMIT 1", (key,)).fetchone()
        return str(row["value"]) if row and row["value"] is not None else ""
    except Exception:
        return ""


def resolve_brand_logo_filesystem_path(conn: Optional[sqlite3.Connection] = None) -> Optional[str]:
    """Map header/logo setting to uploads/<file> on disk for CID embedding."""
    raw = ""
    for key in ("header_logo_image", "logo_image", "favicon"):
        raw = (_setting_value(conn, key) or "").strip()
        if raw:
            break
    if not raw or raw.startswith("http://") or raw.startswith("https://") or raw.startswith("data:"):
        return None
    normalized = re.sub(r"^/[^/]+/uploads/", "/uploads/", raw)
    if not normalized.startswith("/uploads/"):
        return None
    filename = os.path.basename(normalized)
    if not re.match(r"^[a-zA-Z0-9._-]+$", filename):
        return None
    disk = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "uploads", filename))
    return disk if os.path.isfile(disk) else None


def ln_email_base_layout(
    title: str,
    subtitle: str,
    accent_hex: str,
    inner_html: str,
    preheader: str = "",
    app_name: str = "LinkNest",
    footer_label: Optional[str] = None,
    db_conn: Optional[sqlite3.Connection] = None,
) -> str:
    """Outlook-safe table layout (mirrors api/email_templates.php)."""
    accent = accent_hex if re.match(r"^#[0-9a-fA-F]{6}$", accent_hex or "") else "#4f46e5"
    safe_title = _ln_html_escape(title)
    safe_subtitle = _ln_html_escape(subtitle)
    safe_preheader = _ln_html_escape(preheader)
    safe_app_name = _ln_html_escape(app_name)
    foot = footer_label or f"Sent by {app_name} Monitoring"
    safe_foot = _ln_html_escape(foot)
    now_s = _ln_html_escape(_dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))

    logo_row = ""
    if resolve_brand_logo_filesystem_path(db_conn):
        logo_row = f"""
          <tr>
            <td bgcolor="#ffffff" style="background-color:#ffffff;padding:18px 24px 12px 24px;border-bottom:1px solid #e2e8f0;">
              <img src="cid:ln-brand-logo" alt="{safe_app_name}" width="180" border="0" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:180px;width:180px;" />
            </td>
          </tr>"""

    return f"""<!doctype html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <!--[if mso]>
  <style type="text/css">
    table, td, div, span, a {{ font-family: Arial, Helvetica, sans-serif !important; }}
  </style>
  <![endif]-->
  <title>{safe_title}</title>
  <style type="text/css">
    body, table, td, a {{ -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }}
    table, td {{ mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse !important; }}
    img {{ -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }}
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;width:100% !important;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">{safe_preheader}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#f1f5f9" style="background-color:#f1f5f9;width:100%;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <!--[if mso]>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"><tr><td>
        <![endif]-->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background-color:#ffffff;">
          {logo_row}
          <tr>
            <td bgcolor="{accent}" style="background-color:{accent};padding:22px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;color:#ffffff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:0 0 8px 0;">{safe_app_name}</td>
                </tr>
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;color:#ffffff;font-size:22px;font-weight:700;line-height:28px;padding:0 0 6px 0;">{safe_title}</td>
                </tr>
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;color:#ffffff;font-size:14px;font-weight:600;line-height:20px;">{safe_subtitle}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td bgcolor="#ffffff" style="background-color:#ffffff;padding:24px;">
              {inner_html}
            </td>
          </tr>
          <tr>
            <td bgcolor="#f8fafc" style="background-color:#f8fafc;padding:16px 24px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;color:#64748b;font-size:12px;line-height:18px;text-align:center;">
                {safe_foot} &bull; {now_s}
              </p>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td></tr></table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>"""


def _ln_ensure_monitor_email_subject_has_status(subject: str, status: str, monitor_name: Optional[str] = None) -> str:
    subject = (subject or "").strip()
    status_label = (status or "").strip().upper()
    if not subject or status_label in ("", "UNKNOWN", "BOTH"):
        return subject
    if re.search(r"\s-\s" + re.escape(status_label) + r"\s*$", subject, re.I):
        return subject

    prefix = ""
    name_part = subject
    m = re.match(r"^(\[[^\]]+\]\s*)(.*)$", subject)
    if m:
        prefix = m.group(1)
        name_part = m.group(2).strip()

    name_part = re.sub(r"\s+Status(\s+Update)?\s*$", "", name_part, flags=re.I)
    name_part = re.sub(r"^(UP|DOWN|WARNING):\s*", "", name_part, flags=re.I)
    name_part = re.sub(r"\s+Status:\s*(UP|DOWN|WARNING)\s*$", "", name_part, flags=re.I)
    name_part = re.sub(r"\s-\s(UP|DOWN|WARNING)\s*$", "", name_part, flags=re.I)
    name_part = name_part.strip()

    if monitor_name and str(monitor_name).strip():
        name_part = str(monitor_name).strip()
    if not name_part:
        name_part = "Monitor"

    return f"{prefix}{name_part} - {status_label}"


def _monitor_email_details_from_body(body: str) -> str:
    """Short details line for HTML (avoid duplicating full plain-text body)."""
    text = (body or "").strip()
    if not text:
        return "N/A"
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.lower().startswith("details:"):
            return stripped.split(":", 1)[1].strip() or stripped
    first = next((ln.strip() for ln in text.splitlines() if ln.strip()), text)
    return first


def ln_render_monitor_notification_html(
    *,
    monitor_name: str,
    target: str,
    status: str,
    details: str,
    response_time_ms: Optional[object] = None,
    app_name: str = "LinkNest",
    db_conn: Optional[sqlite3.Connection] = None,
) -> str:
    """
    Render Outlook-safe HTML similar to the PHP monitor status template.
    """
    status_label = (status or "").strip().upper() or "UNKNOWN"
    accent = _ln_accent_for_status(status)
    pill_bg = accent

    safe_details = _ln_nl2br_escaped(details or "N/A")
    safe_target = _ln_html_escape(target or "N/A")
    target_cell = safe_target
    if re.match(r"^https?://", target or "", re.I):
        target_cell = f'<a href="{safe_target}" style="color:#2563eb;text-decoration:underline;">{safe_target}</a>'
    rt = _ln_html_escape(str(response_time_ms) if response_time_ms not in (None, "") else "N/A")
    now_s = _ln_html_escape(_dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))

    inner = f"""
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;color:#0f172a;padding:0 0 10px 0;">{_ln_html_escape(monitor_name or "Monitor")}</td>
        </tr>
        <tr>
          <td style="padding:0 0 14px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td bgcolor="{pill_bg}" style="background-color:{pill_bg};color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.6px;padding:6px 14px;">{_ln_html_escape(status_label)}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td bgcolor="#f8fafc" style="background-color:#f8fafc;border:1px solid #e2e8f0;padding:0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td width="34%" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#334155;padding:10px 14px;border-bottom:1px solid #e2e8f0;"><strong>Target</strong></td>
                <td width="66%" align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#334155;padding:10px 14px;border-bottom:1px solid #e2e8f0;word-break:break-all;">{target_cell}</td>
              </tr>
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#334155;padding:10px 14px;border-bottom:1px solid #e2e8f0;"><strong>Response time</strong></td>
                <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#334155;padding:10px 14px;border-bottom:1px solid #e2e8f0;">{rt}</td>
              </tr>
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#334155;padding:10px 14px;"><strong>Time</strong></td>
                <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#334155;padding:10px 14px;">{now_s}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#0f172a;padding:16px 0 8px 0;">Details</td>
        </tr>
        <tr>
          <td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #e2e8f0;border-left:4px solid {accent};padding:12px 14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#334155;">{safe_details}</td>
        </tr>
      </table>
    """

    pre = f"{status_label} - {monitor_name}"
    return ln_email_base_layout(
        "Monitor Status Update",
        "Real-time status change notification",
        accent,
        inner,
        preheader=pre,
        app_name=app_name,
        footer_label=f"Sent by {app_name} Monitoring",
        db_conn=db_conn,
    )

