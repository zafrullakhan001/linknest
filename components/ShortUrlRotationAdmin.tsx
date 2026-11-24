import React, { useCallback, useEffect, useState } from 'react';
import {
  getShortUrlRotationOverview,
  rotateAllShortUrls,
  type ShortUrlRotationByType,
  type ShortUrlRotationLog,
  type ShortUrlRotationStats,
} from '../services/shortUrlService';

const ADMIN_SECTION_CARD =
  'bg-white dark:bg-slate-800 border border-sky-200/70 dark:border-sky-800/40 rounded-xl overflow-hidden shadow-sm shadow-sky-500/5';
const ADMIN_SECTION_HEADER =
  'bg-gradient-to-r from-sky-50 via-teal-50/80 to-cyan-50/60 dark:from-sky-950/40 dark:via-teal-950/30 dark:to-cyan-950/20 border-b border-sky-100 dark:border-sky-800/40 px-6 py-5';
const ADMIN_SECTION_TITLE =
  'text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2';
const ADMIN_SECTION_SUBTITLE = 'text-sm text-sky-800/70 dark:text-sky-200/70 mt-0.5';

function formatWhen(unix: number | null | undefined): string {
  if (!unix) return '—';
  try {
    return new Date(unix * 1000).toLocaleString();
  } catch {
    return String(unix);
  }
}

