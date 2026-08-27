import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useMobile } from '../hooks/useMobile';
import { RechartsAreaChart, RechartsBarChart } from './RechartsCharts';
import {
  getVisitStatsDashboard,
  VisitStatsDashboard,
  VisitStatsSpaceRow,
} from '../services/visitStatsService';

const ADMIN_SECTION_CARD =
  'bg-white dark:bg-slate-800 border border-sky-200/70 dark:border-sky-800/40 rounded-xl overflow-hidden shadow-sm shadow-sky-500/5';
const ADMIN_SECTION_HEADER =
  'bg-gradient-to-r from-sky-50 via-teal-50/80 to-cyan-50/60 dark:from-sky-950/40 dark:via-teal-950/30 dark:to-cyan-950/20 border-b border-sky-100 dark:border-sky-800/40 px-6 py-5';
const ADMIN_SECTION_TITLE =
  'text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2';
const ADMIN_SECTION_SUBTITLE = 'text-sm text-sky-800/70 dark:text-sky-200/70 mt-0.5';
const ADMIN_PRIMARY_BTN =
  'bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors shadow-sm shadow-sky-500/20';

type SortKey = 'hitCount' | 'uniqueVisitors' | 'title' | 'lastVisit';
type SortDir = 'asc' | 'desc';

function formatNumber(n: number): string {
  try {
    return new Intl.NumberFormat().format(n);
  } catch {
    return String(n);
  }
}

