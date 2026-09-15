import React, { useEffect, useRef, useState } from 'react';
import {
  SpeedTestPreferences,
  SpeedTestSchedulePreset,
  loadSpeedTestPreferences,
  patchSpeedTestPreferences,
  SCHEDULE_PRESET_MINUTES,
} from '../../services/speedTestPreferences';
import { requestSpeedTestNotificationPermission } from '../../services/speedTestNotifications';
import {
  configureBrowserSpeedSchedule,
  subscribeBrowserSpeedSchedule,
} from '../../utils/speedTestBrowserSchedule';
import {
  createSpeedTestSchedule,
  deleteSpeedTestSchedule,
  getSpeedTestStatus,
  listSpeedTestSchedules,
  runWorkerSpeedTestNow,
  SpeedTestScheduleRow,
} from '../../services/speedTestScheduleService';
import { formatMbps, formatMs } from '../../services/speedTestService';

const SCHEDULE_PRESET_HINT: Record<SpeedTestSchedulePreset, string> = {
  off: 'Disable automatic browser speed tests on this device.',
  '15m': 'Run a browser speed test about every 15 minutes while this tab stays open.',
  '30m': 'Run a browser speed test about every 30 minutes while this tab stays open.',
  '1h': 'Run a browser speed test about every hour while this tab stays open.',
  '3h': 'Run a browser speed test about every 3 hours while this tab stays open.',
  '6h': 'Run a browser speed test about every 6 hours while this tab stays open.',
  '12h': 'Run a browser speed test about every 12 hours while this tab stays open.',
  '24h': 'Run a browser speed test about once per day while this tab stays open.',
};

const ALERT_HINTS: Record<string, string> = {
  minDownloadMbps: 'Alert when download Mbps falls below this value.',
  minUploadMbps: 'Alert when upload Mbps falls below this value.',
  maxPingMs: 'Alert when idle ping (ms) exceeds this value.',
  maxJitterMs: 'Alert when jitter (ms) exceeds this value.',
  maxLossPct: 'Alert when estimated packet loss (%) exceeds this value.',
  maxBufferbloatMs: 'Alert when latency rise under load (bufferbloat, ms) exceeds this value.',
};

