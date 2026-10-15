/**
 * Lightweight haptic feedback.
 *
 * Uses the Vibration API where available (Android Chrome/Firefox; iOS Safari
 * ignores it silently). Every call is a no-op when unsupported, so callers do
 * not need capability checks. `navigator.vibrate` can throw in cross-origin
 * iframes, hence the try/catch.
 */

const SETTINGS_KEY = 'linknest_haptics_enabled';

/** Patterns are short — this is confirmation, not notification. */
export const HAPTIC_PATTERNS = {
  /** Tile tap / tab switch. */
  tap: 10,
  /** Favorite toggled, drawer opened. */
  toggle: [12, 40, 12],
  /** Destructive confirm (delete, purge). */
  warn: [24, 60, 24],
  /** Long-press armed. */
  hold: 18,
} as const;

export type HapticPattern = keyof typeof HAPTIC_PATTERNS;

let enabledCache: boolean | null = null;

function isSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** Opt-out is stored locally so it never costs a round trip. */
export function isHapticsEnabled(): boolean {
  if (enabledCache !== null) return enabledCache;
  if (typeof localStorage === 'undefined') return true;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    // Default ON — absence of the key means the user has not opted out.
    enabledCache = raw === null ? true : raw === '1';
  } catch {
    enabledCache = true;
  }
  return enabledCache;
}

export function setHapticsEnabled(enabled: boolean): void {
  enabledCache = enabled;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_KEY, enabled ? '1' : '0');
  } catch {
    /* storage disabled - keep the in-memory value */
  }
}

export function vibrate(pattern: HapticPattern = 'tap'): void {
  if (!isHapticsEnabled() || !isSupported()) return;
  try {
    navigator.vibrate(HAPTIC_PATTERNS[pattern] as number | number[]);
  } catch {
    /* not permitted in this context */
  }
}

export const haptics = {
  tap: () => vibrate('tap'),
  toggle: () => vibrate('toggle'),
  warn: () => vibrate('warn'),
  hold: () => vibrate('hold'),
  isEnabled: isHapticsEnabled,
  setEnabled: setHapticsEnabled,
  isSupported,
};

export default haptics;