function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = ((ms % 60_000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

function formatAge(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return '—';
  if (seconds < 60) return 'just now';
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    return `${m} min ago`;
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return h > 0 ? `${d}d ${h}h ago` : `${d}d ago`;
}

function formatCount(n: number | null | undefined): string {
  return Number(n || 0).toLocaleString();
}

function typeBreakdown(byType: ShortUrlRotationByType | undefined): string {
  if (!byType) return '—';
  const parts = [
    byType.tile ? `${formatCount(byType.tile)} spaces` : '',
    byType.tab ? `${formatCount(byType.tab)} tabs` : '',
    byType.section ? `${formatCount(byType.section)} sections` : '',
    byType.link ? `${formatCount(byType.link)} links` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'none';
}

const StatCard: React.FC<{
  label: string;
  value: string;
  hint?: string;
  accent?: 'sky' | 'orange' | 'emerald' | 'slate';
}> = ({ label, value, hint, accent = 'sky' }) => {
  const ring =
    accent === 'orange'
      ? 'border-orange-200/80 dark:border-orange-900/40'
      : accent === 'emerald'
        ? 'border-emerald-200/80 dark:border-emerald-900/40'
        : accent === 'slate'
          ? 'border-slate-200 dark:border-slate-700'
          : 'border-sky-100 dark:border-sky-900/40';
  const valueColor =
    accent === 'orange'
      ? 'text-orange-600 dark:text-orange-400'
      : accent === 'emerald'
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-slate-900 dark:text-white';
  return (
    <div className={`rounded-xl border ${ring} bg-gradient-to-br from-sky-50/40 to-white dark:from-sky-950/20 dark:to-slate-800 p-4`}>
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${valueColor}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div> : null}
    </div>
  );
};

export const ShortUrlRotationAdmin: React.FC = () => {
  const [stats, setStats] = useState<ShortUrlRotationStats | null>(null);
  const [logs, setLogs] = useState<ShortUrlRotationLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState<ShortUrlRotationLog | null>(null);

  const load = useCallback(async (nextPage = page) => {
    try {
      setLoading(true);
      setError('');
      const overview = await getShortUrlRotationOverview({ page: nextPage, perPage });
      setStats(overview.stats);
      setLogs(overview.logs);
      setTotal(overview.total);
      setPage(overview.page);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load short URL rotation stats');
    } finally {
      setLoading(false);
    }
  }, [page, perPage]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const handleRotate = async () => {
    const active = stats?.active.total ?? 0;
    const ok = window.confirm(
      active > 0
        ? `Rotate all ${active.toLocaleString()} active short URLs?\n\nEvery current /s/… link will stop working. People who bookmarked them will need to open this app to get the new ones. Recycled codes never reveal the real destination.`
        : 'There are no active short URLs to rotate. Run anyway to record a log entry?'
    );
    if (!ok) return;
    try {
      setRotating(true);
      setError('');
      const result = await rotateAllShortUrls();
      setLastResult(result.run);
      if (result.stats) setStats(result.stats);
      if (result.run.status === 'failed') {
        setError(result.run.errorMessage || 'Failed to rotate short URLs');
      }
      setPage(1);
      const overview = await getShortUrlRotationOverview({ page: 1, perPage });
      setLogs(overview.logs);
      setTotal(overview.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to rotate short URLs');
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h3 className={ADMIN_SECTION_TITLE}><span aria-hidden>🔁</span> Short URL rotation</h3>
              <p className={ADMIN_SECTION_SUBTITLE}>
                Issue new fictitious <code className="text-xs">/s/…</code> aliases for every space, tab, section, and link.
                Old aliases stop working and never reveal the real PeopleSoft / Workday URL.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleRotate()}
              disabled={rotating || loading}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-orange-500/20"
            >
              {rotating ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Rotating…
                </>
              ) : (
                <>Rotate all short URLs</>
              )}
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {error ? (
            <div className="rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
              {error}
            </div>
          ) : null}

          {lastResult ? (
            <div className={`rounded-lg border px-4 py-3 text-sm ${
              lastResult.status === 'failed'
                ? 'border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200'
                : 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
            }`}>
              {lastResult.status === 'failed' ? (
                <>Rotation failed{lastResult.errorMessage ? `: ${lastResult.errorMessage}` : '.'}</>
              ) : lastResult.rotatedCount === 0 ? (
                <>No active short URLs were rotated. Logged at {formatWhen(lastResult.finishedAt)} ({formatDurationMs(lastResult.durationMs)}).</>
              ) : (
                <>
                  Rotated <strong>{formatCount(lastResult.rotatedCount)}</strong> short URL{lastResult.rotatedCount === 1 ? '' : 's'}
                  {' '}in {formatDurationMs(lastResult.durationMs)}.
                  {' '}{typeBreakdown(lastResult.byType)}.
                  Old bookmarks to previous <code>/s/…</code> codes now stop at the recycled page.
                </>
              )}
            </div>
          ) : null}

          {loading && !stats ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
            </div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  label="Active aliases"
                  value={formatCount(stats.active.total)}
                  hint={typeBreakdown(stats.active)}
                  accent="orange"
                />
                <StatCard
                  label="Last rotation"
                  value={stats.lastRun ? formatCount(stats.lastRun.rotatedCount) : 'Never'}
                  hint={
                    stats.lastRun
                      ? `${formatWhen(stats.lastRun.finishedAt)} · ${formatDurationMs(stats.lastRun.durationMs)} · ${stats.lastRun.rotatedByUsername || 'unknown'}`
                      : 'No global rotation has been run yet'
                  }
                  accent="emerald"
                />
                <StatCard
                  label="Lifetime rotated"
                  value={formatCount(stats.lifetimeRotated)}
                  hint={
                    stats.lifetimeRuns
                      ? `${formatCount(stats.lifetimeRuns)} run${stats.lifetimeRuns === 1 ? '' : 's'} · avg ${formatDurationMs(stats.avgDurationMs)}`
                      : 'Will accumulate as you rotate'
                  }
                />
                <StatCard
                  label="Spaces showing aliases"
                  value={formatCount(stats.spacesShowingShortUrls)}
                  hint={`${formatCount(stats.revoked)} retired codes on file`}
                  accent="slate"
                />
              </div>

              <div className="rounded-xl border border-sky-100 dark:border-sky-900/40 bg-slate-50/60 dark:bg-slate-900/30 p-4 text-sm text-slate-600 dark:text-slate-300 space-y-1">
                <div>
                  <span className="font-medium text-slate-800 dark:text-slate-100">Newest active alias:</span>{' '}
                  {stats.newestActiveAt ? `${formatWhen(stats.newestActiveAt)} (${formatAge(stats.newestActiveAgeSeconds)})` : '—'}
                </div>
                <div>
                  <span className="font-medium text-slate-800 dark:text-slate-100">Oldest active alias:</span>{' '}
                  {stats.oldestActiveAt ? `${formatWhen(stats.oldestActiveAt)} (${formatAge(stats.oldestActiveAgeSeconds)})` : '—'}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">
                  Viewers only see these aliases when a space has Short URLs turned on. Recycle a single item from the space editor, or rotate everything here.
                </p>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <h3 className={ADMIN_SECTION_TITLE}><span aria-hidden>📋</span> Rotation log</h3>
          <p className={ADMIN_SECTION_SUBTITLE}>
            Each global rotate is stored with start/finish time, duration, who ran it, and how many aliases changed.
          </p>
        </div>
        <div className="p-6">
          {loading && logs.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-500"></div>
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
              No rotation runs yet. Use <strong>Rotate all short URLs</strong> to create the first log entry.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-sky-100 dark:border-sky-900/40">
                <table className="min-w-full text-sm">
                  <thead className="bg-sky-50/80 dark:bg-sky-950/30 text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Started</th>
                      <th className="px-3 py-2.5 font-semibold">Finished</th>
                      <th className="px-3 py-2.5 font-semibold">Duration</th>
                      <th className="px-3 py-2.5 font-semibold">Rotated</th>
                      <th className="px-3 py-2.5 font-semibold">Breakdown</th>
                      <th className="px-3 py-2.5 font-semibold">By</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sky-100 dark:divide-sky-900/30">
                    {logs.map((log) => (
                      <tr key={log.id} className="bg-white dark:bg-slate-800">
                        <td className="px-3 py-2.5 whitespace-nowrap text-slate-700 dark:text-slate-200">{formatWhen(log.startedAt)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-slate-700 dark:text-slate-200">{formatWhen(log.finishedAt)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-slate-700 dark:text-slate-200">{formatDurationMs(log.durationMs)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap tabular-nums font-semibold text-orange-600 dark:text-orange-400">
                          {formatCount(log.rotatedCount)}
                          {log.activeBefore !== log.rotatedCount ? (
                            <span className="ml-1 font-normal text-xs text-slate-400">/ {formatCount(log.activeBefore)}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 min-w-[12rem]">{typeBreakdown(log.byType)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-slate-700 dark:text-slate-200">
                          <div>{log.rotatedByUsername || '—'}</div>
                          {log.ipAddress ? <div className="text-[11px] text-slate-400 font-mono">{log.ipAddress}</div> : null}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                            log.status === 'failed'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                          }`}>
                            {log.status}
                          </span>
                          {log.skippedCount > 0 ? (
                            <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">{log.skippedCount} skipped</div>
                          ) : null}
                          {log.errorMessage ? (
                            <div className="text-[11px] text-rose-500 mt-0.5 max-w-[14rem] truncate" title={log.errorMessage}>{log.errorMessage}</div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 ? (
                <div className="flex items-center justify-between mt-4 text-sm text-slate-600 dark:text-slate-300">
                  <span>
                    {formatCount(total)} run{total === 1 ? '' : 's'}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 rounded-lg border border-sky-200 dark:border-sky-800 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="tabular-nums">
                      {page} / {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={page >= totalPages || loading}
                      onClick={() => setPage((p) => p + 1)}
                      className="px-3 py-1.5 rounded-lg border border-sky-200 dark:border-sky-800 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-400">Keeping the latest 100 runs.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
