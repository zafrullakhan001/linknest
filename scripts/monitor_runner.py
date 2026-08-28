"""
LinkNest Monitor Runner (Python)

Purpose:
- Run scheduled monitor checks WITHOUT PHP hanging/freezing
- Update SQLite tables: monitors, monitor_logs
- Queue notification emails into email_outbox (sent by email_sender.py)
- Process force-all jobs from monitor_check_jobs (UI handover)

Designed for:
- Windows Task Scheduler
- cron

Python: 3.9+
"""

from __future__ import annotations

import argparse
import concurrent.futures
import contextlib
import json
import os
import sys
import time
from typing import Any, Dict, List, Optional, Set, Tuple

# Embeddable CPython (bin/python + python*._pth) does not put this script's
# folder on sys.path, so linknest_worker_lib would otherwise fail to import.
_scripts_dir = os.path.dirname(os.path.abspath(__file__))
if _scripts_dir not in sys.path:
    sys.path.insert(0, _scripts_dir)

from linknest_worker_lib import (
    DEFAULT_DB_PATH,
    CheckResult,
    check_dns,
    check_json,
    check_http_headers,
    check_keyword,
    check_ping,
    check_port,
    check_ssl,
    check_url_head,
    day_of_week_active,
    ensure_monitor_check_jobs_schema,
    ensure_monitors_schema,
    ensure_outbox_schema,
    is_in_maintenance_window,
    monitor_notification_now,
    normalize_email_list,
    notifications_paused,
    now_ts,
    open_db,
    replace_template_vars,
    resolve_app_name,
    expand_app_placeholders,
    resolve_monitor_max_workers,
    time_window_active,
    _ln_ensure_monitor_email_subject_has_status,
)

JOB_STALE_SECONDS = 300


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Run LinkNest monitor checks and queue emails.")
    p.add_argument("--db", default=DEFAULT_DB_PATH, help="Path to linknest.db")
    p.add_argument(
        "--max-workers",
        type=int,
        default=None,
        help="Concurrent probe threads (default: settings monitor_worker_max_workers or 20)",
    )
    p.add_argument("--verify-ssl", action="store_true", help="Verify SSL certificates (PHP currently disables verification)")
    p.add_argument("--force-all", action="store_true", help="Check all active monitors (ignore interval)")
    p.add_argument("--limit", type=int, default=0, help="Limit number of due monitors to check (0=unlimited)")
    p.add_argument("--dry-run", action="store_true", help="Do not write DB changes (prints what would happen)")
    p.add_argument("--verbose", action="store_true", help="Verbose output")
    return p.parse_args()


def lock_path_for_db(db_path: str) -> str:
    base = os.path.dirname(os.path.abspath(db_path))
    return os.path.join(base, "monitor_runner.lock")


def try_acquire_runner_lock(lock_path: str) -> Optional[Any]:
    os.makedirs(os.path.dirname(lock_path) or ".", exist_ok=True)
    try:
        fh = open(lock_path, "a+", encoding="utf-8")
        if os.name == "nt":
            import msvcrt

            fh.seek(0)
            fh.write("0")
            fh.flush()
            msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        fh.seek(0)
        fh.truncate()
        fh.write(str(os.getpid()))
        fh.flush()
        return fh
    except Exception:
        return None


def recover_stale_jobs(conn) -> None:
    cutoff = now_ts() - JOB_STALE_SECONDS
    conn.execute(
        """
        UPDATE monitor_check_jobs
        SET status = 'queued', started_at = NULL
        WHERE status = 'running' AND started_at IS NOT NULL AND started_at < ?
        """,
        (cutoff,),
    )
    conn.commit()


def parse_job_monitor_ids(raw: Any) -> List[int]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return sorted({int(x) for x in raw if int(x) > 0})
    text = str(raw).strip()
    if not text:
        return []
    try:
        decoded = json.loads(text)
    except Exception:
        return []
    if not isinstance(decoded, list):
        return []
    return sorted({int(x) for x in decoded if int(x) > 0})


