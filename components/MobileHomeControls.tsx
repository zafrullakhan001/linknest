import React, { useEffect, useState } from 'react';
import { haptics } from '../utils/haptics';

/**
 * Compact toolbar for the phone home grid: icon density, sort order, and an
 * offline indicator.
 *
 * The desktop board has a view-mode toggle and category toolbar; below 768px
 * there was no equivalent at all - icon size was hardcoded and ordering was
 * whatever the API returned.
 */

export type MobileTileDensity = 'small' | 'medium' | 'large';

export type MobileTileSort = 'default' | 'az' | 'za' | 'recent' | 'most-visited';

export const MOBILE_DENSITY_COLUMNS: Record<MobileTileDensity, number> = {
  small: 4,
  medium: 3,
  large: 2,
};

/** Icon box + label sizing per density (Tailwind classes are fixed, so we map). */
export const MOBILE_DENSITY_STYLES: Record<
  MobileTileDensity,
  { icon: string; gap: string; emoji: string; label: string }
> = {
  small: { icon: 'w-14 h-14 rounded-xl', gap: 'gap-3', emoji: 'text-xl', label: 'text-[10px]' },
  medium: { icon: 'w-16 h-16 rounded-xl', gap: 'gap-4', emoji: 'text-2xl', label: 'text-[11px]' },
  large: { icon: 'w-20 h-20 rounded-2xl', gap: 'gap-6', emoji: 'text-3xl', label: 'text-xs' },
};

export const MOBILE_SORT_LABELS: Record<MobileTileSort, string> = {
  default: 'Default order',
  az: 'Name (A–Z)',
  za: 'Name (Z–A)',
  recent: 'Recently visited',
  'most-visited': 'Most visited',
};

const DENSITY_PREFS_KEY = 'linknest.mobile.tileDensity.v1';
const SORT_PREFS_KEY = 'linknest.mobile.tileSort.v1';
const GROUP_PREFS_KEY = 'linknest.mobile.groupByCategory.v1';

function readLocal<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: string) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage disabled */
  }
}

export function readMobileTileDensity(): MobileTileDensity {
  return readLocal(DENSITY_PREFS_KEY, ['small', 'medium', 'large'] as const, 'medium');
}

export function readMobileTileSort(): MobileTileSort {
  return readLocal(
    SORT_PREFS_KEY,
    ['default', 'az', 'za', 'recent', 'most-visited'] as const,
    'default'
  );
}

export function persistMobileTileDensity(value: MobileTileDensity) {
  writeLocal(DENSITY_PREFS_KEY, value);
}

export function persistMobileTileSort(value: MobileTileSort) {
  writeLocal(SORT_PREFS_KEY, value);
}

/** Group the home grid into collapsible category sections. */
export function readMobileGroupByCategory(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(GROUP_PREFS_KEY) === '1';
  } catch {
    return false;
  }
}

export function persistMobileGroupByCategory(value: boolean) {
  writeLocal(GROUP_PREFS_KEY, value ? '1' : '0');
}

/** Thin banner shown while the browser reports no connectivity. */
export const OfflineBanner: React.FC = () => {
  const [offline, setOffline] = useState<boolean>(
    () => typeof navigator !== 'undefined' && navigator.onLine === false
  );

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
        <path d="M10 15a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
        <path fillRule="evenodd" d="M1.22 1.22a.75.75 0 011.06 0l16.5 16.5a.75.75 0 11-1.06 1.06l-2.41-2.41a7.5 7.5 0 01-10.62 0l-1.41 1.41a.75.75 0 01-1.06-1.06l1.41-1.41A9 9 0 012.7 13.4a.75.75 0 111.06 1.06 7.5 7.5 0 001.06.87l1.42-1.42A6 6 0 0110 12.5c1.03 0 2 .26 2.85.72l1.35-1.35A9 9 0 0010 10.5c-1.3 0-2.52.28-3.63.78L5.02 9.93A10.5 10.5 0 0110 8.5c2.1 0 4.05.62 5.7 1.68l1.24-1.24a.75.75 0 011.06 1.06L1.22 1.22z" clipRule="evenodd" />
      </svg>
      <span className="flex-1">You are offline — showing cached spaces.</span>
    </div>
  );
};

interface MobileHomeControlsProps {
  density: MobileTileDensity;
  onDensityChange: (value: MobileTileDensity) => void;
  sort: MobileTileSort;
  onSortChange: (value: MobileTileSort) => void;
  /** Group into collapsible category sections. */
  groupByCategory: boolean;
  onGroupByCategoryChange: (value: boolean) => void;
  /** Hide controls when a search is active (results have their own ordering). */
  hidden?: boolean;
}

