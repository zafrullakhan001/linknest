import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { customTimezoneService } from '../services/customTimezoneService';
import { alarmService } from '../services/alarmService';
import { userPreferencesService } from '../services/userPreferencesService';

// USA Timezones (for quick access)
const USA_TIMEZONES = [
  { name: 'Eastern Time', tz: 'America/New_York', abbrev: 'ET' },
  { name: 'Central Time', tz: 'America/Chicago', abbrev: 'CT' },
  { name: 'Mountain Time', tz: 'America/Denver', abbrev: 'MT' },
  { name: 'Pacific Time', tz: 'America/Los_Angeles', abbrev: 'PT' },
  { name: 'Alaska Time', tz: 'America/Anchorage', abbrev: 'AKT' },
  { name: 'Hawaii Time', tz: 'Pacific/Honolulu', abbrev: 'HST' },
];

// Common World Timezones
const WORLD_TIMEZONES = [
  { name: 'London (GMT)', tz: 'Europe/London', abbrev: 'GMT' },
  { name: 'Paris (CET)', tz: 'Europe/Paris', abbrev: 'CET' },
  { name: 'Dubai (GST)', tz: 'Asia/Dubai', abbrev: 'GST' },
  { name: 'India (IST)', tz: 'Asia/Kolkata', abbrev: 'IST' },
  { name: 'Singapore (SGT)', tz: 'Asia/Singapore', abbrev: 'SGT' },
  { name: 'Tokyo (JST)', tz: 'Asia/Tokyo', abbrev: 'JST' },
  { name: 'Sydney (AEDT)', tz: 'Australia/Sydney', abbrev: 'AEDT' },
  { name: 'Auckland (NZDT)', tz: 'Pacific/Auckland', abbrev: 'NZDT' },
];

type ToolMode = 'clock' | 'stopwatch' | 'timer' | 'alarm';

type AlarmItem = {
  id: string;
  time: string; // HH:MM (local time)
  label: string;
  enabled: boolean;
  lastTriggeredKey?: string; // e.g. "Mon Jan 12 2026 04:45 PM" (minute-level)
  source?: 'db' | 'local';
};

type CustomTimezone = {
  id: string; // stringified id (db id or local id)
  name: string;
  utcOffsetMinutes: number; // e.g. -300 for UTC-05:00
  source?: 'db' | 'local';
};

type MainClockConfig = {
  type: 'system' | 'custom' | 'predefined'; // 'system' = use browser's timezone, 'custom' = use a custom timezone, 'predefined' = use a USA/World timezone
  customTimezoneId?: string; // if type is 'custom', this is the id of the custom timezone
  predefinedTimezone?: string; // if type is 'predefined', this is the IANA timezone string (e.g., 'America/New_York')
  predefinedName?: string; // display name for the predefined timezone
};

type MultiClockConfig = {
  id: string;
  type: 'system' | 'custom' | 'predefined';
  customTimezoneId?: string;
  predefinedTimezone?: string;
  predefinedName?: string;
};

const TOOLS_STORAGE_KEY = 'linknest.timeWidget.tools.v1';
const MAIN_CLOCK_STORAGE_KEY = 'linknest.mainClock.config.v1';
const MULTI_CLOCKS_STORAGE_KEY = 'linknest.multiClocks.config.v1';
const MAX_CLOCKS = 5;

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDurationWithMs(ms: number) {
  const totalMs = Math.max(0, ms);
  const totalSeconds = Math.floor(totalMs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const centiseconds = Math.floor((totalMs % 1000) / 10); // Show centiseconds (hundredths)
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function offsetMinutesToUtcString(offsetMinutes: number) {
  if (!Number.isFinite(offsetMinutes)) return 'UTC+00:00';
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hh = Math.floor(abs / 60).toString().padStart(2, '0');
  const mm = (abs % 60).toString().padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

function parseUtcOffsetToMinutes(input: string): number | null {
  const raw = (input || '').trim().toUpperCase();
  if (!raw) return null;

  if (raw === 'UTC' || raw === 'GMT' || raw === 'Z' || raw === 'UTCZ' || raw === 'GMTZ') return 0;

  // Remove leading UTC/GMT prefix if present
  const cleaned = raw.replace(/^(UTC|GMT)\s*/i, '');

  // Accept: +H, +HH, +HHMM, +HH:MM, -...
  const m = cleaned.match(/^([+-])\s*(\d{1,2})(?::?(\d{2}))?$/);
  if (!m) return null;

  const sign = m[1] === '-' ? -1 : 1;
  const hours = Number.parseInt(m[2], 10);
  const minutes = m[3] ? Number.parseInt(m[3], 10) : 0;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 14) return null;
  if (minutes < 0 || minutes > 59) return null;
  // Common UTC offset minimum is -12:00
  if (sign === -1 && hours > 12) return null;

  return sign * (hours * 60 + minutes);
}

function dateWithUtcOffset(date: Date, utcOffsetMinutes: number) {
  // Interpret utcOffsetMinutes as "time at UTC + offset"
  return new Date(date.getTime() + utcOffsetMinutes * 60 * 1000);
}

function formatTimeForUtcOffset(date: Date, utcOffsetMinutes: number) {
  const d = dateWithUtcOffset(date, utcOffsetMinutes);
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });
}

function playBeep(pattern: { count: number; durationMs: number; gapMs: number } = { count: 2, durationMs: 140, gapMs: 120 }) {
  try {
    const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const beepOnce = (t: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);

      // quick attack/decay to avoid clicks
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + pattern.durationMs / 1000);

      osc.start(t);
      osc.stop(t + pattern.durationMs / 1000 + 0.02);
    };

    for (let i = 0; i < pattern.count; i++) {
      const t = now + i * (pattern.durationMs + pattern.gapMs) / 1000;
      beepOnce(t);
    }

    const total = (pattern.count * pattern.durationMs + (pattern.count - 1) * pattern.gapMs) / 1000 + 0.25;
    setTimeout(() => ctx.close().catch(() => undefined), total * 1000);
  } catch {
    // ignore (autoplay restrictions, etc.)
  }
}

