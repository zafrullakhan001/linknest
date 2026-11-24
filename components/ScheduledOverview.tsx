import React, { useState } from 'react';

const COLLAPSED_KEY = 'scheduledOverviewCollapsed';
const DISMISSED_KEY = 'scheduledOverviewDismissed';
const CHECKLIST_DISMISSED_KEY = 'scheduledChecklistDismissed';

export interface ScheduledOverviewProps {
  spaceCount?: number;
}

export const ScheduledOverview: React.FC<ScheduledOverviewProps> = ({ spaceCount = 0 }) => {
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
      <div className="px-4 py-2 border-b border-blue-200/60 dark:border-blue-800/40 bg-blue-50/50 dark:bg-blue-950/20">
        <button
          type="button"
          onClick={() => setDismissedPersist(false)}
          className="text-sm font-medium text-blue-800 dark:text-blue-200 hover:underline"
        >
          What is Scheduled?
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-blue-200 dark:border-blue-800/50 bg-gradient-to-b from-blue-50 to-white dark:from-blue-950/30 dark:to-slate-900">
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Scheduled</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 max-w-3xl">
            Spaces waiting for their <span className="font-medium text-slate-800 dark:text-slate-200">Visible from</span> time.
            They stay hidden from live tabs until that moment arrives.
            {spaceCount > 0 ? (
              <span className="text-slate-500">
                {' '}
                ({spaceCount} space{spaceCount === 1 ? '' : 's'} waiting)
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setCollapsedPersist(!collapsed)}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-blue-100/80 dark:hover:bg-blue-900/40 transition-colors"
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
              <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Future go-live</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Set a Visible from date when creating or editing a space. Until then, it lives here instead of Public, Your Apps, or Private.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M10 2a6 6 0 00-6 6c0 1.887.99 3.547 2.48 4.5A3.5 3.5 0 015 16.5v.087a.75.75 0 00.72.747A26.803 26.803 0 0010 17.5a26.8 26.8 0 004.28-.166.75.75 0 00.72-.747V16.5a3.5 3.5 0 01-1.48-4A5.991 5.991 0 0010 2z" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Auto-activates</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                When the start time passes, the space leaves Scheduled and appears in the correct live tab based on its visibility.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M5.25 3A2.25 2.25 0 003 5.25v9.5A2.25 2.25 0 005.25 17h9.5A2.25 2.25 0 0017 14.75v-9.5A2.25 2.25 0 0014.75 3h-9.5z" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Review before launch</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Use this tab to confirm upcoming content, adjust dates, or open a space to edit before it goes live.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Scheduling lifecycle</h4>
            <div className="overflow-x-auto">
              <div className="min-w-[640px] flex flex-wrap items-center gap-2 text-sm">
                <span className="px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-700 font-medium">Space</span>
                <span className="text-slate-400">→</span>
                <span className="px-3 py-1.5 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100 font-medium">
                  Scheduled
                </span>
                <span className="text-slate-400 text-xs">(visible from in future)</span>
                <span className="text-slate-400">→</span>
                <span className="px-3 py-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100 font-medium">
                  Live tabs
                </span>
                <span className="text-slate-400">→</span>
                <span className="px-3 py-1.5 rounded-md bg-orange-100 dark:bg-orange-900/40 text-orange-900 dark:text-orange-100 font-medium">
                  Expired
                </span>
                <span className="text-slate-400 text-xs">(if expires at is set)</span>
              </div>
            </div>
          </div>

          {!checklistDismissed && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">How to use Scheduled</h4>
                  <p className="text-xs text-blue-800/80 dark:text-blue-200/80 mt-1">
                    Prepare content ahead of time without exposing it to users early.
                  </p>
                </div>
                <button type="button" onClick={dismissChecklist} className="text-xs text-blue-700 dark:text-blue-300 hover:underline shrink-0">
                  Dismiss
                </button>
              </div>
              <ol className="space-y-2">
                {[
                  'Create or edit a space and set Visible from to a future date/time',
                  'Confirm it appears here under Scheduled until that time',
                  'Optionally set Expires at so it later moves to Expired',
                  'When Visible from passes, find it under Public, Your Apps, or Private',
                ].map((label, index) => (
                  <li
                    key={label}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300"
                  >
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-100">
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
                      <th className="py-2 font-semibold text-slate-700 dark:text-slate-300">Timing</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-600 dark:text-slate-400">
                    <tr className="border-b border-slate-100 dark:border-slate-700/60">
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Scheduled</td>
                      <td className="py-3 pr-4 align-top">Spaces waiting to become visible</td>
                      <td className="py-3 align-top">Visible from is in the future</td>
                    </tr>
                    <tr className="border-b border-slate-100 dark:border-slate-700/60">
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Live tabs</td>
                      <td className="py-3 pr-4 align-top">Public / Your Apps / Private browsing</td>
                      <td className="py-3 align-top">Currently within the visibility window</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Expired</td>
                      <td className="py-3 pr-4 align-top">Spaces past their end date</td>
                      <td className="py-3 align-top">Expires at is in the past</td>
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
