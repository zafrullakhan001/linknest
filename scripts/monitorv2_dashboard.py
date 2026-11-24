"""
LinkNest Monitorv2 Dashboard (Python)

Web dashboard for the Monitorv2 addon using the zmonitoring PostgreSQL database.
Connects to the zmonitoring database (default: localhost:5433, user postgres)
and displays monitor status, recent checks, and summary stats.

Usage:
  python monitorv2_dashboard.py                       # Start server on http://127.0.0.1:5050
  python monitorv2_dashboard.py --port-http 8080      # Custom HTTP port
  python monitorv2_dashboard.py --no-browser         # Do not open browser

Environment (optional):
  ZMONITORING_HOST     default: localhost
  ZMONITORING_PORT     default: 5433
  ZMONITORING_DB       default: zmonitoring
  ZMONITORING_USER     default: postgres
  ZMONITORING_PASSWORD default: postgres (use env for production)

Requirements: pip install psycopg2-binary flask

Python: 3.9+
"""

from __future__ import annotations

import argparse
import os
import sys
import webbrowser
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

# Optional dependencies
try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None  # type: ignore

try:
    from flask import Flask, render_template_string
except ImportError:
    Flask = None  # type: ignore
    render_template_string = None  # type: ignore


# -----------------------------------------------------------------------------
# Config
# -----------------------------------------------------------------------------
DEFAULT_HOST = os.environ.get("ZMONITORING_HOST", "localhost")
DEFAULT_PORT = int(os.environ.get("ZMONITORING_PORT", "5433"))
DEFAULT_DB = os.environ.get("ZMONITORING_DB", "zmonitoring")
DEFAULT_USER = os.environ.get("ZMONITORING_USER", "postgres")
DEFAULT_PASSWORD = os.environ.get("ZMONITORING_PASSWORD", "postgres")
SCHEMA = "zmonitoring"


def get_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Monitorv2 dashboard for zmonitoring PostgreSQL database."
    )
    p.add_argument("--host", default=DEFAULT_HOST, help="PostgreSQL host")
    p.add_argument("--port", type=int, default=DEFAULT_PORT, help="PostgreSQL port")
    p.add_argument("--db", default=DEFAULT_DB, help="Database name")
    p.add_argument("--user", default=DEFAULT_USER, help="Database user")
    p.add_argument("--password", default=DEFAULT_PASSWORD, help="Database password")
    p.add_argument("--bind", default="127.0.0.1", help="HTTP bind address")
    p.add_argument("--port-http", type=int, default=5050, help="HTTP server port")
    p.add_argument("--no-browser", action="store_true", help="Do not open browser")
    return p


@contextmanager
def get_connection(host: str, port: int, db: str, user: str, password: str):
    if not psycopg2:
        raise RuntimeError("psycopg2 is required. Install with: pip install psycopg2-binary")
    conn = psycopg2.connect(
        host=host,
        port=port,
        dbname=db,
        user=user,
        password=password,
        connect_timeout=5,
    )
    try:
        yield conn
    finally:
        try:
            conn.close()
        except Exception:
            pass


def fetch_monitors(conn) -> List[Dict[str, Any]]:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT id, name, type, target, current_status, last_checked_at,
                   last_response_time_ms, uptime_percentage, is_active,
                   tab_name, group_name, interval_minutes
            FROM zmonitoring.monitors
            ORDER BY tab_name, group_name, name
            """
        )
        rows = cur.fetchall()
    return [dict(r) for r in rows]


def fetch_summary(conn) -> Dict[str, Any]:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT COUNT(*) AS total FROM zmonitoring.monitors")
        total = cur.fetchone()["total"] or 0
        cur.execute(
            """
            SELECT current_status, COUNT(*) AS cnt
            FROM zmonitoring.monitors
            WHERE is_active = TRUE
            GROUP BY current_status
            """
        )
        by_status = {r["current_status"] or "unknown": r["cnt"] for r in cur.fetchall()}
        cur.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM zmonitoring.monitor_checks
            WHERE checked_at >= NOW() - INTERVAL '24 hours'
            """
        )
        checks_24h = cur.fetchone()["cnt"] or 0
    return {
        "total_monitors": total,
        "up": by_status.get("up", 0),
        "down": by_status.get("down", 0),
        "warning": by_status.get("warning", 0),
        "unknown": by_status.get("unknown", 0),
        "checks_24h": checks_24h,
    }


def fetch_recent_checks(conn, limit: int = 50) -> List[Dict[str, Any]]:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT c.id, c.monitor_id, m.name AS monitor_name, c.status, c.response_time_ms,
                   c.checked_at, c.details
            FROM zmonitoring.monitor_checks c
            JOIN zmonitoring.monitors m ON m.id = c.monitor_id
            ORDER BY c.checked_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        rows = cur.fetchall()
    return [dict(r) for r in rows]


