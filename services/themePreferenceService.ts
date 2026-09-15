export type ThemeMode = 'light' | 'dark' | 'automatic';

export interface ThemeSchedule {
  dayStartMinutes: number;
  nightStartMinutes: number;
}

export const THEME_PREFERENCE_EVENT = 'linknest-theme-preference-change';

export const DEFAULT_DAY_START_MINUTES = 7 * 60;
export const DEFAULT_NIGHT_START_MINUTES = 18 * 60;

const KEY_MODE = 'linknest_theme_mode';
const KEY_AUTO_SWITCH = 'linknest_auto_switch';
const KEY_THEME = 'linknest_theme';
const KEY_DAY_START = 'linknest_day_start';
const KEY_NIGHT_START = 'linknest_night_start';

const STORAGE_KEYS = new Set([KEY_MODE, KEY_AUTO_SWITCH, KEY_THEME, KEY_DAY_START, KEY_NIGHT_START]);

function hasWindow(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function clampMinutes(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  if (rounded < 0 || rounded >= 24 * 60) return fallback;
  return rounded;
}

export function minutesToInputValue(minutes: number): string {
  const safe = clampMinutes(minutes, 0);
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function inputValueToMinutes(value: string, fallback: number): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec((value || '').trim());
  if (!match) return fallback;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(mins) || hours < 0 || hours > 23 || mins < 0 || mins > 59) {
    return fallback;
  }
  return hours * 60 + mins;
}

export function formatMinutesAsTime(minutes: number): string {
  const safe = clampMinutes(minutes, 0);
  const date = new Date();
  date.setHours(Math.floor(safe / 60), safe % 60, 0, 0);
  try {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return minutesToInputValue(safe);
  }
}

export function formatTimeWindow(startMinutes: number, endMinutes: number): string {
  const lastMinute = (endMinutes - 1 + 24 * 60) % (24 * 60);
  return `${formatMinutesAsTime(startMinutes)} – ${formatMinutesAsTime(lastMinute)}`;
}

export function getThemeSchedule(): ThemeSchedule {
  if (!hasWindow()) {
    return {
      dayStartMinutes: DEFAULT_DAY_START_MINUTES,
      nightStartMinutes: DEFAULT_NIGHT_START_MINUTES,
    };
  }

  const dayStartMinutes = inputValueToMinutes(
    localStorage.getItem(KEY_DAY_START) || '',
    DEFAULT_DAY_START_MINUTES
  );
  const nightStartMinutes = inputValueToMinutes(
    localStorage.getItem(KEY_NIGHT_START) || '',
    DEFAULT_NIGHT_START_MINUTES
  );

  if (dayStartMinutes === nightStartMinutes) {
    return {
      dayStartMinutes: DEFAULT_DAY_START_MINUTES,
      nightStartMinutes: DEFAULT_NIGHT_START_MINUTES,
    };
  }

  return { dayStartMinutes, nightStartMinutes };
}

export function setThemeSchedule(schedule: ThemeSchedule): boolean {
  if (!hasWindow()) return false;
  const dayStartMinutes = clampMinutes(schedule.dayStartMinutes, DEFAULT_DAY_START_MINUTES);
  const nightStartMinutes = clampMinutes(schedule.nightStartMinutes, DEFAULT_NIGHT_START_MINUTES);
  if (dayStartMinutes === nightStartMinutes) return false;

  localStorage.setItem(KEY_DAY_START, minutesToInputValue(dayStartMinutes));
  localStorage.setItem(KEY_NIGHT_START, minutesToInputValue(nightStartMinutes));
  dispatchThemePreferenceChange();
  return true;
}

export function resetThemeSchedule(): void {
  if (!hasWindow()) return;
  localStorage.setItem(KEY_DAY_START, minutesToInputValue(DEFAULT_DAY_START_MINUTES));
  localStorage.setItem(KEY_NIGHT_START, minutesToInputValue(DEFAULT_NIGHT_START_MINUTES));
  dispatchThemePreferenceChange();
}

