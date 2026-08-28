"""
LinkNest Email Sender (Python)

Purpose:
- Dequeue emails from email_outbox and send via SMTP
- Write send result to monitor_notification_logs (so LinkNest UI displays the email history)
- Apply legacy monitor flags after attempt:
  - clear legacy_notify_pending (if requested)
  - update monitors.last_notified_status (on success)

Python: 3.9+
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import List, Optional, Sequence, Tuple

# Embeddable CPython (bin/python + python*._pth) does not put this script's
# folder on sys.path, so linknest_worker_lib would otherwise fail to import.
_scripts_dir = os.path.dirname(os.path.abspath(__file__))
if _scripts_dir not in sys.path:
    sys.path.insert(0, _scripts_dir)

from linknest_worker_lib import (
    DEFAULT_DB_PATH,
    day_of_week_active,
    ensure_outbox_schema,
    ensure_monitors_schema,
    get_smtp_config,
    is_in_maintenance_window,
    monitor_notification_now,
    normalize_email_list,
    notifications_paused,
    now_ts,
    open_db,
    time_window_active,
    send_smtp_email,
    ln_render_monitor_notification_html,
    _ln_ensure_monitor_email_subject_has_status,
    _monitor_email_details_from_body,
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Send queued LinkNest emails from SQLite email_outbox.")
    p.add_argument("--db", default=DEFAULT_DB_PATH, help="Path to linknest.db")
    p.add_argument("--limit", type=int, default=25, help="Max emails to process per run")
    p.add_argument("--smtp-timeout", type=int, default=20, help="SMTP timeout seconds")
    p.add_argument("--verbose", action="store_true", help="Verbose output")
    return p.parse_args()


def _split_list(csv: Optional[str]) -> List[str]:
    return normalize_email_list(csv or "")

def _compute_backoff_seconds(attempts: int) -> int:
    # Exponential backoff to avoid hammering SMTP / spamming retries
    # 1st failure: 60s, 2nd: 120s, 3rd: 240s ... capped at 1 hour
    if attempts < 1:
        attempts = 1
    return min(3600, 60 * (2 ** (attempts - 1)))

def _get_int_setting(conn, key: str, default: int) -> int:
    try:
        row = conn.execute("SELECT value FROM settings WHERE key = ? LIMIT 1", (str(key),)).fetchone()
        if not row:
            return int(default)
        v = row["value"]
        if v is None:
            return int(default)
        return int(str(v).strip())
    except Exception:
        return int(default)

def _get_dedupe_window_seconds(conn) -> int:
    """
    Duplicate suppression window in seconds.
    - Env override: LINKNEST_EMAIL_DEDUPE_WINDOW_SECONDS
    - DB setting:  email_dedupe_window_seconds
    - Default:     0 (disabled)
    """
    env = os.getenv("LINKNEST_EMAIL_DEDUPE_WINDOW_SECONDS")
    if env is not None and str(env).strip() != "":
        try:
            return max(0, int(str(env).strip()))
        except Exception:
            return 0
    return max(0, _get_int_setting(conn, "email_dedupe_window_seconds", 0))

def _should_suppress_duplicate(
    conn,
    *,
    monitor_id: int,
    rule_id: Optional[int],
    status_trigger: str,
    subject: str,
    recipients: Sequence[str],
    window_seconds: int = 300,
) -> bool:
    """
    Basic spam protection:
    If any recipient already has a SUCCESS log with same monitor_id + rule_id + trigger + subject
    within the last window, suppress sending this message.

    Important: include rule_id so multiple *different* rules can fire even if they produce the same
    subject/recipients (users may intentionally create overlapping rules).
    """
    if int(window_seconds) <= 0:
        return False
    since = now_ts() - int(window_seconds)
    for email in recipients:
        rule_clause = "AND rule_id IS NULL"
        params: Tuple[object, ...]
        if rule_id is not None:
            rule_clause = "AND rule_id = ?"
            params = (int(monitor_id), str(status_trigger), str(subject), str(email), int(since), int(rule_id))
        else:
            params = (int(monitor_id), str(status_trigger), str(subject), str(email), int(since))
        row = conn.execute(
            f"""
            SELECT 1
            FROM monitor_notification_logs
            WHERE monitor_id = ?
              AND status_trigger = ?
              AND subject = ?
              AND recipient_email = ?
              AND success = 1
              AND sent_at >= ?
              {rule_clause}
            LIMIT 1
            """,
            params,
        ).fetchone()
        if row:
            return True
    return False


def main() -> int:
    args = parse_args()
    db_path = os.path.normpath(args.db)
    if not os.path.exists(db_path):
        print(f"ERROR: DB not found: {db_path}", file=sys.stderr)
        return 2

    conn = open_db(db_path)
    ensure_outbox_schema(conn)
    ensure_monitors_schema(conn)
    smtp_cfg = get_smtp_config(conn)
    dedupe_window_seconds = _get_dedupe_window_seconds(conn)
    app_name = "LinkNest"
    try:
        row = conn.execute("SELECT value FROM settings WHERE key = 'app_name' LIMIT 1").fetchone()
        if row and row["value"]:
            app_name = str(row["value"]).strip()
    except Exception:
        pass

    if notifications_paused(conn):
        if args.verbose:
            print("[INFO] notifications paused; not sending outbox")
        conn.close()
        return 0

    # Use BEGIN IMMEDIATE to reduce chance of multiple senders processing same rows.
    conn.execute("BEGIN IMMEDIATE")
    try:
        now = now_ts()
        rows = conn.execute(
            """
            SELECT *
            FROM email_outbox
            WHERE sent_at IS NULL
              AND (send_after IS NULL OR send_after <= ?)
              AND (max_attempts IS NULL OR attempts < max_attempts)
            ORDER BY created_at ASC
            LIMIT ?
            """,
            (now, int(args.limit)),
        ).fetchall()

        if args.verbose:
            print(f"[INFO] pending={len(rows)} db={db_path} dedupe_window_seconds={dedupe_window_seconds}")

        if not rows:
            conn.execute("COMMIT")
            conn.close()
            return 0

        for r in rows:
            outbox_id = int(r["id"])
            monitor_id = r["monitor_id"]
            rule_id = r["rule_id"]
            status_trigger = (str(r["status_trigger"]) if r["status_trigger"] is not None else "both")
            subject = str(r["subject"])

            # Claim/lock this outbox item for a short time window so multiple senders won't double-send.
            claim_until = now_ts() + 900
            cur_now = now_ts()
            res = conn.execute(
                """
                UPDATE email_outbox
                SET send_after = ?
                WHERE id = ?
                  AND sent_at IS NULL
                  AND (send_after IS NULL OR send_after <= ?)
                """,
                (int(claim_until), outbox_id, int(cur_now)),
            )
            if res.rowcount != 1:
                # Someone else claimed it or it is no longer due.
                continue

            # Re-check pause each loop (in case it was enabled mid-run)
            if notifications_paused(conn):
                # Put it back quickly so it can retry later
                conn.execute("UPDATE email_outbox SET send_after = ? WHERE id = ?", (now_ts() + 60, outbox_id))
                continue

            # If tied to a monitor, re-check maintenance window and toggle changes.
            if monitor_id is not None:
                m = conn.execute("SELECT * FROM monitors WHERE id = ? LIMIT 1", (int(monitor_id),)).fetchone()
                if not m:
                    # Monitor deleted: suppress (do not send)
                    conn.execute(
                        "UPDATE email_outbox SET sent_at = ?, success = 1, last_error = ? WHERE id = ?",
                        (now_ts(), "suppressed: monitor missing", outbox_id),
                    )
                    continue
                if is_in_maintenance_window(m):
                    # Postpone without counting as an attempt.
                    conn.execute(
                        "UPDATE email_outbox SET send_after = ?, last_error = ? WHERE id = ?",
                        (now_ts() + 900, "postponed: maintenance window", outbox_id),
                    )
                    continue

                # Legacy: if user disabled legacy notifications after it was queued, suppress.
                if rule_id is None:
                    try:
                        if int(m["legacy_email_disabled"] or 0) == 1:
                            conn.execute(
                                "UPDATE email_outbox SET sent_at = ?, success = 1, last_error = ? WHERE id = ?",
                                (now_ts(), "suppressed: legacy notifications disabled (rule-based only)", outbox_id),
                            )
                            continue
                    except Exception:
                        # Column may not exist; fall back to email_notification guard below.
                        pass

                if rule_id is None and int(m["email_notification"] or 0) != 1:
                    conn.execute(
                        "UPDATE email_outbox SET sent_at = ?, success = 1, last_error = ? WHERE id = ?",
                        (now_ts(), "suppressed: legacy notifications disabled", outbox_id),
                    )
                    continue

            # Advanced: if rule was disabled after queueing, suppress; if rule has time window/day rules, postpone.
            if rule_id is not None:
                rule = conn.execute(
                    "SELECT * FROM monitor_notification_rules WHERE id = ? LIMIT 1",
                    (int(rule_id),),
                ).fetchone()
                if not rule or int(rule["is_enabled"] or 0) != 1:
                    conn.execute(
                        "UPDATE email_outbox SET sent_at = ?, success = 1, last_error = ? WHERE id = ?",
                        (now_ts(), "suppressed: rule disabled/missing", outbox_id),
                    )
                    continue
                notify_now = monitor_notification_now(conn)
                if not time_window_active(
                    rule["time_window_start"],
                    rule["time_window_end"],
                    notify_now,
                ) or not day_of_week_active(rule["days_of_week"], notify_now):
                    conn.execute(
                        "UPDATE email_outbox SET send_after = ?, last_error = ? WHERE id = ?",
                        (now_ts() + 60, "postponed: outside rule window", outbox_id),
                    )
                    continue

            to_list = _split_list(r["to_emails"])
            cc_list = _split_list(r["cc_emails"])
            all_rcpt: Sequence[str] = list(dict.fromkeys([*to_list, *cc_list]))
            if not all_rcpt:
                conn.execute(
                    "UPDATE email_outbox SET sent_at = ?, success = 1, last_error = ? WHERE id = ?",
                    (now_ts(), "suppressed: no recipients", outbox_id),
                )
                continue

            # Duplicate suppression (short window). This helps prevent accidental inbox spam if duplicates were queued.
            if monitor_id is not None and _should_suppress_duplicate(
                conn,
                monitor_id=int(monitor_id),
                rule_id=(int(rule_id) if rule_id is not None else None),
                status_trigger=status_trigger,
                subject=subject,
                recipients=all_rcpt,
                window_seconds=dedupe_window_seconds,
            ):
                conn.execute(
                    "UPDATE email_outbox SET sent_at = ?, success = 1, last_error = ? WHERE id = ?",
                    (now_ts(), f"suppressed: duplicate within window ({dedupe_window_seconds}s)", outbox_id),
                )
                continue

            mrow = None
            if monitor_id is not None:
                mrow = conn.execute("SELECT * FROM monitors WHERE id = ? LIMIT 1", (int(monitor_id),)).fetchone()

            subject = _ln_ensure_monitor_email_subject_has_status(
                str(subject or ""),
                str(status_trigger or ""),
                str(mrow["name"]) if mrow and mrow["name"] is not None else None,
            )

            # Now we can attempt a send.
            html_body = None
            try:
                # Use LinkNest HTML template (like legacy PHP emails) for BOTH legacy and rule-based notifications.
                monitor_name = str(mrow["name"]) if mrow and mrow["name"] is not None else "Monitor"
                target = str(mrow["target"]) if mrow and mrow["target"] is not None else ""
                rt = None
                if mrow is not None:
                    rt = mrow["last_response_time"]
                body_text = str(r["body"] or "")
                html_body = ln_render_monitor_notification_html(
                    monitor_name=monitor_name,
                    target=target,
                    status=str(status_trigger or ""),
                    details=_monitor_email_details_from_body(body_text),
                    response_time_ms=(f"{int(rt)} ms" if rt not in (None, "", False) else None),
                    app_name=app_name,
                    db_conn=conn,
                )
            except Exception:
                # Never fail sending because of HTML rendering issues; plain-text fallback will still send.
                html_body = None

            ok, err = send_smtp_email(
                smtp_cfg=smtp_cfg,
                to_list=to_list,
                cc_list=cc_list,
                subject=subject,
                body=str(r["body"]),
                html_body=html_body,
                from_name=(str(r["from_name"]) if r["from_name"] is not None else None),
                from_email=(str(r["from_email"]) if r["from_email"] is not None else None),
                timeout_seconds=int(args.smtp_timeout),
                db_conn=conn,
            )

            attempt_n = int(r["attempts"] or 0) + 1
            max_attempts = int(r["max_attempts"] or 3)
            sent_time = now_ts()

            if ok:
                conn.execute(
                    """
                    UPDATE email_outbox
                    SET attempts = ?,
                        last_error = NULL,
                        sent_at = ?,
                        success = 1
                    WHERE id = ?
                    """,
                    (attempt_n, sent_time, outbox_id),
                )
            else:
                # Retry later with backoff; only mark sent_at when permanently failed.
                if attempt_n >= max_attempts:
                    conn.execute(
                        """
                        UPDATE email_outbox
                        SET attempts = ?,
                            last_error = ?,
                            sent_at = ?,
                            success = 0
                        WHERE id = ?
                        """,
                        (attempt_n, (err or "Unknown error"), sent_time, outbox_id),
                    )
                else:
                    conn.execute(
                        """
                        UPDATE email_outbox
                        SET attempts = ?,
                            last_error = ?,
                            send_after = ?,
                            success = 0
                        WHERE id = ?
                        """,
                        (attempt_n, (err or "Unknown error"), now_ts() + _compute_backoff_seconds(attempt_n), outbox_id),
                    )

            # Log per recipient (to + cc), matches LinkNest UI expectations
            if monitor_id is not None:
                for email in all_rcpt:
                    conn.execute(
                        """
                        INSERT INTO monitor_notification_logs (
                          rule_id, monitor_id, recipient_email, status_trigger,
                          sent_at, subject, success, error_message
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            (int(rule_id) if rule_id is not None else None),
                            int(monitor_id),
                            email,
                            status_trigger,
                            sent_time,
                            subject,
                            (1 if ok else 0),
                            (None if ok else (err or "Unknown error")),
                        ),
                    )

            # Legacy helpers
            if r["legacy_clear_pending"] and monitor_id is not None:
                conn.execute(
                    "UPDATE monitors SET legacy_notify_pending = 0, updated_at = ? WHERE id = ?",
                    (sent_time, int(monitor_id)),
                )

            # Only update last_notified_status on successful send (matches PHP behavior)
            if ok and r["legacy_update_last_notified_status"] and monitor_id is not None:
                conn.execute(
                    "UPDATE monitors SET last_notified_status = ?, updated_at = ? WHERE id = ?",
                    (str(r["legacy_update_last_notified_status"]), sent_time, int(monitor_id)),
                )

            if args.verbose:
                print(f"[SEND] outbox={outbox_id} ok={ok} to={len(to_list)} cc={len(cc_list)} err={err or ''}")

        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