def is_job_cancelled(conn, job_id: Optional[int]) -> bool:
    if not job_id:
        return False
    row = conn.execute(
        "SELECT status FROM monitor_check_jobs WHERE id = ?",
        (int(job_id),),
    ).fetchone()
    return bool(row and str(row["status"] or "").strip().lower() == "cancelled")


def claim_next_job(conn) -> Optional[Dict[str, Any]]:
    recover_stale_jobs(conn)
    row = conn.execute(
        """
        SELECT * FROM monitor_check_jobs
        WHERE status = 'queued'
        ORDER BY created_at ASC, id ASC
        LIMIT 1
        """
    ).fetchone()
    if not row:
        return None
    now = now_ts()
    cur = conn.execute(
        """
        UPDATE monitor_check_jobs
        SET status = 'running', started_at = ?
        WHERE id = ? AND status = 'queued'
        """,
        (now, int(row["id"])),
    )
    if cur.rowcount != 1:
        conn.commit()
        return None
    conn.commit()
    claimed = conn.execute("SELECT * FROM monitor_check_jobs WHERE id = ?", (int(row["id"]),)).fetchone()
    return dict(claimed) if claimed else None


def finish_job(conn, job_id: Optional[int], *, status: str, counts: Dict[str, int], last_error: Optional[str] = None) -> None:
    if not job_id:
        return
    now = now_ts()
    conn.execute(
        """
        UPDATE monitor_check_jobs SET
          status = ?,
          finished_at = ?,
          checked_count = ?,
          total_count = ?,
          up_count = ?,
          down_count = ?,
          error_count = ?,
          last_error = ?
        WHERE id = ?
        """,
        (
            status,
            now,
            int(counts.get("checked", 0)),
            int(counts.get("total", 0)),
            int(counts.get("up", 0)),
            int(counts.get("down", 0)),
            int(counts.get("error", 0)),
            last_error,
            int(job_id),
        ),
    )
    conn.commit()


def update_job_progress(conn, job_id: Optional[int], counts: Dict[str, int]) -> None:
    if not job_id:
        return
    conn.execute(
        """
        UPDATE monitor_check_jobs SET
          checked_count = ?,
          total_count = ?,
          up_count = ?,
          down_count = ?,
          error_count = ?
        WHERE id = ?
        """,
        (
            int(counts.get("checked", 0)),
            int(counts.get("total", 0)),
            int(counts.get("up", 0)),
            int(counts.get("down", 0)),
            int(counts.get("error", 0)),
            int(job_id),
        ),
    )
    conn.commit()


def perform_check(monitor: Dict[str, Any], verify_ssl: bool, app_name: str = "LinkNest") -> CheckResult:
    t0 = time.time()

    def run_once(relaxed: bool = False) -> Tuple[str, str]:
        mtype = str(monitor.get("type") or "")
        target = str(monitor.get("target") or "")

        base_timeout = monitor.get("timeout")
        try:
            base_timeout_s = int(base_timeout) if base_timeout not in (None, "", False) else None
        except Exception:
            base_timeout_s = None
        if base_timeout_s is not None:
            base_timeout_s = max(1, min(60, base_timeout_s))

        if mtype == "url":
            timeout = 10 if relaxed else (base_timeout_s or 5)
            return check_url_head(target, timeout=timeout, verify_ssl=verify_ssl, app_name=app_name)
        if mtype == "headers":
            timeout = 10 if relaxed else (base_timeout_s or 5)
            return check_http_headers(
                target,
                str(monitor.get("keyword") or ""),
                timeout=timeout,
                verify_ssl=verify_ssl,
                app_name=app_name,
            )
        if mtype == "keyword":
            timeout = 10 if relaxed else (base_timeout_s or 8)
            return check_keyword(target, str(monitor.get("keyword") or ""), timeout=timeout, verify_ssl=verify_ssl, app_name=app_name)
        if mtype == "port":
            timeout = 5 if relaxed else 3
            return check_port(target, int(monitor.get("port") or 0), timeout=timeout)
        if mtype == "ping":
            tms = 10000 if relaxed else int((base_timeout_s or 1) * 1000)
            return check_ping(target, timeout_ms=tms)
        if mtype == "ssl":
            timeout = 10 if relaxed else (base_timeout_s or 8)
            return check_ssl(target, str(monitor.get("keyword") or ""), timeout=timeout)
        if mtype == "dns":
            return check_dns(target, str(monitor.get("keyword") or "") or None)
        if mtype == "json":
            timeout = 10 if relaxed else (base_timeout_s or 8)
            return check_json(target, str(monitor.get("keyword") or ""), timeout=timeout, verify_ssl=verify_ssl, app_name=app_name)
        return "down", "Invalid monitor type"

    status, details = run_once(relaxed=False)
    if status == "down" and not str(details).startswith("Certificate expired"):
        time.sleep(0.5)
        r2s, r2d = run_once(relaxed=True)
        if r2s == "up":
            status, details = "up", f"{r2d} (recovered on retry)"
        else:
            details = f"{details} | Retry: {r2d}"

    ms = int(round((time.time() - t0) * 1000))
    return CheckResult(status=status, details=details, response_ms=ms)


