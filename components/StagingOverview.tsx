import React, { useState } from 'react';

const COLLAPSED_KEY = 'stagingOverviewCollapsed';
const DISMISSED_KEY = 'stagingOverviewDismissed';
const CHECKLIST_DISMISSED_KEY = 'stagingChecklistDismissed';

export interface StagingOverviewProps {
  spaceCount?: number;
  onDownloadTemplates?: () => void;
  onFocusOfflineKit?: () => void;
}

export const StagingOverview: React.FC<StagingOverviewProps> = ({
  spaceCount = 0,
  onDownloadTemplates,
  onFocusOfflineKit,
}) => {
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
      <div className="px-4 py-2 border-b border-amber-200/60 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/20">
        <button
          type="button"
          onClick={() => setDismissedPersist(false)}
          className="text-sm font-medium text-amber-800 dark:text-amber-200 hover:underline"
        >
          What is Staging?
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-amber-200 dark:border-amber-800/50 bg-gradient-to-b from-amber-50 to-white dark:from-amber-950/30 dark:to-slate-900">
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Staging</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 max-w-3xl">
            Staging is your private sandbox. Nothing here is visible to normal users until you move it to Public.
            {spaceCount > 0 ? (
              <span className="text-slate-500 dark:text-slate-500">
                {' '}
                ({spaceCount} space{spaceCount === 1 ? '' : 's'} in Staging)
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setCollapsedPersist(!collapsed)}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-amber-100/80 dark:hover:bg-amber-900/40 transition-colors"
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
              <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M6 3.75A2.75 2.75 0 018.75 1h2.5A2.75 2.75 0 0114 3.75v.443c.572.055 1.14.122 1.706.2C17.053 4.582 18 5.75 18 7.07v3.469c0 1.126-.694 2.191-1.759 2.551-1.096.373-2.247.65-3.441.825 1.315.316 2.475.953 3.2 1.763v.004A2.75 2.75 0 0114 18.75H6a2.75 2.75 0 01-2-4.668v-.004c.725-.81 1.885-1.447 3.2-1.763A10.95 10.95 0 013.759 13.09C2.694 12.73 2 11.665 2 10.54V7.07c0-1.32.947-2.488 2.294-2.676A41.47 41.47 0 016 4.193V3.75z" clipRule="evenodd" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Prepare safely</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Build and test spaces here without changing what guests or signed-in users see on live tabs.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M3 3.5A1.5 1.5 0 014.5 2h6.879a1.5 1.5 0 011.06.44l4.122 4.12A1.5 1.5 0 0117 7.622V16.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 16.5v-13z" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Import at scale</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Use the AI Offline Kit to turn a CSV (often AI-generated) into Staging spaces in a few steps.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Publish when ready</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Open a space and choose <span className="font-medium text-slate-800 dark:text-slate-200">Move to Public</span>.
                It then appears under Public, Your Apps, Private, or Favorites based on visibility.
              </p>
            </div>
          </div>

          {/* Space lifecycle */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Space lifecycle</h4>
            <div className="overflow-x-auto">
              <div className="min-w-[680px] space-y-3 text-sm text-slate-700 dark:text-slate-300">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 font-medium">
                    Staging
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">create / AI import / test</span>
                  <span className="text-slate-400 dark:text-slate-500">→</span>
                  <span className="px-3 py-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100 font-medium">
                    Move to Public
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">→</span>
                  <span className="px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-700 font-medium">Live pool</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-1">
                  <span className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500 w-full sm:w-auto">
                    Live views by visibility
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-sky-50 dark:bg-sky-900/30 text-sky-800 dark:text-sky-200 text-xs font-medium">
                    Public
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 text-xs font-medium">
                    Your Apps
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-violet-50 dark:bg-violet-900/30 text-violet-800 dark:text-violet-200 text-xs font-medium">
                    Private
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-pink-50 dark:bg-pink-900/30 text-pink-800 dark:text-pink-200 text-xs font-medium">
                    Favorites
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-700 font-medium">Live pool</span>
                  <span className="text-slate-400 dark:text-slate-500">→</span>
                  <span className="px-3 py-1.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 font-medium">
                    Scheduled
                  </span>
                  <span className="text-slate-400 dark:text-slate-500 text-xs">(visible from in future)</span>
                  <span className="text-slate-400 dark:text-slate-500">/</span>
                  <span className="px-3 py-1.5 rounded-md bg-orange-50 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 font-medium">
                    Expired
                  </span>
                  <span className="text-slate-400 dark:text-slate-500 text-xs">(expires at in past)</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-700 font-medium">Live pool</span>
                  <span className="text-slate-400 dark:text-slate-500">→</span>
                  <span className="px-3 py-1.5 rounded-md bg-slate-200 dark:bg-slate-600 font-medium">Archive</span>
                  <span className="text-slate-400 dark:text-slate-500">→</span>
                  <span className="px-3 py-1.5 rounded-md bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 font-medium">
                    Recycle Bin
                  </span>
                  <span className="text-slate-400 dark:text-slate-500 text-xs">restore or permanent delete</span>
                </div>
              </div>
            </div>
          </div>

          {!checklistDismissed && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100">How to use Staging</h4>
                  <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-1">
                    Follow these steps for bulk import, or create spaces one-by-one with New Space.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismissChecklist}
                  className="text-xs text-amber-700 dark:text-amber-300 hover:underline shrink-0"
                >
                  Dismiss
                </button>
              </div>
              <ol className="space-y-2">
                {[
                  {
                    label: 'Download CSV Template and AI Prompt Guide',
                    action: () => {
                      onDownloadTemplates?.();
                      onFocusOfflineKit?.();
                    },
                  },
                  {
                    label: 'Generate a filled CSV offline with an AI (using the prompt guide)',
                    action: onFocusOfflineKit,
                  },
                  {
                    label: 'Run CSV → JSON in the Offline Kit',
                    action: onFocusOfflineKit,
                  },
                  {
                    label: 'Import AI JSON into Staging',
                    action: onFocusOfflineKit,
                  },
                  {
                    label: 'Review spaces, then Move to Public from the space editor',
                    action: undefined,
                  },
                ].map((step, index) => (
                  <li key={step.label}>
                    <button
                      type="button"
                      onClick={() => step.action?.()}
                      className={`w-full flex items-center gap-3 text-left px-3 py-2 rounded-lg transition-colors ${
                        step.action
                          ? 'bg-white dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                          : 'bg-white/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 cursor-default'
                      }`}
                    >
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 bg-amber-100 dark:bg-amber-800 text-amber-800 dark:text-amber-100">
                        {index + 1}
                      </span>
                      <span className="text-sm font-medium flex-1">{step.label}</span>
                    </button>
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`w-5 h-5 text-slate-400 transition-transform ${comparisonOpen ? 'rotate-180' : ''}`}
              >
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
                      <th className="py-2 font-semibold text-slate-700 dark:text-slate-300">Who sees it</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-600 dark:text-slate-400">
                    <tr className="border-b border-slate-100 dark:border-slate-700/60">
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Staging</td>
                      <td className="py-3 pr-4 align-top">Sandbox to prepare and bulk-import spaces</td>
                      <td className="py-3 align-top">Admins only</td>
                    </tr>
                    <tr className="border-b border-slate-100 dark:border-slate-700/60">
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Public / Your Apps / Private</td>
                      <td className="py-3 pr-4 align-top">Live spaces after Move to Public, filtered by visibility</td>
                      <td className="py-3 align-top">Guests and/or signed-in users as configured</td>
                    </tr>
                    <tr className="border-b border-slate-100 dark:border-slate-700/60">
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Archive</td>
                      <td className="py-3 pr-4 align-top">Keep a space but hide it from active browsing</td>
                      <td className="py-3 align-top">Signed-in users with access to Archive</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Recycle Bin</td>
                      <td className="py-3 pr-4 align-top">Soft-deleted spaces — restore or purge permanently</td>
                      <td className="py-3 align-top">Signed-in users with access to Recycle Bin</td>
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
