import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from '../types';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { linkHealthService } from '../services/linkHealthService';
import { normalizeStoredLinkUrl } from '../utils/urlDisplay';
import { diagnoseLinkUrl, hasBlockingUrlIssues } from '../utils/urlDiagnostics';
import {
  BULK_ADD_BATCH_SIZE,
  BULK_ADD_MAX_LINES,
  chunkArray,
  formatProbeLatency,
  parseBulkAddUrlLines,
  prepareBulkAddLines,
} from '../utils/bulkAddLinks';
import { LinkHealthStatusDot } from './LinkHealthStatusDot';
import { SpaceModalHeader, EditModalTabButton } from './SpaceFormChrome';

export type BulkAddLinksDialogProps = {
  sectionTitle?: string;
  onClose: () => void;
  onCommit: (links: Link[]) => void | Promise<void>;
  generateId: () => string;
};

type RowHealth = {
  status?: string;
  httpCode?: number | null;
  serverLatency?: number | null;
  redirectCount?: number;
  error?: string | null;
  skipped?: boolean;
};

type BulkRow = {
  id: string;
  raw: string;
  selected: boolean;
  label: string;
  url: string;
  originalUrl: string;
  suggestedUrl: string | null;
  analyzing: boolean;
  titleSource: 'page' | 'fallback' | 'manual';
  health: RowHealth | null;
  healthLoading: boolean;
};

const DEFAULT_SIZE = { width: 960, height: 680 };
const MIN_SIZE = { width: 640, height: 480 };

function getCenteredPosition(width: number, height: number) {
  if (typeof window === 'undefined') {
    return { x: 16, y: 16 };
  }
  return {
    x: Math.max(16, (window.innerWidth - width) / 2),
    y: Math.max(16, (window.innerHeight - height) / 2),
  };
}

function schemeBadge(url: string): string {
  const m = String(url || '').trim().match(/^([a-z][a-z0-9+.-]*):/i);
  return m ? m[1].toLowerCase() : 'url';
}