export function getThemeMode(): ThemeMode {
  if (!hasWindow()) return 'automatic';

  const stored = localStorage.getItem(KEY_MODE);
  if (stored === 'light' || stored === 'dark' || stored === 'automatic') {
    return stored;
  }

  const autoSwitch = localStorage.getItem(KEY_AUTO_SWITCH);
  if (autoSwitch === 'false') {
    return localStorage.getItem(KEY_THEME) === 'light' ? 'light' : 'dark';
  }

  return 'automatic';
}

export function setThemeMode(mode: ThemeMode): void {
  if (!hasWindow()) return;
  localStorage.setItem(KEY_MODE, mode);
  localStorage.setItem(KEY_AUTO_SWITCH, mode === 'automatic' ? 'true' : 'false');
  if (mode !== 'automatic') {
    localStorage.setItem(KEY_THEME, mode);
  }
  dispatchThemePreferenceChange();
}

export function shouldBeDarkNow(now: Date = new Date(), schedule: ThemeSchedule = getThemeSchedule()): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const { dayStartMinutes, nightStartMinutes } = schedule;

  if (dayStartMinutes === nightStartMinutes) {
    return minutes >= DEFAULT_NIGHT_START_MINUTES || minutes < DEFAULT_DAY_START_MINUTES;
  }

  if (dayStartMinutes < nightStartMinutes) {
    return minutes < dayStartMinutes || minutes >= nightStartMinutes;
  }

  return minutes >= nightStartMinutes && minutes < dayStartMinutes;
}

export function resolveDarkMode(now: Date = new Date()): boolean {
  const mode = getThemeMode();
  if (mode === 'light') return false;
  if (mode === 'dark') return true;
  return shouldBeDarkNow(now);
}

export function getScheduleLabels(schedule: ThemeSchedule = getThemeSchedule()): {
  dayWindow: string;
  nightWindow: string;
} {
  return {
    dayWindow: formatTimeWindow(schedule.dayStartMinutes, schedule.nightStartMinutes),
    nightWindow: formatTimeWindow(schedule.nightStartMinutes, schedule.dayStartMinutes),
  };
}

export function getMsUntilNextThemeChange(now: Date = new Date(), schedule: ThemeSchedule = getThemeSchedule()): number {
  const { dayStartMinutes, nightStartMinutes } = schedule;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const elapsedMs = now.getSeconds() * 1000 + now.getMilliseconds();
  const targets = [dayStartMinutes, nightStartMinutes];

  let soonest = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    let deltaMinutes = target - currentMinutes;
    if (deltaMinutes < 0 || (deltaMinutes === 0 && elapsedMs > 0)) {
      deltaMinutes += 24 * 60;
    } else if (deltaMinutes === 0) {
      deltaMinutes = 24 * 60;
    }
    const ms = deltaMinutes * 60 * 1000 - elapsedMs;
    if (ms < soonest) soonest = ms;
  }

  return Math.max(1000, Number.isFinite(soonest) ? soonest : 60 * 1000);
}

export function persistAppliedTheme(isDark: boolean): void {
  if (!hasWindow()) return;
  localStorage.setItem(KEY_THEME, isDark ? 'dark' : 'light');
}

function dispatchThemePreferenceChange(): void {
  if (!hasWindow()) return;
  window.dispatchEvent(new CustomEvent(THEME_PREFERENCE_EVENT));
}

export function subscribeThemePreference(callback: () => void): () => void {
  if (!hasWindow()) return () => {};

  const onPreference = () => callback();
  const onStorage = (event: StorageEvent) => {
    if (event.key && STORAGE_KEYS.has(event.key)) {
      callback();
    }
  };

  window.addEventListener(THEME_PREFERENCE_EVENT, onPreference);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(THEME_PREFERENCE_EVENT, onPreference);
    window.removeEventListener('storage', onStorage);
  };
}
