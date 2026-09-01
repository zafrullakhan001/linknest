import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Download, GripVertical } from 'lucide-react';
import { LinkRedirectHop } from '../types';
import { copyTextToClipboard } from '../services/shortUrlService';
import {
  RedirectChainSummary,
  RedirectHopFlag,
  RedirectHopKind,
  buildChainPlainText,
  buildCurlCommand,
  buildHarLog,
  chainExportFilename,
  classifyHopKind,
  downloadJsonFile,
  flagLabel,
  formatHopTiming,
  formatMs,
  hopFlags,
  httpStatusText,
  kindLabel,
  nextHopUrl,
  parseHopUrl,
  queryParamDiff,
  summarizeChain,
  urlsMeaningfullyDifferent,
} from '../utils/redirectChain';

export interface RedirectChainDialogProps {
  originalUrl: string;
  hops: LinkRedirectHop[];
  error?: string;
  serverLatencyMs?: number | null;
  browserLatencyMs?: number | null;
  onClose: () => void;
  onAdoptUrl?: (url: string) => void;
  onCheckSsl?: (url: string) => void;
}

const DEFAULT_SIZE = { width: 672, height: 640 };
const MIN_SIZE = { width: 420, height: 360 };

function getCenteredPosition(width: number, height: number) {
  if (typeof window === 'undefined') {
    return { x: 16, y: 16 };
  }
  return {
    x: Math.max(16, (window.innerWidth - width) / 2),
    y: Math.max(16, (window.innerHeight - height) / 2),
  };
}

function clampDialogPosition(x: number, y: number, width: number, height: number) {
  if (typeof window === 'undefined') return { x, y };
  const minVisible = 72;
  return {
    x: Math.min(Math.max(minVisible - width, x), window.innerWidth - minVisible),
    y: Math.min(Math.max(8, y), window.innerHeight - 48),
  };
}

const hopStatusColor = (code: number): string => {
  if (code >= 200 && code < 300) {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700';
  }
  if (code >= 300 && code < 400) {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 border-amber-200 dark:border-amber-700';
  }
  if (code >= 400) {
    return 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200 border-rose-200 dark:border-rose-700';
  }
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-600';
};

const FLAG_CLASS: Record<string, string> = {
  'ssl-downgrade': 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200 border-rose-200 dark:border-rose-700',
  'ssl-upgrade': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700',
  'host-change': 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200 border-orange-200 dark:border-orange-700',
  loop: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200 border-rose-200 dark:border-rose-700',
  'auth-wall': 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200 border-rose-200 dark:border-rose-700',
  error: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200 border-rose-200 dark:border-rose-700',
  temporary: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 border-amber-200 dark:border-amber-700',
  permanent: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200 border-sky-200 dark:border-sky-700',
  sso: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200 border-violet-200 dark:border-violet-700',
};

function badgeClass(flag: string): string {
  return (
    FLAG_CLASS[flag] ||
    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-600'
  );
}

const CopyButton: React.FC<{ id: string; text: string; copied: string | null; onCopy: (id: string, text: string) => void; label?: string; title?: string }> = ({
  id,
  text,
  copied,
  onCopy,
  label,
  title,
}) => {
  const isCopied = copied === id;
  return (
    <button
      type="button"
      onClick={() => void onCopy(id, text)}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
        isCopied
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
      }`}
      title={title || (isCopied ? 'Copied' : 'Copy')}
    >
      {isCopied ? <Check className="w-3 h-3" aria-hidden /> : <Copy className="w-3 h-3" aria-hidden />}
      {label || (isCopied ? 'Copied' : 'Copy')}
    </button>
  );
};

const KindChip: React.FC<{ kind: RedirectHopKind }> = ({ kind }) => {
  if (kind === 'final') return null;
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${badgeClass(kind === 'sso' ? 'sso' : kind)}`}>
      {kindLabel(kind)}
    </span>
  );
};

