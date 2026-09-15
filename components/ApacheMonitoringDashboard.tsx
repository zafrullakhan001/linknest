import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useDraggableResizableDialog } from '../hooks/useDraggableResizableDialog';
import { useMobile } from '../hooks/useMobile';
import {
  enableApacheMonitorOpcache,
  fetchApacheMonitorDashboard,
  purgeApacheMonitorLogs,
  restartApacheMonitorServer,
  type ApacheMonitorDashboard,
  type ApacheMonitorLogFile,
  type ApacheMonitorRequestRow,
  type ApacheMonitorScoreboard,
} from '../services/apacheMonitorService';

const GEOM_STORAGE_KEY = 'linknest_apache_monitor_geom';
const MAX_STORAGE_KEY = 'linknest_apache_monitor_maximized';

function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    }).format(n);
  } catch {
    return String(n);
  }
}

function formatCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      notation: 'compact',
      maximumFractionDigits: n >= 1_000_000 ? 2 : 1,
    }).format(n);
  } catch {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }
}

function availabilityClass(pct: number): string {
  if (pct >= 99) return 'text-emerald-600 dark:text-emerald-400';
  if (pct >= 90) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function secondsAgoLabel(unix: number, nowMs: number): string {
  const ago = Math.max(0, Math.floor((nowMs - unix * 1000) / 1000));
  if (ago <= 1) return 'just now';
  if (ago < 60) return `${ago} seconds ago`;
  const mins = Math.floor(ago / 60);
  return mins === 1 ? '1 minute ago' : `${mins} minutes ago`;
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}

const LastUpdatedLabel: React.FC<{ unix: number | null | undefined }> = ({ unix }) => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
      Last updated {unix ? secondsAgoLabel(unix, nowMs) : '—'}
    </span>
  );
};

