import React, { useState } from 'react';

const COLLAPSED_KEY = 'expiredOverviewCollapsed';
const DISMISSED_KEY = 'expiredOverviewDismissed';
const CHECKLIST_DISMISSED_KEY = 'expiredChecklistDismissed';

export interface ExpiredOverviewProps {
  spaceCount?: number;
}

export const ExpiredOverview: React.FC<ExpiredOverviewProps> = ({ spaceCount = 0 }) => {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [checklistDismissed, setChecklistDismissed] = useState(() => {
    try {
      return localStorage.getItem(CHECKLIST_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [comparisonOpen, setComparisonOpen] = useState(false);

  const persist = (key: string, value: boolean) => {
    try {
      localStorage.setItem(key, value ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const setCollapsedPersist = (v: boolean) => {
    setCollapsed(v);
    persist(COLLAPSED_KEY, v);
  };
  const setDismissedPersist = (v: boolean) => {
    setDismissed(v);
    persist(DISMISSED_KEY, v);
  };
  const dismissChecklist = () => {
    setChecklistDismissed(true);
    persist(CHECKLIST_DISMISSED_KEY, true);
  };

  if (dismissed) {
    return (
      <div className="px-4 py-2 border-b border-orange-200/60 dark:border-orange-800/40 bg-orange-50/50 dark:bg-orange-950/20">
        <button
          type="button"
          onClick={() => setDismissedPersist(false)}
          className="text-sm font-medium text-orange-800 dark:text-orange-200 hover:underline"
        >
          What is Expired?
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-orange-200 dark:border-orange-800/50 bg-gradient-to-b from-orange-50 to-white dark:from-orange-950/30 dark:to-slate-900">
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Expired</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 max-w-3xl">
            Spaces whose <span className="font-medium text-slate-800 dark:text-slate-200">Expires at</span> time has
            passed. They no longer appear in live browsing tabs.
            {spaceCount > 0 ? (
              <span className="text-slate-500">
                {' '}
                ({spaceCount} expired space{spaceCount === 1 ? '' : 's'})
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setCollapsedPersist(!collapsed)}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-orange-100/80 dark:hover:bg-orange-900/40 transition-colors"
          >
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
          <button
            type="button"
            onClick={() => setDismissedPersist(true)}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="px-4 pb-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Past end date</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Any space with an Expires at date in the past is collected here so it does not clutter live tabs.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Extend or clear</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Open a space and push Expires at forward, or clear it, if the content should become live again.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M10 2c-1.716 0-3.221.955-4.002 2.377A5.002 5.002 0 015 9a4.998 4.998 0 01.998 4.623A4.5 4.5 0 0010 18a4.5 4.5 0 004.002-2.377A5.002 5.002 0 0115 9a4.998 4.998 0 01-.998-4.623A4.5 4.5 0 0010 2z" clipRule="evenodd" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Clean up later</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Archive or delete spaces you no longer need. Expired is a review queue, not permanent storage.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Where Expired fits</h4>
            <div className="overflow-x-auto">
              <div className="min-w-[640px] flex flex-wrap items-center gap-2 text-sm">
                <span className="px-3 py-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100 font-medium">
                  Live tabs
                </span>
                <span className="text-slate-400">→</span>
                <span className="px-3 py-1.5 rounded-md bg-orange-100 dark:bg-orange-900/40 text-orange-900 dark:text-orange-100 font-medium">
                  Expired
                </span>
                <span className="text-slate-400 text-xs">(expires at passed)</span>
                <span className="text-slate-400">→</span>
                <span className="px-3 py-1.5 rounded-md bg-slate-200 dark:bg-slate-600 font-medium">Archive</span>
                <span className="text-slate-400">/</span>
                <span className="px-3 py-1.5 rounded-md bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 font-medium">
                  Recycle Bin
                </span>
              </div>
            </div>
          </div>

          {!checklistDismissed && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h4 className="text-sm font-semibold text-orange-900 dark:text-orange-100">How to use Expired</h4>
                  <p className="text-xs text-orange-800/80 dark:text-orange-200/80 mt-1">
                    Review lapsed content and decide whether to revive, archive, or remove it.
                  </p>
                </div>
                <button type="button" onClick={dismissChecklist} className="text-xs text-orange-700 dark:text-orange-300 hover:underline shrink-0">
                  Dismiss
                </button>
              </div>
              <ol className="space-y-2">
                {[
                  'Scan the list for campaigns or seasonal spaces that have ended',
                  'Edit Expires at (or clear it) if the space should go live again',
                  'Archive spaces you want to keep off active views',
                  'Delete spaces you no longer need — they move to Recycle Bin',
                ].map((label, index) => (
                  <li
                    key={label}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300"
                  >
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 bg-orange-100 dark:bg-orange-800 text-orange-800 dark:text-orange-100">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium">{label}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setComparisonOpen(!comparisonOpen)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors"
            >
              <span className="text-sm font-semibold text-slate-900 dark:text-white">Not sure which tab to use?</span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 text-slate-400 transition-transform ${comparisonOpen ? 'rotate-180' : ''}`}>
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>
            {comparisonOpen && (
              <div className="px-5 pb-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                      <th className="py-2 pr-4 font-semibold text-slate-700 dark:text-slate-300">Tab</th>
                      <th className="py-2 pr-4 font-semibold text-slate-700 dark:text-slate-300">Purpose</th>
                      <th className="py-2 font-semibold text-slate-700 dark:text-slate-300">Action</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-600 dark:text-slate-400">
                    <tr className="border-b border-slate-100 dark:border-slate-700/60">
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Expired</td>
                      <td className="py-3 pr-4 align-top">Review spaces past Expires at</td>
                      <td className="py-3 align-top">Extend date, archive, or delete</td>
                    </tr>
                    <tr className="border-b border-slate-100 dark:border-slate-700/60">
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Archive</td>
                      <td className="py-3 pr-4 align-top">Deliberately hide active spaces</td>
                      <td className="py-3 align-top">Unarchive to restore browsing</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Recycle Bin</td>
                      <td className="py-3 pr-4 align-top">Soft-deleted spaces</td>
                      <td className="py-3 align-top">Restore or permanently purge</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