export const BulkAddLinksDialog: React.FC<BulkAddLinksDialogProps> = ({
  sectionTitle,
  onClose,
  onCommit,
  generateId,
}) => {
  const [step, setStep] = useState<'paste' | 'review'>('paste');
  const [text, setText] = useState('');
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [position, setPosition] = useState(() =>
    getCenteredPosition(DEFAULT_SIZE.width, DEFAULT_SIZE.height)
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);
  const [isPositionReady, setIsPositionReady] = useState(false);

  const [dialogSize, setDialogSize] = useState(DEFAULT_SIZE);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    handle: '',
  });

  const inputClass =
    'w-full rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/50 transition-all';

  useEscapeToClose(true, onClose);

  useLayoutEffect(() => {
    if (!modalRef.current) return;
    const rect = modalRef.current.getBoundingClientRect();
    setPosition(getCenteredPosition(rect.width, rect.height));
    setIsPositionReady(true);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (!modalRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = modalRef.current.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    };
    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  const handleResizeStart = (e: React.MouseEvent<HTMLDivElement>, handle: string) => {
    if (!modalRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = modalRef.current.getBoundingClientRect();
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height,
      handle,
    });
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStart.x;
      const deltaY = e.clientY - resizeStart.y;
      const maxWidth = window.innerWidth - position.x - 16;
      const maxHeight = window.innerHeight - position.y - 16;

      let newWidth = resizeStart.width;
      let newHeight = resizeStart.height;

      if (resizeStart.handle.includes('e')) {
        newWidth = resizeStart.width + deltaX;
      }
      if (resizeStart.handle.includes('s')) {
        newHeight = resizeStart.height + deltaY;
      }

      setDialogSize({
        width: Math.max(MIN_SIZE.width, Math.min(newWidth, maxWidth)),
        height: Math.max(MIN_SIZE.height, Math.min(newHeight, maxHeight)),
      });
    };

    const handleMouseUp = () => setIsResizing(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };
  }, [isResizing, resizeStart, position.x, position.y]);

  const lineCount = useMemo(() => parseBulkAddUrlLines(text).length, [text]);

  const selectedCount = useMemo(
    () => rows.filter((r) => r.selected && r.label.trim() && r.url.trim()).length,
    [rows]
  );

  const runAnalyze = useCallback(async () => {
    const lines = parseBulkAddUrlLines(text);
    if (lines.length === 0) {
      setError('Paste at least one URL (one per line).');
      return;
    }
    setError(null);
    setAnalyzing(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const prepared = prepareBulkAddLines(lines);
    const initial: BulkRow[] = prepared.map((p) => ({
      id: generateId(),
      raw: p.raw,
      selected: true,
      label: p.fallbackLabel,
      url: p.url,
      originalUrl: p.raw,
      suggestedUrl: p.suggestedUrl,
      analyzing: true,
      titleSource: 'fallback' as const,
      health: p.isHttp ? null : { skipped: true },
      healthLoading: p.isHttp,
    }));
    setRows(initial);
    setStep('review');

    try {
      const httpUrls = prepared.filter((p) => p.isHttp).map((p) => p.url);
      const titleMap = new Map<string, string | null>();
      const healthMap = new Map<string, RowHealth>();

      for (const batch of chunkArray(httpUrls, BULK_ADD_BATCH_SIZE)) {
        if (ac.signal.aborted) break;
        const [titles, healths] = await Promise.all([
          linkHealthService.fetchTitles(batch, ac.signal).catch(() =>
            batch.map((url) => ({
              url,
              skipped: true as const,
              title: null,
              error: 'Title fetch failed',
            }))
          ),
          linkHealthService.checkUrls(batch, ac.signal).catch(() =>
            batch.map((url) => ({ url, skipped: true as const, health: null }))
          ),
        ]);
        for (const t of titles) {
          titleMap.set(t.url, t.title);
        }
        for (const h of healths) {
          if (h.skipped || !h.health) {
            healthMap.set(h.url, { skipped: true, error: h.health?.error ?? null });
          } else {
            healthMap.set(h.url, {
              status: h.health.status,
              httpCode: h.health.httpCode ?? null,
              serverLatency: h.health.serverLatency ?? null,
              redirectCount: h.health.redirectCount ?? 0,
              error: h.health.error ?? null,
              skipped: false,
            });
          }
        }
      }

      if (ac.signal.aborted) return;

      setRows((prev) =>
        prev.map((row) => {
          const preparedRow = prepared.find((p) => p.raw === row.raw);
          const isHttp = preparedRow?.isHttp ?? false;
          let label = row.label;
          let titleSource = row.titleSource;
          if (isHttp) {
            const pageTitle = titleMap.get(row.url);
            if (pageTitle && pageTitle.trim()) {
              label = pageTitle.trim();
              titleSource = 'page';
            }
          }
          const health = isHttp
            ? healthMap.get(row.url) ?? { status: 'unknown', error: 'No result' }
            : { skipped: true };
          return {
            ...row,
            label,
            titleSource,
            analyzing: false,
            healthLoading: false,
            health,
          };
        })
      );
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Analysis failed');
      setRows((prev) =>
        prev.map((r) => ({ ...r, analyzing: false, healthLoading: false }))
      );
    } finally {
      setAnalyzing(false);
    }
  }, [generateId, text]);

  const updateRow = (id: string, patch: Partial<BulkRow>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        if (patch.label !== undefined) next.titleSource = 'manual';
        if (patch.url !== undefined) {
          const d = diagnoseLinkUrl(patch.url);
          next.suggestedUrl = d.suggestedUrl;
        }
        return next;
      })
    );
  };

  const applyAllSuggested = () => {
    setRows((prev) =>
      prev.map((r) =>
        r.suggestedUrl && r.suggestedUrl !== r.url ? { ...r, url: r.suggestedUrl } : r
      )
    );
  };

  const toggleAll = (selected: boolean) => {
    setRows((prev) => prev.map((r) => ({ ...r, selected })));
  };

  const handleCommit = async () => {
    const toAdd = rows.filter((r) => r.selected && r.label.trim() && r.url.trim());
    if (toAdd.length === 0) {
      setError('Select at least one link with a name and URL.');
      return;
    }
    setCommitting(true);
    setError(null);
    try {
      const links: Link[] = toAdd.map((r) => ({
        id: generateId(),
        label: r.label.trim(),
        url: normalizeStoredLinkUrl(r.url),
        visibility: 'public',
        published: true,
      }));
      await onCommit(links);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add links');
    } finally {
      setCommitting(false);
    }
  };

  const fixableCount = rows.filter((r) => r.suggestedUrl && r.suggestedUrl !== r.url).length;

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 100060 }}>
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        style={{ zIndex: 100059 }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Bulk add links"
        className={`bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-2xl p-6 pb-8 relative shadow-2xl overflow-hidden flex flex-col ${isDragging ? 'cursor-move' : ''}`}
        style={{
          zIndex: 100060,
          position: 'absolute',
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${dialogSize.width}px`,
          height: `${dialogSize.height}px`,
          maxWidth: '90vw',
          maxHeight: '90vh',
          minWidth: `${MIN_SIZE.width}px`,
          minHeight: `${MIN_SIZE.height}px`,
          visibility: isPositionReady ? 'visible' : 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <SpaceModalHeader
          emoji="🔗"
          eyebrow="Bulk add"
          title="Bulk add links"
          subtitle={
            sectionTitle
              ? `Section: ${sectionTitle} — paste URLs, fetch titles, check latency`
              : 'Paste URLs one per line — we suggest fixes, fetch titles, and show RTT'
          }
          onClose={onClose}
          onMouseDown={handleDragStart}
        />

        <div className="flex gap-1.5 mb-4 border-b border-slate-200 dark:border-slate-700 overflow-x-auto shrink-0">
          <EditModalTabButton
            active={step === 'paste'}
            emoji="📋"
            label="Paste URLs"
            onClick={() => {
              abortRef.current?.abort();
              setStep('paste');
              setAnalyzing(false);
            }}
          />
          <EditModalTabButton
            active={step === 'review'}
            emoji="✅"
            label="Review & add"
            onClick={() => rows.length > 0 && setStep('review')}
          />
        </div>

        <div className="flex-1 overflow-y-auto pr-1 min-h-0 space-y-3">
          {step === 'paste' && (
            <div className="rounded-xl border-2 border-sky-200 dark:border-sky-800/50 overflow-hidden shadow-sm">
              <div className="flex items-center gap-3 px-3.5 py-3 bg-sky-50 dark:bg-sky-950/35">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg bg-sky-100 dark:bg-sky-900/50" aria-hidden>
                  🎯
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-sky-900 dark:text-sky-100">Links</div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    One URL per line — http, https, ssh, vnc, ftp, file, and more
                  </p>
                </div>
              </div>
              <div className="p-3.5 space-y-3 border-t border-sky-100 dark:border-sky-900/40 bg-white/80 dark:bg-slate-900/40">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={12}
                  placeholder={
                    'https://example.com\nssh://user@host:22\nvnc://host:5900\nftp://files.example.com'
                  }
                  className={`${inputClass} font-mono min-h-[220px] resize-y`}
                  autoFocus
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {lineCount} unique URL{lineCount === 1 ? '' : 's'}
                  {lineCount >= BULK_ADD_MAX_LINES ? ` (max ${BULK_ADD_MAX_LINES})` : ''}
                </p>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-sky-200 dark:border-sky-800/50 bg-sky-50 dark:bg-sky-950/35 px-3.5 py-3">
                <div className="text-sm text-sky-900 dark:text-sky-100">
                  <strong>{selectedCount}</strong> of {rows.length} selected
                  {analyzing ? (
                    <span className="ml-2 text-brand-600 dark:text-brand-400 animate-pulse">Analyzing…</span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700"
                    onClick={() => toggleAll(true)}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700"
                    onClick={() => toggleAll(false)}
                  >
                    Deselect all
                  </button>
                  {fixableCount > 0 && (
                    <button
                      type="button"
                      className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800/50"
                      onClick={applyAllSuggested}
                    >
                      Apply all suggested URLs ({fixableCount})
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border-2 border-slate-200 dark:border-slate-700 shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="p-2.5 w-10" />
                      <th className="p-2.5 min-w-[10rem]">Name</th>
                      <th className="p-2.5 min-w-[14rem]">URL</th>
                      <th className="p-2.5 w-28">Scheme</th>
                      <th className="p-2.5 w-40">Health / RTT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                    {rows.map((row) => {
                      const diagnosis = diagnoseLinkUrl(row.url);
                      const blocking = hasBlockingUrlIssues(diagnosis);
                      const suggestedDiff =
                        row.suggestedUrl && row.suggestedUrl !== row.url
                          ? row.suggestedUrl
                          : null;
                      return (
                        <tr key={row.id} className={!row.selected ? 'opacity-50' : ''}>
                          <td className="p-2.5 align-top">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              onChange={(e) =>
                                updateRow(row.id, { selected: e.target.checked })
                              }
                              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            />
                          </td>
                          <td className="p-2.5 align-top">
                            <input
                              type="text"
                              value={row.label}
                              onChange={(e) => updateRow(row.id, { label: e.target.value })}
                              className={inputClass}
                            />
                            <div className="mt-0.5 text-[10px] text-slate-400">
                              {row.titleSource === 'page'
                                ? 'Page title'
                                : row.titleSource === 'fallback'
                                  ? 'From URL'
                                  : 'Edited'}
                            </div>
                          </td>
                          <td className="p-2.5 align-top">
                            <input
                              type="text"
                              value={row.url}
                              onChange={(e) => updateRow(row.id, { url: e.target.value })}
                              className={`${inputClass} font-mono text-xs ${
                                blocking
                                  ? 'border-amber-400 dark:border-amber-600 focus:border-amber-500 focus:ring-amber-500/40'
                                  : ''
                              }`}
                            />
                            {diagnosis.issues.length > 0 && (
                              <ul className="mt-1 space-y-0.5">
                                {diagnosis.issues.slice(0, 2).map((iss) => (
                                  <li
                                    key={iss.id}
                                    className={`text-[10px] ${
                                      iss.severity === 'error'
                                        ? 'text-rose-600 dark:text-rose-400'
                                        : 'text-amber-600 dark:text-amber-400'
                                    }`}
                                  >
                                    {iss.title}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {suggestedDiff && (
                              <button
                                type="button"
                                className="mt-1 text-[10px] text-brand-600 dark:text-brand-400 hover:underline"
                                onClick={() => updateRow(row.id, { url: suggestedDiff })}
                              >
                                Use suggested: {suggestedDiff}
                              </button>
                            )}
                          </td>
                          <td className="p-2.5 align-top">
                            <span className="inline-flex px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/40 text-[10px] font-mono uppercase text-sky-800 dark:text-sky-200">
                              {schemeBadge(row.url)}
                            </span>
                          </td>
                          <td className="p-2.5 align-top">
                            {row.healthLoading || row.analyzing ? (
                              <span className="text-xs text-brand-600/80 dark:text-brand-400 animate-pulse">
                                Checking…
                              </span>
                            ) : row.health?.skipped ? (
                              <span className="text-xs text-slate-400">No HTTP probe</span>
                            ) : row.health ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="inline-flex items-center gap-1.5 text-xs">
                                  <LinkHealthStatusDot
                                    status={row.health.status || 'unknown'}
                                    health={{
                                      httpCode: row.health.httpCode,
                                      redirectCount: row.health.redirectCount,
                                      finalUrl: row.health.finalUrl,
                                    }}
                                    linkUrl={row.url}
                                  />
                                  <span className="capitalize text-slate-700 dark:text-slate-200">
                                    {row.health.status || 'unknown'}
                                  </span>
                                  {row.health.httpCode ? (
                                    <span className="text-slate-400">{row.health.httpCode}</span>
                                  ) : null}
                                </span>
                                {row.health.serverLatency != null && (
                                  <span className="text-[10px] text-slate-500">
                                    RTT {formatProbeLatency(row.health.serverLatency)}
                                    {row.health.redirectCount
                                      ? ` · ${row.health.redirectCount} redirect(s)`
                                      : ''}
                                  </span>
                                )}
                                {row.health.error && (
                                  <span
                                    className="text-[10px] text-slate-400 truncate max-w-[10rem]"
                                    title={row.health.error}
                                  >
                                    {row.health.error}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && (
            <div
              className="text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border-2 border-rose-200 dark:border-rose-900/50 rounded-xl px-4 py-3 flex items-start gap-2"
              role="alert"
            >
              <span aria-hidden="true">⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 justify-end pt-3 mt-3 border-t border-slate-200 dark:border-slate-700 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
            disabled={committing}
          >
            Cancel
          </button>
          {step === 'paste' ? (
            <button
              type="button"
              onClick={runAnalyze}
              disabled={lineCount === 0 || analyzing}
              className="px-4 py-2 text-xs font-semibold bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all shadow-md hover:shadow-lg shadow-brand-500/30"
            >
              {analyzing ? 'Analyzing…' : `Analyze${lineCount > 0 ? ` (${lineCount})` : ''}`}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCommit}
              disabled={selectedCount === 0 || analyzing || committing}
              className="px-4 py-2 text-xs font-semibold bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all shadow-md hover:shadow-lg shadow-brand-500/30"
            >
              {committing
                ? 'Adding…'
                : `Add ${selectedCount} link${selectedCount === 1 ? '' : 's'}`}
            </button>
          )}
        </div>

        <div
          onMouseDown={handleDragStart}
          className={`absolute left-0 right-6 bottom-0 h-7 cursor-move flex items-center justify-center gap-1.5 select-none border-t border-slate-200/80 dark:border-slate-700/80 ${
            isDragging
              ? 'bg-sky-100/90 dark:bg-sky-950/50'
              : 'bg-slate-50/95 dark:bg-slate-800/95 hover:bg-slate-100 dark:hover:bg-slate-700/80'
          }`}
          title="Drag to move"
          role="presentation"
        >
          <span className="w-8 h-1 rounded-full bg-slate-300 dark:bg-slate-500" aria-hidden />
          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">
            Drag
          </span>
          <span className="w-8 h-1 rounded-full bg-slate-300 dark:bg-slate-500" aria-hidden />
        </div>
        <div
          onMouseDown={(e) => handleResizeStart(e, 'se')}
          className={`absolute bottom-0 right-0 w-6 h-7 cursor-nwse-resize flex items-end justify-end ${isResizing ? 'bg-brand-500/20' : 'hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}
          title="Resize"
          aria-hidden
        >
          <div className="w-4 h-4 relative mb-0.5 mr-0.5">
            <div className="absolute bottom-0 right-0 w-3 h-3 border-r-2 border-b-2 border-slate-400 dark:border-slate-500 rounded-br-lg" />
            <div className="absolute bottom-1 right-1 w-2 h-2 border-r border-b border-slate-400 dark:border-slate-500 rounded-br" />
          </div>
        </div>
        <div
          onMouseDown={(e) => handleResizeStart(e, 's')}
          className="absolute bottom-0 left-0 right-6 h-2 cursor-ns-resize z-10"
        />
        <div
          onMouseDown={(e) => handleResizeStart(e, 'e')}
          className="absolute top-0 right-0 bottom-7 w-2 cursor-ew-resize z-10"
        />
      </div>
    </div>,
    document.body
  );
};

export default BulkAddLinksDialog;
