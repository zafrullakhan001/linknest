import React from 'react';
import { HelpMonitorArchitecture } from './HelpMonitorArchitecture';

const code = 'text-xs bg-white/70 dark:bg-slate-800 px-1 rounded font-mono';
const pre =
  'text-[11px] leading-relaxed bg-slate-900 text-slate-100 dark:bg-black/40 rounded-lg p-3 overflow-x-auto font-mono whitespace-pre-wrap';

export const HelpPythonWorkersPanel: React.FC = () => {
  return (
    <div className="space-y-4 text-slate-700 dark:text-slate-300 text-sm">
      <p>
        LinkNest runs scheduled monitor checks and outbound alert mail in <strong>Python workers</strong> — separate OS
        processes started by Task Scheduler, cron, or Docker. Apache/PHP serves the dashboard only. Slow URLs or stuck
        SMTP cannot freeze PHP requests.
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Full reference (searchable, with Mermaid diagrams): <strong>Guides → Python Workers (Monitoring + Email)</strong>{' '}
        (<code className={code}>docs/PYTHON_WORKERS.md</code>).
      </p>

      <HelpMonitorArchitecture />

      <div className="bg-violet-50 dark:bg-violet-900/20 rounded-lg p-4 space-y-2">
        <p className="font-medium text-violet-900 dark:text-violet-100">Scripts</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <code className={code}>scripts/monitor_runner.py</code> — probes due monitors <strong>in parallel</strong>,
            writes <code className={code}>monitors</code> / <code className={code}>monitor_logs</code>, queues{' '}
            <code className={code}>email_outbox</code>, processes force-all jobs from{' '}
            <code className={code}>monitor_check_jobs</code>.
          </li>
          <li>
            <code className={code}>scripts/email_sender.py</code> — drains <code className={code}>email_outbox</code>{' '}
            via SMTP; writes <code className={code}>monitor_notification_logs</code>.
          </li>
          <li>
            <code className={code}>scripts/schedule-monitor-workers.ps1</code> +{' '}
            <code className={code}>scripts/schedule-monitor-workers.bat</code> — install/verify Windows Task Scheduler
            jobs.
          </li>
        </ul>
      </div>

      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-3">
        <p className="font-medium text-slate-900 dark:text-white">monitor_runner.py — CLI options</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="py-1.5 pr-3 font-semibold">Option</th>
                <th className="py-1.5 pr-3 font-semibold">Default</th>
                <th className="py-1.5 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-1.5 pr-3"><code className={code}>--db</code></td>
                <td className="py-1.5 pr-3"><code className={code}>data/linknest.db</code></td>
                <td className="py-1.5">SQLite path (same file PHP uses)</td>
              </tr>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-1.5 pr-3"><code className={code}>--max-workers</code></td>
                <td className="py-1.5 pr-3">setting or 20</td>
                <td className="py-1.5">Parallel probe threads (1–64). Setting key: <code className={code}>monitor_worker_max_workers</code></td>
              </tr>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-1.5 pr-3"><code className={code}>--force-all</code></td>
                <td className="py-1.5 pr-3">off</td>
                <td className="py-1.5">Check every active monitor (ignore per-monitor interval)</td>
              </tr>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-1.5 pr-3"><code className={code}>--limit</code></td>
                <td className="py-1.5 pr-3">0 (unlimited)</td>
                <td className="py-1.5">Max monitors to check this run</td>
              </tr>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-1.5 pr-3"><code className={code}>--verify-ssl</code></td>
                <td className="py-1.5 pr-3">off</td>
                <td className="py-1.5">Verify TLS certificates (PHP checks currently skip verification)</td>
              </tr>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-1.5 pr-3"><code className={code}>--dry-run</code></td>
                <td className="py-1.5 pr-3">off</td>
                <td className="py-1.5">Probe only — no SQLite writes</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-3"><code className={code}>--verbose</code></td>
                <td className="py-1.5 pr-3">off</td>
                <td className="py-1.5">Log progress to stdout</td>
              </tr>
            </tbody>
          </table>
        </div>
        <pre className={pre}>{`# Manual run (project root)
python scripts\\monitor_runner.py --verbose
python scripts\\monitor_runner.py --db C:\\xampp\\htdocs\\linknest\\data\\linknest.db --max-workers 32 --verbose
python scripts\\monitor_runner.py --force-all --dry-run --verbose`}</pre>
      </div>

      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-3">
        <p className="font-medium text-slate-900 dark:text-white">email_sender.py — CLI options</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="py-1.5 pr-3 font-semibold">Option</th>
                <th className="py-1.5 pr-3 font-semibold">Default</th>
                <th className="py-1.5 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-1.5 pr-3"><code className={code}>--db</code></td>
                <td className="py-1.5 pr-3"><code className={code}>data/linknest.db</code></td>
                <td className="py-1.5">SQLite path</td>
              </tr>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-1.5 pr-3"><code className={code}>--limit</code></td>
                <td className="py-1.5 pr-3">25</td>
                <td className="py-1.5">Max outbox messages per run</td>
              </tr>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-1.5 pr-3"><code className={code}>--smtp-timeout</code></td>
                <td className="py-1.5 pr-3">20</td>
                <td className="py-1.5">SMTP socket timeout (seconds)</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-3"><code className={code}>--verbose</code></td>
                <td className="py-1.5 pr-3">off</td>
                <td className="py-1.5">Log send attempts</td>
              </tr>
            </tbody>
          </table>
        </div>
        <pre className={pre}>{`python scripts\\email_sender.py --verbose
python scripts\\email_sender.py --db data\\linknest.db --limit 50 --smtp-timeout 30 --verbose`}</pre>
      </div>

      <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 space-y-3">
        <p className="font-medium text-emerald-900 dark:text-emerald-100">In-app scheduler panel (Monitoring dashboard)</p>
        <p className="text-xs">
          Admins manage workers from the toolbar <strong>Scheduler</strong> chip, the floating status panel, or{' '}
          <strong>Scheduler Setup</strong> (clock icon). No need to open Task Scheduler for day-to-day enable/disable.
        </p>
        <ul className="list-disc list-inside ml-2 space-y-1 text-xs">
          <li><strong>Python health check</strong> — the panel probes Python 3.9+ on the Windows host (bundled <code className={code}>bin\python</code>, system PATH, or <code className={code}>py -3</code>). Recheck refreshes this.</li>
          <li><strong>Install Python</strong> — Windows: downloads embeddable CPython into <code className={code}>bin\python</code> (no admin). Or install from python.org / <code className={code}>winget install Python.Python.3.12</code>, then Recheck. Install tasks stays disabled until Python is ready.</li>
          <li><strong>Install tasks</strong> — Windows: registers both Task Scheduler jobs (default every 1 min, 20 workers). Docker: enables entrypoint workers.</li>
          <li><strong>Enable / Disable</strong> — per Monitor Runner and Email Sender</li>
          <li><strong>Uninstall / Remove</strong> — Windows: deletes jobs from Task Scheduler. Docker: disables workers in SQLite settings</li>
          <li><strong>Refresh status</strong> — re-checks Python, Task Scheduler, or Docker settings</li>
          <li>Install/uninstall errors show in a <strong>copyable dialog</strong> (textarea + Copy text)</li>
        </ul>
        <p className="font-medium text-emerald-900 dark:text-emerald-100">Windows Task Scheduler — quick install (CLI)</p>
        <p>
          From the LinkNest project root (normal user — <strong>admin not required</strong>). Preflight → register two
          repeating tasks → verify → optional smoke test:
        </p>
        <pre className={pre}>{`scripts\\schedule-monitor-workers.bat
scripts\\schedule-monitor-workers.bat verify
scripts\\schedule-monitor-workers.bat status
scripts\\schedule-monitor-workers.bat run-once
scripts\\schedule-monitor-workers.bat install 2   REM every 2 minutes`}</pre>
        <p className="font-medium text-emerald-900 dark:text-emerald-100">schedule-monitor-workers.ps1 — parameters</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-emerald-200 dark:border-emerald-800">
                <th className="py-1.5 pr-3 font-semibold">Parameter</th>
                <th className="py-1.5 pr-3 font-semibold">Default</th>
                <th className="py-1.5 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-emerald-100 dark:border-emerald-900/40">
                <td className="py-1.5 pr-3"><code className={code}>-Action</code></td>
                <td className="py-1.5 pr-3">install</td>
                <td className="py-1.5">install | verify | status | run-once | uninstall</td>
              </tr>
              <tr className="border-b border-emerald-100 dark:border-emerald-900/40">
                <td className="py-1.5 pr-3"><code className={code}>-Root</code></td>
                <td className="py-1.5 pr-3">auto</td>
                <td className="py-1.5">LinkNest project root</td>
              </tr>
              <tr className="border-b border-emerald-100 dark:border-emerald-900/40">
                <td className="py-1.5 pr-3"><code className={code}>-Python</code></td>
                <td className="py-1.5 pr-3">python</td>
                <td className="py-1.5">Python executable (full path if not on PATH)</td>
              </tr>
              <tr className="border-b border-emerald-100 dark:border-emerald-900/40">
                <td className="py-1.5 pr-3"><code className={code}>-IntervalMinutes</code></td>
                <td className="py-1.5 pr-3">1</td>
                <td className="py-1.5">Repeat interval (1–60 minutes)</td>
              </tr>
              <tr className="border-b border-emerald-100 dark:border-emerald-900/40">
                <td className="py-1.5 pr-3"><code className={code}>-MaxWorkers</code></td>
                <td className="py-1.5 pr-3">20</td>
                <td className="py-1.5">Passed to monitor_runner as <code className={code}>--max-workers</code> (1–64)</td>
              </tr>
              <tr className="border-b border-emerald-100 dark:border-emerald-900/40">
                <td className="py-1.5 pr-3"><code className={code}>-DbPath</code></td>
                <td className="py-1.5 pr-3">&lt;Root&gt;\data\linknest.db</td>
                <td className="py-1.5">SQLite file both tasks use</td>
              </tr>
              <tr className="border-b border-emerald-100 dark:border-emerald-900/40">
                <td className="py-1.5 pr-3"><code className={code}>-SkipSmoke</code></td>
                <td className="py-1.5 pr-3">off</td>
                <td className="py-1.5">Install without immediate run-once test</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-3"><code className={code}>-TaskUser</code></td>
                <td className="py-1.5 pr-3">auto</td>
                <td className="py-1.5">
                  DOMAIN\User to run tasks as. Auto-detects logged-on desktop user when install runs from Apache/SYSTEM.
                  Same value as setting <code className={code}>monitor_worker_task_user</code>.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <pre className={pre}>{`.\scripts\schedule-monitor-workers.ps1
.\scripts\schedule-monitor-workers.ps1 -IntervalMinutes 2 -MaxWorkers 32
.\scripts\schedule-monitor-workers.ps1 -TaskUser "MYPC\\YourUsername"
.\scripts\schedule-monitor-workers.ps1 -Python "C:\\Python312\\python.exe" -DbPath "D:\\linknest\\data\\linknest.db"
.\scripts\schedule-monitor-workers.ps1 -Action verify
.\scripts\schedule-monitor-workers.ps1 -Action uninstall`}</pre>
        <p className="text-xs">Creates:</p>
        <ul className="list-disc list-inside ml-2 space-y-1 text-xs">
          <li><strong>LinkNest - Monitor Runner</strong> — <code className={code}>monitor_runner.py --db … --max-workers N</code></li>
          <li><strong>LinkNest - Email Sender</strong> — <code className={code}>email_sender.py --db … --limit 25 --smtp-timeout 20</code></li>
        </ul>
        <p className="text-xs">
          Task setting: <strong>If the task is already running → Do not start a new instance</strong> (IgnoreNew). Open
          Task Scheduler → task → History if a run fails.
        </p>
      </div>

      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-2">
        <p className="font-medium text-slate-900 dark:text-white">Manual Task Scheduler (by hand)</p>
        <p className="text-xs">Use when you cannot run the installer script.</p>
        <p className="font-medium text-xs mt-2">Task 1 — Monitor Runner</p>
        <ul className="list-disc list-inside ml-2 text-xs space-y-1">
          <li>Program: <code className={code}>python</code> (or full path to python.exe)</li>
          <li>Arguments: <code className={code}>scripts\monitor_runner.py --db "C:\xampp\htdocs\linknest\data\linknest.db" --max-workers 20</code></li>
          <li>Start in: <code className={code}>C:\xampp\htdocs\linknest</code></li>
          <li>Trigger: repeat every 1–2 minutes</li>
          <li>Settings: Do not start a new instance if already running</li>
        </ul>
        <p className="font-medium text-xs mt-2">Task 2 — Email Sender</p>
        <ul className="list-disc list-inside ml-2 text-xs space-y-1">
          <li>Arguments: <code className={code}>scripts\email_sender.py --db "…\linknest.db" --limit 25 --smtp-timeout 20</code></li>
          <li>Same Start in folder; same trigger interval</li>
        </ul>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 space-y-2">
        <p className="font-medium text-blue-900 dark:text-blue-100">Monitoring dashboard — force refresh</p>
        <ul className="list-disc list-inside ml-2 space-y-1 text-xs">
          <li><strong>Per-row Check now</strong> — always PHP (one monitor, synchronous).</li>
          <li>
            <strong>Toolbar PHP / Py toggle</strong> — force-all engine (saved in browser). <strong>PHP</strong>: runs
            all checks in the current Apache request (can freeze under load). <strong>Py</strong>: queues{' '}
            <code className={code}>monitor_check_jobs</code>, kicks <code className={code}>monitor_runner.py</code>, UI
            polls progress — shared across admins (one global job).
          </li>
          <li>
            <strong>Auto force refresh</strong> (red icon in auto-refresh control): minimum <strong>60s</strong>{' '}
            interval; skips while a check is running; rests <strong>3 min</strong> (PHP) or <strong>2 min</strong> (Py)
            after each run. Use blue sync mode for frequent list-only refresh.
          </li>
        </ul>
      </div>

      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-2">
        <p className="font-medium text-slate-900 dark:text-white">SQLite settings (optional)</p>
        <pre className={pre}>{`-- Parallel probes (1-64, default 20)
INSERT INTO settings (key, value, updated_at) VALUES ('monitor_worker_max_workers', '32', unixepoch())
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

-- Custom Python path for PHP kick spawn (force-all Py)
INSERT INTO settings (key, value, updated_at) VALUES ('monitor_worker_python_path', 'C:\\Python312\\python.exe', unixepoch())
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

-- Windows Task Scheduler run-as user (when install from Apache/SYSTEM fails)
-- Use COMPUTER\\username — fixes "No mapping between account names and security IDs"
INSERT INTO settings (key, value, updated_at) VALUES ('monitor_worker_task_user', 'MYPC\\YourUsername', unixepoch())
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

-- Docker: runtime enable/disable (entrypoint reads each loop)
INSERT INTO settings (key, value, updated_at) VALUES ('docker_workers_monitor_enabled', '1', unixepoch())
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
INSERT INTO settings (key, value, updated_at) VALUES ('docker_workers_email_enabled', '1', unixepoch())
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`}</pre>
      </div>

      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-2">
        <p className="font-medium text-slate-900 dark:text-white">Docker &amp; Linux</p>
        <p className="text-xs">
          Docker entrypoint loops workers — use the in-app <strong>Scheduler</strong> panel to enable/disable without a restart
          (after upgrading LinkNest once so the entrypoint reads SQLite settings). Do not also schedule Windows tasks against the same DB.
        </p>
        <pre className={pre}>{`# Docker env (defaults)
LINKNEST_WORKERS_ENABLED=1
LINKNEST_WORKER_INTERVAL_SECONDS=60
LINKNEST_WORKER_MAX_WORKERS=20
LINKNEST_EMAIL_LIMIT=50
LINKNEST_DB_PATH=/var/www/html/data/linknest.db

# Linux cron (every minute)
* * * * * cd /var/www/linknest && /usr/bin/python3 scripts/monitor_runner.py --db /var/www/linknest/data/linknest.db
* * * * * cd /var/www/linknest && /usr/bin/python3 scripts/email_sender.py --db /var/www/linknest/data/linknest.db --limit 50`}</pre>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 space-y-1 text-xs">
        <p className="font-medium text-amber-900 dark:text-amber-100">In-app scheduler check</p>
        <p>
          The Monitoring dashboard probes Task Scheduler (Windows) or Docker worker settings and shows the{' '}
          <strong>Scheduler</strong> chip when something needs attention. Use <strong>Install</strong>,{' '}
          <strong>Enable</strong>, <strong>Disable</strong>, and <strong>Uninstall</strong> from the panel.
          <strong> Refresh status</strong> after changes outside the app.
        </p>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 space-y-1 text-xs">
        <p className="font-medium text-amber-900 dark:text-amber-100">Troubleshooting</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>
            <strong>Install fails from web UI</strong> — set <code className={code}>monitor_worker_task_user</code> to{' '}
            <code className={code}>COMPUTER\\username</code>, or run the PS1 script manually with <code className={code}>-TaskUser</code>
          </li>
          <li>
            <strong>No mapping between account names and security IDs</strong> — Apache runs as SYSTEM; installer auto-detects
            desktop user or falls back to SYSTEM ServiceAccount
          </li>
          <li>Install/uninstall log: <code className={code}>data/monitor_scheduler_install.log</code></li>
          <li>Kick log: <code className={code}>data/monitor_runner_kick.log</code></li>
          <li>Runner lock: <code className={code}>data/monitor_runner.lock</code> (only one runner at a time)</li>
          <li>Verify CLI: <code className={code}>scripts\schedule-monitor-workers.bat run-once</code></li>
          <li>Python 3.9+ required; bundled path: <code className={code}>bin\python\python.exe</code></li>
          <li>Errors in the dashboard open in a copyable dialog — use Copy text for support tickets</li>
        </ul>
      </div>
    </div>
  );
};

export default HelpPythonWorkersPanel;