export const SpeedTestSettingsPanel: React.FC<{
  prefs: SpeedTestPreferences;
  onPrefsChange: (prefs: SpeedTestPreferences) => void;
  isAdmin?: boolean;
}> = ({ prefs, onPrefsChange, isAdmin }) => {
  const [workerSchedules, setWorkerSchedules] = useState<SpeedTestScheduleRow[]>([]);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getSpeedTestStatus>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const baselineResultId = useRef<number | null>(null);

  const refreshServer = async () => {
    try {
      const [schedules, st] = await Promise.all([listSpeedTestSchedules(), getSpeedTestStatus()]);
      setWorkerSchedules(schedules.filter((s) => s.executor === 'worker'));
      setStatus(st);
      return st;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not load server schedules');
      return null;
    }
  };

  const stopPoll = () => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    void refreshServer();
    const unsub = subscribeBrowserSpeedSchedule(() => {
      onPrefsChange(loadSpeedTestPreferences());
    });
    return () => {
      stopPoll();
      unsub();
    };
  }, [onPrefsChange]);

  const setAlerts = (patch: Partial<SpeedTestPreferences['alerts']>) => {
    onPrefsChange(patchSpeedTestPreferences({ alerts: { ...prefs.alerts, ...patch } }));
  };

  const setBrowserSchedulePreset = (preset: SpeedTestSchedulePreset) => {
    configureBrowserSpeedSchedule({ preset });
    onPrefsChange(loadSpeedTestPreferences());
    setMsg(
      preset === 'off'
        ? 'Browser schedule disabled'
        : `Browser schedule every ${SCHEDULE_PRESET_MINUTES[preset]} min (requires open tab)`
    );
  };

  const enableNotifications = async () => {
    const perm = await requestSpeedTestNotificationPermission();
    if (perm === 'granted') {
      onPrefsChange(patchSpeedTestPreferences({ browserNotifications: true, alerts: { ...prefs.alerts, enabled: true } }));
      setMsg('Browser notifications enabled');
    } else {
      setMsg(perm === 'unsupported' ? 'Notifications unsupported in this browser' : 'Notification permission denied');
    }
  };

  const addWorkerSchedule = async () => {
    if (!isAdmin) return;
    setBusy(true);
    try {
      await createSpeedTestSchedule({
        name: 'Worker internet (hourly)',
        target: 'internet',
        profile: 'quick',
        executor: 'worker',
        interval_minutes: 60,
        is_enabled: true,
      });
      await refreshServer();
      setMsg('Worker schedule created (admin)');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed to create worker schedule');
    } finally {
      setBusy(false);
    }
  };

  const runWorkerNow = async () => {
    if (!isAdmin) return;
    setBusy(true);
    stopPoll();
    try {
      const before = await refreshServer();
      baselineResultId.current = before?.last_worker_result?.id ?? null;
      const scheduleId = workerSchedules.find((s) => s.is_enabled)?.id;
      const res = await runWorkerSpeedTestNow(scheduleId);
      setMsg(res.message || (res.kicked ? 'Worker queued and started…' : 'Worker queued.'));
      await refreshServer();

      let ticks = 0;
      pollRef.current = window.setInterval(() => {
        void (async () => {
          ticks += 1;
          const st = await refreshServer();
          const latestId = st?.last_worker_result?.id ?? null;
          const done =
            (latestId != null && latestId !== baselineResultId.current) ||
            (st && !st.worker_running && (st.pending_queue ?? 0) === 0 && ticks > 2);
          if (done || ticks >= 45) {
            stopPoll();
            setBusy(false);
            if (latestId != null && latestId !== baselineResultId.current) {
              const row = st?.last_worker_result;
              let summary = 'Worker finished.';
              if (row?.result_json) {
                try {
                  const parsed = JSON.parse(row.result_json) as {
                    downloadMbps?: number;
                    uploadMbps?: number;
                    pingMs?: number;
                  };
                  summary = `Worker result: ↓ ${formatMbps(parsed.downloadMbps ?? null)} · ↑ ${formatMbps(parsed.uploadMbps ?? null)} · ping ${formatMs(parsed.pingMs ?? null)}`;
                } catch {
                  /* ignore */
                }
              }
              setMsg(summary);
            } else if (ticks >= 45) {
              setMsg(
                'No worker result yet. Ensure the monitor Python worker can run (Admin → Monitoring workers / Help), then try again.'
              );
            }
          }
        })();
      }, 2000);
    } catch (e) {
      setBusy(false);
      setMsg(e instanceof Error ? e.message : 'Failed to queue worker speed test');
    }
  };

  const last = status?.last_worker_result;
  let lastSummary: string | null = null;
  if (last?.result_json) {
    try {
      const parsed = JSON.parse(last.result_json) as {
        downloadMbps?: number;
        uploadMbps?: number;
        pingMs?: number;
      };
      lastSummary = `Last worker: ↓ ${formatMbps(parsed.downloadMbps ?? null)} · ↑ ${formatMbps(parsed.uploadMbps ?? null)} · ping ${formatMs(parsed.pingMs ?? null)} · ${last.run_at}`;
    } catch {
      lastSummary = `Last worker run at ${last.run_at}`;
    }
  }

  return (
    <div className="rounded-3xl border border-slate-200 dark:border-[#333] bg-white/70 dark:bg-[#1a1a1a]/70 p-4 space-y-4">
      <div>
        <div className="text-sm font-bold text-slate-900 dark:text-white">Settings & schedules</div>
        <p className="text-[11px] text-slate-500">
          Browser schedules measure this device. Worker schedules measure the LinkNest host and need the monitor Python worker.
        </p>
      </div>

      {msg && <div className="text-xs rounded-xl bg-slate-100 dark:bg-[#252525] px-3 py-2 text-slate-600 dark:text-slate-300">{msg}</div>}

      <div className="space-y-2">
        <div
          className="text-[11px] font-bold uppercase tracking-wide text-slate-500"
          title="Automatic tests run in this browser while the speed-tester tab/page stays open."
        >
          This-device schedule
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['off', '15m', '30m', '1h', '3h', '6h', '12h', '24h'] as SpeedTestSchedulePreset[]).map((p) => (
            <button
              key={p}
              type="button"
              title={SCHEDULE_PRESET_HINT[p]}
              onClick={() => setBrowserSchedulePreset(p)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                prefs.browserSchedule.preset === p || (!prefs.browserSchedule.enabled && p === 'off')
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-100 dark:bg-[#252525] text-slate-600 dark:text-slate-300'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        {prefs.browserSchedule.enabled && prefs.browserSchedule.nextRunAt && (
          <div className="text-[11px] text-slate-500">
            Next run ~ {new Date(prefs.browserSchedule.nextRunAt).toLocaleString()} (tab must stay open)
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div
          className="text-[11px] font-bold uppercase tracking-wide text-slate-500"
          title="Notify when a completed test crosses the thresholds below."
        >
          Alerts
        </div>
        <label
          className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300"
          title="Turn threshold checking on or off for finished tests."
        >
          <input
            type="checkbox"
            checked={prefs.alerts.enabled}
            onChange={(e) => setAlerts({ enabled: e.target.checked })}
          />
          Enable threshold alerts
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          {(
            [
              ['minDownloadMbps', 'Min down Mbps'],
              ['minUploadMbps', 'Min up Mbps'],
              ['maxPingMs', 'Max ping ms'],
              ['maxJitterMs', 'Max jitter ms'],
              ['maxLossPct', 'Max loss %'],
              ['maxBufferbloatMs', 'Max bloat ms'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex flex-col gap-0.5" title={ALERT_HINTS[key]}>
              <span className="text-[10px] font-bold uppercase text-slate-500">{label}</span>
              <input
                type="number"
                className="rounded-lg border border-slate-200 dark:border-[#333] bg-white dark:bg-[#111] px-2 py-1"
                value={prefs.alerts[key]}
                onChange={(e) => setAlerts({ [key]: Number(e.target.value) })}
                title={ALERT_HINTS[key]}
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void enableNotifications()}
          title="Ask the browser for permission to show desktop notifications when alerts fire."
          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#252525] text-slate-700 dark:text-slate-200"
        >
          Enable browser notifications
        </button>
      </div>

      <div className="space-y-2">
        <div
          className="text-[11px] font-bold uppercase tracking-wide text-slate-500"
          title="Server-side schedules run on the LinkNest host via the Python monitor worker (not this browser)."
        >
          Server worker schedules (admin)
        </div>
        {status && (
          <div
            className="text-[11px] text-slate-500"
            title="Interactive tests share a per-hour budget; workers share a daily bandwidth cap."
          >
            Interactive remaining this hour: {status.interactive_remaining}. Worker today:{' '}
            {Math.round(status.worker_bytes_today / 1_048_576)} / {Math.round(status.worker_daily_cap_bytes / 1_048_576)} MB.
            {(status.pending_queue ?? 0) > 0 ? ` Queue: ${status.pending_queue}.` : ''}
            {status.worker_running ? ' Worker running…' : ''}
          </div>
        )}
        {lastSummary && <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold">{lastSummary}</div>}
        {isAdmin ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void addWorkerSchedule()}
              title="Create an admin-managed hourly worker job that measures from the LinkNest server."
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white disabled:opacity-50"
            >
              Add hourly worker schedule
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runWorkerNow()}
              title="Queue one worker speed test and start the Python runner immediately when possible."
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 disabled:opacity-50"
            >
              {busy ? 'Running…' : 'Run worker now'}
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">Sign in as admin to manage worker schedules.</p>
        )}
        <ul className="space-y-1">
          {workerSchedules.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 text-xs rounded-xl border border-slate-200 dark:border-[#333] px-3 py-2">
              <span title="Worker schedule: runs on the server, not in your browser.">
                #{s.id} {s.name} · {s.target}/{s.profile} every {s.interval_minutes}m · {s.is_enabled ? 'on' : 'off'}
                {s.last_status ? ` · last ${s.last_status}` : ''}
                {s.last_error ? ` · ${s.last_error}` : ''}
              </span>
              {isAdmin && (
                <button
                  type="button"
                  className="text-red-500 font-bold"
                  title="Remove this worker schedule permanently."
                  onClick={() =>
                    void deleteSpeedTestSchedule(s.id)
                      .then(refreshServer)
                      .catch((e) => setMsg(e instanceof Error ? e.message : 'Delete failed'))
                  }
                >
                  Delete
                </button>
              )}
            </li>
          ))}
          {!workerSchedules.length && (
            <li className="text-[11px] text-slate-500">
              No worker schedules yet — Run worker now still runs an ad-hoc internet/quick test when Python is available.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};