function startBeepLoop(
  pattern: { count: number; durationMs: number; gapMs: number },
  loopGapMs: number,
): () => void {
  let stopped = false;
  let timeoutId: number | null = null;

  const loop = () => {
    if (stopped) return;
    playBeep(pattern);
    timeoutId = window.setTimeout(loop, loopGapMs);
  };

  loop();

  return () => {
    stopped = true;
    if (timeoutId != null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
}

// Reusable Analog Clock Face Component
const ClockFace: React.FC<{
  date: Date;
  timeZone?: string;
  utcOffsetMinutes?: number;
  size?: number;
  showNumbers?: boolean;
}> = ({ date, timeZone, utcOffsetMinutes, size = 144, showNumbers = true }) => {
  // Get time for the specific timezone
  const getTime = () => {
    try {
      if (typeof utcOffsetMinutes === 'number' && Number.isFinite(utcOffsetMinutes)) {
        const d = dateWithUtcOffset(date, utcOffsetMinutes);
        return { hour: d.getUTCHours() % 12, minute: d.getUTCMinutes(), second: d.getUTCSeconds() };
      }

      const options: Intl.DateTimeFormatOptions = {
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false,
        timeZone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
      const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0') % 12;
      const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
      const second = parseInt(parts.find(p => p.type === 'second')?.value || '0');
      return { hour, minute, second };
    } catch (e) {
      // Fallback if timezone is invalid
      return { hour: date.getHours() % 12, minute: date.getMinutes(), second: date.getSeconds() };
    }
  };

  const { hour, minute, second } = getTime();
  const hourAngle = (hour * 30) + (minute * 0.5);
  const minuteAngle = minute * 6;
  const secondAngle = second * 6;

  return (
    <div
      className="relative rounded-full border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-inner flex-shrink-0"
      style={{ width: size, height: size }}
    >
      {/* Clock center */}
      <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-slate-700 dark:bg-slate-300 rounded-full transform -translate-x-1/2 -translate-y-1/2 z-10" />

      {/* Hour marks */}
      {showNumbers && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => {
        const angle = (num * 30 - 90) * (Math.PI / 180);
        const radius = (size / 2) - (size * 0.15);
        const x = (size / 2) + radius * Math.cos(angle);
        const y = (size / 2) + radius * Math.sin(angle);
        return (
          <div
            key={num}
            className="absolute font-bold text-slate-700 dark:text-slate-300"
            style={{
              left: `${x}px`,
              top: `${y}px`,
              transform: 'translate(-50%, -50%)',
              fontSize: `${Math.max(size * 0.07, 6)}px`
            }}
          >
            {num}
          </div>
        );
      })}

      {/* Hour hand */}
      <div
        className="absolute top-1/2 left-1/2 bg-slate-700 dark:bg-slate-300 origin-bottom z-5"
        style={{
          width: `${Math.max(size * 0.025, 1)}px`,
          height: '25%',
          transform: `translate(-50%, -100%) rotate(${hourAngle}deg)`,
          transformOrigin: '50% 100%',
          borderRadius: '2px'
        }}
      />

      {/* Minute hand */}
      <div
        className="absolute top-1/2 left-1/2 bg-slate-600 dark:bg-slate-400 origin-bottom z-6"
        style={{
          width: `${Math.max(size * 0.02, 1)}px`,
          height: '35%',
          transform: `translate(-50%, -100%) rotate(${minuteAngle}deg)`,
          transformOrigin: '50% 100%',
          borderRadius: '1.5px'
        }}
      />

      {/* Second hand */}
      <div
        className="absolute top-1/2 left-1/2 bg-red-500 origin-bottom z-7"
        style={{
          width: `${Math.max(size * 0.01, 0.5)}px`,
          height: '40%',
          transform: `translate(-50%, -100%) rotate(${secondAngle}deg)`,
          transformOrigin: '50% 100%',
          borderRadius: '1px'
        }}
      />
    </div>
  );
};

interface TimezoneDisplayProps {
  onClose?: () => void;
}

export const TimezoneDisplay: React.FC<TimezoneDisplayProps> = ({ onClose }) => {
  const { isAuthenticated } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [timezone, setTimezone] = useState<string>('');
  const [timezoneOffset, setTimezoneOffset] = useState<string>('');
  const [isAnalog, setIsAnalog] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Tools
  const [mode, setMode] = useState<ToolMode>('clock');

  // Stopwatch state
  const [swRunning, setSwRunning] = useState(false);
  const [swElapsedMs, setSwElapsedMs] = useState(0);
  const [swStartAt, setSwStartAt] = useState<number | null>(null); // epoch ms

  // Timer state
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerDurationMs, setTimerDurationMs] = useState(5 * 60 * 1000);
  const [timerRemainingMs, setTimerRemainingMs] = useState(5 * 60 * 1000);
  const [timerEndAt, setTimerEndAt] = useState<number | null>(null); // epoch ms
  const [customTimerMinutes, setCustomTimerMinutes] = useState<string>(''); // custom timer input

  // Alarm state
  const [alarms, setAlarms] = useState<AlarmItem[]>([]);
  const [newAlarmTime, setNewAlarmTime] = useState('08:00');
  const [newAlarmLabel, setNewAlarmLabel] = useState('Alarm');

  // Custom timezones (UTC offsets)
  const [customTimezones, setCustomTimezones] = useState<CustomTimezone[]>([]);
  const [newCustomTzName, setNewCustomTzName] = useState('Custom');
  const [newCustomTzOffset, setNewCustomTzOffset] = useState('UTC+00:00');
  const [customTzLoadedFromDb, setCustomTzLoadedFromDb] = useState(false);

  // Main clock configuration
  const [mainClockConfig, setMainClockConfig] = useState<MainClockConfig>({ type: 'system' });
  const [expandedSection, setExpandedSection] = useState<'usa' | 'world' | 'custom' | null>(null);
  
  // Multiple clocks configuration (up to 5)
  const [multiClocks, setMultiClocks] = useState<MultiClockConfig[]>([]);
  const [showClockManager, setShowClockManager] = useState(false);

  const [nowMs, setNowMs] = useState(Date.now());

  // Ringing state (keep sounding until user dismisses)
  const [timerRinging, setTimerRinging] = useState(false);
  const [alarmRingingId, setAlarmRingingId] = useState<string | null>(null);
  const stopBeepRef = React.useRef<(() => void) | null>(null);

  useEffect(() => {
    // Update time every second
    const interval = setInterval(() => {
      setCurrentTime(new Date());
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Update timezone information based on main clock config
  useEffect(() => {
    if (mainClockConfig.type === 'custom' && mainClockConfig.customTimezoneId) {
      const customTz = customTimezones.find(tz => tz.id === mainClockConfig.customTimezoneId);
      if (customTz) {
        setTimezone(customTz.name);
        setTimezoneOffset(offsetMinutesToUtcString(customTz.utcOffsetMinutes).replace('UTC', ''));
        return;
      }
    }

    if (mainClockConfig.type === 'predefined' && mainClockConfig.predefinedTimezone) {
      setTimezone(mainClockConfig.predefinedName || mainClockConfig.predefinedTimezone);
      const tzOffset = getTimezoneOffsetValue(mainClockConfig.predefinedTimezone);
      setTimezoneOffset(tzOffset);
      return;
    }

    // Default: use system timezone
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTimezone(tz);

    // Get timezone offset
    const offset = -new Date().getTimezoneOffset();
    const offsetHours = Math.floor(Math.abs(offset) / 60);
    const offsetMinutes = Math.abs(offset) % 60;
    const offsetSign = offset >= 0 ? '+' : '-';
    setTimezoneOffset(`${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`);
  }, [mainClockConfig, customTimezones]);

  // Extra ticks for smoother stopwatch/timer updates when running
  useEffect(() => {
    if (!swRunning && !timerRunning) return;
    const interval = setInterval(() => setNowMs(Date.now()), 100);
    return () => clearInterval(interval);
  }, [swRunning, timerRunning]);

  // Load main clock configuration once
  useEffect(() => {
    if (isAuthenticated) {
      // Load from database for authenticated users
      userPreferencesService.getPreference('clock_main_config').then((value) => {
        if (value) {
          const stored = safeJsonParse<any>(value);
          if (stored && typeof stored === 'object') {
            if (stored.type === 'system' || stored.type === 'custom' || stored.type === 'predefined') {
              setMainClockConfig(stored);
            }
          }
        }
      }).catch(() => {
        // Ignore errors - will use default config
      });
      
      // Load multiple clocks
      userPreferencesService.getPreference('multi_clocks_config').then((value) => {
        if (value) {
          const stored = safeJsonParse<MultiClockConfig[]>(value);
          if (Array.isArray(stored)) {
            const valid = stored
              .filter((c) => c && typeof c === 'object' && (c.type === 'system' || c.type === 'custom' || c.type === 'predefined'))
              .slice(0, MAX_CLOCKS);
            setMultiClocks(valid);
          }
        }
      }).catch(() => {
        // Ignore errors
      });
    } else {
      // Load from localStorage for unauthenticated users
      const stored = safeJsonParse<any>(localStorage.getItem(MAIN_CLOCK_STORAGE_KEY));
      if (stored && typeof stored === 'object') {
        if (stored.type === 'system' || stored.type === 'custom' || stored.type === 'predefined') {
          setMainClockConfig(stored);
        }
      }
      
      // Load multiple clocks from localStorage
      const multiStored = safeJsonParse<MultiClockConfig[]>(localStorage.getItem(MULTI_CLOCKS_STORAGE_KEY));
      if (Array.isArray(multiStored)) {
        const valid = multiStored
          .filter((c) => c && typeof c === 'object' && (c.type === 'system' || c.type === 'custom' || c.type === 'predefined'))
          .slice(0, MAX_CLOCKS);
        setMultiClocks(valid);
      }
    }
  }, [isAuthenticated]);

  // Persist main clock configuration
  useEffect(() => {
    if (isAuthenticated) {
      // Save to database for authenticated users
      userPreferencesService.updatePreference('clock_main_config', JSON.stringify(mainClockConfig)).catch(() => {
        // Ignore errors
      });
    } else {
      // Save to localStorage for unauthenticated users
      try {
        localStorage.setItem(MAIN_CLOCK_STORAGE_KEY, JSON.stringify(mainClockConfig));
      } catch {
        // ignore
      }
    }
  }, [mainClockConfig, isAuthenticated]);

  // Persist multiple clocks configuration
  useEffect(() => {
    if (isAuthenticated) {
      userPreferencesService.updatePreference('multi_clocks_config', JSON.stringify(multiClocks)).catch(() => {
        // Ignore errors
      });
    } else {
      try {
        localStorage.setItem(MULTI_CLOCKS_STORAGE_KEY, JSON.stringify(multiClocks));
      } catch {
        // ignore
      }
    }
  }, [multiClocks, isAuthenticated]);

  // Load persisted tools state once
  useEffect(() => {
    const loadToolsState = async () => {
      let stored: any = null;
      
      if (isAuthenticated) {
        // Load from database for authenticated users
        try {
          const value = await userPreferencesService.getPreference('clock_tools_state');
          if (value) {
            stored = safeJsonParse<any>(value);
          }
        } catch {
          // Ignore errors
        }
      } else {
        // Load from localStorage for unauthenticated users
        stored = safeJsonParse<any>(localStorage.getItem(TOOLS_STORAGE_KEY));
      }

      if (!stored || typeof stored !== 'object') return;

      if (stored.mode === 'clock' || stored.mode === 'stopwatch' || stored.mode === 'timer' || stored.mode === 'alarm') {
        setMode(stored.mode);
      }

      if (stored.stopwatch && typeof stored.stopwatch === 'object') {
        const elapsed = typeof stored.stopwatch.elapsedMs === 'number' ? stored.stopwatch.elapsedMs : 0;
        const running = stored.stopwatch.running === true;
        const startAt = typeof stored.stopwatch.startAt === 'number' ? stored.stopwatch.startAt : null;
        setSwElapsedMs(Math.max(0, elapsed));
        setSwRunning(running);
        setSwStartAt(startAt);
      }

      if (stored.timer && typeof stored.timer === 'object') {
        const duration = typeof stored.timer.durationMs === 'number' ? stored.timer.durationMs : 5 * 60 * 1000;
        const remaining = typeof stored.timer.remainingMs === 'number' ? stored.timer.remainingMs : duration;
        const running = stored.timer.running === true;
        const endAt = typeof stored.timer.endAt === 'number' ? stored.timer.endAt : null;
        setTimerDurationMs(Math.max(1000, duration));
        setTimerRunning(running);
        setTimerEndAt(endAt);

        if (running && endAt) {
          const rem = Math.max(0, endAt - Date.now());
          setTimerRemainingMs(rem);
        } else {
          setTimerRemainingMs(Math.max(0, remaining));
        }
      }

      if (Array.isArray(stored.alarms)) {
        const cleaned: AlarmItem[] = stored.alarms
          .filter((a: any) => a && typeof a === 'object')
          .map((a: any) => ({
            id: typeof a.id === 'string' ? a.id : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            time: typeof a.time === 'string' ? a.time : '08:00',
            label: typeof a.label === 'string' ? a.label : 'Alarm',
            enabled: a.enabled === true,
            lastTriggeredKey: typeof a.lastTriggeredKey === 'string' ? a.lastTriggeredKey : undefined,
            source: 'local' as const,
          }));
        setAlarms(cleaned);
      }

      if (Array.isArray(stored.customTimezones)) {
        const cleaned: CustomTimezone[] = stored.customTimezones
          .filter((t: any) => t && typeof t === 'object')
          .map((t: any) => ({
            id: typeof t.id === 'string' ? t.id : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            name: typeof t.name === 'string' ? t.name : 'Custom',
            utcOffsetMinutes: typeof t.utcOffsetMinutes === 'number' ? t.utcOffsetMinutes : 0,
            source: 'local' as const,
          }))
          .filter((t) => Number.isFinite(t.utcOffsetMinutes));
        setCustomTimezones(cleaned);
      }
    };

    loadToolsState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Load alarms from DB when authenticated
  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) return;

    (async () => {
      try {
        const rows = await alarmService.list();
        if (cancelled) return;
        setAlarms(
          (rows || []).map((r) => ({
            id: String(r.id),
            time: r.time,
            label: r.label,
            enabled: !!r.enabled,
            source: 'db' as const,
          })),
        );
      } catch {
        // ignore; keep local list
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Load custom timezones from DB when authenticated
  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) {
      setCustomTzLoadedFromDb(false);
      return;
    }

    (async () => {
      try {
        const rows = await customTimezoneService.list();
        if (cancelled) return;
        setCustomTimezones(
          (rows || []).map((r) => ({
            id: String(r.id),
            name: r.name,
            utcOffsetMinutes: r.utc_offset_minutes,
            source: 'db' as const,
          })),
        );
        setCustomTzLoadedFromDb(true);
      } catch {
        // ignore; keep local list
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Persist tools state
  useEffect(() => {
    const toolsState = {
      mode,
      stopwatch: { running: swRunning, elapsedMs: swElapsedMs, startAt: swStartAt },
      timer: { running: timerRunning, durationMs: timerDurationMs, remainingMs: timerRemainingMs, endAt: timerEndAt },
      alarms,
      customTimezones,
    };

    if (isAuthenticated) {
      // Save to database for authenticated users
      userPreferencesService.updatePreference('clock_tools_state', JSON.stringify(toolsState)).catch(() => {
        // Ignore errors
      });
    } else {
      // Save to localStorage for unauthenticated users
      try {
        localStorage.setItem(TOOLS_STORAGE_KEY, JSON.stringify(toolsState));
      } catch {
        // ignore
      }
    }
  }, [mode, swRunning, swElapsedMs, swStartAt, timerRunning, timerDurationMs, timerRemainingMs, timerEndAt, alarms, customTimezones, isAuthenticated]);

  // Cleanup beep loop on unmount
  useEffect(() => {
    return () => {
      stopBeepRef.current?.();
      stopBeepRef.current = null;
    };
  }, []);

  const startRinging = (kind: 'timer' | 'alarm', alarmId?: string) => {
    // Already ringing of same kind?
    if (kind === 'timer' && timerRinging) return;
    if (kind === 'alarm' && alarmId && alarmRingingId === alarmId) return;

    stopBeepRef.current?.();
    stopBeepRef.current = null;

    if (kind === 'timer') {
      setTimerRinging(true);
      setAlarmRingingId(null);
      stopBeepRef.current = startBeepLoop({ count: 3, durationMs: 180, gapMs: 120 }, 1200);
    } else {
      setAlarmRingingId(alarmId || null);
      setTimerRinging(false);
      stopBeepRef.current = startBeepLoop({ count: 4, durationMs: 200, gapMs: 140 }, 1400);
    }
  };

  const dismissRinging = () => {
    stopBeepRef.current?.();
    stopBeepRef.current = null;
    setTimerRinging(false);
    setAlarmRingingId(null);
  };

  // Derived stopwatch elapsed
  const swDisplayMs = swRunning && swStartAt != null ? Math.max(0, nowMs - swStartAt) : swElapsedMs;

  // Derived timer remaining
  const timerDisplayMs =
    timerRunning && timerEndAt != null ? Math.max(0, timerEndAt - nowMs) : timerRemainingMs;

  // Timer completion
  useEffect(() => {
    if (!timerRunning) return;
    if (timerDisplayMs > 0) return;
    setTimerRunning(false);
    setTimerEndAt(null);
    setTimerRemainingMs(0);
    startRinging('timer');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerRunning, timerDisplayMs]);

  // Alarm triggering (minute-level, local time)
  useEffect(() => {
    const d = new Date(nowMs);
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    const minuteKey = `${d.toDateString()} ${hh}:${mm}`;
    let didUpdate = false;

    let triggeredAlarmId: string | null = null;
    const updated = alarms.map((a) => {
      if (!a.enabled) return a;
      if (a.time !== `${hh}:${mm}`) return a;
      if (a.lastTriggeredKey === minuteKey) return a;
      didUpdate = true;
      triggeredAlarmId = a.id;
      return { ...a, lastTriggeredKey: minuteKey };
    });

    if (!didUpdate) return;
    setAlarms(updated);
    if (triggeredAlarmId) startRinging('alarm', triggeredAlarmId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowMs]);

  // Format date and time
  const formatDateTime = (date: Date, timeZone?: string) => {
    const options: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: timeZone,
    };
    return date.toLocaleTimeString(undefined, options);
  };

  const formatDateOnly = (date: Date, timeZone?: string) => {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone
    });
  };

  const getTimezoneOffsetValue = (timeZone: string) => {
    const now = new Date();
    const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tz = new Date(now.toLocaleString('en-US', { timeZone }));
    const offset = (tz.getTime() - utc.getTime()) / (1000 * 60); // offset in minutes
    const offsetHours = Math.floor(Math.abs(offset) / 60);
    const offsetMinutes = Math.abs(offset) % 60;
    const offsetSign = offset >= 0 ? '+' : '-';
    return `${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`;
  };

  const toggleClock = () => {
    setIsAnalog(!isAnalog);
    setIsExpanded(false); // Close timezone list when switching clock type
  };

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent clock toggle
    setIsExpanded(!isExpanded);
  };

  const setModeSafe = (m: ToolMode) => {
    setMode(m);
    if (m !== 'clock') {
      setIsExpanded(false);
    }
  };

  const swStartStop = () => {
    if (swRunning) {
      // stop
      setSwRunning(false);
      setSwElapsedMs(swDisplayMs);
      setSwStartAt(null);
      return;
    }
    // start
    setSwRunning(true);
    setSwStartAt(Date.now() - swElapsedMs);
  };

  const swReset = () => {
    setSwRunning(false);
    setSwElapsedMs(0);
    setSwStartAt(null);
  };

  const timerSetPreset = (ms: number) => {
    setTimerRunning(false);
    setTimerEndAt(null);
    setTimerDurationMs(ms);
    setTimerRemainingMs(ms);
  };

  const setCustomTimer = () => {
    const minutes = parseInt(customTimerMinutes, 10);
    if (Number.isFinite(minutes) && minutes > 0) {
      const ms = minutes * 60 * 1000;
      timerSetPreset(ms);
      setCustomTimerMinutes('');
    }
  };

  const handleCustomTimerInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow numbers
    if (value === '' || /^\d+$/.test(value)) {
      setCustomTimerMinutes(value);
    }
  };

  const timerStartPause = () => {
    if (timerRinging) dismissRinging();
    if (timerRunning) {
      setTimerRunning(false);
      setTimerEndAt(null);
      setTimerRemainingMs(timerDisplayMs);
      return;
    }
    const nextRemaining = Math.max(0, timerDisplayMs);
    setTimerRunning(true);
    setTimerEndAt(Date.now() + nextRemaining);
  };

  const timerReset = () => {
    if (timerRinging) dismissRinging();
    setTimerRunning(false);
    setTimerEndAt(null);
    setTimerRemainingMs(timerDurationMs);
  };

  const addAlarm = () => {
    if (!/^\d{2}:\d{2}$/.test(newAlarmTime)) return;
    const time = newAlarmTime;
    const label = newAlarmLabel.trim() || 'Alarm';
    if (isAuthenticated) {
      alarmService
        .create(time, label, true)
        .then((a) => {
          setAlarms((prev) => [{ id: String(a.id), time: a.time, label: a.label, enabled: !!a.enabled, source: 'db' }, ...prev]);
        })
        .catch(() => {
          // fallback to local if API fails
          const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          setAlarms((prev) => [{ id, time, label, enabled: true, source: 'local' }, ...prev]);
        });
      return;
    }

    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setAlarms((prev) => [{ id, time, label, enabled: true, source: 'local' }, ...prev]);
  };

  const addCustomTimezone = () => {
    const offset = parseUtcOffsetToMinutes(newCustomTzOffset);
    if (offset == null) return;
    const name = (newCustomTzName || '').trim() || offsetMinutesToUtcString(offset);
    if (isAuthenticated) {
      // Save to DB for this user
      customTimezoneService
        .create(name, offset)
        .then((tz) => {
          setCustomTimezones((prev) => [{ id: String(tz.id), name: tz.name, utcOffsetMinutes: tz.utc_offset_minutes, source: 'db' }, ...prev]);
          setNewCustomTzName('Custom');
          setNewCustomTzOffset('UTC+00:00');
        })
        .catch(() => {
          // fallback to local if API fails
          const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          setCustomTimezones((prev) => [{ id, name, utcOffsetMinutes: offset, source: 'local' }, ...prev]);
          setNewCustomTzName('Custom');
          setNewCustomTzOffset('UTC+00:00');
        });
      return;
    }

    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setCustomTimezones((prev) => [{ id, name, utcOffsetMinutes: offset, source: 'local' }, ...prev]);
    setNewCustomTzName('Custom');
    setNewCustomTzOffset('UTC+00:00');
  };

  const exportCustomTimezones = () => {
    const data = JSON.stringify(customTimezones, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linknest-custom-timezones-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importCustomTimezones = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        if (!Array.isArray(imported)) {
          alert('Invalid file format. Expected an array of timezones.');
          return;
        }

        const validated: CustomTimezone[] = imported
          .filter((tz: any) => tz && typeof tz === 'object')
          .map((tz: any) => ({
            id: `imported-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            name: typeof tz.name === 'string' ? tz.name : 'Imported',
            utcOffsetMinutes: typeof tz.utcOffsetMinutes === 'number' ? tz.utcOffsetMinutes : 0,
            source: 'local' as const,
          }))
          .filter((tz) => Number.isFinite(tz.utcOffsetMinutes));

        if (validated.length === 0) {
          alert('No valid timezones found in the file.');
          return;
        }

        setCustomTimezones((prev) => [...validated, ...prev]);
        alert(`Successfully imported ${validated.length} timezone(s).`);
      } catch (err) {
        alert('Failed to parse the file. Please ensure it is a valid JSON file.');
      }
    };
    reader.readAsText(file);
    // Reset the input so the same file can be selected again
    event.target.value = '';
  };

  const setAsMainClock = (timezoneId: string) => {
    setMainClockConfig({ type: 'custom', customTimezoneId: timezoneId });
  };

  const setAsPredefinedMainClock = (timezone: string, name: string) => {
    setMainClockConfig({ type: 'predefined', predefinedTimezone: timezone, predefinedName: name });
  };

  const resetToSystemClock = () => {
    setMainClockConfig({ type: 'system' });
  };

  const getMainClockDisplay = () => {
    if (mainClockConfig.type === 'custom' && mainClockConfig.customTimezoneId) {
      const customTz = customTimezones.find(tz => tz.id === mainClockConfig.customTimezoneId);
      if (customTz) {
        return formatTimeForUtcOffset(currentTime, customTz.utcOffsetMinutes);
      }
    }
    if (mainClockConfig.type === 'predefined' && mainClockConfig.predefinedTimezone) {
      return formatDateTime(currentTime, mainClockConfig.predefinedTimezone);
    }
    return formatDateTime(currentTime);
  };

  // Multiple clocks management functions
  const addClock = (config: Omit<MultiClockConfig, 'id'>) => {
    if (multiClocks.length >= MAX_CLOCKS) return;
    const newClock: MultiClockConfig = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ...config,
    };
    setMultiClocks((prev) => [...prev, newClock]);
  };

  const removeClock = (id: string) => {
    setMultiClocks((prev) => prev.filter((c) => c.id !== id));
  };

  const moveClock = (id: string, direction: 'up' | 'down') => {
    setMultiClocks((prev) => {
      const index = prev.findIndex((c) => c.id === id);
      if (index === -1) return prev;
      
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      
      const newClocks = [...prev];
      [newClocks[index], newClocks[newIndex]] = [newClocks[newIndex], newClocks[index]];
      return newClocks;
    });
  };

  const getClockDisplay = (clock: MultiClockConfig) => {
    if (clock.type === 'custom' && clock.customTimezoneId) {
      const customTz = customTimezones.find(tz => tz.id === clock.customTimezoneId);
      if (customTz) {
        return formatTimeForUtcOffset(currentTime, customTz.utcOffsetMinutes);
      }
    }
    if (clock.type === 'predefined' && clock.predefinedTimezone) {
      return formatDateTime(currentTime, clock.predefinedTimezone);
    }
    return formatDateTime(currentTime);
  };

  const getClockTimezone = (clock: MultiClockConfig): string => {
    if (clock.type === 'custom' && clock.customTimezoneId) {
      const customTz = customTimezones.find(tz => tz.id === clock.customTimezoneId);
      if (customTz) {
        return customTz.name;
      }
    }
    if (clock.type === 'predefined' && clock.predefinedName) {
      return clock.predefinedName;
    }
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  };

  const getClockOffset = (clock: MultiClockConfig): string => {
    if (clock.type === 'custom' && clock.customTimezoneId) {
      const customTz = customTimezones.find(tz => tz.id === clock.customTimezoneId);
      if (customTz) {
        return offsetMinutesToUtcString(customTz.utcOffsetMinutes).replace('UTC', '');
      }
    }
    if (clock.type === 'predefined' && clock.predefinedTimezone) {
      return getTimezoneOffsetValue(clock.predefinedTimezone);
    }
    const offset = -new Date().getTimezoneOffset();
    const offsetHours = Math.floor(Math.abs(offset) / 60);
    const offsetMinutes = Math.abs(offset) % 60;
    const offsetSign = offset >= 0 ? '+' : '-';
    return `${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={`relative flex flex-col items-start gap-2 px-3 py-2 text-xs text-slate-600 dark:text-slate-400 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg transition-all ${isAnalog ? 'py-4 px-4' : ''}`}
      style={{ zIndex: 1 }}
      title={`Click to switch to ${isAnalog ? 'digital' : 'analog'} clock - Timezone: ${timezone} (UTC${timezoneOffset})`}
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-3 -right-3 w-6 h-6 rounded-full shadow-md border border-red-300/70 dark:border-red-600/60 bg-red-500/90 dark:bg-red-600/90 backdrop-blur flex items-center justify-center text-white z-50 hover:bg-red-600 dark:hover:bg-red-700 transition-colors"
          title="Close Clock Widget"
          aria-label="Close Clock Widget"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      )}
      {(timerRinging || alarmRingingId) && (
        <div className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/80 dark:bg-red-900/20 text-red-700 dark:text-red-200">
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider">Alert</span>
            <span className="text-[11px] font-semibold truncate">
              {timerRinging
                ? 'Timer finished'
                : `Alarm: ${(alarms.find((a) => a.id === alarmRingingId)?.label || 'Alarm')}`}
            </span>
          </div>
          <button
            type="button"
            onClick={dismissRinging}
            className="px-3 py-1 rounded-md font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Mode Switcher */}
      <div className="flex items-center gap-1 w-full">
        {(['clock', 'stopwatch', 'timer', 'alarm'] as ToolMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModeSafe(m)}
            className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
              mode === m
                ? 'bg-brand-500 text-white'
                : 'bg-slate-100/70 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
            }`}
          >
            {m === 'clock' ? 'Clock' : m === 'stopwatch' ? 'Stopwatch' : m === 'timer' ? 'Timer' : 'Alarm'}
          </button>
        ))}
      </div>

      {mode === 'clock' ? (
        isAnalog ? (
        // Analog Clock
        <div className="w-full">
          {/* Multiple Clocks Display (Analog) */}
          {multiClocks.length > 0 && (
            <div className="space-y-3 mb-3">
              {multiClocks.map((clock, index) => (
                <div
                  key={clock.id}
                  className="flex items-center gap-2 px-2 py-2 rounded-lg bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600"
                >
                  {/* Reorder Controls */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => moveClock(clock.id, 'up')}
                      disabled={index === 0}
                      className="p-0.5 rounded text-[10px] bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Move up"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveClock(clock.id, 'down')}
                      disabled={index === multiClocks.length - 1}
                      className="p-0.5 rounded text-[10px] bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Move down"
                    >
                      ▼
                    </button>
                  </div>
                  <ClockFace
                    date={currentTime}
                    timeZone={clock.type === 'predefined' ? clock.predefinedTimezone : undefined}
                    utcOffsetMinutes={clock.type === 'custom' && clock.customTimezoneId
                      ? customTimezones.find(tz => tz.id === clock.customTimezoneId)?.utcOffsetMinutes
                      : undefined}
                    size={72}
                    showNumbers={false}
                  />
                  <div className="flex flex-col leading-tight flex-1">
                    <span className="font-medium text-xs">{getClockDisplay(clock)}</span>
                    <span className="text-[10px] opacity-75">{getClockTimezone(clock)}</span>
                    <span className="text-[9px] opacity-60">UTC{getClockOffset(clock)}</span>
                  </div>
                  <button
                    onClick={() => removeClock(clock.id)}
                    className="px-2 py-1 rounded text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                    title="Remove clock"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Main Clock (Analog) */}
          <div
            className="flex items-center gap-4 cursor-pointer hover:opacity-90 transition-opacity"
            onClick={toggleClock}
            title="Click to switch to digital clock"
          >
            <ClockFace date={currentTime} size={144} />
            <div className="flex flex-col leading-tight">
              <span className="font-semibold text-sm mb-1">{formatDateOnly(currentTime)}</span>
              <span className="text-xs opacity-75">{timezone}</span>
              <span className="text-[10px] opacity-60">UTC{timezoneOffset}</span>
            </div>
          </div>
        </div>
      ) : (
        // Digital Clock
        <div className="w-full">
          {/* Multiple Clocks Display (Digital) */}
          {multiClocks.length > 0 && (
            <div className="space-y-2 mb-3 pb-3 border-b border-slate-200 dark:border-slate-700">
              {multiClocks.map((clock, index) => (
                <div
                  key={clock.id}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600"
                >
                  {/* Reorder Controls */}
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => moveClock(clock.id, 'up')}
                      disabled={index === 0}
                      className="p-0.5 rounded text-[8px] leading-none bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Move up"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveClock(clock.id, 'down')}
                      disabled={index === multiClocks.length - 1}
                      className="p-0.5 rounded text-[8px] leading-none bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Move down"
                    >
                      ▼
                    </button>
                  </div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-3 h-3 flex-shrink-0 opacity-60"
                  >
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
                  </svg>
                  <div className="flex flex-col leading-tight flex-1 min-w-0">
                    <span className="font-medium text-xs">{getClockDisplay(clock)}</span>
                    <span className="text-[9px] opacity-75 truncate">{getClockTimezone(clock)} (UTC{getClockOffset(clock)})</span>
                  </div>
                  <button
                    onClick={() => removeClock(clock.id)}
                    className="px-1.5 py-0.5 rounded text-[9px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors flex-shrink-0"
                    title="Remove clock"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Main Clock (Digital) */}
          <div className="flex items-center gap-2 rounded px-1 -mx-1">
            <div
              className="flex items-center gap-2 flex-1 cursor-pointer hover:bg-white/50 dark:hover:bg-slate-800/50 rounded px-1 -mx-1 transition-colors"
              onClick={toggleClock}
              title="Click to switch to analog clock"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-3.5 h-3.5 flex-shrink-0"
              >
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
              </svg>
              <div className="flex flex-col leading-tight flex-1">
                <span className="font-medium text-sm">{getMainClockDisplay()}</span>
                <span className="text-[10px] opacity-75">{timezone} (UTC{timezoneOffset})</span>
                {(mainClockConfig.type === 'custom' || mainClockConfig.type === 'predefined') && (
                  <span className="text-[9px] opacity-60 text-blue-600 dark:text-blue-400">
                    {mainClockConfig.type === 'custom' ? 'Custom Main Clock' : 'Main Clock'}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowClockManager(!showClockManager)}
                className="flex-shrink-0 p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                title={showClockManager ? "Hide clock manager" : "Manage clocks"}
                disabled={multiClocks.length >= MAX_CLOCKS && !showClockManager}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
                </svg>
              </button>
              <button
                onClick={toggleExpand}
                className="flex-shrink-0 p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                title={isExpanded ? "Hide timezones" : "Show timezones"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                >
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Expandable Timezones List */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[800px] opacity-100 mt-3' : 'max-h-0 opacity-0'
              }`}
          >
            <div className="border-t border-slate-200 dark:border-slate-700 pt-3 space-y-3">
              {/* System Clock Reset */}
              {(mainClockConfig.type === 'custom' || mainClockConfig.type === 'predefined') && (
                <button
                  onClick={resetToSystemClock}
                  className="w-full px-3 py-2 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-left"
                >
                  ← Reset to System Clock
                </button>
              )}

              {/* USA Timezones Section */}
              <div>
                <button
                  onClick={() => setExpandedSection(expandedSection === 'usa' ? null : 'usa')}
                  className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded transition-colors"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">USA Timezones</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`w-3.5 h-3.5 transition-transform duration-300 ${expandedSection === 'usa' ? 'rotate-180' : ''}`}
                  >
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${expandedSection === 'usa' ? 'max-h-[500px] mt-2' : 'max-h-0'}`}>
                  <div className="space-y-1">
                    {USA_TIMEZONES.map((tzInfo) => {
                      const tzOffset = getTimezoneOffsetValue(tzInfo.tz);
                      const isMainClock = mainClockConfig.type === 'predefined' && mainClockConfig.predefinedTimezone === tzInfo.tz;
                      return (
                        <div
                          key={tzInfo.tz}
                          className={`flex items-center gap-2 px-2 py-2 rounded transition-colors ${
                            isMainClock ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'
                          }`}
                        >
                          <ClockFace date={currentTime} timeZone={tzInfo.tz} size={36} showNumbers={false} />
                          <div className="flex flex-col leading-tight flex-1 overflow-hidden">
                            <div className="flex justify-between items-baseline gap-2">
                              <span className="font-bold text-[11px] truncate">{tzInfo.name}</span>
                              <span className="text-[9px] font-mono whitespace-nowrap bg-slate-200 dark:bg-slate-700 px-1 rounded">UTC{tzOffset}</span>
                            </div>
                            <div className="text-[10px] font-medium text-slate-700 dark:text-slate-300">
                              {formatDateTime(currentTime, tzInfo.tz)}
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[9px] opacity-60 uppercase font-semibold">
                                {tzInfo.abbrev}
                              </span>
                              {isMainClock && (
                                <span className="text-[8px] text-blue-600 dark:text-blue-400 font-semibold">★ Main Clock</span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            {!isMainClock && (
                              <button
                                type="button"
                                onClick={() => setAsPredefinedMainClock(tzInfo.tz, tzInfo.name)}
                                className="px-2 py-0.5 rounded-md text-[9px] font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors whitespace-nowrap"
                                title="Set as main clock"
                              >
                                Set Main
                              </button>
                            )}
                            {showClockManager && multiClocks.length < MAX_CLOCKS && (
                              <button
                                type="button"
                                onClick={() => {
                                  addClock({
                                    type: 'predefined',
                                    predefinedTimezone: tzInfo.tz,
                                    predefinedName: tzInfo.name,
                                  });
                                }}
                                className="px-2 py-0.5 rounded-md text-[9px] font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition-colors whitespace-nowrap"
                                title="Add as clock"
                              >
                                Add Clock
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* World Timezones Section */}
              <div>
                <button
                  onClick={() => setExpandedSection(expandedSection === 'world' ? null : 'world')}
                  className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded transition-colors"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">World Timezones</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`w-3.5 h-3.5 transition-transform duration-300 ${expandedSection === 'world' ? 'rotate-180' : ''}`}
                  >
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${expandedSection === 'world' ? 'max-h-[500px] mt-2' : 'max-h-0'}`}>
                  <div className="space-y-1">
                    {WORLD_TIMEZONES.map((tzInfo) => {
                      const tzOffset = getTimezoneOffsetValue(tzInfo.tz);
                      const isMainClock = mainClockConfig.type === 'predefined' && mainClockConfig.predefinedTimezone === tzInfo.tz;
                      return (
                        <div
                          key={tzInfo.tz}
                          className={`flex items-center gap-2 px-2 py-2 rounded transition-colors ${
                            isMainClock ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'
                          }`}
                        >
                          <ClockFace date={currentTime} timeZone={tzInfo.tz} size={36} showNumbers={false} />
                          <div className="flex flex-col leading-tight flex-1 overflow-hidden">
                            <div className="flex justify-between items-baseline gap-2">
                              <span className="font-bold text-[11px] truncate">{tzInfo.name}</span>
                              <span className="text-[9px] font-mono whitespace-nowrap bg-slate-200 dark:bg-slate-700 px-1 rounded">UTC{tzOffset}</span>
                            </div>
                            <div className="text-[10px] font-medium text-slate-700 dark:text-slate-300">
                              {formatDateTime(currentTime, tzInfo.tz)}
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[9px] opacity-60 uppercase font-semibold">
                                {tzInfo.abbrev}
                              </span>
                              {isMainClock && (
                                <span className="text-[8px] text-blue-600 dark:text-blue-400 font-semibold">★ Main Clock</span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            {!isMainClock && (
                              <button
                                type="button"
                                onClick={() => setAsPredefinedMainClock(tzInfo.tz, tzInfo.name)}
                                className="px-2 py-0.5 rounded-md text-[9px] font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors whitespace-nowrap"
                                title="Set as main clock"
                              >
                                Set Main
                              </button>
                            )}
                            {showClockManager && multiClocks.length < MAX_CLOCKS && (
                              <button
                                type="button"
                                onClick={() => {
                                  addClock({
                                    type: 'predefined',
                                    predefinedTimezone: tzInfo.tz,
                                    predefinedName: tzInfo.name,
                                  });
                                }}
                                className="px-2 py-0.5 rounded-md text-[9px] font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition-colors whitespace-nowrap"
                                title="Add as clock"
                              >
                                Add Clock
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Custom timezones (UTC offsets) */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setExpandedSection(expandedSection === 'custom' ? null : 'custom')}
                  className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded transition-colors mb-2"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">Custom Timezones (UTC)</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`w-3.5 h-3.5 transition-transform duration-300 ${expandedSection === 'custom' ? 'rotate-180' : ''}`}
                  >
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>

                <div className={`overflow-hidden transition-all duration-300 ${expandedSection === 'custom' ? 'max-h-[600px]' : 'max-h-0'}`}>
                  {/* Import/Export Buttons */}
                  <div className="flex items-center gap-2 mb-3">
                    <label className="flex-1 px-3 py-1.5 rounded-lg font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors cursor-pointer text-center text-[11px]">
                      Import
                      <input
                        type="file"
                        accept=".json"
                        onChange={importCustomTimezones}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={exportCustomTimezones}
                      disabled={customTimezones.length === 0}
                      className="flex-1 px-3 py-1.5 rounded-lg font-semibold bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-[11px]"
                      title="Export custom timezones"
                    >
                      Export
                    </button>
                  </div>

                  {/* Add Custom Timezone Form */}
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="text"
                      value={newCustomTzName}
                      onChange={(e) => setNewCustomTzName(e.target.value)}
                      placeholder="Name"
                      className="flex-1 min-w-0 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 text-[11px]"
                    />
                    <input
                      type="text"
                      value={newCustomTzOffset}
                      onChange={(e) => setNewCustomTzOffset(e.target.value)}
                      placeholder="UTC+05:30"
                      title="Examples: UTC+05:30, +02:00, -0500, UTC"
                      className="w-24 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 font-mono text-[10px]"
                    />
                    <button
                      type="button"
                      onClick={addCustomTimezone}
                      className="px-3 py-1.5 rounded-lg font-semibold bg-brand-500 text-white hover:bg-brand-600 transition-colors text-[11px]"
                      title="Add custom timezone"
                    >
                      Add
                    </button>
                  </div>

                  {/* Custom Timezones List */}
                  {customTimezones.length > 0 ? (
                    <div className="space-y-1 max-h-[300px] overflow-y-auto">
                      {customTimezones.map((ctz) => {
                        const isMainClock = mainClockConfig.type === 'custom' && mainClockConfig.customTimezoneId === ctz.id;
                        return (
                          <div
                            key={ctz.id}
                            className={`flex items-center gap-2 px-2 py-2 rounded transition-colors ${
                              isMainClock ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'
                            }`}
                          >
                            <ClockFace date={currentTime} utcOffsetMinutes={ctz.utcOffsetMinutes} size={36} showNumbers={false} />
                            <div className="flex flex-col leading-tight flex-1 overflow-hidden">
                              <div className="flex justify-between items-baseline gap-2">
                                <span className="font-bold text-[11px] truncate">{ctz.name}</span>
                                <span className="text-[9px] font-mono whitespace-nowrap bg-slate-200 dark:bg-slate-700 px-1 rounded">
                                  {offsetMinutesToUtcString(ctz.utcOffsetMinutes)}
                                </span>
                              </div>
                              <div className="text-[10px] font-medium text-slate-700 dark:text-slate-300">
                                {formatTimeForUtcOffset(currentTime, ctz.utcOffsetMinutes)}
                              </div>
                              {isMainClock && (
                                <div className="text-[8px] text-blue-600 dark:text-blue-400 font-semibold">★ Main Clock</div>
                              )}
                            </div>
                            <div className="flex flex-col gap-1">
                              {!isMainClock && (
                                <button
                                  type="button"
                                  onClick={() => setAsMainClock(ctz.id)}
                                  className="px-2 py-0.5 rounded-md text-[9px] font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors whitespace-nowrap"
                                  title="Set as main clock"
                                >
                                  Set Main
                                </button>
                              )}
                              {showClockManager && multiClocks.length < MAX_CLOCKS && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    addClock({
                                      type: 'custom',
                                      customTimezoneId: ctz.id,
                                    });
                                  }}
                                  className="px-2 py-0.5 rounded-md text-[9px] font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition-colors whitespace-nowrap"
                                  title="Add as clock"
                                >
                                  Add Clock
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  // If deleting the main clock, reset to system
                                  if (isMainClock) {
                                    resetToSystemClock();
                                  }
                                  if (isAuthenticated && ctz.source === 'db' && /^\d+$/.test(ctz.id)) {
                                    const idNum = Number.parseInt(ctz.id, 10);
                                    customTimezoneService
                                      .remove(idNum)
                                      .then(() => setCustomTimezones((prev) => prev.filter((x) => x.id !== ctz.id)))
                                      .catch(() => undefined);
                                    return;
                                  }
                                  setCustomTimezones((prev) => prev.filter((x) => x.id !== ctz.id));
                                }}
                                className="px-2 py-0.5 rounded-md text-[9px] font-semibold bg-slate-100 dark:bg-slate-700/60 hover:bg-red-100 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors"
                                title="Delete"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-[11px] opacity-70 text-center py-2">No custom timezones yet.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Clock Manager Panel */}
          {showClockManager && (
            <div className="mt-2 p-2 rounded-lg bg-slate-100 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold">Add Clocks ({multiClocks.length}/{MAX_CLOCKS})</span>
                {multiClocks.length >= MAX_CLOCKS && (
                  <span className="text-[9px] text-amber-600 dark:text-amber-400">Maximum reached</span>
                )}
              </div>
              <div className="text-[9px] opacity-70 mb-2">
                Click "Add Clock" on any timezone above to add it as a displayed clock.
              </div>
              {multiClocks.length < MAX_CLOCKS && (
                <button
                  type="button"
                  onClick={() => addClock({ type: 'system' })}
                  className="w-full px-2 py-1.5 rounded-md text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors"
                  title="Add system clock"
                >
                  + Add System Clock
                </button>
              )}
            </div>
          )}
        </div>
      )
      ) : mode === 'stopwatch' ? (
        <div className="w-full flex flex-col gap-2">
          <div className="w-full flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Elapsed</span>
            <span className="font-mono text-[16px] font-bold text-slate-800 dark:text-slate-100">
              {formatDurationWithMs(swDisplayMs)}
            </span>
          </div>
          <div className="flex items-center gap-2 w-full">
            <button
              type="button"
              onClick={swStartStop}
              className={`flex-1 px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                swRunning ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-emerald-500 text-white hover:bg-emerald-600'
              }`}
            >
              {swRunning ? 'Stop' : 'Start'}
            </button>
            <button
              type="button"
              onClick={swReset}
              className="px-3 py-1.5 rounded-lg font-semibold bg-slate-100 dark:bg-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      ) : mode === 'timer' ? (
        <div className="w-full flex flex-col gap-2">
          <div className="w-full flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Remaining</span>
            <span className="font-mono text-[16px] font-bold text-slate-800 dark:text-slate-100">
              {formatDuration(timerDisplayMs)}
            </span>
          </div>
          
          {/* Preset Timers */}
          <div className="flex flex-wrap gap-1">
            {[60, 5 * 60, 10 * 60, 15 * 60, 30 * 60].map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => timerSetPreset(sec * 1000)}
                className="px-2 py-1 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                {sec >= 60 ? `${sec / 60}m` : `${sec}s`}
              </button>
            ))}
          </div>

          {/* Custom Timer Input */}
          <div className="flex items-center gap-2 w-full">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={customTimerMinutes}
              onChange={handleCustomTimerInput}
              placeholder="Custom minutes"
              className="flex-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 text-[11px]"
            />
            <button
              type="button"
              onClick={setCustomTimer}
              disabled={!customTimerMinutes || parseInt(customTimerMinutes, 10) <= 0}
              className="px-3 py-1.5 rounded-lg font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-[11px]"
              title="Set custom timer"
            >
              Set
            </button>
          </div>

          {/* Start/Pause and Reset Buttons */}
          <div className="flex items-center gap-2 w-full">
            <button
              type="button"
              onClick={timerStartPause}
              className={`flex-1 px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                timerRunning ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-brand-500 text-white hover:bg-brand-600'
              }`}
            >
              {timerRunning ? 'Pause' : 'Start'}
            </button>
            <button
              type="button"
              onClick={timerReset}
              className="px-3 py-1.5 rounded-lg font-semibold bg-slate-100 dark:bg-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      ) : (
        // Alarm
        <div className="w-full flex flex-col gap-2">
          {/* Preset Alarms */}
          <div className="flex flex-wrap gap-1">
            {[
              { time: '07:00', label: '🍳 Breakfast' },
              { time: '09:00', label: '☀️ Morning' },
              { time: '12:00', label: '🍽️ Lunch' },
              { time: '15:00', label: '☕ Afternoon' },
              { time: '18:00', label: '🍕 Dinner' },
              { time: '20:00', label: '🌙 Evening' },
            ].map((preset) => (
              <button
                key={preset.time}
                type="button"
                onClick={() => {
                  setNewAlarmTime(preset.time);
                  setNewAlarmLabel(preset.label);
                }}
                className="px-2 py-1 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                title={`Set ${preset.label} at ${preset.time}`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full">
            <input
              type="time"
              value={newAlarmTime}
              onChange={(e) => setNewAlarmTime(e.target.value)}
              className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100"
            />
            <input
              type="text"
              value={newAlarmLabel}
              onChange={(e) => setNewAlarmLabel(e.target.value)}
              placeholder="Label"
              className="flex-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={addAlarm}
              className="px-3 py-1.5 rounded-lg font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
              title="Add alarm"
            >
              Add
            </button>
          </div>

          <div className="max-h-40 overflow-y-auto w-full space-y-1">
            {alarms.length === 0 ? (
              <div className="text-[11px] opacity-70">No alarms set.</div>
            ) : (
              alarms.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/60 dark:bg-slate-900/30 border border-slate-200/60 dark:border-slate-700/50"
                >
                  <button
                    type="button"
                    onClick={() => {
                      const nextEnabled = !a.enabled;
                      if (isAuthenticated && a.source === 'db' && /^\d+$/.test(a.id)) {
                        const idNum = Number.parseInt(a.id, 10);
                        // optimistic UI
                        setAlarms((prev) => prev.map((x) => (x.id === a.id ? { ...x, enabled: nextEnabled } : x)));
                        alarmService.update(idNum, { enabled: nextEnabled }).catch(() => {
                          // rollback on failure
                          setAlarms((prev) => prev.map((x) => (x.id === a.id ? { ...x, enabled: !nextEnabled } : x)));
                        });
                        return;
                      }
                      setAlarms((prev) => prev.map((x) => (x.id === a.id ? { ...x, enabled: nextEnabled } : x)));
                    }}
                    className={`w-10 px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                      a.enabled ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                    title={a.enabled ? 'Disable' : 'Enable'}
                  >
                    {a.enabled ? 'On' : 'Off'}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono font-bold text-[12px] text-slate-800 dark:text-slate-100">{a.time}</span>
                      <span className="text-[10px] opacity-70 truncate">{a.label}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (isAuthenticated && a.source === 'db' && /^\d+$/.test(a.id)) {
                        const idNum = Number.parseInt(a.id, 10);
                        // optimistic UI
                        const snapshot = alarms;
                        setAlarms((prev) => prev.filter((x) => x.id !== a.id));
                        alarmService.remove(idNum).catch(() => setAlarms(snapshot));
                        return;
                      }
                      setAlarms((prev) => prev.filter((x) => x.id !== a.id));
                    }}
                    className="px-2 py-1 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-700/60 hover:bg-red-100 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

