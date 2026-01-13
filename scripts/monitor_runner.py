"""
LinkNest Monitor Runner (Python)

Purpose:
- Run scheduled monitor checks WITHOUT PHP hanging/freezing
- Update SQLite tables: monitors, monitor_logs
- Queue notification emails into email_outbox (sent by email_sender.py)

Designed for:
- Windows Task Scheduler
- cron

Python: 3.9+
"""

from __future__ import annotations

import argparse
import concurrent.futures
import os
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

from linknest_worker_lib import (
    DEFAULT_DB_PATH,
    CheckResult,
    check_keyword,
    check_ping,
    check_port,
    check_url_head,
    day_of_week_active,
    ensure_monitors_schema,
    ensure_outbox_schema,
    is_in_maintenance_window,
    normalize_email_list,
    notifications_paused,
    now_ts,
    open_db,
    replace_template_vars,
    time_window_active,
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Run LinkNest monitor checks and queue emails.")
    p.add_argument("--db", default=DEFAULT_DB_PATH, help="Path to linknest.db")
    p.add_argument("--max-workers", type=int, default=10, help="Concurrent checks")
    p.add_argument("--verify-ssl", action="store_true", help="Verify SSL certificates (PHP currently disables verification)")
    p.add_argument("--force-all", action="store_true", help="Check all active monitors (ignore interval)")
    p.add_argument("--limit", type=int, default=0, help="Limit number of due monitors to check (0=unlimited)")
    p.add_argument("--dry-run", action="store_true", help="Do not write DB changes (prints what would happen)")
    p.add_argument("--verbose", action="store_true", help="Verbose output")
    return p.parse_args()


def perform_check(monitor: Dict[str, Any], verify_ssl: bool) -> CheckResult:
    t0 = time.time()

    def run_once(relaxed: bool = False) -> Tuple[str, str]:
        mtype = str(monitor.get("type") or "")
        target = str(monitor.get("target") or "")

        # Per-monitor timeout (seconds) - primarily used for url/keyword, but also applies to ping
        base_timeout = monitor.get("timeout")
        try:
            base_timeout_s = int(base_timeout) if base_timeout not in (None, "", False) else None
        except Exception:
            base_timeout_s = None
        if base_timeout_s is not None:
            base_timeout_s = max(1, min(60, base_timeout_s))

        if mtype == "url":
            timeout = 10 if relaxed else (base_timeout_s or 5)
            return check_url_head(target, timeout=timeout, verify_ssl=verify_ssl)
        if mtype == "keyword":
            timeout = 10 if relaxed else (base_timeout_s or 8)
            return check_keyword(target, str(monitor.get("keyword") or ""), timeout=timeout, verify_ssl=verify_ssl)
        if mtype == "port":
            timeout = 5 if relaxed else 3
            return check_port(target, int(monitor.get("port") or 0), timeout=timeout)
        if mtype == "ping":
            # Convert seconds to milliseconds for ping
            tms = 10000 if relaxed else int((base_timeout_s or 1) * 1000)
            return check_ping(target, timeout_ms=tms)
        return "down", "Invalid monitor type"

    status, details = run_once(relaxed=False)
    if status == "down":
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


def queue_advanced_notifications(conn, monitor_row, new_status: str, prev_status: Optional[str], details: str, response_ms: int, verbose: bool) -> int:
    triggers: List[str] = []
    norm_prev = None if prev_status in (None, "", False) else str(prev_status)
    if new_status == "down":
        triggers = ["down", "both"]
    # Treat WARNING as a down-like transitional state (below threshold),
    # so WARNING->UP should trigger "up" notifications too.
    elif new_status == "up" and (norm_prev in ("down", "warning")):
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
    now_local = None
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

        subject = replace_template_vars(r["subject_template"], monitor_row, new_status, details, response_ms)
        body = replace_template_vars(r["body_template"], monitor_row, new_status, details, response_ms)
        from_name = (r["from_name"] or "LinkNest Monitor").strip() if r["from_name"] is not None else "LinkNest Monitor"
        from_email = (r["from_email"] or "").strip() if r["from_email"] is not None else None

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


def queue_legacy_notification(conn, monitor_row, new_status: str, prev_status: Optional[str], details: str, response_ms: int, verbose: bool) -> int:
    # Rule-based only mode (disable legacy emails)
    try:
        if int(monitor_row["legacy_email_disabled"] or 0) == 1:
            return 0
    except Exception:
        # Column may not exist on very old DBs; ignore and proceed with legacy logic.
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
    # Treat WARNING as a down-like transitional state (below threshold),
    # so WARNING->UP should trigger legacy "up" notification too.
    elif norm_prev in ("down", "warning") and norm_new == "up":
        trigger = "up"
        subject_status = "up"
        message_details = f"UP: {monitor_row['name']} is back online."
    else:
        return 0

    # recipients: monitor override or first admin
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

    default_subject_tpl = "[LinkNest Monitor] {monitor_name} Status Update"
    default_body_tpl = (
        "{status}: {monitor_name}\n"
        "Target: {monitor_target}\n"
        "Details: {details}\n"
        "Response: {response_time}\n"
        "Time: {time}\n"
    )
    subject_tpl = (monitor_row["legacy_email_subject_template"] or "").strip() or default_subject_tpl
    body_tpl = (monitor_row["legacy_email_body_template"] or "").strip() or default_body_tpl

    subject = replace_template_vars(subject_tpl, monitor_row, subject_status, message_details or "", int(response_ms))
    body = replace_template_vars(body_tpl, monitor_row, subject_status, message_details or "", int(response_ms))

    from_name = (monitor_row["legacy_email_from_name"] or "").strip() or None
    from_email = (monitor_row["legacy_email_from_email"] or "").strip() or None

    # legacy helpers applied by sender after an attempt:
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


def main() -> int:
    args = parse_args()
    db_path = os.path.normpath(args.db)
    if not os.path.exists(db_path):
        print(f"ERROR: DB not found: {db_path}", file=sys.stderr)
        return 2

    conn = open_db(db_path)
    ensure_outbox_schema(conn)
    ensure_monitors_schema(conn)

    now = now_ts()
    monitors = conn.execute("SELECT * FROM monitors WHERE is_active = 1").fetchall()
    due: List[Any] = []
    for m in monitors:
        if args.force_all:
            due.append(m)
            continue
        last_checked = int(m["last_checked_at"] or 0)
        interval_min = int(m["interval"] or 5)
        if last_checked + (interval_min * 60) <= now:
            due.append(m)

    if args.limit and args.limit > 0:
        due = due[: args.limit]

    if args.verbose:
        print(f"[INFO] active={len(monitors)} due={len(due)} db={db_path}")

    if not due:
        return 0

    # Determine notification pause state once per run.
    # Even if this check fails (locked/missing settings), we MUST still update monitor statuses.
    paused = True
    try:
        paused = bool(notifications_paused(conn, default_on_error=True))
    except Exception as e:
        paused = True
        if args.verbose:
            print(f"[WARN] notifications_paused() failed; treating as paused. err={e}")

    # Run network checks concurrently, but keep DB writes single-threaded.
    results: Dict[int, CheckResult] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, int(args.max_workers))) as ex:
        futs = {ex.submit(perform_check, dict(m), args.verify_ssl): int(m["id"]) for m in due}
        for fut in concurrent.futures.as_completed(futs):
            mid = futs[fut]
            try:
                results[mid] = fut.result()
            except Exception as e:
                results[mid] = CheckResult(status="down", details=f"Exception: {e}", response_ms=0)

    if args.dry_run:
        for m in due:
            mid = int(m["id"])
            r = results[mid]
            print(f"[DRY] monitor={mid} {m['name']} => {r.status} {r.response_ms}ms {r.details}")
        return 0

    queued_emails = 0
    updated = 0
    conn.execute("BEGIN")
    try:
        for m in due:
            mid = int(m["id"])
            r = results[mid]
            prev = m["last_status"]

            # Warning threshold logic: consecutive failures before declaring DOWN
            try:
                threshold = int(m["warning_threshold"] or 1)
            except Exception:
                threshold = 1
            threshold = max(1, min(20, threshold))

            try:
                prev_fail = int(m["consecutive_failures"] or 0)
            except Exception:
                prev_fail = 0
            prev_fail = max(0, prev_fail)

            raw_status = (r.status or "").strip().lower()
            if raw_status not in ("up", "down"):
                raw_status = "down"

            new_fail = (prev_fail + 1) if raw_status == "down" else 0
            eff_status = raw_status
            eff_details = r.details
            if raw_status == "down" and threshold > 1 and new_fail < threshold:
                eff_status = "warning"
                eff_details = f"Warning ({new_fail}/{threshold}): {r.details}"

            # Update monitor record
            t = now_ts()
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

            # Insert log
            conn.execute(
                "INSERT INTO monitor_logs (monitor_id, status, response_time, details, checked_at) VALUES (?, ?, ?, ?, ?)",
                (mid, eff_status, int(r.response_ms), eff_details, t),
            )

            changed = status_changed(prev, eff_status)
            # Email queueing is best-effort and MUST NOT block monitor status updates.
            # If notifications are paused (email pause), we skip queueing only.
            try:
                if changed and (not paused) and (not is_in_maintenance_window(m)):
                    queued_emails += queue_advanced_notifications(conn, m, eff_status, prev, eff_details, r.response_ms, args.verbose)
                if (not paused) and (not is_in_maintenance_window(m)):
                    queued_emails += queue_legacy_notification(conn, m, eff_status, prev, eff_details, r.response_ms, args.verbose)
            except Exception as e:
                if args.verbose:
                    print(f"[WARN] email queueing failed; continuing. monitor={mid} err={e}")

            updated += 1

        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()

    if args.verbose:
        print(f"[DONE] checked={updated} queued_emails={queued_emails}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

