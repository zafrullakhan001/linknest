#!/usr/bin/env python3
"""
Scheduled server-side speed tests for LinkNest.

Measures the *host* path (worker executor), not an end-user browser path.
Invoked from monitor_runner.py after monitor checks.
"""

from __future__ import annotations

import json
import os
import random
import string
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

CF_DOWN = "https://speed.cloudflare.com/__down"
CF_UP = "https://speed.cloudflare.com/__up"
CF_TRACE = "https://speed.cloudflare.com/cdn-cgi/trace"

PROFILES = {
    "internet": {
        "quick": {"download_ms": 6000, "upload_ms": 4000, "download_chunk": 8_000_000, "upload_chunk": 1_000_000},
        "standard": {"download_ms": 9000, "upload_ms": 6000, "download_chunk": 12_000_000, "upload_chunk": 2_000_000},
        "thorough": {"download_ms": 12000, "upload_ms": 8000, "download_chunk": 16_000_000, "upload_chunk": 3_000_000},
    },
    "server": {
        "quick": {"download_ms": 4000, "upload_ms": 3000, "download_chunk": 4_000_000, "upload_chunk": 1_000_000},
        "standard": {"download_ms": 6000, "upload_ms": 4000, "download_chunk": 6_000_000, "upload_chunk": 1_500_000},
        "thorough": {"download_ms": 8000, "upload_ms": 5000, "download_chunk": 8_000_000, "upload_chunk": 2_000_000},
    },
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _setting_int(conn, key: str, default: int) -> int:
    try:
        row = conn.execute("SELECT value FROM settings WHERE key = ? LIMIT 1", (key,)).fetchone()
        if row and str(row[0]).isdigit():
            return int(row[0])
        if row:
            return int(float(row[0]))
    except Exception:
        pass
    return default


def ensure_speedtest_schema(conn) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS speedtest_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            target TEXT NOT NULL,
            profile TEXT NOT NULL,
            executor TEXT NOT NULL,
            owner_user_id INTEGER,
            interval_minutes INTEGER NOT NULL DEFAULT 60,
            is_enabled INTEGER NOT NULL DEFAULT 1,
            last_run_at TEXT,
            next_run_at TEXT,
            last_status TEXT,
            last_error TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            created_by INTEGER
        );
        CREATE TABLE IF NOT EXISTS speedtest_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            schedule_id INTEGER,
            executor TEXT NOT NULL,
            target TEXT NOT NULL,
            profile TEXT NOT NULL,
            run_at TEXT NOT NULL DEFAULT (datetime('now')),
            duration_ms INTEGER,
            status TEXT NOT NULL DEFAULT 'complete',
            result_json TEXT,
            bytes_downloaded INTEGER DEFAULT 0,
            bytes_uploaded INTEGER DEFAULT 0,
            created_by INTEGER,
            trigger TEXT NOT NULL DEFAULT 'manual'
        );
        CREATE TABLE IF NOT EXISTS speedtest_worker_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            schedule_id INTEGER,
            requested_at TEXT NOT NULL DEFAULT (datetime('now')),
            status TEXT NOT NULL DEFAULT 'pending',
            requested_by INTEGER
        );
        """
    )
    conn.commit()


def _http_get(url: str, timeout: float = 30.0, headers: Optional[Dict[str, str]] = None) -> Tuple[int, bytes]:
    req = urllib.request.Request(url, headers=headers or {"User-Agent": "LinkNestSpeedWorker/1.0"}, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.getcode(), resp.read()


def _http_post(url: str, body: bytes, timeout: float = 60.0, headers: Optional[Dict[str, str]] = None) -> Tuple[int, bytes]:
    hdrs = {"User-Agent": "LinkNestSpeedWorker/1.0", "Content-Type": "application/octet-stream"}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, data=body, headers=hdrs, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.getcode(), resp.read()


def _ping_ms(url: str, headers: Optional[Dict[str, str]] = None) -> float:
    t0 = time.perf_counter()
    _http_get(url, timeout=15.0, headers=headers)
    return (time.perf_counter() - t0) * 1000.0


def _measure_download(url_builder, duration_ms: int, headers: Optional[Dict[str, str]] = None) -> Tuple[int, float]:
    started = time.perf_counter()
    deadline = started + duration_ms / 1000.0
    total = 0
    samples: List[float] = []
    last_t = started
    last_bytes = 0
    while time.perf_counter() < deadline:
        code, data = _http_get(url_builder(), timeout=30.0, headers=headers)
        if code >= 400:
            break
        total += len(data)
        now = time.perf_counter()
        if now - last_t >= 0.2:
            window = total - last_bytes
            mbps = (window * 8 / 1_000_000) / max(now - last_t, 0.001)
            samples.append(mbps)
            last_t = now
            last_bytes = total
        if time.perf_counter() >= deadline:
            break
    elapsed = max(time.perf_counter() - started, 0.001)
    avg = (sum(samples) / len(samples)) if samples else (total * 8 / 1_000_000 / elapsed)
    return total, avg


def _measure_upload(url: str, chunk: bytes, duration_ms: int, headers: Optional[Dict[str, str]] = None) -> Tuple[int, float]:
    started = time.perf_counter()
    deadline = started + duration_ms / 1000.0
    total = 0
    samples: List[float] = []
    last_t = started
    last_bytes = 0
    while time.perf_counter() < deadline:
        code, _ = _http_post(url, chunk, timeout=60.0, headers=headers)
        if code >= 400:
            break
        total += len(chunk)
        now = time.perf_counter()
        if now - last_t >= 0.2:
            window = total - last_bytes
            mbps = (window * 8 / 1_000_000) / max(now - last_t, 0.001)
            samples.append(mbps)
            last_t = now
            last_bytes = total
    elapsed = max(time.perf_counter() - started, 0.001)
    avg = (sum(samples) / len(samples)) if samples else (total * 8 / 1_000_000 / elapsed)
    return total, avg


def _random_bytes(n: int) -> bytes:
    return os.urandom(max(1, min(n, 2_000_000)))


def _loopback_base(conn) -> str:
    env = os.environ.get("LINKNEST_LOOPBACK_URL", "").strip()
    if env:
        return env.rstrip("/")
    try:
        row = conn.execute("SELECT value FROM settings WHERE key = ? LIMIT 1", ("speedtest_loopback_base_url",)).fetchone()
        if row and str(row[0]).strip():
            return str(row[0]).strip().rstrip("/")
    except Exception:
        pass
    # Common XAMPP / Docker defaults
    return os.environ.get("LINKNEST_URL", "http://127.0.0.1/linknest").rstrip("/") + "/api"


def _system_token() -> str:
    return os.environ.get("LINKNEST_SYSTEM_TOKEN", "linknest_secret_token_123")


def run_one_test(conn, target: str, profile: str) -> Dict[str, Any]:
    cfg = PROFILES.get(target, PROFILES["internet"]).get(profile, PROFILES["internet"]["standard"])
    t0 = time.perf_counter()
    meta: Dict[str, Any] = {
        "ip": None,
        "ipv4": None,
        "ipv6": None,
        "loc": None,
        "colo": None,
        "httpProtocol": None,
        "tls": None,
        "userAgent": "LinkNestSpeedWorker/1.0",
        "browser": "Server worker",
        "endpointHost": None,
        "connectionType": "worker",
        "connectionDownlink": None,
        "connectionRtt": None,
    }
    headers: Optional[Dict[str, str]] = None
    if target == "internet":
        try:
            _, trace = _http_get(f"{CF_TRACE}?r={int(time.time()*1000)}", timeout=15.0)
            for line in trace.decode("utf-8", errors="ignore").splitlines():
                if "=" in line:
                    k, v = line.split("=", 1)
                    if k == "ip":
                        meta["ip"] = v
                    elif k == "loc":
                        meta["loc"] = v
                    elif k == "colo":
                        meta["colo"] = v
                    elif k == "http":
                        meta["httpProtocol"] = v
                    elif k == "tls":
                        meta["tls"] = v
            meta["endpointHost"] = "speed.cloudflare.com"
        except Exception:
            pass

        def down_url():
            return f"{CF_DOWN}?bytes={cfg['download_chunk']}&r={int(time.time()*1000)}"

        ping_url = f"{CF_DOWN}?bytes=500&r={int(time.time()*1000)}"
        up_url = f"{CF_UP}?r={int(time.time()*1000)}"
    else:
        base = _loopback_base(conn)
        headers = {"Authorization": f"Bearer {_system_token()}"}
        meta["endpointHost"] = base

        def down_url():
            return f"{base}/speedtest/download?bytes={min(cfg['download_chunk'], 8_000_000)}&r={int(time.time()*1000)}"

        ping_url = f"{base}/speedtest/ping?r={int(time.time()*1000)}"
        up_url = f"{base}/speedtest/upload?r={int(time.time()*1000)}"

    rtts: List[float] = []
    failed = 0
    for _ in range(6):
        try:
            rtts.append(_ping_ms(ping_url, headers=headers))
        except Exception:
            failed += 1
    ping_ms = sorted(rtts)[len(rtts) // 2] if rtts else None
    jitter_ms = None
    if len(rtts) >= 2:
        jitter_ms = sum(abs(rtts[i] - rtts[i - 1]) for i in range(1, len(rtts))) / (len(rtts) - 1)

    down_bytes, down_mbps = _measure_download(down_url, cfg["download_ms"], headers=headers)
    loaded_ping = None
    try:
        loaded_ping = _ping_ms(ping_url, headers=headers)
    except Exception:
        pass
    chunk = _random_bytes(min(cfg["upload_chunk"], 1_500_000))
    up_bytes, up_mbps = _measure_upload(up_url, chunk, cfg["upload_ms"], headers=headers)
    loaded_up = None
    try:
        loaded_up = _ping_ms(ping_url, headers=headers)
    except Exception:
        pass

    bloat_dl = (loaded_ping - ping_ms) if (loaded_ping is not None and ping_ms is not None) else None
    bloat_ul = (loaded_up - ping_ms) if (loaded_up is not None and ping_ms is not None) else None
    score = 50
    if down_mbps >= 100 and (ping_ms or 999) <= 40:
        score = 85
    elif down_mbps >= 50:
        score = 70
    elif down_mbps >= 20:
        score = 55
    elif down_mbps < 10:
        score = 30

    result = {
        "id": f"worker_{int(time.time())}_{''.join(random.choices(string.ascii_lowercase, k=5))}",
        "at": int(time.time() * 1000),
        "target": target,
        "profile": profile,
        "connectionMode": "single",
        "executor": "worker",
        "streams": 1,
        "pingMs": ping_ms,
        "jitterMs": jitter_ms,
        "packetLossPct": (failed / 6) * 100,
        "packetLossLoadedPct": None,
        "downloadMbps": down_mbps,
        "uploadMbps": up_mbps,
        "peakDownloadMbps": down_mbps,
        "peakUploadMbps": up_mbps,
        "loadedPingMs": loaded_ping,
        "loadedUploadPingMs": loaded_up,
        "bufferbloatDownloadMs": bloat_dl,
        "bufferbloatUploadMs": bloat_ul,
        "bufferbloatDownload": {"grade": "C", "deltaMs": bloat_dl, "label": "Worker", "hint": "Measured on server worker."},
        "bufferbloatUpload": {"grade": "C", "deltaMs": bloat_ul, "label": "Worker", "hint": "Measured on server worker."},
        "durationMs": int((time.perf_counter() - t0) * 1000),
        "bytesDownloaded": down_bytes,
        "bytesUploaded": up_bytes,
        "quality": {"label": "Good", "hint": "Server-worker measurement of this host’s path.", "tone": "sky"},
        "score": score,
        "useCaseGrades": [],
        "findings": [
            {
                "id": "worker-path",
                "severity": "info",
                "title": "Server worker path",
                "detail": "This result measures the LinkNest host, not an end-user browser.",
            }
        ],
        "samples": [],
        "meta": meta,
    }
    return result


def _worker_bytes_today(conn) -> int:
    row = conn.execute(
        "SELECT COALESCE(SUM(bytes_downloaded + bytes_uploaded),0) FROM speedtest_results "
        "WHERE executor='worker' AND date(run_at)=date('now')"
    ).fetchone()
    return int(row[0] if row else 0)


def _claim_queue(conn) -> Optional[Dict[str, Any]]:
    row = conn.execute(
        "SELECT id, schedule_id FROM speedtest_worker_queue WHERE status='pending' ORDER BY id ASC LIMIT 1"
    ).fetchone()
    if not row:
        return None
    conn.execute("UPDATE speedtest_worker_queue SET status='running' WHERE id=?", (row[0],))
    conn.commit()
    return {"id": row[0], "schedule_id": row[1]}


def _due_schedules(conn, min_interval: int) -> List[Dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM speedtest_schedules WHERE executor='worker' AND is_enabled=1"
    ).fetchall()
    cols = [d[0] for d in conn.execute("SELECT * FROM speedtest_schedules LIMIT 0").description] if False else None
    # sqlite3.Row-compatible fallback
    out = []
    cur = conn.execute(
        "SELECT id, name, target, profile, interval_minutes, last_run_at, next_run_at "
        "FROM speedtest_schedules WHERE executor='worker' AND is_enabled=1"
    )
    for r in cur.fetchall():
        out.append(
            {
                "id": r[0],
                "name": r[1],
                "target": r[2],
                "profile": r[3],
                "interval_minutes": max(min_interval, int(r[4] or min_interval)),
                "last_run_at": r[5],
                "next_run_at": r[6],
            }
        )
    due = []
    now = datetime.now(timezone.utc)
    for s in out:
        if s["next_run_at"]:
            try:
                nxt = datetime.strptime(s["next_run_at"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                if nxt <= now:
                    due.append(s)
                continue
            except Exception:
                pass
        if not s["last_run_at"]:
            due.append(s)
            continue
        try:
            last = datetime.strptime(s["last_run_at"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
            if (now - last).total_seconds() >= s["interval_minutes"] * 60:
                due.append(s)
        except Exception:
            due.append(s)
    return due


def _store_result(conn, schedule_id: Optional[int], result: Dict[str, Any], trigger: str) -> None:
    conn.execute(
        "INSERT INTO speedtest_results(schedule_id, executor, target, profile, duration_ms, status, result_json, "
        "bytes_downloaded, bytes_uploaded, created_by, trigger, run_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            schedule_id,
            "worker",
            result.get("target"),
            result.get("profile"),
            result.get("durationMs"),
            "complete",
            json.dumps(result),
            int(result.get("bytesDownloaded") or 0),
            int(result.get("bytesUploaded") or 0),
            None,
            trigger,
            _now_iso(),
        ),
    )
    if schedule_id:
        interval = conn.execute(
            "SELECT interval_minutes FROM speedtest_schedules WHERE id=?", (schedule_id,)
        ).fetchone()
        mins = int(interval[0]) if interval else 60
        next_run = datetime.now(timezone.utc).timestamp() + mins * 60
        next_iso = datetime.fromtimestamp(next_run, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            "UPDATE speedtest_schedules SET last_run_at=?, next_run_at=?, last_status=?, last_error=NULL, "
            "updated_at=datetime('now') WHERE id=?",
            (_now_iso(), next_iso, "complete", schedule_id),
        )
    conn.commit()


def run_due_speedtests(conn, db_path: str = "", verbose: bool = False) -> int:
    """Run at most one due worker speed test (queued or scheduled). Returns 1 if a test ran."""
    try:
        ensure_speedtest_schema(conn)
    except Exception as e:
        if verbose:
            print(f"[speedtest] schema error: {e}")
        return 0

    # Skip if already running
    running = conn.execute("SELECT COUNT(*) FROM speedtest_worker_queue WHERE status='running'").fetchone()
    if running and int(running[0]) > 0:
        if verbose:
            print("[speedtest] skip — already running")
        return 0

    daily_cap_mb = max(50, _setting_int(conn, "speedtest_worker_daily_cap_mb", 500))
    daily_cap = daily_cap_mb * 1024 * 1024
    used = _worker_bytes_today(conn)
    if used >= daily_cap:
        if verbose:
            print(f"[speedtest] skip — daily cap {used}/{daily_cap} bytes")
        return 0

    min_interval = max(5, _setting_int(conn, "speedtest_worker_min_interval_minutes", 15))
    job = _claim_queue(conn)
    schedule = None
    trigger = "worker"
    if job and job.get("schedule_id"):
        row = conn.execute(
            "SELECT id, name, target, profile, interval_minutes FROM speedtest_schedules WHERE id=?",
            (job["schedule_id"],),
        ).fetchone()
        if row:
            schedule = {
                "id": row[0],
                "name": row[1],
                "target": row[2],
                "profile": row[3],
                "interval_minutes": row[4],
            }
            trigger = "worker"
    if not schedule and job:
        # Manual "Run worker now" with no schedule_id — prefer any enabled worker
        # schedule, otherwise run an ad-hoc internet/quick test.
        due_or_any = _due_schedules(conn, min_interval)
        if not due_or_any:
            any_row = conn.execute(
                "SELECT id, name, target, profile, interval_minutes "
                "FROM speedtest_schedules WHERE executor='worker' AND is_enabled=1 "
                "ORDER BY id ASC LIMIT 1"
            ).fetchone()
            if any_row:
                schedule = {
                    "id": any_row[0],
                    "name": any_row[1],
                    "target": any_row[2],
                    "profile": any_row[3],
                    "interval_minutes": any_row[4],
                }
        else:
            schedule = due_or_any[0]
        if not schedule:
            schedule = {
                "id": None,
                "name": "Ad-hoc worker",
                "target": "internet",
                "profile": "quick",
                "interval_minutes": min_interval,
            }
        trigger = "worker"
    if not schedule:
        due = _due_schedules(conn, min_interval)
        if due:
            schedule = due[0]
            trigger = "scheduled"
            # mark synthetic running via queue row
            conn.execute(
                "INSERT INTO speedtest_worker_queue(schedule_id, status) VALUES (?, 'running')",
                (schedule["id"],),
            )
            conn.commit()
            job = {"id": conn.execute("SELECT last_insert_rowid()").fetchone()[0], "schedule_id": schedule["id"]}

    if not schedule:
        if job:
            conn.execute("UPDATE speedtest_worker_queue SET status='done' WHERE id=?", (job["id"],))
            conn.commit()
        return 0

    target = schedule["target"] if schedule["target"] in ("internet", "server") else "internet"
    profile = schedule["profile"] if schedule["profile"] in ("quick", "standard", "thorough") else "standard"
    if verbose:
        label = schedule["id"] if schedule.get("id") is not None else "ad-hoc"
        print(f"[speedtest] running schedule#{label} target={target} profile={profile}")

    try:
        result = run_one_test(conn, target, profile)
        _store_result(conn, schedule.get("id"), result, trigger)
        if job:
            conn.execute("UPDATE speedtest_worker_queue SET status='done' WHERE id=?", (job["id"],))
            conn.commit()
        if verbose:
            print(
                f"[speedtest] done down={result.get('downloadMbps'):.1f} up={result.get('uploadMbps'):.1f} "
                f"ping={result.get('pingMs')}"
            )
        return 1
    except Exception as e:
        err = str(e)
        # Never log bearer tokens if present in messages
        err = err.replace(_system_token(), "***")
        if verbose:
            print(f"[speedtest] error: {err}")
        if schedule.get("id") is not None:
            conn.execute(
                "UPDATE speedtest_schedules SET last_run_at=?, last_status=?, last_error=?, updated_at=datetime('now') WHERE id=?",
                (_now_iso(), "error", err[:500], schedule["id"]),
            )
        if job:
            conn.execute("UPDATE speedtest_worker_queue SET status='error' WHERE id=?", (job["id"],))
        conn.commit()
        return 0


if __name__ == "__main__":
    import sqlite3
    import sys

    db = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "data", "linknest.db")
    c = sqlite3.connect(db)
    c.row_factory = sqlite3.Row
    run_due_speedtests(c, db, verbose=True)
