import {
  SpeedTestBrowserSchedulePrefs,
  loadSpeedTestPreferences,
  patchSpeedTestPreferences,
  presetToInterval,
} from '../services/speedTestPreferences';
import {
  SpeedTestResult,
  runDualSpeedTest,
  runSpeedTest,
  saveSpeedTestResult,
} from '../services/speedTestService';
import { notifySpeedTestAlerts, notifySpeedTestComplete } from '../services/speedTestNotifications';
import { postSpeedTestResult } from '../services/speedTestScheduleService';

type ScheduleListener = (prefs: SpeedTestBrowserSchedulePrefs) => void;

let timerId: number | null = null;
let running = false;
const listeners = new Set<ScheduleListener>();

function emit(): void {
  const prefs = loadSpeedTestPreferences().browserSchedule;
  listeners.forEach((fn) => {
    try {
      fn(prefs);
    } catch {
      /* ignore */
    }
  });
}

export function subscribeBrowserSpeedSchedule(listener: ScheduleListener): () => void {
  listeners.add(listener);
  listener(loadSpeedTestPreferences().browserSchedule);
  return () => listeners.delete(listener);
}

export function configureBrowserSpeedSchedule(
  patch: Partial<SpeedTestBrowserSchedulePrefs>
): SpeedTestBrowserSchedulePrefs {
  const current = loadSpeedTestPreferences();
  let next = { ...current.browserSchedule, ...patch };
  if (patch.preset) {
    const minutes = presetToInterval(patch.preset);
    if (minutes == null) {
      next = { ...next, enabled: false, preset: 'off', nextRunAt: null };
    } else {
      next = {
        ...next,
        enabled: true,
        preset: patch.preset,
        intervalMinutes: minutes,
        nextRunAt: Date.now() + minutes * 60_000,
      };
    }
  } else if (patch.enabled && !next.nextRunAt) {
    next.nextRunAt = Date.now() + next.intervalMinutes * 60_000;
  }
  patchSpeedTestPreferences({ browserSchedule: next });
  ensureBrowserSpeedScheduleLoop();
  emit();
  return next;
}

async function executeScheduledRun(schedule: SpeedTestBrowserSchedulePrefs): Promise<SpeedTestResult[]> {
  const ac = new AbortController();
  const results: SpeedTestResult[] = [];
  if (schedule.target === 'both') {
    const dual = await runDualSpeedTest({
      profile: schedule.profile,
      connectionMode: schedule.connectionMode,
      signal: ac.signal,
      onProgress: () => undefined,
    });
    results.push(dual.internet, dual.server);
  } else {
    results.push(
      await runSpeedTest({
        target: schedule.target,
        profile: schedule.profile,
        connectionMode: schedule.connectionMode,
        signal: ac.signal,
        onProgress: () => undefined,
      })
    );
  }
  for (const result of results) {
    saveSpeedTestResult(result);
    notifySpeedTestComplete(result);
    notifySpeedTestAlerts(result);
    try {
      await postSpeedTestResult(result, 'scheduled');
    } catch {
      /* optional mirror */
    }
  }
  return results;
}

async function tick(): Promise<void> {
  if (running) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  const prefs = loadSpeedTestPreferences();
  const schedule = prefs.browserSchedule;
  if (!schedule.enabled || !schedule.nextRunAt) return;
  if (Date.now() < schedule.nextRunAt) return;

  running = true;
  try {
    await executeScheduledRun(schedule);
    const nextRunAt = Date.now() + schedule.intervalMinutes * 60_000;
    patchSpeedTestPreferences({
      browserSchedule: {
        ...schedule,
        lastRunAt: Date.now(),
        nextRunAt,
      },
    });
    emit();
  } catch {
    const nextRunAt = Date.now() + Math.max(5, schedule.intervalMinutes) * 60_000;
    patchSpeedTestPreferences({
      browserSchedule: {
        ...schedule,
        nextRunAt,
      },
    });
    emit();
  } finally {
    running = false;
  }
}

export function ensureBrowserSpeedScheduleLoop(): void {
  if (typeof window === 'undefined') return;
  if (timerId != null) return;
  timerId = window.setInterval(() => {
    void tick();
  }, 20_000);
  void tick();
}

export function stopBrowserSpeedScheduleLoop(): void {
  if (timerId != null) {
    window.clearInterval(timerId);
    timerId = null;
  }
}
