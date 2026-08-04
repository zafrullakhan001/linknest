import React, { useState } from 'react';

const COLLAPSED_KEY = 'yourAppsOverviewCollapsed';
const DISMISSED_KEY = 'yourAppsOverviewDismissed';
const CHECKLIST_DISMISSED_KEY = 'yourAppsChecklistDismissed';

export interface YourAppsOverviewProps {
  spaceCount?: number;
  onSelectFilter?: (filter: 'all' | 'authenticated' | 'assigned') => void;
}

export const YourAppsOverview: React.FC<YourAppsOverviewProps> = ({
  spaceCount = 0,
  onSelectFilter,
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
      <div className="px-4 py-2 border-b border-indigo-200/60 dark:border-indigo-800/40 bg-indigo-50/50 dark:bg-indigo-950/20">
        <button
          type="button"
          onClick={() => setDismissedPersist(false)}
          className="text-sm font-medium text-indigo-800 dark:text-indigo-200 hover:underline"
        >
          What is Your Apps?
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-indigo-200 dark:border-indigo-800/50 bg-gradient-to-b from-indigo-50 to-white dark:from-indigo-950/30 dark:to-slate-900">
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Your Apps</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 max-w-3xl">
            Your personalized dashboard of spaces you can access while signed in — authenticated spaces plus anything
            assigned to you via roles or groups.
            {spaceCount > 0 ? (
              <span className="text-slate-500 dark:text-slate-500">
                {' '}
                ({spaceCount} space{spaceCount === 1 ? '' : 's'} currently shown)
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setCollapsedPersist(!collapsed)}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-indigo-100/80 dark:hover:bg-indigo-900/40 transition-colors"
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
              <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Signed-in only</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Guests never see this tab. Everything here is scoped to your account and the access you have been granted.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Authenticated spaces</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Spaces marked for any signed-in user appear here in full — no special role assignment required.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98c.03-.212.039-.432.016-.654A6.484 6.484 0 0014.55 11.37a3 3 0 014.308 3.516.78.78 0 01-.358.442c-.64.434-1.38.75-2.07.655zM14 8a2 2 0 11-4 0 2 2 0 014 0zM11.546 15.326a4.97 4.97 0 002.07.655c-.04-.212-.048-.432-.025-.654A6.484 6.484 0 0011.55 11.37a3 3 0 00-4.309 3.516.78.78 0 00.358.442c.64.434 1.38.75 2.07.655.039-.212.048-.432.025-.654a6.48 6.48 0 001.852-2.003z" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Role-assigned access</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Spaces or individual links granted via roles/groups show here. For assigned spaces, only the links you
                were given appear.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Filter guide</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => onSelectFilter?.('all')}
                className="text-left rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-colors"
              >
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  All Apps
                </span>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Everything you can open — authenticated spaces plus role-assigned content. Broadest view.
                </p>
              </button>
              <button
                type="button"
                onClick={() => onSelectFilter?.('authenticated')}
                className="text-left rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:border-sky-300 dark:hover:border-sky-600 hover:bg-sky-50/50 dark:hover:bg-sky-950/30 transition-colors"
              >
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-50 dark:bg-sky-900/40 text-xs font-semibold text-sky-800 dark:text-sky-200 mb-2">
                  <span aria-hidden>🔒</span> Authenticated
                </span>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Only spaces visible to every signed-in user. Useful when you want the shared org catalog.
                </p>
              </button>
              <button
                type="button"
                onClick={() => onSelectFilter?.('assigned')}
                className="text-left rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:border-violet-300 dark:hover:border-violet-600 hover:bg-violet-50/50 dark:hover:bg-violet-950/30 transition-colors"
              >
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-violet-50 dark:bg-violet-900/40 text-xs font-semibold text-violet-800 dark:text-violet-200 mb-2">
                  <span aria-hidden>👤</span> Your Assigned Apps
                </span>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Spaces and links granted specifically to you via roles or groups — not the broad authenticated pool.
                </p>
              </button>
            </div>
          </div>

          {/* Where Your Apps fits */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Where Your Apps fits</h4>
            <div className="overflow-x-auto">
              <div className="min-w-[680px] space-y-3 text-sm text-slate-700 dark:text-slate-300">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100 font-medium">
                    Live spaces
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">after publish</span>
                  <span className="text-slate-400 dark:text-slate-500">→</span>
                  <span className="px-3 py-1.5 rounded-md bg-sky-50 dark:bg-sky-900/30 text-sky-800 dark:text-sky-200 font-medium">
                    Public
                  </span>
                  <span className="text-slate-400 dark:text-slate-500 text-xs">(guests + everyone)</span>
                  <span className="text-slate-400 dark:text-slate-500">/</span>
                  <span className="px-3 py-1.5 rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-900 dark:text-indigo-100 font-medium">
                    Your Apps
                  </span>
                  <span className="text-slate-400 dark:text-slate-500 text-xs">(signed-in access)</span>
                  <span className="text-slate-400 dark:text-slate-500">/</span>
                  <span className="px-3 py-1.5 rounded-md bg-violet-50 dark:bg-violet-900/30 text-violet-800 dark:text-violet-200 font-medium">
                    Private
                  </span>
                  <span className="text-slate-400 dark:text-slate-500 text-xs">(owner / invite)</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-1">
                  <span className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500 w-full sm:w-auto">
                    Your Apps includes
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-sky-50 dark:bg-sky-900/30 text-sky-800 dark:text-sky-200 text-xs font-medium">
                    Authenticated visibility
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-violet-50 dark:bg-violet-900/30 text-violet-800 dark:text-violet-200 text-xs font-medium">
                    Role / group assignment
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-pink-50 dark:bg-pink-900/30 text-pink-800 dark:text-pink-200 text-xs font-medium">
                    Favorite from here too
                  </span>
                </div>
              </div>
            </div>
          </div>

          {!checklistDismissed && (
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h4 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">How to use Your Apps</h4>
                  <p className="text-xs text-indigo-800/80 dark:text-indigo-200/80 mt-1">
                    Quick tips to find the right spaces without digging through other tabs.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismissChecklist}
                  className="text-xs text-indigo-700 dark:text-indigo-300 hover:underline shrink-0"
                >
                  Dismiss
                </button>
              </div>
              <ol className="space-y-2">
                {[
                  {
                    label: 'Start on All Apps for the full list of spaces you can open',
                    action: () => onSelectFilter?.('all'),
                  },
                  {
                    label: 'Use Authenticated to browse the shared signed-in catalog',
                    action: () => onSelectFilter?.('authenticated'),
                  },
                  {
                    label: 'Switch to Your Assigned Apps for role- or group-granted spaces and links',
                    action: () => onSelectFilter?.('assigned'),
                  },
                  {
                    label: 'Star spaces you revisit often — they also appear under Favorites',
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
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 bg-indigo-100 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-100">
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
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Public</td>
                      <td className="py-3 pr-4 align-top">Spaces anyone can browse, including guests</td>
                      <td className="py-3 align-top">Everyone</td>
                    </tr>
                    <tr className="border-b border-slate-100 dark:border-slate-700/60">
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Your Apps</td>
                      <td className="py-3 pr-4 align-top">
                        Authenticated spaces plus spaces/links assigned to you via roles or groups
                      </td>
                      <td className="py-3 align-top">Signed-in users (personalized)</td>
                    </tr>
                    <tr className="border-b border-slate-100 dark:border-slate-700/60">
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Private</td>
                      <td className="py-3 pr-4 align-top">Owner-only or invite-based spaces</td>
                      <td className="py-3 align-top">Owner and invited collaborators</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Favorites</td>
                      <td className="py-3 pr-4 align-top">Spaces and links you starred for quick return</td>
                      <td className="py-3 align-top">You (across sessions when signed in)</td>
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
