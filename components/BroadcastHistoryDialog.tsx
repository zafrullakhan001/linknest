import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { broadcastService, BroadcastThreadHistory, BroadcastRevision } from '../services/broadcastService';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

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

function buildHistoryCsv(threads: BroadcastThreadHistory[]): string {
  const headers = [
    'threadId',
    'revisionId',
    'threadCreatedAt',
    'threadUpdatedAt',
    'revisionCreatedAt',
    'message',
    'fontFamily',
    'fontSize',
    'color',
    'scrollSpeed',
    'expiresAt',
    'threadIsActive',
    'revisionLabel',
  ];
  const rows: string[][] = [];
  for (const t of threads) {
    const revs = t.revisions || [];
    revs.forEach((r, idx) => {
      const label = idx === 0 ? 'Latest' : idx === revs.length - 1 ? 'Original' : 'Update';
      rows.push([
        String(t.threadId),
        String(r.id),
        new Date(t.createdAt * 1000).toISOString(),
        new Date(t.updatedAt * 1000).toISOString(),
        new Date(r.createdAt * 1000).toISOString(),
        r.message,
        r.fontFamily,
        r.fontSize,
        r.color,
        String(r.scrollSpeed),
        r.expiresAt ? new Date(r.expiresAt * 1000).toISOString() : '',
        t.isActive ? '1' : '0',
        label,
      ].map(csvEscape));
    });
  }
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
  currentThreadId?: number | null;
}

export const BroadcastHistoryDialog: React.FC<BroadcastHistoryDialogProps> = ({
  open,
  onClose,
  currentThreadId,
}) => {
  useEscapeToClose(open, onClose);
  const [threads, setThreads] = useState<BroadcastThreadHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await broadcastService.getBroadcastHistory();
      setThreads(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load history');
      setThreads([]);
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
    if (threads.length === 0) return;
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fname = `broadcast-history-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.csv`;
    downloadCsv(buildHistoryCsv(threads), fname);
  };

  if (!open) {
    return null;
  }

  const totalRevisions = threads.reduce((n, t) => n + (t.revisions?.length ?? 0), 0);

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
              Each topic is a thread: newest update at the top, original at the bottom. Deleted threads are hidden.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={totalRevisions === 0 || loading}
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
          {!loading && !error && threads.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No broadcast history yet.</p>
          )}
          {!loading && !error && threads.length > 0 && (
            <div className="space-y-8">
              {threads.map((thread) => {
                const isCurrentThread = currentThreadId != null && thread.threadId === currentThreadId;
                const revs = thread.revisions || [];
                return (
                  <section
                    key={thread.threadId}
                    className={`rounded-xl border p-4 ${
                      isCurrentThread
                        ? 'border-brand-400/80 bg-brand-50/50 dark:bg-brand-900/15 dark:border-brand-500/40'
                        : 'border-slate-200 dark:border-slate-600 bg-slate-50/30 dark:bg-slate-900/30'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">Topic #{thread.threadId}</h3>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        Started {formatDateTime(thread.createdAt)}
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        · Last activity {formatDateTime(thread.updatedAt)}
                      </span>
                      {thread.isActive && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-600 text-white">Active topic</span>
                      )}
                      {isCurrentThread && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-brand-600 text-white">Current banner</span>
                      )}
                    </div>

                    <div className="relative pl-2" role="list">
                      <div className="absolute left-[13px] top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-600" aria-hidden />
                      {revs.map((rev, rIdx) => (
                        <RevisionRow
                          key={rev.id}
                          rev={rev}
                          index={rIdx}
                          total={revs.length}
                        />
                      ))}
                    </div>
                  </section>
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

function RevisionRow({
  rev,
  index,
  total,
}: {
  rev: BroadcastRevision;
  index: number;
  total: number;
}) {
  const role =
    total <= 1 ? 'Message' : index === 0 ? 'Latest update' : index === total - 1 ? 'Original' : `Update ${total - index}`;

  return (
    <div className="relative pl-8 pb-6 last:pb-0" role="listitem">
      <div
        className={`absolute left-0 top-1.5 w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center z-[1] ${
          index === 0
            ? 'border-amber-500 bg-amber-500'
            : index === total - 1
              ? 'border-slate-400 dark:border-slate-500 bg-white dark:bg-slate-800'
              : 'border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-800'
        }`}
        aria-hidden
      >
        <span
          className={`w-2 h-2 rounded-full ${
            index === 0 ? 'bg-white' : 'bg-slate-400 dark:bg-slate-500'
          }`}
        />
      </div>
      <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/80 p-3">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
            {role}
          </span>
          <time className="text-xs font-medium text-slate-600 dark:text-slate-300" dateTime={new Date(rev.createdAt * 1000).toISOString()}>
            {formatDateTime(rev.createdAt)}
          </time>
        </div>
        {rev.expiresAt != null && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">Expires: {formatDateTime(rev.expiresAt)}</p>
        )}
        <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">{rev.message}</p>
      </div>
    </div>
  );
}
