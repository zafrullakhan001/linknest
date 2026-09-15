import React, { useState } from 'react';

const COLLAPSED_KEY = 'privateOverviewCollapsed';
const DISMISSED_KEY = 'privateOverviewDismissed';
const CHECKLIST_DISMISSED_KEY = 'privateChecklistDismissed';

export type PrivateSubTabId = 'spaces' | 'sharing' | 'blocked';

export interface PrivateOverviewProps {
  spaceCount?: number;
  pendingInvitationsCount?: number;
  onSelectSubTab?: (subTab: PrivateSubTabId) => void;
}

export const PrivateOverview: React.FC<PrivateOverviewProps> = ({
  spaceCount = 0,
  pendingInvitationsCount = 0,
  onSelectSubTab,
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
      <div className="px-4 py-2 border-b border-violet-200/60 dark:border-violet-800/40 bg-violet-50/50 dark:bg-violet-950/20">
        <button
          type="button"
          onClick={() => setDismissedPersist(false)}
          className="text-sm font-medium text-violet-800 dark:text-violet-200 hover:underline"
        >
          What is Private?
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-violet-200 dark:border-violet-800/50 bg-gradient-to-b from-violet-50 to-white dark:from-violet-950/30 dark:to-slate-900">
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Private</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 max-w-3xl">
            Spaces with private visibility that you own or were invited to. Manage sharing invitations and blocked
            users from the sub-tabs below.
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
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-violet-100/80 dark:hover:bg-violet-900/40 transition-colors"
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
              <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Invite-only by design</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Private spaces are not in Public or Your Apps. Only people on the allowed list can open them.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
                  <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Share with invitations</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Invite collaborators from a space, then accept or reject invitations under the Sharing sub-tab.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z" clipRule="evenodd" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Control who is blocked</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Use Blocked to review people you revoked access for and unblock when needed.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Sub-tab guide</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => onSelectSubTab?.('spaces')}
                className="text-left rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:border-violet-300 dark:hover:border-violet-600 hover:bg-violet-50/50 dark:hover:bg-violet-950/30 transition-colors"
              >
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-violet-50 dark:bg-violet-900/40 text-xs font-semibold text-violet-800 dark:text-violet-200 mb-2">
                  Spaces
                </span>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Browse private spaces you own or can access. Use the owner filter when collaborators share spaces with you.
                </p>
              </button>
              <button
                type="button"
                onClick={() => onSelectSubTab?.('sharing')}
                className="text-left rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:border-amber-300 dark:hover:border-amber-600 hover:bg-amber-50/50 dark:hover:bg-amber-950/30 transition-colors"
              >
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-900/40 text-xs font-semibold text-amber-800 dark:text-amber-200 mb-2">
                  Sharing
                  {pendingInvitationsCount > 0 ? (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800 text-[10px]">
                      {pendingInvitationsCount}
                    </span>
                  ) : null}
                </span>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Accept or reject pending invitations to private spaces shared with you.
                </p>
              </button>
              <button
                type="button"
                onClick={() => onSelectSubTab?.('blocked')}
                className="text-left rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors"
              >
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  Blocked
                </span>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Review blocked users related to private sharing and restore access if you unblock them.
                </p>
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Where Private fits</h4>
            <div className="overflow-x-auto">
              <div className="min-w-[680px] space-y-3 text-sm text-slate-700 dark:text-slate-300">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100 font-medium">
                    Live spaces
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">→</span>
                  <span className="px-3 py-1.5 rounded-md bg-sky-50 dark:bg-sky-900/30 text-sky-800 dark:text-sky-200 font-medium">
                    Public
                  </span>
                  <span className="text-slate-400 dark:text-slate-500 text-xs">(everyone)</span>
                  <span className="text-slate-400 dark:text-slate-500">/</span>
                  <span className="px-3 py-1.5 rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 font-medium">
                    Your Apps
                  </span>
                  <span className="text-slate-400 dark:text-slate-500 text-xs">(signed-in / roles)</span>
                  <span className="text-slate-400 dark:text-slate-500">/</span>
                  <span className="px-3 py-1.5 rounded-md bg-violet-100 dark:bg-violet-900/40 text-violet-900 dark:text-violet-100 font-medium">
                    Private
                  </span>
                  <span className="text-slate-400 dark:text-slate-500 text-xs">(owner + invitees)</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-1">
                  <span className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500 w-full sm:w-auto">
                    Private workflow
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-violet-50 dark:bg-violet-900/30 text-violet-800 dark:text-violet-200 text-xs font-medium">
                    Create private space
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">→</span>
                  <span className="px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-xs font-medium">
                    Invite people
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">→</span>
                  <span className="px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 text-xs font-medium">
                    They accept in Sharing
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">→</span>
                  <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium">
                    Block if needed
                  </span>
                </div>
              </div>
            </div>
          </div>

          {!checklistDismissed && (
            <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h4 className="text-sm font-semibold text-violet-900 dark:text-violet-100">How to use Private</h4>
                  <p className="text-xs text-violet-800/80 dark:text-violet-200/80 mt-1">
                    Keep sensitive spaces invite-only and handle sharing without mixing it into the space grid.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismissChecklist}
                  className="text-xs text-violet-700 dark:text-violet-300 hover:underline shrink-0"
                >
                  Dismiss
                </button>
              </div>
              <ol className="space-y-2">
                {[
                  {
                    label: 'Open Spaces to browse private spaces you own or can access',
                    action: () => onSelectSubTab?.('spaces'),
                  },
                  {
                    label: 'Check Sharing for pending invitations to accept or reject',
                    action: () => onSelectSubTab?.('sharing'),
                  },
                  {
                    label: 'Use the owner filter on Spaces when many people share private spaces with you',
                    action: () => onSelectSubTab?.('spaces'),
                  },
                  {
                    label: 'Review Blocked to manage revoked access',
                    action: () => onSelectSubTab?.('blocked'),
                  },
                ].map((step, index) => (
                  <li key={step.label}>
                    <button
                      type="button"
                      onClick={() => step.action?.()}
                      className="w-full flex items-center gap-3 text-left px-3 py-2 rounded-lg transition-colors bg-white dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200"
                    >
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 bg-violet-100 dark:bg-violet-800 text-violet-800 dark:text-violet-100">
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
                      <td className="py-3 pr-4 align-top">Open catalog for guests and signed-in users</td>
                      <td className="py-3 align-top">Everyone</td>
                    </tr>
                    <tr className="border-b border-slate-100 dark:border-slate-700/60">
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Your Apps</td>
                      <td className="py-3 pr-4 align-top">Authenticated spaces plus role/group assignments</td>
                      <td className="py-3 align-top">Signed-in users (personalized)</td>
                    </tr>
                    <tr className="border-b border-slate-100 dark:border-slate-700/60">
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Private</td>
                      <td className="py-3 pr-4 align-top">
                        Invite-only spaces, sharing invitations, and blocked-user management
                      </td>
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