def status_changed(prev_status: Optional[str], new_status: str) -> bool:
    ps = None
    if prev_status is not None:
        ps = str(prev_status).strip().lower() or None
    ns = str(new_status).strip().lower()
    return ps != ns


def queue_advanced_notifications(
    conn,
    monitor_row,
    new_status: str,
    prev_status: Optional[str],
    details: str,
    response_ms: int,
    verbose: bool,
    app_name: str = "LinkNest",
    force_notify_rules: bool = False,
) -> int:
    triggers: List[str] = []
    norm_prev = None if prev_status in (None, "", False) else str(prev_status)
    norm_new = str(new_status).strip().lower()

    if force_notify_rules:
        if norm_new in ("down", "warning"):
            triggers = ["down", "both"]
        elif norm_new == "up":
            triggers = ["up", "both"]
    elif norm_new == "down":
        triggers = ["down", "both"]
    elif (
        norm_new == "warning"
        and str(monitor_row["type"] or "") == "ssl"
        and (norm_prev != "warning")
    ):
        triggers = ["down", "both"]
    elif norm_new == "up" and (norm_prev in ("down", "warning")):
        triggers = ["up", "both"]
    else:
        return 0

    placeholders = ",".join(["?"] * len(triggers))
    rules = conn.execute(
        f"""
        SELECT *
        FROM monitor_notification_rules
        WHERE monitor_id = ?
          AND is_enabled = 1
          AND status_trigger IN ({placeholders})
        ORDER BY COALESCE(sort_order, 0) ASC, created_at ASC, id ASC
        """,
        (int(monitor_row["id"]), *triggers),
    ).fetchall()

    queued = 0
    now_local = monitor_notification_now(conn)
    for r in rules:
        if not time_window_active(r["time_window_start"], r["time_window_end"], now_local):
            continue
        if not day_of_week_active(r["days_of_week"], now_local):
            continue

        rec_rows = conn.execute(
            "SELECT email FROM monitor_notification_recipients WHERE rule_id = ?",
            (int(r["id"]),),
        ).fetchall()
        to_list = normalize_email_list([x["email"] for x in rec_rows])
        cc_list = normalize_email_list(r["cc_emails"] or "")
        if not to_list and not cc_list:
            continue

        subject = replace_template_vars(r["subject_template"], monitor_row, new_status, details, response_ms, app_name=app_name)
        body = replace_template_vars(r["body_template"], monitor_row, new_status, details, response_ms, app_name=app_name)
        from_name = (r["from_name"] or f"{app_name} Monitor").strip() if r["from_name"] is not None else f"{app_name} Monitor"
        from_name = expand_app_placeholders(from_name, app_name)
        from_email = (r["from_email"] or "").strip() if r["from_email"] is not None else None
        if from_email:
            from_email = expand_app_placeholders(from_email, app_name)

        conn.execute(
            """
            INSERT INTO email_outbox (
              created_at, send_after, monitor_id, rule_id, status_trigger,
              to_emails, cc_emails, subject, body, from_name, from_email
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                now_ts(),
                None,
                int(monitor_row["id"]),
                int(r["id"]),
                new_status,
                ",".join(to_list),
                ",".join(cc_list) if cc_list else None,
                subject,
                body,
                from_name,
                from_email,
            ),
        )
        queued += 1
        if verbose:
            print(f"[QUEUE] advanced rule={int(r['id'])} monitor={int(monitor_row['id'])} to={len(to_list)} cc={len(cc_list)}")

    return queued


def queue_legacy_notification(conn, monitor_row, new_status: str, prev_status: Optional[str], details: str, response_ms: int, verbose: bool, app_name: str = "LinkNest") -> int:
    try:
        if int(monitor_row["legacy_email_disabled"] or 0) == 1:
            return 0
    except Exception:
        pass

    if int(monitor_row["email_notification"] or 0) != 1:
        return 0

    legacy_pending = int(monitor_row["legacy_notify_pending"] or 0)
    changed = status_changed(prev_status, new_status)
    if not (changed or (legacy_pending == 1 and new_status == "down")):
        return 0

    norm_prev = None if prev_status in (None, "", False) else str(prev_status).strip().lower()
    norm_new = str(new_status).strip().lower()

    trigger = None
    subject_status = "both"
    message_details = None
    if norm_new == "down":
        trigger = "down"
        subject_status = "down"
        message_details = f"DOWN: {monitor_row['name']} is unreachable. Error: {details}"
    elif (
        str(monitor_row["type"] or "") == "ssl"
        and norm_new == "warning"
        and norm_prev != "warning"
    ):
        trigger = "down"
        subject_status = "warning"
        message_details = f"WARNING: {monitor_row['name']} certificate is approaching expiry. {details}"
    elif norm_prev in ("down", "warning") and norm_new == "up":
        trigger = "up"
        subject_status = "up"
        message_details = f"UP: {monitor_row['name']} is back online."
    else:
        return 0

    to_list = normalize_email_list(monitor_row["legacy_email_to"] or "")
    if not to_list:
        admin = conn.execute(
            "SELECT email FROM users WHERE is_admin = 1 AND email IS NOT NULL AND TRIM(email) <> '' ORDER BY id ASC LIMIT 1"
        ).fetchone()
        if admin and admin["email"]:
            to_list = normalize_email_list(admin["email"])

    cc_list = normalize_email_list(monitor_row["legacy_email_cc"] or "")
    if not to_list and not cc_list:
        return 0

    default_subject_tpl = f"[{app_name} Monitor] {{monitor_name}} - {{status}}"
    default_body_tpl = (
        "{status}: {monitor_name}\n"
        "Target: {monitor_target}\n"
        "Details: {details}\n"
        "Response: {response_time}\n"
        "Time: {time}\n"
    )
    subject_tpl = (monitor_row["legacy_email_subject_template"] or "").strip() or default_subject_tpl
    body_tpl = (monitor_row["legacy_email_body_template"] or "").strip() or default_body_tpl

    subject = replace_template_vars(subject_tpl, monitor_row, subject_status, message_details or "", int(response_ms), app_name=app_name)
    subject = _ln_ensure_monitor_email_subject_has_status(subject, subject_status, str(monitor_row["name"] or ""))
    body = replace_template_vars(body_tpl, monitor_row, subject_status, message_details or "", int(response_ms), app_name=app_name)

    from_name = (monitor_row["legacy_email_from_name"] or "").strip() or None
    if from_name:
        from_name = expand_app_placeholders(from_name, app_name)
    from_email = (monitor_row["legacy_email_from_email"] or "").strip() or None
    if from_email:
        from_email = expand_app_placeholders(from_email, app_name)

    legacy_clear_pending = 1 if legacy_pending == 1 else 0
    legacy_update_last_notified_status = trigger

    conn.execute(
        """
        INSERT INTO email_outbox (
          created_at, send_after, monitor_id, rule_id, status_trigger,
          to_emails, cc_emails, subject, body, from_name, from_email,
          legacy_clear_pending, legacy_update_last_notified_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            now_ts(),
            None,
            int(monitor_row["id"]),
            None,
            trigger,
            ",".join(to_list),
            ",".join(cc_list) if cc_list else None,
            subject,
            body,
            from_name,
            from_email,
            legacy_clear_pending,
            legacy_update_last_notified_status,
        ),
    )

    if verbose:
        print(f"[QUEUE] legacy monitor={int(monitor_row['id'])} trigger={trigger} to={len(to_list)} cc={len(cc_list)}")
    return 1