function truncatePath(path: string, max = 48): string {
  if (path.length <= max) return path;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${path.slice(0, head)}…${path.slice(-tail)}`;
}

function barData(rows: ApacheMonitorRequestRow[]): Array<{ name: string; label: string; value: number }> {
  return rows.map((row) => ({
    name: row.path,
    label: truncatePath(row.path),
    value: row.count,
  }));
}

const Card: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({
  title,
  children,
  className = '',
}) => (
  <section
    className={`bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl shadow-sm p-4 flex flex-col min-h-[160px] ${className}`}
  >
    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
      {title}
    </h3>
    <div className="flex-1 min-h-0">{children}</div>
  </section>
);

type ChartTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: Array<{
    name?: string;
    value?: number | string;
    color?: string;
    payload?: { name?: string; value?: number };
  }>;
};

function formatTooltipValue(value: number | string | undefined): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return formatNumber(value, Number.isInteger(value) ? 0 : 2);
  }
  if (value === undefined || value === null) return '—';
  return String(value);
}

/** Light card tooltip — Recharts default item text stays dark and vanishes on a black box. */
const ApacheChartTooltip: React.FC<ChartTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const hasRowName = payload.some((entry) => typeof entry.payload?.name === 'string' && entry.payload.name);
  const heading =
    !hasRowName && typeof label === 'string' && label && payload.every((entry) => entry.name !== label)
      ? label
      : null;
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 shadow-lg max-w-[260px]">
      {heading ? (
        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-300 mb-1">{heading}</p>
      ) : null}
      <ul className="space-y-1">
        {payload.map((entry, index) => {
          const name = String(entry.payload?.name || entry.name || 'Value');
          const value = formatTooltipValue(
            typeof entry.value === 'number' || typeof entry.value === 'string'
              ? entry.value
              : entry.payload?.value
          );
          return (
            <li
              key={`${name}-${index}`}
              className="flex items-start gap-2 text-xs text-slate-800 dark:text-slate-100"
            >
              <span
                className="mt-1 w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: entry.color || '#64748b' }}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="break-all font-medium">{name}</span>
                <span className="text-slate-500 dark:text-slate-400"> · {value}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const EmptyChart: React.FC<{ message: string }> = ({ message }) => (
  <div className="h-full min-h-[120px] flex items-center justify-center text-xs text-slate-400 dark:text-slate-500 text-center px-4">
    {message}
  </div>
);

const RequestBarChart: React.FC<{ data: Array<{ name: string; label: string; value: number }>; color: string }> = ({
  data,
  color,
}) => {
  const chartHeight = Math.max(200, data.length * 26);
  return (
    <div className="max-h-[420px] overflow-y-auto">
      <div style={{ height: chartHeight, minHeight: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94a3b8" allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="label"
              width={220}
              tick={{ fontSize: 10 }}
              stroke="#94a3b8"
              interval={0}
            />
            <Tooltip
              content={<ApacheChartTooltip />}
              wrapperStyle={{ outline: 'none', zIndex: 20, background: 'transparent', border: 'none', boxShadow: 'none' }}
            />
            <Bar dataKey="value" name="count" fill={color} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const SectionTitle: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <h3
    className={`text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-5 mb-2 ${className}`}
  >
    {children}
  </h3>
);

function meterColor(percent: number, invertGoodHigh = false): string {
  if (invertGoodHigh) {
    if (percent >= 90) return 'bg-emerald-500';
    if (percent >= 70) return 'bg-amber-500';
    return 'bg-rose-500';
  }
  if (percent >= 90) return 'bg-rose-500';
  if (percent >= 75) return 'bg-amber-500';
  return 'bg-emerald-500';
}

const Meter: React.FC<{ percent: number; invertGoodHigh?: boolean }> = ({ percent, invertGoodHigh }) => (
  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 mt-3 overflow-hidden">
    <div
      className={`h-full rounded-full ${meterColor(percent, invertGoodHigh)}`}
      style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
    />
  </div>
);

const LogsCard: React.FC<{
  title: string;
  files: ApacheMonitorLogFile[];
  emptyMessage: string;
  note?: string | null;
  busy: boolean;
  onPurge: () => void;
  purgeLabel: string;
}> = ({ title, files, emptyMessage, note, busy, onPurge, purgeLabel }) => {
  const writable = files.some((file) => file.writable);
  return (
    <Card title={title}>
      {files.length > 0 ? (
        <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 mb-3">
          {files.map((file) => (
            <li key={file.path} className="flex justify-between gap-3">
              <span className="min-w-0 break-all" title={file.path}>
                {file.label}
              </span>
              <span className="tabular-nums font-semibold shrink-0">{file.sizeHuman}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400 mb-3">{emptyMessage}</p>
      )}
      {note ? <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">{note}</p> : null}
      <button
        type="button"
        onClick={onPurge}
        disabled={busy || !writable}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? 'Purging…' : purgeLabel}
      </button>
      <p className="text-[11px] text-slate-400 mt-2">Empties the files in place. Apache and PHP keep writing to the same paths.</p>
    </Card>
  );
};

const SCOREBOARD_LABELS: Array<{ key: keyof ApacheMonitorScoreboard; label: string }> = [
  { key: 'waiting', label: 'Waiting' },
  { key: 'sending', label: 'Sending' },
  { key: 'reading', label: 'Reading' },
  { key: 'keepalive', label: 'Keepalive' },
  { key: 'starting', label: 'Starting' },
  { key: 'closing', label: 'Closing' },
  { key: 'logging', label: 'Logging' },
  { key: 'graceful', label: 'Graceful' },
  { key: 'dns', label: 'DNS' },
  { key: 'open', label: 'Open slots' },
];

export const ApacheMonitoringDashboard: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const isMobile = useMobile(640);
  const [data, setData] = useState<ApacheMonitorDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMaximized, setIsMaximized] = useState(false);
  const [purging, setPurging] = useState<'apache' | 'php' | null>(null);
  const [purgeMessage, setPurgeMessage] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<'opcache' | 'restart' | null>(null);
  const cooldownUntilRef = useRef(0);

  const {
    modalRef,
    modalPosition,
    modalSize,
    isDragging,
    isResizing,
    handleDragStart,
    handleResizeStart,
    isReady,
  } = useDraggableResizableDialog({
    open: isOpen,
    defaultWidth: 1280,
    defaultHeight: 860,
    minWidth: 560,
    minHeight: 420,
    storageKey: GEOM_STORAGE_KEY,
  });

  useEffect(() => {
    if (!isOpen) return;
    try {
      setIsMaximized(localStorage.getItem(MAX_STORAGE_KEY) === '1');
    } catch {
      setIsMaximized(false);
    }
  }, [isOpen]);

  const toggleMaximize = () => {
    setIsMaximized((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MAX_STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const load = useCallback(async (opts?: { silent?: boolean; fresh?: boolean; signal?: AbortSignal }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    try {
      const next = await fetchApacheMonitorDashboard({
        signal: opts?.signal,
        fresh: opts?.fresh,
      });
      setData(next);
      setError(null);
    } catch (err) {
      if (isAbortError(err) || opts?.signal?.aborted) {
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load Apache monitoring');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const handlePurgeLogs = useCallback(
    async (target: 'apache' | 'php') => {
      const files = target === 'apache' ? data?.logs?.apache ?? [] : data?.logs?.php ?? [];
      const labels = files.map((file) => file.label).join(', ') || 'the detected log files';
      const kind = target === 'apache' ? 'Apache' : 'PHP';
      if (
        !window.confirm(
          `Empty ${kind} logs (${labels})? The files stay in place so the server can keep writing. This cannot be undone.`
        )
      ) {
        return;
      }
      setPurging(target);
      setPurgeMessage(null);
      try {
        const result = await purgeApacheMonitorLogs(target);
        const failed = result.purged.filter((row) => !row.ok);
        if (failed.length > 0 && result.purged.every((row) => !row.ok)) {
          setPurgeMessage(failed[0]?.error || `Could not empty ${kind} logs.`);
        } else if (failed.length > 0) {
          setPurgeMessage(
            `Freed ${result.freedHuman}. Some files could not be emptied: ${failed.map((row) => row.label).join(', ')}.`
          );
        } else {
          setPurgeMessage(`Emptied ${kind} logs and freed ${result.freedHuman}.`);
        }
        await load({ silent: true, fresh: true });
      } catch (err) {
        setPurgeMessage(err instanceof Error ? err.message : `Failed to empty ${kind} logs.`);
      } finally {
        setPurging(null);
      }
    },
    [data, load]
  );

  const handleEnableOpcache = useCallback(async () => {
    const ini = data?.actions?.phpIniPath || 'the loaded php.ini';
    if (
      !window.confirm(
        `Write recommended OPcache settings to ${ini}? A backup is saved as php.ini.linknest.bak if one does not already exist. Restart Apache afterwards for this to take effect.`
      )
    ) {
      return;
    }
    setActionBusy('opcache');
    setPurgeMessage(null);
    try {
      const result = await enableApacheMonitorOpcache();
      setPurgeMessage(result.message);
      await load({ silent: true, fresh: true });
    } catch (err) {
      setPurgeMessage(err instanceof Error ? err.message : 'Failed to update php.ini.');
    } finally {
      setActionBusy(null);
    }
  }, [data, load]);

  const handleRestartApache = useCallback(async () => {
    const bin = data?.actions?.apacheBinary || 'Apache';
    if (
      !window.confirm(
        `Restart Apache (${bin})? The site will drop for a few seconds. This dashboard may disconnect, then recover.`
      )
    ) {
      return;
    }
    setActionBusy('restart');
    setPurgeMessage(null);
    try {
      const result = await restartApacheMonitorServer();
      cooldownUntilRef.current = Date.now() + 12000;
      setPurgeMessage(result.message);
    } catch (err) {
      setPurgeMessage(err instanceof Error ? err.message : 'Failed to restart Apache.');
    } finally {
      setActionBusy(null);
    }
  }, [data]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;

    const clearTimer = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };

    const schedule = (ms: number) => {
      if (cancelled) return;
      clearTimer();
      timer = window.setTimeout(() => {
        void tick(true);
      }, ms);
    };

    const tick = async (silent: boolean) => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      const wait = cooldownUntilRef.current - Date.now();
      if (wait > 0) {
        schedule(Math.min(wait, 5000));
        return;
      }
      controller?.abort();
      const ac = new AbortController();
      controller = ac;
      await load({ silent, signal: ac.signal });
      if (cancelled || ac.signal.aborted) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      schedule(5000);
    };

    void tick(false);

    const onVisibility = () => {
      if (cancelled) return;
      if (document.visibilityState === 'hidden') {
        clearTimer();
        controller?.abort();
        controller = null;
        return;
      }
      void tick(true);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearTimer();
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isOpen, load]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const history = data?.history ?? [];
  const workerChart = useMemo(
    () =>
      history.map((row) => ({
        ...row,
        busy: row.busy ?? 0,
        idle: row.idle ?? 0,
      })),
    [history]
  );
  const trafficChart = useMemo(
    () =>
      history.map((row) => ({
        ...row,
        reqPerSec: row.reqPerSec ?? 0,
        accesses: row.accesses ?? 0,
        kBytes: row.kBytes ?? 0,
      })),
    [history]
  );
  const bytesChart = useMemo(
    () =>
      history.map((row) => ({
        ...row,
        bytesPerReq: row.bytesPerReq ?? 0,
        bytesPerSec: row.bytesPerSec ?? 0,
      })),
    [history]
  );

  const failedBars = useMemo(() => barData(data?.requests.topFailed ?? []), [data]);
  const successBars = useMemo(() => barData(data?.requests.topSuccess ?? []), [data]);
  const opcacheHitPie = useMemo(() => {
    const stats = data?.opcache?.statistics;
    if (!stats || stats.hits + stats.misses <= 0) return [];
    return [
      { name: 'hits', value: stats.hits },
      { name: 'misses', value: stats.misses },
    ];
  }, [data]);

  if (!isOpen || !isReady) return null;

  const current = data?.current;
  const server = data?.server;
  const presence = data?.presence;
  const opcache = data?.opcache;
  const php = data?.php;
  const sqlite = data?.sqlite;
  const disk = data?.disk;
  const actions = data?.actions;
  const apacheLogs = data?.logs?.apache ?? [];
  const phpLogs = data?.logs?.php ?? [];
  const systemLoad =
    php?.load ||
    (server?.load1 != null && server.load1 >= 0
      ? { load1: server.load1, load5: server.load5 ?? 0, load15: server.load15 ?? 0 }
      : null);
  const canMove = !isMobile && !isMaximized;

  return createPortal(
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm pointer-events-auto"
        onClick={onClose}
      />
      <div
        ref={modalRef}
        className={`relative bg-slate-50 dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden pointer-events-auto ${
          isMaximized || isMobile ? 'rounded-none' : 'rounded-2xl'
        } ${isDragging || isResizing ? 'will-change-transform select-none' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="apache-monitor-title"
        onClick={(e) => e.stopPropagation()}
        style={
          isMaximized || isMobile
            ? {
                position: 'fixed',
                left: 0,
                top: 0,
                width: '100vw',
                height: '100dvh',
                maxWidth: '100vw',
                maxHeight: '100dvh',
              }
            : {
                position: 'fixed',
                left: modalPosition.x,
                top: modalPosition.y,
                width: modalSize.width,
                height: modalSize.height,
                transition: isDragging || isResizing ? 'none' : undefined,
              }
        }
      >
        <header
          onMouseDown={canMove ? handleDragStart : undefined}
          onDoubleClick={() => {
            if (!isMobile) toggleMaximize();
          }}
          className={`flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 shrink-0 ${
            canMove ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : ''
          }`}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 id="apache-monitor-title" className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                Apache Monitoring
              </h2>
              <LastUpdatedLabel unix={data?.lastUpdated} />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {isMobile
                ? 'Realtime Apache, PHP, and SQLite'
                : 'Drag header to move · Resize corner · Double-click to maximize'}
              {server?.version ? ` · ${server.version}` : ''}
              {server?.mpm ? ` · MPM ${server.mpm}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void load({ silent: true, fresh: true })}
              onMouseDown={(e) => e.stopPropagation()}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600"
            >
              Refresh
            </button>
            {!isMobile && (
              <button
                type="button"
                onClick={toggleMaximize}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
                aria-label={isMaximized ? 'Restore' : 'Maximize'}
                title={isMaximized ? 'Restore' : 'Maximize'}
              >
                {isMaximized ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M5 4a1 1 0 00-1 1v3h2V6h2V4H5zm8 0v2h2v2h2V5a1 1 0 00-1-1h-3zM4 12v3a1 1 0 001 1h3v-2H6v-2H4zm12 0h-2v2h-2v2h3a1 1 0 001-1v-3z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M4 4a1 1 0 011-1h10a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V4zm2 1v8h8V5H6z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
              aria-label="Close Apache monitoring"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {loading && !data ? (
            <div className="h-full min-h-[240px] flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
            </div>
          ) : error && !data ? (
            <div className="max-w-xl mx-auto mt-10 rounded-xl border border-rose-200 dark:border-rose-900 bg-white dark:bg-slate-800 p-5 text-sm text-rose-700 dark:text-rose-300">
              {error}
            </div>
          ) : (
            <>
              {data?.setupHint ? (
                <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 whitespace-pre-line">
                  {data.setupHint}
                </div>
              ) : null}
              {purgeMessage ? (
                <div className="mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                  {purgeMessage}
                </div>
              ) : null}

              <SectionTitle className={data?.setupHint ? '' : 'mt-0'}>Apache</SectionTitle>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                <Card title="Online users">
                  <p className="text-xs text-slate-400 mb-1">online now</p>
                  <p className="text-4xl font-bold tabular-nums text-slate-900 dark:text-white inline-flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" aria-hidden />
                    {formatNumber(presence?.count ?? 0)}
                    <span className="text-sm font-medium text-slate-400">count</span>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    {formatNumber(presence?.signedIn ?? 0)} signed in
                    {' · '}
                    {formatNumber(presence?.guests ?? 0)}{' '}
                    {(presence?.guests ?? 0) === 1 ? 'guest' : 'guests'}
                  </p>
                </Card>

                <Card title="Availability">
                  <p
                    className={`text-4xl font-bold tabular-nums ${
                      data?.availabilityPercent == null
                        ? 'text-slate-400 dark:text-slate-500'
                        : availabilityClass(data.availabilityPercent)
                    }`}
                  >
                    {data?.availabilityPercent == null ? '—' : `${formatNumber(data.availabilityPercent, 2)}%`}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{data?.instance || 'instance-1'}</p>
                </Card>

                <Card title="Total number of requests processed">
                  <p className="text-xs text-slate-400 mb-1">total_accesses</p>
                  <p className="text-4xl font-bold tabular-nums text-slate-900 dark:text-white">
                    {formatCompact(current?.totalAccesses)}
                    <span className="text-sm font-medium text-slate-400 ml-1">count</span>
                  </p>
                </Card>

                <Card title="Busy & Idle workers" className="md:col-span-2 xl:col-span-1">
                  {workerChart.length > 1 ? (
                    <div className="h-[140px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={workerChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#94a3b8" minTickGap={24} />
                          <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" allowDecimals={false} />
                          <Tooltip
                            content={<ApacheChartTooltip />}
                            wrapperStyle={{ outline: 'none', zIndex: 20, background: 'transparent', border: 'none', boxShadow: 'none' }}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="busy" name="busy_workers" stroke="#0f766e" dot={false} strokeWidth={2} isAnimationActive={false} />
                          <Line type="monotone" dataKey="idle" name="idle_workers" stroke="#22c55e" dot={false} strokeWidth={2} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyChart message="Collecting worker samples… keep this dashboard open." />
                  )}
                </Card>

                <Card title="Uptime">
                  <p className="text-xs text-slate-400 mb-1">uptime</p>
                  <p className="text-4xl font-bold tabular-nums text-slate-900 dark:text-white leading-tight">
                    {server?.uptimeLabel || '—'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{data?.instance || 'instance-1'}</p>
                </Card>

                <Card title="Request/sec, Access & Data Transferred" className="md:col-span-2">
                  {trafficChart.length > 1 ? (
                    <div className="h-[160px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trafficChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#94a3b8" minTickGap={24} />
                          <YAxis yAxisId="left" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                          <Tooltip
                            content={<ApacheChartTooltip />}
                            wrapperStyle={{ outline: 'none', zIndex: 20, background: 'transparent', border: 'none', boxShadow: 'none' }}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line yAxisId="left" type="monotone" dataKey="reqPerSec" name="req/sec" stroke="#3b82f6" dot={false} strokeWidth={2} isAnimationActive={false} />
                          <Line yAxisId="right" type="monotone" dataKey="kBytes" name="kBytes" stroke="#22c55e" dot={false} strokeWidth={2} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyChart message="Traffic history appears after a few refreshes." />
                  )}
                </Card>

                <Card title="Total Failed Requests">
                  <p className="text-xs text-slate-400 mb-1">Count</p>
                  <p className="text-5xl font-bold tabular-nums text-slate-900 dark:text-white text-center py-2">
                    {formatNumber(data?.requests.failedTotal ?? 0)}
                  </p>
                  <p className="text-xs text-center text-slate-500">from recent access log</p>
                </Card>

                <Card title="Idle workers">
                  <p className="text-xs text-slate-400 mb-1">idle_workers</p>
                  <p className="text-4xl font-bold tabular-nums text-slate-900 dark:text-white">
                    {formatNumber(current?.idleWorkers)}
                    <span className="text-sm font-medium text-slate-400 ml-1">count</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    busy {formatNumber(current?.busyWorkers)}
                    {current?.scoreboardCounts ? ` · waiting ${formatNumber(current.scoreboardCounts.waiting)}` : ''}
                  </p>
                </Card>

                <Card title="Worker utilization">
                  <p className="text-xs text-slate-400 mb-1">busy / pool</p>
                  <p className="text-4xl font-bold tabular-nums text-slate-900 dark:text-white">
                    {formatNumber(current?.workerUtilizationPercent ?? 0, 1)}%
                  </p>
                  <Meter percent={current?.workerUtilizationPercent ?? 0} />
                  <p className="text-xs text-slate-500 mt-2">
                    pool {formatNumber(current?.workerPool)}
                    {current?.connsTotal != null ? ` · conns ${formatNumber(current.connsTotal)}` : ''}
                  </p>
                </Card>

                <Card title="Avg request duration">
                  <p className="text-xs text-slate-400 mb-1">duration_per_req</p>
                  <p className="text-4xl font-bold tabular-nums text-slate-900 dark:text-white">
                    {current?.durationPerReq != null ? formatNumber(current.durationPerReq, 1) : '—'}
                    <span className="text-sm font-medium text-slate-400 ml-1">ms</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    {formatNumber(current?.bytesPerReq, 0)} bytes/req
                  </p>
                </Card>

                {systemLoad ? (
                  <Card title="System load">
                    <p className="text-4xl font-bold tabular-nums text-slate-900 dark:text-white">
                      {formatNumber(systemLoad.load1, 2)}
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      1m {formatNumber(systemLoad.load1, 2)} · 5m {formatNumber(systemLoad.load5, 2)} · 15m{' '}
                      {formatNumber(systemLoad.load15, 2)}
                    </p>
                  </Card>
                ) : null}

                <Card title="Worker scoreboard">
                  <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                    {SCOREBOARD_LABELS.filter((row) => (current?.scoreboardCounts?.[row.key] ?? 0) > 0).map((row) => (
                      <li key={row.key} className="flex justify-between gap-3">
                        <span>{row.label}</span>
                        <span className="tabular-nums font-semibold">{formatNumber(current?.scoreboardCounts?.[row.key])}</span>
                      </li>
                    ))}
                    {(current?.scoreboardCounts == null ||
                      SCOREBOARD_LABELS.every((row) => (current.scoreboardCounts[row.key] ?? 0) === 0)) && (
                      <li className="text-slate-400">No worker states reported.</li>
                    )}
                  </ul>
                </Card>

                <Card title="Bytes/Req vs Bytes/Sec" className="md:col-span-2 xl:col-span-1">
                  {bytesChart.length > 1 ? (
                    <div className="h-[160px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={bytesChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#94a3b8" minTickGap={24} />
                          <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                          <Tooltip
                            content={<ApacheChartTooltip />}
                            wrapperStyle={{ outline: 'none', zIndex: 20, background: 'transparent', border: 'none', boxShadow: 'none' }}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="bytesPerReq" name="bytes_per_req" stroke="#22c55e" dot={false} strokeWidth={2} isAnimationActive={false} />
                          <Line type="monotone" dataKey="bytesPerSec" name="bytes_per_sec" stroke="#38bdf8" dot={false} strokeWidth={2} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyChart message="Byte rates will chart as samples arrive." />
                  )}
                </Card>

                <Card title="Top 20 Failed Requests" className="md:col-span-2 xl:col-span-3">
                  {failedBars.length > 0 ? (
                    <RequestBarChart data={failedBars} color="#e85d4c" />
                  ) : (
                    <EmptyChart message="No recent 4xx/5xx requests in the access log tail." />
                  )}
                </Card>

                <Card title="Top 50 Successful Requests - Apache Access Logs" className="md:col-span-2 xl:col-span-3">
                  {successBars.length > 0 ? (
                    <RequestBarChart data={successBars} color="#10b981" />
                  ) : (
                    <EmptyChart message="No recent successful requests parsed from the access log." />
                  )}
                </Card>

                <LogsCard
                  title="Apache logs"
                  files={apacheLogs}
                  emptyMessage="No Apache access or error log files were found."
                  busy={purging === 'apache'}
                  onPurge={() => void handlePurgeLogs('apache')}
                  purgeLabel="Purge Apache logs"
                />
              </div>

              <SectionTitle>PHP</SectionTitle>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                <Card title="Fix php.ini / restart Apache" className="md:col-span-2 xl:col-span-3">
                  <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
                    Enable OPcache in the php.ini Apache is using, then restart the web server so the change loads.
                    {actions?.phpIniPath ? (
                      <>
                        {' '}
                        Loaded ini: <span className="break-all font-medium">{actions.phpIniPath}</span>
                      </>
                    ) : (
                      ' Could not detect php.ini.'
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleEnableOpcache()}
                      disabled={actionBusy !== null || !actions?.canEnableOpcache}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {actionBusy === 'opcache' ? 'Updating php.ini…' : 'Enable OPcache in php.ini'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRestartApache()}
                      disabled={actionBusy !== null || !actions?.canRestartApache}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {actionBusy === 'restart' ? 'Scheduling restart…' : 'Restart Apache'}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">
                    {actions?.canRestartApache
                      ? `Restart uses ${actions.apacheBinary || 'the local Apache binary'} after a short delay so this request can finish.`
                      : 'Apache binary was not found. Discovery looks at the running process, ServerRoot, Windows service, PATH, and nearby folders. Set LINKNEST_APACHE_HTTPD to the full httpd.exe / apachectl path if it still cannot be located.'}
                    {!actions?.phpIniWritable && actions?.phpIniPath
                      ? ' php.ini is not writable by the Apache account.'
                      : ''}
                  </p>
                </Card>

                <Card title="PHP memory">
                  <p className="text-xs text-slate-400 mb-1">
                    {php?.sapi} · {php?.version}
                  </p>
                  <p className="text-4xl font-bold tabular-nums text-slate-900 dark:text-white">
                    {php?.memoryUsedPercent != null ? `${formatNumber(php.memoryUsedPercent, 1)}%` : php?.memoryUsedHuman || '—'}
                  </p>
                  {php?.memoryUsedPercent != null ? <Meter percent={php.memoryUsedPercent} /> : null}
                  <p className="text-xs text-slate-500 mt-2">
                    {php?.memoryUsedHuman} used · peak {php?.memoryPeakHuman} · limit {php?.memoryLimitHuman}
                  </p>
                </Card>

                <Card title="OPcache hit rate">
                  {opcache?.active && opcache.statistics ? (
                    <>
                      <p className={`text-4xl font-bold tabular-nums ${availabilityClass(opcache.statistics.hitRatePercent)}`}>
                        {formatNumber(opcache.statistics.hitRatePercent, 2)}%
                      </p>
                      <Meter percent={opcache.statistics.hitRatePercent} invertGoodHigh />
                      <p className="text-xs text-slate-500 mt-2">
                        {formatCompact(opcache.statistics.hits)} hits · {formatCompact(opcache.statistics.misses)} misses
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-amber-700 dark:text-amber-300">{opcache?.message || 'OPcache is not active.'}</p>
                  )}
                </Card>

                <Card title="OPcache memory">
                  {opcache?.memory ? (
                    <>
                      <p className="text-4xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatNumber(opcache.memory.usedPercent, 1)}%
                      </p>
                      <Meter percent={opcache.memory.usedPercent} />
                      <p className="text-xs text-slate-500 mt-2">
                        {opcache.memory.usedHuman} used / {opcache.memory.totalHuman}
                        {opcache.memory.wastedBytes > 0 ? ` · wasted ${opcache.memory.wastedHuman}` : ''}
                      </p>
                    </>
                  ) : (
                    <EmptyChart message="OPcache memory stats unavailable." />
                  )}
                </Card>

                <Card title="Cached scripts">
                  {opcache?.statistics ? (
                    <>
                      <p className="text-4xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatCompact(opcache.statistics.cachedScripts)}
                      </p>
                      <p className="text-xs text-slate-500 mt-2">
                        keys {formatCompact(opcache.statistics.cachedKeys)} / {formatCompact(opcache.statistics.maxCachedKeys)}
                        {' · '}
                        {formatNumber(opcache.statistics.keysPercent, 1)}%
                      </p>
                      {opcache.config ? (
                        <p className="text-[11px] text-slate-400 mt-1">
                          {opcache.config.memoryConsumptionMb} MB · max {formatCompact(opcache.config.maxAcceleratedFiles)} files
                          {opcache.config.validateTimestamps ? ' · timestamps on' : ''}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <EmptyChart message="No cached-script counts yet." />
                  )}
                </Card>

                <Card title="Hits vs misses">
                  {opcacheHitPie.length > 0 ? (
                    <div className="h-[180px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={opcacheHitPie} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2} isAnimationActive={false}>
                            <Cell fill="#10b981" />
                            <Cell fill="#f59e0b" />
                          </Pie>
                          <Tooltip
                            content={<ApacheChartTooltip />}
                            wrapperStyle={{ outline: 'none', zIndex: 20, background: 'transparent', border: 'none', boxShadow: 'none' }}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyChart message="OPcache hit/miss data will appear when the cache is active." />
                  )}
                </Card>

                <Card title="Interned strings">
                  {opcache?.interned ? (
                    <>
                      <p className="text-4xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatNumber(opcache.interned.usedPercent, 1)}%
                      </p>
                      <Meter percent={opcache.interned.usedPercent} />
                      <p className="text-xs text-slate-500 mt-2">
                        {opcache.interned.usedHuman} / {opcache.interned.bufferHuman}
                      </p>
                    </>
                  ) : (
                    <EmptyChart message="Interned-string buffer stats unavailable." />
                  )}
                </Card>

                <Card title="OPcache restarts">
                  {opcache?.statistics ? (
                    <>
                      <p className="text-4xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatNumber(
                          opcache.statistics.oomRestarts +
                            opcache.statistics.hashRestarts +
                            opcache.statistics.manualRestarts
                        )}
                      </p>
                      <p className="text-xs text-slate-500 mt-2">
                        OOM {formatNumber(opcache.statistics.oomRestarts)} · hash {formatNumber(opcache.statistics.hashRestarts)} · manual{' '}
                        {formatNumber(opcache.statistics.manualRestarts)}
                      </p>
                      {opcache.jit ? (
                        <p className="text-[11px] text-slate-400 mt-1">
                          JIT {opcache.jit.enabled ? (opcache.jit.on ? 'on' : 'enabled') : 'off'}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <EmptyChart message="Restart counters unavailable." />
                  )}
                </Card>

                <LogsCard
                  title="PHP logs"
                  files={phpLogs}
                  emptyMessage="No PHP error log file was found."
                  note={data?.logs?.phpNote}
                  busy={purging === 'php'}
                  onPurge={() => void handlePurgeLogs('php')}
                  purgeLabel="Purge PHP logs"
                />
              </div>

              <SectionTitle>SQLite</SectionTitle>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                <Card title="SQLite database">
                  <p className="text-4xl font-bold tabular-nums text-slate-900 dark:text-white">
                    {sqlite?.sizeHuman || '—'}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    journal {sqlite?.journalMode || '—'}
                    {sqlite && sqlite.walBytes > 0 ? ` · WAL ${sqlite.walHuman}` : ''}
                  </p>
                </Card>

                <Card title="Disk (data volume)">
                  <p className="text-4xl font-bold tabular-nums text-slate-900 dark:text-white">
                    {formatNumber(disk?.usedPercent ?? 0, 1)}%
                  </p>
                  <Meter percent={disk?.usedPercent ?? 0} />
                  <p className="text-xs text-slate-500 mt-2">
                    {disk?.usedHuman} used / {disk?.totalHuman} · {disk?.freeHuman} free
                  </p>
                </Card>
              </div>
            </>
          )}
        </div>
        {canMove ? (
          <div
            onMouseDown={handleResizeStart}
            className={`absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize flex items-end justify-end p-0.5 rounded-br-2xl z-10 ${
              isResizing ? 'bg-brand-500/20' : 'hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
            }`}
            title="Resize"
            aria-label="Resize window"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" className="text-slate-400 dark:text-slate-500" aria-hidden>
              <path
                d="M10 2L2 10M10 6L6 10M10 10L10 10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
};
