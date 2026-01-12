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
import json
import os
import re
import socket
import sqlite3
import ssl
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


def notifications_paused(conn: sqlite3.Connection) -> bool:
    # Mirror PHP: global boolean + legacy pause window
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


def send_smtp_email(
    *,
    smtp_cfg: Dict[str, Any],
    to_list: Sequence[str],
    cc_list: Sequence[str],
    subject: str,
    body: str,
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

