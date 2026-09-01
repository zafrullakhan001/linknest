import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from '../types';
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
import { useEscapeToClose } from '../hooks/useEscapeToClose';

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

function healthDotClass(status?: string): string {
  return linkHealthService.getHealthColor(status || 'unknown');
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
    'w-full rounded-lg border border-gray-200 bg-white/90 px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-colors dark:border-[#444] dark:bg-[#252525] dark:text-white';

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
    if (!modalRef.current || !(e.target as HTMLElement).closest('[data-drag-handle]')) return;
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
    <div className="fixed inset-0 z-[10000]" style={{ backgroundColor: 'transparent' }}>
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-add-links-title"
        className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl border border-emerald-100 dark:border-[#333] overflow-hidden flex flex-col relative"
        style={{
          position: 'absolute',
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${dialogSize.width}px`,
          height: `${dialogSize.height}px`,
          maxWidth: '95vw',
          maxHeight: '95vh',
          minWidth: `${MIN_SIZE.width}px`,
          minHeight: `${MIN_SIZE.height}px`,
          visibility: isPositionReady ? 'visible' : 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Draggable header */}
        <div
          data-drag-handle
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          className="px-6 py-4 border-b border-emerald-200/80 dark:border-[#333] flex items-center justify-between bg-gradient-to-r from-emerald-100/90 via-teal-100/70 to-cyan-100/60 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-cyan-950/20 select-none [&_*:not(button):not(svg):not(path)]:cursor-[inherit]"
          onMouseDown={handleDragStart}
        >
          <div className="min-w-0 flex-1 pr-4">
            <h2
              id="bulk-add-links-title"
              className="text-lg font-bold text-emerald-950 dark:text-emerald-100 flex items-center gap-2"
            >
              <span aria-hidden="true">🔗</span>
              Bulk add links
            </h2>
            <p className="text-sm text-emerald-900/75 dark:text-emerald-200/70 mt-0.5">
              {sectionTitle
                ? `Section: ${sectionTitle} — paste URLs, we fetch titles and check latency.`
                : 'Paste URLs one per line — we suggest fixes, fetch titles, and show RTT.'}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-emerald-900/70 dark:text-emerald-200/70 text-xs flex items-center gap-1.5 hidden sm:flex rounded-lg bg-white/50 dark:bg-black/20 px-2 py-1 border border-emerald-200/60 dark:border-emerald-800/40">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
              </svg>
              Drag · Resize corner
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-emerald-200/60 dark:hover:bg-[#333] text-emerald-900 dark:text-emerald-200 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Step pills */}
        <div className="px-6 py-2.5 border-b border-gray-100 dark:border-[#333] bg-gradient-to-r from-slate-50 to-white dark:from-[#252525] dark:to-[#1e1e1e] shrink-0">
          <div className="inline-flex rounded-xl border border-gray-200 dark:border-[#444] bg-white/80 dark:bg-[#252525] p-1 gap-1 shadow-sm">
            <button
              type="button"
              onClick={() => {
                abortRef.current?.abort();
                setStep('paste');
                setAnalyzing(false);
              }}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                step === 'paste'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              <span aria-hidden="true">📋 </span>Paste URLs
            </button>
            <button
              type="button"
              onClick={() => rows.length > 0 && setStep('review')}
              disabled={rows.length === 0}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-40 ${
                step === 'review'
                  ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              <span aria-hidden="true">✅ </span>Review & add
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-slate-50/50 to-white dark:from-[#1a1a1a] dark:to-[#1e1e1e]">
          {step === 'paste' && (
            <section className="rounded-xl border border-emerald-100 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20 p-4 space-y-3 shadow-sm">
              <div className="flex items-start gap-2.5 pb-2 border-b border-emerald-100/80 dark:border-emerald-900/30">
                <span className="text-xl" aria-hidden="true">
                  🎯
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                    Links
                  </h3>
                  <p className="text-xs text-emerald-800/70 dark:text-emerald-200/60">
                    One URL per line — http, https, ssh, vnc, ftp, file, and more
                  </p>
                </div>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={12}
                placeholder={
                  'https://example.com\nssh://user@host:22\nvnc://host:5900\nftp://files.example.com'
                }
                className={`${inputClass} font-mono min-h-[280px] resize-y border-emerald-200 focus:border-emerald-400 focus:ring-emerald-100`}
                autoFocus
              />
              <p className="text-xs text-emerald-700/80 dark:text-emerald-300/70">
                <span aria-hidden="true">📊 </span>
                {lineCount} unique URL{lineCount === 1 ? '' : 's'}
                {lineCount >= BULK_ADD_MAX_LINES ? ` (max ${BULK_ADD_MAX_LINES})` : ''}
              </p>
            </section>
          )}

          {step === 'review' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-100 bg-sky-50/70 dark:border-sky-900/40 dark:bg-sky-950/20 px-4 py-3">
                <div className="text-sm text-sky-900 dark:text-sky-100">
                  <span aria-hidden="true">📌 </span>
                  <strong>{selectedCount}</strong> of {rows.length} selected
                  {analyzing ? (
                    <span className="ml-2 text-emerald-700 dark:text-emerald-300 animate-pulse">
                      Analyzing…
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    className="px-2.5 py-1 rounded-lg bg-white/80 dark:bg-black/20 border border-sky-200/80 dark:border-sky-800/40 text-sky-800 dark:text-sky-200 hover:bg-white dark:hover:bg-black/30"
                    onClick={() => toggleAll(true)}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="px-2.5 py-1 rounded-lg bg-white/80 dark:bg-black/20 border border-sky-200/80 dark:border-sky-800/40 text-sky-800 dark:text-sky-200 hover:bg-white dark:hover:bg-black/30"
                    onClick={() => toggleAll(false)}
                  >
                    Deselect all
                  </button>
                  {fixableCount > 0 && (
                    <button
                      type="button"
                      className="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800/50 hover:bg-amber-200 dark:hover:bg-amber-900/60"
                      onClick={applyAllSuggested}
                    >
                      Apply all suggested URLs ({fixableCount})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      abortRef.current?.abort();
                      setStep('paste');
                      setAnalyzing(false);
                    }}
                    className="text-sm font-medium text-sky-700 hover:text-sky-800 dark:text-sky-300"
                    disabled={committing}
                  >
                    ← Back to paste
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-emerald-100 dark:border-[#333] shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-emerald-50/80 dark:bg-emerald-950/30 text-left text-xs uppercase tracking-wide text-emerald-800/80 dark:text-emerald-200/70">
                    <tr>
                      <th className="p-2.5 w-10" />
                      <th className="p-2.5 min-w-[10rem]">Name</th>
                      <th className="p-2.5 min-w-[14rem]">URL</th>
                      <th className="p-2.5 w-28">Scheme</th>
                      <th className="p-2.5 w-40">Health / RTT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-50 dark:divide-[#333] bg-white dark:bg-[#1e1e1e]">
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
                              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="p-2.5 align-top">
                            <input
                              type="text"
                              value={row.label}
                              onChange={(e) => updateRow(row.id, { label: e.target.value })}
                              className={inputClass}
                            />
                            <div className="mt-0.5 text-[10px] text-emerald-700/60 dark:text-emerald-300/50">
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
                                  ? 'border-amber-400 dark:border-amber-600 focus:border-amber-400 focus:ring-amber-100'
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
                                className="mt-1 text-[10px] text-emerald-700 dark:text-emerald-300 hover:underline"
                                onClick={() => updateRow(row.id, { url: suggestedDiff })}
                              >
                                Use suggested: {suggestedDiff}
                              </button>
                            )}
                          </td>
                          <td className="p-2.5 align-top">
                            <span className="inline-flex px-1.5 py-0.5 rounded bg-emerald-100/80 dark:bg-emerald-900/40 text-[10px] font-mono uppercase text-emerald-800 dark:text-emerald-200">
                              {schemeBadge(row.url)}
                            </span>
                          </td>
                          <td className="p-2.5 align-top">
                            {row.healthLoading || row.analyzing ? (
                              <span className="text-xs text-emerald-600/70 dark:text-emerald-300/60 animate-pulse">
                                Checking…
                              </span>
                            ) : row.health?.skipped ? (
                              <span className="text-xs text-gray-400">No HTTP probe</span>
                            ) : row.health ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="inline-flex items-center gap-1.5 text-xs">
                                  <span
                                    className={`w-2 h-2 rounded-full shrink-0 ${healthDotClass(row.health.status)}`}
                                  />
                                  <span className="capitalize text-gray-700 dark:text-gray-200">
                                    {row.health.status || 'unknown'}
                                  </span>
                                  {row.health.httpCode ? (
                                    <span className="text-gray-400">{row.health.httpCode}</span>
                                  ) : null}
                                </span>
                                {row.health.serverLatency != null && (
                                  <span className="text-[10px] text-gray-500">
                                    RTT {formatProbeLatency(row.health.serverLatency)}
                                    {row.health.redirectCount
                                      ? ` · ${row.health.redirectCount} redirect(s)`
                                      : ''}
                                  </span>
                                )}
                                {row.health.error && (
                                  <span
                                    className="text-[10px] text-gray-400 truncate max-w-[10rem]"
                                    title={row.health.error}
                                  >
                                    {row.health.error}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
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
              className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-300"
              role="alert"
            >
              <span aria-hidden="true">⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-emerald-100 dark:border-[#333] bg-gradient-to-r from-slate-50 via-emerald-50/40 to-teal-50/30 dark:from-[#252525] dark:via-emerald-950/20 dark:to-teal-950/10 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-[#444] text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-[#333] transition-colors"
            disabled={committing}
          >
            Cancel
          </button>
          {step === 'paste' ? (
            <button
              type="button"
              onClick={runAnalyze}
              disabled={lineCount === 0 || analyzing}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-medium shadow-sm transition-colors"
            >
              {analyzing
                ? '🔮 Analyzing…'
                : `✨ Analyze${lineCount > 0 ? ` (${lineCount})` : ''}`}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCommit}
              disabled={selectedCount === 0 || analyzing || committing}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-700 hover:to-cyan-700 disabled:opacity-50 text-white font-medium shadow-sm transition-colors"
            >
              {committing
                ? '⏳ Adding…'
                : `🚀 Add ${selectedCount} link${selectedCount === 1 ? '' : 's'}`}
            </button>
          )}
        </div>

        {/* Resize handles */}
        <div
          onMouseDown={(e) => handleResizeStart(e, 'se')}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-20 rounded-br-2xl hover:bg-emerald-200/40 dark:hover:bg-emerald-800/30"
          title="Resize"
        />
        <div
          onMouseDown={(e) => handleResizeStart(e, 's')}
          className="absolute bottom-0 left-0 right-4 h-2 cursor-ns-resize z-10"
        />
        <div
          onMouseDown={(e) => handleResizeStart(e, 'e')}
          className="absolute top-0 right-0 bottom-4 w-2 cursor-ew-resize z-10"
        />
      </div>
    </div>,
    document.body
  );
};

export default BulkAddLinksDialog;