/** Compact labels for million-scale counters (e.g. 1.2M). */
function formatCompact(n: number): string {
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

function formatTime(unix: number | null): string {
  if (!unix) return '—';
  try {
    return new Date(unix * 1000).toLocaleString();
  } catch {
    return String(unix);
  }
}

function StatCard({
  label,
  value,
  hint,
  accent = 'sky',
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: 'sky' | 'teal' | 'cyan' | 'indigo';
}) {
  const accents = {
    sky: 'from-sky-50/80 to-white dark:from-sky-950/30 dark:to-slate-800 border-sky-100 dark:border-sky-900/40',
    teal: 'from-teal-50/80 to-white dark:from-teal-950/30 dark:to-slate-800 border-teal-100 dark:border-teal-900/40',
    cyan: 'from-cyan-50/80 to-white dark:from-cyan-950/30 dark:to-slate-800 border-cyan-100 dark:border-cyan-900/40',
    indigo:
      'from-indigo-50/80 to-white dark:from-indigo-950/30 dark:to-slate-800 border-indigo-100 dark:border-indigo-900/40',
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-4 ${accents[accent]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
      {hint ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

export const VisitsDashboard: React.FC = () => {
  const isMobile = useMobile();
  const [data, setData] = useState<VisitStatsDashboard | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('hitCount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const result = await getVisitStatsDashboard(days);
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load visit statistics');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredSpaces = useMemo(() => {
    const spaces = data?.spaces ?? [];
    const q = search.trim().toLowerCase();
    let list = spaces;
    if (q) {
      list = spaces.filter((s) => {
        const hay = `${s.title} ${s.emoji ?? ''} ${s.group ?? ''} ${s.visibility}`.toLowerCase();
        return hay.includes(q);
      });
    }
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'title') {
        cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      } else if (sortKey === 'lastVisit') {
        cmp = (a.lastVisit ?? 0) - (b.lastVisit ?? 0);
      } else {
        cmp = (a[sortKey] as number) - (b[sortKey] as number);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [data?.spaces, search, sortKey, sortDir]);

  const topChartData = useMemo(() => {
    const top = [...(data?.spaces ?? [])]
      .filter((s) => !s.deleted && s.hitCount > 0)
      .slice(0, 10)
      .map((s) => ({
        name: s.title.length > 18 ? `${s.title.slice(0, 16)}…` : s.title,
        hits: s.hitCount,
      }));
    return top;
  }, [data?.spaces]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'title' ? 'asc' : 'desc');
    }
  };

  const sortMarker = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  const maxHits = useMemo(() => {
    if (filteredSpaces.length === 0) return 1;
    return Math.max(1, ...filteredSpaces.map((s) => s.hitCount));
  }, [filteredSpaces]);

  const renderStatusBadges = (space: VisitStatsSpaceRow) => (
    <span className="inline-flex flex-wrap gap-1">
      {space.deleted ? (
        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">
          Deleted
        </span>
      ) : null}
      {space.archived ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
          Archived
        </span>
      ) : null}
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-600 dark:bg-slate-700 dark:text-slate-200">
        {space.visibility || 'public'}
      </span>
    </span>
  );

  return (
    <div className="space-y-6">
      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className={ADMIN_SECTION_TITLE}>
                <span aria-hidden>📊</span> Visit Counter
              </h3>
              <p className={ADMIN_SECTION_SUBTITLE}>
                Lifetime totals scale to millions of hits. Daily charts keep{' '}
                {data?.retentionDays ?? 1095}+ days (~3 years) of history.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Chart range
                <select
                  className="ml-2 rounded-lg border border-sky-200/70 bg-white px-2 py-1.5 text-sm dark:border-sky-800/40 dark:bg-slate-900"
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                  <option value={180}>6 months</option>
                  <option value={365}>1 year</option>
                  <option value={730}>2 years</option>
                  <option value={1095}>3 years</option>
                </select>
              </label>
              <button
                type="button"
                className={`${ADMIN_PRIMARY_BTN} px-3 py-1.5`}
                onClick={() => void load()}
                disabled={loading}
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className={isMobile ? 'space-y-4 p-4' : 'space-y-6 p-6'}>
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
              {error}
            </div>
          ) : null}

          {loading && !data ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading visit statistics…</p>
          ) : data ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Website visits"
                  value={formatCompact(data.appVisits)}
                  hint={`${formatNumber(data.appVisits)} total · once per browser session`}
                  accent="sky"
                />
                <StatCard
                  label="Space hits"
                  value={formatCompact(data.totals.hitCount)}
                  hint={`${formatNumber(data.totals.userHits)} signed-in · ${formatNumber(data.totals.guestHits)} guest`}
                  accent="teal"
                />
                <StatCard
                  label="Unique visitors"
                  value={formatCompact(data.totals.uniqueVisitors)}
                  hint={`${formatNumber(data.totals.uniqueVisitors)} summed across spaces`}
                  accent="cyan"
                />
                <StatCard
                  label="Spaces visited"
                  value={`${formatNumber(data.spacesWithVisits)} / ${formatNumber(data.spaceCount)}`}
                  hint="Spaces with at least one recorded open"
                  accent="indigo"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-sky-100 bg-white/60 p-4 dark:border-sky-900/40 dark:bg-slate-900/30">
                  <h4 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Space hits · last {data.days} days
                    {data.granularity === 'week' ? ' (weekly)' : ''}
                  </h4>
                  {data.daily.some((d) => d.hits > 0) ? (
                    <RechartsAreaChart
                      data={data.daily}
                      dataKey="label"
                      seriesKey="hits"
                      seriesName="Hits"
                      color="#0ea5e9"
                      height={220}
                    />
                  ) : (
                    <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                      No space visits in this range yet.
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-sky-100 bg-white/60 p-4 dark:border-sky-900/40 dark:bg-slate-900/30">
                  <h4 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Website visits · last {data.days} days
                    {data.granularity === 'week' ? ' (weekly)' : ''}
                  </h4>
                  {(data.appDaily ?? []).some((d) => d.hits > 0) ? (
                    <RechartsAreaChart
                      data={data.appDaily ?? []}
                      dataKey="label"
                      seriesKey="hits"
                      seriesName="Visits"
                      color="#6366f1"
                      height={220}
                    />
                  ) : (
                    <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                      Website daily series starts after this upgrade; lifetime total above is complete.
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-sky-100 bg-white/60 p-4 dark:border-sky-900/40 dark:bg-slate-900/30 lg:col-span-2">
                  <h4 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Top spaces by hits
                  </h4>
                  {topChartData.length > 0 ? (
                    <RechartsBarChart
                      data={topChartData}
                      dataKey="name"
                      seriesKey="hits"
                      seriesName="Hits"
                      color="#14b8a6"
                      height={220}
                    />
                  ) : (
                    <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                      No space visit data to chart.
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <h3 className={ADMIN_SECTION_TITLE}>
            <span aria-hidden>📦</span> Visits by space
          </h3>
          <p className={ADMIN_SECTION_SUBTITLE}>
            Hit count and unique visitors for each space. Sort and search to find quiet or busy spaces.
          </p>
        </div>
        <div className={isMobile ? 'p-4' : 'p-6'}>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="search"
              placeholder="Search spaces…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-md rounded-xl border border-sky-200/70 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/50 dark:border-sky-800/40 dark:bg-slate-900/50 dark:text-white"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatNumber(filteredSpaces.length)} space{filteredSpaces.length === 1 ? '' : 's'}
            </p>
          </div>

          {loading && !data ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
          ) : filteredSpaces.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No spaces match your search.</p>
          ) : isMobile ? (
            <div className="space-y-3">
              {filteredSpaces.map((space) => (
                <div
                  key={space.id}
                  className="rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50/40 to-white p-3 dark:border-sky-900/40 dark:from-sky-950/20 dark:to-slate-800"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {space.emoji ? `${space.emoji} ` : ''}
                        {space.title}
                      </p>
                      {space.group ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">{space.group}</p>
                      ) : null}
                    </div>
                    {renderStatusBadges(space)}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Hits</p>
                      <p className="font-semibold tabular-nums">{formatNumber(space.hitCount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Unique</p>
                      <p className="font-semibold tabular-nums">{formatNumber(space.uniqueVisitors)}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Last visit: {formatTime(space.lastVisit)}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-sky-500"
                      style={{ width: `${Math.max(2, (space.hitCount / maxHits) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-sky-100 dark:border-sky-900/40">
              <table className="min-w-full divide-y divide-sky-100 text-sm dark:divide-sky-900/40">
                <thead className="bg-sky-50/80 dark:bg-sky-950/30">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">
                      <button type="button" className="hover:text-sky-700" onClick={() => toggleSort('title')}>
                        Space{sortMarker('title')}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-200">
                      <button type="button" className="hover:text-sky-700" onClick={() => toggleSort('hitCount')}>
                        Hits{sortMarker('hitCount')}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-200">
                      <button
                        type="button"
                        className="hover:text-sky-700"
                        onClick={() => toggleSort('uniqueVisitors')}
                      >
                        Unique{sortMarker('uniqueVisitors')}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">
                      <button type="button" className="hover:text-sky-700" onClick={() => toggleSort('lastVisit')}>
                        Last visit{sortMarker('lastVisit')}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">
                      Share
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sky-50 dark:divide-sky-900/30">
                  {filteredSpaces.map((space) => (
                    <tr key={space.id} className="hover:bg-sky-50/40 dark:hover:bg-sky-950/20">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                        {space.emoji ? `${space.emoji} ` : ''}
                        {space.title}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {space.group || '—'}
                      </td>
                      <td className="px-4 py-3">{renderStatusBadges(space)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900 dark:text-white">
                        {formatNumber(space.hitCount)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
                        {formatNumber(space.uniqueVisitors)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {formatTime(space.lastVisit)}
                      </td>
                      <td className="px-4 py-3 min-w-[8rem]">
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                          <div
                            className="h-full rounded-full bg-sky-500"
                            style={{ width: `${Math.max(space.hitCount > 0 ? 4 : 0, (space.hitCount / maxHits) * 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
