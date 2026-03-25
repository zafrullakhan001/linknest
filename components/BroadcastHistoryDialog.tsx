import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { broadcastService, BroadcastHistoryItem } from '../services/broadcastService';

function formatDateTime(ts: number): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString();
}

function csvEscape(value: string): string {
  const s = value ?? '';
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildHistoryCsv(items: BroadcastHistoryItem[]): string {
  const headers = [
    'id',
    'message',
    'fontFamily',
    'fontSize',
    'color',
    'scrollSpeed',
    'expiresAt',
    'createdAt',
    'updatedAt',
    'isActive',
    'status',
  ];
  const rows = items.map((row) => {
    const now = Math.floor(Date.now() / 1000);
    let status = 'Inactive';
    if (row.isActive) {
      status = row.expiresAt && row.expiresAt <= now ? 'Expired' : 'Active';
    } else if (row.expiresAt && row.expiresAt <= now) {
      status = 'Expired';
    }
    return [
      String(row.id),
      row.message,
      row.fontFamily,
      row.fontSize,
      row.color,
      String(row.scrollSpeed),
      row.expiresAt ? new Date(row.expiresAt * 1000).toISOString() : '',
      new Date(row.createdAt * 1000).toISOString(),
      new Date(row.updatedAt * 1000).toISOString(),
      row.isActive ? '1' : '0',
      status,
    ].map(csvEscape);
  });
  const lines = [headers.join(','), ...rows.map((r) => r.join(','))];
  return '\uFEFF' + lines.join('\r\n');
}

function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface BroadcastHistoryDialogProps {
  open: boolean;
  onClose: () => void;
  currentBroadcastId?: number | null;
}

export const BroadcastHistoryDialog: React.FC<BroadcastHistoryDialogProps> = ({
  open,
  onClose,
  currentBroadcastId,
}) => {
  const [items, setItems] = useState<BroadcastHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await broadcastService.getBroadcastHistory();
      setItems(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load history');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      load();
    }
  }, [open, load]);

  const handleExportCsv = () => {
    if (items.length === 0) return;
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fname = `broadcast-history-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.csv`;
    downloadCsv(buildHistoryCsv(items), fname);
  };

  if (!open) {
    return null;
  }

  const content = (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="broadcast-history-title"
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col border border-slate-200 dark:border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div>
            <h2 id="broadcast-history-title" className="text-lg font-bold text-slate-900 dark:text-white">
              Broadcast message history
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Newest first. Includes past and current announcements stored on the server.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={items.length === 0 || loading}
              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="Close history"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-600 dark:text-slate-300">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 min-h-0">
          {loading && (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
            </div>
          )}
          {!loading && error && (
            <p className="text-sm text-red-600 dark:text-red-400 text-center py-8">{error}</p>
          )}
          {!loading && !error && items.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No broadcast history yet.</p>
          )}
          {!loading && !error && items.length > 0 && (
            <div className="relative" role="list">
              <div className="absolute left-[11px] top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-600" aria-hidden />
              {items.map((item) => {
                const now = Math.floor(Date.now() / 1000);
                const isCurrent = currentBroadcastId != null && item.id === currentBroadcastId;
                const expired = item.expiresAt != null && item.expiresAt <= now;
                const statusLabel = item.isActive ? (expired ? 'Expired' : 'Active') : expired ? 'Expired' : 'Inactive';

                return (
                  <div key={item.id} className="relative pl-8 pb-8 last:pb-0" role="listitem">
                    <div
                      className={`absolute left-0 top-1.5 w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center z-[1] ${
                        isCurrent
                          ? 'border-brand-500 bg-brand-500 shadow-[0_0_0_3px_rgba(59,130,246,0.25)]'
                          : 'border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-800'
                      }`}
                      aria-hidden
                    >
                      <span className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-white' : 'bg-slate-400 dark:bg-slate-500'}`} />
                    </div>
                    <div
                      className={`rounded-lg border p-3 ${
                        isCurrent
                          ? 'border-brand-400/80 bg-brand-50/80 dark:bg-brand-900/20 dark:border-brand-500/40'
                          : 'border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-900/40'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <time className="text-xs font-semibold text-slate-700 dark:text-slate-200" dateTime={new Date(item.createdAt * 1000).toISOString()}>
                          Created: {formatDateTime(item.createdAt)}
                        </time>
                        {item.updatedAt !== item.createdAt && (
                          <time className="text-xs text-slate-500 dark:text-slate-400" dateTime={new Date(item.updatedAt * 1000).toISOString()}>
                            · Updated: {formatDateTime(item.updatedAt)}
                          </time>
                        )}
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                            item.isActive && !expired
                              ? 'bg-emerald-600/90 text-white'
                              : expired
                                ? 'bg-slate-500 text-white'
                                : 'bg-slate-400 dark:bg-slate-600 text-white'
                          }`}
                        >
                          {statusLabel}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-brand-600 text-white">Current</span>
                        )}
                      </div>
                      {item.expiresAt != null && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                          Expires: {formatDateTime(item.expiresAt)}
                        </p>
                      )}
                      <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">{item.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
};