def effective_status(monitor_row: Dict[str, Any], raw_status: str, r: CheckResult, prev_fail: int) -> Tuple[str, str, int]:
    try:
        threshold = int(monitor_row.get("warning_threshold") or 1)
    except Exception:
        threshold = 1
    threshold = max(1, min(20, threshold))

    raw = (raw_status or "").strip().lower()
    if raw not in ("up", "down", "warning"):
        raw = "down"

    new_fail = (prev_fail + 1) if raw == "down" else 0
    eff_status = raw
    eff_details = r.details
    if raw == "down" and threshold > 1 and new_fail < threshold and str(monitor_row.get("type") or "") != "ssl":
        eff_status = "warning"
        eff_details = f"Warning ({new_fail}/{threshold}): {r.details}"
    return eff_status, eff_details, new_fail


def persist_monitor_result(
    conn,
    monitor_row: Dict[str, Any],
    r: CheckResult,
    *,
    paused: bool,
    app_name: str,
    verbose: bool,
    force_notify_rules: bool,
) -> Tuple[str, int]:
    prev = monitor_row.get("last_status")
    try:
        prev_fail = int(monitor_row.get("consecutive_failures") or 0)
    except Exception:
        prev_fail = 0
    prev_fail = max(0, prev_fail)

    raw_status = (r.status or "").strip().lower()
    eff_status, eff_details, new_fail = effective_status(monitor_row, raw_status, r, prev_fail)

    t = now_ts()
    mid = int(monitor_row["id"])
    conn.execute(
        """
        UPDATE monitors SET
          last_checked_at = ?,
          last_status = ?,
          last_response_time = ?,
          consecutive_failures = ?,
          updated_at = ?
        WHERE id = ?
        """,
        (t, eff_status, int(r.response_ms), int(new_fail), t, mid),
    )
    conn.execute(
        "INSERT INTO monitor_logs (monitor_id, status, response_time, details, checked_at) VALUES (?, ?, ?, ?, ?)",
        (mid, eff_status, int(r.response_ms), eff_details, t),
    )

    changed = status_changed(prev, eff_status)
    queued_emails = 0
    try:
        if (changed or force_notify_rules) and (not paused) and (not is_in_maintenance_window(monitor_row)):
            queued_emails += queue_advanced_notifications(
                conn,
                monitor_row,
                eff_status,
                prev,
                eff_details,
                r.response_ms,
                verbose,
                app_name=app_name,
                force_notify_rules=force_notify_rules,
            )
        if (not paused) and (not is_in_maintenance_window(monitor_row)):
            queued_emails += queue_legacy_notification(conn, monitor_row, eff_status, prev, eff_details, r.response_ms, verbose, app_name=app_name)
    except Exception as e:
        if verbose:
            print(f"[WARN] email queueing failed; continuing. monitor={mid} err={e}")

    return eff_status, queued_emails