const FlagChip: React.FC<{ flag: RedirectHopFlag }> = ({ flag }) => {
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${badgeClass(flag)}`}>
      {flagLabel(flag)}
    </span>
  );
};

const SummaryDiff: React.FC<{ summary: RedirectChainSummary }> = ({ summary }) => {
  const rows: Array<{ label: string; from: string; to: string; changed: boolean }> = [
    { label: 'Scheme', from: summary.original?.scheme || '—', to: summary.final?.scheme || '—', changed: summary.schemeChanged },
    { label: 'Host', from: summary.original?.host || '—', to: summary.final?.host || '—', changed: summary.hostChanged },
    { label: 'Path', from: summary.original?.path || '—', to: summary.final?.path || '—', changed: summary.pathChanged },
    { label: 'Query', from: summary.original?.query || '(none)', to: summary.final?.query || '(none)', changed: summary.queryChanged },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_1fr_1fr] gap-x-3 gap-y-1 text-[11px]">
      <span className="hidden sm:block text-slate-400 font-semibold uppercase tracking-wide"> </span>
      <span className="hidden sm:block text-slate-400 font-semibold uppercase tracking-wide">Original</span>
      <span className="hidden sm:block text-slate-400 font-semibold uppercase tracking-wide">Final</span>
      {rows.map((row) => (
        <React.Fragment key={row.label}>
          <span className="text-slate-500 dark:text-slate-400 font-semibold">{row.label}</span>
          <span className={`break-all ${row.changed ? 'text-slate-500 dark:text-slate-400 line-through decoration-slate-300' : 'text-slate-700 dark:text-slate-200'}`}>
            {row.from}
          </span>
          <span className={`break-all ${row.changed ? 'text-slate-900 dark:text-white font-medium' : 'text-slate-700 dark:text-slate-200'}`}>
            {row.to}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
};

export const RedirectChainDialog: React.FC<RedirectChainDialogProps> = ({
  originalUrl,
  hops,
  error,
  serverLatencyMs,
  browserLatencyMs,
  onClose,
  onAdoptUrl,
  onCheckSsl,
}) => {
  const [copied, setCopied] = useState<string | null>(null);
  const [position, setPosition] = useState(() =>
    getCenteredPosition(DEFAULT_SIZE.width, DEFAULT_SIZE.height)
  );
  const [isDragging, setIsDragging] = useState(false);
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
  const dragOffset = useRef({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);
  const ignoreBackdropClick = useRef(false);

  const summary = useMemo(() => summarizeChain(originalUrl, hops), [originalUrl, hops]);
  const hopTimingTotal = hops.reduce((sum, hop) => sum + (hop.timingMs || 0), 0);
  const totalMs = hopTimingTotal || serverLatencyMs || null;
  const canAdoptFinal = !!onAdoptUrl && urlsMeaningfullyDifferent(originalUrl, summary.finalUrl);
  const canAdoptCleaned =
    !!onAdoptUrl &&
    !!summary.cleanedFinalUrl &&
    urlsMeaningfullyDifferent(originalUrl, summary.cleanedFinalUrl);

  const copy = async (id: string, text: string) => {
    if (!text) return;
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopied(id);
      window.setTimeout(() => setCopied((prev) => (prev === id ? null : prev)), 1600);
    }
  };

  const exportJson = () => {
    const payload = {
      url: originalUrl,
      probe: 'server-head',
      statusError: error || null,
      serverLatencyMs: serverLatencyMs ?? null,
      browserLatencyMs: browserLatencyMs ?? null,
      summary,
      exportedAt: new Date().toISOString(),
      hops: hops.map((hop, idx) => ({
        hop: idx + 1,
        ...hop,
        kind: classifyHopKind(hop.url, idx === hops.length - 1 ? undefined : nextHopUrl(hop) || hops[idx + 1]?.url, idx === hops.length - 1),
        flags: hopFlags(hop, nextHopUrl(hop) || hops[idx + 1]?.url),
        final: idx === hops.length - 1,
      })),
    };
    downloadJsonFile(chainExportFilename(originalUrl, 'json'), payload);
  };

  const exportHar = () => {
    downloadJsonFile(chainExportFilename(originalUrl, 'har'), buildHarLog(originalUrl, hops));
  };

  const adopt = (url: string) => {
    onAdoptUrl?.(url);
    onClose();
  };

  useLayoutEffect(() => {
    const width = Math.min(
      DEFAULT_SIZE.width,
      typeof window !== 'undefined' ? window.innerWidth - 32 : DEFAULT_SIZE.width
    );
    const height = Math.min(
      DEFAULT_SIZE.height,
      typeof window !== 'undefined' ? window.innerHeight - 32 : DEFAULT_SIZE.height
    );
    setDialogSize({ width, height });
    setPosition(getCenteredPosition(width, height));
    setIsPositionReady(true);
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
      const width = modalRef.current?.offsetWidth ?? dialogSize.width;
      const height = modalRef.current?.offsetHeight ?? dialogSize.height;
      setPosition(
        clampDialogPosition(e.clientX - dragOffset.current.x, e.clientY - dragOffset.current.y, width, height)
      );
    };
    const handleMouseUp = () => {
      ignoreBackdropClick.current = true;
      window.setTimeout(() => {
        ignoreBackdropClick.current = false;
      }, 0);
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };
  }, [isDragging, dialogSize.width, dialogSize.height]);

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
      if (resizeStart.handle.includes('e')) newWidth = resizeStart.width + deltaX;
      if (resizeStart.handle.includes('s')) newHeight = resizeStart.height + deltaY;

      setDialogSize({
        width: Math.max(MIN_SIZE.width, Math.min(newWidth, maxWidth)),
        height: Math.max(MIN_SIZE.height, Math.min(newHeight, maxHeight)),
      });
    };

    const handleMouseUp = () => {
      ignoreBackdropClick.current = true;
      window.setTimeout(() => {
        ignoreBackdropClick.current = false;
      }, 0);
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };
  }, [isResizing, resizeStart, position.x, position.y]);

  const safetyClass =
    summary.safeToAdopt === 'yes'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
      : summary.safeToAdopt === 'caution'
        ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
        : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200';

  return createPortal(
    <div className="fixed inset-0 z-[100080]" role="presentation">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => {
          if (ignoreBackdropClick.current) return;
          onClose();
        }}
        aria-hidden="true"
      />
      <div
        ref={modalRef}
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden relative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="redirect-chain-dialog-title"
        onClick={(e) => e.stopPropagation()}
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
      >
        <div
          data-drag-handle
          onMouseDown={handleDragStart}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3 shrink-0 select-none"
        >
          <div className="min-w-0 flex items-start gap-2">
            <GripVertical
              className="w-4 h-4 mt-0.5 text-slate-400 dark:text-slate-500 shrink-0 pointer-events-none"
              aria-hidden
            />
            <div className="min-w-0">
              <h3 id="redirect-chain-dialog-title" className="text-base font-bold text-slate-900 dark:text-white">
                Redirect chain
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {summary.hopCount} hop{summary.hopCount === 1 ? '' : 's'}
                {' · '}
                Reached after {summary.redirectCount} redirect{summary.redirectCount === 1 ? '' : 's'}
                {totalMs != null ? ` · ${formatMs(totalMs)} total` : ''}
                {error ? ` · ${error}` : ''}
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                Traced from the LinkNest server with HEAD (not your browser). Browser RTT
                {browserLatencyMs != null ? ` ${formatMs(browserLatencyMs)}` : ' pending'} is a separate timing.
                {' · '}Drag the header · resize the corner
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors shrink-0 cursor-pointer"
            aria-label="Close redirect chain"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0 space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {summary.kinds.map((kind) => (
                <KindChip key={kind} kind={kind} />
              ))}
              {summary.flags
                .filter((f) => f === 'ssl-downgrade' || f === 'ssl-upgrade' || f === 'host-change' || f === 'loop' || f === 'auth-wall')
                .map((flag) => (
                  <FlagChip key={flag} flag={flag} />
                ))}
            </div>
            <SummaryDiff summary={summary} />
            <div className={`rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${safetyClass}`}>{summary.adoptReason}</div>
            {summary.authWall && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400">
                Final status is an auth wall — the probe reached login, not the bookmark destination.
              </p>
            )}
            {summary.cleanedFinalUrl && (
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="text-slate-500 dark:text-slate-400">Tracking params stripped:</span>
                <span className="font-mono break-all text-slate-800 dark:text-slate-100">{summary.cleanedFinalUrl}</span>
                <CopyButton id="cleaned" text={summary.cleanedFinalUrl} copied={copied} onCopy={copy} />
                {canAdoptCleaned && (
                  <button
                    type="button"
                    onClick={() => adopt(summary.cleanedFinalUrl!)}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-md border border-sky-200 text-sky-800 bg-sky-50 hover:bg-sky-100 dark:border-sky-800 dark:text-sky-200 dark:bg-sky-950/40"
                  >
                    Use cleaned URL
                  </button>
                )}
              </div>
            )}
          </div>

          <ol className="space-y-2">
            {hops.map((hop, idx) => {
              const isLast = idx === hops.length - 1;
              const to = nextHopUrl(hop) || hops[idx + 1]?.url;
              const kind = classifyHopKind(hop.url, isLast ? undefined : to, isLast);
              const flags = hopFlags(hop, to);
              const hasWarning = flags.some((f) =>
                ['ssl-downgrade', 'host-change', 'loop', 'auth-wall', 'error', 'method-preserving'].includes(f)
              );
              const parsed = parseHopUrl(hop.url);
              const qdiff = to && !isLast ? queryParamDiff(hop.url, to) : null;
              const locationDisplay = hop.locationRaw || hop.location;
              const resolved = hop.locationResolved;
              const showResolved = !!(resolved && locationDisplay && resolved !== locationDisplay);
              const timing = formatHopTiming(hop);
              const isHttps = parsed?.scheme === 'https';

              return (
                <li key={`${hop.step}-${hop.url}-${idx}`} className="flex gap-3 items-start">
                  <div className="flex flex-col items-center pt-1 shrink-0 w-6">
                    <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 text-center leading-none">{idx + 1}</span>
                    {!isLast && (
                      <span className="mt-1 text-slate-300 dark:text-slate-600 text-sm leading-none" aria-hidden>
                        ↓
                      </span>
                    )}
                  </div>
                  <div
                    className={`min-w-0 flex-1 rounded-lg border px-3 py-2.5 ${
                      flags.includes('ssl-downgrade')
                        ? 'border-rose-300 dark:border-rose-700 bg-rose-50/70 dark:bg-rose-950/20'
                        : 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${hopStatusColor(hop.httpCode)}`}>
                        {hop.httpCode > 0 ? `HTTP ${hop.httpCode}` : 'No response'}
                        {httpStatusText(hop.httpCode) ? ` ${httpStatusText(hop.httpCode)}` : ''}
                      </span>
                      {isLast && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Final</span>
                      )}
                          {flags.map((flag) => (
                            <FlagChip key={flag} flag={flag} />
                          ))}
                      {hop.timingMs != null && (
                        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{formatMs(hop.timingMs)}</span>
                      )}
                    </div>
                    <div className="flex items-start gap-2">
                      <p className="text-xs text-slate-800 dark:text-slate-100 break-all leading-relaxed flex-1 min-w-0" title={hop.url}>
                        {hop.url}
                      </p>
                      <CopyButton id={`hop-${idx}`} text={hop.url} copied={copied} onCopy={copy} title="Copy hop URL" />
                    </div>
                    {locationDisplay && !isLast && (
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 break-all" title={locationDisplay}>
                        → {locationDisplay}
                        {hop.locationRelative ? ' (relative)' : ''}
                        {hop.locationProtocolRelative ? ' (protocol-relative)' : ''}
                      </p>
                    )}
                    {showResolved && !isLast && (
                      <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500 break-all" title={resolved}>
                        resolved → {resolved}
                      </p>
                    )}
                    {(hop.ip || hop.port) && (
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {hop.ip || ''}
                        {hop.port && hop.port !== 80 && hop.port !== 443 ? `:${hop.port}` : ''}
                        {hop.httpVersion ? ` · ${hop.httpVersion}` : ''}
                        {hop.requestMethod ? ` · ${hop.requestMethod}` : ''}
                      </p>
                    )}
                    {hop.error && (
                      <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400" title={hop.error}>
                        {hop.error}
                      </p>
                    )}
                    {qdiff && (qdiff.added.length > 0 || qdiff.removed.length > 0 || qdiff.changed.length > 0) && (
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        Query:{' '}
                        {qdiff.added.map((k) => (
                          <span key={`a-${k}`} className={qdiff.tracking.includes(k) ? 'text-amber-700 dark:text-amber-300' : ''}>
                            +{k}{' '}
                          </span>
                        ))}
                        {qdiff.removed.map((k) => (
                          <span key={`r-${k}`}>-{k} </span>
                        ))}
                        {qdiff.changed.map((k) => (
                          <span key={`c-${k}`} className={qdiff.tracking.includes(k) ? 'text-amber-700 dark:text-amber-300' : ''}>
                            ~{k}{' '}
                          </span>
                        ))}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {onAdoptUrl && urlsMeaningfullyDifferent(originalUrl, hop.url) && (
                        <button
                          type="button"
                          onClick={() => adopt(hop.url)}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-md border border-slate-200 text-slate-700 hover:bg-white dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          Use this URL
                        </button>
                      )}
                      {isHttps && onCheckSsl && (
                        <button
                          type="button"
                          onClick={() => onCheckSsl(hop.url)}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-md border border-violet-200 text-violet-800 bg-violet-50 hover:bg-violet-100 dark:border-violet-800 dark:text-violet-200 dark:bg-violet-950/40"
                        >
                          Check SSL
                        </button>
                      )}
                    </div>
                    <details className="mt-2" defaultOpen={hasWarning}>
                      <summary className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 cursor-pointer select-none">
                        Hop details
                      </summary>
                      <dl className="mt-2 grid grid-cols-[7.5rem_1fr] gap-x-2 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                        {timing && (
                          <>
                            <dt className="text-slate-400">Timing</dt>
                            <dd>{timing}</dd>
                          </>
                        )}
                        {hop.server && (
                          <>
                            <dt className="text-slate-400">Server</dt>
                            <dd className="break-all">{hop.server}</dd>
                          </>
                        )}
                        {hop.contentType && (
                          <>
                            <dt className="text-slate-400">Content-Type</dt>
                            <dd className="break-all">{hop.contentType}</dd>
                          </>
                        )}
                        {hop.contentLength != null && hop.contentLength >= 0 && (
                          <>
                            <dt className="text-slate-400">Content-Length</dt>
                            <dd>{hop.contentLength}</dd>
                          </>
                        )}
                        {hop.cacheControl && (
                          <>
                            <dt className="text-slate-400">Cache-Control</dt>
                            <dd className="break-all">{hop.cacheControl}</dd>
                          </>
                        )}
                        {hop.setCookieNames && hop.setCookieNames.length > 0 && (
                          <>
                            <dt className="text-slate-400">Set-Cookie</dt>
                            <dd>names only: {hop.setCookieNames.join(', ')}</dd>
                          </>
                        )}
                        {hop.hsts && (
                          <>
                            <dt className="text-slate-400">HSTS</dt>
                            <dd>present</dd>
                          </>
                        )}
                        {hop.wwwAuthenticate && (
                          <>
                            <dt className="text-slate-400">WWW-Authenticate</dt>
                            <dd>{hop.wwwAuthenticate}</dd>
                          </>
                        )}
                        {hop.methodPreserving && (
                          <>
                            <dt className="text-slate-400">Method</dt>
                            <dd>307/308 — browsers would repeat the original method. This probe used HEAD.</dd>
                          </>
                        )}
                      </dl>
                    </details>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void copy('chain-text', buildChainPlainText(originalUrl, hops, summary))}
            className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            {copied === 'chain-text' ? 'Copied chain' : 'Copy chain'}
          </button>
          <button
            type="button"
            onClick={() => void copy('curl', buildCurlCommand(originalUrl, true))}
            className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            {copied === 'curl' ? 'Copied cURL' : 'Copy as cURL'}
          </button>
          <button
            type="button"
            onClick={exportJson}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" aria-hidden />
            JSON
          </button>
          <button
            type="button"
            onClick={exportHar}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" aria-hidden />
            HAR
          </button>
          {canAdoptFinal && (
            <button
              type="button"
              onClick={() => adopt(summary.finalUrl)}
              className="px-3 py-2 text-sm font-medium rounded-lg border border-sky-200 text-sky-800 bg-sky-50 hover:bg-sky-100 dark:border-sky-800 dark:text-sky-200 dark:bg-sky-950/50 dark:hover:bg-sky-900/40 transition-colors"
              title={summary.adoptReason}
            >
              Use final URL
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white transition-colors"
          >
            Close
          </button>
        </div>

        <div
          onMouseDown={(e) => handleResizeStart(e, 'se')}
          className={`absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-20 rounded-br-2xl ${
            isResizing ? 'bg-sky-200/50 dark:bg-sky-800/40' : 'hover:bg-slate-200/70 dark:hover:bg-slate-600/50'
          }`}
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
