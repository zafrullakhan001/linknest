import React, { useCallback, useEffect, useState } from 'react';
import { useMobile } from '../hooks/useMobile';
import { userAuditService, UserAuditLogEntry } from '../services/userAuditService';

const ADMIN_SECTION_CARD =
  'bg-white dark:bg-slate-800 border border-sky-200/70 dark:border-sky-800/40 rounded-xl overflow-hidden shadow-sm shadow-sky-500/5';
const ADMIN_SECTION_HEADER =
  'bg-gradient-to-r from-sky-50 via-teal-50/80 to-cyan-50/60 dark:from-sky-950/40 dark:via-teal-950/30 dark:to-cyan-950/20 border-b border-sky-100 dark:border-sky-800/40 px-6 py-5';
const ADMIN_SECTION_TITLE =
  'text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2';
const ADMIN_SECTION_SUBTITLE = 'text-sm text-sky-800/70 dark:text-sky-200/70 mt-0.5';

const ACTION_LABELS: Record<string, string> = {
  'user.registered': 'Registered',
  'user.created': 'Created',
  'user.updated': 'Updated',
  'user.deleted': 'Deleted',
  'user.approved': 'Approved',
  'user.unapproved': 'Unapproved',
  'user.rejected': 'Rejected',
  'user.disabled': 'Disabled',
  'user.enabled': 'Enabled',
  'user.promoted': 'Promoted to admin',
  'user.demoted': 'Demoted from admin',
  'user.auth_source_changed': 'Auth source changed',
  'user.auth_source_auto_detect': 'Auto-detected auth sources',
  'user.password_reset': 'Password reset',
  'user.password_changed': 'Password changed',
  'user.impersonate_start': 'Impersonation started',
  'user.impersonate_stop': 'Impersonation stopped',
  'user.roles_assigned': 'Roles assigned',
  'user.roles_removed': 'Roles removed',
  'user.group_added': 'Added to team',
  'user.group_removed': 'Removed from team',
  'user.bulk_import': 'Bulk import',
};

const ACTION_BADGE: Record<string, string> = {
  'user.registered': 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  'user.created': 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  'user.updated': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
  'user.deleted': 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  'user.approved': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  'user.unapproved': 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  'user.rejected': 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  'user.disabled': 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  'user.enabled': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  'user.promoted': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  'user.demoted': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  'user.auth_source_changed': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
  'user.auth_source_auto_detect': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
  'user.password_reset': 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  'user.password_changed': 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  'user.impersonate_start': 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
  'user.impersonate_stop': 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
  'user.roles_assigned': 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200',
  'user.roles_removed': 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200',
  'user.group_added': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200',
  'user.group_removed': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200',
  'user.bulk_import': 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] || action.replace(/^user\./, '').replace(/_/g, ' ');
}

function formatTime(unix: number): string {
  try {
    return new Date(unix * 1000).toLocaleString();
  } catch {
    return String(unix);
  }
}

