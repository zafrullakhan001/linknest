import React, { useCallback, useEffect, useState } from 'react';
import { FaDownload, FaTimes } from 'react-icons/fa';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { userAuditService, UserAuditLogEntry } from '../services/userAuditService';

const ACTION_LABELS: Record<string, string> = {
  'monitor.created': 'Created',
  'monitor.updated': 'Updated',
  'monitor.deleted': 'Deleted',
  'monitor.deleted_all': 'Deleted all',
  'monitor.duplicated': 'Duplicated',
  'monitor.bulk_created': 'Bulk created',
  'monitor.imported': 'Imported',
  'monitor.tab_renamed': 'Tab renamed',
  'monitor.group_renamed': 'Group renamed',
};

const ACTION_EMOJI: Record<string, string> = {
  'monitor.created': '✨',
  'monitor.updated': '✏️',
  'monitor.deleted': '🗑️',
  'monitor.deleted_all': '💣',
  'monitor.duplicated': '📋',
  'monitor.bulk_created': '📦',
  'monitor.imported': '📥',
  'monitor.tab_renamed': '📑',
  'monitor.group_renamed': '📁',
};

const ACTION_BADGE: Record<string, string> = {
  'monitor.created': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  'monitor.updated': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
  'monitor.deleted': 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  'monitor.deleted_all': 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  'monitor.duplicated': 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  'monitor.bulk_created': 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200',
  'monitor.imported': 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  'monitor.tab_renamed': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  'monitor.group_renamed': 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
};

const ACTION_ROW: Record<string, string> = {
  'monitor.created': 'border-l-4 border-l-emerald-400',
  'monitor.updated': 'border-l-4 border-l-indigo-400',
  'monitor.deleted': 'border-l-4 border-l-rose-400',
  'monitor.deleted_all': 'border-l-4 border-l-rose-500',
  'monitor.duplicated': 'border-l-4 border-l-sky-400',
  'monitor.bulk_created': 'border-l-4 border-l-teal-400',
  'monitor.imported': 'border-l-4 border-l-blue-400',
  'monitor.tab_renamed': 'border-l-4 border-l-amber-400',
  'monitor.group_renamed': 'border-l-4 border-l-orange-400',
};

function actionEmoji(action: string): string {
  return ACTION_EMOJI[action] || '📌';
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action] || action.replace(/^monitor\./, '').replace(/_/g, ' ');
}

function formatTime(unix: number): string {
  try {
    return new Date(unix * 1000).toLocaleString();
  } catch {
    return String(unix);
  }
}

function monitorSummary(details: UserAuditLogEntry['details']): string {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return '—';
  const d = details as Record<string, unknown>;
  if (typeof d.name === 'string' && d.name) {
    const id = typeof d.monitor_id === 'number' ? ` (#${d.monitor_id})` : '';
    return `${d.name}${id}`;
  }
  if (typeof d.monitor_id === 'number') return `#${d.monitor_id}`;
  if (typeof d.count === 'number') return `${d.count} monitor${d.count === 1 ? '' : 's'}`;
  if (typeof d.from === 'string' && typeof d.to === 'string') return `${d.from} → ${d.to}`;
  return '—';
}

