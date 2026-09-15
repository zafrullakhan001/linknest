export type SpeedTestSchedulePreset = 'off' | '15m' | '30m' | '1h' | '3h' | '6h' | '12h' | '24h';

export interface SpeedTestAlertThresholds {
  enabled: boolean;
  minDownloadMbps: number;
  minUploadMbps: number;
  maxPingMs: number;
  maxJitterMs: number;
  maxLossPct: number;
  maxBufferbloatMs: number;
}

export interface SpeedTestBrowserSchedulePrefs {
  enabled: boolean;
  intervalMinutes: number;
  preset: SpeedTestSchedulePreset;
  target: 'internet' | 'server' | 'both';
  profile: 'quick' | 'standard' | 'thorough';
  connectionMode: 'single' | 'multi';
  nextRunAt: number | null;
  lastRunAt: number | null;
}

export interface SpeedTestPreferences {
  defaultTarget: 'internet' | 'server';
  defaultProfile: 'quick' | 'standard' | 'thorough';
  connectionMode: 'single' | 'multi';
  browserNotifications: boolean;
  alerts: SpeedTestAlertThresholds;
  browserSchedule: SpeedTestBrowserSchedulePrefs;
  lastAlertFingerprint: string | null;
}

const PREFS_KEY = 'linknest_speedtest_prefs_v1';

const DEFAULT_PREFS: SpeedTestPreferences = {
  defaultTarget: 'internet',
  defaultProfile: 'standard',
  connectionMode: 'multi',
  browserNotifications: false,
  alerts: {
    enabled: false,
    minDownloadMbps: 50,
    minUploadMbps: 10,
    maxPingMs: 80,
    maxJitterMs: 30,
    maxLossPct: 3,
    maxBufferbloatMs: 150,
  },
  browserSchedule: {
    enabled: false,
    intervalMinutes: 60,
    preset: '1h',
    target: 'internet',
    profile: 'quick',
    connectionMode: 'multi',
    nextRunAt: null,
    lastRunAt: null,
  },
  lastAlertFingerprint: null,
};

export const SCHEDULE_PRESET_MINUTES: Record<Exclude<SpeedTestSchedulePreset, 'off'>, number> = {
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '3h': 180,
  '6h': 360,
  '12h': 720,
  '24h': 1440,
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function loadSpeedTestPreferences(): SpeedTestPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS, alerts: { ...DEFAULT_PREFS.alerts }, browserSchedule: { ...DEFAULT_PREFS.browserSchedule } };
    const parsed = JSON.parse(raw) as Partial<SpeedTestPreferences>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      alerts: { ...DEFAULT_PREFS.alerts, ...(parsed.alerts || {}) },
      browserSchedule: { ...DEFAULT_PREFS.browserSchedule, ...(parsed.browserSchedule || {}) },
    };
  } catch {
    return { ...DEFAULT_PREFS, alerts: { ...DEFAULT_PREFS.alerts }, browserSchedule: { ...DEFAULT_PREFS.browserSchedule } };
  }
}

export function saveSpeedTestPreferences(prefs: SpeedTestPreferences): SpeedTestPreferences {
  const next: SpeedTestPreferences = {
    ...prefs,
    alerts: {
      ...prefs.alerts,
      minDownloadMbps: clamp(prefs.alerts.minDownloadMbps, 1, 10000),
      minUploadMbps: clamp(prefs.alerts.minUploadMbps, 0.1, 5000),
      maxPingMs: clamp(prefs.alerts.maxPingMs, 5, 2000),
      maxJitterMs: clamp(prefs.alerts.maxJitterMs, 1, 500),
      maxLossPct: clamp(prefs.alerts.maxLossPct, 0, 100),
      maxBufferbloatMs: clamp(prefs.alerts.maxBufferbloatMs, 10, 2000),
    },
    browserSchedule: {
      ...prefs.browserSchedule,
      intervalMinutes: clamp(prefs.browserSchedule.intervalMinutes, 5, 10080),
    },
  };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function patchSpeedTestPreferences(patch: Partial<SpeedTestPreferences>): SpeedTestPreferences {
  const current = loadSpeedTestPreferences();
  return saveSpeedTestPreferences({
    ...current,
    ...patch,
    alerts: { ...current.alerts, ...(patch.alerts || {}) },
    browserSchedule: { ...current.browserSchedule, ...(patch.browserSchedule || {}) },
  });
}

export function presetToInterval(preset: SpeedTestSchedulePreset): number | null {
  if (preset === 'off') return null;
  return SCHEDULE_PRESET_MINUTES[preset];
}
