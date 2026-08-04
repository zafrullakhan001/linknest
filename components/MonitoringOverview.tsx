import React, { useState } from 'react';

const COLLAPSED_KEY = 'monitoringOverviewCollapsed';
const DISMISSED_KEY = 'monitoringOverviewDismissed';
const CHECKLIST_DISMISSED_KEY = 'monitoringChecklistDismissed';

export interface MonitoringOverviewProps {
  /** Optional note when advanced monitorv2 is also available */
  hasMonitorv2?: boolean;
}

export const MonitoringOverview: React.FC<MonitoringOverviewProps> = ({ hasMonitorv2 = false }) => {
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
      <div className="px-4 py-2 border-b border-teal-200/60 dark:border-teal-800/40 bg-teal-50/50 dark:bg-teal-950/20">
        <button
          type="button"
          onClick={() => setDismissedPersist(false)}
          className="text-sm font-medium text-teal-800 dark:text-teal-200 hover:underline"
        >
          What is Monitoring?
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-teal-200 dark:border-teal-800/50 bg-gradient-to-b from-teal-50 to-white dark:from-teal-950/30 dark:to-slate-900">
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Monitoring</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 max-w-3xl">
            Link health dashboard for spaces you maintain. Spot broken or slow destinations and track checks over time.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setCollapsedPersist(!collapsed)}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-teal-100/80 dark:hover:bg-teal-900/40 transition-colors"
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
              <div className="w-9 h-9 rounded-lg bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Health at a glance</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                See which monitored links are up, down, or degraded without opening every space manually.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 4.794a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.898l-2.051-.683a1 1 0 01-.633-.633L6.95 4.794z" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Enable per link</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Monitoring applies to links you opt into. Configure checks from a space or from this dashboard.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M4.5 2A2.5 2.5 0 002 4.5v11A2.5 2.5 0 004.5 18h11a2.5 2.5 0 002.5-2.5V8.621a2.5 2.5 0 00-.732-1.768l-4.121-4.121A2.5 2.5 0 0011.379 2H4.5zm5.75 7.75a.75.75 0 00-1.5 0v2.69l-.72-.72a.75.75 0 00-1.06 1.06l2 2a.75.75 0 001.06 0l2-2a.75.75 0 10-1.06-1.06l-.72.72V9.75z" clipRule="evenodd" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Act on issues</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Use results to fix URLs, retire dead links, or follow up with owners before users hit broken destinations.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Monitoring workflow</h4>
            <div className="overflow-x-auto">
              <div className="min-w-[640px] flex flex-wrap items-center gap-2 text-sm">
                <span className="px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-700 font-medium">Enable link checks</span>
                <span className="text-slate-400">→</span>
                <span className="px-3 py-1.5 rounded-md bg-teal-100 dark:bg-teal-900/40 text-teal-900 dark:text-teal-100 font-medium">
                  Monitoring dashboard
                </span>
                <span className="text-slate-400">→</span>
                <span className="px-3 py-1.5 rounded-md bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 font-medium">
                  Investigate failures
                </span>
                <span className="text-slate-400">→</span>
                <span className="px-3 py-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100 font-medium">
                  Fix or retire links
                </span>
              </div>
            </div>
            {hasMonitorv2 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                Advanced analytics may also appear under Monitorv2 when that stack is configured for this install.
              </p>
            ) : null}
          </div>

          {!checklistDismissed && (
            <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h4 className="text-sm font-semibold text-teal-900 dark:text-teal-100">How to use Monitoring</h4>
                  <p className="text-xs text-teal-800/80 dark:text-teal-200/80 mt-1">
                    Keep link destinations trustworthy for guests and signed-in users.
                  </p>
                </div>
                <button type="button" onClick={dismissChecklist} className="text-xs text-teal-700 dark:text-teal-300 hover:underline shrink-0">
                  Dismiss
                </button>
              </div>
              <ol className="space-y-2">
                {[
                  'Enable monitoring on important links from a space or this dashboard',
                  'Review status summaries for failures and slow responses',
                  'Open the related space to update or remove broken destinations',
                  'Re-check after fixes to confirm the link is healthy again',
                ].map((label, index) => (
                  <li
                    key={label}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300"
                  >
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 bg-teal-100 dark:bg-teal-800 text-teal-800 dark:text-teal-100">
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
                      <th className="py-2 font-semibold text-slate-700 dark:text-slate-300">Best for</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-600 dark:text-slate-400">
                    <tr className="border-b border-slate-100 dark:border-slate-700/60">
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Monitoring</td>
                      <td className="py-3 pr-4 align-top">Link health checks and status history</td>
                      <td className="py-3 align-top">Ongoing reliability maintenance</td>
                    </tr>
                    <tr className="border-b border-slate-100 dark:border-slate-700/60">
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Live tabs</td>
                      <td className="py-3 pr-4 align-top">Browse and edit spaces/links</td>
                      <td className="py-3 align-top">Day-to-day link organization</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Monitorv2</td>
                      <td className="py-3 pr-4 align-top">Advanced monitoring with deeper analytics</td>
                      <td className="py-3 align-top">Installs with the advanced stack enabled</td>
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
