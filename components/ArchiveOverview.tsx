import React, { useState } from 'react';

const COLLAPSED_KEY = 'archiveOverviewCollapsed';
const DISMISSED_KEY = 'archiveOverviewDismissed';
const CHECKLIST_DISMISSED_KEY = 'archiveChecklistDismissed';

export interface ArchiveOverviewProps {
  spaceCount?: number;
}

export const ArchiveOverview: React.FC<ArchiveOverviewProps> = ({ spaceCount = 0 }) => {
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
      <div className="px-4 py-2 border-b border-slate-300/60 dark:border-slate-600/40 bg-slate-100/50 dark:bg-slate-800/40">
        <button
          type="button"
          onClick={() => setDismissedPersist(false)}
          className="text-sm font-medium text-slate-700 dark:text-slate-200 hover:underline"
        >
          What is Archive?
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-slate-300 dark:border-slate-600/50 bg-gradient-to-b from-slate-100 to-white dark:from-slate-800/50 dark:to-slate-900">
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Archive</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 max-w-3xl">
            Spaces you deliberately hid from active browsing. Archived content is kept for reference until you
            unarchive or delete it.
            {spaceCount > 0 ? (
              <span className="text-slate-500">
                {' '}
                ({spaceCount} archived space{spaceCount === 1 ? '' : 's'})
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setCollapsedPersist(!collapsed)}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700 transition-colors"
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
              <div className="w-9 h-9 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M2 3a1 1 0 00-1 1v1a1 1 0 001 1h16a1 1 0 001-1V4a1 1 0 00-1-1H2z" />
                  <path fillRule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 01-1.99 1.79H4.802a2 2 0 01-1.99-1.79L2 7.5zM7 11a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Keep, don’t show</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Archive removes a space from Public, Your Apps, Private, and related live views without deleting it.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 01-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 010 10.75H10.75a.75.75 0 010-1.5h2.875a3.875 3.875 0 000-7.75H3.622l4.146 3.957a.75.75 0 01-1.036 1.085l-5.5-5.25a.75.75 0 010-1.085l5.5-5.25a.75.75 0 011.06.025z" clipRule="evenodd" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Unarchive anytime</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Bring a space back to its normal live tab when you need it again. Content and links stay intact.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022-.341 9.535A2.75 2.75 0 006.415 18h7.17a2.75 2.75 0 002.742-2.464l-.34-9.535.15.022a.75.75 0 00.23-1.482A41.033 41.033 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5z" clipRule="evenodd" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Delete when done</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Deleting from Archive moves items to Recycle Bin. Admins can also clear many archived spaces at once.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Archive flow</h4>
            <div className="overflow-x-auto">
              <div className="min-w-[640px] flex flex-wrap items-center gap-2 text-sm">
                <span className="px-3 py-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100 font-medium">
                  Live tabs
                </span>
                <span className="text-slate-400">→</span>
                <span className="px-3 py-1.5 rounded-md bg-slate-200 dark:bg-slate-600 font-medium">Archive</span>
                <span className="text-slate-400 text-xs">(keep but hide)</span>
                <span className="text-slate-400">→</span>
                <span className="px-3 py-1.5 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 font-medium">
                  Unarchive
                </span>
                <span className="text-slate-400">/</span>
                <span className="px-3 py-1.5 rounded-md bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 font-medium">
                  Recycle Bin
                </span>
              </div>
            </div>
          </div>

          {!checklistDismissed && (
            <div className="bg-slate-100 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-600 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">How to use Archive</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Park spaces you might need later without deleting them.
                  </p>
                </div>
                <button type="button" onClick={dismissChecklist} className="text-xs text-slate-600 dark:text-slate-300 hover:underline shrink-0">
                  Dismiss
                </button>
              </div>
              <ol className="space-y-2">
                {[
                  'From a live space or category, choose Archive to hide it from active tabs',
                  'Use Refresh on this tab when you expect recently archived items',
                  'Unarchive a space when it should return to normal browsing',
                  'Delete archived spaces you no longer need (they go to Recycle Bin)',
                ].map((label, index) => (
                  <li
                    key={label}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  >
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-100">
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
                      <th className="py-2 font-semibold text-slate-700 dark:text-slate-300">Reversible?</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-600 dark:text-slate-400">
                    <tr className="border-b border-slate-100 dark:border-slate-700/60">
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Archive</td>
                      <td className="py-3 pr-4 align-top">Hide spaces intentionally while keeping them</td>
                      <td className="py-3 align-top">Yes — unarchive</td>
                    </tr>
                    <tr className="border-b border-slate-100 dark:border-slate-700/60">
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Expired</td>
                      <td className="py-3 pr-4 align-top">Spaces past their Expires at date</td>
                      <td className="py-3 align-top">Yes — extend or clear the date</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Recycle Bin</td>
                      <td className="py-3 pr-4 align-top">Soft-deleted spaces awaiting restore or purge</td>
                      <td className="py-3 align-top">Yes until permanently purged</td>
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
