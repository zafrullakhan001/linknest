import React, { useState } from 'react';

const COLLAPSED_KEY = 'recycleBinOverviewCollapsed';
const DISMISSED_KEY = 'recycleBinOverviewDismissed';
const CHECKLIST_DISMISSED_KEY = 'recycleBinChecklistDismissed';

export interface RecycleBinOverviewProps {
  spaceCount?: number;
}

export const RecycleBinOverview: React.FC<RecycleBinOverviewProps> = ({ spaceCount = 0 }) => {
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
      <div className="px-4 py-2 border-b border-red-200/60 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/20">
        <button
          type="button"
          onClick={() => setDismissedPersist(false)}
          className="text-sm font-medium text-red-800 dark:text-red-200 hover:underline"
        >
          What is Recycle Bin?
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-red-200 dark:border-red-800/50 bg-gradient-to-b from-red-50 to-white dark:from-red-950/30 dark:to-slate-900">
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Recycle Bin</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 max-w-3xl">
            Soft-deleted spaces. Restore them to bring content back, or permanently purge when you are sure they are
            gone for good.
            {spaceCount > 0 ? (
              <span className="text-slate-500">
                {' '}
                ({spaceCount} space{spaceCount === 1 ? '' : 's'} in the bin)
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setCollapsedPersist(!collapsed)}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-red-100/80 dark:hover:bg-red-900/40 transition-colors"
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
              <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022-.341 9.535A2.75 2.75 0 006.415 18h7.17a2.75 2.75 0 002.742-2.464l-.34-9.535.15.022a.75.75 0 00.23-1.482A41.033 41.033 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.667.022 2.486.068V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.318A41.652 41.652 0 0110 4z" clipRule="evenodd" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Soft delete first</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Deleting a space moves it here instead of removing it immediately, so accidental deletions can be undone.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 01-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 010 10.75H10.75a.75.75 0 010-1.5h2.875a3.875 3.875 0 000-7.75H3.622l4.146 3.957a.75.75 0 01-1.036 1.085l-5.5-5.25a.75.75 0 010-1.085l5.5-5.25a.75.75 0 011.06.025z" clipRule="evenodd" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Restore</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Restore puts a space back into normal browsing with its content preserved. Use Refresh if the list looks stale.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Purge permanently</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Purge All (or permanent delete on an item) cannot be undone. Only purge when you are sure.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Deletion lifecycle</h4>
            <div className="overflow-x-auto">
              <div className="min-w-[640px] flex flex-wrap items-center gap-2 text-sm">
                <span className="px-3 py-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100 font-medium">
                  Live / Archive
                </span>
                <span className="text-slate-400">→</span>
                <span className="px-3 py-1.5 rounded-md bg-red-100 dark:bg-red-900/40 text-red-900 dark:text-red-100 font-medium">
                  Recycle Bin
                </span>
                <span className="text-slate-400">→</span>
                <span className="px-3 py-1.5 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 font-medium">
                  Restore
                </span>
                <span className="text-slate-400">/</span>
                <span className="px-3 py-1.5 rounded-md bg-rose-100 dark:bg-rose-900/40 text-rose-900 dark:text-rose-100 font-medium">
                  Permanent purge
                </span>
              </div>
            </div>
          </div>

          {!checklistDismissed && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h4 className="text-sm font-semibold text-red-900 dark:text-red-100">How to use Recycle Bin</h4>
                  <p className="text-xs text-red-800/80 dark:text-red-200/80 mt-1">
                    Recover mistakes quickly; only purge when removal should be final.
                  </p>
                </div>
                <button type="button" onClick={dismissChecklist} className="text-xs text-red-700 dark:text-red-300 hover:underline shrink-0">
                  Dismiss
                </button>
              </div>
              <ol className="space-y-2">
                {[
                  'Delete a space from a live tab or Archive — it appears here',
                  'Use Restore on any item you still need',
                  'Refresh the list if a recent delete or restore is missing',
                  'Purge All only when you intentionally want permanent removal',
                ].map((label, index) => (
                  <li
                    key={label}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300"
                  >
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-100">
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
                      <th className="py-2 font-semibold text-slate-700 dark:text-slate-300">Data risk</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-600 dark:text-slate-400">
                    <tr className="border-b border-slate-100 dark:border-slate-700/60">
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Archive</td>
                      <td className="py-3 pr-4 align-top">Hide spaces while keeping them available</td>
                      <td className="py-3 align-top">Low — content stays intact</td>
                    </tr>
                    <tr className="border-b border-slate-100 dark:border-slate-700/60">
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Recycle Bin</td>
                      <td className="py-3 pr-4 align-top">Soft-deleted spaces</td>
                      <td className="py-3 align-top">Medium — restore until purged</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Purge</td>
                      <td className="py-3 pr-4 align-top">Permanent removal from Recycle Bin</td>
                      <td className="py-3 align-top">High — irreversible</td>
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