def build_due_list(
    monitors: List[Any],
    *,
    now: int,
    force_all: bool,
    forced_ids: Set[int],
) -> List[Any]:
    due: List[Any] = []
    seen: Set[int] = set()
    for m in monitors:
        mid = int(m["id"])
        if mid in seen:
            continue
        if force_all or mid in forced_ids:
            due.append(m)
            seen.add(mid)
            continue
        last_checked = int(m["last_checked_at"] or 0)
        interval_min = int(m["interval"] or 5)
        if last_checked + (interval_min * 60) <= now:
            due.append(m)
            seen.add(mid)
    return due


def count_status(eff_status: str) -> str:
    s = (eff_status or "").strip().lower()
    if s == "up":
        return "up"
    if s == "down":
        return "down"
    if s == "warning":
        return "down"
    return "error"


def write_runner_heartbeat(db_path: str, note: str) -> None:
    try:
        log_path = os.path.join(os.path.dirname(os.path.abspath(db_path)), "monitor_runner_last.log")
        ts = time.strftime("%Y-%m-%d %H:%M:%S")
        with open(log_path, "a", encoding="utf-8") as fh:
            fh.write(f"{ts} pid={os.getpid()} {note}\n")
    except Exception:
        pass


def main() -> int:
    args = parse_args()
    db_path = os.path.normpath(args.db)
    write_runner_heartbeat(db_path, f"start db={db_path}")
    if not os.path.exists(db_path):
        print(f"ERROR: DB not found: {db_path}", file=sys.stderr)
        write_runner_heartbeat(db_path, f"exit db_missing {db_path}")
        return 2

    lock_handle = try_acquire_runner_lock(lock_path_for_db(db_path))
    if lock_handle is None:
        write_runner_heartbeat(db_path, "exit another_instance_active")
        if args.verbose:
            print("[INFO] Another monitor_runner instance is active; exiting.")
        return 0

    conn = open_db(db_path)
    ensure_outbox_schema(conn)
    ensure_monitors_schema(conn)
    ensure_monitor_check_jobs_schema(conn)

    max_workers = resolve_monitor_max_workers(conn, args.max_workers)
    if args.verbose:
        print(f"[INFO] max_workers={max_workers} (parallel probes)")

    claimed_job: Optional[Dict[str, Any]] = None
    job_id: Optional[int] = None
    forced_ids: Set[int] = set()
    force_notify_rules = False

    try:
        claimed_job = claim_next_job(conn)
        if claimed_job:
            job_id = int(claimed_job["id"])
            if is_job_cancelled(conn, job_id):
                finish_job(
                    conn,
                    job_id,
                    status="cancelled",
                    counts={
                        "checked": int(claimed_job.get("checked_count") or 0),
                        "total": int(claimed_job.get("total_count") or 0),
                        "up": int(claimed_job.get("up_count") or 0),
                        "down": int(claimed_job.get("down_count") or 0),
                        "error": int(claimed_job.get("error_count") or 0),
                    },
                    last_error="Cancelled by user",
                )
                claimed_job = None
                job_id = None
            else:
                forced_ids = set(parse_job_monitor_ids(claimed_job.get("monitor_ids")))
                force_notify_rules = int(claimed_job.get("force_notify_rules") or 0) == 1
                if args.verbose:
                    print(f"[INFO] claimed job={job_id} forced_ids={len(forced_ids)} force_notify_rules={force_notify_rules}")
                write_runner_heartbeat(db_path, f"claimed job={job_id} forced={len(forced_ids)}")

        now = now_ts()
        monitors = conn.execute("SELECT * FROM monitors WHERE is_active = 1").fetchall()
        due = build_due_list(monitors, now=now, force_all=bool(args.force_all), forced_ids=forced_ids)

        if args.limit and args.limit > 0:
            due = due[: args.limit]

        if args.verbose:
            print(f"[INFO] active={len(monitors)} due={len(due)} db={db_path}")

        if not due:
            if job_id is not None:
                finish_job(
                    conn,
                    job_id,
                    status="done",
                    counts={"checked": 0, "total": int(claimed_job.get("total_count") or 0) if claimed_job else 0, "up": 0, "down": 0, "error": 0},
                )
            return 0

        paused = True
        app_name = resolve_app_name(conn)
        try:
            paused = bool(notifications_paused(conn, default_on_error=True))
        except Exception as e:
            paused = True
            if args.verbose:
                print(f"[WARN] notifications_paused fetch failed; treating as paused. err={e}")

        monitor_by_id = {int(m["id"]): dict(m) for m in due}
        job_total = int(claimed_job.get("total_count") or 0) if claimed_job else len(due)
        if job_id is not None and job_total <= 0:
            job_total = len(forced_ids) if forced_ids else len(due)
            conn.execute("UPDATE monitor_check_jobs SET total_count = ? WHERE id = ?", (job_total, job_id))
            conn.commit()

        counts = {"checked": 0, "total": job_total if job_id else len(due), "up": 0, "down": 0, "error": 0}
        job_counts = {"checked": 0, "total": job_total, "up": 0, "down": 0, "error": 0} if job_id else None
        queued_emails = 0

        if args.dry_run:
            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
                futs = {ex.submit(perform_check, dict(m), args.verify_ssl, app_name=app_name): int(m["id"]) for m in due}
                for fut in concurrent.futures.as_completed(futs):
                    mid = futs[fut]
                    try:
                        r = fut.result()
                    except Exception as e:
                        r = CheckResult(status="down", details=f"Exception: {e}", response_ms=0)
                    m = monitor_by_id.get(mid) or {}
                    print(f"[DRY] monitor={mid} {m.get('name', '')} => {r.status} {r.response_ms}ms {r.details}")
            return 0

        job_cancelled = False
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
            futs = {ex.submit(perform_check, dict(m), args.verify_ssl, app_name=app_name): int(m["id"]) for m in due}
            for fut in concurrent.futures.as_completed(futs):
                if job_id is not None and is_job_cancelled(conn, job_id):
                    job_cancelled = True
                    if args.verbose:
                        print(f"[INFO] job={job_id} cancelled; skipping remaining monitors")
                    break

                mid = futs[fut]
                mrow = monitor_by_id.get(mid)
                if not mrow:
                    continue
                try:
                    r = fut.result()
                except Exception as e:
                    r = CheckResult(status="down", details=f"Exception: {e}", response_ms=0)

                try:
                    conn.execute("BEGIN")
                    eff_status, q = persist_monitor_result(
                        conn,
                        mrow,
                        r,
                        paused=paused,
                        app_name=app_name,
                        verbose=args.verbose,
                        force_notify_rules=force_notify_rules and mid in forced_ids,
                    )
                    conn.execute("COMMIT")
                    queued_emails += q
                except Exception as e:
                    with contextlib.suppress(Exception):
                        conn.execute("ROLLBACK")
                    if job_id is not None:
                        finish_job(
                            conn,
                            job_id,
                            status="error",
                            counts=job_counts if job_counts is not None else {"checked": 0, "total": 0, "up": 0, "down": 0, "error": 0},
                            last_error=str(e),
                        )
                    raise

                bucket = count_status(eff_status)
                if job_id is not None and mid in forced_ids and job_counts is not None:
                    job_counts["checked"] += 1
                    job_counts[bucket] = int(job_counts.get(bucket, 0)) + 1
                    update_job_progress(conn, job_id, job_counts)

        if job_id is not None and job_counts is not None:
            if job_cancelled or is_job_cancelled(conn, job_id):
                finish_job(
                    conn,
                    job_id,
                    status="cancelled",
                    counts=job_counts,
                    last_error="Cancelled by user",
                )
            else:
                finish_job(conn, job_id, status="done", counts=job_counts)

        if args.verbose:
            checked_n = job_counts["checked"] if job_counts is not None else len(due)
            print(f"[DONE] checked={checked_n} queued_emails={queued_emails}")
        return 0
    except Exception as e:
        if job_id is not None:
            with contextlib.suppress(Exception):
                finish_job(conn, job_id, status="error", counts={"checked": 0, "total": 0, "up": 0, "down": 0, "error": 0}, last_error=str(e))
        raise
    finally:
        with contextlib.suppress(Exception):
            conn.close()
        with contextlib.suppress(Exception):
            if lock_handle is not None:
                lock_handle.close()
                lp = lock_path_for_db(db_path)
                if os.path.isfile(lp):
                    os.remove(lp)


if __name__ == "__main__":
    raise SystemExit(main())