function formatDetails(details: UserAuditLogEntry['details']): string {
  if (details == null || details === '') return '—';
  if (typeof details === 'string') return details;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (value === null || value === undefined || value === false || value === '') continue;
    if (key === 'name' || key === 'monitor_id') continue;
    if (key === 'monitors' && Array.isArray(value)) {
      const names = value
        .map((m) => (m && typeof m === 'object' && 'name' in m ? String((m as { name?: string }).name || '') : ''))
        .filter(Boolean);
      if (names.length) parts.push(`monitors: ${names.slice(0, 8).join(', ')}${names.length > 8 ? '…' : ''}`);
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      parts.push(`${key}: ${value.join(', ')}`);
      continue;
    }
    if (typeof value === 'object') {
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

interface MonitorAuditLogDialogProps {
  onClose: () => void;
}

export const MonitorAuditLogDialog: React.FC<MonitorAuditLogDialogProps> = ({ onClose }) => {
  useEscapeToClose(true, onClose);

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

  const [modalStyle, setModalStyle] = useState(() => {
    const width = Math.min(typeof window !== 'undefined' ? window.innerWidth - 40 : 1000, 1000);
    const height = Math.min(typeof window !== 'undefined' ? window.innerHeight - 40 : 720, 720);
    return {
      x: typeof window !== 'undefined' ? (window.innerWidth - width) / 2 : 40,
      y: typeof window !== 'undefined' ? (window.innerHeight - height) / 2 : 40,
      width,
      height,
    };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ w: 0, h: 0, x: 0, y: 0 });

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
        action_prefix: 'monitor.',
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

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - modalStyle.x,
      y: e.clientY - modalStyle.y,
    });
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    setResizeStart({
      w: modalStyle.width,
      h: modalStyle.height,
      x: e.clientX,
      y: e.clientY,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setModalStyle((prev) => ({
          ...prev,
          x: Math.min(window.innerWidth - 80, Math.max(-prev.width + 80, e.clientX - dragOffset.x)),
          y: Math.min(window.innerHeight - 48, Math.max(0, e.clientY - dragOffset.y)),
        }));
      }
      if (isResizing) {
        const dw = e.clientX - resizeStart.x;
        const dh = e.clientY - resizeStart.y;
        setModalStyle((prev) => ({
          ...prev,
          width: Math.max(640, Math.min(window.innerWidth - 16, resizeStart.w + dw)),
          height: Math.max(420, Math.min(window.innerHeight - 16, resizeStart.h + dh)),
        }));
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragOffset, resizeStart]);

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
          action_prefix: 'monitor.',
          action: actionFilter || undefined,
          q: debouncedSearch || undefined,
        });
        all.push(...result.logs);
        if (result.logs.length === 0 || all.length >= result.total) break;
        fetchPage += 1;
      }
      const header = ['Time', 'Actor', 'Action', 'Monitor', 'Details', 'IP'];
      const rows = all.map((row) => [
        formatTime(row.created_at),
        row.actor_username || '',
        actionLabel(row.action),
        monitorSummary(row.details),
        formatDetails(row.details),
        row.ip_address || '',
      ]);
      const csv = [header, ...rows].map((cols) => cols.map((c) => csvEscape(c)).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `monitor-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
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
    <div className="fixed inset-0 z-[100] bg-black/20 dark:bg-black/40 overflow-hidden">
      <div
        style={{
          position: 'absolute',
          left: `${modalStyle.x}px`,
          top: `${modalStyle.y}px`,
          width: `${modalStyle.width}px`,
          height: `${modalStyle.height}px`,
        }}
        className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl flex flex-col border border-teal-200/70 dark:border-teal-800/40 overflow-hidden select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          onMouseDown={handleMouseDown}
          className="flex items-center justify-between px-5 py-3 border-b border-teal-100 dark:border-teal-800/40 bg-gradient-to-r from-teal-50 via-sky-50 to-cyan-50 dark:from-teal-950/50 dark:via-sky-950/40 dark:to-cyan-950/30 cursor-grab active:cursor-grabbing"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-400 to-sky-500 flex items-center justify-center text-xl shadow-lg shadow-teal-500/20 shrink-0">
              📋
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                📋 Monitor Audit Log
              </h2>
              <p className="text-sm text-teal-800/70 dark:text-teal-200/70 truncate">
                👀 Who created, updated, or deleted monitors
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-white/70 dark:hover:text-white dark:hover:bg-white/10 transition-all shrink-0"
            title="Close"
          >
            <FaTimes size={16} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 dark:border-[#2a2a2a] flex flex-wrap items-center gap-3 bg-slate-50/80 dark:bg-[#202020]/80">
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="🔎 Search actor, action, monitor, IP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white dark:bg-[#252525] border border-slate-200 dark:border-[#333] rounded-xl px-4 py-2 pl-4 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-400/50"
            />
          </div>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="min-w-[200px] bg-white dark:bg-[#252525] border border-slate-200 dark:border-[#333] rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-400/50"
          >
            <option value="">🌈 All actions</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {actionEmoji(action)} {actionLabel(action)}
              </option>
            ))}
          </select>
          <select
            value={perPage}
            onChange={(e) => setPerPage(Number(e.target.value))}
            className="bg-white dark:bg-[#252525] border border-slate-200 dark:border-[#333] rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-400/50"
          >
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting || loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-teal-500 to-sky-500 hover:from-teal-600 hover:to-sky-600 disabled:opacity-50 transition-all shadow-sm"
          >
            <FaDownload size={12} />
            {exporting ? 'Exporting…' : '📤 Export CSV'}
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 min-h-0">
          {error && (
            <div className="mb-3 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-sm">
              ⚠️ {error}
            </div>
          )}
          {loading ? (
            <div className="py-16 text-center text-slate-500 dark:text-slate-400 text-sm">⏳ Loading audit log…</div>
          ) : logs.length === 0 ? (
            <div className="py-16 text-center text-slate-500 dark:text-slate-400 text-sm">
              📭 No monitor audit entries yet. Creates, updates, and deletes will appear here.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#333]">
              <table className="w-full text-sm">
                <thead className="bg-gradient-to-r from-teal-50 to-sky-50 dark:from-teal-950/40 dark:to-sky-950/30 text-left text-xs uppercase tracking-wide text-teal-800 dark:text-teal-200">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">🕒 Time</th>
                    <th className="px-3 py-2.5 font-semibold">👤 Actor</th>
                    <th className="px-3 py-2.5 font-semibold">⚡ Action</th>
                    <th className="px-3 py-2.5 font-semibold">🖥️ Monitor</th>
                    <th className="px-3 py-2.5 font-semibold">📝 Details</th>
                    <th className="px-3 py-2.5 font-semibold">🌐 IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2a2a2a]">
                  {logs.map((row) => (
                    <tr
                      key={row.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-[#252525]/50 ${ACTION_ROW[row.action] || 'border-l-4 border-l-slate-300'}`}
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">{formatTime(row.created_at)}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-white">{row.actor_username || '—'}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold ${ACTION_BADGE[row.action] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                          <span aria-hidden>{actionEmoji(row.action)}</span>
                          {actionLabel(row.action)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200 max-w-[200px] truncate" title={monitorSummary(row.details)}>
                        {monitorSummary(row.details)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 max-w-[280px] truncate" title={formatDetails(row.details)}>
                        {formatDetails(row.details)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 dark:text-slate-400">{row.ip_address || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-teal-100 dark:border-teal-800/40 bg-gradient-to-r from-teal-50/70 to-sky-50/70 dark:from-teal-950/30 dark:to-sky-950/20 flex items-center justify-between gap-3 relative">
          <div className="text-xs font-semibold text-teal-800/80 dark:text-teal-200/80">
            📊 {total} entr{total === 1 ? 'y' : 'ies'} · page {page} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white dark:bg-[#252525] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#333] disabled:opacity-40"
            >
              ← Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white dark:bg-[#252525] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#333] disabled:opacity-40"
            >
              Next →
            </button>
          </div>

          <div
            onMouseDown={handleResizeMouseDown}
            className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-1 group"
            title="Resize"
          >
            <div className="w-2 h-2 border-r-2 border-b-2 border-teal-400 dark:border-teal-500 rounded-sm group-hover:border-sky-500 transition-colors"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
