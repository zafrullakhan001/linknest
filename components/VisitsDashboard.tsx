import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useMobile } from '../hooks/useMobile';
import { RechartsAreaChart, RechartsBarChart } from './RechartsCharts';
import {
  getVisitStatsDashboard,
  purgeVisitStats,
  reindexVisitStats,
  VisitPurgeScope,
  VisitStatsDashboard,
  VisitStatsSpaceRow,
  VISIT_PURGE_CONFIRM,
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
const ADMIN_SECONDARY_BTN =
  'bg-white dark:bg-slate-900 border border-sky-200/70 dark:border-sky-800/40 hover:bg-sky-50 dark:hover:bg-sky-950/40 disabled:opacity-50 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors';
const ADMIN_DANGER_BTN =
  'bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors';
const ADMIN_FIELD =
  'rounded-xl border border-sky-200/70 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/50 dark:border-sky-800/40 dark:bg-slate-900/50 dark:text-white';

type SortKey = 'hitCount' | 'uniqueVisitors' | 'title' | 'lastVisit' | 'group' | 'visibility';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'active' | 'archived' | 'deleted';
type ActivityFilter = 'all' | 'with_visits' | 'no_visits';

const PURGE_OPTIONS: Array<{ scope: VisitPurgeScope; label: string; description: string }> = [
  {
    scope: 'daily',
    label: 'Daily history only',
    description: 'Clears chart history; keeps lifetime totals and unique visitors.',
  },
  {
    scope: 'spaces',
    label: 'All space visits',
    description: 'Clears every space hit, unique visitor, and space daily series.',
  },
  {
    scope: 'website',
    label: 'Website visits',
    description: 'Resets the site-wide counter and website daily series.',
  },
  {
    scope: 'all',
    label: 'Everything',
    description: 'Full reset of website + space visit analytics.',
  },
];

function formatNumber(n: number): string {
  try {
    return new Intl.NumberFormat().format(n);
  } catch {
    return String(n);
  }
}

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

function formatTimeIso(unix: number | null): string {
  if (!unix) return '';
  try {
    return new Date(unix * 1000).toISOString();
  } catch {
    return String(unix);
  }
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadCsv(filename: string, lines: string[]): void {
  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  const [notice, setNotice] = useState('');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('hitCount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  const [busyAction, setBusyAction] = useState<'reindex' | 'purge' | null>(null);
  const [exporting, setExporting] = useState(false);
  const [purgeScope, setPurgeScope] = useState<VisitPurgeScope>('daily');
  const [purgeConfirmInput, setPurgeConfirmInput] = useState('');
  const [showPurgePanel, setShowPurgePanel] = useState(false);
  const [purgeSpaceId, setPurgeSpaceId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

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

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const space of data?.spaces ?? []) {
      if (space.group) set.add(space.group);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [data?.spaces]);

  const filteredSpaces = useMemo(() => {
    const spaces = data?.spaces ?? [];
    const q = debouncedSearch.toLowerCase();
    let list = spaces.filter((s) => {
      if (q) {
        const hay = `${s.title} ${s.emoji ?? ''} ${s.group ?? ''} ${s.visibility}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (visibilityFilter !== 'all' && (s.visibility || 'public') !== visibilityFilter) return false;
      if (categoryFilter !== 'all') {
        if (categoryFilter === '__none__') {
          if (s.group) return false;
        } else if (s.group !== categoryFilter) {
          return false;
        }
      }
      if (statusFilter === 'active' && (s.deleted || s.archived)) return false;
      if (statusFilter === 'archived' && !s.archived) return false;
      if (statusFilter === 'deleted' && !s.deleted) return false;
      if (activityFilter === 'with_visits' && s.hitCount <= 0) return false;
      if (activityFilter === 'no_visits' && s.hitCount > 0) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'title' || sortKey === 'group' || sortKey === 'visibility') {
        const av = (a[sortKey] ?? '') as string;
        const bv = (b[sortKey] ?? '') as string;
        cmp = av.localeCompare(bv, undefined, { sensitivity: 'base' });
      } else if (sortKey === 'lastVisit') {
        cmp = (a.lastVisit ?? 0) - (b.lastVisit ?? 0);
      } else {
        cmp = (a[sortKey] as number) - (b[sortKey] as number);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [
    data?.spaces,
    debouncedSearch,
    visibilityFilter,
    statusFilter,
    activityFilter,
    categoryFilter,
    sortKey,
    sortDir,
  ]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, visibilityFilter, statusFilter, activityFilter, categoryFilter, perPage, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredSpaces.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pageSpaces = useMemo(() => {
    const start = (safePage - 1) * perPage;
    return filteredSpaces.slice(start, start + perPage);
  }, [filteredSpaces, safePage, perPage]);

  const topChartData = useMemo(() => {
    return [...(data?.spaces ?? [])]
      .filter((s) => !s.deleted && s.hitCount > 0)
      .slice(0, 10)
      .map((s) => ({
        name: s.title.length > 18 ? `${s.title.slice(0, 16)}…` : s.title,
        hits: s.hitCount,
      }));
  }, [data?.spaces]);

  const maxHits = useMemo(() => {
    if (pageSpaces.length === 0) return 1;
    return Math.max(1, ...pageSpaces.map((s) => s.hitCount));
  }, [pageSpaces]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'title' || key === 'group' || key === 'visibility' ? 'asc' : 'desc');
    }
  };

  const sortMarker = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  const handleReindex = async () => {
    try {
      setBusyAction('reindex');
      setError('');
      setNotice('');
      const result = await reindexVisitStats();
      setNotice(
        `Indexes refreshed (${result.reindex.indexes.length} indexes, ${result.reindex.analyzed.length} tables analyzed) in ${result.reindex.elapsedMs} ms.`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to refresh indexes');
    } finally {
      setBusyAction(null);
    }
  };

  const handlePurge = async () => {
    const scope = purgeSpaceId ? 'space' : purgeScope;
    const expected = VISIT_PURGE_CONFIRM[scope];
    if (purgeConfirmInput.trim() !== expected) {
      setError(`Type ${expected} to confirm.`);
      return;
    }
    try {
      setBusyAction('purge');
      setError('');
      setNotice('');
      const result = await purgeVisitStats(scope, purgeSpaceId ? { tileId: purgeSpaceId } : {});
      const deletedTotal = Object.values(result.purge.deleted).reduce((sum, n) => sum + n, 0);
      setNotice(
        `Purged ${scope}${purgeSpaceId ? ` (${purgeSpaceId})` : ''} — ${formatNumber(deletedTotal)} rows cleared` +
          (result.reindex ? `; indexes refreshed in ${result.reindex.elapsedMs} ms.` : '.')
      );
      setPurgeConfirmInput('');
      setShowPurgePanel(false);
      setPurgeSpaceId(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to purge visit data');
    } finally {
      setBusyAction(null);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setVisibilityFilter('all');
    setStatusFilter('all');
    setActivityFilter('all');
    setCategoryFilter('all');
  };

  const handleExportSpacesCsv = () => {
    try {
      setExporting(true);
      setError('');
      const stamp = new Date().toISOString().slice(0, 10);
      const header = [
        'Space ID',
        'Title',
        'Emoji',
        'Category',
        'Visibility',
        'Deleted',
        'Archived',
        'Hits',
        'Unique Visitors',
        'Last Visit',
        'Last Visit ISO',
      ];
      const rows = filteredSpaces.map((space) => [
        space.id,
        space.title,
        space.emoji ?? '',
        space.group ?? '',
        space.visibility || 'public',
        space.deleted ? 'yes' : 'no',
        space.archived ? 'yes' : 'no',
        String(space.hitCount),
        String(space.uniqueVisitors),
        formatTime(space.lastVisit),
        formatTimeIso(space.lastVisit),
      ]);

      const summaryLines = [
        '# LinkNest Visit Counter export',
        `# Exported at,${csvEscape(new Date().toISOString())}`,
        `# Website visits,${data?.appVisits ?? 0}`,
        `# Space hits,${data?.totals.hitCount ?? 0}`,
        `# Unique visitors,${data?.totals.uniqueVisitors ?? 0}`,
        `# Guest hits,${data?.totals.guestHits ?? 0}`,
        `# Signed-in hits,${data?.totals.userHits ?? 0}`,
        `# Spaces in export,${filteredSpaces.length}`,
        `# Sort,${sortKey} ${sortDir}`,
        `# Filters,search=${debouncedSearch || '(none)'}; visibility=${visibilityFilter}; status=${statusFilter}; activity=${activityFilter}; category=${categoryFilter}`,
        '',
      ];

      const tableLines = [header, ...rows].map((cols) => cols.map((c) => csvEscape(c)).join(','));
      downloadCsv(`linknest-visit-spaces-${stamp}.csv`, [...summaryLines, ...tableLines]);
      setNotice(`Exported ${formatNumber(filteredSpaces.length)} space row${filteredSpaces.length === 1 ? '' : 's'} to CSV.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  const handleExportDailyCsv = () => {
    if (!data) return;
    try {
      setExporting(true);
      setError('');
      const stamp = new Date().toISOString().slice(0, 10);
      const header = ['Date', 'Label', 'Space Hits', 'Space Unique Visitors', 'Website Visits'];
      const byDate = new Map<string, { label: string; spaceHits: number; spaceUniques: number; appHits: number }>();
      for (const point of data.daily) {
        byDate.set(point.date, {
          label: point.label,
          spaceHits: point.hits,
          spaceUniques: point.uniqueVisitors ?? 0,
          appHits: 0,
        });
      }
      for (const point of data.appDaily ?? []) {
        const existing = byDate.get(point.date);
        if (existing) {
          existing.appHits = point.hits;
        } else {
          byDate.set(point.date, {
            label: point.label,
            spaceHits: 0,
            spaceUniques: 0,
            appHits: point.hits,
          });
        }
      }
      const rows = Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, row]) => [
          date,
          row.label,
          String(row.spaceHits),
          String(row.spaceUniques),
          String(row.appHits),
        ]);

      const summaryLines = [
        '# LinkNest Visit Counter daily series export',
        `# Exported at,${csvEscape(new Date().toISOString())}`,
        `# Range days,${data.days}`,
        `# Granularity,${data.granularity}`,
        '',
      ];
      const tableLines = [header, ...rows].map((cols) => cols.map((c) => csvEscape(c)).join(','));
      downloadCsv(`linknest-visit-daily-${stamp}.csv`, [...summaryLines, ...tableLines]);
      setNotice(`Exported ${formatNumber(rows.length)} daily point${rows.length === 1 ? '' : 's'} to CSV.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  const activeFilterCount = [
    visibilityFilter !== 'all',
    statusFilter !== 'all',
    activityFilter !== 'all',
    categoryFilter !== 'all',
    debouncedSearch !== '',
  ].filter(Boolean).length;

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

  const effectivePurgeScope: VisitPurgeScope = purgeSpaceId ? 'space' : purgeScope;
  const purgePhrase = VISIT_PURGE_CONFIRM[effectivePurgeScope];

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
                className={`${ADMIN_SECONDARY_BTN} px-3 py-1.5`}
                onClick={() => void handleReindex()}
                disabled={busyAction !== null}
                title="Rebuild visit indexes and refresh query planner stats"
              >
                {busyAction === 'reindex' ? 'Refreshing…' : 'Refresh indexes'}
              </button>
              <button
                type="button"
                className={`${ADMIN_PRIMARY_BTN} px-3 py-1.5`}
                onClick={() => void load()}
                disabled={loading || busyAction !== null}
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
          {notice ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
              {notice}
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className={ADMIN_SECTION_TITLE}>
                <span aria-hidden>📦</span> Visits by space
              </h3>
              <p className={ADMIN_SECTION_SUBTITLE}>
                Filter, sort, and page through spaces. Purge old data or rebuild indexes when needed.
              </p>
            </div>
            <button
              type="button"
              className={`${ADMIN_DANGER_BTN} px-3 py-1.5`}
              onClick={() => {
                setPurgeSpaceId(null);
                setPurgeConfirmInput('');
                setShowPurgePanel((v) => !v);
              }}
            >
              {showPurgePanel && !purgeSpaceId ? 'Close purge' : 'Purge data'}
            </button>
          </div>
        </div>

        <div className={isMobile ? 'space-y-4 p-4' : 'space-y-4 p-6'}>
          {(showPurgePanel || purgeSpaceId) && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
              <h4 className="text-sm font-semibold text-rose-800 dark:text-rose-200">
                {purgeSpaceId ? 'Purge visits for one space' : 'Purge visit analytics'}
              </h4>
              <p className="mt-1 text-xs text-rose-700/90 dark:text-rose-200/80">
                This cannot be undone. Indexes are refreshed automatically after a purge.
              </p>
              {purgeSpaceId ? (
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                  Space id: <code className="rounded bg-white/70 px-1 dark:bg-slate-900/50">{purgeSpaceId}</code>
                </p>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {PURGE_OPTIONS.map((opt) => (
                    <label
                      key={opt.scope}
                      className={`cursor-pointer rounded-lg border p-3 text-sm ${
                        purgeScope === opt.scope
                          ? 'border-rose-400 bg-white dark:border-rose-500 dark:bg-slate-900'
                          : 'border-rose-100 bg-white/60 dark:border-rose-900/40 dark:bg-slate-900/40'
                      }`}
                    >
                      <input
                        type="radio"
                        className="mr-2"
                        checked={purgeScope === opt.scope}
                        onChange={() => setPurgeScope(opt.scope)}
                      />
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{opt.label}</span>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{opt.description}</p>
                    </label>
                  ))}
                </div>
              )}
              <label className="mt-3 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Type <span className="font-mono font-semibold">{purgePhrase}</span> to confirm
                <input
                  type="text"
                  value={purgeConfirmInput}
                  onChange={(e) => setPurgeConfirmInput(e.target.value)}
                  className={`${ADMIN_FIELD} mt-1 w-full max-w-md`}
                  placeholder={purgePhrase}
                  autoComplete="off"
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`${ADMIN_DANGER_BTN} px-3 py-1.5`}
                  disabled={busyAction !== null || purgeConfirmInput.trim() !== purgePhrase}
                  onClick={() => void handlePurge()}
                >
                  {busyAction === 'purge' ? 'Purging…' : 'Confirm purge'}
                </button>
                <button
                  type="button"
                  className={`${ADMIN_SECONDARY_BTN} px-3 py-1.5`}
                  onClick={() => {
                    setShowPurgePanel(false);
                    setPurgeSpaceId(null);
                    setPurgeConfirmInput('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-2 xl:grid-cols-6'}`}>
            <input
              type="search"
              placeholder="Search spaces…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${ADMIN_FIELD} ${isMobile ? '' : 'xl:col-span-2'}`}
            />
            <select
              className={ADMIN_FIELD}
              value={visibilityFilter}
              onChange={(e) => setVisibilityFilter(e.target.value)}
            >
              <option value="all">All visibility</option>
              <option value="public">Public</option>
              <option value="authenticated">Authenticated</option>
              <option value="private">Private</option>
            </select>
            <select
              className={ADMIN_FIELD}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="deleted">Deleted</option>
            </select>
            <select
              className={ADMIN_FIELD}
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value as ActivityFilter)}
            >
              <option value="all">All activity</option>
              <option value="with_visits">With visits</option>
              <option value="no_visits">No visits</option>
            </select>
            <select
              className={ADMIN_FIELD}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All categories</option>
              <option value="__none__">No category</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatNumber(filteredSpaces.length)} space{filteredSpaces.length === 1 ? '' : 's'}
              {activeFilterCount > 0 ? ` · ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'} active` : ''}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {activeFilterCount > 0 ? (
                <button type="button" className={`${ADMIN_SECONDARY_BTN} px-3 py-1.5`} onClick={clearFilters}>
                  Clear filters
                </button>
              ) : null}
              <button
                type="button"
                className={`${ADMIN_SECONDARY_BTN} px-3 py-1.5`}
                disabled={exporting || !data || (data.daily?.length ?? 0) === 0}
                onClick={handleExportDailyCsv}
                title="Export the current chart range (space + website daily series)"
              >
                {exporting ? 'Exporting…' : 'Export daily CSV'}
              </button>
              <button
                type="button"
                className={`${ADMIN_PRIMARY_BTN} px-3 py-1.5`}
                disabled={exporting || filteredSpaces.length === 0}
                onClick={handleExportSpacesCsv}
                title="Export filtered / sorted spaces (all matching rows, not just this page)"
              >
                {exporting ? 'Exporting…' : 'Export spaces CSV'}
              </button>
              <label className="text-xs text-slate-600 dark:text-slate-300">
                Rows
                <select
                  className="ml-2 rounded-lg border border-sky-200/70 bg-white px-2 py-1.5 text-sm dark:border-sky-800/40 dark:bg-slate-900"
                  value={perPage}
                  onChange={(e) => setPerPage(Number(e.target.value))}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
            </div>
          </div>

          {loading && !data ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
          ) : filteredSpaces.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No spaces match your filters.</p>
          ) : isMobile ? (
            <div className="space-y-3">
              {pageSpaces.map((space) => (
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
                  {space.hitCount > 0 ? (
                    <button
                      type="button"
                      className="mt-2 text-xs font-semibold text-rose-600 hover:underline dark:text-rose-300"
                      onClick={() => {
                        setPurgeSpaceId(space.id);
                        setPurgeConfirmInput('');
                        setShowPurgePanel(false);
                      }}
                    >
                      Purge this space
                    </button>
                  ) : null}
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
                      <button type="button" className="hover:text-sky-700" onClick={() => toggleSort('group')}>
                        Category{sortMarker('group')}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">
                      <button type="button" className="hover:text-sky-700" onClick={() => toggleSort('visibility')}>
                        Status{sortMarker('visibility')}
                      </button>
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
                    <th className="px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-200">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sky-50 dark:divide-sky-900/30">
                  {pageSpaces.map((space) => (
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
                            style={{
                              width: `${Math.max(space.hitCount > 0 ? 4 : 0, (space.hitCount / maxHits) * 100)}%`,
                            }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {space.hitCount > 0 ? (
                          <button
                            type="button"
                            className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-300"
                            onClick={() => {
                              setPurgeSpaceId(space.id);
                              setPurgeConfirmInput('');
                              setShowPurgePanel(false);
                            }}
                          >
                            Purge
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filteredSpaces.length > 0 ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Showing {(safePage - 1) * perPage + 1}–
                {Math.min(safePage * perPage, filteredSpaces.length)} of{' '}
                {formatNumber(filteredSpaces.length)}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`${ADMIN_SECONDARY_BTN} px-3 py-1.5`}
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="text-sm tabular-nums text-slate-600 dark:text-slate-300">
                  Page {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  className={`${ADMIN_SECONDARY_BTN} px-3 py-1.5`}
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