# -----------------------------------------------------------------------------
# HTML template
# -----------------------------------------------------------------------------
DASHBOARD_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Monitorv2 Dashboard | LinkNest</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 16px; background: #0f172a; color: #e2e8f0; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin: 0 0 8px 0; }
    .subtitle { color: #94a3b8; font-size: 0.9rem; margin-bottom: 24px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .stat { background: #1e293b; padding: 16px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 1.75rem; font-weight: 700; }
    .stat-label { font-size: 0.8rem; color: #94a3b8; margin-top: 4px; }
    .stat.up .stat-value { color: #22c55e; }
    .stat.down .stat-value { color: #ef4444; }
    .stat.warning .stat-value { color: #eab308; }
    .card { background: #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .card h2 { font-size: 1rem; margin: 0 0 12px 0; color: #94a3b8; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #334155; }
    th { color: #94a3b8; font-weight: 600; font-size: 0.85rem; }
    .status { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
    .status.up { background: #166534; color: #86efac; }
    .status.down { background: #991b1b; color: #fca5a5; }
    .status.warning { background: #854d0e; color: #fde047; }
    .status.unknown { background: #475569; color: #cbd5e1; }
    .time { font-size: 0.85rem; color: #94a3b8; }
    .error { background: #7f1d1d; color: #fecaca; padding: 16px; border-radius: 8px; margin-bottom: 16px; }
    .refresh { margin-bottom: 16px; }
    .refresh a { color: #38bdf8; text-decoration: none; }
    .refresh a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Monitorv2 Dashboard</h1>
    <p class="subtitle">zmonitoring database · {{ db_info }}</p>
    <div class="refresh"><a href="{{ url_for('index') }}">Refresh</a></div>

    {% if error %}
    <div class="error">{{ error }}</div>
    {% else %}
    <div class="stats">
      <div class="stat"><div class="stat-value">{{ summary.total_monitors }}</div><div class="stat-label">Monitors</div></div>
      <div class="stat up"><div class="stat-value">{{ summary.up }}</div><div class="stat-label">Up</div></div>
      <div class="stat down"><div class="stat-value">{{ summary.down }}</div><div class="stat-label">Down</div></div>
      <div class="stat warning"><div class="stat-value">{{ summary.warning }}</div><div class="stat-label">Warning</div></div>
      <div class="stat"><div class="stat-value">{{ summary.checks_24h }}</div><div class="stat-label">Checks (24h)</div></div>
    </div>

    <div class="card">
      <h2>Monitors</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Target</th>
            <th>Status</th>
            <th>Response</th>
            <th>Uptime %</th>
            <th>Last checked</th>
          </tr>
        </thead>
        <tbody>
          {% for m in monitors %}
          <tr>
            <td>{{ m.name }}</td>
            <td>{{ m.type }}</td>
            <td>{{ (m.target or '')[:50] }}{% if (m.target or '')|length > 50 %}…{% endif %}</td>
            <td><span class="status {{ m.current_status or 'unknown' }}">{{ m.current_status or 'unknown' }}</span></td>
            <td>{% if m.last_response_time_ms is not none %}{{ m.last_response_time_ms }} ms{% else %}—{% endif %}</td>
            <td>{% if m.uptime_percentage is not none %}{{ "%.1f"|format(m.uptime_percentage) }}%{% else %}—{% endif %}</td>
            <td class="time">{% if m.last_checked_at %}{{ m.last_checked_at.strftime('%Y-%m-%d %H:%M') }}{% else %}—{% endif %}</td>
          </tr>
          {% endfor %}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2>Recent checks</h2>
      <table>
        <thead>
          <tr>
            <th>Monitor</th>
            <th>Status</th>
            <th>Response</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {% for c in recent_checks %}
          <tr>
            <td>{{ c.monitor_name }}</td>
            <td><span class="status {{ c.status }}">{{ c.status }}</span></td>
            <td>{% if c.response_time_ms is not none %}{{ c.response_time_ms }} ms{% else %}—{% endif %}</td>
            <td class="time">{{ c.checked_at.strftime('%Y-%m-%d %H:%M:%S') if c.checked_at else '—' }}</td>
          </tr>
          {% endfor %}
        </tbody>
      </table>
    </div>
    {% endif %}
  </div>
</body>
</html>
"""


def create_app(args: argparse.Namespace) -> Flask:
    if Flask is None:
        raise RuntimeError("Flask is required. Install with: pip install flask")

    app = Flask(__name__)

    def db_info() -> str:
        return f"{args.host}:{args.port}/{args.db}"

    @app.route("/")
    def index():
        error = None
        summary = {}
        monitors = []
        recent_checks = []
        try:
            with get_connection(
                args.host, args.port, args.db, args.user, args.password
            ) as conn:
                summary = fetch_summary(conn)
                monitors = fetch_monitors(conn)
                recent_checks = fetch_recent_checks(conn, limit=50)
        except Exception as e:
            error = str(e)
            summary = {
                "total_monitors": 0,
                "up": 0,
                "down": 0,
                "warning": 0,
                "unknown": 0,
                "checks_24h": 0,
            }

        return render_template_string(
            DASHBOARD_HTML,
            db_info=db_info(),
            error=error,
            summary=summary,
            monitors=monitors,
            recent_checks=recent_checks,
        )

    return app


def main() -> int:
    args = get_parser().parse_args()
    if not psycopg2:
        print("Error: psycopg2 is required. Install with: pip install psycopg2-binary", file=sys.stderr)
        return 1
    if Flask is None:
        print("Error: Flask is required. Install with: pip install flask", file=sys.stderr)
        return 1

    app = create_app(args)
    url = f"http://{args.bind}:{args.port_http}/"
    print(f"Monitorv2 Dashboard: {url}")
    print(f"Database: {args.host}:{args.port}/{args.db}")
    if not args.no_browser:
        webbrowser.open(url)
    app.run(host=args.bind, port=args.port_http, debug=False, use_reloader=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
