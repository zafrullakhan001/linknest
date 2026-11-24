import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DEFAULT_DAY_START_MINUTES,
  DEFAULT_NIGHT_START_MINUTES,
  formatMinutesAsTime,
  getScheduleLabels,
  getThemeMode,
  getThemeSchedule,
  inputValueToMinutes,
  minutesToInputValue,
  setThemeMode,
  setThemeSchedule,
  shouldBeDarkNow,
  subscribeThemePreference,
  type ThemeMode,
} from '../services/themePreferenceService';

interface ThemeModeMenuProps {
  darkMode: boolean;
  compact?: boolean;
}

const SunIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
  </svg>
);

const MoonIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5 text-indigo-500' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.7-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clipRule="evenodd" />
  </svg>
);

const AutoIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="9"></circle>
    <path d="M12 3a9 9 0 0 0 0 18" fill="currentColor" stroke="none"></path>
    <path d="M12 7v5l3 2"></path>
  </svg>
);

function modeLabel(mode: ThemeMode): string {
  if (mode === 'light') return 'Light';
  if (mode === 'dark') return 'Dark';
  return 'Automatic';
}

export const ThemeModeMenu: React.FC<ThemeModeMenuProps> = ({ darkMode, compact = false }) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ThemeMode>(() => getThemeMode());
  const [schedule, setSchedule] = useState(() => getThemeSchedule());
  const [showTimes, setShowTimes] = useState(false);
  const [dayInput, setDayInput] = useState(() => minutesToInputValue(getThemeSchedule().dayStartMinutes));
  const [nightInput, setNightInput] = useState(() => minutesToInputValue(getThemeSchedule().nightStartMinutes));
  const [timeError, setTimeError] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 8 as number | undefined, right: 8 as number | undefined });

  const wrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const refreshFromStorage = () => {
    const nextSchedule = getThemeSchedule();
    setMode(getThemeMode());
    setSchedule(nextSchedule);
    setDayInput(minutesToInputValue(nextSchedule.dayStartMinutes));
    setNightInput(minutesToInputValue(nextSchedule.nightStartMinutes));
  };

  useEffect(() => subscribeThemePreference(refreshFromStorage), []);

  const updatePosition = () => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const menuWidth = 320;
    const margin = 8;
    const top = rect.bottom + 8;
    if (rect.right - menuWidth < margin) {
      setDropdownPosition({
        top,
        left: Math.max(margin, Math.min(rect.left, window.innerWidth - menuWidth - margin)),
        right: undefined,
      });
    } else {
      setDropdownPosition({
        top,
        left: undefined,
        right: Math.max(margin, window.innerWidth - rect.right),
      });
    }
  };

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, showTimes]);

  useEffect(() => {
    if (!open) return;
    const handleResize = () => updatePosition();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        wrapRef.current && !wrapRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
        setShowTimes(false);
        setTimeError(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setShowTimes(false);
        setTimeError(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const labels = getScheduleLabels(schedule);
  const scheduledDark = shouldBeDarkNow(new Date(), schedule);
  const isOverride = mode !== 'automatic' && (mode === 'dark') !== scheduledDark;
  const untilTime = formatMinutesAsTime(darkMode ? schedule.dayStartMinutes : schedule.nightStartMinutes);
  const nextBoundary = mode === 'automatic'
    ? (darkMode ? `Night until ${untilTime}` : `Day until ${untilTime}`)
    : `${modeLabel(mode)} stays until you change it`;

  const buttonTitle = mode === 'automatic'
    ? `Automatic ${darkMode ? 'night' : 'day'} mode — ${nextBoundary}. Click for Light, Dark, or Automatic.`
    : `${modeLabel(mode)} mode (this browser). Click for Light, Dark, or Automatic.`;

  const iconClass = compact ? 'w-4 h-4' : 'w-5 h-5';
  const buttonClass = compact
    ? `linknest-nav-icon p-1.5 rounded-full transition-all ${open ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-100 dark:hover:bg-slate-800'} text-slate-600 dark:text-slate-400`
    : `linknest-nav-icon p-2 rounded-full transition-all border ${open ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700' : 'hover:bg-slate-100 dark:hover:bg-slate-800 border-transparent hover:border-slate-200 dark:hover:border-slate-700'} text-slate-600 dark:text-slate-400`;

  const handleMode = (next: ThemeMode) => {
    setThemeMode(next);
    setMode(next);
    if (next !== 'automatic') {
      setShowTimes(false);
    }
  };

  const handleSaveTimes = () => {
    const dayStartMinutes = inputValueToMinutes(dayInput, DEFAULT_DAY_START_MINUTES);
    const nightStartMinutes = inputValueToMinutes(nightInput, DEFAULT_NIGHT_START_MINUTES);
    if (dayStartMinutes === nightStartMinutes) {
      setTimeError('Day and night must start at different times.');
      return;
    }
    if (!setThemeSchedule({ dayStartMinutes, nightStartMinutes })) {
      setTimeError('Could not save those times. Try again.');
      return;
    }
    setSchedule({ dayStartMinutes, nightStartMinutes });
    setTimeError(null);
    setShowTimes(false);
    if (mode !== 'automatic') {
      setThemeMode('automatic');
      setMode('automatic');
    }
  };

  const handleResetTimes = () => {
    setDayInput(minutesToInputValue(DEFAULT_DAY_START_MINUTES));
    setNightInput(minutesToInputValue(DEFAULT_NIGHT_START_MINUTES));
    setThemeSchedule({
      dayStartMinutes: DEFAULT_DAY_START_MINUTES,
      nightStartMinutes: DEFAULT_NIGHT_START_MINUTES,
    });
    setSchedule({
      dayStartMinutes: DEFAULT_DAY_START_MINUTES,
      nightStartMinutes: DEFAULT_NIGHT_START_MINUTES,
    });
    setTimeError(null);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) {
            refreshFromStorage();
            setShowTimes(false);
            setTimeError(null);
          }
        }}
        className={buttonClass}
        title={buttonTitle}
        aria-label="Day and night mode"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="relative inline-flex">
          {darkMode ? (
            <SunIcon className={iconClass} />
          ) : (
            <MoonIcon className={`${iconClass} text-indigo-500`} />
          )}
          {mode === 'automatic' && (
            <span
              className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-brand-500 ring-2 ring-white dark:ring-slate-900"
              aria-hidden="true"
            />
          )}
        </span>
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          role="menu"
          className="fixed w-80 max-h-[85vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-2"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            right: dropdownPosition.right,
            zIndex: 99999,
          }}
        >
          <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700">
            <p className="text-sm font-medium text-slate-900 dark:text-white">Day / night mode</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Saved in this browser only — not in the database.
            </p>
          </div>

          <div className="p-2 space-y-1">
            {([
              { id: 'light' as const, label: 'Light', hint: 'Stay on day mode', icon: <SunIcon className="w-4 h-4" /> },
              { id: 'dark' as const, label: 'Dark', hint: 'Stay on night mode', icon: <MoonIcon className="w-4 h-4 text-indigo-500" /> },
              { id: 'automatic' as const, label: 'Automatic', hint: 'Switch by time of day', icon: <AutoIcon className="w-4 h-4" /> },
            ]).map((option) => {
              const selected = mode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => handleMode(option.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                    selected
                      ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span className="flex-shrink-0">{option.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{option.hint}</span>
                  </span>
                  {selected && (
                    <span className="text-brand-600 dark:text-brand-400 text-xs font-semibold">On</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 space-y-2">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Automatic schedule</p>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 px-3 py-2 space-y-1.5">
              <p className="text-xs text-slate-700 dark:text-slate-200">
                <span className="font-medium">Daytime (light):</span> {labels.dayWindow}
              </p>
              <p className="text-xs text-slate-700 dark:text-slate-200">
                <span className="font-medium">Nighttime (dark):</span> {labels.nightWindow}
              </p>
            </div>

            {mode === 'automatic' ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {darkMode ? 'Night mode is on for this time of day.' : 'Day mode is on for this time of day.'}
              </p>
            ) : isOverride ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {mode === 'dark'
                  ? 'Night mode is forced during daytime. It stays until you choose Light or Automatic.'
                  : 'Day mode is forced during nighttime. It stays until you choose Dark or Automatic.'}
              </p>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {modeLabel(mode)} is locked in this browser until you choose the other mode or Automatic.
              </p>
            )}

            {showTimes ? (
              <div className="space-y-2 pt-1">
                <label className="block text-xs text-slate-600 dark:text-slate-300">
                  Day starts (light)
                  <input
                    type="time"
                    value={dayInput}
                    onChange={(event) => {
                      setDayInput(event.target.value);
                      setTimeError(null);
                    }}
                    className="mt-1 w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                  />
                </label>
                <label className="block text-xs text-slate-600 dark:text-slate-300">
                  Night starts (dark)
                  <input
                    type="time"
                    value={nightInput}
                    onChange={(event) => {
                      setNightInput(event.target.value);
                      setTimeError(null);
                    }}
                    className="mt-1 w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                  />
                </label>
                {timeError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{timeError}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSaveTimes}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-600 hover:bg-brand-500 text-white"
                  >
                    Save times
                  </button>
                  <button
                    type="button"
                    onClick={handleResetTimes}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    Default 7:00 AM / 6:00 PM
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDayInput(minutesToInputValue(schedule.dayStartMinutes));
                  setNightInput(minutesToInputValue(schedule.nightStartMinutes));
                  setShowTimes(true);
                  setTimeError(null);
                }}
                className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
              >
                Set day and night times
              </button>
            )}
          </div>

          <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700">
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Another browser or device starts on Automatic unless you set this there too.
            </p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