export const MobileHomeControls: React.FC<MobileHomeControlsProps> = ({
  density,
  onDensityChange,
  sort,
  onSortChange,
  groupByCategory,
  onGroupByCategoryChange,
  hidden = false,
}) => {
  const [sortOpen, setSortOpen] = useState(false);

  if (hidden) return null;

  return (
    <div className="relative flex items-center gap-2 px-4 pb-3">
      {/* Density */}
      <div className="flex items-center gap-0.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {(['small', 'medium', 'large'] as MobileTileDensity[]).map((value) => {
          const active = density === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => {
                haptics.tap();
                onDensityChange(value);
              }}
              aria-pressed={active}
              aria-label={`${value} icons`}
              title={`${value[0].toUpperCase()}${value.slice(1)} icons`}
              className={`rounded-lg px-2.5 py-1.5 transition-colors touch-manipulation ${
                active
                  ? 'bg-white text-brand-600 shadow-sm dark:bg-slate-700 dark:text-brand-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
              style={{ minHeight: '36px' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                {value === 'small' && (
                  <path d="M3 3h3v3H3V3zm5.5 0h3v3h-3V3zm5.5 0h3v3h-3V3zM3 8.5h3v3H3v-3zm5.5 0h3v3h-3v-3zm5.5 0h3v3h-3v-3zM3 14h3v3H3v-3zm5.5 0h3v3h-3v-3zm5.5 0h3v3h-3v-3z" />
                )}
                {value === 'medium' && (
                  <path d="M3 3h6v6H3V3zm8 0h6v6h-6V3zM3 11h6v6H3v-6zm8 0h6v6h-6v-6z" />
                )}
                {value === 'large' && <path d="M3 3h14v7H3V3zm0 9h14v5H3v-5z" />}
              </svg>
            </button>
          );
        })}
      </div>

      {/* Group by category */}
      <button
        type="button"
        onClick={() => {
          haptics.tap();
          onGroupByCategoryChange(!groupByCategory);
        }}
        aria-pressed={groupByCategory}
        aria-label="Group by category"
        title="Group by category"
        className={`rounded-xl px-2.5 py-2 transition-colors touch-manipulation ${groupByCategory
          ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400'
          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
          }`}
        style={{ minHeight: '36px' }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path fillRule="evenodd" d="M2 3.75A.75.75 0 012.75 3h6.5a.75.75 0 010 1.5h-6.5A.75.75 0 012 3.75zm8.75 4.25A.75.75 0 0111.5 7.25h5.75a.75.75 0 010 1.5H11.5A.75.75 0 0110.75 8zm-8.75 4A.75.75 0 012.75 11.25h6.5a.75.75 0 010 1.5h-6.5A.75.75 0 012 12zm8.75 4.25a.75.75 0 01.75-.75h5.75a.75.75 0 010 1.5H11.5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Sort */}
      <button
        type="button"
        onClick={() => {
          haptics.tap();
          setSortOpen((v) => !v);
        }}
        aria-expanded={sortOpen}
        aria-haspopup="listbox"
        className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300 touch-manipulation"
        style={{ minHeight: '36px' }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path d="M3 5.75A.75.75 0 013.75 5h8.5a.75.75 0 010 1.5h-8.5A.75.75 0 013 5.75zm0 4.25a.75.75 0 01.75-.75h5.5a.75.75 0 010 1.5h-5.5A.75.75 0 013 10zm0 4.25a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75z" />
          <path d="M15.75 5a.75.75 0 01.75.75v6.69l1.22-1.22a.75.75 0 111.06 1.06l-2.5 2.5a.75.75 0 01-1.06 0l-2.5-2.5a.75.75 0 111.06-1.06l1.22 1.22V5.75a.75.75 0 01.75-.75z" />
        </svg>
        <span className="max-w-[9rem] truncate">{MOBILE_SORT_LABELS[sort]}</span>
      </button>

      {sortOpen && (
        <>
          <button
            type="button"
            aria-label="Close sort menu"
            className="fixed inset-0 z-[40] cursor-default"
            onClick={() => setSortOpen(false)}
          />
          <div
            role="listbox"
            className="absolute right-4 top-full z-[41] mt-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800"
          >
            {(Object.keys(MOBILE_SORT_LABELS) as MobileTileSort[]).map((value) => {
              const active = sort === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    haptics.tap();
                    onSortChange(value);
                    setSortOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors touch-manipulation ${
                    active
                      ? 'bg-brand-50 font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                      : 'text-slate-700 dark:text-slate-200 active:bg-slate-100 dark:active:bg-slate-700'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  <span>{MOBILE_SORT_LABELS[value]}</span>
                  {active && (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                      <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.415l-7.5 7.5a1 1 0 01-1.415 0l-3.5-3.5a1 1 0 111.415-1.415l2.793 2.793 6.793-6.793a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default MobileHomeControls;
