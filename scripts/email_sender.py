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
from typing import Any, Dict, List, Optional, Sequence

from linknest_worker_lib import (
    DEFAULT_DB_PATH,
    ensure_outbox_schema,
    get_smtp_config,
    normalize_email_list,
    now_ts,
    open_db,
    send_smtp_email,
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


def main() -> int:
    args = parse_args()
    db_path = os.path.normpath(args.db)
    if not os.path.exists(db_path):
        print(f"ERROR: DB not found: {db_path}", file=sys.stderr)
        return 2

    conn = open_db(db_path)
    ensure_outbox_schema(conn)
    smtp_cfg = get_smtp_config(conn)

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
        print(f"[INFO] pending={len(rows)} db={db_path}")

    if not rows:
        conn.close()
        return 0

    conn.execute("BEGIN")
    try:
        for r in rows:
            outbox_id = int(r["id"])
            to_list = _split_list(r["to_emails"])
            cc_list = _split_list(r["cc_emails"])

            ok, err = send_smtp_email(
                smtp_cfg=smtp_cfg,
                to_list=to_list,
                cc_list=cc_list,
                subject=str(r["subject"]),
                body=str(r["body"]),
                from_name=(str(r["from_name"]) if r["from_name"] is not None else None),
                from_email=(str(r["from_email"]) if r["from_email"] is not None else None),
                timeout_seconds=int(args.smtp_timeout),
            )

            sent_time = now_ts()
            attempts = int(r["attempts"] or 0) + 1

            conn.execute(
                """
                UPDATE email_outbox
                SET attempts = ?,
                    last_error = ?,
                    sent_at = ?,
                    success = ?
                WHERE id = ?
                """,
                (attempts, (None if ok else (err or "Unknown error")), sent_time, (1 if ok else 0), outbox_id),
            )

            # Log per recipient (to + cc), matches LinkNest UI expectations
            all_rcpt: Sequence[str] = list(dict.fromkeys([*to_list, *cc_list]))
            status_trigger = (str(r["status_trigger"]) if r["status_trigger"] is not None else "both")
            subject = str(r["subject"])
            rule_id = r["rule_id"]
            monitor_id = r["monitor_id"]

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