function formatDetails(details: UserAuditLogEntry['details']): string {
  if (details == null || details === '') return '—';
  if (typeof details === 'string') return details;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (value === null || value === undefined || value === false || value === '') continue;
    if (key === 'bulk' && value === true) {
      parts.push('bulk');
      continue;
    }
    if (key === 'unchanged' && value === true) {
      parts.push('no field changes');
      continue;
    }
    if (key === 'notes' && value === true) {
      parts.push('notes updated');
      continue;
    }
    if (key === 'self' && value === true) {
      parts.push('own account');
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      parts.push(`${key}: ${value.join(', ')}`);
      continue;
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if ('from' in obj || 'to' in obj) {
        parts.push(`${key}: ${obj.from ?? '—'} → ${obj.to ?? '—'}`);
        continue;
      }
      parts.push(`${key}: ${JSON.stringify(value)}`);
      continue;
    }
    parts.push(`${key}: ${String(value)}`);
  }
  return parts.length ? parts.join(' · ') : '—';
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const UserAuditLog: React.FC = () => {
  const isMobile = useMobile();
  const [logs, setLogs] = useState<UserAuditLogEntry[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const result = await userAuditService.list({
        page,
        per_page: perPage,
        action: actionFilter || undefined,
        q: debouncedSearch || undefined,
      });
      setLogs(result.logs);
      setTotal(result.total);
      setActions(result.actions);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [page, perPage, actionFilter, debouncedSearch]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, actionFilter, perPage]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const handleExport = async () => {
    try {
      setExporting(true);
      setError('');
      const all: UserAuditLogEntry[] = [];
      let fetchPage = 1;
      while (all.length < 2000) {
        const result = await userAuditService.list({
          page: fetchPage,
          per_page: 200,
          action: actionFilter || undefined,
          q: debouncedSearch || undefined,
        });
        all.push(...result.logs);
        if (result.logs.length === 0 || all.length >= result.total) break;
        fetchPage += 1;
      }
      const header = ['Time', 'Actor', 'Action', 'Target', 'Details', 'IP'];
      const rows = all.map((row) => [
        formatTime(row.created_at),
        row.actor_username || '',
        actionLabel(row.action),
        row.target_username || '',
        formatDetails(row.details),
        row.ip_address || '',
      ]);
      const csv = [header, ...rows].map((cols) => cols.map((c) => csvEscape(c)).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `user-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to export audit log');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <h3 className={ADMIN_SECTION_TITLE}>
            <span aria-hidden>📋</span> User Audit Log
          </h3>
          <p className={ADMIN_SECTION_SUBTITLE}>
            Track user management changes: creates, role changes, approvals, deletes, and more.
          </p>
        </div>
        <div className={isMobile ? 'p-4 space-y-4' : 'p-6 space-y-4'}>
          <div className={`flex ${isMobile ? 'flex-col' : 'items-center justify-between'} gap-3`}>
            <div className={`flex ${isMobile ? 'flex-col' : 'items-center'} gap-3 flex-1`}>
              <div className={`${isMobile ? 'w-full' : 'flex-1 max-w-md'} relative`}>
                <input
                  type="text"
                  placeholder="Search actor, target, action, IP..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-sky-200/70 dark:border-sky-800/40 rounded-xl px-4 py-2 pl-10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-sky-400"
                />
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                </svg>
              </div>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className={`${isMobile ? 'w-full' : 'min-w-[220px]'} bg-white dark:bg-slate-900 border border-sky-200/70 dark:border-sky-800/40 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-400/50`}
              >
                <option value="">All actions</option>
                {actions.map((action) => (
                  <option key={action} value={action}>
                    {actionLabel(action)}
                  </option>
                ))}
              </select>
            </div>
            <div className={`flex ${isMobile ? 'w-full' : ''} items-center gap-2`}>
              <button
                type="button"
                onClick={() => void loadLogs()}
                disabled={loading}
                className={`${isMobile ? 'flex-1' : ''} px-4 py-2 text-sm font-medium bg-white dark:bg-slate-900 border border-sky-200/70 dark:border-sky-800/40 hover:bg-sky-50 dark:hover:bg-sky-950/40 text-slate-700 dark:text-slate-200 rounded-lg disabled:opacity-50`}
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={exporting || total === 0}
                className={`${isMobile ? 'flex-1' : ''} px-4 py-2 text-sm font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-lg`}
              >
                {exporting ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="text-sm text-slate-500 dark:text-slate-400">
            {total} event{total === 1 ? '' : 's'}
          </div>

          <div className="overflow-x-auto rounded-xl border border-sky-100 dark:border-sky-900/40">
            <table className="min-w-full text-sm">
              <thead className="bg-sky-50/80 dark:bg-sky-950/30 text-left text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Time</th>
                  <th className="px-4 py-3 font-semibold">Actor</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Target</th>
                  {!isMobile && <th className="px-4 py-3 font-semibold">Details</th>}
                  {!isMobile && <th className="px-4 py-3 font-semibold whitespace-nowrap">IP</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-100 dark:divide-sky-900/40">
                {loading ? (
                  <tr>
                    <td colSpan={isMobile ? 4 : 6} className="px-4 py-10 text-center text-slate-500">
                      Loading audit log...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={isMobile ? 4 : 6} className="px-4 py-10 text-center text-slate-500">
                      No audit events yet. User management actions will appear here.
                    </td>
                  </tr>
                ) : (
                  logs.map((row) => (
                    <tr key={row.id} className="bg-white dark:bg-slate-800/40">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {formatTime(row.created_at)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                        {row.actor_username || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${ACTION_BADGE[row.action] || 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}>
                          {actionLabel(row.action)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-800 dark:text-slate-200">
                        {row.target_username || '—'}
                      </td>
                      {!isMobile && (
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 max-w-md truncate" title={formatDetails(row.details)}>
                          {formatDetails(row.details)}
                        </td>
                      )}
                      {!isMobile && (
                        <td className="px-4 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400 font-mono text-xs">
                          {row.ip_address || '—'}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className={`flex ${isMobile ? 'flex-col' : 'items-center justify-between'} gap-3`}>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <span>Per page</span>
              <select
                value={perPage}
                onChange={(e) => setPerPage(Number(e.target.value))}
                className="bg-white dark:bg-slate-900 border border-sky-200/70 dark:border-sky-800/40 rounded-lg px-2 py-1.5 text-sm"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-500">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
